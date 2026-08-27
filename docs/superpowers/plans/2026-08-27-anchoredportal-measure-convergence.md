# Plan: AnchoredPortal measures twice per open, not three times

**Spec:** `docs/superpowers/specs/admin/2026-08-27-anchoredportal-measure-convergence.md`.
**Row:** `BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN`. **Branch:** `perf/anchoredportal-measure-convergence`. **Base:** `66c9857f5`.
**Out of scope:** `components/admin/useFitWithinClip.ts` is a sibling arc's file (`fix/fitwithinclip-stale-clip-subscription`); this branch does not touch it.

Every task is TDD per invariant 1: failing test, minimal implementation, passing test, one commit.

## Pre-draft code-verification pass

Run on this base before drafting. All 15 `file:line` citations in the spec were re-read and matched. Four things the pass established that changed the plan:

- **The suite baseline is 12 passed.** `pnpm vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` on `66c9857f5`.
- **INV-2 already has a case.** `tests/components/admin/rowActions/anchoredPortal.test.tsx:266` moves the anchor's position with its size held and asserts the panel follows, with `premiseHolds` on both halves of its own inputs. Task 3 does not write a new fixture; it proves that case discriminates, which nothing currently does.
- **`AnchoredPortal.tsx` is not an enrolled mutation surface, and cannot be one today.** See the documented limit below. Probed, not assumed.
- **Three walkers cover the touched file and are checked rather than extended**, because none of their populations changes. RUN at plan time rather than asserted, per this arc's own sweep standard (`pnpm vitest run tests/components/admin/_metaPopoverViewportSource.test.ts tests/components/_metaScrollNeutralMeasurement.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts` = 3 files, 118 tests, all passing on the pre-repair tree). Task 1 re-runs them at the repaired head, since a population claim proved before the change is not a claim about the change. `tests/components/admin/_metaPopoverViewportSource.test.ts:170` asserts set equality over the files calling `placeWithinVisibleViewport`; `measureAndApply` keeps that call, so the set is unchanged. `tests/components/_metaScrollNeutralMeasurement.test.ts` walks `components/` from disk for cap clearing outside `withNaturalSize`; this diff adds none. `tests/ci/_metaE2eWorkflowCoverage.test.ts:260` asserts that every e2e spec is PR-covered by some workflow or reason-allowlisted; `rowactions-geometry.spec.ts` is covered by `admin-layout-e2e.yml`, and this diff adds a CASE to that existing spec rather than a new spec file, so the walked population is unchanged. (An earlier draft said this walker pins that the workflow's PATH FILTER names `AnchoredPortal.tsx`. It does not — that is a comment at `tests/ci/_metaE2eWorkflowCoverage.test.ts:138`, and the path-filter fact was verified directly against `.github/workflows/admin-layout-e2e.yml` instead.)

## Documented limit: the mutation harness cannot run this surface

Recorded here rather than filed as a ledger row, per the 2026-08-25 process mint freeze. It is process-facing, and its done condition would be a property of the tooling rather than a number anyone would notice moving.

**The limit, precisely: `tests/mutation/source/mutantOverlay.config.ts` cannot currently run any surface whose deciding suite depends on a `tests/setup.ts` polyfill, because it omits `setupFiles`.** It is NOT that the registry cannot express component surfaces, and it is not about `.tsx`.

Reproduction, run twice with the same result:

```
MUTATION_ROOT=$PWD \
MUTATION_TARGET=$PWD/components/admin/AnchoredPortal.tsx \
MUTATION_MUTANT=<a byte-identical copy of the clean source> \
MUTATION_SUITE=tests/components/admin/rowActions/anchoredPortal.test.tsx \
pnpm exec vitest run --config tests/mutation/source/mutantOverlay.config.ts

ReferenceError: ResizeObserver is not defined
 ❯ components/admin/AnchoredPortal.tsx:229:16
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (12)
```

That is UNMUTATED source failing, so the surface cannot pass `assertCleanBaseline` and cannot be enrolled at all — the same class as that config's own alias comment, which records that without the `@/` alias every aliased suite fails the clean baseline for the same reason.

Cause, cited: the repo-root vitest config declares `setupFiles: ["tests/setup.ts"]`, and `tests/setup.ts:70-81` polyfills `ResizeObserver` because jsdom lacks it. `tests/mutation/source/mutantOverlay.config.ts` declares `setupFiles` zero times. The jsdom environment itself is fine: the suite's `@vitest-environment jsdom` pragma is honoured and 11 of its 12 cases pass under the overlay config.

**There is no per-run escape hatch, which is what makes this structural rather than a judgment call.** `vitest run --setupFiles tests/setup.ts` exits with `CACError: Unknown option \`--setupFiles\``. The fix can therefore only be an edit to the shared config, which changes the harness for all 56 enrolled surfaces at once and could silently move existing scores. This arc does not take that blast radius while its own subject is measure convergence.

**Re-file trigger:** a product arc actually BLOCKED from shipping by this, not merely re-shaped by it. This arc was re-shaped, not blocked: the converged count is still pinned executably, by the deciding cases and planted mutants below.

## Meta-test inventory

**This plan creates no structural meta-test and EXTENDS exactly one.**

`tests/docs/_metaDeferralLedgerGraduation.test.ts:100` holds the `BACKLOG_GRADUATED` registry, whose rows are `{ id, provenance }`, and every row leaving the open queue gets an entry. Task 2 adds:

```ts
{ id: "BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN", provenance: "perf/anchoredportal-measure-convergence" },
```

The guard slices the archive from this id's heading to the next and asserts the section CONTAINS the provenance string (`tests/docs/_metaDeferralLedgerGraduation.test.ts:792`), because the IN PROGRESS marker was the section's only mention of the branch and graduation must REPLACE that mention rather than delete it. Task 2's gate command checks the same four facts independently.

Of the five registries `docs/agents/writing-plans.md` names — Supabase call boundaries, sentinel hiding, `admin_alerts.upsert` catalog completeness, advisory-lock topology, no-inline-email-normalization — this diff touches no Supabase call boundary, no DB write, no advisory lock, no `admin_alerts` row and no email path. None has a new member.

**Deliberately NOT proposing a new meta-test** asserting "the ungated effect has no dependency array". It would be a syntax walker over a population of one file, added by the arc that would add the walker, with a done condition that is a property of the walker. That is the shape the mint freeze declines. INV-1 holds the contract behaviorally instead, and mutant M2 proves it discriminates.

## Advisory-lock topology

N/A. This diff touches no `pg_advisory*` call and no code path that mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs` or `pending_ingestions`.

## Dimensional invariants

N/A, per spec §6. The repair introduces no fixed-dimension parent with flex or grid children and changes no class.

## e2e harness-readiness checklist

Mandatory because this plan attaches Playwright (`tests/e2e/rowactions-geometry.spec.ts`).

- **(a) Server boot.** `BASELINE_SERVER_ONLY=1` boots only the port-3000 webServer per `playwright.config.ts`; `--project=desktop-chromium`. The spec's own `beforeAll` seeds 16 shows through `seedShowWithCrew`, which writes to the loopback `SUPABASE_URL` stack and deliberately ignores `TEST_DATABASE_URL` (`tests/e2e/helpers/seedShowWithCrew.ts:189-193`), so a local run cannot reach the validation project.
- **(b) Readiness gate.** `lastSeededTrigger` fills the Find input and asserts the trigger count settles at `SEEDED_SHOWS`, which is React hydration observed rather than `networkidle`. The `PROBE:` case awaits `expect(panel).toBeVisible()` and then two `requestAnimationFrame`s, so its sample is on the far side of any scheduled re-measure.
- **(c) Detach safety.** The `PROBE:` case reads its state with `page.evaluate` against `window.__portalProbe`, never `locator.evaluate` on the panel, so nothing auto-waits on a node that can unmount. The observer is disconnected implicitly with the page.

## Blast radius, enumerated

`AnchoredPortal` is rendered from exactly one file, at two sites, both in
`components/admin/ShowRowActions.tsx`: the row menu
(`testId={`row-actions-portal-${slug}`}`) and the preview submenu
(`testId={`row-action-preview-portal-${slug}`}`). `ReSyncButton.tsx` and
`PublishedToggle.tsx` name the component only in comments — both compose
`placeWithinVisibleViewport` directly — so neither is a consumer.

**Coverage note, stated because a reviewer would otherwise find it.** The live
pins (AC-2, AC-4) select `[data-testid^="row-actions-portal-"]`, which matches
the row menu and NOT the submenu: the submenu's id begins
`row-action-preview-portal-`, a different prefix rather than a longer one. So the
browser-side pins exercise one of the two sites.

That is deliberate and sufficient. The repair is inside `AnchoredPortal` itself,
so both sites receive it, and AC-1 and AC-3 are asserted against the COMPONENT in
jsdom rather than against either site, which is the level the change lives at.
The submenu keeps its existing live coverage for containment and flip in the same
spec. Extending the placement-history pin to the submenu would duplicate a
component-level assertion at a second site without testing anything the first
does not.

## Pre-code mechanical UI checklist

Run BEFORE implementing, per the 2026-07-19 retrospective: the impeccable pair is
a verifier, not a discovery mechanism, and roughly 50 findings in one month were
pre-written invariants discovered post-code.

The repair deletes one statement and rewrites one comment in
`components/admin/AnchoredPortal.tsx`. It renders no copy, adds no element,
and changes no class, so every item is satisfied vacuously and is recorded as
such rather than skipped:

| Item | Status |
| --- | --- |
| Em-dash ban in user-visible copy | N/A — the diff adds no user-visible string. The em dashes in this file are all in comments. |
| Apostrophe literals | N/A — no copy added. |
| 44px tap targets (`min-h-tap-min` and companions) | N/A — no interactive element added or resized. The panel's own chrome is `ShowRowActions`, untouched. |
| Canonical type/token classes (`text-xs/relaxed`, `text-subtle`) | N/A — `className` on the portal is unchanged. |
| Contrast pin for a new or repurposed colour token | N/A — no token added. |

Expected impeccable outcome is therefore "no visual change", and a P0 or P1 that
is visual would mean the repair did something it was not supposed to.

## Acceptance criteria

- AC-1 One closed to open transition runs `measureAndApply` exactly twice, counting the measures React commits drive, in the jsdom harness whose `ResizeObserver` is a no-op stub. A browser adds observer-delivery measures this count deliberately does not cover (spec §1).
- AC-2 On the open commit the placement is applied before paint.
- AC-3 An anchor that moves without changing size re-places the panel.
- AC-4 The applied placement sequence is unchanged by the repair.
- AC-5 The arc closes out: the impeccable pair ran with dispositions recorded, and the row is graduated out of the open queue with its in-progress marker gone.

| Criterion | Task | How it is proved | Plant that reds it | Plant status |
| --- | --- | --- | --- | --- |
| AC-1 | 1 | jsdom measure counter reads 2 | M1: restore the deleted `measureAndApply()` call | to run in task 1 |
| AC-2 | 1 | `PROBE:` frame ordering, `tests/e2e/rowactions-geometry.spec.ts` | M2: make the sole measurer a `useEffect` | **RUN**, red observed, transcript in spec appendix A.4 |
| AC-3 | 2 | `tests/components/admin/rowActions/anchoredPortal.test.tsx:266` | M3: delete the ungated effect | to run in task 2 |
| AC-4 | 1 | `PROBE:` placement sequence at per-batch grain, PLUS the geometric oracle (right-edge alignment and adjacency on the reported side) | a one-line `left + 1`, which the count alone does not catch | oracle RUN green; the mutant is task 1's |
| AC-5 | 2 | the closeout gate command, every conjunct red today | n/a — the gate IS the check |

AC-2's pin and its plant are already committed and proved: clean gives mount
frame 2 and placement frame 2, the plant gives placement at frame 3 and reds.
Under that plant AC-4 stayed GREEN, so the two are demonstrably not redundant.

## Tasks

<!-- tasks: depth=2 red-contract -->

## Task 1 — pin the converged count at 2, and reach it

<!-- task: red=`pnpm vitest run tests/components/admin/rowActions/anchoredPortal.test.tsx` red-state=authored red-target=`components/admin/AnchoredPortal.tsx:193` why=`measure A, the gated effect's own measureAndApply() call, is still present, so the new counter case reads 3 commit-driven measures and its assertion of 2 fails` ac=AC-1,AC-2,AC-3,AC-4 -->

**What is red and why.** The new case counts anchor-rect reads across one closed
to open transition and asserts 2. On the live tree the count is 3: measure A at
`components/admin/AnchoredPortal.tsx:193` in the open commit, measure B from the
ungated effect in that same commit, and measure C from the ungated effect after
the placement settles (spec §1 names them). The red comes from that production
line, not from anything the test controls.

The count is of COMMIT-DRIVEN measures. jsdom's `ResizeObserver` is a no-op stub
(`tests/setup.ts:70-81`), so observer-delivery measures do not appear in it; that
is what makes the commit-driven count observable in isolation, and it is why this
number is not a browser total.

RED: add the counter case. Two premises, both on its own inputs and both
executed unconditionally before what they guard:

- the closed render must produce zero anchor reads, or the count is not the cost
  of a transition;
- **one measure must equal one anchor read.** `measureAndApply` reads the anchor
  exactly once (`components/admin/AnchoredPortal.tsx:141`), and the case
  establishes that 1:1 relation on its own inputs rather than assuming it:
  after the transition has settled, reset the counter, dispatch a single
  `resize` on `window`, and flush one frame. That path is
  `schedule` → `createRafCoalescer(measureAndApply)`
  (`components/admin/AnchoredPortal.tsx:194`,
  `components/admin/AnchoredPortal.tsx:223`), which runs `measureAndApply`
  exactly once per flushed frame, so the premise asserts the counter reads 1.
  Without it the counted unit is ambiguous and the case would red on a refactor
  that changes nothing observable — the failure mode is a second rect read added
  inside `measureAndApply`, which would silently double every count this case
  makes.

GREEN: delete `measureAndApply();` at `components/admin/AnchoredPortal.tsx:193`,
leaving the gated effect's subscription wiring and teardown untouched. Rewrite
its lead comment so it no longer claims to place.

PLANT M1: restore the deleted call, run the command, record the observed failure
and the count it reported, revert. **An orphaned plant is a hard failure of this
task, not a line to drop** — round 1 shipped a plant that could not red, and the
whole point of planting is to catch that before it ships.

THEN: re-run the `PROBE:` e2e case at the repaired head. AC-2 and AC-4 must both
still be green. The repair removes a measure, not a placement, so a change in the
placement sequence here is a defect rather than an expected difference. Record
the output beside the pre-repair figure.

**Ordering rule for every plant below: EXECUTE, then write the claim from the
result. Never write the claim and schedule the execution.** Spec round 2 found
this arc's §4 asserting that every mutant had been run when one had; the document
stating the rule was the document breaking it, and the repair is mechanical
ordering rather than more diligence.

PLANT M1: restore the deleted call, run the command, record the observed failure
and the count it reported, revert. **An orphaned plant is a hard failure of this
task, not a line to drop** — round 1 shipped a plant that could not red, and
catching that before it ships is the whole point of planting.

PLANT M3: delete the ungated effect at
`components/admin/AnchoredPortal.tsx:254-257`, run the command, and observe
`tests/components/admin/rowActions/anchoredPortal.test.tsx:266` red. This is the
brief's required proof and the only evidence that the position-only case has ever
discriminated. Revert, and verify the file is byte-identical to `HEAD`. M2 (the
sole measurer made passive) is ALREADY RUN and its red recorded in the spec's
appendix A.4.

THEN, in the same task:

- re-run the `PROBE:` e2e case at the repaired head. AC-2 and AC-4 must both
  still be green; the repair removes a measure, not a placement, so a change in
  the placement sequence is a defect rather than an expected difference. Record
  the output beside the pre-repair figure.
- re-run the three walkers named in the meta-test inventory. They were green on
  the pre-repair tree, and a population claim proved before the change is not a
  claim about the change.

<!-- tasks: end -->

<!-- tasks: depth=2 -->

## Task 2 — close out

<!-- task: red=`sh -c 'P=docs/superpowers/plans/2026-08-27-anchoredportal-measure-convergence.md; grep -qE "^impeccable-gate: critique=(RAN|RAN-DEGRADED) audit=(RAN|RAN-DEGRADED) p0=(0|[1-9][0-9]*) p1=(0|[1-9][0-9]*) dispositions=(recorded|none)$" $P || exit 1; grep -qE "^#{2,3} BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN" BACKLOG.md && exit 1; awk "/^#+ BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN/{f=1;next} f&&/^#/{f=0} f" BACKLOG-archive.md > /tmp/apm-entry.txt; test -s /tmp/apm-entry.txt || exit 1; grep -q "IN PROGRESS" /tmp/apm-entry.txt && exit 1; grep -q "perf/anchoredportal-measure-convergence" /tmp/apm-entry.txt || exit 1; grep -q "BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN" tests/docs/_metaDeferralLedgerGraduation.test.ts || exit 1; exit 0'` ac=AC-5 -->

**What is red and why.** Every conjunct fails on the live tree today: this plan
carries no `impeccable-gate:` line, the row is still a heading in `BACKLOG.md`,
it is absent from `BACKLOG-archive.md`, and it has no `BACKLOG_GRADUATED` row.
The command goes green only when all four are true together.

Invariant 8 applies, because `components/admin/AnchoredPortal.tsx` is a UI
surface. Run `/impeccable critique` and `/impeccable audit` on the diff with the
canonical v3 setup gates. The pre-code checklist above predicts "no visual
change", so a visual P0 or P1 would mean the repair did something it was not
supposed to. Record findings and dispositions in §12.

**The `impeccable-gate:` line is written by this task and by nothing before it.**
`tests/docs/_invariant8Closeout.ts` treats any line starting `impeccable-gate:`
that is not one of the two conforming forms as MALFORMED, and one malformed line
reds the unit regardless of any valid one. A scaffolding placeholder is not
merely useless, it is red.

Then graduate the row into `BACKLOG-archive.md` naming the branch in its own
prose, add the `BACKLOG_GRADUATED` row, and remove the IN PROGRESS marker in the
PR's last commit so it never reaches main.

<!-- tasks: end -->

## 12. Impeccable dispositions

Written by task 2. No marker line exists until then, deliberately.
