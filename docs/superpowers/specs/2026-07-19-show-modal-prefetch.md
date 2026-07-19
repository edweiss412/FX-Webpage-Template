# Show-modal data preloading (prefetch + revalidate-on-open)

**Date:** 2026-07-19
**Status:** Draft (design approved in conversation; autonomous ship authorized)
**Depends on:** #485 (optimistic skeleton + loader wave), #488 (exit-anim close), #492 (entrance suppression)

## 1. Problem

Opening `/admin?show=<slug>` from the dashboard pays a full RSC round-trip (slug lookup + snapshot RPC wave, `app/admin/_showReviewModal.tsx:231-239`) after every row click. #485 hides the wait behind a client skeleton; the data still arrives no earlier than click + server wave. Goal: the payload is already on the client when the click happens — first open, any-row open, and reopen all fast.

## 2. Design (approach A, ratified)

Three moves, no new data layer:

1. **Viewport prefetch.** The dashboard row `<Link>` (`components/admin/ShowsTable.tsx:529-535`) gains `prefetch={true}`. Next 16 semantics (verified against 16.2.4 docs): `prefetch={true}` fetches the **full route + data for dynamic routes** when the link enters the viewport, production builds only. The href is already param-preserving via `useShowModalNav().openHref` (`components/admin/useShowModalNav.ts:25-28` → `lib/admin/showModalParams.ts:15-21`), so the prefetched URL is byte-identical to the clicked URL — guaranteed router-cache hit.
2. **Revalidate-on-open.** `PublishedReviewModal` (client shell, `components/admin/showpage/PublishedReviewModal.tsx`) fires `router.refresh()` exactly once per mount (effect + ref guard, §5.2). The open serves the prefetched payload instantly; refresh streams fresh RSC in the background and reconciles in place.
3. **Cache posture.** No `staleTimes` override. `prefetch={true}` entries live under the client router static staleTime default of 300 s (Next 16 default; configured minimum is 30 s). Staleness at open is bounded by that window AND corrected by the mount refresh.

Out of scope: `StagedReviewCard` and bell alert links (keep default prefetch); any client-side data store (the modal carries server-rendered slots + bound server actions, `app/admin/_showReviewModal.tsx:342-364` — only router-level prefetch preserves them); `staleTimes` config changes.

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

### 3.4 Cache eviction + re-prefetch (source-verified; plan-time empirical confirmation)

Next 16.2.4 source (verified): `router.refresh()` invalidates the segment cache (`next/dist/client/components/router-reducer/reducers/refresh-reducer.js:29,42` → `segment-cache/cache.js:226`), and cache invalidation **pings visible links**, rescheduling prefetch tasks for every still-mounted dashboard row Link (`next/dist/client/components/links.js:270`). Consequences, all part of this spec's contract:

- The mount refresh evicts prefetched entries AND the still-visible rows (mounted behind the modal) re-prefetch automatically — the cache re-warms itself; no custom re-prefetch hook is needed. This is the shipped shape.
- Post-refresh traffic therefore includes re-prefetch requests — possibly including another `?show=<slug>` request for the open row's own Link. Any "how many requests" assertion MUST discriminate prefetch requests from the navigation/refresh requests via the Next prefetch request header (`Next-Router-Prefetch` / segment-cache prefetch marker — plan pins the exact header observed against the prod server) rather than counting bare URL matches.
- Stage 2 still runs the empirical probe on a real prod build to CONFIRM the source-read behavior (observed request pattern on open: refresh + re-prefetch wave) before the e2e assertions are written. If observation contradicts the source read (e.g. links do NOT re-ping), fallbacks remain: (A) explicit `router.prefetch(openHref(slug))` for visible rows after refresh settles, or (B) drop the mount refresh and set `experimental.staleTimes.static: 30` (the configured minimum). Record the observed pattern in the plan.

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
| `components/admin/showpage/PublishedReviewModal.tsx` | Once-per-mount `router.refresh()` effect (needs `useRouter` import; the file already imports `useShowModalNav` which wraps the same router). |
| `tests/e2e/published-review-modal.prefetch.spec.ts` (new) | §6 assertions; runs in `desktop-chromium` project (testMatch extension in `playwright.config.ts`), env-gated to prod servers. |
| `.github/workflows/show-modal-prefetch-e2e.yml` (new) | CI gate; `BASELINE_SERVER_ONLY=1` (:3000 CI server is `pnpm build && pnpm start` — a prod artifact), Supabase bootstrap + seed, mirrors `admin-layout-e2e.yml` (the proven :3000-prod + seeded-desktop-chromium shape). PR-triggered on the touched paths + `workflow_dispatch`. |
| Unit tests | `prefetch={true}` present on row Link; refresh-once contract (jsdom, mocked router: mount → exactly one `refresh()`, StrictMode double-mount safe). |

UI files touched → invariant 8 impeccable critique+audit dual-gate applies before cross-model review. UI work is Opus-owned (routing rule) — this run is Opus.

## 6. Test contract (e2e, prod server)

Env gate: the spec `test.skip()`s unless `MODAL_PREFETCH_E2E=1` (set by the new workflow; local runs can set it against a manually booted prod server). Rationale: desktop-chromium's :3000 webServer is `pnpm dev` locally (prefetch inert by design) — the X.5 live-audit env-gate precedent.

1. **Prefetch emitted:** dashboard load with ≥1 seeded show (`seedShowWithCrew`, `signInAs(ADMIN_FIXTURE)`, `settleDashboardAdminState` — the `published-review-modal.interactions.spec.ts:39-76` harness) produces a network request whose URL carries `?show=<slug>` with the RSC prefetch header, before any click.
2. **Cache proof (anti-tautology):** after prefetch settles, install `page.route` that **holds every subsequent** `?show=<slug>` request (the refresh); click the row; assert the LOADED modal (title node, not skeleton) renders while the route still holds. Only a cache-served payload can do that. Concrete failure mode caught: `prefetch={true}` silently dropped/downgraded → click blocks on the held request → skeleton only → test fails.
3. **Refresh once:** post-click while the modal stays open, count `?show=<slug>` requests that are NOT prefetch-marked (§3.4 header discrimination): exactly one — the refresh. Prefetch-marked re-ping requests are permitted and NOT counted. Catches both zero (dead revalidate) and per-render refresh storms.
4. **Close safety (three §3.2 cases):** (a) animated close, then release the held refresh DURING the exit window — exit completes, URL strips, modal stays gone; (b) release after the close commit — no resurrection, dashboard intact; (c) reduced-motion close then release — same. In all cases assert final state: no modal panel, URL without `show`.

Existing-suite impact (verified, not assumed): `published-review-modal.interactions.spec.ts` + `.deeplink` run in no CI workflow and locally target the dev :3000 server where prefetch is inert; additionally their `openGated` helper (`interactions.spec.ts:455-479`) installs its route **before** `page.goto`, so under a prod server prefetch requests are held by the same gate — the skeleton premise survives both ways. The plan re-runs both specs locally as regression evidence; no edits expected.

## 7. Non-goals

- Hover/intent-based prefetch (approach B) — subsumed by viewport prefetch.
- Client data store / API-route hydration (approach C) — rejected; cannot carry server slots or bound actions.
- Prefetch for `StagedReviewCard`, bell links, `/admin/show/[slug]` page.
- Any staleness UI ("data updated" toast) — refresh is silent by design.
