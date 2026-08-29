# Plan — /help/tour card grids and the missing Settings card

**Spec:** [`docs/superpowers/specs/2026-08-29-help-tour-grid-and-settings-card.md`](../specs/2026-08-29-help-tour-grid-and-settings-card.md)
**Branch:** `fix/help-tour-grid-and-settings-card` · **Closes:** `DEFERRED.md`
HELPTOUR-CARD-GRID-MEASURE-1 and HELPTOUR-SETTINGS-CARD-MISSING-1

The spec converged at `f2a195b7f` after five review rounds. Its own history is the reason this plan
is shaped the way it is: four of those five rounds found the same class of defect, an assertion
that held for a reason other than the one it named. §3 is the answer to that, and it is this plan's
closed criterion.

---

## 1. Files

| File | Change |
| --- | --- |
| `app/globals.css` | `@property --help-measure`; cap moves from `.help-prose` to `.help-prose > *`; `.help-bleed` opt-out |
| `app/help/tour/page.mdx` | `data-tour-card` on all eight card anchors; derived column counts + `help-bleed` on three grids; `md:col-span-2` becomes `col-span-full`; the Settings card |
| `app/help/errors/page.tsx` | jump list takes a derived column count at its own minimum; no bleed |
| `tests/help/page-tour.test.tsx` | hardcoded seven-URL list becomes set equality derived from `NAV` |
| a new `tests/help/` transitions suite (named in task 7) | spec §5's transition inventory |
| `tests/e2e/help-typography.spec.ts` | measure assertion retargets from the wrapper to a paragraph |
| `tests/help/help-prose-layer.test.ts` | measure pattern follows the declaration that now carries it |
| a new `tests/e2e/` layout-dimensions spec (named in task 5) | real-browser column sequences and measure floor |
| `playwright.config.ts` | new spec joins `help-docs-desktop`'s `testMatch` |
| `.github/workflows/help-affordances.yml` | `app/globals.css` joins `paths:` |

## 2. Meta-test inventory

**CREATES none. EXTENDS none.** Declared explicitly rather than left silent: this arc adds no
Supabase call boundary, no `admin_alerts` row, no sentinel-hiding surface, no advisory lock and no
RPC-gated table, so none of the registries named in `docs/agents/writing-plans.md` applies. The two
guards it does touch (`tests/help/page-tour.test.tsx`, `tests/e2e/help-typography.spec.ts`) are
ordinary suites, not registry-bearing meta-tests.

**Source-mutation registry: not enrolled, with the reason in spec §3.4.** The registry mutates a
module named by `sourcePath`; the completeness guard is a rendering assertion with no module under
it. Enrolling it symbolically would be worse than declining.

## 3. Violation inventory — every acceptance criterion, and what makes it red

This is the plan's closed criterion, and it exists because spec R5 proved the criteria could all
pass on a page where the change had not happened. **Each row is a staged violation applied to the
finished tree, with the named command observed RED, then reverted.** A criterion whose violation
cannot be staged is not a criterion; it is a sentence.

| AC | What it claims | Staged violation | Expected red |
| --- | --- | --- | --- |
| **AC-1d** | the measured column sequences hold | revert all three tour grids to `grid-cols-1` and drop `help-bleed` — the permanently-single-column page | layout spec fails on the column COUNT at 752, 1016 |
| AC-1 | measure >= 28ch at the thresholds | set the minimum to `16rem` | switch measure 23.1ch, fails at 752 |
| AC-1a | nothing crosses the floor | same 16rem stage | a viewport above the floor ends below it |
| AC-1b | zero jump-list wraps | restore `sm:grid-cols-2` on the errors list | 5 of 7 wrap at 768 |
| AC-1c | no horizontal overflow at 320 | drop the `min(...,100%)`, leaving a bare `22rem` | track 352 in a 288 container, +64px |
| AC-2 | other help pages unchanged | remove the `> *` scoping so the cap lifts entirely | typography spec fails on a widened paragraph |
| AC-3 | cards cover every admin-surface slug | delete the Settings card | set equality fails naming `/help/admin/settings` |
| AC-4 | a ninth entry fails by default | add a ninth `admin-surface` NAV entry, no card | same guard fails naming the new slug, with NO edit to the test |
| AC-5 | prose contracts still hold | remove the `--help-measure` declaration | prose-layer guard fails on the missing measure |
| AC-6 | eight cards for eight surfaces | point one card at a `reference`-group route | set equality fails in the OTHER direction, naming the stray href |
| AC-7 | copy invariants hold | put an em dash in the Settings card body | `page-tour.test.tsx` em-dash ban fails |

**AC-3 and AC-6 are deliberately staged in opposite directions.** Both exercise the same assertion,
and a single violation would leave one of them riding on the other's evidence — which is the
`AC-1d` failure mode in miniature. AC-3 removes a card the set requires; AC-6 adds an href the set
forbids.

**AC-1 and AC-1a share the 16rem stage** and this is recorded rather than hidden: 16rem drops the
switch measure to 23.1ch, which is both below the floor and a viewport that was above it ending
below it. They are one observation seen twice, so AC-1a's independent value rests on the AC-1d
stage as well, where the sequence changes without the floor being crossed.

## 4. CI wiring

The new spec joins **`help-docs-desktop`**, not `desktop-chromium`. `help-affordances.yml` invokes
projects by NAME, so a spec matched there runs; a `desktop-chromium` spec would be CI-dark, which
is not hypothetical — `phantom-gap-e2e.yml` exists because `crew-layout-dimensions.spec.ts` and
`admin-layout-dimensions.spec.ts` matched a project that no workflow invoked.

`app/globals.css` joins that workflow's `paths:`. It is absent today, so a future change to
`.help-prose` alone would leave every assertion in the new spec dark.

**What gates the merge, stated because it is not what you would assume.** The 13 required contexts
do not include `help-affordances`. The completeness guard runs under `unit-suite` and IS
merge-gating; the real-browser layout assertions run and report on every PR touching these paths
but do NOT block. That is the honest status of AC-1, AC-1a, AC-1b, AC-1c and AC-1d, and this plan
does not propose changing branch protection to alter it.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — derive the completeness guard from NAV

<!-- task: red=`pnpm vitest run tests/help/page-tour.test.tsx` red-state=authored red-target=`app/help/tour/page.mdx:95` why=`the task tags the seven existing cards with data-tour-card and replaces the hardcoded seven-URL list with set equality against the NAV entries whose group is admin-surface, so the observed RED is behavioural rather than a missing import: the page renders seven carded hrefs against eight admin-surface slugs and the assertion fails naming /help/admin/settings, which is the defect itself. The premise that at least one card anchor renders is what stops an empty set passing vacuously. The SAME command greens when task 2 adds the Settings card` ac=AC-3,AC-4,AC-6 -->

Tag all seven existing card anchors with `data-tour-card`. Replace `ADMIN_REFERENCE_URLS` with set
equality between `a[data-tour-card][href]` in the rendered tree and the `NAV` entries whose `group`
is `admin-surface`, both directions, failing by name.

**Commit this alone and observe the red before task 2.** Both tasks touch the tour page; combined,
the red never appears.

**The four presence-guard mutants run here**, results recorded in the commit: (a) drop
`data-tour-card` from every card — the premise must fail, not the equality; (b) append a suffix to
one href; (c) put `/help/admin/settings` in PROSE with no card — must STILL fail, which is the R1
finding; (d) flip one entry's `group` — the expected set must shrink.

## Task 2 — the Settings card

<!-- task: red=`pnpm vitest run tests/help/page-tour.test.tsx` red-state=authored red-target=`app/help/tour/page.mdx:95` why=`task 1 authors the failing case and leaves this command red on the missing /help/admin/settings card, so the red is authored by this plan rather than pre-existing — spec:lint --exec-red confirmed the command exits 0 on today's tree, which is why this is not red-state=live. This task adds the card under Once per environment and the SAME command greens` ac=AC-6,AC-7 -->

Add the card with spec §3.3's exact copy, `data-tour-card`, and the standard (non-accent) treatment.

## Task 3 — move the measure cap

<!-- task: red=`pnpm vitest run tests/help/help-prose-layer.test.ts` red-state=authored red-target=`app/globals.css:1211` why=`the task moves the measure from .help-prose to .help-prose > * behind an @property-registered length, so the literal max-width: <n>ch the prose-layer guard matches no longer exists at that declaration and the guard fails; the SAME command greens when the guard is retargeted to the declaration that now carries the measure, in this task` ac=AC-2,AC-5 -->

`@property --help-measure`, the `> *` scoping, `.help-bleed`. Retarget both guards: the prose-layer
pattern, and the typography spec's wrapper measurement (to a paragraph).

## Task 4 — derived column counts

<!-- task: red=`pnpm heavy pnpm exec playwright test help-tour-layout-dimensions --project=help-docs-desktop` red-state=authored red-target=`app/help/tour/page.mdx:53` why=`task 5 writes the layout spec; this task is what makes its column-sequence cases pass. Before it, the grids carry md:grid-cols-N and the sequence at 752/1016 is one column, so the AC-1d cases fail on the COUNT. The SAME command greens once auto-fit with the min(22rem,100%) floor and col-span-full land` ac=AC-1,AC-1a,AC-1c,AC-1d -->

All three tour grids to `grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]` plus
`help-bleed`; `md:col-span-2` becomes `col-span-full`. Errors jump list to its own `18rem` minimum,
no bleed.

## Task 5 — the layout-dimensions spec

<!-- task: red=`pnpm heavy pnpm exec playwright test help-tour-layout-dimensions --project=help-docs-desktop` red-state=authored red-target=`tests/e2e/help-tour-layout-dimensions.spec.ts` why=`the spec file does not exist and is matched by no project until this task adds it to help-docs-desktop's testMatch, so the command reports no tests rather than a failure; the task lands the file AND the testMatch entry together, and the SAME command then runs and greens against task 4's implementation` ac=AC-1,AC-1b,AC-1d -->

New spec: column sequences (AC-1d), measure floor (AC-1), zero wraps (AC-1b), no overflow (AC-1c).
Viewports 320, 390, 640, 740, 752, 768, 900, 904, 1004, 1016, 1024, 1280. One `page.evaluate` per
viewport. Readiness gate is `await expect(grid).toBeVisible()`, never `networkidle` alone. Premises:
at least one card anchor renders, and the grid is multi-column where a case asserts a multi-column
measure. Add to `help-docs-desktop` `testMatch`; add `app/globals.css` to `help-affordances.yml`
`paths:`.

## Task 6 — the violation inventory

<!-- task: red=`test -s docs/superpowers/plans/2026-08-29-help-tour-grid-and-settings-card-violations.md` red-state=authored red-target=`docs/superpowers/plans/2026-08-29-help-tour-grid-and-settings-card-violations.md` why=`the transcript file does not exist until this task stages each §3 violation against the finished tree and records the observed red; the SAME command greens when it is written with content. Its absence is the point — an inventory nobody ran is the defect spec R5 found, one level up` ac=AC-1d -->

Stage each §3 violation on the finished tree, observe the named red, revert, record the transcript.
**AC-1d's row runs first**: the permanently-single-column page that spec R5 proved passes AC-1,
AC-1a, AC-1b and AC-1c must go RED here, or AC-1d does not do its job.

## Task 7 — transition audit

<!-- task: red=`pnpm vitest run tests/help/tour-transitions.test.tsx` red-state=authored red-target=`tests/help/tour-transitions.test.tsx` why=`the file does not exist, so the command exits non-zero on a missing path rather than on a name filter that matches nothing and would report green from birth (spec:lint RED_TEST_NAME_FILTER, raised against an earlier draft of this very marker); the task creates it with the three cases from spec §5 and the SAME command then runs and greens` ac=AC-7 -->

A new transitions suite under `tests/help/` (path in the marker above). Spec §5's inventory is
three rows. Assert each: rest to hover is `border-color` via the existing
`transition-colors`; rest to focus-visible and hover to focus-visible are instant. Confirm by
reading that no `AnimatePresence`, conditional render or exit animation exists on this page.

## Task 8 — impeccable dual gate

<!-- task: red=`npx vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live why=`this plan declares the invariant-8 dual gate and carries no marker line, because the grammar has no legal not-yet-run value, so the closeout guard fails on today's tree — verified by running it, not assumed. The SAME command greens when this task runs critique and audit and writes the real marker with its counts and dispositions` ac=AC-7 -->

`/impeccable critique` and `/impeccable audit` over the UI diff (`app/help/tour/page.mdx`,
`app/help/errors/page.tsx`, `app/globals.css`). P0 and P1 fixed or deferred with a `DEFERRED.md`
entry. Findings and dispositions in §12.

## Task 9 — closeout

<!-- task: red=`bash -c 'git log -1 --format=%H | xargs -I{} git show {} --stat | grep -q DEFERRED.md'` red-state=live why=`the current HEAD does not touch DEFERRED.md, so the grep exits non-zero on today's tree — verified, not assumed; the SAME command greens on the PR's final commit, when this task removes both in-progress markers and archives the graduated entries. Invariant 12 requires the marker come off BEFORE the merge, never after` ac=AC-6 -->

Remove both `**Status:** IN PROGRESS` markers and archive the graduated entries, in the PR's LAST
commit. A marker that reaches `main` names a branch the merge has just deleted.

<!-- tasks: end -->

---

## 12. Invariant-8 closeout

UI surface touched: `app/help/tour/page.mdx`, `app/help/errors/page.tsx`, `app/globals.css`.
Findings and dispositions land here when task 8 runs.

No marker line yet, deliberately. The grammar admits only `critique=RAN` or `critique=RAN-DEGRADED`
— there is no legal "not yet run" value — so the line cannot exist until task 8 has actually run
the gate. `tests/docs/_metaInvariant8Closeout.test.ts` is therefore RED on this branch until then,
which is correct rather than unfortunate: this plan declares the dual gate and has not yet run it.
Task 8 uses that guard as its own red.
