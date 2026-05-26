# `docs/superpowers/plans/` — Project Plan Catalog

Implementation plans for the FXAV crew-pages project. Organized by **release era**, not by date-of-creation.

## Release model

- **v1** = the pre-deployment effort to put a dev-approved app in Doug/crew hands.
- **v1.X+** (post-deployment) = changes/additions to UX/UI driven by real usage feedback after v1 ships. Each post-deployment release lands as its own peer plan at the top of this directory.
- **v2** = reserved for an eventual larger architectural/scope shift; no work scheduled.

## v1 release bundle (current focus)

Everything that must close before Doug touches the product. Composed of one master plan plus three in-flight amendment plans. All v1 milestone handoffs (M0–M13) centralize in the master plan's `handoffs/` directory regardless of which amendment owns the work — the master plan dir is the release spine.

| Role | Path | Status | Notes |
| --- | --- | --- | --- |
| **Master plan** | [`2026-04-30-fxav-crew-pages-v1/`](./2026-04-30-fxav-crew-pages-v1/) | M0–M11 closed (tag `m10-completed` covers M0–M10; M11 + Phases F–G also closed); M11.5 closed at `b4b2c38` 2026-05-25 | Core product implementation (parser, schema, tiles, auth, sync, assets, bug-report, polish, onboarding) + cross-cutting audits + the centralized `handoffs/` dir for the whole v1 bundle. Spec: [`../specs/2026-04-30-fxav-crew-pages-v1.md`](../specs/2026-04-30-fxav-crew-pages-v1.md). |
| **Amendment — M11** | [`v1-pre-deployment-amendments/2026-05-12-user-facing-docs/`](./v1-pre-deployment-amendments/2026-05-12-user-facing-docs/) | Closed | In-app `/help` wiki for Doug. 13 pages + screenshot harness + §9.0.1 affordance retrofit. Spec: [`../specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md`](../specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md). Handoff lives in master plan's `handoffs/`. |
| **Amendment — M11.5** | [`v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md`](./v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md) | Closed at `b4b2c38` 2026-05-25 | Crew auth pivot to one show-link + "who are you?" picker. Single-file plan (no sub-directory). Spec: [`../specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md`](../specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md). |
| **Amendment — M12** | [`v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/`](./v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/) | In progress; spec rebased 2026-05-26 for M11.5 picker pivot; adversarial review at R7 | Solo-dev UX validation gate before launch. Phase 0 infra + tooling + smokes; Phase 1 matrix walk + 4 journeys; sign-off doc. Spec: [`../specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md`](../specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md). |

**M13 — v1 launch** is tracked inside the M12 plan as its successor milestone (v1.0 release moment). When it lands, the v1 bundle closes.

## v1.X+ post-deployment plans (future)

Plans created after the v1 release will land as **top-level peers** of `2026-04-30-fxav-crew-pages-v1/`, *not* inside `v1-pre-deployment-amendments/`. Suggested naming: `2026-XX-XX-v1.1-{slug}/` so the version is in the path. The pre-deployment-amendments subdir is frozen at v1 release; it's a historical artifact of the launch bundle.

## Speculative future work (not yet a plan)

Lives in [`BACKLOG.md`](./BACKLOG.md). Three current clusters: operator-log sink + producers, push notifications, private-image-pipeline migration. None have a spec/plan; promotion to a real plan requires the standard spec + brainstorming + planning cycle.

## Dependency graph

```
M0 → M1 → M2 → M3 → M4 → M5 → M6 → M6.5 → M7 → M8 → M9 → M10 → M11 → M11.5  ✅ closed
                                                                          ↓
                                                                         M12  ⏳ in progress (solo-dev UX validation)
                                                                          ↓
                                                                         M13  ⏳ v1.0 launch (Doug receives the app)
                                                                          ↓
                                                              ─────── v1 closes ───────
                                                                          ↓
                                                                       v1.1+  ❓ post-deployment, feedback-driven
                                                                          ↓
                                                                    BACKLOG.md ❓ speculative
```

Post-M11 sequencing locked 2026-05-23: M11.5 → M12 → M13 (no parallelization through the picker-pivot bottleneck).

## Conventions

- **One plan per major effort within the bundle.** Don't merge amendments into the master plan dir.
- **Spec is canonical** (AGENTS.md invariant #7). Plans implement specs; they don't override them. Small textual spec amendments live in [`../specs/amendments/`](../specs/amendments/) and are integrated by cross-reference; large amendment-shaped specs (M11/M11.5/M12) live in [`../specs/v1-pre-deployment-amendments/`](../specs/v1-pre-deployment-amendments/).
- **Centralized handoffs.** All v1 milestone handoffs live in [`2026-04-30-fxav-crew-pages-v1/handoffs/`](./2026-04-30-fxav-crew-pages-v1/handoffs/), regardless of which amendment plan owns the work. Each amendment plan's README cites its handoff there.
- **Each plan has its own DEFERRED.md.** Cross-plan deferrals (rare) carry an explicit cross-reference. See AGENTS.md invariants + memory `feedback_deferral_discipline.md`.
- **Each plan has its own ROUTING.md** assigning implementer + adversarial reviewer per milestone/phase. All v1 plans use the same Opus/Claude Code ↔ GPT-5.5/Codex pairing with the "UI work always Opus" hard rule.
- **HTML companions** under a plan (`html/`) hold stakeholder-facing renderings per the `docs/CLAUDE.md` markdown-canonical-HTML-additional convention. They're never canonical; the markdown is.
