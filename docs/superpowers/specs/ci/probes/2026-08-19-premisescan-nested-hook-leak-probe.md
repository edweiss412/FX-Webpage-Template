# Probe record — the nested-hook sibling leak, 2026-08-19

Subject: `hookBodies` (`tests/mutation/source/premiseScan.ts:1834`) and its caller
(`tests/mutation/source/premiseScan.ts:1676`). Base: `origin/main` at `a85ccd453`.

**Every census below is a DATED observation at that base and is never corrected.** Diff round 1
measured 408 `describe` sites on the implemented tree against the 405 recorded here; the
difference is this arc's own three fixture wrappers, not drift in the corpus. The spec's
convergence criterion therefore names the registry rather than a number (design §1.2).
Every figure below is a dated observation; per `docs/agents/spec-self-review.md` a probe
transcript is never corrected and never compared against later prose.

## Coverage — what each harness actually walks

| claim | population walked | how it is enumerated | covered? |
| --- | --- | --- | --- |
| the leak shape has zero occurrences in the enrolled suites' OWN describes | every executable `describe` node in every enrolled suite | `GUARD_SURFACES.flatMap(s => s.suitePaths)`, de-duplicated | YES — 62 entries, 405 `describe` sites |
| classifier inputs embedded as template literals in the deciding suite | 11 literals carrying 16 `describe` sites in `tests/mutation/source/premiseScan.test.ts` | probed directly; Instrument 1 does NOT parse these | YES, separately — 1 of the 11 literals carries the shape, at `tests/mutation/source/premiseScan.test.ts:3044`, and it is the AC-12b fixture this arc rewrites |
| the repair moves no verdict | every enrolled suite's declared count | `tests/mutation/_metaPremiseContract.test.ts` walks the registry itself | YES |
| the repair moves no fixture but the pin | every case in the deciding suite | `tests/mutation/source/premiseScan.test.ts`, 300 cases | YES |
| every describe spelling leaks, and the repair closes every one | plain + all seven `MODIFIERS` members + one compound chain | generated from `MODIFIERS` (`tests/mutation/source/premiseScan.ts:48`) | YES — 9 forms, before and after |
| modifier chains of length 3 or more | — | not walked | NO — `registrarRoot`'s loop is uniform in depth, so the 2-modifier case exercises the same path |
| suites outside the registry | — | not walked | NO — outside the probe domain by declaration |

## Instrument 1 — leak-shape population (re-implementation, corroborating)

Counts (describe, hook) attachments an ancestor `describe` collects and does not own: the set
difference between a recursive collect and one that stops at a nested `describe`. It re-implements
the collection rule rather than calling it, which is why instrument 2 is the decisive one.

**Its denominator is executable `describe` nodes, NOT the whole declared probe domain.** Classifier
inputs written as template literals inside the deciding suite are not parsed here; they are counted
in the coverage table above as their own row, and the single hit is the fixture this arc rewrites on
purpose. A reading of `leaked_attachments=0` as "zero anywhere in the probe domain" overstates it.

**The instrument models the ORIGINAL whole-call prune, and that is now a superseded design.** Diff
round 2 probed a hook in a nested registration's EAGER positions — a `describe.each` producer, a
name argument — and showed the whole-call prune turning a touching sibling free. The shipped stop
prunes only the BODY. This instrument's population figure is unaffected (no corpus suite writes a
hook in those positions), and it is left as the DATED measurement it was, but a reader must not take
the snippet below for the shipped rule; that is spec §2.

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

## Instrument 3 — every describe spelling, before and after (AC-5's premise)

Nine nested-registrar spellings, each with a spawning `beforeEach` in branch A and a pure test in
sibling B under a shared outer `describe`. `describe.each` and `describe.for` use the curried form;
`describe.concurrent.each` is the compound chain `registrarRoot`'s modifier loop
(`tests/mutation/source/premiseScan.ts:73`) accepts and a single-modifier set never reaches. Each
case writes a fresh module tree under `mkdtempSync` and calls
`classifyTests(root, "tests/probe.test.ts")`.

The scanner is LEXICAL, so `describe.todo("A", () => { … })` is a real case here even though Vitest
never runs that body: `hookBodies` sees the hook regardless of runtime semantics.

Before the repair — every spelling leaks:

```text
plain            inA=environment-touching  inB=environment-touching
each             inA=environment-touching  inB=environment-touching
for              inA=environment-touching  inB=environment-touching
skip             inA=environment-touching  inB=environment-touching
only             inA=environment-touching  inB=environment-touching
concurrent       inA=environment-touching  inB=environment-touching
sequential       inA=environment-touching  inB=environment-touching
todo             inA=environment-touching  inB=environment-touching
concurrent.each  inA=environment-touching  inB=environment-touching
```

After the repair — every spelling closed, and `inA` holds in every row, which is the foil:

```text
plain            inA=environment-touching  inB=environment-free
each             inA=environment-touching  inB=environment-free
for              inA=environment-touching  inB=environment-free
skip             inA=environment-touching  inB=environment-free
only             inA=environment-touching  inB=environment-free
concurrent       inA=environment-touching  inB=environment-free
sequential       inA=environment-touching  inB=environment-free
todo             inA=environment-touching  inB=environment-free
concurrent.each  inA=environment-touching  inB=environment-free
```

Coverage: the eight single spellings are `plain` plus every member of `MODIFIERS`
(`tests/mutation/source/premiseScan.ts:48`); the ninth is one compound chain. Chains of length
three or more are not walked and are not claimed — `registrarRoot`'s loop is uniform in depth, so
the two-modifier case exercises the same code path.


## Conclusions, each bounded to what was walked

1. Exact-count equality in `_metaPremiseContract` holds under the repair. The criterion amended
   AC-1 installed is unmoved. No ENROLLED SUITE carries the leak shape in its own `describe` nodes;
   the one embedded fixture that does is the AC-12b pin whose verdict this arc changes deliberately.
2. Exactly one fixture changes verdict, and it is the pin that exists to record the leak.
3. Every `describe` spelling the caller recognizes leaks today and is closed by the repair, with
   branch A holding as the foil in all nine rows. AC-5's claim is measured rather than asserted.
4. Nothing is claimed about suites outside `GUARD_SURFACES.suitePaths`; they are not walked, and
   the probe domain excludes them by declaration.
