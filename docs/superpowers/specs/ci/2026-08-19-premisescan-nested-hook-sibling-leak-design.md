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

Three lines, and one more edit beyond them: the dedup AC-6 needs. §2.1 enumerates both, so no reader
takes the stop for the whole diff — and it enumerates ONLY those two, because the exports an earlier
draft added for AC-5 and AC-6 are deleted from the design (§2.1). The outer describe's OWN hooks are
unaffected: they are direct children of the outer
call, collected before the check fires, and the caller carries them to every descendant. That
non-regression is AC-4, and it is the assertion that stops the repair from over-narrowing.

### §2.1 The implementation surface, stated whole

Two production edits, and no more:

1. **The stop** in `hookBodies` (`tests/mutation/source/premiseScan.ts:1834`) — three lines, above.
2. **The dedup.** `HOOK_REGISTRARS` already exists as a regex at
   `tests/mutation/source/premiseScan.ts:66` and is consumed by the top-level hook seed at
   `tests/mutation/source/premiseScan.ts:1758`; `hookBodies` at
   `tests/mutation/source/premiseScan.ts:1840` carries a SECOND, textually identical literal.
   `hookBodies` is changed to use the existing constant and the duplicate is deleted. **Introducing
   a new exported symbol under that name would collide with the live one**, which is why this is a
   dedup rather than an addition.

**Nothing is exported for a test's benefit, and that is a repair rather than an omission.** Three
consecutive spec rounds (4, 5, 6) found a production edit ordered ahead of the red that justifies
it, and round 6 named the rule closing the class: a red whose failure comes from an unresolved
import is invalid by construction, because it goes green when the TEST file changes rather than when
the implementation lands (`docs/agents/writing-plans.md:15`). Exporting `MODIFIERS` and a registrar
list so fixtures could import them produced exactly that shape twice. **The repair is NARROWING, per
the same-axis recurrence rule in AGENTS.md — each earlier attempt added surface, and the answer to a
class that survives its own repair is less surface, not more.** The derived covers now read the
scanner's SOURCE through the TypeScript AST — the modifier set at
`tests/mutation/source/premiseScan.ts:48`, the registrar names inside `HOOK_REGISTRARS` — which is
the same technique the structural identity assertion uses. The cover stays derived, the production
surface stays at two edits, and every red in the plan fails because of scanner behaviour.

Both edits are on an enrolled guard surface, so AC-7's gate run is not a formality — the mutant
population moves.

## §3 Probes (run 2026-08-19 against `origin/main` at the branch base)

### §3.1 The leak SHAPE has zero occurrences in the ENROLLED SUITES' OWN describes

The harness at `docs/superpowers/specs/ci/probes/2026-08-19-premisescan-nested-hook-leak-probe.md`
counts (describe, hook) attachments an ancestor collects and does not own:

    describes=405 leaked_attachments=0 suites_with_shape=0/62

**That denominator is the enrolled suites' own executable `describe` nodes, and NOT the whole
declared probe domain** — a distinction spec round 3 was right to force. The probe domain also
includes the classifier inputs embedded as template literals inside
`tests/mutation/source/premiseScan.test.ts`, which this harness does not parse; probed directly,
**11 embedded literals carrying 16 `describe` sites, 1 literal with the shape** — literals and sites
are counted separately because they are different units and an earlier draft conflated them — and
that one is
`tests/mutation/source/premiseScan.test.ts:3044` — the AC-12b fixture this arc rewrites. So the
correct reading is narrower than "zero in the probe domain" and is stated as such: no ENROLLED
SUITE carries the shape, and the only fixture that does is the one whose verdict this arc changes
on purpose.

§3.2 is unaffected and remains the decisive measurement: it runs the shipped classifier over the
registry itself rather than re-implementing anything.

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
the diff is scanner code and unit fixtures (§2.1). No file under `app/`, `components/`,
`app/globals.css`, `tailwind.config.*` or `DESIGN.md` is touched, so the invariant-8 UI definition is
not triggered.

### Transition Inventory

None. No visual state is added or changed — no `AnimatePresence`, no `exit`/`initial`/`animate`
props, no conditional render change.

## §5 Meta-test / registry inventory

- **EXTENDS** `tests/mutation/source/premiseScan.test.ts`, in four separate fixture classes — the
  inventory is swept against §6 rather than listing whichever addition was drafted first:
  1. The `tests/mutation/source/premiseScan.test.ts:3033` pin is RETIRED and replaced by its
     inversion (AC-2), `inA` retained as the foil.
  2. AC-4's outer-hook non-regression case and its moved-hook foil.
  3. AC-5's DERIVED modifier family: one case per member of `MODIFIERS`
     (`tests/mutation/source/premiseScan.ts:48`), read from the source through the AST — `each`,
     `for`, `skip`, `only`, `concurrent`, `sequential`, `todo` — plus the plain `describe` and one
     compound chain (`describe.concurrent.each`). Nine cases, generated rather than typed.
  4. AC-6's DERIVED hook-registrar family: one case per name read out of `HOOK_REGISTRARS`.
     These add no coverage the enumerated cases at
     `tests/mutation/source/premiseScan.test.ts:2932` and
     `tests/mutation/source/premiseScan.test.ts:2958` lack; their value is that they are derived, so
     a fifth registrar is covered by default.

  The two foils at `tests/mutation/source/premiseScan.test.ts:2976` and
  `tests/mutation/source/premiseScan.test.ts:3011` are unchanged and must stay green.
- **CREATES** one new suite, `premiseScanMatcherIdentity`, under `tests/mutation/source/` — a
  STRUCTURAL assertion that exactly one registrar-name literal survives in the scanner. AC-6's
  behavioural cases cannot express this, because the four registrars are already covered. It is
  authored BEFORE the duplicate is deleted, so the deletion has an exercising red rather than a
  retrospective check, and its red is a property of the scanner source rather than of the test.
- **UNCHANGED** `tests/mutation/_metaPremiseContract.test.ts` — no declared count moves (§3.2). That
  it is unchanged is the arc's headline, so it is asserted rather than assumed.
- **UNCHANGED** `tests/mutation/source/registry.ts` — same surface, same floor; the score is re-run
  and re-stated, and any `siteId` re-key is derived from the failing run's own output.
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
  **The falsifying mutant is named, because only one of two plausible ones fails it.** A stop placed
  BEFORE the `isHook` push drops the outer describe's own hooks and reds this criterion (probed:
  `expected 'environment-free' to be 'environment-touching'`). A stop placed AFTER the push but
  keyed to any nested call is EQUIVALENT here and passes — collection has already happened by then.
  Stating which mutant discriminates is what stops this criterion from reading stronger than it is.
- **AC-5 — the stop fires on every `describe` spelling the caller recognizes, and the fixture set is
  DERIVED rather than enumerated.** The cases are generated from `MODIFIERS`
  (`tests/mutation/source/premiseScan.ts:48`) itself, read out of the scanner source through the
  TypeScript AST rather than imported — nothing is exported for a test's benefit (§2.1) — one per member,
  each as the NESTED registrar with a spawning hook and a pure sibling, PLUS at least one compound
  chain (`describe.concurrent.each`), which `registrarRoot`'s loop
  (`tests/mutation/source/premiseScan.ts:73`) accepts and a single-modifier fixture set does not
  reach. The criterion asserts the generated count equals the derived population, so a member added
  to `MODIFIERS` later is covered by default rather than silently exempt.
  *Catches:* a stop keyed to a bare `describe` identifier while the caller's own `registrarRoot`
  accepts modifiers — the two predicates disagreeing is the leak surviving in a spelling nobody
  looked at. **It also catches the weaker repair an ENUMERATED criterion would have accepted:** a
  hand-written stop-list covering only the rows the criterion happens to name. Spec round 1 probed
  exactly that hole; the probe record's Instrument 3 then measured the whole population both ways — all eight single spellings
  plus one compound chain leak on the unrepaired tree and are closed by the repair, with `inA`
  holding as the foil in every row. A four-row fixture list would have passed an implementation that
  still leaked the rest.
- **AC-6 — every hook registrar, DERIVED from the matcher, and exactly ONE matcher exists.** The
  registrar names are read out of `HOOK_REGISTRARS` (`tests/mutation/source/premiseScan.ts:66`) by
  the same AST route, and the fixtures are generated from them, one per member as the nested spawner.
  The criterion's discriminating half is structural rather than behavioural — the four registrars are
  already covered by enumerated cases at `tests/mutation/source/premiseScan.test.ts:2932` and
  `tests/mutation/source/premiseScan.test.ts:2958`, so only an assertion that ONE registrar-name
  literal survives can prove the dedup. Same derivation rule as AC-5, and for the same reason — this is one class, swept
  in one round rather than one member per round. *Catches:* a fixture pair covering only the
  `before*` forms, which reads as complete and leaves half the defect live (the same defect shape
  #843's §3.11 row D found).
- **AC-7 — the guard still pins what it claims.** `pnpm mutation:guards` on `premiseScan` at or
  above its floor with an empty unaccepted-survivor set, re-run after the repair.

## §7 Lint disposition

`pnpm spec:lint` reports **0 hard** on this document and on the plan, and that is the only figure
stated here. Two earlier drafts quoted the advisory set — first as a count, then as an enumerated
list of classes — and BOTH went stale at the next repair, costing a finding each time (rounds 3
and 9). The enumeration was the same defect as the count wearing a longer form, so it is replaced by
the invariant rather than by a third list.

**The invariant: no advisory is suppressed, and every dispatch carries the current report.**
`codex-guard --lint-doc` runs the lint at dispatch time and attaches its output to the brief,
recording a `lintArm` field in the dispatch result, so each reviewer reads the live advisory set rather than this
document's account of it. Anything hard is repaired before dispatch, never declared.

One advisory class is a standing known false positive and is named because it will not go away:
`NUMERIC_NOUN_MISMATCH` over the §3.2 probe transcript, where `10 passed` and `299 passed` are two
lines of one dated record. A dated probe transcript is never corrected and never compared
(`docs/agents/spec-self-review.md`).
