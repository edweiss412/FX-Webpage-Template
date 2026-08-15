# Step 3 review-screen tap cluster: bleed direction, grid stretch, contact chips

**Date:** 2026-08-15 · **Authoring branch:** `docs/step3-tap-cluster-spec` · **Implementation branch:** `fix/step3-tap-cluster`
**Closes:** `BL-TAP-TITLE-LINK-META-LINE-BLEED` + `BL-TRANSPORT-CELL-STRETCH-AFTER-TAP-FLOOR` + `BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING` (all BACKLOG.md)
**Class:** accessibility / layout (admin UI, invariant 8 applies) · **Effort:** S

All three entries are fallout of the 2026-08-10 tap-target repairs on the wizard step-3 review surface (`docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md`), filed by that arc's own invariant-8 impeccable gate.

## 1.1 Resolved scope — do not relitigate

1. **All three decisions were ratified by Eric on 2026-08-15** against a rendered mockup (design reference committed beside this spec: `docs/superpowers/specs/2026-08-15-step3-tap-decisions-mock.html`; capture of record: the G5 scope brief). Do not re-ask them; do not reclassify:
   - **Q1 — title-link bleed: Option A, one-directional bleed UPWARD.** The whole 44.8px hit box moves inside the card's own 20px `--spacing-tile-pad`, off the meta line entirely.
   - **Q2 — transport grid: Option A, short cells stay short (`items-start`), PLUS compact the contact-cell content** (Eric's addition): tighten internal gaps/padding so tall Driver/Load-out cells shrink toward their floor. **The 44px tap floors on `tel:`/`mailto:` are inviolable; compactness comes from dead space, never from the floors.**
   - **Q3 — contact links: Option A, full-width visible chip rows** — visible edges, wider phone-to-email separation, name grouped with its contact methods, and an at-rest tappable affordance. This settles the folded P3 hover-only finding for sites 6/7.
2. **RATIFIED AMENDMENT (site 5 vertical recipe).** §2.1 below AMENDS `docs/superpowers/specs/2026-08-10-tap-target-inline-controls.md` §2's ratified site-5 recipe ("**Exactly** `inline-block -my-2.5 py-2.5 -mx-2 px-2` … one recipe, no delegated choice") on the VERTICAL axis only, under the 2026-08-15 grant. Horizontal `-mx-2 px-2` is unchanged. The 2026-08-10 spec gains a dated amendment pointer (§2.1 step 3) so neither document relitigates the other.
3. **The 2026-08-10 spec's 3-exempt/5-chrome classification stands.** No site is reclassified; the exempt-site source guard (`tests/a11y/tapTargetInlineExemptions.test.ts`) pins files this arc does not touch and is not edited.
4. **Site 4 of the folded P3 is NOT in the contact cell** — it is the pack-list overflow toggle (`components/admin/wizard/step3ReviewSections.tsx`, the `<button>` under the site-4 comment near `step3ReviewSections.tsx:2594`). Disposition ratified by the grant's stated latitude: the chip treatment's SHAPE (an at-rest affordance) applies trivially there as the codebase's at-rest-underline idiom, so it is repaired in the same sweep (§2.4) rather than filed as a class-sweep exception.
5. **The arc's own e2e suite (`tests/e2e/tap-target-inline-controls.layout.spec.ts`) updates deliberately** — assertions are extended or amended alongside the change, never deleted, and never left asserting the superseded recipe.
6. **Impeccable dual gate owed** on the implementation diff (admin UI under invariant 8); pre-code mechanical UI gate applies (44px floors, canonical token classes, no em-dash copy — this arc adds NO new user-visible copy strings).
7. **Fully autonomous; both user review gates WAIVED** (user autonomy grant 2026-08-15). Stop only for a genuinely new question.

## 2. The three changes (normative)

Every code claim below was grep-verified 2026-08-15 in the pre-draft citation pass (worktree at `origin/main` = `33c70ba1f`). Anchors are file + symbol; line numbers are drafting-time locators.

### 2.1 Title-link bleed direction (amends 2026-08-10 site 5)

`SheetTitleLink` (`components/admin/wizard/Step3SheetCard.tsx:144`) is ONE shared component whose single class string (`Step3SheetCard.tsx:168`) serves all three render sites (`Step3SheetCard.tsx:434` summary, `Step3SheetCard.tsx:456` no-details, `Step3SheetCard.tsx:665` finalize-demoted). Both filed overlap contexts — the meta line (`mt-0.5`, `Step3SheetCard.tsx:539`) and the no-details warning line (`mt-1`, `Step3SheetCard.tsx:457`) — sit under that one string, so ONE edit repairs both.

1. **Class edit.** In the class string at `Step3SheetCard.tsx:168`, replace the symmetric vertical pair `-my-2.5 … py-2.5` with the upward pair `-mt-5 … pt-5` (no bottom padding, no bottom negative margin — both default to 0). Everything else in the string (including `-mx-2 px-2`) is unchanged. Normative result:

   ```
   wrap-break-word inline-block -mt-5 -mx-2 px-2 pt-5 text-base font-semibold text-text-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface
   ```

   (Utility ORDER inside the string is the formatter's/linter's call; the utility SET is normative.)

2. **Arithmetic, verified against the live line box.** A one-line `text-base` title is a 24.8px line box (`--text-base: 1rem` at line-height 1.55, `app/globals.css:151-152`); `pt-5` (20px) yields the same 44.8px total the shipped recipe measures (the e2e suite's site-5 floor read), with ALL 20px of bleed above the text and the box bottom flush with the text-line bottom. `-mt-5` cancels the growth in flow, so nothing moves visually. The 20px upward bleed fits the card's `p-tile-pad` (20px, `--spacing-tile-pad`, `app/globals.css:219`) EXACTLY: the title is the first content in each card variant, so the box top lands on or below the card's inner padding edge (exactly on it whenever the title column is its row's tallest item; the `items-center` variants can only push it DOWN) and the box always stays inside the card. The meta line (2px below the text bottom) and the no-details warning line (4px below) are now fully outside the hit box. Two-line titles exceed the floor on their own; the bleed rides above them and the flush bottom edge is unchanged.
3. **Comment + amendment pointer.** The load-bearing comment above the string (`Step3SheetCard.tsx:161-167`) currently ARGUES for the symmetric form ("text centred by construction") — rewrite it to state the upward-bleed form and cite this spec. Add one dated line to the 2026-08-10 spec's §2 site-5 row: "Amended 2026-08-15: the vertical recipe is now one-directional upward (`-mt-5 pt-5`); see `docs/superpowers/specs/2026-08-15-step3-tap-cluster.md` §2.1. Horizontal `-mx-2 px-2` unchanged."

**Trade recorded:** the text is no longer vertically centered in its own hit box (it sits at the bottom). That is the ratified point of the change: below-the-text taps belong to the meta line, above-the-text taps land in card padding that was previously dead.

### 2.2 Transport grid: `items-start` + contact-cell compaction

1. **Grid.** The cell grid `grid grid-cols-2 gap-2 min-[560px]:grid-cols-3` (`step3ReviewSections.tsx:1461`, inside `TransportBody`) gains `items-start`, so a short cell (Vehicle, Parking) keeps its content height instead of stretching to the tallest row-mate. This is live at BOTH column counts (2-up below 560px, 3-up at ≥560px).
2. **Compaction (shared `TransportCell`, `step3ReviewSections.tsx:1378-1387`).** Wrapper `px-3 py-2.5` → `px-3 py-2`; wrapper `gap-1.5` → `gap-1`; inner body `gap-1.5` → `gap-1`. This tightens EVERY transport cell (Vehicle/Parking shrink too — desired under `items-start`). `TransportCell` renders only in the transport grid (`step3ReviewSections.tsx:1402`, `step3ReviewSections.tsx:1479`, `step3ReviewSections.tsx:1496`), so no other surface moves.
3. **Dead-space budget (the executable compaction contract).** With the ratified strings, a Driver/Load-out cell's non-content vertical space is exactly `py-2` (16px) + eyebrow-to-body gap (4px) + name-to-phone gap (4px) + phone-to-email gap (10px, §2.3) = **34px**. The e2e assertion pins: cell height ≤ (eyebrow + name + tel + mailto rect heights) + 34px + 1px tolerance. A future gap/padding regression fails this by name; the floors themselves are untouched, so the bound can never be met by shrinking a target.

### 2.3 Contact links become full-width visible chip rows (sites 6/7)

The `tel:` link (the `<a href={`tel:…`}>` in `ContactCell`, `step3ReviewSections.tsx:1410-1419`) and `mailto:` link (`step3ReviewSections.tsx:1421-1429`) each become a full-width chip row inside the cell. Normative class strings (utility set normative, order the linter's):

- `tel:` — `flex w-full min-h-tap-min items-center justify-center gap-1 rounded-sm border border-border bg-surface px-2 text-[11px] tabular-nums text-text-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken`
- `mailto:` — same, minus `tabular-nums`, plus `mt-1.5 min-w-0` (the inner `wrap-break-word` span at `step3ReviewSections.tsx:1428` stays).

Design rationale, within DESIGN.md tokens:

- **Visible edges at rest:** `border border-border` + `bg-surface` on the cell's `bg-surface-sunken` ground — the surface-on-sunken chip is the house pattern inverted to this ground; `rounded-sm` is DESIGN.md's radius for "buttons, badges, inline pills, small chips" (`DESIGN.md:274`). The chip container IS the at-rest affordance, which settles the folded P3 for sites 6/7 (`PRODUCT.md:59`'s floor context: phones cannot hover). `hover:text-text` stays as an enhancement, no longer the sole affordance.
- **Focus ring:** the current strings carry no `focus-visible` treatment; since the strings are being rewritten anyway, they take the house ring (offset color matches the sunken ground). Pre-existing-gap repair, zero layout effect.
- **Separation:** phone-to-email becomes 10px (body `gap-1` 4px + `mt-1.5` 6px) with two visible edges between the targets; name-to-phone tightens to 4px, restoring the grouping (name with its contact methods) that the taller boxes inverted.
- **Guard conditions (all fields nullable, `step3ReviewSections.tsx:1403-1430` `hasContent` guards unchanged):** name+phone+email → gaps 4/10; phone absent → name-to-email gap is 10px (4+6, slightly looser — accepted, the email chip's `mt-1.5` is unconditional); email absent → name-to-phone 4px, no trailing gap; email present without phone (name present or not) → the email chip keeps its unconditional 6px top margin, so it does NOT sit flush at the top of its slot (§7 limit 4). No combination renders an empty chip.
- **No copy change, no aria change:** link text stays the raw phone/email; existing glyphs (`Phone`/`Mail` icons, `step3ReviewSections.tsx:1417`/`step3ReviewSections.tsx:1427`) stay.

### 2.4 Site 4 at-rest affordance (folded P3, repaired in the same sweep)

The pack-list overflow toggle (`step3ReviewSections.tsx:2594-2606`) is the P3's third hover-only site. The chip CONTAINER does not fit a text toggle in a list tail, but the shape — an at-rest affordance — is the codebase's at-rest-underline idiom, already carried by every sibling text toggle (`step3ReviewSections.tsx:1946` "Show all N times", `step3ReviewSections.tsx:3093`, and the warnings-callout jump links at `step3ReviewSections.tsx:674`/`step3ReviewSections.tsx:691`). One-utility repair on the `step3ReviewSections.tsx:2603` string: `hover:underline` → `underline` (at-rest), keeping `underline-offset-2` and `hover:text-text`. This site's floor/shrink-wrap/disjoint e2e assertions are untouched by it.

## 3. Dimensional Invariants

Real-browser `getBoundingClientRect()` contracts, all in the arc's existing e2e suite (extended, §6). Tailwind v4 does not default `.flex` to stretch; every relationship below is carried by an explicit utility named in §2.

1. **Site-5 floor holds:** title-link box height ≥ `--spacing-tap-min` (44px, `app/globals.css:203`) at 390px and wide (44.8px at one line). Carried by `pt-5` over the 24.8px line box.
2. **Upward-only bleed:** the title-link rect is DISJOINT from the text line beneath it — asserted on TWO seedable render sites: the demoted card's meta line (via the `-client` segment rect) and the no-details card's warning line (`mt-1`, `Step3SheetCard.tsx:457`). Box bottom is flush with the text bottom, carried by zero bottom padding. New assertions; both fail against the shipped symmetric recipe (~8px and ~6px).
3. **Bleed containment:** the title-link rect stays inside its card's rect (carried by `-mt-5` = `p-tile-pad`: the 20px bleed is fully absorbed by the card's own padding).
4. **Interactive disjointness (site 5) stands** at 390px and wide (existing assertions, unchanged semantics).
5. **Short cells stay short:** with a single-line Vehicle cell seeded beside a phone+email Driver cell, `vehicleCell.height < driverCell.height` — carried by `items-start` on the grid (without it, grid items stretch and the two are equal).
6. **Contact-cell dead-space budget:** `driverCell.height ≤ eyebrow.height + name.height + tel.height + mailto.height + 34 + 1` (§2.2.3).
7. **Chip geometry (sites 6/7):** each chip's height ≥ the 44px floor (existing); the two chip rects disjoint (existing) with vertical clearance `mailto.top − tel.bottom ≥ 9.5px` (new; carried by `gap-1` + `mt-1.5`); each chip spans its flex container's content width within 1px (new; carried by `w-full` — the exact opposite of the shrink-wrap contract sites 4/8 keep).
8. **Chip visible edge, asserted PER CHIP:** EACH of the `tel:` and `mailto:` chips has computed `background-color` differing from the cell's and computed `border-top-width` of 1px (new; carried by `bg-surface border border-border` — an asymmetric regression that leaves one chip invisible fails by name).

## 4. Transition Inventory

**No animations anywhere in this diff; every treatment below is explicitly instant.** The components' state machines (React state) are untouched (`showAll` toggle at `step3ReviewSections.tsx:2596` keeps its ratified instant treatment, comment at `step3ReviewSections.tsx:2593`). Each touched control has the same three pseudo-states (rest, hover, focus-visible); every pair on every site — rest↔hover, rest↔focus-visible, hover↔focus-visible, and the hover+focus-visible compound (the union of that site's hover and focus treatments) — is a static class-only swap: **instant, no animation needed**, and no `transition-*` utility is added or removed by this diff. What this diff CHANGES per site, state by state:

| site | render delta by state |
| --- | --- |
| 5 (title link) | geometry only (`-mt-5 pt-5`): identical in all three states; its pre-existing `hover:underline` + focus-visible ring are untouched |
| 6/7 (contact chips) | rest/hover/focus-visible ALL gain the chip container; focus-visible ADDITIONALLY gains the NEW house ring (today the links have no focus treatment); `hover:text-text` untouched |
| 4 (pack toggle) | the underline becomes present in ALL states (today it renders only in the hover and hover+focus states via `hover:underline`); the pre-existing focus-visible ring and `hover:text-text` are untouched |

## 5. Meta-test / registry inventory

- **EXTENDS:** `tests/e2e/tap-target-inline-controls.layout.spec.ts` (the §3 assertions; wired already in `.github/workflows/lifecycle-layout-e2e.yml` and `playwright.config.ts` mobile-safari `testMatch` — NO new wiring, no `_metaE2eWorkflowCoverage`/`_metaSpecRegistration` change) and `tests/e2e/helpers/devCaptureStaged.ts` (`SeedPreviewExtras` gains an optional `vehicle` field, omitted-when-absent per that type's own contract, so a caller passing nothing gets byte-identical output).
- **CREATES:** nothing structural. No new guard surface (the e2e suite is the existing guard, extended); source-mutation registry: not enrollable/not enrolled — the step3-a11y probe already showed the registry cannot express this Playwright surface (`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4).
- **Invariant-9/10:** no Supabase call site, no mutation surface — class strings, one comment, one seed-helper field, docs. Invariant-5/§12.4: no error codes, no catalog rows, no copy strings.
- **Screenshot baselines:** unaffected — no `public/help/screenshots/` capture renders the wizard step-3 cards or review modal (capture list checked 2026-08-15: dashboard-overview, needs-attention, crew-preview-\*, review-queues-empty-state, preview-as-crew-banner).
- **Exempt-site guard (`tests/a11y/tapTargetInlineExemptions.test.ts`):** untouched (pins sites 1-3, none in this diff).
- **Unit-test pins:** no unit test pins the touched class strings (probed: the only test file matching the touched utilities is the e2e suite itself; `tests/components/step3SheetCard.test.tsx:408` pins `truncate` on a DIFFERENT element). The plan re-runs the per-string grep at execution.

## 6. Verification

TDD in the existing e2e file; every assertion mounts the PRODUCTION route and drives it to the state that renders the control (the suite's own contract). Render premises per the suite's existing pattern — the demoted_rescan seed carries `client_label: "Gallery Client"` (`tests/e2e/helpers/devCaptureStaged.ts:446`), so the meta line renders and the demoted-card premise below is satisfiable; the meta line is located via the EXISTING production testid on its client segment (`wizard-step3-card-${dfid}-client`, `Step3SheetCard.tsx:520` — a span inside the meta `<p>`, whose rect top is the text top the bleed overlaps), so the RED touches test files only; no production edit precedes it. The suite's section locators (`-review-section-<id>`) are rendered by the review-modal wrapper (`components/admin/review/ShowReviewSurface.tsx:1057`), not by `step3ReviewSections.tsx` — recorded here because a two-file grep during review round 1 misread them as stale.

- **RED (all runnable against the current tree — each fails for a stated production-line reason):**
  1. Site 5: meta-line disjointness fails on the demoted_rescan card (~8px overlap from the shipped `-my-2.5 py-2.5`, measured against the `-client` segment rect), and the same shipped pair makes the no-details variant's warning-line disjointness fail by ~6px (its `mt-1` clears only 4px of the 10px downward bleed; the `no_details` seed variant, `tests/e2e/helpers/devCaptureStaged.ts:351`, renders that card with `data-no-details`, `Step3SheetCard.tsx:451`).
  2. Sites 6/7: `≥9.5px` clearance fails (shipped gap is 6px); full-width fails (shipped links shrink-wrap); visible-edge fails PER CHIP (no background/border utilities on either shipped string).
  3. Grid: `vehicleCell.height < driverCell.height` fails (default grid stretch equalizes them).
  4. Budget: cell height exceeds the 34+1 bound (shipped non-content space is 20px `py-2.5` + three 6px `gap-1.5` gaps = 38px).
  5. Site 4: at-rest `text-decoration-line: underline` fails (shipped string underlines on hover only).
- **GREEN:** the §2 class edits + comment/pointer edits land (no production instrumentation is added anywhere in this arc); the full suite (existing + new assertions) passes at 390px and wide.
- **Anti-tautology:** every expected value derives from exactly one of three independent-of-the-render sources — a token read (`--spacing-tap-min`), the seeded fixture's own fields, or a SPEC-PINNED class-derived constant (the 34px budget and 9.5px clearance, stated once in §2 and cited by the test as named constants — never read back from computed styles, which is what keeps those assertions non-tautological: the render must match a number the render did not produce); every rect comes off the PRODUCTION DOM after real navigation, in ONE `evaluate` per comparison (the suite's single-snapshot rule) — located by a production testid where one exists (title link, client segment, section wrappers) and otherwise by a structural selector ROOTED at a production-testid or data-attribute scope (the warning `<p>` inside the `data-no-details` article; eyebrow/name/cell nodes inside the `-review-section-transport` wrapper), each behind an asserted render premise — never from a fixture copy of the JSX; the 34px budget and 9.5px clearance are that third source, stated once in §2 and cited by the test.
- **Impeccable critique + audit** on the implementation diff (invariant 8), pre-code mechanical gate first.

## 7. Documented limits

1. **Taps on the title text itself still open Sheets** — the box is flush with the text line; only the below-text bleed was removed. Inherent to a text link; not a defect.
2. **The upward bleed consumes the card's top padding as hit area.** A tap in the 20px band above the title (inside the card) opens Sheets. Ratified: that band is dead space with no competing target (nearest interactive neighbors are horizontal, and the interactive-disjointness assertions pin them).
3. **Compaction is bounded by the floors.** Two 44px targets + name + eyebrow put the Driver cell near ~150px regardless of gap tuning; the visible win is Vehicle/Parking dropping to content height under `items-start`. The budget contract (§2.2.3) is the honest statement of what compaction ships.
4. **`mt-1.5` on the email chip is unconditional** — in EVERY phone-less combination (with or without a name) the email chip carries 6px of extra leading dead space: a 10px name-to-email gap where 4px would be ideal, or a 6px inset above a lone email chip. Accepted (§2.3 guard conditions) over a conditional class, which would add a non-literal className — the exact shape `BL-TAP-TARGET-STRUCTURAL-GUARD` (BACKLOG.md:323) records as the corpus guard's blocker.
5. **The P3's hover-only class is settled for its three named sites (4/6/7) only.** Other `hover:`-only affordances elsewhere are out of this arc's scope; nothing here creates one.
6. **No `aria`/copy changes** — screen-reader experience is unchanged by design; the chips are visual affordance only.
7. **The post-finalize summary card's meta line is asserted by construction, not by a seeded browser run.** That third `SheetTitleLink` site (`Step3SheetCard.tsx:434`) renders only for a finalized/linked row (`checkpointStatus !== null || row.linkedShowSummary`, `Step3SheetCard.tsx:402`), a state the e2e seed variants do not produce; building that fixture machinery is out of an S arc's scope. Its geometry is the SAME shared link class string plus a sibling with the SAME `mt-0.5` + `text-sm` classes the demoted assertion pins (`-live-summary`, `Step3SheetCard.tsx:437-438`), so the covered case pins the class relationship; only an edit to the live-summary `<p>`'s own margin could regress it independently, and that residual is accepted and recorded here.

## 8. Acceptance criteria

- **AC-1:** Site-5 title link bleeds only upward — §3 invariants 1-4 green in a real browser at 390px and a ≥sm width, on BOTH seedable render sites (demoted_rescan and no_details production routes). The third render site is covered by construction, §7 limit 7.
- **AC-2:** Transport grid `items-start` + compaction — §3 invariants 5-6 green; floors on sites 6/7 untouched (≥44px).
- **AC-3:** Contact chips — §3 invariants 7-8 green; the two targets disjoint with ≥9.5px clearance.
- **AC-4:** Site-4 toggle carries an at-rest underline (computed `text-decoration-line` contains `underline` at rest); its existing floor/shrink-wrap/disjoint assertions still green.
- **AC-5:** The 2026-08-10 spec carries the dated amendment pointer; the `Step3SheetCard.tsx` comment argues the upward form; the e2e suite contains no assertion of the superseded symmetric recipe.
- **AC-6:** All three BACKLOG entries graduate to `BACKLOG-archive.md` with dated resolution paragraphs citing this spec; flight markers stripped in the move; `tests/docs/` suites green.
- **AC-7:** Impeccable dual gate (critique + audit) run on the implementation diff with P0/P1 fixed or DEFERRED-entried; `lifecycle-layout-e2e.yml` green on the PR (the suite already runs there — real CI is the proof, not a local run).

impeccable-gate: pending — critique + audit due at implementation close-out (UI surfaces: components/admin/wizard/\*\*)
