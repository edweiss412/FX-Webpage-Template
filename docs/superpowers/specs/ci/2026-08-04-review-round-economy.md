# Review round economy — durable round corpus + filing gate

**Status:** DRAFT · **Filed:** 2026-08-04 · **Surface:** CI meta-test, `scripts/codex-guard.mjs`, new report script

## 1. Purpose

Adversarial review rounds are the project's most expensive recurring cost, and nothing observes them. Round counts exist only as hand-written prose; the artifacts that would support a retrospective are written to gitignored scratch directories and destroyed. Two retrospectives exist (`docs/agents/adversarial-round-economy-2026-07-31.md`, `docs/agents/codex-silent-death-2026-07-24.md`) and both happened because a human noticed a pattern, not because anything fired.

This spec makes the round corpus durable and obliges an arc that burns four rounds in one review stage to file a short retrospective naming what — if anything — could have been caught mechanically instead.

The goal is not to reduce findings. It is to stop paying Codex to rediscover the same deterministic defect on the next arc.

**Citation convention in this document.** A backticked `path:line` is a claim about code that exists and was verified against the tree at draft time. A path in plain text is a file this spec proposes to create and which therefore cannot be cited.

### 1.1 Resolved scope — do not relitigate

Ratified during brainstorming on 2026-08-04. Each is a decision, not an oversight.

| Decision | Ratification |
| --- | --- |
| Trigger is a **deterministic round count**, not detected finding-repetition. Repetition is what the filing looks *for*; it is not what fires the gate. A repetition trigger requires classifying findings, and classification is judgment, which a merge gate cannot adjudicate. | §4.3 |
| Threshold is **4 counted rounds, per stage**, matching the existing `REVIEW_ROUND_CAP` default so one constant governs both the dispatch block and the filing duty. | §4.3 |
| The gate is expected to fire on **most arcs at today's baseline**. That is the diagnosis, not a false-positive rate. Trigger rate falling over time is the success metric. | §4.3 |
| `**Mechanizable:** none` is a **legal, expected disposition**. The filing is a duty to look, not a duty to find. | §6 |
| The meta-test checks **presence and id-resolution only**. It does not grade prose, judge whether a classification is correct, or parse free-text finding shapes. | §7.2 |
| Threat model is **an arc that forgets**, not an arc that hides. Deliberate suppression is out of scope by declaration. | §8.1 |
| Arc identity is **branch + merge-base SHA**, read from git, never from `--out` path naming. Branch alone is not unique over time. | §5.2 |
| `--stage` and `--round` are **caller-declared and required**. Inference from brief text, `--out` path, or row-counting is rejected; see the probe in §3. | §5.1 |
| `--stage` accepts a fourth value, **`task`**, recorded but never counted. The wrapper has one subcommand serving two call classes, so a review-only domain would either lie or lock out non-review dispatches. | §5.1 |
| `findings[]` headline extraction is **deliberately not implemented**. `findingCount` comes from a declared line or is `null`. | §3, §5.3 |
| Cross-arc filing automation is **out of scope**; `pnpm review:economy` is read-only and gates nothing. | §9 |
| `no_verdict` rows — including wrapper failures — are **recorded but excluded from the threshold count**. | §5.4 |

## 2. Problem, measured

- Round history is derived at dispatch time from sibling directory names under `dirname --out` (`$HOME/.claude/hooks/review-convergence-gate.sh`, `STEM`/`PRIOR` derivation). Nothing is persisted. The count therefore depends entirely on where the caller happened to put `--out`: a fresh directory per round counts zero forever, and a shared parent counts every unrelated arc ever run.
- Review artifacts land in `.codex-reviews/` and `.review/`, both ignored by the root `.gitignore`. Round history does not survive a clean checkout.
- No script or test in the repo reads result.json across runs. The only reader is the test harness for codex-guard itself (`tests/codexGuard/harness.ts:208`, `readResult`).
- Of the five recommendations in the 2026-07-31 retrospective, one became mechanical. Four remain prose.
- No open `BACKLOG.md` / `DEFERRED.md` entry concerns review-round economy.

## 3. Probe — declared beats inferred (draft-time input)

Per the probe-before-argue rule in `docs/agents/spec-self-review.md`, candidate recognizers were run against the live corpus of real codex-guard outputs before drafting.

Corpus: **681** `attempt-*.last-message.txt` files found by a recursive walk of `/private/tmp`, the accumulated `--out` directories of real dispatches. (An earlier draft reported 45 from a one-level glob; adversarial review r2 caught the undercount. The correction is recorded in the probe and widens the gap below.)

| Signal | Kind | Hit rate |
| --- | --- | --- |
| `VERDICT:` line, wrapper accept-set (`scripts/codex-guard.mjs:392`) | **declared** in the brief | **678/681 — 99.6%** |
| `^[0-9]+\. \*\*` numbered-bold | inferred | 327/681 — 48.0% |
| `^[-*] +(BLOCKING\|…)` bullet-severity | inferred | 81/681 — 11.9% |
| `^#{1,4} .*(BLOCKING\|Finding\|NEEDS)` heading | inferred | 68/681 — 10.0% |
| union of all three inferred shapes | inferred | 441/681 — 64.8% |
| **none of the three inferred shapes** | — | **240/681 — 35.2%** |

Three stacked inferred recognizers reach 64.8%. The declared contract reaches 99.6% against the wrapper's own accept-set, and 100% if the three bold `**VERDICT:` lines it rejects are counted (conclusion 4 below).

Three consequences, all load-bearing:

1. **This spec never infers a finding shape.** Everything the row needs is declared by the caller or by a mandated brief line. A recognizer over free-form reviewer prose is the exact denylist shape the accept-set rule forbids, and the corpus says it would be wrong for better than a third of real reviews.
2. **The existing hook's finding tally is 48% accurate.** `$HOME/.claude/hooks/review-convergence-gate.sh` counts findings with the numbered-bold pattern alone, so its advisory "~N findings" line reads zero for the other 52%. Repairing it is in scope (§10) because this spec's own probe surfaced it, and leaving a known-wrong number in an operator-facing message is the defect class this whole system exists to close.
3. **The wrapper silently drops bold verdict lines.** `parseVerdict` filters on `/^\s*VERDICT:\s*\S/` (`scripts/codex-guard.mjs:392`); a line beginning `**VERDICT:` fails it and the dispatch is recorded `no_verdict`. Three outputs in the corpus do exactly that — a full review spent, then classified as an infrastructure fault. Also in scope (§10).

Reproduce: docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md. Arc-identity stability is measured separately in docs/superpowers/specs/ci/probes/2026-08-04-mergebase-stability-probe.md.

## 4. Architecture

### 4.1 Components

| Component | Responsibility |
| --- | --- |
| `scripts/codex-guard.mjs` | Accepts `--stage` and `--round`; appends one JSONL row per dispatch, at **both** result.json write sites |
| docs/review-rounds/&lt;branch&gt;/&lt;baseSha12&gt;.jsonl | Durable, committed, per-arc round corpus |
| docs/review-rounds/&lt;branch&gt;/&lt;baseSha12&gt;.md | The filing, when a stage crosses threshold |
| tests/docs/_metaReviewRoundEconomy.test.ts | Merge-gating check: obliged arcs filed, filings well-formed, cited ids resolve |
| scripts/review-economy.ts (`pnpm review:economy`) | Read-only cross-arc report; gates nothing |
| `$HOME/.claude/hooks/review-convergence-gate.sh` | Early warning at dispatch time; per-machine, advisory |

### 4.2 Why enforcement is split

The meta-test is the binding gate: it runs in existing CI, is visible to every harness and every account, and survives a fresh clone. The hook does the two things CI structurally cannot — it exists at dispatch time, and it can warn while the arc is still live. This is a division of labor, not redundancy. Neither substitutes for the other, and the repo has twice recorded the lesson that a per-machine hook cannot be the binding contract.

### 4.3 Threshold

**`ROUND_THRESHOLD = 4`**, counted per `(arc, stage)`, where an arc is `(branch, baseSha)` per §5.2. This is the single canonical definition. Every section that reasons about the threshold references `ROUND_THRESHOLD` rather than the literal; the only places a bare `4` appears are the §1.1 summary row and the §11.2 fixtures, where a fixture must state a concrete count. It matches the `REVIEW_ROUND_CAP` default in `$HOME/.claude/hooks/review-convergence-gate.sh` so one number governs the dispatch block and the filing duty.

A stage reaching 4 counted rounds obliges a filing section for that stage. Stages are independent: an arc may owe a filing for `diff` and owe nothing for `spec`.

**Amended 2026-08-22 — the threshold's unit.** A stage now reaches it EITHER per `(arc, stage)` as above, OR by the arc's rounds summed across every base of one branch directory, counting distinct `(baseSha, round)` pairs. See `docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` (2026-08-22) §3.1.

## 5. Record format

### 5.1 New flags

Both are added to the value-taking flag set in `parseArgs` (`scripts/codex-guard.mjs:68`, flag `Set` at `codex-guard.mjs:71-83`) and validated in `buildConfig` (`codex-guard.mjs:100`), alongside the existing required `--brief` (`codex-guard.mjs:132`), `--cwd` (`codex-guard.mjs:133`), and `--out` (`codex-guard.mjs:134`).

| Flag | Accept-set | Missing / invalid |
| --- | --- | --- |
| `--stage` | Exactly one of `spec`, `plan`, `diff`, `task` | `usageError` (`codex-guard.mjs:43`), exit 2 |
| `--round` | Decimal integer ≥ 1 | `usageError`, exit 2 |

The accept-set is closed and keyed on value, not spelling: anything outside the three stage literals is rejected by name, never coerced or bucketed into an `unknown` stage. An `unknown` bucket would be a silent exemption from the gate, which is precisely the failure this design refuses.

**`task` exists because the wrapper has one subcommand and two call classes.** `AGENTS.md:184` routes all direct `codex exec` **review/task** dispatches through `codex-guard review` — the only subcommand there is (`scripts/codex-guard.mjs:69`). A non-review task has no truthful value among `spec`/`plan`/`diff`; declaring it `diff` would record a review round that never happened, and four such tasks would manufacture a filing obligation out of nothing. `task` rows are **recorded and never counted toward the threshold**, the same treatment `no_verdict` gets (§5.4), so the corpus stays complete and the gate stays honest. Refusing to offer the value instead would make a hard-cutover required flag unusable for a currently supported call class.

Both are **required**, a hard cutover. There is no dual-mode grace period: a mode where the flags are optional is a mode where forgetting them exempts the arc, and forgetting is the entire threat model (§8.1). `--label` already exists (`codex-guard.mjs:120`, validated `codex-guard.mjs:130` against `/^[A-Za-z0-9_-]{1,64}$/`) and is unchanged; it names a scope, not a stage.

**Operational note.** The `adversarial-review` skill lives in the per-machine `~/.claude/` tree and is not tracked here. A machine whose skill constructs a dispatch without the new flags gets a loud exit-2 usage error naming the missing flag — never a silent skip. Repo-tracked call sites are updated in the same PR (§10).

### 5.2 Path

The corpus path is docs/review-rounds/&lt;branch&gt;/&lt;baseSha12&gt;.jsonl, with the filing as its sibling docs/review-rounds/&lt;branch&gt;/&lt;baseSha12&gt;.md.

`<branch>` is `git rev-parse --abbrev-ref HEAD` used **as a nested path**, not slugged: branch `feat/foo` writes under docs/review-rounds/feat/foo/. Mirroring the branch path is injective; flattening `/` to `-` collides two branches differing only there.

**`<baseSha12>` is the first 12 characters of `git merge-base origin/main HEAD`, and it is what makes an arc an identity rather than a name.** A branch name is not unique over time: this repository has already reused three across distinct PRs — `feat/attention-alert-routing` (#524, #526, #529), `feat/watch-reconcile-backoff` (#597, #620), and `feat/role-vocab-settings-desktop-grid` (#402, #431). Keyed on branch alone, a later arc reusing a merged arc's name inherits its corpus and its filing: the old rounds are legal duplicates under §5.5, the old filing satisfies §7.1, and the gate reports compliance for an arc that burned four rounds and filed nothing. That is silent wrongness, not a conservative outcome, so it is a defect rather than a documented limit.

The merge base is stable for the life of an arc. `origin/main` advancing does not move it — only rebasing the branch, or merging main into it, does. When that happens the arc splits into two directories and under-obliges: the conservative direction, visible in the report as two short arcs, and the same behavior already documented for a rename (§8.3).

**Amended 2026-08-22 — the base-move half of this is no longer accepted.** A residual obligation sums the arc's rounds across every base of one branch directory, so a base move no longer under-obliges. The RENAME half stands unchanged. See `docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` (2026-08-22) §3.1 and its §4 limit 7.

`baseSha` is recorded on every row (§5.3) so the corpus stays self-describing when rows are read outside their directory.

**The corpus root resolves against the git toplevel of `--cwd`, not `--cwd` itself** — `git -C <cwd> rev-parse --show-toplevel`, the call already used for exactly this purpose at `scripts/spec-lint.ts:210`. `--cwd` is validated only to be a directory (`scripts/codex-guard.mjs:158`), so a dispatch handed a repo subdirectory would otherwise write its corpus at `<repo>/app/docs/review-rounds/…` while the meta-test, walking from the repo root, sees nothing and passes — silent wrongness under §8.2. Resolving against the toplevel lands every subdirectory in the one gated corpus.

Resolving against `--cwd` rather than the wrapper's launch directory remains essential for the same reason `--lint-doc` does it (`scripts/codex-guard.mjs:162`): invariant 11 makes the launch directory and the reviewed worktree differ on every run.

`docs/` is not gitignored — the ignored review paths are `.codex-reviews/` and `.review/` — so no ignore-file change is required.

Per-arc files mean concurrent worktrees never touch the same file. Invariant 11 already forbids two writers in one working tree, so within-file concurrency is bounded to one arc.

### 5.3 Row schema

```json
{
  "stage": "diff",
  "round": 3,
  "branch": "feat/foo",
  "baseSha": "20fccb1f3a0c",
  "label": "guard-scope",
  "status": "verdict",
  "verdict": "BLOCKING",
  "failureReason": null,
  "findingCount": 5,
  "startedAt": "2026-08-04T14:02:11.000Z",
  "endedAt": "2026-08-04T14:19:40.000Z",
  "briefPath": ".review/foo-r3/brief.md",
  "outDir": ".review/foo-r3",
  "guardVersion": 1,
  "recoveredFrom": null
}
```

All scalars. There is no array field and no free-text field, so a row is bounded by construction rather than by truncation logic. `status`, `verdict`, `recoveredFrom`, `guardVersion`, and `label` are copied verbatim from the result.json body assembled in `writeResult` (`codex-guard.mjs:693`, keys at `codex-guard.mjs:695-711`).

`guardVersion` is a **number** — `const GUARD_VERSION = 1` (`scripts/codex-guard.mjs:21`) — not a string. The row copies it verbatim, so the field is typed `number | null` (`lib/reviewRounds/row.ts:23`) and a string is rejected by the schema check (`row.ts:80`). An earlier draft of this schema showed it quoted; the sample above is the corrected form (plan resolution R3).

`findingCount` is an integer when the reviewer emitted a declared `FINDINGS: <n>` line, and `null` otherwise. It is never inferred from prose shape (§3). The brief-authoring contract in `AGENTS.md` gains this line next to the existing mandated `VERDICT:` line; the corpus shows the declared-line mechanism at 100% reliability.

### 5.4 Which rows count

Every dispatch appends a row. The threshold counts **distinct `round` values among rows with `status === "verdict"`**.

**Amended 2026-08-22 — the counting rule is unchanged; what it is counted OVER is not.** The same two conjuncts now also feed a per-directory sum over distinct `(baseSha, round)` pairs, because `round` alone collapses two bases that both restart at 1. See `docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` (2026-08-22) §3.1.

**The counting rule is exactly two conjuncts, and `failureReason` is not one of them:** `status === "verdict"` AND `stage` in `spec`/`plan`/`diff`. Nothing else participates.

Stating it that way matters because `failureReason` is **not** `null` on every counted row. `status` takes two values (`scripts/codex-guard.mjs:698`, `codex-guard.mjs:792`, `codex-guard.mjs:1017`, `codex-guard.mjs:1081`) and there is no `wrapper_error` status — a wrapper failure is `status: "no_verdict"` with `failureReason: "wrapper_error"` (`codex-guard.mjs:1087`). But `giveUp()` (`codex-guard.mjs:1026`) merges `tryRolloutScrape()` into the result, so a **recovered verdict** carries a real verdict alongside `failureReason: "total_timeout"` or `"attempts_exhausted"` (`codex-guard.mjs:1031`, `codex-guard.mjs:1033`, `codex-guard.mjs:1036`). Those are real review rounds — the reviewer did its work and the verdict was recovered from the rollout — and they count.

| `status` | `stage` | `failureReason` | Recorded | Counts |
| --- | --- | --- | --- | --- |
| `verdict` | `spec`/`plan`/`diff` | **any value, including non-null** | yes | **yes** |
| `verdict` | `task` | any | yes | **no** — not a review round (§5.1) |
| `no_verdict` | any | any, including `"wrapper_error"` / `"interrupted"` | yes | **no** |

The table is exhaustive over the `status` axis, and `failureReason` is deliberately shown as "any" on the counted row rather than enumerated. An implementation that reads a `failureReason: null` column as part of the counted combination would drop four recovered verdicts, see a contiguous `1..4`, oblige nothing, and pass all nine gate assertions — an obliged arc reported compliant.

`verdict` itself (`APPROVE` / `NEEDS-ATTENTION` / `BLOCKING`) is recorded verbatim and **not** constrained by the gate. The wrapper owns that vocabulary; a new outcome value must not fail the corpus.

An infrastructure fault is not a review round. The reaper bug killed 58% of dispatches at one point (`docs/agents/codex-silent-death-2026-07-24.md`); counting those would push nearly every arc over threshold on noise and discredit the gate in its first week.

Rows must be emitted at **both** result.json write sites — `writeResult` (`codex-guard.mjs:693`, write at `codex-guard.mjs:712`) and the `wrapper_error` catch (`codex-guard.mjs:1075-1093`). Emitting at only the first silently loses every wrapper failure from the corpus. The second site omits `recoveredFrom` and `nativeBinaryResolved` from its body, so the row writer defaults those to `null` rather than reading undefined keys.

### 5.5 Duplicate rounds are legal

`AGENTS.md` makes split tight-scope reviews the default for large diffs, so several dispatches commonly share one round. All scopes in a wave pass the same `--round`; distinct-value counting makes the wave count once. This is why `--round` is declared rather than derived: deriving it by counting existing rows is a read-modify-write race across parallel dispatches, and it would tax the practice the repo recommends.

## 6. Filing format

docs/review-rounds/&lt;branch&gt;/&lt;baseSha12&gt;.md — the sibling of the arc's corpus file (§5.2) — with one `##` section per **triggered** stage.

```markdown
## diff — 7 rounds

**Examined:** R1–R7, 23 findings.

**Mechanizable:**
- "spec cites a symbol that no longer exists" (R2, R4, R5) —
  extend `spec:lint` to resolve every `file:line` citation → BL-SPEC-CITATION-RESOLVE

**Judgment:** R1 scope call on the picker pivot; R6 copy decision.
**Infra:** R3 reaped, no verdict.
```

Required structure, and nothing more:

1. An `## <stage> — <n> rounds` heading whose stage is one of the three literals and has rows in the corpus.
2. An `**Examined:**` line.
3. At least one of `**Mechanizable:**`, `**Judgment:**`, `**Infra:**`.
4. Every `BL-`/`DEF-` id cited anywhere in the section resolves against the ledgers.

`**Mechanizable:** none` is legal and expected. `**Examined:**` must still enumerate what was looked at — cheap when true, and a hollow filing is legible to any reader.

Mechanization work items are ordinary `BL-` rows in `BACKLOG.md`. They reuse the existing referential-integrity, archival, and `ledger:claims` machinery rather than introducing a third ledger.

## 7. Gate

### 7.1 What it asserts

tests/docs/_metaReviewRoundEconomy.test.ts walks **every** `.jsonl` **and every** `.md` under docs/review-rounds/ **recursively, discovered from disk**, so a new arc's files are covered by default and can never be silently exempt.

**Discovery is over both extensions, not over corpora alone.** Enumerating `.jsonl` and reaching for a sibling filing leaves an orphan `.md` — a filing with no corpus — unvisited, which makes assertion 5 vacuous in exactly the case it exists to catch. The walk collects arc directories, and an arc is any directory holding either file.

Per arc, per stage:

1. Every row parses as JSON and satisfies the schema; `stage` is in the accept-set; `round` is an integer ≥ 1; `status` is one of the two literals (§5.4).
2. Declared `round` values form a contiguous run `1..N`. **Duplicates are permitted** (§5.5). A gap means rows were lost or hand-edited.
3. Counted rounds (§5.4) ≥ `ROUND_THRESHOLD` → the sibling `.md` exists and has a well-formed section for that stage (§6).
4. Every `BL-`/`DEF-` id cited in a filing section resolves.
5. A filing section naming a stage with zero rows fails — catches copy-paste between arcs.
6. **Every row's `branch` and `baseSha` match its containing path** (§5.2). A row claiming `feat/wrong@bbbb…` inside `feat/right/aaaa…/` is a false identity in the committed corpus, and the report would read it as fact.
7. **A filing heading's round count equals the counted rounds for that stage.** `## diff — 999 rounds` over a four-round corpus is a false count, not a matter of prose quality.
8. **At most one section per stage.** §6 specifies one; two contradictory sections for `diff` otherwise both pass, and nothing says which is the filing.
9. **An orphan filing fails** — an `.md` in an arc directory with no `.jsonl` beside it. Either the corpus was deleted or the filing was written for an arc that never ran.

Assertions 6 through 9 are checks on **structural values** — an id, a count, a cardinality, a file's existence. None of them reads the free-text shapes or judges a classification, so none crosses the §7.2 line.

Id resolution reuses `tests/docs/_ledgerMdast.ts` (`extractEntries` at `_ledgerMdast.ts:313`, `ledgerIds` at `_ledgerMdast.ts:402`) rather than importing from `_metaLedgerReferentialIntegrity.test.ts`, whose `definedIds` (`_metaLedgerReferentialIntegrity.test.ts:126`) is exported from a test module; importing a `*.test.ts` re-registers its suite.

### 7.2 What it deliberately does not assert

Prose quality, whether a classification into mechanizable/judgment/infra is *correct*, and the content of the free-text shapes. Those are judgment. A test reaching for them becomes the shell-grammar-parser outcome this system exists to prevent, and it would make the gate arguable, which destroys its only advantage over a repetition trigger.

### 7.3 Where it runs

`tests/docs/**/*.test.{ts,tsx}` is in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:134`), executed by the `parallel` project (`vitest.config.ts:114`) in job `unit-suite-nodb` (`.github/workflows/unit-suite.yml:136`), whose aggregator `unit-suite` (`unit-suite.yml:176`) is the required check. No new workflow.

## 8. Threat model, consequence bound, documented limits

### 8.1 Threat-model fence

This system defends against **an arc that forgets** — a well-intentioned run that burns rounds and moves on without recording what it learned. It does **not** defend against an arc that hides: bypassing codex-guard, deleting rows before commit, or hand-editing the corpus are out of scope by declaration and file to §8.3.

Without this fence the surface ratchets into an anti-tamper system, and a wider recognizer is a bigger target for the next review round.

### 8.2 Consequence bound

Every arc is correctly obliged, correctly exempt, or loudly refuses to record. Never silently wrong.

Over-obligation — a filing demanded where nothing was mechanizable — costs one `**Mechanizable:** none` line and is a **documented limit, not a finding**. A conservative demote plus a surfaced warning files to §8.3 without a review round.

### 8.3 Documented limits

1. **Dispatches outside codex-guard record nothing.** `AGENTS.md` already says review dispatches should route through the wrapper; this is one more reason. Visible as a silent arc (§9).
2. **The corpus can be hand-edited or omitted before commit.** Out of threat model (§8.1). CI cannot see rounds never committed.
3. **Amended 2026-08-22 — the merge-base half is repaired; the rename half stands.** A residual clause sums the arc across every base of one branch directory, so a base move no longer under-obliges (`docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` (2026-08-22) §3.1). A rename still splits the arc and still under-obliges. The original text follows, and the `--round` restart it describes remains correct and by design.

   **Anything that moves the merge base or the branch name splits the arc** — a rename, a rebase, or merging main into the branch. The arc reads as two short arcs and under-obliges. Conservative direction, visible in the report, accepted (§5.2). **The caller's `--round` counter restarts at 1 on the new side of a split**, because `round` is declared within an arc and the new side is a new arc: a dispatch carrying the pre-split arc's next number lands as a gap under §7.1 assertion 2, which reads as "rows were lost or hand-edited" and is the one diagnosis that is not true here. Demonstrated live on this arc — merging main moved its base to `48b280b949cc` and the next dispatch declared `--round 6` into an otherwise empty corpus. The operator-visible round number survives in `label` (`diff-wrapper-r6`), which the gate does not constrain, so restarting the counter costs no history.
4. **Only the summary row is durable.** Transcripts stay in the machine-local `--out` directory. Losing one loses detail, not the count.
5. **`--round` is caller-declared and can be wrong.** A wrong value shows as a contiguity gap (§7.1 assertion 2) unless it duplicates an existing round, in which case the wave undercounts by one. Accepted: the alternative is the derivation race (§5.5).
6. **`findingCount` is `null` for any reviewer that omits the declared line.** Never inferred (§3).
7. **Arcs merged before the declared `ADOPTION_BOUNDARY` are invisible to the report**, by construction (§9). They are reported as a count, never enumerated, and never called silent. The boundary is declared rather than observed precisely so this limit stays a limit: a derived boundary would extend it forward over live arcs that the contract already covered, which is silent wrongness rather than a bounded exclusion.
8. **On a shallow clone the report declines the merged-arc scan entirely** (§9). CI checks out at depth 1 by design (`.github/workflows/unit-suite.yml:152`), so this is the normal CI state, not an edge case.
9. **`stage: "task"` rows never oblige a filing** (§5.1). A non-review dispatch is recorded for completeness and is invisible to the threshold.
10. **A `--cwd` outside a git repository records nothing.** The wrapper warns on stderr and leaves the exit code and result.json untouched. Distinct from a detached HEAD (exit 2) deliberately: inside a repo, a detached HEAD is a live arc whose identity cannot be determined, so under-recording it silently is the §8.2 failure; outside a repo there is no arc to record. (Plan resolution R1.)
11. **A filing may cite a DEFERRED entry by an id the gate does not recognize.** DEFERRED entries carry bare SHOUTY ids (`PSQL-GUARD-RECALL-RESIDUAL`), not a `DEF-` prefix, and the citation recognizer matches `BL-`/`DEF-` tokens only (`lib/reviewRounds/filing.ts:24`). An unrecognized token is not treated as a citation, so it is neither resolved nor rejected. Conservative under-check; widening the recognizer would classify ordinary prose as a citation. (Plan resolution R2.)
12. **The code-block decider is a block-level CommonMark parse, not a renderer.** Rewritten 2026-08-07 (arc B, `feat/review-infra-gates`) when `BL-CODEX-GUARD-COMMONMARK-PARSE` shipped: `stripCodeBlocks` now tracks a container STACK — block quotes and list items as frames, dedents that POP rather than re-derive from the root, lazy continuation that does not pop — and recognizes fenced code (relative indent, both characters), indented code (CommonMark 5.2's marker-plus-one rule included), and HTML blocks (types 1-7). The prior text is superseded; what follows is the measured residue.

    **What the parse still does not model, each with the probe that settles it.** Inline constructs are out of scope BY CONSTRUCTION — this is a code/not-code line classifier, so a `VERDICT:` line inside an inline code span on a prose line is still read as prose. Two block constructs are recognized only incidentally:

    - **Link reference definitions and setext headings are not parsed as such.** Neither opens or closes a block, so neither changes the classification of the lines around it. Probed 2026-08-07 (arc B G2a): an indented example following each is correctly hidden, because the indented-code rule alone decides it. They miss in the ADMIT direction if a future construct depends on them.
    - **Block-quote containers are modelled, but the gap they closed was never observable here.** Probed 2026-08-07: `> VERDICT: APPROVE` with no code construct anywhere is ALREADY `no_verdict`, because the marker test is line-anchored and a `>` prefix defeats it before the code decider is consulted. A quoted line can therefore never carry a readable verdict. The consequence that DOES matter was probed and holds in both the old and new code: a quoted fence cannot swallow the document's real last line.

    **The measured miss the rewrite closed** was HTML blocks, and only HTML blocks: against the old recognizer, a `VERDICT:` line inside `<pre>` or `<div>` was read as the reviewer's own (2/13 shapes probed at G2a; the other 11 already classified correctly, which is itself worth knowing — the prose above overstated what was broken).

    **The bounds are unchanged and still carry the weight.** The brief contract mandates a real `VERDICT:` line as the message's LAST line and the last surviving marker wins; a block left open at EOF strips nothing, so the tail is never discarded; and a reviewer emitting only a fake verdict inside a code block is an arc that LIES, which §8.1 fences out of the threat model. Over-stripping, the direction HTML-block coverage newly adds, yields a LOUD `no_verdict` rather than a false accept.

## 9. Report

`pnpm review:economy` — `tsx scripts/review-economy.ts`, read-only, gates nothing.

Output:

- Rounds per stage per arc, and counted-vs-recorded rows. **Per stage** — never collapsed across stages, since the threshold is per-stage (§4.3) and a collapsed number cannot be compared against it.
- Trigger rate by month — the success metric named in §1.1. **Defined on one event and one population, because two defensible readings otherwise report conflicting facts for the same month.** The population is `(arc, stage)` pairs having at least one counted row (§5.4) — so `task` stages and stages with only `no_verdict` rows are excluded, since no review completed. A pair is bucketed by the month of its **first counted row's `startedAt`**, and counts as triggered if it **ever** reached `ROUND_THRESHOLD`. Rate is triggered ÷ population within the bucket. Bucketing the crossing separately from the population lets a stage that began in January and crossed in February land in two months at once, which makes a monthly rate exceed 1 and reports January as both 50% and 0%.
- Finding-count totals by stage, over rows where the declared line was present. **Rows with `findingCount: null` are excluded from the total and reported separately as a count of undeclared rows.** Folding `null` into zero would state a false total; §5.3 makes `null` mean "not declared," never "none found."
- **Silent arcs**: arcs that merged with zero rows in the corpus.

**A merged arc's `baseSha` is reconstructed as `git merge-base <merge>^1 <merge>^2`, never as the merge commit's first parent.** The first parent is main's tip at merge time, which equals the merge base only when main did not advance after the branch diverged. Measured across the seven merges on the three reused branch names, **four of seven differ**:

```
#402  first-parent 902aa9a4d4e6   merge-base 902aa9a4d4e6   same
#431  first-parent 243e3636d20a   merge-base 40f96820bd06   DIFFERS
#524  first-parent c5e8250c818e   merge-base 83104efdf828   DIFFERS
#526  first-parent c813a67140d4   merge-base c813a67140d4   same
#529  first-parent 978029759b7e   merge-base b190a5721d1b   DIFFERS
#597  first-parent fb87a84624b8   merge-base 8696436a223a   DIFFERS
#620  first-parent 2d14b380ca7c   merge-base 2d14b380ca7c   same
```

Using the first parent makes the join miss a corpus that is present, and the report then lists a fully-recorded arc as silent. The reconstruction is the same call the writer used at record time (§5.2), which is what makes the two sides join at all.

**Every join in the report is on the `(branch, baseSha)` arc identity of §5.2, never on branch alone.** This is the same defect the gate was repaired for, in the report's own aggregation: the three reused branch names each carry distinct merge bases per arc — `attention-alert-routing` at `83104efdf828` (#524), `c813a67140d4` (#526), `b190a5721d1b` (#529) — so a branch-only join reads an older arc's rows as evidence for a later one and suppresses the later arc from the silent-arc list. Every metric above except silent-arc presence is miscomputed the same way.

**The merged-branch accept-set is declared, and everything outside it is reported by name.** Reading `git log --merges` unqualified is wrong here. Measured against this repository's history:

```
all merge commits                  916
  first-parent merges              677
  NOT first-parent                 239   <- overwhelmingly "merge main into feature"
    of which `Merge branch 'main'`  183
first-parent w/ PR-merge subject   676
first-parent unrecognized            1
```

The 239 non-first-parent merges are main being merged _into_ a feature branch. Counting them as merged feature arcs would invent hundreds of silent arcs that never existed.

The accept-set is therefore **first-parent merges whose subject carries a PR reference**, from which the branch name is taken. Everything outside it is **counted and reported as `unrecognized`, with its subject** — never dropped, never guessed at. Today that residue is exactly one commit, and it is worth naming because it shows why the residue must be reported rather than assumed empty: `Merge PR #4: M12.2 Phase B1 — admin nav shell + settings shell` is a genuine PR merge in a second spelling, not noise. A recognizer tuned to the 676-instance form alone would silently lose it.

A denylist over merge subjects would accept whatever it failed to model; this is the accept-set discipline applied to the report's own input.


**The silent-arc universe is bounded by adoption, not by history.** 668 of the recognized PR merges predate this spec, and the corpus is empty for all of them: reported unbounded, every one would be listed as a silent arc, which is a mass false classification of arcs that merged before any recording contract existed. The universe therefore begins at the **adoption boundary**. Arcs merged before it are excluded and reported once, as a single count of pre-adoption merges, never enumerated as silent. §12 declines backfill; this is what declining it costs and how it is contained.

**The boundary is a DECLARED constant, not the earliest `startedAt` observed in the corpus.** `ADOPTION_BOUNDARY` is one ISO-8601 timestamp, written into the constants module by the commit that merges this system and never computed at report time. An observation-derived boundary is silently wrong in two ways, and both are the §8.2 failure rather than a conservative limit:

1. **It hides the first post-adoption silent arcs.** The recording contract goes live the moment the wrapper ships, but the first row is written whenever the next dispatch happens to run. If the feature merges at 10:00, an unrecorded arc merges at 11:00, and the first row lands at 12:00, a derived boundary of 12:00 files the 11:00 arc as pre-adoption. That arc merged under the contract with zero rows — it is exactly what "silent" means — and the report calls it out of scope.
2. **An empty corpus makes every silent arc undiscoverable, permanently.** With no rows there is no earliest `startedAt`, so the derived boundary is `null` and the universe is empty. The report then declares no silent arcs precisely when nothing at all is being recorded, which is the one state where the silent-arc list is most load-bearing. The failure is self-concealing: the worse the adoption, the cleaner the report.

A declared constant closes both. The 11:00 arc is post-adoption because the constant says the contract was live at 10:00, and an empty corpus still has a boundary, so a zero-row post-adoption arc is listed as silent rather than defined away. The observed earliest `startedAt` is still reported, as an **advisory line** beside the constant: a corpus whose earliest row precedes `ADOPTION_BOUNDARY` means the constant is wrong, and saying so is cheaper than deriving a number that cannot be checked against anything.

**AMENDMENT (2026-08-07 — see `2026-08-07-round-economy-followups.md`).** "A corpus whose earliest row precedes `ADOPTION_BOUNDARY` means the constant is wrong" did not model the adoption arc's OWN pre-merge rows. The wrapper began writing rows on the adoption BRANCH hours before that branch merged, and §12 of this spec declares that arc pre-adoption by construction — so those rows cannot indict the constant, and the original wording printed a falsehood on every live run, which is the known-wrong-number-in-an-operator-facing-message class this system exists to close. The advisory now **excludes** a row when a recognized merge exists with the same `branch`, with `mergedAt <= ADOPTION_BOUNDARY` (pre-adoption under the existing `<=` carve-out), and with the row's `startedAt <= that merge's mergedAt`; several pre-adoption merges of one branch use the chronologically latest. The join is on **branch + time**, deliberately NOT on `arcKey(branch, baseSha)`: `mergedArcs` derives `baseSha` from the merge-base of the merge's two parents, so a split arc's earlier segments can never match an exact key. Every timestamp comparison in the block runs on parsed instants — one `instant()` parse function, and ordering helpers that accept only its output, so a site that forgets to parse is a compile error rather than a lexical compare (offset-bearing ISO-8601 strings order differently lexically than chronologically; corrected 2026-08-09, this sentence previously said "through one comparator" and there are two, `<` and `<=`, both required). A `startedAt` outside an explicit accept-set — explicit and range-bounded offset, fractional seconds capped at milliseconds, calendar-valid, finite parse — is excluded from the computation AND counted in a note rather than dropped in silence. When it still fires the line reads:

> `ADVISORY: the earliest recorded row (…) precedes the declared adoption boundary (…) and no same-branch pre-adoption merge covers it — the boundary, the row's arc attribution, or the row's own timing is in question.`

It states the observation and leaves the cause open. It does NOT claim the row's arc has no pre-adoption merge: a row that merely fell outside its arc's time cap reaches that line WITH one, and that is the case keeping the reused-branch signal alive. Under a shallow clone the advisory is withheld together with the silent-arc list, because the exclusion needs the same merge scan; the shallow-refusal note says so.

**The report refuses to present a shallow repository as complete history.** `git rev-parse --is-shallow-repository` gates it: on a shallow clone the merged-arc scan is skipped and the report says so by name, rather than emitting a silent-arc list computed over truncated history. A partial answer labelled complete is the §8.2 failure; a refusal labelled a refusal is not.

Silent-arc listing is the observable form of limits §8.3.1 and §8.3.2. It is deliberately **not** a gate: many branches legitimately have no review at all. Converting an invisible hole into a visible one is as far as the threat model reaches. Read-only does not excuse a wrong number, though — the report presents its output as fact, so the producer is tested against real history (§11.3).

## 10. Work items

1. `--stage` / `--round` flags in `parseArgs` + `buildConfig`, with accept-set validation and exit-2 usage errors.
2. JSONL row writer, called from **both** result.json write sites. No JSONL utility exists in the repo today; this is new (`lib/` module, unit-tested independently of codex-guard).
3. `FINDINGS: <n>` added to the mandated brief contract in `AGENTS.md`, next to the existing `VERDICT:` line.
4. tests/docs/_metaReviewRoundEconomy.test.ts with a fixture corpus, following the `mkdtempSync(join(tmpdir(), …))` pattern at `tests/docs/_metaLedgerClaimCollision.test.ts:166`.
5. scripts/review-economy.ts + `review:economy` package script, including the declared `ADOPTION_BOUNDARY` constant (§9) written by the merging commit, and the behavioral shallow-clone refusal test (§11.3 layer 2a).
6. Repair the finding tally in `$HOME/.claude/hooks/review-convergence-gate.sh` to match the corpus (§3, consequence 2), or drop the number rather than print a wrong one.
7. Update repo-tracked codex-guard call sites and `AGENTS.md` for the new required flags.
8. Enroll `_metaReviewRoundEconomy` in `tests/mutation/source/registry.ts` (`GUARD_SURFACES` at `registry.ts:120`, `GuardSurface` at `registry.ts:12-23`, `validateSurface` at `registry.ts:41`). Two things block a second surface today and are part of this item: the gate requires an `EXPECTED_LEDGER_KINDS` entry keyed by surface id (`tests/mutation/guardSurfaces.gate.test.ts:33`), and its control mutation is hardcoded to a `taskContract` source string (`tests/mutation/guardSurfaces.gate.test.ts:110-129`), so the control must be generalized per surface before any second row can pass.
9. Widen `parseVerdict` to tolerate surrounding markdown emphasis on the final line (`scripts/codex-guard.mjs:392`), or report the rejected shape explicitly instead of recording a silent `no_verdict`. Three dispatches in the probe corpus were lost this way (§3, consequence 3) — a full review spent, then filed as an infrastructure fault.
10. Row in `docs/superpowers/specs/ci/README.md`.

## 11. Testing

### 11.1 Row emission (`tests/codexGuard/`)

Existing convention is `*.test.ts` with shared `harness.ts`. Each test names the failure it catches.

| Test | Failure caught |
| --- | --- |
| Row appended after result.json, with declared stage/round | Emission silently no-op |
| Row appended from the `wrapper_error` site too | Wrapper failures missing from the corpus |
| `no_verdict` and `wrapper_error` rows recorded, marked | Infra faults vanishing |
| Read-only corpus dir → warn, exit code unchanged, result.json still written | Telemetry breaking a review |
| Detached HEAD → exit 2; on `main` → skip with warning | Rows landing in nonsense locations |
| Missing/invalid `--stage`, missing/invalid `--round` → exit 2 naming the flag | Inference creeping back in; silent `unknown` bucket |
| Branch `feat/foo` → nested docs/review-rounds/feat/foo/&lt;baseSha12&gt;.jsonl | Slug collision between branches differing only by `/` |
| `--cwd` pointed at a repo subdirectory still writes the repo-root corpus | A corpus written under `<repo>/app/docs/` that the gate never walks |
| Two arcs on the same branch name with different merge bases get separate directories | A later arc inheriting a merged arc's corpus and filing |

### 11.2 Gate (tests/docs/_metaReviewRoundEconomy.test.ts)

Fixture corpus for determinism, plus a live-tree pass over the real `docs/review-rounds/`.

| Fixture | Expected |
| --- | --- |
| 4 distinct verdict rounds, no filing | **FAIL** — the core assertion |
| 3 verdict + 1 `no_verdict` | **PASS** — infra noise must not oblige |
| 3 verdict + 1 `no_verdict` with `failureReason: "wrapper_error"` | **PASS** — the wrapper-error path is the same status, not a third one |
| 4 verdict rounds, each with `failureReason: "attempts_exhausted"` | **FAIL** — recovered verdicts are real rounds and must oblige (§5.4) |
| 4 verdict rounds with `stage: "task"`, no filing | **PASS** — a task dispatch is not a review round (§5.1) |
| rounds `1,2,3,3,3` (parallel wave) → 3 distinct | **PASS** — the recommended practice is not taxed |
| rounds `1,2,4` | **FAIL** — gap |
| filing cites a `BL-` id absent from the ledgers | **FAIL** |
| filing section for a stage with zero rows | **FAIL** |
| `**Mechanizable:** none` with `**Examined:**` | **PASS** — the honest case stays cheap |
| `**Examined:**` missing | **FAIL** |
| malformed JSON row | **FAIL**, message naming file and line |
| corpus file **nested two levels deep** (`feat/foo/*.jsonl`), 4 verdict rounds, no filing | **FAIL** — a flat walk would miss it, which is how this defect shipped in draft 1 |
| same branch dir, two `<sha>` files: an old arc with a filing, a new arc with 4 rounds and none | **FAIL** — the new arc must not inherit the old filing |
| row's `branch`/`baseSha` disagree with the containing path | **FAIL** — assertion 6; a false identity the report would print as fact |
| filing heading says `999 rounds` over a 4-round corpus | **FAIL** — assertion 7 |
| two `## diff` sections in one filing | **FAIL** — assertion 8; §6 specifies one |
| orphan `.md` in an arc directory with no `.jsonl` beside it | **FAIL** — assertion 9; the case a `.jsonl`-first walk never visits |
| **new fixture arc dropped in, 4 verdict rounds, no filing** | **FAIL without editing the test** — fails-by-default |

Expected values derive from fixture contents; no hardcoded counts.

### 11.3 Report

Two layers, because a pre-parsed fixture list would let the test pass while the git-to-branch producer is wrong:

Every output §9 promises gets behavioral coverage. A report that presents a false number is the failure mode §9 declines to excuse, so "read-only" buys no test relief.

1. **Producer against a synthesized fixture repository.** Build a repo in a temp dir (`mkdtempSync`, per `tests/docs/_metaLedgerClaimCollision.test.ts:166`) containing one of every shape the accept-set must decide: a standard `Merge pull request #N from …`, the second spelling `Merge PR #N: …`, a `Merge branch 'main'` into a feature branch, a non-first-parent merge, and a branch whose main advanced after divergence. Assert recognition, `unrecognized` reporting **with subject**, the extracted **branch path in full**, and the reconstructed `baseSha` equal to `merge-base <merge>^1 <merge>^2` and NOT the first parent for the advanced-main case.

   The branch assertion is not decoration: 607 of the 676 recognized merges name a nested branch (`chore/ledger-claim-visibility`, `feat/mutation-gate-guard-surfaces`). A producer taking only the final slash-delimited component recognizes every merge, reports the residue, and computes the right merge base — passing every other assertion — while joining `modal-freshness-cue` against a corpus stored at `feat/modal-freshness-cue`, so fully-recorded arcs come back as silent. The fixture therefore includes a nested branch name and asserts the whole path after `owner/`. Deterministic, network-free, and independent of clone depth.

   **This layer must not be a real-history test.** CI checks out at depth 1 and deliberately fetches only `origin/main` at depth 1 (`.github/workflows/unit-suite.yml:152`) — the comment there records that full history was rejected because it took this gate from ~4.2 minutes back toward 9.1. A layer-1 test reading the live log would derive its expectations from a truncated history and pass over zero or one merge, which is a vacuous pass wearing a real-history costume.

2. **Real history, when and only when it is available.** Gate on `git rev-parse --is-shallow-repository`. Unshallow: assert the producer's counts against the live log, deriving expectations from the log itself and never from literals — the numbers grow with the repo, and a hardcoded 676 makes this a tripwire on the calendar instead of on the producer. Shallow: **skip by name**, stating that the scan was skipped for a shallow clone. A named skip is a reported absence; a test that quietly passes on one merge is a false presence.

2a. **The shallow refusal itself is proven behaviorally, on a synthesized shallow clone.** Layer 2 is gated on the *ambient* repository's depth, so it can only ever skip or assert real history — it never exercises the refusal. An implementation that omits the `--is-shallow-repository` check entirely and always scans whatever history it can reach passes layer 1 (a full synthetic repo), passes layer 2 (which skips), and passes every other layer in this section, while presenting a truncated silent-arc universe as complete. That is the §8.2 failure with no failing test anywhere in the suite, and it is the normal CI state rather than an exotic one: `.github/workflows/unit-suite.yml:152` fetches at depth 1 deliberately.

   The layer therefore builds its own shallow repository — `git clone --depth=1 file://<fixture>` of the layer-1 fixture — and asserts against the report's actual output: `shallow` is true, the merged-arc scan did not run, the refusal is present **by name**, and the silent-arc list is **absent rather than empty**. An empty list and a withheld list must not be the same value, or the assertion cannot tell a refusal from a clean scan. Deterministic, network-free (a `file://` clone), and independent of the ambient checkout's depth, which is what makes it a proof rather than an environment lottery.

   This is the only place in §11 where a gated skip stood in for behavioral coverage; §11.1 and §11.2 have no environment-gated cases.
3. **Arc-identity join.** Fixture: one branch name, two arcs under distinct `baseSha` directories — the older with rows and a filing, the newer merged with zero rows. Assert the newer arc IS listed as silent. **A branch-only join fails this and passes every other test in this section**, which is exactly how the defect would ship. Fixture mirrors real history (§9).
4. **Per-stage rounds, counted vs recorded.** Fixture with all three stages populated and a mix of `verdict` / `no_verdict` rows. Assert the per-stage counted and recorded numbers separately. Catches an implementation that collapses stages, or that counts every recorded row against a per-stage threshold.
5. **Trigger rate by month.** Fixture arcs whose rows fall in two different months, with a known number tripping the threshold in each. Assert the per-month rate. Catches misbucketing and catches a rate computed over arcs rather than over triggered stages.
6. **Finding-count totals exclude `null`.** Fixture mixing declared counts with `findingCount: null`. Assert the total is over declared rows only, and that undeclared rows appear as their own count. Catches `null` folded into zero, which would understate every total and is indistinguishable from "no findings."
7. **Silent-arc detector.** Given a merged-arc list and a fixture corpus, the merged arc with zero rows is listed and the one with rows is not.

Expected values in every layer derive from fixture contents, never from literals.

Two more layers, both from findings this section already earned:

8. **Adoption boundary.** Fixture with merges before and after a **declared** `ADOPTION_BOUNDARY` (§9). Assert pre-boundary merges are excluded from the silent list and surface as a single count — catches the 668-arc mass false classification. Two further cases, each catching a way a derived boundary is silently wrong: a merge **after** the boundary but **before** the earliest corpus `startedAt` IS listed as silent, and an **empty corpus** with a post-boundary zero-row merge still lists it as silent rather than reporting an empty universe. Both pass trivially under a derived boundary and both are the §8.2 failure. A fixture whose earliest row precedes the constant asserts the advisory mismatch line. **(Amended 2026-08-07 — see `2026-08-07-round-economy-followups.md`.)** The exclusion rule adds thirteen shapes: (1) a pre-boundary row covered by its branch's pre-adoption merge yields no advisory, with the merge's `baseSha` DIFFERENT from the corpus path's so an `arcKey` join cannot satisfy it; (2) an unexplained pre-boundary row still fires, and a row exactly AT the boundary does not; (3) a row written after its branch's pre-adoption merge still fires, and a row exactly at that `mergedAt` is excluded; (4) a post-adoption merge does not launder a pre-boundary row; (5) a shallow clone withholds an advisory the same corpus is asserted to fire non-shallow first; (6) the earliest row is selected chronologically rather than lexically, and the non-placeable note is ABSENT when every row is placeable; (7) non-placeable rows are counted in a note whether or not the advisory itself fires; (8) all four accept-set rejection families — timezone-less, calendar-invalid, out-of-range offset, sub-millisecond fraction — are rejected and counted; (9) a multi-merge branch is capped by the chronologically latest pre-adoption merge, which kills both oldest-only and lexical-max selection; (10) pre-adoption classification is chronological, not lexical; (11) the time cap is chronological, not lexical; (12) the exclusion is same-branch, never a global time cap; (13) covered rows are excluded BEFORE the earliest is selected, never after.
9. **`stage: "task"` never obliges.** Fixture arc with four `task` rounds and no filing. Assert PASS. Catches a threshold that counts every verdict row regardless of stage (§5.1).

Layer 1 would have failed on an unqualified `git log --merges` and on a first-parent `baseSha`; layer 3 is the one no earlier draft of this section could have failed; layer 2 is the one that must never quietly pass.

### 11.4 Mutation enrollment

`_metaReviewRoundEconomy` enrolls as a `GuardSurface` with a score floor. Convergence for this arc's own reviews is then the mutation score plus an empty unaccepted-survivor set — both machine-computed. A "the guard does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set. Closed criterion instead of open enumeration.

## 12. Out of scope

- Automated cross-arc filing (§1.1). The report is read-only.
- Grading, scoring, or classifying findings automatically (§7.2).
- Any anti-tamper posture (§8.1).
- Retroactive backfill of the historical corpus. The corpus starts empty and accumulates forward; the `/private/tmp` artifacts in §3 are a draft-time probe input, not a migration source.

**This arc is invisible to its own gate, and that is correct.** The spec stage of the branch that introduces this system burned rounds before any writer existed to record them, so its arc is pre-adoption by construction (§9, limit 7). Backfilling them by hand to make the system's first customer be itself would be exactly the retroactive construction this section declines, and it would put un-recorded rounds in a corpus whose whole value is that every row was written by the wrapper at dispatch time. The first arc the gate can oblige is the first one dispatched after this merges.
