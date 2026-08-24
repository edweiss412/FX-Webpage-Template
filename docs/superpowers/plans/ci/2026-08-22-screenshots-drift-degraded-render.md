# Plan — screenshots-drift: refuse to encode a faulted render, and instrument both outcomes

**Status:** DRAFT (r3 repaired) · **Spec:** `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md` · **Branch:** `fix/screenshots-drift-instrument`

Closes `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM`. Re-dispositions
`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — mechanism named, distinct class, stays OPEN.

**This IS a UI surface and the r1 draft wrongly waived the gate.** Task 4 adds `data-render-fault` to
branches under `components/**` and `app/**`, and AGENTS.md invariant 8 defines either path as a UI surface
**regardless of visual impact** — there is no "it only adds an attribute" exemption, and reading one into
the invariant is how a gate quietly stops applying. (Orchestrator ratification 2026-08-22 supersedes this
arc's dispatch brief, which had said "no UI files".)

**Why the gate marker is absent rather than PENDING.** `tests/docs/_invariant8Closeout.ts:45` accepts
exactly two marker forms — real counts, or the N/A form. `PENDING` is malformed and the guard rejects it,
which is correct: a marker is a claim about a gate that ran. The gate cannot run yet, because the diff it
would judge does not exist until Task 4. And the guard's contract is conditional — a unit that NAMES both
gate commands must carry a valid marker (`tests/docs/_invariant8Closeout.ts:39` and the line below it, with `declaresGate` at line 109) — so naming them now while the marker cannot be truthful would fail the guard for
the whole implementation phase.

So the declaration and the marker land together, at close-out, in the same commit as the gate run. That is
the guard's intended lifecycle, and it is written down here rather than achieved by quietly rewording
around a scanner: the obligation is real, ratified, and Task 9 owns it.

---

## Pre-draft code verification

| claim | anchor | verified |
| --- | --- | --- |
| capture loops manifest x theme, fresh context each | `scripts/help-screenshots.ts:117`, `scripts/help-screenshots.ts:133` | yes |
| quiescence waits for the selector FIRST | `scripts/capture-core.ts:100` | yes |
| `captureSelector` is OPTIONAL | `scripts/help-screenshots.manifest.ts:18` | yes |
| and the capture falls back to full-page | `scripts/help-screenshots.ts:80` | yes |
| webp encode | `scripts/capture-core.ts:115` | yes |
| shape-1 branch | `components/admin/RecentAutoAppliedStrip.tsx:726` | yes |
| shape-4 flag consumer | `components/admin/Dashboard.tsx:489` | yes |
| shape-5 throw and catch | `lib/data/getShowForViewer.ts:390`, `app/admin/show/[slug]/preview/[crewId]/page.tsx:202` | yes |
| shape-6 switch case | `app/show/[slug]/[shareToken]/page.tsx:220` | yes |
| replacement blanks the whole admin tree | `app/admin/layout.tsx:94` | yes |
| replacement blanks the dashboard | `app/admin/page.tsx:178`, `components/admin/Dashboard.tsx:598` | yes |
| `data-degraded` is TAKEN, product state | `components/crew/RightNowHero.tsx:472` | yes |
| guard population derivation to mirror | `tests/help/_metaServerTimeGuard.test.ts:11` | yes |
| existing workflow describe block | `tests/cross-cutting/ci-workflow-speedup.test.ts:84` | yes |
| capture step forwards only `-e CI=true` | `.github/workflows/screenshots-drift.yml:113` | yes |
| gate fails on untracked files there | `.github/workflows/screenshots-drift.yml:137` | yes |
| new scripts absent from the job's paths allow-list | `.github/workflows/screenshots-drift.yml:35` and the five entries under it | yes, probed |
| mutation registry row shape | `tests/mutation/source/registry.ts:12` (type), `tests/mutation/source/registry.ts:151` (membership) | yes |

**Measured, not assumed.** The widened accept-set (six guard forms) matches **21** JSX-returning fault
branches across `components/**` + `app/admin/**`, reached via three detectable constructs: literal
comparison, `"kind" in x`, and `catch`. The r1 draft said 15, which counted only literal comparisons. The
figure is a floor measured at authoring time; Task 4's meta-test derives it each run.

**Probed, not read.** Four facts measured rather than inferred, each of which would otherwise be a bug:

1. An untracked file under `public/help/screenshots/` fails the gate's own untracked check; ignoring it
   suppresses the listing. Both directions run on this tree.
2. A transactional `REVOKE` reproduces a real read failure (`permission denied for table
   show_change_log`) and rolls back, so no concurrent arc is disturbed.
3. `loadRecentAutoApplied` accepts `deps.supabase`, so a failing stub drives the real loader error path.
4. **All seven manifest routes share the first path segment `/admin`.** A quote-only route parser and a
   complete one therefore derive IDENTICAL roots — `["app/admin", "components"]` either way. This is why
   Task 4's route mutant must introduce a DISTINCT root; see that task.

---

## Task ordering, and why the r1 draft could not satisfy TDD

The r1 draft asserted in Task 2 that an evidence record is written on refusal, and in the geometry task
that a missing baseline records a skip reason — while the task that CREATES the record came later. Neither
test could go green after its own implementation. The evidence record is a precondition for every refusal
assertion, so it is built first and everything that refuses writes into it.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the evidence record, and the completion oracle

<!-- task: red=`pnpm vitest run tests/help/captureEvidence.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:117` why=`captureAll records nothing about the run that produced the bytes` ac=AC-2,AC-5,AC-6 -->

Build the record per spec §5 first, because every later refusal writes into it. Includes `pixelSha256`
over decoded RGB, and the staging directory the AC-2 oracle reads.

**The oracle reads the directory, not an event — and the r2 draft said both.** An earlier revision of this
task introduced per-`(entry.key, theme)` completion events and a later revision replaced them with
fresh-directory artifacts without deleting the first, leaving the task contradicting itself inside one
body. Deleted rather than reconciled: there are no completion events. The identity set is derived from the
contents of a staging directory created empty at the start of the run.

**Failure modes this catches.** Hashing the PNG **container** instead of decoded pixels: identical pixels
re-encoded at two compression levels give different container hashes (probed, 2337672 against 156312
bytes), so a container hash reports a render change whenever only encoding moved and collapses three rows
of spec §6. The test re-encodes a committed baseline at two levels and asserts `pixelSha256` holds where a
container hash would not — asserting the two hash kinds behave differently, not extracting both from one
path.

**The hash assertion must name an independent value.** Asserting only that the two encodings agree and
that both differ from the container hashes is satisfied by a CONSTANT — every relation holds and nothing is
computed. The test compares `pixelSha256` against an independently derived SHA-256 of the decoded RGB
buffer, obtained without calling the implementation under test.

And the AC-2 oracle, which spec §9 makes structural rather than assertional: the identity set is derived
from the contents of an output directory **created empty at the start of the run**, never from anything the
capture loop reports about itself. An emitted event can be pre-emitted for every identity while one image
is written; a file in a directory that began empty cannot.

**The expected set is DERIVED from the manifest, never the literal fourteen.** The test computes it as
`MANIFEST` crossed with `themesFor(entry)` — the same derivation the capture uses — so adding a manifest
entry moves the expectation automatically. A hardcoded fourteen would pass unchanged the day someone adds
an eighth entry and the capture silently skips it. (Fourteen is what that derivation yields today; the
figure appears in this plan only as a measurement, never as the assertion.)

## Task 2 — the fault detector, as its own importable module

<!-- task: red=`pnpm vitest run tests/help/renderFaultDetector.test.ts` red-state=authored red-target=`scripts/capture-core.ts:96` why=`quiescence gates paint only, so nothing reports a marked node` ac=AC-1,AC-7 -->

`detectRenderFaults(page, rootSelector?)` in a NEW module at **scripts/capture-render-fault.ts** (a file this task creates) — named
here, not left to the implementer, because the path determines whether the drift job fires on changes to it
(see Task 7's path-filter enrolment). Not appended to `scripts/capture-core.ts`.

**The red cycle is test-first, in four observed steps.** Write the test; observe it fail on module
resolution; add the minimal stub returning `[]`; observe it now fail on the ASSERTION. The stub is not
production work done ahead of the test — it is the minimum that makes the red mean what this task claims,
and it is authored after the test exists and is seen failing. Skipping straight to a resolution failure
would satisfy "the test is red" while going green the moment any file appeared at that path, which is the
tautology the red-contract exists to prevent.
Mutation operators are file-wide, so enrolling `capture-core.ts` would drag `installDeterminism`,
`disableAnimations`, `waitForQuiescence` and `encodeWebp` into the mutant population (Task 8).

**Failure modes this catches.** A detector scoped to the document rather than the captured subtree fires on
chrome outside the capture; one scoped too narrowly misses the card. Both directions asserted against
fixture HTML.

`data-degraded="false"` must NOT match (AC-7) — it is a live product state at
`components/crew/RightNowHero.tsx:472` and a presence selector on the wrong attribute would refuse a
healthy `crew-preview-today-mobile` capture on every run.

**`rootSelector === undefined` is its own asserted case.** `captureSelector` is optional
(`scripts/help-screenshots.manifest.ts:18`) and the capture falls back to the full page
(`scripts/help-screenshots.ts:80`). An implementation that treats undefined as "empty root" (finds
nothing, silently passes) or throws would satisfy every other listed case. The test pins it to the
document.

Guard conditions per spec §4.5: empty attribute value reports `(unspecified)`; a root selector that is
PRESENT but matches nothing throws, because "no root" and "clean root" must never be one answer — distinct
from the undefined case above, which is legitimate.

## Task 3 — layer 0, the selector-absent path

<!-- task: red=`pnpm vitest run tests/help/captureSelectorAbsent.test.ts` red-state=authored red-target=`scripts/capture-core.ts:100` why=`a missing captureSelector propagates as a bare timeout that names nothing` ac=AC-1,AC-5 -->

Catch the `waitFor` timeout; scan the DOCUMENT (not the absent subtree); write the evidence entry with
`refusedReason: "selector-absent"`, the missing selector and every marker found; throw naming all of it.

**Failure mode this catches:** spec §4.2.1's replacement class. `preview-as-crew-banner` waits for
`admin-preview-banner` while either lookup failure returns `admin-preview-infra-error` or
`admin-preview-crew-infra-error`; the admin-layout branch can blank all 14. Detection placed after
`waitForQuiescence` never runs, and Playwright times out first without entry key, theme or reason.

**`waitFor` precedence opens a second path to the same outcome, and the timeout catch does not cover it.**
`ManifestEntry` permits `waitFor` and `captureSelector` independently, and quiescence resolves
`entry.waitFor ?? entry.captureSelector ?? "body"` (`scripts/help-screenshots.ts:103`). One ordinary
manifest edit — `waitFor: "body"` on an entry whose `captureSelector` is a page-specific testid — makes
quiescence SUCCEED under the very replacement fault this task exists for, because `body` is present while
the capture selector is not. The timeout never fires, so a catch around the wait writes nothing, and the
absence surfaces later as Task 2's present-but-unmatched-root throw with no `selector-absent` record.

So layer 0 has TWO triggers, and both write the same record: the quiescence timeout, and the capture
selector resolving to nothing at screenshot time. The second is asserted explicitly with a fixture where
`waitFor` differs from `captureSelector` and only the latter is missing — the case every stated test would
otherwise pass while AC-1 fails.

**The assertion that discriminates:** an evidence entry EXISTS with `refusedReason: "selector-absent"` when
the selector never appears, **through either trigger**. A test asserting only that the capture throws passes against the unrepaired
code, which already threw.

**And a second assertion, because the obvious implementation over-claims.** `waitForQuiescence` can also
fail at `networkidle` (`scripts/capture-core.ts:101`), and at the `page.evaluate` and stable-wait steps
below it in the same function. An implementation that catches the whole rejection and always records `selector-absent` passes
the first assertion while mislabelling every later failure — attributing a network fault to a missing
selector. So the test drives a failure at each later stage and asserts the reason is NOT
`selector-absent`. The catch is narrowed to the selector wait, not wrapped around the function.

## Task 4 — mark the branches, and prove the population is derived

<!-- task: red=`pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` red-state=authored red-target=`components/admin/RecentAutoAppliedStrip.tsx:726` why=`the degradation branch carries no structural marker` ac=AC-3,AC-4,AC-8 -->

AST meta-test mirroring `discoverScanRoots()` (`tests/help/_metaServerTimeGuard.test.ts:11`): derive roots
from the manifest, classify every consumer, demand `data-render-fault` on every JSX-returning fault branch,
skip non-rendering forms with a recorded reason, and report the flag-shaped residue by name. Then add the
attribute to the 21 branches it names.

**Failure mode (a): a branch added later with no attribute** — proven by a mutant removing one.

**Failure mode (b): the population frozen into a snapshot.** The r1 draft's mutant was VACUOUS and the
probe proves it: all seven live routes share the first segment `/admin`, so a quote-only parser and a
complete parser both derive `["app/admin", "components"]`, and adding another entry under the same admin segment, plain
string or template literal, changes neither population. The mutant must introduce a **distinct root**: a
template-literal route under the crew show segment, which a quote-only parser cannot see and which therefore fails to
add `app/show`. The test additionally asserts the parsed **route set** itself, not merely the derived
roots, so the parser is pinned even when two routes happen to share a segment.

**Both mutants are required, and the r1 repair wrongly dropped the plain-string one.** A parser that
freezes the three currently-quoted routes while parsing template literals generically passes the route-set
assertion AND the distinct-template mutant — measured: current expected 7 against bad 7, distinct-template
expected 8 against bad 8, distinct-plain expected 8 against bad 7. Only the plain-string mutant separates
that implementation. The template mutant catches a quote-only parser, the plain mutant catches a
frozen-quoted-set parser, and each is blind to the other's target.

**Failure mode (c): an unknown guard form silently discarded.** The accept-set covers six forms — literal
comparison; a call to an `infra_error` type-guard predicate resolved through its DECLARATION wherever that
declaration lives, **local or imported**; `"kind" in result`; a `catch` clause whose `try` reaches a
throwing loader; `tileErrors` population; and a `switch` case on `result.kind`
(`app/show/[slug]/[shareToken]/page.tsx:220`, one manifest entry under the crew show segment away).

**Both predicate variants are live, and only one is marked.** Local: `components/admin/Dashboard.tsx:282`
defines the predicate, `components/admin/Dashboard.tsx:491` calls it. Imported:
`app/admin/_finalizeCheckpoint.ts:38` defines `isInfraError`, and `app/admin/page.tsx:177` calls it to guard
a JSX return that replaces the dashboard — that one is marked. A third use,
`app/admin/layout.tsx:135`, calls the same imported predicate but ASSIGNS a flag (`inOnboarding`) and
returns no JSX from that branch, so it belongs to the flag-shaped residue, not the marked population.
Resolution is by declaration and the marking decision is by whether the branch returns JSX; the three sites
differ on both axes, which is why neither a name-keyed scan nor a call-site-keyed one gets this right.

A seventh form
must be **reported by name**. This is the accept-set discipline's own test: a recognizer that enumerates
known forms is a denylist.

**One fixture proves that fixture, not the boundary.** The assertion is over a declared CANDIDATE UNIVERSE
— every JSX-returning branch the scan locates by structure alone, independent of guard form — and requires
each member to be either accepted under one of the six named forms or reported by name. A scanner that
special-cases the single chosen fixture satisfies a one-fixture test and still drops the next unknown
construct; it cannot satisfy a partition assertion over a derived universe.

## Task 5 — the capture refuses, before it writes

<!-- task: red=`pnpm vitest run tests/help/captureRefusal.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:107` why=`the screenshot is taken with no check that the render succeeded` ac=AC-1 -->

Wire the detector between `waitForQuiescence` and `screenshotPng` (`scripts/help-screenshots.ts:107`). On a hit, throw naming entry key, theme
and every reason.

**Failure mode this catches:** placing the check after `encodeWebp`/`writeFile` still overwrites the
baseline before failing. The test asserts the output file is **not written**, not merely that the function
throws. It also asserts the evidence entry IS written — that contract is owned by Task 1 and consumed here.

**Marking now precedes this task, and the ordering is load-bearing.** Spec AC-1 requires the proof to run
through an INJECTED LOADER FAILURE rather than hand-authored marked HTML, so the real branch executes and
the real component renders. That chain only closes once the branch carries `data-render-fault`, which is
Task 4's output. With marking after this task, the injected-failure test could not go green, and a
synthetic marked fixture would prove the wiring while skipping the causal chain the AC names. So: mark,
then refuse.

## Task 6 — the geometry layer

<!-- task: red=`pnpm vitest run tests/help/captureGeometry.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:108` why=`a layout-changing fault is encoded with no dimension check` ac=AC-1 -->

Compare captured dimensions against the committed baseline's via `sharp().metadata()` before encoding.
Mismatch throws naming both. A missing baseline records a skip reason into the Task 1 record.

**Failure mode this catches:** layer 1 reaches only branches that return JSX, leaving flag-shaped faults
(spec §4.2 shape 4) able to move layout silently. Asserted to fire on 320x164-against-320x291 — occurrence
A's real dimensions — and NOT to fire when dimensions match but bytes differ, which is occurrence B and
explicitly not this layer's job.

## Task 7 — workflow, plus an executable check on the artifact

<!-- task: red=`pnpm vitest run tests/cross-cutting/ci-workflow-speedup.test.ts` red-state=authored red-target=`.github/workflows/screenshots-drift.yml:113` why=`only CI is forwarded, so neither runner identity nor the trigger can reach the capture` ac=AC-5 -->

Workflow edits join the existing `screenshots-drift` describe block at
`tests/cross-cutting/ci-workflow-speedup.test.ts:84`.

**Both new scripts must join the job's own `pull_request.paths` allow-list**, and this is a correctness
requirement rather than tidiness. Probed: the parser path scripts/verify-capture-evidence.ts matches none of the six
`scripts/` patterns currently listed (`.github/workflows/screenshots-drift.yml:35` and the five entries
below it), and scripts/capture-render-fault.ts would not either. Without the entries, a later PR that edits only the
detector or only the parser changes what the gate DOES while the gate never runs — which is precisely the
defect the workflow's own comment records against `public/fonts/**`, a render input that silently fell out
of this filter when a file moved. The allow-list additions are asserted by name in the same describe block,
so a third instrument added later fails the test rather than going dark.

**Failure mode this catches:** the capture runs inside `docker run` forwarding only `-e CI=true`, so
neither the three runner variables nor `GITHUB_EVENT_NAME` reaches the process writing the record — the
instrument would record those four fields empty forever, spec §6's rasterization-variance and encoder rows
could never fire, and its cross-trigger row could never fire either. All four are asserted by name,
distinguishing `-e VAR` (forwards) from `-e VAR=value` (sets a literal).

**`GITHUB_EVENT_NAME` is the one whose absence would be silent in a second way.** An empty runner field is
visibly empty and a parser can reject it, which is what the clean-run branch below does. An absent trigger
is worse than empty: two records that never carried the field look comparable, and spec §7 measured the
consequence — nine non-reproducing probes read as evidence about a population they were never drawn from.
So the parser treats `eventName` exactly like a runner field on a CI run, required and non-empty.

**AC-5 needs an assertion that can fail, not an observation.** A green workflow proves only that the steps
exited zero; it says nothing about the artifact's schema or values. So the job gains a parser step, and
three things about it are load-bearing:

1. **`if: always()`.** The capture step uses the default success condition, so a marked-fault refusal fails
   it and every ordinary later step is skipped — including the parser, exactly when a refusal is what the
   record needs to describe. Changing only the upload condition does not fix this.
2. **Checks keyed to the run's OUTCOME, not to a fixed shape.** Two traps here, pulling opposite ways.
   A null-heavy record — every entry present, runner fields set, all post-encode fields null — satisfies
   "no short record, no empty runner, no non-null-on-refused" (measured: `records=14 encoded=0`, all three
   predicates green). But demanding a full-length record is equally wrong: the capture ABORTS on the first
   refusal, so a legitimate refusal produces a short record by design, and a parser rejecting it would fail
   every genuine refusal. So the parser branches on outcome: on a **clean** run the identity set must equal
   the manifest-derived expectation with no duplicates, every entry must carry pre- and post-encode fields,
   and each hash must match the artifact in the staging directory; on a **refused** run the record must end
   with exactly one refused entry carrying a `refusedReason`, every earlier entry complete, and none after
   it.
3. **A named local invocation that can actually satisfy its own checks.** The runner fields come from
   `RUNNER_*` and the trigger from `GITHUB_EVENT_NAME`, all four of which exist on a GitHub runner and not
   on a developer machine, so a local run asserting them non-empty fails by construction. The parser takes
   a `--local` mode that treats those four as not-applicable and asserts everything else; CI runs it
   without the flag, where all four are required. The verification section names the exact command.
   `--local` must not be reachable from the workflow — a mode that waives four fields is a mode that
   silently satisfies AC-5, so the workflow assertion names the flagless invocation.

Upload moves to `if: always()`. The record is gitignored — required, or the instrument reds the gate's own
untracked check.

## Task 8 — mutation enrolment, BEFORE the whole-diff review

<!-- task: red=`pnpm vitest run tests/mutation/source/registryMembership.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:151` why=`enrolment is opt-in, so an unenrolled surface is silently untouched by the harness` ac=AC-9 -->

The round-1 diff brief is gated on a `GUARD SURFACE:` line carrying `MUTATION SCORE: <killed>/<total>` plus
zero unaccepted survivors, and `scripts/codex-guard.mjs` exits 2 before dispatching without it. Enrolment is
therefore a blocker on the first diff review, not a close-out chore.

**Why the red is a membership assertion and not the harness itself.** Enrolment is opt-in and a surface
absent from the registry is "untouched by the harness" (`tests/mutation/source/registry.ts:8`), so
`pnpm mutation:guards` has no reason to fail before the row exists and may pass immediately after it. A
command that is green on both sides of the change is not a red. The red is an assertion that the detector
module IS a registered surface, which fails by construction until the row lands.

Add the registry row to `GUARD_SURFACES` (`tests/mutation/source/registry.ts:151`), shaped per the
`GuardSurface` type at `tests/mutation/source/registry.ts:12`, run the harness, record the score and the
unaccepted-survivor set.

**The `operators` subset is enumerated in the row, not defaulted.** The field is required by the type, and
the mutation-family rule is that the operator family is CLOSED and hand-enumerated rather than a generic
recognizer — each widening of a recognizer is a bigger target for the next round. The detector's subset is
chosen from `OPERATOR_NAMES` by what can actually reach its logic: the attribute-selector string, the
subtree-versus-document branch, the empty-value branch, and the undefined-root branch. Operators that
cannot reach any site in the module are omitted deliberately and the omission is stated in the row's
`accepted` rationale rather than left to inference. Two shape constraints must already hold: the detector is its own importable module
(Task 2), and its suite genuinely IMPORTS it — a source-scanning suite is not an import, the overlay would
not apply, and a dead overlay reports a PERFECT score with every other gate condition passing. The `control`
field is the per-surface proof the overlay is live.

`pnpm mutation:guards` is a heavy phase and wraps at its outermost entry.

<!-- tasks: end -->

## Task 9 — ledger, peers, and the invariant-8 gate

Outside the red-contract region: the marker grammar requires `red-state=authored` to name a production
surface by full path, `BACKLOG.md` is root-level and rejected as bare-filename shorthand, and no production
file's defect this task repairs.

Archive `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM` with the refutation and its evidence. Rewrite
`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` per spec §7. Correct the one-class assertion on **both**
rows. File both spec §8 peers with their named class-sweep exceptions.

**Run the invariant-8 dual gate on the affected diff**, in full, with the canonical v3 setup gates rather
than the commands alone:

1. The skill's context load step, which reads `PRODUCT.md` and `DESIGN.md`.
2. The register reference read (the brand or product register file the skill names).
3. The critique-then-audit pair, by their skill command names, on the affected diff.
4. Findings and dispositions recorded in a **`## 12`** section of this plan — this is a flat plan, so the
   marker and the dispositions live in an in-plan `## 12` section rather than a handoff doc or a
   stem-named closeout sibling.
5. The `impeccable-gate:` marker line with the real counts, added in the same commit as the gate run —
   see the note at the top of this plan for why the marker and the gate declaration land together here
   rather than earlier.

P0 and P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry. Both in-progress markers come off in the branch's LAST commit, before the merge, per invariant 12.

---

## Acceptance criteria

Every id below is claimed by a task marker above.

- **AC-1** A capture rendering a marked fault throws, names entry key, theme and reason, writes **no image
  bytes**, and still writes the evidence entry. Holds for the replacement class too: with the selector
  absent the run produces an attributed `selector-absent` refusal, never a bare timeout.
- **AC-2** A healthy capture is byte-identical to today's output **and the set of completion identities
  produced by this run into a directory that began empty equals the manifest-derived expectation** —
  `MANIFEST` crossed with `themesFor(entry)`, computed by the test rather than written down. Identity
  equality over provably-new artifacts, not a count and not a literal.
- **AC-3** The meta-test fails when a manifest-reachable JSX-returning fault branch lacks the attribute.
- **AC-4** The population is derived from the manifest, proven by a mutant introducing a **distinct root**
  via a template-literal route, plus an assertion on the parsed route set itself.
- **AC-5** The record is written and uploaded on both outcomes, and a CI step parses it **branching on the
  run's outcome**: on a clean run it fails on a record short of the manifest-derived expectation, a missing
  pre- or post-encode field, an empty runner field, an empty `eventName`, or a hash not matching the
  staging artifact; on a
  refused run it requires the record to end with exactly one refused entry carrying a reason, every earlier
  entry complete and none after it. **It must NOT reject a short record unconditionally** — the capture
  aborts on the first refusal, so a short record is the correct shape for a genuine refusal, and an
  always-reject-short parser would fail every one of them while satisfying a carelessly worded AC.
  **Proven across the outcome-by-trigger matrix in the verification section**, not on the PR run alone: an
  `eventName` that is correct only for `pull_request` passes every other check this AC states.
- **AC-6** `pixelSha256` is computed over decoded RGB, not the PNG container.
- **AC-7** `data-degraded` does not trigger a refusal.
- **AC-8** A guard form outside the accept-set is reported by name rather than discarded.
- **AC-9** The detector module is enrolled with a recorded score and an empty unaccepted-survivor set, or a
  `CANNOT-EXPRESS` citation naming the probe that shows the registry cannot express it.

## Anti-tautology notes

- **Task 1** derives its identity set from a directory that began empty, because every property of the
  BYTES is satisfiable by the baselines already on disk — a count, a length, a hash, a read-back. Three
  rounds were spent learning that; the spec states it as the standing measure.
- **Task 1** also derives the expected set from the manifest rather than writing the literal count, so an
  added entry moves the expectation instead of passing unchanged.
- **Task 2** asserts the undefined-root case explicitly, since `captureSelector` is optional and an
  implementation treating undefined as an empty root finds nothing and passes silently.
- **Task 3** asserts the evidence entry EXISTS, because asserting only that the capture throws passes
  against unrepaired code that already threw — and separately asserts later quiescence failures are NOT
  labelled `selector-absent`, since a catch around the whole function would mislabel every one of them.
- **Task 4**'s route mutants must move the derived root SET, and BOTH are needed: the template mutant
  catches a quote-only parser, the plain mutant catches a frozen-quoted-set parser, and each is blind to
  the other's target. A same-segment mutant is vacuous against the exact defect it targets — measured.
- **Task 4(c)** asserts an unknown form is reported, over a derived candidate universe rather than one
  fixture. This is the only assertion that distinguishes an accept-set from a denylist.
- **Task 5** asserts **no image written**, not merely that a throw occurred.
- **Task 6** asserts the geometry layer does NOT fire on occurrence B's shape. A layer that fires on
  everything discriminates nothing.
- **Task 7**'s parser must reject a record that is well-formed but describes a run that did not happen,
  and must itself run on the refusal path where the record matters most.
- **AC-2 is the whole-class check** — it catches a gate that passes because it stopped looking.

## Verification

Local, in order. The capture and the mutation harness are heavy phases and wrap at their outermost entry;
scoped vitest runs stay unwrapped.

```
pnpm vitest run tests/help/ tests/cross-cutting/ci-workflow-speedup.test.ts
pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts
pnpm tsx scripts/verify-capture-evidence.ts --local   # Task 7 parser; --local REQUIRED off a runner
pnpm heavy pnpm mutation:guards                       # Task 8, before the first diff dispatch
```

**AC-2 splits across two environments, and running its byte half locally is a DEFECT.** This host is
Darwin arm64; CI captures inside the pinned `linux/amd64` Playwright image. This arc's own occurrence B is
the proof that the two rasterize differently — identical geometry, identical content, sub-pixel deltas
across every text run — so a local `git diff --exit-code public/help/screenshots/` would report drift that
means nothing about the change under test. That is the byte-comparison environment rule (`AGENTS.md:221`)
applied to this plan's own verification step.

So:

- **The production half of AC-2 runs locally** — the identity set derived from the staging directory,
  which is environment-independent and is the half this arc spent four rounds getting right.
- **The byte-equality half is CI-only**, in the pinned image, where the committed baselines were made.

If a local capture is run anyway for any reason, it MUST be followed by
`git restore public/help/screenshots/` (`AGENTS.md:306`) — host-architecture bytes overwrite the committed
x64-Linux baselines and leave a dirty tree that looks like proposed changes and is not.

**If a local capture IS run, the DB override is load-bearing.** `playwright.screenshots.config.ts:167`
forwards `process.env.TEST_DATABASE_URL` and only falls back to loopback when it is UNSET. This checkout's
`.env.local` points it at the remote validation project, and `pnpm preflight` warns about exactly this.
Without the override the seed writes locally while the captured app reads remotely. The capture is a heavy
phase behind a 2-slot semaphore, so a misconfigured run pays its full queue wait before it can fail:

```
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm heavy pnpm screenshot:help ; git restore public/help/screenshots/
```

The `git restore` is sequenced with `;` and not `&&` so it runs whether or not the capture succeeded — a
failed capture is exactly when dirty baselines are most likely.

### AC-5 is a MATRIX, and the ordinary PR run covers one cell of it

Real CI green is a separate gate from local green. This branch edits
`.github/workflows/screenshots-drift.yml`, which is in that job's own path filter, so the job fires on this
PR and the run is a live capture of the instrument under test.

**That run is one cell.** Spec AC-5 obliges the record on both OUTCOMES and under each TRIGGER this arc can
produce, which is a two-by-two, and the PR run is `pull_request` x passing. Naming only it would let an
ordinary implementation defect finish the task green. The concrete one: `eventName` computed as
`GITHUB_EVENT_NAME === "pull_request" ? GITHUB_EVENT_NAME : ""` satisfies the by-name passthrough
assertion, is waived by `--local`, and passes the PR run while recording an empty field on every dispatch
forever. The same hole exists on the outcome axis — nothing in a green PR run exercises the refusal
branch whose whole purpose is to leave evidence.

| | passing | refused |
| --- | --- | --- |
| `pull_request` | the ordinary PR run | — see the argument below |
| `workflow_dispatch` | observation 1 | observation 2 |

**Observation 1 — dispatch, passing.** The workflow already declares `workflow_dispatch`
(`.github/workflows/screenshots-drift.yml:46`; probed: 46 dispatch runs in its history), so no workflow
edit is needed to reach it. The record rides in the existing artifact, whose name is `drifted-screenshots`
and whose path is `public/help/screenshots/` (`.github/workflows/screenshots-drift.yml:176-177`) — the
same directory the record is written into, which is why Task 7 moves that upload to `if: always()` rather
than adding a second artifact.

```
gh workflow run screenshots-drift.yml --ref fix/screenshots-drift-instrument
gh run download <id> -n drifted-screenshots && jq -r '.eventName' capture-evidence.json
```

The assertion is `eventName == "workflow_dispatch"` on a record produced by a run this branch did not
author specially. That is what the defect above cannot satisfy.

**Observation 2 — refused.** Push a scratch branch carrying ONE temporary commit that forces a refusal on a
captured surface, dispatch the workflow against it, download the artifact, then delete the branch. Nothing
merges and the PR is untouched. The assertions are the refusal shape AC-5 names: the record ends with
exactly one entry carrying a `refusedReason`, its post-encode fields are `null`, every earlier entry is
complete, and `eventName` is still populated — a refusal must not cost the record its identity fields.

**Why three cells and not four, stated rather than skipped.** `eventName` is read once from the
environment and written into the record header; the refusal branch is in the per-entry capture loop and
reads nothing about the trigger. The two axes touch no shared state, so the missing `pull_request` x
refused cell is the product of two independently observed behaviors rather than an untested path. Forcing
it would mean deliberately reddening the PR's own required check, which buys a cell the other three
already imply. If a future change makes the refusal branch read the trigger, this argument lapses and the
fourth cell becomes mandatory — recorded here so the lapse is visible rather than inherited.

## A trap checked and deliberately avoided: no new Playwright spec

Every task's red command is vitest. The `screenshots-help` project matches its spec by literal filename
(`playwright.screenshots.config.ts:26`), so a new spec file dropped into `tests/e2e/` would run NOWHERE and
land as an `UNSEEN` row in `tests/ci/_metaE2eWorkflowCoverage.test.ts`. An implementer reaching for an e2e
spec must widen that `testMatch` in the same commit or the test is dark on arrival.

## 12. Invariant-8 dual gate: findings and dispositions

The gate ran on the UI-surface diff, which is `app/**` (excluding `app/api/**`) plus `components/**` at the
branch's merge-base: seventeen files, fourteen of them a single `data-render-fault` attribute each, three
carrying real markup or prop changes (`components/admin/telemetry/TelemetryOverviewStrip.tsx`,
`app/admin/wizard/preview/[stagedId]/page.tsx`, `components/crew/SectionTileError.tsx`).

Both halves ran with the canonical v3 setup gates ahead of them: the `context.mjs` context load of
`PRODUCT.md` and `DESIGN.md`, then the register reference read. The register is **product**, since this is
admin tooling, so design serves the product rather than being it.

**Naming both halves literally, and why that is not pedantry.** The halves are `/impeccable critique` and
`/impeccable audit`. Earlier drafts of this section called them "the critique-then-audit pair", which reads
identically to a human and is invisible to the guard: `tests/docs/_invariant8Closeout.ts:39-40` matches the
literal strings `impeccable critique` and `impeccable audit`, and a unit naming neither is never folded into
the population that owes a marker line. The paraphrase did not weaken the marker requirement, it removed
one. This plan passed `tests/docs/_metaInvariant8Closeout.test.ts` with no marker at all, which is exactly
the guard-premise failure this repo already has a rule about. Naming the commands is what puts the unit in
scope of its own gate.

### Method

`/impeccable critique` ran dual-agent, the two assessments isolated from each other until synthesis, so the
run is not degraded and carries no degraded banner. Assessment A was the design review; Assessment B ran
the bundled detector and the project's mechanical invariants. `/impeccable audit` ran separately as the
technical half.

Assessment B proved its own detector live before trusting a clean result, which is the point worth copying:
an empty finding list from a detector that never fired is indistinguishable from a clean one. It seeded a
probe file carrying a bounce cubic-bezier, got `PROBE_EXIT=2` and a `bounce-easing` hit back, and confirmed
`.impeccable/config.json` suppresses none of the seventeen targets. Only then is `exit 0, zero findings` a
result rather than a shrug.

### Scores

`critique`: **25/40**. The floor is heuristic 3 (user control), 4 (consistency), 6 (recognition over
recall), 9 (error recovery) and 10 (documentation), and every one of those is about the marking convention
being undocumented at the design layer rather than about anything the diff renders.

`audit`: **19/20, Excellent**. Accessibility, performance, theming and responsive all scored 4/4 for the
same reason: the diff changes no rendered output. Anti-patterns took the single point off.

### P0: none. P1: two, both closed.

**P1-1, `pnpm format:check` failed.** `app/admin/wizard/preview/[stagedId]/page.tsx` carried unparenthesized
JSX returns and off-grid indent, and `tests/mutation/source/registryMembership.test.ts` was also dirty. This
is a required check, so it was a merge blocker sitting in the branch. FIXED. Worth recording that the design
half found it: a formatting gate is not a design finding, but the reviewer ran the command rather than
reading the code and reasoning about it.

**P1-2, the crew-facing terminal failure carries no marker.** Raised as "verify or file", correctly.
VERIFIED, and closed as a documented limit rather than a code change. The manifest routes are `/admin` and
`/admin/needs-attention` only (`scripts/help-screenshots.manifest.ts`), so `scanRoots()` derives
`["app/admin", "components"]` and the guard at `app/show/[slug]/[shareToken]/page.tsx:220` is outside the
scan. The surface cannot be captured at all today, so there is no capture it can make wrong, which puts it
under the ledger filing bar's documented-limit rule rather than in the open queue. The `UNEXERCISED`
declaration now names the asymmetry directly, since a reader comparing `TerminalFailure` against
`SectionTileError` will otherwise read it as an oversight, and states the re-arm trigger: a crew-show
manifest entry brings both into scope.

### P2 and P3: six raised, two fixed, two refuted, four acknowledged

FIXED, in `fd597d8ec`:

- **The fault arm was `default:`.** `AlertSummary` is closed, so `default` meant `infra_error` and nothing
  said so. A later fourth kind would have rendered "Unavailable" and blocked the byte gate without anyone
  classifying it. Now an explicit `case`, with the new `default` a compile-time exhaustiveness check that
  keeps the conservative render and deliberately does not set the fault flag.
- **The hand-marked-flag assertion pinned exact source text**, so a Prettier reflow would have reddened CI
  with no behavior change. Whitespace-normalized. Not hypothetical here: the line-pinned residue registry
  in the same file moved twice during this branch.

REFUTED, recorded so a later round does not re-derive them:

- **`MaterializeCard`'s `partial` and `refused` branches are unmarked while `infra_error` is.** That
  asymmetry is the design. `partial` and `refused` are outcomes the admin is supposed to see; `infra_error`
  is a fault. Marking a designed outcome is the same mistake already rejected in writing at
  `app/admin/wizard/preview/[stagedId]/page.tsx:58-62`, where deriving the marker from `testId` would have
  refused a capture on a healthy empty roster.
- **`let unavailable` allegedly manufactures residue that `const unavailable = summary.kind === "infra_error"`
  would enroll "at zero cost".** It would not. `scanCandidates` (`tests/help/_renderFaultScan.ts:371-395`)
  takes only if-statements whose then branch returns JSX and conditionals whose when-true IS a JSX root.
  `SystemHealthCard` returns `<StatCard>` unconditionally and the ternary yields a string, so the site is
  flag-shaped under either spelling and `FLAG_RESIDUE` is right as written.

ACKNOWLEDGED and deliberately not fixed. All are P2 or P3, which invariant 8 does not require closing, and
all four are one finding wearing four hats: the marker's PRESENCE semantics are well guarded (meta-test,
detector suite, refusal tests) while its VALUE semantics are ungoverned. The twenty reason strings are free
strings with no union, no uniqueness assertion, and one templated from a free `domain`; `""` type-checks and
degrades to `(unspecified)`; `"staged-preview-decode"` is written twice; and `DESIGN.md` does not mention the
attribute. A value grammar plus a uniqueness meta-test is the right repair and it is a redesign of the marker
surface this diff does not otherwise touch, which is class-sweep exception (c). Worst case today is a
refusal whose diagnostic string is less useful than it could be, never a capture that is silently wrong, so
the consequence bound holds.

Two findings are pre-existing and not charged to this diff: `components/admin/OnboardingWizard.tsx:39` has an
unused `TriggeredReviewItem` (present on `origin/main`; this diff added only an attribute), and
`components/admin/telemetry/EventTimeline.tsx:16-19` uses `bg-warning-bg` without `text-warning-text` unlike
its three siblings. The audit computed the inherited contrast at 15.6:1 light and 10.6:1 dark, so that one is
a consistency point and not a contrast defect.

The end-to-end refusal of a real capture on a marked branch is **not verified by this gate** and cannot be:
it needs a browser and a seeded database, and the heavy-phase semaphore was saturated. AC-5's CI cells cover
it.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded
