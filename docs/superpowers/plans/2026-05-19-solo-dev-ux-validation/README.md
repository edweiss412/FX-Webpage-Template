# M12 — Solo-Dev UX Validation Plan

**Spec:** [`docs/superpowers/specs/2026-05-19-solo-dev-ux-validation-design.md`](../../specs/2026-05-19-solo-dev-ux-validation-design.md) — 25 rounds of cross-CLI adversarial review baked in.

**Status:** Plan drafted; adversarial-review-in-progress (up to 40 rounds per user authorization).

**Dependency:** M11 (user-facing-docs `/help` site) must close before M12 starts. See `00-overview.md` § "Sequencing dependency on M11".

**Successor:** M13 — v1 launch (consumes M12 sign-off as a prerequisite). M13 is the milestone where Doug's first use of the product lands.

## Files

- `00-overview.md` — plan-wide invariants, file structure, sequencing, meta-test inventory, disagreement preempts.
- `01-phase0-infra.md` — Vercel production-target deployment + Supabase prod + Drive service account stand-up.
- `02-phase0-validation-state.md` — atomic migration + master-spec amendments + test baseline updates.
- `03-phase0-tooling-reseed.md` — `validation:reseed` + `check-seed` + `resolve-alias` CLIs.
- `04-phase0-tooling-link.md` — `validation:mint-link` + `revoke-link` CLIs.
- `05-phase0-tooling-report.md` — `validation:report-fixtures` harness (BLOCKING by default).
- `06-phase0-smokes.md` — 6+1 conditional Phase 0 smoke tests.
- `07-phase1-matrix-walk.md` — MATRIX-INVENTORY.md derivation + matrix walk + 4 journeys + cold-start pass.
- `08-iteration-and-final-sweep.md` — fix loop + final sweep + sign-off.
- `DEFERRED.md` — per-plan deferred items.
- `HANDOFF-TEMPLATE.md` — round-by-round audit trail template (for the plan's own adversarial review).
- `ROUTING.md` — implementer/reviewer assignment per phase.
- `handoffs/` — per-round handoff docs (empty at plan-write).
- `MATRIX-INVENTORY.md` — generated in Phase 1 Task 1.0 (plan-time, frozen before walk).
- `SIGN-OFF.md` — generated in Phase 8 Task 2.6 (the single required exercise artifact).

## Quick start

Read `00-overview.md` first. Then walk the phase files in order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08. No parallelization.

## HTML companion

**None — and intentionally so.** Per `docs/CLAUDE.md`'s convention (HTML is for non-technical human stakeholders — clients, execs, designers, layperson reviewers), M12 does not warrant an HTML companion. The audience for every M12 artifact is either the dev (technical) or future agent sessions (Opus / Codex). Doug is the *subject* of the validation gate, not a reader of the M12 docs.

If the v1-launch milestone (M13) ships with stakeholder communication, that's where HTML would belong — not here.
