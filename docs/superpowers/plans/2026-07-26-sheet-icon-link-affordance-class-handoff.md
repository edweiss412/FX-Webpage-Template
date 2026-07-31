# SheetIconLink Affordance Class Sweep — Handoff

**Branch:** `feat/sheet-icon-link-affordance-class` · **Spec:** `docs/superpowers/specs/2026-07-26-sheet-icon-link-affordance-class.md` (APPROVED, Codex r5) · **Plan:** `docs/superpowers/plans/2026-07-26-sheet-icon-link-affordance-class.md` (APPROVED, Codex plan-r4)

## §1 What shipped

Closes BL-HEADER-LINK-AFFORDANCE-CLASS items 1/3/4/5/6 (item 2 closed earlier by PR #592), plus the fourth class member the backlog missed (Step3ReviewModal).

- components/admin/SheetIconLink.tsx (new): the ONE icon-only sheet link — 16px `size-4` glyph in a 20px `size-5` anchor box, 44×44 asymmetric `::before` overlay (12px vertical, 10px heading-side, 14px trailing), `text-text` rest / `text-text-strong` hover+active (colour-only, no transform), container-matched ring offsets, one aria phrasing with `.trim()` fallback.
- Site A (`step3ReviewSections.tsx`): consumes it; wrong-precedent comment deleted; phrasing gains "in Google Sheets"; sub-block (Diagrams) 44px tap floors now top-level-only.
- Site B (`PublishedReviewModal.tsx`) + Site D (`Step3ReviewModal.tsx`): consume it; title rows `gap-1`→`gap-2.5` + `min-h-tap-min` + link `mr-0.5` (spec §5.1 containment recipe — net-zero height change, the boxed anchor already supplied 44px).
- Skeleton (`ShowReviewModalSkeleton.tsx`): slot mirrors the 20px-box-in-floored-row shape.
- Structural defenses: count-pinned phrase-containment guard (`tests/components/admin/sheetIconLinkContainment.test.ts`); whole-token-set equality on the component's classes; rect-intersection bleed suites at all three sites; four-component resolved-inset tap oracle.

## §2 Test evidence (all local, per-task RED→GREEN in commit messages)

- Unit: sheetIconLink 9/9; publishedReviewModal 66/66; showReviewModalSkeleton 11/11; Step3ReviewModal 127/127 + containment guard; reviewModalShell 39/39 (byte baseline regenerated — site D header markup legitimately changed); newTabAnnouncementBehavior 86/86; step3JudgmentChrome 14/14 (transition-count pins follow the extraction, 3→2 and 11→10).
- e2e (standalone config): section-header 92/92 (incl. new saturated-name intersection cases — red run showed the genuine 2px pre-fix overlap at 40.6px²), published-review-modal 48/48, step3-review-modal 35/35, skeletonBandParity 10/10.

## §12 Impeccable dual-gate (invariant 8)

### §12.1 Critique — Method: dual-agent (A: design review · B: detector/evidence), 2026-07-26

Heuristic total 30/40; verdict: not slop ("removes visual weight rather than adding it"). Detector: 0 net-new findings (9 hits all pre-existing comment-prose broken-image false positives — the #604 comment-stripping class; detector has NO tap-target/hit-area rules, so its clean result was weighted as weak and the repo's own hit-area e2e gates were verified as the substitute evidence, all present at all three sites). Browser injection skipped: surfaces live behind authed admin modals; static harnesses covered the visual pass instead.

Findings:
- **P1a (FIXED in-branch): press/hover feedback perceptually null.** text-text→text-text-strong ≈12/255 per channel on a 16px stroke, the only feedback. Fixed with the house `hover:bg-surface-sunken active:bg-surface-sunken` wash (sibling idiom: ModalCloseButton, BellPanel, HelpSheet; press idiom: ShowsTable, SwitcherControls). Colour-only — the no-transform contract holds. Token-set literal extended first (RED 4 → GREEN 9/9); spec §3 amended with provenance; D byte baseline re-regenerated.
- **P1b (DEFERRED): `text-text-subtle` on four sibling icon-only action targets** (ModalCloseButton:20, RescanSheetButton:207, BellPanel:1294 (bell-panel-close), HelpSheet:145), incl. the same-header inversion (sheet link now darker at rest than the close button beside it). → `DEFERRED.md` SHEETLINK-SUBTLE-ACTION-CLASS-1.
- **P2 (recorded, no change): consuming-context requirements arrive via `className`** — a future `placement` prop would make the component self-enforcing; today the three per-site rect-intersection e2e suites pin it.
- **P2 (recorded, ratified): invisible asymmetric target reach** — spec §1.1/§5 geometry, 5-round Codex-approved; heading-side reach never exceeds the row gap.
- **P3 (pre-tracked): duration-fast dead token** — spec §1.6, DESTRUCT-DURATION-TOKENS-1.
- Critique confirmations: Diagrams sub-row reads as intended subordination, not a broken row; B/D title bands unchanged; skeleton honesty (empty 20px slot) called out as a strength.

### §12.2 Audit — Method: subagent, 2026-07-26. VERDICT: PASS (18/20; A11y 4, Perf 4, Theming 3, Responsive 3, Anti-patterns 4)

Ring offsets verified against real backdrops at all three sites; the diff CLOSES the pre-existing DESIGN.md:27 subtle-on-action-target violation. Findings and dispositions:

- **P2 (FIXED): dark-mode wash invisible at the bg-backed site** (surface-sunken over bg-bg = 1.03:1 dark). The ring-offset prop now selects a whole backdrop-matched skin: bg site washes with `bg-surface` (a real step in dark, 1.66:1), surface sites keep `bg-surface-sunken`. No `dark:` variant exists in this repo, so per-theme splits were rejected as dead classes. Token-set literals split per variant (RED 3 → GREEN 9/9).
- **P2 (FIXED): sub-block floor keyed on `sub`, not link presence.** Both floor conditionals now read `sub && sheetHref === null` — a future linked sub-block gets its floor back by construction; guard comment updated. 92/92 section-header e2e (Diagrams still floorless, linked rows still floored).
- **P3 (FIXED): missing §1.2 rows** — `text-text-strong` on `surface-sunken` (17.3/17.6) and on `surface` (18.4/15.9) added to DESIGN.md §1.2 and pinned in `tests/styles/status-token-contrast.test.ts` (55/55).
- **P3 (FIXED): containment guard blind to app/** — walk extended to `app/` excluding `app/api/`.
- **P3 (FIXED): stale label pin** in `docs/superpowers/specs/2026-07-25-newtab-announcement-family.md` — supersession pointer added.
- **P3 (ACCEPTED, documented): rem-scaled overlay vs px floor at ~200% text-only zoom** — px-pinning the insets would break DESIGN.md §10 tokenized-scale discipline; bound recorded in the component header.

D byte baseline regenerated after the skin change (same throwaway-runner procedure, deleted in-commit).

### §12.3 Dispositions

P0: none. P1: one fixed, one DEFERRED.md-entried (above). P2/P3: recorded above with rationale. Visual pass: 8 screenshots (3 surfaces × light/dark + flagged variant) at `.claude/visual-pass/` — glyph affordance visible at rest in both themes, sub-row subordination intentional, saturated-title modal row centres the link, no bleed visible.

### §12.4 Post-gate amendment (whole-diff r37, 2026-07-31)

DESIGN.md's centred-section-header recipe still prescribed the symmetric `before:-inset-3` overlay — the exact 2px name-side bleed this feature fixed — and the tangency wording predated the shipped 2px pill buffer. Both lines now describe the shared `SheetIconLink` asymmetric overlay (`before:-inset-y-3 before:-left-2.5 before:-right-3.5`) and direct new icon-only sheet links to the component rather than the raw recipe. Doc-sync only — no rendered surface changed; the §12.1/§12.2 gate results and dispositions stand.
