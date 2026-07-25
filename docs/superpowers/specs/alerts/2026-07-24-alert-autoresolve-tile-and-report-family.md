# Per-tile keyed tile-render resolution; report family stays manual

**Date:** 2026-07-24 · **Status:** Draft (revision 2, after adversarial round 1)
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)
**Parent spec:** `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` (state-vs-event principle, §2)

Closes four BACKLOG entries. Two are already shipped and need archiving (§2). One is a design
change (§4). One is an evaluation whose answer is **no change** (§5).

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
failing tile of a show, or every stuck report of a show. Resolving that row on *any* instance's
recovery would mask the others.

They do not get the same answer. For tiles, a sound per-instance discriminator exists and the code
already writes it (§4). For the report family, the coarse key is not the real blocker at all — the
raise condition has an external GitHub component that no local observation can negate, so the codes
stay manual (§5). Round 1 of adversarial review is what established the second half; see §5.2.

## 1.1 Resolved scope — do not relitigate

- **`GITHUB_BOT_LOGIN_MISSING` and both `BRANCH_PROTECTION_*` codes are already `class: "auto"`.**
  Verified in the live registry, and independently confirmed in adversarial round 1 (§2). This spec
  archives their BACKLOG entries; it does not re-implement them and must not touch their resolvers.
- **No DDL.** The dedup index is not widened. Per-tile keying uses the `context->>'tileId'` the row
  already carries. Widening `admin_alerts_one_unresolved_idx` would fan out to every raw
  `ON CONFLICT` producer (`lib/reports/submit.ts:653`, `lib/reports/submit.ts:676`,
  `app/api/cron/report-reaper/route.ts:75`), the `upsert_admin_alert` RPC, bell grouping,
  `lib/admin/attentionItems.ts`, and `lib/adminAlerts/alertIdentityMap.ts`, for granularity nothing
  reads. Do not re-propose a schema change.
- **`TILE_SERVER_RENDER_FAILED` becomes `hybrid`, not `auto`.** Catalog `resolution` stays
  `"manual"`; the manual button stays. Rationale §4.8; precedent `ONBOARDING_SHEET_UNREADABLE`
  (`tests/messages/_metaAdminAlertCatalog.test.ts:463-475`).
- **The tile ledger is threaded as an explicit prop, not held in React `cache()`.** Rationale and
  the two review findings that forced it are in §4.3. Do not re-propose an implicit request-scoped
  store.
- **All six report-family codes stay manual.** §5 is the evaluation
  `BL-ALERT-REPORT-FAMILY-AUTORESOLVE` asked for, and its answer is that the current classification
  is correct. Do not re-propose an anti-join resolver.
- **`RESOLVE_INTENTS` rows are never deleted.** §6.3.

---

## 2. Two BACKLOG entries are already satisfied (archive only)

Both claims were verified against live code and re-verified by the round-1 reviewer, which reported:
*"Both 'already shipped' claims were verified: the bot-login resolver is invoked by maintenance
(`lib/notify/runNotify.ts:237-248`), and both branch-protection healthy-path resolvers are wired
(`scripts/verify-branch-protection.ts:361-379`) while their workflows remain intentionally
dormant."*

### 2.1 `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE` — shipped

Promoted DEFER to auto by `docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` §6.

| Claim | Citation |
|---|---|
| Registry class `auto`, two pinned resolve sites | `tests/messages/_metaAdminAlertCatalog.test.ts:493-499` |
| Env-presence predicate `botLoginConfigured` | `lib/reports/botLoginAlert.ts:15` |
| Cron reconcile resolver `resolveBotLoginAlertRow` | `lib/reports/botLoginAlert.ts:45` |
| Invoked by maintenance | `lib/notify/runNotify.ts:237-248` |
| Behavioral tests | `tests/reports/submit.botLoginResolve.test.ts`, `tests/notify/runMaintenance.botLogin.test.ts` |

The deferral's stated blocker (needing live GitHub probes) turned out not to apply: resolution reads
the env directly rather than inferring config health from a submit succeeding.

### 2.2 `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE` — shipped, detector dormant

Promoted by `docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md` D6
(`docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md:30`) and §10
(`docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md:249-253`).

| Claim | Citation |
|---|---|
| Both codes `class: "auto"` with resolve sites | `tests/messages/_metaAdminAlertCatalog.test.ts:502-513` |
| Resolver `defaultResolveAlerts` | `scripts/verify-branch-protection.ts:253` |
| Healthy-path call sites wired | `scripts/verify-branch-protection.ts:361-379` |
| Auto-clear copy | `lib/adminAlerts/audience.ts:118-122` |
| Full provenance including dormancy | `DEFERRED-archive.md:853-862` |

**Residual:** the resolver is dormant in CI. Its producer runs in two `x-audits.yml` jobs that are
both `if: false` under the X6-D-1 solo-dev variant (`.github/workflows/x-audits.yml:443`,
`.github/workflows/x-audits.yml:474`). The bell spec converted ahead of that trigger deliberately, so
this is a tracked residual, not a gap. Re-enable step recorded at `DEFERRED-archive.md:861`.

**Action for both:** move to `BACKLOG-archive.md` with resolved-status lines citing the above,
including the dormancy cross-reference. No code change.

---

## 3. Design principle extension: instance-keyed resolution

The parent spec's §2 answers *whether* a code may auto-resolve. It does not answer *which row* a
recovery observation may clear when one row aggregates many instances. This spec adds that half:

> **Instance-keying rule.** When an alert's dedup key (`show_id`, `code`) is coarser than the
> instance its condition attaches to, a recovery observation may resolve the row ONLY if (a) the
> observation identifies the same instance the row currently names, and (b) the observation is not
> older than the row's most recent raise. Where the row carries a discriminator in `context`, filter
> on it and on `last_seen_at`. Where the raise condition has any conjunct the observation cannot
> re-evaluate, the code stays manual.

Clause (b) exists because of a concurrency defect found in round 1 (§4.6). The final clause is what
disqualifies the report family (§5.2).

---

## 4. `TILE_SERVER_RENDER_FAILED`: per-tile keyed resolution

### 4.1 Why the parent spec deferred it

The parent spec's §3 row reads: *"State-shaped but no aggregation point: tiles render/stream
independently per-request; the open row is deduped per (show, code) with `context.tileId` replaced
on re-raise, so tile A's success cannot prove tile B (which may hold the row) is healthy."*

The second clause is the real constraint and this design honors it. The first clause does not
describe the current code, but the design deliberately does **not** depend on that either way:

- There are **7** `<WrappedSection>` call sites, all synchronous Server Components, one per
  `SectionId` (§4.2). None is `async`; no `Suspense` exists under `app/show/` or `components/crew/`.
- `_CrewShell` server-renders every entitled section body per request
  (`app/show/[slug]/[shareToken]/_CrewShell.tsx:413`); the `<CrewSections>` client controller toggles
  visibility only (`app/show/[slug]/[shareToken]/_CrewShell.tsx:320-325`).
- The crew page is dynamic per request (no `dynamic` or `revalidate` export in
  `app/show/[slug]/[shareToken]/page.tsx`).

A simple "nothing failed this render" sweep would still be **wrong**, for three independent reasons:

1. **Budget is viewer-gated.** `entitled` is `BASE_SECTION_IDS` plus `budget` iff `budgetVisible`
   (`app/show/[slug]/[shareToken]/_CrewShell.tsx:410-412`). A non-lead never renders
   `crew:budget:rows`, so a global sweep would clear a genuine budget-tile alert on every non-lead
   page view.
2. **`after()` runs even on an aborted response.** Next's `after` API reference states the callback
   executes even when the response did not complete successfully (error, `notFound`, `redirect`), so
   a partial ledger is indistinguishable from a clean full render.
3. **Concurrent requests observe different truths.** Two in-flight renders of the same show can
   disagree about a tile; §4.6 handles this.

### 4.2 Tile inventory (exhaustive; pinned by §7.1)

`SectionId` has exactly 7 members (`lib/crew/resolveActiveSection.ts:1`); each section wraps exactly
one throwable block:

| `SectionId` | `tileId` | Call site |
|---|---|---|
| `today` | `crew:today:notes` | `components/crew/sections/TodaySection.tsx:175` |
| `schedule` | `crew:schedule:days` | `components/crew/sections/ScheduleSection.tsx:185` |
| `venue` | `crew:venue:diagrams` | `components/crew/sections/VenueSection.tsx:328` |
| `travel` | `crew:travel:transport` | `components/crew/sections/TravelSection.tsx:163` |
| `crew` | `crew:crew:roster` | `components/crew/sections/CrewSection.tsx:116` |
| `gear` | `crew:gear:scope` | `components/crew/sections/GearSection.tsx:164` |
| `budget` | `crew:budget:rows` | `components/crew/sections/BudgetSection.tsx:67` |

`components/crew/WrappedSection.tsx` has no barrel re-export. Three files mention it in comments
only (`components/shared/CardReportTrigger.tsx:9`, `components/crew/DiagramsBlock.tsx:15`,
`components/crew/SectionTileError.tsx:10`) and are not call sites.

`components/shared/TileServerFallback.tsx:88` is the code's **second** registered producer. Its only
consumer, `components/shared/WrappedTile.tsx:54`, has no production call site (referenced solely by
its own module and tests), so it is dormant. It is out of scope, it keeps its own alert-raising
behavior unchanged, and it is why §6.2 does **not** repoint the write-site registry row.

### 4.3 The tile ledger is an explicit prop

Round 1 raised two findings that share one root cause, and both are fixed by making the ledger
explicit rather than ambient:

- **Tests cannot exercise React's request cache.** Production server `cache()` uses the RSC request
  dispatcher, but the ordinary React build Vitest loads makes `cache()` a pass-through
  (the React build resolved without the `react-server` condition turns `cache` into a pass-through), and `vitest.config.ts:55-70` supplies no
  `react-server` condition. Existing tests call `CrewShell` directly before rendering descendants
  (`tests/components/crew/crewShellTwoDistinctAlerts.test.tsx:110-120`), so shell and sections would
  receive *different* objects — the identity contract would be untestable and unproven in the very
  place it matters.
- **A topology test cannot constrain callers.** A future route could mount `<VenueSection>`
  directly: its `<WrappedSection>` still sits in the approved directory and `_CrewShell` still
  contains a sweep, so every source-pattern assertion passes while a throw silently raises no alert.
  Direct section mounting already happens in tests
  (`tests/components/crew/wrappedSection.test.tsx:105-160`).

An explicit **required** prop closes both structurally: mounting a section without a ledger is a
compile error, and every test constructs the ledger it asserts on.

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

`failed` is a `Map`, not a `Set`: round 1 found that a tileId-only ledger **discards `err.message`**,
which the alert's `context.message` requires (today it exists only as the catch-local `err.message`
at `components/crew/WrappedSection.tsx:84-102`). The sweep runs after the catch has returned, so the
message must be carried, not re-derived.

**Threading.** `_CrewShell` calls `createTileRenderLedger()` once in its body and passes it through
`renderOne` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:332-405`) to each of the 7 sections, which
pass it to `WrappedSection`. The prop is required on both the section props types and
`WrappedSectionProps` (`components/crew/WrappedSection.tsx:52-73`). Sections already receive
`showId`, `data`, `viewer`, `today` and `cardReport`, so this matches existing style.

### 4.4 `WrappedSection` records; it no longer raises

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
when a serverless RSC render freezes. That guarantee now lives in the shell sweep, which is also
`after()`-registered. Its existing pin
(`tests/components/crew/wrappedSectionDurability.test.tsx:35-75`) **inverts**: post-change,
`WrappedSection` registers no `after()` work on either path. An equivalent durability assertion must
be added for the sweep in the same commit, or the guarantee silently loses its only test (§6.4).

### 4.5 The shell sweep

`_CrewShell` captures the render start and the ledger in its body, then registers **one**
unconditional `after()` callback — independent of the existing `TILE_PROJECTION_FETCH_FAILED` branch
at `app/show/[slug]/[shareToken]/_CrewShell.tsx:153-205`, whose `else`-branch placement must not be
reused (its condition is a different observation).

The callback body is a pure exported function so it is testable without an RSC scope:

```ts
export async function sweepTileRenderAlerts(
  ledger: TileRenderLedger,
  args: { showId: string | null; sheetName: string | null; observedAt: string },
): Promise<void>;
```

Order inside it:

1. **Raise** — for each `[tileId, message]` in `ledger.failed`, `await upsertAdminAlert({ showId,
   code: "TILE_SERVER_RENDER_FAILED", context: { tileId, message, sheet_name } })`, preserving
   today's context shape (`components/crew/WrappedSection.tsx:98-102`).
2. **Resolve** — `await resolveTileRenderAlertsForTiles({ showId, tileIds: cleanTileIds(ledger),
   observedAt })`.

Error posture: fail-quiet with its own log code, matching the adjacent projection raise and resolve
(`app/show/[slug]/[shareToken]/_CrewShell.tsx:172-178`,
`app/show/[slug]/[shareToken]/_CrewShell.tsx:186-193`). Registration is wrapped in the same
`try { after(...) } catch {}` shape already used at
`app/show/[slug]/[shareToken]/_CrewShell.tsx:200-204`, because `after()` throws synchronously outside
a request scope; skipping is safe because the next healthy request sweeps.

### 4.6 The freshness guard (round-1 BLOCKING fix)

Raise-before-resolve orders one callback. It does **not** order two concurrent requests, and round 1
supplied the interleaving that breaks a tileId-only match:

1. R1 renders: A failed, B clean. R2 renders: A clean, B failed.
2. R1 raises A; the row's context becomes A.
3. R2 raises B; the same row is retargeted, context becomes B.
4. R2 resolves its clean set `[A]`; the row says B, so no match. Correct no-op.
5. R1 resolves its clean set `[B]`; the row says B, so it **matches and clears** — despite R2 having
   just observed B failing.

An older clean observation can clear a newer failure for the same tile. The fix is clause (b) of the
instance-keying rule: the resolve additionally requires the row to have gone untouched since the
observing render began.

`_CrewShell` captures `observedAt` (an ISO timestamp) in its body, **before** any section renders.
The resolve filters `last_seen_at < observedAt` alongside the tileId match. Every raise sets
`last_seen_at = now()`, so in the interleaving above R2's step-3 raise pushes `last_seen_at` past
R1's `observedAt` and step 5 correctly no-ops. A row raised before the render began still resolves,
which is the intended case.

This is why §7.2 T4 exists: the guard is invisible in normal single-request behavior and only a
concurrency test pins it.

### 4.7 The resolve helper

`resolveTileRenderAlertsForTiles`, new at `lib/adminAlerts/resolveTileRenderAlerts.ts (new)`:

- filters `code = 'TILE_SERVER_RENDER_FAILED'`, `resolved_at IS NULL`, the show
  (`.eq`/`.is` on `show_id` as `resolveAdminAlert` does at
  `lib/adminAlerts/resolveAdminAlert.ts:37`), `context->>'tileId'` in `tileIds`, and
  `last_seen_at < observedAt`;
- sets `resolved_at` only, leaving `resolved_by` NULL;
- returns early with no Supabase call when `tileIds` is empty, mirroring `resolveAdminAlerts`'
  guard (`lib/adminAlerts/resolveAdminAlert.ts:57`);
- destructures `{ data, error }` and throws on a returned error, mirroring
  `lib/adminAlerts/resolveAdminAlert.ts:51-68` (invariant 9).

`TILE_SERVER_RENDER_FAILED` IS in the `AdminAlertCode` union
(`lib/adminAlerts/upsertAdminAlert.ts:29`) and is not inbox-routed, so unlike the report codes it
needs no raw-SQL escape hatch.

### 4.8 Classification: `hybrid`, and the button stays

`TILE_SERVER_RENDER_FAILED` moves `state-manual-justified` to `hybrid`
(`tests/messages/_metaAdminAlertCatalog.test.ts:455`), with one `resolveSites` row.

Catalog `resolution` stays `"manual"` (`lib/messages/catalog.ts:2424`), so `AUTO_RESOLVING_CODES`
(`lib/adminAlerts/audience.ts:53-55`) does not gain it and the manual button survives. **Why:**
re-detection requires a crew page view, which for an idle show could be days away, so removing the
only manual clear path would strand the row. Same shape as `ONBOARDING_SHEET_UNREADABLE`, whose
registry row documents it: *"self-clears via the clean-scan + cron heal observers, while the manual
Resolve button legitimately stays"* (`tests/messages/_metaAdminAlertCatalog.test.ts:460-462`), with
its intent row at `lib/adminAlerts/resolveActionLabel.ts:68` exactly as this code's is at
`lib/adminAlerts/resolveActionLabel.ts:66`.

Consequences: no `AUTO_RESOLVE_NOTES` entry, no §12.4 lockstep, and no change to
`tests/admin/resolveAutoCodeGuard.test.ts:22`, which pins this code as manual health and stays true.

### 4.9 Dimensional Invariants

**None. No rendered element is added, removed, or resized.**

Two UI-surface files are edited (`app/show/[slug]/[shareToken]/_CrewShell.tsx`,
`components/crew/WrappedSection.tsx`) plus a prop added to the 7 section components, which is what
makes this a UI spec by the invariant-8 location rule and pulls in the impeccable dual-gate (AC13).
No edit touches JSX output: `WrappedSection` returns `render()`'s output or
`fallback ?? <TileErrorFallback />` (`components/crew/WrappedSection.tsx:123`) exactly as today, and
`_CrewShell`'s returned tree (`app/show/[slug]/[shareToken]/_CrewShell.tsx:417` onward) is untouched.
No fixed-dimension parent to flex or grid child relationship is created, removed, or altered.

### 4.10 Transition Inventory

**None. No component gains, loses, or changes a visual state.**

`WrappedSection` keeps exactly its two render outcomes (wrapped block, or fallback), selected by the
same synchronous `try`/`catch` at `components/crew/WrappedSection.tsx:82-84`: 2 states before, 2
after, identical selection condition, no animation or `AnimatePresence` added. The single state pair
is instant today and stays instant. All writes introduced here run in `after()` callbacks, after the
response, and so cannot affect rendered state at all.

---

## 5. `BL-ALERT-REPORT-FAMILY-AUTORESOLVE`: evaluation, and why nothing changes

The backlog entry asks to *evaluate the manual-by-design posture* for the six report-family
incidents. This section is that evaluation. **Conclusion: the existing `event-manual` classification
is correct for all six.** No code, catalog, or registry change ships for them.

### 5.1 What was proposed and tested

Revision 1 of this spec proposed moving three codes — `REPORT_LOOKUP_INCONCLUSIVE`,
`REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL` — to `auto`, resolved by an anti-join
over the raise predicate. The reasoning was that all three raise through
`upsertStateGatedLookupAlert` (`lib/reports/submit.ts:662-685`), whose insert is `SELECT`-gated on a
live, show-scoped predicate over `reports`, making the condition look like observable local state.

### 5.2 Why that is unsound (adversarial round 1, BLOCKING)

**The local gate is only one conjunct of the raise condition.** These alerts are raised from
`handleLookupInconclusive` (`lib/reports/submit.ts:771-819`), which is reached only when a GitHub
lookup has *already* returned a `LookupInconclusive` result. The state gate then narrows that to
reports still genuinely stuck. Negating the local gate therefore negates half the condition and
leaves the GitHub half unobserved:

- `REPORT_DUPLICATE_LIVE_MATCHES` means multiple live GitHub issues carry one report's marker
  (`lib/github/issues.ts:307-318`). Deleting or landing the local report closes none of them.
- `REPORT_OPEN_ORPHAN_LABEL` means an open GitHub issue carries the orphan-cleanup label
  (`lib/github/issues.ts:244-250`). Local-row absence neither re-closes it nor removes the label.
- `REPORT_LOOKUP_INCONCLUSIVE` means a listing, pagination, or response-validation failure
  (`lib/github/issues.ts:255-322`). Local-row absence does not prove the lookup recovered.

Concrete failure: an orphan-labeled issue stays open past 24h; the anti-join resolves its alert and,
because the flip to `auto` also suppresses the manual button, the operator loses both the signal and
the control while the required action is still outstanding. That is strictly worse than a stale
alert — the exact trade the parent spec rejected under "TTL auto-expiry" (§9).

Two further defects in the same proposal, each independently disqualifying:

- **Unrelated reports strand a recovered alert.** The anti-join clears a code only when no report for
  the show matches the *generic* gate, so an unrelated lease-expired report B blocks report A's
  alert from resolving even though B never produced that code. Global (`show_id IS NULL`) rows are
  blocked by any eligible report anywhere. This contradicts the instance-keying rule in §3.
- **The claimed 24h handoff does not hold.** The raise gate stops matching at 24h
  (`lib/reports/submit.ts:669-675`), but the reaper additionally requires
  `processing_lease_until < now()` (`app/api/cron/report-reaper/route.ts:58-64`), and
  `processing_lease_until` is nullable (`supabase/migrations/20260501001000_internal_and_admin.sql:309-321`)
  where `NULL < now()` is never true. The shipped test deliberately retains an aged report with a
  live lease and emits no stale alert (`tests/reports/reaper.test.ts:105-138`). So an aged report
  with a live or NULL lease would lose its lookup alert while never receiving the
  `STALE_ORPHAN_REPORT` that was supposed to carry the signal forward.

### 5.3 The general rule this establishes

The instance-keying rule's final clause (§3) is the durable lesson: **where the raise condition has
any conjunct the recovery observation cannot re-evaluate, the code stays manual.** A state-shaped
*local* gate is not sufficient evidence that a code is state-shaped overall. For these three codes
the missing conjunct is external GitHub state, and the only sound observation would be a fresh
successful lookup for that specific report — which the report pipeline performs only on a submit or
recovery attempt, not on a schedule, and which would still resolve a per-show row from a per-report
observation.

The other three codes were never candidates and are unchanged: `REPORT_ORPHANED_LOST_LEASE`
(`lib/reports/submit.ts:977`) records an external issue closing; `REPORT_LEASE_THRASHING`
(`lib/reports/submit.ts:847-848`) records that races happened; `STALE_ORPHAN_REPORT`
(`app/api/cron/report-reaper/route.ts:74`) audits a row the reaper just deleted.

### 5.4 What ships for this entry

`BACKLOG.md`'s `BL-ALERT-REPORT-FAMILY-AUTORESOLVE` moves to `BACKLOG-archive.md` with a
resolved-status line recording the evaluation, its conclusion, and the three findings above, so a
future session does not re-derive the anti-join and re-discover its unsoundness. The parent spec's
§3 rows for these six codes are correct as written and are not edited.

---

## 6. Registry and lockstep fan-out

Round 1 found this section incomplete in revision 1; the items below incorporate every instance it
enumerated, plus two the spec author found independently.

### 6.1 `ADMIN_ALERTS_LIFECYCLE` and counts

One reclassification only:

| Code | Line | From | To |
|---|---|---|---|
| `TILE_SERVER_RENDER_FAILED` | `tests/messages/_metaAdminAlertCatalog.test.ts:455` | `state-manual-justified` | `hybrid` plus `resolveSites` |

The live registry is **45** codes: 26 auto, 17 event-manual, 1 hybrid, 1 state-manual-justified,
0 deferred (`tests/messages/_metaAdminAlertCatalog.test.ts:272-280`). Revision 1 carried the parent
spec's stale 42 and mis-derived the event-manual count; the corrected post-change totals are:

| Class | Before | After |
|---|---|---|
| auto | 26 | 26 (unchanged) |
| event-manual | 17 | 17 (unchanged) |
| hybrid | 1 | **2** |
| state-manual-justified | 1 | **0** |

Total stays 45. Only the hybrid assertion
(`tests/messages/_metaAdminAlertCatalog.test.ts:736-739`, currently `.toBe(1)`) and the
state-manual-justified expectation move; the auto count assertion at
`tests/messages/_metaAdminAlertCatalog.test.ts:732-734` is **not** edited. Hybrid codes must carry a
`resolveSites` tuple that exists on disk (`tests/messages/_metaAdminAlertCatalog.test.ts:741-742`).

### 6.2 Producer-scope registry and the write-site pin

- **`_metaAlertProducerScope` needs a new row.** The sweep's `upsertAdminAlert` lands in
  `app/show/[slug]/[shareToken]/_CrewShell.tsx`, and that walker discovers producers under `app/`
  (`tests/adminAlerts/_metaAlertProducerScope.test.ts:26-48`, `tests/adminAlerts/_metaAlertProducerScope.test.ts:144-157`). `WrappedSection` was never
  registered because the walker excludes `components/`, so this is a **new** registry obligation
  created by the move, not a relocation. A `PRODUCER_SCOPE` row for the new site is required.
- Revision 1's claim that `tests/adminAlerts/alertProducerScope.registry.ts` holds no rows for these
  codes was **false**: a seed row for `REPORT_LOOKUP_INCONCLUSIVE` exists at
  `tests/adminAlerts/alertProducerScope.registry.ts:406-412`.
- **`ADMIN_ALERTS_WRITE_SITES` is NOT repointed.** Its `TILE_SERVER_RENDER_FAILED` row already
  targets `components/shared/TileServerFallback.tsx`
  (`tests/messages/_metaAdminAlertCatalog.test.ts:231-234`), not `WrappedSection`, so §4.4 does not
  break it. That producer still exists and still raises, so repointing the row would stop pinning
  what it currently guards. The live crew producer is covered by §7.1 instead. Revision 1 asserted
  the opposite and was wrong.

### 6.3 `RESOLVE_INTENTS` — do not delete rows

`TILE_SERVER_RENDER_FAILED` keeps its row at `lib/adminAlerts/resolveActionLabel.ts:66`, and
`tests/adminAlerts/resolveIntentsBaseline.json` is not edited. With the report codes staying manual,
their rows at `lib/adminAlerts/resolveActionLabel.ts:62-64` are likewise untouched.

Stated explicitly because it is counterintuitive: the append-only lifecycle gate
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:94-124`) asserts every code in
`origin/main`'s baseline still maps to its historical intent, failing with *"changed or was deleted;
rows already in admin_alerts still render it"*, and its docstring gives the reason
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:12-14`): stored rows persist and would
silently re-label. Completeness (`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:27-33`) excludes auto codes but does not forbid retained entries.
Round 1 independently confirmed this reading.

### 6.4 Tests that assert the old ownership

Each must be rewritten in the same commit, not merely updated:

| Test | Why it moves |
|---|---|
| `tests/components/crew/wrappedSection.test.tsx:55-160` | asserts throw renders fallback AND upserts; the upsert leaves |
| `tests/components/crew/wrappedSectionDurability.test.tsx:35-75` | premise inverts — `WrappedSection` registers no `after()` at all; the durability assertion must be re-established on the sweep |
| `tests/components/crew/crewShellTwoDistinctAlerts.test.tsx:110-140` | constructs shell and descendants under the old ownership |
| `tests/messages/_metaEmphasisRenderContract.test.ts:162-170` | retains the now-false claim that `WrappedSection` produces the alert |

### 6.5 Invariant 9

`resolveTileRenderAlertsForTiles` gains a row in the notify infra-contract registry
(`tests/notify/_metaInfraContract.test.ts:6-17`) plus a behavioral test alongside the existing
`resolveAdminAlert` case at `tests/notify/_metaInfraContract.test.ts:177` — returned-error AND
thrown-fault both throw — and the empty-`tileIds` no-call guard (§4.7).

---

## 7. Structural defense

### 7.1 Tile producer topology

New meta-test at `tests/crew/_metaTileProducerTopology.test.ts (new)`, filesystem-walked over
`components/` and `app/` so a new surface fails by default:

1. Every `<WrappedSection` JSX call site lives in `components/crew/sections/`; the set of `tileId`
   literals equals the §4.2 table exactly; each `SectionId` maps to exactly one.
2. `app/show/[slug]/[shareToken]/_CrewShell.tsx` registers the sweep via `after(`, referencing
   `sweepTileRenderAlerts`, and calls `createTileRenderLedger()` exactly once in the component body
   (never inside the callback).
3. `components/crew/WrappedSection.tsx` contains no `upsertAdminAlert` call, so the raise lives in
   exactly one layer.
4. `components/shared/WrappedTile.tsx` has no production call site, keeping
   `components/shared/TileServerFallback.tsx`'s producer dormant and its write-site pin honest
   (§6.2).

Assertion 1 plus the required-prop type (§4.3) is what replaces `WrappedSection`'s lost
self-containment: the meta-test bounds where wrappers live, and the type bounds who may mount a
section.

### 7.2 Behavioral tests

- **T1 — clean set derivation.** `cleanTileIds` returns `attempted` minus `failed`, derived from the
  fixture's own tile set, never a hardcoded list.
- **T2 — message carriage.** A tile throwing `Error("scope projection blew up")` produces a sweep
  upsert whose `context.message` is that exact string, proving the ledger carries it past the catch.
- **T3 — raise before resolve.** A sweep with one thrown tile and the rest clean leaves exactly one
  open row naming the thrown tile.
- **T4 — the freshness guard.** Replay the §4.6 interleaving: build R1's ledger (A failed, B clean)
  and R2's (A clean, B failed), run R2's sweep fully, then run R1's resolve with R1's earlier
  `observedAt`. The row must survive. A mutant that drops the `last_seen_at` filter must fail this.
- **T5 — durability.** The sweep is registered through `after()`, not fire-and-forget, replacing the
  assertion lost from `wrappedSectionDurability` (§6.4). Reuses the existing `vi.hoisted` +
  `vi.mock("next/server")` pattern (`tests/components/crew/wrappedSectionDurability.test.tsx:17-33`).

`sweepTileRenderAlerts` is a pure exported function taking the ledger as a parameter (§4.5)
specifically so T1 to T5 need no RSC request scope — the review showed Vitest's React build makes
`cache()` a pass-through, which is why the design does not rely on it at all (§4.3).

---

## 8. Guard conditions and edge cases

| Edge | Behavior |
|---|---|
| non-lead viewer (no Budget entitlement) | `crew:budget:rows` never enters `attempted`, never in `cleanTileIds`; an open budget-tile alert survives |
| response aborts mid-render | `after()` still runs with a partial `attempted`; only completed tiles resolve |
| tiles A and B both throw | two upserts hit one row (dedup index); row ends naming the last, `occurrence_count` 2 — existing behavior; neither is in `cleanTileIds` |
| row names A (yesterday), today A clean and B throws | raise retargets context to B; resolve excludes B; row survives naming B |
| row names A, today everything clean | A is in `cleanTileIds` and `last_seen_at` predates `observedAt`; row resolves |
| concurrent renders disagree about a tile | freshness guard rejects the stale resolve (§4.6, T4) |
| section renders but its data is empty | the seam ran without throwing, so the tile is clean and resolvable — nothing is broken |
| sweep throws (Supabase outage) | caught and logged; crew render unaffected; next healthy request sweeps |
| no request scope (unit test) | `after()` throws synchronously; registration skipped, matching the existing shape in `_CrewShell` |
| alert already resolved manually | the resolve filters `resolved_at IS NULL`; no double-write |
| auto-resolution stamping | sets `resolved_at` only; `resolved_by` stays NULL (`lib/adminAlerts/resolveAdminAlert.ts:33`) |

---

## 9. Acceptance criteria

- **AC1** A crew render where every entitled tile renders clean resolves an open
  `TILE_SERVER_RENDER_FAILED` row whose `context.tileId` is among them. A render where the row's tile
  throws leaves it open and re-raises.
- **AC2** A non-lead render (Budget not entitled) does NOT resolve a row naming `crew:budget:rows`.
  Expectation derived from the fixture's entitlement, not hardcoded.
- **AC3** A ledger with a partial `attempted` set (aborted render) resolves only the tiles in it.
- **AC4** T2: `context.message` on the sweep's upsert equals the thrown error's message.
- **AC5** T4: the §4.6 interleaving leaves the row open; removing the `last_seen_at` filter fails it.
- **AC6** T5: the sweep is `after()`-registered; `WrappedSection` registers no `after()` work on
  either path.
- **AC7** Mounting a crew section without a ledger prop is a TypeScript error (`pnpm typecheck`
  fails), proving §4.3's structural claim.
- **AC8** The §7.1 topology test passes and fails when (a) a `<WrappedSection>` is added outside
  `components/crew/sections/`, (b) `WrappedSection.tsx` regains an `upsertAdminAlert` call, (c) the
  sweep registration is removed, or (d) `createTileRenderLedger()` is called inside the callback.
- **AC9** Lifecycle: `TILE_SERVER_RENDER_FAILED` is `hybrid` with a resolve site that exists on disk;
  hybrid count 1 to 2; state-manual-justified 1 to 0; auto count assertion unchanged at 26; total 45.
- **AC10** A `PRODUCER_SCOPE` row exists for the new `_CrewShell` producer and
  `_metaAlertProducerScope` passes; `ADMIN_ALERTS_WRITE_SITES` is unchanged and still pins
  `components/shared/TileServerFallback.tsx`.
- **AC11** All four tests in §6.4 are rewritten and green.
- **AC12** `resolveTileRenderAlertsForTiles`: empty `tileIds` issues no Supabase call; returned DB
  error throws; thrown query fault throws; infra-contract registry row present.
- **AC13** `RESOLVE_INTENTS` and `tests/adminAlerts/resolveIntentsBaseline.json` are byte-identical
  to `origin/main`; all three layers of `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` pass.
- **AC14** No report-family code changes class, catalog `resolution`, or copy. A test asserting the
  six codes' current classification guards the §5 conclusion against silent drift.
- **AC15** `pnpm test` full suite plus `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green.
- **AC16** Invariant-8 UI gate: `/impeccable critique` AND `/impeccable audit` on the affected diff,
  P0 and P1 findings fixed or deferred via `DEFERRED.md`, BEFORE the whole-diff cross-model review.
- **AC17** All three BACKLOG entries (§2.1, §2.2, §5.4) moved to `BACKLOG-archive.md` with their
  citations; the obsolete DEFER rows removed from
  `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md:96-97`, and its §3 class
  counts corrected.

Anti-tautology notes, binding on the plan: every assertion reads `admin_alerts` rows or the ledger
directly, never log output. AC2's entitlement and AC3's partial set derive from fixture state. AC3
and AC5 assert post-callback row identity, not that a function was called. AC5 and AC8 each name the
mutant that must fail.

---

## 10. What does NOT change

- **No DDL.** No migration, so no `gen:schema-manifest` regen and no validation surgical apply.
- **No §12.4 codes added or edited, no catalog rows, no user-visible copy.** The x1, x2, spec-codes
  and help-families gates do not move. No `AUTO_RESOLVE_NOTES` entry (the code stays `manual`).
- **No report-family change of any kind** (§5).
- **No rendered-output change** (§4.9, §4.10). The invariant-8 gate applies by file location.
- Manual resolve routes untouched; they still stamp `resolved_by`.
- Dedup and occurrence semantics unchanged: resolving then re-raising creates a fresh row.

---

## 11. Alternatives considered

- **Widen the dedup index with a per-tile discriminator column** (the literal reading of
  `BL-ALERT-TILE-RENDER-PER-TILE-KEYING`): rejected. It fans out to every raw `ON CONFLICT` producer,
  the upsert RPC, bell grouping, attention items and the identity map, plus a migration, manifest and
  validation cycle, for granularity no consumer reads. Filtering the `context.tileId` the row already
  carries achieves the same keying at read time.
- **React `cache()` for the ledger** (revision 1): rejected on two round-1 findings — Vitest's React
  build makes `cache()` a pass-through so the identity contract is untestable, and an ambient store
  cannot make direct section mounting a compile error (§4.3).
- **Global "nothing failed this render" sweep**: rejected. Viewer-gated Budget, abort-time partial
  ledgers, and concurrent disagreement each make it clear live alerts (§4.1).
- **Keeping the raise in `WrappedSection` with a trailing sentinel component**: rejected. It encodes
  the ordering requirement as an invisible render-order dependency.
- **tileId match without a freshness guard** (revision 1): rejected, §4.6.
- **Anti-join auto-resolution for the report family** (revision 1): rejected, §5.2. This is the
  evaluation the backlog entry asked for, not a deferral.
- **A central reconciler cron for tiles**: rejected for the parent spec's reason (§9) — the condition
  is only observable at render time.

---

## 12. Watchpoints (review preempts — do not relitigate)

- **`GITHUB_BOT_LOGIN_MISSING` and `BRANCH_PROTECTION_*` are already auto.** §2, verified twice.
  Their BACKLOG entries were stale, not open work.
- **Branch-protection dormancy is intended.** `DEFERRED-archive.md:861` records the re-enable step.
- **The report family stays manual, and §5 is the deliverable for its backlog entry.** The anti-join
  was designed, reviewed, and rejected on evidence (§5.2). Re-proposing it without re-observing the
  GitHub conjunct repeats a known-unsound design.
- **The ledger is an explicit prop, deliberately.** §4.3. Do not re-propose `cache()` or any ambient
  request store.
- **The freshness guard is required, not defensive.** §4.6 gives the concrete interleaving.
- **`TILE_SERVER_RENDER_FAILED` keeps its manual button** (`hybrid`, catalog `resolution: "manual"`).
- **`ADMIN_ALERTS_WRITE_SITES` stays pointed at `TileServerFallback.tsx`** (§6.2). That producer is
  dormant but live in source, and repointing would unpin it.
- **`RESOLVE_INTENTS` rows are retained deliberately** (§6.3).
- **`resolved_by` stays NULL for auto-resolution.** Existing convention.
