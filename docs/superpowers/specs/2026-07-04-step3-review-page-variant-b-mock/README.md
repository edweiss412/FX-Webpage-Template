# Step-3 "Review & publish" page redesign — Variant B design mock snapshot

Snapshot of the ratified Claude Design mock this feature implements, committed for
visual grounding per the `feedback_commit_design_mock_snapshot_for_subagents` rule.

- **Design project:** `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd` ("FXAV Crew Pages")
- **Entry file:** `Step 3 Review - Publish (B).html` → renders `review/step3-app.jsx`

## What this feature covers

Only the **page SHELL** around the Step-3 review modal. The modal itself
(`Step3ReviewModal`, the Variant-B two-pane review surface) is **already
implemented and shipped** (PR #280 + follow-ups). This redesign restyles the
wizard page that lists the parsed sheets and hosts the publish action.

## Files in this snapshot

| File | Role |
| --- | --- |
| `step3-app.jsx` | The page shell: `Stepper`, `wizhead` ("Review what we found" + summary), `sheetlist` (`StarCard` flagged / `OtherCard` clean), sticky `wizbar` (count + Back + Publish), toast. **Primary source of truth for markup, copy, and structure.** |
| `step3.css` | Page-shell styles: stepper pills+connectors, topbar, `.wiz` layout, `.sheetcard` / `.sc-*`, `.wizbar` sticky bar, responsive (`max-width:640px` stacks the card actions), toast. **Primary source of truth for the visual system of the shell.** |
| `style.css` | Design tokens (light + dark). Component/section styles beyond the shell live in the design project (they belong to the already-shipped modal). |
| `data.jsx` | The mock's parsed-show fixture + `SECTIONS`/`TOTALS`. Documents the exact happy-path counts and the summary-line copy the header composes. |

## Mock → real-code mapping (authoritative in the spec)

- `Stepper` (labels *Share folder · Verify · Review & publish*) → redesign of the
  shared `StepIndicator` in `components/admin/OnboardingWizard.tsx`.
- `wizhead` → `Step3Review` header ("Review what we found" + composed summary).
- `StarCard` (warn border + "N need a look" chip + primary **Review**) → a clean
  row **with** parse data-quality warnings.
- `OtherCard` (ghost **View**) → a clean row **without** warnings.
- both `Review`/`View` → open the already-shipped `Step3ReviewModal`.
- `wizbar` → new sticky bottom publish bar wrapping the full `FinalizeButton`
  behavior; **Back** moves here for Step 3 (Steps 1–2 keep the top Back).

## Caveats

- The mock is a single-file React-via-Babel prototype. It is NOT wired to the real
  data model, RPCs, or the finalize streaming contract. It grounds **visual + copy
  + structure only**; the spec reconciles every real state (needs-attention,
  set-aside groups, empty, stale-review) that the happy-path mock omits.
- The mock reuses `--accent` (orange) freely; the real implementation stays within
  `DESIGN.md`'s ≤10% accent-coverage budget and uses the repo's `@theme` tokens,
  not the mock's raw hex/CSS-vars.
