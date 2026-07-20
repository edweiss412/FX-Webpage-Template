# Show-scoped alert copy — handoff

**Branch:** `feat/show-scoped-alert-copy`
**Spec:** `docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md` (APPROVED, adversarial R9)
**Plan:** `docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md` (APPROVED, split review 9a + 8b)

## What shipped

Two mechanisms, both scoped to how existing copy is selected. No new surface.

1. **`dougFacingShowScoped`** — an optional catalog field holding an authored short variant, preferred by `safeDougFacingTemplate` (`lib/admin/attentionItems.ts:145`). Reachable only from the show modal, so the bell and telemetry render byte-identical output. Three codes adopt it; two keep their prefix and are recorded as exempt.
2. **`lib/adminAlerts/resolveActionLabel.ts`** — one alert now reads the same verb in all three surfaces. Previously: "Mark resolved" (show modal), "Mark resolved" (telemetry), "Dismiss" (bell) for the same action.

Plus `lead-hint` emptied in show scope (the sentence pointed at the page the reader is already on), and two §12.4 rows that quoted the old button label.

## §12 — UI quality gate (invariant 8)

Setup gates run: the skill context loader (PRODUCT.md + DESIGN.md), then the **product** register reference (internal admin surface, design serves the task).

### Critique findings

| # | Tier | Finding | Disposition |
| --- | --- | --- | --- |
| C1 | P1 | **DESIGN.md drift.** §443 documented the bell's trailing control as a "ghost **Dismiss** button" and health rows as "no Dismiss". The label is no longer bell-specific. | **Fixed in this commit.** DESIGN.md now documents the control by role, and records that the label is intent-driven and shared across surfaces, with the register's own rationale ("if the save button looks different in two places, one is wrong"). |
| C2 | P2 | **Misleading constant.** `GHOST_DISMISS` named the styling after a verb the control no longer uses. | **Fixed in this commit.** Renamed `GHOST_RESOLVE`, with a comment stating the label comes from the intent map. |
| C3 | P3 | **Row-level accessible name.** The button's accessible name is its label, so a screen-reader button list reads "Confirm" / "Mark resolved" without naming which alert. | **Deferred, not a regression.** The prior state was strictly worse (every row read an identical "Dismiss"). Adding an alert-specific `aria-label` is a copy decision with its own review surface; it belongs with spec B's copy pass, not a mechanism PR. |

### Audit findings

| # | Tier | Finding | Disposition |
| --- | --- | --- | --- |
| A1 | P1 | **Longer label in a narrow row.** "Dismiss" (7 chars) became "Mark resolved" (13) in the bell's action row, next to a CTA link. | **Verified clear, no change needed.** The row is `flex flex-wrap items-center` (`BellPanel.tsx:285`), so the label wraps to its own line at narrow widths rather than crowding or overflowing. Checked before assuming. |
| A2 | P1 | **Footer geometry in the show modal.** "Confirm" is narrower than "Mark resolved"; a narrower button could leave the control floating off the footer's content edge. | **Pinned by a real-browser test**, not asserted: `tests/e2e/resolve-label-layout.spec.ts` measures row height and right-edge flushness across both labels, with a negative control proving the widths actually differ. Both red phases were observed (a temporary 220px constraint fails the flush assertion; withholding the readiness marker fails the gate). |
| A3 | P2 | **Tap floor.** All three buttons keep `min-h-tap-min`; only text changed. | No action. |
| A4 | P2 | **No new color tokens**, so no new contrast pins are owed. | No action. |
| A5 | P3 | **Help-page crosswalk.** Checked `app/help/**` for a documented "Dismiss" label. | No hits; nothing to update. |

No P0 findings. No `DEFERRED.md` entry is owed: C3 is a pre-existing condition this diff improves rather than introduces, and it is recorded here and in the spec B input.

## Test posture, stated honestly

- Every suite this diff touches passes: `tests/messages`, `tests/adminAlerts`, `tests/admin`, `tests/components`, `tests/cross-cutting`, plus both e2e specs.
- **The full `pnpm test` run is NOT clean on this machine**, and it is not clean because of this diff. Two identical full runs produced *different* failure sets (12, then 29), concentrated in `tests/db/**` and `tests/onboarding/**.db.test.ts`. **Every one of those files passes when run in isolation** (verified individually). A sibling worktree session was running its own suite against the same local Supabase throughout, which is the documented shared-DB pollution mode for this repo, compounded by load flake on a contended box.
- Real CI is therefore the authoritative gate for the full suite, per the project's local-passes-CI-fails rule. Do not merge on local green alone.

## Follow-on

`specB-input.md` in this directory records 13 further per-show codes that want variants, received mid-implementation. It is filed, not actioned: those codes carry the show name mid-sentence (which this spec deferred by name), the copy is unratified, and two coupling questions are open. It also records the load-bearing gap: **none of those 13 trips this spec's defense 1**, so spec B needs its own gate keyed on reachability rather than prefix shape.
