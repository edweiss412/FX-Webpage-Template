# Step-3 "Review & publish" Page Redesign (Variant B) — Close-out / Handoff

**Feature:** Redesign the Step-3 onboarding-wizard page shell to the ratified Claude Design "Variant B" mock. The Step-3 review MODAL (`Step3ReviewModal`) was already shipped and is OUT OF SCOPE.

**Spec:** `docs/superpowers/specs/step3-onboarding/2026-07-04-step3-review-page-variant-b.md` (Codex-APPROVED, 3 rounds).
**Plan:** `docs/superpowers/plans/step3-onboarding/2026-07-04-step3-review-page-variant-b.md` (Codex-APPROVED, 15 rounds).
**Mock:** `docs/superpowers/specs/step3-onboarding/2026-07-04-step3-review-page-variant-b-mock/`.

---

## 1. What shipped (per task)

| Task | Deliverable | Commit scope |
| --- | --- | --- |
| T1 | `Step3PublishCounts` + `selectableTotal`/`selectedCount` + `computeSelectableCounts` | `Step3Review.tsx`, `Step3ReviewWithFinalize.tsx` |
| T2 | Redesigned shared `StepIndicator` (pills + labels + connectors + done-check, neutral not green) | `OnboardingWizard.tsx` |
| T3 | Header "Review what we found" + composed pluralized summary (`rowNeedsLook`, `renderSummary`) | `Step3Review.tsx` |
| T4 | Compact list-row `Step3SheetCard` (View/Review/demoted/no-details), re-centered checkbox + `-checkbox-box` | `Step3SheetCard.tsx` |
| T5 | Single-column list (`flex flex-col`), `max-w-3xl` container, select-all-without-count header | `Step3Review.tsx`, `OnboardingWizard.tsx` |
| T6 | Sticky `Step3PublishBar` re-homing `FinalizeButton` (+ layout-only `panelPlacement`), Back-in-bar | `Step3PublishBar.tsx` (new), `Step3ReviewWithFinalize.tsx`, `FinalizeButton.tsx`, `OnboardingWizard.tsx` |
| T7 | Real-browser DI-1…DI-4 layout assertions (standalone static harness) | `tests/e2e/step3-review-page.layout.spec.ts` (new) |
| T8 | Transition audit (deliberately-instant conditionals + source-level no-framer guard + compound modal) | `tests/components/admin/wizard/step3Page.transitions.test.tsx` (new) |

View-layer only. No DB / advisory-lock / RPC / finalize-contract change (invariant declarations in the plan hold). Two obsolete e2e specs deleted (`step3-card-dimensions`, `step3-grid-layout`), superseded by T7's DI assertions.

---

## 12. UI quality gate (invariant 8)

**Tooling note (honest deferral).** The impeccable v3 dual-gate renders the *live* UI surface. This project has **no live-app Step-3 seed** — every Step-3 layout spec in the repo is a standalone static-HTML harness (discovered during T7; see the plan). A full `/impeccable critique` + `/impeccable audit` live render is therefore not runnable headlessly for this surface. The verification that *is* available and was performed:

1. **Real-browser layout attestation** — T7's Playwright static harness renders the transcribed Variant-B shell against the **compiled `app/globals.css`** and asserts the four spec §7 dimensional invariants (DI-1…DI-4). Each assertion was **negative-regression proven to bite** (a genuine layout violation fails it; the restored code passes) — and this pass **caught a tautological DI-1** (it measured the nav against itself) which was fixed to measure the nav's content width against the container.
2. **Manual design-conformance review** against `DESIGN.md` / `PRODUCT.md` / the mock (below).
3. **External attestation** — the whole-diff **Codex cross-model review** (Stage 4) is the required external (non-self) attestation, per `feedback_impeccable_external_attestation_required`.

`BL-STEP3-IMPECCABLE-LIVE-RENDER` filed for a future live-render impeccable pass once a Step-3 admin seed exists.

### Design-conformance findings + dispositions

| # | Area | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | **Accent budget (≤10%, DESIGN.md:11)** | `bg-accent`/`text-accent-text` appears only on: the single active stepper pill, checked checkboxes (`PublishCheckbox`/select-all), and the bar's Publish CTA (`AccentButton`). The Review/View buttons are **outline/ghost, NOT accent**; the needs-a-look chip uses `bg-warning-bg`. | ✅ Pass — within budget; Review buttons deliberately non-accent. |
| 2 | **Warn treatment (DESIGN.md §1.2 — warning not error, no side-stripe)** | Needs-a-look = `bg-status-review` dot + `bg-warning-bg text-warning-text` pill (dot+text paired for the color-blind floor §1); warn card border = `border-border-strong` (full border, no side-stripe). Demoted banner/note reuse the shipped `RescanReviewBanner`/`NotPublishableNote`. | ✅ Pass. |
| 3 | **Token compliance** | Canonical `shadow-tile` (not `shadow-(--shadow-tile)`); only sanctioned `@theme` utilities. The pre-existing `shadow-(--shadow-tile)` on the old card face was corrected to `shadow-tile`. | ✅ Pass. |
| 4 | **Focus-visible** | The new bar Back link, the Review/View trigger, the re-centered checkbox (peer-focus ring on the visible box), the stepper pills (link states) all carry `focus-visible:ring-2 ring-focus-ring ring-offset-2`. | ✅ Pass. |
| 5 | **Stepper label overflow (DI-1)** | Non-active labels are `hidden sm:inline`; the active label is always visible. DI-1 asserts the stepper's content width ≤ container width at 320px. | ✅ Pass (real-browser). |
| 6 | **Sticky-bar occlusion + safe-area (DI-3)** | Bar is `sticky bottom-0 w-full` with `pb-[calc(env(safe-area-inset-bottom)+0.75rem)]`; the scroll body carries `pb-24`; the wrapper carries `w-full` so the bar spans the container. DI-3 asserts bar==container width, Publish-in-viewport, and the idle-row baseline. | ✅ Pass (real-browser). |
| 7 | **Double-"Review" affordance on demoted RESCAN cards** | A dirty-rescan card shows BOTH the `RescanReviewBanner` link ("Review this sheet" → the reapply page with the real per-item choice) and the shared `-more` "Review" button (→ read-only preview modal). Two affordances, different destinations. | ⚠️ Noted — intentional per spec §4.3 (the banner is the actionable path; the modal is read-only preview). The banner's specific "Review this sheet" text disambiguates from the generic "Review" preview. Not a HIGH/CRITICAL; refinement candidate, left as-is to preserve the shipped banner + the plan's demoted-keeps-modal contract. |
| 8 | **Dark-mode warn contrast** | `bg-warning-bg`/`text-warning-text` are theme-aware `@theme` tokens (used unchanged from the shipped card); no new hardcoded colors introduced. | ✅ Pass (token-driven; not independently re-rendered in dark mode — folded into the live-render deferral above). |

**HIGH/CRITICAL:** none. **Deferred:** live-render impeccable pass (`BL-STEP3-IMPECCABLE-LIVE-RENDER`, no Step-3 seed); double-Review refinement (finding 7, intentional).

---

## Verification summary

- `pnpm typecheck` — clean.
- `pnpm vitest run tests/components` — **2148 passed** (full component suite; the shared-component changes rippled into 6 suites, all reconciled).
- `pnpm exec playwright test tests/e2e/step3-review-page.layout.spec.ts` (standalone config) — **4 passed** (DI-1…DI-4), each bite-verified.
- `pnpm format:check` — see Stage-4 pre-push.
