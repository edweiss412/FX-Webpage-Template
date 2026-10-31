# Crew page offline saved copy (piece 1): close-out

Branch `feat/crew-offline-saved-copy`. Spec `docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md`. Plan `docs/superpowers/plans/2026-10-27-crew-offline-saved-copy.md` (28 tasks). Piece 2 (offline reports, spec §5) ships separately.

## §1 Shipped scope

- A hand-written service worker saves one copy of each crew show page the viewer can see. Each copy is a snapshot of the server render, keyed per show and per viewer.
  - It serves the copy when the network fails or is slow (8 s budget).
  - It never serves a copy across viewers.
  - It wipes the copy on unpublish, link reset, and on "Not you?", sign-out and sign-in.
  - It keeps the copy after archive, and the page then says "This show has ended". The status route decides this.
- Text, stage diagrams and agenda PDFs are saved. The agenda includes the pdf.js worker and the viewer chunks, so an agenda nobody opened still opens offline. The reel stays online only.
- The pinned saved-copy bar, in its states:
  - saved fresh and saved old (6 hours);
  - ended;
  - the sheet missing from Drive, on the live page and on a saved copy;
  - updating, then updated.

  It shows one pinned line with the age in bold. The full sentence shows once in the page flow, then scrolls away. Recovery runs on its own when signal returns. These are the owner's decisions of 2026-10-30.
- The "Not saved yet" page has a Try again button and retries on its own.
- "Not you?" is wrapped in a purge bracket, and offline it reads "Not you? Needs signal".
- Kill switch: setting `CREW_OFFLINE_DISABLED=1` serves a worker that removes itself and every saved copy.
- DB: `shows.unpublished_at` plus a BEFORE UPDATE trigger.
- Telemetry: two forensic `clientLog` codes, plus one §12.4 catalog row (`SAVED_COPY_STATUS_LOOKUP_FAILED`).

Product defects found by the real-browser cases and fixed in the branch:
- D1: a streamed not-found page's `check` marker never reached the worker, so an archived copy was wiped on the first online visit.
- D2: the agenda prefetch reset pdf.js's worker URL and broke the online viewer.
- D3: the agenda viewer's chunk was never stored.

## §12 Impeccable dual gate: findings and dispositions

The first run was on HEAD 2c4121f92, after all 28 tasks and the merge of main. The re-check was on 637e7d26d, and a final narrow re-check on 520c090b8.

- Critique, first run: RAN, 26/40, using a live harness with the real components and compiled CSS. Re-check: RAN-DEGRADED, 29/40, from a static render measured in headless Chromium. Final re-check: RAN-DEGRADED, 30/40, with real hydration in a stand-in shell on Chromium and WebKit.
- Audit, first run: RAN, 15/20. Both re-checks: RAN, 16/20. The detector found 0 issues, and planted controls were flagged.
- Impeccable 4.5.0 has no `product.md` register. The app-UI register is `operate.md` / `mode-operate.md`, and both runs read those.

| # | Finding (severity, source) | Disposition |
|---|---|---|
| 1 | The live region re-announced the whole bar every minute (P1, critique and audit) | **Fixed.** The relative age is visual only (`aria-hidden`), and the announced text changes only on a state change. A test pins identical announced text across a tick. The re-check confirmed this in the Chromium accessibility tree. |
| 2 | The sticky bar could fully hide a focused control, WCAG 2.4.11 (P1, audit) | **Fixed.** `scroll-padding-top` follows the bar's height through a ResizeObserver. Covered by unit tests and layout e2e case 7 on both engines. |
| 3 | The not-saved page could not keep its "reloads by itself" promise, and had nothing to tap (P1, critique; P2, audit) | **Fixed.** A 44 px Try again button. It retries every 30 s while online, on tab return and on `online`, and reloads only on an ok answer. Spec §4.7.5 is amended. |
| 4 | The long states took a large share of the phone screen while pinned (P1, critique) | **Fixed by owner decision (2026-10-30, Option B).** One pinned line, with the full sentence once in the page flow. The sheet states now pin 37 px at 390 px wide (down from 97). At 200% zoom they take 18.5% of the screen (down from 47%). |
| 5 | Light mode: the fresh and old tones were indistinguishable, with the same bold lead (P2, critique) | **Fixed by owner decision (Option 2).** The bold part is now the age, in both states. |
| 6 | No edge or forced-colours separation for the bar (P2, audit) | **Fixed.** The bar has a bottom edge. Its placement is corrected under the detail (re-check P3). |
| 7 | No tabular figures on times (P2, critique and audit) | **Fixed.** `tabular-nums`. |
| 8 | The "Not you?" row's name did not contain its visible words, WCAG 2.5.3. Offline it showed only "Needs signal" (P2, audit and critique) | **Fixed.** The name now equals the visible text in both states: "Not you? Switch person" / "Not you? Needs signal". |
| 9 | The handoff from the CSS notice to the bar jumps (P2, critique) | **Ratified limit.** The notice paints before JavaScript and the bar after hydration, so the two can't share one frame. For the live sheet-gone state, the jump is now removed by server rendering (re-check P2). |
| 10 | Signal flapping inserts and removes the bar (P2, critique) | **Ratified.** Spec §4.7 shows the bar the moment `navigator.onLine` turns false. Delaying it would hide true state. |
| 11 | The bar's share of a 320x256 reflow viewport (P2, audit) | **Addressed by #4.** |
| 12 | Re-check P2: a live sheet-gone page shifted 135 px on every visit | **Fixed.** The server renders the `sheet-gone` state from its prop, and the first client render matches. |
| 13 | P3 items: the not-saved page ignores the stored theme; the agenda prefetch evaluates pdf.js on load; the worker bundle is unminified; a `persist()` prompt in Firefox is possible (unverified); unused `slug`/`shareToken` props; Try again had no pressed state; the spec's one-line claim; the edge split the pinned line from its detail | **Fixed:** button states, the spec wording, the edge placement. **Known limits, not fixed in this PR:** the not-saved page follows the system theme, not the stored one; pdf.js evaluates during the prefetch; the worker bundle is unminified; Firefox may prompt on `persist()` (unverified); the `slug`/`shareToken` props are unused. |
| 14 | Final re-check P3s: before mount, a saved sheet-gone copy shows the CSS notice over the server-painted bar (a clipped 21 px band at 320 px, which stays only if the page never hydrates). In forced colours the transparent border brings back the seam between the pinned line and its detail. An ended copy of a sheet-gone show paints the warning first, then jumps 97.5 px at mount. | **Known limits, not fixed in this PR.** Each is P3, cosmetic, and confined to a rare state: no hydration, forced colours, or an ended show whose sheet is also gone. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=4 dispositions=recorded
