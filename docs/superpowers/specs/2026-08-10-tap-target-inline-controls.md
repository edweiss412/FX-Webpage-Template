# Inline text controls vs the 44px floor: the per-site call, and the five repairs

**Date:** 2026-08-10 · **Branch:** `fix/tap-target-inline-controls` · **Closes:** `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` (BACKLOG.md)
**Class:** accessibility (UI surfaces, invariant 8 applies) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The per-site classification is ratified by the user, 2026-08-10** (decision round, each site shown in rendered context): **3 exempt as inline prose, 5 repaired as chrome.** The split below is the product decision the backlog row was filed to obtain; do not reclassify.
- **The exemption authority is `PRODUCT.md:59`**: interactive targets get the 44×44 floor "with the standard WCAG 2.5.5 inline exception: links rendered inline within prose body text … The 44×44 minimum applies to all chrome, controls, navigation, breadcrumbs, badges, and any non-inline interactive target."
- **Repair recipes are the step3-a11y cluster's ratified ones** (`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md`): Class A inline-text recipe `inline-flex w-fit min-h-tap-min items-center` (its probe P2 pins that `w-fit` is load-bearing), and the composite-link recipe `min-h-tap-min` (+ `-mx-2 px-2` only where the horizontal axis also fails). The generic 44px-square recipe (`size-tap-min`) is for icons and applies to NO site here. Do not invent a third recipe; do not swap an element's existing `flex`/`inline-flex` display (that spec's R7).
- **Two of the backlog row's site labels were wrong and are corrected here from the live tree** (probe 2026-08-10): the `ReportModal` site is the resume-banner link "Start a new report anyway" (the modal's actual "Start fresh" button at a different line already carries `min-h-tap-min`), and the wizard toggle's label is "Show all {n} items" / "Show fewer items", not "show more". The corrected identities below are authoritative.
- **Impeccable dual gate owed** (admin UI surfaces under invariant 8).

## 2. The eight sites and their ratified classification

Corpus provenance: all eight are the judgment half of the step3-a11y corpus pass (`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` §2.6 bucket A — literal className, genuinely under 44px — and §9.1). Line anchors re-verified on `origin/main` 2026-08-10; two drifted lines updated.

### Exempt as inline prose (3) — no code change

| # | site | control | sentence context (the deciding fact) |
| --- | --- | --- | --- |
| 1 | `app/admin/settings/admins/RevokeRowButton.tsx:283` | `<button>` "Refresh" | Full `<p>`: "Couldn't confirm. Refresh to check." — mid-sentence recovery action in a warning line |
| 2 | `components/admin/RoleRecognizeControl.tsx:273` | `<button>` "Change what they see" | Follows the saved-summary sentence (e.g. "People with GFX now see ….") inside the summary `<span>` |
| 3 | `components/shared/ReportModal.tsx:598` (`report-modal-start-fresh`) | `<button>` "Start a new report anyway" | Follows "Your previous report attempt didn't complete. " in the resume banner |

Each stays exactly as-is. The exemption is recorded per site in a code comment at the control (`/* tap-floor: inline-prose exemption, PRODUCT.md:59 — ratified 2026-08-10 */`) so the next corpus sweep classifies them from the source instead of re-litigating.

### Repaired as chrome (5)

| # | site | control | recipe |
| --- | --- | --- | --- |
| 4 | `components/admin/wizard/step3ReviewSections.tsx:2585` | "Show all {n} items" / "Show fewer items" toggle — sole child of the tail `<li>` in the pack list (`gap-0.5`, `text-xs`); no sentence | Class A: add `inline-flex w-fit min-h-tap-min items-center`. In-flow vertical growth (the tail row gets taller); no negative margins, so no overlap class. |
| 5 | `components/admin/wizard/Step3SheetCard.tsx:149` | Sheet-title deep link — the card's heading IS the link (`text-base font-semibold`, `wrap-break-word`, `target="_blank"`) | Composite: add `min-h-tap-min -mx-2 px-2` plus `inline-flex w-fit items-center` semantics via the Class A string where compatible with wrapping; the title may wrap to 2+ lines, in which case `min-h-tap-min` no-ops (already ≥44). Vertical axis is the failing one at one line. |
| 6 | `components/admin/wizard/step3ReviewSections.tsx:1410` | `tel:` link (raw phone number) in the centered contact stat cell (`flex items-center gap-1 text-[11px]`) | Composite: add `min-h-tap-min` to the existing `flex` string (display preserved per R7). Parent is a `flex-col items-center` cell, so width shrink-wraps; the label (a full phone number) clears 44px wide. |
| 7 | `components/admin/wizard/step3ReviewSections.tsx:1419` | `mailto:` link (raw email) in the same cell | Same as #6. |
| 8 | `app/admin/dev/page.tsx:334` | "Report this" `<button type="submit">` after an unrecognized-snippet list item | Class A: add `inline-flex w-fit min-h-tap-min items-center`. Also replaces the off-token `text-blue-700` with `text-accent-on-bg` (pre-code mechanical gate: canonical tokens; the class string is being edited anyway). The M8 TODO above the site is untouched: the placeholder form and DOM stay (a §15 demo + Playwright test depend on them). |

Sites 6/7 are the highest-stakes repairs in the set: they get dialed/emailed from a load-out card on a phone.

## Dimensional Invariants

- Every repaired control's hit target measures ≥44px on the failing axis (all five fail vertically; #5 also horizontally at one-line titles below the `-mx-2 px-2` fix) — real-browser `getBoundingClientRect()` assertions per site, mobile-safari 390px, per the layout-dimensions rule (jsdom insufficient).
- No repaired control overlaps a neighboring interactive target: for #4 (tight `gap-0.5` list) and #6/#7 (stacked in one cell under a `gap-1.5` column), assert the grown rects are disjoint from their nearest interactive neighbors' rects — the neighbour-overlap assertion class from `BL-TAP-TARGET-NEIGHBOUR-OVERLAP-COVERAGE`'s shipped precedent.
- `w-fit` present on #4 and #8 (probe P2 of the recipe spec: without it the control becomes a full-width invisible band).
- Exempt sites 1-3: rects UNCHANGED (pin one assertion each so the exemption is a measured state, not an assumption).

## Transition Inventory

None. No new states, no animations; every change is a static class-string addition. Hover/focus treatments on all eight sites are pre-existing and untouched.

## 6. Verification

- **Red first (per site):** a real-browser spec asserting the ≥44px box on each of the five repair sites fails against the current tree (the corpus baseline says all five are under; the test derives expected floors from `--spacing-tap-min`, `app/globals.css:179`, never a hardcoded 44).
- **Green:** the five class edits land; the same spec passes; the neighbour-overlap and exempt-site-unchanged assertions pass alongside.
- **Anti-tautology:** each site's rect is read off the control located by its own accessible name/testid, never by container query; the failure mode each assertion catches is a future class-string edit shrinking the box or re-introducing overlap.
- **Impeccable critique + audit** on the diff (invariant 8).

## 7. Documented limits

- The corpus-wide structural guard (all 340 elements, fail-by-default for NEW surfaces) remains `BL-TAP-TARGET-STRUCTURAL-GUARD`, blocked on the non-literal-className policy; this arc repairs the last known literal-className under-floor sites and does not attempt the guard.
- The dev page (#8) keeps its placeholder endpoint per the M8 TODO; only the class string changes.

## 8. Acceptance criteria

- **AC-1:** Five repaired sites measure ≥44px on their failing axes in a real browser; three exempt sites measure byte-identical class strings plus the exemption comment.
- **AC-2:** No neighbour-overlap regressions (assertions above green).
- **AC-3:** `BL-TAP-TARGET-INLINE-TEXT-CONTROLS` graduates with the ratified 3/5 split recorded; marker off in the PR's last commit (invariant 12).
- **AC-4:** Impeccable dual gate passes on the diff.

impeccable-gate: pending — critique + audit due at implementation close-out (UI surfaces: components/admin/**, components/shared/**, app/admin/dev/**)
