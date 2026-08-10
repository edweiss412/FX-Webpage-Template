# Admin nav badge Suspense streaming — design

**Date:** 2026-08-09 · **Ledger:** `BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING` (BACKLOG.md) · **Branch:** `feat/admin-nav-badge-suspense` · **Prior art:** `docs/superpowers/specs/nav-perf/2026-06-23-nav-perf-phase2-ui-feedback.md` (E-lite, the descoped half)

## §0 Summary

Move the admin layout's two badge reads — `loadBellUnseenCount` and `loadNeedsAttentionCount` — out of the layout's blocking await path, so first `/admin` entry paints the nav chrome immediately and the badge counts stream in via `<Suspense>`. Plus one independent win the research surfaced: the onboarding early-return branch currently pays both badge awaits and then discards them — it stops issuing those reads at all.

The backlog entry's premise "the repo has zero `<Suspense>` precedent" is STALE: real boundaries ship in the admin tree today (`app/admin/page.tsx` `ShowReviewModalSkeleton` fallback; `app/admin/dev/telemetry/page.tsx`; `app/admin/dev/telemetry-dim/page.tsx`). Half the entry's promotion prerequisite is already met; the other half (an AdminNav bridge preserving the client refetch hook) is this design.

## §1 Resolved scope — do not relitigate

1. **`Promise.all` stays `Promise.all`** where reads remain grouped — never `allSettled` (nav-perf phase-2 §invariant-9 line, ratified there). This design removes the barrier for the two badge reads; it does not change failure semantics: both loaders RETURN discriminated results (`{ kind: "ok" } | { kind: "infra_error" }`-class) rather than throwing, per invariant 9, and that contract is what makes the un-awaited-promise pattern safe (§3.2).
2. **The client refetch contract is preserved unchanged:** `useNeedsAttentionBadge` (prop-sync effect + pathname effect + monotonic token + AbortController, fail-quiet `setCount(null)` per ratified D-4) and `useBellBadge` keep their semantics; they move INTO streamed leaf components but their code is not rewritten.
3. **Badge render rules unchanged:** hidden unless finite > 0, "9+" cap, `admin-attention-badge` testid; bell unchanged visually except arrival timing.
4. **Selected mechanism: promise-as-prop + `use()`** (§3.2), validated by a mandatory spike task before implementation (§3.5). The slot-bridge alternative is the recorded fallback, not a parallel deliverable.
5. **Out of scope:** caching the badge reads (`unstable_cache`/tags — neither loader is cached today and this arc does not add caching); the layout's OTHER await barriers (identity/health/app-settings — measured but untouched); any crew-facing surface.

## §2 Current state (live-code citations, verified 2026-08-09 by investigator)

- `app/admin/layout.tsx` — async server component, `export const dynamic = "force-dynamic"`. Barriers in order: `Promise.all([requireAdminIdentity, isCurrentUserDeveloper, fetchHealthRollup])` (~:77-81); `await readAppSettingsRow()` (~:130); conditional `await readFinalizeCheckpoint` (~:134); `const [bellCount, needsAttentionCount] = await Promise.all([loadBellUnseenCount(...), loadNeedsAttentionCount()])` (~:152-155); AdminNav mount (~:204-210) passing `email`, `bellCount`, `initialBadgeCount={needsAttentionCount.kind === "ok" ? count : null}`, `viewerIsDeveloper`, `healthRollup`.
- Onboarding early-return (~:157-179): renders `<OnboardingTopBar email healthRollup isDeveloper>` — consumes NEITHER badge value, but both awaits above it have already been paid.
- `components/admin/nav/AdminNav.tsx` — `"use client"`; props at :44-68; `const badgeCount = useNeedsAttentionBadge(initialBadgeCount)` at :71; badge render gate :205-208; testid :230. Bell: `components/admin/nav/NotifBell.tsx` `useBellBadge(initialCount)` at :32.
- `components/admin/nav/useNeedsAttentionBadge.ts` :16-58 — prop-sync effect :23-33; pathname effect :35-55 fetching `GET /api/admin/needs-attention-count` (`force-dynamic` route).
- Loaders: `lib/admin/needsAttentionCount.ts:12-96` — returns `{ kind: "ok"; count } | { kind: "infra_error" }`, internally parallelized, any fault degrades the whole badge (returned, not thrown). `lib/admin/bellFeed.ts:343-350` `loadBellUnseenCount` delegates to `runBellPipeline` (thrown-vs-returned disposition verified in the plan's pre-draft pass; if it can throw, §3.2's wrapper clause applies).
- Suspense precedent: `app/admin/page.tsx:41` and `app/admin/page.tsx:168-170`; `app/admin/dev/telemetry/page.tsx:61-63`; `app/admin/dev/telemetry-dim/page.tsx:144-146`.

## §3 Design

### 3.1 Onboarding branch stops paying the badge reads

Reorder `app/admin/layout.tsx`: the onboarding early-return decision happens BEFORE the badge reads are issued. On the onboarding path, neither loader is called (today: called, awaited, discarded). No behavior change for the onboarding UI. This lands even if the streaming half is descoped by the spike.

### 3.2 Streaming bridge: promise-as-prop + `use()`

The layout ISSUES both reads without awaiting and passes the promises to the client tree:

```tsx
// layout (server): no await, no barrier
const bellCountPromise = loadBellUnseenCount(adminEmail, viewerIsDeveloper);
const attentionCountPromise = loadNeedsAttentionCount();
<AdminNav email={email} healthRollup={healthRollup} viewerIsDeveloper={viewerIsDeveloper}
  bellCountPromise={bellCountPromise} attentionCountPromise={attentionCountPromise} />
```

Inside `AdminNav` (client), the badge chip and the bell become `<Suspense fallback={null}>`-wrapped leaves that resolve their promise with React's `use()` and then run the EXISTING hooks with the resolved value as the initial seed:

```tsx
function AttentionBadgeLeaf({ countPromise }) {
  const initial = use(countPromise);           // { kind: "ok", count } | { kind: "infra_error" }
  const count = useNeedsAttentionBadge(initial.kind === "ok" ? initial.count : null);
  …existing render gate + testid…
}
```

Bell: `NotifBell` splits into the always-painted bell button shell and a Suspense-wrapped count leaf seeding `useBellBadge` — the plan enumerates the exact split after reading `NotifBell.tsx`; the contract is that the bell BUTTON never waits, only its unseen-count chip does.

Safety clauses, each load-bearing:

- **No unhandled rejection by contract:** `loadNeedsAttentionCount` returns discriminated results (never throws) — invariant 9. If the plan's pre-draft pass finds `loadBellUnseenCount` can throw, the layout wraps it (`.catch(() => ({ kind: "infra_error" as const }))`) so the passed promise NEVER rejects — the badge fail-quiet contract (null → hidden) is the designed degradation either way.
- **Serialization:** the promises resolve to plain JSON values — legal server→client promise props.
- **Fallbacks are `null`:** a not-yet-streamed badge is indistinguishable from the legitimate "no attention items" hidden state, which is the correct progressive rendering (the pill appearing is additive, never a layout shift — the badge is absolutely positioned/inline chip; plan verifies no CLS).
- **Pathname refetches are unaffected:** after first resolution the hooks own state; navigation within `/admin` re-renders pages, not the layout, so the promise props are stable per layout render — exactly today's `initialBadgeCount` lifecycle.

### 3.3 What the user sees

First `/admin` entry: nav chrome (links, health, avatar, bell shell) paints without waiting on the two badge queries; the attention badge and bell count pop in when their reads land. Failure: badges stay hidden (existing fail-quiet contract). No spinner — `fallback={null}`.

### 3.4 Layout barrier inventory (measured, mostly untouched)

The identity/health barrier and app-settings/finalize awaits remain (out of scope §1.5); this arc removes only the badge barrier (~:152-155) and the onboarding waste. Recorded so the reviewer doesn't re-derive "but there are other awaits" — yes, and they gate auth and chrome data the nav genuinely needs before painting.

### 3.5 Spike task (mandatory, before implementation tasks)

Per the empirical-spike rule (stateful/framework surface): a throwaway probe in this worktree proves, in `next dev` AND `next build && next start`, that (a) a `force-dynamic` layout passing an unresolved promise to a client `use()` leaf actually STREAMS (chrome flushes before the count resolves — verified with an artificially slow loader), (b) no hydration error or double-fetch, (c) the pathname refetch still fires on navigation. The spike's measurements go into the plan verbatim. If streaming does NOT hold under `force-dynamic` (framework contract UNRATIFIED until probed), the fallback is the server-child slot bridge (badge leaf as a server component child streamed into a slot prop), and the spec's §3.2 is amended by one commit before planning proceeds.

### 3.6 Dimensional Invariants

None introduced: the badge chip and bell count are inline/absolutely-positioned chips inside the existing nav bar; no fixed-dimension parent gains flex/grid children, and streaming arrival must cause zero layout shift (AC-2's chrome assertion covers presence; the plan's CLS check covers shift). Declared explicitly per the self-review rule.

### 3.7 Transition Inventory

States per chip: absent (fallback/suspended), hidden (resolved, count 0 or infra_error), visible (count > 0).

| Transition | Treatment |
| --- | --- |
| absent (suspended) to hidden | instant, and visually identical: both render nothing |
| absent (suspended) to visible | instant appearance on stream resolution; no animation (chip is additive, no shift) |
| visible to hidden (refetch lands 0 / fail-quiet null) | instant, existing hook behavior, unchanged |
| hidden to visible (refetch lands > 0) | instant, existing hook behavior, unchanged |
| compound: pathname refetch fires while initial promise still suspended | impossible by construction: the hook mounts only inside the resolved leaf, so the pathname effect cannot run before first resolution; asserted in AC-5's integration test |
| compound: layout re-render mid-stream (router.refresh) | new promises, leaf re-suspends to fallback null then resolves; identical to first load |

## §4 Acceptance criteria

- **AC-1** Onboarding path issues ZERO badge-loader calls (spy/source assertion), and its UI is unchanged.
- **AC-2** `/admin` layout render does not await either badge loader (source-scan: no `await` on the two call expressions; behavioral: chrome testids present before slow-loader resolution in the spike-derived e2e or RTL-with-suspended-promise test).
- **AC-3** Badge chip renders post-stream with correct count, "9+" cap, hidden on `infra_error` and on 0 — the existing render-gate tests keep passing against the leaf.
- **AC-4** Bell button paints without the count; count chip streams in; `useBellBadge` refetch behavior unchanged.
- **AC-5** Pathname-change refetch still fires exactly as today (existing hook tests keep passing; one integration test toggles pathname with the leaf mounted).
- **AC-6** No raw error codes in UI (invariant 5) — failure renders nothing, which is the catalog-free contract this surface already ratified (D-4 fail-quiet).
- **AC-7** Impeccable dual-gate on the diff (UI surface); `impeccable-gate:` marker in closeout.
- **AC-8** Full suite + real CI green; cross-model whole-diff review APPROVE.

## §5 Documented limits

1. **Badge arrival is now visibly async** on slow reads — a chip popping in ~hundreds of ms after chrome. Accepted: that is the feature. No skeleton, because a skeleton for a maybe-hidden chip advertises noise.
2. **A rejected bell promise degrades to hidden count** (§3.2 wrapper) rather than surfacing an error — matches the ratified fail-quiet badge posture (D-4), recorded as the designed conservative path.
3. **The other layout barriers remain** (§3.4). First-paint is bounded below by identity+health, by design.
4. **`use()` promise-prop pattern is Next-version-coupled.** The spike (§3.5) is the ratification gate; the spec deliberately does not assert the framework contract from memory.

## §6 Out of scope

- Caching/tagging either loader (§1.5).
- The identity/health/app-settings barriers (§3.4).
- Bell panel internals, needs-attention route, inbox surfaces.
- Any crew-facing or onboarding UI change beyond not issuing discarded reads.
