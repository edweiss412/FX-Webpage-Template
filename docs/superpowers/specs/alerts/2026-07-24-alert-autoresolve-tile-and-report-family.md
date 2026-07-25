# Per-tile keyed tile-render resolution + report-family auto-resolution

**Date:** 2026-07-24 · **Status:** Draft
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)
**Parent spec:** `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` (state-vs-event principle, §2)

Closes four BACKLOG entries. Two are already shipped and only need archiving (§2); two are live work (§4, §5).

---

## 1. Problem

`docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §2 ratified the
**state vs event** principle: an alert whose condition is a persistent, code-observable STATE
auto-resolves where the system observes recovery; an alert recording a one-shot EVENT stays
manual-acknowledge. That spec classified all 42 registry codes and deferred four decisions to
BACKLOG. This spec lands the two that are still open, and archives the two that shipped
underneath us.

The two live deferrals share one root cause, which is why they ship together: **an alert whose
dedup key is coarser than the instance its condition belongs to.** `admin_alerts` dedups on
`(coalesce(show_id::text, ''), code)`
(`supabase/migrations/20260501001000_internal_and_admin.sql:279-280`), so one open row covers every
failing tile of a show, or every stuck report of a show. Resolving that row on *any* instance's
recovery would mask the others. Both deferrals reduce to: find a sound per-instance discriminator
that does not require widening the dedup index.

## 1.1 Resolved scope — do not relitigate

- **`GITHUB_BOT_LOGIN_MISSING` and both `BRANCH_PROTECTION_*` codes are already `class: "auto"`.**
  Verified in the live registry (§2). This spec archives their BACKLOG entries; it does not
  re-implement them, and it must not touch their resolvers.
- **The dedup index is NOT widened.** Per-tile keying is achieved by filtering on the open row's
  existing `context->>'tileId'`, not by adding a column. Widening
  `admin_alerts_one_unresolved_idx` would fan out to every raw `ON CONFLICT` producer
  (`lib/reports/submit.ts:653`, `lib/reports/submit.ts:676`,
  `app/api/cron/report-reaper/route.ts:75`), the `upsertAdminAlert` RPC, bell grouping,
  `lib/admin/attentionItems.ts`, and `lib/adminAlerts/alertIdentityMap.ts`, for granularity nothing
  currently reads. **No DDL in this spec.** Do not re-propose a schema change.
- **`TILE_SERVER_RENDER_FAILED` becomes `hybrid`, not `auto`.** Its catalog `resolution` stays
  `"manual"` and its manual button stays. Rationale in §4.6; precedent
  `ONBOARDING_SHEET_UNREADABLE` (`tests/messages/_metaAdminAlertCatalog.test.ts:463-475`).
- **The three surviving report codes stay `event-manual`.** `REPORT_ORPHANED_LOST_LEASE`,
  `REPORT_LEASE_THRASHING`, `STALE_ORPHAN_REPORT` are genuinely one-shot (§5.1). This spec does not
  reopen the master-spec §4.6 "deliberate acknowledgment" contract for them.
- **`RESOLVE_INTENTS` rows are never deleted.** See §6.3 — the append-only lifecycle gate forbids
  it, deliberately.

---

## 2. Two BACKLOG entries are already satisfied (archive only)

### 2.1 `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE` — shipped

Promoted DEFER → auto by `docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` §6.
Live evidence:

| Claim | Citation |
|---|---|
| Registry class is `auto` with two pinned resolve sites | `tests/messages/_metaAdminAlertCatalog.test.ts:493-499` |
| Env-presence predicate `botLoginConfigured` | `lib/reports/botLoginAlert.ts:15` |
| Cron reconcile resolver `resolveBotLoginAlertRow` | `lib/reports/botLoginAlert.ts:45` |
| Fail-open submit resolver `resolveBotLoginAlertFailOpen` | `lib/reports/submit.ts` |
| Behavioral tests | `tests/reports/submit.botLoginResolve.test.ts`, `tests/notify/runMaintenance.botLogin.test.ts` |

**Action:** move the entry to `BACKLOG-archive.md` with a resolved-status line citing the above. No
code change.

### 2.2 `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE` — shipped, detector dormant

Promoted by `docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md` D6
(`docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md:30`) and §10
(`docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md:249-253`). Live
evidence:

| Claim | Citation |
|---|---|
| Both codes `class: "auto"` with resolve sites | `tests/messages/_metaAdminAlertCatalog.test.ts:502-513` |
| Resolver `defaultResolveAlerts` | `scripts/verify-branch-protection.ts:253`, invoked at `scripts/verify-branch-protection.ts:278` |
| Catalog auto-clear copy | `lib/adminAlerts/audience.ts:118-122` |
| Full provenance including dormancy | `DEFERRED-archive.md:853-862` |

**Residual, and the reason this entry needs a pointer rather than silent deletion:** the only
producer is `scripts/verify-branch-protection.ts`, run by two `x-audits.yml` jobs that are both
`if: false` under the X6-D-1 solo-dev variant (`.github/workflows/x-audits.yml:443` and
`.github/workflows/x-audits.yml:474`). The resolver is correct but unexercised in CI. The bell spec
ratified converting ahead of the workflow trigger deliberately (D6: the bell surface makes premature
manual resolution an attractive nuisance), so this is not a gap.

**Action:** archive with a resolved-status line that names the dormancy and cross-references the
re-enable trigger already recorded at `DEFERRED-archive.md:861`. No code change.

---

## 3. Design principle extension: instance-keyed resolution

The parent spec's §2 principle answers *whether* a code may auto-resolve. It does not answer
*which row* a recovery observation is entitled to clear when one row aggregates many instances.
This spec adds the missing half:

> **Instance-keying rule.** When an alert's dedup key (`show_id`, `code`) is coarser than the
> instance its condition attaches to, a recovery observation may resolve the row ONLY if the
> observation identifies the same instance the row currently names. Where the row already carries a
> discriminator in `context`, filter on it. Where no discriminator exists but the condition is
> derivable from persistent rows, use an anti-join over the raise predicate. Where neither is
> available, the code stays manual.

Part A (§4) is the first form, Part B (§5) the second. Both are pinned structurally in §7.

---

## 4. Part A — `TILE_SERVER_RENDER_FAILED`: per-tile keyed resolution

### 4.1 Why the parent spec deferred it, and what changed

The parent spec's §3 row reads: *"State-shaped but no aggregation point: tiles render/stream
independently per-request; the open row is deduped per (show, code) with `context.tileId` replaced
on re-raise, so tile A's success cannot prove tile B (which may hold the row) is healthy."*

The second clause is still true and is the whole design constraint. The first clause is **not true
of the current code**, and this spec does not rely on it either way:

- There are **7** `<WrappedSection>` call sites, all synchronous Server Components, one per
  `SectionId` (§4.2). None is `async`; none sits inside a `Suspense` boundary (no `Suspense` exists
  under `app/show/` or `components/crew/`).
- `_CrewShell` server-renders **every entitled section body** on every request
  (`app/show/[slug]/[shareToken]/_CrewShell.tsx:413`); the `<CrewSections>` client controller
  toggles visibility only, never fetches
  (`app/show/[slug]/[shareToken]/_CrewShell.tsx:320-325`).
- The crew page is dynamic per request (`app/show/[slug]/[shareToken]/page.tsx` declares no
  `dynamic` or `revalidate` export).

That would permit a simple "nothing failed this render" sweep — and it would still be **wrong**,
for two independent reasons:

1. **Budget is viewer-gated.** `entitled` is `BASE_SECTION_IDS` plus `budget` iff `budgetVisible`
   (`app/show/[slug]/[shareToken]/_CrewShell.tsx:410-412`). A non-lead viewer never renders
   `crew:budget:rows`, so a global sweep would clear a genuine budget-tile alert on every non-lead
   page view.
2. **`after()` runs even on an aborted response.** Next's API reference for `after` states the
   callback executes even if the response did not complete successfully (error, `notFound`,
   `redirect`). A render that dies partway leaves a partial ledger, indistinguishable from a clean
   full render.

So the resolve is keyed to tiles that **demonstrably rendered clean this request** — never inferred
from absence of failure.

### 4.2 Tile inventory (exhaustive; pinned by §7.1)

`SectionId` has exactly 7 members (`lib/crew/resolveActiveSection.ts:1`), and each section wraps
exactly one throwable block:

| `SectionId` | `tileId` | Call site |
|---|---|---|
| `today` | `crew:today:notes` | `components/crew/sections/TodaySection.tsx:175` |
| `schedule` | `crew:schedule:days` | `components/crew/sections/ScheduleSection.tsx:185` |
| `venue` | `crew:venue:diagrams` | `components/crew/sections/VenueSection.tsx:328` |
| `travel` | `crew:travel:transport` | `components/crew/sections/TravelSection.tsx:163` |
| `crew` | `crew:crew:roster` | `components/crew/sections/CrewSection.tsx:116` |
| `gear` | `crew:gear:scope` | `components/crew/sections/GearSection.tsx:164` |
| `budget` | `crew:budget:rows` | `components/crew/sections/BudgetSection.tsx:67` |

`components/crew/WrappedSection.tsx` has no barrel re-export. Three further files mention
`WrappedSection` in comments only (`components/shared/CardReportTrigger.tsx:9`,
`components/crew/DiagramsBlock.tsx:15`, `components/crew/SectionTileError.tsx:10`) and must not be
counted as call sites. `components/shared/TileServerFallback.tsx:88` is the code's second registered
producer but its only consumer, `components/shared/WrappedTile.tsx:54`, has **no production call
site** (referenced solely by its own module and tests) — it is a dormant producer and is out of
scope; §7.1 pins that it stays dormant.

### 4.3 The request-scoped tile ledger

New module at `lib/crew/tileRenderLedger.ts (new)`:

```ts
import { cache } from "react";

export type TileRenderLedger = { attempted: Set<string>; failed: Set<string> };

/** One ledger per request. `cache()` memoizes per request across the RSC tree. */
export const getTileRenderLedger = cache(
  (): TileRenderLedger => ({ attempted: new Set(), failed: new Set() }),
);

/** Tiles that ran their render seam to completion without throwing. */
export function cleanTileIds(ledger: TileRenderLedger): string[] {
  return [...ledger.attempted].filter((id) => !ledger.failed.has(id)).sort();
}
```

`cache()` precedent in this repo: `lib/auth/requireAdmin.ts:22`, `lib/auth/requireDeveloper.ts:26`.

**Closure requirement (non-negotiable, AC7).** `_CrewShell` MUST capture the ledger object in its
own body (`const ledger = getTileRenderLedger()`) and close over that reference in the `after()`
callback. It MUST NOT call `getTileRenderLedger()` inside the callback. `after()` runs after React's
rendering lifecycle, and `cache()` scoping outside that lifecycle is not a contract Next guarantees;
a lookup there could return a fresh, empty ledger and silently resolve every tile. The closure makes
the behavior independent of that question. A test pins it (§7.2 T3).

### 4.4 `WrappedSection` records; it no longer raises

`components/crew/WrappedSection.tsx` changes:

- Before invoking `render()`: `getTileRenderLedger().attempted.add(tileId)`.
- In the `catch`: `getTileRenderLedger().failed.add(tileId)`, keep the existing `log.error`
  (`components/crew/WrappedSection.tsx:86-91`), and **remove** the `upsertAdminAlert` call and its
  `after()` / fire-and-forget fallback (`components/crew/WrappedSection.tsx:94-122`).
- The fallback return (`components/crew/WrappedSection.tsx:123`) is unchanged.

Both mutations are synchronous, and `render()` is invoked synchronously with no await point
(`components/crew/WrappedSection.tsx:83`), so a tile in `attempted` and not in `failed` provably
completed its render seam.

**What is preserved from the durability fix.** The `after()` keep-alive introduced at
`components/crew/WrappedSection.tsx:110-122` is not lost; it moves to the shell sweep, which is also
registered via `after()` and carries the same keep-alive property. What *is* given up is
`WrappedSection`'s self-contained producer contract: it now depends on a host that runs the sweep.
That dependency is invisible in the component, so §7.1 pins it with a meta-test rather than a
comment.

### 4.5 The shell sweep

In `_CrewShell` (`app/show/[slug]/[shareToken]/_CrewShell.tsx`), register **one** `after()`
callback, unconditionally — independent of the existing `TILE_PROJECTION_FETCH_FAILED` branch at
`app/show/[slug]/[shareToken]/_CrewShell.tsx:153-205`, whose condition (`failedKeys`) is a different
observation and whose `else`-branch placement must not be reused. The callback, in order:

1. **Raise** — for each `tileId` in `ledger.failed`, `await upsertAdminAlert({ showId, code:
   "TILE_SERVER_RENDER_FAILED", context: { tileId, message, sheet_name } })`, preserving today's
   context shape (`components/crew/WrappedSection.tsx:98-102`).
2. **Resolve** — `await resolveTileRenderAlertsForTiles({ showId, tileIds: cleanTileIds(ledger) })`.

Raise-before-resolve is the safe order in both directions: a failed tile is by construction absent
from `cleanTileIds`, so step 2 can never clear the row step 1 just wrote. (The reverse order also
happens to be correct, since the resolve is tile-keyed; the stated order is chosen so correctness
does not depend on that second argument.)

Error posture: fail-quiet with its own log code, matching the adjacent projection raise and resolve
(`app/show/[slug]/[shareToken]/_CrewShell.tsx:172-178`,
`app/show/[slug]/[shareToken]/_CrewShell.tsx:186-193`). A sweep failure must never affect the crew
render. `after()` throws synchronously outside a request scope (unit tests), so the registration is
wrapped in the same `try { after(...) } catch {}` shape already used at
`app/show/[slug]/[shareToken]/_CrewShell.tsx:200-204`; skipping is safe because the next healthy
request sweeps.

### 4.6 Classification: `hybrid`, and the button stays

`TILE_SERVER_RENDER_FAILED` moves `state-manual-justified` to `hybrid` in `ADMIN_ALERTS_LIFECYCLE`
(`tests/messages/_metaAdminAlertCatalog.test.ts:455`), with one `resolveSites` row.

Its catalog `resolution` stays `"manual"` (`lib/messages/catalog.ts:2424`), so
`AUTO_RESOLVING_CODES` (`lib/adminAlerts/audience.ts:53-55`) does not gain it and the manual button
survives. **Why:** re-detection requires a crew page view. For a show nobody is currently working,
that could be days away, so removing the only manual clear path would strand the row. This is the
same shape as `ONBOARDING_SHEET_UNREADABLE`, whose registry row already documents it: *"self-clears
via the clean-scan + cron heal observers, while the manual Resolve button legitimately stays (maps
to catalog resolution:'manual')"* (`tests/messages/_metaAdminAlertCatalog.test.ts:460-462`). Its
intent row is present at `lib/adminAlerts/resolveActionLabel.ts:68`, exactly as
`TILE_SERVER_RENDER_FAILED`'s is at `lib/adminAlerts/resolveActionLabel.ts:66`.

Consequences: no `AUTO_RESOLVE_NOTES` entry, no §12.4 lockstep, no change to
`tests/admin/resolveAutoCodeGuard.test.ts:22` (which pins this code as manual health and stays
true).

### 4.7 Dimensional Invariants

**None. This spec adds no rendered element and changes no existing one.**

Two files under the UI-surface locations are edited (`app/show/[slug]/[shareToken]/_CrewShell.tsx`,
`components/crew/WrappedSection.tsx`), which is what makes this a UI spec by the invariant-8
location rule and pulls in the impeccable dual-gate (AC13). Neither edit touches JSX:

- `WrappedSection` gains two synchronous `Set.add` calls and loses an `upsertAdminAlert` block. Its
  returned element is unchanged in both the success path (`render()`'s output) and the failure path
  (`fallback ?? <TileErrorFallback />`, `components/crew/WrappedSection.tsx:123`).
- `_CrewShell` gains one `after()` registration in its body. Its returned JSX
  (`app/show/[slug]/[shareToken]/_CrewShell.tsx:417` onward) is untouched.

No fixed-dimension parent, flex or grid child relationship is created, removed, or altered, so there
is no parent-to-child dimension relationship to enumerate. Any reviewer finding a dimensional claim
to make here should read it as evidence that the diff exceeded its stated scope.

### 4.8 Transition Inventory

**None. No component in this diff gains, loses, or changes a visual state.**

`WrappedSection` has exactly the two render outcomes it has today (the wrapped block, or the
fallback element), selected by the same synchronous `try`/`catch` at
`components/crew/WrappedSection.tsx:82-84`. The number of states is 2 before and 2 after, the
selection condition is byte-identical, and no animation, `AnimatePresence`, or conditional render
block is added anywhere. The single state pair (block to fallback) is unchanged from shipped
behavior and is instant, as it is today: a server render emits one or the other, with no client-side
transition between them.

All writes introduced by this spec happen in `after()` callbacks, which run after the response, and
are therefore incapable of affecting rendered state at all.

---

## 5. Part B — report family: three codes to `auto`

### 5.1 Which three, and why the other three do not move

The six report-family codes split cleanly on whether a persistent row still encodes the condition.

**Moving to `auto` (state-shaped).** `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES`,
`REPORT_OPEN_ORPHAN_LABEL` are all raised through `upsertStateGatedLookupAlert`
(`lib/reports/submit.ts:662-685`), reached via `resolveStateGatedAlert`
(`lib/reports/submit.ts:747`) and mapped by `lookupAlertCode` (`lib/reports/submit.ts:206-210`).
Its insert is `SELECT`-gated on a live predicate:

```sql
FROM reports r
WHERE r.idempotency_key = $1::uuid
  AND r.github_issue_url IS NULL
  AND (r.processing_lease_until IS NULL OR r.processing_lease_until <= now())
  AND r.created_at >= now() - interval '24 hours'
```

The row is raised only while a specific report is genuinely stuck, and it is **show-scoped**
(`SELECT r.show_id`). The condition is therefore a persistent, code-observable state with an exact
recovery predicate — the parent spec's §2 test, satisfied.

**Staying `event-manual`.** `REPORT_ORPHANED_LOST_LEASE` (`lib/reports/submit.ts:977`) records that
an external GitHub issue was closed; `REPORT_LEASE_THRASHING` (`lib/reports/submit.ts:847-848`)
records that races happened; `STALE_ORPHAN_REPORT` (`app/api/cron/report-reaper/route.ts:74`) is the
reaper's audit of a row it just deleted. None has a surviving row whose absence would prove
recovery. These are the parent spec's classification, unchanged.

### 5.2 Resolution: anti-join over the raise predicate

No `tileId`-style discriminator exists on these rows, but the raise predicate is a query over
`reports`, so its negation is a sound resolve condition. Resolve an open row for show S iff **no**
`reports` row for S still matches the gate. This is the S4 diagram-GC shape from the parent spec
(§4 S4, `lib/sync/diagramGc.ts:295-330`): the raise SQL's WHERE, anti-joined.

Two hooks, mirroring the parent spec's S3/S4 two-hook pattern:

1. **Point of recovery** — `lib/reports/submit.ts`, at the two sites where a report lands its issue
   URL: the create path (`lib/reports/submit.ts:549-556`) and `writeRecoveredIssueUrl`
   (`lib/reports/submit.ts:594-601`). Scoped to that report's show.
2. **Backstop** — `app/api/cron/report-reaper/route.ts`, inside the existing `sql.begin` transaction
   (`app/api/cron/report-reaper/route.ts:57-93`), sweeping every show with an open row. Cadence
   `0 6 * * *` (`supabase/migrations/20260527000003_schedule_cron_jobs.sql:138`), so worst-case
   latency is 24h.

**Raw SQL at both hooks, not the typed helper.** All three codes are registered NON_UPSERT producers
(`tests/messages/_metaAdminAlertCatalog.test.ts:685-689`) raised by raw `INSERT`s, and are
deliberately excluded from the `AdminAlertCode` union (`lib/adminAlerts/upsertAdminAlert.ts:3-36`).
`resolveAdminAlert` and `resolveAdminAlerts` are `AdminAlertCode`-typed
(`lib/adminAlerts/resolveAdminAlert.ts:22`, `lib/adminAlerts/resolveAdminAlert.ts:48`), so using
them would force a union widening the meta-test forbids. This is the identical constraint that made
`resolveBotLoginAlertRow` raw (`docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md`
§6). Both hooks already hold a postgres.js handle, which is the native machinery for each.

### 5.3 Two rules that must be stated, not inferred

- **NULL-show rows.** The `raced_back_twice` fallback (`lib/reports/submit.ts:759-767`) calls the
  plain `upsertAdminAlert` helper (`lib/reports/submit.ts:644-660`) with `secondState?.show_id ??
  firstState?.show_id ?? opts.fallbackShowId ?? null`, so a report with no show yields a global row
  (`show_id IS NULL`). A global row resolves only when **no report anywhere** matches the gate.
  Show-scoped and global rows are swept by separate predicates; a show-scoped recovery never clears
  a global row.
- **The 24h horizon is a handoff, not a leak.** A report aging past `created_at >= now() - 24h`
  stops matching the gate, so the anti-join resolves its alert on age alone. That is correct rather
  than premature, because the reaper deletes exactly those rows
  (`app/api/cron/report-reaper/route.ts:59-62`) and raises `STALE_ORPHAN_REPORT` in the same pass
  (`app/api/cron/report-reaper/route.ts:72-89`). The operator signal survives; it changes code. AC6
  pins the transition.

**Legacy rows heal themselves.** Rows already open at deploy time whose reports the reaper long ago
deleted match the anti-join trivially (no `reports` row remains), so the first post-deploy cron run
clears them. No data-repair migration is needed. AC5 pins this.

### 5.4 Catalog and copy

`resolution: "manual"` becomes `"auto"` at `lib/messages/catalog.ts:2974`
(`REPORT_LOOKUP_INCONCLUSIVE`), `lib/messages/catalog.ts:2942` (`REPORT_DUPLICATE_LIVE_MATCHES`),
and `lib/messages/catalog.ts:2993` (`REPORT_OPEN_ORPHAN_LABEL`). That flip alone suppresses the
manual button, via `AUTO_RESOLVING_CODES` (`lib/adminAlerts/audience.ts:53-55`).

Three new `AUTO_RESOLVE_NOTES` entries (`lib/adminAlerts/audience.ts:111`). Copy is swept for em
dashes by the existing meta-test that iterates the real map
(`lib/adminAlerts/audience.ts:107-110`):

```ts
REPORT_LOOKUP_INCONCLUSIVE:
  "Clears automatically once the report goes through, or once the daily cleanup retires it.",
REPORT_DUPLICATE_LIVE_MATCHES:
  "Clears automatically once the duplicates are sorted out and the report goes through, or once the daily cleanup retires it.",
REPORT_OPEN_ORPHAN_LABEL:
  "Clears automatically once the issue is re-closed and the report goes through, or once the daily cleanup retires it.",
```

**No §12.4 master-spec lockstep.** The x1 catalog to §12.4 parity gate
(`tests/cross-cutting/codes.test.ts:69-92`) compares copy fields, not `resolution`; the §12.4 prose
rows for these codes (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3041`,
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3043`,
`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3044`) do not encode resolution mode. Their
`helpfulContext` at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3362` already reads
*"Usually a transient GitHub API blip that clears on the next retry"*, which is consistent with the
flip. This is verified, not assumed — AC9 re-runs the gate.

---

## 6. Registry and lockstep fan-out

### 6.1 `ADMIN_ALERTS_LIFECYCLE` (`tests/messages/_metaAdminAlertCatalog.test.ts`)

| Code | Line | From | To |
|---|---|---|---|
| `TILE_SERVER_RENDER_FAILED` | `tests/messages/_metaAdminAlertCatalog.test.ts:455` | `state-manual-justified` | `hybrid` plus `resolveSites` |
| `REPORT_LOOKUP_INCONCLUSIVE` | `tests/messages/_metaAdminAlertCatalog.test.ts:486` | `event-manual` | `auto` plus `resolveSites` |
| `REPORT_DUPLICATE_LIVE_MATCHES` | `tests/messages/_metaAdminAlertCatalog.test.ts:487` | `event-manual` | `auto` plus `resolveSites` |
| `REPORT_OPEN_ORPHAN_LABEL` | `tests/messages/_metaAdminAlertCatalog.test.ts:488` | `event-manual` | `auto` plus `resolveSites` |

Count assertions move: `auto` 26 to 29 (`tests/messages/_metaAdminAlertCatalog.test.ts:732-734`),
`hybrid` 1 to 2 (`tests/messages/_metaAdminAlertCatalog.test.ts:736-739`), `event-manual` 18 to 15,
`state-manual-justified` 1 to 0. The `resolution` parity test
(`tests/messages/_metaAdminAlertCatalog.test.ts:767-775`) and the no-auto-clear-promise guard
(`tests/messages/_metaAdminAlertCatalog.test.ts:781-799`) both run against the edited catalog.

### 6.2 Producer-scope registry

`tests/adminAlerts/alertProducerScope.registry.ts` has no rows for any of the four codes today. The
tile raise **moves file** (from `components/crew/WrappedSection.tsx` to
`app/show/[slug]/[shareToken]/_CrewShell.tsx`), so any registry or meta-test pinning the producer's
location must move with it — including the `ADMIN_ALERTS_WRITE_SITES` pin at
`tests/messages/_metaAdminAlertCatalog.test.ts:231-234`, whose pattern
`/upsertAdminAlert\(\{[\s\S]*code:\s*"TILE_SERVER_RENDER_FAILED"/` currently matches
`components/crew/WrappedSection.tsx` and will not after §4.4. Updating that pin is a required edit,
not an optional one; AC8 fails without it.

### 6.3 `RESOLVE_INTENTS` — do not delete rows

All four codes keep their rows at `lib/adminAlerts/resolveActionLabel.ts:62-64` and
`lib/adminAlerts/resolveActionLabel.ts:66`, and `tests/adminAlerts/resolveIntentsBaseline.json` is
**not** edited.

This is load-bearing and counterintuitive, so it is stated explicitly. The append-only lifecycle
gate (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:118-124`) asserts that every code in
`origin/main`'s baseline still maps to its historical intent, failing with *"changed or was deleted;
rows already in admin_alerts still render it."* Its docstring gives the reason
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:12-14`): *"admin_alerts rows persist.
Retiring a producer and cleaning up its 'unused' map entry would silently flip already-stored
rows."* The completeness gate (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:28-33`) only
requires that **non-auto** codes have a row; it does not forbid an auto code from keeping one.
Button visibility is driven by `AUTO_RESOLVING_CODES`, not by this map, so the retained rows change
no rendered output — they keep already-stored rows labelled correctly.

### 6.4 New surfaces subject to invariant 9

`resolveTileRenderAlertsForTiles`, in a new module at
`lib/adminAlerts/resolveTileRenderAlerts.ts (new)`, destructures `{ data, error }` and throws on a
returned error, mirroring `resolveAdminAlerts` (`lib/adminAlerts/resolveAdminAlert.ts:51-68`). It
gains a row in the notify infra-contract registry (`tests/notify/_metaInfraContract.test.ts:6-17`)
plus a behavioral test alongside the existing `resolveAdminAlert` case at
`tests/notify/_metaInfraContract.test.ts:177` (returned-error AND thrown-fault both throw), and an
empty-list guard mirroring `resolveAdminAlerts`' `codes.length === 0` early return
(`lib/adminAlerts/resolveAdminAlert.ts:57`): `tileIds: []` must issue no Supabase call.

The two raw report resolvers execute inside existing postgres.js transactions and follow the raw
producer convention of their hosts; they are covered by their hosts' registry rows.

---

## 7. Structural defense

The per-tile design's soundness rests on facts about the render tree that no runtime assertion
observes. Both are pinned at CI time.

### 7.1 Tile producer topology

New meta-test at `tests/crew/_metaTileProducerTopology.test.ts (new)`, filesystem-walked over
`components/` and `app/` so a new surface fails by default:

1. Every `<WrappedSection` JSX call site lives in `components/crew/sections/`; the set of
   `tileId` literals equals the §4.2 table exactly; each `SectionId` maps to exactly one.
2. `app/show/[slug]/[shareToken]/_CrewShell.tsx` contains the sweep (`after(`-registered,
   referencing both `upsertAdminAlert` with `TILE_SERVER_RENDER_FAILED` and
   `resolveTileRenderAlertsForTiles`).
3. `components/crew/WrappedSection.tsx` contains **no** `upsertAdminAlert` call — the raise lives in
   exactly one layer, so a re-added per-component raise cannot silently reintroduce unordered
   writes.
4. `components/shared/WrappedTile.tsx` has no production call site, keeping
   `components/shared/TileServerFallback.tsx`'s producer dormant and out of the sweep's scope.

Assertions 1 and 3 together are what replace `WrappedSection`'s lost self-containment (§4.4).

### 7.2 Behavioral tests the topology test cannot express

- **T1 — request isolation.** Two independently-scoped renders produce distinct ledgers; a tile
  failure in one is not visible to the other.
- **T2 — clean set derivation.** `cleanTileIds` returns `attempted` minus `failed`, derived from the
  fixture's own tile set, never a hardcoded list.
- **T3 — closure, not re-lookup.** The `after()` callback observes mutations made by sections after
  `_CrewShell`'s body returned. A mutant that replaces the captured `ledger` with a fresh
  `getTileRenderLedger()` call inside the callback must fail this test.

---

## 8. Guard conditions and edge cases

| Surface | Edge | Behavior |
|---|---|---|
| A | non-lead viewer (no Budget entitlement) | `crew:budget:rows` never enters `attempted`, so it is never in `cleanTileIds`; an open budget-tile alert survives |
| A | response aborts mid-render | `after()` still runs with a partial `attempted`; only tiles that completed are resolved; unrendered tiles keep their alert |
| A | tiles A and B both throw | two upserts hit one row (dedup index); row ends naming B with `occurrence_count` 2 — existing behavior, unchanged; neither is in `cleanTileIds` |
| A | row names A (yesterday), today A is clean and B throws | raise rewrites context to B; resolve targets clean tiles, which excludes B; row survives, correctly reporting B |
| A | row names A, today everything clean | A is in `cleanTileIds`; row resolves |
| A | section renders but its data is empty | the seam still ran without throwing, so the tile is clean and resolvable — correct: nothing is broken |
| A | sweep throws (Supabase outage) | caught and logged; crew render unaffected; next healthy request sweeps |
| A | no request scope (unit test) | `after()` throws synchronously; registration skipped, matching the existing shape in `_CrewShell` |
| B | report lands its issue URL, a second report for the same show still stuck | anti-join still matches the second report; alert stays open |
| B | report ages past 24h without landing | alert resolves on age; reaper deletes the row and raises `STALE_ORPHAN_REPORT` in the same pass (§5.3) |
| B | global (`show_id IS NULL`) row | resolves only when no report anywhere matches the gate |
| B | legacy row whose report was reaped before deploy | anti-join matches trivially; first post-deploy cron run clears it |
| both | alert already resolved manually | every resolve filters `resolved_at IS NULL`; no double-write |
| both | auto-resolution stamping | sets `resolved_at` only; `resolved_by` stays NULL, per all existing precedents (`lib/adminAlerts/resolveAdminAlert.ts:33`) |

---

## 9. Acceptance criteria

- **AC1** A crew render where every entitled tile renders clean resolves an open
  `TILE_SERVER_RENDER_FAILED` row whose `context.tileId` is among them. A render where the row's
  tile throws leaves it open and re-raises.
- **AC2** A non-lead render (Budget not entitled) does NOT resolve a row naming
  `crew:budget:rows`. Expectation derived from the fixture's entitlement, not hardcoded.
- **AC3** A ledger with a partial `attempted` set (simulating an aborted render) resolves only the
  tiles present in it.
- **AC4** Raise-before-resolve ordering: a sweep where one tile throws and the rest are clean leaves
  exactly one open row, naming the thrown tile, after the callback completes.
- **AC5** A report landing its `github_issue_url` resolves the show's open lookup-family rows when
  no other report for that show matches the gate, and does not when one does. A row whose report no
  longer exists resolves on the next reaper run.
- **AC6** The 24h handoff: a report crossing the horizon resolves its lookup-family alert and, in
  the same reaper pass, produces a `STALE_ORPHAN_REPORT` row.
- **AC7** T1, T2 and T3 from §7.2 pass, including the T3 mutant.
- **AC8** The §7.1 topology test passes, and fails when (a) a `<WrappedSection>` is added outside
  `components/crew/sections/`, (b) `components/crew/WrappedSection.tsx` regains an
  `upsertAdminAlert` call, or (c) the `_CrewShell` sweep is removed. The `ADMIN_ALERTS_WRITE_SITES`
  pin at `tests/messages/_metaAdminAlertCatalog.test.ts:231-234` points at the new producer file.
- **AC9** Lifecycle registry: all four reclassifications land with resolve sites that exist on disk;
  count assertions updated; `resolution` parity, no-auto-clear-promise, the x1 parity gate in
  `tests/cross-cutting/codes.test.ts`, and the `AUTO_RESOLVE_NOTES` copy sweep all green.
- **AC10** `RESOLVE_INTENTS` and `tests/adminAlerts/resolveIntentsBaseline.json` are byte-identical
  to `origin/main`; all three layers of
  `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` pass.
- **AC11** `resolveTileRenderAlertsForTiles`: `tileIds: []` issues no Supabase call; returned DB
  error throws; thrown query fault throws. Registry row present.
- **AC12** `pnpm test` full suite plus `pnpm typecheck`, `pnpm lint` and `pnpm format:check` green.
- **AC13** Invariant-8 UI gate: `/impeccable critique` AND `/impeccable audit` on the affected diff
  (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, `components/crew/WrappedSection.tsx`, and the 7
  section files if touched), P0 and P1 findings fixed or deferred via `DEFERRED.md`, BEFORE the
  whole-diff cross-model review.
- **AC14** Both shipped BACKLOG entries moved to `BACKLOG-archive.md` with the §2 citations; the
  obsolete DEFER rows removed from
  `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md:96-97` and
  `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md:303-306`, with its §3
  class counts corrected.

Anti-tautology notes, binding on the plan: every assertion reads `admin_alerts` rows or the ledger
directly, never log output. AC2's entitlement and AC3's partial set derive from fixture state. AC4
asserts the post-callback row identity, not that a function was called. AC5 and AC6 derive stuck
versus recovered from fixture timestamps relative to the query's `now()`, never hardcoded intervals.

---

## 10. What does NOT change

- **No DDL.** `admin_alerts` keeps its columns and `admin_alerts_one_unresolved_idx`. No migration,
  so no `gen:schema-manifest` regen and no validation surgical apply.
- **No new §12.4 codes, no catalog rows added, no user-visible copy edits** beyond the three
  `AUTO_RESOLVE_NOTES` additions. The x1, x2, spec-codes and help-families gates do not move.
- **No rendered-output change.** `WrappedSection` returns the same fallback; `_CrewShell` returns
  the same JSX. The invariant-8 gate applies because the files are UI surfaces by location, not
  because pixels move.
- Manual resolve routes are untouched and still stamp `resolved_by`.
- Dedup and occurrence semantics unchanged: resolving then re-raising creates a fresh row,
  preserving history.

---

## 11. Alternatives considered

- **Widen the dedup index with a per-tile discriminator column** (the literal reading of
  `BL-ALERT-TILE-RENDER-PER-TILE-KEYING`): rejected. It fans out to every raw `ON CONFLICT`
  producer, the upsert RPC, bell grouping, attention items, and the identity map, plus a
  migration, manifest and validation cycle — for granularity no consumer reads. Filtering on the
  `context.tileId` the row already carries achieves the same keying at read time.
- **Global "nothing failed this render" sweep**: rejected. Viewer-gated Budget and abort-time
  partial ledgers both make it clear live alerts (§4.1).
- **Keep the raise in `WrappedSection` and resolve from a trailing sentinel component**: rejected.
  It preserves the component's self-containment but encodes the ordering requirement as an
  invisible render-order dependency; the chosen design makes the same guarantee a meta-test.
- **A central reconciler cron for tiles**: rejected for the parent spec's reason (§9) — the
  condition is only observable at render time, so a cron would have to duplicate the render.
- **Data-repair migration for legacy report rows**: unnecessary; the anti-join heals them on the
  first cron run (§5.3).

---

## 12. Watchpoints (review preempts — do not relitigate)

- **`GITHUB_BOT_LOGIN_MISSING` and `BRANCH_PROTECTION_*` are already auto.** §2 cites the live
  registry rows and resolvers. Their BACKLOG entries were stale, not open work.
- **Branch-protection dormancy is intended.** The bell spec converted ahead of the CI trigger on
  purpose (D6); `DEFERRED-archive.md:861` records the re-enable step. Not a gap this spec must fix.
- **The parent spec's "no aggregation point" line is superseded, but the design does not depend on
  that.** §4.1 shows the resolve is keyed per tile regardless of whether sections render together.
- **`TILE_SERVER_RENDER_FAILED` keeps its manual button.** `hybrid`, not `auto`, with catalog
  `resolution: "manual"` — precedent `ONBOARDING_SHEET_UNREADABLE`. Do not propose flipping it.
- **`RESOLVE_INTENTS` rows are retained deliberately.** §6.3. Deleting them fails
  `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` layer 2 by design.
- **No schema change.** §1.1. The dedup index stays as-is.
- **`resolved_by` stays NULL for auto-resolution.** Existing convention of every precedent, not a
  new decision.
- **The three surviving report codes stay manual.** §5.1 states the test they fail (no surviving row
  whose absence proves recovery).
