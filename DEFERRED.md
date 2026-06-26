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

Source: invariant-8 impeccable v3 dual-gate (critique + audit) on branch `feat/help-prose-typography` (the P0 typography fix from the help-center readability audit, `docs/help-readability-audit-2026-06-22.md`). Gate verdict: critique PASS (no P0/P1), audit PASS-WITH-MINOR (no P0/P1), deterministic detector `[]`. One audit P3 deferred here; the system-wide audit P2 is filed as `BL-ACCENT-ON-BG-AA-CONTRAST` in BACKLOG.md. Both the audit P2 (body-link contrast) and P3 (callout-link contrast on tinted fills) were resolved IN this PR across two Codex adversarial-review rounds: prose links inherit the high-contrast body/box text color + underline in EVERY state (no sub-AA accent at rest OR on :hover — round 2 caught the hover regression; WCAG 1.4.3 is not waived for hover text), so they clear AA everywhere. Hover feedback is the cursor + the always-present underline.

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
  A height-equality real-browser test against any of these would assert that Tailwind's own `flex-wrap`/`items-center` work, not anything this feature's code is at risk of breaking — i.e. a contrived test that does not match the real (absent) risk.
- **What shipped instead:** a jsdom structural assertion (`tests/components/admin/dataGapsChipRowLayout.test.tsx`) pinning the actual class-of-bug for the chip row: the chip is a sibling rendered BEFORE the Publish action (not nested), and the bar keeps `items-center` (the v4 vertical-center guard) + `flex-wrap` (the 390px no-overflow guard). These are DOM-structure / className facts jsdom verifies exactly; none depends on a fixed parent dimension.
- **Trigger:** if any data-gap surface is ever refactored to live inside a fixed-height/width parent (e.g. a fixed-height toolbar row, an `h-N` chip rail, or a grid track with an explicit row height) whose children are expected to stretch to fill it, add the real-browser `getBoundingClientRect()` height-equality assertion at that point.
