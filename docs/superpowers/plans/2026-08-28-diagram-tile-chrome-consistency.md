# Plan — diagram tile chrome consistency

Spec: `docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md`. Closes
`BL-DIAGRAM-TILE-CHROME-CONSISTENCY`. Effort S: two className strings in one file, one prose count, one
test literal, one new focused suite.

## Pre-draft code verification (done before this plan body)

| Claim | Verified at |
| --- | --- |
| `DiagramTile` is exported from `step3ReviewSections` | `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:26` imports it by name |
| the anchor className | `components/admin/wizard/step3ReviewSections.tsx:3938` |
| the image className | `components/admin/wizard/step3ReviewSections.tsx:3955` |
| the failed-branch `<span>` className | `components/admin/wizard/step3ReviewSections.tsx:3874` |
| the false comment to replace | `components/admin/wizard/step3ReviewSections.tsx:3926-3931` |
| §15 table 3 prose | `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` |
| the derived count assertion | `tests/styles/controlOutlineTransitions.test.ts:254` |
| derivation output at base `60dece4d5` | four members: the spans at `components/admin/wizard/step3ReviewSections.tsx:1236`, `components/admin/wizard/step3ReviewSections.tsx:1778` and `components/admin/wizard/step3ReviewSections.tsx:1789`, plus the `<Image>` at `components/admin/wizard/step3ReviewSections.tsx:3940` |
| `neutralFaintCount: 9` pin | `tests/styles/tintedPlateOutline.test.ts:224` |
| real-browser box assertion | `tests/e2e/step3-review-modal.layout.spec.ts:659` |
| the `premise` helper | `tests/_shared/premise.ts`, used at `tests/components/admin/wizard/step3DiagramTile.staged.test.tsx:32`. NOTE the two exports differ: `premise(description, actual, mustExceed)` is NUMERIC; the boolean form is `premiseHolds(description, condition)`, description FIRST |
| the new suite's path is claimed by a vitest project | `PARALLEL_TEST_GLOBS` includes `tests/components/**/*.test.{ts,tsx}` (`vitest.projects.ts:105`), so `pnpm vitest run <path>` finds it rather than reporting no tests |
| the real-browser spec's owning config | `tests/e2e/standalone.config.ts:85` allow-list names the `step3-review-modal.layout` basename; `playwright.config.ts` does NOT (only `.interactions` and `.agenda`), so the command is `test:e2e:standalone` — see Task 3 |

## Anti-tautology design for the new suite

The positive half asserts the CONTRACT literally: the box element carries `rounded-md border
border-text-faint bg-surface-sunken`. The negative half must NOT assert a literal absence of today's
token, because that passes the moment someone re-adds chrome under a different token. It scans the
image's className for ANY chrome shape:

    /(^|\s)(rounded(-|$)|border(-|$)|bg-)/

Premises, because each negative is vacuous on the wrong branch:

- the live branch must actually have rendered an `<img>`, or "the image carries no chrome" is true of a
  branch with no image;
- the failed branch must NOT have rendered an `<img>`, or the two cases are the same branch;
- the chrome-shape regex must be shown to MATCH the wrapper's className, or a regex that matches
  nothing would pass the negative assertion on any input.

That third premise is the one that makes the guard honest: it proves the instrument can fire.

## Acceptance criteria this plan discharges

Full text lives in the spec's §9; the ids are repeated here because each task marker cites one and an
`ac=` id that appears nowhere else in the plan is a task-contract defect.

| id | claim |
| --- | --- |
| AC-1 | the image class string is exactly `object-cover`; the anchor carries the box |
| AC-2 | `components/diagrams/Gallery.tsx` is unchanged by this diff |
| AC-3 | the §15 table 3 derivation finds three visuals, the tile `<Image>` not among them |
| AC-4 | the control-outline spec's prose says three, in the same commit as AC-1 |
| AC-5 | the real-browser layout spec is green at this head, box-equality among the passes |
| AC-6 | the `neutralFaintCount` pin does not move |
| AC-7 | the full styles suite is green, fill and residue censuses included |
| AC-8 | the real-browser pin asserts the ANCHOR carries the border and the image none |
| AC-9 | the tap-target census prose no longer states the chrome lives on the image |

<!-- tasks: depth=2 -->

## Task 1 — pin the arrangement, both branches

<!-- task: red=`pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` ac=AC-1,AC-2 -->

RED: a new suite named step3DiagramTile.chrome.test.tsx (deliberately unbackticked: `spec:lint` reads a backticked path as a citation, and a plan cannot cite a file it has not created yet), landing beside its existing siblings (`tests/components/admin/wizard/step3DiagramTile.staged.test.tsx` and the three others). It renders `DiagramTile` in the
live branch and in the failed branch. Asserts the box element carries the chrome, the image carries
none, and every premise named above. No premise COUNT is stated here: the suite grew two more with the
compound case below, and a count in prose beside a list is the drift this plan's own spec had to repair.
Fails at base because the image carries the chrome today.

**This task also discharges the transition-audit obligation**, because the spec's Transition Inventory
(§8) is what creates it. Two of the suite's cases are that audit rather than the arrangement:

- the **compound case** §8 names — a FOCUSED live tile failing. The two axes were independent while the
  chrome sat on the image, since an `<img>` is never focus-visible; on the anchor one event moves both.
  The case focuses the anchor, fires the image error, and asserts the placeholder still carries the box.
  Focus RELOCATION is already covered by
  `tests/components/admin/wizard/step3DiagramTile.failureFocus.test.tsx`, so this asserts only what is
  new: that the box survives the swap. Both premises are engaged deliberately — without the focus
  premise the case degenerates into the failed-branch test.
- a **transition audit**: neither box element may declare `transition-*`. §8 declares every pair
  instant, which is only true while that holds, so it is asserted rather than assumed. There is no
  `AnimatePresence` or conditional animation on either branch to enumerate.

GREEN: at `components/admin/wizard/step3ReviewSections.tsx:3938` add `rounded-md border
border-text-faint bg-surface-sunken` to the anchor; at `:3955` reduce the image className to
`object-cover`. Replace the now-false comment at `components/admin/wizard/step3ReviewSections.tsx:3926-3931` with the ruling and a cross-reference to
the new spec.

Commit: `fix(admin): diagram tile chrome moves to the wrapper`.

## Task 2 — re-derive §15 table 3 and update the count in lockstep

<!-- task: red=`pnpm vitest run tests/styles/controlOutlineTransitions.test.ts` ac=AC-3,AC-4 -->

RED: three edits in `tests/styles/controlOutlineTransitions.test.ts`, because the count appears three
times in that file and spec R3 caught the first draft updating only two of them:

1. `tests/styles/controlOutlineTransitions.test.ts:254`'s `toHaveLength(4)` becomes `toHaveLength(3)`;
2. the comment above it gains the reason, and says a FOURTH reappearing is an inventory change too;
3. the DOCBLOCK at `tests/styles/controlOutlineTransitions.test.ts:229-230`, which quotes §15's row as "the four `step3ReviewSections` visuals".

The docblock's other sentence — that the four were ORIGINALLY cited by line and every one had drifted —
is historical and stays exactly as written.

On a tree where Task 1 has landed this is already green, so the ordering matters: run it at Task 1's
parent to see it red at 4, then at Task 1's commit to see it green at 3, and record both numbers.

GREEN: `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:816` — the count
phrase becomes three, with a one-line note naming this spec as what moved the fourth. §6.2 at `docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md:320` is NOT edited (spec §5, last
paragraph).

Commit: `docs(spec): control-outline painted-child count 4 to 3, the tile image having left`.

## Task 3 — invert the real-browser placement pin, and run it

<!-- task: red=`pnpm heavy pnpm test:e2e:standalone tests/e2e/step3-review-modal.layout.spec.ts` ac=AC-5,AC-8,AC-9 -->

`tests/e2e/step3-review-modal.layout.spec.ts:626-637` pins the OLD placement: it asserts `imgBorderLeft > 0`. Spec
§4.1 is why it inverts rather than being deleted — a pin that stops discriminating is worse than one
that discriminates the wrong way, because nothing then holds the new arrangement.

RED: rewrite that assertion to require the ANCHOR to carry a border (`b.borderLeft > 0`) and the image
to carry none (`b.imgBorderLeft === 0`), and replace its comment with this arc's ruling. On a tree where
Task 1 has NOT landed this reds; run it at Task 1's parent to see that, then at Task 1's commit to see
it green, and record both.

Do NOT touch the image-equals-anchor-padding-box assertion below it (`tests/e2e/step3-review-modal.layout.spec.ts:637-647`).
It is already expressed as `anchorW - borderLeft - borderRight`, so it passes with the border on either
element; editing it would be the reviewer's "merely relocating the pin" failure.

GREEN: run the spec under `pnpm heavy` (non-interactive playwright, per the semaphore rule).

**The command is `test:e2e:standalone`, NOT `test:e2e`, and this is not a style preference.** This spec
is absent from every project's `testMatch` in `playwright.config.ts` — only
`step3-review-modal.interactions` and `.agenda` are listed there. It runs under
`tests/e2e/standalone.config.ts`, whose explicit allow-list does name
the `step3-review-modal.layout` basename, in the `standalone-chromium` project. A `pnpm test:e2e <path>` invocation
would therefore match no project and report no tests, which is the false-green this note exists to
prevent. Derive the command from the package.json script (`test:e2e:standalone`, line 79), never from
the argv shape.

The harness is standalone — it renders the real component to static markup and compiles the token CSS
with the Tailwind CLI rather than booting the app, so no dev server is needed. One consequence worth
checking rather than assuming: the border can only measure non-zero if Tailwind actually GENERATED
`border-text-faint`. All three moved classes (`rounded-md`, `border-text-faint`, `bg-surface-sunken`)
stay present in the same source file, so generation is unchanged — but if the assertion reads a 0-width
border, check CSS generation before concluding the component is wrong.

Report the ACTUAL test count from the run; do NOT carry the filing's 44 forward. The
live-tile-box-equals-placeholder-tile-box test at `tests/e2e/step3-review-modal.layout.spec.ts:659` must be among the passes
and must not have been skipped.

If the box-equality test reds, the box invariant is broken and Task 1 is wrong; that is the whole point
of running it.

Also in this task, because it is the same finding's other instance:
`tests/styles/tapTargetCensus.ts:321`'s `reason` prose states that the tile's chrome lives on the image.
Update that sentence. The row's `line`, `tag` and `category` are unchanged — the row is about layout, not
chrome, which the prose itself says.

## Task 4 — the populations the change could move without saying so

<!-- task: red=`pnpm heavy pnpm vitest run tests/styles` ac=AC-6,AC-7 -->

The anchor now carries the outline/ground pair the image used to carry, so every derived population over
`step3ReviewSections.tsx` is re-run rather than reasoned about: the fill census, the residue census, the
tinted-plate registry, and the transitions suite.

**The `neutralFaintCount` pin does not move, and that is derived rather than argued.** Run the registry's
own `stripCommentsForFile` over the file before and after: before raw=11 code=9 inComments=2, after
raw=13 code=9 inComments=4. The pin counts CODE occurrences, and the class string is relocated within one
file rather than added or removed, so 9 stands (`tests/styles/tintedPlateOutline.test.ts:224`).

**Its explanatory comment DOES move, and it is this task's second edit** (spec §4.1, fourth row). The
comment at `tests/styles/tintedPlateOutline.test.ts:221-223` states the raw count as 11 with two in
comments, and breaks the 9 down as the report textarea plus "the four painted children". After this
change the split is 13 and four, and one of those five now sits on the CONTROL rather than on a painted
child. Both added comment mentions are in the component's new anchor comment; this file's own comment
adds none, which is worth stating in it so the next reader can check the arithmetic.

Any population that moves gets a named decision in the spec, not a silent literal edit.

## Task 5 — pre-code mechanical UI checklist and the invariant-8 UI quality gate

<!-- task: red=`pnpm exec eslint components/admin/wizard/step3ReviewSections.tsx` ac=AC-1 -->

Mechanical checklist over the diff before the gate, since the gate verifies rather than discovers: em
dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type and token classes.
No new colour token is introduced, so no new contrast pin is owed.

Then the invariant-8 UI quality gate on the affected diff, with findings and dispositions recorded at
closeout.

**The marker line and the gate-half names land in the SAME commit as the gate run, and not before.**
Verified against the parser at `tests/docs/_invariant8Closeout.ts:45-48`: the marker is required only
once some file in the dated plan unit matches BOTH gate-half phrases (`declaresGate`, `tests/docs/_invariant8Closeout.ts:109`), and this
plan deliberately names neither yet, so no marker is owed today. The `<RAN|RAN-DEGRADED>` placeholder
form is legal ONLY inside a template file (`tests/docs/_invariant8Closeout.ts:160`); in a real plan it classifies as MALFORMED, and one
malformed marker anywhere reds the whole unit regardless of any valid one.

**The grammar cannot be written out here as an example, and that is not a style choice.** The parser
`trimStart()`s every line before classifying it, deliberately, so that "indented typos are rejected,
never invisible" — which means an indented or fenced SPECIMEN of the marker is classified as a real
marker, and a specimen carrying placeholder digits matches no legal form and reds the entire plans tree.
This plan learned that by doing it: an earlier draft printed the form in an indented block and
`tests/docs/_metaInvariant8Closeout.test.ts` failed on §4.1.2, malformed marker line, immediately.

So, in prose only. The line begins with the marker prefix, then `critique=` and `audit=`, each `RAN` or
`RAN-DEGRADED`; then `p0=` and `p1=` with integer counts; then `dispositions=`, which is `recorded` when
`p0 + p1` is greater than zero and `none` when it is zero. The parser cross-checks that last relation
and rejects a mismatch, and the whole line is anchored, so trailing commentary on it is malformed too.
Read `tests/docs/_invariant8Closeout.ts:45` for the authoritative pattern rather than copying a specimen
from anywhere.

<!-- tasks: end -->

## Verification ledger

| Gate | Command |
| --- | --- |
| new suite | `pnpm vitest run tests/components/admin/wizard/step3DiagramTile.chrome.test.tsx` |
| §15 derivation | `pnpm vitest run tests/styles/controlOutlineTransitions.test.ts` |
| styles suite | `pnpm heavy pnpm vitest run tests/styles` |
| real browser | `pnpm heavy pnpm test:e2e:standalone tests/e2e/step3-review-modal.layout.spec.ts` |
| full suite | `pnpm heavy pnpm test` |
| types | `pnpm typecheck` |
| lint | `pnpm exec eslint .` |
| format | `pnpm format:check` |
| docs meta | `pnpm vitest run tests/docs --hookTimeout=300000` |

The `--hookTimeout` is not decoration. Measured this arc: `tests/docs/_metaReviewRoundEconomy.test.ts`
passed all 135 tests and then red anyway on its `afterAll` `rmSync` cleanup timing out at the 30s
default, under load from the other arcs on this machine. `--testTimeout` does NOT raise hook timeouts,
so a run that raises only that will keep reporting a red with every test green.
