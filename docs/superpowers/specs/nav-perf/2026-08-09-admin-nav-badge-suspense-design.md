# Admin nav badge Suspense streaming — design

**Date:** 2026-08-09 · **Ledger:** `BL-ADMIN-NAV-BADGE-SUSPENSE-STREAMING` (BACKLOG.md) · **Branch:** `feat/admin-nav-badge-suspense` · **Prior art:** `docs/superpowers/specs/nav-perf/2026-06-23-nav-perf-phase2-ui-feedback.md` (E-lite, the descoped half)

## §0 Summary

Move the admin layout's two badge reads — `loadBellUnseenCount` and `loadNeedsAttentionCount` — out of the layout's blocking await path, so first `/admin` entry paints the nav chrome immediately and the badge counts stream in afterwards. The mechanism (redesigned in spec R1) is promise-as-prop with the commit INSIDE the existing hooks behind their monotonic tokens — no `<Suspense>` boundary and no `use()` leaf, because the resolved counts drive behavior far beyond a chip (trigger branch, aria-labels, `zeroNow()`, panel refetch), so nothing may suspend (R1 F1). The ledger entry's named mechanism was Suspense; the entry's GOAL — chrome paints before the badge reads — is what ships, and this spec records why a Suspense boundary is the wrong tool on this surface. Plus one independent win the research surfaced: the onboarding early-return branch currently pays both badge awaits and then discards them — it stops issuing those reads at all.

The backlog entry's premise "the repo has zero `<Suspense>` precedent" is STALE: real boundaries ship in the admin tree today (`app/admin/page.tsx` `ShowReviewModalSkeleton` fallback; `app/admin/dev/telemetry/page.tsx`; `app/admin/dev/telemetry-dim/page.tsx`). Half the entry's promotion prerequisite is already met; the other half (an AdminNav bridge preserving the client refetch hook) is this design.

## §1 Resolved scope — do not relitigate

1. **`Promise.all` stays `Promise.all`** where reads remain grouped — never `allSettled` (nav-perf phase-2 §invariant-9 line, ratified there). This design removes the barrier for the two badge reads; it does not change failure semantics: both loaders RETURN discriminated results (`{ kind: "ok" } | { kind: "infra_error" }`-class) rather than throwing, per invariant 9, and that contract is what makes the un-awaited-promise pattern safe (§3.2).
2. **The client refetch contract is preserved:** `useNeedsAttentionBadge` (prop-sync effect + pathname effect + monotonic token + AbortController, fail-quiet `setCount(null)` per ratified D-4) and `useBellBadge` (including `degraded`, `zeroNow()`, `pingSignal`, panel `onOpened` refetch) keep ALL their observable semantics. Each hook gains exactly one new arm — an async initial-seed that commits a resolved promise value through the SAME token gate its other commit sources use. No component moves; no hook state leaves its current owner (R1 F1).
3. **Badge render rules unchanged:** hidden unless finite > 0, "9+" cap, `admin-attention-badge` testid; bell unchanged visually except arrival timing.
4. **Selected mechanism: promise-as-prop committed inside the hooks** (§3.2, redesigned per R1 — no Suspense, no `use()`), validated by a mandatory spike task before implementation (§3.5). The client-side first-fetch seeding alternative is the recorded fallback, not a parallel deliverable.
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

### 3.2 Streaming bridge: promise-as-prop, committed inside the hooks (redesigned per R1)

The layout ISSUES both reads without awaiting, wraps each so it can NEVER reject (`.catch(() => ({ kind: "infra_error" as const }))` — both loaders already return discriminated results by contract; the wrap is belt for thrown infra), and passes the promises to the client tree:

```tsx
// layout (server): no await, no barrier
const bellCountPromise = loadBellUnseenCount(adminEmail, viewerIsDeveloper).catch(() => ({ kind: "infra_error" as const }));
const attentionCountPromise = loadNeedsAttentionCount().catch(() => ({ kind: "infra_error" as const }));
<AdminNav ... bellCountPromise={bellCountPromise} attentionCountPromise={attentionCountPromise} />
```

`AdminNav` and `NotifBell` mount IMMEDIATELY — nothing suspends, no Suspense boundary exists on this surface. Each hook gains an async-seed arm:

- On mount, state is the pending shape: attention count `null` (chip hidden by the existing finite-gt-0 gate), bell count `null` + `degraded: false` (bell button renders, no chip, no `!`).
- An effect subscribes: `promise.then((value) => ingestPropValue(value))` where `ingestPropValue` is the hook's EXISTING synchronous prop-ingestion path — NOT a new commit source (spec R2 F1). For the attention badge that path commits directly through the monotonic token; for the bell it carries the pinned post-zero demotion: after `zeroNow()` has fired, a prop-delivered value is NEVER committed directly but demoted to a fresh fetch (`useBellBadge.ts` post-zero contract, pinned by `useBellBadge.test.tsx`), so a refresh-cycle promise resolving with a pre-open count cannot resurrect it. A late-resolving seed additionally LOSES to every newer commit via the token (R1 F2's clobber direction). One rule, stated once: a resolved promise value is processed by exactly the code path a synchronous prop change takes today — any future prop-handling nuance carries over automatically.
- All downstream consumers — the bell trigger branch, count-aware `aria-label`s (including the parent link's in `AdminNav`), `zeroNow()`'s synchronous zero, `pingSignal`, the panel's `onOpened` refetch — keep reading hook state exactly where they read it today. The pending window is observationally "count unknown", which every existing render gate already handles.
- Bell `infra_error` resolution commits `degraded: true` → the existing catalog-derived `!` trigger renders exactly as today (R1 F3 — the bell's degraded affordance is pinned by `notifBell.test.tsx` / `AdminNav.test.tsx` and is PRESERVED; fail-quiet-hidden is the ATTENTION badge's ratified contract only).

Why the hooks own the pending state instead of a suspended leaf: the R1 probes showed the resolved counts drive behavior OUTSIDE any leaf (trigger branch, parent-link aria-label, zeroNow-before-resolution), and a pre-mount navigation would initialize `lastPathRef` on the destination and skip the initial fetch, silently persisting a stale count. With the hooks mounted from first paint, the pathname effect is live for the entire pending window: navigation during pending fires the refetch exactly as today, and the token gate decides the winner deterministically.

Interleavings (each gets a test, AC-5):

| Order | Outcome |
| --- | --- |
| seed resolves, then navigation | seed commits; pathname refetch then overwrites — today's behavior |
| navigation, then seed resolves | pathname refetch committed (token bumped); late seed DISCARDED |
| bell clicked (zeroNow) before seed resolves | zero commits + token bump; late seed DISCARDED; panel `onOpened` refetch proceeds as today |
| seed resolves `infra_error` (bell) | `degraded: true`, `!` trigger — unchanged affordance |
| seed never resolves (hung read) | pending shape persists; first pathname refetch repopulates; no wedge |

### 3.3 What the user sees

First `/admin` entry: nav chrome (links, health, avatar, bell button) paints without waiting on the two badge queries; the attention badge and bell count chip pop in when their reads land. Failure: the attention badge stays hidden (its ratified fail-quiet contract); the bell renders its existing degraded `!` trigger (its ratified contract — the two differ deliberately, R1 F3). No spinner anywhere.

### 3.4 Layout barrier inventory (measured, mostly untouched)

The identity/health barrier and app-settings/finalize awaits remain (out of scope §1.5); this arc removes only the badge barrier (~:152-155) and the onboarding waste. Recorded so the reviewer doesn't re-derive "but there are other awaits" — yes, and they gate auth and chrome data the nav genuinely needs before painting.

### 3.5 Spike task (mandatory, before implementation tasks)

Per the empirical-spike rule (stateful/framework surface): a throwaway probe in this worktree proves, in `next dev` AND `next build && next start`, that (a) a `force-dynamic` layout passing an unresolved promise prop to a client component actually STREAMS the resolution (chrome flushes before the count resolves, and the client thenable resolves when the RSC stream delivers — verified with an artificially slow loader), (b) no hydration error or double-fetch, and consuming the promise via `.then` in an effect (NOT `use()`) works on the shipped Next version, (c) the pathname refetch still fires on navigation, including a navigation issued BEFORE the promise resolves (the R1 F2 interleaving). The spike's measurements go into the plan verbatim. If promise-prop streaming does NOT hold under `force-dynamic` (framework contract UNRATIFIED until probed), the fallback is client-side seeding: mount with null and let the FIRST pathname-effect-style fetch populate both counts (one extra request, zero framework coupling), and the spec's §3.2 is amended by one commit before planning proceeds.

### 3.6 Dimensional Invariants

None introduced: the badge chip and bell count are inline/absolutely-positioned chips inside the existing nav bar; no fixed-dimension parent gains flex/grid children, and streaming arrival must cause zero layout shift (AC-2's chrome assertion covers presence; the plan's CLS check covers shift). Declared explicitly per the self-review rule.

### 3.7 Transition Inventory

Attention chip states: pending (null, hidden), hidden (resolved 0 or infra_error), visible (count > 0). Bell states: pending (no chip, not degraded), count chip, degraded `!` (infra_error) — the bell's degraded state is part of its pinned contract, not a new state.

| Transition | Treatment |
| --- | --- |
| pending to hidden | instant, and visually identical for the attention chip: both render nothing |
| pending to visible | instant appearance on seed resolution; no animation (chip is additive, no shift) |
| pending to degraded (bell, infra_error) | instant; the existing `!` trigger recipe, unchanged |
| visible to hidden (refetch lands 0 / fail-quiet null) | instant, existing hook behavior, unchanged |
| hidden to visible (refetch lands > 0) | instant, existing hook behavior, unchanged |
| compound: pathname refetch fires while the seed promise is still pending | fully specified in the §3.2 interleaving table: the refetch commits and bumps the token; the late seed is discarded; asserted in AC-5's integration tests |
| compound: layout re-render mid-stream (router.refresh) | new promise props arrive; the seed arm re-subscribes; each resolution is processed by the hook's existing prop-ingestion path (bell: post-zero demotion applies) |
| compound: refresh promise pending, bell opened + zeroed, restoring fetch commits 0, THEN refresh promise resolves with the pre-open count | the resolved value is DEMOTED to a fresh fetch by the bell's post-zero prop contract — the stale pre-open count is never painted (spec R2 F1; test required, AC-5) |

## §4 Acceptance criteria

- **AC-1** Onboarding path issues ZERO badge-loader calls (spy/source assertion), and its UI is unchanged.
- **AC-2** `/admin` layout render does not await either badge loader (source-scan: no `await` on the two call expressions; behavioral: chrome testids present before slow-loader resolution in the spike-derived e2e or RTL-with-suspended-promise test).
- **AC-3** Attention chip renders post-seed with correct count, "9+" cap, hidden on `infra_error` and on 0 — the existing render-gate tests keep passing unmodified.
- **AC-4** Bell button paints without the count; count chip arrives on seed resolution; `infra_error` seed renders the existing degraded `!` trigger; `zeroNow()`, `pingSignal`, and panel `onOpened` refetch behave byte-identically to today (existing `notifBell.test.tsx` contract tests keep passing unmodified).
- **AC-5** Every §3.2/§3.7 interleaving row has a test: seed-then-navigate, navigate-then-seed (late seed discarded), zeroNow-before-seed (late seed discarded), infra_error seed (bell degraded), hung seed (pathname refetch repopulates), AND refresh-promise-resolves-after-zeroNow (value demoted to fresh fetch, stale pre-open count never painted). Existing pathname-refetch and post-zero-demotion tests keep passing unmodified.
- **AC-6** No raw error codes in UI (invariant 5): attention failure renders nothing (D-4 fail-quiet); bell failure renders the existing catalog-derived degraded trigger — both ratified contracts, unchanged.
- **AC-7** Impeccable dual-gate on the diff (UI surface); `impeccable-gate:` marker in closeout.
- **AC-8** Full suite + real CI green; cross-model whole-diff review APPROVE.

## §5 Documented limits

1. **Badge arrival is now visibly async** on slow reads — a chip popping in ~hundreds of ms after chrome. Accepted: that is the feature. No skeleton, because a skeleton for a maybe-hidden chip advertises noise.
2. **A thrown-infra bell read maps to `infra_error`** via the layout wrap (§3.2), which the hook commits as `degraded: true` — the bell's EXISTING degraded affordance, not a hidden state (R1 F3). The attention badge's parallel case stays hidden per D-4. Two surfaces, two ratified postures, both preserved.
3. **The other layout barriers remain** (§3.4). First-paint is bounded below by identity+health, by design.
4. **Promise-prop streaming is Next-version-coupled.** The spike (§3.5) is the ratification gate; the spec deliberately does not assert the framework contract from memory, and the no-framework fallback (client-side first-fetch seeding) is recorded in §3.5.

## §6 Out of scope

- Caching/tagging either loader (§1.5).
- The identity/health/app-settings barriers (§3.4).
- Bell panel internals, needs-attention route, inbox surfaces.
- Any crew-facing or onboarding UI change beyond not issuing discarded reads.
