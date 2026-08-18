# Verdict fixture — authored probe that outruns the ceiling

<!-- tasks: depth=2 red-contract -->

## Task A

<!-- task: red=`pnpm vitest run --config fixtures/specLint/redVerdict/vitest.config.ts fixtures/specLint/redVerdict/slow.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:1` why=`the suite sleeps at module scope, so collection outruns a one-second ceiling` ac=AC-1 -->

- [ ] Step 1: satisfy AC-1.

<!-- tasks: end -->
