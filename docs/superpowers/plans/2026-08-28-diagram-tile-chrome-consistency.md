# Plan — diagram tile chrome consistency

Spec: `docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md`. Closes `BL-DIAGRAM-TILE-CHROME-CONSISTENCY`. Effort S.

**Rewritten after plan review R1 returned BLOCKING on 8 findings.** The structural one: the first draft
split the class move and its invalidated consumers across four tasks with four commits, which
contradicts the spec's own lockstep requirement (`docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md:128`, which requires every one of them to land
in the same commit as the className move) and made AC-4's same-commit-as-AC-1 requirement impossible to
satisfy. The whole
lockstep is now ONE task and ONE commit, with a single RED run before it and a single GREEN run after.
Task count went 5 to 2 because commit-per-task and same-commit-lockstep together determine it; they are
not in tension once the tasks are drawn correctly.

## Pre-draft code verification

| Claim | Verified at |
| --- | --- |
| `DiagramTile` is exported | `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:26` imports it by name |
| the anchor className | `components/admin/wizard/step3ReviewSections.tsx:3938` |
| the image className | `components/admin/wizard/step3ReviewSections.tsx:3955` |
| the failed-branch `<span>` className | `components/admin/wizard/step3ReviewSections.tsx:3874` |
| the false comment to replace | `components/admin/wizard/step3ReviewSections.tsx:3926-3931` |
| the reconciliation write to `failed` | `components/admin/wizard/step3ReviewSections.tsx:3859-3867`, which never calls `onFailure` |
| the image-error write to `failed` | `components/admin/wizard/step3ReviewSections.tsx:4021`, which relocates focus only when the tile held it |
| §15 table 3 prose | `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` |
| the derived count assertion | `tests/styles/controlOutlineTransitions.test.ts:254`; its docblock quotes the same count at `tests/styles/controlOutlineTransitions.test.ts:229-230` |
| derivation output at base `60dece4d5` | four members: the spans at `components/admin/wizard/step3ReviewSections.tsx:1236`, `components/admin/wizard/step3ReviewSections.tsx:1778`, `components/admin/wizard/step3ReviewSections.tsx:1789`, plus the `<Image>` at `components/admin/wizard/step3ReviewSections.tsx:3940` |
| `neutralFaintCount: 9` pin | `tests/styles/tintedPlateOutline.test.ts:224`; its explanatory comment at `tests/styles/tintedPlateOutline.test.ts:221-223` |
| real-browser box assertion | `tests/e2e/step3-review-modal.layout.spec.ts:659` |
| real-browser placement pin | `tests/e2e/step3-review-modal.layout.spec.ts:626-636`; the placement-agnostic padding-box assertion below it at `tests/e2e/step3-review-modal.layout.spec.ts:638-647` |
| the font readiness gate already exists | `tests/e2e/step3-review-modal.layout.spec.ts:248` awaits `document.fonts.ready`, so this plan adds no readiness step and depends on that one |
| `premiseHolds(description, condition)` is the boolean form | `tests/_shared/premise.ts:36`; `premise(description, actual, mustExceed)` at `tests/_shared/premise.ts:26` is NUMERIC and is the wrong one here |
| the new suite's vitest project | `PARALLEL_TEST_GLOBS` includes `tests/components/**/*.test.{ts,tsx}` (`vitest.projects.ts:105`) |
| the new suite's CI wiring | `.github/workflows/unit-suite.yml` runs `unit-suite-nodb` as `--project=parallel` with no file filter, so a new file under `tests/components/` is collected by that job automatically and needs no workflow edit |
| the real-browser spec's owning config | `tests/e2e/standalone.config.ts:85` names the `step3-review-modal.layout` basename in its allow-list, under `standalone-chromium`; `playwright.config.ts` does NOT (only `.interactions` and `.agenda`), so the command is `test:e2e:standalone` |

## Structural meta-test inventory

Required declaration, and the disposition is NOT "none applies" — three structural meta-tests own
surfaces this diff touches, which is why the lockstep matters:

| Meta-test | Relation to this diff | Disposition |
| --- | --- | --- |
| `tests/styles/controlOutlineTransitions.test.ts` §15 table 3 block | derives the painted-child count this diff moves 4 to 3 | edited IN the lockstep commit: assertion, its comment, and the docblock quotation |
| `tests/styles/tintedPlateOutline.test.ts` | pins `neutralFaintCount: 9` for the component | value UNCHANGED (derived below); its explanatory comment is edited in the same commit |
| `tests/styles/tapTargetCensus.ts` | its row for the anchor states where the chrome lives | prose edited in the same commit; `line`, `tag`, `category` untouched |
| invariant-9 infra-contract registries (`tests/auth/_metaInfraContract.test.ts` and peers) | no Supabase call boundary is added or moved | none applies |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | no mutation surface, route handler, or server action is added | none applies |
| source-mutation registry (`tests/mutation/source/registry.ts`) | the diff adds no guard, proof, or equivalence surface — the new suite is an ordinary component suite, not a recognizer | none applies; enrolment is not owed |

## CI wiring

No workflow file changes. The new suite lands under `tests/components/` and is collected by
`unit-suite-nodb` (`--project=parallel`, unfiltered). The real-browser spec already runs under its
existing standalone config. Nothing in this diff adds a job, a matrix leg, or a required check.

## Pre-implementation mechanical UI checklist — runs BEFORE Task 1

The project rule is that this checklist precedes implementing a UI surface, because the invariant-8 gate
verifies rather than discovers. R1 correctly flagged that the first draft ran it last. It produces no
diff and therefore no commit; it is a gate on Task 1, listed here rather than as a task.

- em dash ban in user-visible copy: this diff adds NO user-visible copy, only class strings and comments.
- apostrophe literals: same, none added.
- 44px tap targets: the anchor's tap area is unchanged; `tests/styles/tapTargetCensus.ts:321` classifies
  it `full-bleed` on LAYOUT grounds (`relative` plus the aspect box plus a `fill` child), and this diff
  changes none of those three.
- canonical type and token classes: the three moved classes are copied verbatim from a string that
  already passes `better-tailwindcss/enforce-canonical-classes`. No new token is introduced, so no new
  contrast pin is owed (DESIGN.md's `bg-warning-bg` precedent does not apply).
- **No-RED declaration:** this checklist has no executable RED. `pnpm exec eslint --no-cache components/admin/wizard/step3ReviewSections.tsx` exits
  0 on the unrepaired tree, which R1 verified by running it. It is a discovery pass, and its output is
  the four dispositions above.

## Anti-tautology design for the new suite

The positive half asserts exact TOKEN membership, not substring containment, and that was a real defect
in the suite's first draft rather than a precaution. `expect(className).toContain("border")` is satisfied
by `border-text-faint` on its own — so a diff dropping the bare `border` utility, the class that actually
draws the 1px line while `border-text-faint` only colours it, would have passed every positive assertion
with the border gone from the page. The suite splits the class string and asserts set membership.

The image's assertion is exact string equality, which is what AC-1 actually says: its class string EQUALS
`object-cover`. R1 flagged that the first draft only rejected chrome-shaped classes, which would let
through a diff that ADDS something non-chrome-shaped to the image.

The negative half stays a SHAPE scan, because a negative keyed to today's token passes the moment someone
re-adds chrome under a different one:

    /(^|\s)(rounded(-|$)|border(-|$)|bg-)/

Premises, each closing a way an assertion could pass while proving nothing:

- the live branch must have rendered an `<img>`, or "the image carries no chrome" is true of a branch
  with no image;
- the failed branch must NOT have rendered one, or the two cases compare one element to itself;
- the regex must FIRE on the anchor's real className from the same render — not on a literal typed into
  the test — or its silence on the image means nothing. A separate case pins the other direction, that
  the regex does not match a bare fit class, which real data cannot supply.

## Dimensional invariants — reproduced verbatim from spec §7

Required by the project's writing-plans rule, and reproduced rather than summarised so the real-browser
assertions can be checked against it line by line.

| Parent | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| anchor `components/admin/wizard/step3ReviewSections.tsx:3938` | `<Image fill>` `components/admin/wizard/step3ReviewSections.tsx:3940` | child fills the anchor's padding box | `fill` emits `position:absolute; inset:0`; the anchor is `relative` |
| anchor `components/admin/wizard/step3ReviewSections.tsx:3938` | itself | outer box unchanged by the added border | Tailwind preflight sets `box-sizing: border-box`, so a 1px border consumes content box, not outer box |
| grid cell | anchor | anchor is full width of its cell | `w-full` |
| live tile | placeholder tile | identical outer box | both `aspect-4/3 w-full`; asserted in a real browser at `tests/e2e/step3-review-modal.layout.spec.ts:659` |

Discharge, per row. Row 1 by `tests/e2e/step3-review-modal.layout.spec.ts:638-647`, which is expressed as
`anchorW - borderLeft - borderRight` and therefore holds with the border on either element.

**Row 2 needs its own assertion, and R2 was right that the padding-box comparison cannot supply it.**
That comparison relates the image to the anchor's CURRENT padding box; it says nothing about whether the
anchor's OUTER box moved when the border arrived, and it never touches the `border-box` mechanism the row
names. A before/after claim is also not observable from one tree. So Task 1 adds two lines to the same
`page.evaluate` block: read `getComputedStyle(el).boxSizing` and assert it is `border-box`. That asserts
the stated MECHANISM directly, which is the part a single tree can prove; the consequence follows from
it arithmetically rather than being re-measured.

Row 4 by `tests/e2e/step3-review-modal.layout.spec.ts:659`. Row 3 is a class assertion,
covered by the new suite's shared-box case. The readiness gate these depend on already exists at
`tests/e2e/step3-review-modal.layout.spec.ts:248`. Detach safety: every measurement in that spec runs inside one `page.evaluate` against a
static harness with no navigation between query and read, so no handle can detach mid-measurement.

## Transition inventory — reproduced verbatim from spec §8

| State pair | Transition |
| --- | --- |
| live to failed, failed to live | instant, no animation needed; the branches are separate element trees and neither declares a transition |
| anchor rest to focus | instant. The ring recipe is unchanged by this diff, and the corner radius goes 12px to 6px via the unlayered global rule. The anchor carries no `transition-*`, so the change is not tweened |
| anchor focus to rest | the same, reversed |

| Compound case | Endpoints | Transition |
| --- | --- | --- |
| route A: focused live tile fails on an image error | anchor with `border-text-faint` at 6px, focused, becomes placeholder `<span>` with `border-border` at 12px; focus moves to a sibling tile | instant on both axes; no `transition-*` on either element |
| route A with no sibling to receive focus | same box endpoints; `components/admin/wizard/step3ReviewSections.tsx:4021` finds no sibling | instant; the focus destination is the handler's concern and is unchanged by this diff |
| route B: focused live tile reconciles to unavailable | same box endpoints; focus is NOT relocated, so it falls to `<body>` | instant; see L4 |

Executable discharge, per row:

- rows 1-3 of the first table: the suite's transition audit asserts neither box element declares
  `transition-*`, which is the only thing making "instant" true.
- route A: the suite focuses the anchor, fires the image error, and asserts the placeholder still carries
  the box. Focus RELOCATION on this route is already discharged by the existing
  `tests/components/admin/wizard/step3DiagramTile.failureFocus.test.tsx`, which this plan names as that
  half's owner rather than duplicating.
- route A with no sibling: discharged by the same existing suite, which covers the focus destination.
- route B: the suite rerenders with `hasPreviewSource` false while the anchor holds focus and asserts the
  box survives. R1 correctly flagged that the first draft covered only route A.

## Acceptance criteria this plan discharges

| id | claim | executable discharge |
| --- | --- | --- |
| AC-1 | the image class string is exactly `object-cover`; the anchor carries the box | new suite: exact string equality on the image, token membership on the anchor |
| AC-2 | `components/diagrams/Gallery.tsx` is unchanged by this diff | `git diff --name-only origin/main...HEAD` must not list it — asserted as a Task 2 step, since no unit test can see a file's absence from a diff |
| AC-3 | the §15 derivation finds three visuals, the tile `<Image>` not among them | `tests/styles/controlOutlineTransitions.test.ts` |
| AC-4 | the control-outline spec's prose says three, in the same commit as AC-1 | TWO checks, because it is two claims. Count parity: a new assertion in `tests/styles/controlOutlineTransitions.test.ts` reads `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md` and requires its §15 row to state the count the derivation returns. Same-commit: a Task 2 history check, below — a passing parity test says nothing about WHEN each side landed, which R2 correctly flagged |
| AC-5 | the real-browser layout spec is green at this head, box-equality among the passes | `test:e2e:standalone` |
| AC-6 | the `neutralFaintCount` pin does not move | `tests/styles/tintedPlateOutline.test.ts` |
| AC-7 | the full styles suite is green, fill and residue censuses included | `pnpm heavy pnpm vitest run tests/styles` |
| AC-8 | the real-browser pin asserts the ANCHOR carries the border and the image none | `tests/e2e/step3-review-modal.layout.spec.ts:626-636` after inversion |
| AC-9 | the tap-target census prose no longer states the chrome lives on the image, and that row's `line`, `tag` and `category` are unchanged | a Task 2 grep step plus `pnpm heavy pnpm vitest run tests/styles`, which runs the census; no Playwright command can see prose, which R1 correctly flagged |

<!-- tasks: depth=2 -->

## Task 1 — the lockstep: one RED run, one GREEN run, one commit

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx tests/styles/controlOutlineTransitions.test.ts ; pnpm heavy pnpm test:e2e:standalone tests/e2e/step3-review-modal.layout.spec.ts` ac=AC-1,AC-3,AC-4,AC-5,AC-8 -->

Everything the spec requires to land together lands here.

**The two halves of the RED command are sequenced with `;`, never `&&`, and that is load-bearing.** At
the RED point the vitest half FAILS by design, so `&&` would short-circuit and the browser half would
never run — which is precisely the unobserved-red defect this repair exists to close, reintroduced by an
operator. `;` runs both unconditionally. Read the two exit statuses separately: both must be non-zero at
RED, and both must be zero at GREEN, so the compound's own status is not the signal.

**The browser run is part of THIS task's RED, not Task 2's.** An earlier draft authored the inverted
assertion here and first ran it in Task 2, after the implementation had already landed — so the
inversion was never observed failing, and "it would have failed at the parent" is an argument, not a
red. It is a heavy phase and it queues; that is a cost, not a reason to skip observing it.

**Step 1, author every expectation FIRST, then run and see it red.** This ordering is the whole
correction to the first draft, which told the implementer to run an edited expectation at a tree where
that edit did not exist — a command that passes for the wrong reason.

1. New suite, named step3DiagramTile.chrome.test.tsx (deliberately unbackticked: `spec:lint` reads a
   backticked path as a citation and a plan cannot cite a file it has not created), beside its existing
   siblings such as `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx`. Cases: live branch,
   failed branch, compound route A, compound route B, transition audit, shared-box, and the regex
   negative control.

   **Its first line MUST be the `// @vitest-environment jsdom` pragma.** the repo-root vitest config sets the default environment to `node` at its line 70 (named
   unbackticked because a `fixtures/specLint/redVerdict/` copy shares the basename, so a bare
   citation is ambiguous and a `./`-prefixed one is an illegal path), so without it the suite fails on a missing `document` rather than on
   the chrome assertion — a red for the wrong reason that cannot go green after the production change.
   All four sibling `step3DiagramTile.*` suites declare it; this one is not special.
2. `tests/styles/controlOutlineTransitions.test.ts:254` `toHaveLength(4)` becomes `toHaveLength(3)`; its comment gains the reason and says a FOURTH
   reappearing is an inventory change too; the DOCBLOCK at `tests/styles/controlOutlineTransitions.test.ts:229-230` stops quoting "the four". All
   three, because R3 of the spec stage caught a draft that updated two.
3. A new assertion in `tests/styles/controlOutlineTransitions.test.ts` for AC-4: read `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md`, find its §15 table 3 row, and require the count word
   in it to match the derivation's length. This is what makes AC-4 executable rather than a claim about
   commit topology.
4. Invert `tests/e2e/step3-review-modal.layout.spec.ts:626-636`: the ANCHOR must carry a border and the image must carry none. Do NOT touch the
   padding-box assertion at `tests/e2e/step3-review-modal.layout.spec.ts:638-647`.

Run the RED command and check WHICH assertions fail, because R2 caught the first draft asserting the
wrong ones. At this point the class has not moved, so the derivation still returns four and the 08-26
prose still says "four":

| assertion | state at this RED | why |
| --- | --- | --- |
| new suite, anchor carries the box | FAILS | the box is still on the image |
| new suite, image is exactly `object-cover` | FAILS | the image still carries the chrome |
| `tests/styles/controlOutlineTransitions.test.ts` `toHaveLength(3)` | FAILS | the derivation still returns four |
| `tests/styles/controlOutlineTransitions.test.ts` §15 prose parity | **PASSES** | derivation four, prose still "four". They agree, wrongly but consistently |
| `tests/e2e/step3-review-modal.layout.spec.ts` inverted pin | FAILS | the anchor has no border yet |
| `tests/e2e/step3-review-modal.layout.spec.ts` `boxSizing` is `border-box` | PASSES | Tailwind preflight already sets it; this row asserts a mechanism, not a change |
| new suite, shared-box contract | FAILS | it requires `rounded-md` on BOTH branches, and the anchor has none yet |
| new suite, transition audit | PASSES | neither element has ever declared `transition-*`; this pins the invariant §8 rests on, and pins nothing about the move |
| new suite, `CHROME_SHAPE` negative control | PASSES | it asserts the regex does not match a bare fit class, which is a property of the regex, not of the tree |

**The table is complete over the suite, deliberately including the three rows that pass on BOTH trees.**
Two of them are invariant pins and one is an instrument control; none of them discriminates the change,
and saying so is the point. A table that listed only the discriminating assertions would read as though
every assertion in the suite discriminates, which is the impression that lets a check-that-cannot-fail
hide in plain sight.

The parity assertion passing here is not a defect. It goes red at the NEXT step and stays red until the
prose is updated, which is exactly what makes it a real check rather than a restatement.

**Step 2, implement.** At `components/admin/wizard/step3ReviewSections.tsx:3938` add `rounded-md border border-text-faint bg-surface-sunken` to the
anchor; at `components/admin/wizard/step3ReviewSections.tsx:3955` reduce the image className to `object-cover`; replace the false comment at
`components/admin/wizard/step3ReviewSections.tsx:3926-3931` with the ruling.

**Step 3, the remaining consumers**, which have no independent RED and are declared as such:

- `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` — the count phrase becomes three, with a one-line note naming this spec. `§6.2` at
  `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:320` is NOT edited (spec §5).
- `tests/styles/tapTargetCensus.ts:321` — the `reason` prose stops saying the chrome lives on the image.
- `tests/styles/tintedPlateOutline.test.ts:221-223` — the comment's raw/comment split becomes 13 and
  four, and names the move.

**After step 2, re-run the RED command before touching step 3.** The derivation now returns three while
the prose still says "four", so the §15 parity assertion is RED — and it is the only thing that makes
step 3's first bullet an executable requirement rather than a hope. R2 caught the first draft calling all
three of step 3's edits no-RED; that was wrong for the prose and right for the other two.

**No-RED declaration, scoped to the two that genuinely have none.**
`tests/styles/tapTargetCensus.ts:321`'s `reason` string and
`tests/styles/tintedPlateOutline.test.ts:221-223`'s comment are prose no assertion reads — the count test
strips comments before counting. They are verified instead by the derived numbers below and by landing in
this one commit. The `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` edit is NOT in this declaration: the parity assertion reds until it
lands.

**The derived numbers, computed not asserted.** Run the registry's own `stripCommentsForFile` over the
component before and after: before raw=11 code=9 inComments=2, after raw=13 code=9 inComments=4. The pin
counts CODE occurrences and the class string is relocated within one file, so 9 stands.

Run the RED command again. Expect green.

Commit, once: `fix(admin): diagram tile chrome moves to the wrapper`.

## Task 2 — every gate, then closeout

<!-- task: red=`pnpm heavy pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts --hookTimeout=300000` ac=AC-2,AC-4,AC-6,AC-7,AC-9 -->

**This task has a genuine task-local RED, and finding it took R2 pointing out that the first draft had
none.** The invariant-8 closeout guard is that red, and the mechanism is the guard's own trigger rule:

- Write the closeout file first, naming BOTH gate halves and recording the gate's findings and
  dispositions. Naming both halves flips `declaresGate` true for this plan unit, and there is no marker
  yet, so `tests/docs/_metaInvariant8Closeout.test.ts` goes RED.
- Add the marker line with the run's real `p0`/`p1`. The guard goes GREEN.

That is a true red-then-green on this task's own deliverable, rather than re-running a command Task 1
already made pass. **The red is verified in the guard's source rather than assumed**, because asserting
a red without observing one is exactly the defect this repair answers:
`tests/docs/_metaInvariant8Closeout.test.ts:67-78` pushes a violation for every unit whose `declares` is
true and whose verdict is not `conforms`, and `tests/docs/_invariant8Closeout.ts:188` returns
`no-marker` when no valid marker parsed. The only escape is a `PRE_GUARD_DEBT` row, which that
violation's own message scopes to pre-guard history and which a plan written today cannot claim. It also forces the correct ORDER: the gate runs, its results are written down, and
only then is the marker allowed to exist — R2 was right that the first draft ran every verification
before writing the file it was supposed to be verifying.

The real-browser suite is NOT this task's red; it is Task 1's, where the inverted assertion is observed
failing. It is re-run here as a regression check, and the ACTUAL test count is reported from the run — do
NOT carry the filing arc's 44 forward.

**Reconcile the AC sets before committing**, by derivation rather than by reading:

    comm -23 <(grep -oE '^\| AC-[0-9]+' <plan> | tr -d '| ' | sort -u) \
             <(grep -oE 'ac=[A-Z0-9,-]+' <plan> | sed 's/ac=//' | tr ',' '\n' | sort -u)

must print nothing — and `comm` exits 0 whether it prints or not, so pipe it through a length check
rather than reading the empty output as a verdict:

       orphans=$(comm -23 <(grep -oE '^\| AC-[0-9]+' <plan> | tr -d '| ' | sort -u) \
                          <(grep -oE 'ac=[A-Z0-9,-]+' <plan> | sed 's/ac=//' | tr ',' '\n' | sort -u))
       [ -z "$orphans" ] || { echo "AC declared but claimed by no task: $orphans"; exit 1; }

`spec:lint` reports an `ac=` id that appears nowhere else in the plan; the OPPOSITE
direction — an AC declared in the table and claimed by no task — needs the opt-in `ac-declared` region
this plan does not use, so it is checked here by hand. That direction is not hypothetical: AC-5 was
orphaned by this very plan's round-2 repair, when the browser run moved into Task 1 and Task 2's marker
was rewritten around it.

Then, in order:

1. `pnpm heavy pnpm vitest run tests/styles` — the fill census, the residue census, the tinted-plate
   registry and the transitions suite, all re-run rather than reasoned about (AC-6, AC-7, AC-9's census
   half).
2. **AC-2, as a command that can FAIL.** `git diff --name-only` exits 0 whether the file is listed or
   not, so "must not list it" was prose, not a verdict — R3 was right. But the R3 form was ALSO wrong,
   and R4 probed it: it exits 1 on a clean tree too, because a trailing `grep … && { … exit 1; }` leaves
   grep's own non-match as the script's status. `if` blocks fix that, and git's status is now genuinely
   checked rather than merely claimed:

       git diff --name-only origin/main...HEAD > /tmp/tilechrome-changed.txt \
         || { echo 'AC-2: git diff failed; the check proves nothing'; exit 1; }
       if grep -qx 'components/diagrams/Gallery.tsx' /tmp/tilechrome-changed.txt; then
         echo 'AC-2 VIOLATED: Gallery.tsx is in the diff'; exit 1
       fi

   Probed both ways before landing: a clean list exits 0, a list containing `Gallery.tsx` exits 1.
3. **AC-4's same-commit half, as a history check rather than a claim:** the commit that last touched
   `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md` must be the same commit that last touched `components/admin/wizard/step3ReviewSections.tsx`.

       spec_sha=$(git log -1 --format=%H -- docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md)
       comp_sha=$(git log -1 --format=%H -- components/admin/wizard/step3ReviewSections.tsx)
       [ -n "$spec_sha" ] && [ -n "$comp_sha" ] \
         || { echo 'AC-4: a path matched no commit — check the paths before trusting this'; exit 1; }
       [ "$spec_sha" = "$comp_sha" ] \
         || { echo 'AC-4 VIOLATED: prose and class move landed in different commits'; exit 1; }

   The emptiness guard is not decoration: two empty shas compare EQUAL, so a typo'd path would make
   this pass while proving nothing. Both paths are touched on this branch, so the guard never fires
   here — it exists because a check must fail on the tree where it should fail, not merely pass on
   the one where it should pass.

   A count-parity test compares two sides of the FINAL tree and passes just as happily on a history that
   landed them in separate commits, which is exactly the gap R2 named. This reads the history.
3. **AC-9's prose half, DISCRIMINATING.** The first draft grepped `lives on the`, which matches the
   stale sentence as happily as the repaired one and therefore passes on an unrepaired tree — R3 caught
   it. Asserting both directions was necessary and not sufficient: the R3 form still exited 1 on a
   REPAIRED tree, because the final intentional non-match became the script's status. R4 probed that too.

       f=tests/styles/tapTargetCensus.ts
       if ! grep -q 'lives on the ANCHOR' "$f"; then
         echo 'AC-9: census prose not repaired'; exit 1
       fi
       if grep -q 'lives on the IMAGE' "$f"; then
         echo 'AC-9: stale census prose survives'; exit 1
       fi

   Probed: stale prose exits 1, repaired prose exits 0.

4. **AC-9's `line`/`tag`/`category` half is a claim about the DIFF, so it is checked against the diff.**
   An earlier draft cited `tests/styles/_metaTapTargetFloor.test.ts:59` as proof. R4 was right that it
   proves something else: that assertion keys rows by their CURRENT `file:line` and shows the line
   resolves to a live site, not that it is unchanged from base. `tag` is never compared, and the category
   checks establish internal census consistency rather than baseline equality.

       git diff origin/main...HEAD -- tests/styles/tapTargetCensus.ts > /tmp/tilechrome-census.diff \
         || { echo 'AC-9: git diff failed'; exit 1; }
       if grep -E '^[+-]' /tmp/tilechrome-census.diff | grep -vE '^(\+\+\+|---)' \
            | grep -qE '^[+-][[:space:]]*(line|tag|category):'; then
         echo 'AC-9 VIOLATED: a line/tag/category field moved'; exit 1
       fi

   Probed against a fabricated prose-only diff (exits 0) and a fabricated line-moved diff (exits 1). The
   live-site assertion still runs in the styles suite and still earns its place — it catches a row
   pointing at nothing — but it is no longer offered as proof of a property it does not check.
4. The full suite, typecheck, lint and format, per the ledger.
5. The invariant-8 UI quality gate on the affected diff.

**The marker line and both gate-half names land in THIS task's commit and nowhere earlier.** Verified
against the parser at `tests/docs/_invariant8Closeout.ts:45-48`: the marker is required only once some
file in the dated plan unit matches BOTH gate-half phrases (`declaresGate`, `tests/docs/_invariant8Closeout.ts:109`),
and this plan deliberately names neither, so none is owed until then.

The grammar cannot be written out here as a specimen, and that is not a style choice: the parser
`trimStart()`s every line before classifying it, so an indented example IS classified as a marker, and one
carrying placeholder digits matches no legal form and reds the whole plans tree. This plan learned that by
doing it — `tests/docs/_metaInvariant8Closeout.test.ts` failed §4.1.2 immediately. In prose: the line
begins with the marker prefix, then `critique=` and `audit=`, each `RAN` or `RAN-DEGRADED`; then `p0=` and
`p1=` with integer counts; then `dispositions=`, `recorded` when `p0 + p1` exceeds zero and `none` when it
is zero. The parser cross-checks that relation. Read `tests/docs/_invariant8Closeout.ts:45` for the
authoritative pattern rather than copying a specimen from anywhere.

Commit, once: the closeout section, its findings and dispositions, and the marker.

<!-- tasks: end -->

## Verification ledger

| Gate | Command |
| --- | --- |
| new suite | `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` |
| §15 derivation | `pnpm vitest run tests/styles/controlOutlineTransitions.test.ts` |
| styles suite | `pnpm heavy pnpm vitest run tests/styles` |
| real browser | `pnpm heavy pnpm test:e2e:standalone tests/e2e/step3-review-modal.layout.spec.ts` |
| full suite | `pnpm heavy pnpm test` |
| docs meta | `pnpm heavy pnpm vitest run tests/docs --hookTimeout=300000` |
| types | `pnpm typecheck` |
| lint | `pnpm exec eslint .` |
| format | `pnpm format:check` |

Two notes on that table, both corrections R1 forced:

**`tests/docs` is WRAPPED.** It names a directory, not an explicit file list, so the semaphore rule
classifies it as a heavy phase. The first draft left it unwrapped. `tests/styles` was already wrapped for
the same reason; the two scoped single-file runs at the top are correctly unwrapped.

**`--hookTimeout` is not decoration.** Measured this arc: `tests/docs/_metaReviewRoundEconomy.test.ts`
passed all 135 of its tests and red anyway, on an `afterAll` `rmSync` cleanup hitting the 30s default
under load from the other arcs on this machine. `--testTimeout` does NOT raise hook timeouts, so a run
raising only that keeps reporting a red with every test green.
