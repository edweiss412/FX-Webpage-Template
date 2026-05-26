# `docs/superpowers/plans/` — Project Plan Catalog

This directory holds the implementation plans for the FXAV crew-pages project. Each timestamped subdirectory is one major-effort plan following the `superpowers` convention (one plan per major effort, dependencies cross-referenced rather than merged).

## Plans

| Plan dir | Effort | Status | Depends on | Notes |
| --- | --- | --- | --- | --- |
| [`2026-04-30-fxav-crew-pages-v1/`](./2026-04-30-fxav-crew-pages-v1/) | **FXAV crew pages v1** (M0–M10 + X.\*) | M0–M10 closed (tag `m10-completed`); **X.\* next** | — | The core product implementation: parser, schema, tiles, auth, sync, assets, bug-report pipeline, polish, onboarding wizard, plus cross-cutting audits. Spec: [`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`](../specs/2026-04-30-fxav-crew-pages-v1.md). |
| [`2026-05-12-user-facing-docs/`](./2026-05-12-user-facing-docs/) | **User-facing docs (M11)** | Plan drafted r1; spec ratified through 10 rounds of adversarial review; **execution unblocked once X.\* picks a model+harness rhythm**. Originally drafted as "Milestone 12"; renumbered to M11 on 2026-05-19 since no real M11 existed (see [`BACKLOG.md`](./BACKLOG.md) for the speculative work the old "M11 ops-hardening" label aliased). | M10 (closed) | In-app wiki at `/help` for Doug. 13 pages + screenshot harness + §9.0.1 affordance retrofit. Spec (canonical markdown): [`docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md`](../specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md). Companion stakeholder HTML: [`2026-05-12-user-facing-docs-design.html`](../specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.html). |

## Possible future work (not yet planned milestones)

Lives in [`BACKLOG.md`](./BACKLOG.md). Three current backlog clusters: operator-log sink + producers (was M5-D9/D10/D11 + M10-D-PHASE1-1), push notifications (was M6-D1), private-image-pipeline migration (was M7-D3). None have a spec or plan tree; promotion to a real milestone requires the standard spec + brainstorming + planning cycle.

## Dependency graph (current)

```
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M6.5 (coda) → M7 → M8 → M9 → M10  ✅ closed
                                                                    ↓
                                                                   X.*  ⏳ next (cross-cutting audits)
                                                                    ↓
                                                                   M11  ⏳ unblocked (user-facing docs; depends only on M10)
                                                                    ↓
                                                                  BACKLOG.md  ❓ speculative post-v1 work (ops-log, push, image-pipeline)
```

X.\* and M11 are **independent** — they can run in parallel or sequentially. The X.\* cross-cutting tasks audit and harden the FXAV crew-pages codebase; M11 builds the `/help` documentation site. They share no source-file surfaces other than `lib/messages/catalog.ts` (X.1 catalog parity audit; M11 Phase B catalog extension), which can coordinate through ordering or pin-stops if both touch it concurrently.

## Convention reminders

- **One timestamped plan per major effort.** Don't merge sibling plans into one mega-directory.
- **Spec is canonical** (per AGENTS.md invariant #7). Plans implement specs; they don't override them. Spec amendments live alongside the spec file (`docs/superpowers/specs/amendments/`) and are integrated into the canonical spec body via cross-reference.
- **Each plan has its own DEFERRED.md** (or will, once it generates deferrals). Cross-plan deferrals (rare) carry an explicit cross-reference. See AGENTS.md invariants + memory `feedback_deferral_discipline.md` for the discipline rules.
- **Each plan has its own ROUTING.md** assigning implementer + adversarial reviewer per milestone/phase. Both plans here use the same Opus/Claude Code ↔ GPT-5.5/Codex pairing with the project's "UI work always Opus" hard rule.
- **`html/` subdirectories under a plan** hold stakeholder-facing HTML renderings of the plan's content per the `docs/CLAUDE.md` markdown-canonical-HTML-additional convention. They're never canonical; the markdown is.
