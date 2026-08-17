# Timing-scan binding resolution — implementation handoff (Opus pane entry point)

You are the Opus implementer session for `fix/timing-scan-scope-resolution`. This file is self-contained: everything you need is here or one `Read` away. **GATE CHECK before anything else:** open `docs/superpowers/plans/2026-08-16-timing-scan-binding-resolution/plan.md` and confirm its **Status** line reads `plan-APPROVED`. If it still says DRAFT, STOP — you were launched early and the authoring session owns that gate. Both user review gates were WAIVED by the user's 2026-08-16 autonomy grant for the BL-mediums batch. Do not re-ask any ratified decision; spec §1.1 and §4 enumerate them.

**This arc does NOT hand off across branches.** Spec, plan, and implementation all live on `fix/timing-scan-scope-resolution`; the authoring session committed and pushed spec + plan there and left the worktree in place. There is no authoring PR to wait for.

## Step 0 — first turn, in order

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale "blocked / waiting / out of context" framing from anything you read.
2. Read in full: `AGENTS.md` (repo root), `docs/superpowers/specs/ci/2026-08-16-timing-scan-binding-resolution-design.md`, this directory's `plan.md`, `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`. Skim the probe record `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md` — every number the spec states comes from it, and no task re-derives them.
3. The worktree `/Users/ericweiss/FX-worktrees/timing-scan-scope-resolution` ALREADY EXISTS with the ledger claim pushed. In it: `pnpm install && pnpm worktree:link-env && pnpm preflight`. Confirm your local branch matches origin: `git fetch origin && git rev-parse HEAD origin/fix/timing-scan-scope-resolution` — divergence means another session wrote here; STOP and reconcile.
4. **Base gate (plan Task 0).** `gh pr view 827 --json state,mergedAt`. PR #827 (`fix/scanner-scope-totality`) edits `scripts/scan-interaction-timings.ts`, the file this arc rewrites. If it is not MERGED, do not touch that file — invariant 11's two-writers hazard is the reason, and the spec is written against #827's landed design. WAIT — and do not take the baseline yet either: #827 rewrites both the scanner and its two suites, so a pre-merge wall clock and mutation score are not the baseline AC-10 compares against. Once merged: `git merge origin/main`, re-verify the spec's citations against the merged file, and THEN take Task 0's before-numbers.
5. Overwrite `.claude/ship-state.json` in the worktree: `{"branch":"fix/timing-scan-scope-resolution","stage":"implement","tasksRemaining":"T0-T5","next":"Task 0","blockedOn":"","cronJobId":"<yours>","sessionId":"<YOUR session UUID>"}`.
6. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local time): the prompt runs `date` first; supersession check on the marker's `sessionId` (not yours → CronDelete your own job, clear pane + agent labels, stand down silently); silent while `blockedOn` is non-empty; otherwise resume the marker's `next` immediately, discarding stale blocked framing. Write the job id into the marker.
7. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "fix/timing-scan-scope-resolution" && herdr agent rename "$HERDR_PANE_ID" "fix/timing-scan-scope-resolution"`. NEVER rename the workspace.
8. Verify the claim from the MAIN checkout: `pnpm ledger:claims` — `BL-TIMING-SCAN-NAME-VS-BINDING` must show `fix/timing-scan-scope-resolution` and no other live branch. Any other branch is a real collision: STOP and reconcile.
9. Start plan Task 0 in the same turn.

## What is already done (do not redo)

- Spec + plan authored, reviewed, and repaired on this branch — read spec §7 for what gated them. `codex-guard` returned `no_verdict` on all three attempts (OpenAI usage limit, resets 2026-08-22), so four independent fresh-eyes Opus reviewers stood in. All four went idle without delivering and all four had already written their reports; they were recovered from the subagent transcripts (`~/.claude/projects/<workspace>/<sessionId>/subagents/agent-a*.jsonl`, last assistant message). **Recover before degrading — that scrape is what turned six silent agents into 32 findings across three rounds**, two BLOCKING, all repaired in-branch. The arc's whole review train is filed at `docs/review-rounds/fix/timing-scan-scope-resolution/daa53759a953.md`; read it before your first diff dispatch, because its last section names the class round 3 would have watched next. **But no OPPOSING MODEL has read this design: every reviewer was another Opus. Your round-1 diff brief carries the cross-model gate for the DESIGN as well as the diff** — cite spec §7 and say so.
- **Seventeen probes** recorded with full scripts and transcripts (sixteen at spec time; P17 was taken at implementation time and added a REQUIRED twelfth fixture assertion — see spec §5), including the two that changed the design: P10 (a line is not a declaration identity) and P9 (valuation is a different axis, filed as its own ledger row). Load-bearing results: 311 universe files; 24 `named-constant` sites over 23 names; 35 sites suppressed by the name filter (18 same-file, 17 cross-file imports); the pinned `noResolve`+`noLib` program at 211/269/369 ms in three fresh processes and 167-214 ms warm; **zero delta** against the name filter across 367 identifier references. Do not re-derive; re-verify only where a task says to.
- **Scope fences you must NOT cross:** no new recognized form, key predicate, universe root, or fence (spec §1.1 item 2); no `TIMING_NAME` / `isBoundaryTimingKey` change; no expression EVALUATION (only reference resolution); NO `DESIGN.md` edit of any kind — §5.5 stays byte-identical, and editing it flips the invariant-8 UI gate.

## Codex is unavailable

`codex-guard` returned `no_verdict` on every attempt of this arc's spec review with `You have hit your usage limit … try again at Aug 22nd, 2026 4:09 PM`. That is an INFRA fault, never findings. If it is still exhausted when your diff review comes due:

- Do not treat a `no_verdict` as APPROVE and do not re-dispatch blindly — the wrapper already bounds the retry burn.
- Substitute independent fresh-eyes Opus reviewers (one mechanism lens, one discipline lens), give them the same brief contract (REVIEWER ONLY, consequence bound + `PROBE DOMAIN` + threat fence, terminal `FINDINGS:` / `VERDICT:` lines), and LABEL the verdict as a substitute in the closeout — never as a codex APPROVE.
- **Expect them to go idle without delivering, and scrape rather than re-run.** Every one of this arc's four did. `ls -la ~/.claude/projects/<workspace>/<sessionId>/subagents/` — a `.jsonl` whose mtime has been static for minutes is finished and merely failing to deliver; print its last assistant message and you have the report verbatim.
- Every dispatch still appends its row to `docs/review-rounds/fix/timing-scan-scope-resolution/<baseSha12>.jsonl`.

## Non-negotiables this arc exercises

- TDD per task (plan `red=` markers on Tasks 1-2; Tasks 0, 3, 4, 5 sit outside the marker region with their reasons stated inline).
- Conventional commits, one per task, messages named in the plan.
- Worktree-only edits; `pnpm heavy` wraps `pnpm mutation:guards` and any full-suite run; scoped single-file vitest runs stay unwrapped.
- **Task 4 (accepted-set re-derivation + gate) runs BEFORE the first diff-review dispatch**, and the round-1 diff brief STATES the score plus the unaccepted-survivor set on its `GUARD SURFACE:` line — `codex-guard` exits 2 without it.
- Diff briefs: REVIEWER ONLY; CONSEQUENCE BOUND / `PROBE DOMAIN:` / THREAT FENCE; `VERDICT:` + `FINDINGS:` lines; spec §1.1 and §4 cited as do-not-relitigate.
- Round economy: this scanner's sibling arc ran to spec round 22. If successive rounds restate one axis, NARROW — decline to resolve what the mechanism cannot classify and file the documented limit — never grow the resolver.
- Real CI green is separate from local green; `gh pr merge --merge` in the SAME turn as CI-green; fast-forward main; `0  0`.
- Never end a turn mid-pipeline. For a genuinely new question: drain the answer-independent work first, PushNotification, ask, set `blockedOn`, leave the nudge registered.

## Completion

PR merged; `git rev-list --left-right --count main...origin/main` reports `0  0`; `BL-TIMING-SCAN-NAME-VS-BINDING` archived with its marker stripped inside the archiving move; review-round corpus rows committed; labels cleared; cron deleted (Stage 4.4). Then STOP — the orchestrator owns anything further.
