<!-- spec-lint: not-ui — test-infrastructure, CI config, and docs only; no layout, component, token, or dimensional change. impeccable-gate: N/A. -->

# Plan — E2E discovery: declared versus resolved

**Spec:** `docs/superpowers/specs/ci/2026-08-30-e2e-declared-vs-resolved.md`
**Branch:** `test/e2e-spec-discovery-wiring`

Most of this plan is already executed; it is written after the fact for the tasks it still governs, and it records what each landed task actually did rather than what it was expected to do. That ordering is a consequence of the arc's premise being refuted at Stage 0: there was no wiring to plan, and what replaced it was found by measuring rather than by designing.

## Task 1 — the config-to-disk guard. DONE, `db27d5ebf`, repaired in `2c5b718a4`.

TDD order held: the guard was written first and run red, naming eighteen occurrences of nine names, before a single deletion.

- Red: `tests/ci/_metaConfigBranchStaleness.test.ts` fails, listing every dead branch with its config and project.
- Green: the eighteen occurrences deleted from `playwright.config.ts`.
- Proof obligation, discharged: resolving the root config before and after yields identical `file::project::case` triples (1216), so no dead name was load-bearing by substring.
- Round 1 repair: the config population is derived from disk by content, not listed. The anti-tautology arm asserts discovery reaches a config outside the `playwright*.config.*` basename pattern, so the guard cannot pass by finding nothing.

**Failure mode this catches:** a spec renamed or deleted while its stem stays in an unanchored alternation, where the stem then adopts the next file whose name contains it, in a project its author never chose.

## Task 2 — the settle-race class. DONE, `2c5b718a4`.

- Population derived from the mechanism (`AttentionMenu.tsx:479`: `entered` is the only re-place signal, and the mount measurement precedes it), not from the entrance-scale wait, which is a partial mitigation. Six cases across four reads.
- Repaired by `settledSample`, which resamples until two consecutive reads agree on every value and THROWS on timeout rather than returning an unsettled sample.
- Verification: six full-file runs green, 42 passing each. Six pre-repair runs were also green, so no flake was reproduced and the repair rests on the shape, not on an observed red.

## Task 3 — corrections. DONE, `2c5b718a4`.

`LIM-E2E-SPEC-DISCOVERY-GAP` rewritten; the pill-arc plan's "had never executed" paragraph corrected; the four duplicate specs deduped from `desktop-chromium` together with the workflow path that made one of them look load-bearing.

## Task 4 — mutation enrolment of the guard surface. DONE, `a6110e575` + `e53785900`.

`tests/ci/_configBranchProbe.ts` is a recognizer whose defect class is "reports OK while the output moved", which is what the source-mutation registry exists to express, and AGENTS.md requires enrolment to precede the diff review rather than follow it.

- Add a registry row: full declared operator set (the surface is a recognizer, and scoping the subset would leave exactly the operators nobody scored), `millisPerBoot` MEASURED as the median of three consecutive deciding-suite runs, `scoreFloor` 0.9.
- Run `pnpm heavy:mutation`, record score and the unaccepted-survivor set.
- Repair survivors by strengthening the suite, never by widening the recognizer.
- The round-1 diff brief carried the `GUARD SURFACE:` line with the score, the survivor count, and the operator set.

**What it measured.** First run: **0.4167** against a 0.9 floor, seven survivors, all integer literals — on a surface that had already cleared a spec review round. Four were equivalent (resource bounds in the spawn options) and are ledgered with an argument each. Three were real, and all three were the same blind spot: the suite drove only the happy path through a real child process, so the decision about what came BACK was never exercised. A mutant that ACCEPTED A MISSING MARKER survived, which would have fed a dying child's stderr to `JSON.parse` and destroyed the only text saying why it died. `parseProbeOutput` was extracted so that decision could be driven directly.

Second run: **0.8750**, one survivor — the cap oracle, which asserted `toHaveLength(PROBE_ERROR_QUOTE)` and so moved with the constant the mutant changed. An oracle for a constant cannot be derived from that constant. Third run, after the literal-plus-export-tie fix: **8/8, zero unaccepted survivors**, all six declared operators.

**Documented limit found on the way**: `-t <surfaceId>` does not narrow a shard, so each of these runs cost the whole shard (~60 min). Recorded in the registry row and spec §3.4.

**Why before the review and not after:** three arcs in this repo measured the cost of deciding late, and the sharpest found 23 survivors on a surface that had already cleared three adversarial rounds. Review is worst at absence, which is exactly what a mutation score measures.

## Task 5 — diff review, then PR. IN PROGRESS.

Whole-diff cross-model review to APPROVE, then push and open the PR. THE ARC DOES NOT MERGE: done is a PR with its full head sha and the thirteen required checks green at that head, reported to the orchestrator.

## Verification commands

```
npx vitest run tests/ci/_metaConfigBranchStaleness.test.ts
pnpm heavy npx vitest run tests/docs tests/ci
pnpm heavy pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts
npx tsx scripts/spec-lint.ts docs/superpowers/specs/ci/2026-08-30-e2e-declared-vs-resolved.md
```

## 12. Closeout

No UI surface: this arc touches Playwright configs, a workflow, test infrastructure, and docs. No file under `app/` (outside `app/api/`), none under `components/`, no token block, no `DESIGN.md` or Tailwind config change.

impeccable-gate: N/A — no UI surface
