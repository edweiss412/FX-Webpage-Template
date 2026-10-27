# Crew page offline: saved copy, age note, offline reports

**Status:** Draft v3, 2026-10-26 (after cross-model spec review round 2). Owner-approved for autonomous ship (Eric, brainstorm 2026-10-26).
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

Every item below was decided by the owner in the 2026-10-26 brainstorm, or is marked as the author's call and was played back to the owner, who approved the playback ("looks good"). A reviewer verifies these against this section; they are not open for redesign.

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
| R13 | One saved copy per show link per phone. A copy is never served to a viewer other than the crew identity it was rendered for, as far as the phone can know (§4.6, §9). | Brief constraint (parent session), owner-confirmed via R5 |
| R14 | Sheet-removed detection reuses `shows.last_sync_status = 'sheet_unavailable'`. No sync change. | Recon finding, §3.4 |
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
`app/sw.js/route.ts`, `app/api/saved-copy/status/route.ts`, `components/offline/SavedCopySlot.tsx`, `components/offline/SavedCopyBar.tsx`, `components/offline/SavedCopyRegistrar.tsx`, `components/offline/SavedCopyPurge.tsx`, `lib/offline/` (worker logic shared with tests), `lib/offline/viewerKey.ts` (viewer-key helper shared with piece 2), `lib/offline/__generated__/swSource.ts`, `scripts/generate-sw-source.ts`.

Why hand-written and not Serwist (R12): Serwist precaches a build's static files and applies route strategies. Here the cached document is per viewer, is saved or purged on server instructions, is ordered against identity changes, and decides between a saved copy and a not-found by asking the server. That is a small, specific state machine; writing it directly keeps every rule in one place and adds no runtime dependency. The worker is written in TypeScript under `lib/offline/`, bundled with the existing `esbuild` dev dependency by `pnpm gen:sw` into a committed string module, and a freshness test fails when the committed bundle does not match its sources (the `gen:spec-codes` pattern). Vitest imports the same sources.

### 4.2 Worker scope

The worker registers at scope `/` and acts only on:

| Request | Handling |
|---|---|
| `GET` navigation whose path is a crew URL: `/show/<slug>/<token>` with an optional trailing slash, where `<token>` is not `unpublish` | §4.4 |
| Any navigation (`GET` or `POST`) to `/auth/sign-out`, `/auth/callback`, or `/api/auth/picker-bootstrap` | Passed through unchanged (`respondWith(fetch(request))` with the request's own redirect mode), with every saved copy purged before the request is sent and again after its response arrives (§4.6) |
| `GET /_next/static/**` and `GET /fonts/**` | Cache first, store on first fetch (§4.8) |
| `GET /api/asset/diagram/**` and `GET /api/asset/agenda/**` listed by a saved copy | Network first with a 5-second timeout, falling back to the stored asset (§4.8) |
| Everything else, including Next RSC requests (`_rsc` query parameter or `RSC: 1` header), Server Action POSTs, all other `/api/**` and `/auth/**`, admin pages, `/show/<slug>/unpublish` | Never answered: the worker does not call `respondWith`, so the browser behaves exactly as today |

The crew-URL test is derived, not listed: a unit test walks `app/show/[slug]/` and asserts that every static sibling of `[shareToken]` is excluded, so a sibling added later fails the test instead of being swallowed.

### 4.3 The marker

Every page this route renders carries exactly one marker element in its body:

```html
<template id="fxav-saved-copy" data-v="3" data-disposition="save|keep|hold|check|purge" ...></template>
```

A `save` marker also carries `data-rendered-at` (server render time, ISO 8601 UTC), `data-show-id`, `data-epoch` (the picker epoch of the resolved selection), `data-viewer` (an opaque viewer key: HMAC-SHA256 under a server-held secret over `showId:crewMemberId`, base64url, so no crew id is exposed), and `data-assets` (JSON array of asset URLs to save, §4.8). A `keep` marker carries `data-show-id` and `data-viewer` for the crew identity the server had already resolved when it failed.

| Page rendered | Disposition | Rendered by |
|---|---|---|
| `<CrewShell>` for `viewer.kind === "crew"` | `save` | `<SavedCopySlot>` in `_CrewShell.tsx` |
| `<CrewShell>` for `admin`, `admin_preview`, or `staticPreview` | `purge` | `<SavedCopySlot>` (strict R13: a phone now showing an admin view drops the crew copy) |
| `<PickerInterstitial>`, `<SignInOrSkipGate>`, `<ShowUnavailable />` | `purge` | `<SavedCopyPurge>` in each |
| `<TerminalFailure>` in the `resolved` crew arm, after identity resolved (the `getShowForViewer` failure) | `keep` with that viewer | marker passed into `<TerminalFailure>` |
| `<TerminalFailure>` in the `infra_error` arm (identity never resolved), and the route's `error.tsx` | `hold` | marker added to each |
| `<TerminalFailure>` anywhere else: `renderPickerRepick` and `renderRacedCrewMiss` roster failures (after an identity rejection), the `no_auth` roster failure, the admin data failure | `purge` | marker passed into `<TerminalFailure>` |
| The route's `not-found.tsx` | `check` | marker added to it |
| Anything else, including a streamed `redirect()` and a page with no marker | treated as `purge` | none (fail closed) |

The worker reads the first `id="fxav-saved-copy"` element in the complete body (§4.4). An unknown `data-v` or `data-disposition`, or a `save` marker missing any required attribute, is treated as `purge`.

### 4.4 Navigation

For a crew-URL navigation, `U` is the storage key (path, trailing slash removed, query ignored) and the fetch always uses the full request URL, query included, so `?gate=skip` and `?s=` keep working online. `S(U)` is the saved copy, if any.

1. **If `S(U)` is marked ended** (§4.5), the link is dead by construction (§3.4), so the worker skips the page fetch and asks the status route instead (5 s). `ended`: serve `S(U)` in `ended` mode. `gone`: purge and fetch the page as in step 2. Network error or timeout: serve `S(U)` in `ended` mode (the phone cannot check, §9). Server error: serve the network not-found by fetching the page as in step 2, and keep `S(U)`.
2. **Otherwise fetch the request URL and buffer the whole response**, up to 8 seconds for headers and body together.
3. **Complete response in time.** Read the marker, then:

| Marker | `S(U)` exists | Serve | Then |
|---|---|---|---|
| `save` | either | the network response | commit it as `S(U)` under the save rules (§4.6, §4.8) |
| `keep` | yes, same `data-show-id` and `data-viewer` | `S(U)` in `server-error` mode | none |
| `keep` | yes, different viewer or show | the network response | purge `S(U)` |
| `keep` | no | the network response | none |
| `hold` | either | the network response | none |
| `check` | yes | ask the status route (5 s). `ended`: mark `S(U)` ended and serve it in `ended` mode. `gone`: purge, serve the network response. Error or timeout: serve the network response, keep `S(U)` | none |
| `check` | no | the network response | none |
| `purge`, or treated as `purge` | either | the network response | purge `S(U)` |

A response that is not HTML: an opaque redirect (navigations use `redirect: "manual"`) is served and purges `S(U)`, since every redirect this route issues starts an identity change; any other response with status 500 or above and no marker (a platform error before the app ran) serves `S(U)` in `server-error` mode when it exists, the same as no response at all, since it carries no information about the viewer; anything else without a marker is treated as `purge`.

4. **Network error before completion.** `S(U)` exists: serve it in `offline` mode. No `S(U)`: serve the built-in "not saved yet" page (§4.7.5).
5. **8 seconds pass without a complete response.** `S(U)` exists: serve it in `slow` mode and let the fetch run on, for up to 60 seconds more. When it completes, apply the step 3 table without serving anything; if that saved a new copy, post `fresh-ready(U)` to open pages of `U`; if it purged, post `purged(U)`. No `S(U)`: keep waiting for the network with no worker timeout, since there is nothing better to show.

Buffering costs crew the route's streamed loading skeleton once the worker is installed: the browser keeps the previous screen until the page is complete. That is the price of two guarantees streaming cannot give. The worker sees the marker before it chooses what to serve, so it never has to correct a page after the fact. And a connection that drops mid-page falls back to the saved copy instead of leaving a half-rendered page. The 8-second budget is the author's call; the spike measured the fallback at 8.05 s (§11).

**The first visit.** The worker installs during the first visit, so that navigation never passes through it (§11). Once the worker controls the page, `<SavedCopyRegistrar>` posts `ensure-saved(U, renderedAt)`. The worker skips it when it already holds, or is already storing, a copy of `U` with that `renderedAt`; otherwise it fetches `U` itself with the page's cookies and runs the step 3 table without serving anything.

### 4.5 Status route

`GET /api/saved-copy/status?show=<showId>&epoch=<n>&viewer=<key>&saved=<savedAt>` answers one question: would the page, if this show were still live, resolve this request to the crew member the copy was saved for, and has nothing but an archive happened to the show since the copy was saved?

It returns `200 { "state": "ended" }` only when every condition below holds, and `200 { "state": "gone" }` otherwise.

**Lifecycle conditions**, read from the show row by `show`:

- the row exists and `archived = true`;
- `picker_epoch = epoch + 1` (the archive's own bump, and nothing else; §3.4);
- `unpublished_at` is null or earlier than `saved` (no unpublish since the copy was saved; §4.11).

**Identity conditions.** The route runs the page's own identity resolution, not a restatement of it: the identity half of `resolveShowPageAccess` and `resolvePickerSelection` is extracted into one function that both the page and this route call. The page calls it after its lifecycle gates; the route calls it with the lifecycle gates replaced by the three conditions above, and with the picker entry's epoch compared to `epoch` instead of the row's current epoch. The identity verdict must be the crew member whose viewer key is `viewer`. Every identity input the page consults is therefore consulted here, in the same order: admin session (an admin is never this crew member), Google session and its match to the selection, the picker entry for `show`, roster membership, `selections_reset_at`, `claimed_via_oauth_at`, and the signed-in email against the crew row.

A parity test pins this: one table of identity scenarios, covering every input above in both its passing and failing state, runs through the page's resolver for a live show and through this route for the same show archived, and asserts the same allow or deny for every row. A new identity input added to the page later fails the parity test until the route consults it too.

Infra faults return `500 { "error": "<code>" }`, which the worker treats as a timeout. `Cache-Control: no-store`. The route only reads. Its answer tells a caller who already holds the copy's ids and the matching identity that the show ended, which the copy is about to say. Supabase calls follow invariant 9. It is a `GET` handler, so it is not an invariant-10 mutation surface.

Cases: archive alone keeps the copy (R3). A reset before or after the archive leaves an epoch gap of two or more and wipes it (R4). An unpublish since the save wipes it (R15). "Not you?", sign-out, a different Google account, an admin session, roster removal, a selection reset, or a claim each fail the identity conditions and wipe it (R5, R13).

### 4.6 Saving, purging, and ordering

**One copy per URL.** `S(U)` stores the HTML, the marker fields (including `showId` and `viewer`), the `savedAt` time (`data-rendered-at`), the request start ordinal, and the list of asset and static URLs it depends on. A show can have several URLs over time (every reset, archive and unarchive issues a new token), so every purge of a show removes all saved copies whose `showId` matches, not only the URL in hand.

**Ordering.** The worker keeps a persisted global generation counter `G` and a per-show counter `g(showId)`. Every purge of a show increments `g(showId)`; a purge of everything increments `G`. Every save captures `(G, g(showId))` and a monotonically increasing request ordinal when its fetch starts (the show id comes from the URL's existing copy or, for a first save, is checked against the marker at commit), and commits only if, at commit time, both counters are unchanged and its ordinal is greater than the stored copy's. A slow response for viewer A that finishes after a purge therefore never lands, whichever of the three save sources it came from (navigation, `ensure-saved`, or a step-5 continuation).

**Identity transitions are bracketed.** A purge before a transition stops saves that started earlier, but a save can start after that purge and still carry the old cookies until the transition completes. So every identity transition the phone can see purges twice, once before it starts and once after it completes, and any save that started in between fails the generation check:

| Transition | First purge | Second purge |
|---|---|---|
| "Not you? Switch person" | `AvatarMenu` posts `purge(showId)` and waits up to 500 ms for the acknowledgement before submitting `clearIdentity` | `AvatarMenu` posts `purge(showId)` again when the action settles, success or failure |
| `/me` sign-out (`/auth/sign-out`) | Worker, when the navigation request starts (§4.2) | Worker, when its response arrives |
| Google sign-in completing (`/auth/callback`) | Worker, request start | Worker, response |
| Picker bootstrap (`/api/auth/picker-bootstrap`) | Worker, request start | Worker, response |
| Picking a name in the picker | `<SavedCopyPurge>` on the picker's mount (the picker only renders when no valid selection exists) | Not needed: after the pick, the page renders for the new viewer, whose `save` replaces the copy |

**Completeness.** A save commits only after every asset in `data-assets` (within caps, §4.8) and every `/_next/static/**` and `/fonts/**` URL referenced in the saved HTML is present in the worker's caches, fetching any that are missing. If any required static file cannot be fetched, the save is abandoned and the previous `S(U)` stays. A committed copy can therefore always hydrate offline, including a copy fetched in the background from a newer deployment.

**Purge triggers.**

| Trigger | Mechanism |
|---|---|
| A complete response for `U` whose marker is `purge`, absent, or invalid | Worker, §4.4 |
| An opaque redirect for `U` | Worker, §4.4 |
| Status route answers `gone` | Worker, §4.4 |
| Identity transitions | The brackets above |
| A client-side render (RSC refresh) of the picker, the sign-in gate, `ShowUnavailable`, or an admin `CrewShell` | `<SavedCopyPurge>` / `<SavedCopySlot>` posts `purge(showId)` on mount |

**What the phone cannot know.** With no signal, the phone cannot tell who is holding it. A saved copy belongs to the last crew identity that loaded the link on this phone and has not since switched, signed out, or been replaced through a transition the phone saw. Online, every decision to serve a copy is backed by the server: a `save` or `keep` marker naming the same viewer, or a status-route `ended` answer that ran the page's own identity checks. Only when the app gives no answer (a network error, a timeout, or a platform error page with no marker) does the phone serve a copy on its own judgement. §9 records this limit.

Saved copies live in this origin's Cache Storage and IndexedDB, readable only by this browser profile. Nothing is sent anywhere.

### 4.7 Client side

#### 4.7.1 How the page knows it is a saved copy

When the worker serves `S(U)`, it rewrites the stored HTML immediately after `<head>` and drops the stored `content-length` and `content-encoding` headers. It inserts two elements:

- `<meta name="fxav-served" content="offline|slow|server-error|ended" data-saved-at="<ISO>">`
- a `<style>` block that paints a sticky `body::before` notice ("Saved copy from {time}") while `html` lacks `data-fxav-bar="mounted"`.

`<SavedCopyBar>` reads the meta synchronously on mount, sets `data-fxav-bar="mounted"` on `html` after mounting, and from then on owns the notice. If the page's JavaScript fails to load or hydrate, the CSS notice stays visible, so a saved copy can never appear without a notice. A document without the meta is `live`. An unknown `content` value is treated as `offline`.

Ratified by the spike (§11): the injected meta produced no hydration warning in Chromium or WebKit, and the page hydrated exactly like a byte-for-byte copy. The CSS notice adds no element to the body, so React has nothing to reconcile. The plan proves that with the same hydration check.

#### 4.7.2 The pinned bar

`<SavedCopyBar>` is a client component in `components/offline/` (not `components/crew/**`, which the layout redesign owns). `_CrewShell.tsx` renders `<SavedCopySlot>` directly after `<Header>`, a one-line insertion; the slot renders the marker, the bar (crew viewers only) and the registrar. Bar props: `renderedAt` (ISO string), `sheetUnavailable` (`data.lastSyncStatus === 'sheet_unavailable'`), `slug`, `shareToken`.

The bar is full width, `sticky top-0`, above section content and below the header. In the `hidden` state it renders nothing.

**Inputs.** `mode` (from the meta, §4.7.1; becomes `live` when `renderedAt` differs from its value at mount, which means an RSC refresh brought server content), `online` (`navigator.onLine` plus `online`/`offline` events), `age` (now minus `renderedAt`, re-evaluated every 60 seconds), `sheetUnavailable`, `updating` (recovery in progress, §4.7.3), `justUpdated` (first 4 seconds after a recovery reload).

**States and exact copy.** `{time}` is the saved time in the phone's local time zone: `2:14 PM` when it is today, otherwise `Fri Oct 24, 6:02 PM`. `{ago}` is `just now` under 1 minute, `N min ago` under 60 minutes, `N hr ago` under 48 hours, then `N days ago`. A saved time in the future reads `just now`. `{lead}` depends on mode: `offline` "**No signal.**", `slow` "**Slow connection.**", `server-error` "**Couldn't load the latest version.**", and a live page with `online` false "**No signal.**".

| State | When | Tone token | Icon | Copy |
|---|---|---|---|---|
| `hidden` | mode `live`, online, sheet fine, not `justUpdated` | none | none | nothing rendered |
| `saved-fresh` | mode `offline`, `slow` or `server-error`, or mode `live` with `online` false; age under 6 h | `bg-info-bg` | signal-off | {lead} Showing your saved copy from {time} ({ago}). |
| `saved-old` | same, age 6 h or more | `bg-stale-tint` | clock | {lead} Your saved copy is from {time} ({ago}). Things may have changed since then. |
| `ended` | mode `ended` | `bg-stale-tint` | clock | **This show has ended.** You're seeing the last version, from {time}. |
| `sheet-gone` | `sheetUnavailable`, mode `live` | `bg-warning-bg text-warning-text` | alert | **Doug's sheet for this show isn't available in Google Drive anymore.** You're seeing the last version we have. Check with Doug before relying on it. |
| `sheet-gone-saved` | `sheetUnavailable`, mode `offline`, `slow` or `server-error` | `bg-warning-bg text-warning-text` | alert | **Doug's sheet for this show isn't available in Google Drive anymore.** This is the last version we have, from {time}. Check with Doug before relying on it. |
| `updating` | `updating` | `bg-info-bg` | sync (spins; static under reduced motion) | **Signal's back.** Getting the latest version. |
| `updated` | `justUpdated`, none of the above apply | `bg-surface text-status-positive-text` | check | Updated. You're on the latest version. |

Precedence when several apply: `ended` > `updating` > `sheet-gone-saved` > `sheet-gone` > `saved-old` / `saved-fresh` > `updated` > `hidden`. `updating` outranks the sheet warnings so crew see that a fresh copy is on its way; the warning returns if the retry fails. A live page with `sheetUnavailable` and `online` false shows `sheet-gone`, since its warning already says the content is the last version.

The wording "isn't available in Google Drive anymore" replaces the mockup's "is no longer in Google Drive" (author's call): `sheet_unavailable` also covers a sheet that was unshared or moved.

**Guard conditions.**

| Input | Behavior |
|---|---|
| `renderedAt` (or the meta's `data-saved-at`) missing, empty, or not a valid date | Copy drops the time and age ("Showing your saved copy." / "This is the last version we have."); tone is the old-copy token, since the age is unknown |
| `renderedAt` in the future | Age reads `just now` |
| Age exactly 6 h | `saved-old` (the boundary belongs to old) |
| `navigator.serviceWorker` absent | No registration and no saved copy; the bar still handles `online` false on an open live page |
| Storage quota error on save | The worker abandons the save, keeps the previous `S(U)`, and posts `save-failed` to open pages, which log `CREW_OFFLINE_SAVE_FAILED` (§6) |

**Accessibility.** `role="status"`, `aria-live="polite"`. Text contrast uses `DESIGN.md` §1.2 pairs (text on `info-bg`, `stale-tint`, `warning-bg`). The icon is `aria-hidden`; the bold lead carries the meaning, which satisfies the colour-blind floor in `DESIGN.md` §1.

##### Dimensional Invariants

The shell is `flex min-h-0 flex-1 flex-col` (`_CrewShell.tsx`, `data-testid="crew-shell"`). The bar is one of its flex children, between `<Header>` and `<CrewSections>`.

| Parent to child | Relationship | Guaranteed by |
|---|---|---|
| `crew-shell` to `saved-copy-bar` | bar width equals shell width | `self-stretch` on the bar (Tailwind v4 does not default `.flex` to stretch) |
| `crew-shell` to `saved-copy-bar` | bar height is its content, never grows | `flex-none` on the bar |
| viewport to `saved-copy-bar` | bar top stays at the viewport top after scrolling past the header | `sticky top-0` plus a `z-index` above section content |
| `saved-copy-bar` to icon | icon keeps its size when the copy wraps | `flex-none` on the icon |

The plan asserts each row with `getBoundingClientRect()` in a real browser (within 0.5 px) at phone width.

##### Transition Inventory

The bar is a pure function of its inputs, so any input change can move it between any two states. Eight states give 28 unordered pairs. Every pair is **instant (no animation)** in both directions, except one: `updated` to `hidden` when the 4-second window ends fades out over 200 ms (instant under `prefers-reduced-motion`). `updating` to `updated` crosses a page reload, so it is a new document, not an animated transition.

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
- The age tick crossing 6 hours while `updating` keeps `updating`; if the retry fails, the bar renders `saved-old`.
- A second `online` event while `updating` does not start a second recovery.
- An RSC refresh during `updating` (the realtime bridge reconnected first) makes the mode `live`; the bar cancels the recovery and renders whatever the new inputs give.

#### 4.7.3 Coming back online

While the mode is `offline`, `slow`, or `server-error`, the bar starts recovery on the `online` event, on a `fresh-ready(U)` or `purged(U)` message from the worker, and every 30 seconds. Recovery shows `updating` and asks the worker to `probe(U)`, which runs §4.4 steps 2 and 3 without serving anything and replies with the outcome:

- saved a new copy: the bar sets a session flag and calls `location.reload()`; the new page reads the flag and shows `updated`.
- purged: `location.reload()`, so the page shows whatever the network now returns.
- ended: no reload; the meta mode is set to `ended` for this document and the bar shows `ended`.
- failed (network error, timeout, kept): back to the previous state.

On a live page, `<SavedCopyRegistrar>` posts `ensure-saved(U, renderedAt)` once the worker controls the page, and again whenever `renderedAt` changes after an RSC refresh, at most once per 10 seconds. That one message covers the first visit (§4.4) and keeps the saved copy current with realtime updates.

A `router.refresh()` that fires while the network is down makes Next fall back to a full page load (§11), which the worker answers from `S(U)`. The page survives with the bar; open menus and modal state are lost.

#### 4.7.4 The section in the URL

`S(U)` is keyed by path, so it opens on the section that was showing when it was saved, whatever `?s=` the URL carries; `CrewSections` seeds from the server's `initialSection` and does not reconcile the URL on mount (`useState(initialSection)`). In a saved-copy mode the bar replaces the URL's `s` parameter with the rendered section, read from the `data-active-section` attribute of the `crew-shell-sections` wrapper, using `history.replaceState`. The URL then tells the truth about what is on screen, and no file under `components/crew/**` changes. If the attribute is absent, the URL is left alone.

#### 4.7.5 The "not saved yet" page

A small self-contained HTML page embedded in the worker (no Next chunks; inline styles with the `DESIGN.md` light and dark values), served on a network error when there is no `S(U)`:

- Heading: "No signal, and this show isn't saved on this phone yet."
- Body: "Open this link once while you have signal or wifi. After that it works here even with no signal."
- Small: "This page reloads by itself when signal comes back."

It reloads on the `online` event. It is also what a phone sees with no signal after its copy was wiped.

#### 4.7.6 Actions offline

| Action | Offline behavior |
|---|---|
| `tel:` and `mailto:` links | Unchanged (R11) |
| Open in Maps | Unchanged link; the Maps app may have its own offline maps |
| Not you? Switch person | Disabled while `online` is false, labelled "Needs signal" (R11) |
| Section tabs, theme toggle, avatar menu | Work from the saved page (client-side only) |
| Stage diagrams, agenda | Served from the saved assets (§4.8) |
| Report a problem | Piece 2 (§5) |
| Reel | Not saved (R2); with no signal it fails the way it does today |

#### 4.7.7 Registration

`<SavedCopyRegistrar>` (rendered by the slot for crew viewers) registers the URL /sw.js with `scope: '/'` and `updateViaCache: 'none'` once the page is idle, calls `navigator.storage.persist()` once (best effort), and runs the `ensure-saved` messages (§4.7.3). Registration failure logs `CREW_OFFLINE_SW_REGISTER_FAILED` (§6) and changes nothing visible. Only crew show pages register the worker.

### 4.8 Stored assets, static files, caps

- **Asset list from the server.** `<SavedCopySlot>` builds `data-assets` from the same show data and URL shapes the crew components use: every stage diagram URL `Gallery` would request and every agenda URL `/api/asset/agenda/<showId>/<fileId>` for each `agenda_links` entry with a `fileId`. Nothing is scraped from HTML, so an unopened agenda is still listed (R2). The plan pins the slot's URL builders to the components' by a shared helper, or by a test that renders both and compares.
- **Agenda viewer code.** When the list contains an agenda, the registrar, online and idle, imports the `AgendaPdfViewer` module and fetches the pdf.js worker URL that module configures (`pdfjs.GlobalWorkerOptions.workerSrc`), so both pass through the worker and land in its static cache. An unopened agenda then opens offline.
- **Static files.** `/_next/static/**` and `/fonts/**` are cache first. A static entry is deleted only when no saved copy references it and it was stored more than 14 days ago, so chunks loaded lazily while online stay available.
- **Caps** (author's calls): one asset over 25 MB is skipped; asset prefetch for one show stops past 75 MB; at most 10 saved shows, and an 11th evicts the least recently opened show with its assets. A skipped asset fails offline the way it does today. Static files are not capped; the 14-day rule bounds them.

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
New migration `supabase/migrations/<timestamp>_shows_unpublished_at.sql`: `alter table public.shows add column if not exists unpublished_at timestamptz;` and `create or replace function public._unpublish_show_core` with its body unchanged except that the same `update public.shows` also sets `unpublished_at = clock_timestamp()`. Republish does not clear it; only "unpublished since the save" matters (§4.5).

| Layer | Action |
|---|---|
| Table DDL | Add `shows.unpublished_at timestamptz` (nullable, no default, no backfill: a null reads as "never unpublished since this feature shipped", and copies saved before the feature do not exist) |
| Inline CHECKs | N/A, no constraint |
| Write path | `_unpublish_show_core` only. It already runs inside its caller's per-show advisory lock (invariant 2); the change adds a column to its existing `update`, so no new lock holder |
| Read path | The status route (§4.5), service role |
| Triggers, cleanup | N/A |
| RLS and PostgREST grants | Unchanged; the column inherits the table's existing policies, and crew never read it directly |
| Schema manifest | Regenerate with `pnpm gen:schema-manifest` in the same PR |
| Validation project | Apply the migration surgically and reload the PostgREST schema, per the `validation-schema-parity` checklist in AGENTS.md |
| Tests | Unit test of the status route's unpublish condition; a DB test that `_unpublish_show_core` stamps the column |

## 5. Piece 2: offline reports

### 5.1 Queue

- **Storage.** A phone-wide queue in IndexedDB: one versioned database with one object store keyed by the idempotency key, one record per report: `{ id, showId, slug, surface, surfaceId, context, message, writtenAt, pageRenderedAt, writer, status }`. Every change touches one record in its own transaction (`add` to enqueue, `put` to change status, `delete` on success), so two tabs never overwrite each other's reports; the cap check and the `add` run in one read-write transaction. `context` is the full autocaptured context the modal would have sent. `writer` is the page's opaque viewer key (§4.3 `data-viewer`). The record holds the complete request body, so it can be sent from any page. `sessionStorage` and `localStorage` are not used for queued reports: the first dies with the tab, and a single `localStorage` value would let two tabs overwrite each other.
- **When a report is queued.** `POST /api/report` fails with a network error, or `navigator.onLine` is false at submit. The modal shows "**Saved on your phone.** It will send by itself when you have signal." and a Done button. A new report from the same surface gets a fresh record and key; it never overwrites a queued one.
- **Sending.** A sender mounted beside the report button in `components/layout/Footer.tsx` sends every queued record on page load, `online`, `visibilitychange` to visible, and every 60 seconds while any is queued. It holds a Web Lock (`navigator.locks`) where available so two tabs do not send the same record at once; the idempotency key prevents a duplicate issue either way, and per-record transactions mean a lost lock race can only resend, never drop.
- **Identity.** The request carries `writer`. The server computes the viewer key for the authenticated reporter and, if it differs, rejects the request with the route's existing authentication-failure response and does not file it. The client then marks the record failed with the existing failure copy and keeps the text for a manual resend, so a report is never filed under someone else's name. "Not you? Switch person" needs signal (R11); before it submits, it waits up to 3 seconds for the sender to flush queued records.
- **Results.** Success removes the record. `REPORT_HORIZON_EXPIRED` and other non-retryable answers move it to the existing expired or failed handling. Network errors keep it queued.
- **Button count.** While records for this show are queued, the report button shows "1 report waiting for signal" (or "N reports waiting for signal") in `bg-warning-bg text-warning-text`.
- **Cap.** 10 queued records per phone; an 11th shows the existing failure copy instead of queueing.

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
- **Brackets:** for each §4.6 transition, a save started between the two purges does not commit.
- **Kill switch:** /sw.js with `CREW_OFFLINE_DISABLED` set and unset.
- **Bar:** every state's copy, precedence, guard rows, reduced motion, and the transition inventory.
- **Reports:** queue on network failure; persistence across tab close; multiple records; two tabs enqueueing at once both keep their records; send on `online`; idempotent replay; writer mismatch refuses to file; issue body section; cap; button count.

## 8. Rollout, PR split, concurrency

| PR | Branch | Contents | Depends on |
|---|---|---|---|
| A | `docs/crew-offline-spec` | This spec and the spike record | none |
| B | `feat/crew-offline-saved-copy` | Piece 1, with its own plan | A merged |
| C | `feat/crew-offline-reports` | Piece 2, with its own plan | A merged |

B and C run at the same time in separate sessions and worktrees. B edits `_CrewShell.tsx` (one line), the route's `page.tsx` (passing markers to `<TerminalFailure>`), `not-found.tsx`, `error.tsx`, `_PickerInterstitial.tsx`, `_SignInOrSkipGate.tsx`, `ShowUnavailable.tsx`, `components/auth/TerminalFailure.tsx`, `components/auth/AvatarMenu.tsx`, `lib/auth/picker/resolveShowPageAccess.ts` and `lib/auth/picker/resolvePickerSelection.ts` (the identity extraction, §4.5), adds the §4.1 files, and adds the §4.11 migration. C edits `components/shared/ReportModal.tsx`, `components/shared/ReportButton.tsx`, `components/layout/Footer.tsx`, `app/api/report/route.ts`, `lib/reports/submit.ts`. Both need the viewer-key helper (§5.3). The pre-switch flush in `AvatarMenu` (§5.1) is C's: C adds it after B merges, or B adds a no-op hook C fills; whichever merges second rebases.

The crew layout redesign runs in parallel in another session. B keeps its `_CrewShell.tsx` change to the single `<SavedCopySlot>` line after `<Header>`, and the redesign keeps a full-width slot under the header for it. Both UI PRs pass the invariant-8 UI gate before review.

## 9. Documented limits

- **Who holds the phone.** With no answer from the app, the phone cannot know who is holding it. A copy belongs to the last crew identity that loaded the link on this phone without switching, signing out, or being replaced through a transition the phone saw. An ended copy with no signal is served without the status check. A lost phone that never reconnects keeps its copy.
- **Identity changes the phone never sees.** A roster removal, selection reset, or claim made on the server while the phone stays offline takes effect at the phone's next online visit to that show, not before.
- **iPhone storage eviction.** Safari deletes a site's scripted storage after 7 days of Safari use without visiting the site, unless it is added to the Home Screen. "Kept by default" (R3) is best effort on iPhone. A web manifest would make Home Screen installs nicer; it is a candidate follow-up, not part of this work.
- **"Bars but no data."** `navigator.onLine` reports true on a connection that carries no traffic. An open live page then shows no bar until it is reloaded, when the 8-second budget serves the saved copy in `slow` mode.
- **No streamed skeleton.** Once the worker is installed, crew pages appear when complete instead of streaming (§4.4).
- **First visit with no signal** gets the "not saved yet" page, by definition.
- **Data use.** Diagram and agenda prefetch, and the agenda viewer code, download on whatever connection the phone has, up to the §4.8 caps.
- **Report clock.** `writtenAt` is phone time and is labelled as such.
- **Offline realtime noise.** `ShowRealtimeBridge` keeps retrying its token mint while offline (about 12 failed requests in the spike's WebKit window). Harmless, unchanged.
- **Section on reload.** An offline reload opens on the section that was showing at save time (§4.7.4).

## 10. Left to the builder

- Exact Tailwind classes for the bar within the §4.7.2 tokens, after the UI gate.
- Seeding for the e2e (reuse the existing crew-page fixtures and `pnpm db:seed`).
- Which server-held secret keys the viewer HMAC, as long as it is never sent to the client and rotating it only wipes saved copies.
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
