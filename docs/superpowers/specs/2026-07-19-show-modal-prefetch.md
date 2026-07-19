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
- A refresh landing **after the user closed** the modal must not resurrect it: close = URL commit stripping `show` (`useShowModalNav.ts:30-36`); the refreshed tree for the closed URL has no modal. The #485 pending-reset contract (`ShowsTable.tsx:315-330`, identity compare) is untouched.
- Interaction with in-flight server actions (accept/undo/archive): server actions already conclude with their own revalidation; an overlapping background refresh is a benign extra read. No new mutation surface is introduced (invariant 10 not triggered).

### 3.3 Skeleton fast-swap (transition inventory delta)

The §6.5 transition inventory (admin-show-modal spec) is unchanged — no new visual states. One pair gets a timing note: closed→open with a cache hit compresses the skeleton window to 0–2 frames; the skeleton's entrance may be cut mid-flight by the loaded swap (`animation: none`). This is the same visual as today's fast-network open and is **accepted** (do-not-relitigate: latency work cannot make the fast path slower to look smoother). CDP frame audit in the impeccable pass confirms no NEW artifact class (no opacity re-pop, which #492 pinned).

### 3.4 Cache-eviction risk (plan-time empirical gate)

Unknown pinned for Stage 2 verification on a real prod build:

- (a) Does `router.refresh()` evict **other rows'** prefetched entries?
- (b) After eviction, do still-visible Links re-prefetch, or is the cache entry gone until remount?

Decision table (single source of truth for fallbacks):

| Empirical result | Ship shape |
| --- | --- |
| Refresh keeps other entries (or visible links re-prefetch) | Ship as specced. |
| Refresh evicts and links do NOT re-prefetch | Fallback A: after refresh settles, re-run `router.prefetch(openHref(slug))` for visible rows (small client hook in `ShowsTable`); or Fallback B: drop the mount refresh, set `experimental.staleTimes.static: 30` (the configured minimum) so staleness is bounded at 30 s. Pick A unless it measurably re-fires N full waves per open; record the choice in the plan. |

### 3.5 Server cost

N visible rows × full loader wave per dashboard visit + 1 extra wave per open (refresh). Single-admin internal tool, dashboard O(10-30) rows; accepted (do-not-relitigate). No caps added; if this ever needs bounding it is a follow-up, not this spec.

## 4. Security / correctness invariants

- Prefetch responses are auth'd RSC payloads for the same admin session — no new auth surface. `requireAdmin` runs on the dashboard page per request as today.
- Archived/missing show prefetched then clicked: loader `redirect("/admin")` (`_showReviewModal.tsx:133,245`) unchanged; the pending-reset identity compare already handles the redirect-to-same-URL case.
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
3. **Refresh once:** count `?show=<slug>` RSC requests post-click while the modal stays open: exactly one (the refresh). Catches both zero (dead revalidate) and per-render refresh storms.
4. **Close safety:** open → close immediately (before releasing the held refresh) → release → modal stays closed, no resurrection, dashboard intact.

Existing-suite impact (verified, not assumed): `published-review-modal.interactions.spec.ts` + `.deeplink` run in no CI workflow and locally target the dev :3000 server where prefetch is inert; additionally their `openGated` helper (`interactions.spec.ts:455-479`) installs its route **before** `page.goto`, so under a prod server prefetch requests are held by the same gate — the skeleton premise survives both ways. The plan re-runs both specs locally as regression evidence; no edits expected.

## 7. Non-goals

- Hover/intent-based prefetch (approach B) — subsumed by viewport prefetch.
- Client data store / API-route hydration (approach C) — rejected; cannot carry server slots or bound actions.
- Prefetch for `StagedReviewCard`, bell links, `/admin/show/[slug]` page.
- Any staleness UI ("data updated" toast) — refresh is silent by design.
