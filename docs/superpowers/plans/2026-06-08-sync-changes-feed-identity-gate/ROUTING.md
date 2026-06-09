# Routing — Sync changes feed + identity-only gate

Per-phase implementer + cross-model reviewer. Defers to the project `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/ROUTING.md` (hard rule: **all UI work is Opus**). Full per-phase table + scope in `00-overview.md`.

| Phase | Implementer | Cross-model reviewer |
|---|---|---|
| 1 — Tables & lockdown | Codex | Opus |
| 2 — Decision rule & hold-aware apply | Codex | Opus |
| 3 — MI-11 gate RPCs | Codex | Opus |
| 4 — Undo & tombstone | Codex | Opus |
| 5 — Feed data layer | Codex | Opus |
| 6 — UI: feed + gate + undo | **Opus + impeccable** | Codex |

- Backend phases (1–5) run under Codex (`codex-companion task`), TDD per AGENTS.md, reviewed cross-model by the Opus side.
- The UI phase (6) is Opus + the impeccable v3 dual-gate (NOT `frontend-design`), reviewed cross-model by Codex.
- Whole-plan adversarial review (this plan) ran before execution handoff (see handoff doc). Per-phase adversarial review is the last task of each phase.
- Migrations land in the validation project + manifest regen in the phase that adds them (`validation-schema-parity` enforces) — never deferred.
