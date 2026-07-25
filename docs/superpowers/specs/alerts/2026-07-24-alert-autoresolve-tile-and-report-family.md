# Observer-keyed resolution for crew-tile render alerts

**Date:** 2026-07-24 · **Status:** Draft (revision 4, after adversarial round 3)
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)
**Parent spec:** `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` (state-vs-event principle, §2)

Closes four BACKLOG entries. Two are already shipped and need archiving (§2). One ships a design
(§4). One is an evaluation whose answer is no change (§5).

---

## 1. Problem

`docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §2 ratified the
**state vs event** principle: an alert whose condition is a persistent, code-observable STATE
auto-resolves where the system observes recovery; an alert recording a one-shot EVENT stays
manual-acknowledge. That spec classified every registry code and deferred four decisions to BACKLOG.
This spec lands them.

Both live deferrals were filed against the same symptom: **an alert whose dedup key is coarser than
the instance its condition belongs to.** `admin_alerts` dedups on
`(coalesce(show_id::text, ''), code)`
(`supabase/migrations/20260501001000_internal_and_admin.sql:279-280`), so one open row covers every
failing tile of a show, or every stuck report of a show.

They get different answers. Crew tiles have a complete, code-observable instance, the (tile,
observer) pair, and this spec resolves on it (§4). The report lookup family does not: its recovery
observation cannot be repeated, so a wrong resolution is permanent and it stays manual (§5). Three
adversarial rounds produced that split; every rejected design is recorded so none is re-derived.

## 1.1 Resolved scope — do not relitigate

- **`GITHUB_BOT_LOGIN_MISSING` and both `BRANCH_PROTECTION_*` codes are already `class: "auto"`.**
  Verified in the live registry and independently confirmed in adversarial round 1 (§2). This spec
  archives their BACKLOG entries; it must not touch their resolvers.
- **No DDL.** The dedup index is not widened. Keying uses `context`, which is `jsonb` and needs no
  migration. Widening `admin_alerts_one_unresolved_idx` would fan out to every raw `ON CONFLICT`
  producer (`lib/reports/submit.ts:653`, `lib/reports/submit.ts:676`,
  `app/api/cron/report-reaper/route.ts:75`), the `upsert_admin_alert` RPC, bell grouping,
  `lib/admin/attentionItems.ts`, and `lib/adminAlerts/alertIdentityMap.ts`, for granularity nothing
  reads. Do not re-propose a schema change.
- **The tile resolve is keyed on BOTH `tileId` and an observer key.** Keying on `tileId` alone was
  designed and rejected in round 3 (§4.6). Do not re-propose it.
- **`TILE_SERVER_RENDER_FAILED` becomes `hybrid`, not `auto`.** Catalog `resolution` stays
  `"manual"` and the manual button stays. Rationale §4.9; precedent `ONBOARDING_SHEET_UNREADABLE`
  (`tests/messages/_metaAdminAlertCatalog.test.ts:463-475`).
- **The tile ledger is threaded as an explicit prop, not held in React `cache()`.** Rationale and
  the round-1 findings that forced it are in §4.3. Do not re-propose an ambient request store.
- **There is no timestamp freshness fence.** Round 2 proved one cannot be made sound across the app
  and DB clocks (§4.7). Do not re-propose an `observedAt` comparison.
- **All six report-family codes stay manual** (§5). The local anti-join and the `findIssueByMarker`
  resolver were both designed and rejected. Do not re-propose either.
- **`RESOLVE_INTENTS` rows are never deleted** (§6.3).

---

## 2. Two BACKLOG entries are already satisfied (archive only)

Verified against live code and re-verified by the round-1 reviewer, which reported: _"Both 'already
shipped' claims were verified: the bot-login resolver is invoked by maintenance
(`lib/notify/runNotify.ts:237-248`), and both branch-protection healthy-path resolvers are wired
(`scripts/verify-branch-protection.ts:361-379`) while their workflows remain intentionally
dormant."_

### 2.1 `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE` — shipped

Promoted DEFER to auto by `docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` §6.

| Claim                                            | Citation                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Registry class `auto`, two pinned resolve sites  | `tests/messages/_metaAdminAlertCatalog.test.ts:493-499`                                        |
| Env-presence predicate `botLoginConfigured`      | `lib/reports/botLoginAlert.ts:15`                                                              |
| Cron reconcile resolver `resolveBotLoginAlertRow` | `lib/reports/botLoginAlert.ts:45`                                                             |
| Invoked by maintenance                           | `lib/notify/runNotify.ts:237-248`                                                              |
| Behavioral tests                                 | `tests/reports/submit.botLoginResolve.test.ts`, `tests/notify/runMaintenance.botLogin.test.ts` |

The deferral's stated blocker (needing live GitHub probes) did not apply: resolution reads the env
directly rather than inferring config health from a submit succeeding.

### 2.2 `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE` — shipped, detector dormant

Promoted by `docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md` D6
(`docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md:30`) and §10
(`docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md:249-253`).

| Claim                                       | Citation                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Both codes `class: "auto"` with resolve sites | `tests/messages/_metaAdminAlertCatalog.test.ts:502-513`                                        |
| Resolver `defaultResolveAlerts`             | `scripts/verify-branch-protection.ts:253`                                                       |
| Healthy-path call sites wired               | `scripts/verify-branch-protection.ts:361-379`                                                   |
| Auto-clear copy                             | `lib/adminAlerts/audience.ts:118-122`                                                           |
| Full provenance including dormancy          | `DEFERRED-archive.md:853-862`                                                                   |

**Residual:** the resolver is dormant in CI. Its producer runs in two `x-audits.yml` jobs that are
both `if: false` under the X6-D-1 solo-dev variant (`.github/workflows/x-audits.yml:443`,
`.github/workflows/x-audits.yml:474`). The bell spec converted ahead of that trigger deliberately, so
this is a tracked residual, not a gap. Re-enable step recorded at `DEFERRED-archive.md:861`.

**Action for both:** move to `BACKLOG-archive.md` with resolved-status lines citing the above,
including the dormancy cross-reference. No code change.

---

## 3. Design principle extension: instance-keyed resolution

The parent spec's §2 answers _whether_ a code may auto-resolve. It does not answer _which row_ a
recovery observation may clear when one row aggregates many instances. This spec adds that half:

> **Instance-keying rule.** When an alert's dedup key (`show_id`, `code`) is coarser than the
> instance its condition attaches to, a recovery observation may resolve the row ONLY if:
>
> (a) **Same instance.** The observation identifies the instance the row currently names, on every
> axis the condition varies over. Filter on discriminators the row carries in `context`.
>
> (b) **Whole condition.** The observation re-evaluates _every_ conjunct of the raise condition. A
> state-shaped local gate is not evidence that a code is state-shaped overall; if a conjunct is
> external, only an observation that re-checks that system qualifies.
>
> (c) **Repeatable.** The observation must be one the system will make again. A resolution that
> cannot be re-tested cannot be corrected, so a single wrong answer is permanent.

Clause (a)'s "every axis" is what forces the observer key (§4.6). Clause (b) killed the report
family's first design (§5.2); clause (c) killed its second (§5.3).

---

## 4. `TILE_SERVER_RENDER_FAILED`: observer-keyed resolution

### 4.1 What this alert is

It is a **crash catcher**, not a modeled condition. Nothing under `lib/crew/` or `components/crew/`
throws deliberately: a search for `throw new` across both trees returns nothing. The alert fires only
from `WrappedSection`'s `catch` when building a section raises an unanticipated runtime error
(`components/crew/WrappedSection.tsx:82-91`).

That matters twice below: the crash is _also_ written to the durable `app_events` log by the adjacent
`log.error` (§4.8), and the set of things that can fail is not enumerable, so the design must be
sound without knowing what broke.

### 4.2 Why the parent spec deferred it

The parent spec's §3 row reads: _"State-shaped but no aggregation point: tiles render/stream
independently per-request; the open row is deduped per (show, code) with `context.tileId` replaced on
re-raise, so tile A's success cannot prove tile B (which may hold the row) is healthy."_

The second clause is the real constraint and this design honors it. The first clause does not
describe current code, and the design does not depend on it either way:

- There are **7** `<WrappedSection>` call sites, all synchronous Server Components, one per
  `SectionId` (§4.4). None is `async`; no `Suspense` exists under `app/show/` or `components/crew/`.
- `_CrewShell` server-renders every entitled section body per request
  (`app/show/[slug]/[shareToken]/_CrewShell.tsx:413`); the `<CrewSections>` client controller toggles
  visibility only (`app/show/[slug]/[shareToken]/_CrewShell.tsx:320-325`).
- The crew page is dynamic per request (no `dynamic` or `revalidate` export in
  `app/show/[slug]/[shareToken]/page.tsx`).

### 4.3 The ledger is an explicit prop

Round 1 raised two findings with one root cause, both fixed by making the ledger explicit:

- **Tests cannot exercise React's request cache.** The React build Vitest resolves without the
  `react-server` condition turns `cache` into a pass-through, and `vitest.config.ts:55-70` supplies
  no such condition. Existing tests call `CrewShell` directly before rendering descendants
  (`tests/components/crew/crewShellTwoDistinctAlerts.test.tsx:110-120`), so shell and sections would
  receive different objects and the identity contract would be untestable.
- **A topology test cannot constrain callers.** A future route could mount `<VenueSection>` directly
  and every source-pattern assertion would still pass. Direct section mounting already happens in
  tests (`tests/components/crew/wrappedSection.test.tsx:105-160`).

New module at `lib/crew/tileRenderLedger.ts (new)`:

```ts
/** Per-request record of which crew tiles ran, and which threw. */
export type TileRenderLedger = {
  attempted: Set<string>;
  /** tileId -> the thrown error's message, needed for the alert's context.message. */
  failed: Map<string, string>;
};

export function createTileRenderLedger(): TileRenderLedger {
  return { attempted: new Set(), failed: new Map() };
}

/** Tiles that ran their render seam to completion without throwing. */
export function cleanTileIds(ledger: TileRenderLedger): string[] {
  return [...ledger.attempted].filter((id) => !ledger.failed.has(id)).sort();
}
```

`failed` is a `Map`, not a `Set`: round 1 found that a tileId-only ledger discards `err.message`,
which the alert's `context.message` requires (it exists only as the catch-local `err.message` at
`components/crew/WrappedSection.tsx:84-102`). The sweep runs after the catch returns, so the message
must be carried, not re-derived.

An explicit **required** prop removes the silent-omission variant: mounting a section without a
ledger is a compile error. It does not by itself guarantee the section shares the shell's swept
ledger, since a caller can type-safely pass a throwaway one. That residual hole is closed by §7.1
assertion 2, which bounds where section components may be constructed. Round 2 caught the overclaim;
the two defenses are stated separately so neither is mistaken for the other.

### 4.4 Tile inventory (exhaustive; pinned by §7.1)

`SectionId` has exactly 7 members (`lib/crew/resolveActiveSection.ts:1`); each section wraps exactly
one throwable block:

| `SectionId` | `tileId`                | Call site                                             |
| ----------- | ----------------------- | ----------------------------------------------------- |
| `today`     | `crew:today:notes`      | `components/crew/sections/TodaySection.tsx:175`        |
| `schedule`  | `crew:schedule:days`    | `components/crew/sections/ScheduleSection.tsx:185`     |
| `venue`     | `crew:venue:diagrams`   | `components/crew/sections/VenueSection.tsx:328`        |
| `travel`    | `crew:travel:transport` | `components/crew/sections/TravelSection.tsx:163`       |
| `crew`      | `crew:crew:roster`      | `components/crew/sections/CrewSection.tsx:116`         |
| `gear`      | `crew:gear:scope`       | `components/crew/sections/GearSection.tsx:164`         |
| `budget`    | `crew:budget:rows`      | `components/crew/sections/BudgetSection.tsx:67`        |

`components/crew/WrappedSection.tsx` has no barrel re-export. Three files mention it in comments only
(`components/shared/CardReportTrigger.tsx:9`, `components/crew/DiagramsBlock.tsx:15`,
`components/crew/SectionTileError.tsx:10`) and are not call sites.

`components/shared/TileServerFallback.tsx:88` is the code's second registered producer. Its only
consumer, `components/shared/WrappedTile.tsx:54`, has no production call site, so it is dormant, out
of scope, unchanged, and the reason §6.2 does not repoint the write-site registry row.

### 4.5 `WrappedSection` records; it no longer raises

`components/crew/WrappedSection.tsx` changes:

- Accept the required `ledger: TileRenderLedger` prop.
- Before invoking `render()`: `ledger.attempted.add(tileId)`.
- In the `catch`: `ledger.failed.set(tileId, err.message)`, keep the existing `log.error`
  (`components/crew/WrappedSection.tsx:86-91`), and **remove** the `upsertAdminAlert` call with its
  `after()` and fire-and-forget fallback (`components/crew/WrappedSection.tsx:94-122`).
- The fallback return (`components/crew/WrappedSection.tsx:123`) is unchanged.

Both mutations are synchronous and `render()` is invoked synchronously with no await point
(`components/crew/WrappedSection.tsx:83`), so a tile in `attempted` and absent from `failed` provably
completed its render seam.

**The durability guarantee moves, and must move with its test.** The `after()` keep-alive at
`components/crew/WrappedSection.tsx:110-122` exists because a bare unawaited promise can be dropped
when a serverless RSC render freezes. That guarantee now lives in the shell sweep, also
`after()`-registered. Its existing pin
(`tests/components/crew/wrappedSectionDurability.test.tsx:35-75`) **inverts**: post-change
`WrappedSection` registers no `after()` work on either path. An equivalent assertion must be added
for the sweep in the same commit, in the stronger returned-promise form (§4.10), or the guarantee
silently loses its only test.

### 4.6 The observer key (round-3 BLOCKING fix)

**Permission gates live inside the wrapped seam, so different viewers execute different code.**
`TravelSection` decides whether the ground-transport block is built at all via `transportTileVisible`
(`components/crew/sections/TravelSection.tsx:172-178`), from `data.viewerId`, `data.viewerName`,
`data.viewerNameAliases` and `ctx.isAdmin`. If transport data is malformed, only viewers who pass
that gate reach it; everyone else builds the same `tileId` cleanly, having skipped the bad data.

Keying on `tileId` alone therefore violates instance-keying clause (a): a viewer who never executes
the failing path would clear an alert still live for the viewer who does. Round 3 raised this as
BLOCKING and it is correct. (Round 3's supporting example, a throw from flight-string parsing, is
**not** correct: `lib/crew/flightDisplay.ts` contains no `throw`. The gate mechanism above is the
real one and is sufficient.)

There is no wholesale render to fall back on: the admin preview route is
`app/admin/show/[slug]/preview/[crewId]/page.tsx`, scoped to one crew member. Admin preview is
another viewer, not a superset.

**The fix: carry the observer in `context` and require it to match.**

```
viewerKey = data.viewerId ?? "admin"
```

`data.viewerId` is the viewer's `crewMemberId` for `crew` and `admin_preview` viewers, and `null` for
a plain `admin` viewer (`lib/data/getShowForViewer.ts:774`). The `"admin"` sentinel keeps plain-admin
renders in their own bucket: an admin's all-flags render bypasses per-crew restrictions, so it
exercises a different path than any crew member and must not clear their alerts.

The value is an opaque internal UUID, never a name or email, so it is outside the no-inline-email
guard's scope (`tests/admin/no-inline-email-normalization.test.ts`). It must be declared in the
producer's `contextKeys` (§6.2).

**Consequence on dedup, stated plainly.** The row remains one per (show, code), so `context` names
the most recent (tileId, viewerKey) pair and resolution clears only that pair. If two crew members
both hit failures, the row names whoever was last, and only that person's clean render clears it.
That is narrower than today, deliberately: it can leave a row open longer, and it can never clear a
row on behalf of an observer who did not make the observation. Collapsing multiple failures into one
row is existing behavior (`occurrence_count` counts them), not a regression introduced here.

### 4.7 The concurrent-render race: accepted and self-healing

Two concurrent requests for the **same** observer can still disagree if the underlying data changes
between them. Raise-before-resolve orders one callback, not two requests.

**Revision 2 proposed a timestamp fence (`last_seen_at < observedAt`). Round 2 disproved it, and no
repair exists.** Two independent defects:

- **Cross-clock comparison.** `observedAt` would come from the application clock while `last_seen_at`
  is written by Postgres `now()`
  (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:47`). An app instance
  running seconds fast can make a stale observation compare as newer, so the fence can invert.
- **Request start is the wrong instant.** `observedAt` is captured before any section renders, but
  the observation happens when each tile completes, so a genuinely newer clean render can be rejected
  and strand a recovered row.

Fixing both would need a DB-stamped timestamp per tile at completion, a write per tile on the render
path, which is not acceptable for an observability signal.

**Resolution: accept it, per instance-keying clause (c).** With observer keying the window is narrow
(same viewer, overlapping requests, data changing in between) and it closes itself: the condition, if
still true, throws again on that observer's next render and re-raises. §4.8 bounds the cost. This
matches the posture the parent spec ratified for `WEBHOOK_TOKEN_INVALID` (§S5), whose failure mode
likewise cannot be masked because it keeps producing the raise condition.

Pinned, not asserted: T4 (§7.2) replays the interleaving, applies the spurious resolve, then runs a
sweep in which the tile still fails and asserts the row is open again.

### 4.8 What a wrong resolution costs

Bounded, because the crash is recorded twice and this design touches only one record.

`WrappedSection`'s `log.error` (`components/crew/WrappedSection.tsx:86-91`) flows through `lib/log`,
which persists above a level threshold to the locked-down `public.app_events` table via a
service-role insert
(`docs/superpowers/plans/observability/2026-06-29-centralized-logging-foundation.md`), queryable with
`pnpm observe`. Auto-resolution never touches it.

So the worst case of a wrong resolve is a lost **nudge**, not lost evidence: the crash stays
searchable, the alert re-raises on the affected observer's next render, and the manual button remains
(§4.9). This is why observer keying is a completeness improvement rather than a safety prerequisite,
and why the design does not need to be perfect to be a net gain.

### 4.9 Classification: `hybrid`, and the button stays

`TILE_SERVER_RENDER_FAILED` moves `state-manual-justified` to `hybrid`
(`tests/messages/_metaAdminAlertCatalog.test.ts:455`), with one `resolveSites` row.

Catalog `resolution` stays `"manual"` (`lib/messages/catalog.ts:2424`), so `AUTO_RESOLVING_CODES`
(`lib/adminAlerts/audience.ts:53-55`) does not gain it and the manual button survives. **Why:**
re-detection requires that specific observer to load the page again. For an idle show, or a crew
member who has finished their run, that may never happen, so removing the only manual clear path
would strand the row. Same shape as `ONBOARDING_SHEET_UNREADABLE`, whose registry row documents it:
_"self-clears via the clean-scan + cron heal observers, while the manual Resolve button legitimately
stays"_ (`tests/messages/_metaAdminAlertCatalog.test.ts:460-462`), with its intent row at
`lib/adminAlerts/resolveActionLabel.ts:68` exactly as this code's is at
`lib/adminAlerts/resolveActionLabel.ts:66`.

Consequences: no `AUTO_RESOLVE_NOTES` entry, no §12.4 lockstep, and no change to
`tests/admin/resolveAutoCodeGuard.test.ts:22`, which pins this code as manual health and stays true.

### 4.10 The shell sweep

`_CrewShell` creates the ledger in its body, then registers **one** unconditional `after()` callback,
independent of the existing `TILE_PROJECTION_FETCH_FAILED` branch at
`app/show/[slug]/[shareToken]/_CrewShell.tsx:153-205`, whose `else`-branch placement must not be
reused (its condition is a different observation).

The callback body is a pure exported function so it is testable without an RSC scope:

```ts
export async function sweepTileRenderAlerts(
  ledger: TileRenderLedger,
  args: { showId: string | null; sheetName: string | null; viewerKey: string },
): Promise<void>;
```

Order inside it:

1. **Raise** — for each `[tileId, message]` in `ledger.failed`, `await upsertAdminAlert({ showId, code: "TILE_SERVER_RENDER_FAILED", context: { tileId, message, sheet_name, viewerKey } })`.
2. **Resolve** — `await resolveTileAlertsForObserver({ showId, viewerKey, tileIds: cleanTileIds(ledger) })`.

Raise-before-resolve is the safe order in both directions: a failed tile is by construction absent
from `cleanTileIds`, so step 2 can never clear the row step 1 just wrote.

The callback MUST **return** the sweep promise (`after(() => sweepTileRenderAlerts(...))`), never
`after(() => { void sweepTileRenderAlerts(...) })`. A voided call returns before the write settles,
so the runtime's keep-alive has nothing to wait on and a serverless freeze can still drop the row,
which is the exact failure the `after()` wiring exists to prevent (§4.5). T5 asserts the returned
promise, not merely that `after` was called.

Error posture: fail-quiet with its own log code, matching the adjacent projection raise and resolve
(`app/show/[slug]/[shareToken]/_CrewShell.tsx:172-178`,
`app/show/[slug]/[shareToken]/_CrewShell.tsx:186-193`). Registration is wrapped in the same
`try { after(...) } catch {}` shape already used at
`app/show/[slug]/[shareToken]/_CrewShell.tsx:200-204`, because `after()` throws synchronously outside
a request scope; skipping is safe because the next healthy request sweeps.

### 4.11 The resolve helper

`resolveTileAlertsForObserver`, new at `lib/adminAlerts/resolveTileAlertsForObserver.ts (new)`:

- filters `code = 'TILE_SERVER_RENDER_FAILED'`, `resolved_at IS NULL`, the show (`.eq`/`.is` on
  `show_id` as `resolveAdminAlert` does at `lib/adminAlerts/resolveAdminAlert.ts:37`),
  `context->>'viewerKey'` equal to the observer, and `context->>'tileId'` in `tileIds`;
- sets `resolved_at` only, leaving `resolved_by` NULL;
- returns early with no Supabase call when `tileIds` is empty, mirroring `resolveAdminAlerts`' guard
  (`lib/adminAlerts/resolveAdminAlert.ts:57`);
- destructures `{ data, error }` and throws on a returned error, mirroring
  `lib/adminAlerts/resolveAdminAlert.ts:51-68` (invariant 9).

`TILE_SERVER_RENDER_FAILED` is in the `AdminAlertCode` union
(`lib/adminAlerts/upsertAdminAlert.ts:29`) and is not inbox-routed, so the helper is typed and uses
the Supabase service-role client, matching its host.

### 4.12 Dimensional Invariants

**None. No rendered element is added, removed, or resized.**

Two UI-surface files are edited (`app/show/[slug]/[shareToken]/_CrewShell.tsx`,
`components/crew/WrappedSection.tsx`) plus a prop added to the 7 section components, which makes this
a UI spec by the invariant-8 location rule and pulls in the impeccable dual-gate (AC18). No edit
touches JSX output: `WrappedSection` returns `render()`'s output or
`fallback ?? <TileErrorFallback />` (`components/crew/WrappedSection.tsx:123`) exactly as today, and
`_CrewShell`'s returned tree (`app/show/[slug]/[shareToken]/_CrewShell.tsx:417` onward) is untouched.
No fixed-dimension parent to flex or grid child relationship is created, removed, or altered.

### 4.13 Transition Inventory

**None. No component gains, loses, or changes a visual state.**

`WrappedSection` keeps exactly its two render outcomes (wrapped block, or fallback), selected by the
same synchronous `try`/`catch` at `components/crew/WrappedSection.tsx:82-84`: 2 states before, 2
after, identical selection condition, no animation or `AnimatePresence` added. All writes introduced
here run in `after()` callbacks, after the response, so they cannot affect rendered state.

---

## 5. The report lookup family stays manual

`BL-ALERT-REPORT-FAMILY-AUTORESOLVE` asks whether the manual-by-design posture is right for the six
report-family incidents. **Answer: yes, for all six.** No code, catalog, or registry change ships for
them. Two auto-resolution designs were drafted and rejected; both are recorded because the reasoning
is the reusable part.

### 5.1 The three that looked resolvable

`REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES` and `REPORT_OPEN_ORPHAN_LABEL` raise
from `handleLookupInconclusive` (`lib/reports/submit.ts:771-819`), reached only when a GitHub lookup
has already thrown `LookupInconclusive`; `lookupAlertCode` (`lib/reports/submit.ts:206-210`) maps the
thrown code to the alert code. A state gate (`upsertStateGatedLookupAlert`,
`lib/reports/submit.ts:662-685`) narrows the raise to reports still locally stuck. The raise
condition is a **conjunction**: (GitHub lookup for key K was inconclusive) AND (report K is still
stuck). Every raised context carries `{ idempotency_key, reason, code }`
(`lib/reports/submit.ts:777-781`).

### 5.2 Rejected design 1 — local anti-join (round 1)

Resolving when no `reports` row for the show still matched the state gate violates clause (b): it
negates only the second conjunct.

- `REPORT_DUPLICATE_LIVE_MATCHES` means multiple live GitHub issues share a marker
  (`lib/github/issues.ts:307-318`). Landing or deleting the local report closes none of them.
- `REPORT_OPEN_ORPHAN_LABEL` means an open GitHub issue carries the orphan-cleanup label
  (`lib/github/issues.ts:244-250`). Local-row absence neither re-closes it nor removes the label.
- `REPORT_LOOKUP_INCONCLUSIVE` covers listing, pagination and validation failures
  (`lib/github/issues.ts:255-322`). Local-row absence does not prove the lookup recovered.

Two further defects killed it independently: unrelated reports for the same show block a recovered
alert from resolving (violating clause (a)); and the claimed 24h handoff to `STALE_ORPHAN_REPORT`
does not hold, because the reaper also requires `processing_lease_until < now()`
(`app/api/cron/report-reaper/route.ts:58-64`) on a nullable column
(`supabase/migrations/20260501001000_internal_and_admin.sql:309-321`) where `NULL < now()` is never
true; the shipped test deliberately retains an aged live-lease report and emits no stale alert
(`tests/reports/reaper.test.ts:105-138`).

### 5.3 Rejected design 2 — resolve on a fresh successful lookup (round 3)

Round 2 observed that a **fresh, complete** lookup for the exact key does satisfy clause (b):
`reconcileBeforeCreate` calls `findIssueByMarker(idempotencyKey, cutoffIso)`
(`lib/reports/submit.ts:880`, `lib/github/issues.ts:255`), which throws for every condition these
codes report, so a normal return negates all three for that key. Combined with the `idempotency_key`
discriminator in context, clauses (a) and (b) are met.

**Clause (c) is not.** Round 3 showed the observation is not repeatable. Once a lookup returns a
match, `writeRecoveredIssueUrl` persists the URL, and every later submission for that key
short-circuits as a duplicate before reaching `findIssueByMarker`
(`lib/reports/submit.ts:1073-1082`). So if GitHub's state changes immediately after the check, a
duplicate appearing or the issue being reopened with the orphan label, the alert has already been
cleared and **nothing will ever look again**. There is no re-raise path and, unlike the tile crash
(§4.8), no independent durable record of the external condition.

A permanent wrong answer with no evidence trail is worse than a stale alert, which is the trade the
parent spec rejected under "TTL auto-expiry" (§9). These codes stay manual.

### 5.4 The three that were never candidates

Unchanged, `event-manual`: `REPORT_ORPHANED_LOST_LEASE` (`lib/reports/submit.ts:977`) records an
external issue closing; `REPORT_LEASE_THRASHING` (`lib/reports/submit.ts:847-848`) records that races
happened; `STALE_ORPHAN_REPORT` (`app/api/cron/report-reaper/route.ts:74`) audits a row the reaper
deleted. None has an observation that re-evaluates its condition.

### 5.5 What ships for this entry

`BL-ALERT-REPORT-FAMILY-AUTORESOLVE` moves to `BACKLOG-archive.md` with a resolved-status line
recording the evaluation, its conclusion, and both rejected designs, so a future session does not
re-derive them. The parent spec's §3 rows for these six codes are correct as written and are not
edited.

---

## 6. Registry and lockstep fan-out

Rounds 1, 2 and 3 each found this section incomplete. Every instance any round enumerated is below,
plus those the author found independently.

### 6.1 `ADMIN_ALERTS_LIFECYCLE` and counts

One reclassification:

| Code                        | Line                                                | From                       | To                            |
| --------------------------- | --------------------------------------------------- | -------------------------- | ----------------------------- |
| `TILE_SERVER_RENDER_FAILED` | `tests/messages/_metaAdminAlertCatalog.test.ts:455` | `state-manual-justified`   | `hybrid` plus `resolveSites`  |

Hybrid codes must carry a `resolveSites` tuple that exists on disk
(`tests/messages/_metaAdminAlertCatalog.test.ts:741-742`).

The live registry is **45** codes: 26 auto, 17 event-manual, 1 hybrid, 1 state-manual-justified, 0
deferred (`tests/messages/_metaAdminAlertCatalog.test.ts:272-280`). Revision 1 carried the parent
spec's stale 42; revision 3 mis-added the existing hybrid. Corrected:

| Class                  | Before | After         |
| ---------------------- | ------ | ------------- |
| auto                   | 26     | 26 (unchanged) |
| event-manual           | 17     | 17 (unchanged) |
| hybrid                 | 1      | **2**          |
| state-manual-justified | 1      | **0**          |

26 + 17 + 2 + 0 = 45. The hybrid assertion
(`tests/messages/_metaAdminAlertCatalog.test.ts:736-739`, currently `.toBe(1)`) moves to 2; the
state-manual-justified expectation goes to 0; the auto assertion at
`tests/messages/_metaAdminAlertCatalog.test.ts:732-734` is **not** edited. The prose docstring at
`tests/messages/_metaAdminAlertCatalog.test.ts:272-280` states these counts and must move in the same
commit.

### 6.2 Producer-scope registry, and the gate a new row activates

- **`_metaAlertProducerScope` needs a new row.** The sweep's `upsertAdminAlert` lands in
  `app/show/[slug]/[shareToken]/_CrewShell.tsx`, and that walker discovers producers under `app/`
  (`tests/adminAlerts/_metaAlertProducerScope.test.ts:26-48`,
  `tests/adminAlerts/_metaAlertProducerScope.test.ts:144-157`). `WrappedSection` was never registered
  because the walker excludes `components/`, so this is a **new** obligation created by the move. Its
  `contextKeys` must declare all four keys the producer writes: `tileId`, `message`, `sheet_name`,
  `viewerKey`.
- **Adding that row activates a dormant gate, which currently fails.** The representative-context
  check runs only for codes that have a producer row
  (`tests/adminAlerts/producerKeyAggregation.test.ts:50-59`). Once
  `hasProducerRow("TILE_SERVER_RENDER_FAILED")` is true, the representative context is checked
  against allowed keys, and the live one is `{ drive_file_id, sheet_name, section }`
  (`tests/adminAlerts/producerContexts.ts:276-280`) while the producer writes
  `{ tileId, message, sheet_name }` today and gains `viewerKey` here. `drive_file_id` and `section`
  become offenders and the suite fails. **The representative context must be corrected to the real
  producer's keys in the same commit.** This is a pre-existing inconsistency the new row exposes.
- **`ADMIN_ALERTS_WRITE_SITES` is NOT repointed.** Its `TILE_SERVER_RENDER_FAILED` row already
  targets `components/shared/TileServerFallback.tsx`
  (`tests/messages/_metaAdminAlertCatalog.test.ts:231-234`), not `WrappedSection`, so §4.5 does not
  break it. That producer still exists in source and still raises, so repointing would unpin what it
  currently guards. The live crew producer is covered by §7.1 instead. Revision 1 asserted the
  opposite and was wrong.
- Revision 1's claim that `tests/adminAlerts/alertProducerScope.registry.ts` holds no rows for these
  codes was **false**: a seed row for `REPORT_LOOKUP_INCONCLUSIVE` exists at
  `tests/adminAlerts/alertProducerScope.registry.ts:406-412`.

### 6.3 `RESOLVE_INTENTS` — do not delete rows

`TILE_SERVER_RENDER_FAILED` keeps its row at `lib/adminAlerts/resolveActionLabel.ts:66`, the report
rows at `lib/adminAlerts/resolveActionLabel.ts:62-64` are untouched, and
`tests/adminAlerts/resolveIntentsBaseline.json` is not edited. Since nothing flips to `auto`, this is
required by completeness as well as by history.

Stated explicitly because it is counterintuitive: the append-only lifecycle gate
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:94-124`) asserts every code in
`origin/main`'s baseline still maps to its historical intent, failing with _"changed or was deleted;
rows already in admin_alerts still render it"_, and its docstring gives the reason
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:12-14`). Completeness
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:27-33`) excludes auto codes but does not
forbid retained entries. Round 1 independently confirmed this reading.

### 6.4 Tests that assert the old ownership or construct sections

Rewritten in the same commit, not merely updated:

| Test                                                          | Why                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `tests/components/crew/wrappedSection.test.tsx:55-160`        | asserts throw renders fallback AND upserts; the upsert leaves                                     |
| `tests/components/crew/wrappedSectionDurability.test.tsx:35-75` | premise inverts (§4.5); durability re-asserted on the sweep in returned-promise form            |
| `tests/components/crew/crewShellTwoDistinctAlerts.test.tsx:110-140` | constructs shell and descendants under the old ownership                                    |
| `tests/messages/_metaEmphasisRenderContract.test.ts:162-170`  | retains the now-false claim that `WrappedSection` produces the alert                              |

**Plus every test that constructs a crew section**, because the ledger prop is required and tests are
typechecked (`tsconfig.json:29-32`). Round 3 enumerated 29 such files beyond `wrappedSection.test.tsx`,
under `tests/components/crew/sections/`, `tests/components/crew/`, and `tests/components/tiles/`. The
plan MUST derive this list mechanically at execution time (a `<SectionName` word-boundary search over
`tests/`) rather than trusting a transcribed list, and `pnpm typecheck` is the completeness oracle. A
shared test helper that builds a ledger and spreads the common props is the intended shape, so the
fan-out is one edit per file rather than one per construction.

### 6.5 Invariant 9

`resolveTileAlertsForObserver` gains a row in the notify infra-contract registry
(`tests/notify/_metaInfraContract.test.ts:6-17`) plus a behavioral test alongside the existing
`resolveAdminAlert` case at `tests/notify/_metaInfraContract.test.ts:177` (returned-error AND
thrown-fault both throw) and the empty-`tileIds` no-call guard (§4.11).

---

## 7. Structural defense

### 7.1 Tile producer topology

New meta-test at `tests/crew/_metaTileProducerTopology.test.ts (new)`, filesystem-walked over
`components/` and `app/` so a new surface fails by default:

1. Every `<WrappedSection` JSX call site lives in `components/crew/sections/`; the set of `tileId`
   literals equals the §4.4 table exactly; each `SectionId` maps to exactly one.
2. **Every production construction site of the seven section components lives in
   `app/show/[slug]/[shareToken]/_CrewShell.tsx`.** Verified true today: a word-boundary search for
   each `<SectionName` outside `tests/` returns only that file. The walk excludes `tests/`, where
   roughly 30 files construct sections directly; that exclusion is sound because a test-only
   construction cannot leak an unswept ledger into production. The word boundary matters:
   `<CrewSection` without it also matches `<CrewSections`, the client controller in
   `components/crew/CrewSections.tsx`. Round 2 showed why assertion 1 alone is insufficient: a caller
   can type-safely pass a throwaway ledger, so bounding _who may construct a section_ is what closes
   the hole.
3. `app/show/[slug]/[shareToken]/_CrewShell.tsx` registers the sweep via `after(`, **returning** the
   sweep promise rather than voiding it (§4.10), and calls `createTileRenderLedger()` exactly once in
   the component body, never inside the callback.
4. `components/crew/WrappedSection.tsx` contains no `upsertAdminAlert` call.
5. `components/shared/WrappedTile.tsx` has no production call site, keeping
   `components/shared/TileServerFallback.tsx`'s producer dormant and its write-site pin honest
   (§6.2).

### 7.2 Behavioral tests

- **T1 — clean set derivation.** `cleanTileIds` returns `attempted` minus `failed`, derived from the
  fixture's own tile set, never a hardcoded list.
- **T2 — message carriage.** A tile throwing `Error("scope projection blew up")` produces a sweep
  upsert whose `context.message` is that exact string.
- **T3 — raise before resolve.** A sweep with one thrown tile and the rest clean leaves exactly one
  open row naming the thrown tile.
- **T4 — the race is self-healing (§4.7).** Replay the interleaving, apply the spurious resolve, then
  run a sweep in which the tile still fails; assert the row is open at the end.
- **T5 — durability.** Capture the `after()` callback, invoke it, and assert it **returns a promise
  that settles after the write completes**, not merely that `after` and the upsert were called. The
  existing immediate-invoke mock (`tests/components/crew/wrappedSectionDurability.test.tsx:22-25`)
  would pass against a voided call, which is the defect round 2 identified.
- **T6 — observer keying (§4.6).** A row raised with `viewerKey` A is NOT resolved by a clean sweep
  with `viewerKey` B for the same `tileId`, and IS resolved by a clean sweep with `viewerKey` A. A
  mutant that drops the `viewerKey` filter must fail this.
- **T7 — the admin sentinel.** A plain-admin render (`viewerId` null) resolves only rows whose
  `viewerKey` is `"admin"`, never a crew member's.

`sweepTileRenderAlerts` is a pure exported function taking the ledger as a parameter (§4.10)
specifically so T1 to T7 need no RSC request scope; round 1 showed Vitest's React build turns `cache`
into a pass-through, which is why the design does not rely on it (§4.3).

---

## 8. Guard conditions and edge cases

| Edge                                            | Behavior                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| non-lead viewer (no Budget entitlement)         | `crew:budget:rows` never enters `attempted`, never in `cleanTileIds`; an open budget-tile alert survives          |
| viewer skips a gated block inside a seam        | that viewer's clean render carries their own `viewerKey`, so it cannot clear a row raised by an observer who does reach it (§4.6) |
| plain admin renders clean                       | resolves only `viewerKey: "admin"` rows                                                                          |
| response aborts mid-render                      | `after()` still runs with a partial `attempted`; only completed tiles resolve                                    |
| tiles A and B both throw in one render          | two upserts hit one row (dedup index); row ends naming the last, `occurrence_count` 2 (existing behavior); neither is in `cleanTileIds` |
| two observers both have failures                | row names the most recent (tileId, viewerKey); only that observer's clean render clears it (§4.6)                 |
| row names (tile T, observer A), today A renders T clean | resolves                                                                                                 |
| row names (tile T, observer A), today B renders T clean | no match; row stays open                                                                                 |
| section renders but its data is empty           | the seam ran without throwing, so the tile is clean and resolvable                                               |
| sweep throws (Supabase outage)                  | caught and logged; crew render unaffected; next healthy request sweeps                                           |
| no request scope (unit test)                    | `after()` throws synchronously; registration skipped, matching the existing shape                                |
| alert already resolved manually                 | the resolve filters `resolved_at IS NULL`; no double-write                                                       |
| auto-resolution stamping                        | sets `resolved_at` only; `resolved_by` stays NULL (`lib/adminAlerts/resolveAdminAlert.ts:33`)                     |

---

## 9. Acceptance criteria

- **AC1** A render where every entitled tile is clean resolves an open row whose `context.tileId` is
  among them AND whose `context.viewerKey` matches the rendering observer. A render where the row's
  tile throws leaves it open and re-raises.
- **AC2** T6: a row raised by observer A is not resolved by observer B's clean render of the same
  tile; dropping the `viewerKey` filter fails the test.
- **AC3** T7: a plain-admin render resolves only `viewerKey: "admin"` rows.
- **AC4** A non-lead render (Budget not entitled) does NOT resolve a row naming `crew:budget:rows`.
  Expectation derived from the fixture's entitlement, not hardcoded.
- **AC5** A ledger with a partial `attempted` set (aborted render) resolves only the tiles in it.
- **AC6** T2: `context.message` on the sweep's upsert equals the thrown error's message.
- **AC7** T4: the §4.7 interleaving ends with the row OPEN after a subsequent failing sweep.
- **AC8** T5: the `after()` callback returns a promise that settles after the write; a voided call
  fails. `WrappedSection` registers no `after()` work on either path.
- **AC9** §7.1 assertion 2 holds: constructing a section outside `_CrewShell.tsx` in production code
  fails the topology test. Separately, omitting the ledger prop is a TypeScript error.
- **AC10** The §7.1 topology test passes and fails when (a) a `<WrappedSection>` is added outside
  `components/crew/sections/`, (b) `WrappedSection.tsx` regains an `upsertAdminAlert` call, (c) the
  sweep registration is removed, (d) `createTileRenderLedger()` moves inside the callback, or (e) the
  sweep promise is voided.
- **AC11** Lifecycle: `TILE_SERVER_RENDER_FAILED` is `hybrid` with a resolve site that exists on
  disk; hybrid 1 to 2; state-manual-justified 1 to 0; auto unchanged at 26; event-manual unchanged at
  17; total 45. The prose docstring at `tests/messages/_metaAdminAlertCatalog.test.ts:272-280`
  matches.
- **AC12** A `PRODUCER_SCOPE` row exists for the `_CrewShell` producer declaring `tileId`, `message`,
  `sheet_name` and `viewerKey`; `tests/adminAlerts/producerContexts.ts:276-280`'s representative
  context is corrected to those keys; `_metaAlertProducerScope` and `producerKeyAggregation` pass.
  `ADMIN_ALERTS_WRITE_SITES` is unchanged and still pins `components/shared/TileServerFallback.tsx`.
- **AC13** Every test file constructing a crew section compiles: the list is derived mechanically
  (§6.4), and `pnpm typecheck` is green.
- **AC14** `resolveTileAlertsForObserver`: empty `tileIds` issues no Supabase call; returned DB error
  throws; thrown query fault throws; infra-contract registry row present.
- **AC15** No catalog `resolution` value changes; no `AUTO_RESOLVE_NOTES` entry is added; no §12.4
  prose is edited. `RESOLVE_INTENTS` and `tests/adminAlerts/resolveIntentsBaseline.json` are
  byte-identical to `origin/main`, and all three layers of
  `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` pass.
- **AC16** No report-family code changes class, catalog `resolution`, or copy; a test guards all six
  classifications against silent drift.
- **AC17** `pnpm test` full suite plus `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green.
- **AC18** Invariant-8 UI gate: `/impeccable critique` AND `/impeccable audit` on the affected diff,
  P0 and P1 findings fixed or deferred via `DEFERRED.md`, BEFORE the whole-diff cross-model review.
- **AC19** **All four** BACKLOG entries move to `BACKLOG-archive.md` with citations:
  `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE` and `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE` (§2),
  `BL-ALERT-REPORT-FAMILY-AUTORESOLVE` (§5.5), and `BL-ALERT-TILE-RENDER-PER-TILE-KEYING` (closed by
  §4). `BACKLOG.md` retains none of the four. The obsolete DEFER rows are removed from
  `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md:96-97` and its §3 class
  counts corrected.

Anti-tautology notes, binding on the plan: every assertion reads `admin_alerts` rows or the ledger
directly, never log output. AC4's entitlement and AC5's partial set derive from fixture state. AC1,
AC2, AC3, AC5 and AC7 assert post-callback row state, not that a function was called. AC2, AC7, AC8
and AC10 each name the mutant that must fail.

---

## 10. What does NOT change

- **No DDL.** `context` is `jsonb`; the new key needs no migration, so no `gen:schema-manifest` regen
  and no validation surgical apply.
- **No catalog change.** No `resolution` value moves, no `AUTO_RESOLVE_NOTES` entry, no §12.4 code
  added or edited. The x1, x2, spec-codes and help-families gates do not move. The manual button
  stays.
- **No report-family change of any kind** (§5).
- **No rendered-output change** (§4.12, §4.13). The invariant-8 gate applies by file location.
- Manual resolve routes untouched; they still stamp `resolved_by`.
- Dedup and occurrence semantics unchanged: resolving then re-raising creates a fresh row.

---

## 11. Alternatives considered

- **Widen the dedup index with per-tile columns** (the literal reading of
  `BL-ALERT-TILE-RENDER-PER-TILE-KEYING`): rejected. It fans out to every raw `ON CONFLICT` producer,
  the upsert RPC, bell grouping, attention items and the identity map, plus a migration, manifest and
  validation cycle, for granularity no consumer reads. `context` keying achieves it at read time.
- **Key on `tileId` alone** (revisions 1 to 3): rejected, §4.6. Permission gates inside the seam mean
  a viewer who skips the failing path would clear another viewer's live alert.
- **React `cache()` for the ledger** (revision 1): rejected, §4.3.
- **Timestamp freshness fence** (revision 2): rejected, §4.7 (cross-clock inversion, and request-start
  is the wrong instant).
- **Local-state anti-join for the report family** (revision 1): rejected, §5.2 (negates one conjunct
  of two).
- **Resolve the report family on a fresh `findIssueByMarker` return** (revision 3): rejected, §5.3.
  It satisfies clauses (a) and (b) but not (c); once a URL persists nothing ever looks again, so a
  wrong answer is permanent with no evidence trail.
- **Flipping the code to `auto`**: rejected, §4.9. Re-detection is observer-driven, so suppressing the
  manual button would strand rows.
- **Global "nothing failed this render" sweep**: rejected. Viewer-gated Budget, abort-time partial
  ledgers, and observer divergence each make it clear live alerts.

---

## 12. Watchpoints (review preempts — do not relitigate)

- **`GITHUB_BOT_LOGIN_MISSING` and `BRANCH_PROTECTION_*` are already auto.** §2, verified twice.
  Branch-protection dormancy is intended; `DEFERRED-archive.md:861` records the re-enable step.
- **The resolve is keyed on `tileId` AND `viewerKey`.** §4.6. `tileId` alone was rejected in round 3.
- **`viewerKey` is an opaque internal UUID or the literal `"admin"`**, never a name or email.
- **There is no timestamp fence, deliberately.** §4.7 gives the two proofs. The residual same-observer
  race is accepted and self-healing, pinned by T4.
- **The report family stays manual.** Both designs are recorded in §5.2 and §5.3 with the clause each
  violates. Re-proposing either repeats a known-unsound design.
- **`TILE_SERVER_RENDER_FAILED` keeps its manual button** (`hybrid`, catalog `resolution: "manual"`).
- **The required ledger prop is not the ownership guarantee**; §7.1 assertion 2 is.
- **`ADMIN_ALERTS_WRITE_SITES` stays pointed at `TileServerFallback.tsx`** (§6.2).
- **The `producerContexts.ts` representative-context edit is required, not incidental** (§6.2).
- **`RESOLVE_INTENTS` rows are retained deliberately** (§6.3).
- **`resolved_by` stays NULL for auto-resolution.** Existing convention.
