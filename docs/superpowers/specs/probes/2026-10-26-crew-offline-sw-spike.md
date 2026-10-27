# Spike: crew-page offline via a hand-written service worker

Run 2026-10-26, 22:15 to 22:42 EDT. Throwaway, nothing committed or pushed.

- **Worktree:** `/Users/ericweiss/FX-worktrees/crew-offline-spike`, branch `spike/crew-offline-sw` off `origin/main` 044c5f90a. The spike edits are uncommitted. `.claude/ship-gate-off` is set there, so the Stop gate leaves the dirty throwaway tree alone.
- **Next:** 16.3.0, production build, `next start -H 127.0.0.1 -p 3417`. Build A `Wye9NSR3xyPS9Hbzo3B8N`, B `k3XKI9CslleWyO19K_G-f`, C `M0O7MO7CUtMsL4qqhXXJj`. Each `pnpm heavy pnpm build` took 30 to 70 s and the heavy queue was free every time, so I never fell back to `next dev`.
- **Playwright:** 1.59.1, driven by plain node scripts (`@playwright/test` library API, not the runner). Chromium 390x844. WebKit is the Playwright build on macOS.
- **Data:** `pnpm db:seed` against the local DB. It touches only `seed-fixture:` rows, and there were zero before the run. Probed show: `2026-04-asset-management-institute-cfo-coo-roundtable`, the Waldorf seed with 3 crew and 2 seeded diagrams.

## Spike code

- `public/sw.js` (copy: `scratchpad/probe/sw.js`). Navigations to `/show/*` go network-first with an 8 s `AbortController` timeout. A 200 `basic` response is cloned into `fxav-snap-v1`, keyed by `origin + pathname` (no query). When the network fails, the SW serves the stored copy:
  - It optionally injects `<meta name="fxav-served" content="snapshot">` right after `<head>`.
  - It drops `content-length` and `content-encoding` from the stored headers.
  - It records `resultingClientId -> {source}` in `fxav-meta-v1`.

  `/_next/static/*` is cache-first (`fxav-static-v1`). It never calls `respondWith` for the `_rsc` param, the `RSC: 1` header, non-GET requests, or anything else. It answers `whoami` with the record for `event.source.id`, and `config` toggles the meta injection.
- `app/show/[slug]/[shareToken]/_SwRegister.tsx` registers `/sw.js` with `{scope:'/', updateViaCache:'none'}`. It exposes `window.__fxavProbe` (meta read on mount, plus the `whoami` reply) and `window.__fxavRefresh` (`router.refresh()`). It is rendered in `_CrewShell.tsx` just before `<Footer>`.
- `next.config.ts`: `/sw.js` headers exactly as in the PWA guide. Verified with `curl -sI`: `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`, `Content-Security-Policy: default-src 'self'; script-src 'self'`.
- Tracked-file diff: `scratchpad/probe/spike-tracked.diff`.

## Probe scripts

All are under `/private/tmp/claude-501/-Users-ericweiss-FX-Webpage-Template/700320d7-3ffc-414e-8648-1e232f3d0355/scratchpad/probe/`.

- `probe.mjs <chromium|webkit> <picker|admin|crew>`. `BASE=https://127.0.0.1:3443` runs it through the TLS proxy. It owns the server lifecycle: it can kill the listener on 3417, restart `next start`, or run a TCP "hang" listener.
- `tlsproxy.mjs`: HTTPS on 3443 in front of http 3417, with a self-signed cert (`key.pem`, `cert.pem`). When the upstream fails, it destroys the client socket so the browser sees a network failure, not a 502.
- `q6.mjs`: build-skew probe. `part1`/`part2` use a persistent context (Chromium). `both` keeps one ephemeral context alive across a rebuild (WebKit).
- `crewcheck.mjs`, `pickcheck.mjs`, `wkpersist.mjs`: diagnostics.
- Results go to `out/<engine>-<mode>[-https]-result.json`, `out/q6-*.json`, and the screenshots `out/*.png`. Key screenshots are named per answer below.

### How identity was obtained

- **Chromium:** drive the picker at `?gate=skip` and click a roster row. The server mints `__Host-fxav_picker`, and Chromium stores it over plain http on 127.0.0.1.
- **WebKit over plain http:** this does not work. The picker cookie is never stored (`picker cookie stored in jar false`), so the next load shows the first-contact gate (`out/webkit-picker-first-load.png`). The Google-session crew path loops forever: in 6 s there were 67 document GETs of the show page and 66 of `/api/auth/picker-bootstrap` (`crewcheck.mjs` output). This is the same limit `playwright.config.ts:66-74` documents.
- **WebKit over HTTPS (`tlsproxy.mjs` plus `ignoreHTTPSErrors`):** the picker cookie is stored (`__Host-fxav_picker(S)`), the page resolves to John Carleo, and the SW registers. This is the run used for the WebKit answers. An admin-session run over http (`webkit-admin`) also exists. The admin arm has no avatar menu.
- **Temporary DB edits, all restored:** one run mapped Calvin Saller's email to `crew-non-admin@fxav.test` under the per-show advisory lock, then put it back. That run's Google bootstrap stamped `claimed_via_oauth_at` on Calvin, and I set it back to null. All 3 rows were verified back to their seed values afterwards.

## How "offline" was simulated, and a harness warning

- **M1 `context.setOffline(true)`: unreliable for SW tests in both engines.**
  - Chromium: the first offline reload went to the snapshot (`TypeError: Failed to fetch` inside the SW). The second offline reload was fetched by the SW from the network (`source: network, status 200`) while the page's own subresources failed with `ERR_INTERNET_DISCONNECTED`. The emulation does not reliably cover the SW's own fetches.
  - WebKit: `page.reload` throws `WebKit encountered an internal error` and the page never navigates.
  - Do not build the offline e2e suite on `setOffline`.
- **M2 server stopped (ECONNREFUSED, or a dropped socket through the proxy): reliable in both engines.** The SW's fetch rejects (`TypeError: Failed to fetch` in Chromium, `TypeError: Load failed` in WebKit) and the snapshot is served.
- **M3 hang (TCP accepted, never answered):** this exercises the 8 s timeout. The snapshot was served after `navMs` 8046 (Chromium) and 8060 (WebKit). The SW recorded `AbortError` at `ms` 8004 and 8011.
- **Playwright WebKit persistent context (`launchPersistentContext`):** Cache Storage `put` resolves, but `match`/`keys` return nothing, from both the SW and the page (`wkpersist.mjs`: `pagePut: false`, every cache empty). The same script in an ephemeral context works. This is a harness artifact: use ephemeral WebKit contexts.

## Q1: Chromium offline reload, render and hydration

**YES, high confidence (M2 and M3).** Evidence is `out/chromium-picker-result.json`, phases `M2-down-inject`, `M2-down-verbatim` and `M3-hang-8s`.

- The SW controls the page right after the first load: `skipWaiting` plus `clients.claim`, `controller: true`, `ready` in about 1 ms. No reload was needed for control.
- The first visit is NOT stored, because that navigation happened before the SW existed. The snapshot is written on the next SW-handled navigation (the probe's online reload). After that, `fxav-snap-v1` held `/show/<slug>/<token>` and `fxav-static-v1` held 19 entries.
- With the server down, the reload returned 200 in about 40 ms. `crew-shell` was visible with full content: header, status pill, sub-nav and body text (screenshot `out/chromium-picker-M2-down-inject.png`).
- Hydration was confirmed. The sub-nav tap to Venue made `section-venue` visible and the URL became `?s=venue` (pushState). The avatar menu opened with `role=menu` visible.
- No `pageerror`, no React hydration error (#418/#423/#425), no error overlay (production build), no not-found.
- Expected noise:
  - `Failed to load resource: net::ERR_CONNECTION_REFUSED` for `/api/realtime/subscriber-token`, `/api/observe/client-error` and `/api/asset/diagram/...`.
  - The realtime warning `subscription failed: initial JWT mint returned no token ... {reason: mint_transient}`. This one also appears online locally.
- Font: `document.fonts` reported `Inter:loaded`. `/fonts/InterVariable-latin.*.woff2` is outside `/_next/static`, so it came from the HTTP cache (immutable, 1 year), not from the SW. That is not guaranteed on a phone whose HTTP cache was evicted.
- Diagram images (`/api/asset/diagram/...`, Venue tab) fail offline; each was retried about 4 times. How the failed image renders was NOT VERIFIED visually.

## Q2: WebKit (iOS Safari proxy)

**YES, high confidence, over HTTPS (M2 and M3).** Evidence is `out/webkit-picker-https-result.json`; the screenshot `out/webkit-picker-https-M2-down-inject.png` shows the Venue section offline with the JC avatar.

- `navigator.serviceWorker` exists, registration succeeds, and `controller: true` holds right after the first load.
- With the server down, the reload returned 200 (about 50 to 64 ms) and `crew-shell` was fully rendered.
- Hydration was confirmed: the section tab works and the avatar menu opens. There were no `pageerror` events and no React errors.
- The admin-arm run over plain http (`out/webkit-admin-result.json`) gives the same result for section-tab hydration. That arm has no avatar menu.
- Caveats:
  - WebKit over plain http cannot carry a picked crew identity at all (see "How identity was obtained"). An offline e2e for WebKit needs HTTPS (a TLS proxy worked).
  - `setOffline` cannot be used in WebKit.
  - Real iOS Safari, an installed home-screen PWA, and iOS storage eviction were NOT VERIFIED.

## Q3: how the page learns it was served from the snapshot

**Both (a) and (b) work in Chromium and WebKit. High confidence.**

- **(a) Injected meta.** `__fxavProbe.meta === "snapshot"` when the stored copy was served, and `null` for network-served pages.
  - Injecting the meta right after `<head>` produced no React hydration warning or error in either engine. Compare the `M2-down-inject` phase (meta present) with `M2-down-verbatim` (byte-for-byte stored copy): the console is identical apart from network noise.
  - Removing `content-encoding` and `content-length` from the stored headers was enough; the original stored response was gzip.
- **(b) `resultingClientId` and `event.source.id`.** In every navigation, in both engines, the SW's `event.source.id` on the page's mount-time `whoami` message equals the `resultingClientId` recorded at navigation (`match: true`). That held for snapshot, network and timeout serves.
  - `event.clientId` on navigations is the previous document's id in Chromium and `null` in WebKit. Do not use it.
- **Recommendation from the evidence:** (a) is synchronous at first render, needs no round trip, and also works for the no-controller case. (b) needs the controller plus an async reply (about 100 to 400 ms). The probe polled for up to 2 s, and every reply arrived within the first few polls.

## Q4: back online

**YES, high confidence, both engines.**

- After the server came back, `location.reload()` went through the SW network-first path: `source: network`, status 200, about 120 to 146 ms on the first hit after restart. The SW returned the fresh page with no meta, and the snapshot was overwritten with the fresh page.
- `router.refresh()` online works with RSC passed through untouched.
  - Exactly one `GET` with `RSC: 1` returned 200 `text/x-component`, with `fromServiceWorker() === false`. It was the same document (`sameDocument: true`), and hydration still worked afterwards.
  - Chromium: `onlineRouterRefresh` in `out/chromium-picker-result.json`. WebKit: the same key in `out/webkit-picker-https-result.json`.
- **`router.refresh()` while the network is DOWN.** Next logs `Failed to fetch RSC payload for <url>. Falling back to browser navigation. TypeError: Failed to fetch` and does a full browser navigation. The SW then serves the snapshot as a new document: `whoami.sourceId` changed and `source: snapshot`. Seen in both engines (phase `M2-down-router-refresh`).
  - Consequence: any realtime-driven `router.refresh()` while offline turns into a full reload into the snapshot. The page survives, but any client state is lost.

## Q5: sizes (seeded Waldorf page, production build)

| Item | Measurement |
|---|---|
| HTML, by viewer | 154,076 B decoded (Calvin, role ONLY, Chromium); 180,742 B (John, LEAD with Budget visible, WebKit); 195,992 B (admin arm). Gzip transfer about 25.7 KB for the 154 KB document (Navigation Timing `transferSize` 25,743). |
| `/_next/static` | 19 requests (18 JS, 1 CSS): 1,616,378 B decoded, 458,169 B gzip (curl sum). Served `public, max-age=31536000, immutable`. One more `<script>` in the DOM, `0cz1d0mv5g_q7.js` (112,594 B), is the `noModule` polyfill bundle. Modern engines never fetch it, so it is never cached; that is harmless. |
| Font | `/fonts/InterVariable-latin.d5549562.woff2`, 179,088 B, outside the SW's static rule. |
| Diagrams | `/api/asset/diagram/...` loads only when the Venue tab opens. The seed has two 256-px WebP variants of 1,942 B and 1,088 B. Real show diagrams will be larger; NOT MEASURED on a real show. |
| Other same-origin | `/api/realtime/subscriber-token` (330 B), `/api/show/<slug>/version` (40 B), `/api/observe/client-error` (POST). |
| Lazy chunks | Tapping all six sections loaded no extra chunks (19 cached before and after). `grep` found no `dynamic(`, `lazy(` or `await import(` in `components/crew`, `layout`, `auth`, `diagrams` or `app/show`. |

Raw data: `out/chromium-picker-firstload-responses.json` and `out/*-venue-responses.json`.

## Q6: build A snapshot, then a rebuild to build B

**Done in both engines. High confidence.**

- A one-string client change moved exactly one chunk:
  - A to B: `358537tes6pby.js` became `3eo7olwtb4kyx.js`.
  - B to C: `3eo7olwtb4kyx.js` became `3qjzz5zq3oh4e.js`.
  - All other chunk names were stable across builds.
- **Chromium** (`out/q6-chromium-part1.json`, `out/q6-chromium-part2.json`; persistent context):
  - Snapshot A plus A chunks were cached with build A running. The server was then stopped and rebuilt to B.
  - Offline reload: snapshot A was served, all 6 section taps passed, the avatar menu opened, and no chunk was missing.
  - Server B was then started, and `router.refresh()` was called from the stale A document. The RSC request returned 200, then Next hard-navigated (`sameDocument: false`) through the SW network path to a build-B document: B's new chunk is present and A's is gone. All taps and the avatar menu still worked, and the console was clean.
  - The static cache grew from 19 to 20 entries. A chunks are never evicted.
- **WebKit** (`out/q6-webkit-both.json`; ephemeral context kept alive across the rebuild, B to C): same result. The offline snapshot B rendered and hydrated, then a refresh against C hard-navigated to a C document. The static cache also grew from 19 to 20.
- NOT VERIFIED: the timeout case where a slow (over 8 s) navigation serves an old snapshot while the network can still answer chunk requests from a new build. A chunk missing from the cache would 404 against the new build.

## Other observations for the spec

1. **Snapshot key and `?s=`.** The cache key is the path only, but the stored HTML bakes in the server-rendered `initialSection` of whichever URL was last fetched. `CrewSections` does not reconcile the URL's `?s=` on mount (`components/crew/CrewSections.tsx:38`, `useState(initialSection)`). So an offline reload at `?s=venue` shows Today if the snapshot was taken at Today (WebKit `M2-down-inject-at-s-venue`). The reverse also happens: a clean URL showed Venue when the snapshot came from `?s=venue` (Chromium `M2-down-inject`). No error results, just a URL/section mismatch.
2. **The first visit is never stored**; it takes one more navigation after install. Not attempted: having the SW or page `cache.add(location.href)` on activate.
3. **Viewer-specific HTML ends up in Cache Storage**: the picked identity, and the admin arm for admins. Switch person or sign-out should purge `fxav-snap-*`. NOT VERIFIED.
4. **Offline network noise.**
   - The realtime bridge keeps trying `/api/realtime/subscriber-token`. In the WebKit Q6 offline window there were about 12 failed attempts.
   - `/api/observe/client-error` POSTs fail while offline. What it tries to report was NOT VERIFIED.
5. **The spike SW only falls back when the fetch rejects or times out.** A 5xx or 404 from the server is passed through as-is, so an outage page would not be replaced by the snapshot. This is a deliberate spike behavior; the spec should decide it.
6. **The proxy run's WebKit console has mixed-content `[blocked]` warnings** (ws:// realtime under https). That is a proxy artifact, not app behavior.

## Not verified

Real iOS Safari or device; home-screen PWA mode; storage eviction or quota; `next dev` behavior (production only); real-show diagram sizes; how a failed diagram renders offline; snapshot purge on switch person; the "slow nav plus new build" chunk-404 case; using `useOffline` or `experimental.useOffline` alongside this SW.

## Cleanup state

- Every server started (3417 `next start`, 3443 TLS proxy, hang listener) was stopped. `lsof` shows no listeners on 3417 or 3443.
- The seeded fixture shows stay in the local DB (the normal e2e state).
- The worktree was left in place, with its spike edits uncommitted.
