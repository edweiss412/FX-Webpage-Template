# DEFERRED.md

Work intentionally deferred (will do, concrete trigger). Distinct from BACKLOG.md (might do, speculative). Each entry: what, why deferred, and the concrete trigger that un-defers it.

## Per-day schedule/key-times — impeccable gate (2026-06-22)

Source: invariant-8 impeccable v3 dual-gate (critique + audit) on branch `per-day-schedule-keytimes` vs `aef09fbc`. Full findings + dispositions in `.superpowers/sdd/task-19-impeccable-report.md`. Gate verdict: critique 34/40 PASS, audit 18/20 PASS, deterministic detector `[]`, zero CRITICAL. No HIGH/CRITICAL left unaddressed — F1 and F2 are FIX-RECOMMENDED to the implementer; the entries below are the explicit DEFER fallbacks + the P3 polish/real-browser items.

### D1 — [P2] KeyTimesStrip onto `<dl>`/`<dt>`/`<dd>` (semantic-structure drift)

- **What:** `components/crew/primitives/KeyTimesStrip.tsx:123-140` renders presentational `<div><span><span>` for each label/value pair, while the two sibling primitives doing the identical job use `<dl>` (`RightNowHero.tsx:553-573`, `KeyValueRows.tsx:64,91,94`). SR reads the strip as a flat text run with no label↔value association (WCAG 1.3.1 A).
- **Why deferred:** the inv6 test contract reads first/last `<span>` (`tests/components/crew/primitives.test.tsx:262-264` + e2e `crew-layout-dimensions.spec.ts` `span.first()`/`span.last()`); a `<dl>` migration is feasible (keep label/value spans as first/last children inside `<dt>`/`<dd>`) but touches the test contract. Deferred only if that churn is out of scope this milestone; otherwise the implementer should fix now.
- **Trigger:** next touch of KeyTimesStrip, OR the next a11y/semantics pass on crew primitives, OR if any SR-audit flags the strip. Closes the systemic "three primitives, three structures" drift in one move.

### D2 — [P1] Overflow row "+N more" deep-link / recessive restyle (DEFER FALLBACK for F1)

- **What:** `KeyTimesStrip.tsx:95-102` overflow row ("More days" / "+N more") is styled identically to data rows with no affordance and no path to the full per-day list.
- **Why deferred:** FIX-RECOMMENDED now (preferred: make it a `SectionChipLink section="schedule"` like `TodaySection.tsx:568`, or restyle recessive). Deferred only if not fixed this milestone — bounded by cap=5 + realistic max ~3 show days (rarely hit).
- **Trigger:** a show with >5 visible show days appears in real data, OR the next KeyTimesStrip touch. Un-defer immediately if a 6+-show-day show ships.

### D3 — [P3] Normalize time-meridiem casing across anchors

- **What:** Set "9:00PM" (`resolveKeyTimes.ts:109`) vs window/showStart "7:30am" stacked in one strip column; also DayCard "Setup 10:00PM". Reads as un-curated sheet passthrough.
- **Why deferred:** the fix lives in `lib/crew/resolveKeyTimes.ts` (non-UI; not strictly an invariant-8 surface) — a copy-quality polish, not a gate blocker. Window en-dash "–" is correct and stays.
- **Trigger:** a copy/voice polish pass on key-times, OR the next resolveKeyTimes touch. Add one meridiem-normalizer helper applied uniformly to Set/Show/Strike/window/showStart.

### D4 — [P3] Real-browser 390px density check (8-row strip) — REAL-BROWSER PASS

- **What:** worst case Set + 5 shows + overflow + Strike = 8 rows in the narrow "Daily call times" card (`ScheduleSection.tsx:276`, defaults to `stack`).
- **Why deferred:** requires a real browser render; the app could not boot in the gate environment.
- **Trigger:** PR Vercel preview — capture the "Daily call times" card at 390px with a 5-show fixture, confirm no crowding/clip. If dense, lower the visible cap to 3 before overflow.

### D5 — [P3] Per-day date as `<time>`; middot speech

- **What:** `KeyTimesStrip.tsx:133-138` renders "Day 1 · Wed 10/8" as plain text; `data-anchor-date` (ISO) is on a `<div>`, not a `<time>`. `RightNowHero` wraps dates in `<time>`. Some SRs verbalize "·".
- **Why deferred:** low impact (informational strip); separator copy is owned by `resolveKeyTimes.labelFor`, not the component.
- **Trigger:** addressed alongside D1 (the `<dl>` migration), OR an SR audit flags the middot. Wrap the date in `<time dateTime={row.date}>` or swap the separator.

### D6 — [P3] DESIGN.md §1.2 — publish `text-subtle` on `--color-surface` (dark) — REAL-BROWSER MEASURE

- **What:** `text-text-subtle` at 12px is used on the card fill (`--color-surface`) for the meta line (`DayCard.tsx:105`) + strip labels (`KeyTimesStrip.tsx:133`), but DESIGN.md §1.2 only publishes the ratio on `--color-bg`. Dark surface `#16171C` is slightly lighter than bg → marginally below the 6.4:1 bg figure (still ≥ AA-large; at/near AA-body for these eyebrow/meta uses; not used for any action target).
- **Why deferred:** exact measurement requires a real render against the live `globals.css` dark surface.
- **Trigger:** PR Vercel preview — measure subtle-on-dark-surface; add a `--color-surface` row to DESIGN.md §1.2 with the computed ratio.

## /help prose typography layer — impeccable gate (2026-06-22)

Source: invariant-8 impeccable v3 dual-gate (critique + audit) on branch `feat/help-prose-typography` (the P0 typography fix from the help-center readability audit, `docs/audits/help-readability-audit-2026-06-22.md`). Gate verdict: critique PASS (no P0/P1), audit PASS-WITH-MINOR (no P0/P1), deterministic detector `[]`. One audit P3 deferred here; the system-wide audit P2 is filed as `BL-ACCENT-ON-BG-AA-CONTRAST` in BACKLOG.md. Both the audit P2 (body-link contrast) and P3 (callout-link contrast on tinted fills) were resolved IN this PR across two Codex adversarial-review rounds: prose links inherit the high-contrast body/box text color + underline in EVERY state (no sub-AA accent at rest OR on :hover — round 2 caught the hover regression; WCAG 1.4.3 is not waived for hover text), so they clear AA everywhere. Hover feedback is the cursor + the always-present underline.

### D7 — [P3] /help/errors heading order skips h2 (h1 → RefAnchor `as="h3"`) — ✅ RESOLVED (audit Chunk 4)

- **What:** `app/help/errors/page.tsx` rendered `<h1>Errors</h1>` then each code entry as `RefAnchor as="h3"` with no h2, so the outline skipped a level (WCAG 1.3.1 best-practice).
- **Resolution:** the Chunk-4 errors-index restructure groups the codes by family under plain chapter-style `<h2 id="kebab">` section headings (the jump-list targets), with per-code entries staying `RefAnchor as="h3"`. The outline is now h1 → h2 → h3 with no skip, and the D.5 catalog-vs-chapter contract is honored (family headings are NOT RefAnchor; catalog codes still are). Pinned by `tests/help/errors-grouping.test.tsx` ("an h2 layer exists between h1 and the h3s").

## /help catalog tables — impeccable critique P2 (2026-06-22, Chunk 2)

### D8 — [P2] 390px 3-column catalog tables render as very tall wrapped cells — ✅ RESOLVED

- **What:** the dashboard sync-status and settings health-badge tables kept all 3 columns at 390px (~110px each), so prose wrapped hard (the "⚠ Changes to review" row ~11 lines tall). Readable + AA + no overflow, but a tall thin 3-col block on a phone was barely faster to scan than the old bullets.
- **Resolution:** the `HelpTable` MDX `table` override (`app/help/_components/HelpTable.tsx`, registered in `mdx-components.tsx`) tags tables with **≥3 columns** `data-stack="true"` and injects a **real-text** `.th-label` per body cell (from that cell's column header). `app/globals.css` then transforms those tables into **labeled stacked cards at ≤480px** (thead hidden, each row a bordered card, each cell a "Label / value" line). Real-text labels were chosen over CSS `::before { content: attr(data-label) }` because generated content is screen-reader-unreliable: on desktop the labels are `display:none` (out of the a11y tree, the real `<th>` column header is used); on mobile the `<thead>` is hidden and the injected labels carry the header for SR users (since the block layout drops the implicit table roles). 2-column tables (incl. the Apply/Discard comparison) are NEVER tagged, so they keep the normal table layout and are never falsely paired. Verified in a real browser at 390/480/481/1280 (stacked + no overflow on mobile; unchanged on desktop) — pinned by `tests/help/help-table-responsive.test.tsx` (component contract) + `tests/e2e/help-typography.spec.ts` (real-browser stacking at both help-docs viewports). Also fixed a pre-existing inline-`<code>` horizontal overflow surfaced during verification: the onboarding Drive-folder URL now wraps via `.help-prose code { overflow-wrap: anywhere }`.

## /help screenshots — audit Chunk 6 missing-visual (2026-06-23)

### D9 — [P2] per-show-panel has no staged-review-card screenshot — ✅ RESOLVED (not by a screenshot — the premise was stale)

- **What:** the per-show-panel audit (Chunk 3) flagged the staged-review card as the highest-stakes element on the page with no Screenshot to anchor it visually, and deferred capturing it because no seed fixture renders a staged card.
- **Resolution (2026-06-23):** building the seed fixture surfaced the real problem — **the per-show panel does not render a staged-review card at all.** Phase 6 replaced the whole-parse live-review mount with a `ChangesFeed` (`app/admin/show/[slug]/page.tsx`; `lib/sync/phase1.ts:321-323`): routine live-show edits auto-apply and land in the feed with a per-item Undo, and a crew identity change (MI-11) holds inline with Approve/Reject. The staged-review card (Apply/Discard) survives only for FIRST-SEEN sheets on `/admin/show/staged/[stagedId]`, reached from the Needs-attention inbox. So the per-show-panel `#staged-review-card` /help section (and the review-queues `#re-stage` section, and the dashboard "Changes to review" surfaces) were describing a **retired UI** — a documentation-accuracy bug, not a missing screenshot. Adding a screenshot of a staged card on the per-show-panel doc would have embedded a misleading image of a UI that doesn't render there.
- **What shipped instead:** the three /help pages were corrected to the live ChangesFeed / auto-apply / MI-11-hold / first-seen-review model (per-show #staged-review-card → #changes-feed; review-queues #re-stage → "Live-show changes"; the dashboard "Changes to review" badge + inbox card re-scoped to the rare existing_staged re-scan case, which is dead-in-v1 per `…/sync-changes-feed-identity-gate/06-ui-feed-gate-undo.md:478-483`). Verified by Codex code-fidelity review (R1–R3) + the impeccable critique gate. No screenshot is needed: the per-show panel's empty "Changes" feed is already covered by the prose, and the first-seen staged card (the surface that DOES render Apply/Discard) is a separate page if it ever wants a shot.
- **Residual (out of scope, separate cleanup):** the affordance-matrix has a DEFERRED "Per-show - Staged review card (re-stage)" entry that never rendered and is now moot — harmless (deferred entries are exempt from the parity render-check; its target anchor still resolves).

## CI speedup — Phase 2 items needing live-runner validation (2026-06-23)

Source: the verified CI-speedup analysis (41-agent workflow, every finding adversarially confirmed). PR A shipped the high-confidence Phase 1 + Phase 2c wins (concurrency cancel-in-progress, screenshots-drift path filter, apt-get fast-path, Playwright browser-binary cache). The items below are the rest of Phase 2 — each is genuinely off the merge-critical path (only `quality` is a required check) and needs a measurement or live-runner probe that an autonomous run can't safely guess, so they are deferred with concrete triggers rather than shipped half-verified.

### D10 — [P3] Supabase Docker-image cache on the Supabase-booting jobs

- **What:** `unit-suite`, `crew-e2e`, `help-affordances`, `dev-gate-e2e` (+ screenshots-drift) each `supabase start`, which pulls several GB of Postgres/GoTrue/Realtime/Storage/Kong images cold. Caching them (`docker save`/`load` via `actions/cache`) could cut boot time.
- **Why deferred:** the verifier flagged two unmeasured risks — (a) a guessed `docker images` filter that matches zero images silently no-ops the cache (must capture the BEFORE/AFTER `supabase start` image-ID diff, which means editing the shared `scripts/ci/supabase-local-bootstrap.sh`), and (b) the multi-GB save/load/transfer may cost as much as the gross pull, so net saving is unknown without a live measurement. Boot is only ~5% of unit-suite's 806s (the long pole is the sequential vitest run — see PR B), so even a perfect cache barely moves the required-check wall-clock.
- **Trigger:** measure gross `supabase start` image-pull time on a live `unit-suite` run (add a timed `docker pull` step or read the boot log). Implement only if pull >60s AND total image set <8GB (GitHub's 10GB cache budget). Capture the pulled image IDs via a `docker images -q` diff around `supabase start`, not a registry-name grep.

### D11 — [P3] Restore Next `.next/cache` before the screenshot / help builds

- **What:** `help-affordances` (and `screenshots-drift`) build the Next app cold each run; restoring `.next/cache` (the compiler cache, NOT build output) could save ~30s/build.
- **Why deferred:** (a) the walker's `:3004` webServer may use a custom `NEXT_DIST_DIR` (per the M3 custom-dist-dir history) so the cache path needs verifying against `playwright.config.ts`'s webServer command before it can target the right dir; (b) in `screenshots-drift` the build runs as root inside the pinned Docker container while `actions/cache` saves as the runner user — a real ownership boundary; and (c) it touches the byte-comparison screenshot gate, so a warm build must be proven byte-identical to a cold build (via a `screenshots-regen` dispatch) before it's trusted. None of (a)–(c) is safely guessable autonomously.
- **Trigger:** read the `:3004`/`:3000` webServer commands in `playwright.config.ts`, confirm the dist dir, cache ONLY `.next/cache`; for screenshots-drift, first dispatch `screenshots-regen` to prove warm-build byte-identity, and chown the cache dir back to the runner user.

### D12 — [P3] Composite setup action to DRY the per-job preamble

- **What:** all 8 workflows repeat checkout → pnpm/action-setup → setup-node → `pnpm install --frozen-lockfile` (and several repeat psql + supabase-cli setup). A `.github/actions/setup` composite action would de-duplicate it and become the home for D10/D11.
- **Why deferred:** 0s direct speedup (pure anti-drift plumbing); its value is contingent on D10/D11 landing. It also touches all 8 workflow files, so it conflicts with in-flight CI PRs (e.g. the supabase-cli pin work, #104/#105) — better done when the CI files are quiet. Note: 2 of the psql installs are INSIDE the Docker container (screenshots-drift / screenshots-regen) and can't move to a host composite step.
- **Trigger:** after the supabase-cli pin work (#104/#105) and this PR merge, and when D10 or D11 is ready to implement (so the composite action has a consumer beyond DRY). Also add `"packageManager": "pnpm@10.33.2"` to package.json as the single version source.

> Note: the verified report's "pin supabase/setup-cli" Phase-2 item is NOT deferred — it shipped independently (#104 pinned 2.98.2, which broke the bootstrap's in-container psql auth; #105 fixed it to 2.107.0, the version `latest` actually resolved to on green runs).

## Scan-progress bar — real-browser dimension probe (2026-06-23)

### D13 — [P3] Real-browser `getBoundingClientRect` check of the Step-2 progress bar — ✅ RESOLVED 2026-06-26

- **What:** confirm in a real browser that the themed `<progress data-testid="wizard-step2-progressbar">` renders at the progress panel's full content width (±0.5px) and the documented `h-2` (8px) height.
- **Resolved:** measured against the **live production deploy** (`fxav-crew-pages-validation.vercel.app`) via a Playwright session that injected the real panel markup into a deployed page (which serves the real compiled `globals.css`) and read `getComputedStyle` + `getBoundingClientRect`: bar width **518px == panel content width 518px (widthDelta 0px)**, bar height **8px**. Theming confirmed live in prod too: `appearance:none`, border `#e5e4e0` (`--color-border`), `border-radius:9999px`, `--color-accent #ff8c1a`. As predicted, the bar's width is from explicit `w-full` (not flex stretch), so the Tailwind-v4 no-default-`align-items:stretch` trap never applied.
- **Related close-out risk (spec §9 — NDJSON flush on Vercel) — also ✅ VERIFIED 2026-06-26:** ran a real authed scan of `fxav-test-shows` (19 sheets) from the deployed page context and timed each event off the wire — `content-type: application/x-ndjson`, 22 events (`listed` + 19×`prepared` + `staging` + `result`) arriving **spread over 15.6s** (first byte 4.6s; `prepared` trickling 6.7s→17.0s; `result` 20.3s), i.e. **incremental flush, NOT buffered** by Vercel (the `X-Accel-Buffering: no` + `Cache-Control: no-transform` + Node runtime hold). Both verifications recorded in the Opus memory topic file for this feature.

## parse-data-quality-warnings — layout-dimensions real-browser assertion (2026-06-26)

### DQ-1 — [N/A] Real-browser height-equality assertion for the data-gap surfaces — DEFERRED-AS-N/A

- **What:** the AGENTS.md / global writing-plans mandate requires a real-browser (Playwright / chrome-devtools `getBoundingClientRect()`) layout-dimensions task for any "fixed-height or fixed-width parent containing flex/grid children," asserting `child.height === parent.height` within 0.5px. Task 13 of this feature evaluates that trigger for the four NEW data-gap surfaces.
- **Why deferred (as not-applicable):** NONE of the four surfaces is a fixed-dimension parent with stretch-dependent children, so the Tailwind-v4-no-default-`align-items:stretch` collapse class the mandate targets cannot occur:
  - chip row-action bar — `flex flex-wrap items-center gap-3 … px-4 py-3` (`components/admin/ShowsTable.tsx`): CONTENT-height (`py-3`), EXPLICIT `items-center`, `flex-wrap`. The chip (`inline-flex items-center`) and the Publish button are both content-sized; nothing depends on the parent imposing a fixed height.
  - Step-3 per-class detail — `mt-2 flex flex-wrap items-center gap-1.5` (`components/admin/wizard/Step3SheetCard.tsx`): content-height, explicit `items-center`, `flex-wrap`.
  - per-show "Data quality" panel — `flex flex-col gap-2` (`app/admin/show/[slug]/page.tsx`): a column stack of content-height list items.
  - first-published alert sub-line — a plain `<p>` (`components/admin/PerShowAlertSection.tsx`): no flex at all.
  - **data-quality badge (ShowsTable title row)** — `flex items-center gap-2` content-height title container (`components/admin/ShowsTable.tsx`): the badge is an intrinsically-sized `size-3.5` glyph with `shrink-0`; nothing depends on the parent imposing a fixed height. Real-browser height-equality stays N/A (same rationale; 2026-07-04 data-quality-badge feature).
  - **data-quality badge (ArchivedShowRow title row)** — same `flex items-center gap-2` content-height container (`components/admin/ArchivedShowRow.tsx`); intrinsic `size-3.5` glyph, `shrink-0`. Real-browser height-equality stays N/A (same rationale; 2026-07-04 data-quality-badge feature).
    A height-equality real-browser test against any of these would assert that Tailwind's own `flex-wrap`/`items-center` work, not anything this feature's code is at risk of breaking — i.e. a contrived test that does not match the real (absent) risk.
- **What shipped instead:** a jsdom structural assertion (`tests/components/admin/dataGapsChipRowLayout.test.tsx`) pinning the actual class-of-bug for the chip row: the chip is a sibling rendered BEFORE the Publish action (not nested), and the bar keeps `items-center` (the v4 vertical-center guard) + `flex-wrap` (the 390px no-overflow guard). These are DOM-structure / className facts jsdom verifies exactly; none depends on a fixed parent dimension.
- **Trigger:** if any data-gap surface is ever refactored to live inside a fixed-height/width parent (e.g. a fixed-height toolbar row, an `h-N` chip rail, or a grid track with an explicit row height) whose children are expected to stretch to fill it, add the real-browser `getBoundingClientRect()` height-equality assertion at that point.

## onboarding-ux-polish — layout-dimensions real-browser assertion (2026-06-26)

### OUX-1 — [N/A] Real-browser height-equality assertion for PR #122's three new grids — DEFERRED-AS-N/A

- **What:** the AGENTS.md / global writing-plans mandate requires a real-browser (Playwright / chrome-devtools `getBoundingClientRect()`) layout-dimensions task for any "fixed-height or fixed-width parent containing flex/grid children," asserting `child.height === parent.height` within 0.5px. PR #122 (onboarding UX polish) added three new grid layouts on the Step-3 card; this entry evaluates that trigger for them (the trigger was not recorded at merge time — closing the gap retroactively, mirroring DQ-1).
- **Why deferred (as not-applicable):** NONE of the three is a fixed-dimension parent with stretch-dependent children, so the Tailwind-v4-no-default-`align-items:stretch` collapse class the mandate targets cannot occur:
  - schedule 2-track grid — `grid grid-cols-[auto_1fr] items-baseline gap-x-2` (`components/admin/wizard/Step3SheetCard.tsx`): the column tracks align the time + title cells by CSS-grid track semantics (inherent to grid, independent of the flex `align-items:stretch` default); `items-baseline` is explicit. Parent is content-height — no fixed row height the children must fill.
  - Dates/Totals `<dl>` — `grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1` (same file): identical reasoning — the shared eyebrow/value left edges are grid-track facts on content-height rows.
  - desktop card grid — `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start` (`components/admin/wizard/Step3Review.tsx`): `items-start` (NOT stretch); cards are content-height and intentionally do not equalize height. No fixed parent dimension.
    A height-equality real-browser test against any of these would assert that CSS grid itself works, not anything this code is at risk of breaking — a contrived test that does not match the real (absent) risk. The horizontal-alignment invariants the component documents (shared time/title/eyebrow/value left edges) are guaranteed by grid track sizing, not flex stretch, so they are likewise not subject to the v4 trap.
- **What shipped instead:** jsdom structural + functional coverage in `tests/components/step3SheetCard.test.tsx` (the 2-track grid renders separate `-sched-time` / `-sched-title` cells; the "Show all" expander reveals every entry) and `tests/components/onboardingWizardNav.test.tsx` (the desktop card-grid container). These pin the class structure jsdom verifies exactly; none depends on a fixed parent dimension.
- **Trigger:** if any of these three grids is ever refactored to live inside a fixed-height/width parent whose children are expected to stretch to fill it (e.g. an equal-height card row via `items-stretch`, or a fixed-height schedule rail), add the real-browser `getBoundingClientRect()` height-equality assertion at that point.

## drive-export-timeout — companion untimed Drive reads (2026-06-26)

The export `fetch` was bounded with an `AbortController` stall-guard (`DRIVE_EXPORT_TIMEOUT_MS` → transient `DriveFetchError(504)` → `withDriveRetry` retries; PR #128). A class-sweep (extended by that fix's adversarial review) found the remaining untimed Drive reads of the same silent-stall class, tracked below. **DXT-1 (the `files.get` hot-path piece) is now DONE; DXT-2 (the asset/revision stream reads) remains deferred.**

### DXT-1 — [✅ DONE] `files.get` + `files.list` metadata-read timeouts on the onboarding hot path

- **What:** `getDriveClient()` built the gaxios client with no timeout (gaxios default unbounded), so the metadata reads on the onboarding scan path could stall `prepareOne` identically to the export bug — both the per-sheet before-`get`/after-`get` (4+ of ~6 Drive calls per sheet) AND the `files.list` folder listing, which is the FIRST Drive call in the scan (a stall there hangs the whole pass before any sheet is read).
- **Done (this PR):** `driveFilesGet` (`lib/drive/fetch.ts`) and `listFolder` (`lib/drive/list.ts`) now pass a per-call `{ timeout, retry: false }` to `drive.files.get` / `drive.files.list` (`DRIVE_FILES_GET_TIMEOUT_MS` = 8s, `DRIVE_LIST_TIMEOUT_MS` = 10s — sized so the per-sheet aggregate worst case stays under the 300s route budget; the export's 180s is the dominant term), and `driveErrorStatus` maps the timeout code → transient 504 so the already-wrapping `withDriveRetry` retries then throws a typed error (same bounded contract as the export guard). `retry: false` keeps `withDriveRetry` the single retry layer. Threaded via `DriveFetchOptions.metadataTimeoutMs` / `ListFolderOptions.listTimeoutMs` for test injection. Chose the **scoped C1** over a client-level `getDriveClient` timeout (C2) because C2 would also abort legitimate slow crew-page agenda/reel **stream** downloads sharing that client, and C2 is anyway incomplete (the cron path builds 2 clients from `getDriveAuth()`, bypassing `getDriveClient`). ~14 `getDriveClient()` call sites confirmed this.
- **Blast radius (intended):** because `fetchDriveFileMetadata` and `listFolder` are shared helpers, this also bounds the non-onboarding callers at the same 8s/10s — cron, manual/push sync, retry-single-file, the MI-11 gate, the pending-ingestions retry route, the onboarding finalize route, and the Drive webhook's `listFolder`. Same operation class (fast metadata reads), so no false-abort risk; a strict resilience improvement everywhere. The shared `driveErrorStatus` change also means a `TimeoutError` now retries (vs. throwing immediately) for ALL `withDriveRetry` callers, including the export path — bounded and desirable.
- **Genuinely still untimed (NOT on the onboarding scan path):** only `files.watch` / `channels.stop` in `lib/drive/watch.ts` (Drive push-channel registration). The enrich linked-DIAGRAMS `files.list` is NOT in this list — it runs via `driveClient.listFolder` → the now-bounded `listDriveFolder`. The remaining cron/apply metadata reads are tracked in DXT-2 below.
- **Corrected fact:** the installed **gaxios is 7.x** (native-fetch rewrite), so a per-call timeout fires via `AbortSignal.timeout` and throws `GaxiosError` with **`code === "TimeoutError"`** (string, no numeric status) — NOT the `ECONNABORTED`/`ETIMEDOUT` shape an earlier draft of this entry claimed (that is gaxios-6/axios). `driveErrorStatus` classifies `"TimeoutError"` plus `ETIMEDOUT`/`ECONNABORTED` (defensive) → 504.

### DXT-2 — [✅ DONE] Idle stall-guard for the asset/revision byte-stream reads

- **What:** five untimed asset/revision byte-stream reads on the cron/apply pipeline shared the silent-stall class (a byte cap bounds memory, not time, so a stalled/slow-trickle body or stream hangs forever): the embedded-image `fetch` + the `drive.revisions.get` Node-stream read in EACH of `assetRecovery.ts` (recovery port) and `defaultSnapshotAssetsForApply.ts` (apply port), plus the cron `defaultDriveClient.getEmbeddedImageBytes` web `fetch` in `runScheduledCronSync.ts`.
- **Done (this PR):** new `lib/drive/stallGuard.ts` `createStallGuard(idleTimeoutMs)` → `{ signal, timedOut(), reset(), clear() }`. Unlike the metadata `files.get`/`files.list` guards (a TOTAL-time budget — those reads are tiny), asset downloads are large (≤50MB) and legitimately slow, so this is an **IDLE** guard: it fires only on no-progress for `DRIVE_ASSET_STALL_TIMEOUT_MS` (30s), `reset()` wired to the bounded readers' `onChunk` so a healthy slow download is never aborted. Each port body was extracted into an **exported, injectable, directly-unit-testable** helper (`fetchEmbeddedImageBytesTimed`/`fetchLinkedRevisionBytesTimed` in assetRecovery.ts; `snapshot…Timed` in defaultSnapshotAssetsForApply.ts; `cronFetchEmbeddedImageBytesTimed` in runScheduledCronSync.ts) that keeps the `readBoundedWebStream`/`readBoundedNodeStream` calls INLINE (per `_streamingHashContract`), passes `guard.signal` to `fetch`/`revisions.get`, and for the Node-stream branch also `destroy()`s the stream on abort (the gaxios signal does not reliably interrupt an already-returned mid-trickle Node Readable). On a fired guard → `return null` (preserving the ports' fail-soft contract — a stalled asset is skipped, NOT an apply-aborting throw); any OTHER error still propagates. All reads stay PRE-lock (no `_advisoryLockSingleHolderContract` impact); the ports kept fail-soft, so no `_metaInfraContract` registry change.
- **Resolved the test-seam gap:** the default-port bodies had ZERO unit coverage (the asset tests stub the drive port); the extracted helpers are now exercised directly with an injected stalling `fetch`/`drive` + tiny budget — including the key non-tautology test that a slow-but-PROGRESSING download survives past the idle budget (proving idle-reset, not total-time; verified load-bearing by a `reset()`-neutering mutation that makes those tests fail).
- **Observability follow-up (optional):** a persistently stalled download now returns null on every retry, indistinguishable from a legitimately-absent asset (the pre-existing `!ok`/`!body` null path) — correct per the ports' fail-soft contract, but a real upstream outage degrades silently. A low-volume admin alert / metric when `guard.timedOut()` returns null would make repeated stalls observable WITHOUT changing the fail-soft return contract.

### DXT-3 — [✅ DONE] Timeout for the off-onboarding-path cron/apply metadata reads

- **What:** five untimed metadata reads of the DXT-1 `files.get`/Sheets class, off the onboarding scan path (cron/apply): `verifyReelOnApply` `files.get`, cron `listSpreadsheetSheets` `spreadsheets.get` (Sheets v4) + `getSpreadsheetRevisionId` `revisions.list`, `applyStaged` `defaultRetryEmbeddedRevisionAvailability` `revisions.list` (the last two were also un-retried), AND `lib/drive/sheetGids.ts` `fetchSheetTitleToGid` `spreadsheets.get` — which is actually ON the onboarding scan path (gid lookup for deep-link anchors, added by PR #134 after the initial DXT-3 enumeration; caught in adversarial review).
- **Done (this PR):** each call is now `withDriveRetry(() => client.X(params, { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false }))` — the DXT-1 gaxios-7 timeout pattern (`TimeoutError` → `driveErrorStatus` 504 → `withDriveRetry` retries then throws typed; `retry: false` keeps `withDriveRetry` the single layer). The classifier is the same one DXT-1 added — reused for the Sheets client too (the timeout code is gaxios-level, client-agnostic). `verifyReelOnApply.defaultDrive` and `applyStaged.defaultRetryEmbeddedRevisionAvailability` were made **exported + injectable** (`{ drive?, retry?, timeoutMs? }`) to close the test-seam gap; the cron + sheetGids methods are tested via a googleapis-mock seam. A 403/404/410 on `verifyReelOnApply` stays non-transient → propagates unchanged to its drift handling.
- **Apply-path retry budget (review fix):** the two apply-path reads (`verifyReelOnApply`, `defaultRetryEmbeddedRevisionAvailability`) run under the per-show advisory xact lock, so they default to `maxRetries: 1` (≈16s worst/site) rather than the cron/scan default 3 (≈34s) — one retry covers a transient blip without sitting on the lock for the full budget; the previously-raw `revisions.list` keeps a fast-ish fail. Cron/sheetGids reads (background / 300s scan budget) keep the default retry.
- **Contract updates (in this diff, intent-preserving):** wrapping `verifyReelOnApply`'s `.files.get` in a named `getFileMetadataCall` thunk changed its `_scopeCheckContract` exemption key (`getFileMetadata` → `getFileMetadataCall`) and the `_sharedDriveSupportContract` live-fixture self-test (now finds `.files.get` rather than the old `getDriveClient().files.get` literal). The general `_sharedDriveSupportContract` arm (DRIVE_API_SURFACES scan) still independently enforces `supportsAllDrives` on the call.

This closes the entire untimed-Drive-read class: export fetch (#128), `files.get`/`files.list` metadata (#132), asset/revision byte-streams (#136), and these cron/apply metadata reads. Genuinely-still-untimed but off all sync paths: only `files.watch`/`channels.stop` in `lib/drive/watch.ts` (Drive push-channel registration).

## CI unit-suite sharding (PR D, 2026-06-26)

### D14 — [P3] Duration-balanced curated shard buckets (only if `--shard` count-balance misses the <9m stretch target)

- **What:** replace `vitest run --shard=${{ matrix.shard }}/2` in `.github/workflows/unit-suite.yml` with a curated per-shard include — a `matrix.shard`-keyed env (e.g. `VITEST_SHARD_INCLUDE`) selecting a fixed glob bucket per leg — so the heavy serial DB files split by measured DURATION rather than vitest's file-COUNT sharding. The two hottest files (`tests/scripts/validation-report-fixtures.test.ts` ~76s, `tests/cross-cutting/validation-check-seed-content-coverage.test.ts` ~41s) go in different buckets.
- **Why deferred (not a blocker):** PR D ships the structural win — sharding `unit-suite` across 2 legs — which already meets the user's explicit **sub-11m** bar (expected ~6.5-8m) and beats the pre-split ~11.3m. The spec's `<9m` is a stretch target. Curated buckets are a CONTINGENCY whose exact contents **depend on real per-file durations measured on the CI runner** — they cannot be designed up-front, and improvising them inside a merge-bound required-CI change (with no cross-model review of the new partition) is exactly the unreviewed-design risk an adversarial reviewer flagged. `--shard` is also zero-maintenance (auto-rebalances as files are added); curated buckets need a partition meta-test and ongoing upkeep.
- **Trigger:** if a post-merge `unit-suite` run shows `max(leg1, leg2) >= 9m` OR the two legs differ by `> 2 min`, design the buckets FROM the measured per-file durations (read each leg's vitest timing), add a meta-test asserting the two buckets partition `BASE_INCLUDE` (every file in exactly one bucket — no drop, no double-run), and take it through its own cross-model adversarial review before merge. Until then, plain `--shard` stands.

## Schedule SET/strike/load-out inference (2026-06-27)

### D-SET1 — [P3] Rich multi-entry SET run-of-show (cell-derived titles) — ✅ RESOLVED 2026-06-27

- **Resolution:** shipped the SET-specific **label-before-clock** tokenizer (`tokenizeSetSchedule` in `lib/parser/blocks/scheduleBookends.ts`) + the position-returning `extractClockTimeTokens` core (`lib/parser/blocks/dates.ts`). The SET run-of-show now carries the operator's actual cell-derived labels (e.g. `"Room Access"` for RFI/PCF, previously generic `"Setup"`) and supports N entries; clock values come from the same `decodeEntities(clean())` as `dates.loadIn`/`setupTime` (no key-times drift); time-first cells degrade to the original 2-entry synthesis. Spec `docs/superpowers/specs/parser/2026-06-27-set-cell-derived-labels-design.md`, plan `docs/superpowers/plans/parser/2026-06-27-set-cell-derived-labels.md`.
- **What (original):** the SET day surfaces its load-in/setup as two SYNTHESIZED entries (`"Load In {dates.loadIn}"` + `"Setup {dates.setupTime}"`) built by `deriveScheduleBookends` (`lib/parser/blocks/scheduleBookends.ts`) from the colon-extracted `dates.loadIn`/`setupTime`. It does NOT tokenize the SET cell into arbitrary titled run-of-show rows. A true "morning set + afternoon **session**" with cell-derived per-item titles (e.g. a SET cell carrying `Load In: 7:00 PM Room Access: 8:30 PM Session: ...`) would need a SET-specific **label-before-clock** tokenizer.
- **Why deferred:** the SHOW-DAY tokenizer reads titles from text AFTER each clock, which mislabels/drops the corpus label-before-clock shape (`Load In: 7:00 PM Room Access: 8:30 PM` → wrong). Spec rounds R9/R11/R12/R13/R14 converged on the structural fix: synthesize from `dates` (correct for every live SET cell — all load-in/setup logistics, ≤2 times). A bespoke SET tokenizer is net-new parser surface the corpus does not yet need. Second SET time is labeled generically "Setup".
- **Trigger:** a real SET cell needs >2 distinct times, OR a precise non-"Setup" label for the second+ entry (e.g. an actual agenda session on the set day). Then build a SET-specific label-before-clock tokenizer + its own adversarial review. See `docs/superpowers/specs/parser/2026-06-27-schedule-strike-loadout-inference-design.md` §6 Deferred.

## Per-sheet Re-scan (2026-06-29)

### RESCAN-1 — [P3] Final-publish blocker rows show a sheet's name, not the raw `drive_file_id`

- **What:** the `cas_per_row` blocker list (`components/admin/FinalizeButton.tsx` + `components/admin/RunFinalCASButton.tsx`) labels each blocked sheet by its opaque `drive_file_id` (e.g. `1N1PK…`). The new per-row "Re-scan this sheet" button makes each row actionable, so the unreadable identifier is now more salient. Surfaced by the impeccable UI gate on the per-sheet-rescan diff (MEDIUM).
- **Why deferred (not a blocker, pre-existing):** the raw `drive_file_id` was ALREADY the row label before this feature (the original blocker screenshot showed it); the re-scan button did not introduce it. Fixing it properly means threading `driveFileName` through the finalize-cas per_row response — the `CasPerRowEntry` shape (`RunFinalCASButton.tsx:25`) carries only `{drive_file_id, code}`, and `finalize-cas/route.ts` would have to join the manifest/show name into every per-row result. That is a finalize-cas response-shape change, out of scope for the rescan feature and orthogonal to its correctness.
- **Trigger:** any follow-up touching the finalize-cas per_row response, OR an operator report that the blocker list is unreadable. Then add `driveFileName` to `CasPerRowEntry` + the route's per_row construction (source: `onboarding_scan_manifest.name` or `shows.title`) and render it as the row's primary label with the id secondary.
- **Resolved (PR <n>, 2026-06-29):** all three blocker components — `components/admin/FinalizeButton.tsx` (both the Phase-B `race_row` and Phase-D `cas_per_row` lists), `components/admin/RunFinalCASButton.tsx`, and `components/admin/ResumeFinalizeButton.tsx` — now render `display_name ?? drive_file_id`, where `display_name` is the parsed show title attached by both finalize routes at their single per-row collection point via `lib/onboarding/blockerDisplayName.ts` (`parsedShowTitle`, defensive/never-throws, decodes legacy double-encoded `parse_result`). The raw `drive_file_id` survives only as the React `key`, the reapply `data-testid`, and the `RescanSheetButton driveFileId` prop; it remains the visible label only when no title is derivable (parse-failed / legacy-ambiguous rows). Spec `docs/superpowers/specs/data-quality/2026-06-29-finalize-blocker-show-title.md`, plan `docs/superpowers/plans/data-quality/2026-06-29-finalize-blocker-show-title.md`.

## Per-card report affordance (2026-07-01)

### CARDREPORT-1 — [P3] Recessive header affordances (`SourceLink` + `CardReportTrigger`) have sub-44px touch targets

- **What:** the new `CardReportTrigger` (`components/shared/CardReportTrigger.tsx`) is an icon-only `<button>` at the intrinsic glyph size (`size-3.5`, ~14px, `h-fit`, no min-tap padding), sitting in a `gap-2` cluster beside the existing `SourceLink` ("In sheet") in every source-backed crew card header. PRODUCT.md calls for ≥44×44 touch targets and no tiny click targets on phone surfaces. Surfaced by the impeccable v3 critique (Assessment A, HIGH) on the per-card-report diff.
- **Why deferred (not a blocker; pattern-level + pre-existing):** (1) the deficiency is **shared with the already-shipped `SourceLink`** in the same header `action` slot (`SourceLink.tsx:52`, `inline-flex h-fit shrink-0`), which passed prior impeccable gates — the new trigger deliberately MATCHES that established recessive-header-affordance pattern; sizing only the new button to 44px would create a visible asymmetry in a two-item cluster. (2) A 44×44 hit area on either clustered affordance would **overlap its sibling** (14px glyphs separated by an 8px gap) causing mis-taps, and/or **grow the header row**, violating the header dimensional invariant verified in `tests/e2e/source-link-dimensional.spec.ts` (affordance height ≤ header band). (3) The most safety-critical PRODUCT.md constraints ARE met: the trigger is always-visible (no hover-only), carries `aria-label="Report a problem with this card"`, and meets AA-large contrast. The residual is target SIZE, shared with the sibling.
- **Trigger:** any follow-up that reworks the card-header affordance cluster (e.g. collapsing `SourceLink` + report into one control, or a header-actions redesign). At that point, size BOTH affordances to ≥44×44 uniformly — likely via out-of-flow pseudo-element hit-area overlays that don't grow the header box or overlap each other (revisit the `source-link-dimensional` invariant to assert "header ROW height unchanged" rather than "affordance box ≤ header height"). Alternatively promote a per-section (not per-card) report entry point if cluster crowding proves the driver.

## Data quality Report + Ignore (2026-07-02)

DQIGNORE-1, DQIGNORE-2, and DQIGNORE-5 shipped on branch `feat/dq-ignore-followups` (2026-07-02). DQIGNORE-3 and DQIGNORE-4 remain (PR B). DQIGNORE-6 opened from the follow-up's impeccable dual-gate.

### DQIGNORE-1 — ✅ RESOLVED (feat/dq-ignore-followups)

Digest data-gap warnings (`UNKNOWN_SECTION_HEADER`, `BLOCK_DISAPPEARED`) now render through the same `PerShowActionableWarnings` card + `DataQualityWarningControls` slot as operator-actionable warnings; `readDataQuality` returns the digest as `ParseWarning[]`. `BLOCK_DISAPPEARED` stays Report-only (no `rawSnippet` → `warningFingerprint` null → never ignorable, always active).

### DQIGNORE-2 — ✅ RESOLVED (feat/dq-ignore-followups)

Per-code "Ignore all N" bulk control (`components/admin/BulkIgnoreControls.tsx` + `lib/dataQuality/bulkIgnoreGroups.ts`) fans out one precise per-fingerprint POST to the existing `/data-quality/ignore` route per distinct content — never a coarse code-level ignore. Shown only when a code has ≥2 distinct-content active ignorable warnings.

### DQIGNORE-3 — ✅ RESOLVED (feat/dq-orphan-gc)

Prune-on-apply GC: `PostgresPipelineTx.upsertShowsInternal` (the single shared Postgres apply chokepoint, in the holder's locked tx — single-holder, no new advisory lock) now deletes `ignored_warnings` rows whose content fingerprint is no longer present in the freshly-written `parse_warnings`. A still-present warning keeps its fingerprint, so its ignore survives (recurrence preserved); only vanished fingerprints are pruned (empty active set → all pruned, same `not (x = any($2))` semantics as `deleteCrewMembersNotIn`). The one behavior change is a fixed-then-reappearing ignored warning re-surfaces (user-chosen). Real-DB test: `tests/sync/ignoredWarningsOrphanGc.db.test.ts`. Folded into the Postgres impl (no `ApplyParseResultTx` interface change) to avoid the required-method fake-update blast radius.

### DQIGNORE-4 — ✅ RESOLVED (feat/dq-followups-backend)

The ignore/un-ignore routes now emit `WARNING_IGNORED` / `WARNING_UNIGNORED` forensic outcomes post-commit (actorHash + showId + warningCode + fingerprint), registered in `tests/log/_metaAdminOutcomeContract.test.ts` (`AUDITABLE_MUTATIONS` + `SANCTIONED_CODES`); Assertion 4 pins them OUT of the §12.4 producer set. Placement is post-commit (never in the tx); `log.*` never throws over the caller (invariant 9), so the plain `await` can't turn a committed ignore into a 500.

### DQIGNORE-5 — ✅ RESOLVED (feat/dq-ignore-followups)

Added a `ringOffset` prop to the shared `ReportButton` (full-literal class lookup map: `bg` / `surface` / `warning-bg` / `surface-sunken`, so Tailwind v4 JIT resolves each) defaulting to the prior per-variant value; `DataQualityWarningControls` passes `warning-bg` (active card) / `surface-sunken` (ignored card). The same follow-up's audit class-sweep also fixed the "Open in Sheet" link offset in `PerShowActionableWarnings` (tone-matched) and the bulk control offset (`bg`).

### DQIGNORE-6 — [P1 critique → deferred] Bulk "Ignore all N" is spatially divorced from the cards it ignores

- **What:** the per-code bulk control (`components/admin/BulkIgnoreControls.tsx`) stacks at the top of the Data-quality panel, while the cards it ignores are interleaved by code in the list below (`app/admin/show/[slug]/page.tsx`). The button names the count + type ("Ignore all 2 · Unrecognized row in sheet") but the cards do not repeat that type label, so on a ~390px phone Doug can commit an ignore covering cards he never scrolled to. Surfaced by the follow-up's impeccable critique (Assessment A, P1).
- **Why deferred (not a gate blocker):** the action is fully reversible — the ignored warnings drop into the collapsible "Ignored (N)" subsection, each with Un-ignore — so it is a scope-legibility concern, not data loss; and the common case is a single dominant code (one button, and every card below it is that type). The proper fix (group the active `PerShowActionableWarnings` list by code and render each bulk control as that group's header, OR add a type-label eyebrow to every card, OR an undo toast) is a card-list restructure whose test blast-radius is disproportionate to a P3-tier convenience feature. The cheap related risks were fixed in-branch (honest partial-failure copy; the stuck-disabled bug; aria-busy).
- **Trigger:** operators report ignoring the wrong warnings, OR multi-code high-volume shows are common in real data, OR the next Data-quality panel touch. Then group the active card list by code with the bulk control as each group's header (or add per-card type eyebrows), and pin the grouping with a render test.

### DQIGNORE — accepted (no defer)

- Digest-as-cards visual weight (Assessment A P2): intentional. Uniform per-warning cards with controls are the whole point of DQIGNORE-1; the prior plain amber bullet list had no Report/Ignore affordance.
- Report (quiet underlined text link) vs Ignore (neutral bordered button) visual-weight difference (Assessment A P3): the deliberate hierarchy from the per-card report affordance (PR #222) — Report is the understated affordance, Ignore is the first-class neutral action. Kept.

## Observability coverage completion — impeccable gate (2026-07-02)

Source: invariant-8 impeccable v3 dual-gate on branch `feat/observability-coverage-completion`. This milestone is additive observability instrumentation; its only UI-path touches are a zero-render listener + a single mount line, which produce no visual surface for `/impeccable critique` + `/impeccable audit` to evaluate.

### OBS-1 — [P4] impeccable dual-gate deferred for the null-render `GlobalErrorListener` + its layout mount

- **What:** the milestone adds `components/observe/GlobalErrorListener.tsx` (a `'use client'` component that returns `null` and only registers `window` `error`/`unhandledrejection` listeners) and a single `<GlobalErrorListener />` mount line inside `<body>` at `app/layout.tsx:57-59`. By invariant 8 (UI surface = any `app/` except `app/api/**`, any `components/`), both are UI-path files and nominally require the `/impeccable critique` + `/impeccable audit` dual-gate.
- **Why deferred (no visual surface to evaluate):** `GlobalErrorListener` renders **zero pixels** (`return null`) — it has no layout, color, type, spacing, or interaction to critique; and the layout change is a non-visual mount of that null component (no rendered output added). Running the visual impeccable gate would produce no meaningful findings. Per invariant 8's disposition rule ("HIGH and CRITICAL findings either fixed or explicitly deferred via a DEFERRED.md entry"), this is the explicit, cited deferral — not a silent N/A. No other UI surface is touched by this milestone (all other changes are `app/api/**`, `lib/**`, or `tests/**`).
- **Trigger:** if `GlobalErrorListener` ever gains rendered output (e.g. a visible error toast/banner), it becomes a real visual surface and MUST pass the impeccable dual-gate at that point.

## Stage-filtered crew schedule — #248 (2026-07-03)

Source: bug report #248, spec/plan `docs/superpowers/{specs,plans}/2026-07-03-stage-filtered-schedule*`. This feature is a **data-narrowing** change: it folds `stage_restriction` into an effective `date_restriction` at the `getShowForViewer` projection chokepoint plus stage-gates the `resolveKeyTimes` Set/Strike anchors. The diff touches **zero** layout/CSS/markup code — the four UI-file edits are pure argument-threading (`resolveViewerContext` destructure + `resolveKeyTimes`/`buildRightNowContext` args); no JSX element, className, or `@theme` token changes.

### SFS-1 — [P3] dedicated stage-restricted-crew real-browser e2e deferred; DayCard layout invariant covered by existing (unaffected) suite

- **What:** the plan's Task 6 called for a real-browser (Playwright) assertion that a stage-restricted viewer's worked day cards render + the `DayCard` self-stretch / 50px-badge dimensional invariant holds. A dedicated new e2e rendering **as a specific stage-restricted crew member** (Calvin) requires the crew-auth **picker flow** (the existing `crew-layout-dimensions.spec.ts` renders as an admin `{kind:'none'}` viewer via a share-token seed mutation, not as a restricted crew member).
- **Why deferred (proportionality + existing coverage):** (1) The mandatory `DayCard` real-browser dimensional invariant — `[data-testid="day-card-date"]` = 50px (`crew-layout-dimensions.spec.ts:735`) and the `self-stretch` vline fills the taller meta-bearing row (§5.5, `:781`) — is **already** asserted by `crew-layout-dimensions.spec.ts` via `getBoundingClientRect()`, and this change touches **no** `DayCard`/`ScheduleSection` layout or CSS, so the invariant is structurally unaffected (a stage-filtered schedule renders _fewer_ `DayCard`s, each laid out identically). (2) The stage-filter **behavior** (worked day cards present, pure show days absent, Set/Strike anchor gating) is covered by the test pyramid: `tests/crew/stageSchedule.test.ts` (worked-day math + all guards), `tests/data/getShowForViewerRunOfShow.test.ts` (projection narrows Calvin, incl. legacy `unknown_asterisk`), `tests/crew/resolveKeyTimes.test.ts` (anchor gating), and jsdom render tests in `ScheduleSection.test.tsx` / `TodaySection.test.tsx` / `buildRightNowContext.test.ts`. Building a full picker-auth e2e for a zero-layout-code change is disproportionate.
- **Trigger:** if a future change modifies `DayCard`, its parents, or the ScheduleSection day-card layout, add the stage-restricted-crew real-browser assertion at that point (mutate a seeded crew member's `stage_restriction` + drive the picker flow to view as them).

### SFS-2 — [P4] invariant-8 impeccable dual-gate deferred: non-visual argument-threading, no new visual surface

- **What:** invariant 8 (UI surface = any `app/` except `app/api/**`, any `components/**`) nominally requires `/impeccable critique` + `/impeccable audit` on the four UI-file edits: `components/crew/sections/ScheduleSection.tsx`, `components/crew/sections/TodaySection.tsx`, `components/right-now/buildRightNowContext.ts`, `app/show/[slug]/[shareToken]/_CrewShell.tsx`.
- **Why deferred (no visual surface to evaluate):** all four edits are **pure argument-threading** — a `resolveViewerContext` destructure gains `stageRestriction`, and `resolveKeyTimes` / `buildRightNowContext` calls gain a `stageRestriction` argument. No JSX element, `className`, color/spacing/type token, `@theme` block, or interaction is added or changed (verified: `git diff` on these files shows only added args/destructure keys + comments). The stage-filtered schedule renders entirely through **existing, already-impeccable-gated** components (`ScheduleSection`/`DayCard`/`KeyTimesStrip`/`RightNowHero`), and a stage-restricted crew's rendered subset (fewer day cards, Set/Strike anchors gated) is the **same visual-state class** as the pre-existing date-restricted-crew subset (`explicit`-restriction rendering, which already passed the impeccable gate). No new visual state class is introduced. This mirrors the OBS-1 disposition (deferred dual-gate for a non-visual UI-path change). Per invariant 8's disposition rule, this is the explicit, cited deferral — not a silent N/A.
- **Trigger:** if this feature ever adds a rendered element, style, or a genuinely new visual state (e.g. a stage-specific empty state, badge, or copy line in a component), that diff MUST pass the impeccable dual-gate at that point.

## Step 3 review modal redesign — impeccable gate (2026-07-03)

Source: invariant-8 impeccable v3 dual-gate on branch `feat/step3-review-modal-redesign` (critique 32/40 PASS + fixes `c4d642bd`; audit 18/20 PASS + the audit-R1 fix commit this entry lands in). Audit P1-1 (informational `text-text-faint` contrast), P2 in-dialog publish-failure announcement, and P2 standalone-link tap height were fixed in the audit-R1 commit; the entry below is the sole explicit DEFER.

### STEP3MODAL-1 — [P1] Accent-CTA contrast — ✅ RESOLVED 2026-07-16 (accent-contrast token pass, feat/accent-contrast-token-pass: light accent-text flipped to #0E0F12, 8.23:1)

- **What:** the modal's publish CTA (unchecked/pending states) uses the shared `bg-accent text-accent-text` pairing, which measures **2.33:1** in light mode — below WCAG AA 4.5:1 for normal-size text.
- **Why deferred (not a blocker; pre-existing + system-wide):** this is the project-wide accent token pairing, NOT introduced by this diff — the modal reuses the exact button recipe every other accent CTA ships (wizard, StagedReviewCard, dashboard). The token-layer deficiency is already filed as `BL-ACCENT-ON-BG-AA-CONTRAST` in BACKLOG.md (`docs/superpowers/plans/BACKLOG.md:595`), whose promotion prerequisite is a dedicated token/accessibility pass (new light-mode accent value + DESIGN.md §1.1/§1.2 figure corrections + contrast meta-test row + screenshot-baseline regen). Fixing it only inside this modal would fork the brand CTA color on one surface.
- **Trigger:** the `BL-ACCENT-ON-BG-AA-CONTRAST` token pass. No modal-local action; the modal inherits the corrected tokens automatically.

P3s carried to the whole-diff adversarial review (not deferred here — they ride the branch's close-out review): scroller-rect hoist, data-literal memo bust, per-row agenda live regions, nested sections, hotels `shrink-0` overflow, grab-pill affordance contrast, copy duplication.

## Developer tier — impeccable gate (2026-07-04)

Source: invariant-8 impeccable v3 dual-gate on branch `feat/developer-tier`. **Critique 32/40 (GOOD)** — Assessment A (LLM design review) + the deterministic detector (clean `[]`), AI-slop PASS, no P0/P1. **Audit 19/20 (EXCEPTIONAL)** — accessibility 3 / performance 4 / theming 4 / responsive 4 / anti-patterns 4, no P0/P1, anti-pattern scan clean. Critique P3-a (an em dash in a rendered `aria-label`, an impeccable absolute ban) was fixed inline in the commit this entry lands in (`DeveloperToggleButton.tsx:120` → "Developer access (your own, locked)"). The two entries below are the sole explicit DEFERs; the remaining P3s are non-blocking, shared-with-siblings toggle idioms (noted at the end).

### DEVTIER-1 — [P2] No help/description text on the per-row Developer toggle (critique)

- **What:** `DeveloperToggleButton` renders only a bare "Developer" label; it grants Activity nav + Maintenance + Diagnostics + Dev-tools row + the power to set another admin's developer status, with no inline explanation of that blast radius. Sibling privilege surfaces carry help (`AdministratorsSection` HoverHelp, `NotifyToggle` description).
- **Why deferred (proportionality + technical audience):** the control is server-side ABSENT for normal admins — safe-default `viewerIsDeveloper=false` gating is verified across nav (`AdminNav:36`), settings sections, `DevToolsRow:30`, and the per-row toggle, so the only users who ever see it are already developers, who understand the grant. Missing help is an enhancement, not a correctness/safety gap: self-demotion is structurally locked + server-refused, and every error result renders cataloged copy (invariant 5). Adding a HoverHelp is a net-new UI element that would itself re-enter the impeccable gate.
- **Trigger:** if the developer tier is exposed to a non-developer management surface, or a HoverHelp cluster is added to the Administrators row, wire a one-line "Grants full developer access, incl. promoting others" description at that point.

### DEVTIER-2 — [P2] ON-track accent fill contrast — ✅ RESOLVED 2026-07-16 (accent-contrast token pass: border-accent-edge boundary on every toggle track, 3.61:1 vs track / 8.06:1 vs bg)

- **What:** the toggle's ON state uses `border-accent bg-accent` (`DeveloperToggleButton.tsx:93`); the accent fill on the page background computes ≈2.2:1, under WCAG 1.4.11 (3:1 for a UI-component fill vs its adjacent color).
- **Why deferred (pre-existing + system-wide, not diff-introduced):** identical construction ships in `NotifyToggle.tsx:134` and `PublishedToggle.tsx:146` — this is the shared project toggle recipe, not introduced by this diff. It is the same token deficiency already filed as `BL-ACCENT-ON-BG-AA-CONTRAST` in `docs/superpowers/plans/BACKLOG.md` and deferred by the Step-3-modal gate as STEP3MODAL-1. Mitigated: the toggle state is NEVER color-only (thumb `translate-x` + `aria-checked` + the visible "Developer" label), so the color-blind floor holds. Fixing it only inside this toggle would fork the brand accent on one surface.
- **Trigger:** the `BL-ACCENT-ON-BG-AA-CONTRAST` token pass (adds a ≥3:1 outer ring or a darkened ON border system-wide); this toggle inherits the fix automatically.

Non-blocking P3s (not deferred; noted for the whole-diff review, shared verbatim with the sibling toggles): focus-loss on `disabled={isPending}` during the server revalidate (the deliberate React-19 form-action dispatch-safety pattern in `NotifyToggle`/`PublishedToggle`); the visible "Developer" label is not programmatically tied to the switch via `<label>`/`aria-labelledby` (no violation — a distinct per-row `aria-label` supplies the accessible name; matches the sibling idiom).

### PCR-1 — [P4] impeccable dual-gate LOW findings deferred: consistency with the approved shipped sibling — ✅ RESOLVED 2026-07-04

- **What:** the impeccable dual-gate on `app/admin/show/[slug]/PickerResetControl.tsx` (per-crew picker reset, 2026-07-03) returned 2 HIGH + 2 MEDIUM + several LOW. **All HIGH and MEDIUM were fixed** in the same task: em dash removed from Doug-facing copy, "Reset everyone" given a `min-h-tap-min` tap target and de-emphasized to neutral `text-text-subtle` (accent reserved for the confirm CTA so it never out-ranks the primary per-member Reset), primary Reset bumped to `font-semibold`, stale-selection label fallback added. Design critique AI-slop gate: PASS post-fix (detector `[]`, zero em dashes). Audit: 18/20.
- **Deferred (LOW only, all "matches the approved shipped sibling `ResetPickerEpochButton`"):** (a) `role=status` OK-banner is mounted-with-content rather than a pre-existing empty live region (some SRs skip insert-time announce); (b) the row label "Reset name picker" is a `<p>`, not a heading; (c) focus rings use `ring-2` without `ring-offset` where DESIGN §focus specifies 3px + 2px offset; (d) the success banner persists until the next interaction (no auto-dismiss).
- **Why deferred:** each is an exact behavioral/visual match to the already-shipped, already-impeccable-gated `ResetPickerEpochButton` in the same panel. Fixing them in isolation would make the new control **diverge** from the sibling it sits beside (worse consistency), or would require also editing the shipped sibling (out of scope for this feature). The error banner correctly uses `role=alert` (announces on insert); only the success path has the insert-time caveat, and it is non-critical.
- **Trigger:** if the shared two-tap control pattern (`ResetPickerEpochButton` + `PickerResetControl`) is revised, address (a)–(d) across BOTH controls together (pre-existing empty live region, heading semantics, DESIGN-spec focus ring, optional success auto-dismiss) so they stay consistent.
- **Resolved (branch `fix/picker-reset-a11y-pcr1`, 2026-07-04):** the trigger fired — all four LOW items shipped across BOTH controls together so they stay consistent. (a) success now announces from a persistent empty `role=status`/`aria-live=polite` region present in every UI state — a real visually-hidden `sr-only` element (NOT `display:contents`, whose live-region semantics can be dropped from the a11y tree in Safari/VoiceOver — Codex R1 MEDIUM), out of layout flow so it adds no flex gap; `ResetPickerEpochButton` refactored to a single return so the region holds one stable tree position across the resolving→idle transition; (b) the row label is an `<h4>` under the panel's `<h3>`; (c) every focusable control gained `focus-visible:ring-offset-2 focus-visible:ring-offset-surface` (matching the codebase's ~120 other compliant `ring-2`+offset surfaces on `bg-surface`); (d) the success banner auto-dismisses after 5s (effect keyed on outcome, cleaned up on unmount/change), while error/refused banners deliberately persist. **Note on (c):** DESIGN §focus prose says "3px ring + 2px offset", but the entire codebase uses `ring-2` (2px) + `ring-offset-2`; matching the 2px sibling pattern preserves cross-app consistency. The prose-vs-token 3px discrepancy is app-wide (not these two controls) and left for a system-wide token pass, not fixed in isolation here. Coverage: `tests/admin/pickerResetControl.test.tsx` + `tests/components/ResetPickerEpochButton.test.tsx` (persistent-region-at-mount, heading role, per-focusable offset class, success-auto-dismiss / error-persists).

## Alert resolve-truthing — branch-protection auto-resolvers deferred (2026-07-05)

Source: `alert-resolve-truthing` (manual-resolve button reflects true auto-resolvability + finish the 3 deferred config-state auto-resolvers). Of the three codes this feature set out to make `class: auto`, only **`GITHUB_BOT_LOGIN_MISSING`** was completed (notify-cron env-presence reconcile + opportunistic resolve in `lib/reports/submit.ts`). The two branch-protection codes stay deferred.

### ARTRUTH-1 — [scope] `BRANCH_PROTECTION_DRIFT` / `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` stay `resolution: "manual"`

- **What:** both codes keep the manual resolve button (registry `class: deferred`, catalog `resolution: "manual"`) rather than becoming `auto`. A resolve-on-clean auto-resolver was NOT wired.
- **Why deferred:** their only producer — the privileged branch-protection drift detector `scripts/verify-branch-protection.ts` — runs in the two `x-audits.yml` jobs `verify-branch-protection` (`:446 if: false`) and `verify-branch-protection-status` (`:477 if: false`), both **disabled** under the X6-D-1 solo-dev variant. A code whose detector never fires cannot observe a "clean" transition, so an auto-resolver would be dead code (and could never be exercised by a test). Manual resolve is the only path that can currently clear a stale row, so the button must stay.
- **Trigger:** if the X6-D-1 `verify-branch-protection` jobs are re-enabled (drop `if: false` at `x-audits.yml:446` + `:477`), add a resolve-on-clean call on the detector's success branch (`scripts/verify-branch-protection.ts`, reusing the existing service-role client at `:68` and honoring the `localSupabaseReason` skip at `:63`), then reclassify BOTH codes to `auto` — three lockstep edits: registry `ADMIN_ALERTS_LIFECYCLE` (`class: "auto"` + `resolveSites`), catalog `resolution: "auto"`, and the `_metaAdminAlertCatalog` "every auto code's resolve site exists on disk and matches" test. The `no resolution:manual code promises auto-clear in its copy` guard already permits either class.
- **Resolved (branch `feat/bell-notification-center`, 2026-07-05, spec `2026-07-05-bell-notification-center-design.md` §9):** the bell spec ratified the conversion AHEAD of the workflow trigger (D6 "in scope"): the bell surface makes premature manual resolution of bucket-C codes an attractive nuisance, so the manual button had to go even while the detector jobs stay `if: false`. All three lockstep edits shipped — resolver `defaultResolveAlerts` + healthy-path call sites in `scripts/verify-branch-protection.ts` (commit 1c7091c1, exercised via the `alertResolver` DI seam in tests), catalog `resolution: "auto"` + `AUTO_RESOLVE_NOTES`, registry `class: "auto"` + resolveSites (commit 7bad3a8c). Note the resolver is dormant in CI until `x-audits.yml:446`/`:477` drop `if: false` — that residual re-enable step remains open, but is no longer blocked on this entry.

## Bell notification center — impeccable dual-gate deferrals (2026-07-05)

Source: invariant-8 dual-gate on `feat/bell-notification-center` (critique 28/40, audit 14/20 "Good", detector `[]` clean, no CRITICAL). HIGH fixed in-branch: em-dash truncation copy; P2s fixed in-branch: dev-footer `min-h-tap-min`, `wrap-break-word` on row titles/messages, unread-title `font-semibold` scannability. Remaining P2/P3s below.

### BELL-1 — [P2] Row-expand affordance invisible; context-less rows expand to no visible payload

- **What:** `ActiveRow`'s full-row toggle (`components/admin/BellPanel.tsx` `bell-entry-toggle-*`) has no chevron/caret; rows whose code lacks `helpfulContext` expand to nothing visible beyond the dot clearing.
- **Why deferred:** the expand-is-read gesture is ratified spec D3/§7.3 — the row MUST stay tappable on every code (the read mark is the point), so "only render toggle when context exists" would break the contract. Adding a rotating caret is a net-new visual element that would re-enter the impeccable gate and touch the §13 transition inventory + §14 layout invariants (e2e) mid-ship.
- **Trigger:** first real-usage feedback pass (D4 calibration window). Add a caret shown only when `rowHelpfulContext(entry.code)` is non-null, rotating on expand; extend the §13 audit comment + `bell-panel-layout.spec.ts` row-rect assertions in the same commit.
- **Resolved (branch `feat/bell-notification-center`, 2026-07-05, user-directed):** shipped a `ChevronRight` (lucide) disclosure caret in `ActiveRow`'s title row (trailing edge, after the timestamp, `shrink-0 text-text-subtle`, `aria-hidden` — the toggle already carries `aria-expanded`), rendered ONLY when `rowHelpfulContext(entry.code)` is non-null, rotating to `rotate-90` on expand via `motion-safe:transition-transform` (transform-only, no reflow). The full-row toggle stays tappable on EVERY row — context-less rows still fire the read POST (spec D3). The caret is independent of read state, so it never shifts the dot slot or row geometry between unread/read (the §14 dot no-shift e2e still passes with the caret present). Extended the §13 transition-audit comment in `tests/e2e/bell-panel-layout.spec.ts` with the caret row. Coverage: `tests/components/bellPanelDeferrals.test.tsx` (present-with-context / absent-without; rotation class flips on expand; context-less row still tappable).

### BELL-2 — [P2] No triage structure at 9+ (severity/show grouping + mark-all remain deferred) — count heading ✅ RESOLVED on branch

- **What:** the active section renders a flat activity-ordered list; a 9+ badge opens as an undifferentiated wall. (Count heading was originally part of this entry — now shipped, see the resolved note.)
- **Why deferred:** grouping/ordering is a spec §7.2 surface (collapse per (show,code), activityAt DESC is the ratified contract); adding severity or show grouping is a design change needing its own shape pass, not a gate fix.
- **Resolved (branch `feat/bell-notification-center`, 2026-07-05, user-directed) — count heading only:** the active section now renders a visible `Active (N)` count heading (`bell-section-active-heading`), mirroring the history heading's `text-xs font-semibold uppercase tracking-wide text-text-subtle` eyebrow style; `N` is the active-entries length. The active section stays un-dimmed (only the eyebrow label uses `text-text-subtle`) and remains hidden when there are zero active entries. Coverage: `tests/components/bellPanelDeferrals.test.tsx` (`Active (N)` with N derived from active length; no active section/heading when history-only).
- **Remaining deferral (narrowed):** severity/show grouping and mark-all-read — a §7.2 grouping design change, not a gate fix.
- **Trigger:** D4 calibration — once real alert volume is observed, run `/impeccable shape` on panel triage (grouping, mark-all-read) as its own feature.

### BELL-3 — [P3] Post-action refetch has no aria-live announcement

- **What:** loading→ready and post-Resolve/Save refetches update the list silently for screen readers (badge count changes are visual only).
- **Why deferred:** the panel is a focus-trapped dialog whose content updates in place; a polite live region needs the project's persistent-sr-only-region pattern (see PCR-1(a)) wired across all five panel states — small but cross-state, and no SR user is blocked (all content remains reachable by re-reading).
- **Trigger:** bundle with BELL-1's caret commit or the next a11y pass; reuse the PCR-1 persistent `role=status` `sr-only` pattern.
- **Resolved (branch `feat/bell-notification-center`, 2026-07-05, user-directed):** added a persistent `role="status"` `aria-live="polite"` `sr-only` region (`bell-live-region`) mounted inside the panel container in EVERY state (loading | error | ready | empty) so it holds one stable tree position across transitions — the announce text swaps INTO a pre-existing region (the PCR-1 pattern; a real `sr-only` element, NOT `display:contents`). Announces the initial load ("N active notification(s)" / "No notifications" / "No active notifications") and completion after a Resolve/Save refetch ("Notifications updated"); a failed load announces "Notifications didn't load". Copy is plain UI chrome (no raw codes, invariant 5). Coverage: `tests/components/bellPanelDeferrals.test.tsx` (region present at mount in loading state before the feed resolves; text updates after load and after a resolve refetch; empty and error announcements).

### BELL-4 — [P3] Untokenized brackets `max-h-[70vh] sm:max-h-[480px]`; DevFooter number inputs at w-20

- **What:** panel scroll-container max-heights are arbitrary brackets with no DESIGN.md token; no sibling precedent (AppHealthPopover has no scroll container).
- **Why deferred:** pragmatic one-off; tokenizing panel max-height solo would add a token with a single consumer. `max-w-[420px]` is ratified §14 and shared with AppHealthPopover — not part of this entry.
- **Trigger:** next DESIGN.md token pass, or a second scrolling-panel surface appearing (then extract a shared token).
- **Resolved (branch `feat/bell-notification-center`, 2026-07-05, user-directed):** tokenized both scroll-container max-heights. `app/globals.css` `@theme` gained `--spacing-panel-max-mobile: 70vh` (bell-specific mobile scroll cap) and `--spacing-panel-max: 480px`; `BellPanel`'s `max-h-[70vh] sm:max-h-[480px]` became `max-h-panel-max-mobile sm:max-h-panel-max`. Tokenizing 480px surfaced it as a SHARED value — the `enforce-canonical-classes` lint rule then required the three pre-existing `[480px]` bracket sites to adopt the canonical class, so `--spacing-panel-max` is documented in DESIGN.md §3 as the shared "wide panel" extent and the dashboard Needs-Attention inbox column (`app/admin/loading.tsx`, `components/admin/Dashboard.tsx` → `min-[1400px]:w-panel-max`) plus the report modal (`components/shared/ReportModal.tsx` → `max-w-panel-max`) were canonicalized in the same commit. Verified the four utilities compile via the Tailwind v4 pipeline. The DevFooter `w-20` number inputs stay as-is (not a bracket; unchanged). (Note: this superseded the entry's "single consumer" premise — 480px had 3 prior consumers.)

## Step-3 review consolidation — impeccable dual-gate deferrals (2026-07-06)

Source: invariant-8 impeccable v3 dual-gate on branch `feat/step3-review-consolidation`. Verdict: critique 35/40 PASS, audit 19/20 PASS, deterministic detector `[]`, zero CRITICAL, zero unaddressed HIGH. FIXED in-branch: em-dash in the pre-finalize summary (comma), the post-finalize summary contradiction (suppressed like the Select-all header), the modal resolution-footer note ("Removed from this setup." → "Approve to re-apply, or set this sheet aside."), and the resolution-error live region (`role="status"` → `role="alert"`). The entries below are the P2/P3 items on the PRE-EXISTING modal chrome (the consolidation only added the resolution footer; these predate it) — deferred, not introduced by this diff.

### S3C-1 — [P2] Per-section nav dots signal "needs a look" by color only (WCAG 1.4.1)

- **What:** `components/admin/wizard/Step3ReviewModal.tsx:322` — the rail/chip section dots use `dotToneClass` (`bg-status-review` red vs `bg-status-positive` green), size-2, `aria-hidden`. The only per-section "flagged" cue is red-vs-green on shape-identical dots, invisible to AT and to color-blind sighted users.
- **Why deferred:** pre-existing modal navigation (not part of the consolidation surface); mitigated — the section header carries a text "N need a look" count and the section chrome differs, so no user is fully blocked. A correct fix (distinct glyph on flagged dots, or sr-adjacent text) touches the modal's shared section-nav, out of consolidation scope.
- **Trigger:** the next a11y pass on Step3ReviewModal section nav, or any SR/color-blind audit that flags it.

### S3C-2 — [P2] Modal background not `inert` while open

- **What:** `Step3ReviewModal.tsx:844` — `role="dialog" aria-modal` + `useDialogFocus` trap + body-scroll-lock are present, but the modal renders inline (not portaled) and background siblings are not `inert`/`aria-hidden`, so a virtual-cursor SR user can browse behind the open dialog.
- **Why deferred:** pre-existing modal architecture; the focus trap + Esc/scrim/drag exits keep keyboard users contained. Adding `inert` to siblings is a modal-shell change beyond the consolidation's resolution-footer scope.
- **Trigger:** the next modal-a11y pass, or a portal migration of Step3ReviewModal.

### S3C-3 — [P3] Heading hierarchy skip (h1 → h3) on the review surface

- **What:** `Step3Review.tsx:1155` page `h1` is followed by section `h3`s (needs-attention / set-aside) with no `h2` (WCAG 1.3.1 best-practice).
- **Why deferred:** pre-existing structure; visual hierarchy is correct and no content is unreachable. Renumbering headings is a low-impact polish spanning the whole review surface.
- **Trigger:** the next heading/landmark pass on the admin wizard.

## Pull-sheet archived-tab override — whole-diff R2 deferral (2026-07-06)

Source: cross-model whole-diff review (Codex) on branch `feat/pull-sheet-archived-tab-override`, round 2. R2-1 (§5.7 under-lock refuse on the shared staging path — `scanPreparedFileWithTx`) was FIXED in-branch (under-lock override re-read guard + `StaleOverrideRefusedRollbackError` + apply/retry route `409 STAGED_PARSE_OUTDATED` mapping + `tests/sync/onboarding.test.ts` refuse/stage regressions). R2-2 below is deferred.

### PSAT-1 — [P2] Committed override + failed follow-up re-scan leaves Step-3 re-offering S2/S3 from the stale preview (recovery-UX loop)

- **What:** `components/admin/wizard/step3ReviewSections.tsx` derives `overrideActive` solely from `pr.archivedPullSheetTabs.some((t) => t.included)` (the persisted `pending_syncs.parse_result` preview), NOT from the durable `pending_syncs.pull_sheet_override` row. The accept/revoke route commits the override RPC then triggers a best-effort refresh re-scan; the route returns 200 on RPC success even if that re-scan fails (audit-before-re-scan, §5.8). When the re-scan FAILS, the durable override is committed (e.g. =A) but the preview `included` stays stale (false). Step-3 then renders S2 (offer) again and posts `expectedOverrideSnapshot: null`; the RPC row-state CAS sees current=A vs expected=null → 40001 → 409 → `router.refresh()` reloads the same stale envelope → S2 again. Revoke-failure is the inverse (stale S3). The admin can loop until a later re-scan succeeds.
- **Why deferred:** (1) **Data is correct** — the override RPC committed exactly as intended; only the preview/recovery UX diverges. (2) **Publication stays fail-safe** — the Task-11 finalize consistency gate refuses on any applied≠desired mismatch (`STAGED_PARSE_OUTDATED_AT_PHASE_D`), so no wrong gear can publish regardless. (3) **Infra-gated** — the loop requires the post-commit re-scan to FAIL (transient Drive/DB fault); on recovery the next successful re-scan updates the preview and the loop clears. (4) The proper fix is invariant-8 impeccable-gated UI work (below), disproportionate to a narrow infra-failure recovery edge at feature close-out.
- **Proper fix (when prioritized):** thread the durable override state into the Step-3 DTO (`Step3SheetCard` → `SectionData`) — e.g. a `pullSheetOverrideActive: boolean` sourced from `pending_syncs.pull_sheet_override != null` — and derive `overrideActive` from it (so a committed override is never re-offered as S2 with a null snapshot). Where the durable override and the preview `included` flag DISAGREE (committed-but-preview-stale), render the §5.8 "re-scan needed" divergent state (an explicit "gear saved; preview refreshing — reload to update" affordance) instead of S2/S3. UI is Opus-only + `/impeccable critique`+`audit` per invariant 8. Backlog: `BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO`.
- **Trigger:** the next Step-3 review robustness/a11y pass, OR any report of an admin stuck re-offering an already-accepted archived-tab.

## Venue card redesign — impeccable gate (2026-07-07)

Source: invariant-8 impeccable v3 dual-gate (critique + audit) on branch `feat/venue-card-redesign`. Critique 36/40 PASS (AI-slop NO, zero P0/P1). Audit 17/20, no P0, one P1 (below) + P2s. Deterministic detector: 3 warnings, all false-positive vs rendered output (dynamic `<img src={src}>` is valid; the em-dashes are in code comments, not rendered copy). Fixed in-branch: [P2] clipped focus ring on the map anchor (→ `ring-inset`), [P3] `onLoad` visibility reset, [P3] "map" badge `aria-hidden`, [P3] new-tab aria cue, [P3] double-spaces in class strings. The two entries below are deferred.

### VCR-1 — [P1] Eyebrow labels fail WCAG AA contrast — ✅ RESOLVED 2026-07-16 (accent-contrast token pass: CELL_EYEBROW_CLASS + hard-coded venue/dock eyebrows + map badge re-pointed to text-subtle; wizard 10px-faint scan pins the class)

- **What:** the "Venue" / "Loading dock" eyebrows (`components/admin/wizard/step3ReviewSections.tsx:824,864`, `text-[10px] text-text-faint uppercase`) and the "map" badge (`components/admin/wizard/VenueMapTile.tsx:52`) use `--color-text-faint` (#8b8c92 light / #74736d dark) → ~3.0–3.75:1 on their surfaces, below the 4.5:1 AA threshold for text this small.
- **Why deferred:** NOT introduced by this card. `text-text-faint` is the shared eyebrow token — the same `CELL_EYEBROW_CLASS` (`step3ReviewSections.tsx:385`) ships on every restyled Stage-3 card (#348/#349), and the design mock itself specifies #8B8C92 for the eyebrow. The auditor's explicit recommendation: disposition at the TOKEN (bump `--color-text-faint` toward `--color-text-subtle`, which passes at 6.76:1, or reserve `text-faint` for genuinely decorative text) rather than hand-patch one card. A per-card override would diverge this card from its siblings and the mock. This is an Opus-only + impeccable-gated design-system decision with cross-card visual-regression impact.
- **Trigger:** the next Stage-3 card / admin-eyebrow a11y-contrast pass, OR a design decision to raise `--color-text-faint`. Backlog: `BL-ADMIN-EYEBROW-FAINT-CONTRAST` (applies to all Stage-3 cards, not just venue).

### VCR-2 — [P2] Dark-mode first paint fetches the light map, then re-fetches dark

- **What:** `VenueMapTile.tsx` initializes `theme` to `"light"` and corrects in a post-hydration `useEffect` (`document.documentElement.dataset.theme` read), so a dark-mode reviewer's first `<img>` src carries `theme=light`, then a second request carries `theme=dark` — a one-frame light-map flash plus a redundant (billable) proxy round-trip.
- **Why deferred:** RATIFIED by spec §6 — the one-frame post-hydration flash is the accepted trade-off, and the `dataset.theme` post-hydration read is the established project pattern (mirrors `ThemeToggle.tsx:104`). Avoiding it via a `useState` initializer that reads `dataset.theme` would break SSR/hydration parity (server renders "light"; a mismatched client initial render throws a hydration error). Gating the `<img>` mount until theme resolves would deviate from the spec's ratified "always-painted base + overlay, no client swap state" contract (§3.2). Cost is bounded: the proxy caches `private, max-age=3600` and the sole admin (Doug) rarely uses dark mode on the review surface.
- **Trigger:** if Static Maps billing becomes material, OR a future SSR-theme-hint (cookie/header) lets the server pre-resolve the theme so the first paint is correct. Backlog: `BL-VENUE-MAP-DARK-DOUBLE-FETCH`.

### VCR-3 — [MEDIUM] Link-only venue (maps link but no name/address/city/dock) renders an empty card

- **What:** `components/admin/wizard/step3ReviewSections.tsx` counts `venue.googleLink` as a content row (ratified spec §5.4: count = 5 fields incl. googleLink), so a venue whose ONLY populated field is a valid `googleLink` yields `rows.length === 1` → the "No venue details parsed." empty state is suppressed, yet the redesigned body renders nothing actionable: no name/address block, the map region is gated on the geocode query (`[name,address]` → empty → not mounted), no dock footer, and the maps link itself is not surfaced as text (by design — no raw URLs / dead anchors, invariant 5).
- **Why deferred:** (1) Near-zero trigger — the venue-block parser essentially never emits a googleLink with no name AND no address AND no city AND no loadingDock. (2) No data loss — the maps link stays in `parseResult`, and the section-header "In sheet ↗" deep-link still opens the source sheet. (3) Count follows the ratified spec §5.4 formula. (4) A proper fix (surface a Directions affordance when `mapHref` is valid but the geocode query is empty) deviates from the ratified §3.2 "empty query → VenueMapTile returns null, parent owns collapse" contract AND adds a new text-column link element = Opus-only + impeccable-gated UI work, disproportionate to a degenerate edge. Whole-diff cross-model review (Codex) rated this MEDIUM / non-blocking and APPROVED.
- **Trigger:** a real parsed venue with a maps link but no name/address is observed, OR the next Stage-3 venue-card robustness pass. Backlog: `BL-VENUE-LINK-ONLY-EMPTY-CARD`.

## Telemetry console redesign — invariant-8 impeccable dual-gate (2026-07-06)

Source: invariant-8 impeccable v3 dual-gate on branch `feat/telemetry-console-redesign`. Verdict: critique 33/40 PASS, audit 17/20 PASS, deterministic detector `[]` (0 findings), zero CRITICAL/P0. FIXED in-branch: switch ARIA (`role="switch"` + `aria-pressed` → plain toggle button with `aria-pressed`, the valid pairing); standalone icon-button tap-target WIDTH (`min-w-tap-min` on the auto-refresh switch + manual-refresh button, WCAG 2.5.5); tabular figures on EventRow relative time + OpenAlerts inline count segments + Activity match-count; `—` no-data placeholder now carries `aria-label="Unavailable"` (glyph `aria-hidden`); "notice" overview dot corrected from idle→review to match SystemHealthCard; header pill given `flex-wrap` for narrow viewports; Activity block wrapped in `<section aria-labelledby>`. The entries below are deferred.

### TEL-1 — [P1→deferred] Accent dilution — ✅ RESOLVED 2026-07-16 (accent-contrast token pass: selected filter re-toned to inverted neutral bg-text/text-bg, requestId chip to text-subtle; DESIGN.md §1.1 accent-reservation sentence added)

- **What:** `components/admin/telemetry/EventFilters.tsx` selected level segment uses `bg-accent text-accent-text`; `EventRow.tsx` requestId chip uses `text-accent-on-bg`. The critique flags that spending the FXAV orange on a selected-filter toggle and an id-link dilutes "accent = this matters now" (live-refresh pulse + sparkline current-hour bar).
- **Why deferred:** BOTH are PRE-EXISTING project affordances, unchanged in intent by this redesign — accent-as-selected is the established admin filter pattern (level toggle carried `bg-accent` before the restyle; the requestId chip predates this work). Re-toning telemetry-only would fragment consistency with every other admin filter surface. The design mock does not override the pattern, and the critique is not authoritative vs the mock/spec (project rule). A deliberate re-tone is a cross-admin design decision, not a telemetry defect.
- **Trigger:** a project-wide "accent reservation" pass across all admin filters, or a DESIGN.md amendment on selected-state color.

### TEL-2 — [P2→deferred] Error vs Warn badge — ✅ RESOLVED 2026-07-16 (accent-contrast token pass: error badge on solid bg-status-degraded fill, 6.54:1 light / 4.70:1 dark)

- **What:** `components/admin/telemetry/EventLevelBadge.tsx` renders error + warn with the same `bg-warning-bg`, differing only by `font-semibold`. Under color-blind + glance, an error badge does not escalate above a warn on its own.
- **Why deferred:** `EventLevelBadge` is a SHARED component NOT restyled by this redesign (out of scope — the redesign touches the timeline/row layout, not the badge). Mitigated on the new surface: an error ROW now tints `bg-danger-bg` (EventRow), so the row-level escalation cue is present even though the badge is not distinct. A badge-fill change touches every telemetry consumer of the badge.
- **Trigger:** the next telemetry a11y pass, or any color-blind audit of EventLevelBadge.

### TEL-3 — [P3→accepted] EventRow height-disclosure animates a layout property

- **What:** `EventRow.tsx` expands via framer-motion `height: 0 → auto` (a layout-property animation), against the impeccable "transform/opacity only" motion rule.
- **Why accepted (not a defect):** this is the spec's single, deliberately-chosen disclosure animation (spec §9 transition inventory), reduced-motion-guarded to `duration: 0` via `useReducedMotion`, single-instance per expanded row. The grid-rows `1fr` transform alternative degrades content measurement for the CronRunSummaryCard/ContextDetail disclosure. No user-visible frame drop at this scale.
- **Trigger:** only if a future perf audit measures actual jank on low-end devices with many simultaneously-expanded rows.

## Admin field overrides — impeccable gate (2026-07-09)

Source: invariant-8 impeccable v3 dual-gate (critique + audit) on branch `feat/admin-field-overrides` for the P6 UI diff (Tasks 13–16). Full findings + dispositions in `docs/superpowers/plans/2026-07-07-admin-field-overrides/IMPECCABLE-REPORT.md`. Verdict: critique 25/40, audit 18/20, deterministic detector `[]` (0 new; the one `<img>` hit is a pre-existing/intentional diagrams-grid revert outside this diff), zero CRITICAL/P0. FIXED in-branch: sheet-value now a VISIBLE line + chip `aria-label` (was hover-only `title`); error `role="status"` → `role="alert"`; em dashes removed from all 5 rendered copy strings. The entries below are deferred/accepted.

### OVR-1 — [P1→deferred] Destructive Revert/Discard: no confirm, no undo, no danger styling

- **What:** `OverrideableField.tsx` Revert (active state) and Discard (stale state) fire on a single tap, share the neutral `BUTTON_CLASS`, and sit immediately beside Edit / Re-point. A mis-tap on the venue floor destroys an override (Revert) with no confirmation, undo, or visual danger cue.
- **Why deferred:** spec §7 defines Revert/Discard as single-op mutations and is **silent on any confirmation step**; PRODUCT.md explicitly bans multi-step modals ("no five-step modals") and the surface is phone-primary, so a modal confirm is the wrong instrument. Revert is **recoverable** (re-create the override on the same target — the RPC's reactivate-on-conflict path, §7.2 R28); Discard is valid ONLY on an already-inactive row (spec §7.2 — the live row already shows the parsed value, so "destroy" is low-stakes). A consistent destructive-action affordance is a cross-admin design decision, not an override-specific defect; the critique is not authoritative vs the spec/mock (project rule).
- **Trigger:** a project-wide "destructive admin action" confirmation/undo pass (would also cover Rescan, role changes, etc.), OR the first real report of an accidental override loss.

### OVR-2 — [P2→deferred] No post-save confirmation ("Saving…" / "Saved")

- **What:** `submit()` flips `mode` to `idle` on success with no transient "Saved" signal and no `Saving…` label on the Save button during `pending`.
- **Why deferred:** the save is optimistic and the surface **re-renders into the overridden state** — the "Overridden" chip + the new value + the visible `Sheet: "X"` line ARE the confirmation. A transient toast/label is a polish nicety, not a correctness gap; the disabled-while-pending state already prevents double-submit.
- **Trigger:** the next override-UI polish pass, or if usability testing shows Doug re-tapping Save uncertain it applied.

### OVR-3 — [P3→deferred] Nested card in ShowOverrideBlocks (hotel row)

- **What:** `ShowOverrideBlocks.tsx` renders each hotel reservation row as a `rounded-md border bg-bg` block inside the outer `rounded-md border bg-surface` Hotels block — a card-in-card.
- **Why deferred:** mild — the inner surface is differentiated by **background token** (`bg-bg` vs `bg-surface`), not a redundant border-in-border stack, and it mirrors the existing wizard hotel-row grouping. Not an AI-slop tell in isolation.
- **Trigger:** the next `ShowOverrideBlocks` layout pass, or a DESIGN.md ruling on nested-surface treatment.

### OVR-4 — [P3→deferred] Repoint-input aria-label exposes DB nomenclature

- **What:** the re-point input's `aria-label` names the internal "match key" concept rather than the user-facing "sheet value to match".
- **Why deferred:** screen-reader-only clarity nicety; the visible label + stale note already frame the action ("Re-point", "the sheet no longer has «X»"). No sighted-user impact.
- **Trigger:** the next crew/admin a11y sweep, or any SR audit of the override surface.

## Admin field overrides — orphaned-override block (R3 G2) impeccable gate (2026-07-09)

Source: invariant-8 impeccable v3 dual-gate on the NEW `OrphanedOverridesBlock` (Codex R3 G2 fix — the show page now renders overrides whose sheet target vanished, so the "Override paused" needs-attention deep-link lands on a real Re-point/Discard control instead of a dead end). Verdict: audit 19/20 (no P0/P1), critique AI-slop PASS (clean, 100% tokens, no bans) with two P1/HIGH. Both HIGH FIXED in-branch: (a) the block carries `id="paused-overrides"` and a target_missing card deep-links `#paused-overrides` (name_conflict stays inline, lands at top); (b) the orphan value cell renders Doug's actual override value (`override.overrideValue`) instead of the "—" no-data glyph, so he can decide Re-point vs Discard without recalling his correction. Deterministic detector `[]` (0 findings). The P2/P3 below are deferred.

### OVR-5 — [P2→deferred] Orphan-block controls share generic Re-point/Discard accessible names

- **What:** the reused `OverrideableField` paused branch renders "Re-point"/"Discard" with no field qualifier; a screen-reader user tabbing multiple orphan rows hears the pair repeated, and the visible `ORPHAN_FIELD_LABEL` span isn't linked via `aria-labelledby` (WCAG 2.4.6).
- **Why deferred:** an INHERITED pattern shared by every override surface (sibling crew/hotel blocks have the same shape), not introduced by G2; the per-row stale note carries the «matchKey» so context is partially conveyed. Fixing it belongs at the shared `OverrideableField` level across all surfaces, not in the orphan block alone.
- **Trigger:** a shared-`OverrideableField` a11y pass (would also close OVR-4). Backlog: `BL-OVERRIDE-CONTROL-ARIA-FIELD-QUALIFIER`.

### OVR-6 — [P2→deferred] Orphan block lacks attention salience + "Re-point" jargon

- **What:** the "Paused overrides" section is styled with the same calm neutral tokens (`border-border`/`bg-surface`) as the non-actionable Show-details/Hotels blocks, so nothing signals it needs action; and "Re-point" is jargon for a non-technical operator (no HelpAffordance).
- **Why deferred:** the durable needs-attention stream (nav badge + inbox card with `status="warn"`) already draws Doug to the item; this block is the deep-link TARGET, not the primary alert. A warn accent + plainer microcopy are enhancements, not correctness. Consistent with the calm inline-edit tone of the sibling override blocks.
- **Trigger:** `/impeccable polish` on the override surfaces, or a Doug-confusion report. Backlog: `BL-OVERRIDE-ORPHAN-SALIENCE`.

### OVR-7 — [P3→deferred] Section `aria-label` differs from visible heading; intro/per-row copy overlap

- **What:** the section `aria-label="Paused overrides needing attention"` doesn't match the visible `<h2>Paused overrides</h2>` (siblings keep them identical); and the section intro ("The sheet no longer has these targets…") restates the per-row paused note framing.
- **Why deferred:** both cosmetic — the aria-label is a valid (more descriptive) accessible name, not a WCAG failure; the mild copy overlap doesn't impede comprehension.
- **Trigger:** bundled with OVR-6 polish. Backlog: none (nicety).

## Flow 4 PR #2 — auto-applied strip + roster badge — invariant-8 impeccable dual-gate (2026-07-07)

Source: invariant-8 impeccable v3 dual-gate on branch `feat/flow4-auto-applied-strip`. Verdict: critique 33/40 Good, audit 18/20 Strong, deterministic detector `[]` (0 findings), anti-patterns PASS, zero CRITICAL/P0. FIXED in-branch: Undo-all confirm now focuses the safe "Keep changes" control on open (`keepChangesRef` + `useEffect`, mirrors `ReSyncButton.tsx:76-78`; WCAG 2.4.3 — a stray Enter can no longer fire the destructive bulk undo) — this closed the one HIGH/P1 finding; heading rank inversion (`<h2>` under Dashboard's `<h3>Needs attention</h3>` → `<h4>`, WCAG 1.3.1); long-summary overflow (`wrap-break-word` on the row summary span, prevents unbroken `crew_email_changed` emails overflowing the ~320px inbox column). The entries below are deferred.

### FLOW4-1 — [P1→deferred] No mobile parity for auto-applied disposition

- **What:** `RecentAutoAppliedStrip` mounts only inside `dashboard-inbox-desktop` (`Dashboard.tsx:704`, `hidden min-[720px]:flex`); the `<720px` branch (`:701`) renders only `NeedsAttentionSummaryCard` with no auto-applied count. The roster-shift `DataQualityBadge` IS visible on mobile via `ShowsTable`, so Doug on the venue floor sees the amber signal but has no path to review/count/Accept/Undo.
- **Why deferred:** Spec §8 scopes the strip's placement to the needs-attention inbox column, which is desktop-only by the EXISTING dashboard convention (the full `NeedsAttentionInbox` is already `<720px`-hidden; mobile gets the summary card for every needs-attention concern, not just this one). Dispositioning auto-applied diffs is inherently a desk task; the mobile badge is a deliberate awareness cue ("roster changed — review at desk"), and the strip's list self-heals on revalidate so nothing is lost. A mobile disposition surface is a net-new UI scope beyond this PR.
- **Trigger:** a real report of Doug needing to disposition auto-applies from his phone, OR a dashboard mobile-parity pass. Backlog: `BL-FLOW4-MOBILE-AUTOAPPLIED-PARITY`.

### FLOW4-2 — [P2→deferred] Badge detail is hover/SR-only for sighted touch/keyboard users

- **What:** `DataQualityBadge.tsx` exposes the roster/gap breakdown to AT via `role="img"` + `aria-label`, but sighted users reach the detail only through the `title` tooltip on a non-focusable `<span>` — invisible on touch (venue-floor phone) and keyboard.
- **Why deferred:** This is the PRE-EXISTING badge mechanism (data-gaps already used `title` + `aria-label` + the amber `TriangleAlert` before Flow 4). Task 7 folded roster-shift into that same established affordance; it did not introduce the hover-only pattern. Reworking the badge into a focusable/tap popover is a change to a shared, pre-existing component beyond this PR's spec.
- **Trigger:** a badge-affordance a11y pass across the shows table. Backlog: `BL-DATAQUALITY-BADGE-TOUCH-DETAIL`.

### FLOW4-3 — [P2→deferred] One amber glyph now conflates parse-gaps and roster-shift

- **What:** `DataQualityBadge` renders both data-gaps and roster-shift with the same amber `TriangleAlert`; a sighted glance can't distinguish "parse gaps" from "roster changed" (the `aria-label` DOES distinguish them for AT).
- **Why deferred:** The combined amber signal is intentional per spec §6.4 (both are "this show needs a glance" states sharing the data-quality badge). A distinct glyph/count-chip per segment is a visual-design decision on a shared component; the aria-label already carries the semantic split for AT. Not a defect, an enhancement.
- **Trigger:** a DESIGN.md decision to split data-quality signal types. Backlog: `BL-DATAQUALITY-BADGE-SEGMENT-GLYPH`.

### FLOW4-4 — [P2→deferred] Bulk Undo-all does not surface per-item typed failures

- **What:** `RecentAutoAppliedStrip.tsx` `confirmUndoAll` awaits `undoFromDashboardAction` per id and discards each result, closing the confirm panel regardless. Per-row Undo surfaces `<ErrorExplainer>` on `{ok:false}`; the bulk loop does not, so a partial failure (e.g. `UNDO_SUPERSEDED`) gives no explicit message.
- **Why deferred:** Softened by self-healing — the strip revalidates after the loop, so any row that failed to undo REMAINS visible (it isn't removed), giving Doug implicit "that one didn't go" feedback. It is NOT an invariant-5 leak (no raw code shown). Undo failures on freshly-auto-applied roster rows are rare. Surfacing an aggregate bulk-error banner is a real improvement but net-new UI.
- **Trigger:** the next auto-applied-strip robustness pass, or a real partial-undo confusion report. Backlog: `BL-FLOW4-BULK-UNDO-ERROR-SURFACE`.

### FLOW4-5 — [P2→deferred] Destructive confirm-go not visually differentiated from cancel

- **What:** In the Undo-all confirm, "Keep changes" (`bg-bg`) and "Undo all N" (`bg-surface`) are near-identical neutral buttons; mis-tap risk on a phone.
- **Why deferred:** The primary accidental-activation vector (keyboard Enter on open) is already closed by the focus-on-safe fix shipped in this PR. Visual danger-styling of the destructive control is polish; the confirm step + safe-focus already gate the action. A danger token treatment is a small design decision deferrable to the next polish pass.
- **Trigger:** `/impeccable polish` on the strip, or a mis-tap report. Backlog: `BL-FLOW4-CONFIRM-DANGER-STYLE`.

### FLOW4-6 — [P3→deferred] Focus falls to body after bulk undo completes

- **What:** `confirmUndoAll` unmounts the confirm panel while focus may sit on the confirm-go button → focus drops to `<body>` (WCAG 2.4.3, soft).
- **Why deferred:** Soft — the strip revalidates and re-renders after the loop, so focus context changes anyway. Cheap to address alongside FLOW4-5 in a polish pass.
- **Trigger:** bundled with FLOW4-5. Backlog: `BL-FLOW4-CONFIRM-DANGER-STYLE`.

### FLOW4-7 — [P3→deferred] Section carries both aria-label and a matching heading

- **What:** The strip `<section>` has `aria-label="Recently auto-applied changes"` AND a matching `<h4>`; `aria-labelledby` the heading would avoid the duplication.
- **Why deferred:** Harmless (aria-label wins for the section's accessible name; the heading still contributes to the outline). Trivial nicety, not a defect.
- **Trigger:** bundled with any future strip edit. Backlog: none (nicety).

### AUTOAPPLIED-REDESIGN-1 — [P3→deferred] Real-browser width-distribution assertion for the card button grid

- **What:** The redesigned auto-applied change card lays Accept/Undo out in a CSS grid (`grid-cols-2` = two `1fr` cells, or `grid-cols-1`) with `w-full` buttons. Spec §6 called for a real-browser Playwright assertion that each button ≈ half (undoable) / full (single) card width.
- **Why deferred:** The half/full split here comes from CSS-grid `1fr` column semantics + `w-full`, NOT the fragile flex-`items-stretch` gotcha the real-browser rule targets — `1fr 1fr` splits equally by spec regardless of content. The MECHANISM is pinned in jsdom (`RecentAutoAppliedStrip.test.tsx`: grid template `grid-cols-2`/`grid-cols-1` + `w-full` on the stretched buttons, plus the button-level `stretch` w-full tests). A standalone esbuild+Playwright harness for pixel-width distribution is disproportionate for a grid whose distribution is a CSS invariant. Pill background emission (the genuine dynamic-class risk) is verified at build + in the impeccable real-browser pass, not deferred.
- **Trigger:** the next auto-applied-strip e2e pass, or any change that moves the button layout off CSS-grid `1fr`. Backlog: `BL-AUTOAPPLIED-CARD-LAYOUT-E2E`.

### AUTOAPPLIED-REDESIGN-2 — [P2→deferred] Singleton group renders card-in-card

- **What:** A per-show group with exactly one change renders the full group-card wrapper (border + header) around a single inner change-card — card-in-card for one row reads slightly heavy (impeccable critique P2).
- **Why deferred:** The nested card is justified for multi-row groups (per-change pill+diff+buttons genuinely group), and the header (show name + count + Accept-all/Undo-all) is load-bearing even for one row. Flattening only the singleton case adds a render branch + a divergent layout for marginal gain. Matches the approved mock (which shows a single-row group as a full card).
- **Trigger:** next auto-applied-strip polish pass. Backlog: `BL-AUTOAPPLIED-SINGLETON-FLATTEN`.

### AUTOAPPLIED-REDESIGN-3 — [P2→deferred] Generic field_changed summary ("A field changed on this sync")

- **What:** `field_changed` / `crew_email_changed` rows render the stored summary sentence, which is generic ("A field changed on this sync") — Doug accepts without seeing which field (impeccable critique P2).
- **Why deferred:** The summary text is produced at write time (`writeAutoApplyChanges.ts`) and is out of this redesign's read-only scope; naming the field requires storing structured field before/after — the same DB write-path arc this redesign explicitly excluded (spec §1 out-of-scope). Not a regression: the prior flat-row design showed the same generic summary.
- **Trigger:** the field-level From→To DB arc (spec §1 "Full fidelity" option), if pursued. Backlog: `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF`.

## Structural-transform use-raw — whole-diff R4 deferral (2026-07-15)

### USE-RAW-1 — [P2→deferred] Wizard callout renders the use-raw toggle only for the first 3 recoverable warnings per section

- **What:** The Step-3 wizard `SectionFlagCallout` (`components/admin/wizard/step3ReviewSections.tsx:519`) caps its rendered entries at `CALLOUT_MAX_ENTRIES = 3` per section; the use-raw toggle is rendered inside that capped `shown` set. For a section with >3 recoverable warnings (realistically only `ROOM_HEADER_SPLIT_AMBIGUOUS` in a room-heavy show — `HOTEL_GUEST_SPLIT_AMBIGUOUS` rarely exceeds 3, `DATE_ORDER_SUGGESTS_DMY` is at most 1), warnings 4+ collapse to a "+N more in Parse warnings" link and get no toggle in the wizard.
- **Why deferred:** (1) Spec-conformant: the spec (`docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md:30,236`) scopes the wizard control to "add the control inline per entry" in the callout (`:494-547`) and requires it on both surfaces — both satisfied; it does NOT mandate uncapping or a second render site. The `CALLOUT_MAX_ENTRIES=3` cap is **pre-existing** §E3 ambiguity-warnings callout behavior, not introduced here (invariant 7, spec canonical). (2) No correctness/data loss: the decision is **reachable post-publish** on the per-show live page, which renders the toggle for every active recoverable warning uncapped (`app/admin/show/[slug]/page.tsx:971-994` via `PerShowActionableWarnings`). Warnings are content-pinned by `(code, contentHash)`, so the same ambiguous cells re-parse to the same warnings post-publish and the toggle is available there. (3) The transform (parsed) value is the correct default in the common case; use-raw is the escape hatch — the compound case (4th+ ambiguous room AND the transform also guessed wrong) is rare. (4) Closing the gap is net-new UI (thread `useRawDecisions`/`wizardSessionId` into the uncapped `WarningsBreakdown` at `:2374` for live-page parity, resolving the summary-vs-detail redundancy design question) → requires the invariant-8 impeccable dual-gate + new Playwright/component tests; doing it mid-autonomous-ship would silently expand ratified scope.
- **Trigger:** a room-heavy onboarding show where >3 ambiguous room headers need pre-publish raw-reversal, or a Doug report of "can't fix room 4 in the wizard." Backlog: `BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE`.

## Auto-applied collapsible groups — impeccable dual-gate (2026-07-15)

Dual-gate on `git diff main -- components/admin/RecentAutoAppliedStrip.tsx` (collapse-by-default groups + bulk actions moved under the show name). Critique + audit both returned **no P0/P1**. Audit P2 #1 (heading-outline inversion h4→h3) and P2 #2 (focus-ring convention) were **fixed in-diff** (group heading is now `<h5>`; the toggle's `ring-inset` carries a documented full-bleed-bar carve-out). Two P2s deferred below.

### AUTOAPPLIED-COLLAPSE-1 — [P2→deferred] Collapsed group header hides change kind

- **What:** With groups collapsed by default, the header shows only showName + a bare count badge; the change kind (incl. a destructive "Removed") is not visible until the operator expands the group (impeccable critique P2).
- **Why deferred:** Collapsed-by-default on the dashboard is an **explicit user directive** (2026-07-15: "make each show collapsible and collapsed by default (on admin dashboard)"). Surfacing a per-kind severity hint in the collapsed header (e.g. a small removed/renamed dot cluster) is a net-new affordance beyond the requested change and would need its own impeccable pass + tests. Not a regression: the disposition surface (Accept-all / per-row kind+diff) is one click away and fully intact on expand; the count badge already signals "N pending here."
- **Trigger:** a Doug report of missing a destructive auto-apply behind a collapsed header, OR a dashboard triage-density pass. Backlog: `BL-AUTOAPPLIED-COLLAPSED-KIND-HINT`.

### AUTOAPPLIED-COLLAPSE-2 — [P2→deferred] Panel mounts/unmounts instantly (chevron animates, content does not)

- **What:** The disclosure chevron rotates over `duration-fast`, but the panel is a mount/unmount (`{open ? … : null}`) with no height-morph, so the reveal is instant while the chevron implies a smooth expand (impeccable critique P2). DESIGN.md lists "accordion expand" at `duration-normal`.
- **Why deferred:** This is the **established system idiom** — the sibling `components/admin/IgnoredSheetsDisclosure.tsx` (and `AddAdminDisclosure`) use the identical instant mount/unmount. Animating only this one accordion would diverge from the pattern; a height-morph is a system-wide call, not a per-component one. Consistent-with-sibling, not a regression.
- **Trigger:** a deliberate cross-cutting "animate the disclosure family" pass adopting the `globals.css` height-morph pattern for every accordion at once. Backlog: `BL-DISCLOSURE-FAMILY-HEIGHT-MORPH`.

## Extend role-scope vocabulary — impeccable dual-gate (2026-07-16)

Dual-gate on the Task 13 UI diff (`RoleRecognizeControl` + boundary + `/admin/settings/roles`; commit `143e678df`). Critique 35/40, audit 18/20, deterministic detector clean, AI-slop verdict clean on both assessments. Two P1s (settings-row silent failure branches) and two P2s (live regions, focus management) were **fixed in-diff** in the follow-up commit; one P2 deferred below.

### ROLE-VOCAB-1 — [P2→deferred] Settings "Roles you've added" renders the stacked mobile card at every viewport (mock's one-line desktop grid dropped)

- **What:** The mock (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html`, "Desktop width" section) shows a compact one-line grid row (`150px | chips | meta | actions`, short "Edit" label) at ≥760px; the implementation renders the stacked mobile card at every width (page capped `max-w-2xl`), a density regression for Doug's desk context (impeccable critique P2). The unused `EDIT_LABEL_SHORT` constant was deleted per the flag-lifecycle rule.
- **Why deferred:** The stacked card is fully functional and consistent at all widths; the list is expected to hold a handful of rows (novel role tokens are rare — one per unrecognized word ever seen), so desk-context scanning cost is small. The desktop grid variant is net-new responsive layout requiring its own component branch, tests, and a re-run of the dual-gate — mid-autonomous-ship scope expansion for a cosmetic density gain.
- **Trigger:** the mappings list growing past ~8 rows in real use, or a Doug report that the settings page feels sparse/scrolly at the desk. Backlog: `BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID`.

## Extend role-scope vocabulary — whole-diff R1 deferral (2026-07-16)

### ROLE-VOCAB-2 — ✅ RESOLVED (2026-07-16, `feat/role-vocab-staging-overlay`) — [P1→ratified+deferred] Wizard rescan does not run the role-mapping overlay; staged saves always resolve apply_pending

**Resolution (2026-07-16):** the staging pipeline now runs the overlay at the `prepareOnboardingFiles` chokepoint (spec `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md`): step 3 previews post-overlay state, the staged `"applied"` branch is reachable, and every `published=false→true` transition is gated on the consumed-token stamp (`role_mappings_stamp_satisfied`, refusal code `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`). The parent spec §8.3 amendment is superseded in place.

- **What:** `mapRoleTokenStaged` saves the mapping and re-scans the wizard sheet, but the staging pipeline parses without the role-mapping overlay (only `runPhase2` at apply/publish runs it), so the refreshed staged parse still carries the `UNKNOWN_ROLE_TOKEN` warning and the action's `"applied"` branch is unreachable in v1 — every wizard save resolves `"apply_pending"` (whole-diff R1 F1). The saved-card copy is truthful ("saved and applies to every show… catch up on its next sheet check") and the control can reappear idle after a wizard refresh; a re-save resolves through the idempotent set-equal path.
- **Why deferred:** No capability or data loss: the staged-apply/finalize path threads `roleTokenMappings` into `phase2`, so the mapping applies at publish (integration-tested). Wiring the overlay into the staging/rescan core is a staging-pipeline change (parse-write parity with use-raw's decision-display mechanism, step-3 preview semantics, re-stage tests) — net-new scope mid-close-out. Ratified as a spec amendment (spec §8.3, 2026-07-16) so the contract and the code agree.
- **Trigger:** Doug reporting wizard confusion ("I recognized the role but the warning is still there"), or the next onboarding-wizard milestone touching the staging core. Backlog: `BL-ROLE-VOCAB-STAGING-OVERLAY`.

## Wizard use-raw full-list controls — impeccable dual-gate (2026-07-16)

Dual-gate on the `feat/use-raw-wizard-full-list` diff (`components/admin/wizard/step3ReviewSections.tsx`; spec `docs/superpowers/specs/2026-07-16-use-raw-wizard-full-list-toggle.md`). Critique 27/40 (dual-agent), audit 19/20; deterministic detector clean — the single `broken-image` hit is a false positive on JSDoc comment text, pre-existing. One P1 and two P2s deferred below; no P0.

### USE-RAW-FULL-LIST-1 — [P1→ratified+deferred] Callout + list both render live controls; role-control siblings can diverge until navigation

- **What:** A warning in the first 3 of its section's callout now has two live control instances (callout preview + complete list). Use-raw converges via `router.refresh()` on every save; the recognize-role control deliberately performs no client refresh (2026-07-15 §8.1 timing contract), so recognizing a role via one instance leaves the sibling in create mode until navigation — Doug could re-submit from the sibling (impeccable critique P1).
- **Why deferred:** This is the **ratified spec contract**, not an oversight: keep-both was the user-approved resolved decision (spec §2.1, 2026-07-16) and §4.6 ratifies the stale-sibling class as accepted — it is pre-existing (per-occurrence `UNKNOWN_ROLE_TOKEN` emission already mounts duplicate live create controls for one token today), and the stale-sibling save resolves deterministically via the action's EXISTING-ROW-first branch: set-equal grants → idempotent success, different grants → benign conflict notice, never a raw code (pinned by the new sibling test in `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`). No data corruption is possible; the cost is momentary confusion, bounded by the §8.1 contract this diff deliberately does not alter.
- **Trigger:** a Doug report of double-recognizing roles from the two sites, or a future decision to demote the callout to a pure preview (title + jump only) — which would revisit the ratified keep-both decision. Backlog: `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`.

### USE-RAW-FULL-LIST-2 — [P2→deferred] Duplicate testids/aria labels across the two render sites

- **What:** Both instances of a flagged warning's controls emit the same `data-testid` values (`use-raw-control`, `role-recognize-control`, toggle ids) and identical radiogroup `aria-label`s, so screen-reader users hear the same group twice per warning with no disambiguation, and unscoped `getByTestId` queries would multi-match (impeccable critique P2).
- **Why deferred:** The fix lives inside the shared `UseRawControl` / `RoleRecognizeControl` components (site-scoped testids, warning-title-qualified aria-labels) — blast radius across the live page and every existing control test, well beyond this diff. All in-repo queries are container-scoped, so no test breakage exists today.
- **Trigger:** the next accessibility pass over the wizard modal, or any diff already touching the shared controls. Backlog: `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`.

### USE-RAW-FULL-LIST-3 — [P2→noted] "These are informational and don't block publishing" now headlines consequential controls

- **What:** The §3.10-pinned non-blocking line sits above rows that can now grant financial access (recognize-role) or rewrite crew-visible values (use-raw) (impeccable critique P2).
- **Why deferred:** The line remains factually true — warnings never block publishing, and the controls are optional refinements, not required actions. Copy is §3.10-pinned; qualifying it is a copy-pass decision, not a this-diff fix.
- **Trigger:** the next wizard copy pass. Backlog: `BL-WIZARD-WARNINGS-COPY-QUALIFIER`.

## Accent-contrast token pass — impeccable dual-gate (2026-07-16)

Dual-gate on the `feat/accent-contrast-token-pass` diff. Critique 37/40 (dual-agent), AI-slop NO, deterministic detector CLEAN after false-positive triage (3 JSDoc `<img>` comment mentions), zero P0/P1. One P2 fixed in-diff (DESIGN.md §1.3 sentence bringing the telemetry error badge into the degraded-red scope); one P2 deferred below; P3s accepted (link hover deletion matches the ratified /help precedent; eyebrow hierarchy still distinct at 6.09:1 vs 16:1+).

### ACCENT-PASS-1 — [P2→deferred] RightNowHero active show-day segment muted to accent-on-bg in light mode

- **What:** the hero's active progress segment changed `bg-accent` → `bg-accent-on-bg` (`#a65000`) so the `role="img"` show-day indicator clears WCAG 1.4.11 (3:1 vs bg AND vs the inactive `bg-border` segments; raw `#ff8c1a` measured 1.46:1 vs inactive / 2.23:1 vs bg). Critique P2: this is the one surface PRODUCT.md reserves for expressive orange, and the sunlit crew glance loses brand vibrancy.
- **Why deferred:** the darkened fill is the spec-ratified treatment (spec §4.1b class B4, adversarially mandated — the segment is load-bearing visual information, not decorative), pinned by class assertion + the bg-accent inventory registry. The critique's alternative (keep `#ff8c1a` active + get the 3:1 delta from lighter inactive segments or a hairline outline) is a real design option but needs its own contrast math for the inactive-vs-bg pair on a 6px-tall pill, a registry/treatment change, and a crew-page brand judgment — a deliberate crew-hero design pass, not a token-pass fix.
- **Trigger:** a crew-page brand/vibrancy pass, or Doug/crew feedback that the show-day bar reads dull. Backlog: `BL-HERO-SEGMENT-VIBRANCY`.
