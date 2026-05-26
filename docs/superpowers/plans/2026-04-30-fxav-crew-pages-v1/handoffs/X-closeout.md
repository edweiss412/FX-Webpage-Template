# Handoff — Whole-X.* close-out (composed audit set)

**Status: COMPLETED 2026-05-21 at R11 APPROVE on SHA `dd50732`.** Eleven-round cross-CLI adversarial-review convergence loop against base `28410a9` (the M10 tagged milestone-base) closed every finding surfaced across the full X.* + M11 Phase A-E + M9.5 + spec amendments + BACKLOG split diff. 15 production-code repair commits + 1 traceability accommodation + 2 contract-level structural meta-tests landed; 8 off-scope M9.5 plan iteration commits Codex made during the loop are kept per user decision 2026-05-21.

---

## What this doc is

The X.6 handoff (`handoffs/X6-traceability.md`) records the close of the last individual X.* task. This doc records the **whole-X.* composed close-out** that the user requested separately on 2026-05-20: "Begin the cross model adversarial review convergence loop --base 28410a9 'Whole-X.* close-out — fresh-eyes audit across all six cross-cutting audits as a composed set.'"

That request anchored the review at the M10 tagged base, not at X.6's individual milestone base, so the loop audited every commit since M10 — X.1 through X.6, M11 Phase A through E, the M9.5 plan scaffolding, all spec amendments, and the BACKLOG.md split. The point of the composed close-out was to catch integration bugs that per-task reviews could miss because each task only reviews its own commit range.

It worked. R11 was the first round with no findings. Eight prior rounds each surfaced one or more real bugs that the per-task X.* reviews had missed.

## Convergence ledger

| Round | Verdict | Findings (file:line summary) | Repair commit | Vector |
|---|---|---|---|---|
| R1 | needs-attention | sync `runManualStageForFirstSeen.ts:42` stranded `auto_publish_ready`; migration `20260520000911:1-37` no backfill before CHECK | `065b052` + `b789703` | sync retry strand + db CHECK timing |
| R2 | needs-attention | sync `runScheduledCronSync.ts:931` `insertParamsForSlug` returns 18 params for 20-placeholder INSERT | `687c7ab` (+ structural `_insertParamsArityContract`) | sync param/placeholder arity |
| R3 | needs-attention | sync retry missing `snapshotAssetsForApply`/`snapshotAssetsForApplyForShowId`/`verifyReelOnApply`; reports `submit.ts:489-496` missing `lease_holder` fence; workflow reader unconditionally red after X6-D-1 | `0e4b0ff` + `a359cfb` + `274819c` (+ `a5a3ecc` traceability) | sync retry phase2 args + reports lease + workflow gate |
| R4 | needs-attention | `package.json:24` `test:audit:x1` runs entire `tests/cross-cutting/` (drags in live-DB tests); CI workflow doesn't provision DB | `b36240f` | audit-script CI DB wiring |
| R5 | needs-attention | sync retry runs Phase 2 then returns `applied` without the cron's post-Phase-2 tail (no `SHOW_FIRST_PUBLISHED` admin_alert) | `0dde70f` (+ widened `_phase2ArgsParityContract` to 4 dimensions) | sync missing post-Phase-2 tail |
| R6 | needs-attention | `emitFirstPublishedNotice` defaults to `defaultUpsertAdminAlert` (global Supabase client) while inside `sql.begin` tx; uncommitted `shows` row → FK race | `781654c` (+ new `_inTxAdminAlertContract.test.ts`) | sync in-tx admin_alerts global-client fallback |
| R7 | needs-attention | Migration's `report_rate_limits.identity` UPDATE collides on `(kind, identity, hour_bucket)` PK when canonical + non-canonical exist in same hour | `7744bb0` | db PK collision narrow class |
| R8 | needs-attention | R7's coalesce CTE only matched non-canonical+canonical pairs; two non-canonicals normalizing to same key also collide | `59b18c7` (PL/pgSQL FOR loop for per-statement sequencing) | db PK collision wider class |
| R9 | needs-attention | CHECKs allow `''` but `canonicalize()` rejects empty; `shows_pending_changes.applied_by_email` missing from manifest + CHECK | `9a58537` + `add9c8d` (+ `_canonicalEmailCheckContract.test.ts`) + `baa06ac` (followup: crew-side + admin_emails) | db canonicalize() contract alignment |
| R10 | needs-attention | 3 help MDX pages reference `<Screenshot>` components whose WebP assets aren't in `public/help/screenshots/` (deferred to Phase F) | `dd50732` (revert to `<ScreenshotPlaceholder>`) | help premature `<Screenshot>` w/o WebPs |
| **R11** | **APPROVE** | — | — | — |

## Structural defenses landed during the loop

The loop produced four contract-level meta-tests that close the recurring-bug classes structurally (rather than per-instance):

1. **`tests/sync/_insertParamsArityContract.test.ts`** (R2) — parses the INSERT SQL placeholder count + the `insertParamsForSlug` array length, asserts equality. Catches future drift between SQL and TS sides of the same INSERT.
2. **`tests/sync/_phase2ArgsParityContract.test.ts`** (R3, widened in R5) — compares cron-path vs retry-path on FOUR dimensions: runPhase2 args, post-Phase-2 awaited side-effect call shape, recursively-derived admin alert codes, shared-tail call object keys.
3. **`tests/sync/_inTxAdminAlertContract.test.ts`** (R6) — walks every file under `lib/sync/`, identifies functions whose deps type contracts as in-transaction (refs `SyncPipelineTx`/`LockedShowTx`), greps for `?? defaultUpsertAdminAlert` / `?? default*Client` fallbacks, asserts the count is zero unless explicitly annotated. Encodes AGENTS.md §1.9 ("Supabase call-boundary discipline") at CI time.
4. **`tests/cross-cutting/_canonicalEmailCheckContract.test.ts`** (R9) — parses every `*_email_canonical` CHECK constraint in `supabase/migrations/`, asserts the predicate matches `canonicalize()`'s contract (lower + trim + reject-empty + nullability-aware); walks `lib/audit/email-boundaries.generated.ts` and asserts every entry has a corresponding CHECK.

These four meta-tests together encode the actual contracts the project has been writing per-instance for milestones. Their existence is the structural payoff of the convergence loop.

## Vector retrospective — same-vector recurrence patterns

Two vectors took multiple rounds despite the comprehensive-re-analysis discipline codified in memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis.md`:

**Sync first-seen auto-publish** ran 5 rounds (R1, R2, R3, R5, R6). After each round's repair, the next round found a different aspect of the same surface that the comprehensive re-analysis had missed. R3 + R5 structural defenses (params arity → tail parity) were **within-class parity** checks — they compared two implementations of the same incorrect contract. R6's `_inTxAdminAlertContract` was the first **contract-level** defense and finally closed the class. The codifiable lesson is in `feedback_structural_defense_narrower_than_class.md` (new this round).

**Email-canonical migration** ran 4 rounds (R1-F2, R7, R8, R9). R7's PK-collision merge handled non-canonical+canonical pairs only; R8 widened to two-non-canonicals; R9 surfaced that the CHECK predicate itself didn't match `canonicalize()` (`''` accepted). The R9 `_canonicalEmailCheckContract` finally encoded the actual contract. Same lesson — within-class repairs miss broader contract gaps.

## Off-scope M9.5 plan commits — kept per user decision

Codex made 8 `docs(plan): M9.5 ...` commits during the convergence loop:
- `5a55dd3` initial plan (R3 window)
- `1f9119a` `38052a0` `61da7e9` `09872e9` (R3 repair window)
- `1f3c9ec` `3e501cb` `9a67044` (R5 repair window)

None were in any dispatch prompt. Codex apparently picked up `handoffs/M9.5-signed-link-controls.md` from the working tree and ran its own R1→R6 plan-iteration convergence as a parallel side activity. The commits look internally coherent. User decision 2026-05-21: keep them. They are the natural start of M9.5's lifecycle.

## Final commit list (28410a9 → HEAD = `dd50732`)

26 commits total. 15 fix commits (sync, db, reports, workflow, audits, help) + 1 chore (traceability) + 1 test fix (regression cast) + 8 M9.5 docs(plan) commits (off-scope but kept) + 1 R9 doc commit (email canonical coverage refresh, on-task).

Sync commits (5): `065b052` `0e4b0ff` `687c7ab` `0dde70f` `781654c`
DB commits (5): `b789703` `7744bb0` `59b18c7` `9a58537` `baa06ac`
Reports commits (1): `a359cfb`
Workflow commits (1): `274819c`
Audits commits (1): `b36240f`
Help commits (1): `dd50732`
Traceability commits (1): `a5a3ecc`
Test cast (1): `589cfda`
Email coverage docs (1): `add9c8d`
M9.5 plan docs (8, kept): `5a55dd3` `1f9119a` `38052a0` `61da7e9` `09872e9` `1f3c9ec` `3e501cb` `9a67044`

## Memories codified from this loop

- `feedback_structural_defense_narrower_than_class.md` — within-class parity defenses (cron vs retry, schema A vs schema B) compare two implementations of the same contract; if the contract itself is wrong, the parity check passes but the bug persists. Use contract-level defenses (predicate-equivalence assertions against the canonical source-of-truth) instead.
- `feedback_codex_task_write_class_side_tasks_on_unrelated_work.md` — Codex `task --write` invocations have shown a tendency to make additional commits adjacent to the requested scope (M9.5 plan iterations during X.* repair). Inline "Do NOT touch X" mandates have mixed effectiveness; expect the side-task behavior and triage at convergence.
- `feedback_codex_companion_background_review_log_location.md` — `codex-companion adversarial-review --background` exits the wrapping bash quickly (queues the job) while the actual review runs in a detached broker worker. The bash output file only contains the queue confirmation. Monitor the broker job log at `/Users/ericweiss/.claude/plugins/data/codex-openai-codex/state/<workspace>/jobs/review-*.log` for terminal status; the bash task notification is misleading.
- `feedback_macos_pgrep_no_c_flag.md` — BSD pgrep on macOS doesn't accept `-c` (count) flag. Worker-liveness checks built on `pgrep -fc ...` silently return 0 always. Use `pgrep -fl ... | wc -l` or check exit status.
