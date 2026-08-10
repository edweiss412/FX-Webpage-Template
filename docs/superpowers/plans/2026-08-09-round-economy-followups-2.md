# Round-economy followups-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the Opus implementation pane. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three spec-APPROVED filing promotions (P1–P3) as rule text in their target files, then close the arc through whole-diff review, CI, and merge.

**Architecture:** Docs-only diff on `feat/round-economy-followups-2` (created off `origin/main` AFTER the authoring PR merges). The authoring branch already landed the spec, this plan, both BL rows, the ci/README index row, and the arc's corpus record; this branch lands ONLY the three rule-text edits plus its own review corpus rows. Spec §2 (as merged) is the normative source for every landed sentence; the task bodies below carry the exact text.

**Tech Stack:** Markdown rule files, `pnpm vitest run tests/docs` (guard suites), `pnpm spec:lint`, codex-guard for the whole-diff review.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/ci/2026-08-09-round-economy-followups-2.md`, spec-APPROVED codex-guard R10 2026-08-09. §1.1 do-not-relitigate list binds every dispatch.
- AC-1: each P-row lands at its named anchor with its source filing paths cited inline, preserving every normative element of spec §2.
- AC-6: no EXISTING file under `docs/review-rounds/` is modified; this branch ADDS its own corpus rows only.
- No lint arm implementation (spec §1.1.2); no edits outside the three target files + corpus record.
- Invariant 6: one task, one commit, conventional commits. Invariant 11: isolated worktree; docs-only branch skips `preflight` (declare in PR body). Invariant 12: this arc closes NO ledger entries — no claim markers exist.
- `impeccable-gate: N/A — no UI surface` (closeout marker, §12 below).
- TDD disposition for T1–T3: N/A — declared. Rule prose carries no behavior; there is no RED to write (quick-wins-2 §2.1 precedent). Each task ships as its own commit with the docs guard suite green as the regression check. This plan therefore declares NO task-contract region — markers on procedural tasks are themselves a defect (classname plan R3-F5). The one red-cycle this arc owed (BL rows + README row) was discharged on the authoring branch: observed red 2026-08-09 19:16 (`_metaLedgerReferentialIntegrity`: "2 BL- id(s) are cited but defined in no ledger"; `specsReadmeIndexParity`: missing row), green 19:25 at commit `7ebb4e27c`.

**Pre-draft verification (run 2026-08-09 in the authoring session, outputs pasted):** `docs/agents/writing-plans.md:25` = "Typecheck pasted snippets + verify CI wiring" bullet (P1 inserts after it); `docs/agents/writing-plans.md:15` = "RED validity" bullet (P1 cross-references it); `AGENTS.md:264` = "Score, when the surface is enrolled" (P2 extends in place); `docs/agents/spec-self-review.md:14` = "Numeric sweep (discrete pass)" (P3 extends in place); `tests/docs/_metaLedgerReferentialIntegrity.test.ts`, `tests/docs/specsReadmeIndexParity.test.ts`, `tests/docs/_metaReviewRoundEconomy.test.ts` all exist; both BL ids resolve in BACKLOG.md (count 2). Meta-test inventory: NONE created or extended — the arc ships prose only; the enforcing meta-tests pre-exist and are exercised, not modified. Advisory-lock topology: N/A (no `pg_advisory*`). Layout/transition/e2e-harness tasks: N/A (no UI, no Playwright). Mutation-family closure: N/A (no guard code ships).

---

### Task 0: Stage 0 — worktree, labels, nudge

**Files:** none tracked.

- [ ] **Step 1:** Verify the authoring PR is merged: `git fetch origin && git show origin/main:BACKLOG.md | rg -c "BL-SPECLINT-RED-EXECUTABILITY-ARM"` → expect `1`. If 0, STOP: the authoring PR has not merged; do not branch.
- [ ] **Step 2:** `git worktree add -b feat/round-economy-followups-2 ../FX-worktrees/round-economy-followups-2 origin/main`, then `pnpm install` in the new worktree. Docs-only: skip `worktree:link-env`/`preflight`, declare in the PR body.
- [ ] **Step 3:** `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/round-economy-followups-2" && herdr agent rename "$HERDR_PANE_ID" "feat/round-economy-followups-2"`; write `.claude/ship-state.json` (branch, stage, tasksRemaining, next, blockedOn:"", cronJobId, your sessionId); register the 10-minute cron nudge per the AGENTS.md Stage-0 contract (off-minute schedule, date-first, supersession check, discard stale framing).
- [ ] **Step 4:** `pnpm ledger:claims --check` for zero ids — this arc claims nothing; a non-empty result is new information, stop and reconcile.

### Task 1: P1 — the red-cycle bullet into writing-plans.md

**Files:**
- Modify: `docs/agents/writing-plans.md` (insert a new top-level bullet directly AFTER the "Typecheck pasted snippets + verify CI wiring" bullet, line 25 at verification time)

**Interfaces:** Consumes spec §2 P1 (merged text). Produces the durable rule the `BL-SPECLINT-RED-EXECUTABILITY-ARM` arm will later mechanize.

- [ ] **Step 1: Insert exactly this bullet** (one line-wrapped markdown list item; adjust wrapping to the file's style, nothing else):

```markdown
- **Every `red=` and gate command is validated executably at plan time (round-economy followups-2, 2026-08-09).** The task-marker contract is red-then-green ON THE SAME COMMAND: a `red=` is valid only if the task has a point where the command is OBSERVED failing for the stated reason and a later point where the SAME command passes. Before dispatching a plan for review: a `red=` asserting the current tree already fails (its failing case exists at plan time) is RUN — one that exits 0 is a plan defect. A `red=` whose failing case the task itself writes — a NEW test file OR a new case added to an EXISTING suite — is the ordinary invariant-1 shape: it is not run at plan time (the pre-change suite may legitimately be green, or the file absent); instead the task names the production line whose absence or defect will make the new case fail (the RED-validity bullet above — cross-reference, do not restate), verified absent or defective on the live tree, with observed-red landing in the task's RED step. Rejected statically in either branch is any marker whose cycle cannot complete: a guard test that passes the moment it is authored; a command whose target the GREEN step deletes or renames (the SAME command never passes); a conjunct behind `&&` where an earlier expected failure short-circuits it (asserted red, never observed — the conjunction is the GREEN criterion); and a task body with no one-line "what is red and why" statement. Declared gate commands (merge gates, closeout checks, CI probes) get the mutant-red treatment: probe each against a CONSTRUCTED failing input and confirm non-zero exit — a bare `gh run list`, an unresolvable sha that empties a diff into a passing `test -z`, and a fail-open shell chain all exit 0 on the exact failure they name. Mechanical arm filed as `BL-SPECLINT-RED-EXECUTABILITY-ARM`. (`docs/review-rounds/refactor/classname-array-join-cn/61281c23e8ce.md` spec §, `docs/review-rounds/docs/quick-wins-2-specs/97e179d831aa.md` plan §, `docs/review-rounds/test/resurrect-mobile-safari-e2e/9bd0a8456151.md` plan §.)
```

- [ ] **Step 2: Verify.** `rg -n "red-then-green ON THE SAME COMMAND" docs/agents/writing-plans.md` → 1 hit, positioned after the Typecheck bullet; `rg -c "RED validity" docs/agents/writing-plans.md` → unchanged (1).
- [ ] **Step 3: Guard suite.** `pnpm vitest run tests/docs` → green.
- [ ] **Step 4: Commit.** `git add docs/agents/writing-plans.md && git commit -m "docs(plan): promote P1 — executable red-cycle validation at plan time (followups-2)"`

### Task 2: P2 — enrolment-precedes-review into AGENTS.md bullet 3

**Files:**
- Modify: `AGENTS.md` (extend the convergence-criterion block's bullet 3, "Score, when the surface is enrolled", line 264 at verification time — append to the bullet, delete nothing)

**Interfaces:** Consumes spec §2 P2 (merged text). Produces the pre-dispatch enrolment contract review briefs must follow.

- [ ] **Step 1: Append exactly these sentences to the end of bullet 3:**

```markdown
Enrolment precedes review, and it includes SHAPE: the runner overlays a target only when a Vitest suite imports it, so a new proof/guard surface is authored as an importable module with a referring suite from the start — not as a terminal CLI script — and is enrolled with `pnpm mutation:guards` run BEFORE the first dispatch, the score plus the unaccepted-survivor set stated in the round-1 brief. Two arcs measured the cost of deciding this late: the classname equivalence scripts were never enrolled and, as shipped, not even enrollable without restructuring (CLI-shaped — no exports, unconditional `process.exit`, no importing suite), drawing fifty false-pass findings across fourteen diff rounds at roughly 25 minutes of dispatch per mutant (that arc's own figure; the step3 filing records no per-mutant duration); the step3-a11y tap-target suite spent six of nine diff rounds the same way before a later probe showed the registry cannot express that Playwright surface at all (its nineteen mutants are bespoke component edits). An enrolled surface runs in roughly 93 seconds (this block's measured first customer). The step3 outcome is the other branch of the same rule: a surface the registry cannot express is re-dispositioned honestly with the probe that shows it (`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4), never enrolled symbolically. (`docs/review-rounds/fix/step3-a11y-cluster/61281c23e8ce.md` diff §, `docs/review-rounds/refactor/classname-array-join-cn/9bd0a8456151.md` diff §.)
```

- [ ] **Step 2: Verify.** `rg -n "Enrolment precedes review, and it includes SHAPE" AGENTS.md` → 1 hit inside bullet 3; the bullet's original text (mutation score, surviving-mutant admissibility) intact above the append.
- [ ] **Step 3: Guard suite.** `pnpm vitest run tests/docs` → green.
- [ ] **Step 4: Commit.** `git add AGENTS.md && git commit -m "docs(plan): promote P2 — enrolment precedes review, including surface shape (followups-2)"`

### Task 3: P3 — executable single source into spec-self-review.md

**Files:**
- Modify: `docs/agents/spec-self-review.md` (extend the "Numeric sweep (discrete pass)" bullet, line 14 at verification time — append to the bullet, delete nothing)

**Interfaces:** Consumes spec §2 P3 (merged text). Produces the count-single-source rule the `BL-SPECLINT-PROSE-COUNT-PARITY` arm will later mechanize.

- [ ] **Step 1: Append exactly these sentences to the end of the numeric-sweep bullet:**

```markdown
Where a count exists in BOTH an executable declaration and prose, the executable one (a single named declaration — the `EXPECTED_SITE_TOTAL` pattern, a module-local `const` at `scripts/verify-cn-operand-parity.mjs:80`) is the single source: prose either references the constant by name or carries a dated at-authoring-time qualifier, and a present-tense prose cardinality that repeats the literal is a defect even while the values are equal — the next re-derivation updates the executable declarations (they gate) and strands the prose. Dated historical records (probe transcripts, execution records) are never corrected and never compared. The classname delta arc spent four review rounds plus one CI cycle clearing exactly this class instance-by-instance; the wedge-remeasure arc filed the sibling-list and cross-template variants against `NUMERIC_NOUN_MISMATCH` (`lib/specLint/numerics.ts:88`). Mechanical arm filed as `BL-SPECLINT-PROSE-COUNT-PARITY`. (`docs/review-rounds/refactor/classname-array-join-cn/b2aca7b02547.md` diff §, `docs/review-rounds/chore/next-1630-wedge-remeasure/9bec2e11ab11.md` spec § and diff §.)
```

- [ ] **Step 2: Verify.** `rg -n "EXPECTED_SITE_TOTAL" docs/agents/spec-self-review.md` → 1 hit inside the numeric-sweep bullet.
- [ ] **Step 3: Guard suite + self-consistency sweep.** `pnpm vitest run tests/docs` → green; grep the three edited files for every count and label the edits could have staled (`rg -n "three|fifty|fourteen|nineteen|93 seconds|25 minutes" docs/agents/writing-plans.md AGENTS.md docs/agents/spec-self-review.md`) and confirm each against spec §2.
- [ ] **Step 4: Commit.** `git add docs/agents/spec-self-review.md && git commit -m "docs(plan): promote P3 — executable single source for re-derived counts (followups-2)"`

### Task 4: Whole-diff cross-model review to APPROVE

- [ ] **Step 1:** Dispatch codex-guard whole-diff review (`--stage diff --round 1`, fresh timestamped `--out` per round, DETACHED `nohup … & disown` — this box SIGTERMs harness background tasks). Brief carries: REVIEWER ONLY; fresh-eyes; the canonical CONSEQUENCE BOUND and THREAT MODEL FENCE paragraphs; spec §1.1 do-not-relitigate list; AC-1 as the acceptance oracle ("each P-row preserves every normative element of spec §2, filing citations inline"); `FINDINGS:`/`VERDICT:` output contract; the fresh `pnpm spec:lint` result for the spec, advisory count acknowledged exactly.
- [ ] **Step 2:** Per round: read `result.json` (a `no_verdict` is infrastructure, not a review outcome — re-dispatch detached); repair findings with the between-round self-consistency sweep; commit corpus rows with the arc; iterate to APPROVE (0). Four counted diff rounds trigger a diff-stage section in the arc's filing at `docs/review-rounds/feat/round-economy-followups-2/<baseSha12>.md`.

### Task 5: Closeout

- [ ] **Step 1:** `pnpm vitest run tests/docs` and `pnpm format:check` green locally.
- [ ] **Step 2:** Push; open PR (body: what landed per P-row, docs-only preflight-skip declaration per invariant 11, the standard Claude Code footer). Real CI green — NOT just local.
- [ ] **Step 3:** `gh pr merge --merge` in the same turn CI goes green; then sync: `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only && git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` → `0  0`.
- [ ] **Step 4:** `herdr pane rename "$HERDR_PANE_ID" --clear && herdr agent rename "$HERDR_PANE_ID" --clear`; CronDelete the nudge; `git worktree remove ../FX-worktrees/round-economy-followups-2`.

## §12 Closeout marker

impeccable-gate: N/A — no UI surface
