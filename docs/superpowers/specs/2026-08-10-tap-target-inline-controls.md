# Inline text controls vs the 44px floor: the per-site call, and the five repairs

**Date:** 2026-08-10 · **Branch:** `fix/tap-target-inline-controls` · **Closes:** `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` (BACKLOG.md)
**Class:** accessibility (UI surfaces, invariant 8 applies) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The per-site classification is ratified by the user, 2026-08-10** (decision round, each site shown in rendered context): **3 exempt as inline prose, 5 repaired as chrome.** The split below is the product decision the backlog row was filed to obtain; do not reclassify.
- **The exemption authority is `PRODUCT.md:59`**: interactive targets get the 44×44 floor "with the standard WCAG 2.5.5 inline exception: links rendered inline within prose body text … The 44×44 minimum applies to all chrome, controls, navigation, breadcrumbs, badges, and any non-inline interactive target."
- **Repair recipes are the step3-a11y cluster's ratified ones** (`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md`): Class A inline-text recipe `inline-flex w-fit min-h-tap-min items-center` (its probe P2 pins that `w-fit` is load-bearing), and the composite-link recipe `min-h-tap-min` (+ `-mx-2 px-2` only where the horizontal axis also fails). The generic 44px-square recipe (`size-tap-min`) is for icons and applies to NO site here. One site-specific instantiation exists and is stated exactly (site #5, R1 F2: a wrapping composite anchor where flex display would break title wrapping, so it takes `inline-block` symmetric-padding cancellation instead — §2's table is its single normative form); beyond that, no new recipes, and no swapping an element's existing `flex`/`inline-flex` display (that spec's R7 — #5's inline→inline-block change is the stated exception, required because `min-height` does not apply to inline boxes).
- **Two of the backlog row's site labels were wrong and are corrected here from the live tree** (probe 2026-08-10): the `ReportModal` site is the resume-banner link "Start a new report anyway" (the modal's actual "Start fresh" button at a different line already carries `min-h-tap-min`), and the wizard toggle's label is "Show all {n} items" / "Show fewer items", not "show more". The corrected identities below are authoritative.
- **Impeccable dual gate owed** (admin UI surfaces under invariant 8).

## 2. The eight sites and their ratified classification

Corpus provenance: all eight are the judgment half of the step3-a11y corpus pass (`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` §2.6 bucket A — literal className, genuinely under 44px — and §9.1). Line anchors re-verified on `origin/main` 2026-08-10; two drifted lines updated.

### Exempt as inline prose (3) — no code change

| # | site | control | sentence context (the deciding fact) |
| --- | --- | --- | --- |
| 1 | `app/admin/settings/admins/RevokeRowButton.tsx:283` | `<button>` "Refresh" | The warning line renders the full sentence `COULDNT_CONFIRM_COPY` ("Couldn't confirm. Refresh to check.", `RevokeRowButton.tsx:70`) followed by the standalone Refresh button — rendered text "Couldn't confirm. Refresh to check. Refresh" (context corrected R4 F3; the classification was ratified with the site shown in context and STANDS — the button follows the sentence that names it, prose-adjacent recovery affordance) |
| 2 | `components/admin/RoleRecognizeControl.tsx:273` | `<button>` "Change what they see" | Follows the saved-summary sentence (e.g. "People with GFX now see ….") inside the summary `<span>` |
| 3 | `components/shared/ReportModal.tsx:598` (`report-modal-start-fresh`) | `<button>` "Start a new report anyway" | Follows "Your previous report attempt didn't complete. " in the resume banner |

Each stays exactly as-is. The exemption is recorded per site in a code comment at the control (`/* tap-floor: inline-prose exemption, PRODUCT.md:59 — ratified 2026-08-10 */`) so the next corpus sweep classifies them from the source instead of re-litigating. **Enforcement is a source-scan meta-test (R1 F5), red first:** a vitest suite reads the three files and asserts (a) the exemption comment token is adjacent to each control and (b) each control's className literal equals its pinned current string — absent comments make it red today, and a later class edit or comment deletion fails it. Source-scan, not a browser test: an exempt site's contract is "unchanged source," which the source states directly.

### Repaired as chrome (5)

| # | site | control | recipe |
| --- | --- | --- | --- |
| 4 | `components/admin/wizard/step3ReviewSections.tsx:2590` (the toggle `<button>`; its tail `<li>` opens at `step3ReviewSections.tsx:2588`) | "Show all {n} items" / "Show fewer items" toggle — sole child of the tail `<li>` in the pack list (`gap-0.5`, `text-xs`); no sentence | Class A: add `inline-flex w-fit min-h-tap-min items-center`. In-flow vertical growth (the tail row gets taller); no negative margins, so no overlap class. |
| 5 | `components/admin/wizard/Step3SheetCard.tsx:149` (`SheetTitleLink`, the `<a>` at `Step3SheetCard.tsx:150`) | Sheet-title deep link — the card's heading IS the link (`text-base font-semibold`, `wrap-break-word`, `target="_blank"`; children are the title text plus an `ExternalLink` SVG icon component, `Step3SheetCard.tsx:168`) | **Exactly** `inline-block -my-2.5 py-2.5 -mx-2 px-2` added to the existing string (R1 F2: one recipe, no delegated choice). `inline-block` (not flex — flex would make the icon a nowrap sibling and break title wrapping) lets `min-height`-free arithmetic hold: a one-line `text-base` title is a 24.8px line box (`--text-base: 1rem` at line-height 1.55, `app/globals.css:127`), and symmetric `py-2.5` (10px) yields a 44.8px box — clearing the 44px floor with the text vertically centered by construction (R2 F5: the box is 44.8, not "exactly 44"); `-my-2.5` cancels the growth in flow. Two-line titles exceed 44px and the padding simply rides along. `-mx-2 px-2` fixes nothing today horizontally (titles are wide) but keeps the left text edge aligned; the negative margins are the reason #5 joins the overlap-assertion set below. **Amended 2026-08-15: the vertical recipe is now one-directional upward (`-mt-5 pt-5`); see `docs/superpowers/specs/2026-08-15-step3-tap-cluster.md` §2.1. Horizontal `-mx-2 px-2` unchanged.** |
| 6 | `components/admin/wizard/step3ReviewSections.tsx:1410` | `tel:` link (raw phone number) in the centered contact stat cell (`flex items-center gap-1 text-[11px]`) | Composite: add `min-h-tap-min` to the existing `flex` string (display preserved per R7). Parent is a `flex-col items-center` cell, so width shrink-wraps; the label (a full phone number) clears 44px wide. |
| 7 | `components/admin/wizard/step3ReviewSections.tsx:1419` | `mailto:` link (raw email) in the same cell | Same as #6. |
| 8 | `app/admin/dev/page.tsx:334` | "Report this" `<button type="submit">` after an unrecognized-snippet list item | Class A: add `inline-flex w-fit min-h-tap-min items-center`. Also replaces the off-token `text-blue-700` with `text-accent-on-bg` (pre-code mechanical gate: canonical tokens; the class string is being edited anyway). The M8 TODO above the site is untouched: the placeholder form and DOM stay (a §15 demo + Playwright test depend on them). |

Sites 6/7 are the highest-stakes repairs in the set: they get dialed/emailed from a load-out card on a phone.

## Dimensional Invariants

- Every repaired control's hit target measures ≥44px on the vertical axis (the failing axis at all five sites) — real-browser `getBoundingClientRect()` assertions per site, **on the production routes** (§6 render premises — R1 F1: no test-only transcription of the markup; the element is located by its production testid/accessible name after navigating the real page).
- No repaired control overlaps a neighboring interactive target: #4 (tight `gap-0.5` list), #6/#7 (stacked in one cell under a `gap-1.5` column), **and #5 (R1 F3, widened R2 F3 — the one repair with negative margins in BOTH axes: `-mx-2` reaches 8px into the `gap-x-4` (16px) row toward the "Review" trigger at ≥sm, and `-my-2.5` reaches 10px vertically toward whatever sits above/below in the wrapped `max-sm` layout, `Step3SheetCard.tsx:659`; the assertion measures the #5 target rect disjoint from EVERY interactive element's rect within the card, at BOTH 390px — where the cluster wraps full-width below the title — and a ≥sm width where the horizontal gap relationship is live)** — the neighbour-overlap assertion class from `BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE`'s shipped precedent.
- `w-fit` present on #4 and #8 (probe P2 of the recipe spec: without it the control becomes a full-width invisible band).
- Exempt sites 1-3: class strings pinned by the source-scan meta-test (§2) — the exemption is a pinned state, not an assumption.

## Transition Inventory

None. No new states, no animations; every change is a static class-string addition. Hover/focus treatments on all eight sites are pre-existing and untouched.

## 6. Verification

**Render premises (R1 F1 + F4) — every browser assertion mounts the PRODUCTION route and drives it to the state that renders the control; no test-only transcription of markup.** Per repaired site:

| # | route | state that renders the control | existing precedent for reaching it |
| --- | --- | --- | --- |
| 4 | wizard step3 review (`/admin` wizard flow) | a case with MORE than `PACK_LIST_ITEMS_CAP` (8, `step3ReviewSections.tsx:173`) pack items, AND the containing `<details>` EXPANDED before measuring (the toggle lives inside a closed disclosure, `step3ReviewSections.tsx:2635` region — R2 F1) | §6 CI-home note below |
| 5 | same step3 card surface | a card VARIANT that renders `SheetTitleLink` at all — the link renders at `Step3SheetCard.tsx:422`, `Step3SheetCard.tsx:444`, and `Step3SheetCard.tsx:656`, while the ordinary selectable card renders a plain title `<p>` (`Step3SheetCard.tsx:718`) and has NO target (R2 F1); the fixture drives the finalize-demoted variant (:656), with non-empty `dfid` (a missing `dfid` renders the plain-`<p>` fallback, `Step3SheetCard.tsx:147`) and a one-line title (two-line passes vacuously) | §6 CI-home note below |
| 6/7 | same step3 surface, transport section | a contact with populated phone AND email (absent fields render no link) | §6 CI-home note below |
| 8 | `/admin/dev` | developer-tier session + a seeded unrecognized snippet so the list item + form render; the component is private to the server page (`app/admin/dev/page.tsx:322`), so the ROUTE is the only mount | §6 CI-home note below |

**CI home (R2 F2 — the previously cited precedents were wrong: the `step3-review-modal.*` specs are standalone no-app-boot harnesses, and `dev-capture`/`developer-tier` are `UNSEEN` allowlist rows run by no workflow):** the assertions land in a NEW spec file (basename tap-target-inline-controls.layout.spec.ts under tests/e2e/), added to the run step of `.github/workflows/lifecycle-layout-e2e.yml` (the wired pull_request workflow whose existing business is exactly admin-route layout/dimension assertions), mobile-safari. The file is named in the workflow command (so the coverage meta-test in `tests/ci/_metaE2eWorkflowCoverage.test.ts` sees it wired — no allowlist row), **its basename is added to the mobile-safari project's `testMatch` regex (`playwright.config.ts:78` — the workflow command cannot override an unmatched project matcher, R3 F1) and to the spec-registration detector's expectations (`tests/ci/_metaSpecRegistration.test.ts`)**. Two more pieces the R4 probe showed are NOT already there: **(R4 F1)** `lifecycle-layout-e2e.yml` has NO execution oracle today (no JSON reporter, no `PLAYWRIGHT_JSON_OUTPUT_NAME`, no post-run checker at `.github/workflows/lifecycle-layout-e2e.yml:109` region), so the new spec's step CREATES one using the `app-e2e.yml:142` pattern — `--reporter=list,json` + `PLAYWRIGHT_JSON_OUTPUT_NAME` + a post-run executed-count checker whose floor is derived from a real run — scoped to the new file's step; **(R4 F2)** naming the spec in this job expands the environment-governance set enforced at `tests/ci/_workflowCoverageScan.ts:1572` — the affected `governs` entries each gain the new spec path — SEVENTEEN pairs once the step carries its own `PLAYWRIGHT_JSON_OUTPUT_NAME` (the R5 probe: the oracle's reporter env is itself a governed pair, whether the path is reused or fresh; a fresh path is also REGISTERED so the claiming step is not poisoned), with the exact pair set verified against the meta-test's own failure output. Workflow execution on the PR is an acceptance condition (AC-5). The implementation plan names the exact seed helpers; the premises above are the contract. Each premise line doubles as the guard-condition statement for that site (empty/absent data renders no control, and the test MUST fail loudly if the premise stops producing the control — assert the element exists before measuring, per the guard-premise rule).

- **Red first (per repaired site):** the real-browser spec asserting the ≥44px box fails against the current tree (floors derived from `--spacing-tap-min`, `app/globals.css:179`, never a hardcoded 44). The source-scan meta-test for exempt sites is also red (comments absent).
- **Green:** the five class edits + three comments land; both suites pass, including the neighbour-overlap assertions (#4, #5, #6/#7).
- **Anti-tautology:** each rect is read off the control located by its production testid/accessible name after real navigation, never by container query and never from a fixture copy of the JSX; the failure mode each assertion catches is a future class-string edit shrinking the box, re-introducing overlap, or deleting an exemption record.
- **Impeccable critique + audit** on the diff (invariant 8).

## 7. Documented limits

- The corpus-wide structural guard (all 340 elements, fail-by-default for NEW surfaces) remains `BL-TAP-TARGET-STRUCTURAL-GUARD`, blocked on the non-literal-className policy; this arc repairs the last known literal-className under-floor sites and does not attempt the guard.
- The dev page (#8) keeps its placeholder endpoint per the M8 TODO; only the class string changes.

## 8. Acceptance criteria

- **AC-1:** Five repaired sites measure ≥44px on their failing axes in a real browser; three exempt sites measure byte-identical class strings plus the exemption comment.
- **AC-2:** No neighbour-overlap regressions (assertions above green).
- **AC-3:** `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` graduates with the ratified 3/5 split recorded; marker off in the PR's last commit (invariant 12).
- **AC-4:** Impeccable dual gate passes on the diff.
- **AC-5:** the new tap-target layout spec file runs in `lifecycle-layout-e2e.yml` on the PR (workflow-named, executed, no allowlist row) — the guard cannot ship dark (R2 F2).

impeccable-gate: pending — critique + audit due at implementation close-out (UI surfaces: components/admin/**, components/shared/**, app/admin/dev/**)
