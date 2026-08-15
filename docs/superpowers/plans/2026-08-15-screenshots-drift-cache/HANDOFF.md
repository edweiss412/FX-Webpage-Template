# Screenshots-drift cache refresh — implementation handoff (Opus pane entry point)

You are the Opus implementer session for the screenshots-drift-cache arc. This file is
self-contained: everything you need is here or one `Read` away. GATE CHECK before
anything else: open `docs/superpowers/plans/2026-08-15-screenshots-drift-cache/plan.md`
and confirm its **Status** line reads plan-APPROVED with a codex-guard round reference
— if it still says DRAFT, STOP and do nothing (launched early; the authoring session
owns the gate). Both user review gates were WAIVED by the user's 2026-08-15 autonomy
grant. Do not re-ask any ratified decision — spec §1.1
(`docs/superpowers/specs/ci/2026-08-15-screenshots-drift-cache-refresh-design.md`)
enumerates them, including the round-1 direction reversal (input-hash exact key —
fenced in both directions; do not re-litigate toward a prefix-fallback key OR against
the split/always-save).

## Step 0 — in your FIRST turn, in order

1. Run `date`. Shell clock is the ONLY source of truth; discard stale
   blocked/waiting framing.
2. Read in full: `AGENTS.md`, the spec
   (`docs/superpowers/specs/ci/2026-08-15-screenshots-drift-cache-refresh-design.md`),
   the plan (`docs/superpowers/plans/2026-08-15-screenshots-drift-cache/plan.md`),
   `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`, and
   `.github/workflows/screenshots-drift.yml` as it stands.
3. The impl worktree ALREADY EXISTS with the claim marker pushed:
   `../FX-worktrees/screenshots-drift-cache`, branch `fix/screenshots-drift-cache`.
   Verify the authoring PR is MERGED (`git log --oneline origin/main | head -5`
   shows the docs/screenshots-drift-cache-spec merge; if not, STOP). In the
   worktree: `pnpm install && pnpm worktree:link-env && pnpm preflight`, then
   `git merge origin/main`.
4. Verify claims from the MAIN checkout: `pnpm ledger:claims` —
   `BL-SCREENSHOTS-DRIFT-STALE-NEXTCACHE-SELF-PERPETUATING` must show
   `fix/screenshots-drift-cache` and no other live branch. Otherwise STOP.
5. Write `<worktree>/.claude/ship-state.json` fresh: `{branch:
   "fix/screenshots-drift-cache", stage: "impl", tasksRemaining: "B1,B2,B3", next:
   "Task B1", blockedOn: "", cronJobId, sessionId: <YOUR session UUID>}`.
6. Register YOUR 10-minute cron nudge (off-minutes `7,17,27,37,47,57 * * * *`, local
   time; date-first, supersession check on sessionId, blockedOn silence, resume
   `next`, discard stale framing). Write the `cronJobId` into the marker.
7. Labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID"
   "fix/screenshots-drift-cache" && herdr agent rename "$HERDR_PANE_ID"
   "fix/screenshots-drift-cache"`. NEVER rename the workspace.
8. Start plan Task B1 in the same turn.

## Non-negotiables this arc exercises

- TDD (invariant 1): Task B1's RED is the new §2.2 pin (seven assertions) observed
  failing against the unedited workflow; Task B3's RED is the archive-RED pattern.
- CI-bound arc: real CI green is a SEPARATE gate from local review; Task B2's three
  `workflow_dispatch` runs (cold-green, warm-green, constructed-failing) are
  mandatory, run ids recorded in the PR body and archive entry. The failing-run
  dispatch happens on a THROWAWAY branch; its edit never reaches the impl branch.
- Conventional commits (invariant 6); worktree-only (11); claims (12 — marker strips
  inside the B3 archive move; terminal grep proves it).
- Cross-model review: whole-diff codex-guard `--stage diff --round <n>` to APPROVE
  before merge; brief carries REVIEWER ONLY, the spec §7 CONSEQUENCE BOUND / PROBE
  DOMAIN / THREAT-MODEL FENCE block with the literal phrase "never silently wrong",
  VERDICT + FINDINGS instructions, round cap 4, and the spec §1.1
  do-not-relitigate list (especially the direction fence).
- `gh pr merge --merge` follows CI-green in the SAME turn; ff main; verify `0 0`.
- Never end a turn mid-pipeline; PushNotification + `blockedOn` on any genuinely-new
  user question (none expected).

## Completion

PR merged; `0 0` verified; every AC in spec §6 satisfied; labels cleared; cron job
deleted (Stage 4.4). Then append one line to
`/Users/ericweiss/FX-worktrees/_briefs/2026-08-15-batch-status.md`:
`<UTC timestamp> G2-impl fix/screenshots-drift-cache DONE #<PR>` (use
`date -u +%FT%TZ`; printf-append, never a bare `echo >>`).
