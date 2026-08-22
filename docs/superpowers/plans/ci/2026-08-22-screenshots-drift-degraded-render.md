# Plan — screenshots-drift: refuse to encode a faulted render, and instrument both outcomes

**Status:** DRAFT (r1 repaired) · **Spec:** `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md` · **Branch:** `fix/screenshots-drift-instrument`

Closes `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM`. Re-dispositions
`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — mechanism named, distinct class, stays OPEN.

impeccable-gate: PENDING

**This IS a UI surface and the r1 draft wrongly waived the gate.** Task 6 adds `data-render-fault` to
branches under `components/**` and `app/**`, and AGENTS.md invariant 8 defines either path as a UI surface
**regardless of visual impact** — there is no "it only adds an attribute" exemption, and reading one into
the invariant is how a gate quietly stops applying. The dual gate runs at close-out and the marker above is
replaced with real counts before the PR merges.

---

## Pre-draft code verification

| claim | anchor | verified |
| --- | --- | --- |
| capture loops manifest x theme, fresh context each | `scripts/help-screenshots.ts:116`, `scripts/help-screenshots.ts:133` | yes |
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
| mutation registry row shape | `tests/mutation/source/registry.ts:12` | yes |

**Measured, not assumed.** The widened accept-set (six guard forms) matches **21** JSX-returning fault
branches across `components/**` + `app/admin/**`, reached via three detectable constructs: literal
comparison, `"kind" in x`, and `catch`. The r1 draft said 15, which counted only literal comparisons. The
figure is a floor measured at authoring time; Task 6's meta-test derives it each run.

**Probed, not read.** Four facts measured rather than inferred, each of which would otherwise be a bug:

1. An untracked file under `public/help/screenshots/` fails the gate's own untracked check; ignoring it
   suppresses the listing. Both directions run on this tree.
2. A transactional `REVOKE` reproduces a real read failure (`permission denied for table
   show_change_log`) and rolls back, so no concurrent arc is disturbed.
3. `loadRecentAutoApplied` accepts `deps.supabase`, so a failing stub drives the real loader error path.
4. **All seven manifest routes share the first path segment `/admin`.** A quote-only route parser and a
   complete one therefore derive IDENTICAL roots — `["app/admin", "components"]` either way. This is why
   Task 6's route mutant must introduce a DISTINCT root; see that task.

---

## Task ordering, and why the r1 draft could not satisfy TDD

The r1 draft asserted in Task 2 that an evidence record is written on refusal, and in the geometry task
that a missing baseline records a skip reason — while the task that CREATES the record came later. Neither
test could go green after its own implementation. The evidence record is a precondition for every refusal
assertion, so it is built first and everything that refuses writes into it.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the evidence record, and the completion oracle

<!-- task: red=`pnpm vitest run tests/help/captureEvidence.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:116` why=`captureAll records nothing about the run that produced the bytes` ac=AC-2,AC-5,AC-6 -->

Build the record per spec §5 first, because every later refusal writes into it. Includes the per-`(entry.key, theme)`
completion event the AC-2 oracle reads, and `pixelSha256` over decoded RGB.

**Failure modes this catches.** Hashing the PNG **container** instead of decoded pixels: identical pixels
re-encoded at two compression levels give different container hashes (probed, 2337672 against 156312
bytes), so a container hash reports a render change whenever only encoding moved and collapses three rows
of spec §6. The test re-encodes a committed baseline at two levels and asserts `pixelSha256` holds where a
container hash would not — asserting the two hash kinds behave differently, not extracting both from one
path.

And the AC-2 oracle: a directory count is vacuous because the fourteen baselines exist before capture and
are overwritten in place, so one entry completed and thirteen skipped still leaves fourteen files and an
empty diff. The oracle is a SET of emitted completion identities asserted equal to the fourteen expected
`(key, theme)` pairs. Identity equality, never cardinality.

## Task 2 — the fault detector, as its own importable module

<!-- task: red=`pnpm vitest run tests/help/renderFaultDetector.test.ts` red-state=authored red-target=`scripts/capture-core.ts:96` why=`quiescence gates paint only, so nothing reports a marked node` ac=AC-1,AC-7 -->

`detectRenderFaults(page, rootSelector?)` in a NEW module, not appended to `scripts/capture-core.ts`.
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

**The assertion that discriminates:** an evidence entry EXISTS with `refusedReason: "selector-absent"` when
the selector never appears. A test asserting only that the capture throws passes against the unrepaired
code, which already threw.

## Task 4 — the capture refuses, before it writes

<!-- task: red=`pnpm vitest run tests/help/captureRefusal.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:104` why=`the screenshot is taken with no check that the render succeeded` ac=AC-1 -->

Wire the detector between `waitForQuiescence` and `screenshotPng`. On a hit, throw naming entry key, theme
and every reason.

**Failure mode this catches:** placing the check after `encodeWebp`/`writeFile` still overwrites the
baseline before failing. The test asserts the output file is **not written**, not merely that the function
throws. It also asserts the evidence entry IS written — that contract is owned by Task 1 and consumed here,
so the assertion is legal in this order.

## Task 5 — the geometry layer

<!-- task: red=`pnpm vitest run tests/help/captureGeometry.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:104` why=`a layout-changing fault is encoded with no dimension check` ac=AC-1 -->

Compare captured dimensions against the committed baseline's via `sharp().metadata()` before encoding.
Mismatch throws naming both. A missing baseline records a skip reason into the Task 1 record.

**Failure mode this catches:** layer 1 reaches only branches that return JSX, leaving flag-shaped faults
(spec §4.2 shape 4) able to move layout silently. Asserted to fire on 320x164-against-320x291 — occurrence
A's real dimensions — and NOT to fire when dimensions match but bytes differ, which is occurrence B and
explicitly not this layer's job.

## Task 6 — mark the branches, and prove the population is derived

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

**Failure mode (c): an unknown guard form silently discarded.** The accept-set covers six forms — literal
comparison; a call to a locally-defined `infra_error` predicate resolved through its declaration
(`components/admin/Dashboard.tsx:282` defines one, `components/admin/Dashboard.tsx:491` calls it, and a
comparison-only scan misses it); `"kind" in result`; a `catch` clause whose `try` reaches a throwing
loader; `tileErrors` population; and a `switch` case on `result.kind`
(`app/show/[slug]/[shareToken]/page.tsx:220`, one manifest entry under the crew show segment away). A seventh form
must be **reported by name**, and that is asserted directly with a fixture carrying a construct outside all
six — otherwise a scanner can discard the unknown and still satisfy (a) and (b). This is the accept-set
discipline's own test: a recognizer that enumerates known forms is a denylist.

## Task 7 — workflow, plus an executable check on the artifact

<!-- task: red=`pnpm vitest run tests/cross-cutting/ci-workflow-speedup.test.ts` red-state=authored red-target=`.github/workflows/screenshots-drift.yml:113` why=`only CI is forwarded, so runner identity cannot reach the capture` ac=AC-5 -->

Workflow edits join the existing `screenshots-drift` describe block at
`tests/cross-cutting/ci-workflow-speedup.test.ts:84`.

**Failure mode this catches:** the capture runs inside `docker run` forwarding only `-e CI=true`, so the
three runner variables never reach the process writing the record — the instrument would record empty
runner fields forever and spec §6 rows 3 and 5 could never fire. Asserted by name, distinguishing `-e VAR`
(forwards) from `-e VAR=value` (sets a literal).

**AC-5 needs an assertion that can fail, not an observation.** A green workflow proves only that the steps
exited zero; it says nothing about the artifact's schema or values. So the job gains a step that parses the
written capture-evidence record and fails on: fewer than the expected applicable entry records, any empty
runner field, or a post-encode field non-null on a refused entry. That step runs in CI and locally, so
AC-5 is proven by a command rather than by a green tick.

Upload moves to `if: always()`. The record is gitignored — required, or the instrument reds the gate's own
untracked check.

## Task 8 — mutation enrolment, BEFORE the whole-diff review

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:12` why=`the detector module is not enrolled, so no score exists for the diff brief` ac=AC-9 -->

The round-1 diff brief is gated on a `GUARD SURFACE:` line carrying `MUTATION SCORE: <killed>/<total>` plus
zero unaccepted survivors, and `scripts/codex-guard.mjs` exits 2 before dispatching without it. Enrolment is
therefore a blocker on the first diff review, not a close-out chore.

Add the registry row per `tests/mutation/source/registry.ts:12`, run the harness, record the score and the
unaccepted-survivor set. Two shape constraints must already hold: the detector is its own importable module
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

Run `/impeccable critique` and `/impeccable audit` on the affected diff, record findings and dispositions,
and replace this plan's `impeccable-gate: PENDING` with the real counts. Both in-progress markers come off
in the branch's LAST commit, before the merge, per invariant 12.

---

## Acceptance criteria

Every id below is claimed by a task marker above.

- **AC-1** A capture rendering a marked fault throws, names entry key, theme and reason, writes **no image
  bytes**, and still writes the evidence entry. Holds for the replacement class too: with the selector
  absent the run produces an attributed `selector-absent` refusal, never a bare timeout.
- **AC-2** A healthy capture is byte-identical to today's output **and the set of completion identities
  emitted by this run equals the fourteen expected `(key, theme)` pairs**. Identity equality, not a count.
- **AC-3** The meta-test fails when a manifest-reachable JSX-returning fault branch lacks the attribute.
- **AC-4** The population is derived from the manifest, proven by a mutant introducing a **distinct root**
  via a template-literal route, plus an assertion on the parsed route set itself.
- **AC-5** The record is written and uploaded on both outcomes, and a CI step parses it and fails on a short
  record, an empty runner field, or a post-encode field non-null on a refused entry.
- **AC-6** `pixelSha256` is computed over decoded RGB, not the PNG container.
- **AC-7** `data-degraded` does not trigger a refusal.
- **AC-8** A guard form outside the accept-set is reported by name rather than discarded.
- **AC-9** The detector module is enrolled with a recorded score and an empty unaccepted-survivor set, or a
  `CANNOT-EXPRESS` citation naming the probe that shows the registry cannot express it.

## Anti-tautology notes

- Task 1's oracle is identity equality, because cardinality is satisfiable by the fourteen files already
  on disk before capture starts.
- Task 3's assertion is that the evidence entry EXISTS, because asserting only that the capture throws
  passes against unrepaired code that already threw.
- Task 4 asserts **no image written**, not merely that a throw occurred.
- Task 5 asserts the geometry layer does NOT fire on occurrence B's shape. A layer that fires on everything
  discriminates nothing.
- Task 6's route mutant must move the derived root SET. A same-segment mutant is vacuous against the exact
  parser defect it targets — measured, not supposed.
- Task 6(c) asserts an unknown form is reported, which is the only assertion that distinguishes an
  accept-set from a denylist.
- **AC-2 is the whole-class check** — it catches a gate that passes because it stopped looking.

## Verification

Local, in order. The capture and the mutation harness are heavy phases and wrap at their outermost entry;
scoped vitest runs stay unwrapped.

```
pnpm vitest run tests/help/ tests/cross-cutting/ci-workflow-speedup.test.ts
pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts

# AC-2. The TEST_DATABASE_URL override is REQUIRED, not optional - see below.
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm heavy pnpm screenshot:help && git diff --exit-code public/help/screenshots/

pnpm heavy pnpm mutation:guards        # Task 8, before the first diff dispatch
```

**Why the override is load-bearing.** `playwright.screenshots.config.ts:167` forwards
`process.env.TEST_DATABASE_URL` and only falls back to loopback when it is UNSET. This checkout's
`.env.local` points it at the remote validation project, and `pnpm preflight` warns about exactly this.
Without the override the seed writes locally while the captured app reads remotely, so AC-2 fails against
content unrelated to the change. The capture is a heavy phase behind a 2-slot semaphore, so a misconfigured
run pays its full queue wait before it can fail.

Real CI green is a separate gate from local green. This branch edits
`.github/workflows/screenshots-drift.yml`, which is in that job's own path filter, so the job fires on this
PR and the run is a live capture of the instrument under test.

## A trap checked and deliberately avoided: no new Playwright spec

Every task's red command is vitest. The `screenshots-help` project matches its spec by literal filename
(`playwright.screenshots.config.ts:26`), so a new spec file dropped into `tests/e2e/` would run NOWHERE and
land as an `UNSEEN` row in `tests/ci/_metaE2eWorkflowCoverage.test.ts`. An implementer reaching for an e2e
spec must widen that `testMatch` in the same commit or the test is dark on arrival.
