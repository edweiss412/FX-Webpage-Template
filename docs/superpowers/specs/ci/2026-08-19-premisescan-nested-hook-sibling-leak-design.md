# BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK — a hook in one nested describe leaks to its siblings

**Row:** `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK` (BACKLOG.md) · **Branch:** `fix/premisescan-nested-hook-sibling-leak` · **Effort:** S (measured, see §3)

## §0 The bound this arc is held to

`premiseScan` decides which enrolled tests must carry an executable premise. Every test is
classified correctly or its verdict is SIGNALLED; a conservative report is a documented limit,
never a finding. This arc closes a FALSE POSITIVE — the direction that announces itself, but
announces itself as work: a pure test told to carry a premise it does not need.

## §1.1 Resolved scope — do not relitigate

1. **The AC-1 movement of PR #843 is not this arc's business.** Sixteen tests moved in that arc,
   deliberately and documented in its own PR title. It is not a defect and nothing is filed for it.
   (Orchestrator disposition 2026-08-19.)
2. **The count delta is measured against the CURRENT `_metaPremiseContract`**, not against any
   pre-#843 baseline. (Same disposition.)
3. **The pin this arc RETIRES is `tests/mutation/source/premiseScan.test.ts:3033`**, `AC-12b: the
   SHARED-OUTER leak is pinned at its CURRENT value`. Its own comment says what it is for: it pins
   that #843 did not WIDEN the leak. Closing the leak is what retires it, so retiring it is the
   ratified outcome rather than scope creep.
4. **Spec §4 limit 14 of the owning arc is SUPERSEDED BY MEASUREMENT, not by argument.** That limit
   defers this repair on the grounds that it would move a SEVENTEENTH verdict, which amended AC-1
   forbids. §3.2 measures zero moved verdicts. The limit's reasoning was an inference nobody ran.
5. **The repair is a NARROWING, and widening is declined by construction.** No new registrar
   spelling, no new grammar, no execution-position modelling. `hookBodies` stops where the caller
   already resumes.

## §1.2 Convergence criterion (all four, stated in every review brief)

- **Consequence bound.** Every hook attaches to exactly the tests Vitest would run it for, or the
  verdict is signalled. A conservative report is a DOCUMENTED LIMIT, not a finding.
- **PROBE DOMAIN.** The enrolled suites named by `GUARD_SURFACES.suitePaths`
  (`GUARD_SURFACES`, `tests/mutation/source/registry.ts`), which as of 2026-08-19 enumerates 62
  entries carrying 405 `describe` sites, plus the fixtures in `tests/mutation/source/premiseScan.test.ts`. A probe outside that domain, or
  more than one ordinary edit from an input in it, files to documented limits.
- **Threat fence.** Ordinary Vitest suite authoring. Deliberately obfuscated registrar spellings —
  a `describe` reached through an alias, a computed member, or an indirection — are out of scope
  and file to documented limits.
- **Score.** `premiseScan` IS enrolled in the source-mutation registry. `pnpm mutation:guards` runs
  BEFORE the round-1 diff dispatch; the brief states the score and the empty unaccepted-survivor
  set. A "the guard does not pin what it claims" finding is admissible only with the surviving
  mutant that demonstrates it.

## §2 The repair

`hookBodies` (`tests/mutation/source/premiseScan.ts:1834`) collects hook calls by walking a
`describe` call with `ts.forEachChild` and never stopping. Its caller (`tests/mutation/source/premiseScan.ts:1676`) already accumulates
hooks DOWNWARD —

    const nested = [...hooks, ...hookBodies(node), ...eachProducers(node)];
    ts.forEachChild(node, (c) => walk(c, nested));

— so a hook lexically owned by an inner `describe` is added twice: once by the inner describe,
which is correct, and once by every ancestor, which is the leak. The ancestor's copy attaches it to
every test in every SIBLING branch.

The repair stops the walk at a nested `describe`, using the SAME predicate the caller uses to
recognize one (`registrarRoot`, `tests/mutation/source/premiseScan.ts:68`):

    if (n !== describeCall && ts.isCallExpression(n) && registrarRoot(n.expression) === "describe")
      return;

Three lines. The outer describe's OWN hooks are unaffected: they are direct children of the outer
call, collected before the check fires, and the caller carries them to every descendant. That
non-regression is AC-4, and it is the assertion that stops the repair from over-narrowing.

## §3 Probes (run 2026-08-19 against `origin/main` at the branch base)

### §3.1 The leak SHAPE has ZERO occurrences in the probe domain

The harness at `docs/superpowers/specs/ci/probes/2026-08-19-premisescan-nested-hook-leak-probe.md`
counts (describe, hook) attachments an ancestor collects and does not own:

    describes=405 leaked_attachments=0 suites_with_shape=0/62

### §3.2 The repair is verdict-neutral against the SHIPPED classifier

The narrowing above was applied to `premiseScan.ts` and both suites run, then reverted:

    npx vitest run tests/mutation/_metaPremiseContract.test.ts   ->  10 passed
    npx vitest run tests/mutation/source/premiseScan.test.ts     ->  1 failed | 299 passed

`_metaPremiseContract`'s exact-count equality — the criterion amended AC-1 installed — holds
unchanged. §3.1 is a re-implementation of the collection rule and is therefore corroborating; §3.2
is the decisive measurement, because it runs the real one.

### §3.3 The blast radius is exactly one fixture

The single failure is the pin this arc retires:

    AC-12b: the SHARED-OUTER leak is pinned at its CURRENT value
    AssertionError: expected 'environment-free' to be 'environment-touching'
    tests/mutation/source/premiseScan.test.ts:3055

That is the leak reporting itself gone. No other fixture moves.

## §4 Documented limits

1. **A `describe` the recognizer cannot NAME does not stop the walk** — an aliased registrar, a
   computed member, an indirection. Outside the threat fence (§1.2); population 0 in the probe
   domain. Worst case is the pre-existing leak, unchanged.
2. **Hook attachment is LEXICAL, not runtime.** A hook registered from inside a helper the describe
   calls is attached to that describe, which is what Vitest does; a hook registered conditionally is
   attached unconditionally. Pre-existing, unchanged by this arc, conservative in the safe direction.
3. **The stale line anchor at `premiseScan.test.ts:2978`** (`premiseScan.ts:1113`, now `tests/mutation/source/premiseScan.ts:1834`) is
   refreshed as a by-product because this arc edits that block. Anchors elsewhere are not swept —
   a drifted line on an otherwise-correct claim is not a finding (`docs/agents/spec-self-review.md`).

### Dimensional Invariants

None. This arc introduces no rendered component, no fixed-dimension parent and no box-model change:
the diff is three lines of scanner code plus unit fixtures. No file under `app/`, `components/`,
`app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched, so the invariant-8 UI definition is
not triggered.

### Transition Inventory

None. No visual state is added or changed — no `AnimatePresence`, no `exit`/`initial`/`animate`
props, no conditional render change.

## §5 Meta-test / registry inventory

- **EXTENDS** `tests/mutation/source/premiseScan.test.ts` — the `tests/mutation/source/premiseScan.test.ts:3033` pin is RETIRED and replaced
  by its inversion; AC-4's outer-hook non-regression fixture and AC-5's `describe.each` spelling are
  added. The two foils at `tests/mutation/source/premiseScan.test.ts:2976` and `tests/mutation/source/premiseScan.test.ts:3011` are unchanged and must stay green.
- **UNCHANGED** `tests/mutation/_metaPremiseContract.test.ts` — no declared count moves (§3.2). That
  it is unchanged is the arc's headline, so it is asserted rather than assumed.
- **UNCHANGED** `tests/mutation/source/registry.ts` — same surface, same floor; the score is re-run
  and re-stated, and any `siteId` re-key is derived from the failing run's own output.
- **CREATES** no new meta-test.
- No Supabase call site, no invariant-10 mutation surface, no advisory lock, no §12.4 catalog row,
  no migration, no UI surface.

## §6 Acceptance criteria

Every positive fixture has a foil, so no assertion can pass by the classifier being a constant.

- **AC-1 — no declared count moves.** `_metaPremiseContract` passes with every
  `EXPECTED_ENV_TOUCHING` value unchanged. *Catches:* a repair that silently re-baselines the corpus.
  *Measured green at §3.2 before implementation, which is what makes it a criterion and not a hope.*
- **AC-2 — the shared-outer sibling is FREE.** The `tests/mutation/source/premiseScan.test.ts:3033` fixture's `inB` classifies
  `environment-free`; `inA` still classifies `environment-touching`. *Foil:* `inA`, which must NOT
  move — a repair that stopped collecting hooks altogether would pass a one-sided assertion.
- **AC-3 — both existing AC-12b foils stay green, byte-unchanged.** The no-shared-outer case
  (`tests/mutation/source/premiseScan.test.ts:2976`) and the pure-top-level-hook case
  (`tests/mutation/source/premiseScan.test.ts:3011`). *Catches:* a repair that fixes the leak by
  breaking the top-level seed.
- **AC-4 — the OUTER describe's own hooks still reach every descendant.** A spawning `beforeEach`
  declared directly in `describe("outer")` with pure tests in nested `A` and `B`: BOTH classify
  `environment-touching`. *Foil:* the same file with the hook moved into `A` — then only `A`'s test
  is touching. *Catches:* over-narrowing, the one way this three-line repair can be wrong.
- **AC-5 — the stop fires on every `describe` spelling the caller recognizes.** `describe.each`,
  `describe.only`, `describe.skip`, `describe.concurrent` as the NESTED registrar, each with a
  spawning hook and a pure sibling. *Catches:* a stop keyed to a bare `describe` identifier while
  the caller's own `registrarRoot` accepts modifiers — the two predicates disagreeing is the leak
  surviving in a spelling nobody looked at.
- **AC-6 — all four hook registrars.** `beforeEach`, `beforeAll`, `afterEach`, `afterAll` as the
  nested spawner. *Catches:* a fixture pair covering only the `before*` forms, which reads as
  complete and leaves half the defect live (the same defect shape #843's §3.11 row D found).
- **AC-7 — the guard still pins what it claims.** `pnpm mutation:guards` on `premiseScan` at or
  above its floor with an empty unaccepted-survivor set, re-run after the repair.

## §7 Lint disposition

`pnpm spec:lint` on this document: **0 hard, 1 advisory.** The advisory is
`NUMERIC_NOUN_MISMATCH` on `10 passed` versus `299 passed`, both of which are lines of the §3.2
probe transcript. A dated probe transcript is never corrected and never compared
(`docs/agents/spec-self-review.md`), so the advisory is a known false positive on this document and
is declared here rather than silenced.
