# Plan — screenshots-drift: refuse to encode a degraded render

**Status:** DRAFT (pending spec APPROVE) · **Spec:** `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md` · **Branch:** `fix/screenshots-drift-instrument`

Closes `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM`; moves `BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` to PROBED-INSTRUMENTED with the trap set.

**impeccable-gate: N/A — no UI surface.** The only product-source edit is a `data-degraded` attribute on
branches that already render (spec §4.4/§4.5: no element added, moved, or resized; AC-2 asserts every
committed baseline byte is unchanged). Everything else is workflow, scripts, tests and docs.

---

## Pre-draft code verification

Every file, symbol and line below was verified against the live tree before drafting.

| claim | anchor | verified |
| --- | --- | --- |
| capture loops manifest x theme, fresh context each | `scripts/help-screenshots.ts:116`, `scripts/help-screenshots.ts:133` | yes |
| per-entry render: goto, then quiescence, then screenshot | `scripts/help-screenshots.ts:94`, `scripts/help-screenshots.ts:98`, `scripts/help-screenshots.ts:104` | yes |
| quiescence gates paint only | `scripts/capture-core.ts:96` | yes |
| webp encode | `scripts/capture-core.ts:115` | yes |
| animations neutralised pre-navigation | `scripts/capture-core.ts:66` | yes |
| degradation branch + testid | `components/admin/RecentAutoAppliedStrip.tsx:746` | yes |
| healthy-empty renders null | `components/admin/RecentAutoAppliedStrip.tsx:756` | yes |
| loader infra_error returns, five of them | `lib/admin/loadRecentAutoApplied.ts:145` (peers at lines 170, 176, 231, 241) | yes |
| strip mounted inside captured `<main>` | `components/admin/Dashboard.tsx:618`, `components/admin/Dashboard.tsx:826` | yes |
| manifest routes all under `/admin` | `scripts/help-screenshots.manifest.ts:51` (six peers through line 113) | yes |
| guard population derivation to mirror | `tests/help/_metaServerTimeGuard.test.ts:11` | yes |
| assertion-spec project runs beside capture | `playwright.screenshots.config.ts:25`, `playwright.screenshots.config.ts:44` | yes |
| capture step passes only `-e CI=true` | `.github/workflows/screenshots-drift.yml:113` | yes |
| artifact uploads on failure only | `.github/workflows/screenshots-drift.yml:172` | yes |

**Probed, not read:** an untracked file under `public/help/screenshots/` IS listed by
`git ls-files --others --exclude-standard` and would fail the gate's own untracked check
(`.github/workflows/screenshots-drift.yml:137`); adding it to ignore suppresses the listing. Both
directions run on this tree. This is why Task 5 gitignores the evidence file, and why that is a
correctness requirement rather than tidiness.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — the detector, red first against a real degraded render

<!-- task: red=`pnpm vitest run tests/help/degradedRenderDetector.test.ts` red-state=authored red-target=`scripts/capture-core.ts:96` why=`quiescence gates paint only, so nothing reports a marked node` ac=AC-1 -->

Add `detectDegradedNodes(page, rootSelector)` to `scripts/capture-core.ts`, returning
`{ testId, reason }[]` for every `[data-degraded]` inside the captured subtree.

**Failure mode this catches:** a detector scoped to the document instead of the captured subtree would
fire on chrome outside the capture and red every run; one scoped too narrowly would miss the card. The
test asserts both directions against fixture HTML — a marked node inside the root is found, an
identically marked node outside it is not.

Guard conditions from spec §4.3: empty attribute value reports `(unspecified)`; a root selector matching
nothing throws rather than returning an empty list, because "no root" and "clean root" must never be the
same answer.

## Task 2 — the capture refuses, and writes nothing

<!-- task: red=`pnpm vitest run tests/help/captureRefusal.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:104` why=`the screenshot is taken with no check that the render succeeded` ac=AC-1 -->

Wire the detector into `captureEntryTheme` between `waitForQuiescence` and `screenshotPng`
(`scripts/help-screenshots.ts:104`). On a hit, throw naming entry key, theme, and every reason.

**Failure mode this catches:** placing the check after `encodeWebp`/`writeFile` would still overwrite
the baseline before failing — the drift would be reported AND the bytes replaced. The test asserts the
output file is not written when the detector fires, not merely that the function throws.

## Task 3 — mark the degradation branches, derived cover

<!-- task: red=`pnpm vitest run tests/help/_metaDegradedRenderMarking.test.ts` red-state=authored red-target=`components/admin/RecentAutoAppliedStrip.tsx:746` why=`the degradation branch carries no structural marker` ac=AC-3,AC-4 -->

Meta-test mirroring `discoverScanRoots()` (`tests/help/_metaServerTimeGuard.test.ts:11`): derive roots
from the manifest, walk them, find every `infra_error` consumer branch, assert each renders an element
carrying `data-degraded`. Then add the attribute to the branches it names.

**Failure modes this catches:** (a) a branch added later with no attribute — proven by a mutant that
removes one; (b) the population silently freezing into a snapshot — proven by a mutant that adds a
manifest entry routing outside `/admin` and asserts the sign-in page's branch becomes enforced.
Mutant (b) is the one that matters: without it the derivation is indistinguishable from a hardcoded list.

Excluded set and both exclusion reasons per spec §4.2 — 22 non-rendering handlers, plus one rendering
page excluded only because no manifest entry captures its route.

## Task 4 — the instrument, on both outcomes

<!-- task: red=`pnpm vitest run tests/help/captureEvidence.test.ts` red-state=authored red-target=`scripts/help-screenshots.ts:116` why=`captureAll records nothing about the run that produced the bytes` ac=AC-5,AC-6 -->

Write the evidence record per spec §5.

**Failure mode this catches:** hashing the WebP twice, or deriving one hash from the other, would make
every recurrence read as a content change and silently delete the encoder-bimodality row from the §6
table. The test fixes the PNG, changes only encoder settings, and asserts `pngSha256` holds while
`webpSha256` moves — the assertion is against the two hashes, not against a container that computes both.

## Task 5 — workflow: env passthrough, upload on both outcomes, ignore the evidence file

<!-- task: red=`pnpm vitest run tests/cross-cutting/screenshotsDriftWorkflow.test.ts` red-state=authored red-target=`.github/workflows/screenshots-drift.yml:113` why=`only CI is forwarded, so runner identity cannot reach the capture` ac=AC-5 -->

Three edits to `.github/workflows/screenshots-drift.yml`, plus a `.gitignore` entry.

**Failure mode this catches:** the capture runs inside `docker run` with only `-e CI=true`
(`.github/workflows/screenshots-drift.yml:113` and the five lines under it), so `RUNNER_NAME`, `RUNNER_ARCH` and `RUNNER_OS` do not reach it and the instrument would record
empty runner fields on every run — leaving §6 rows 3 and 4 permanently unfirable. The test asserts the
capture step forwards all three by name. Note `-e VAR=value` sets a literal while `-e VAR` forwards the
host value; both forms appear in the step and the test distinguishes them.

Upload changes `if: failure()` to `if: always()` (spec §5). The evidence file is gitignored — required,
per the probe above, or it fails the gate's untracked check.

<!-- tasks: end -->

## Task 6 — ledger and peers

Outside the red-contract region deliberately: its subject is the ledger, and the marker grammar requires
`red-state=authored` to name a production surface by full path. `BACKLOG.md` is root-level, which the
classifier rejects as bare-filename shorthand, and there is no production file whose defect this task
repairs. Verified by `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`.

Archive `BL-SCREENSHOTS-DRIFT-CAPTURE-NONDETERMINISM` with the refutation and its evidence. Update
`BL-SCREENSHOTS-DRIFT-SINGLE-FAILURE-UNEXPLAINED` to PROBED-INSTRUMENTED, mechanism COMPATIBLE-not-PROVEN,
§6 recorded as its reading procedure. File both peers from spec §8 with their named class-sweep
exceptions and, for the telemetry-silent loader, this arc's own diagnosis as the incident.

Both in-progress markers come off in this branch's LAST commit, before the merge, per invariant 12.

---

## Acceptance criteria

Mirrors spec §9; the ids are the ones the task markers above reference.

- **AC-1** A capture whose surface renders an `infra_error` branch throws, names the entry key, theme and
  reason, and writes no bytes. Proven by an injected loader failure, not by a mocked component.
- **AC-2** A healthy capture is byte-identical to today's output: `git diff --exit-code
  public/help/screenshots/` after a full local capture on an unchanged tree.
- **AC-3** The derived-cover meta-test fails when a manifest-reachable `infra_error` branch lacks
  `data-degraded`, proven by a mutant removing the attribute.
- **AC-4** The meta-test's population is derived from the manifest, proven by a mutant adding a manifest
  entry whose route pulls in an unmarked branch.
- **AC-5** The evidence record is written and uploaded on both a passing and a failing run, with every
  spec §5 field populated — including the three runner fields, which requires the passthrough in Task 5.
  Proven against a real dispatched run, not locally only.
- **AC-6** `pngSha256` and `webpSha256` are recorded separately and move independently.

## Anti-tautology notes

- Task 2 asserts **no file written**, not merely that a throw occurred — a detector that throws after
  writing has already destroyed the baseline.
- Task 3's mutant (b) is what proves the population is derived rather than enumerated. Without it the
  meta-test passes identically against a hardcoded list, which is the exact defect the derived-cover rule
  exists to prevent.
- Task 4 asserts the two hashes independently. Extracting both from one render and comparing them to each
  other would pass whatever the implementation did.
- **AC-2 is the whole-class check:** on an unchanged tree the capture must reproduce every committed
  baseline byte-for-byte. It is the assertion that catches "the gate now passes because it stopped
  looking," and it runs against real captured bytes, not a mock.

## Verification

Local, in order. The capture is a heavy phase (inner 8192 MB build) and runs under `pnpm heavy` at its
outermost entry; scoped vitest runs stay unwrapped.

```
pnpm vitest run tests/help/ tests/cross-cutting/screenshotsDriftWorkflow.test.ts
pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts
pnpm heavy pnpm screenshot:help && git diff --exit-code public/help/screenshots/   # AC-2
```

Real CI green is a separate gate from local green (AGENTS.md: local-passes-CI-fails is its own bug
class). This branch touches `scripts/ci/**`-adjacent paths and `.github/workflows/screenshots-drift.yml`,
which is itself in the job's path filter — so the job fires on this PR and the run is a live capture of
the instrument under test. That is the intended proof, not a hazard.
