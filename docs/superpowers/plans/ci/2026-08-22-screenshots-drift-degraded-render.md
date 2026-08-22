# Plan — screenshots-drift: refuse to encode a faulted render, and instrument both outcomes

**Status:** DRAFT (matches spec r1-repaired) · **Spec:** `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md` · **Branch:** `fix/screenshots-drift-instrument`

Closes `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM`. Re-dispositions
`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` — mechanism named, distinct class, stays OPEN.

**impeccable-gate: N/A — no UI surface.** The only product-source edit is one `data-render-fault`
attribute on branches that already render (spec §4.6/§4.7: no element added, moved or resized; AC-2
asserts every committed baseline byte is unchanged). Everything else is workflow, scripts, tests and docs.

---

## Pre-draft code verification

Every anchor below was checked against the live tree before drafting.

| claim | anchor | verified |
| --- | --- | --- |
| capture loops manifest x theme, fresh context each | `scripts/help-screenshots.ts:116`, `scripts/help-screenshots.ts:133` | yes |
| per-entry render: goto, quiescence, screenshot | `scripts/help-screenshots.ts:98`, `scripts/help-screenshots.ts:104` | yes |
| quiescence gates paint only | `scripts/capture-core.ts:96` | yes |
| webp encode | `scripts/capture-core.ts:115` | yes |
| animations neutralised pre-navigation | `scripts/capture-core.ts:66` | yes |
| shape-1 degradation branch | `components/admin/RecentAutoAppliedStrip.tsx:726` | yes |
| healthy-empty renders null | `components/admin/RecentAutoAppliedStrip.tsx:756` | yes |
| shape-4 flag consumers | `components/admin/Dashboard.tsx:489`, `components/admin/Dashboard.tsx:491` | yes |
| crew soft-error channel | `lib/data/getShowForViewer.ts:224` | yes |
| `data-degraded` is TAKEN, product state | `components/crew/RightNowHero.tsx:472` | yes |
| and pinned by a test | `tests/components/crew/rightNowHero.test.tsx:311` | yes |
| guard population derivation to mirror | `tests/help/_metaServerTimeGuard.test.ts:11` | yes |
| existing workflow describe block | `tests/cross-cutting/ci-workflow-speedup.test.ts:84` | yes |
| capture step forwards only `-e CI=true` | `.github/workflows/screenshots-drift.yml:113` | yes |
| gate fails on untracked files there | `.github/workflows/screenshots-drift.yml:137` | yes |
| artifact uploads on failure only | `.github/workflows/screenshots-drift.yml:172` | yes |

**Probed, not read.** Three facts were measured rather than inferred, each of which would otherwise have
become an implementation bug:

1. An untracked file under `public/help/screenshots/` IS listed by
   `git ls-files --others --exclude-standard` and fails the gate; adding it to ignore suppresses the
   listing. Both directions run on this tree.
2. A ts-morph scan of the consumer sites returns four structural shapes, only one of which has JSX at the
   comparison (spec §4.2).
3. Four of seven manifest routes are template literals, so a quote-only route parser derives three of
   seven.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — the fault detector

<!-- task: red=`pnpm vitest run tests/help/renderFaultDetector.test.ts` red-state=authored red-target=`scripts/capture-core.ts:96` why=`quiescence gates paint only, so nothing reports a marked node` ac=AC-1,AC-7 -->

Add `detectRenderFaults(page, rootSelector)` to `scripts/capture-core.ts`, returning
`{ testId, reason }[]` for every `[data-render-fault]` inside the captured subtree.

**Failure modes this catches:** a detector scoped to the document rather than the captured subtree fires
on chrome outside the capture and reds every run; one scoped too narrowly misses the card. The test
asserts both directions against fixture HTML. It also asserts `data-degraded="false"` does **not** match
(AC-7) — that attribute is a legitimate product state and a presence selector on the wrong name would
refuse a healthy `crew-preview-today-mobile` capture on every run.

Guard conditions per spec §4.5: empty value reports `(unspecified)`; a root selector matching nothing
throws rather than returning an empty list, because "no root" and "clean root" must never be one answer.

## Task 2 — the capture refuses, before it writes

<!-- task: red=`pnpm vitest run tests/help/captureRefusal.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:104` why=`the screenshot is taken with no check that the render succeeded` ac=AC-1 -->

Wire the detector into `captureEntryTheme` between `waitForQuiescence` and `screenshotPng`. On a hit,
throw naming entry key, theme and every reason.

**Failure mode this catches:** placing the check after `encodeWebp`/`writeFile` still overwrites the
baseline before failing. The test asserts the output file is **not written**, not merely that the function
throws. It separately asserts the evidence record IS still written on a refusal (spec §5) — "writes no
image bytes" and "writes no bytes at all" are different contracts and the second one would delete the
instrument exactly when it is most needed.

### How AC-1 injects a REAL fault, probed two ways

"Injected loader failure, not a mocked component" needs a concrete mechanism, and the obvious ones are
traps. Two probes settled it.

**Probe 1 — what a real failure actually looks like.** Against the local database, inside a transaction so
nothing persists and no concurrent arc is disturbed:

```
BEGIN;
SET LOCAL ROLE service_role;  SELECT count(*) FROM public.show_change_log;   -- 1 row
RESET ROLE;  REVOKE SELECT ON public.show_change_log FROM service_role;
SET LOCAL ROLE service_role;  SELECT count(*) FROM public.show_change_log;
-- ERROR: permission denied for table show_change_log
ROLLBACK;
```

Grant verified intact afterwards. This fixes the error SHAPE the stub must reproduce, so the stub is
faithful rather than invented.

**Probe 2 — the loader is already injectable.** `loadRecentAutoApplied(deps)` takes
`deps.supabase?: SupabaseClient` and only falls back to `createSupabaseServiceRoleClient()` when it is
absent (`lib/admin/loadRecentAutoApplied.ts:136`). So a failing client stub drives the **real** loader
through its **real** error path at `lib/admin/loadRecentAutoApplied.ts:170`, returning a real
`infra_error`, which the **real** component renders through its **real** branch at
`components/admin/RecentAutoAppliedStrip.tsx:726`.

**Why not commit the revoke and run the live capture.** A committed `REVOKE` would inject into the
capture's separate server process, but the local database is shared across concurrently running arcs, so
it would flake whatever else is mid-run. The transactional form proves the shape and cannot leak; the
dependency injection proves the path. Neither requires disturbing the shared database, and between them
nothing about the assertion is mocked except the transport that genuinely failed in production.

## Task 3a — mark shape-1 branches, and enumerate the residue

<!-- task: red=`pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` red-state=authored red-target=`components/admin/RecentAutoAppliedStrip.tsx:726` why=`the degradation branch carries no structural marker` ac=AC-3,AC-4 -->

AST meta-test mirroring `discoverScanRoots()` (`tests/help/_metaServerTimeGuard.test.ts:11`): derive roots
from the manifest, classify every consumer by the four shapes in spec §4.2, demand `data-render-fault` on
shape 1, skip shapes 2 and 3 with a recorded reason, and report shape 4 plus the non-`infra_error` shapes
as a named residue registry. Then add the attribute to the branches it names.

**Failure modes this catches:** (a) a shape-1 branch added later with no attribute, proven by a mutant
removing one; (b) the population freezing into a snapshot, proven by a mutant adding a manifest entry —
**one plain-string route and one template-literal route, because only the second fails a quote-only
parser**, and four of the seven current routes are template literals. Mutant (b) is the one that matters:
without it the meta-test passes identically against a hardcoded list.

The residue registry is asserted non-empty and its rows checked against spec §4.2's table, so shrinking
coverage silently is not possible either.

### Task 3a measured population — a floor, not a census

Ran the classifier over the manifest-derived roots (`components/**` plus `app/admin/**`) before
implementing. Matching `=== "infra_error"` / `!== "infra_error"` only:

| shape | count |
| --- | --- |
| 1, branch returns JSX — enforceable | 15 |
| 2, no JSX in scope | 11 |
| 3, type-guard predicate definition | 1 |
| 4, flag-shaped — residue | 9 |

Shape 1 includes `app/admin/show/[slug]/preview/[crewId]/page.tsx:141` and a second site 32 lines below it, which is the route
four manifest entries capture, so the marking work reaches the crew-preview outputs directly.

**The recognizer is not yet total, and the probe proves it against a known case.**
`components/admin/Dashboard.tsx:491` assigns `dataGapsDegraded` from `isInfra(dataGapsResult)` — a call to
the type-guard defined at `components/admin/Dashboard.tsx:282` — so a comparison-only scan does not see it
at all. That is precisely the consumer that reaches `dashboard-overview` in spec §4.2's table. Two further
shapes are equally invisible to it: `"kind" in result` and `tileErrors` population
(`lib/data/getShowForViewer.ts:224`).

**Consequence for Task 3a.** The accept-set is declared structurally and covers four forms: a literal
comparison; a call to a locally-defined `infra_error` type-guard predicate, resolved through the
predicate's own declaration rather than by name; an `in`-operator narrowing on `"kind"`; and `tileErrors`
population. Everything outside the accept-set is reported by name, never silently dropped — a scan that
enumerates only the forms it already knows is the denylist this project's accept-set discipline forbids.

The table above is therefore a **floor on shape counts, measured at authoring time**, not a census. The
meta-test derives the real numbers each run and asserts the residue registry against them, so these figures
never need updating by hand.

## Task 3b — the geometry layer

<!-- task: red=`pnpm vitest run tests/help/captureGeometry.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:104` why=`a layout-changing fault is encoded with no dimension check` ac=AC-1 -->

Before encoding, compare captured dimensions against the committed baseline's via `sharp().metadata()`.
Mismatch throws naming both. Missing baseline skips with a recorded reason.

**Failure mode this catches:** layer 1 reaches only shape 1, which leaves 10 of the 14 capture outputs able
to fault silently (spec §4.2). Geometry covers any fault that moves layout regardless of shape. The test
asserts it fires on a 320x164-against-320x291 pair — occurrence A's real dimensions — and does NOT fire
when dimensions match but bytes differ, which is occurrence B and explicitly not this layer's job.

## Task 4 — the instrument, on both outcomes

<!-- task: red=`pnpm vitest run tests/help/captureEvidence.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:116` why=`captureAll records nothing about the run that produced the bytes` ac=AC-5,AC-6 -->

Write the evidence record per spec §5.

**Failure mode this catches:** hashing the PNG **container** instead of decoded pixels. Identical pixels
re-encoded at two compression levels produce different container hashes (probed: 2337672 against 156312
bytes, container hashes differ, decoded-pixel hashes equal), so a container hash reports a render change
whenever only encoding moved — collapsing three distinct rows of spec §6 into each other. The test
re-encodes one committed baseline at two compression levels and asserts `pixelSha256` holds where a
container hash would not. The assertion is against the two hash kinds behaving differently, not against
one path computing both.

Post-encode fields are `null` exactly on refused entries; the test asserts that, and that the record is
written on both outcomes.

## Task 5 — workflow: env passthrough, upload always, ignore the record

<!-- task: red=`pnpm vitest run tests/cross-cutting/ci-workflow-speedup.test.ts` red-state=authored red-target=`.github/workflows/screenshots-drift.yml:113` why=`only CI is forwarded, so runner identity cannot reach the capture` ac=AC-5 -->

Three workflow edits plus a `.gitignore` entry. Assertions join the existing `screenshots-drift` describe
block at `tests/cross-cutting/ci-workflow-speedup.test.ts:84` rather than opening a second file for one
workflow's contract.

**Failure mode this catches:** the capture runs inside `docker run` forwarding only `-e CI=true`, so
`RUNNER_NAME`, `RUNNER_ARCH` and `RUNNER_OS` never reach the process writing the record — the instrument
would record empty runner fields on every run and spec §6 rows 3 and 5 could never fire. The test asserts
all three are forwarded by name, and distinguishes `-e VAR` (forwards the host value) from `-e VAR=value`
(sets a literal); both forms appear in the step.

Upload moves from `if: failure()` to `if: always()`. The record is gitignored — a correctness requirement,
not tidiness: without it the instrument reds the gate's own untracked check.

**Expected, not a defect:** `.github/workflows/screenshots-drift.yml` is in its own paths allow-list
(`tests/cross-cutting/ci-workflow-speedup.test.ts:111`) and its cache-key census, so editing it busts that
cache and re-triggers the job on this PR. That is a cold build and a live capture of the instrument under
test — the proof this plan wants, at a price worth naming so nobody reads the cache miss as a regression.

<!-- tasks: end -->

## Task 6 — ledger and peers

Outside the red-contract region deliberately: the marker grammar requires `red-state=authored` to name a
production surface by full path, `BACKLOG.md` is root-level and the classifier rejects it as bare-filename
shorthand, and no production file's defect this task repairs. Verified by
`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`.

Archive `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM` with the refutation and its evidence. Rewrite
`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` per spec §7: mechanism named as rasterization variance,
upgraded to PROBED, distinct class, still OPEN, with §6 row 3 as its reading procedure, this arc's
instrument named as its first scheduled step, and the repair question stated without being opened. Correct
the one-class assertion on **both** rows. File both spec §8 peers with their named class-sweep exceptions
and, for the telemetry-silent loader, this arc's own diagnosis as the incident.

Both in-progress markers come off in this branch's LAST commit, before the merge, per invariant 12.

---

## Acceptance criteria

Mirrors spec §9; these ids are what the task markers reference.

- **AC-1** A capture rendering a marked fault throws, names entry key, theme and reason, writes **no image
  bytes**, and still writes the evidence record. Proven by an injected loader failure.
- **AC-2** A healthy capture is byte-identical to today's output **and every manifest entry and theme was
  produced**. `git diff --exit-code` alone exits 0 when the capture wrote nothing — the green-but-empty
  trap — so a produced-count equal to the manifest's expected output count is asserted first.
- **AC-3** The meta-test fails when a manifest-reachable shape-1 branch lacks the attribute.
- **AC-4** The population is derived from the manifest including template-literal routes.
- **AC-5** The record is written and uploaded on both outcomes, every applicable field populated, runner
  fields non-empty, post-encode fields null exactly on refused entries. Proven on a real dispatched run.
- **AC-6** `pixelSha256` is computed over decoded RGB, not the PNG container.
- **AC-7** `data-degraded` does not trigger a refusal.

## Anti-tautology notes

- Task 2 asserts **no image written**, not merely that a throw occurred, and separately that the record IS
  written — a detector that throws after writing has already destroyed the baseline, and one that writes
  nothing at all destroys the instrument.
- Task 3a's template-literal mutant is what proves the population is derived rather than enumerated. The
  plain-string mutant alone passes against a quote-only parser that is already wrong on four of seven live
  routes.
- Task 3b asserts the geometry layer does NOT fire on occurrence B's shape. A layer that fires on
  everything discriminates nothing.
- Task 4 asserts the two hash kinds behave differently rather than extracting both from one path.
- **AC-2 is the whole-class check** — it catches a gate that passes because it stopped looking, and it runs
  against real captured bytes.

## Verification

Local, in order. The capture is a heavy phase (inner 8192 MB build) and runs under `pnpm heavy` at its
outermost entry; scoped vitest runs stay unwrapped.

```
pnpm vitest run tests/help/ tests/cross-cutting/ci-workflow-speedup.test.ts
pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts

# AC-2. The TEST_DATABASE_URL override is REQUIRED, not optional - see below.
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm heavy pnpm screenshot:help && git diff --exit-code public/help/screenshots/
```

**Why the override is load-bearing.** `playwright.screenshots.config.ts:167` forwards
`process.env.TEST_DATABASE_URL` to the capture web server and only falls back to loopback when it is
UNSET. This checkout's `.env.local` sets it to the remote validation project, and `pnpm preflight` warns
about exactly this ("TEST_DATABASE_URL is NON-LOOPBACK ... local runs that read it will target remote").
Without the override the seed writes the local database while the captured app reads the remote one, so
AC-2 fails against content that has nothing to do with the change under test.

That failure is expensive in a way worth naming: the capture is a heavy phase behind a 2-slot machine-wide
semaphore, so a misconfigured run pays its full queue wait before it can fail. Set the override in the
same command, never as a separate export that a later shell can lose.

Real CI green is a separate gate from local green. This branch edits
`.github/workflows/screenshots-drift.yml`, which is in that job's own path filter, so the job fires on this
PR and the run is a live capture of the instrument under test.
