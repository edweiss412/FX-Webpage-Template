# psql startup-file scanner: survivor disposition + mutation-registry enrolment

**Date:** 2026-08-16 · **Arc:** `test/psql-scan-mutation-enrolment` · **Ledger:** `BL-PSQL-SCAN-MUTATION-ENROLMENT` (BACKLOG.md) · **Parent spec:** `docs/superpowers/specs/ci/2026-08-15-local-harness-false-failures-design.md` §2.3

## §0 Problem

`tests/cross-cutting/psqlStartupFiles/scan.ts` is registry-expressible (an importable module whose verdict-deciding suite is `tests/cross-cutting/psqlStartupFileSuppression.test.ts`) and is not enrolled in `tests/mutation/source/registry.ts` (`GUARD_SURFACES`). The parent arc's enrolment probe — runnable only after that arc's `maxBuffer` harness repair (`9edf520d1`) — measured the scoped operator subset at **score 0.3542: 48 mutants, 17 killed, 31 unaccepted survivors** (27 `relational-boundary`, 4 `regex-quantifier-bound`). The survivors are a mix of true equivalents and real coverage gaps, so they cannot be blessed in bulk.

This spec defines the DISPOSITION RULES for those survivors and the enrolment mechanics. The 31 individual verdicts are the implementation session's work, structured by the plan; this document is the contract each verdict must satisfy.

## §1.1 Resolved scope — do not relitigate

- **Symbolic enrolment is REJECTED.** Enrolling at `scoreFloor` 0.35 with 31 bulk-blessed `accepted-gap` rows was considered and rejected by the user (2026-08-15, recorded in the BACKLOG.md entry and parent spec §2.3 re-disposition note). AGENTS.md convergence bullet 4 forbids it. Every blessed row is a claim owing a reason.
- **Repay-in-branch was also rejected** for the parent arc (same ratification): dispositioning 31 sites is its own arc — this one.
- **The operator subset is ratified.** Parent spec §2.3 (user-approved): full six-operator enrolment is 978 sites ≈ 11 h, unrunnable in any nightly budget; the registry explicitly supports per-surface subsets (`tests/mutation/source/operators.ts`, "a surface may enrol fewer than all six", near the `enumerateSites` doc). The enrolled subset is `relational-boundary` + `regex-quantifier-bound` (48 sites, ≈ 20-30 min measured). A wider subset is a future registry change carrying its own numbers, not a review finding.
- **The harness repair already shipped** (`9edf520d1`, merged in PR #815). Measurement works today; nothing in this arc touches `runner.ts`/`childRun.ts`.
- **Review convergence criterion** (AGENTS.md convergence bullet 4, registry-enrolled surface): the mutation score plus an empty unaccepted-survivor set, both machine-computed. A "the guard does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set demonstrating it.
- **PROBE DOMAIN:** the declared operator pair applied to `scan.ts`, plus the deciding suite's existing fixture corpus. **Threat fence:** ordinary authoring mistakes by an ordinary contributor; adversarial psqlrc/shell obfuscation is out of scope and files to documented limits (§6).
- **Consequence bound:** every generated mutant is classified exactly once (killed, or in a ledger row, or a gate failure — `tests/mutation/guardSurfaces.gate.test.ts` "classifies every generated mutant exactly once"); a surviving mutant never passes silently at the enrolled floor.

## §2 Disposition rules

Every survivor receives EXACTLY ONE of three verdicts. The decision procedure runs in this order, and the order is the bar: a later verdict is legitimate only after the earlier one is shown inapplicable.

### §2.1 KILL (the default)

A new case in the deciding suite reds the mutant. This is the default because the corpus precedent is one-sided: every enrolled surface repaid most first-run survivors with tests rather than rows (`redContract`: fourteen repaid, seven blessed — `tests/mutation/source/registry.ts`, redContract `accepted` comment; `interactiveScanCore`: sixty-seven repaid across two rounds — `tests/mutation/guardSurfaces.gate.test.ts`, `EXPECTED_LEDGER_KINDS` comments).

**Kill-case shape (anti-tautology, binding):**

- The case calls an EXPORTED function of `scan.ts` (the suite already imports `argvSuppressesStartupFiles`, `tokenSuppressesStartupFiles`, `scanSource`, `collectPsqlUsage`, `scanShellIndirection`, `scanBinaryIndirection`, `scanWorkflowIndirection`, `analyzeNaming`, `rootSkipNamesFromGitignore` — import block at the top of `psqlStartupFileSuppression.test.ts`) on a CONSTRUCTED input whose correct verdict differs between original and mutant.
- The expected value derives from the real contract being pinned (psql's actual option grammar, real shell/YAML syntax), not from what the current code happens to return. State the derivation in the case comment when it is not obvious.
- The case asserts the VERDICT (the boolean / the site list / the finding set), never "the function was called" or an internal intermediate.
- Each new case names the site id it kills (`operator:line:column:from>to` — id format per `tests/mutation/source/registry.ts` `operatorOf` doc) in its describe block or comment, following the suite's own "R3 escaping mutants" convention (`psqlStartupFileSuppression.test.ts`, describe blocks R3–R11).
- **Red-then-green proof per case:** before counting a kill, run the single mutant against the amended suite and observe a non-zero exit (mechanism: `runControl(root, surface, mutantText)` in `tests/mutation/source/runner.ts` runs ONE hand-written mutant, ≈ 40 s; the mutant text is the original file with the site's `from>to` applied). A case that is green against the mutant is not a kill, whatever it asserts.

### §2.2 EQUIVALENT

A ledger row `{ siteId, kind: "equivalent", reason }` (`tests/mutation/source/ledger.ts`, `AcceptedSurvivor`). Excluded from the score denominator, because a provably unkillable mutant would otherwise cap the surface below 100% forever (ledger.ts header).

**Bar:** the reason must argue that NO input observable through the suite-visible API distinguishes mutant from original — a reachability or indistinguishability argument, not a difficulty claim. "Hard to construct" or "unlikely in practice" is a KILL or an ACCEPTED-GAP, never an equivalent.

**Reason format (binding, matches the shipped redContract rows):**

- Name the guarded expression and its site by file + symbol/searchable token (line numbers rot; the site id itself carries the drafting-time line).
- State the domain restriction that makes the mutant invisible, with its citation. Template (a shipped row, `registry.ts` redContract ledger): "GATE only ever runs on lines already admitted by GATE_ANY (redContract.ts:29, itself {0,3}), so every candidate has <=3 leading spaces and widening this bound admits nothing."
- Worked example from this surface (the BACKLOG entry's own starter, verified against the live tree): the `index > 0 → index >= 0` mutant on `isStrongPrefixWord` (`scan.ts`, symbol `isStrongPrefixWord`) is plausibly equivalent because at `index === 0`, `before[index - 1] ?? ""` is `""`, `basename("")` is `""`, and `WRAPPERS.test("")` is false — the same result the short-circuit produced. An equivalence row for it must make exactly that argument; a row saying "boundary shift, no impact seen" is rejected.

### §2.3 ACCEPTED-GAP

A ledger row `{ siteId, kind: "accepted-gap", reason, ref }` with a resolvable `BL-`/`DEF-` id (shape enforced by `validateSurface`, `registry.ts`; resolution enforced repo-wide by `tests/docs/_metaLedgerReferentialIntegrity.test.ts`). Counted against the score.

**Bar (mirrors the AGENTS.md class-sweep deferral exceptions):** admissible only when the kill requires (a) a product/design decision this arc cannot settle, or (c) a repair that redesigns a surface this arc does not otherwise touch or blows the review scope. "Tedious to test" does not qualify. Expected count: ZERO — the operator pair generates only boundary/quantifier flips on pure functions with a deciding suite; a gap that cannot be either killed or proven equivalent should be rare enough that each one is individually defensible at review. If any row of this kind lands, its `ref` names the follow-up entry filed in the same PR.

### §2.4 Verdict hygiene

- **Class-sweep within the survivor set:** survivors sharing one argument shape (e.g. several `?? ""` fallback boundaries feeding the same `WRAPPERS.test`) are dispositioned as a family with one shared reason pattern — but each row still carries its own site-specific citation. Reason text may share the argument; it may not be copy-pasted where the argument does not transfer.
- **A kill that also proves a real defect** (the mutant exposes scanner behavior that is WRONG today, not merely untested) upgrades to a source fix + test in this arc if the fix is local, else files a ledger entry named in the row. The BACKLOG entry's `token.length > 1 → >= 1` starter (symbol `swallowIsUncertain` block, the short-flag branch `token.startsWith("-") && token.length > 1`) is a candidate of the first kind: the mutant admits a bare `-` into the flag-cluster branch where the real contract treats `-` as positional.
- The four BACKLOG-entry starters (`index > 0`, `token.length > 1`, `/^-{1,2}/ → {1,3}`, comment-range `l < to.line`) are HINTS, not verdicts; each still runs the full §2 procedure.

## §3 Enrolment mechanics

### §3.1 Registry row

One new `GuardSurface` row in `tests/mutation/source/registry.ts` (`GUARD_SURFACES`) — the registry's FIRST scoped-operator row: every row enrolled as of drafting declares the full `[...OPERATOR_NAMES]` set. Fields:

- `id`: `psqlStartupScan` (final spelling at implementation; must be stable — it keys `EXPECTED_LEDGER_KINDS`).
- `sourcePath`: `tests/cross-cutting/psqlStartupFiles/scan.ts`.
- `suitePaths`: one entry — the deciding suite `tests/cross-cutting/psqlStartupFileSuppression.test.ts`.
- `operators`: `["relational-boundary", "regex-quantifier-bound"]`.
- **Budget-excluded operators recorded on the row** (parent spec §2.3 requirement): a row comment naming the four excluded operators (`statement-removal` 324, `integer-literal` 258, `equality-flip` 196, `logical-connector` 152 sites) with the ≈ 11 h probe as the reason and this spec as the citation.
- `control`: a hand-chosen behavior-changing edit whose `from` occurs EXACTLY ONCE in `scan.ts` (`validateSurface` rejects 0 or >1 occurrences) and which the suite must obviously notice. Chosen at implementation by grepping for a unique anchor; candidate class: flip a literal in the psql option grammar the suite pins directly. (Probed while drafting: the obvious `--no-psqlrc` string occurs 4 times in `scan.ts`, so it fails the uniqueness check — the anchor must include enough surrounding text to be unique, e.g. the full guard expression containing it.)
- `accepted`: the §2 ledger rows, each with its reason (and `ref` for any accepted-gap).
- `scoreFloor`: per §3.3.

### §3.2 Gate suite declaration

`EXPECTED_LEDGER_KINDS` in `tests/mutation/guardSurfaces.gate.test.ts` gains a row for the new surface id with the EXACT kind counts (the suite fails by default on a missing row — "declares expected ledger-kind counts for every enrolled surface"). The row comment follows the file's convention: counts stated independently of the ledger, with the one-line reason a future reader needs ("a new row here is a regression to explain, not a number to bump").

### §3.3 scoreFloor

`scoreFloor` = the ACHIEVED post-disposition score, rounded DOWN to two decimals. Rationale: the score is `killed / (killed + counted survivors)` with equivalents excluded (`ledger.ts`, `score()`), so it is deterministic for a fixed tree — but the floor is deliberately coarse (source-mutation gate spec `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md` §4.3 precedent: taskContract floors 0.95 against an actual 82/84 ≈ 0.976). The ratchet against silent regression is the empty unaccepted set plus the declared kind counts, not the floor. With zero accepted-gap rows the achieved score is 1.0 and the floor is 1.0 exactly (precedent: `count.ts` "Its floor is 1", `guardSurfaces.gate.test.ts` comment); each accepted-gap row lowers it per the formula.

### §3.4 Rebase checkpoint

Open PR #807 (`feat/mutation-playwright-component-mode`) also edits `tests/mutation/source/registry.ts`. The plan places an explicit rebase/merge-main checkpoint immediately BEFORE the enrolment task, and the enrolment commit lands against the then-current registry shape. A conflict here is mechanical (append a row), not semantic.

## §4 Verification

### §4.1 Per-verdict (cheap, per-mutant)

- KILL: single-mutant red proof per §2.1 (≈ 40 s each via the `runControl` mechanism).
- EQUIVALENT/ACCEPTED-GAP: the row's reason reviewed against §2.2/§2.3 at adversarial review; no per-row run needed (the full run in §4.2 confirms the site still survives, i.e. the row is not stale).

### §4.2 Full-run acceptance (machine-computed)

`pnpm heavy pnpm mutation:guards` — ALWAYS under `pnpm heavy` (AGENTS.md heavy-slot rule: mutation harness MUST wrap). Note the gate file runs `runSurface` at module scope for EVERY enrolled surface (`guardSurfaces.gate.test.ts`, `describe.each`), so a full run includes all seventeen existing surfaces plus this one; the plan budgets full runs at checkpoints, not per verdict. Acceptance is the gate's own six conditions passing for the new surface:

1. no no-op mutants
2. clean baseline
3. **empty unaccepted-survivor set**
4. no stale ledger rows
5. score ≥ the enrolled floor
6. non-zero mutant count

Plus: the control mutant is killed, kind counts match §3.2, and the tracked source is byte-identical after the run.

### §4.3 Site-id drift

Site ids carry position (`operator:line:column:from>to`), so ANY edit to `scan.ts` above a site invalidates ids below it — surfacing as stale rows AND new unaccepted survivors (`ledger.ts`, `reconcile` doc). Consequence for sequencing: if a §2.4 source fix lands in `scan.ts`, it lands BEFORE the survivor ids are finalized, and the post-fix probe run's ids are the ones the ledger uses. The plan orders: source fixes (if any) → regenerate survivor list → dispositions → enrolment → full-run acceptance.

## §5 CI wall clock

The nightly `mutation-harness.yml` job runs the whole mutation project at a 300-minute ceiling (raised from 180 on 2026-08-15; 138-minute measured baseline on `main` before the interactive-scan enrolment). This surface adds ≈ 48 × ~40 s + baseline + control ≈ 35-45 min worst case — inside the parent spec §2.3's ratified "worst-case runtime under ~45 minutes", but a real bite out of remaining headroom. The unbounded-growth problem is already filed as `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` (BACKLOG.md); this arc cites it and does not solve it.

## §6 Documented limits

- **Four operators excluded by budget** (`statement-removal`, `integer-literal`, `equality-flip`, `logical-connector`; 930 of 978 sites). The score asserts nothing about them. Recorded on the registry row (§3.1); widening is a future registry change with its own numbers.
- **Threat fence:** the scanner defends against ordinary authoring mistakes. Adversarial obfuscation (a contributor deliberately hiding a psql invocation from the scanner) is out of scope, here and in the scanner's own header contract.
- **Equivalence arguments are prose, not proofs.** A wrong equivalence row survives until an input demonstrates it; the mitigation is the §2.2 bar (argument + citation, reviewed adversarially), the same posture every enrolled surface takes.
- **The suite decides.** A mutant is KILLED only if the deciding suite reds; behavior differences invisible to every exported entry point are equivalent BY DEFINITION of this harness, even if some future consumer could observe them.

## §7 Out of scope

- Widening the operator subset; enrolling any other surface.
- Refactoring `scan.ts` beyond §2.4 upgrade fixes.
- Harness changes (`runner.ts`, `childRun.ts`, `gate.ts`, `operators.ts`).
- The nightly job's wall-clock ceiling (`BL-MUTATION-HARNESS-WALLCLOCK-CEILING`).

## §8 Acceptance criteria

- **AC-1:** Every survivor of the regenerated scoped run has exactly one §2 disposition; the union is exhaustive and disjoint (machine-checked by gate conditions 3 + 4: empty unaccepted set, no stale rows).
- **AC-2:** Every KILL has a §2.1-shaped case with a recorded single-mutant red proof; `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` green (all pre-arc cases plus the new ones).
- **AC-3:** Every EQUIVALENT row's reason meets the §2.2 format; every ACCEPTED-GAP row (expected: zero) meets the §2.3 bar with a resolvable ref.
- **AC-4:** The registry row (§3.1) and `EXPECTED_LEDGER_KINDS` row (§3.2) land; `validateSurface` problems empty; `scoreFloor` per §3.3.
- **AC-5:** `pnpm heavy pnpm mutation:guards` passes all gate conditions for the new surface (§4.2).
- **AC-6:** The BACKLOG entry graduates to `BACKLOG-archive.md` with the achieved numbers; in-progress marker removed in the PR's last commit (invariant 12).

## §9 Measurement appendix — regenerated survivor list

Populated from this arc's own probe run (an untracked session-scratchpad script — a thin wrapper calling `runSurface` on the unenrolled surface with the §1.1 operator pair; probe reviewed per the probe-mini-review rule: bounded by site enumeration, no truncation, full outcome table printed). The list is the plan's batching input; site ids are positional and final only for the tree the implementation session starts from (§4.3).

[PROBE PENDING — filled in before spec review dispatch]
