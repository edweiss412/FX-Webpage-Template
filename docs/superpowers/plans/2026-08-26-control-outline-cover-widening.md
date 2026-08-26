# Plan — widen the control-outline cover to both families

**Spec:** `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md` · **Row:** `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` · **Branch:** `fix/control-outline-cover` · **Base:** `b30413cf5`

## 0. The invariant-8 marker, and why it is not here yet

`tests/docs/_invariant8Closeout.ts` fails a plan unit that DECLARES the dual gate (its prose names both halves) and carries no valid `impeccable-gate:` line, and it treats the documented template line as MALFORMED outside a template file (`parseMarkers`, the `TEMPLATE_FORM` branch). The two legal forms are the filled `critique=… audit=… p0=… p1=… dispositions=…` line and the `N/A` line, and this arc has a UI surface so `N/A` is not available to it.

No gate has run, so no filled line can be written that is not a fabricated claim, and a fabricated marker is precisely what that guard's own docstring calls reviewer territory. So Task 9's body names the gate by its invariant number rather than by the two half-names, and the commit that RUNS the gate adds both the explicit declaration and the filled marker together. Stated here in the open rather than left for a reader to notice, because a plan that quietly avoids a guard's trigger phrase and a plan that has not yet earned the claim look identical from outside.

## 1. Meta-test inventory

| Meta-test | CREATES / EXTENDS / covered by default | Why |
| --- | --- | --- |
| `tests/styles/_metaControlOutlineResidue.test.ts` | **EXTENDS** | the guard that drives the sweep. Task 5 opts its module in, moves the pinned census length and the per-category counts, and Task 4 adds the `inner-chrome` bar cases. Its census-equality assertion is already bidirectional (`validateCensus` reports unregistered and stale as multisets), so a widened cover with no registration fails by default. |
| `tests/styles/tintedPlateOutline.test.ts` | **EXTENDS** | Task 6 opts its scan in and inverts its "left alone" pin. Its derived arm already fails by default on a plate control missing the plate token, so the new member needs no new assertion. Task 5 moves its `neutralFaintCount` row for `step3ReviewSections`. |
| `tests/styles/interactiveScanCore.test.ts` | **EXTENDS** | Tasks 1-3 add the option-exercising cases. This is also the mutation-coverage repair named in spec §12: the surface's other two deciding suites read the DEFAULT, so a mutant in the new code is killable only from here. |
| `tests/styles/secondary-action-contrast.test.ts` | **EXTENDS** | Task 6 adds the `--color-control-outline-tinted` vs `--color-bg` relation, per the AGENTS.md pre-code mechanical UI gate: a new or repurposed token pair takes its §1.2 row AND its assertion in the same commit. |
| `tests/mutation/_metaPremiseContract.test.ts` | covered by default | it walks the enrolled suites with a per-suite expected premise count. Tasks 1-3 and 5 add premises to enrolled suites, so its rows move; Task 8 reconciles them with the re-score. |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | NONE, with the reason | the diff adds no HTTP route, no `"use server"` action, no admin mutation. Invariant 10 has no surface here. |
| `tests/auth/_metaInfraContract.test.ts` | NONE, with the reason | no Supabase call boundary is added. Invariant 9 has no surface here. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | NONE, with the reason | no `pg_advisory*` call is added or moved. Invariant 2's topology is untouched. |

## 2. Mutation-operator family closure

Three enrolled surfaces sit in this diff's path, all declaring `operators: [...OPERATOR_NAMES]`, the whole set at `tests/mutation/source/operators.ts:17`:

`relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal`.

That set is the closure the diff review converges against. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard, never hypothesized. The round-1 diff brief's `OPERATORS:` tail is read off the shipped registry rows, never retyped.

## 3. Why the sweep is ONE task and not four

The marker contract is red-then-green on the SAME command inside one task. The widened cover and the repairs it names cannot be separated without breaking that cycle: opting the residue guard in makes `_metaControlOutlineResidue` red on 35 keys at once, and any task repairing only some of them leaves the same command red at its own end. So Task 5 carries the opt-in, all 23 swaps, the 12 registrations and the pin moves, and its body records the observed red before the repairs. That is the row's own sequence executed inside one commit rather than spread across four red ones.

Task 6 is separable because it reds a DIFFERENT command: the tinted-plate guard's own opt-in.

**The prose moves with its cause, not in a task of its own.** A standalone "rewrite `DESIGN.md`" task has no executable red, and inventing a prose guard to give it one is the shape that cost PR #776 18 rounds and 33 findings on a single paragraph. So Task 5 carries `DESIGN.md:319-329`, the `DESIGN.md:260-261` mechanism sentence, the §1.2a sorting rule and `tests/styles/subtleInteractiveScan.ts:15-23`; Task 6 carries `DESIGN.md:412-418`, `DESIGN.md:445-449` and `tests/styles/tintedPlateOutline.test.ts:33-41`. The invariant-8 dual gate is what reviews the `DESIGN.md` diff, and it is Task 9.

## 4. Reconciliation sweeps, authored AND RUN at plan time

**4.1 Every consumer of `scanInteractiveElements`, with its disposition.**

```
$ grep -n "scanInteractiveElements(" tests/styles/*.ts | grep -v "^tests/styles/interactiveScanCore.ts:"
tests/styles/_metaControlOutlineResidue.test.ts:232     fixture helper  -> options threaded (Task 5)
tests/styles/_metaControlOutlineResidue.test.ts:268     fixture helper  -> options threaded (Task 5)
tests/styles/_metaControlOutlineResidue.test.ts:600     fixture helper  -> options threaded (Task 5)
tests/styles/_metaControlOutlineResidue.test.ts:1767    live token scan -> options threaded (Task 5)
tests/styles/_metaControlOutlineFill.test.ts:53         DEFAULT, unchanged (spec §7.6)
tests/styles/_metaControlOutlineFill.test.ts:102        DEFAULT, unchanged (fixture helper)
tests/styles/controlOutlineResidue.ts:449               OPT IN both flags (Task 5)
tests/styles/tapTargetScan.ts:33                        DEFAULT, unchanged (spec §7.3)
tests/styles/controlOutlineScan.ts:229                  DEFAULT, unchanged (spec §7.5)
tests/styles/subtleInteractiveScan.ts:44                DEFAULT, unchanged (spec §7.4)
tests/styles/interactiveScanCore.test.ts:68             fixture helper -> gains an options parameter (Task 1)
tests/styles/interactiveScanCore.test.ts:72             DEFAULT (the corpus premise), unchanged
tests/styles/interactiveScanCore.test.ts:477,479        DEFAULT, unchanged (parse-cache case)
tests/styles/tintedPlateOutline.test.ts:56              OPT IN both flags (Task 6)
```

Fifteen call sites, every one dispositioned: two opt in, four thread options into a fixture helper, nine keep the default.

**4.2 The residue registry counts this diff moves.**

```
$ grep -n "RESIDUE_CENSUS.length\|count(\"" tests/styles/_metaControlOutlineResidue.test.ts
386:    expect(RESIDUE_CENSUS.length).toBe(10);         -> 22
392:    expect(count("switch-track")).toBe(3);          -> 5
393:    expect(count("side-divider")).toBe(5);          -> 5 unchanged
394:    expect(count("focus-state-chrome")).toBe(2);    -> 2 unchanged
400:    expect(count("responsive-skin-filed")).toBe(0); -> 0 unchanged
401:    expect(count("filed-defect")).toBe(0);          -> 0 unchanged
402:    expect(count("literal-outline")).toBe(0);       -> 0 unchanged
                                                       -> inner-chrome, NEW assertion, 10
```

5 + 5 + 2 + 10 = 22, which is the length above. Both derive from the same twelve added rows, so they cannot drift apart without the suite saying so.

**4.3 The count nobody would look for: `neutralFaintCount`.**

`tests/styles/tintedPlateOutline.test.ts:215` pins `components/admin/wizard/step3ReviewSections.tsx` at 4 legitimate `border-text-faint` occurrences, counted CODE-ONLY with comments stripped. Task 5 adds five to that file (the textarea at 4206 and the four painted children at 1226, 1768, 1779 and 3788), so the pin moves to 9 in the same commit or the plate suite reds for a reason that has nothing to do with plates. Verified at plan time:

```
$ tsx -e 'stripCommentsForFile(readFileSync(f), f).match(/border-text-faint/g).length'   # f = step3ReviewSections.tsx
CODE_ONLY_COUNT=4
$ grep -c "border-text-faint" components/admin/wizard/step3ReviewSections.tsx           # raw, includes 2 comment lines
6
```

No other file this diff touches appears in that registry. Checked against all seven rows (`DataQualityWarningControls`, `archivedTabOffer`, `PublishedArchivedTabOffer`, `RoleMappingRow`, `lib/ui/actionClass.ts`, `RescanSheetButton`, `step3ReviewSections`).

**4.4 The `accepted` mutation rows are line-keyed, and the shift is computed, not discovered.**

A `siteId` is `<operator>:<line>:<column>:<mutation>`, so an insertion above an accepted site invalidates the row and the score reds on a survivor nobody introduced.

```
$ grep -n 'siteId: "' tests/mutation/source/registry.ts   # interactiveScanCore rows, source lines
141, 153, 180, 236, 285, 312, 380, 383, 394        (11 rows; two share line 383)
$ ... controlOutlineResidue rows, source lines
45, 51, 62, 80, 307, 321, 324, 373, 659            (9 rows)
```

`interactiveScanCore`: `ScanElement` ends at `tests/styles/interactiveScanCore.ts:65`, so adding `admittedAs` there inserts N lines above ALL eleven and every one shifts by exactly +N; columns are unaffected. Everything else this task adds (`ScanOptions` at ~865, the resolution helpers at ~876) lands below 394.

`controlOutlineResidue`: only 659 sits below the `ResidueCategory` and `RESIDUE_CATEGORIES` additions at ~463-476, so only that one shifts. The import change and the `residueOf` signature change are in place, adding no line.

Task 8 applies the shift by construction and the score run confirms zero unaccepted survivors. It also re-verifies each reason still describes the mutation at its new site by READING it, because a resolving siteId establishes nothing about what is there.

**4.5 The hover sweep, run.**

```
$ grep -rno "hover:border-[a-z-]*" app components | awk -F: '{print $NF}' | sort | uniq -c | sort -rn
  11 border-text-subtle
   8 border-border-strong
   2 border-status-warn
   2 border-accent-on-bg
   1 border-accent
$ grep -rn "hover:border-accent\([^-]\|$\)" app components
components/admin/dev/SwitcherControls.tsx:122
```

One site, and it is the Family A `<select>`. Seven of the eight `hover:border-border-strong` hits are card links in `app/help/tour/page.mdx`, outside the `.tsx` corpus and outside every swap set here; the eighth is `components/admin/HoverHelp.tsx`, whose rest is already `border-text-faint` and therefore already heavier on hover.

## 5. Layout-dimensions task

Mandatory because spec §14 carries a Dimensional Invariants table. Task 7 asserts, in a real browser at 390px in both themes, that every parent/child pair in that table keeps the relationship the table states, by `getBoundingClientRect()` within 0.5px. jsdom is not sufficient and is not used.

## 6. Transition-audit task

Mandatory because spec §15 carries a Transition Inventory, now covering the wizard pill's six state pairs. Task 8's suite walks every ternary render among the swapped elements and asserts each keeps its `transition-colors` or is deliberately instant, including both compound cases the inventory names.

## 7. Acceptance criteria

Restated from spec §13 so every `ac=` in a task marker resolves here; the spec is canonical if the two
ever disagree.

| id | claim |
| --- | --- |
| AC-1 | With both flags off, `scanInteractiveElements` returns byte-identical `file:line:tag` output to `b30413cf5`. |
| AC-2 | `{ textEntry: true }` admits `<textarea>`, `<select>` and `<input>` at any type; universe 421. |
| AC-3 | `{ paintedChildren: true }` admits a className-carrying JSX descendant of an in-scope element as its own element, `admittedAs: "painted-child"`, anchored on its own opening tag. |
| AC-4 | A bare-identifier JSX child bound to a file-local JSX-valued declaration is followed, and so is a capitalised tag one named-or-default import hop away. A tag the resolver cannot name is not, and neither is JSX inside an attribute. |
| AC-4b | A component invoked from two in-scope ancestors contributes its elements once; a self-rendering component terminates. |
| AC-5 | The four default-reading consumers report unchanged populations (362, 362, 57 resolved rows, 362). |
| AC-6 | Every one of the 35 elements in spec §6.1 and §6.2 is swapped to the token its ground requires or holds a `RESIDUE_CENSUS` row that passes its category bar. |
| AC-7 | `RESIDUE_CENSUS.length` is 22; per-category counts are 5 / 5 / 2 / 10 / 0 / 0 / 0. |
| AC-8 | An `inner-chrome` row whose live element is `admittedAs: "element"` is refused, asserted against a constructed subject. |
| AC-9 | The count of ELEMENTS repaired that do not appear in the red transcript is zero. |
| AC-9b | Every token on `components/admin/telemetry/EventFilters.tsx:40` is a literal the resolver reads, `FilterTextInput` exposes no `className` prop, and neither call site can supply a `border-*` token. Asserted with a planted caller override. |
| AC-10 | `--color-control-outline-tinted` vs `--color-bg` is pinned in `DESIGN.md` §1.2 and asserted in `tests/styles/secondary-action-contrast.test.ts`, in the same commit. |
| AC-11 | `components/admin/dev/SwitcherControls.tsx:122` carries `hover:border-accent-on-bg`, and no bare `hover:border-accent` remains on any control in `app/**` or `components/**`. |
| AC-12 | The tinted-plate derived arm passes with 9 members, and its inverted pin asserts the plate token on `components/admin/MaintenanceResetButtons.tsx:300`. |
| AC-13 | Playwright at 390px, light and dark, on the five surfaces spec §14 names, with before and after captures in the PR body. |
| AC-14 | The invariant-8 dual gate green, with dispositions recorded in §12. |
| AC-15 | The multiset of border-WIDTH utilities across every swap target is identical before and after. |
| AC-16 | `tests/styles/tintedPlateOutline.test.ts:215` records 9 for `components/admin/wizard/step3ReviewSections.tsx`, counted code-only, in the same commit as the five occurrences the sweep adds. |
| AC-17 | All three enrolled surfaces score at or above their floors with an empty unaccepted-survivor set, and every `accepted` row still names the mutation its reason describes after the line shift of §4.4. |

<!-- tasks: depth=2 red-contract -->

## Task 1 — `ScanOptions` and the `textEntry` axis

<!-- task: red=`pnpm vitest run tests/styles/interactiveScanCore.test.ts` red-state=authored red-target=`tests/styles/interactiveScanCore.ts:865` why=`isInScope takes no options parameter and admits <input> only at type checkbox or radio, so a fixture holding a <textarea>, a <select> and an <input type="email"> scans to zero elements where the new case expects three` ac=AC-1,AC-2 -->

**What is red and why:** `isInScope` has no options parameter, so the new fixture case sees none of the three text-entry kinds.

RED: add cases asserting `scanFixtureFiles({...}, { textEntry: true })` admits `<textarea>`, `<select>`, `<input type="email">` and `<input type={dynamic}>`; and a POSITIVE-CONTROL case asserting the same fixture at the DEFAULT admits none of them while still admitting `<input type="checkbox">`. Give `scanFixture`/`scanFixtureFiles` an options parameter.

GREEN: add `ScanOptions`, thread it through `scanInteractiveElements` into `isInScope`, and admit `textarea`, `select` and `input` at any type when `options.textEntry === true`. The comparison is `=== true`, never truthiness.

Also add the AC-1 case: with both flags off, `scanInteractiveElements(process.cwd())` returns `file:line:tag` output identical to a call with no options argument at all. This is the premise every measured number in the spec rests on.

## Task 2 — the `paintedChildren` axis and `admittedAs`

<!-- task: red=`pnpm vitest run tests/styles/interactiveScanCore.test.ts` red-state=authored red-target=`tests/styles/interactiveScanCore.ts:893` why=`the walker pushes an element only when isInScope holds for that element's own tag and keeps no ancestor state, so a className-carrying <span> inside a <button> never enters the result and ScanElement carries no admittedAs field` ac=AC-3 -->

**What is red and why:** the walk has no ancestor state, so a painted child is unreachable.

RED: fixtures for a `<span className>` inside a `<button>` (admitted, `admittedAs: "painted-child"`, anchored on its own opening tag); a `<span>` with NO className inside a `<button>` (not admitted); a `<button>` inside a `<button>` (admitted once, `admittedAs: "element"`); JSX inside an ATTRIBUTE of an in-scope element (not admitted); a top-level `<span className>` with no in-scope ancestor (not admitted). Plus the DEFAULT control: none of the above admitted with the flag off.

GREEN: give `ScanElement` an `admittedAs: "element" | "painted-child"` field and the walk an in-scope-ancestor depth counter maintained across `JsxElement` children. Per §4.4, adding the field shifts eleven `accepted` siteIds by exactly the number of lines inserted above line 141; record the number in the commit message and apply it in Task 8.

## Task 3 — following a local JSX binding and a component invocation

<!-- task: red=`pnpm vitest run tests/styles/interactiveScanCore.test.ts` red-state=authored red-target=`tests/styles/interactiveScanCore.ts:893` why=`no branch follows a JSX child identifier or a capitalised tag, so a VenueMapTile-shaped fixture whose paint lives in a JSX-valued const and a CronRunSummaryCard-shaped fixture whose paint lives in an imported component both report zero painted children inside their in-scope ancestors` ac=AC-4,AC-4b -->

**What is red and why:** the walk follows neither `{inner}` nor `<Foo />`, so both flagship shapes are invisible.

RED, five fixtures and their refusals:

1. `VenueMapTile`-shaped: `const inner = (<><span className="border border-border-strong bg-surface" /></>); return <a className="…">{inner}</a>`. The span must be admitted.
2. `CronRunSummaryCard`-shaped, TWO files: a `<div role="button">` whose only child is `<Card />`, imported by name from a sibling module whose exported function returns a `<div className="border border-border bg-surface-sunken">`. The div must be admitted, reported against the CALLEE's file and line.
3. The same across a DEFAULT import.
4. A tag whose declaration the resolver cannot name (produced by a call, e.g. `const Wrapped = withThing(Base)`). NOT followed, and the fixture asserts the absence, which is documented limit L1 asserted rather than described.
5. Termination: a cyclic pair of JSX-valued consts, and a component that renders itself. Both must terminate; a component invoked from two in-scope ancestors contributes its elements ONCE (AC-4b).

GREEN: follow a bare-identifier JSX child to a file-local JSX-valued declaration; follow a capitalised tag inside an in-scope ancestor to its declaration in this file or one named-or-default import hop away, switching the reporting file and `SourceFile` for the visit; guard both with a per-file followed-name set; de-duplicate the result by `(file, line, tag)`.

## Task 4 — the `inner-chrome` residue category

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineResidue.test.ts` red-state=authored red-target=`tests/styles/controlOutlineResidue.ts:470` why=`RESIDUE_CATEGORIES has no inner-chrome member, so validateRow returns "unknown category" for a constructed inner-chrome subject and never reaches the bar the new cases exercise` ac=AC-8 -->

**What is red and why:** the category does not exist, so `validateRow` short-circuits on it.

RED, against a CONSTRUCTED subject in the shape the existing category-bar cases use: a row whose live element is `admittedAs: "element"` is refused; a row whose reason omits `DESIGN.md §1.2a` is refused; a row whose reason omits the `n.nn:1 light / n.nn:1 dark` form is refused; a well-formed row on a `painted-child` element passes. The census length and per-category pins stay at their current values in this task, so the live census is untouched.

GREEN: add `inner-chrome` to `ResidueCategory` and `RESIDUE_CATEGORIES`, add its `CATEGORY_BARS` line, and add its branch to `validateRow` reading `el.admittedAs`.

## Task 5 — the sweep

<!-- task: red=`pnpm vitest run tests/styles/_metaControlOutlineResidue.test.ts` red-state=authored red-target=`components/admin/wizard/VenueMapTile.tsx:123` why=`the Directions visual still paints border border-border-strong on bg-surface, so the opted-in census reports its key unregistered along with 22 other swap targets and 12 registrations, and the census-equality assertion fails on 29 keys` ac=AC-6,AC-7,AC-9,AC-11,AC-15,AC-16 -->

**What is red and why:** with the guard opted in and nothing repaired, the census reports 29 unregistered keys covering 35 elements. That red is the deliverable; record it before repairing.

**STEP 1, the red.** Opt `residueOf` in at `tests/styles/controlOutlineResidue.ts:449` with `{ textEntry: true, paintedChildren: true }`, thread the same options through the four helpers in `_metaControlOutlineResidue.test.ts` (lines 232, 268, 600, 1767), run the suite, and commit the failure output to docs/superpowers/specs/probes/2026-08-26-control-outline-cover-red-at-head.txt (created by this task). It must name the 35 elements of spec §6.1 and §6.2 and nothing else. **If it names an element those tables do not hold, stop: the spec's population is wrong and the plan is invalid until it is re-derived.**

**STEP 2, Family A, 13 sites**, each to the token its GROUND requires (spec §9): `app/admin/settings/admins/AddAdminForm.tsx:73` and `app/admin/settings/admins/AddAdminForm.tsx:84`; `components/admin/BellPanel.tsx:838` and `components/admin/BellPanel.tsx:849`; `components/admin/ShowsTable.tsx:455`; the shared `CONTROL` constant in `components/admin/dev/MaterializeCard.tsx` (covering `components/admin/ShowsTable.tsx:152`, `components/admin/ShowsTable.tsx:164`, `components/admin/ShowsTable.tsx:179`); `components/admin/dev/SwitcherControls.tsx:119`; `components/admin/telemetry/EventFilters.tsx:40` and `components/admin/telemetry/EventFilters.tsx:101`; `components/admin/wizard/step3ReviewSections.tsx:4195`; `components/shared/ReportModal.tsx:705`.

**STEP 3, the hover half.** `components/admin/dev/SwitcherControls.tsx:122` moves `hover:border-accent` to `hover:border-accent-on-bg` in the same edit as its rest, per `DESIGN.md:309-316`. It is the only site in the repo with this defect (§4.5).

**STEP 4, Family B swaps, 10 sites.** `components/admin/wizard/VenueMapTile.tsx:121`; `components/admin/OnboardingWizard.tsx:258` (the `pillState` done arm at `components/admin/OnboardingWizard.tsx:240` only); `components/admin/ShowRowActions.tsx:647` (both arms); `components/admin/wizard/CrewRowActions.tsx:270` (both arms); `components/admin/wizard/step3ReviewSections.tsx:1226`, `components/admin/wizard/step3ReviewSections.tsx:1768`, `components/admin/wizard/step3ReviewSections.tsx:1779`, `components/admin/wizard/step3ReviewSections.tsx:3788`; `components/admin/ReSyncButton.tsx:213`; `components/admin/telemetry/CronRunSummaryCard.tsx:26`.

**STEP 5, the twelve registrations.** `switch-track`, citing `DESIGN.md §1.2a` and the 1.43:1 / 1.75:1 OFF ring: `components/admin/telemetry/AutoRefreshControl.tsx:105` and `components/admin/settings/DeveloperToggleButton.tsx:93`. `inner-chrome`, each citing §1.2a's non-interactive-chrome clause and recording its measured ratio: `components/admin/IgnoredSheetsDisclosure.tsx:80` and `components/admin/IgnoredSheetsDisclosure.tsx:97`; `components/admin/RecentAutoAppliedStrip.tsx:474`; `components/admin/nav/AdminNav.tsx:154`; `components/admin/ShowsTable.tsx:288`; `components/admin/wizard/step3ReviewSections.tsx:2431`; `components/admin/UnarchiveShowButton.tsx:113`; `components/admin/ArchiveShowButton.tsx:232`, `components/admin/ArchiveShowButton.tsx:243`, `components/admin/ArchiveShowButton.tsx:253`. The last two share a key at multiplicity two and therefore take TWO rows (§4.2).

**STEP 6, the pins.** `_metaControlOutlineResidue.test.ts:386` to 22; `_metaControlOutlineResidue.test.ts:392` to 5; a new `count("inner-chrome")` assertion at 10; `_metaControlOutlineResidue.test.ts:393`, `_metaControlOutlineResidue.test.ts:394`, `_metaControlOutlineResidue.test.ts:400`, `_metaControlOutlineResidue.test.ts:401`, `_metaControlOutlineResidue.test.ts:402` unchanged. `tintedPlateOutline.test.ts:215` `neutralFaintCount` 4 to 9 (§4.3).

**STEP 7, the prose this task's code invalidates.** `DESIGN.md:319-329` (what the sweep reached), the `DESIGN.md:260-261` switch-track mechanism sentence, the §1.2a Family B sorting rule, and `tests/styles/subtleInteractiveScan.ts:15-23`.

GREEN: the same command passes with the census at 22 rows.

## Task 6 — the tinted plate

<!-- task: red=`pnpm vitest run tests/styles/tintedPlateOutline.test.ts` red-state=authored red-target=`components/admin/MaintenanceResetButtons.tsx:308` why=`the reset confirm field carries border-text-faint beside focus-visible:ring-offset-warning-bg, so once the scan is opted in the derived arm admits it as a 9th subject and fails both of its assertions` ac=AC-10,AC-12 -->

**What is red and why:** the derived arm gains a member carrying the neutral token on a plate.

RED: opt the scan in at `tests/styles/tintedPlateOutline.test.ts:56`. The derived list moves 8 to 9 and the new member fails. Add the `--color-control-outline-tinted` vs `--color-bg` RELATION to `tests/styles/secondary-action-contrast.test.ts` (clears 3:1 in both themes, read off the live tokens), which also fails until the `DESIGN.md` row exists.

GREEN: move `components/admin/MaintenanceResetButtons.tsx:308` to `border-control-outline-tinted`; INVERT the "left alone" pin at `tests/styles/tintedPlateOutline.test.ts:252-261` rather than deleting it, asserting the plate token with the ratification and its date in the docstring, exactly as `DESIGN.md:337-352` records for the ShareHub skin; add the row (3.82:1 / 5.22:1) to `DESIGN.md` §1.2; rewrite `DESIGN.md:412-418`, `DESIGN.md:445-449` and `tests/styles/tintedPlateOutline.test.ts:33-41`.

## Task 7 — layout dimensions, in a real browser

<!-- task: red=`pnpm heavy pnpm test:e2e tests/e2e/control-outline-dimensions.layout.spec.ts` red-state=authored red-target=`tests/e2e/control-outline-dimensions.layout.spec.ts` why=`the spec file does not exist, so the run collects nothing; once authored, each pair asserts a rect relationship that only the shipped classes satisfy` ac=AC-13 -->

Assert spec §14's five parent/child pairs by `getBoundingClientRect()` at 390px, light and dark, within 0.5px. Server boot: the repo's Playwright config's own `webServer` (`playwright.config.ts`, prod build, 127.0.0.1-pinned port). Readiness gate: a per-spec hydration wait in the shape of `tests/e2e/published-review-modal.reopen.spec.ts:48`, never `networkidle` alone. Any `locator.evaluate` sampler that can outlive its element is written detach-safe.

## Task 8 — transition audit, and re-score the three enrolled surfaces

<!-- task: red=`pnpm vitest run tests/styles/controlOutlineTransitions.test.ts` red-state=authored red-target=`tests/styles/controlOutlineTransitions.test.ts` why=`the suite does not exist, so nothing asserts that each swapped ternary keeps its transition-colors or is deliberately instant, and nothing covers the wizard pill's six state pairs` ac=AC-13,AC-17 -->

The transition suite walks every ternary render among the swapped elements and asserts each keeps its `transition-colors` or is deliberately instant, covering both compound cases spec §15 names.

Then the score. Announce the class-lock take to bl-orch at `wY:p8` before the run and the release after. `pnpm heavy:mutation pnpm mutation:guards`, never plain `pnpm heavy`. The shard is derived by LPT from the registry (`tests/mutation/source/shardPartition.ts:90`), never carried by hand. Apply the §4.4 siteId shift by construction, re-measure `millisPerBoot` for the two opted-in suites, reconcile `tests/mutation/_metaPremiseContract.test.ts`'s per-suite premise counts, and re-verify each `accepted` reason by READING its new site. `controlOutlineScan` has `scoreFloor: 1` and no slack.

## Task 9 — invariant-8 dual gate

<!-- task: red=`pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-26-control-outline-cover-widening.md:5` why=`the closeout marker names a §12 that does not yet hold dispositions, so the closeout meta-test has no recorded critique or audit outcome to read` ac=AC-14 -->

Run both halves of the AGENTS.md invariant-8 gate on the affected diff, with the canonical v3 setup gates (the context.mjs context load of PRODUCT.md and DESIGN.md, then the register reference read). Every P0 and P1 fixed in-branch.

This task's commit does three things together, per §0: it records the findings and dispositions in §12, it rewrites this paragraph to name both halves explicitly, and it adds the filled `impeccable-gate:` line at the top of this file. None of the three is valid without the other two.

## Task 10 — archive the row

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:81` why=`the archived entry still carries **Status:** IN PROGRESS with a Branch field, so the archives-hold-no-in-flight-work filter matches it and the assertion fails on a non-empty list` ac=AC-9 -->

**Citation note.** A marker's `red-target=` rejects a path with no directory separator
(`lib/specLint/citations.ts:55`), so the ledger entry that actually carries the defect cannot be cited
here: `BACKLOG.md` and `BACKLOG-archive.md` both sit at the repo root. The target names the assertion
that fails and the `why=` names the ledger state that makes it fail, which is the closest legal form.
The red is still produced by the ledger content this task writes, not by anything test-local.

Graduate `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` into the archive with both rulings, the derived population, the corrected line anchors, the two sites `DESIGN.md` named that the row missed, and the switch-track fence. The IN PROGRESS marker comes off in the SAME commit that archives it, and that commit is the PR's last.

<!-- tasks: end -->

## 12. Invariant-8 dual-gate dispositions

Filled by Task 9.
