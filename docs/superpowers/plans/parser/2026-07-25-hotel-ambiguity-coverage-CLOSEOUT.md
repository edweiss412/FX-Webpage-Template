# Close-out — Hotel ambiguity coverage

Plan: `docs/superpowers/plans/parser/2026-07-25-hotel-ambiguity-coverage.md`
Spec: `docs/superpowers/specs/parser/2026-07-25-hotel-ambiguity-coverage-design.md`

## 12. UI quality gate (invariant 8)

**Surface:** `components/admin/UseRawControl.tsx` — the only UI file in the diff.

**Run mode: ⚠️ DEGRADED — single-context.** The critique reference mandates two
isolated sub-agents for Assessments A and B. This session carries a standing
instruction not to invoke the Agent tool unless the user asks, which the
reference treats as the "user declined" case, so the sanctioned degraded path
was taken and is banner-declared here rather than run silently.

**Assessment B (detector):** `detect.mjs --json components/admin/UseRawControl.tsx`
returned `[]`, exit 0. Clean.

**Assessment A (design review):** the diff adds **0 markup lines, 0 style lines,
0 color tokens**. It extends four existing typed maps (`RADIOGROUP_LABEL`,
`DISABLED_REASON`, `IN_SCOPE`, and the `parsed`/`replacement` unions) and adds
branches to `parsedFields`, `rawLabel` and `formatRaw`. There is no new visual
structure, so the slop, layout, motion and contrast dimensions have no surface
to fail on.

### Findings and dispositions

| # | Sev | Finding | Disposition |
| - | --- | ------- | ----------- |
| 1 | P1 | The new radiogroup's accessible name read `Hotel name and address`, while its three siblings are full sentences (`Which reading crew pages use for the room split`). A screen-reader user hearing the set in sequence gets one label that does not parse like the others. | **FIXED** in the component AND in the spec's normative copy table (C-row), which carried the same defect. |
| 2 | — | Em-dash ban in user-visible copy | Pass — no em-dash in any new string. |
| 3 | — | Apostrophe literals | Pass — straight `'`, matching the existing sibling strings in the same map exactly. |
| 4 | — | 44px tap targets | N/A — no new interactive element. |
| 5 | — | Canonical type/token classes | N/A — no new className. |
| 6 | — | New color token contrast | N/A — no token added, so no contrast meta-test is owed. |

No P0. The single P1 is fixed, not deferred, so `DEFERRED.md` gains no row.

**Verification:** 1901 tests pass across `tests/components` + `tests/admin`.
