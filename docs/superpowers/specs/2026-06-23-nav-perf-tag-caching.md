# Spec — Nav-perf: tag-based caching of getShowForViewer (`BL-NAV-PERF-TAG-CACHING`)

**Date:** 2026-06-23
**Slug:** nav-perf-tag-caching
**Status:** Draft → self-review → Codex adversarial review → execution (autonomous ship)
**Milestone:** Nav-performance follow-up (the deferred caching item). Phases 1+2 (PRs #85/#86), crew client-toggle (#90), crew-e2e CI (#93) shipped.
**Implementer/Reviewer:** Opus (Claude Code). Codex adversarial-reviews. Server/data + meta-test work (no rendered UI → invariant 8 N/A unless a component changes).

---

## 1. Problem & goal

Every crew/preview render re-runs `getShowForViewer(showId, viewer)` — a fan-out of ~9 Supabase reads (shows, crew_members ×2, hotel_reservations, rooms, transportation, contacts, shows_internal ×2, + the version-token RPC) (`lib/data/getShowForViewer.ts:244-743`). Phase 1 parallelized it; the client-toggle milestone (#90) removed the per-section-tab re-run. It now runs on: **initial load, hard reload, and every realtime `router.refresh()`**. **Goal:** serve those from a tag-invalidated cache so a load/reload/refresh with no intervening write skips the DB fan-out — with **near-zero staleness** (user-chosen option B), i.e. the crew page never lags the source sheet.

## 2. Feasibility (verified, citations)

- `getShowForViewer` uses `createSupabaseServiceRoleClient()` (`getShowForViewer.ts:245`) — NOT the cookie-bound client. It reads **no** `cookies()`/`headers()`/`Date`/`now()` (it is request-scope-INDEPENDENT) and is pure (no writes). → It is safe to run inside `unstable_cache` (whose callback runs outside request scope). Per-viewer filtering (financials/hotel by viewer) is done in its own code, not RLS (service role bypasses RLS), so a `(showId, viewer)`-keyed cache is correct.
- API: **`unstable_cache`** (Next 16.2.4), NOT `use cache` — `use cache` requires `experimental.cacheComponents`/`dynamicIO`, which is NOT enabled (`next.config.ts` has only `authInterrupts`); enabling it is an app-wide caching-semantics change, out of scope.
- Cache key cardinality: per-show **per-viewer** (financials/hotelReservations/viewerName/viewerFlightInfo vary by viewer — `getShowForViewer.ts:577-610,654-659`). Key = `(showId, viewer.kind, viewer.crewMemberId ?? "admin")`. One **tag** per show (`show-${showId}`) busts all viewers of that show.
- Call sites (all 3 covered by caching the function): crew page `app/show/[slug]/[shareToken]/page.tsx:126,155`; admin preview `app/admin/show/[slug]/preview/[crewId]/page.tsx:198`.

## 3. THE freshness hazards (load-bearing — this is why option B is "high risk")

### 3.1 viewerVersionToken must stay LIVE (infinite-refresh-loop hazard)
`getShowForViewer` returns `viewerVersionToken` (the version-token RPC, `:621`), and `_CrewShell.tsx:349` passes it to `ShowRealtimeBridge renderVersion={data.viewerVersionToken}`. The bridge compares the **live** token (`fetchCurrentVersion`, `ShowRealtimeBridge.tsx:163-179`) to this **rendered** token; on mismatch it `router.refresh()`es. **If the token were cached**, `router.refresh` would re-serve the stale token → live≠rendered forever → **infinite refresh loop**.
→ **Design rule:** cache only the expensive **data** reads; fetch `viewerVersionToken` **LIVE on every render** (outside the cache). `getShowForViewer = { ...await cachedData(showId, viewer), viewerVersionToken: await liveVersionToken(showId) }`. This also makes **auth-only** changes correct: an auth event bumps the token (no show-data write → cache NOT revalidated → cached data served, which is correct because the data didn't change) and the live token resolves the bridge compare → no loop, no staleness.

### 3.2 router.refresh() serves cached data → every write MUST revalidateTag (coverage hazard)
`router.refresh()` re-renders but `unstable_cache` returns the cached result unless the tag was revalidated. The realtime freshness path is `<write> → publishShowInvalidation → realtime broadcast → browser router.refresh`. For the refreshed render to be FRESH, `revalidateTag(show-${showId})` MUST fire **in the Next runtime, before the broadcast**. A DB trigger (Postgres) **cannot** call `revalidateTag` — so any write whose only freshness signal is a DB trigger would serve stale cache. **Every show-data write must call `revalidateTag(show-${showId})` from Next-runtime code.** Coverage is enforced by a **meta-test** (§6).

## 4. Design

### 4.1 Split getShowForViewer
- New internal `getShowDataForViewerCached(showId, viewer)` — the §2 reads MINUS the version-token, wrapped:
  ```
  unstable_cache(
    (showId, viewer) => readShowDataForViewer(showId, viewer),   // the pure fan-out
    ["getShowForViewer", showId, viewer.kind, viewer.crewMemberId ?? "admin"],  // key parts
    { tags: [`show-${showId}`], revalidate: 300 },                 // tag + backstop TTL (§4.3)
  )
  ```
  (Per Next `unstable_cache` semantics, dynamic key parts go in the keyParts array, not just closure capture — pass `showId`+viewer into keyParts so distinct shows/viewers are distinct entries.)
- `getShowForViewer(showId, viewer)` (public, unchanged signature/return) = `{ ...await getShowDataForViewerCached(showId, viewer), viewerVersionToken: await readViewerVersionToken(showId) }`. The token read is the existing RPC, called LIVE (never cached).
- `tileErrors` are part of the cached data (a read that errored is cached as its empty/`infra_error` shape; the backstop TTL + a write's revalidate re-attempt it — acceptable, matches today's per-render best-effort). [self-review: confirm caching a transient tileError for ≤300s is acceptable vs forcing token-live for it too — decide in plan.]

### 4.2 Tag + invalidation — placement is in the Next-runtime WRITE paths, NOT via publishShowInvalidation
- One tag: `show-${showId}`. `revalidateTag(\`show-${showId}\`)` busts ALL viewers of that show (correct: a show-data change affects every viewer's projection).
- **`publishShowInvalidation` is NOT a usable chokepoint** (Codex R1 finding, verified): the JS `publishShowInvalidation` (`lib/realtime/showInvalidation.ts:33`) is an OPTIONAL injected dep in the cron sync (`runScheduledCronSync.ts:286,1813` — `args.deps.publishShowInvalidation?.()`), and the **production** cron route does NOT inject it (`app/api/cron/sync/route.ts:10` passes only `{ logSync }`). The production realtime broadcast fires **Postgres-side** — DB triggers on `crew_members`/`crew_member_auth` (`publish_show_invalidation_after_statement`) + the SQL function `public.publish_show_invalidation` called from inside SECURITY DEFINER RPCs. **Postgres cannot call `revalidateTag` (a Next-runtime API).** So co-locating `revalidateTag` with the JS publisher would NEVER fire in prod cron → permanently stale cache.
- **Correct placement:** add `revalidateTag(\`show-${showId}\`)` in each **Next-runtime write path** — the code that runs in a route handler / server action and mutates a getShowForViewer-read table (directly or via an RPC it `await`s). The write always runs in Next even when the *broadcast* is Postgres-side; that Next code is where revalidateTag belongs. There is no single shared chokepoint, so coverage is per-site and the **meta-test (§6) is mandatory**, not optional. The §5 matrix enumerates every site.
- **Ordering:** `revalidateTag` must run before/independently of the realtime broadcast so the browser's subsequent `router.refresh()` reads the busted cache. Since the Next write code calls `revalidateTag` synchronously after its write (and before returning to the client / before any broadcast it triggers), this holds. For Postgres-side broadcasts (DB trigger), the Next write code's `revalidateTag` and the trigger's pg_notify are concurrent but both follow the committed write; the 300s backstop (§4.3) covers the rare race where a refresh lands before revalidateTag completes.

### 4.3 Backstop TTL (defense-in-depth, NOT the primary mechanism)
`revalidate: 300` (5 min) on `unstable_cache` is a SAFETY NET: if a revalidateTag site is ever missed, the cache self-heals within 5 min (bounded staleness) instead of staying stale indefinitely. The PRIMARY freshness is tag invalidation (near-zero). The TTL caps the blast radius of a coverage gap. (Tune in plan; 300s is the proposed default.)

## 5. Write-site coverage matrix (from the live-code audit — every cell MUST revalidateTag(show-${showId}) or be exempt-with-reason)

**Placement principle (per §4.2):** the "Next-runtime hook" column names the route handler / server action that runs the write (or `await`s the writing RPC) — that is where `revalidateTag(\`show-${showId}\`)` goes. The "broadcast" column is informational (it's how the realtime bridge is signaled today, often Postgres-side); it is NOT where revalidateTag goes.

| Write surface | writing code (file:line) | Tables (getShowForViewer-read) | Next-runtime hook for revalidateTag | Realtime broadcast today | Action |
|---|---|---|---|---|---|
| Cron sync apply (crew/hotel/rooms/transport/contacts/shows_internal/shows) | `runScheduledCronSync.ts:969-1401` (via `applyParseResult.ts:127-186`) | crew_members, hotel_reservations, rooms, transportation, contacts, shows_internal, shows | `app/api/cron/sync/route.ts` → the per-changed-show apply tail (Next runtime; loops shows → revalidate each changed showId) | DB triggers on crew_members (+ JS publisher when injected, which prod cron does NOT) | ADD revalidateTag per changed show in the apply tail; thread the changed-show set out of runScheduledCronSync |
| Push/webhook sync apply | `lib/sync/runPushSyncForShow.ts` via `app/api/drive/webhook/route.ts` | same as cron | the webhook route's apply tail | DB triggers | ADD revalidateTag(changed show) |
| Onboarding finalize / staged apply | `app/api/admin/onboarding/{finalize,finalize-cas}/route.ts`, `.../staged/[…]/apply/route.ts` | crew_members, shows, etc. | each onboarding apply route | DB triggers | ADD revalidateTag(show) |
| Diagram promote | `promoteSnapshot.ts:159-401` (called from its Next route) | shows (diagrams) | the route that invokes promoteSnapshot | **none** ✗ | ADD revalidateTag(show) at the Next caller |
| Unpublish/undo | `unpublishShow.ts:146-260` (token redemption route + in-app undo action) | shows | the unpublish API route + the undo server action | JS `publishShowInvalidation` (`:260`) IS called here (tx method) | ADD revalidateTag(show) at the Next caller (do NOT rely on the tx publisher) |
| Admin publish/archive/unarchive/undo | `lib/showLifecycle/{publishShow,archiveShow,unarchiveShow}.ts` called from `app/admin/show/[slug]/_actions/{publish,archive,unarchive,undoAutoPublish}.ts` | shows | the `_actions/*` server actions (they already `revalidatePath`; add `revalidateTag` beside it) | RPC-side `publish_show_invalidation` (archive/unarchive RPCs) | ADD revalidateTag(show) in each action |
| Feed approve/reject/undo (MI-11) | `app/admin/show/[slug]/_actions/feed.ts:51-94` (→ phase-2 apply) | multiple | the feed server actions | apply path | ADD revalidateTag(show) in each action |
| Picker select/clear identity | `lib/auth/picker/{selectIdentity,clearIdentity}.ts` | crew_member_auth (NOT show data; bumps version token only) | n/a | revalidatePath(show route) | **EXEMPT** — auth-only, no show-data change; the live token (§3.1) handles freshness without a data-cache bust |
| Share-token rotate / picker-epoch reset | RPCs `rotate_show_share_token` (`…share_token.sql`), `reset_picker_epoch_atomic` (`20260523000003…:38`) | shows.picker_epoch/share_token (picker/auth columns; NOT rendered in the crew DATA projection) | the admin action that `await`s the RPC | RPC-side `publish_show_invalidation` | **EXEMPT** — picker/auth columns, not crew-data; projection doesn't surface them. (Document; if a future projection reads picker_epoch, add revalidateTag.) |
| Validation reset/reseed | `app/admin/settings/_actions/validationReset.ts` | validation shows (ephemeral) | the reset/reseed actions | revalidatePath(/admin) | ADD revalidateTag(show) per affected id (or coarse) — validation-only, low stakes |

Plan turns each row into a concrete edit or an `// not-subject-to-revalidate: <reason>` exemption, and the meta-test (§6) walks the registry. **Threading the changed-show set:** `runScheduledCronSync` currently signals per-show via the injected publisher; the plan must surface the set of shows whose data actually changed (per run) to the route so the route revalidates exactly those tags (not a blanket bust).

## 6. Meta-test inventory (structural coverage guard — mandatory)
NEW `tests/db/showCacheRevalidateCoverage.test.ts` (registry-style, mirrors `_metaInfraContract`): a registry of every "writes a getShowForViewer-read table" surface. The test asserts each registered file either calls `revalidateTag` with a `show-`-prefixed tag (grep-shape) OR carries an `// not-subject-to-revalidate: <reason>` exemption. New write sites must add a row or the test fails — this is the structural defense that makes "near-zero staleness" durable against future drift (the §3.2 coverage hazard). Because there is NO single shared chokepoint (§4.2 — `publishShowInvalidation` is not prod-wired), the registry must enumerate every Next-runtime write path from §5; the test walks each registered file for a `show-`-tagged `revalidateTag` call or an explicit exemption comment.

## 7. Testing strategy (TDD per task) — concrete failure modes
- **Cache hit/miss:** two `getShowForViewer(showId, viewer)` calls with no intervening write issue the DB fan-out ONCE (spy the service-role client's `.from`/`.rpc`; assert the data reads happen once, the **version-token RPC happens BOTH times** — proving the token is live, the data is cached). Failure caught: token accidentally cached (the loop hazard) OR data not cached.
- **revalidateTag busts:** call → `revalidateTag(show-X)` → call again → data fan-out re-issued, fresh result. Failure caught: tag not wired / wrong tag string.
- **Per-viewer isolation:** `(showId, crewA)` vs `(showId, crewB)` vs `(showId, admin)` are distinct cache entries (different financials/hotel); busting `show-X` busts all three. Failure caught: key collision (one viewer sees another's financials — a SECURITY bug) or under-keying.
- **No-loop / live token:** the returned `viewerVersionToken` reflects the LIVE RPC on every call even when data is cached (assert the token RPC is invoked per call). Failure caught: §3.1 refresh loop.
- **Write-site coverage meta-test (§6).**
- **Each write-site:** the targeted write (e.g. diagram promote, admin archive) calls `revalidateTag(show-${showId})` (spy `next/cache` revalidateTag). Derive the show id from the fixture.
- Full suite green; tsc/lint/format clean. **No e2e/UI change** (data layer) — invariant 8 N/A. (If a component import changes, run the crew-e2e job.)

## 8. Risks / watchpoints (pre-load the reviewer)
- **#1 STALENESS (option B contract):** the coverage matrix (§5) must be complete; the meta-test (§6) is the durable guard. A missed write site = crew page stale vs sheet for up to the 300s backstop. DO NOT relitigate the backstop TTL as "weakening" — it is defense-in-depth UNDER the tag invalidation, not instead of it.
- **#2 viewerVersionToken stays LIVE (§3.1)** — never cache it; the split is non-negotiable (infinite-refresh-loop).
- **revalidateTag ordering:** must fire in the Next runtime after the committed write and independently of the realtime broadcast (§4.2). The Next write code calls it synchronously after its write.
- **`publishShowInvalidation` is NOT the chokepoint (Codex R1):** it is a test-injected optional dep, NOT wired in the prod cron route (`app/api/cron/sync/route.ts:10`); production broadcasts Postgres-side (DB triggers + SQL RPCs) which cannot call `revalidateTag`. revalidateTag therefore lives per-Next-write-path (§4.2/§5), and the meta-test (§6) is the only thing that keeps coverage complete. DO NOT relitigate placing it in the JS publisher.
- **DB-trigger-only / RPC-side writes can't revalidateTag** — the Next code that invokes the trigger-firing write or `await`s the RPC must add it (§3.2); the meta-test catches omissions.
- **Per-viewer key is a security boundary** — a key collision leaks another viewer's financials; the per-viewer-isolation test pins it.
- **unstable_cache is Next-version-coupled** — it's the available API now (`use cache` needs cacheComponents, out of scope); note for future migration.

## 9. Out of scope
- Enabling `experimental.cacheComponents`/`use cache` (app-wide).
- Caching admin dashboard reads / other routes.
- Removing `force-dynamic` from the crew route (it reads cookies for picker auth; only the DATA fetch is cached, not the route).

## 10. Expected outcome
Load/reload/realtime-refresh of a crew/preview page with no intervening show-data write serves `getShowForViewer`'s data from `unstable_cache` (skips the ~9-read fan-out); the version token stays live so the realtime bridge stays correct (no loop); every show-data write revalidates the show tag (near-zero staleness), structurally guarded by a coverage meta-test + a 300s backstop TTL.
