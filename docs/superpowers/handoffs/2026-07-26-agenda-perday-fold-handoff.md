# Agenda per-viewer day fold — close-out handoff (PR #610)

PR3 of the `BL-NULLCODE-STAMP-BATCH-2 residuals` sequence. Spec:
`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md`. Plan:
`docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md`.

## §12 — UI close-out (impeccable v3 dual-gate)

**Both gates ran DEGRADED: single-context, and that is declared rather than hidden.** The skill's hard
invariant is two isolated sub-agents; this session's instructions forbid the Agent tool unless the user
asks for it. The user instruction wins, and the skill is explicit that an undeclared degraded run is a
failed run, so both reports carry the banner.

### critique

| Finding | Severity | Disposition |
| --- | --- | --- |
| The session count rendered on OPEN rows, restating the sessions listed directly beneath it, and spent a fourth atom on the summary line at 320px where space is tightest | P1 | **FIXED** (`c16ed6cda`). Folded-rows-only, where the count is the sole signal of what the fold hides. The test that asserted count-on-every-row was asserting the defect and was corrected, not worked around. |
| Detector (`detect.mjs`) | — | `[]`, no findings |
| Mechanical checklist: em-dashes, apostrophes, 44px tap target, canonical type scale | — | all clean |

**Considered and REJECTED: the FXAV accent on the "Your day" marker.** PRODUCT.md calls that orange the one
inherited brand cue, so accent felt more on-brand. `DESIGN.md:11` settles it the other way: accent's uses are
enumerated as the live indicator, the today pin, primary CTAs and the brand mark, "Nowhere else", under a
ten-percent viewport cap, with selected-state explicitly excluded. `text-text-strong` stays. Recorded because
the reasoning looked like brand fidelity and was actually a design-system violation.

### audit

| Dimension | Score | Note |
| --- | --- | --- |
| Accessibility | 2 → 4 | one P1, below |
| Performance | 4 | transitions `transform` only; no layout-property animation |
| Theming | 4 | zero hard-coded colours; one arbitrary value (`max-w-[12ch]`), deliberate and documented |
| Responsive | 4 | 320 / 390 / 720 measured in a real browser |
| Code quality | 4 | tsc and eslint clean |

**P1 — the fold silently removed every per-day heading.** Each day was an `<h3>`; the summary replaced it
with a bare span, so every day left the document outline. Heading navigation is how a screen-reader user
skims a long agenda, which made the fold *worse* for exactly the people PR #592's announcement work served.

**FIXED** (`9b2308f08`): the `<h3>` now sits INSIDE the `<summary>`, so the disclosure role and expanded state
come from `details`/`summary` and the outline entry from the heading. Mutation-verified — reverting to a span
fails the new test.

Worth recording *how* it was found, because no test could have: the jsdom suite asserts roles and test ids,
the browser suite measures boxes and computed styles, and both were green. An element can lose heading
semantics while keeping its geometry and its role. What exposed it was a grep during the audit — the file's
own docstring still said "day labels here are `<h3>`" while the only remaining "h3" in the file *was that
comment*. The docstring was then updated, since a comment asserting what the code stopped honouring is what
made this findable and would otherwise make the next one invisible.

## Known limits, disclosed rather than defended

- **The layout spec is PATH-GATED, not PR-blocking.** It runs when its filter matches the spec, its renderer,
  or the two components it measures. Its allowlist row reads `PATH_GATED` and was re-valued rather than
  deleted: the scanner rejects path-filtered workflows from `covered`, so deleting the row would report the
  spec DARK. Better than dark, weaker than PR-blocking, and the reason string says so.
- **jsdom cannot see visibility.** Adding `hidden` to the marker leaves all 12 jsdom tests green. Documented
  in that file's header with the mutation evidence, and covered instead by a browser assertion on the
  marker's box. A `toBeVisible()` there would be vacuous.
- **`tests/ci/_workflowCoverageScan.ts` counts any spec-path text in a `run:` body as invocation**, so an
  `echo` would satisfy it. Real, pre-existing, and deliberately out of scope — hardening it touches every
  spec in that registry and belongs in its own reviewed change.

## Process note

The spec and plan took seven adversarial rounds without converging, and each round's repairs generated the
next round's findings. Four probes settled in minutes what those rounds did not: the completeness rule (which
folded a day the viewer works, on an input five rounds had read past), React's reconciliation of `open` across
`router.refresh()`, the JSONB-cast throw, and the containment scope. The user then chose to proceed to
implementation with the code and its tests as the authority.

Implementing immediately found two design errors prose review had not: the matcher's signature recomputed an
intersection the caller already had, and a guard I had written was unreachable. Both are the kind of thing
only a caller and a mutation run can show.
