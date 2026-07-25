# Instance-keyed alert resolution: crew tiles and the report lookup family

**Date:** 2026-07-24 · **Status:** Draft (revision 3, after adversarial round 2)
**Master spec:** `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §4.6 (alert workflow), §12.4 (codes)
**Parent spec:** `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` (state-vs-event principle, §2)

Closes four BACKLOG entries. Two are already shipped and need archiving (§2). Two are design
changes that apply one shared rule (§3) to two families: crew tiles (§4) and the report lookup
family (§5).

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

Both get the same answer, reached by different routes. Each family's alert row already carries a
per-instance discriminator in `context` — `tileId` for tiles, `idempotency_key` for report lookups —
and each has a point in the code where the system observes that exact instance recovering. Resolution
is keyed to the discriminator and gated on an observation that re-evaluates the *whole* raise
condition, not part of it. Two adversarial rounds shaped this: round 1 killed a local-state anti-join
for the report family (§5.2), and round 2 found the observation that actually is sound (§5.3).

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
- **The report lookup family resolves ONLY at a fresh successful `findIssueByMarker` return, keyed
  on `idempotency_key`.** The local-state anti-join and the report-reaper cron backstop were designed
  and rejected on evidence in round 1 (§5.2). Do not re-propose either.
- **All four resolving codes are `hybrid`, none becomes `auto`.** Catalog `resolution` stays
  `"manual"` for every one of them, so every manual button stays and no `AUTO_RESOLVE_NOTES` entry is
  added. Rationale §4.8 and §5.5.
- **There is no timestamp freshness fence.** Round 2 showed one cannot be made sound across the app
  and DB clocks (§4.6). The concurrent-render race is an accepted, self-healing trade-off, pinned by
  a test. Do not re-propose an `observedAt` comparison.
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
> instance its condition attaches to, a recovery observation may resolve the row ONLY if:
>
> (a) **Same instance.** The observation identifies the instance the row currently names. Filter on
> the discriminator the row already carries in `context`.
>
> (b) **Whole condition.** The observation re-evaluates *every* conjunct of the raise condition. A
> state-shaped local gate is not evidence that a code is state-shaped overall — if any conjunct is
> external (another system's state), only an observation that re-checks that system qualifies.
>
> (c) **Self-healing under races.** Because concurrent observers cannot be totally ordered (§4.6),
> the raise path must restore the alert on the next observation. A resolution that could be
> spuriously applied is acceptable only where the condition, if still true, re-raises itself.

Clause (b) is what killed the report family's first design (§5.2) and what licenses its second
(§5.3). Clause (c) replaces the timestamp fence that round 2 disproved (§4.6).

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

An explicit **required** prop removes the silent-omission variant: mounting a section without a
ledger is a compile error, and every test constructs the ledger it asserts on. It does **not** by
itself guarantee the section shares the shell's swept ledger — a caller can type-safely pass a
throwaway one. That residual hole is closed by §7.1 assertion 2, which bounds where section
components may be constructed at all. Round 2 caught the overclaim; the two defenses are stated
separately here so neither is mistaken for the other.

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

`_CrewShell` creates the ledger in its body, then registers **one** unconditional `after()` callback — independent of the existing `TILE_PROJECTION_FETCH_FAILED` branch
at `app/show/[slug]/[shareToken]/_CrewShell.tsx:153-205`, whose `else`-branch placement must not be
reused (its condition is a different observation).

The callback body is a pure exported function so it is testable without an RSC scope:

```ts
export async function sweepTileRenderAlerts(
  ledger: TileRenderLedger,
  args: { showId: string | null; sheetName: string | null },
): Promise<void>;
```

Order inside it:

1. **Raise** — for each `[tileId, message]` in `ledger.failed`, `await upsertAdminAlert({ showId,
   code: "TILE_SERVER_RENDER_FAILED", context: { tileId, message, sheet_name } })`, preserving
   today's context shape (`components/crew/WrappedSection.tsx:98-102`).
2. **Resolve** — `await resolveAlertsByContextKey({ code: "TILE_SERVER_RENDER_FAILED", showId,
   contextKey: "tileId", values: cleanTileIds(ledger) })`.

The callback MUST **return** the sweep promise (`after(() => sweepTileRenderAlerts(...))`), never
`after(() => { void sweepTileRenderAlerts(...) })`. A voided call returns before the write settles,
so the runtime's keep-alive has nothing to wait on and a serverless freeze can still drop the row —
which is the exact failure the `after()` wiring exists to prevent (§4.4). T5 asserts the returned
promise, not merely that `after` was called.

Error posture: fail-quiet with its own log code, matching the adjacent projection raise and resolve
(`app/show/[slug]/[shareToken]/_CrewShell.tsx:172-178`,
`app/show/[slug]/[shareToken]/_CrewShell.tsx:186-193`). Registration is wrapped in the same
`try { after(...) } catch {}` shape already used at
`app/show/[slug]/[shareToken]/_CrewShell.tsx:200-204`, because `after()` throws synchronously outside
a request scope; skipping is safe because the next healthy request sweeps.

### 4.6 The concurrent-render race: accepted and self-healing

Raise-before-resolve orders one callback. It does **not** order two concurrent requests. Round 1
supplied the interleaving:

1. R1 renders: A failed, B clean. R2 renders: A clean, B failed.
2. R1 raises A; the row's context becomes A.
3. R2 raises B; the same row is retargeted, context becomes B.
4. R2 resolves its clean set `[A]`; the row says B, so no match. Correct no-op.
5. R1 resolves its clean set `[B]`; the row says B, so it **matches and clears** — despite R2 having
   just observed B failing.

**Revision 2 proposed a timestamp fence (`last_seen_at < observedAt`). Round 2 disproved it, and no
repair exists.** Two independent defects:

- **Cross-clock comparison.** `observedAt` would come from the application clock while
  `last_seen_at` is written by Postgres `now()`
  (`supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:47`). An app instance
  running 20 seconds fast records `observedAt = 12:00:20`; R2's raise then writes
  `last_seen_at = 12:00:05` on the DB clock; R1 sees `12:00:05 < 12:00:20` and clears the failure R2
  just raised. The fence does not merely fail to help, it can invert.
- **Request start is the wrong instant.** `observedAt` is captured before any section renders, but
  the observation it stands for happens when each tile completes. R1 starts at T0, stalls, and
  renders B clean at T30; a whole R2 cycle observes B failing and raises at T10. R1's observation is
  genuinely newer, yet its fence is T0, so the row stays open. With no later page view the recovered
  row is stranded indefinitely, contradicting AC1.

Fixing both would require a DB-stamped timestamp per tile at the moment that tile completes — a
write per tile on the render path, which is not acceptable for an observability signal.

**Resolution: accept the race, per instance-keying rule clause (c).** The window is one render cycle
and it closes itself: a tile that is genuinely broken throws on *every* render that includes it, so
the next crew page view re-raises the alert in its own sweep. A spurious resolve costs one
transiently-cleared row; it cannot hide a persistent failure. History is preserved in the resolved
row (`occurrence_count`, `last_seen_at`), and the manual button remains (§4.8).

This is the same posture the parent spec already ratified for `WEBHOOK_TOKEN_INVALID`, whose §S5
accepted trade-off reasons identically: the failure mode the alert exists for cannot be masked,
because it keeps producing the raise condition.

The trade-off is **pinned, not merely asserted** — T4 (§7.2) replays the interleaving, applies the
spurious resolve, then runs a subsequent sweep in which the tile still fails and asserts the row is
back open. A design that stopped re-raising would fail it.

### 4.7 The resolve helper

`resolveAlertsByContextKey`, new at `lib/adminAlerts/resolveAlertsByContextKey.ts (new)`, is shared
by both families (§5.4) because the operation is identical apart from the discriminator:

- filters `code`, `resolved_at IS NULL`, the show (`.eq`/`.is` on `show_id` as `resolveAdminAlert`
  does at `lib/adminAlerts/resolveAdminAlert.ts:37`), and `context->><key>` in the supplied values;
- sets `resolved_at` only, leaving `resolved_by` NULL;
- returns early with no Supabase call when the value list is empty, mirroring `resolveAdminAlerts`'
  guard (`lib/adminAlerts/resolveAdminAlert.ts:57`);
- destructures `{ data, error }` and throws on a returned error, mirroring
  `lib/adminAlerts/resolveAdminAlert.ts:51-68` (invariant 9).

`TILE_SERVER_RENDER_FAILED` is in the `AdminAlertCode` union
(`lib/adminAlerts/upsertAdminAlert.ts:29`) and is not inbox-routed. The three report codes are NOT in
that union (they are registered NON_UPSERT raw producers,
`tests/messages/_metaAdminAlertCatalog.test.ts:685-689`), so the helper takes `code: string` and does
not route through the `AdminAlertCode`-typed `resolveAdminAlert`, which would force a union widening
the meta-test forbids. This mirrors why `resolveBotLoginAlertRow` is raw
(`docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` §6). The report-side call runs
inside the submit path's existing postgres.js transaction; the tile-side call uses the Supabase
service-role client, matching its host.

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

## 5. The report lookup family: resolve on a fresh successful lookup

`BL-ALERT-REPORT-FAMILY-AUTORESOLVE` asks whether the manual-by-design posture is right for the six
report-family incidents. **Answer: right for three, wrong for three.** `REPORT_LOOKUP_INCONCLUSIVE`,
`REPORT_DUPLICATE_LIVE_MATCHES` and `REPORT_OPEN_ORPHAN_LABEL` have a sound instance-keyed
resolution; the other three do not and are unchanged.

Getting here took two rejected designs, both recorded because the reasoning is the reusable part.

### 5.1 The three codes and their raise condition

All three raise from `handleLookupInconclusive` (`lib/reports/submit.ts:771-819`), which is reached
only when a GitHub lookup has *already* thrown `LookupInconclusive`. `lookupAlertCode`
(`lib/reports/submit.ts:206-210`) maps the thrown code to the alert code. A state gate
(`upsertStateGatedLookupAlert`, `lib/reports/submit.ts:662-685`) then narrows the raise to reports
still genuinely stuck. So the raise condition is a **conjunction**:

> (GitHub lookup for key K returned an inconclusive result) AND (report K is still locally stuck)

Every raised context carries the discriminator: `{ idempotency_key, reason, code }`
(`lib/reports/submit.ts:777-781`).

### 5.2 Rejected design 1 — local anti-join (round 1, BLOCKING)

Revision 1 proposed resolving when no `reports` row for the show still matched the state gate, swept
at the point of recovery and by a report-reaper cron backstop. This violates instance-keying clause
(b): it negates only the second conjunct.

- `REPORT_DUPLICATE_LIVE_MATCHES` means multiple live GitHub issues share a marker
  (`lib/github/issues.ts:307-318`). Deleting or landing the local report closes none of them.
- `REPORT_OPEN_ORPHAN_LABEL` means an open GitHub issue carries the orphan-cleanup label
  (`lib/github/issues.ts:244-250`). Local-row absence neither re-closes it nor removes the label.
- `REPORT_LOOKUP_INCONCLUSIVE` covers listing, pagination and response-validation failures
  (`lib/github/issues.ts:255-322`). Local-row absence does not prove the lookup recovered.

Concrete failure: an orphan-labeled issue stays open past 24h, the anti-join clears its alert, and
the operator loses the signal while the required action is outstanding.

Two further defects killed it independently: unrelated reports for the same show block a recovered
alert from resolving (violating clause (a) — the row is per-show but the gate is generic); and the
claimed 24h handoff to `STALE_ORPHAN_REPORT` does not hold, because the reaper additionally requires
`processing_lease_until < now()` (`app/api/cron/report-reaper/route.ts:58-64`) on a nullable column
(`supabase/migrations/20260501001000_internal_and_admin.sql:309-321`) where `NULL < now()` is never
true — the shipped test deliberately retains an aged live-lease report and emits no stale alert
(`tests/reports/reaper.test.ts:105-138`).

### 5.3 The sound observation (round 2)

Revision 2 concluded from §5.2 that no sound resolver existed and all six codes should stay manual.
Round 2 showed that conclusion was over-broad: it confused "no *local* observation suffices" with "no
observation suffices."

The retry path performs a **fresh, complete GitHub lookup for the exact key**:
`reconcileBeforeCreate` calls `findIssueByMarker(idempotencyKey, cutoffIso)`
(`lib/reports/submit.ts:880`, `lib/github/issues.ts:255`). That function throws `LookupInconclusive`
for every condition these three codes report — `OPEN_ISSUE_WITH_ORPHAN_LABEL`
(`lib/github/issues.ts:246-251`), duplicate live matches (`lib/github/issues.ts:307-318`), and
shape/pagination faults (`lib/github/issues.ts:240-242`). Therefore a **normal return** from
`findIssueByMarker` for key K is precisely the negation of all three raise conditions, for K:
pagination and validation succeeded, no open orphan-labeled marker was found, and at most one live
match exists.

That satisfies every clause of the instance-keying rule: it re-evaluates the whole GitHub conjunct
(b), it names one `idempotency_key` which is exactly the discriminator the row carries (a), and the
raise re-fires on the next inconclusive lookup for that key (c).

### 5.4 The hook

One hook, at the single point where `reconcileBeforeCreate` returns without throwing
(`lib/reports/submit.ts:878-886`): resolve open rows of the three codes whose
`context->>'idempotency_key'` equals the key just looked up, via the shared
`resolveAlertsByContextKey` helper (§4.7) with `contextKey: "idempotency_key"`.

Scope notes:

- **Show scope follows the row, not the caller.** The resolve filters on `code` +
  `idempotency_key` + `resolved_at IS NULL`, and passes the show id the row was raised with
  (`ageRow.show_id ?? body.show_id`, `lib/reports/submit.ts:894`). A NULL-show row raised by the
  `raced_back_twice` fallback (`lib/reports/submit.ts:759-767`) is matched by its own key like any
  other; there is no anywhere-in-the-system predicate.
- **No cron backstop.** Deliberately. A scheduled sweep has no fresh GitHub observation available and
  would reintroduce §5.2's unsoundness. Re-detection is retry-driven, which is why these codes are
  `hybrid` and keep their manual buttons (§5.5).
- **The dedup caveat is the same as tiles'.** One row per (show, code) means `context.idempotency_key`
  names the most recent raiser, so a successful lookup for an older key correctly no-ops. The
  concurrent-observer race and its self-healing argument are identical to §4.6.

### 5.5 Classification: `hybrid`, buttons stay

All three move `event-manual` to `hybrid`. Catalog `resolution` stays `"manual"` at
`lib/messages/catalog.ts:2974` (`REPORT_LOOKUP_INCONCLUSIVE`), `lib/messages/catalog.ts:2942`
(`REPORT_DUPLICATE_LIVE_MATCHES`) and `lib/messages/catalog.ts:2993`
(`REPORT_OPEN_ORPHAN_LABEL`).

**Why not `auto`:** re-detection requires someone to retry that report. Nothing schedules it. Round 1
established the cost of getting this wrong — flipping `resolution` to `auto` suppresses the manual
button (`AUTO_RESOLVING_CODES`, `lib/adminAlerts/audience.ts:53-55`), so an operator facing a
still-open orphan-labeled issue would lose both the signal and the control. `hybrid` keeps the button
while letting a genuine recovery clear the row, exactly as for tiles (§4.8) and
`ONBOARDING_SHEET_UNREADABLE`.

Consequences: no catalog edit, no `AUTO_RESOLVE_NOTES` entries, no §12.4 lockstep, and
`RESOLVE_INTENTS` rows at `lib/adminAlerts/resolveActionLabel.ts:62-64` stay (§6.3).

### 5.6 The three that do not move

Unchanged, `event-manual`, for the reason the parent spec gave — no observation re-evaluates their
condition: `REPORT_ORPHANED_LOST_LEASE` (`lib/reports/submit.ts:977`) records an external issue
closing; `REPORT_LEASE_THRASHING` (`lib/reports/submit.ts:847-848`) records that races happened;
`STALE_ORPHAN_REPORT` (`app/api/cron/report-reaper/route.ts:74`) audits a row the reaper deleted.

---

## 6. Registry and lockstep fan-out

Rounds 1 and 2 each found this section incomplete. Every instance either round enumerated is below,
plus two the author found independently.

### 6.1 `ADMIN_ALERTS_LIFECYCLE` and counts

Four reclassifications, all to `hybrid`:

| Code | Line | From |
|---|---|---|
| `TILE_SERVER_RENDER_FAILED` | `tests/messages/_metaAdminAlertCatalog.test.ts:455` | `state-manual-justified` |
| `REPORT_LOOKUP_INCONCLUSIVE` | `tests/messages/_metaAdminAlertCatalog.test.ts:486` | `event-manual` |
| `REPORT_DUPLICATE_LIVE_MATCHES` | `tests/messages/_metaAdminAlertCatalog.test.ts:487` | `event-manual` |
| `REPORT_OPEN_ORPHAN_LABEL` | `tests/messages/_metaAdminAlertCatalog.test.ts:488` | `event-manual` |

Each gains a `resolveSites` tuple that must exist on disk
(`tests/messages/_metaAdminAlertCatalog.test.ts:741-742`).

The live registry is **45** codes: 26 auto, 17 event-manual, 1 hybrid, 1 state-manual-justified, 0
deferred (`tests/messages/_metaAdminAlertCatalog.test.ts:272-280`). Revision 1 carried the parent
spec's stale 42 and mis-derived the event-manual count. Corrected totals:

| Class | Before | After |
|---|---|---|
| auto | 26 | 26 (unchanged) |
| event-manual | 17 | **14** |
| hybrid | 1 | **4** |
| state-manual-justified | 1 | **0** |

Total stays 45. The hybrid assertion (`tests/messages/_metaAdminAlertCatalog.test.ts:736-739`,
currently `.toBe(1)`) moves to 4; the state-manual-justified expectation goes to 0; the auto count
assertion at `tests/messages/_metaAdminAlertCatalog.test.ts:732-734` is **not** edited. The class
docstring at `tests/messages/_metaAdminAlertCatalog.test.ts:272-280` states these counts in prose and
must move in the same commit.

### 6.2 Producer-scope registry, and the gate a new row activates

- **`_metaAlertProducerScope` needs a new row.** The sweep's `upsertAdminAlert` lands in
  `app/show/[slug]/[shareToken]/_CrewShell.tsx`, and that walker discovers producers under `app/`
  (`tests/adminAlerts/_metaAlertProducerScope.test.ts:26-48`,
  `tests/adminAlerts/_metaAlertProducerScope.test.ts:144-157`). `WrappedSection` was never registered
  because the walker excludes `components/`, so this is a **new** obligation created by the move.
- **Adding that row activates a dormant gate, which currently fails.** The representative-context
  check runs only for codes that have a producer row
  (`tests/adminAlerts/producerKeyAggregation.test.ts:50-59`). Once
  `hasProducerRow("TILE_SERVER_RENDER_FAILED")` is true, the code's representative context is checked
  against its allowed keys — and the live representative context is
  `{ drive_file_id, sheet_name, section }` (`tests/adminAlerts/producerContexts.ts:276-280`) while
  the producer actually writes `{ tileId, message, sheet_name }`
  (`components/crew/WrappedSection.tsx:98-102`). `drive_file_id` and `section` become offenders and
  the suite fails. **The representative context must be corrected to match the real producer in the
  same commit.** This is a pre-existing inconsistency that the new row merely exposes.
- **`ADMIN_ALERTS_WRITE_SITES` is NOT repointed.** Its `TILE_SERVER_RENDER_FAILED` row already
  targets `components/shared/TileServerFallback.tsx`
  (`tests/messages/_metaAdminAlertCatalog.test.ts:231-234`), not `WrappedSection`, so §4.4 does not
  break it. That producer still exists in source and still raises, so repointing would unpin what it
  currently guards. The live crew producer is covered by §7.1 instead. Revision 1 asserted the
  opposite and was wrong.
- Revision 1's claim that `tests/adminAlerts/alertProducerScope.registry.ts` holds no rows for these
  codes was **false**: a seed row for `REPORT_LOOKUP_INCONCLUSIVE` exists at
  `tests/adminAlerts/alertProducerScope.registry.ts:406-412`.

### 6.3 `RESOLVE_INTENTS` — do not delete rows

All four codes keep their rows (`lib/adminAlerts/resolveActionLabel.ts:62-64` and
`lib/adminAlerts/resolveActionLabel.ts:66`), and `tests/adminAlerts/resolveIntentsBaseline.json` is
not edited. Since none flips to `auto`, this is required by completeness as well as by history.

Stated explicitly because it is counterintuitive: the append-only lifecycle gate
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:94-124`) asserts every code in
`origin/main`'s baseline still maps to its historical intent, failing with *"changed or was deleted;
rows already in admin_alerts still render it"*, and its docstring gives the reason
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:12-14`): stored rows persist and would
silently re-label. Completeness
(`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:27-33`) excludes auto codes but does not
forbid retained entries. Round 1 independently confirmed this reading.

### 6.4 Tests that assert the old ownership

Each must be rewritten in the same commit, not merely updated:

| Test | Why it moves |
|---|---|
| `tests/components/crew/wrappedSection.test.tsx:55-160` | asserts throw renders fallback AND upserts; the upsert leaves |
| `tests/components/crew/wrappedSectionDurability.test.tsx:35-75` | premise inverts — `WrappedSection` registers no `after()` at all; the durability assertion must be re-established on the sweep, in the stronger returned-promise form (§4.5) |
| `tests/components/crew/crewShellTwoDistinctAlerts.test.tsx:110-140` | constructs shell and descendants under the old ownership |
| `tests/messages/_metaEmphasisRenderContract.test.ts:162-170` | retains the now-false claim that `WrappedSection` produces the alert |

### 6.5 Invariant 9

`resolveAlertsByContextKey` gains a row in the notify infra-contract registry
(`tests/notify/_metaInfraContract.test.ts:6-17`) plus a behavioral test alongside the existing
`resolveAdminAlert` case at `tests/notify/_metaInfraContract.test.ts:177` — returned-error AND
thrown-fault both throw — and the empty-values no-call guard (§4.7).

---

## 7. Structural defense

### 7.1 Tile producer topology

New meta-test at `tests/crew/_metaTileProducerTopology.test.ts (new)`, filesystem-walked over
`components/` and `app/` so a new surface fails by default:

1. Every `<WrappedSection` JSX call site lives in `components/crew/sections/`; the set of `tileId`
   literals equals the §4.2 table exactly; each `SectionId` maps to exactly one.
2. **Every construction site of the seven section components lives in
   `app/show/[slug]/[shareToken]/_CrewShell.tsx`.** Round 2 showed why assertion 1 alone is
   insufficient: a caller can type-safely write
   `<VenueSection ledger={createTileRenderLedger()} …>` and discard that ledger, so a throw records
   into an unswept ledger and emits no alert. No `any`, barrel, or dynamic-import seam is needed.
   Bounding *who may construct a section* is the assertion that actually closes the hole; the
   required prop (§4.3) only removes the silent-omission variant.
3. `app/show/[slug]/[shareToken]/_CrewShell.tsx` registers the sweep via `after(`, **returning** the
   sweep promise rather than voiding it (§4.5), and calls `createTileRenderLedger()` exactly once in
   the component body, never inside the callback.
4. `components/crew/WrappedSection.tsx` contains no `upsertAdminAlert` call, so the raise lives in
   exactly one layer.
5. `components/shared/WrappedTile.tsx` has no production call site, keeping
   `components/shared/TileServerFallback.tsx`'s producer dormant and its write-site pin honest
   (§6.2).

Assertions 1, 2 and 4 together are what replace `WrappedSection`'s lost self-containment. The
required-prop type is a convenience, not the guarantee — §4.3 is corrected accordingly.

### 7.2 Behavioral tests

- **T1 — clean set derivation.** `cleanTileIds` returns `attempted` minus `failed`, derived from the
  fixture's own tile set, never a hardcoded list.
- **T2 — message carriage.** A tile throwing `Error("scope projection blew up")` produces a sweep
  upsert whose `context.message` is that exact string, proving the ledger carries it past the catch.
- **T3 — raise before resolve.** A sweep with one thrown tile and the rest clean leaves exactly one
  open row naming the thrown tile.
- **T4 — the race is self-healing (§4.6).** Replay the interleaving: R2 raises B, R1's stale clean
  set spuriously resolves it, then a subsequent sweep in which B still fails re-raises the row.
  Assert the row is open at the end. A design that stopped re-raising fails this.
- **T5 — durability.** Capture the `after()` callback, invoke it, and assert it **returns a promise
  that settles after the write completes** — not merely that `after` and the upsert were called. The
  existing pattern's immediate-invoke mock (`tests/components/crew/wrappedSectionDurability.test.tsx:22-25`)
  would pass against a voided call, which is the defect round 2 identified.
- **T6 — report resolve is keyed and whole-condition.** A successful `findIssueByMarker` for key K
  resolves open rows of the three codes whose `context.idempotency_key` is K, and does NOT resolve a
  row naming a different key. A lookup that throws `LookupInconclusive` resolves nothing.

`sweepTileRenderAlerts` is a pure exported function taking the ledger as a parameter (§4.5)
specifically so T1 to T5 need no RSC request scope — the round-1 review showed Vitest's React build
turns `cache` into a pass-through, which is why the design does not rely on it at all (§4.3).

---

## 8. Guard conditions and edge cases

| Edge | Behavior |
|---|---|
| non-lead viewer (no Budget entitlement) | `crew:budget:rows` never enters `attempted`, never in `cleanTileIds`; an open budget-tile alert survives |
| response aborts mid-render | `after()` still runs with a partial `attempted`; only completed tiles resolve |
| tiles A and B both throw | two upserts hit one row (dedup index); row ends naming the last, `occurrence_count` 2 — existing behavior; neither is in `cleanTileIds` |
| row names A (yesterday), today A clean and B throws | raise retargets context to B; resolve excludes B; row survives naming B |
| row names A, today everything clean | A is in `cleanTileIds` and `last_seen_at` predates `observedAt`; row resolves |
| concurrent renders disagree about a tile | a stale clean observation can transiently clear the row; the next render re-raises (§4.6, T4) |
| section renders but its data is empty | the seam ran without throwing, so the tile is clean and resolvable — nothing is broken |
| sweep throws (Supabase outage) | caught and logged; crew render unaffected; next healthy request sweeps |
| no request scope (unit test) | `after()` throws synchronously; registration skipped, matching the existing shape in `_CrewShell` |
| alert already resolved manually | the resolve filters `resolved_at IS NULL`; no double-write |
| auto-resolution stamping | sets `resolved_at` only; `resolved_by` stays NULL (`lib/adminAlerts/resolveAdminAlert.ts:33`) |
| report row names key K, successful lookup for key J | no match on `context->>'idempotency_key'`; row stays open |
| report lookup throws `LookupInconclusive` | no resolve runs; the raise path proceeds as today |
| report row raised with `show_id IS NULL` (raced-back-twice fallback) | matched by its key like any other row; no anywhere-in-the-system predicate |

---

## 9. Acceptance criteria

- **AC1** A crew render where every entitled tile renders clean resolves an open
  `TILE_SERVER_RENDER_FAILED` row whose `context.tileId` is among them. A render where the row's tile
  throws leaves it open and re-raises.
- **AC2** A non-lead render (Budget not entitled) does NOT resolve a row naming `crew:budget:rows`.
  Expectation derived from the fixture's entitlement, not hardcoded.
- **AC3** A ledger with a partial `attempted` set (aborted render) resolves only the tiles in it.
- **AC4** T2: `context.message` on the sweep's upsert equals the thrown error's message.
- **AC5** T4: the §4.6 interleaving ends with the row OPEN after a subsequent sweep in which the tile
  still fails. A design that does not re-raise fails this.
- **AC6** T5: the `after()` callback returns a promise that settles after the write; a voided call
  (`after(() => { void sweep() })`) fails the test. `WrappedSection` registers no `after()` work on
  either path.
- **AC7** §7.1 assertion 2 holds: constructing any of the seven section components outside
  `_CrewShell.tsx` fails the topology test. Separately, omitting the ledger prop is a TypeScript
  error (`pnpm typecheck` fails).
- **AC8** The §7.1 topology test passes and fails when (a) a `<WrappedSection>` is added outside
  `components/crew/sections/`, (b) `WrappedSection.tsx` regains an `upsertAdminAlert` call, (c) the
  sweep registration is removed, (d) `createTileRenderLedger()` is called inside the callback, or
  (e) the sweep promise is voided rather than returned.
- **AC9** T6: a successful `findIssueByMarker` for key K resolves open rows of the three report codes
  whose `context.idempotency_key` is K; a row naming another key is untouched; a lookup that throws
  `LookupInconclusive` resolves nothing.
- **AC10** Lifecycle: all four codes are `hybrid` with resolve sites that exist on disk; hybrid count
  1 to 4; state-manual-justified 1 to 0; event-manual 17 to 14; auto unchanged at 26; total 45. The
  prose docstring at `tests/messages/_metaAdminAlertCatalog.test.ts:272-280` matches.
- **AC11** A `PRODUCER_SCOPE` row exists for the new `_CrewShell` producer,
  `tests/adminAlerts/producerContexts.ts:276-280`'s representative context is corrected to the keys
  the producer actually writes, and both `_metaAlertProducerScope` and `producerKeyAggregation` pass.
  `ADMIN_ALERTS_WRITE_SITES` is unchanged and still pins `components/shared/TileServerFallback.tsx`.
- **AC12** All four tests in §6.4 are rewritten and green.
- **AC13** `resolveAlertsByContextKey`: empty values list issues no Supabase call; returned DB error
  throws; thrown query fault throws; infra-contract registry row present.
- **AC14** No catalog `resolution` value changes; no `AUTO_RESOLVE_NOTES` entry is added; no §12.4
  prose is edited. `RESOLVE_INTENTS` and `tests/adminAlerts/resolveIntentsBaseline.json` are
  byte-identical to `origin/main`, and all three layers of
  `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` pass.
- **AC15** The three codes in §5.6 keep `class: "event-manual"`; a test guards all six report-family
  classifications against silent drift.
- **AC16** `pnpm test` full suite plus `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green.
- **AC17** Invariant-8 UI gate: `/impeccable critique` AND `/impeccable audit` on the affected diff,
  P0 and P1 findings fixed or deferred via `DEFERRED.md`, BEFORE the whole-diff cross-model review.
- **AC18** **All four** BACKLOG entries are moved to `BACKLOG-archive.md` with their citations:
  `BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE` and `BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE` (§2),
  `BL-ALERT-REPORT-FAMILY-AUTORESOLVE` (§5), and `BL-ALERT-TILE-RENDER-PER-TILE-KEYING`
  (closed by §4; its entry is the tile-keying row in the repo-root backlog queue). `BACKLOG.md` retains none of the four. The obsolete DEFER rows are
  removed from `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md:96-97` and its
  §3 class counts corrected.

Anti-tautology notes, binding on the plan: every assertion reads `admin_alerts` rows or the ledger
directly, never log output. AC2's entitlement and AC3's partial set derive from fixture state. AC1,
AC3, AC5 and AC9 assert post-callback row state, not that a function was called. AC5, AC6 and AC8
each name the mutant that must fail.

---

## 10. What does NOT change

- **No DDL.** No migration, so no `gen:schema-manifest` regen and no validation surgical apply.
- **No catalog change at all.** No `resolution` value moves, no `AUTO_RESOLVE_NOTES` entry is added,
  no §12.4 code is added or edited. The x1, x2, spec-codes and help-families gates do not move. All
  four codes stay `resolution: "manual"` and keep their manual buttons.
- **No cron surface.** The report resolve is retry-driven only (§5.4); no reaper change.
- **No rendered-output change** (§4.9, §4.10). The invariant-8 gate applies by file location.
- Manual resolve routes untouched; they still stamp `resolved_by`.
- Dedup and occurrence semantics unchanged: resolving then re-raising creates a fresh row.

---

## 11. Alternatives considered

- **Widen the dedup index with a per-tile discriminator column** (the literal reading of
  `BL-ALERT-TILE-RENDER-PER-TILE-KEYING`): rejected. It fans out to every raw `ON CONFLICT` producer,
  the upsert RPC, bell grouping, attention items and the identity map, plus a migration, manifest and
  validation cycle, for granularity no consumer reads. Filtering the discriminator the row already
  carries achieves the same keying at read time.
- **React `cache()` for the ledger** (revision 1): rejected on two round-1 findings — Vitest's React
  build turns `cache` into a pass-through so the identity contract is untestable, and an ambient
  store cannot bound who constructs a section (§4.3).
- **Timestamp freshness fence `last_seen_at < observedAt`** (revision 2): rejected, §4.6. It compares
  an app clock against the DB clock and can invert under skew, and request-start is the wrong instant
  so it also strands recovered rows. No repair exists that avoids a per-tile DB write on the render
  path.
- **Local-state anti-join for the report family** (revision 1): rejected, §5.2. It negates one
  conjunct of two.
- **A report-reaper cron backstop** (revision 1): rejected, §5.4. A scheduled sweep has no fresh
  GitHub observation and reintroduces §5.2's unsoundness.
- **All six report codes stay manual** (revision 2): rejected, §5.3. It confused "no local
  observation suffices" with "no observation suffices"; `findIssueByMarker` is the counterexample.
- **Flipping the four codes to `auto`**: rejected, §4.8 and §5.5. Re-detection is view- or
  retry-driven, so suppressing the manual button would strand rows nobody can clear.
- **Global "nothing failed this render" sweep**: rejected. Viewer-gated Budget, abort-time partial
  ledgers, and concurrent disagreement each make it clear live alerts (§4.1).
- **Keeping the raise in `WrappedSection` with a trailing sentinel component**: rejected. It encodes
  the ordering requirement as an invisible render-order dependency.

---

## 12. Watchpoints (review preempts — do not relitigate)

- **`GITHUB_BOT_LOGIN_MISSING` and `BRANCH_PROTECTION_*` are already auto.** §2, verified twice.
  Their BACKLOG entries were stale, not open work. Branch-protection dormancy is intended;
  `DEFERRED-archive.md:861` records the re-enable step.
- **There is no timestamp fence, deliberately.** §4.6 gives the two proofs that one cannot work. The
  race is accepted and self-healing, and T4 pins the self-healing property. Do not re-propose
  `observedAt`.
- **The report family resolves only at a fresh `findIssueByMarker` return.** The local anti-join
  (§5.2) and a cron backstop (§5.4) are both rejected on evidence. Do not re-propose either.
- **All four codes are `hybrid`, none is `auto`.** Catalog `resolution` stays `"manual"` throughout;
  every manual button stays.
- **The required ledger prop is not the ownership guarantee** — §7.1 assertion 2 is (§4.3). Do not
  cite the prop as closing the direct-mount hole.
- **`ADMIN_ALERTS_WRITE_SITES` stays pointed at `TileServerFallback.tsx`** (§6.2). That producer is
  dormant but live in source; repointing would unpin it.
- **The `producerContexts.ts` representative-context edit is required, not incidental** (§6.2). The
  new producer row activates a gate that currently fails against the stale context.
- **`RESOLVE_INTENTS` rows are retained deliberately** (§6.3).
- **`resolved_by` stays NULL for auto-resolution.** Existing convention.
