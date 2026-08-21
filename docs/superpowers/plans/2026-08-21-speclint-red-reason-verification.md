# Plan — the unprobeable-command silent drop in the red-contract collection arm

Spec: `docs/superpowers/specs/ci/2026-08-21-speclint-red-reason-verification-design.md` (canonical;
every § reference below is to it). Ledger row: `BL-SPECLINT-RED-REASON-VERIFICATION`.

`collectionProbePlan` discards every v2 marker whose command it cannot derive a collection probe
from, emitting neither a finding nor a plan entry. Fifteen live markers land there. The repair routes
that derivation through the decline path that already ships, so the entry draws the existing
`RED_PROBE_UNVERIFIED` advisory. No new finding code, no new predicate, no new severity decision.

impeccable-gate: N/A — no UI surface

Every file this plan touches is under `lib/specLint/`, `probe/`, `tests/`, or `fixtures/`; nothing
under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. The marker sits
on its own line because the gate reads the LINE.

---

## 0. Pre-draft code-verification pass — authored AND RUN

Every citation below was READ, not merely resolved. The distinction matters here because two of them
name lines this plan's own execution will move.

| citation | what the line holds |
| -------- | ------------------- |
| `lib/specLint/redContract.ts:717` | `if (state === null) continue; // v1: no declared state to probe against` |
| `lib/specLint/redContract.ts:721` | `if (derived.kind === "none") continue;` |
| `lib/specLint/redContract.ts:580` | `const VITEST_SHAPE =` |
| `lib/specLint/redContract.ts:637` | `export function deriveCollectionProbe(` |
| `lib/specLint/run.ts:151` | `doc.kind === "plan" && probes !== undefined && probes !== null` |
| `lib/specLint/taskContract.ts:49` | `const V2_FIELDS = "( red-state=(live\|authored))?…"` |
| `tests/mutation/source/expectedLedgerKinds.ts:137` | `redContract: { equivalent: 7 },` |

`ProbeDerivation` and `CollectionProbeEntry` are declared together at `lib/specLint/redContract.ts`
around lines 608 to 625; the `skipped` reason union is `"compound-command" | "unstrippable-filter"`
in both, so a third reason is a two-site type change, not one.

**Two helpers this plan deliberately does NOT use.** `ownedContractLines` and `wellFormedMarkers` are
not exported. Any probe reconstructing the guard sequence around them would be a MODEL of
`collectionProbePlan` rather than the function itself, which is why `probe/reach.mts` runs the CLI
instead.

## 1. Meta-test inventory

- **EXTENDS** `tests/specLint/redExec.test.ts` (core synthesis) and the `redVerdict` fixture plan
  corpus.
- **EXTENDS** `probe/reach.mts`, which becomes the executable form of AC-3 and AC-4 rather than a
  one-off measurement.
- **UNCHANGED and load-bearing:** `tests/specLint/_metaPureCore.test.ts`. It walks `lib/specLint/`
  recursively with a walker floor and pins that no core file imports `node:fs`,
  `node:child_process`, or `node:process`. Nothing here needs raw output, so it stays green; if a
  draft ever reaches for the child's stdout, this is the test that reds.
- **NO new registry surface.** `redContract` is already enrolled. `expectedLedgerKinds.ts:137` is
  touched only if the accepted-row COUNT changes, which it should not.
- Advisory-lock topology: N/A, no `pg_advisory*` in scope.

## 2. The purity boundary, and why the repair sits inside it

`deriveCollectionProbe` and `collectionProbePlan` are pure functions over parsed text. The change adds
a union member and a detail string, so it stays pure by construction. The adapter is untouched: no new
information crosses the boundary, because the decline is derived from the COMMAND, which the core
already has.

## 3. Citation lifetime — this plan's own execution moves its own red-target

Task 1 edits at line 721. Line 717 is ABOVE it and therefore unaffected, which is why Task 2's
red-target survives Task 1. Task 1's own target does not: once the `continue` becomes a push, the line
it names holds something else.

`RED_TARGET_INVALID` cannot see this. It checks that the path is tracked and the line is in range,
not that the line still holds what `why=` describes. So both `red-target=` citations are RE-READ at
closeout and corrected in the closing commit. This is stated as a step rather than left as a habit
because the arm being repaired here is the one that would otherwise catch it.

## 4. The cycle every task runs, stated once

1. Write the failing case. Run it. **Read the failure text** and confirm it fails on the VALUE the
   task names, not on a missing symbol, a bad path, or a collection that found nothing.
2. Make the minimal change.
3. Re-run. Confirm green, and confirm the paired negative in the same task is still green.
4. `pnpm exec tsx scripts/spec-lint.ts --json <this plan>` and report the result.
5. Commit.

Step 1's read is not ceremony. This arc exists because a red that exits non-zero for the wrong reason
looks identical to one that exits non-zero for the right one, and both tasks below are authored reds
that no one will ever watch fail again.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the unprobeable drop reports instead of vanishing

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:721` why=`collectionProbePlan continues past a kind none derivation, so an unprobeable v2 marker produces no plan entry and the new case's finding list comes back empty where it requires RED_PROBE_UNVERIFIED` ac=AC-1,AC-2,AC-3 -->

**What is red and why.** `if (derived.kind === "none") continue;` drops the entry entirely, so any v2
marker whose command is not vitest-shaped at the anchor draws neither a FAIL nor an advisory. The new
case asserts the advisory by name on such a fixture marker. Today the list is empty, so the assertion
fails on a VALUE, the produced finding list, and not on a missing symbol.

**Mechanism, fixed by the spec rather than left open.** `none` gains a third `skipped` reason
(`"not-vitest-shaped"`) and rides the decline path that already ships: `ProbeDerivation` and
`CollectionProbeEntry` each gain the union member, `collectionProbePlan` pushes instead of
continuing, and `synthesizeCollectionFindings` needs no edit at all because its `skipped` branch
already emits `RED_PROBE_UNVERIFIED`. An implementation that instead adds a `pnpm heavy` recognizer
to narrow the reach to nine is forbidden by spec §2 and fails Task 2.

**Reachability, stated because round 2 killed a sibling repair for lacking it.** The path is reached
only under `--exec-red`: `lib/specLint/run.ts:151` calls `synthesizeCollectionFindings` only when
probes are non-null. The case exercises it WITH the flag, or it passes while proving nothing.

**Both directions in ONE cycle.** The same task asserts that a marker the arm CAN probe is
unaffected: `exec-genuine-red.md` and `exec-collects-nothing.md` re-run with identical verdicts.
Without that half, an implementation emitting the advisory unconditionally passes every assertion
here.

**The advisory is ADDED, never exclusive.** Spec §1.2 measured three of the fifteen already carrying
a hard finding from an unrelated arm. The case asserts containment, not list equality. Equality would
be false at three live markers and would push the implementation toward suppressing findings this
change has nothing to do with.

**The live marker gets it too, and the task pins that.** The live `sh -c` grep marker already draws
`RED_ALREADY_GREEN`. It still gains the advisory, because the live gate in
`synthesizeCollectionFindings` guards against reading a probe RESULT and a declined derivation
produces none. An implementation that files `none` behind the live gate would drop it, so the case
carries a fixture of that shape: `red-state=live`, unprobeable command, red exits 0.

**Severity is proved over the POPULATION, not the fixtures** (spec AC-3). `probe/reach.mts` gains an
assertion that every finding at a `none`-derived line has severity `advisory`, plus a derived count of
`fail(` construction sites in the module. A fixture corpus cannot exclude a hard branch on a command
shape the fixtures never contain, which is exactly what round 3 found.

**No new code is minted.** `RED_PROBE_UNVERIFIED` already exists and already means collection
capability unverified.

## Task 2 — the fifteen draw it, the sixteen do not

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:717` why=`no case asserts that a v1 marker stays silent, so an implementation that also moves the v1 exit passes every other assertion while emitting sixteen advisories the design does not claim` ac=AC-4 -->

**What is red and why.** The v1 exit at line 717 sits BEFORE the drop at 721, so v1 markers are out of
reach by construction. Nothing today asserts they stay that way. The case pins both halves of the
partition against the NAMED sets in spec §1.1, the fifteen and the sixteen, rather than against
counts. Before the change it fails on the fifteen-half.

**This is the load-bearing task**, and it catches two wrong implementations rather than one. It fails
under one that "repairs" the drop by also moving the v1 exit, a wider change that reads as more
thorough and would emit sixteen advisories the spec does not claim. It also fails under one that
narrows the reach to the nine heavy-wrapped markers with a wrapper recognizer, because the other six
would then draw nothing. Task 1 alone sees neither.

<!-- tasks: end -->

## Task 3 — the score (OUTSIDE the red-contract region, no marker, stated acceptance)

**It carries no `red=` deliberately, and the reason was measured rather than assumed.** An earlier
draft had a re-key task whose red was the gate reporting an unaccepted survivor at the new key
alongside a stale row at the old. That red cannot fire:

```
accepted-row lines : 37  110  127  190  191  257  257
this arc edits at  : 721 in redContract.ts, plus the deciding suites
```

Every accepted row sits ABOVE the edit point, so none shifts. A registry edit asserting a red rather
than observing one is the manufactured-red shape, and it belongs outside the region with stated
acceptance. `BL-MUTATION-SITEID-LINE-KEYED-CHURN` (`BACKLOG.md:1428`) is the governing precedent,
cited so the chain is visible, and the honest result is that this arc does not trigger it.

**Still owed, and none of it is a red:**

- Re-measure ONCE, after the last source-or-suite edit. Editing `redContract.ts` retires the current
  score, and so does editing any deciding suite, so measuring earlier retires the number for nothing.
- **Re-VALIDATE all seven `equivalent` rows even though they are unshifted.** Not needing a re-key is
  not evidence the premise still holds, and this arc adds a branch.
- `pnpm mutation:sites` LAST before any push touching the enrolled source, confirming mechanically
  that the seven keys still resolve to the same expressions rather than inferring it from arithmetic.
- Acceptance: floor 0.95 met, unaccepted-survivor set EMPTY, `expectedLedgerKinds.ts:137`
  (`redContract: { equivalent: 7 }`) unchanged, stamped inputs hashed before and after INSIDE the
  measuring invocation.
- `pnpm mutation:guards` is a heavy phase and runs under `pnpm heavy` per AGENTS.md.

## 5. Fixture work, and what it does NOT need

Fixture PLANS live at `tests/specLint/fixtures/redVerdict/docs/superpowers/plans/`; the suites their
`red=` commands run live at `fixtures/specLint/redVerdict/`, deliberately OUTSIDE `tests/` because
every project glob in `vitest.projects.ts` is rooted at `tests/**`.

This arc needs **no new suite at all**: an unprobeable `red=` never reaches one, which is the whole
point of the blind spot. So the fixture work is four new PLAN documents:

| fixture | shape | proves |
| ------- | ----- | ------ |
| heavy-wrapped v2 | `pnpm heavy pnpm vitest run …` | AC-1, the motivating class |
| non-heavy unprobeable v2 | `sh -c "grep -q …"`, `red-state=authored` | the narrowed implementation the spec forbids fails here |
| live unprobeable v2, red exits 0 | `sh -c "true"`, `red-state=live` | the advisory coexists with `RED_ALREADY_GREEN` (§1.2) |
| heavy-wrapped v1 | no `red-state=` | AC-4's silent half |

Two v2 shapes rather than one, because a fixture set holding only the heavy-wrapped shape is satisfied
by the narrowed implementation.

**The broken-by-design fixture fan-out does not apply.** No syntactically invalid file is added, so
nothing needs excluding from `tsconfig.json`, the eslint ignore list, or `.prettierignore`.

## 6. Acceptance criteria → the task that PROVES each

| AC | claimed by | note |
| -- | ---------- | ---- |
| AC-1 | Task 1 | the advisory fires on an unprobeable v2 marker |
| AC-2 | Task 1 | probeable markers unaffected, verdicts identical |
| AC-3 | Task 1 | no hard finding added, asserted over the real population via `probe/reach.mts` |
| AC-4 | Task 2 | the fifteen/sixteen partition, against named sets, asserted as a GAIN |
| AC-5 | **no task, stated not omitted** | satisfied by `probe/population.mts` and `probe/reach.mts`, both committed with the spec |

Every AC is claimed by a marker or carries a written reason for not being. An unclaimed AC reads as an
oversight even when it is not.

## 7. Obligations before dispatch

- Run `pnpm spec:lint` on this plan and report the result. This arc's own arm reads it.
- Neither `red=` is `pnpm heavy`-wrapped, and both are vitest-shaped at the anchor, so the plan's own
  reds sit inside the arm's sighted domain rather than demonstrating the blind spot. Stated because a
  reviewer will check.
- Re-read both `red-target=` lines at closeout per §3.
- No fenced block carries an em-dash: `FENCE_EM_DASH` is a plan-fence rule and
  `tests/docs/planFencesBaseline.ts` is a DECREASE-ONLY ratchet, so a new hit fails unlisted.
- `pnpm typecheck` before push. It was red on this branch for two rounds because `tsx` resolved an
  import the compiler rejects, and no review round could have seen it.
