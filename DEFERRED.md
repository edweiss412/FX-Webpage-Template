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

### D9 — [P2] per-show-panel has no staged-review-card screenshot

- **What:** the per-show-panel audit (Chunk 3) flagged the staged-review card as the highest-stakes element on the page with no Screenshot to anchor it visually. Chunk 6 added the daily-rhythm dashboard screenshot (reusing the existing `dashboard-overview` baseline) but did NOT add a staged-review-card shot.
- **Why deferred:** unlike daily-rhythm (which reuses an existing baseline), a staged-review-card shot needs a NEW byte-stable baseline, and **no seed fixture renders a staged-review card** — the screenshot pipeline's only fixture (`RPAS_CENTRAL_2026`, `scripts/help-screenshots.manifest.ts`) has 0 pending rows (manifest comment). Capturing it requires (a) a new seed scenario: a live show with a `pending_syncs` staged parse so the per-show panel renders the card; (b) a manifest entry (route = the per-show panel, `captureSelector = [data-testid=staged-review-card]`); (c) an amd64 regen via `screenshots-regen.yml` (`workflow_dispatch`) so the bytes match the pinned `playwright:v1.59.1-jammy` capture env (per the byte-comparison-gate discipline). That is seed-fixture engineering for one visual aid, well beyond a screenshot-add. The page reads fine without it (the staged-review-card section already describes the eyebrow / heading / diff / Apply-Discard in prose; Chunk 3 turned that into a scannable list).
- **Trigger:** a dedicated screenshot pass that builds a staged-show seed fixture (or when the seed gains one for another reason), OR operator feedback that the staged-review card is hard to recognize. Then add the manifest entry + `<Screenshot name="staged-review-card" />` near per-show-panel's `#staged-review-card` heading and run `screenshots-regen.yml`.
