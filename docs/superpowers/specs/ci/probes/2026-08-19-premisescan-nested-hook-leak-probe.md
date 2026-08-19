# Probe record — the nested-hook sibling leak, 2026-08-19

Subject: `hookBodies` (`tests/mutation/source/premiseScan.ts:1834`) and its caller
(`tests/mutation/source/premiseScan.ts:1676`). Base: `origin/main` at `a85ccd453`.
Every figure below is a dated observation; per `docs/agents/spec-self-review.md` a probe
transcript is never corrected and never compared against later prose.

## Coverage — what each harness actually walks

| claim | population walked | how it is enumerated | covered? |
| --- | --- | --- | --- |
| the leak shape has zero occurrences | every `describe` in every enrolled suite | `GUARD_SURFACES.flatMap(s => s.suitePaths)`, de-duplicated | YES — 62 entries, 405 `describe` sites |
| the repair moves no verdict | every enrolled suite's declared count | `tests/mutation/_metaPremiseContract.test.ts` walks the registry itself | YES |
| the repair moves no fixture but the pin | every case in the deciding suite | `tests/mutation/source/premiseScan.test.ts`, 300 cases | YES |
| suites outside the registry | — | not walked | NO — outside the probe domain by declaration |

## Instrument 1 — leak-shape population (re-implementation, corroborating)

Counts (describe, hook) attachments an ancestor `describe` collects and does not own: the set
difference between a recursive collect and one that stops at a nested `describe`. It re-implements
the collection rule rather than calling it, which is why instrument 2 is the decisive one.

```ts
const collect = (d: ts.CallExpression, stopAtNested: boolean): ts.CallExpression[] => {
  const out: ts.CallExpression[] = [];
  const walk = (n: ts.Node): void => {
    if (isHook(n)) out.push(n);
    if (stopAtNested && n !== d && ts.isCallExpression(n) && registrarRoot(n.expression) === "describe") return;
    ts.forEachChild(n, walk);
  };
  walk(d);
  return out;
};
// per describe: leaked = collect(d, false) \ collect(d, true)
```

Output:

```text
describes=405 leaked_attachments=0 suites_with_shape=0/62
```

## Instrument 2 — the SHIPPED classifier under the repair (decisive)

The three-line narrowing was applied to `tests/mutation/source/premiseScan.ts`, both suites run,
and the change reverted.

```text
$ npx vitest run tests/mutation/_metaPremiseContract.test.ts
Test Files  1 passed (1)
     Tests  10 passed (10)

$ npx vitest run tests/mutation/source/premiseScan.test.ts
FAIL  tests/mutation/source/premiseScan.test.ts > unclassifiable propagation: a construct anywhere
      reachable reaches the verdict > AC-12b: the SHARED-OUTER leak is pinned at its CURRENT value
AssertionError: expected 'environment-free' to be 'environment-touching'
 ❯ tests/mutation/source/premiseScan.test.ts:3055
Test Files  1 failed (1)
     Tests  1 failed | 299 passed (300)
```

## Conclusions, each bounded to what was walked

1. Exact-count equality in `_metaPremiseContract` holds under the repair. The criterion amended
   AC-1 installed is unmoved.
2. Exactly one fixture changes verdict, and it is the pin that exists to record the leak.
3. Nothing is claimed about suites outside `GUARD_SURFACES.suitePaths`; they are not walked, and
   the probe domain excludes them by declaration.
