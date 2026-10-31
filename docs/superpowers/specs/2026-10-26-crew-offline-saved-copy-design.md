# Crew page offline: saved copy, age note, offline reports

**Status:** Draft v7, 2026-10-27 (after spec review round 6). Owner-approved for autonomous ship (Eric, brainstorm 2026-10-26).
**Scope:** the crew show page at `app/show/[slug]/[shareToken]/**` and the report flow it hosts.
**Mockups (owner-reviewed):** https://claude.ai/artifact/8RA9JS4oMpLZFf9TyLwrJc
**Spike record:** `docs/superpowers/specs/probes/2026-10-26-crew-offline-sw-spike.md` (summary in §11).

## 1. Intent

Crew open their show page on a phone at the venue to find one fact fast: dock, room, gear location, call time, who to call. The places they need it most are the places with no signal: the loading dock, a basement ballroom, a room where nobody has handed out the wifi password. Today every load needs the network, so a reload in a dead zone shows the browser's offline error and nothing else.

This project keeps the page working with no signal. Every time the page loads with signal, the phone keeps that version. With no signal, the phone shows the kept version under a pinned bar that says how old it is. The page never presents an old copy as current. That rule is the point of the feature: crew act on what the page says, so a copy they believe is live when it is not is worse than no copy.

Two PRs ship from this one design (§8):

- **Piece 1, saved copy.** Saving the page, its stage diagrams and agenda; the pinned bar; the wipe rules; the "show has ended" view; the "sheet is gone from Drive" warning.
- **Piece 2, offline reports.** A report written with no signal is held on the phone, sent by itself later, and labelled for Doug as written offline.

The brainstorm first split the work three ways, with sheet-removed detection as its own piece. The sync already records it (§3.4), so it folded into piece 1 as one more bar state.

### 1.1 Resolved scope, do not relitigate

Every item below was decided by the owner in the 2026-10-26 brainstorm, is marked as the author's call, or is marked as a recon finding. The first draft's author's calls were played back to the owner, who approved the playback ("looks good"). Review rounds then changed some rows, and those changes were not played back; the PR lists them for the owner:

- R5 dropped "immediately": the wipe happens at the bracket purges (§4.6), which run at once on the phone, so the word added nothing and implied a guarantee the generation counter gives instead.
- R12 gained "runtime": the worker is bundled with the existing `esbuild` dev dependency.
- R13 gained "as far as the phone can know" and "per show". The first is a limit no design can remove: with no answer from the app, a phone cannot tell who holds it (§9). The second came from review round 4.
- R14 dropped "no new column", because R15 adds one.
- R15 is new, from review round 2, read from the owner's own wording.

A reviewer verifies these against this section; they are not open for redesign.

| # | Decision | Source |
|---|---|---|
| R1 | Save on every successful load with signal. Crew usually open the page before arriving, but that is not guaranteed. | Owner |
| R2 | Save the page text plus stage diagrams plus the agenda PDF, including ones never opened. The reel stays online-only. | Owner (diagrams, agenda); author's call (prefetch unopened, reel online-only), played back |
| R3 | Keep the last version by default, including after the show is archived. An archived show shows "This show has ended" over the last version. A phone that never saved the show still gets the normal not-found. | Owner |
| R4 | Wipe the saved copy when an admin unpublishes the show or resets its share link, the next time the phone has signal. | Owner |
| R5 | Wipe the saved copy when someone switches names on the phone ("Not you?"). | Author's call, played back |
| R6 | When the show's source sheet is gone from Drive, mark it and keep the copy. The warning shows with or without signal. | Owner |
| R7 | When signal returns, the page updates by itself. No tap needed. A short "Updated" line shows for a few seconds. | Owner (auto-update); author's call ("Updated" line), played back |
| R8 | The note is a pinned bar at the top of the page, under the show header, that stays on screen while scrolling (mockup Option A). | Owner |
| R9 | The bar turns to the warmer "old copy" tone, with "Things may have changed since then", at 6 hours. | Author's call, shown in mockup, played back |
| R10 | Reports written offline are held and sent automatically when signal returns. Doug's copy says it was written with no signal, when it was written versus sent, and how old the crew member's page was. | Owner |
| R11 | Call and email links work as usual offline. "Open in Maps" hands off to the Maps app. "Not you? Switch person" is disabled offline with "Needs signal". | Author's call, played back |
| R12 | Hand-written service worker, no new runtime dependency. | Author's call (§4.1 says why) |
| R13 | One saved copy per show per phone, whatever link it was saved under. A copy is never served to a viewer other than the crew identity it was rendered for, as far as the phone can know (§4.6, §9). | Brief constraint (parent session), owner-confirmed via R5; "per show" rather than "per link" is the author's call after review round 4 (§4.6) |
| R14 | Sheet-removed detection reuses `shows.last_sync_status = 'sheet_unavailable'`. No sync change. | Recon finding (§3.4); reusing it is the author's call |
| R15 | An unpublish at any time after the copy was saved wipes it, even if the show is archived later (R4 read literally: "unless show has been unpublished by admin"). This needs one new nullable column, `shows.unpublished_at` (§4.11). | Author's call from the owner's wording |

## 2. Goals, non-goals, anti-goals

**Goals**

- A crew member who opened their show page once with signal can reopen it with no signal and see the full page, with tabs and menus working.
- The pinned bar is on screen whenever the content might not be current, and says how old it is.
- Wipes happen on unpublish, link reset, name switch, and sign-out.
- An archived show keeps its last version on phones that saved it.
- An offline report is never lost because there was no signal, and Doug can tell it was delayed.

**Non-goals**

- Installable app (web manifest, home-screen icon). Not asked for; §9 says why it would help on iPhone.
- Offline editing of anything other than reports.
- Offline admin pages. The worker never serves anything for routes outside the crew show page.
- Push notifications.
- The Background Sync API. iPhone Safari does not support it, so the report queue sends from an open page (§5).

**Anti-goals** (failure even if it technically works)

- An old copy that reads as current. Any path that renders a saved copy without a visible saved-copy notice is a P0.
- One person's copy shown to another person on a shared phone, through any path the phone can observe.
- The worker breaking a page it should not touch: admin, API, sign-in, or a healthy online show page.
- A worker that cannot be switched off without a code change (§4.10).

## 3. Current state

Citations are file plus symbol; line numbers are drafting-time locators.

### 3.1 The page and its viewers

- `app/show/[slug]/[shareToken]/page.tsx` is dynamic: it reads cookies and headers through `buildShowPageChainRequest` (`lib/auth/picker/showPageChainRequest.ts`). There is no route segment config, no custom `Cache-Control` (`next.config.ts`), and no proxy (middleware) file.
- The route has a `loading.tsx`, so responses stream. Next keeps HTTP 200 for a `notFound()` or `redirect()` reached after streaming starts (Next docs, loading file convention, "Status codes"). **HTTP status is therefore not a reliable signal for this route**; the design reads markers in the body instead (§4.3).
- Access resolves in `resolveShowPageAccess` (`lib/auth/picker/resolveShowPageAccess.ts`): the `resolve_show_by_slug_and_token` RPC, then archived, admin session, unpublished, Google session, then the picker cookie `__Host-fxav_picker` (httpOnly, `lib/auth/picker/cookieEnvelope.ts`: envelope `{ v: 1, selections: Record<showId, { id, e, t }> }`, where `id` is the crew member and `e` the picker epoch).
- Render arms in `page.tsx`: archived or missing show calls `notFound()` (the route's `not-found.tsx`, `CrewLinkNotFound`); unpublished renders `<ShowUnavailable />`; `infra_error` and lookup failures render `<TerminalFailure>` (`components/auth/TerminalFailure.tsx`); `needs_picker_bootstrap` calls `redirect()` to `/api/auth/picker-bootstrap`; `no_auth` renders `<SignInOrSkipGate>`; `renderPickerRepick` (also reached from `renderRacedCrewMiss`) renders `<PickerInterstitial>`; the admin arm renders `<CrewShell viewer={{ kind: "admin" }}>`; the resolved arm renders `<CrewShell>` for `kind: "crew"`. `_CrewShell.tsx` also handles `viewer.kind === "admin_preview"` and a `staticPreview` posture. The route also has `error.tsx`.
- The HTML is per viewer: identity chip name, name-filtered hotels, and the Budget section, which `financialsVisible` (`lib/visibility/scopeTiles.ts`) grants to admin, LEAD, or FINANCIALS. The whole page ships in one payload, and section tabs toggle visibility client-side (`components/crew/CrewSections.tsx`).
- `app/show/[slug]/unpublish/page.tsx` is a static sibling of `[shareToken]`, so `/show/<slug>/unpublish` has the same shape as a crew URL.

### 3.2 Freshness today

- Freshness invariant, header of `components/crew/CrewSections.tsx`: the controller "toggles VISIBILITY only. It never fetches, derives, or caches section data client-side." This design keeps that rule: the saved copy is the server's HTML, stored whole, never a second data path.
- `ShowRealtimeBridge` (`components/realtime/ShowRealtimeBridge.tsx`, mounted in `_CrewShell.tsx`) subscribes to `show:<id>:invalidation` (`lib/realtime/subscribeToShow.ts`) and calls `router.refresh()` on invalidation and on a version mismatch after reconnect (`GET /api/show/<slug>/version`). Network errors are silent.
- Data age shows today in the footer through `<StaleFooter>` (`components/shared/StaleFooter.tsx`), from `_CrewShell.tsx` props `lastCheckedAt`, `lastSyncStatus`.

### 3.3 Assets and network actions

- No map image on the crew page; venue "Open in Maps" is a Google Maps link (`components/crew/sections/VenueSection.tsx`).
- Stage diagrams load from `/api/asset/diagram/<show>/<rev>/<key>` (`components/diagrams/Gallery.tsx`), a cookie-auth proxy that streams bytes with `private, max-age=0`.
- Agenda PDFs load from `/api/asset/agenda/<show>/<fileId>`, but `AgendaEmbed` (`components/agenda/AgendaEmbed.tsx`) builds that URL only after a tap (`openFileId` starts `null`), and `AgendaPdfViewer` is a `dynamic()` import with `ssr: false` that sets up the pdf.js worker through `import.meta.url` only when it loads. An unopened agenda leaves no URL in the HTML and no viewer code in any cache.
- Fonts are self-hosted under `/fonts/` (`app/fonts.css`), outside `/_next/static`.
- Network actions: `POST /api/report` from `components/shared/ReportModal.tsx`; picker Server Actions `selectIdentity` (wired by `selectIdentityFormAction` in `_PickerInterstitial.tsx`), `clearIdentity` (wrapped in `components/auth/IdentityChip.tsx` and submitted from `components/auth/AvatarMenu.tsx`), `clearIdentityAndSkip` (`_SignInOrSkipGate.tsx`); `/me` sign-out is a plain form `POST /auth/sign-out` (`app/me/page.tsx`, `data-testid="me-sign-out-form"`), which clears the Supabase session and the picker cookie only after `await` on the Supabase sign-out (`app/auth/sign-out/route.ts`); Google sign-in completes at `/auth/callback`, and `/api/auth/picker-bootstrap` writes a picker selection from the Google identity; `tel:` and `mailto:` links (`components/crew/primitives/PersonRow.tsx`).
- No service worker, web manifest, CSP header, or middleware exists today.

### 3.4 Lifecycle signals the design reuses

- **Archive.** `_archive_show_core` (`supabase/migrations/20260601000000_b2_show_lifecycle.sql`) sets `archived = true`, `published = false`, bumps `picker_epoch` by one, and **rotates the share token**. A saved archived link is therefore a dead token, exactly like a reset link.
- **Share link reset.** `rotate_show_share_token` rotates the token and bumps `picker_epoch`; it refuses archived shows (`supabase/migrations/20260601000001_b2_def1_lifecycle_guard.sql`). Unarchive rotates again.
- **Unpublish.** `_unpublish_show_core` (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql`) sets `published = false` and leaves `picker_epoch` alone; nothing on the row records that it happened. Unarchive (`supabase/migrations/20260718000001_unarchive_show_apply_gate_free.sql`) rotates the token and bumps the epoch again.
- **Telling them apart.** After an archive alone, `picker_epoch` is exactly one more than the epoch the phone saved under and `archived` is true. Any reset or extra epoch bump makes the gap two or more. An unpublish leaves no trace, so §4.11 adds `unpublished_at`. §4.5 uses all three.
- **Identity.** Whether a request is the crew member a copy was saved for depends on more than the picker cookie: `resolveShowPageAccess` checks the admin session and the Google session (`validateGoogleSession`, then a Google-to-selection match and claim checks), and `resolvePickerSelection` checks the epoch, roster membership, `selections_reset_at`, `claimed_via_oauth_at`, and the signed-in email against the crew row. §4.5 reuses that code instead of restating it.
- **Sheet gone.** The Drive listing returns only `trashed = false` sheets (`lib/drive/list.ts`). A sheet that is trashed, deleted, moved out, or unshared drops off, and the cron sync sets `shows.last_sync_status = 'sheet_unavailable'` (`lib/sync/runScheduledCronSync.ts`). `_CrewShell.tsx` receives it as `data.lastSyncStatus`. A later successful sync replaces it.
- **Version endpoint.** `GET /api/show/[slug]/version` sees a reset as `epoch_stale` (401) and an archive or unpublish as 410 `PICKER_SHOW_UNAVAILABLE` (`resolvePickerSelection.ts`: `showRow.archived || !showRow.published`). It cannot say whether the archive is the only change since a given epoch, so §4.5 adds a purpose-built route.

### 3.5 Reports

- `POST /api/report` inserts into `reports` (`supabase/migrations/20260501001000_internal_and_admin.sql`; `context jsonb not null`, `idempotency_key uuid unique`) and files a GitHub issue (`lib/reports/submit.ts`). Doug reads the GitHub issue; there is no admin page listing reports.
- Idempotency: a completed duplicate key returns the original result regardless of age (`dispatchExisting`); recovery of an unfinished submission is bounded to 24 hours from the row's server-side `created_at` (`dispatchAfterMissedRecovery`). A queued report that never reached the server creates its row on first send, so a long offline hold does not meet either rule.
- The route authenticates the current picker identity (`authenticateReportRequest`, `app/api/report/route.ts`) and records it as the reporter.
- `ReportModal.tsx` persists one `{ idempotencyKey, draft, status, surfaceId, errorCode }` record per `surfaceId` in `sessionStorage` (`readPersisted` / `writePersisted`). The submitted body also carries `show_id`, `surface`, and autocaptured context from component props (`submitOnce`).
- The route satisfies invariant 10 through a `code:` field on `log.error`.

### 3.6 Next.js 16.3.0

- `next/offline` / `experimental.useOffline` exist but are experimental and off here. They retry soft navigations, prefetches and Server Actions; a full reload with no network "still fails and needs a service worker" (Next's vendored guide node_modules/next/dist/docs/01-app/02-guides/offline-support.md). Plain `fetch()` calls, which is how reports submit, are not retried.
- The PWA guide (sibling progressive-web-apps.md) registers a worker with `scope: '/'` and `updateViaCache: 'none'` and serves it with `Content-Type: application/javascript; charset=utf-8` and `Cache-Control: no-cache, no-store, must-revalidate`.

## 4. Piece 1: saved copy

### 4.1 Shape

- **The worker**, served at the URL /sw.js by a route handler, so a runtime flag can swap in a self-removing worker (§4.10).
- **A marker** in every page this route renders, telling the worker what the page is (§4.3).
- **A status route** the worker asks when a saved link turns into a not-found, to tell an ended show from a revoked link (§4.5).
- **Client pieces**: the pinned bar, the registration, and purge calls (§4.6, §4.7).

New files (piece 1):

<!-- spec-lint: ignore — files created by this spec's implementation; not yet tracked -->
`app/sw.js/route.ts`, `app/api/saved-copy/status/route.ts`, `components/offline/SavedCopySlot.tsx`, `components/offline/SavedCopyBar.tsx`, `components/offline/SavedCopyRegistrar.tsx`, `components/offline/SavedCopyMarker.tsx`, `lib/offline/` (worker logic shared with tests), `lib/offline/viewerKey.ts` (viewer-key helper shared with piece 2), `lib/offline/__generated__/swSource.ts`, `scripts/generate-sw-source.ts`.

Why hand-written and not Serwist (R12): Serwist precaches a build's static files and applies route strategies. Here the cached document is per viewer, is saved or purged on server instructions, is ordered against identity changes, and decides between a saved copy and a not-found by asking the server. That is a small, specific state machine; writing it directly keeps every rule in one place and adds no runtime dependency. The worker is written in TypeScript under `lib/offline/`, bundled with the existing `esbuild` dev dependency by `pnpm gen:sw` into a committed string module, and a freshness test fails when the committed bundle does not match its sources (the `gen:spec-codes` pattern). Vitest imports the same sources.

### 4.2 Worker scope

The worker registers at scope `/` and acts only on:

| Request | Handling |
|---|---|
| `GET` navigation whose path is a crew URL: exactly `/show/<slug>/<token>`, no trailing slash, where `<token>` is not `unpublish` | §4.4. The trailing-slash form is not handled: Next's 308 sends the browser to the slash-less URL, which is handled |
| Any navigation (`GET` or `POST`) to `/auth/sign-out` or `/auth/callback` | Passed through unchanged (`respondWith(fetch(request))` with the request's own redirect mode), with every saved copy purged before the request is sent and again after its response arrives (§4.6) |
| `GET /_next/static/**` and `GET /fonts/**` | Cache first, store on first fetch (§4.8) |
| `GET /api/asset/diagram/**` and `GET /api/asset/agenda/**` listed by a saved copy | Network first with a 5-second timeout that covers the whole response, headers and body, falling back to the stored asset (§4.8) |
| `GET /api/asset/diagram/**` and `GET /api/asset/agenda/**` that no saved copy lists | Passed through unchanged (`respondWith(fetch(request))`), streaming as it would without the worker. Whether a copy lists it is decided first, before anything is read: that takes a store read, and `respondWith` cannot wait for one |
| Everything else, including Next RSC requests (`_rsc` query parameter or `RSC: 1` header), Server Action POSTs, all other `/api/**` and `/auth/**`, admin pages, `/show/<slug>/unpublish` | Never answered: the worker does not call `respondWith`, so the browser behaves exactly as today |

The crew-URL test is derived, not listed: a unit test walks `app/show/[slug]/` and asserts that every static sibling of `[shareToken]` is excluded, so a sibling added later fails the test instead of being swallowed.

### 4.3 The marker

Every page this route renders carries exactly one marker element in its body, except the not-found page when `notFound()` runs after the streamed shell is out: its marker then exists only in the payload, and the worker reads that body by Next's not-found digest instead (§4.4 step 3):

```html
<template id="fxav-saved-copy" data-v="3" data-disposition="save|keep|hold|check|purge" ...></template>
```

A `save` marker also carries `data-rendered-at` (server render time, ISO 8601 UTC), `data-show-id`, `data-epoch` (the picker epoch of the resolved selection), `data-viewer` (an opaque viewer key: HMAC-SHA256 under a server-held secret over `showId:crewMemberId`, base64url, so no crew id is exposed), and `data-assets` (JSON array of asset URLs to save, §4.8). A `keep` marker carries `data-viewer` for the crew identity the server had already resolved when it failed. **Every marker carries `data-show-id` whenever the server knows the show**, which is every arm except the not-found page (the token resolved to no show), the `infra_error` arm (resolution never finished), and the route's `error.tsx` (a client error boundary receives only `error` and `reset`). Arms whose access result lacks the show id today (the `unpublished` result) gain it, since the RPC has already resolved it.

| Page rendered | Disposition | Rendered by |
|---|---|---|
| `<CrewShell>` for `viewer.kind === "crew"` | `save` | `<SavedCopySlot>` in `_CrewShell.tsx` |
| `<CrewShell>` for `admin`, `admin_preview`, or `staticPreview` | `purge` | `<SavedCopySlot>` (strict R13: a phone now showing an admin view drops the crew copy) |
| `<PickerInterstitial>`, `<SignInOrSkipGate>`, `<ShowUnavailable />` | `purge` | `<SavedCopyMarker>` in each |
| `<TerminalFailure>` in the `resolved` crew arm, after identity resolved (the `getShowForViewer` failure) | `keep` with that viewer | marker passed into `<TerminalFailure>` |
| `<TerminalFailure>` in the `infra_error` arm (identity never resolved), and the route's `error.tsx` | `hold` | marker added to each |
| `<TerminalFailure>` in `_CrewShell.tsx` for `MalformedProjectionError` when `viewer.kind === "crew"` (identity resolved, data malformed) | `keep` with that viewer | marker passed into `<TerminalFailure>` |
| `<TerminalFailure>` anywhere else: `renderPickerRepick` and `renderRacedCrewMiss` roster failures (after an identity rejection), the `no_auth` roster failure, the admin data failure, `_CrewShell.tsx`'s `UnmatchedViewerError` (the viewer does not match the data), and its `MalformedProjectionError` for any viewer other than `crew` (`admin_preview` included) | `purge` | marker passed into `<TerminalFailure>` |
| The route's `not-found.tsx` | `check` | marker added to it |
| Anything else, including a streamed `redirect()` and a page with no marker (except the streamed not-found page, read as `check`, §4.4 step 3) | treated as `purge` | none (fail closed) |

The worker reads the first `id="fxav-saved-copy"` element in the complete body (§4.4). An unknown `data-v` or `data-disposition`, or a `save` marker missing any required attribute, is treated as `purge`.

**The marker also speaks for client-side renders.** Many renders never pass through the worker as a document: `ShowRealtimeBridge` calls `router.refresh()` on every invalidation (a reset, an archive and an unpublish all publish one) and on a 401, 403 or 410 from the version endpoint, and `<TerminalFailure>`'s retry link is a soft navigation. So the marker is a client component, `<SavedCopyMarker>`, that renders the template above and, on mount, posts the same disposition to the worker with the page's URL: `purge` purges the copy of the marker's show (`data-show-id`), or, when the marker has no show id, the copy stored at that URL; `check` runs the §4.5 check for the copy at that URL and, on `ended`, marks it and reloads the page so the worker serves it in `ended` mode; `keep` and `hold` do nothing; `save` is the live-page `ensure-saved` (§4.7.3). One component therefore covers a document load and an RSC render identically, and the purge triggers in §4.6 are its consequences, not separate code paths.

### 4.4 Navigation

For a crew-URL navigation, `U` is the request's path (query ignored) and the fetch always uses the full request URL, query included, so `?gate=skip` and `?s=` keep working online. `S(U)` is the saved copy whose stored URL is `U`, if any. `C(X)` is show X's one copy, wherever it was saved (copies are stored one per show, each remembering the URL it was saved under, §4.6). Serving decisions use `S(U)`, because a copy is only ever served at the URL it was saved under; purges use `C(X)` whenever the marker names show X, so they reach the copy wherever it lives.

1. **If `S(U)` is marked ended** (§4.5), the link is dead by construction (§3.4), so the worker skips the page fetch and asks the status route instead (5 s). `ended`: serve `S(U)` in `ended` mode. `gone`: purge and fetch the page as in step 2. Network error or timeout: serve `S(U)` in `ended` mode (the phone cannot check, §9). Server error (the app answered without a verdict): fetch the page under the step 2 budget and keep `S(U)`. A complete response is served as is, without the step 3 table; a network error or a timeout serves `S(U)` in `ended` mode, because the app then gave no answer at all.
2. **Otherwise fetch the request URL and buffer the whole response**, up to 8 seconds for headers and body together.
3. **Complete response in time.** Read the marker, then use the table below. A body with no marker element that carries Next's not-found digest (`NEXT_HTTP_ERROR_FALLBACK;404`) reads as `check` naming no show: it is the not-found page after a `notFound()` that ran once the streamed shell was out, which the client renders from the payload, so its marker never becomes an element (`readNavigationMarker`, `lib/offline/marker.ts`).

| Marker | `S(U)` exists | Serve | Then |
|---|---|---|---|
| `save` | either | the network response | commit it as the copy of the marker's show, replacing `C(show)` wherever it was saved (§4.6, §4.8) |
| `keep` | yes, for the marker's show and viewer | `S(U)` in `server-error` mode | none |
| `keep` | `C(show)` exists, at `U` or any other link, for a different viewer | the network response | purge `C(show)` |
| `keep` | otherwise | the network response | none |
| `hold` | either | the network response | none |
| `check` | yes | ask the status route (5 s). `ended`: mark `S(U)` ended and serve it in `ended` mode. `gone`: purge, serve the network response. Error or timeout: serve the network response, keep `S(U)` | none |
| `check` | no | the network response | none |
| `purge`, or treated as `purge` | either | the network response | purge `C(show)` when the marker names a show; otherwise purge `S(U)` |

A response that is not HTML: an opaque redirect (navigations use `redirect: "manual"`) is served and changes nothing, since the route's own `redirect()` to the picker bootstrap arrives as a streamed 200 with no marker (treated as `purge` above), and a redirect before the app ran says nothing about the viewer; any other response with status 500 or above and no marker (a platform error before the app ran) serves `S(U)` in `server-error` mode when it exists, the same as no response at all, since it carries no information about the viewer; anything else without a marker is treated as `purge`.

4. **Network error before completion.** `S(U)` exists: serve it in `offline` mode. No `S(U)`: serve the built-in "not saved yet" page (§4.7.5).
5. **8 seconds pass without a complete response.** `S(U)` exists: serve it in `slow` mode and let the fetch run on, for up to 60 seconds more. When it completes, apply the step 3 table without serving anything; if that saved a new copy, post `fresh-ready(U)` to open pages of `U`; if it purged a show's copy, post `purged(showId)` to every open page, and any page whose marker names that show reloads. No `S(U)`: keep waiting for the network with no worker timeout, since there is nothing better to show.

Buffering costs crew the route's streamed loading skeleton once the worker is installed: the browser keeps the previous screen until the page is complete. That is the price of two guarantees streaming cannot give. The worker sees the marker before it chooses what to serve, so it never has to correct a page after the fact. And a connection that drops mid-page falls back to the saved copy instead of leaving a half-rendered page. The 8-second budget is the author's call; the spike measured the fallback at 8.05 s (§11).

**The first visit.** The worker installs during the first visit, so that navigation never passes through it (§11). Once the worker controls the page, `<SavedCopyRegistrar>` posts `ensure-saved(U, renderedAt)`. The worker skips it when it already holds, or is already storing, a copy of `U` with that `renderedAt`; otherwise it fetches `U` itself with the page's cookies and runs the step 3 table without serving anything.

### 4.5 Status route

`GET /api/saved-copy/status?show=<showId>&epoch=<n>&viewer=<key>&saved=<savedAt>` answers one question: would the page, if this show were still live, resolve this request to the crew member the copy was saved for, and has nothing but an archive happened to the show since the copy was saved?

It returns `200 { "state": "ended" }` only when every condition below holds, and `200 { "state": "gone" }` otherwise.

**Lifecycle conditions**, read from the show row by `show`:

- the row exists and `archived = true`;
- `picker_epoch = epoch + 1` (the archive's own bump, and nothing else; §3.4);
- `unpublished_at` is null or earlier than `saved` (no unpublish since the copy was saved; §4.11).

**Identity conditions.** The route runs the page's own identity resolution, not a restatement of it. The page keeps its gate order unchanged: archived, then the admin session, then unpublished, then the Google session and picker selection (`resolveShowPageAccess`). The part after the unpublished gate (Google session, picker selection, and `resolvePickerSelection`'s checks) is extracted into one function that both the page and this route call. The route runs the same admin-session check first (an admin is never this crew member, so the answer is `gone`), then the extracted function with the lifecycle conditions above in place of the page's gates, and with the picker entry's epoch compared to `epoch` instead of the row's current epoch. The identity verdict must be the crew member whose viewer key is `viewer`. Every identity input the page consults is therefore consulted here, in the same order: admin session (an admin is never this crew member), Google session and its match to the selection, the picker entry for `show`, roster membership, `selections_reset_at`, `claimed_via_oauth_at`, and the signed-in email against the crew row.

A parity test pins this: one table of identity scenarios, covering every input above in both its passing and failing state, runs through the page's resolver for a live show and through this route for the same show archived, and asserts the same allow or deny for every row. A new identity input added to the page later fails the parity test until the route consults it too.

Infra faults return `500 { "error": "<code>" }`. The worker treats that as the app answering without a verdict: it does not serve the copy and keeps it (§4.4 step 1). Only a network error or timeout, where the app gives no answer at all, lets the worker serve an ended copy on its own judgement. `Cache-Control: no-store`. The route only reads. Its answer tells a caller who already holds the copy's ids and the matching identity that the show ended, which the copy is about to say. Supabase calls follow invariant 9. It is a `GET` handler, so it is not an invariant-10 mutation surface.

Cases: archive alone keeps the copy (R3). A reset before or after the archive leaves an epoch gap of two or more and wipes it (R4). An unpublish since the save wipes it (R15). "Not you?", sign-out, a different Google account, an admin session, roster removal, a selection reset, or a claim each fail the identity conditions and wipe it (R5, R13).

### 4.6 Saving, purging, and ordering

**One copy per show.** Copies are stored by show id. A copy stores the URL it was saved under, the HTML, the marker fields (including `showId` and `viewer`), the `savedAt` time (`data-rendered-at`), the request start ordinal, and the list of asset and static URLs it depends on. A show can have several URLs over time (every reset, archive and unarchive issues a new token), so keying by show means:

- a `save` for a show replaces that show's copy, whatever URL the old copy was saved under, so a new viewer's save at a new link displaces the previous viewer's copy at an old link;
- a purge names the show and removes its one copy, wherever it was saved;
- an old link whose show's copy now lives under a newer link has no copy of its own (`S(U)` is absent), so with no signal it gets the "not saved yet" page rather than another link's content.

**Ordering.** The worker keeps one persisted generation counter `G`, incremented by every purge of any scope. Every save captures `G` and a monotonically increasing request ordinal when its fetch starts, and commits only if `G` is unchanged at commit time and its ordinal is greater than the stored copy's. A save that starts before any purge therefore never lands after it, whether it is the copy's first save or a replacement, and whichever source it came from (navigation, `ensure-saved`, or a step-5 continuation). A purge of one show also voids in-flight saves of other shows; they are simply retried on the next load.

**A purge the store cannot write fails closed.** Every purge goes through one function, and a purge whose write fails (its promise rejects, or its IndexedDB transaction aborts or errors) quarantines the worker. G advances in memory, so no save begun before the failure commits, though the stored G never moved. The worker also writes a marker entry to its own Cache Storage cache, `fxav-quarantine`, which does not depend on the failing database, and it escalates at once, inside the failing event's own `waitUntil`: it deletes its IndexedDB database, then every other `fxav-` cache. While quarantined, which is while the memory state or the marker says so, the worker serves no saved copy and no stored asset: a navigation gets the network, or the "not saved yet" page when the network fails too. No save commits, including one begun during the quarantine. The quarantine ends only when the escalation succeeds, or when a later retry of the failed purges does; the marker is deleted last, after either. If the escalation fails, every following fetch event or message retries the failed purges, and a retry that fails again escalates again. A worker reads the marker at startup, and activation and its first fetch wait for that read: a worker the browser restarted after a failed purge starts quarantined, and since which purge failed died with the old worker, its retry purges every copy. A marker that cannot be read counts as present. The store retires on the version change its own delete causes (`lib/offline/idbStore.ts`), so after an escalation the worker reads and writes nothing until the browser restarts it, and crew pages go to the network. §9 records what the marker cannot cover.

**Identity transitions are bracketed.** A purge before a transition stops saves that started earlier, but a save can start after that purge and still carry the old cookies until the transition completes. So every identity transition the phone can see purges twice, once before it starts and once after it completes, and any save that started in between fails the generation check:

| Transition | First purge | Second purge |
|---|---|---|
| "Not you? Switch person" | `AvatarMenu` posts `purge(showId)` and waits up to 500 ms for the acknowledgement before submitting `clearIdentity` | `AvatarMenu` posts `purge(showId)` again when the action settles, success or failure |
| `/me` sign-out (`/auth/sign-out`) | Worker, when the navigation request starts (§4.2) | Worker, when its response arrives |
| Google sign-in completing (`/auth/callback`) | Worker, request start | Worker, response |
| Picking a name in the picker | `<SavedCopyMarker>` on the picker's mount (the picker only renders when no valid selection exists) | Not needed: after the pick, the page renders for the new viewer, whose `save` replaces the copy |

The picker bootstrap is not bracketed. On a document load its streamed `redirect()` becomes a meta refresh and the router performs it as a full navigation, so the worker could watch it, but no bracket is needed: while the Google identity and the picker entry disagree, the server answers `needs_picker_bootstrap` and never renders a `save`, so no save for the old identity can start in that window. The markerless streamed response purges `S(U)`; a copy of the same show saved under an older link is replaced by the save that follows the bootstrap, or purged by the next marker that names the show.

**Completeness.** A save commits only after every asset in `data-assets` (within caps, §4.8) and every `/_next/static/**` and `/fonts/**` URL referenced in the saved HTML, plus every `/fonts/**` URL referenced by a `url(...)` in the CSS files among them (one level deep), is present in the worker's caches, fetching any that are missing. The font file is declared in CSS (`app/fonts.css`) and preloaded by a link in the HTML (`components/FontPreload.tsx`); the CSS clause makes completeness independent of whether a preload link is present, so an offline copy keeps its typeface either way. If any required static file cannot be fetched, the save is abandoned and the show's previous copy stays. A committed copy can therefore always hydrate offline, including a copy fetched in the background from a newer deployment.

**Purge triggers.**

| Trigger | Mechanism |
|---|---|
| A complete response for `U` whose marker is `purge`, absent, or invalid | Worker, §4.4 (by the marker's show id, or the copy at `U` when there is none) |
| Status route answers `gone` | Worker, §4.4 |
| Identity transitions | The brackets above |
| A client-side render (RSC refresh or soft navigation) of any page whose marker is `purge`, or of the not-found page (`check`) | `<SavedCopyMarker>` posts its disposition on mount (§4.3) |

**What the phone cannot know.** With no signal, the phone cannot tell who is holding it. A saved copy belongs to the last crew identity that loaded any link of the show on this phone and has not since switched, signed out, or been replaced through a transition the phone saw. Online, every decision to serve a copy is backed by the server: a `save` or `keep` marker naming the same viewer, or a status-route `ended` answer that ran the page's own identity checks. Only when the app gives no answer (a network error, a timeout, or a platform error page with no marker) does the phone serve a copy on its own judgement. §9 records this limit.

Saved copies live in this origin's Cache Storage and IndexedDB, readable only by this browser profile. Nothing is sent anywhere.

### 4.7 Client side

#### 4.7.1 How the page knows it is a saved copy

When the worker serves `S(U)`, it rewrites the stored HTML immediately after `<head>` and drops the stored `content-length` and `content-encoding` headers. It inserts two elements:

- `<meta name="fxav-served" content="offline|slow|server-error|ended" data-saved-at="<ISO>">`
- a `<style>` block that paints a sticky `body::before` notice ("Saved copy from {time}") while `html` lacks `data-fxav-bar="mounted"`.

`<SavedCopyBar>` reads the meta in its mount effect, after hydration and never during render, sets `data-fxav-bar="mounted"` on `html` after mounting, and from then on owns the notice. If the page's JavaScript fails to load or hydrate, the CSS notice stays visible, so a saved copy can never appear without a notice. A document without the meta is `live`. An unknown `content` value is treated as `offline`.

Ratified by the spike (§11): the injected meta produced no hydration warning in Chromium or WebKit, and the page hydrated exactly like a byte-for-byte copy. The CSS notice adds no element to the body, so React has nothing to reconcile. The plan proves that with the same hydration check.

#### 4.7.2 The pinned bar

`<SavedCopyBar>` is a client component in `components/offline/` (not `components/crew/**`, which the layout redesign owns). `_CrewShell.tsx` renders `<SavedCopySlot>` directly after `<Header>`, a one-line insertion; the slot renders the marker, the bar (crew viewers only) and the registrar. Bar props: `renderedAt` (ISO string), `sheetUnavailable` (`data.lastSyncStatus === 'sheet_unavailable'`), `slug`, `shareToken`.

The bar is full width, `sticky top-0`, above section content and below the header, and an open avatar menu paints above it. It renders inside its always-mounted live region (`saved-copy-bar-region`), and the region is the element that carries this placement (Dimensional Invariants below). In the `hidden` state it renders no visible bar; its empty live region stays mounted so the first state change is announced, and adds no height. The server render and the hydrating render read no meta, clock or connection (§4.7.1), so they paint `hidden`, with one exception the props alone decide: when `sheetUnavailable` is true they paint `sheet-gone`, pinned line and detail, so a live page whose sheet is gone does not shift when the bar would otherwise arrive after mount. On a saved copy the mount effect then moves it to `sheet-gone-saved` (or a higher state, by the precedence below), which pins the same line.

**One pinned line, and the full sentence once (owner decision, 2026-10-30, mockup https://claude.ai/artifact/SUYtZFqmmVkGKdPEnNVADj, Q1 Option B).** The region pins one short line: a bold lead, then a plain run. When the state has more to say, the full sentence is a separate block, `saved-copy-bar-detail`, rendered directly after the region and above the crew sections, in normal flow. It shows once at the top of the page, in the bar's tone and with a bottom edge so it reads as the bar's continuation, and it scrolls away under the pinned line. It renders only for a state that has a detail. One bottom edge closes the bar: while any of the detail shows below the pinned line, the detail draws it and the pinned line's own border is transparent, so no line splits the two; once the detail has scrolled up under the pinned line, the pinned line draws it. The pinned line keeps its border width either way, so its height does not change. For a same-day save served offline or slow ("No signal.", "Slow connection."), the pinned line fits on one line at 390 px and may wrap to two at 320 px; the server-error cause, "Couldn't load the latest version.", is longer and can take two lines at 390 px.

**Inputs.** `mode` (from the meta, §4.7.1; becomes `live` when `renderedAt` differs from its value at mount, which means an RSC refresh brought server content), `online` (`navigator.onLine` plus `online`/`offline` events), `age` (now minus `renderedAt`, re-evaluated every 60 seconds), `sheetUnavailable`, `updating` (a fresh copy is saved and the reload is under way, §4.7.3), `justUpdated` (first 4 seconds after a recovery reload).

**States and exact copy (owner decision, 2026-10-30, Q2 Option 2: the bold part is the age).** `{time}` is the saved time in the phone's local time zone: `2:14 PM` when it is today, otherwise `Fri Oct 24, 6:02 PM`. `{ago}` is `just now` under 1 minute, `N min ago` under 60 minutes, `N hr ago` under 48 hours, then `N days ago`. A saved time in the future reads `just now`. `{cause}` depends on mode: `offline` "No signal.", `slow` "Slow connection.", `server-error` "Couldn't load the latest version.", and a live page with `online` false "No signal.". In the pinned line, bold is marked `**…**`; the rest is plain.

| State | When | Tone token | Icon | Pinned line | In-flow detail (shown once, scrolls away) |
|---|---|---|---|---|---|
| `hidden` | mode `live`, online, sheet fine, not `justUpdated` | none | none | no visible bar (the empty live region stays mounted) | none |
| `saved-fresh` | mode `offline`, `slow` or `server-error`, or mode `live` with `online` false; age under 6 h | `bg-info-bg` | signal-off | **Saved {time}, {ago}.** {cause} | Showing your saved copy. |
| `saved-old`, with a saved time | same, age 6 h or more | `bg-stale-tint` | clock | **Saved {time}, {ago}.** {cause} | Things may have changed since then. |
| `saved-old`, no saved time known | same, the save time unusable (guard row below) | `bg-stale-tint` | clock | **{cause}** Showing your saved copy. | none |
| `ended` | mode `ended` | `bg-stale-tint` | clock | **This show has ended.** | You're seeing the last version, from {time}. Without a time: "You're seeing the last version." |
| `sheet-gone` | `sheetUnavailable`, mode `live` | `bg-warning-bg text-warning-text` | alert | **Doug's sheet is gone.** Check with Doug. | Doug's sheet for this show isn't available in Google Drive anymore. You're seeing the last version we have. Check with Doug before relying on it. |
| `sheet-gone-saved` | `sheetUnavailable`, mode `offline`, `slow` or `server-error` | `bg-warning-bg text-warning-text` | alert | **Doug's sheet is gone.** Check with Doug. | Doug's sheet for this show isn't available in Google Drive anymore. This is the last version we have, from {time}. Check with Doug before relying on it. Without a time, ", from {time}" is dropped. |
| `updating` | `updating` | `bg-info-bg` | sync (spins; static under reduced motion) | **Signal's back.** Loading the latest version. | none |
| `updated` | `justUpdated`, none of the above apply | `bg-surface text-status-positive-text` | check | Updated. You're on the latest version. | none |

Precedence when several apply: `ended` > `updating` > `sheet-gone-saved` > `sheet-gone` > `saved-old` / `saved-fresh` > `updated` > `hidden`. `updating` outranks the sheet warnings because it lasts only until the reload, which brings the fresh state. A live page with `sheetUnavailable` and `online` false shows `sheet-gone`, since its warning already says the content is the last version.

The wording "isn't available in Google Drive anymore" replaces the mockup's "is no longer in Google Drive" (author's call): `sheet_unavailable` also covers a sheet that was unshared or moved.

**Guard conditions.**

| Input | Behavior |
|---|---|
| `renderedAt` (or the meta's `data-saved-at`) missing, empty, or not a valid date | Copy drops the time and age: a saved state pins "**{cause}** Showing your saved copy." with no detail, and the `ended` and `sheet-gone-saved` details drop ", from {time}". The tone is the old-copy token, since the age is unknown |
| `renderedAt` in the future | Age reads `just now` |
| Age exactly 6 h | `saved-old` (the boundary belongs to old) |
| `navigator.serviceWorker` absent | No registration and no saved copy; the bar still handles `online` false on an open live page |
| Storage quota error on save | The worker abandons the save, keeps the show's previous copy, and posts `save-failed` to open pages, which log `CREW_OFFLINE_SAVE_FAILED` (§6) |

**Accessibility.** The bar's always-mounted live region carries `role="status"`, `aria-live="polite"`. Text contrast uses `DESIGN.md` §1.2 pairs (text on `info-bg`, `stale-tint`, `warning-bg`); the detail uses the same tones. The icon is `aria-hidden`; the words carry the meaning, which satisfies the colour-blind floor in `DESIGN.md` §1. The region also holds the state's detail as `sr-only` text, so each state change announces the whole meaning once (the pinned line, then the detail), and the visible detail block is `aria-hidden`, so browsing does not read it a second time. The relative age (`, {ago}`) is visual only (`aria-hidden`), because the 60-second tick rewrites it and a status region re-reads its whole text on every change; the absolute `{time}` stays announced, so the minute tick announces nothing. While the visible bar shows, `<html>` carries `scroll-padding-top` equal to the region's height, following it as the copy and width change, so a focused control or a scrolled-to target lands below the pinned bar instead of under it (WCAG 2.4.11); it is removed when the bar hides and when the bar unmounts. A live page's `sheet-gone`, rendered by the server (above), is present when the region first renders, so it is not announced on load, as no text present at load is; every later state change is.

##### Dimensional Invariants

The shell is `flex min-h-0 flex-1 flex-col` (`_CrewShell.tsx`, `data-testid="crew-shell"`). The bar's live region, `saved-copy-bar-region`, is one of its flex children, between `<Header>` and `<CrewSections>`, and the bar is the region's only child while it shows. So the placement classes sit on the region, and the bar fills it. The detail, `saved-copy-bar-detail`, is the region's next sibling, another flex child of the shell.

| Parent to child | Relationship | Guaranteed by |
|---|---|---|
| `crew-shell` to `saved-copy-bar-region` | region width equals shell width; the bar's equals the region's | `self-stretch` on the region (Tailwind v4 does not default `.flex` to stretch); the bar is a block child |
| `crew-shell` to `saved-copy-bar-region` | region height is the bar's, never grows, and is 0 while the bar is hidden | `flex-none` on the region, which carries no padding, border or min-height |
| viewport to `saved-copy-bar-region` | region top stays at the viewport top after scrolling past the header, and the bar paints above section content scrolled under it | `sticky top-0` plus `z-raised` on the region (section content's positioned elements carry no z-index) |
| avatar menu to `saved-copy-bar-region` | an open avatar menu paints above the bar | `z-raised` is below the menu's `z-dropdown`; a tie would lose, since the header comes first in tree order |
| `saved-copy-bar` to icon | icon keeps its size when the copy wraps | `flex-none` on the icon |
| `crew-shell` to `saved-copy-bar-detail` | detail width equals shell width; its height is its own and never grows; its top is the region's bottom | `self-stretch` and `flex-none` on the detail; it is the region's next sibling |
| viewport to `saved-copy-bar-detail` | the detail is in normal flow: after scrolling past the header plus 200 px its top is above the viewport while the region's top is 0 | no `sticky`, `fixed` or other positioning on the detail (computed `position: static`) |

`tests/e2e/crew-offline-layout.spec.ts` asserts each row with `getBoundingClientRect()` in a real browser (within 0.5 px) at phone width. The pinned line of a same-day save served offline is measured at one line at 390 px and at most two at 320 px; the icon row is measured at 320 px and again at 240 px, below the supported width, where the pinned line must wrap.

##### Transition Inventory

The bar is a pure function of its inputs, so any input change can move it between any two states. Eight states give 28 unordered pairs. Every pair is **instant (no animation)** in both directions, except one: `updated` to `hidden` when the 4-second window ends fades out over 200 ms (instant under `prefers-reduced-motion`). `updating` to `updated` crosses a page reload, so it is a new document, not an animated transition. The in-flow detail comes and goes with its state in the same render, instantly; it never fades, because `updated`, the one state that does, has no detail. The bottom edge passing from the detail to the pinned line, as the detail scrolls under it, and back is instant too: it follows the scroll, not a change of state.

| | saved-fresh | saved-old | ended | sheet-gone | sheet-gone-saved | updating | updated |
|---|---|---|---|---|---|---|---|
| **hidden** | I | I | I | I | I | I | updated to hidden: F. Otherwise I |
| **saved-fresh** | | I | I | I | I | I | I |
| **saved-old** | | | I | I | I | I | I |
| **ended** | | | | I | I | I | I |
| **sheet-gone** | | | | | I | I | I |
| **sheet-gone-saved** | | | | | | I | I |
| **updating** | | | | | | | I (via reload) |

Key: **I** instant. **F** 200 ms fade, instant under reduced motion.

Compound transitions:

- Any input change during the `updated` fade cancels the fade and renders the new state instantly.
- The age tick crossing 6 hours while `updating` keeps `updating` until the reload.
- A second `online` event while a probe is running does not start a second probe.
- An RSC refresh during `updating` (the realtime bridge reconnected first) makes the mode `live`; the bar cancels the recovery and renders whatever the new inputs give.

#### 4.7.3 Coming back online

While the mode is `offline`, `slow`, or `server-error`, the bar asks the worker to `probe(U)` on the `online` event, on a `fresh-ready(U)` message, and every 30 seconds while `navigator.onLine` is true. A probe runs §4.4 steps 2 and 3 without serving anything and replies with the outcome. Probes are silent: the bar keeps its saved state, with the time and age, while one runs.

- saved a new copy: the bar shows `updating`, sets a session flag, and calls `location.reload()`; the new page reads the flag and shows `updated`. `updating` is therefore on screen only between a fresh copy being saved and the reload, so it is never shown when nothing fresh exists.
- purged: `location.reload()` at once. The copy on screen has been disowned by the server, so the page does not keep showing it while the connection stays slow.
- ended: no reload; the bar shows `ended`.
- failed (network error, timeout, kept): nothing changes.

A `purged(showId)` message for this page's show (§4.4 step 5) reloads the page at once, the same as a purged probe.

On a live page, `<SavedCopyRegistrar>` posts `ensure-saved(U, renderedAt)` once the worker controls the page, and again whenever `renderedAt` changes after an RSC refresh, at most once per 10 seconds. That one message covers the first visit (§4.4) and keeps the saved copy current with realtime updates.

A `router.refresh()` that fires while the network is down makes Next fall back to a full page load (§11), which the worker answers from `S(U)`. The page survives with the bar; open menus and modal state are lost.

#### 4.7.4 The section in the URL

The saved copy is stored without its query string, so it opens on the section that was showing when it was saved, whatever `?s=` the URL carries; `CrewSections` seeds from the server's `initialSection` and does not reconcile the URL on mount (`useState(initialSection)`). In a saved-copy mode the bar replaces the URL's `s` parameter with the rendered section, read from the `data-active-section` attribute of the `crew-shell-sections` wrapper, using `history.replaceState`. The URL then tells the truth about what is on screen, and no file under `components/crew/**` changes. If the attribute is absent, the URL is left alone.

#### 4.7.5 The "not saved yet" page

A small self-contained HTML page embedded in the worker (no Next chunks; inline styles with the `DESIGN.md` light and dark values), served on a network error when there is no `S(U)`:

- Heading: "No signal, and this show isn't saved on this phone yet."
- Body: "Open this link once while you have signal or wifi. After that it works here even with no signal."
- Button: "Try again", at least 44 px tall, in the app's secondary-action style (surface fill, `text-faint` outline, the app's focus ring). It calls `location.reload()`.
- Small: "This page reloads by itself once it can reach the server."

It also retries by itself: every 30 seconds while `navigator.onLine` is true (the bar's probe cadence, §4.7.3), when the tab becomes visible again (`visibilitychange`), and on the `online` event. A retry is `fetch(location.href, { cache: "no-store" })`, and the page reloads only when the response is ok. The fetch is not a navigation, so the worker passes it to the network. A phone that reports a connection but carries no data therefore keeps this page rather than flashing the browser's error page, and the note promises only what the page can do: `online` alone never fires on venue wifi with a dead uplink. It is also what a phone sees with no signal after its copy was wiped.

#### 4.7.6 Actions offline

| Action | Offline behavior |
|---|---|
| `tel:` and `mailto:` links | Unchanged (R11) |
| Open in Maps | Unchanged link; the Maps app may have its own offline maps |
| Not you? Switch person | Disabled while `online` is false (`aria-disabled`, still focusable), and reads "Not you? Needs signal" (R11), so it still says what it is for. Its accessible name is its visible text in both states, "Not you? Switch person" online and "Not you? Needs signal" offline, with no `aria-label` override (WCAG 2.5.3) |
| Section tabs, theme toggle, avatar menu | Work from the saved page (client-side only) |
| Stage diagrams, agenda | Served from the saved assets (§4.8) |
| Report a problem | Piece 2 (§5) |
| Reel | Not saved (R2); with no signal it fails the way it does today |

#### 4.7.7 Registration

`<SavedCopyRegistrar>` (rendered by the slot for crew viewers) registers the URL /sw.js with `scope: '/'` and `updateViaCache: 'none'` once the page is idle, calls `navigator.storage.persist()` once (best effort), and runs the `ensure-saved` messages (§4.7.3). Registration failure logs `CREW_OFFLINE_SW_REGISTER_FAILED` (§6) and changes nothing visible. Only crew show pages register the worker.

### 4.8 Stored assets, static files, caps

- **Asset list from the server.** `<SavedCopySlot>` builds `data-assets` from the same show data and URL shapes the crew components use: every stage diagram URL `Gallery` would request and every agenda URL `/api/asset/agenda/<showId>/<fileId>` for each `agenda_links` entry with a `fileId`. Nothing is scraped from HTML, so an unopened agenda is still listed (R2). The plan pins the slot's URL builders to the components' by a shared helper, or by a test that renders both and compares.
- **Agenda viewer code.** When the list contains an agenda, the registrar, online and idle, loads the `AgendaPdfViewer` module through the sheet's own loader (`components/agenda/loadAgendaPdfViewer.ts`, so it stores the same chunks the sheet requests) and fetches the pdf.js worker URL that module assigns, the shared `PDF_WORKER_SRC` from `components/agenda/pdfWorkerSrc.ts` (never read back from react-pdf), so both pass through the worker and land in its static cache. An unopened agenda then opens offline.
- **Static files.** `/_next/static/**` and `/fonts/**` are cache first. A static entry is deleted only when no saved copy references it and it was stored more than 14 days ago, so chunks loaded lazily while online stay available.
- **Caps** (author's calls): one asset over 25 MB is skipped; one that has not arrived whole, headers and body, 30 seconds after the save requested it is skipped and its fetch aborted, so an optional asset never holds back the page's copy; asset prefetch for one show stops past 75 MB; at most 10 saved shows, and an 11th evicts the least recently opened show with its assets. A skipped asset fails offline the way it does today. Static files are not capped; the 14-day rule bounds them.

### 4.9 Worker updates

A new deployment changes the bundled worker source, so the browser installs the new worker on its next check (no-store on the URL /sw.js, `updateViaCache: 'none'`). The new worker calls `skipWaiting()` and `clients.claim()`; cache names carry a schema version, and the new worker migrates or drops older schema caches on activate. Saved copies survive a deployment whose schema version is unchanged.

### 4.10 Kill switch

| Field | Value |
|---|---|
| Storage | Environment variable `CREW_OFFLINE_DISABLED` (`1` disables) |
| Write path | Vercel project environment; no code change |
| Read paths | (1) the /sw.js route handler at request time; (2) the crew page server render, passed to `<SavedCopyRegistrar>` |
| Effect | (1) /sw.js serves a worker that deletes every cache and IndexedDB store it owns, unregisters itself, and answers nothing; (2) the registrar unregisters any existing registration instead of registering |

Both reads happen at runtime, per request; the route handler opts out of static rendering. The plan proves it with requests to /sw.js with the variable set and unset. With the worker gone, no page is served from a saved copy, so the bar shows only for `online` false on an open live page and for `sheet-gone`.

### 4.11 Database change

One nullable column and one function body. Everything else in piece 1 reads existing data.

<!-- spec-lint: ignore — migration file created by this spec's implementation; not yet tracked -->
New migration `supabase/migrations/<timestamp>_shows_unpublished_at.sql`: `alter table public.shows add column if not exists unpublished_at timestamptz;` and a `BEFORE UPDATE` trigger on `public.shows` that sets `new.unpublished_at = clock_timestamp()` whenever `old.published` is true, `new.published` is false, and `new.archived` is false. There are at least two unpublish write paths today, `_unpublish_show_core` and the token unpublish in `unpublishAndConsumeUnpublishToken` (`lib/sync/unpublishShow.ts`), so the column is stamped by a trigger rather than by each path: any present or future unpublish stamps it, and an archive (which sets `archived = true` in the same update) does not. Republish does not clear it; only "unpublished since the save" matters (§4.5).

| Layer | Action |
|---|---|
| Table DDL | Add `shows.unpublished_at timestamptz` (nullable, no default, no backfill: a null reads as "never unpublished since this feature shipped", and copies saved before the feature do not exist) |
| Inline CHECKs | N/A, no constraint |
| Write path | The trigger, on every `UPDATE` of `shows` that unpublishes without archiving. It runs inside whatever transaction made the update, so under that path's existing per-show advisory lock (invariant 2); it adds no lock holder |
| Read path | The status route (§4.5), service role |
| Triggers, cleanup | One new trigger (above); no cleanup |
| RLS and PostgREST grants | Unchanged; the column inherits the table's existing policies, and crew never read it directly |
| Schema manifest | Regenerate with `pnpm gen:schema-manifest` in the same PR |
| Validation project | Apply the migration surgically and reload the PostgREST schema, per the `validation-schema-parity` checklist in AGENTS.md |
| Tests | Unit test of the status route's unpublish condition; a DB test that both unpublish paths stamp the column and that archive does not; add `unpublished_at_null: show.unpublished_at == null` to `unpublishedStateSnapshot` (`tests/db/_b2Helpers.ts`), in the same null-or-not form as its other timestamps, so the existing parity tests compare whether each path stamped it |

## 5. Piece 2: offline reports

### 5.1 Queue

- **Storage.** A phone-wide queue in IndexedDB: one versioned database with one object store keyed by the idempotency key, one record per report: `{ id, showId, slug, surface, surfaceId, context, message, writtenAt, pageRenderedAt, writer, status }`. Every change touches one record in its own transaction (`add` to enqueue, `put` to change status, `delete` on success), so two tabs never overwrite each other's reports; the cap check and the `add` run in one read-write transaction. `context` is the full autocaptured context the modal would have sent. `writer` is the page's opaque viewer key (§4.3 `data-viewer`). The record holds the complete request body, so it can be sent from any page. `sessionStorage` and `localStorage` are not used for queued reports: the first dies with the tab, and a single `localStorage` value would let two tabs overwrite each other.
- **When a report is queued.** `POST /api/report` fails with a network error, or `navigator.onLine` is false at submit. The modal shows "**Saved on your phone.** It will send by itself when you have signal." and a Done button. A new report from the same surface gets a fresh record and key; it never overwrites a queued one.
- **Sending.** A sender mounted beside the report button in `components/layout/Footer.tsx` sends every queued record on page load, `online`, `visibilitychange` to visible, and every 60 seconds while any is queued. It holds a Web Lock (`navigator.locks`) where available so two tabs do not send the same record at once; the idempotency key prevents a duplicate issue either way, and per-record transactions mean a lost lock race can only resend, never drop.
- **Identity.** The request carries `writer`. The server computes the viewer key for the authenticated reporter and, if it differs, rejects the request with the route's existing authentication-failure response and does not file it. The client then marks the record failed with the existing failure copy and keeps the text for a manual resend, so a report is never filed under someone else's name. "Not you? Switch person" needs signal (R11); before it submits, it waits up to 3 seconds for the sender to flush queued records.
- **Results.** The sender sends oldest first. Success removes the record. These keep the record queued and retry later: a network error; 429 `REPORT_RATE_LIMITED_CREW` (crew may file 3 reports an hour, `lib/reports/rateLimit.ts`, so a long offline queue drains over hours; the sender waits until the next send could succeed, using `Retry-After` when present and 20 minutes otherwise); 409 `IDEMPOTENCY_IN_FLIGHT`; any 5xx. Every other answer is final, including `REPORT_HORIZON_EXPIRED`, an authentication or writer-key refusal, and a validation error: the record's status becomes `failed` and it stays in the queue database.
- **Failed records.** A failed record is never silently dropped. The report button shows "1 report couldn't be sent" (or "N reports couldn't be sent") next to the waiting count, and tapping it opens the report modal with that record's text filled in, for a manual resend under the current identity or a discard. The sender owns these records in IndexedDB; the modal's per-surface `sessionStorage` state is not used for them.
- **Button count.** While records for this show are queued, the report button shows "1 report waiting for signal" (or "N reports waiting for signal") in `bg-warning-bg text-warning-text`.
- **Cap.** 10 queued or failed records per phone; an 11th shows the existing failure copy instead of queueing.

### 5.2 Server and Doug's view

- The body gains optional `offline: { writtenAt: string, pageRenderedAt: string | null }` and `writer: string`. `writtenAt` must be an ISO string no later than server receipt plus 24 hours (phone clock skew); otherwise it is dropped and logged. Stored inside the existing `context` jsonb. No migration.
- The GitHub issue body gains a section when `offline` is present:
  - Heading: "Written with no signal"
  - "Written at {writtenAt} (phone time), sent at {server receipt time}."
  - "They were looking at the copy saved at {pageRenderedAt}." (omitted when null)
- Invariant 10: the route already carries a code-carrying emit; the plan adds `log.info` with `code: "REPORT_SUBMITTED_FROM_OFFLINE_QUEUE"` on the success branch when `offline` is present.

### 5.3 Independence from piece 1

Piece 2 reads `pageRenderedAt` from the `#fxav-saved-copy` marker when present (null otherwise) and needs the server to render the viewer key. Whichever PR lands first adds the shared viewer-key helper (§4.1 file list); the other rebases onto it. Either PR can merge first.

## 6. Telemetry

| Code | Where | Kind |
|---|---|---|
| `CREW_OFFLINE_SW_REGISTER_FAILED` | `<SavedCopyRegistrar>` via `clientLog` (`lib/observe/clientLog.ts`) | client `warn` (mirrored to `app_events`) |
| `CREW_OFFLINE_SAVE_FAILED` | worker posts `save-failed`; an open page logs it via `clientLog` | client `warn` |
| `REPORT_SUBMITTED_FROM_OFFLINE_QUEUE` | `POST /api/report` success branch | server `log.info` |

There is no telemetry for "served a saved copy": `clientLog` sends only `warn` and `error` (`info` is console-only), and a served copy is not a warning. Piece 1 adds no mutation surface (/sw.js and the status route are `GET` handlers). Piece 2 changes an existing mutation route that already satisfies invariant 10. None of these codes reaches the UI (invariant 5).

## 7. Testing

TDD per task (invariant 1). The plans own the task lists; this section sets the bar.

- **Worker logic** lives in plain modules under `lib/offline/` (crew-URL match, marker parsing, the §4.4 tables, ordering counters, completeness, caps, eviction, meta and CSS injection), imported by the worker bundle and by Vitest. Every row of §4.3 and §4.4 and every ordering race in §4.6 has a unit test. The worker entry is thin glue. A freshness test fails if the committed bundle differs from a fresh `pnpm gen:sw`.
- **Real-browser e2e** (Playwright, non-interactive) against a production build. The spike found `context.setOffline(true)` unusable for worker tests, so the suite puts a small proxy between the browser and the server with three modes: pass, refuse (network error) and hang (accepts, never answers). WebKit runs over HTTPS through the same proxy (the `__Host-` picker cookie needs a secure context) in an ephemeral context. Cases, in Chromium and WebKit: offline reload shows full content, a working tab switch, and the bar; first visit is saved; hang shows `slow` then updates by itself; archive keeps the copy with the ended bar; reset, unpublish, "Not you?", sign-out and an admin view each wipe it; the "not saved yet" page appears with no copy; an unopened agenda opens offline; JavaScript blocked on a saved copy still shows the CSS notice; dimensional invariants.
- **Identity parity:** the §4.5 scenario table through the page resolver and the status route, same verdict on every row.
- **Brackets:** for each §4.6 transition, a save started between the two purges does not commit, including a first save of a show with no copy.
- **One copy per show:** a save at a new link replaces the copy saved at an old link; a purge at a new link removes a copy saved at an old link; the old link then gets the "not saved yet" page offline.
- **Client-side renders:** with the page open, a reset, an archive and an unpublish each arrive by realtime refresh; the copy is wiped (reset, unpublish) or marked ended (archive), and a following offline reload shows the matching result.
- **Kill switch:** /sw.js with `CREW_OFFLINE_DISABLED` set and unset.
- **Bar:** every state's copy, precedence, guard rows, reduced motion, and the transition inventory.
- **Reports:** queue on network failure; persistence across tab close; multiple records; two tabs enqueueing at once both keep their records; send on `online`; idempotent replay; 429, 409 and 5xx stay queued and retry; final refusals become failed records shown on the button; writer mismatch refuses to file; issue body section; cap; button counts.

## 8. Rollout, PR split, concurrency

| PR | Branch | Contents | Depends on |
|---|---|---|---|
| A | `docs/crew-offline-spec` | This spec and the spike record | none |
| B | `feat/crew-offline-saved-copy` | Piece 1, with its own plan | A merged |
| C | `feat/crew-offline-reports` | Piece 2, with its own plan | A merged |

B and C run at the same time in separate sessions and worktrees. B edits `_CrewShell.tsx` in two small places (the `<SavedCopySlot>` line after `<Header>`, and splitting the `MalformedProjectionError` / `UnmatchedViewerError` branch so each passes its own marker to `<TerminalFailure>`), the route's `page.tsx` (passing markers to `<TerminalFailure>`), `not-found.tsx`, `error.tsx`, `_PickerInterstitial.tsx`, `_SignInOrSkipGate.tsx`, `ShowUnavailable.tsx`, `components/auth/TerminalFailure.tsx`, `components/auth/AvatarMenu.tsx`, `lib/auth/picker/resolveShowPageAccess.ts` and `lib/auth/picker/resolvePickerSelection.ts` (the identity extraction, §4.5), adds the §4.1 files, and adds the §4.11 migration. C edits `components/shared/ReportModal.tsx`, `components/shared/ReportButton.tsx`, `components/layout/Footer.tsx`, `app/api/report/route.ts`, `lib/reports/submit.ts`. Both need the viewer-key helper (§5.3). The pre-switch flush in `AvatarMenu` (§5.1) is C's: C adds it after B merges, or B adds a no-op hook C fills; whichever merges second rebases.

The crew layout redesign runs in parallel in another session. B keeps its `_CrewShell.tsx` changes to those two places, and the redesign keeps a full-width slot under the header for `<SavedCopySlot>`. Both UI PRs pass the invariant-8 UI gate before review.

## 9. Documented limits

- **Who holds the phone.** With no answer from the app, the phone cannot know who is holding it. A copy belongs to the last crew identity that loaded any link of the show on this phone without switching, signing out, or being replaced through a transition the phone saw. An ended copy with no signal is served without the status check. A lost phone that never reconnects keeps its copy.
- **Ended copies last as long as the picker cookie entry.** The picker cookie has a 90-day max-age and evicts its oldest entries past 3800 bytes (`lib/auth/picker/cookieEnvelope.ts`). Once a show's entry is gone, the status route's identity check fails and the ended copy is wiped; the crew member then sees the normal not-found.
- **Identity changes the phone never sees.** A roster removal, selection reset, or claim made on the server while the phone stays offline takes effect at the phone's next online visit to that show, not before.
- **iPhone storage eviction.** Safari deletes a site's scripted storage after 7 days of Safari use without visiting the site, unless it is added to the Home Screen. "Kept by default" (R3) is best effort on iPhone. A web manifest would make Home Screen installs nicer; it is a candidate follow-up, not part of this work.
- **"Bars but no data."** `navigator.onLine` reports true on a connection that carries no traffic. An open live page then shows no bar until it is reloaded, when the 8-second budget serves the saved copy in `slow` mode.
- **No streamed skeleton.** Once the worker is installed, crew pages appear when complete instead of streaming (§4.4).
- **First visit with no signal** gets the "not saved yet" page, by definition.
- **Data use.** Diagram and agenda prefetch, and the agenda viewer code, download on whatever connection the phone has, up to the §4.8 caps.
- **Report clock.** `writtenAt` is phone time and is labelled as such.
- **Offline realtime noise.** `ShowRealtimeBridge` keeps retrying its token mint while offline (about 12 failed requests in the spike's WebKit window). Harmless, unchanged.
- **Section on reload.** An offline reload opens on the section that was showing at save time (§4.7.4).
- **A failed purge, a failed marker and a worker restart.** The quarantine after a failed purge (§4.6) lives in the worker's memory and in a Cache Storage marker. If IndexedDB and Cache Storage both refuse writes, so the marker is never written and the escalation cannot run, and the browser restarts the worker before either recovers, the new worker starts unquarantined, and the copy the purge could not remove can be served again until a purge succeeds or the escalation runs.
- **An unexpected error after the shell.** An uncaught throw once the streamed shell is out renders `error.tsx`, and its `hold` marker, on the client only, so the worker reads no marker and purges `S(U)` (§4.4 step 3). The known failure arms render `<TerminalFailure>` with their marker inline (`hold`, `keep` or `purge`, §4.3), so only an unexpected exception reaches this, and it costs a saved copy, never keeps one too long.

## 10. Left to the builder

- Exact Tailwind classes for the bar within the §4.7.2 tokens, after the UI gate.
- Seeding for the e2e (reuse the existing crew-page fixtures and `pnpm db:seed`).
- Which server-held secret keys the viewer HMAC, as long as it is never sent to the client. Rotating it wipes saved copies at their next check and turns queued reports into failed records for manual resend (§5.1), so it should be a secret that rarely rotates.
- Whether piece 2's sender lives in `ReportButton.tsx` or a sibling component.

## 11. Spike findings

Full record: `docs/superpowers/specs/probes/2026-10-26-crew-offline-sw-spike.md` (2026-10-26, production build of `origin/main` 044c5f90a, Next 16.3.0, Playwright 1.59.1, seeded Waldorf show).

| Question | Result | Used in |
|---|---|---|
| Offline reload in Chromium | Full crew page rendered from the stored copy; tabs and avatar menu worked; no hydration or page errors | §4.4 |
| Offline reload in WebKit | Same, over HTTPS. Over plain http WebKit never stores the `__Host-` picker cookie, so no crew identity renders | §4.4, §7 |
| How the page learns it is a saved copy | Injected meta and a message protocol both worked in both engines; the meta caused no hydration warning | §4.7.1 |
| RSC requests | Passed through untouched; `router.refresh()` online worked; offline it fell back to a full load answered by the stored copy | §4.2, §4.7.3 |
| Back online | `location.reload()` got the fresh page through the worker and replaced the stored copy | §4.7.3 |
| Sizes | HTML 154 to 196 KB decoded (about 26 KB gzip); 19 static files, 1.62 MB decoded; Inter font 179 KB under `/fonts/` | §4.2, §4.8 |
| Old build offline | A copy from build A rendered offline with build A chunks after the server moved to build B; reconnecting hard-navigated into build B cleanly | §4.6, §4.9 |
| First visit | Never stored: the worker installs during it | §4.4 |
| Query parameter | A copy keyed by path renders its own saved section regardless of `?s=` | §4.7.4 |
| Test harness | `context.setOffline` unreliable for workers; stopping or hanging the server is reliable in both engines | §7 |

Not verified by the spike: real iOS Safari, Home Screen mode, storage eviction, real-show diagram sizes, purge paths, buffered navigation timing. The plan covers purge paths and buffering in e2e; the rest are §9 limits.
