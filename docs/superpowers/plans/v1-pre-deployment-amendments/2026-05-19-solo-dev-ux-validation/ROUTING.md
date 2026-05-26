# M12 Routing

Per AGENTS.md "UI work is always Opus" hard rule + the project's standard routing convention.

| Phase | Implementer | Reviewer | Rationale |
|---|---|---|---|
| 0.A — Infra stand-up | Opus / Claude Code | (no per-phase review — infra config) | Project setup; no code. |
| 0.B — Migration + master-spec amendments + test baselines | Opus / Claude Code | Codex (cross-CLI) — adversarial review on the atomic PR | Master spec amendments + admin-only DB table need careful review. Same routing as M0–M10 schema work. |
| 0.C — Reseed/check-seed/resolve-alias scripts | Opus / Claude Code | Codex — cross-CLI adversarial review | Scripts are dev-tooling; same routing as `scripts/` work elsewhere in the project. |
| ~~0.D — Mint-link / revoke-link scripts~~ | **DELETED 2026-05-26 picker-pivot amendment** — the M9.5 `signLinkJwt` + `revoked_links` surfaces these tools wrapped were dropped at M11.5 G3 cutover (`20260523000099_cutover_drop_m9_5.sql`); the M11.5 admin UI (`RotateShareTokenButton` + `ResetPickerEpochButton`) is the canonical destructive-action interface; no CLI parity is in M12 scope. See spec §15.26. | — | — |
| 0.E — Report-fixtures harness | Opus / Claude Code | Codex — cross-CLI adversarial review | Service-role write tooling; same routing as `lib/data/` work. |
| 0.F — Phase 0 smokes | Opus / Claude Code | (no per-phase review — manual smoke runs) | Manual exercise of the prod-equivalent stack. |
| Phase 1 — Matrix walk + journeys + cold-start | Opus / Claude Code | (no per-phase review — manual exercise) | The dev (Opus driver) IS the exercise; not a code-review surface. |
| Phase 7 — Iteration + final sweep + sign-off | Opus / Claude Code | Codex — cross-CLI adversarial review on fixes (per-fix; matches M0–M10 pattern) | Fixes are code; same routing as the surfaces being fixed. |

**Plan tree adversarial review** (this directory's 00-overview + phase files): Codex runs up to 40 rounds per user R0 authorization. Each round is fresh-eyes, anchored on milestone-base.

**Plan tree implementer** (the M12 plan itself, i.e., this directory): Opus / Claude Code (M12 spec is at `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md`; plan derives from it; the spec went through 25 rounds of cross-CLI review).
