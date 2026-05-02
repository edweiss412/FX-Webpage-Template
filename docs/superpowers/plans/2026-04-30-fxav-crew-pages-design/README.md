# FXAV Crew Pages Implementation Plan

**Plan date:** 2026-04-30
**Spec:** [`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md`](../../specs/2026-04-30-fxav-crew-pages-design.md)
**Goal:** Build a Next.js + Supabase web app that turns Doug Larson's per-show Google Sheets into per-crew-member, mobile-first webpages, with sub-second sync via Drive push notifications, role-based field hiding, signed-link sharing, and a full admin/onboarding/bug-report surface.

This plan has been split from a single 9,719-line monolithic file into a per-milestone directory for easier navigation and review. The split is verbatim — no content was paraphrased, removed, or reformatted. Use `grep -r` across this directory to find any task by number.

---

## File map

| File | Contents | Lines |
| --- | --- | --- |
| [00-overview.md](00-overview.md) | Goal, architecture, tech stack, "How to use this plan", file structure, ratified spec amendments | 186 |
| [01-foundation.md](01-foundation.md) | **Milestone 0** — Repository bootstrap, tooling, env (Tasks 0.1–0.6); **Milestone 1** — Parser standalone (Tasks 1.1–1.14, AC-1.1..1.10) | 1,163 |
| [02-schema-rls.md](02-schema-rls.md) | **Milestone 2** — Schema, RLS, migrations, seed (Tasks 2.1–2.5, AC-2.1..2.7) | 1,537 |
| [03-04-tiles.md](03-04-tiles.md) | **Milestone 3** — Admin upload-test (Tasks 3.1–3.2, AC-3.1..3.3); **Milestone 4** — Crew page, no auth (Tasks 4.1–4.16, AC-4.1..4.12) | 768 |
| [05-auth.md](05-auth.md) | **Milestone 5** — Auth (Tasks 5.1–5.11, AC-5.1..5.14) | 387 |
| [06-drive-sync.md](06-drive-sync.md) | **Milestone 6** — Drive sync, cron + push (Tasks 6.1–6.13, AC-6.1..6.27, AC-8.9..8.13 partial overlap) | 656 |
| [07-asset.md](07-asset.md) | **Milestone 7** — Linked content (Tasks 7.1–7.9, AC-7.1..7.24) | 322 |
| [08-bug-report.md](08-bug-report.md) | **Milestone 8** — Bug-report pipeline (Tasks 8.1–8.5 incl. 8.3a–8.3g, AC-8.1..8.13) | 1,261 |
| [09-10-admin.md](09-10-admin.md) | **Milestone 9** — Stale-data UX, error states, polish (Tasks 9.1–9.4, AC-9.1..9.3); **Milestone 10** — Onboarding wizard (Tasks 10.1–10.10, AC-10.1..10.6) | 1,365 |
| [11-cross-cutting.md](11-cross-cutting.md) | Cross-cutting tasks X.1–X.6 (AC-X.1..X.6) | 2,024 |
| [99-execution.md](99-execution.md) | Self-review checklist + Execution handoff | 80 |

---

## How to use this plan

1. **Required sub-skill.** Use [`superpowers:subagent-driven-development`](../../../../.claude/skills/superpowers/subagent-driven-development) (recommended) or [`superpowers:executing-plans`](../../../../.claude/skills/superpowers/executing-plans) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
2. **Read 00-overview.md first.** It contains the goal, architecture, tech stack, ratified amendments to the spec, the canonical file structure, and the seven plan-wide invariants (TDD, per-show advisory lock, email canonicalization, no global cursor, no raw error codes in UI, etc).
3. **Work milestone-by-milestone, top-to-bottom within each file.** Each task has its own TDD red→green→commit loop. Commit per task, don't batch.
4. **Spec is canonical, with the three amendments listed in 00-overview.md.** When a task and the spec disagree on anything other than those amendments, the spec wins — open a question, do not silently fix it in the plan.

---

## Cross-reference convention

Task numbers are **stable across the split** — `Task 5.1` still lives in `05-auth.md` as `### Task 5.1: …`. Cross-references inside the plan use textual `Task X.Y step Z` form. To find any task by number, grep across this directory:

```sh
grep -rn "Task 6.7" docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/
```

Spec section references (`§5.2`, `§7.2.2`, etc.) point into the single-file spec at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md` — that file was **not** split and remains the canonical spec.

`<!-- spec-id: ... -->` HTML comment anchors are preserved verbatim and continue to work for the X.6 traceability matrix once the walker is updated to read from this directory.

