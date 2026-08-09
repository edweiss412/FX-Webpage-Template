# Next 16.3.0 Bump + Wedge Re-measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is procedural (dependency bump + CI measurement + ledger disposition) — tasks are strictly sequential; do NOT parallelize.

**Goal:** Bump `next` 16.2.10 → 16.3.0 and measure whether its 4.5-months-newer vendored React canary fixes the Published-toggle client-commit wedge, then disposition `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` per the pre-stated decision rule.

**Architecture:** Zero product code. One dependency edit + lockfile; the measurement harness already exists (`transitions_repeats` workflow_dispatch input on `.github/workflows/lifecycle-layout-e2e.yml`). The spec is `docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md` — read it in full first; its §4.1 decision rule and §5 dispositions govern Tasks 3–4. Ordering principle: all content commits land BEFORE the final-head CI gate (Task 6), because spec AC-2 binds the six dark-suite dispatches to the head that merges.

**Tech Stack:** pnpm, gh CLI, GitHub Actions, Playwright (CI-side only).

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/next-1630-wedge-remeasure`, branch `chore/next-1630-wedge-remeasure` (already created, claimed, pushed).
- Spec §1.1 (do not relitigate): `next`-only bump — no `@next/*`/`eslint-config-next` alignment; NO client watchdog under any outcome; merge-per-AC-2-even-if-still-wedging (measurement decides the LEDGER disposition, not the merge); zero product code; no new CI surface.
- Spec §7 AC-5 file allowlist: only `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.build.json`, `tests/components/admin/sheetIconLinkContainment.test.ts` (spec §3.1's forced build repair plus the resolver-remap guard it teaches; AC-5 widening user-ratified 2026-08-09), `BACKLOG.md`, `BACKLOG-archive.md`, `tests/docs/_metaDeferralLedgerGraduation.test.ts` (outcome A's registry row only), `docs/superpowers/**`, `docs/review-rounds/**`, and (drift contingency only) `public/help/screenshots/**` may change on this branch. Task 6 verifies this executably.
- **Every commit is followed by `git push` in the same step.** The reviewed and merged head must contain everything; a local-only commit is a plan violation.
- **TDD posture (declared):** Invariant 1 has no RED shape here — no behavior is authored; the app's existing suites are the regression net and the CI measurement loop is the empirical test. No task in this plan writes a test.
- **Meta-test inventory (declared):** none applies beyond outcome A's registry row in the EXISTING `tests/docs/_metaDeferralLedgerGraduation.test.ts` — no new meta-test is created or extended structurally; no auth/DB/admin-alert/tile surface, no advisory-lock path, no mutation surface.
- impeccable-gate: N/A — no UI surface.
- Commits: conventional style, `--no-verify`, each ending with the Claude Code trailer block already used on this branch (`git log -2` shows the format).
- `2026-08-XX` anywhere below = the actual execution date; stamp it.

---

### Task 1: Bump next to 16.3.0

**Files:**
- Modify: repo-root `package.json` (the `"next": "16.2.10"` dependency line)
- Modify: `pnpm-lock.yaml` (via `pnpm install`, never by hand)

**Interfaces:**
- Produces: a branch head where `pnpm exec next --version` reports 16.3.0 and the vendored React canary is `cbb046ab-20260731` — Task 3's measurement subject.

- [ ] **Step 1: Edit the dependency**

In the worktree root `package.json`, change `"next": "16.2.10"` to `"next": "16.3.0"`. Touch nothing else in the file.

- [ ] **Step 2: Update the lockfile**

Run: `pnpm install`
Expected: exits 0, `pnpm-lock.yaml` modified, no other file dirty (`git status --porcelain` shows exactly `package.json` and `pnpm-lock.yaml`).

- [ ] **Step 3: Verify the bump is real (probe, not assumption)**

Run: `pnpm exec next --version`
Expected: `Next.js v16.3.0`

Run: `grep -m1 -o '19\.[0-9]*\.[0-9]*-canary-[a-f0-9]*-[0-9]*' node_modules/next/dist/compiled/react/cjs/react.production.js`
Expected: `19.3.0-canary-cbb046ab-20260731` (spec §2.1). If this prints anything else, STOP — the spec's premise is wrong; set blockedOn in the worktree's .claude/ship-state.json marker and escalate.

- [ ] **Step 4: Local gates**

Run: `pnpm typecheck`
Expected: exits 0.

Run: `pnpm build`
Expected: exits 0 (Next 16.3 compiles the app).

- [ ] **Step 5: Commit + push**

```bash
git add package.json pnpm-lock.yaml
git commit --no-verify -m "chore(infra): bump next 16.2.10 -> 16.3.0 (vendored React canary 20260317 -> 20260731)"
git push
```

(Append the branch's standard co-author/session trailer as on prior commits.)

---

### Task 2: Open PR; auto-triggered CI green

**Files:** none (GitHub state only)

**Interfaces:**
- Consumes: Task 1's pushed head.
- Produces: a PR with green auto-triggered checks and the PR-body scaffold Task 3 fills in. (The six dark-suite dispatches happen in Task 6, against the FINAL head — spec AC-2.)

- [ ] **Step 1: Open the PR**

```bash
gh pr create --title "chore(infra): next 16.3.0 bump + Published-toggle wedge re-measurement" --body "$(cat <<'EOF'
Executes docs/superpowers/specs/2026-08-09-next-1630-wedge-remeasure-design.md for BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE.

Bump: next 16.2.10 -> 16.3.0 (vendored React 19.3.0-canary-3f0b9e61-20260317 -> 19.3.0-canary-cbb046ab-20260731). Zero product code.

## Measurement (spec §4)
Baseline: 7/10 wedged (run 30235889083, canary 20260317).
- Valid dispatch runs: PENDING
- Discarded/invalid runs: PENDING (or none)
- Wedged samples of 20 valid: PENDING
- Wedged flips of F executed: PENDING
- Decision (§4.1): PENDING

## Dark-suite dispatches on final head (spec §6, filled by Task 6)
PENDING

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01BDmohc85Vb5jkHAeviyiPs
EOF
)"
```

- [ ] **Step 2: Wait for auto-triggered CI**

Run: `gh pr checks --watch`
Expected: every check green. (Auto-running on this diff, per spec §6: crew-e2e, lifecycle-layout-e2e, quality, section-header-visual, standalone-e2e, unit-suite, x-audits, phantom-gap-e2e, step3-live-bundle.) A red auto check: diagnose; a Next-minor regression needing product-code repair exceeds AC-5 — set blockedOn in the worktree's .claude/ship-state.json marker and escalate rather than patching app code here.

---

### Task 3: Run the measurement loop (2 × 10 samples, plus replacements per validity)

**Files:** none (GitHub state + PR body edit)

**Interfaces:**
- Consumes: green PR head from Task 2.
- Produces: wedged-sample count (of 20 valid), wedged-flip count (of F executed), all run URLs, recorded in the PR body — Task 4's disposition input.

- [ ] **Step 0: Define the shared run-capture function (used by every dispatch in Tasks 3 and 6)**

One query returns id+headSha TOGETHER (no torn pair), selected by BOTH the expected head SHA and a created-after timestamp (no stale or concurrent dispatch can be picked up):

```bash
# capture_run <workflow.yml> <branch> <expected-head-sha> <dispatched-after-utc>
# Echoes "<databaseId> <headSha>" of the matching workflow_dispatch run; retries until it appears.
capture_run() {
  local wf="$1" br="$2" sha="$3" ts="$4" pair=""
  while [ -z "$pair" ]; do
    sleep 10
    pair=$(gh run list --workflow="$wf" --branch "$br" --event workflow_dispatch \
      --json databaseId,headSha,createdAt --limit 10 \
      --jq "[.[] | select(.headSha==\"$sha\" and .createdAt>=\"$ts\")] | sort_by(.createdAt) | first | if . == null then \"\" else \"\(.databaseId) \(.headSha)\" end")
  done
  echo "$pair"
}
```

- [ ] **Step 1: Dispatch measurement run 1, head-bound**

```bash
HEAD_SHA=$(git rev-parse HEAD)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run lifecycle-layout-e2e.yml --ref chore/next-1630-wedge-remeasure -f transitions_repeats=10
read -r RUN1 RUN1_SHA <<< "$(capture_run lifecycle-layout-e2e.yml chore/next-1630-wedge-remeasure "$HEAD_SHA" "$TS")"
echo "RUN1=$RUN1 sha=$RUN1_SHA"
gh run watch "$RUN1" --exit-status || true
```

`--event workflow_dispatch` excludes the ordinary one-repeat `pull_request` runs; the `headSha`+`createdAt` selection excludes older or concurrent dispatches. The `|| true`: a run conclusion of `failure` can still be a valid measurement (spec §4 item 5 — wedges self-recover, but a reload-tier throw fails the case while still being a wedged sample); validity is decided in Step 2, not by exit code.

- [ ] **Step 2: Classify the run mechanically (spec §4 items 4–5) — one script, no judgment calls**

Run validity first — the measurement step must have executed its repeats:

```bash
gh run view "$RUN1" --log > "run-$RUN1.log"
grep -c "Published toggle round-trip" "run-$RUN1.log" || true
```

Expected: nonzero. If the log shows the job died in setup, in the preceding layout-spec step, or at the 35-minute timeout before/inside the measurement step: the run is INVALID — record its URL under "Discarded/invalid runs" in the PR body and dispatch a replacement (repeat Step 1).

Then the per-sample classifier. Its three anchor facts were settled by a LOCAL EMPIRICAL PROBE against this worktree's own Playwright (1.59.1, CI=1, trace=on, repeat-each=2, once passing and once failing — the writing-plans empirical-spike discipline; probe transcript in the plan-review r3 repair commit message's session):
- Runner-side `console.log` output lands in the **`test.trace`** zip member as `{"type":"stdout"}` events (NOT `trace.trace`; and `resources/src@*.txt` embeds the test SOURCE, which contains the same literal strings — so the classifier reads the `test.trace` member and nothing else).
- A FAILED test invocation's `test-results/` dir contains an **error-context markdown file** (filename: error-context dot md); a passed one does not. Per-sample pass/fail is directory-local — no reporter parsing (the CI default is the `dot` reporter, whose output has no per-test result lines to grep).
- Repeat dirs are named `<base>` (repeat 0) then `<base>-repeat1`…`-repeat9` — a deterministic execution-order key; `sort -V` orders them.

```bash
classify_run() {  # classify_run <run-id>  — one line per sample + a summary; pure facts, no judgment
  local rid="$1"
  gh run download "$rid" --dir "run-$rid-artifacts"
  local total=0 valid=0 wedged=0 flips_wedged=0 flips_exec=0 indet=0
  for tz in $(find "run-$rid-artifacts" -name "trace.zip" | sort -V); do
    total=$((total+1))
    local dir status T w_off w_on land_off land_on
    dir=$(dirname "$tz")
    if [ -f "$dir/error-context.md" ]; then status=failed; else status=passed; fi
    T=$(unzip -p "$tz" test.trace 2>/dev/null | tr -d '\0')
    w_off=$(printf '%s' "$T" | grep -a -c "OFF flip: tier=plain did not land" || true)
    w_on=$(printf '%s' "$T" | grep -a -c "ON flip: tier=plain did not land" || true)
    land_off=$(printf '%s' "$T" | grep -a -c "OFF flip: landed at tier" || true)
    land_on=$(printf '%s' "$T" | grep -a -c "ON flip: landed at tier" || true)
    local wl=$((w_off + w_on)) v=yes flips=2
    # Spec §4 item 5: valid = passed, OR failed WITH >=1 wedge-recovery signal
    # (a wedge that recovered and then hit a downstream assertion failure is
    # still a valid wedged sample). Failed with NO wedge signal = indeterminate.
    if [ "$status" = failed ] && [ "$wl" -eq 0 ]; then v=no; indet=$((indet+1)); fi
    # Executed-flip evidence for FAILED samples: a clean flip is console-silent,
    # so only wedge lines prove a flip ran. passed => both flips ran. failed with
    # ON-flip wedge lines => both ran (reaching ON implies OFF completed). failed
    # with only OFF-flip wedge lines => count 1: the failure may have hit between
    # the flips (crew-page assertions) OR after a clean ON flip — F is therefore a
    # FLOOR, off by at most 1 per such sample; every such sample is listed in the
    # PR body (documented limit, surfaced).
    if [ "$status" = failed ] && [ "$w_on" -eq 0 ]; then flips=1; fi
    if [ "$v" = yes ]; then
      valid=$((valid+1)); flips_exec=$((flips_exec+flips))
      if [ "$wl" -gt 0 ]; then wedged=$((wedged+1)); flips_wedged=$((flips_wedged+wl)); fi
    fi
    echo "sample=$total status=$status valid=$v wedge_lines=$wl flips=$flips w_off=$w_off w_on=$w_on land_off=$land_off land_on=$land_on dir=$dir"
  done
  echo "SUMMARY run=$rid traces=$total valid=$valid indeterminate=$indet wedged_samples=$wedged wedged_flips=$flips_wedged flips_executed=$flips_exec"
}
classify_run "$RUN1"
```

Every quantity the disposition needs is on the per-sample lines: N = count of `valid=yes` samples with `wedge_lines>0` among the selected 20; M = their `wedge_lines` sum; F = their `flips` sum. Indeterminates are excluded per-sample (noted in the PR body), never by aggregate subtraction.

- [ ] **Step 3: Dispatch run 2 (same Steps 1–2 shape, RUN2); replacements until ≥20 valid**

The decision reads exactly the FIRST 20 valid samples in dispatch order: concatenate the classifier's per-sample lines run by run (dispatch order), keep only `valid=yes` lines, and select the first 20 in that concatenated order (`sample=N` ascending within each run). N/M/F are computed from exactly those 20 lines (N = lines with `wedge_lines>0`; M = sum of their `wedge_lines`; F = sum of the 20 lines' `flips`). Selection is line-level, so a mid-run cutoff is unambiguous regardless of where indeterminates fall. All later valid samples are surplus — reported in the PR body as color but excluded from N/M/F.

- [ ] **Step 4: Record in the PR body**

`gh pr edit <pr-number> --body "<updated body>"` — reproduce the Task 2 body with every PENDING line filled: valid run URLs; discarded/invalid run URLs (or "none"); wedged samples N/20; wedged flips M of F executed (F from Step 2's formula); the §4.1 decision line ("0/20 wedged samples → fix confirmed" or "N≥1 → not fixed").

---

### Task 4: Ledger disposition (exactly one of A / B)

**Files:**
- Modify: `BACKLOG.md` (both outcomes)
- Modify: `BACKLOG-archive.md` + `tests/docs/_metaDeferralLedgerGraduation.test.ts` (outcome A only)

Consult spec §5 for the authoritative wording. Execute ONLY the outcome the measurement selected. **The IN PROGRESS marker is NOT touched in this task under outcome B** (it comes off in Task 6, the PR's last content commit — spec §5B / invariant 12). Under outcome A it MUST come off here (archives reject in-flight entries — same-commit rule).

- [ ] **Outcome A (0 wedged samples in 20): archive the entry**

In one commit:
1. Cut the entire `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE` section from `BACKLOG.md` (heading through the "Watch signals" paragraph). This removes the IN PROGRESS/Branch marker (it lives on the entry's meta line).
2. Append the section to `BACKLOG-archive.md` per that file's archived-entry format, meta line rewritten to `**Status:** CLOSED 2026-08-XX (upstream fix confirmed by measurement)`, watch signals preserved verbatim, plus a closing stamp paragraph containing ALL of:
   - all valid dispatch run URLs;
   - `3f0b9e61-20260317` wedged 7/10 (run 30235889083) vs `cbb046ab-20260731` wedged 0/20 samples (0 wedged flips across all executed flips);
   - Fisher exact one-sided p ≈ 5.9×10⁻⁵;
   - **the §4.1 decision rule, restated:** "Decision rule (pre-stated): 0 wedged samples in 20 valid samples = fix confirmed; ≥1 = not fixed. Measured: 0/20.";
   - the branch name `chore/next-1630-wedge-remeasure` (the graduation guard asserts the archived section contains the provenance string);
   - the note that the e2e recovery tiers remain in `expectFlipLanded` deliberately;
   - the un-archive contract verbatim: "Un-archive triggers: (a) any future `[wedge-recovery]` line (ANY tier, including the plain-escalation line) in lifecycle-layout-e2e output; (b) an admin report of a stuck Published switch. On either, this entry returns to BACKLOG.md as **Status:** OPEN (park posture re-evaluated against whatever canary is then vendored) and its `BACKLOG_GRADUATED` row is removed in the same commit."
3. Add to the `BACKLOG_GRADUATED` array in `tests/docs/_metaDeferralLedgerGraduation.test.ts` (existing commented-row style):

```ts
// chore/next-1630-wedge-remeasure (2026-08-XX): upstream React replay-loss fix
// confirmed by measurement: 0/20 wedged samples on next 16.3.0's vendored canary
// cbb046ab-20260731 vs the 7/10 baseline on 3f0b9e61-20260317.
{
  id: "BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE",
  provenance: "chore/next-1630-wedge-remeasure",
},
```

4. Verify + commit + push:

```bash
pnpm vitest run tests/docs/
git add BACKLOG.md BACKLOG-archive.md tests/docs/_metaDeferralLedgerGraduation.test.ts
git commit --no-verify -m "docs(plan): archive BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE - 0/20 wedged samples on next 16.3.0"
git push
```

Expected: vitest green before the commit; push succeeds.

- [ ] **Outcome B (≥1 wedged sample in 20): re-stamp the entry open — marker STAYS for now**

In one commit:
1. In `BACKLOG.md`, leave the `**Status:** IN PROGRESS · **Branch:** …` meta line UNTOUCHED (Task 6 removes it in the last content commit).
2. Below the l-wave-screen stamp line, add: `**Re-measured 2026-08-XX (chore/next-1630-wedge-remeasure):** next 16.3.0 (vendored canary cbb046ab-20260731) still wedges: N wedged samples of 20 valid samples; M wedged flips of F executed flips (F from the run logs per spec §4 item 4; run URLs, valid runs only); 16.3.0 is measured-insufficient, PARKED-WATCH continues.`
3. In the entry body, edit the sentence ending "so no patch-bump fix exists today." to "so no patch-bump fix existed then; next 16.3.0 (canary cbb046ab-20260731) was measured insufficient 2026-08-XX (see the re-measurement stamp)."
4. Verify + commit + push:

```bash
pnpm vitest run tests/docs/
git add BACKLOG.md
git commit --no-verify -m "docs(plan): re-stamp BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE - next 16.3.0 measured insufficient (N/20 wedged samples)"
git push
```

---

### Task 5: Whole-diff adversarial review

**Files:**
- Create (wrapper-written, committed in Task 6): new JSONL rows under docs/review-rounds/chore/next-1630-wedge-remeasure/

- [ ] **Step 1: Write the review brief**

Write to a scratch path (e.g. /tmp/wedge-remeasure-diff-brief.md, no repo path) a brief containing, verbatim where quoted:
- "Your role: REVIEWER ONLY. Do not fix issues, propose patches as commits, or imply changes you will make. Challenge the implementation approach and surface findings; fixes are the implementer session’s job in a separate dispatch."
- Fresh-eyes whole-diff posture: "Treat the entire diff as if you have not seen it before: `git diff origin/main...HEAD`."
- The spec §1.1 DO-NOT-RELITIGATE list (copy the five bullets).
- Scope note: the spec converged APPROVE after 4 rounds and the plan after its own rounds; review the DIFF (dependency bump + lockfile + ledger/docs edits) for correctness and completeness against spec §5/§7.
- Output contract: "End with exactly two final lines: `FINDINGS: <n>` then `VERDICT: <APPROVE | NEEDS-ATTENTION | BLOCKING>`."

- [ ] **Step 2: Dispatch (backgrounded), bounded wait, read the result**

```bash
OUT="$(pwd)/.codex-diff-r1-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OUT"
node scripts/codex-guard.mjs review --brief /tmp/wedge-remeasure-diff-brief.md \
  --cwd "$(pwd)" --out "$OUT" --stage diff --round 1 &
GUARD_PID=$!
until [ -f "$OUT/result.json" ] || ! kill -0 $GUARD_PID 2>/dev/null; do sleep 15; done
cat "$OUT/result.json"
```

(`--brief`, `--cwd`, `--out`, `--stage`, `--round` are all required by the wrapper.) Read `status` + `verdict` from `$OUT/result.json`. NOTE: `$OUT` is inside the worktree but dot-prefixed and untracked — do NOT `git add` it; only the wrapper's `docs/review-rounds/**` JSONL rows are committed (Task 6).

- [ ] **Step 3: Triage**

- `status:"verdict"` + `VERDICT: APPROVE` → proceed to Task 6.
- Findings → repair per the class-sweep discipline (sweep the whole diff for each finding's SHAPE before resubmitting), commit + push repairs, re-dispatch with `--round 2` (fresh `--out` dir). Repeat until APPROVE.
- `status:"no_verdict"` → infra fault per AGENTS.md silent-death guidance: re-dispatch once (fresh `--out`); if it recurs, set blockedOn in the worktree's .claude/ship-state.json marker and escalate.

---

### Task 6: Final-head gate, merge, closeout

Everything in this task runs AFTER the last review round, because spec AC-2 binds the dark-suite dispatches to the head that merges.

- [ ] **Step 1: Final content commit — corpus rows + marker removal**

```bash
git add docs/review-rounds/
```

Then, ONLY under outcome B (outcome A's marker came off in Task 4): edit `BACKLOG.md`, restoring the entry's meta line from `**Status:** IN PROGRESS · **Branch:** chore/next-1630-wedge-remeasure · **Severity:** …` to `**Status:** OPEN · **Severity:** …` (drop exactly the Branch field and flip the status; touch nothing else on the line), and `git add BACKLOG.md`.

```bash
git commit --no-verify -m "docs(plan): review-rounds corpus rows; clear flight marker"
git push
```

Verify the marker is gone from the branch (`-F` = literal match, no regex):

```bash
grep -Fn "Branch:** chore/next-1630-wedge-remeasure" BACKLOG.md BACKLOG-archive.md || echo CLEAN
```

Expected: `CLEAN` (grep exits 1 with no hits).

- [ ] **Step 2: AC-5 executable allowlist check**

```bash
git diff --name-only origin/main...HEAD | grep -v -E \
  '^(package\.json|pnpm-lock\.yaml|next\.config\.ts|tsconfig\.build\.json|tests/components/admin/sheetIconLinkContainment\.test\.ts|BACKLOG\.md|BACKLOG-archive\.md|tests/docs/_metaDeferralLedgerGraduation\.test\.ts)$|^(docs/superpowers/|docs/review-rounds/|public/help/screenshots/)' \
  || echo AC5-CLEAN
```

(Exact-file alternatives are `$`-anchored — `package.json.bak` must NOT slip through; only the three directory prefixes are open-ended.)

Expected: `AC5-CLEAN`. Any other output = an out-of-allowlist file changed — STOP, investigate, remove it before proceeding.

- [ ] **Step 3: Auto-CI green on the final head**

```bash
gh pr checks --watch
```

Expected: all green (pushes in Steps 1 re-triggered the auto suites on the final head).

- [ ] **Step 4: Dispatch all six dark suites against the FINAL head; verify head binding**

Uses `capture_run` from Task 3 Step 0 (one query returns id+headSha together — no torn pair between a "verify" query and a "watch" query; that tear was plan-review finding r2-4).

```bash
git pull --ff-only   # ensure local == origin before pinning the final head
FINAL=$(git rev-parse HEAD)
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for wf in admin-layout-e2e.yml help-affordances.yml published-modal-e2e.yml dev-gate-e2e.yml screenshots-drift.yml mutation-harness.yml; do
  gh workflow run "$wf" --ref chore/next-1630-wedge-remeasure
done
for wf in admin-layout-e2e.yml help-affordances.yml published-modal-e2e.yml dev-gate-e2e.yml screenshots-drift.yml mutation-harness.yml; do
  read -r ID SHA <<< "$(capture_run "$wf" chore/next-1630-wedge-remeasure "$FINAL" "$TS")"
  echo "$wf run=$ID headSha=$SHA"
  gh run watch "$ID" --exit-status || echo "RED: $wf run $ID"
done
```

`capture_run` only returns a run whose `headSha` equals `$FINAL`, so head binding is verified by selection, not by a separate comparison. The head-change restart rule is EXECUTABLE, not prose — after the watch loop completes (and again immediately before merging in Step 6), run the detector:

```bash
git fetch origin chore/next-1630-wedge-remeasure
[ "$(git rev-parse origin/chore/next-1630-wedge-remeasure)" = "$FINAL" ] && echo HEAD-STABLE || echo HEAD-MOVED
```

`HEAD-MOVED` → the pinned `$FINAL` is stale (a concurrent push or the regen bot commit): `git pull --ff-only`, then RESTART FROM STEP 2 — the AC-5 allowlist check (Step 2) and the auto-CI green (Step 3) are evidence about a specific head, so a new head must re-earn them before Step 4 re-dispatches all six suites against it (recompute `FINAL` and `TS` at the top of the re-entered Step 4; per-suite partial results against the old head are void). Record the six run URLs in the PR body ("Dark-suite dispatches on final head" section).

**Red routing (spec §6 — three terminals: GREEN / PRE-EXISTING-RED / ESCALATED):**
- `screenshots-drift.yml` red AT its byte-comparison step (actual drift) → Step 5's regen contingency, whose exit path re-runs the whole-diff review (Task 5) against the updated diff and then re-enters Task 6 from Step 1 (see Step 5).
- Any other red (including screenshots-drift red BEFORE comparison — setup/bootstrap/capture) → re-dispatch that suite once (flake allowance). The timestamp is captured BEFORE the dispatch, always — a timestamp taken after `gh workflow run` can postdate the run's `createdAt` and make `capture_run` wait forever:

  ```bash
  RTS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run "$wf" --ref chore/next-1630-wedge-remeasure
  read -r RID2 RSHA2 <<< "$(capture_run "$wf" chore/next-1630-wedge-remeasure "$FINAL" "$RTS")"
  gh run watch "$RID2" --exit-status || echo "STILL-RED: $wf run $RID2"
  ```

  Red again → dispatch on main. Main can advance while the dark suites run, so the main-comparison run is selected by TIMESTAMP ONLY (`capture_run_any` below) and its actual `headSha` is recorded as evidence — any current-main run answers the pre-existing question; pinning a possibly stale local `origin/main` SHA would wait forever:

  ```bash
  # capture_run_any <workflow.yml> <branch> <dispatched-after-utc> — like capture_run, no SHA filter
  capture_run_any() {
    local wf="$1" br="$2" ts="$3" pair=""
    while [ -z "$pair" ]; do
      sleep 10
      pair=$(gh run list --workflow="$wf" --branch "$br" --event workflow_dispatch \
        --json databaseId,headSha,createdAt --limit 10 \
        --jq "[.[] | select(.createdAt>=\"$ts\")] | sort_by(.createdAt) | first | if . == null then \"\" else \"\(.databaseId) \(.headSha)\" end")
    done
    echo "$pair"
  }
  MTS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  gh workflow run "$wf" --ref main
  read -r MID MSHA <<< "$(capture_run_any "$wf" main "$MTS")"
  echo "main-comparison: run=$MID at main head=$MSHA"
  gh run watch "$MID" --exit-status || echo "RED-ON-MAIN: $wf run $MID"
  ```

  Also red on main → PRE-EXISTING-RED (record both run URLs AND `$MSHA` in the PR body, file per normal ledger triage, non-blocking); green on main → bump-caused → repair exceeds AC-5 → set blockedOn in the worktree's .claude/ship-state.json marker and ESCALATE.
- Merge requires all six at GREEN or PRE-EXISTING-RED.

- [ ] **Step 5: Screenshot-regen contingency (only if drift red at comparison)**

```bash
REGEN_SHA=$(git rev-parse HEAD)
RTS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run screenshots-regen.yml --ref chore/next-1630-wedge-remeasure
read -r RID RSHA <<< "$(capture_run screenshots-regen.yml chore/next-1630-wedge-remeasure "$REGEN_SHA" "$RTS")"
gh run watch "$RID" --exit-status
git pull --ff-only
```

The regen workflow's final step commits regenerated baselines and pushes them to the branch itself (`git push origin "HEAD:$BRANCH"` in its last step) — the `git pull --ff-only` synchronizes the local worktree with the bot commit BEFORE any further local commits, preventing divergence. If the regen run fails, or a re-dispatched drift run is still red after the regen commit landed: ESCALATED (set blockedOn, escalate). Otherwise the regen bot commit is now part of the diff that merges but was NOT in the diff Task 5's review approved — so RETURN TO TASK 5 Step 2 first (re-dispatch the whole-diff review, next round number, against the updated diff including `public/help/screenshots/**`), then re-enter Task 6 from Step 1 (commit the new corpus rows; the marker-gone grep still passes) and proceed Step 2 → 3 → 4 against the new head. This loop is bounded: the regen cycle may run at most once (spec §6).

- [ ] **Step 6: Merge + verify complete**

The merge is INSIDE the guard's success branch — a mismatch cannot fall through to it — and the `0  0` completion proof is chained on the merge SUCCEEDING, so a failed merge cannot print a false completion:

```bash
git fetch origin chore/next-1630-wedge-remeasure
if [ "$(git rev-parse origin/chore/next-1630-wedge-remeasure)" = "$FINAL" ]; then
  if gh pr merge --merge; then
    git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
    git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main
  else
    echo "MERGE-FAILED - diagnose (branch protection? conflict?); do not treat as complete"
  fi
else
  if git pull --ff-only; then
    echo "HEAD-MOVED - do NOT merge; local now synced to the new head; restart from Task 6 Step 2"
  else
    echo "HEAD-MOVED and PULL-FAILED (diverged local tree?) - do NOT merge and do NOT restart until the pull succeeds; resolve the divergence first"
  fi
fi
```

Expected final line: `0	0`. Green CI is not a stopping point — merge in the same turn as the last green check. The run is complete ONLY when `0	0` prints.

- [ ] **Step 7: Stage 4.4 teardown**

1. Set stage to "done" in the worktree's .claude/ship-state.json marker.
2. `CronDelete` the implementing session's nudge job (its id is in the marker's `cronJobId`).
3. `herdr pane rename "$HERDR_PANE_ID" --clear` and `herdr agent rename "$HERDR_PANE_ID" --clear` (skip silently if `HERDR_PANE_ID` is empty).
4. Optionally remove the worktree AFTER `0	0`: `git worktree remove /Users/ericweiss/FX-worktrees/next-1630-wedge-remeasure`.
