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

The marker contract is red-then-green on the SAME command inside one task. The widened cover and the repairs it names cannot be separated without breaking that cycle: opting the residue guard in makes `_metaControlOutlineResidue` red on 29 keys covering 35 elements at once, and any task repairing only some of them leaves the same command red at its own end. So Task 5 carries the opt-in, all 23 swaps, the 12 registrations and the pin moves, and its body records the observed red before the repairs. That is the row's own sequence executed inside one commit rather than spread across four red ones.

Task 6 is separable because it reds a DIFFERENT command: the tinted-plate guard's own opt-in.

**The declared region covers Tasks 1 to 6 and stops there, and that is a correction rather than a convenience.** The region's contract is red-then-green on ONE command inside one task, and Tasks 7 to 10 cannot satisfy it, each for its own reason. Task 7's e2e spec and Task 8's transition suite are REGRESSION PINS: they assert relationships that already hold, so a guard test that passes the moment it is authored is exactly what the contract rejects, and a marker whose only "red" is the file not existing yet is a test-local red the RED-validity rule forbids by name. Task 9's guard validates marker GRAMMAR and disclaims any check on whether the gate ran or its findings are honest (`tests/docs/_invariant8Closeout.ts:11-16`), so a `why=` claiming it reads §12 dispositions asserts something the guard does not do. Task 10's defect lives in `BACKLOG.md`, a root-level file a marker cannot cite at all (`lib/specLint/citations.ts:55`).

The first draft gave all four markers anyway, and every one of them was invalid. Enrolment is opt-in by design, so the honest form is to enrol what has a cycle and to state what the other four owe instead. **What they owe is written into each task**, and it is not weaker than a marker: a planted defect that must be observed failing before the task is done. A pin nobody has watched fail is a pin nobody has tested.

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

Fifteen call sites, every one dispositioned: **two opt in, five thread options into a fixture helper** (the four in `_metaControlOutlineResidue.test.ts` plus `tests/styles/interactiveScanCore.test.ts:68`), **and eight keep the default**. 2 + 5 + 8 = 15.

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

Run, not described. `stripCommentsForFile` takes `(src, filePath)` in that order and resolves only from the repo root, so the script sits at the root while it runs:

```
$ cat > tmp-count.mts <<'EOF'
import { readFileSync } from "node:fs";
import { stripCommentsForFile } from "./tests/_shared/stripComments";
const f = "components/admin/wizard/step3ReviewSections.tsx";
const raw = readFileSync(f, "utf8");
console.log("code-only:", (stripCommentsForFile(raw, f).match(/border-text-faint/g) ?? []).length);
console.log("raw:      ", (raw.match(/border-text-faint/g) ?? []).length);
EOF
$ pnpm exec tsx tmp-count.mts && rm tmp-count.mts
code-only: 4
raw:       6
```

Code-only 4 is the number `neutralFaintCount` records; raw 6 counts the two occurrences inside comments at `components/admin/wizard/step3ReviewSections.tsx:1416` and `components/admin/wizard/step3ReviewSections.tsx:1420`, which is the inflation the registry's own docstring warns about.

No other file this diff touches appears in that registry. Checked against all seven rows (`DataQualityWarningControls`, `archivedTabOffer`, `PublishedArchivedTabOffer`, `RoleMappingRow`, `lib/ui/actionClass.ts`, `RescanSheetButton`, `step3ReviewSections`).

**4.4 The `accepted` mutation rows are line-keyed, and the shift is computed, not discovered.**

A `siteId` is `<operator>:<line>:<column>:<mutation>`, so an insertion above an accepted site invalidates the row and the score reds on a survivor nobody introduced.

The inventory is DERIVED, not counted: two hand counts of one of these arrays disagreed with each other and with the array during the spec stage, so the plan carries the extractor and its output.

```
$ python3 - <<'PY'
import re
s = open("tests/mutation/source/registry.ts").read()
for sid in ["interactiveScanCore", "controlOutlineScan", "controlOutlineResidue"]:
    i = s.index(f'id: "{sid}"'); j = s.find('    id: "', i + 10)
    ids = re.findall(r'siteId: "([^"]+)"', s[i : j if j > 0 else len(s)])
    print(sid, len(ids), sorted({int(x.split(":")[1]) for x in ids}))
PY
interactiveScanCore    11 [141, 153, 180, 236, 285, 312, 380, 383, 394]
controlOutlineScan      0 []
controlOutlineResidue  14 [45, 51, 62, 80, 307, 321, 324, 373, 415, 504, 591, 659]
```

`interactiveScanCore`: `ScanElement` ends at `tests/styles/interactiveScanCore.ts:65`, so adding `admittedAs` there inserts N lines above ALL eleven and every one shifts by exactly +N; columns are unaffected. Everything else this task adds (`ScanOptions` at ~865, the resolution helpers at ~876) lands below 394.

`controlOutlineResidue`: the additions at roughly 463-476 sit above **four rows on lines 504, 591 and 659** (591 carries two), so those four shift and the **ten rows on lines 45 through 415** do not (415 also carries two). Four plus ten is the fourteen the extractor counted, which is the check that the split is over ROWS and not over lines. The import change and the `residueOf` signature change are in place, adding no line, and `controlOutlineScan` has an empty `accepted` with nothing to shift.

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

## 5. Dimensional Invariants, verbatim

`docs/agents/writing-plans.md:8` requires the plan body to carry the spec's exact list rather than a
pointer to it. Copied from spec §14; the spec is canonical if the two ever diverge.

Every repair in §6 replaces one border COLOUR token with another. Nothing here changes a border
width, a padding, a radius or a display mode, so no box model moves. Stated anyway, because a
colour-only claim is exactly the kind that turns out to be false once a diff exists.

| Parent | Child | Relationship | What guarantees it |
| --- | --- | --- | --- |
| `<button>` `components/admin/ShowRowActions.tsx:631` (`min-h-tap-min min-w-tap-min`) | `<span>` at `components/admin/ShowRowActions.tsx:647` | child is the 32px visual inside the 44px target, deliberately smaller | `size-8` on the child, `min-h-tap-min min-w-tap-min` on the parent; neither is touched |
| `<button>` `components/admin/wizard/CrewRowActions.tsx:260` (`size-tap-min`) | `<span>` at `components/admin/wizard/CrewRowActions.tsx:270` | same | `size-8` on the child; neither is touched |
| `<a>` `components/admin/wizard/step3ReviewSections.tsx:1217` (`size-tap-min`) | `<span>` at `components/admin/wizard/step3ReviewSections.tsx:1226` | same | `size-8` on the child; neither is touched |
| `<a>` `components/admin/wizard/VenueMapTile.tsx:134` (the whole tile) | `<span>` at `components/admin/wizard/VenueMapTile.tsx:121` | the child IS the 44px target here, absolutely positioned in the tile's bottom band | `min-h-tap-min` on the child, `absolute inset-x-2.5 bottom-2.5`; neither is touched |
| `<button>` `components/admin/ReSyncButton.tsx:175` (`min-h-tap-min min-w-tap-min`) | `<span>` at `components/admin/ReSyncButton.tsx:213` | the `max-sm:` skin is `h-8` inside the 44px rect, and the button keeps its real rect | `h-8` on the child; neither is touched |

**Border width is 1px at every swap target.** No target carries `border-2` or a side-only width, so a
colour swap cannot change a computed size. AC-15 asserts the width utility set is identical before and
after across the whole swap.

## 6. Transition Inventory, verbatim

`docs/agents/writing-plans.md:9` requires the same of the transition table. Copied from spec §15, all
THREE of its tables. Task 8 asserts over this whole inventory, not over a subset of it.

THREE swap targets animate their outline colour, and two REGISTERED tracks do. The swap changes what is
tweened on the three; the two tracks keep their recipe and are here so the inventory is complete over
what the widened cover admits, not only over what moves. Every other target has no colour transition,
which is stated rather than left blank.

`components/admin/ShowRowActions.tsx:647` and `components/admin/wizard/CrewRowActions.tsx:270` are
two-state (closed, open), so one unordered pair each, listed below in both directions.

| Element | Pair | Transition |
| --- | --- | --- |
| `components/admin/ShowRowActions.tsx:647` | closed to open | `transition-colors duration-fast`, unchanged; the tween now runs `text-faint` unfilled to `text-faint` on `surface-sunken` instead of `border` to `border-strong` |
| `components/admin/ShowRowActions.tsx:647` | open to closed | the same tween in reverse, unchanged |
| `components/admin/wizard/CrewRowActions.tsx:270` | both directions | byte-identical recipe to the two rows above |
| `components/admin/telemetry/AutoRefreshControl.tsx:105` | OFF to ON, ON to OFF | `transition-colors`, unchanged, and the recipe is unchanged: the track is registered, not swapped |
| `components/admin/settings/DeveloperToggleButton.tsx:93` | OFF to ON, ON to OFF | same, through `TRACK_BASE`; registered, not swapped |

`components/admin/OnboardingWizard.tsx:258` has FOUR states, so six pairs, and the pill DOES animate:
`base` at `components/admin/OnboardingWizard.tsx:166` carries `transition-colors duration-fast` and the
visual is `cn(base, pillState)`. Only the `isDone` arm's border moves in this diff
(`border-border-strong` to `border-text-faint` at `components/admin/OnboardingWizard.tsx:240`), so every
pair with `done` on one side changes what is tweened and the other three do not.

| Pair | Border endpoints after the swap | Transition |
| --- | --- | --- |
| active to done | `accent-edge` to `text-faint` | `transition-colors duration-fast`; the done endpoint moves, the tween is unchanged in kind |
| done to active | `text-faint` to `accent-edge` | same, reversed |
| visited to done | `transparent` to `text-faint` | same; a transparent endpoint tweens to a visible one, as it did before at a lower weight |
| done to visited | `text-faint` to `transparent` | same, reversed |
| unreached to done | `transparent` to `text-faint` | same; `unreached` and `visited` share the border token and differ in text colour |
| done to unreached | `text-faint` to `transparent` | same, reversed |
| active to visited, visited to active | `accent-edge` to `transparent` | unchanged by this diff |
| active to unreached, unreached to active | `accent-edge` to `transparent` | unchanged by this diff |
| visited to unreached, unreached to visited | `transparent` to `transparent` | unchanged by this diff; the border is not what distinguishes these two |

Every other swap target:

| Element | Pair | Transition |
| --- | --- | --- |
| every Family A field | rest to focus, focus to rest | the focus cue is a `focus-visible:ring-*`, not a border tween; unchanged in both directions |
| `components/admin/dev/SwitcherControls.tsx:119` | rest to hover, hover to rest | no `transition-colors` on this element today. The hover token moves from `accent` to `accent-on-bg` and the switch stays instant, matching its two neighbours at `components/admin/dev/SwitcherControls.tsx:29` and `components/admin/dev/SwitcherControls.tsx:145`, which are also instant |
| `components/admin/wizard/VenueMapTile.tsx:121`, `components/admin/ReSyncButton.tsx:213`, `components/admin/telemetry/CronRunSummaryCard.tsx:26`, the four `step3ReviewSections` visuals | single-state | no state pair exists; instant by construction |

**Compound cases.** A menu trigger's open/closed tween can be interrupted by a re-render that swaps the
whole className string, because the two arms are a ternary rather than a variant: true today, unchanged
by a colour swap, no arm added or removed. And a wizard pill can change `pillState` while a previous
`transition-colors` is still running, since the four arms are also a ternary chain on one element; the
browser retargets the running colour tween, which is the behaviour today at the old token.

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

**AC-1's control, and why the obvious form of it is worthless.** Comparing flags-off against an omitted argument compares two paths through the SAME changed implementation: both can drift identically and pass. The comparison that means something is against `b30413cf5`, and it has two halves because they answer different questions.

*One-time, exact, recorded.* Materialise the base scanner (`git show b30413cf5:tests/styles/interactiveScanCore.ts` into a temp module), run both over `process.cwd()`, and assert the `file:line:tag` lists are byte-identical. Same for AC-2's 421 and AC-5's 362 / 362 / 57 / 362. These numbers are true of THIS corpus at THIS base, so they are a task-time verification whose transcript goes in the commit message, not a shipped test: pinned exactly, they would red on every unrelated PR that adds a control, which is why the live suites all use `>= 300` / `> 200` floors.

*Shipped, structural, drift-proof.* What "unchanged" actually means survives corpus growth and is asserted permanently: with both flags off, no returned element has `admittedAs: "painted-child"`, and no `textarea`, no `select`, and no `<input>` outside `type="checkbox" | "radio"` appears. Over the live corpus, and over a fixture that contains one of each so the assertion cannot pass vacuously.

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

**STEP 1, the red, and read what the command actually prints.** Opt `residueOf` in at `tests/styles/controlOutlineResidue.ts:449` with `{ textEntry: true, paintedChildren: true }`, thread the same options through the four helpers in `_metaControlOutlineResidue.test.ts` (lines 232, 268, 600, 1767), and run the suite.

The suite's failure list is **keyed**, not per element: `_metaControlOutlineResidue.test.ts:410-414` iterates `LIVE.keys` and prints ONE representative element per key. So it reports **29 unregistered keys**, not 35 elements, and a stop condition phrased over 35 elements cannot be evaluated from it. Two artifacts, therefore, and both are committed to docs/superpowers/specs/probes/2026-08-26-control-outline-cover-red-at-head.txt (created by this task):

1. the suite's own failure output, whose 29 keys must be exactly the 29 the spec's §7.1 derivation names;
2. the per-ELEMENT enumeration, produced by the same script that produced the spec's committed transcript (`docs/superpowers/specs/probes/2026-08-26-control-outline-cover-red.txt`), whose 35 rows must be exactly spec §6.1 plus §6.2.

**If either artifact holds a member its table does not, stop: the spec's population is wrong and this plan is invalid until it is re-derived.** AC-9 is checked against artifact 2, because its unit is the element.

**STEP 2, Family A, 13 sites**, each to the token its GROUND requires (spec §9): `app/admin/settings/admins/AddAdminForm.tsx:73` and `app/admin/settings/admins/AddAdminForm.tsx:84`; `components/admin/BellPanel.tsx:838` and `components/admin/BellPanel.tsx:849`; `components/admin/ShowsTable.tsx:455`; the shared `CONTROL` constant at `components/admin/dev/MaterializeCard.tsx:39` (covering `components/admin/dev/MaterializeCard.tsx:152`, `components/admin/dev/MaterializeCard.tsx:164` and `components/admin/dev/MaterializeCard.tsx:179`); `components/admin/dev/SwitcherControls.tsx:119`; `components/admin/telemetry/EventFilters.tsx:40` and `components/admin/telemetry/EventFilters.tsx:101`; `components/admin/wizard/step3ReviewSections.tsx:4195`; `components/shared/ReportModal.tsx:705`.

**STEP 2b, `EventFilters`, which is the one site where repairing what the red names is not enough** (spec §6.4). Its weak paint sits in a dead fallback at `components/admin/telemetry/EventFilters.tsx:46` while both live call sites supply their own className at `components/admin/telemetry/EventFilters.tsx:80` and `components/admin/telemetry/EventFilters.tsx:130`. Swapping only the fallback clears `isResidue` and leaves both rendered controls weak. So, in order: DELETE the `className` prop from `FilterTextInput` (its declaration at `components/admin/telemetry/EventFilters.tsx:25` and its type at `components/admin/telemetry/EventFilters.tsx:31`); give it `grow?: boolean`; make the element's className `cn("min-h-tap-min rounded border border-text-faint bg-surface px-2", grow && "flex-1")` with `cn` from `lib/ui/cn.ts:45`; pass `grow` at `components/admin/telemetry/EventFilters.tsx:80` and nothing at `components/admin/telemetry/EventFilters.tsx:130`.

**The assertion comes FIRST, and the first draft of it was tautological.** A fixture asserting "a planted caller `className="!border-border"` cannot reach the element" passes on the BROKEN shape too, because the scanner never follows prop flow at all (`tests/styles/interactiveScanCore.test.ts:85-87` pins exactly that), so the planted class is invisible either way. It proves nothing about whether the prop exists.

The discriminating property is that the element's ENTIRE className is readable, which is what "no caller can contribute a token" means in the only vocabulary the guard has. So AC-9b is:

```
the scanned element for components/admin/telemetry/EventFilters.tsx:40 has unresolved === false
```

On today's shape the className is `className ?? "<literal>"` with `className` a prop the resolver cannot read, so `unresolved` is TRUE and the assertion reds. It stays true for any shape that merges a caller string, including the `cn(base, className)` form spec §6.4 rejected, so this single assertion also rules out the wrong repair. It goes green only when every contributing expression resolves to file-local literals. The implementation must therefore reach a form the resolver reads end to end; if `grow && "flex-1"` does not (check `resolveExpression`'s binary handling before writing it), use a ternary over two literals.

Order: write that assertion in `tests/styles/interactiveScanCore.test.ts` over the LIVE corpus, observe it red, then make the production edit above, then observe it green. That is a real red-green cycle inside Task 5 on a second command, and the commit records both observations.

**STEP 3, the hover half.** `components/admin/dev/SwitcherControls.tsx:122` moves `hover:border-accent` to `hover:border-accent-on-bg` in the same edit as its rest, per `DESIGN.md:309-316`. It is the only site in the repo with this defect (§4.5).

**STEP 4, Family B swaps, 10 sites.** `components/admin/wizard/VenueMapTile.tsx:121`; `components/admin/OnboardingWizard.tsx:258` (the `pillState` done arm at `components/admin/OnboardingWizard.tsx:240` only); `components/admin/ShowRowActions.tsx:647` (both arms); `components/admin/wizard/CrewRowActions.tsx:270` (both arms); `components/admin/wizard/step3ReviewSections.tsx:1226`, `components/admin/wizard/step3ReviewSections.tsx:1768`, `components/admin/wizard/step3ReviewSections.tsx:1779`, `components/admin/wizard/step3ReviewSections.tsx:3788`; `components/admin/ReSyncButton.tsx:213`; `components/admin/telemetry/CronRunSummaryCard.tsx:26`.

**STEP 5, the twelve registrations.** `switch-track`, citing `DESIGN.md §1.2a` and the 1.43:1 / 1.75:1 OFF ring: `components/admin/telemetry/AutoRefreshControl.tsx:105` and `components/admin/settings/DeveloperToggleButton.tsx:93`. `inner-chrome`, each citing §1.2a's non-interactive-chrome clause and recording its measured ratio: `components/admin/IgnoredSheetsDisclosure.tsx:80` and `components/admin/IgnoredSheetsDisclosure.tsx:97`; `components/admin/RecentAutoAppliedStrip.tsx:474`; `components/admin/nav/AdminNav.tsx:154`; `components/admin/ShowsTable.tsx:288`; `components/admin/wizard/step3ReviewSections.tsx:2431`; `components/admin/UnarchiveShowButton.tsx:113`; `components/admin/ArchiveShowButton.tsx:232`, `components/admin/ArchiveShowButton.tsx:243`, `components/admin/ArchiveShowButton.tsx:253`. The last two share a key at multiplicity two and therefore take TWO rows (§4.2).

**STEP 5b, AC-15, with an instrument that has been run rather than sketched.** The claim is that no swap moved layout. Counting width tokens per SOURCE OCCURRENCE gets this wrong on the one target whose className moves: `components/admin/telemetry/EventFilters.tsx:40` has three `border` occurrences at base (the dead fallback plus two call sites) and one after, while the rendered element carries exactly one either way. So the comparison is per ELEMENT, through the scanner, which is also the only vocabulary the rest of this arc uses.

scripts/ac15-width-parity.mts (created by this task), run twice inside it: once after STEP 1 (opt-in, nothing repaired) and once at the end.

**The key is an ORDINAL, not a line.** A line is not an identity across this task: STEP 2b adds a `cn` import to `components/admin/telemetry/EventFilters.tsx`, which shifts every element below it, and a line-keyed comparison would report the correct repair as `<absent>` on both targets and stop the task. The stable identity is the Nth element of that tag in that file, in walk order, which no colour swap reorders.

```ts
import { scanInteractiveElements, allStrings } from "../tests/styles/interactiveScanCore";
const WIDTH = /^(?:border|border-[tblrxy]|border-\d+|border-[tblrxy]-\d+)$/;
export function widthsByElement(root: string, opts?: ScanOptions): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const el of scanInteractiveElements(root, opts)) {
    const stem = `${el.file}:${el.tag}`;
    const n = seen.get(stem) ?? 0;
    seen.set(stem, n + 1);
    const toks = allStrings(el).flatMap((s) => s.split(/\s+/))
      .filter((t) => WIDTH.test(t.replace(/^[^:]*:/, ""))).sort();
    out.set(`${stem}#${n}`, toks.join(" "));
  }
  return out;
}
export function compare(a: Map<string,string>, b: Map<string,string>, targets: string[]): string[] {
  return targets.filter((k) => (a.get(k) ?? "<absent>") !== (b.get(k) ?? "<absent>"))
    .map((k) => `${k}: before=[${a.get(k) ?? "<absent>"}] after=[${b.get(k) ?? "<absent>"}]`);
}
```

The variant-prefix strip (`t.replace(/^[^:]*:/, "")`) is deliberate: `max-sm:border` is a width on a responsive skin and must be compared like any other, which matters for `components/admin/ReSyncButton.tsx:213`.

**Both controls run at plan time against the live tree**, because an instrument nobody has watched succeed and fail is not an instrument:

```
POSITIVE CONTROL (unchanged tree):     targets=362 differences=0
NEGATIVE CONTROL (planted width):      app/admin/dev/page.tsx:button#0: before=[border] after=[border-2]
KEY-STABILITY CONTROL (capture, then insert 2 lines at the top of
components/admin/telemetry/EventFilters.tsx, then compare):
                                       targets=362 differences=0
```

Zero differences on an unchanged tree; a single planted `border` to `border-2` named with both sides; and zero differences after a two-line insertion above every element in one file, which is the control for the line-instability the ordinal key exists to remove. The third one is captured to a snapshot BEFORE the insertion and compared after, because comparing a shifted tree to itself would have passed under the broken key too. In Task 5 the two scans are the real before and after over the 23 swap targets, with both flags on, and the run's output goes in the commit message. Any non-empty difference is a layout change this arc did not authorise and stops the task.

**STEP 6, the pins.** `_metaControlOutlineResidue.test.ts:386` to 22; `_metaControlOutlineResidue.test.ts:392` to 5; a new `count("inner-chrome")` assertion at 10; `_metaControlOutlineResidue.test.ts:393`, `_metaControlOutlineResidue.test.ts:394`, `_metaControlOutlineResidue.test.ts:400`, `_metaControlOutlineResidue.test.ts:401`, `_metaControlOutlineResidue.test.ts:402` unchanged. `tintedPlateOutline.test.ts:215` `neutralFaintCount` 4 to 9 (§4.3).

**STEP 7, the prose this task's code invalidates.** `DESIGN.md:319-329` (what the sweep reached), the `DESIGN.md:260-261` switch-track mechanism sentence, the §1.2a Family B sorting rule, and `tests/styles/subtleInteractiveScan.ts:15-23`.

GREEN: the same command passes with the census at 22 rows.

## Task 6 — the tinted plate

<!-- task: red=`pnpm vitest run tests/styles/tintedPlateOutline.test.ts` red-state=authored red-target=`components/admin/MaintenanceResetButtons.tsx:308` why=`the reset confirm field carries border-text-faint beside focus-visible:ring-offset-warning-bg, so once the scan is opted in the derived arm admits it as a 9th subject and fails both of its assertions` ac=AC-10,AC-12 -->

**What is red and why:** the derived arm gains a member carrying the neutral token on a plate.

RED: opt the scan in at `tests/styles/tintedPlateOutline.test.ts:56`. The derived list moves 8 to 9 and the new member fails both of its assertions. That is the whole red, and the marker's command is this suite alone.

**The contrast relation is an ADDITION, not part of the red, and saying so is the correction.** `--color-control-outline-tinted` vs `--color-bg` already measures 3.82:1 light and 5.22:1 dark on the live tokens, so a relation assertion over them passes the moment it is written and could never be a red. It ships under AC-10 as a regression pin beside the `DESIGN.md` §1.2 row it records, in the same commit, exactly as the AGENTS.md pre-code mechanical UI gate requires of a newly-pinned pair. Its own check at authoring time is a planted retune, not a red step.

GREEN: move `components/admin/MaintenanceResetButtons.tsx:308` to `border-control-outline-tinted`; INVERT the "left alone" pin at `tests/styles/tintedPlateOutline.test.ts:252-261` rather than deleting it, asserting the plate token with the ratification and its date in the docstring, exactly as `DESIGN.md:337-352` records for the ShareHub skin; add the row (3.82:1 / 5.22:1) to `DESIGN.md` §1.2; rewrite `DESIGN.md:412-418`, `DESIGN.md:445-449` and `tests/styles/tintedPlateOutline.test.ts:33-41`.

<!-- tasks: end -->

## Task 7 — layout dimensions, in a real browser

**Outside the declared region (§3): a regression pin, verified by a planted defect rather than by a red-green marker.**

Assert spec §14's five parent/child pairs by `getBoundingClientRect()` at 390px, light and dark, within 0.5px, in tests/e2e/control-outline-dimensions.layout.spec.ts (created by this task).

**Wiring is a step, not an assumption.** `playwright.config.ts` selects specs by an explicit basename alternation, so a new file that no alternation names collects NOTHING however it is invoked, including by explicit CLI path. This task adds the escaped basename control-outline-dimensions.layout to the `mobile-safari` alternation at `playwright.config.ts:83` (390px is that project's viewport) and confirms collection with `pnpm exec playwright test --list` BEFORE writing an assertion. The existing tap-target-inline-controls.layout entry in that same alternation is the precedent for the dotted form and for how the dot is escaped.

**Harness, corrected.** The `webServer` at `playwright.config.ts:263-267` runs `pnpm build && pnpm start` only under `CI`; locally it runs `pnpm dev`. Readiness gate: a per-spec hydration wait in the shape of `tests/e2e/published-review-modal.reopen.spec.ts:48`, never `networkidle` alone. Any `locator.evaluate` sampler that can outlive its element is written detach-safe. The run goes through `pnpm heavy` (non-interactive playwright is a heavy phase); `--ui` and `--debug` are never wrapped.

**Its own check, since no marker guards it.** Before the task is done, each of the five pairs is observed FAILING against a planted defect: temporarily remove the class that guarantees that pair (the child's `size-8`, the parent's `min-h-tap-min`, the tile span's `min-h-tap-min`), confirm the assertion reds, restore. A pin nobody has watched fail is a pin nobody has tested. Record the five observations in the commit message.

## Task 8 — transition audit, and re-score the three enrolled surfaces

**Outside the declared region (§3): a regression pin plus a measurement, neither of which is a red-green cycle.**

The transition suite, tests/styles/controlOutlineTransitions.test.ts (created by this task), ranges over §6's WHOLE inventory and not over the swapped elements alone: all three tables, so the two registered switch tracks and the non-ternary instant cases are covered as well as the ternaries. One case per row, plus the two compound cases §6 names. A round-1 draft scoped the walk to "ternary renders among the swapped elements", which could pass while covering neither the tracks nor the instant rows. **Its own check, and it is two plants because the inventory has two kinds of row.** For every row that names a transition, the assertion is observed failing against a planted REMOVAL of the `transition-colors` token it names. For every row declared deliberately instant (the Family A focus rows, `components/admin/dev/SwitcherControls.tsx:119`, and the single-state visuals in §6's third table), there is no token to remove, so the plant is the opposite one: ADD a `transition-colors` to that element and observe the instant-row assertion red. Both plants restored after. A round-1 draft claimed the removal plant for all of them, which is impossible for the rows that have nothing to remove. The wizard pill's six state pairs are asserted against `components/admin/OnboardingWizard.tsx:166`, which is where `transition-colors duration-fast` actually lives, so the suite reads the base rather than restating spec prose.

Then the score. Announce the class-lock take to bl-orch at `wY:p8` before the run and the release after. `pnpm heavy:mutation pnpm mutation:guards`, never plain `pnpm heavy`. The shard is derived by LPT from the registry (`tests/mutation/source/shardPartition.ts:90`), never carried by hand. Apply the §4.4 shift by construction: **eleven** `interactiveScanCore` rows shift by the lines inserted above source line 141, and **four** `controlOutlineResidue` rows (504, both at 591, and 659) shift by the lines the category additions insert. Re-measure `millisPerBoot` for the two opted-in suites, reconcile `tests/mutation/_metaPremiseContract.test.ts`'s per-suite premise counts, and re-verify each `accepted` reason by READING its new site, because a resolving siteId establishes nothing about what is there. `controlOutlineScan` has `scoreFloor: 1` and no slack. AC-17 is the criterion.

## Task 9 — invariant-8 dual gate

**Outside the declared region (§3).** `tests/docs/_invariant8Closeout.ts:11-16` says in its own words that it verifies a declaring unit CARRIES a well-formed claim, and not that the gate ran or that its findings are honest. So there is no command this task can turn from red to green by running the gate, and a `why=` claiming otherwise would assert something the guard does not do.

Run both halves of the AGENTS.md invariant-8 gate on the affected diff, with the canonical v3 setup gates (the context.mjs context load of PRODUCT.md and DESIGN.md, then the register reference read). Every P0 and P1 fixed in-branch.

This task's commit does three things together, per §0: it records the findings and dispositions in §12, it rewrites this paragraph to name both halves explicitly, and it adds the filled `impeccable-gate:` line at the top of this file. None of the three is valid without the other two.

**Its own planted failure**, which this task owes like the other unenrolled ones: make the two edits in the wrong order. Add the explicit half-names WITHOUT the marker line, run `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts`, and observe it red with "declares the invariant-8 dual gate but carries no valid impeccable-gate marker line". Then add the marker and observe it green. Both observations in the commit message. This is the guard doing the only thing it claims to do, which is why it is the right plant for it.

## Task 10 — archive the row

**Outside the declared region (§3).** The defect this task removes lives in `BACKLOG.md`, and a marker's `red-target=` rejects any path with no directory separator (`lib/specLint/citations.ts:55`), so the ledger entry cannot be cited in a marker at all.

Graduate `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` into `BACKLOG-archive.md` with both rulings, the derived population, the corrected line anchors, the two sites `DESIGN.md` named that the row missed, and the switch-track fence.

**The red is observed, not skipped.** Move the entry to the archive with its `**Status:** IN PROGRESS · **Branch:**` marker still attached and run `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`: the archives-hold-no-in-flight-work filter matches it and the assertion fails on a non-empty list. Record that output in the commit message, THEN remove the marker and confirm the same command green. The marker comes off in this commit, which is the PR's last, so it never reaches `main`.

## 12. Invariant-8 dual-gate dispositions

Filled by Task 9.
