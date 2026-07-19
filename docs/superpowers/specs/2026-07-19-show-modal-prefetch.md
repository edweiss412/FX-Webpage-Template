# Show-modal data preloading (prefetch + revalidate-on-open)

**Date:** 2026-07-19
**Status:** Draft (design approved in conversation; autonomous ship authorized)
**Depends on:** #485 (optimistic skeleton + loader wave), #488 (exit-anim close), #492 (entrance suppression)

## 1. Problem

Opening `/admin?show=<slug>` from the dashboard pays a full RSC round-trip (slug lookup + snapshot RPC wave, `app/admin/_showReviewModal.tsx:231-239`) after every row click. #485 hides the wait behind a client skeleton; the data still arrives no earlier than click + server wave. Goal: the payload is already on the client when the click happens — first open, any-row open, and reopen all fast.

## 2. Design (approach A, ratified)

Three moves, no new data layer:

1. **Viewport prefetch.** BOTH dashboard modal-opening row Links gain `prefetch={true}`: the active-bucket row (`components/admin/ShowsTable.tsx:529-535`, href via `useShowModalNav().openHref` — `components/admin/useShowModalNav.ts:25-28` → `lib/admin/showModalParams.ts:15-21`) and the archived-bucket row's Open link (`components/admin/ArchivedShowRow.tsx:75-79`, server-rendered literal `/admin?bucket=archived&show=<slug>` href). Next 16 semantics (verified against 16.2.4 docs): `prefetch={true}` fetches the **full route + data for dynamic routes** on viewport entry, production builds only. Both hrefs are byte-identical to their clicked URLs — guaranteed router-cache hit.
2. **Revalidate-on-open.** `PublishedReviewModal` (client shell, `components/admin/showpage/PublishedReviewModal.tsx`) fires `router.refresh()` exactly once per mount (effect + ref guard, §5.2). The open serves the prefetched payload instantly; refresh streams fresh RSC in the background and reconciles in place.
3. **Cache posture.** No `staleTimes` override. `prefetch={true}` entries live under the client router static staleTime default of 300 s (Next 16 default; configured minimum is 30 s). Staleness at open is bounded by that window AND corrected by the mount refresh.

Out of scope: `StagedReviewCard` and bell alert links (keep default prefetch; they open flows other than the published modal or are rare paths); any client-side data store (the modal carries server-rendered slots + bound server actions, `app/admin/_showReviewModal.tsx:342-364` — only router-level prefetch preserves them); `staleTimes` config changes.

## 3. Behavior contract

### 3.1 Open paths (mode boundaries)

| Path | Behavior |
| --- | --- |
| Prefetched row click (prod) | URL commits from router cache in ≤2 frames; loaded modal renders immediately; #485 client skeleton may appear for 0–2 frames then swap (identical to today's fast-network open — §3.3). One background `router.refresh()` follows. |
| Cold click (prefetch missed/slow/evicted) | Exactly today's behavior: optimistic skeleton (`ShowsTable.tsx:299-344`) → server Suspense fallback → loaded swap with `entrance="none"` (`PublishedReviewModal.tsx:244`). Refresh still fires on mount (harmless second wave). |
| Reopen same show within staleTime | Served from router cache (instant), refresh revalidates. |
| Dev builds | Next disables prefetch in dev — behavior identical to today. No code path branches on env; the delta is Next's own build-mode behavior (build-time artifact decision, verified by the prod-server e2e in §6). |
| Deep link / hard load of `/admin?show=<slug>` | Unchanged (no dashboard Link involved). Refresh fires on mount — one extra wave. |

### 3.2 Refresh guarantees (guard conditions)

- Fires **once per shell mount** (ref guard; React 19 StrictMode double-effect in dev must not double-fire the network call — guard is the dedupe).
- Fires **after** mount, never during render; never awaited by UI.
- Reconciliation is an in-place prop swap: the client shell instance persists (same tree position/type), so `closing` state, scroll, expanded sections, and the one-shot `alert_id` highlight (client state) survive. Entrance does not replay — #492's `entrance="none"` governs the loaded frame, and a refresh does not remount the shell.
- A refresh landing around a close must not resurrect the modal. Close is NOT an instant URL strip: under normal motion, `ReviewModalShell.requestClose` plays the exit animation and calls `onClose` at exit-END (~220 ms; `components/admin/review/ReviewModalShell.tsx:345,389`, #488) — only then does `useShowModalNav().close` strip `show` from the URL (`useShowModalNav.ts:30-36`). Three distinct cases, each pinned (§6.4):
  1. **Refresh lands during exit** (URL still `/admin?show=<slug>`): the refreshed server tree for the OPEN URL re-renders the modal slot; reconciliation reaches the same-type/-position client shell instance, whose local `closing`/exit state must survive (props swap, not remount) — the exit completes and the URL strip follows. No visual resurrection mid-exit.
  2. **Refresh lands after the close commit** (URL is `/admin` without `show`): the refreshed tree for the closed URL has no modal slot — nothing to resurrect.
  3. **Reduced motion**: `onClose` fires immediately (exit collapsed), collapsing case 1 into case 2.
  The #485 pending-reset contract (`ShowsTable.tsx:315-330`, identity compare) is untouched.
- Interaction with in-flight server actions (accept/undo/archive): server actions already conclude with their own revalidation; an overlapping background refresh is a benign extra read. No new mutation surface is introduced (invariant 10 not triggered).

### 3.3 Skeleton fast-swap (transition inventory delta)

The §6.5 transition inventory (admin-show-modal spec) is unchanged — no new visual states. One pair gets a timing note: closed→open with a cache hit compresses the skeleton window to 0–2 frames; the skeleton's entrance may be cut mid-flight by the loaded swap (`animation: none`). This is the same visual as today's fast-network open and is **accepted** (do-not-relitigate: latency work cannot make the fast path slower to look smoother). CDP frame audit in the impeccable pass confirms no NEW artifact class (no opacity re-pop, which #492 pinned).

### 3.4 Cache invalidation + re-prefetch (source-verified AND empirically confirmed)

Next 16.2.4 source: `router.refresh()` calls `invalidateSegmentCacheEntries` (`next/dist/client/components/router-reducer/reducers/refresh-reducer.js:29,42`), which bumps `currentSegmentCacheVersion` and **pings visible links** (`segment-cache/cache.js:237,239`), rescheduling prefetch tasks for every still-mounted dashboard row Link (`links.js:270`). Entries are not deleted; they are version-staled and re-fetched by the re-ping. Empirically confirmed 2026-07-19 against a real prod build (`.next-prefetch-probe`, `scripts/dev` probe over seeded local Supabase; raw capture retained in the plan dir):

- **Open is cache-served:** loaded modal visible ~97 ms after row click (no navigation request precedes it); the mount refresh fires ~45 ms post-click; the re-ping wave for still-visible rows follows within ~100 ms. The cache re-warms itself — no custom re-prefetch hook. This is the shipped shape (fallbacks A/B from earlier drafts are retired).
- **Request taxonomy (observed; documented for diagnosis, NOT load-bearing for assertions):** each `prefetch={true}` cycle per row = (i) a tree probe `GET /admin?show=<slug>` with `next-router-prefetch: 1` + `next-router-segment-prefetch: /_tree`, then (ii) an UNMARKED data request for the same URL whose `next-router-state-tree` carries a `refetch` marker — `prefetch={true}` maps to `FetchStrategy.Full`, whose data fetch deliberately sends no prefetch header (`app-dir/link.js:385,398`; `segment-cache/cache.js:1391-1403`). Navigation/refresh refetches (iii) are header-shaped like (ii); the refresh differs from a class-(ii) twin only in state-tree fine structure (`__PAGE__`-level vs root-level `refetch`, presence of `next-url`), and the probe runs show the mix varies run-to-run (e.g. with tree entries already cached, class-(ii) twins fire even when class-(i) probes are aborted — `probe/probe-settle-abort.json` vs `probe/probe-abort-variant.json`).
- **Assertion posture (consequence of the above):** exact network-request counting is version- and run-fragile, so the **refresh-once guarantee is pinned at the component level** (unit test: exactly one `router.refresh()` per mount, StrictMode-safe — the storm's source is the effect, and the unit test kills it at the source). E2e asserts network-level **presence and boundedness** only (§6), never exact counts or state-tree fine structure.

### 3.5 Server cost

Per dashboard visit: N visible rows × full loader wave (initial prefetch). Per open: 1 refresh wave + up to N re-prefetch waves (the §3.4 re-ping — eager cache re-warm). Single-admin internal tool, dashboard O(10-30) rows; accepted with the re-ping cost stated (do-not-relitigate). No caps added; if this ever needs bounding it is a follow-up, not this spec.

## 4. Security / correctness invariants

- Prefetch responses are auth'd RSC payloads for the same admin session — no new auth surface. `requireAdmin` runs on the dashboard page per request as today.
- Missing/blocked show prefetched then clicked: loader `redirect("/admin")` (`_showReviewModal.tsx:133` absent slug row; `:245` `not_admin_or_missing`) unchanged; the pending-reset identity compare already handles the redirect-to-same-URL case. **Archived** shows do NOT redirect — they render the read-only modal (`_showReviewModal.tsx:263,355`; admin-show-modal spec §6), and prefetching one is as valid as opening it.
- No DB, no migrations, no advisory locks, no email boundaries, no new error codes (invariants 2,3,5 untouched; nothing for the §12.4 catalog).
- Supabase call-boundary discipline (invariant 9): no new Supabase call sites.

## 5. Implementation surfaces

| Surface | Change |
| --- | --- |
| `components/admin/ShowsTable.tsx` | `prefetch={true}` on the row `<Link>` (line 529 block). |
| `components/admin/ArchivedShowRow.tsx` | `prefetch={true}` on the Open `<Link>` (line 75 block). |
| `components/admin/showpage/PublishedReviewModal.tsx` | Once-per-mount `router.refresh()` effect (needs `useRouter` import; the file already imports `useShowModalNav` which wraps the same router). |
| `tests/e2e/published-review-modal.prefetch.spec.ts` (new) | §6 assertions; `desktop-chromium` project (testMatch extension in `playwright.config.ts`), env-gated to prod servers (`MODAL_PREFETCH_E2E=1`). |
| `.github/workflows/published-modal-e2e.yml` (#493, EXISTING) | The new spec JOINS this workflow (added to its run line + `MODAL_PREFETCH_E2E: "1"` env): it already boots the :3000 CI prod server (`BASELINE_SERVER_ONLY=1`, `pnpm build && pnpm start`), bootstraps + seeds Supabase, and PR-triggers on exactly this feature's paths (`ShowsTable.tsx`, `showpage/**`, `_showReviewModal.tsx`, `playwright.config.ts`, …). No new workflow. |
| Unit tests | `prefetch={true}` present on BOTH row Links (ShowsTable + ArchivedShowRow); refresh-once contract (jsdom, mocked stable-spy router: mount → exactly one `refresh()`, StrictMode double-mount safe — this is the §3.4 exact-once oracle). |

UI files touched → invariant 8 impeccable critique+audit dual-gate applies before cross-model review. UI work is Opus-owned (routing rule) — this run is Opus.

## 6. Test contract (e2e, prod server)

Env gate: the spec `test.skip()`s unless `MODAL_PREFETCH_E2E=1` (set by the new workflow; local runs can set it against a manually booted prod server). Rationale: desktop-chromium's :3000 webServer is `pnpm dev` locally (prefetch inert by design) — the X.5 live-audit env-gate precedent.

1. **Prefetch emitted:** dashboard load with ≥1 seeded show (`seedShowWithCrew`, `signInAs(ADMIN_FIXTURE)`, `settleDashboardAdminState` — the `published-review-modal.interactions.spec.ts:39-76` harness) produces, before any click, a `?show=<slug>` request of class (i) or (ii) (§3.4 taxonomy) for a seeded row.
2. **Cache proof (anti-tautology):** after prefetch settles, install `page.route` that **holds every subsequent** `?show=<slug>` request; click the row; assert the LOADED modal (title node, not skeleton) renders while the route still holds. Only a cache-served payload can do that. Concrete failure mode caught: `prefetch={true}` silently dropped/downgraded → click blocks on the held navigation → skeleton only → test fails.
3. **Refresh wired + bounded (presence/boundedness per §3.4 posture):** after prefetch settles, click; within the post-open observation window assert (a) at least one `?show=<open-slug>` request fires AFTER the modal is visible (the revalidate reaches the network in prod — dead-refresh detector) and (b) the total `?show=<open-slug>` request count over the window stays under a small documented bound (≤ 4: nav-free cache open + refresh + re-warm probe/twin pair; a per-render refresh storm produces dozens). Exact-one is asserted at the unit level (§5), not here.
4. **Close safety (three §3.2 cases):** (a) animated close, then release the held refresh DURING the exit window — exit completes, URL strips, modal stays gone; (b) release after the close commit — no resurrection, dashboard intact; (c) reduced-motion close then release — same. In all cases assert final state: no modal panel, URL without `show`.

Existing-suite impact (MANDATORY audit — landscape changed by #493): `published-modal-e2e.yml` now runs `published-review-modal.interactions` + `.deeplink` + `.layout` against the :3000 **CI prod server**, where this feature's prefetch is ACTIVE — and that workflow PR-triggers on this feature's own paths, so the audit gates this PR's CI. Known-good: the `openGated` helper (`interactions.spec.ts:455-479`) installs its URL-matched route **before** `page.goto`, so prefetch requests for the gated slug are held by the same gate (held prefetch = cold click path = premise preserved). The plan MUST enumerate every test in those three specs whose oracle assumes a cold open (skeleton presence, entrance timing, close-during-stream) and give each either (a) a verified prefetch-immunity argument or (b) a prefetch-neutralizing init route (abort `?show=<slug>` requests until the click). Verification is the workflow's own real-CI run on this PR, not local dev-server green (prefetch inert in dev — the #492 dev-green/prod-broken lesson this workflow exists to catch).

## 7. Non-goals

- Hover/intent-based prefetch (approach B) — subsumed by viewport prefetch.
- E2e coverage of the archived-bucket Open link (same mechanism as the active row; unit-level prop pin only).
- Client data store / API-route hydration (approach C) — rejected; cannot carry server slots or bound actions.
- Prefetch for `StagedReviewCard`, bell links, `/admin/show/[slug]` page.
- Any staleness UI ("data updated" toast) — refresh is silent by design.
