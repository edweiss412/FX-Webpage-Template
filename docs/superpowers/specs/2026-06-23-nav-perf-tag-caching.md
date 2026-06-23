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

### 4.2 Tag + invalidation
- One tag: `show-${showId}`. `revalidateTag(\`show-${showId}\`)` busts ALL viewers of that show (correct: a show-data change affects every viewer's projection).
- **Co-locate with the existing invalidation signal.** `publishShowInvalidation(showId)` is the established Next-runtime "show changed" call (`runScheduledCronSync.ts:1813`, `unpublishShow.ts:260`). Make `revalidateTag` fire wherever the realtime broadcast is emitted from Next — ideally by adding `revalidateTag` INTO a single shared helper that every write path already calls (so coverage is structural, not per-site). Plan must determine whether `publishShowInvalidation` is that single chokepoint or whether some writes broadcast only via DB triggers (those need an added Next-runtime revalidateTag).

### 4.3 Backstop TTL (defense-in-depth, NOT the primary mechanism)
`revalidate: 300` (5 min) on `unstable_cache` is a SAFETY NET: if a revalidateTag site is ever missed, the cache self-heals within 5 min (bounded staleness) instead of staying stale indefinitely. The PRIMARY freshness is tag invalidation (near-zero). The TTL caps the blast radius of a coverage gap. (Tune in plan; 300s is the proposed default.)

## 5. Write-site coverage matrix (from the live-code audit — every cell MUST revalidateTag(show-${showId}) or be exempt-with-reason)

| Write surface | file:line | Tables (getShowForViewer-read) | Today's freshness signal | Action |
|---|---|---|---|---|
| Sync apply (crew/hotel/rooms/transport/contacts/shows_internal) | `runScheduledCronSync.ts:1225-1401` (via `applyParseResult.ts:127-186`) | crew_members, hotel_reservations, rooms, transportation, contacts, shows_internal | Phase-2 tail `publishShowInvalidation` (`:1813`) + DB triggers on crew_members | revalidateTag in the tail/shared helper |
| Show snapshot apply | `runScheduledCronSync.ts:969-1168` | shows | Phase-2 tail | revalidateTag (same tail) |
| Diagram promote | `promoteSnapshot.ts:159-401` | shows (diagrams) | **none** ✗ | ADD revalidateTag |
| Unpublish/undo | `unpublishShow.ts:146-260` | shows | `publishShowInvalidation` (`:260`) | revalidateTag (co-locate) |
| Admin publish/archive/unarchive/undo | `app/admin/show/[slug]/_actions/{publish,archive,unarchive,undoAutoPublish}.ts` | shows | `revalidatePath(/admin…)` only | ADD revalidateTag(show) |
| Feed approve/reject/undo (MI-11) | `app/admin/show/[slug]/_actions/feed.ts:51-94` | multiple (phase-2 apply) | revalidatePath + phase-2 apply | revalidateTag via the apply tail |
| Picker select/clear identity | `lib/auth/picker/{selectIdentity,clearIdentity}.ts` | crew_member_auth (NOT show data; bumps token only) | revalidatePath(show route) | **EXEMPT** — auth-only, no show-data change; the live token (§3.1) handles it. (Document the exemption.) |
| Validation reset/reseed | `app/admin/settings/_actions/validationReset.ts` | validation shows (ephemeral) | revalidatePath(/admin) | revalidateTag for the affected show ids (or a coarse bust) — validation-only, low stakes |

Plan turns each row into a concrete edit or an `// not-subject-to-revalidate: <reason>` exemption, and the meta-test (§6) walks the registry.

## 6. Meta-test inventory (structural coverage guard — mandatory)
NEW `tests/db/showCacheRevalidateCoverage.test.ts` (registry-style, mirrors `_metaInfraContract`): a registry of every "writes a getShowForViewer-read table" surface. The test asserts each registered file either calls `revalidateTag` with a `show-`-prefixed tag (grep-shape) OR carries an `// not-subject-to-revalidate: <reason>` exemption. New write sites must add a row or the test fails — this is the structural defense that makes "near-zero staleness" durable against future drift (the §3.2 coverage hazard). Also extend the existing realtime/`publishShowInvalidation` reasoning if a shared chokepoint is used.

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
- **revalidateTag ordering:** must fire in the Next runtime BEFORE the realtime broadcast (so the browser's router.refresh reads the busted cache). Co-locate with `publishShowInvalidation`.
- **DB-trigger-only writes can't revalidateTag** — those need a Next-runtime revalidateTag added (§3.2); the meta-test catches omissions.
- **Per-viewer key is a security boundary** — a key collision leaks another viewer's financials; the per-viewer-isolation test pins it.
- **unstable_cache is Next-version-coupled** — it's the available API now (`use cache` needs cacheComponents, out of scope); note for future migration.

## 9. Out of scope
- Enabling `experimental.cacheComponents`/`use cache` (app-wide).
- Caching admin dashboard reads / other routes.
- Removing `force-dynamic` from the crew route (it reads cookies for picker auth; only the DATA fetch is cached, not the route).

## 10. Expected outcome
Load/reload/realtime-refresh of a crew/preview page with no intervening show-data write serves `getShowForViewer`'s data from `unstable_cache` (skips the ~9-read fan-out); the version token stays live so the realtime bridge stays correct (no loop); every show-data write revalidates the show tag (near-zero staleness), structurally guarded by a coverage meta-test + a 300s backstop TTL.
