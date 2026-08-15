# Archive duplicate ids — implementation handoff (Opus pane entry point)

You are the Opus implementer session for the archive-duplicate-ids arc. This file is
self-contained: everything you need is here or one `Read` away. GATE CHECK before
anything else: open `docs/superpowers/plans/2026-08-15-archive-duplicate-ids/plan.md`
and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference
— if it still says DRAFT, STOP and do nothing (you were launched early; the authoring
session owns the gate). Both user review gates were WAIVED by the user's 2026-08-15
autonomy grant. Do not re-ask any ratified decision — they are enumerated in the spec
§1.1 (`docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md`).

## Step 0 — in your FIRST turn, in order

1. Run `date`. The shell clock is the ONLY source of truth; discard any stale timing
   or "blocked/waiting" framing anywhere in your context.
2. Read, in full: `AGENTS.md` (repo root), the spec
   (`docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md`), the plan
   (`docs/superpowers/plans/2026-08-15-archive-duplicate-ids/plan.md`),
   `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`, and the census
   transcript `docs/superpowers/plans/2026-08-15-archive-duplicate-ids/dup-census-2026-08-15.txt`.
3. The impl worktree ALREADY EXISTS with the claim marker pushed (created by the
   authoring session per spec §3.2 handoff-by-overlap):
   `../FX-worktrees/archive-duplicate-ids`, branch `chore/archive-duplicate-ids`.
   Verify the authoring PR is MERGED with an ANCHORED check, never bounded log
   output (writing-plans lint shape ii): `git fetch origin && git cat-file -e
   origin/main:docs/superpowers/plans/2026-08-15-archive-duplicate-ids/plan.md`
   exits 0; if not, STOP — launched early. Step 2's reads happen FROM THE MAIN
   CHECKOUT (post-merge the files exist there). Then, in the worktree:
   `git merge origin/main` (mechanical; the parent PR adds spec/plan/handoff and
   removes its own marker), then `pnpm install && pnpm worktree:link-env && pnpm
   preflight`.
4. Verify claims from the MAIN checkout `/Users/ericweiss/FX-Webpage-Template`:
   `pnpm ledger:claims` — `BL-ARCHIVE-DUPLICATE-ENTRY-IDS` must show
   `chore/archive-duplicate-ids` and no other live branch. Any other branch = real
   collision, STOP and reconcile.
5. Write `<worktree>/.claude/ship-state.json` fresh: `{branch:
   "chore/archive-duplicate-ids", stage: "impl", tasksRemaining: "A1,A2,A3", next:
   "Task A1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID — the directory
   segment of your scratchpad path>}`.
6. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local
   time). The prompt MUST: run `date` first; re-read the marker and stand down via
   the supersession check if `sessionId` is not yours (CronDelete own job, clear pane
   + agent labels, silent); skip silently if `blockedOn` non-empty; otherwise resume
   the marker's `next` immediately; explicitly discard stale blocked/waiting framing.
   Write the `cronJobId` into the marker.
7. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID"
   "chore/archive-duplicate-ids" && herdr agent rename "$HERDR_PANE_ID"
   "chore/archive-duplicate-ids"`. NEVER rename the workspace.
8. Start plan Task A1 in the same turn.

## Non-negotiables this arc exercises

- TDD (invariant 1): Task A1's RED is the new uniqueness lane observed failing naming
  all 43 pairs BEFORE the repairs; Task A2's RED is the archive-RED pattern (move
  WITH marker → `_metaLedgerInProgress` fails by name → strip → green).
- Conventional commits (invariant 6); messages named per task in the plan.
- Worktree-only edits (invariant 11); the main checkout is read-only.
- Claims (invariant 12): the entry's marker strips INSIDE the A2 archive move; Task
  A3's terminal grep proves no marker survives.
- Cross-model review: whole-diff codex-guard `--stage diff --round <n>` to APPROVE
  before merge. The brief MUST carry: REVIEWER ONLY; the numbered CONSEQUENCE BOUND /
  PROBE DOMAIN / THREAT-MODEL FENCE block from spec §7 with the literal phrase
  "never silently wrong"; VERDICT + FINDINGS line instructions; round cap 4; the
  spec §1.1 do-not-relitigate list cited at file:line.
- Real CI green is a separate gate from local green; `gh pr merge --merge` follows
  CI-green in the SAME turn; ff main and verify
  `git rev-list --left-right --count main...origin/main` == `0 0`.
- Never end a turn mid-pipeline. If a genuinely-new user question arises (none is
  expected — the probe-settled tables in the plan cover every pair): drain
  answer-independent work, PushNotification in the same turn, set `blockedOn`, leave
  the nudge registered.

## Completion

PR merged; `0 0` verified; every AC in spec §6 satisfied; labels cleared; your cron
job deleted (Stage 4.4). Then append one line to
`/Users/ericweiss/FX-worktrees/_briefs/2026-08-15-batch-status.md`:
`<UTC timestamp> G2-impl chore/archive-duplicate-ids DONE #<PR>` (use
`date -u +%FT%TZ`; printf-append, never a bare `echo >>`).
