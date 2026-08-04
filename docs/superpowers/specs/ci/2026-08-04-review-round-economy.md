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
| Arc identity comes from the **git branch**, never from `--out` path naming. | §5.2 |
| `--stage` and `--round` are **caller-declared and required**. Inference from brief text, `--out` path, or row-counting is rejected; see the probe in §3. | §5.1 |
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

Corpus: 45 `attempt-*.last-message.txt` files under `/private/tmp/*/`, produced by real dispatches on 2026-08-03 and 2026-08-04.

| Signal | Kind | Hit rate |
| --- | --- | --- |
| `VERDICT:` line | **declared** in the brief | **45/45 — 100%** |
| `^[0-9]+\. \*\*` numbered-bold | inferred | 23/45 — 51% |
| `^[-*] +(BLOCKING\|…)` bullet-severity | inferred | 9/45 — 20% |
| `^#{1,4} .*(BLOCKING\|Finding\|NEEDS)` heading | inferred | 3/45 — 6% |
| **none of the three inferred shapes** | — | **11/45 — 24%** |

Three stacked inferred recognizers reach 75%. The single declared contract reaches 100%.

Two consequences, both load-bearing:

1. **This spec never infers a finding shape.** Everything the row needs is declared by the caller or by a mandated brief line. A recognizer over free-form reviewer prose is the exact denylist shape the accept-set rule forbids, and the corpus says it would be wrong a quarter of the time.
2. **The existing hook's finding tally is ~51% accurate.** `$HOME/.claude/hooks/review-convergence-gate.sh` counts findings with the numbered-bold pattern alone, so its advisory "~N findings" line reads near-zero on most real reviews. Repairing it is in scope (§10, Task list) because this spec's own probe surfaced it, and leaving a known-wrong number in an operator-facing message is the defect class this whole system exists to close.

Reproduce: docs/superpowers/specs/ci/probes/2026-08-04-finding-format-probe.md.

## 4. Architecture

### 4.1 Components

| Component | Responsibility |
| --- | --- |
| `scripts/codex-guard.mjs` | Accepts `--stage` and `--round`; appends one JSONL row per dispatch, at **both** result.json write sites |
| docs/review-rounds/<branch>.jsonl | Durable, committed, per-branch round corpus |
| docs/review-rounds/<branch>.md | The filing, when a stage crosses threshold |
| tests/docs/_metaReviewRoundEconomy.test.ts | Merge-gating check: obliged arcs filed, filings well-formed, cited ids resolve |
| scripts/review-economy.ts (`pnpm review:economy`) | Read-only cross-arc report; gates nothing |
| `$HOME/.claude/hooks/review-convergence-gate.sh` | Early warning at dispatch time; per-machine, advisory |

### 4.2 Why enforcement is split

The meta-test is the binding gate: it runs in existing CI, is visible to every harness and every account, and survives a fresh clone. The hook does the two things CI structurally cannot — it exists at dispatch time, and it can warn while the arc is still live. This is a division of labor, not redundancy. Neither substitutes for the other, and the repo has twice recorded the lesson that a per-machine hook cannot be the binding contract.

### 4.3 Threshold

**`ROUND_THRESHOLD = 4`**, counted per `(branch, stage)`. This is the single canonical definition. Every section that reasons about the threshold references `ROUND_THRESHOLD` rather than the literal; the only places a bare `4` appears are the §1.1 summary row and the §11.2 fixtures, where a fixture must state a concrete count. It matches the `REVIEW_ROUND_CAP` default in `$HOME/.claude/hooks/review-convergence-gate.sh` so one number governs the dispatch block and the filing duty.

A stage reaching 4 counted rounds obliges a filing section for that stage. Stages are independent: an arc may owe a filing for `diff` and owe nothing for `spec`.

## 5. Record format

### 5.1 New flags

Both are added to the value-taking flag set in `parseArgs` (`scripts/codex-guard.mjs:68`, flag `Set` at `codex-guard.mjs:71-83`) and validated in `buildConfig` (`codex-guard.mjs:100`), alongside the existing required `--brief` (`codex-guard.mjs:132`), `--cwd` (`codex-guard.mjs:133`), and `--out` (`codex-guard.mjs:134`).

| Flag | Accept-set | Missing / invalid |
| --- | --- | --- |
| `--stage` | Exactly one of `spec`, `plan`, `diff` | `usageError` (`codex-guard.mjs:43`), exit 2 |
| `--round` | Decimal integer ≥ 1 | `usageError`, exit 2 |

The accept-set is closed and keyed on value, not spelling: anything outside the three stage literals is rejected by name, never coerced or bucketed into an `unknown` stage. An `unknown` bucket would be a silent exemption from the gate, which is precisely the failure this design refuses.

Both are **required**, a hard cutover. There is no dual-mode grace period: a mode where the flags are optional is a mode where forgetting them exempts the arc, and forgetting is the entire threat model (§8.1). `--label` already exists (`codex-guard.mjs:120`, validated `codex-guard.mjs:130` against `/^[A-Za-z0-9_-]{1,64}$/`) and is unchanged; it names a scope, not a stage.

**Operational note.** The `adversarial-review` skill lives in the per-machine `~/.claude/` tree and is not tracked here. A machine whose skill constructs a dispatch without the new flags gets a loud exit-2 usage error naming the missing flag — never a silent skip. Repo-tracked call sites are updated in the same PR (§10).

### 5.2 Path

docs/review-rounds/<branch>.jsonl, where `<branch>` is `git rev-parse --abbrev-ref HEAD` used **as a nested path**, not slugged: branch `feat/foo` writes docs/review-rounds/feat/foo.jsonl. Mirroring the branch path is injective; flattening `/` to `-` collides two branches differing only there.

`docs/` is not gitignored (`.gitignore` ends at line 103; the ignored review paths are `.codex-reviews/` and `.review/`), so no ignore-file change is required.

**The corpus path resolves against `--cwd`, never the wrapper's launch cwd**, and the branch is read with `git -C <cwd> rev-parse --abbrev-ref HEAD`. This follows the ratified precedent for `--lint-doc` (`scripts/codex-guard.mjs:162`): invariant 11 makes the wrapper's launch directory and the reviewed worktree differ on every run, so inheriting the launch cwd would write every arc's rows into whichever checkout the wrapper happened to start in.

Per-branch files mean concurrent worktrees never touch the same file. Invariant 11 already forbids two writers in one working tree, so within-file concurrency is bounded to one branch.

### 5.3 Row schema

```json
{
  "stage": "diff",
  "round": 3,
  "branch": "feat/foo",
  "label": "guard-scope",
  "status": "verdict",
  "verdict": "BLOCKING",
  "failureReason": null,
  "findingCount": 5,
  "startedAt": "2026-08-04T14:02:11.000Z",
  "endedAt": "2026-08-04T14:19:40.000Z",
  "briefPath": ".review/foo-r3/brief.md",
  "outDir": ".review/foo-r3",
  "guardVersion": "…",
  "recoveredFrom": null
}
```

All scalars. There is no array field and no free-text field, so a row is bounded by construction rather than by truncation logic. `status`, `verdict`, `recoveredFrom`, `guardVersion`, and `label` are copied verbatim from the result.json body assembled in `writeResult` (`codex-guard.mjs:693`, keys at `codex-guard.mjs:695-711`).

`findingCount` is an integer when the reviewer emitted a declared `FINDINGS: <n>` line, and `null` otherwise. It is never inferred from prose shape (§3). The brief-authoring contract in `AGENTS.md` gains this line next to the existing mandated `VERDICT:` line; the corpus shows the declared-line mechanism at 100% reliability.

### 5.4 Which rows count

Every dispatch appends a row. The threshold counts **distinct `round` values among rows with `status === "verdict"`**.

`status` takes exactly two values in the wrapper today — `"verdict"` and `"no_verdict"` — assigned at four sites in `scripts/codex-guard.mjs` (`scripts/codex-guard.mjs:698`, `scripts/codex-guard.mjs:792`, `scripts/codex-guard.mjs:1017`, `scripts/codex-guard.mjs:1081`). There is no `wrapper_error` status: a wrapper failure is `status: "no_verdict"` carrying `failureReason: "wrapper_error"` (`scripts/codex-guard.mjs:1081`). The row therefore records `failureReason` alongside `status`, so the corpus can tell an infra fault from a reviewer that simply never emitted a verdict.

| `status` | `failureReason` | Recorded | Counts toward threshold |
| --- | --- | --- | --- |
| `verdict` | `null` | yes | yes |
| `no_verdict` | `"wrapper_error"` | yes | **no** |
| `no_verdict` | any other value or `null` | yes | **no** |

An infrastructure fault is not a review round. The reaper bug killed 58% of dispatches at one point (`docs/agents/codex-silent-death-2026-07-24.md`); counting those would push nearly every arc over threshold on noise and discredit the gate in its first week.

Rows must be emitted at **both** result.json write sites — `writeResult` (`codex-guard.mjs:693`, write at `codex-guard.mjs:712`) and the `wrapper_error` catch (`codex-guard.mjs:1075-1093`). Emitting at only the first silently loses every wrapper failure from the corpus. The second site omits `recoveredFrom` and `nativeBinaryResolved` from its body, so the row writer defaults those to `null` rather than reading undefined keys.

### 5.5 Duplicate rounds are legal

`AGENTS.md` makes split tight-scope reviews the default for large diffs, so several dispatches commonly share one round. All scopes in a wave pass the same `--round`; distinct-value counting makes the wave count once. This is why `--round` is declared rather than derived: deriving it by counting existing rows is a read-modify-write race across parallel dispatches, and it would tax the practice the repo recommends.

## 6. Filing format

docs/review-rounds/<branch>.md, one `##` section per **triggered** stage.

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

tests/docs/_metaReviewRoundEconomy.test.ts walks `docs/review-rounds/*.jsonl` **discovered from disk**, so a new arc's corpus file is covered by default and can never be silently exempt.

Per file, per stage:

1. Every row parses as JSON and satisfies the schema; `stage` is in the accept-set; `round` is an integer ≥ 1; `status` is one of the two literals (§5.4).
2. Declared `round` values form a contiguous run `1..N`. **Duplicates are permitted** (§5.5). A gap means rows were lost or hand-edited.
3. Counted rounds (§5.4) ≥ `ROUND_THRESHOLD` → the sibling `.md` exists and has a well-formed section for that stage (§6).
4. Every `BL-`/`DEF-` id cited in a filing section resolves.
5. A filing section naming a stage with zero rows fails — catches copy-paste between arcs.

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
3. **A rebase onto a new branch name resets the counter**; the arc reads as two short arcs. Accepted.
4. **Only the summary row is durable.** Transcripts stay in the machine-local `--out` directory. Losing one loses detail, not the count.
5. **`--round` is caller-declared and can be wrong.** A wrong value shows as a contiguity gap (§7.1 assertion 2) unless it duplicates an existing round, in which case the wave undercounts by one. Accepted: the alternative is the derivation race (§5.5).
6. **`findingCount` is `null` for any reviewer that omits the declared line.** Never inferred (§3).

## 9. Report

`pnpm review:economy` — `tsx scripts/review-economy.ts`, read-only, gates nothing.

Output:

- Rounds per stage per arc, and counted-vs-recorded rows.
- Trigger rate by month — the success metric named in §1.1.
- Finding-count totals by stage, over arcs where the declared line was present.
- **Silent arcs**: branches appearing as merged in `git log --merges` with zero rows in the corpus.

Silent-arc listing is the observable form of limit §8.3.1 and §8.3.2. It is deliberately **not** a gate: many branches legitimately have no review at all. Converting an invisible hole into a visible one is as far as the threat model reaches.

## 10. Work items

1. `--stage` / `--round` flags in `parseArgs` + `buildConfig`, with accept-set validation and exit-2 usage errors.
2. JSONL row writer, called from **both** result.json write sites. No JSONL utility exists in the repo today; this is new (`lib/` module, unit-tested independently of codex-guard).
3. `FINDINGS: <n>` added to the mandated brief contract in `AGENTS.md`, next to the existing `VERDICT:` line.
4. tests/docs/_metaReviewRoundEconomy.test.ts with a fixture corpus, following the `mkdtempSync(join(tmpdir(), …))` pattern at `tests/docs/_metaLedgerClaimCollision.test.ts:166`.
5. scripts/review-economy.ts + `review:economy` package script.
6. Repair the finding tally in `$HOME/.claude/hooks/review-convergence-gate.sh` to match the corpus (§3, consequence 2), or drop the number rather than print a wrong one.
7. Update repo-tracked codex-guard call sites and `AGENTS.md` for the new required flags.
8. Enroll `_metaReviewRoundEconomy` in `tests/mutation/source/registry.ts` (`GUARD_SURFACES` at `registry.ts:120`, `GuardSurface` at `registry.ts:12-23`, `validateSurface` at `registry.ts:41`).
9. Row in `docs/superpowers/specs/ci/README.md`.

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
| Branch `feat/foo` → nested docs/review-rounds/feat/foo.jsonl | Slug collision between branches differing only by `/` |

### 11.2 Gate (tests/docs/_metaReviewRoundEconomy.test.ts)

Fixture corpus for determinism, plus a live-tree pass over the real `docs/review-rounds/`.

| Fixture | Expected |
| --- | --- |
| 4 distinct verdict rounds, no filing | **FAIL** — the core assertion |
| 3 verdict + 1 `no_verdict` | **PASS** — infra noise must not oblige |
| 3 verdict + 1 `no_verdict` with `failureReason: "wrapper_error"` | **PASS** — the wrapper-error path is the same status, not a third one |
| rounds `1,2,3,3,3` (parallel wave) → 3 distinct | **PASS** — the recommended practice is not taxed |
| rounds `1,2,4` | **FAIL** — gap |
| filing cites a `BL-` id absent from the ledgers | **FAIL** |
| filing section for a stage with zero rows | **FAIL** |
| `**Mechanizable:** none` with `**Examined:**` | **PASS** — the honest case stays cheap |
| `**Examined:**` missing | **FAIL** |
| malformed JSON row | **FAIL**, message naming file and line |
| **new fixture arc dropped in, 4 verdict rounds, no filing** | **FAIL without editing the test** — fails-by-default |

Expected values derive from fixture contents; no hardcoded counts.

### 11.3 Report

Silent-arc detection against a fixture merged-branch list and a fixture corpus, asserting the merged branch with zero rows is listed and the one with rows is not. Catches the §9 observability claim being vapor.

### 11.4 Mutation enrollment

`_metaReviewRoundEconomy` enrolls as a `GuardSurface` with a score floor. Convergence for this arc's own reviews is then the mutation score plus an empty unaccepted-survivor set — both machine-computed. A "the guard does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set. Closed criterion instead of open enumeration.

## 12. Out of scope

- Automated cross-arc filing (§1.1). The report is read-only.
- Grading, scoring, or classifying findings automatically (§7.2).
- Any anti-tamper posture (§8.1).
- Retroactive backfill of the historical corpus. The corpus starts empty and accumulates forward; the `/private/tmp` artifacts in §3 are a draft-time probe input, not a migration source.
