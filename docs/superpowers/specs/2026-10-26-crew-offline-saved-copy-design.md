# Crew page offline: saved copy, age note, offline reports

**Status:** Draft, 2026-10-26. Owner-approved for autonomous ship (Eric, brainstorm 2026-10-26).
**Scope:** the crew show page at `app/show/[slug]/[shareToken]/**` and the report flow it hosts.
**Mockups (owner-reviewed):** https://claude.ai/artifact/8RA9JS4oMpLZFf9TyLwrJc

## 1. Intent

Crew open their show page on a phone at the venue to find one fact fast: dock, room, gear location, call time, who to call. The places they need it most are the places with no signal: the loading dock, a basement ballroom, a room where nobody has handed out the wifi password. Today the page needs the network for every load, so a reload in a dead zone shows the browser's offline error and nothing else.

This project makes the page keep working with no signal. Every time the page loads with signal, the phone keeps that version. With no signal, the phone shows the kept version under a pinned bar that says how old it is. The page never presents an old copy as current. That rule is the point of the whole feature: crew act on what the page says, so a copy they believe is live when it is not is worse than no copy.

The work ships as two PRs from this one design (§8):

- **Piece 1, saved copy.** Saving the page, its stage diagrams and agenda; the pinned bar; the wipe rules; the "show has ended" view; the "sheet is gone from Drive" warning.
- **Piece 2, offline reports.** A report written with no signal is held on the phone, sent by itself later, and labelled for Doug as written offline.

The brainstorm originally split the work three ways, with sheet-removed detection as its own piece. Recon found the sync already records it (§3.4), so that piece folded into piece 1 as one more bar state.

### 1.1 Resolved scope, do not relitigate

Every item below was decided by the owner in the 2026-10-26 brainstorm, or is marked as the author's call and was played back to the owner, who approved the playback ("looks good"). A reviewer verifies these against this section; they are not open for redesign.

| # | Decision | Source |
|---|---|---|
| R1 | Save on every successful load with signal. Crew usually open the page before arriving, but that is not guaranteed. | Owner |
| R2 | Save the page text plus stage diagrams plus the agenda PDF, including ones never opened. The reel stays online-only. | Owner (diagrams, agenda); author's call (prefetch unopened, reel online-only), played back |
| R3 | Keep the last version by default, including after the show is archived. An archived show shows "This show has ended" over the last version. A phone that never saved the show still gets the normal not-found. | Owner |
| R4 | Wipe the saved copy when an admin unpublishes the show or resets its share link, the next time the phone has signal. | Owner |
| R5 | Wipe the saved copy immediately when someone switches names on the phone ("Not you?"). | Author's call, played back |
| R6 | When the show's source sheet is gone from Drive, mark it and keep the copy. The warning shows with or without signal. | Owner |
| R7 | When signal returns, the page updates by itself. No tap needed. A short "Updated" line shows for a few seconds. | Owner (auto-update); author's call ("Updated" line), played back |
| R8 | The note is a pinned bar at the top of the page, under the show header, that stays on screen while scrolling (mockup Option A). | Owner |
| R9 | The bar turns to the warmer "old copy" tone, with "Things may have changed since then", at 6 hours. | Author's call, shown in mockup, played back |
| R10 | Reports written offline are held and sent automatically when signal returns. Doug's copy says it was written with no signal, when it was written versus sent, and how old the crew member's page was. | Owner |
| R11 | Call and email links work as usual offline. "Open in Maps" hands off to the Maps app. "Not you? Switch person" is disabled offline with "Needs signal". | Author's call, played back |
| R12 | Hand-written service worker, no new dependency. | Author's call (§4.1 says why) |
| R13 | One saved copy per show link per phone. No copy is ever served to a different viewer than the one it was rendered for (§4.6). | Brief constraint (parent session), owner-confirmed via R5 |
| R14 | Sheet-removed detection reuses `shows.last_sync_status = 'sheet_unavailable'`. No sync change, no new column. | Recon finding, §3.4 |

## 2. Goals, non-goals, anti-goals

**Goals**

- A crew member who opened their show page once with signal can reopen it with no signal and see the full page, with tabs and menus working.
- The pinned bar is on screen whenever the content might not be current, and says how old it is.
- Wipes happen on unpublish, link reset and name switch.
- An archived show keeps its last version on phones that saved it.
- An offline report is never lost because there was no signal, and Doug can tell it was delayed.

**Non-goals**

- Installable app (web manifest, home-screen icon). Not asked for; see §9 for why it would help on iPhone.
- Offline editing of anything other than reports.
- Offline admin pages. The worker ignores every route outside the crew show page.
- Push notifications.
- Background Sync API. iPhone Safari does not support it, so the report queue sends from the open page (§5).

**Anti-goals** (failure even if it technically works)

- An old copy that reads as current. Any path that renders a saved copy without the bar is a P0.
- One person's copy shown to another person on a shared phone.
- The worker breaking a page it should not touch: admin, API, sign-in, or a show page that is online and healthy.
- A worker that cannot be switched off without a code change (§4.9).

## 3. Current state

Citations are file plus symbol; line numbers are drafting-time locators.

### 3.1 The page and its viewers

- `app/show/[slug]/[shareToken]/page.tsx` is dynamic: it reads cookies and headers through `buildShowPageChainRequest` (`lib/auth/picker/showPageChainRequest.ts`). There is no route segment config and no custom `Cache-Control` (`next.config.ts`), and no proxy (middleware) file.
- Access resolves in `resolveShowPageAccess` (`lib/auth/picker/resolveShowPageAccess.ts`): token RPC, then archived, admin session, unpublished, Google session, then the picker cookie `__Host-fxav_picker` (httpOnly, 90 days, `lib/auth/picker/selectIdentity.ts`).
- Outcomes in `page.tsx`: archived or missing show calls `notFound()` (404); unpublished renders `<ShowUnavailable />` with HTTP 200; `needs_picker_bootstrap` renders `<PickerInterstitial>`; the admin arm renders `<CrewShell viewer={{ kind: "admin" }}>`; the resolved arm renders `<CrewShell>` for `kind: "crew"`. `_CrewShell.tsx` also knows `viewer.kind === "admin_preview"` and a `staticPreview` posture.
- The HTML is per viewer: the identity chip name, name-filtered hotels, the LEAD-only budget section (`_CrewShell.tsx`, `budgetVisible`). The whole page ships in one payload and section tabs toggle visibility client-side (`components/crew/CrewSections.tsx`).
- `getShowForViewer` caches per crew member for 300 seconds (`unstable_cache`).

### 3.2 Freshness today

- Freshness invariant, header of `components/crew/CrewSections.tsx`: the controller "toggles VISIBILITY only. It never fetches, derives, or caches section data client-side." This design keeps that rule: the saved copy is the server's HTML, stored whole. It is never a second data path.
- `ShowRealtimeBridge` (`components/realtime/ShowRealtimeBridge.tsx`, mounted in `_CrewShell.tsx`) subscribes to the private channel `show:<id>:invalidation` (`lib/realtime/subscribeToShow.ts`) and calls `router.refresh()` on invalidation. On reconnect it compares versions through `GET /api/show/<slug>/version`. Network errors are silent.
- `staleBanner.ts` maps picker-stale kinds to re-pick banners. It is about identity, not data age.
- Data age shows today in the footer: `<StaleFooter>` (`components/shared/StaleFooter.tsx`, rendered by `components/layout/Footer.tsx` from `_CrewShell.tsx` props `lastCheckedAt`, `lastSyncStatus`).

### 3.3 Assets and network actions

- No map image on the crew page. Venue "Open in Maps" is a Google Maps link (`VenueSection.tsx`).
- Stage diagrams load from `/api/asset/diagram/<show>/<rev>/<key>` (`Gallery.tsx`), a cookie-auth proxy that signs a 60-second storage URL server-side and streams the bytes with `private, max-age=0`. The agenda PDF and reel use sibling routes under `/api/asset/`.
- Fonts are self-hosted under `/_next/static/media` with immutable caching (`next.config.ts`).
- Network actions: report `POST /api/report` from `components/shared/ReportModal.tsx`; picker Server Actions `selectIdentity`, `clearIdentity` (wrapped in `components/auth/IdentityChip.tsx`, invoked from `components/auth/AvatarMenu.tsx`), `clearIdentityAndSkip` (`_SignInOrSkipGate.tsx`); `tel:` and `mailto:` links (`PersonRow.tsx`).
- No service worker, web manifest, CSP header, or middleware (Next 16 calls it proxy) exists today.

### 3.4 Lifecycle signals the design reuses

- **Share link reset.** `rotate_show_share_token` issues a new token and bumps the picker epoch; the old URL 404s. It refuses archived shows (`supabase/migrations/20260601000001_b2_def1_lifecycle_guard.sql`).
- **Sheet gone.** The Drive listing returns only `trashed = false` sheets (`lib/drive/list.ts`). A sheet that is trashed, deleted, moved out, or unshared drops off the listing, and the cron sync sets `shows.last_sync_status = 'sheet_unavailable'` (`lib/sync/runScheduledCronSync.ts`) and raises the `SHEET_UNAVAILABLE` alert. The value reaches `_CrewShell.tsx` as `data.lastSyncStatus`; `StaleFooter` already maps it to `SHEET_UNAVAILABLE` (`selectCodeAndTier`). A later successful sync replaces the status.
- **Version endpoint.** `GET /api/show/[slug]/version` returns 410 `PICKER_SHOW_UNAVAILABLE` for archived and unpublished alike (`resolvePickerSelection.ts`: `showRow.archived || !showRow.published`), and checks the picker cookie, not the share token. It cannot tell archived from unpublished, and cannot see a link reset, so §4.5 adds a purpose-built status route.

### 3.5 Reports

- `POST /api/report` inserts into `reports` (`supabase/migrations/20260501001000_internal_and_admin.sql`; `context jsonb not null`, `idempotency_key uuid unique`) and files a GitHub issue (`lib/reports/submit.ts`). There is no admin page listing reports; Doug reads the GitHub issue.
- Replay of an idempotency key is honored for 24 hours from the row's server-side `created_at` (`dispatchAfterMissedRecovery`, `lib/reports/submit.ts`). A first send days later creates its row then, so a long offline hold does not hit the horizon.
- `ReportModal.tsx` already persists `{ idempotencyKey, draft, status, surfaceId }` and has a `failed-retryable` state with a resume banner.
- The report route satisfies invariant 10 through a `code:` field on `log.error` and is not in `tests/log/_auditableMutations.ts` (non-admin route).

### 3.6 Next.js 16.3.0

- `next/offline` and `experimental.useOffline` exist in 16.3.0 but are experimental and off here. They retry soft navigations, prefetches and Server Actions, and do not help a full reload with no network: "a full reload while offline still fails and needs a service worker" (Next's vendored guide node_modules/next/dist/docs/01-app/02-guides/offline-support.md). Plain `fetch()` calls, which is how reports submit, are not retried.
- The PWA guide registers a worker with `scope: '/'` and `updateViaCache: 'none'`, serves /sw.js as `application/javascript; charset=utf-8` with `Cache-Control: no-cache, no-store, must-revalidate`, and points to Serwist for full offline caching (the sibling guide progressive-web-apps.md).

## 4. Piece 1: saved copy

### 4.1 Shape

Four parts:

1. **The worker**, served from /sw.js by a route handler (the sw.js route, listed below), not a static file, so a runtime flag can swap in a self-removing worker (§4.9).
2. **A marker** the server renders into every crew show page response, telling the worker whether to save, purge, or leave alone (§4.3).
3. **A status route** the worker asks when a saved show answers 404, to tell an ended show from a revoked link (§4.5).
4. **Client pieces**: the pinned bar, the registration, and purge calls on identity changes (§4.6, §4.7).

New files (piece 1):

<!-- spec-lint: ignore — files created by this spec's implementation; not yet tracked -->
`app/sw.js/route.ts` (worker route), `app/api/show/[slug]/[shareToken]/saved-copy-status/route.ts` (status route), `components/offline/SavedCopyBar.tsx`, `components/offline/SavedCopyRegistrar.tsx`, `lib/offline/` (worker decision logic shared with tests).

Why hand-written and not Serwist (R12): Serwist's model is precaching a build's static assets plus route strategies. Here the cached document is per viewer, has to be saved or purged on server instructions, and decides between a saved copy and a 404 by asking the server. That is a small, specific state machine. Writing it directly keeps every rule visible in one file and adds no dependency.

### 4.2 Worker scope

The worker registers at scope `/` (it has to see navigations to /show/...), and acts only on:

| Request | Handling |
|---|---|
| Navigation to a crew show page, path matching `^/show/[^/]+/[^/]+/?$` | §4.4 decision table |
| `GET /_next/static/**` | Cache first, store on first fetch (§4.8) |
| `GET /api/asset/diagram/**`, `GET /api/asset/agenda/**` belonging to a saved show | Network first with a 5-second timeout, falling back to the saved asset (§4.8) |
| Everything else, including Next RSC requests (`_rsc` query parameter or `RSC: 1` header), all `/api/**` other than the two asset families, Server Action POSTs, admin pages | Not handled: the worker never calls `respondWith`, so the browser behaves exactly as it does today |

Paths below the show page (for example `app/show/[slug]/unpublish`) do not match the navigation pattern and are not handled.

### 4.3 The marker

The crew show page renders one element into the body:

```html
<template id="fxav-saved-copy" data-v="1" data-disposition="save|purge|none" data-rendered-at="<ISO 8601 UTC>"></template>
```

`data-rendered-at` is the server's render time for this response. Rules, decided in one server function so every arm is enumerated in one place:

| Page outcome (`page.tsx` arm) | `data-disposition` | Why |
|---|---|---|
| `<CrewShell>` for `viewer.kind === "crew"` | `save` | The only copy that may be saved |
| `<CrewShell>` for `admin`, `admin_preview`, or `staticPreview` | `none` | Admin views are not crew copies and must not overwrite or purge one |
| `<PickerInterstitial>` (from `renderPickerRepick`, including via `renderRacedCrewMiss`) and `<SignInOrSkipGate>` (`no_auth` arm) | `purge` | No identity on this phone right now, so a kept copy may belong to someone else (R13) |
| `<ShowUnavailable />` (unpublished) | `purge` | R4 |
| `<TerminalFailure>` (the `infra_error` arm and the roster or data lookup failures) | `none` | Leave the copy alone; see §9 |
| `needs_picker_bootstrap` (`redirect()` to the picker bootstrap route) | no marker | A 3xx is passed through untouched (§4.4) |
| `notFound()` (archived, missing, or bad token) | no marker | 404 handling in §4.4 asks the status route |

The worker reads the marker from the response body text (the first match of `id="fxav-saved-copy"`). A 200 response with no marker leaves the stored copy untouched. An unknown `data-v` or `data-disposition` value is treated as `none`.

### 4.4 Navigation decision table

For a navigation to a crew show page URL `U`, with or without a saved copy `S(U)`:

| Network outcome | `S(U)` exists | Worker serves | Background work |
|---|---|---|---|
| Response 200 within 8 s | either | the network response | read the marker: `save` stores the HTML as `S(U)` with `savedAt = data-rendered-at` and prefetches assets (§4.8); `purge` deletes `S(U)` and its assets; `none` or no marker does nothing |
| Response 404 within 8 s | yes | ask the status route (5 s timeout). `ended`: serve `S(U)` in ended mode. `gone`: delete `S(U)`, serve the 404. Timeout or error: serve the 404, keep `S(U)` | none |
| Response 404 within 8 s | no | the 404 | none |
| Response 5xx within 8 s | yes | `S(U)` in server-error mode | none |
| Any other status (3xx, 401, 403, other 4xx, 5xx with no `S(U)`) | either | the network response | none |
| Network error, or no response within 8 s | yes | `S(U)` in offline mode | let the network request finish; if it returns 200 with marker `save`, store it and tell the page a fresh version is ready (§4.7) |
| Network error, or no response within 8 s | no | the built-in "not saved yet" page (§4.7.4) | none |

8 seconds is the author's call: long enough for a weak but working connection to finish, short enough that a dead one does not leave crew staring at a blank screen.

### 4.5 Status route

`GET /api/show/[slug]/[shareToken]/saved-copy-status` answers one question: is this 404 an archived show whose link is still valid?

- Token resolves (same token RPC the page uses) and the show is archived: `200 { "state": "ended" }`.
- Anything else, including a bad or reset token or a deleted show: `200 { "state": "gone" }`.
- Infra fault: `500 { "error": "<code>" }`; the worker treats it like a timeout (serve the 404, keep the copy).
- `Cache-Control: no-store`.

It reads only. It reveals to a holder of a valid link that the show has ended, which the saved copy itself already shows. It does not check the picker cookie: the copy it protects is already on the phone, and a link reset changes the token, so a phone holding a reset link gets `gone` and wipes (R4). Supabase calls follow invariant 9 (destructured `{ data, error }`, typed infra result, registry row or inline exemption).

### 4.6 Never across viewers

One saved copy exists per show URL per phone. It is the HTML rendered for whoever held the picker cookie at save time. Every way the phone's identity for a show can change purges first:

| Identity change | Purge mechanism |
|---|---|
| "Not you? Switch person" in the avatar menu | Client posts `purge(U)` to the worker before the `clearIdentity` form submits. Fail-closed: if the worker is unreachable, the form still submits, and the next navigation shows the picker, whose marker is `purge` |
| Cookie expired, epoch reset, removed from roster, selection reset: any render of the picker or sign-in gate | Marker `purge` on document navigations. For client-side renders of the same components (RSC refresh after a Server Action), a small client component inside `<PickerInterstitial>` and `<SignInOrSkipGate>` posts `purge(U)` on mount |
| Picker shows a different person's page after selection | Covered by the purge above: the picker was rendered first |
| Admin opens a crew link on a crew phone | Marker `none`: the admin page is neither saved nor allowed to replace the crew copy |

Saved copies live in the browser's Cache Storage for this origin, which only this browser profile can read. No copy is sent anywhere.

### 4.7 Client side

#### 4.7.1 How the page knows it is a saved copy

The worker tells the page which mode it served the document in: `live` (network), `offline`, `server-error`, or `ended`. The transport is chosen by the spike (§11) and is **UNRATIFIED until §11 is filled**:

- (a) the worker injects `<meta name="fxav-served" content="<mode>">` into the stored HTML's `<head>` when serving `S(U)`, and the bar reads it on mount; or
- (b) the worker records `FetchEvent.resultingClientId -> mode` in Cache Storage and the bar asks the worker by message on mount.

Whichever ships, the default when no answer arrives within 1 second is `live`, which is only safe because a document served from `S(U)` always carries the answer by construction in (a), and the plan must prove the same for (b) with a test that kills the worker between serving and asking.

#### 4.7.2 The pinned bar

`<SavedCopyBar>` is a client component in a new directory `components/offline/` (not under `components/crew/**`, which the layout redesign owns). `_CrewShell.tsx` renders it directly after `<Header>`, a one-line insertion, with props `renderedAt` (ISO string), `sheetUnavailable` (`data.lastSyncStatus === 'sheet_unavailable'`), `slug`, `shareToken`. Admin and preview viewers get no bar, because their pages are never saved.

It is full width, `position: sticky; top: 0`, above section content and below the header. It renders nothing when hidden, so it takes no space on a healthy live page.

**States and exact copy.** `{time}` is the saved time in the phone's local time zone: `2:14 PM` when it is today, otherwise `Fri Oct 24, 6:02 PM`. `{ago}` is `just now` under 1 minute, `N min ago` under 60 minutes, `N hr ago` under 48 hours, then `N days ago`. A saved time in the future (phone clock behind the server) reads `just now`.

| State | When | Tone token | Icon | Copy |
|---|---|---|---|---|
| `hidden` | live page, sheet fine, phone online | none | none | nothing rendered |
| `offline-fresh` | mode `offline`, or live page with `navigator.onLine === false`; age under 6 h | `bg-info-bg` | signal-off | **No signal.** Showing your saved copy from {time} ({ago}). |
| `offline-old` | same, age 6 h or more | `bg-stale-tint` | clock | **No signal.** Your saved copy is from {time} ({ago}). Things may have changed since then. |
| `server-fresh` | mode `server-error`, age under 6 h | `bg-info-bg` | signal-off | **Couldn't load the latest version.** Showing your saved copy from {time} ({ago}). |
| `server-old` | mode `server-error`, age 6 h or more | `bg-stale-tint` | clock | **Couldn't load the latest version.** Your saved copy is from {time} ({ago}). Things may have changed since then. |
| `ended` | mode `ended` | `bg-stale-tint` | clock | **This show has ended.** You're seeing the last version, from {time}. |
| `sheet-gone` | `sheetUnavailable` and mode `live` | `bg-warning-bg text-warning-text` | alert | **Doug's sheet for this show isn't available in Google Drive anymore.** You're seeing the last version we have. Check with Doug before relying on it. |
| `sheet-gone-saved` | `sheetUnavailable` and mode `offline` or `server-error` | `bg-warning-bg text-warning-text` | alert | **Doug's sheet for this show isn't available in Google Drive anymore.** This is the last version we have, from {time}. Check with Doug before relying on it. |
| `updating` | was a saved copy (`offline` or `server-error`), and connectivity came back (§4.7.3) | `bg-info-bg` | sync (spins; static under reduced motion) | **Signal's back.** Getting the latest version. |
| `updated` | first render after the reload that replaced a saved copy | `bg-surface text-status-positive-text` | check | Updated. You're on the latest version. |

Precedence when several apply: `ended` > `updating` > `sheet-gone-saved` > `sheet-gone` > `offline-*` / `server-*` > `updated` > `hidden`. `updating` outranks the sheet warnings so crew see that a fresh copy is on its way; the warning returns if the retry fails.

The wording "isn't available in Google Drive anymore" replaces the mockup's "is no longer in Google Drive" (author's call): `sheet_unavailable` also covers a sheet that was unshared or moved, where "no longer in Drive" would be wrong.

**Guard conditions.**

| Input | Behavior |
|---|---|
| `renderedAt` missing, empty, or not a valid date | Copy drops the time and age: "Showing your saved copy." / "This is the last version we have." Tone uses the old-copy token, since the age is unknown |
| `renderedAt` in the future | Age reads `just now` |
| Age of exactly 6 h | `old` (the boundary belongs to `old`) |
| `navigator.serviceWorker` absent (unsupported browser, some private modes) | No registration, no saved copy, bar still handles `navigator.onLine === false` on an open live page |
| Storage quota error on save | Skip the save, keep the previous `S(U)`, log `CREW_OFFLINE_SAVE_FAILED` (§6) |

**Accessibility.** `role="status"` with `aria-live="polite"`. Text contrast follows `DESIGN.md` §1.2 pairs (text on `info-bg`, `stale-tint`, `warning-bg`). The icon is decorative (`aria-hidden`); the bold lead carries the meaning, which satisfies the colour-blind floor in `DESIGN.md` §1. The `{ago}` text re-renders every 60 seconds while the bar is visible, and the same tick moves `*-fresh` to `*-old` at the 6-hour boundary.

##### Dimensional Invariants

The shell is `flex min-h-0 flex-1 flex-col` (`_CrewShell.tsx`, `data-testid="crew-shell"`). The bar is one of its flex children, between `<Header>` and `<CrewSections>`.

| Parent to child | Relationship | Guaranteed by |
|---|---|---|
| `crew-shell` to `saved-copy-bar` | bar width equals shell width | `self-stretch` on the bar (Tailwind v4 does not default `.flex` to stretch) |
| `crew-shell` to `saved-copy-bar` | bar height is its content, never grows | `flex-none` on the bar |
| viewport to `saved-copy-bar` | bar top stays at viewport top after scrolling past the header | `sticky top-0` plus a `z-index` above section content |
| `saved-copy-bar` to icon | icon does not shrink when copy wraps to two lines | `flex-none` on the icon |

The plan asserts each row with `getBoundingClientRect()` in a real browser (within 0.5 px), at phone width.

##### Transition Inventory

Ten states, so 45 unordered pairs. Two facts make most pairs unreachable inside one document: the served mode (`live`, `offline`, `server-error`, `ended`) is fixed for a document's life, and `sheetUnavailable` can only change through an RSC refresh, which needs the network. Moving between modes always goes through a page reload, which is a new document, not an animated transition.

Key: **I** instant, no animation. **F** fade out over 200 ms (instant under `prefers-reduced-motion`). **R** page reload (new document). **X** unreachable within one document; if it ever occurs it renders instantly. Each cell covers both directions unless it names one.

| | OF | OO | SF | SO | E | G | GS | U | D |
|---|---|---|---|---|---|---|---|---|---|
| **H** hidden | I (signal drops, returns) | I (signal drops on a page loaded 6 h+ ago) | X | X | X | I (RSC refresh flips sheet status) | X | X | D to H: F after 4 s. H to D: X |
| **OF** offline-fresh | | I (age tick, OF to OO only) | X | X | X (only via U) | X | X | I (signal back; retry fails) | D to OF: I (signal drops during the updated window). OF to D: X |
| **OO** offline-old | | | X | X | X (only via U) | X | X | I | X |
| **SF** server-fresh | | | | I (age tick, SF to SO only) | X (only via U) | X | X | I | X |
| **SO** server-old | | | | | X (only via U) | X | X | I | X |
| **E** ended | | | | | | X | X | U to E: I (recovery finds the show ended). E to U: X (ended mode runs no recovery) | X |
| **G** sheet-gone | | | | | | | X | X | X (G outranks D) |
| **GS** sheet-gone-saved | | | | | | | | I (signal back; retry fails) | X |
| **U** updating | | | | | | | | | U to D: R. D to U: X |

Compound transitions:

- A change during the `updated` fade (signal drops) cancels the fade and renders the new state instantly.
- The age tick crossing 6 hours while `updating` keeps `updating`; if the retry then fails, the bar renders the `*-old` state.
- A second `online` event while `updating` does not start a second fetch.

#### 4.7.3 Coming back online

While the page shows a saved copy (`offline` or `server-error` mode), the bar listens for the `online` event and also retries every 30 seconds. On either, it asks the worker to fetch `U` (or, for a fresh-version message from §4.4, skips straight to reload). The bar shows `updating`. On a 200 response with marker `save`, the bar sets a session flag and calls `location.reload()`, which the worker serves network-first; the new page reads the flag and shows `updated`. On `ended` or `gone`, the bar does not reload: `ended` switches to the ended state, and `gone` reloads so the 404 shows and the copy is wiped by §4.4.

A live page that loses signal while open shows `offline-*` from `navigator.onLine`. When it comes back online it hides the bar; the existing `ShowRealtimeBridge` reconnect check refreshes the content as it does today. No reload.

After any RSC refresh on a live page (the bar sees `renderedAt` change), the bar asks the worker to re-save `U`, debounced to once per 10 seconds, so the saved copy keeps up with realtime updates.

#### 4.7.4 The "not saved yet" page

A small self-contained HTML page embedded in the worker (no Next chunks, inline styles using the `DESIGN.md` light and dark values), served when there is no network and no `S(U)`:

- Heading: "No signal, and this show isn't saved on this phone yet."
- Body: "Open this link once while you have signal or wifi. After that it works here even with no signal."
- Small: "This page reloads by itself when signal comes back."

It reloads on the `online` event. It is also what a phone sees with no signal after its copy was wiped.

#### 4.7.5 Actions offline

| Action | Offline behavior |
|---|---|
| `tel:` and `mailto:` links | Unchanged (R11) |
| Open in Maps | Unchanged link; the Maps app may have its own offline maps |
| Not you? Switch person | Disabled while `navigator.onLine === false`, with the label "Needs signal" (R11) |
| Section tabs, theme toggle, avatar menu | Work from the saved page (client-side only) |
| Report a problem | Piece 2 (§5) |
| Reel | Not saved (R2); with no signal it fails the way it does today |

#### 4.7.6 Registration

A client component `<SavedCopyRegistrar>` (mounted alongside the bar) registers /sw.js with `scope: '/'` and `updateViaCache: 'none'` on crew viewers only, after the page is idle. It calls `navigator.storage.persist()` once (best effort, result ignored). Registration failure logs `CREW_OFFLINE_SW_REGISTER_FAILED` (§6) and changes nothing visible. Only crew show pages register the worker; admin pages never do.

### 4.8 Stored assets and caps

- **Diagrams and agenda.** On `save`, the worker extracts /api/asset/diagram/... and /api/asset/agenda/... URLs from the saved HTML, fetches each with the page's cookies, and stores them under `S(U)`. Assets no longer referenced by the newest `S(U)` are deleted. Requests for those URLs go network-first (5 s) and fall back to the stored copy.
- **Static files.** `/_next/static/**` is cache-first. On each save the worker records which static paths the saved HTML references. A static entry is deleted only when no saved copy references it and it was stored more than 14 days ago, so chunks loaded lazily while online stay available.
- **Caps** (author's calls): one asset over 25 MB is skipped; prefetch stops once a show's assets pass 75 MB; at most 10 saved shows, and saving an 11th evicts the least recently opened show with its assets. A skipped asset fails offline the way it does today.

### 4.9 Kill switch

| Field | Value |
|---|---|
| Storage | Environment variable `CREW_OFFLINE_DISABLED` (`1` disables) |
| Write path | Vercel project environment; no code change |
| Read paths | (1) the sw.js route handler at request time; (2) the crew page server render, passed to `<SavedCopyRegistrar>` |
| Effect | (1) /sw.js serves a worker that deletes every cache it owns, unregisters itself, and handles nothing; (2) the registrar unregisters any existing registration instead of registering |

Evaluation moment: runtime, per request, for both reads; the route handler opts out of static rendering. The plan proves it with a test that requests /sw.js with the variable set and unset.

The bar's copy does not depend on the switch: with the worker gone, no page is ever served from a saved copy, so the bar only shows for `navigator.onLine === false` on an open page and for `sheet-gone`.

## 5. Piece 2: offline reports

### 5.1 Behavior

- When `POST /api/report` fails with a network error, or `navigator.onLine === false` at submit, the modal moves to a new `queued` status, persisted with the existing `{ idempotencyKey, draft, status, surfaceId }` record plus `writtenAt` (phone time, ISO) and `pageRenderedAt` (read from the `#fxav-saved-copy` marker's `data-rendered-at`, null when absent).
- Confirmation in the modal: "**Saved on your phone.** It will send by itself when you have signal." with a Done button.
- A page-level sender (mounted next to the report button in `components/layout/Footer.tsx`, not in `_CrewShell.tsx`) retries every queued record on page load, on the `online` event, on `visibilitychange` to visible, and every 60 seconds while any record is queued. It reuses the record's idempotency key, so a send that reached the server before the connection dropped is not filed twice.
- While records are queued, the report button shows "1 report waiting for signal" (or "N reports waiting for signal"), with `bg-warning-bg text-warning-text`. It clears when the last one sends.
- Server answers on retry: success clears the record; `REPORT_HORIZON_EXPIRED` and other non-retryable answers go to the existing `expired` or failed handling; network errors stay queued.
- Cap: 10 queued reports per phone; an 11th shows the existing failure copy instead of queueing.

### 5.2 Server and Doug's view

- The request body gains an optional `offline` object: `{ writtenAt: string, pageRenderedAt: string | null }`. Validated (ISO strings, `writtenAt` not later than server receipt plus 24 hours of clock skew, else dropped and logged). Stored inside the existing `context` jsonb. No migration.
- The GitHub issue body gains a section when `offline` is present:
  - Heading: "Written with no signal"
  - "Written at {writtenAt} (phone time), sent at {server receipt time}."
  - "They were looking at the copy saved at {pageRenderedAt}." (omitted when null)
- Invariant 10: the route already carries a code-carrying emit. The plan adds `log.info` with `code: "REPORT_SUBMITTED_FROM_OFFLINE_QUEUE"` on the success branch when `offline` is present.

### 5.3 Independence from piece 1

Piece 2 needs nothing from piece 1 except the marker element, read optionally. Either PR can merge first.

## 6. Telemetry

| Code | Where | Kind |
|---|---|---|
| `CREW_OFFLINE_SW_REGISTER_FAILED` | `<SavedCopyRegistrar>` via `clientLog` (`lib/observe/clientLog.ts`) | client warn |
| `CREW_OFFLINE_SAVE_FAILED` | worker posts to an open page, which logs via `clientLog` | client warn |
| `CREW_OFFLINE_SERVED_SAVED_COPY` | `<SavedCopyBar>` once per page load in a saved-copy mode, sent when back online (`clientLog` drops offline sends) | client info, if `clientLog` accepts info; else omitted and noted in the plan |
| `REPORT_SUBMITTED_FROM_OFFLINE_QUEUE` | `POST /api/report` success branch | server info |

No new mutation surface in piece 1: the status route and /sw.js are GET handlers. Piece 2 changes an existing mutation route that already satisfies invariant 10. None of these codes reach the UI (invariant 5).

## 7. Testing

TDD per task (invariant 1). The plans own the task list; this section sets the bar.

- **Worker logic** lives in plain functions (decision table, marker parsing, URL matching, caps, eviction) imported by both the worker bundle and Vitest, so each table row in §4.4 and each row of §4.3 has a unit test. The worker file is thin glue.
- **Real-browser e2e** (Playwright, non-interactive): load a seeded crew page online, go offline (`context.setOffline(true)`), reload, assert full content, a working tab switch, and the `offline-fresh` bar. Also: 404-ended keeps the copy with the ended bar; link reset wipes it; "Not you?" wipes it; unpublish wipes it; admin view never saves; the not-saved-yet page appears with no copy. Browsers per §11.
- **Kill switch:** /sw.js with `CREW_OFFLINE_DISABLED` set and unset.
- **Bar:** every state's copy, precedence, guard rows, reduced motion, every reachable cell of the §4.7.2 transition inventory, and the dimensional invariants in a real browser.
- **Reports:** queue on network failure, persistence across reload, send on `online`, idempotent replay, issue body section, cap, and the button count.

## 8. Rollout, PR split, concurrency

| PR | Branch | Contents | Depends on |
|---|---|---|---|
| A | `docs/crew-offline-spec` | This spec | none |
| B | `feat/crew-offline-saved-copy` | Piece 1, with its own plan | A merged |
| C | `feat/crew-offline-reports` | Piece 2, with its own plan | A merged |

B and C run at the same time in separate sessions and worktrees. They share no files: B edits `_CrewShell.tsx` (one line), `page.tsx`, `_PickerInterstitial.tsx`, `_SignInOrSkipGate.tsx`, `ShowUnavailable.tsx`, `components/auth/AvatarMenu.tsx`, and adds `app/sw.js/`, `app/api/show/[slug]/[shareToken]/saved-copy-status/`, `components/offline/`, `lib/offline/`. C edits `components/shared/ReportModal.tsx`, `components/shared/ReportButton.tsx`, `components/layout/Footer.tsx`, `app/api/report/route.ts`, `lib/reports/submit.ts`.

The crew layout redesign runs in parallel in another session. B keeps its `_CrewShell.tsx` change to the single `<SavedCopyBar>` line after `<Header>`, and the redesign keeps a full-width slot under the header for it. Both UI PRs pass the invariant-8 impeccable critique and audit before review.

## 9. Documented limits

- **iPhone storage eviction.** Safari deletes a site's scripted storage, saved copies included, after 7 days of Safari use without visiting the site, unless the site is added to the Home Screen. "Kept by default" (R3) is therefore best effort on iPhone. A web manifest would make Home Screen installs nicer and is a candidate follow-up, not part of this work.
- **"Bars but no data."** `navigator.onLine` reports true on a connection that carries no traffic. An already-open live page then shows no bar until it is reloaded, when the 8-second timeout serves the saved copy with the bar.
- **Lost phone.** A phone that never gets signal again keeps its copy. Link reset and unpublish wipe it only once it reconnects.
- **Infra error page.** When the server renders `<TerminalFailure>` with HTTP 200, the worker shows it rather than the saved copy, because it has already started streaming the response before it can read the marker. Crew see the existing retry link.
- **First visit with no signal** gets the "not saved yet" page, by definition.
- **Data use.** Diagram and agenda prefetch happens on whatever connection the phone has, up to the §4.8 caps.
- **Report clock.** `writtenAt` is phone time and is labelled as such.

## 10. Left to the builder

- Exact Tailwind classes for the bar within the §4.7.2 tokens, after the impeccable critique.
- How the worker bundle is built (a route handler returning a string assembled from imported functions, or a build step), as long as the decision logic is unit-tested from the same source.
- Seeding approach for the e2e (reuse existing crew-page fixtures).
- Whether piece 2's sender lives in `ReportButton.tsx` or a sibling component.

## 11. Spike findings

To be filled from the empirical spike before review (spec self-review rule: framework behavior is probed, not designed in prose). Questions: offline reload plus hydration in Chromium and WebKit; RSC pass-through; served-mode transport (a) versus (b); online recovery; page and asset sizes.
