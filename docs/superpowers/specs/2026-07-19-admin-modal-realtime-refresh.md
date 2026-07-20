# Admin Show Modal — Realtime Refresh (2026-07-19)

## 1. Problem

The published-show review modal (`/admin?show=<slug>`, loader `app/admin/_showReviewModal.tsx`) is fresh at open — `PublishedReviewModal` fires a once-per-mount `router.refresh()` (`components/admin/showpage/PublishedReviewModal.tsx:156-161`, revalidate-on-open, spec 2026-07-19-show-modal-prefetch §3.2) — but goes dark while open. A cron sync that publishes changes mid-view (statement triggers `publish_show_invalidation_after_statement()` / helper `public.publish_show_invalidation(uuid)`, per `lib/realtime/subscribeToShow.ts:10-16`) broadcasts on `show:<id>:invalidation`, and the crew page consumes it live via `ShowRealtimeBridge` — the admin modal does not. The admin must close/reopen to see the new state.

## 2. Goal

Mount the existing realtime bridge in the modal's server loader so a cron publish (or any invalidation broadcast) triggers the bridge's debounced `router.refresh()` and the modal's Server-Component content reconciles in place — no close/reopen, no navigation.

## 3. Approaches considered

- **A (chosen): reuse `ShowRealtimeBridge` unchanged.** `components/realtime/ShowRealtimeBridge.tsx:186` takes `{ showId, slug, renderVersion }`, renders `null`, and both of its endpoints already authorize admin sessions: `/api/realtime/subscriber-token` resolves admin via `isAdminSession` and mints `sub: "<admin>", viewer_kind: "admin"` (`app/api/realtime/subscriber-token/route.ts:126-127`); `/api/show/[slug]/version` likewise (`app/api/show/[slug]/version/route.ts:76-77`). Zero changes to the bridge, its endpoints, the channel topology, or Realtime RLS.
- **B (rejected): admin-specific bridge fork.** Duplicates a ~900-line component hardened across ~24 adversarial rounds (generation guards, owner-token renewal lock, abort tokens). No admin-specific behavior justifies a fork.
- **C (rejected): polling.** Interval-fetch of `/api/show/[slug]/version`. Push infra already exists end-to-end; polling adds load and latency for less freshness.

## 4. Design

### 4.1 Version-token read (new, in the loader)

`app/admin/_showReviewModal.tsx` gains a read of `public.viewer_version_token(uuid)` (defined `supabase/migrations/20260501001000_internal_and_admin.sql:18-32`; monotonic ms high-water over `shows.last_synced_at`, `shows.picker_epoch_bumped_at`, `max(crew_members.last_changed_at)` per `app/api/show/[slug]/version/route.ts:4-11`).

- **Read order — token BEFORE the data wave.** The token is awaited serially after the slug→id lookup and BEFORE the `Promise.all` wave (`_showReviewModal.tsx:224-240`). Rationale is the pinned precedent at `lib/data/getShowForViewer.ts:920-935` (audit idx19): data-then-token lets a write committing between the two reads produce fresh-token + stale-data, which suppresses the bridge's catch-up refresh → stuck stale. Token-first makes the worst case old-token + fresh-data, which over-refreshes once and converges. Cost: one extra serial round-trip of a trivial SQL function before the wave — accepted; the perceived-latency work (#485) eliminated serial waves of heavy reads, not a single cheap RPC.
- **Client**: the same `supabase` server client the loader already holds (the snapshot RPC caller). The RPC is granted EXECUTE to `authenticated` (`getShowForViewer.ts:869`), and the loader path is admin-gated upstream (dashboard `requireAdmin`) with the snapshot RPC's `not_admin_or_missing` as the in-loader gate — no service-role client needed.
- **Never cached.** Same contract as `getShowForViewer.ts:874-876`: caching the token re-serves a stale fence forever → refresh loop.

### 4.1a Freshness coverage contract (mutation source × broadcast × token)

The realtime contract of this feature is **sync-path freshness**, not total-modal freshness. The fence (token catch-up) only needs to cover mutations that BROADCAST — a broadcast received while subscribed always refreshes unconditionally (`ShowRealtimeBridge.tsx:744-754`, no token compare); the token exists solely to close the [token-read → SUBSCRIBED] gap for those same sources.

| Mutation source | Broadcasts? | Advances token? | Freshness mechanism |
| --- | --- | --- | --- |
| Cron sync apply (`lib/sync/runScheduledCronSync.ts:2395` → `publish_show_invalidation(uuid)`) | yes (explicit helper) | yes (`shows.last_synced_at` stamped by apply — the sync contract) | broadcast; gap covered by token catch-up |
| Manual stage / unpublish (`lib/sync/runManualStageForFirstSeen.ts:56`, `lib/sync/unpublishShow.ts:183` → same helper) | yes (explicit helper) | **plan verifies** each path stamps `last_synced_at` (broadcast verified; token-advance not yet) | broadcast; if a path does NOT advance the token, its subscribe-gap residual is the same accepted status-quo class as the `crew_member_auth` row below |
| `crew_members` insert/update (statement triggers, `supabase/migrations/20260501001000_internal_and_admin.sql:95-105`) | yes | yes (`max(crew_members.last_changed_at)`) | broadcast; gap covered by token catch-up |
| `crew_member_auth` insert/update (triggers, same migration `:83-93`) | yes | only via an accompanying `crew_members` stamp (plan verifies whether claim writes stamp `crew_members.last_changed_at`) | broadcast; residual: a claim landing inside the subscribe gap may evade the catch-up. **Accepted — status-quo parity:** the crew page runs the IDENTICAL fence with the identical window (`getShowForViewer.ts:920-935`); this spec does not widen or narrow it. |
| `admin_alerts`, ignored-warnings, change-feed rows, finalize state | no | no | OUT of the realtime contract. These refresh via the admin's own action revalidation (server actions conclude with their own revalidation) or opportunistically on ANY refresh (every refresh re-runs the whole loader wave). Unchanged from today. |
| `picker_epoch` bump (reset/rotate) | no trigger, but admin-action revalidates | yes (`picker_epoch_bumped_at`) | admin's own action path (`ShareTokenContext` reconcile) — unchanged |

### 4.2 Fault posture (differs from crew page — deliberately)

`getShowForViewer` HARD-throws on a token-RPC error (`getShowForViewer.ts:871-872`: crew page cannot render without the fence). The modal instead **fails open**: on returned-error or throw,

1. `void log.warn(...)` with `source: "admin.show"`, `code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED"`, `slug`, `showId`, `error` — matching the loader's existing degraded-read emits (e.g. `ADMIN_SHOW_TOKEN_READ_FAILED`, `_showReviewModal.tsx:213-220`);
2. the loader renders **without** the bridge for that render pass (no realtime this open; everything else unchanged).

Rationale: the realtime bridge is an enhancement; killing the whole modal (throw → error boundary) for it is disproportionate, and the modal already degrades reads this way (feed → `null`, share token → `null`). Recovery: the modal's own once-per-mount `router.refresh()` (`PublishedReviewModal.tsx:157-161`) re-runs the loader ~immediately after a prefetched open, and any later refresh re-attempts the read — if it recovers, the bridge mounts on that reconcile.

Invariant-9: this is a new Supabase call boundary in the loader — it destructures `{ data, error }`, distinguishes returned-error from thrown, and gets a registry row in the admin infra-contract meta-test (see §8).

### 4.3 Mount

The loader renders, as a sibling of `<PublishedReviewModal …>` inside the returned tree (`_showReviewModal.tsx:370-407`):

```tsx
<ShowRealtimeBridge showId={showId} slug={slug} renderVersion={versionToken} />
```

- **Unconditional across lifecycle states** (published, unpublished, archived): cron sync touches unpublished shows too, and the subscriber-token route has no published-gate for admins (`subscriber-token/route.ts:126-127`).
- Placement inside vs. outside `ShareTokenProvider` is behaviorally irrelevant (the bridge renders `null` and reads no context); it sits inside the provider for locality. **Position pin: the bridge renders AFTER `<PublishedReviewModal …>` — the LAST child.** The bridge is conditionally present (§4.2 fault render omits it), and RSC/React reconciliation preserves client-component state by child position: appending/omitting a LAST sibling never shifts `PublishedReviewModal`'s index, whereas a leading sibling that appears on a recovery render would re-key the modal's position and reset its client state (menu/done/scroll). The loader unit test pins this order. `key={showId}` on the provider (`_showReviewModal.tsx:372`) means a different show remounts the bridge cleanly — the bridge's own effect deps (`[showId, slug, …]`, `ShowRealtimeBridge.tsx:876`) already handle that.
- The bridge renders `null` — **no visual deliverable**. (Invariant-8 dual-gate still runs because `app/admin/_showReviewModal.tsx` is a UI-surface file; expected trivial.)

### 4.4 Behavior while open (concern b — focus/scroll/popover)

A bridge-driven `router.refresh()` is the SAME mechanism the modal already fires once per mount; the modal's client machinery is explicitly engineered for mid-open reconciles:

- Attention auto-open is one-shot (`autoOpenFiredRef`, `PublishedReviewModal.tsx:241-264`) — "a user who closed the menu is not re-opened by later refreshes" is the in-code contract.
- Resolved banners stay mounted in place "until router.refresh() reconciles" (`PublishedReviewModal.tsx:312-314`).
- `ShareTokenContext` reconciles a fresh server seed from an in-flight `router.refresh()` (`app/admin/show/[slug]/ShareTokenContext.tsx:15,51`).
- RSC reconciliation preserves client-component state/DOM where element type + position are stable — the shell (`ReviewModalShell`), popovers (#499 contracts), and scroll container are client-side and stay mounted. **Verified subtree facts (state preservation depends on type+key+position at every level):** crew rows are keyed `` `${m.name}-${i}` `` — name+index, NOT crew id (`components/admin/wizard/step3ReviewSections.tsx:1394`). Consequence: a refresh that RENAMES or REORDERS crew rows remounts them (open popover on an affected row closes) — acceptable, a renamed row is genuinely new content; the §8.4 e2e therefore uses a key-stable stimulus (role swap). Popover open state is client-owned and reconcile-safe on stable keys: `openCrewId` `useState` (`step3ReviewSections.tsx:1261`), `open={openCrewId === crewId}` (`:1386`), plus `CrewRowActions`'s internal `mode` state (`components/admin/wizard/CrewRowActions.tsx:52`).

**New behavioral invariants this spec pins (real-browser e2e, not jsdom; asserted under the §8.4 geometry-stable mutation constraint — arbitrary reflows are out of scope):** with the modal open and a broadcast-driven refresh landing,

1. an open row-controls popover (⋮ menu, #499) stays open and container focus is not lost;
2. document focus (activeElement) inside the modal is unchanged;
3. the modal body's scrollTop is unchanged (tolerance ±1px);
4. the attention menu, if the user closed it, stays closed;
5. the modal does NOT re-enter its Suspense fallback (`ShowReviewModalSkeleton`) — refresh reconciles in place (`router.refresh()` keeps existing UI during the transition; the fallback only renders on a fresh `?show` navigation).

### 4.5 Refresh cadence / dedupe

At open, up to two refreshes can fire: the modal's revalidate-on-open (`PublishedReviewModal.tsx:157-161`) and the bridge's post-subscribe catch-up IF the SSR'd token already mismatches live (`ShowRealtimeBridge.tsx:292-324`). Both are idempotent RSC round-trips; the catch-up only fires on a genuine mismatch. No dedupe is added — this mirrors the crew page, where the same catch-up coexists with navigation-driven renders.

While open, broadcasts coalesce through the bridge's 100ms debounce (`ShowRealtimeBridge.tsx:108`, plan-pinned).

**Actions × refresh overlap (scoped claim, do not relitigate):** the ratified prefetch spec pins the App Router empiric that actions serialize with `router.refresh()` — "the router's action serialization makes release-after-commit unconstructible" (`docs/superpowers/specs/2026-07-19-show-modal-prefetch.md` §6 case (b) / §3.4 empirics block at `:51`). Independent of that empiric, this feature adds no NEW overlap mechanism: the modal's revalidate-on-open refresh already coexists with every admin action today, and the modal's client state machines are built for reconciles at arbitrary times (§4.4). The bridge changes refresh FREQUENCY only. No compound-race test is added; the §4.4 e2e invariants are the behavioral coverage.

## 5. Guard conditions

| Input | null/empty/invalid | Behavior |
| --- | --- | --- |
| `versionToken` read returns non-string / null `data` | coerce to `""` (same as `getShowForViewer.ts:885`) | bridge mounts with `""`; catch-up compares `""` vs live — one extra refresh worst case, converges |
| token RPC returned-error or throw | §4.2 | log `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED`, render without bridge |
| `showId` | always present at mount site (loader redirects on missing show, `_showReviewModal.tsx:134`) | n/a |
| `slug` | non-empty (dashboard `?show=` param gate, `app/admin/page.tsx:161-170`) | n/a |
| admin session expires — at INITIAL mount (mint 401 before first subscribe) | fail-open no-op, no retry (`ShowRealtimeBridge.tsx:707-725`: SSR already authorized the render; forcing refresh at mount would loop) | no realtime this open; modal otherwise unaffected |
| admin session expires — at RENEWAL (disconnect/reconnect mint 401) | `auth_denied` → forced `router.refresh()` (`ShowRealtimeBridge.tsx:386-394`) | Server Component auth chain re-runs and routes to sign-in — desired |
| show deleted while open | broadcast/refresh → loader slug lookup finds no row → `redirect("/admin")` (`_showReviewModal.tsx:134`) | modal closes to dashboard — matches D8 posture |

## 6. Explicitly out of scope

- Any change to `ShowRealtimeBridge`, `subscribeToShow`, the subscriber-token or version routes, channel topology, Realtime RLS, or DB (no migrations).
- Realtime on the dashboard LIST (rows outside the modal) — separate surface, separate spec if wanted.
- Bounded-backoff retry of the initial subscribe (bridge v1 fails open, `ShowRealtimeBridge.tsx:85-86` — pre-ratified posture, DO NOT RELITIGATE).

## 7. Failure modes & posture (pre-empts)

- **Realtime fails open** — subscribe/mint failures degrade to "no live updates," never a broken modal. This is the ratified M4 posture (`ShowRealtimeBridge.tsx:84-86`, initial-mount fail-open rationale at `:707-713`). Do not relitigate.
- **Token-first read order** — pinned precedent `getShowForViewer.ts:920-935`. Do not relitigate toward "put it in the Promise.all wave."
- **Reuse, not fork** — §3.
- **New log code** `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED` is a forensic app_events code, NOT a §12.4 user-visible catalog code — its peers (`ADMIN_SHOW_LOOKUP_FAILED`, `ADMIN_SHOW_TOKEN_READ_FAILED`) are likewise uncataloged. Registration: add to the known-forensic-codes list in `tests/log/_auditableMutations.ts` (the `ADMIN_SHOW_*` cluster sits at `tests/log/_auditableMutations.ts:627-631`). No §12.4 / `gen:spec-codes` / `catalog.ts` fan-out.

## 8. Test plan

1. **Loader unit tests** (extend `tests/app/admin/showReviewModalLoader.test.tsx` — the existing loader suite, which already asserts on log-spy codes, e.g. `ADMIN_SHOW_LOOKUP_FAILED` at `:352-354`):
   - token read ok → rendered tree contains `ShowRealtimeBridge` with `{ showId, slug, renderVersion: <token> }`;
   - RPC returned-error → no bridge in tree + `log.warn` with `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED` (assert on the log spy, not just absence);
   - RPC throw → same;
   - non-string `data` → bridge mounts with `renderVersion: ""`;
   - read-order: token RPC has SETTLED before ANY wave reader is invoked (call-order assertion over ALL mocked wave readers — snapshot RPC, finalize RPC, feed, share-token, ignored-warnings, alerts — not just the snapshot; catches a regression that folds the token into the wave or reorders a single reader ahead of it);
   - child-order pin (§4.3): in the rendered tree, `ShowRealtimeBridge` is the LAST child inside `ShareTokenProvider`, AFTER `PublishedReviewModal` — asserted in both the with-bridge and (absent) fault renders, so the fault render provably removes a trailing sibling and never shifts the modal's child index;
   - lifecycle variants (§4.3 "unconditional"): snapshots with `archived: true` and with `published: false` BOTH render the bridge with the token (a published-only mount condition must fail these — the existing suite's `baseSnapshot({ archived: true, published: false })` fixture pattern at `tests/app/admin/showReviewModalLoader.test.tsx:331-339` is the template).
2. **Read-path pin** — `tests/admin/_showReviewReadPathPin.test.ts` currently pins the loader's only `.from()` as the slug→id lookup; the new call is `.rpc("viewer_version_token")` — extend/confirm the pin accepts it (peer of `readfinalizeowned_b2`).
3. **Invariant-9 meta-test** — add the loader's version-token boundary to the admin infra-contract registry (the #500-established registry row pattern).
4. **Real-browser e2e** (Playwright — extend the modal's existing e2e surface, `tests/e2e/published-review-modal.prefetch.spec.ts` patterns): open `/admin?show=<slug>`, commit a content change so the statement trigger broadcasts on the local Supabase Realtime stack, assert:
   **Pre-mutation gates (anti-tautology, BOTH mandatory before the DB change is committed):**
   1. **Open-refresh completion, network-observed:** the modal's own revalidate-on-open `router.refresh()` fires at mount — a change committed before it completes would surface through THAT path and prove nothing about the bridge. The test awaits the loaded modal AND the completion of the post-open `?show=` RSC response (network observation, the `published-review-modal.prefetch.spec.ts` request-tracking pattern). A content marker alone is NOT sufficient — it cannot prove the open refresh finished.
   2. **Subscription readiness observed:** the bridge must have reached `SUBSCRIBED` — otherwise the test can pass through the post-subscribe token catch-up without any broadcast being received, proving nothing about the broadcast path on the repo's FIRST realtime e2e. Observe it without touching the bridge: Playwright's `page.on("websocket")` sees the Realtime socket's join reply frame (`phx_reply`, status `ok`) for the `show:<id>:invalidation` topic; the plan picks the exact frame predicate.
   3. **Post-subscribe catch-up settled:** after `SUBSCRIBED` the bridge runs its version catch-up (`refreshSyncIfMismatch`, one GET `/api/show/<slug>/version`). A mutation committed after the join but before that request settles could be discovered by the CATCH-UP, not the broadcast. The test awaits the completion of that post-join `/version` response before mutating.

   Only after ALL THREE gates does the test commit the DB change. **Positive attribution assertion:** the broadcast path never fetches `/version` (broadcasts refresh unconditionally, `ShowRealtimeBridge.tsx:744-754`; only catch-up paths fetch it). So the test additionally asserts NO further `/api/show/<slug>/version` request occurs between the mutation and the content swap — the swap is then attributable ONLY to a received broadcast traversing debounce → `router.refresh()`.
   **The stimulus (pinned):** an UPDATE to `crew_members.role` on ONE rendered crew row of the seeded show. This is the only stimulus class that satisfies every constraint at once: it broadcasts via the statement trigger (`20260501001000_internal_and_admin.sql:95-99` — show-field edits like title/venue do NOT broadcast without the explicit helper), it advances the token (`max(crew_members.last_changed_at)`), it changes content the crew section actually renders, and it is key-stable — crew rows are keyed `` key={`${m.name}-${i}`} `` (`components/admin/wizard/step3ReviewSections.tsx:1394`), so a ROLE swap (never a rename, never an insert/remove/reorder) leaves every row's key and index intact.

   **Assertions after the mutation:**
   - the new role text appears in the modal without navigation (URL unchanged);
   - **skeleton non-re-entry, transiently observed:** a post-hoc check would miss a brief fallback flash. Before the mutation, install (via `page.evaluate`) a `MutationObserver` recording any mount of the skeleton's testid — `published-show-review-loading` (`components/admin/showpage/ShowReviewModalSkeleton.tsx:131`); after the content swap, assert the recorder is empty across the whole window;
   - **objective geometry invariant (replaces "similar length" hand-waving):** equal-length strings can still wrap or change row height, so the test PROVES geometry stability instead of assuming it — the modal scroller's `scrollHeight` and the anchored (untouched) row's `getBoundingClientRect()` must be unchanged (±1px) pre→post swap. If they differ, the test fails as INCONCLUSIVE (fix the fixture's role strings), never silently passes;
   - **§4.4 invariants 1–4 under that proven-stable geometry:** focus target + open popover are anchored on a crew row the mutation does NOT touch (popover open state is client-owned — `openCrewId` `useState` at `step3ReviewSections.tsx:1261`, wired `open={openCrewId === crewId}` at `:1386`, plus `CrewRowActions`'s internal `mode` state — so a props-only reconcile with stable keys preserves it). Menu-closed assertion (§4.4 inv 4) is exercised non-tautologically: the fixture seeds an actionable attention item so the menu AUTO-OPENS (`PublishedReviewModal.tsx:241-264`), the test closes it, THEN the broadcast lands, and the menu must stay closed (this actually exercises `autoOpenFiredRef`; starting closed would prove nothing).
   No crew-side realtime e2e exists to copy (the M4-era `apply-driven-refresh.spec.ts` in the desktop-chromium testMatch regex has no matching file — stale entry) — this is the repo's FIRST realtime e2e. Plan must verify local Realtime broadcast is drivable from the test (trigger/helper fires on a plain DB write against local Supabase); if it is not, say so explicitly and substitute a real-browser harness that injects the invalidation THROUGH the bridge's broadcast callback via a module-stubbed Supabase client (esbuild-alias harness precedent, `tests/e2e/published-review-modal.crew-actions.spec.ts` real-popover style) so the stimulus traverses subscribe→debounce→`router.refresh()` — NEVER a harness that calls `router.refresh()` directly (tautological: proves reconciliation, not the bridge), and NEVER silently dropping the focus/scroll assertions.
5. **No mutation-surface telemetry additions** — invariant 10 N/A: no new mutating route/action (read-only loader change + null-render client mount).

## 9. Spec-rule declarations

- **Transition inventory: N/A** — no visual states added (bridge renders `null`); the modal's existing transition pin (const-ternary count) is untouched.
- **Dimensional invariants: N/A** — no layout change.
- **Cap/truncation: N/A** — no lists added.
- **Flag lifecycle: N/A** — no flags added.
- **Tier×domain matrix: N/A** — no DB change.
- **Build-vs-runtime gate: N/A** — no env-gated feature.
- **Meta-test inventory**: EXTENDS the admin infra-contract registry (§8.3) and the loader read-path pin (§8.2).
- **Advisory locks (invariant 2 declaration):** no production mutation path is added — the feature is a read (loader token RPC) plus a null-render client mount. The e2e fixture's direct `crew_members` write is a TEST-ONLY service-role write following the ratified `seedShowWithCrew` precedent (`tests/e2e/helpers/seedShowWithCrew.ts:116-176` writes `shows` + `crew_members` with no advisory lock; invariant 2 governs production mutation surfaces — cron/admin code paths — not single-writer test fixtures against the local DB). No lock-holder topology changes; `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched.
