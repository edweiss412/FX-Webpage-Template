/**
 * The 24 ATX-heading-form `GUARD SURFACE:` declarations the 2026-08-22 corpus
 * sweep found, VERBATIM (em dashes, backticks and all: this file is evidence,
 * not prose). The shipped trigger `/^\s*GUARD SURFACE:(.*)$/` read none of
 * them, so ten declaring round-1 briefs were dark to the gate — the incident
 * that licenses the heading form (jurisdiction spec §2.2, AC-9).
 *
 * Derived, not typed. Re-derive the population with:
 *
 *   grep -hE '^\s*(#{1,6}\s+)GUARD SURFACE:' /Users/ericweiss/FX-worktrees/_briefs/*.md | wc -l   # 24
 *
 * Order is the sweep's, sorted by `source` (brief stem, then line number) so
 * the replay's line numbering is stable. `verdict` is what the canonical
 * grammar gives each line under the marker-precedence matrix (spec §2.2): a
 * line carrying the `MUTATION SCORE:` marker is decided by the score arm plus
 * the `OPERATORS:` check and is never rescued by a cannot-express tail; the
 * cannot-express arm decides only marker-free lines; otherwise bare.
 *
 * Frozen tally at derivation: 12 reject-no-operators, 6 reject-non-canonical,
 * 2 reject-bare, 4 dispatch-cannot-express.
 */
export const HEADING_CORPUS: ReadonlyArray<{
  readonly source: string;
  readonly line: string;
  readonly verdict:
    | "reject-no-operators"
    | "reject-non-canonical"
    | "reject-bare"
    | "dispatch-cannot-express";
}> = [
  {
    source: "2026-08-17-arc-A-diff-r1:14",
    line: "## GUARD SURFACE: tests/ci/modalWaitHelper/scan.ts — MUTATION SCORE: 95/97 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-17-arc-A-diff-r1:16",
    line: "## GUARD SURFACE: tests/ci/modalWaitHelper/disposition.ts — MUTATION SCORE: 67/67 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-17-arc-C-diff-r1:25",
    line: "## GUARD SURFACE: lib/specLint/universals.ts",
    verdict: "reject-bare",
  },
  {
    source: "2026-08-17-arc-C-diff-r2:25",
    line: "## GUARD SURFACE: lib/specLint/universals.ts",
    verdict: "reject-bare",
  },
  {
    source: "2026-08-17-arc-H-diff-r1:67",
    line: "## GUARD SURFACE: tests/mutation/source/spawnBounded.ts — MUTATION SCORE: 12/12, 0 unaccepted survivors; CANNOT-EXPRESS: no string-literal operator, tests/mutation/source/operators.ts:17-24; live-suite guard per spec §8",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-17-arc-I-diff-r1:36",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 35/35 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-17-arc-I-diff-r2:54",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 39/39 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-17-arc-I-diff-r3:66",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 39/39 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-18-arc-B-diff-r1:24",
    line: "## GUARD SURFACE: `lib/specLint/redContract.ts` — MUTATION SCORE: 241/241, 0 unaccepted survivors (registry id `redContract`, floor 0.95; measured post-repair with the scoped shard-filter procedure, 7 `equivalent` ledger rows excluded from the denominator)",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-18-arc-B-diff-r2:24",
    line: "## GUARD SURFACE: `lib/specLint/redContract.ts` — MUTATION SCORE: 241/241, 0 unaccepted survivors (registry id `redContract`, floor 0.95; RE-MEASURED after the round-1 repair with the scoped shard-filter procedure: 248 generated mutants, 7 `equivalent` ledger rows excluded from the denominator, gate green on all seven conditions)",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-18-arcD-diff-r1:22",
    line: "## GUARD SURFACE: lib/specLint/fixtureContract.ts — MUTATION SCORE: 63/65 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-18-arcD-diff-r2:19",
    line: "## GUARD SURFACE: lib/specLint/fixtureContract.ts — MUTATION SCORE: 63/65 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-18-arcD-diff-r3:19",
    line: "## GUARD SURFACE: lib/specLint/fixtureContract.ts — MUTATION SCORE: 63/65 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-18-arcD-diff-r4:19",
    line: "## GUARD SURFACE: lib/specLint/fixtureContract.ts — MUTATION SCORE: 63/65 — 0 unaccepted survivors",
    verdict: "reject-no-operators",
  },
  {
    source: "2026-08-20-arc-browser-diff-r1:19",
    line: '## GUARD SURFACE: CANNOT-EXPRESS: `tests/mutation/source/registry.ts`, comment above the `browserRegistry` row — "the spawn boundary in `tests/mutation/browser/runner.ts` needs a real Playwright child, the same shape limit the step3-a11y filing recorded"',
    verdict: "dispatch-cannot-express",
  },
  {
    source: "2026-08-20-arc-browser-diff-r2:19",
    line: '## GUARD SURFACE: CANNOT-EXPRESS: `tests/mutation/source/registry.ts`, comment above the `browserRegistry` row — "the spawn boundary in `tests/mutation/browser/runner.ts` needs a real Playwright child, the same shape limit the step3-a11y filing recorded"',
    verdict: "dispatch-cannot-express",
  },
  {
    source: "2026-08-20-arc-browser-diff-r3:23",
    line: '## GUARD SURFACE: CANNOT-EXPRESS: `tests/mutation/source/registry.ts`, comment above the `browserRegistry` row — "the spawn boundary in `tests/mutation/browser/runner.ts` needs a real Playwright child, the same shape limit the step3-a11y filing recorded"',
    verdict: "dispatch-cannot-express",
  },
  {
    source: "2026-08-20-arc-browser-diff-r4:23",
    line: '## GUARD SURFACE: CANNOT-EXPRESS: `tests/mutation/source/registry.ts`, comment above the `browserRegistry` row — "the spawn boundary in `tests/mutation/browser/runner.ts` needs a real Playwright child, the same shape limit the step3-a11y filing recorded"',
    verdict: "dispatch-cannot-express",
  },
  {
    source: "2026-08-20-arc-claimsweep-diff-r1-core:15",
    line: "## GUARD SURFACE: MUTATION SCORE: <SCORE> — 0 unaccepted survivors",
    verdict: "reject-non-canonical",
  },
  {
    source: "2026-08-20-arc-claimsweep-diff-r1-covers:15",
    line: "## GUARD SURFACE: MUTATION SCORE: <SCORE> — 0 unaccepted survivors",
    verdict: "reject-non-canonical",
  },
  {
    source: "2026-08-20-arc-shell-diff-r1:45",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 42/42 plus 0 unaccepted survivors",
    verdict: "reject-non-canonical",
  },
  {
    source: "2026-08-20-arc-shell-diff-r2:45",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 42/42 plus 0 unaccepted survivors",
    verdict: "reject-non-canonical",
  },
  {
    source: "2026-08-20-arc-shell-diff-r3:45",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 42/42 plus 0 unaccepted survivors",
    verdict: "reject-non-canonical",
  },
  {
    source: "2026-08-20-arc-shell-diff-r4:45",
    line: "## GUARD SURFACE: psqlStartupScan — MUTATION SCORE: 48/48 plus 0 unaccepted survivors",
    verdict: "reject-non-canonical",
  },
] as const;
