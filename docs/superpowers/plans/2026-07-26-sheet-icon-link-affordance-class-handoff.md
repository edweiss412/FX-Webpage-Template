# SheetIconLink Affordance Class Sweep — Handoff

**Branch:** `feat/sheet-icon-link-affordance-class` · **Spec:** `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` (APPROVED, Codex r5) · **Plan:** `docs/superpowers/plans/2026-07-26-sheet-icon-link-affordance-class.md` (APPROVED, Codex plan-r4)

## §1 What shipped

Closes BL-HEADER-LINK-AFFORDANCE-CLASS items 1/3/4/5/6 (item 2 closed earlier by PR #592), plus the fourth class member the backlog missed (Step3ReviewModal).

- components/admin/SheetIconLink.tsx (new): the ONE icon-only sheet link — 20px `size-5` glyph, 44×44 asymmetric `::before` overlay (12px vertical, 10px heading-side, 14px trailing), `text-text` rest / `text-text-strong` hover+active (colour-only, no transform), container-matched ring offsets, one aria phrasing with `.trim()` fallback.
- Site A (`step3ReviewSections.tsx`): consumes it; wrong-precedent comment deleted; phrasing gains "in Google Sheets"; sub-block (Diagrams) 44px tap floors now top-level-only.
- Site B (`PublishedReviewModal.tsx`) + Site D (`Step3ReviewModal.tsx`): consume it; title rows `gap-1`→`gap-2.5` + `min-h-tap-min` + link `mr-0.5` (spec §5.1 containment recipe — net-zero height change, the boxed anchor already supplied 44px).
- Skeleton (`ShowReviewModalSkeleton.tsx`): slot mirrors the 20px-box-in-floored-row shape.
- Structural defenses: count-pinned phrase-containment guard (`tests/components/admin/sheetIconLinkContainment.test.ts`); whole-token-set equality on the component's classes; rect-intersection bleed suites at all three sites; four-component resolved-inset tap oracle.

## §2 Test evidence (all local, per-task RED→GREEN in commit messages)

- Unit: sheetIconLink 9/9; publishedReviewModal 66/66; showReviewModalSkeleton 11/11; Step3ReviewModal 127/127 + containment guard; reviewModalShell 39/39 (byte baseline regenerated — site D header markup legitimately changed); newTabAnnouncementBehavior 86/86; step3JudgmentChrome 14/14 (transition-count pins follow the extraction, 3→2 and 11→10).
- e2e (standalone config): section-header 92/92 (incl. new saturated-name intersection cases — red run showed the genuine 2px pre-fix overlap at 40.6px²), published-review-modal 48/48, step3-review-modal 35/35, skeletonBandParity 10/10.

## §12 Impeccable dual-gate (invariant 8)

### §12.1 Critique

_Method and findings recorded after the dual-agent run._

### §12.2 Audit

_Recorded after the audit pass._

### §12.3 Dispositions

_Every P0/P1: fixed or DEFERRED.md-entried; P2/P3: dispositioned._
