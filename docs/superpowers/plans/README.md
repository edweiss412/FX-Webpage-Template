# `docs/superpowers/plans/` — Project Plan Catalog

This directory holds the implementation plans for the FXAV crew-pages project. Each timestamped subdirectory is one major-effort plan following the `superpowers` convention (one plan per major effort, dependencies cross-referenced rather than merged).

## Plans

| Plan dir | Effort | Status | Depends on | Notes |
| --- | --- | --- | --- | --- |
| [`2026-04-30-fxav-crew-pages-design/`](./2026-04-30-fxav-crew-pages-design/) | **FXAV crew pages v1** (M0–M10 + X.\*) | M0–M10 closed (tag `m10-completed`); **X.\* next** | — | The core product implementation: parser, schema, tiles, auth, sync, assets, bug-report pipeline, polish, onboarding wizard, plus cross-cutting audits. Spec: [`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`](../specs/2026-04-30-fxav-crew-pages-design.md). |
| [`2026-05-12-user-facing-docs/`](./2026-05-12-user-facing-docs/) | **User-facing docs (M12)** | Plan drafted r1; spec ratified through 10 rounds of adversarial review; **execution unblocked once X.\* picks a model+harness rhythm** | M10 (closed) | In-app wiki at `/help` for Doug. 13 pages + screenshot harness + §9.0.1 affordance retrofit. Spec (canonical markdown): [`docs/superpowers/specs/2026-05-12-user-facing-docs-design.md`](../specs/2026-05-12-user-facing-docs-design.md). Companion stakeholder HTML: [`2026-05-12-user-facing-docs-design.html`](../specs/2026-05-12-user-facing-docs-design.html). |

## Hypothetical (not yet planned)

| Effort | Why it's not a real plan | Current home |
| --- | --- | --- |
| **M11 (post-v1 ops-hardening)** — operator-log sink, Sentry integration, admin-banner producers, observability tooling | No spec, no plan dir. Referenced informally in DEFERRED.md entries (M10-D-PHASE1-1, M5-D9/D10/D11) routed there. The first step toward landing any "M11" item is to **scope and plan the milestone** (spec + plan tree analogous to the two above), not to implement the deferred item directly. | [`2026-04-30-fxav-crew-pages-design/DEFERRED.md`](./2026-04-30-fxav-crew-pages-design/DEFERRED.md) header "Note on milestone numbering" |
| Push notifications (M11+ or post-v1) | Out of v1 scope per design memo. Depends on real Doug-workflow data + email-provider integration. | Same DEFERRED.md (entry M6-D1) |

## Dependency graph (current)

```
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M6.5 (coda) → M7 → M8 → M9 → M10  ✅ closed
                                                                    ↓
                                                                   X.*  ⏳ next (cross-cutting)
                                                                    ↓
                                                                   M12  ⏳ unblocked (depends only on M10)
                                                                    ↓
                                                                   M11  ❓ not yet planned (post-v1 ops-hardening)
```

X.\* and M12 are **independent** — they can run in parallel or sequentially. The X.\* cross-cutting tasks audit and harden the FXAV crew-pages codebase; M12 builds the `/help` documentation site. They share no source-file surfaces other than `lib/messages/catalog.ts` (X.1 catalog parity audit; M12 Phase B catalog extension), which can coordinate through ordering or pin-stops if both touch it concurrently.

## Convention reminders

- **One timestamped plan per major effort.** Don't merge sibling plans into one mega-directory.
- **Spec is canonical** (per AGENTS.md invariant #7). Plans implement specs; they don't override them. Spec amendments live alongside the spec file (`docs/superpowers/specs/amendments/`) and are integrated into the canonical spec body via cross-reference.
- **Each plan has its own DEFERRED.md** (or will, once it generates deferrals). Cross-plan deferrals (rare) carry an explicit cross-reference. See AGENTS.md invariants + memory `feedback_deferral_discipline.md` for the discipline rules.
- **Each plan has its own ROUTING.md** assigning implementer + adversarial reviewer per milestone/phase. Both plans here use the same Opus/Claude Code ↔ GPT-5.5/Codex pairing with the project's "UI work always Opus" hard rule.
- **`html/` subdirectories under a plan** hold stakeholder-facing HTML renderings of the plan's content per the `docs/CLAUDE.md` markdown-canonical-HTML-additional convention. They're never canonical; the markdown is.
