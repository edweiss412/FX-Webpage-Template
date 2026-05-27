# M12.1 — pg_cron pivot plan overview

**Status:** DRAFT (R0) — pending self-review + adversarial review.
**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md`.
**Handoff:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12.1-pg-cron-pivot.md`.
**Base SHA:** `ac752d9` (M12 R70 APPROVED close-out).
**Diff target:** sub-amendment work converges to a new SHA on `main` that supersedes the cron-architecture portion of M12 R70.

## Goal

Pivot the FXAV production cron architecture from Vercel Cron to Supabase `pg_cron` + `pg_net`, so that:

1. Vercel deploy succeeds on the free Hobby tier (current M12 Phase 0.A.4 blocker dissolved).
2. The cron firing surface is permanent at $0/month, with 1-min granularity ceiling preserved.
3. Validation env (M12 Phase 0+) runs the same cron architecture M13 launches on (prod-equivalence preserved per M12 spec §9).

## What "DONE" means for this sub-amendment

A green Phase 0.A.4 retry: `vercel deploy --prod --yes` on the `fxav-crew-pages-validation` project succeeds end-to-end and emits a `*.vercel.app` production URL. The 7 pg_cron jobs are scheduled in the validation Supabase project and observably firing (cron.job_run_details shows successful invocations within one schedule interval of activation). All structural meta-tests pass.

## Task index

Five tasks, sequenced. Each is its own TDD cycle (failing test → minimal change → green → commit) per AGENTS.md invariant 1.

| Task | Title | Surface | Commit shape |
|---|---|---|---|
| **T1** | `vercel.json` crons removal | `vercel.json` | `chore(infra): remove vercel.json crons block (M12.1 T1; pg_cron pivot)` |
| **T2** | `pg_net` extension + Vault `fxav_cron_secret` entry | `supabase/migrations/<ts>_enable_pg_net.sql` + `<ts>_cron_secret_vault.sql` | Two commits: `feat(db): enable pg_net extension (M12.1 T2.1)` + `feat(db): add fxav_cron_secret to supabase_vault (M12.1 T2.2)` |
| **T3** | 7× `cron.schedule()` migration | `supabase/migrations/<ts>_schedule_cron_jobs.sql` | `feat(db): schedule 7 fxav cron jobs via pg_cron + pg_net (M12.1 T3)` |
| **T4** | Structural defenses (meta-tests) + canonical job-table JSON | `tests/cross-cutting/no-vercel-cron.test.ts` + `tests/cross-cutting/pg-cron-coverage.test.ts` + `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json` | `test(cross-cutting): pin no-vercel-cron + pg-cron-coverage invariants (M12.1 T4)` |
| **T5** | M12 plan amendment (insert Task 0.A.4.5 + update Task 0.A.5) | `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/01-phase0-infra.md` | `docs(plan-m12): insert Task 0.A.4.5 + update 0.A.5 for pg_cron pivot (M12.1 T5)` |

See `01-pivot-tasks.md` for task-level checklists, TDD steps, and verification commands.

## Convergence approach

- **Sub-amendment lives in its own dir.** M12 R70 APPROVE stays intact at `ac752d9`. M12.1 has its own convergence log in the handoff doc, its own R-numbering, its own DEFERRED.md.
- **Self-review then adversarial review.** Per AGENTS.md `superpowers:writing-plans` discipline. Standard adversarial-review pattern (NOT the M12 amendment-loop stop gates A+B+C, which were scoped to that loop). Iterate until codex returns APPROVE.
- **Expected round count: 3-8.** Well-scoped change with no UI surface, narrow citations, clear structural defenses. Same-vector recurrence response per AGENTS.md "writing-plans additions" applies if any class recurs 3+ rounds.
- **Phase 0.A executor unblock.** Once M12.1 executes (T1-T5 all commit), Phase 0.A executor resumes at Task 0.A.4 (Vercel deploy retry) → 0.A.4.5 (new, added by T5: Vault populate + GUC + apply migrations) → 0.A.5 (env-var wiring; `CRON_SECRET` newly in scope) → 0.A.6 → Block 2.

## Reads list (for the executor when M12.1 lands)

1. `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot-design.md` — sub-amendment spec
2. `01-pivot-tasks.md` (this dir) — task checklists
3. `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12.1-pg-cron-pivot.md` — handoff + convergence log
4. M12 spec §9.1 + §9.1.2 + §9.1.3 (new) + §9.2 — the amended contract surface

## Plan-wide invariants (apply during execution)

All AGENTS.md plan-wide invariants apply unchanged. Specifically load-bearing for M12.1:

- **Invariant 1 (TDD per task):** every commit follows failing test → minimal implementation → passing test. T4 is the structural defense; T1/T2/T3 each get an in-task assertion (T1: vercel.json key absence; T2: extension presence + vault entry presence; T3: cron.job row presence with matching jobname+schedule+command).
- **Invariant 9 (Supabase call-boundary discipline):** the pg_net call inside `cron.schedule()` body is server-side SQL, not a Supabase JS client call — but its semantics ARE a Supabase call boundary. The pg-cron-coverage meta-test pins the call topology and serves as the boundary contract.
- **Invariant 6 (commit-per-task):** five tasks, six commits (T2 splits into T2.1 + T2.2). Conventional-commits format per the table above.

## Out of scope (do NOT do in M12.1)

- Modify any `app/api/cron/*` route handler (they already accept bearer auth — verified in spec §1.2 + §4)
- Touch M11.5-IMP-1/2/4 UI carryovers (those land in M12 Phase 0.A Block 2 per the M12 plan, AFTER M12.1 unblocks Phase 0.A.4)
- Reschedule the bootstrap signing-key cron at `supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:36` (independent, untouched)
- Add per-cron-job feature flags or runtime kill switches (out of scope; if needed, file in BACKLOG.md)
- Migrate to GitHub Actions / Cloudflare / Upstash as a fallback path (those were the rejected alternatives in spec §1.1)

## Anti-tautology checklist for M12.1 tests

- **T4 `pg-cron-coverage.test.ts` MUST query live DB introspection** (`select * from cron.job`) — NOT a mocked or hand-rolled fixture of what the migration "should produce." Mocked-only invites tautological APPROVE per the cross-cutting discipline.
- **T4 expected values MUST be derived from the spec §2.3 table** (or a sibling JSON canonical source), NOT hardcoded in the test body. If the spec table changes, the test must follow without code edit; if the migration drifts from the spec, the test fails.
- **T1 `no-vercel-cron.test.ts` MUST scan `vercel.json` + walk `app/`, `lib/`, `tests/`** for forbidden substrings (`x-vercel-cron`, `VercelCron`, `vercel-cron` — case-insensitive) with documented inline-waiver markers for any HISTORICAL row that must mention the term (e.g., the spec §1017 audit-trail row).

## Watchpoints (do-not-relitigate; cite if a reviewer pushes back)

- **pg_cron over GitHub Actions chosen explicitly** per spec §1.1. GH Actions' 5-min minimum + best-effort scheduling is documented; not a finding to relitigate.
- **Vault over GUC chosen explicitly** per spec §2.3. Rotation discipline + encrypted-at-rest is the rationale; not a finding to relitigate.
- **Handler code is already bearer-token-compatible** per spec §1.2 + §4 (7 grep hits at `app/api/cron/*/route.ts`). Any reviewer claim that handler code "needs to be modified" is incorrect; cite `app/api/cron/_auth.ts:3-12`.
- **The `vercel.json` crons block is REMOVED, not retained-but-ignored.** Hobby tier rejects deployments that DECLARE crons exceeding daily, even if those crons would never fire. Removal is the only working path.
- **Stop gates A+B+C from M12 amendment loop do NOT carry forward.** M12.1 uses standard adversarial-review pattern per AGENTS.md routing.
