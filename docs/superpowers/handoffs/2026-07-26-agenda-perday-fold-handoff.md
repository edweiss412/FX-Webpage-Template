# Agenda per-viewer day fold — close-out handoff (PR #610)

PR3 of the `BL-NULLCODE-STAMP-BATCH-2 residuals` sequence. Spec:
`docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md`. Plan:
`docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md`.

## §12 — UI close-out (impeccable v3 dual-gate)

**Both gates ran DEGRADED: single-context, and that is declared rather than hidden.** The skill's hard
invariant is two isolated sub-agents; this session's instructions forbid the Agent tool unless the user
asks for it. The user instruction wins, and the skill is explicit that an undeclared degraded run is a
failed run, so both reports carry the banner.

### critique

| Finding | Severity | Disposition |
| --- | --- | --- |
| The session count rendered on OPEN rows, restating the sessions listed directly beneath it, and spent a fourth atom on the summary line at 320px where space is tightest | P1 | **FIXED** (`c16ed6cda`). Folded-rows-only, where the count is the sole signal of what the fold hides. The test that asserted count-on-every-row was asserting the defect and was corrected, not worked around. |
| Detector (`detect.mjs`) | — | `[]`, no findings |
| Mechanical checklist: em-dashes, apostrophes, 44px tap target, canonical type scale | — | all clean |

**Considered and REJECTED: the FXAV accent on the "Your day" marker.** PRODUCT.md calls that orange the one
inherited brand cue, so accent felt more on-brand. `DESIGN.md:11` settles it the other way: accent's uses are
enumerated as the live indicator, the today pin, primary CTAs and the brand mark, "Nowhere else", under a
ten-percent viewport cap, with selected-state explicitly excluded. `text-text-strong` stays. Recorded because
the reasoning looked like brand fidelity and was actually a design-system violation.

### audit

| Dimension | Score | Note |
| --- | --- | --- |
| Accessibility | 2 → 4 | one P1, below |
| Performance | 4 | transitions `transform` only; no layout-property animation |
| Theming | 4 | zero hard-coded colours; one arbitrary value (`max-w-[12ch]`), deliberate and documented |
| Responsive | 4 | 320 / 390 / 720 measured in a real browser |
| Code quality | 4 | tsc and eslint clean |

**P1 — the fold silently removed every per-day heading.** Each day was an `<h3>`; the summary replaced it
with a bare span, so every day left the document outline. Heading navigation is how a screen-reader user
skims a long agenda, which made the fold *worse* for exactly the people PR #592's announcement work served.

**FIXED** (`9b2308f08`): the `<h3>` now sits INSIDE the `<summary>`, so the disclosure role and expanded state
come from `details`/`summary` and the outline entry from the heading. Mutation-verified — reverting to a span
fails the new test.

Worth recording *how* it was found, because no test could have: the jsdom suite asserts roles and test ids,
the browser suite measures boxes and computed styles, and both were green. An element can lose heading
semantics while keeping its geometry and its role. What exposed it was a grep during the audit — the file's
own docstring still said "day labels here are `<h3>`" while the only remaining "h3" in the file *was that
comment*. The docstring was then updated, since a comment asserting what the code stopped honouring is what
made this findable and would otherwise make the next one invisible.

## Whole-diff cross-model review — round 1 findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | HIGH | Completeness proved every restriction DATE was located, not that every ROW's ownership was known | **FIXED** `402040b52` |
| 2 | HIGH | `resolveKeyTimes` can receive malformed `showDays` | **PRE-EXISTING**, evidence below |
| 3 | MEDIUM | The session count was gated on the initial state while `<details>` toggles at runtime | **FIXED** `7089b873f` |
| 4 | MEDIUM | A second harness still transcribed the pre-fold markup | **FIXED** `b695d49c7`, and it was worse than reported |
| 5 | LOW | The chevron rotation had no open-vs-closed assertion | **FIXED** `7089b873f` |

**#1 was the dangerous one and it reproduced exactly.** The reviewer's input
`["Tuesday, May 5, 2026", "Day 1 continued", "Wednesday, May 6, 2026"]` with a May 5
assignment returned `{rows:[0]}`: May 5 *is* located, so `|L| == |R|` and completeness
passed, while row 1 folded unmarked. If that row continues May 5 it is the viewer's own day
being hidden — the worst outcome this feature can produce, and the third distinct way this
rule has produced it. Any unparseable row now fails the whole extraction open.

**#2 is pre-existing and this diff does not widen it.** `resolveKeyTimes` calls
`visibleShowDays` at `ScheduleSection.tsx:152`; that call and its two siblings are on
`origin/main`, and `ScheduleSection.tsx:117` is untouched here. Recorded so a later round
does not re-derive it.

**#4 understated what was there.** `tests/e2e/agendaBreakdown.layout.spec.ts` was not green
while drifting — it was **dark**. Its registry row read `UNSEEN`: no workflow, no script,
and Playwright's default config matches no standalone spec, so `playwright test <path>`
answers "No tests found." Nothing had ever run it, and it had rotted twice: it transcribed
the pre-fold structure, *and* it selected on `[data-session-kind="normal"]`, an attribute
the component has never emitted. The harness invented that attribute to label its own
hand-written markup and then asserted against it, so the wrap comparison measured two
elements the application does not render. Pointed at the real component it failed
immediately — including `expect(n).toBe(2)` against a true count of 3, a literal that could
only pass while the harness was wrong.

That is exactly the failure the host workflow's own header warns about ("A dark spec rots"),
on a spec it names. Both harnesses now render the real component, every expected count is
derived from one shared fixture, and the spec is wired into `pnpm test:e2e:agenda-layout`
plus the workflow's paths filter with its row moved to `PATH_GATED`. Rendering the real
component is worth nothing if nothing runs it.

**A class sweep should have caught #4 and did not.** The first sweep searched the harness I
was editing and the specs the workflow already ran; it never asked which specs run at all.
"Where else is this component transcribed?" and "which of those files does CI execute?" are
two different questions, and only the second one surfaces a dark spec.

## Whole-diff review — round 2

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | HIGH | A row naming two dates parses to its FIRST date, so a combined row folds for a viewer assigned the second | **FIXED** `983d7a890` |
| 2 | MEDIUM | The ratified positional fallback is absent from the matcher | **SPEC AMENDED** — deliberate, reasoned in §3 |
| 3 | MEDIUM | The admin harness still hand-writes the wrapper whose `min-w-0` its assertion depends on | **FILED** `BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` |
| 4 | LOW | Only one of the two repaired specs had darkness protection | **FIXED** by the main merge |

**#1 is the fourth distinct input shape in which this rule folded a day the viewer works.**
`parseIsoFromDayLabel` calls `.match()` without `/g`, so `"Tuesday, May 5, 2026 / Wednesday, May 6,
2026"` reports itself as May 5 and folds for a May 6 viewer. Every row parses, so the guard added
for round 1's HIGH could not see it. Because the *class* keeps recurring, the guard is on ambiguity
itself rather than on this label spelling, and it is pinned in both directions — deleting it reds the
ambiguity case, and counting regex hits instead of distinct dates reds an over-fire case built from a
label that repeats one date.

**#2 is a genuine spec deviation and is recorded as one.** The reviewer was right that the shipped
matcher takes no aggregate list and so cannot do the four-condition fallback. Rather than add it, the
spec is amended: its trigger (`!someDateParsed`) does not occur in the measured 6-PDF corpus, and it
would fold on positional index — folding in the state of least knowledge — which is the shape that
produced all four of the bugs above. Filed as `BL-AGENDA-POSITIONAL-DAYSET-FALLBACK` against the
corpus ever gaining positional-label documents.

**#3 is real, pre-existing, and partially mitigated by the merge.** One premise of it has expired:
the finding notes `step3ReviewSections.tsx` is absent from the workflow path filter, but after
merging main there is no path filter — `standalone-e2e.yml` runs the whole config on every PR, so a
change to that file now triggers this spec.

**#4 was already closed by the merge**, which replaced the `rejected`/`PATH_GATED` assertion with one
that covers both specs.

## The merge that landed mid-review

`origin/main` retired seven per-feature e2e workflows for one unfiltered `standalone-e2e.yml`,
deleting the very workflow this branch had wired its specs into. The branch gave up its own wiring:
both specs were already in `standalone.config.ts`, so they now run unfiltered on every PR rather than
only when a paths filter matched, and their allowlist rows had to go — the registry's `shadowing`
check fails on an allowlisted spec that is covered.

Worth recording as a pattern, not an accident: this PR spent real effort building path-gated CI
wiring for two specs, and the better answer was a change someone else was making at the same time to
the general mechanism. The finding that motivated it (a dark spec had rotted) was correct; the fix
was local where the problem was systemic.

## Searching for the fifth bug, and two guards that had gone dead

Four review rounds each found a different input that folded a day the viewer works, and each fix
added one guard plus one example. That kills four known shapes; it says nothing about a fifth. So
the last step searched instead of enumerating.

**The property:** if a row's label mentions a date the viewer is assigned, that row must not be
folded. Ground truth comes from a date scanner written independently of the implementation —
reusing `parseIsoFromDayLabel` would have inherited its first-match-only behaviour, which is
precisely the defect behind the R2 HIGH, and the test would have confirmed the bug rather than
caught it. 6912 combinations run in 27ms; a wider exploratory pass over 29160 found nothing either.

**What the search turned up was not a fifth input — it was two guards nothing tested.** Deleting
either clause of `if (R.size === 0 || located.size !== R.size)` left all 16 tests green:

- the completeness clause had no isolated case at all; every fixture that would have reached it
  now trips an earlier guard first;
- the "never returns an empty subset" test used the label `"Day 1"`, which the unidentifiable-row
  guard added in R2 catches **before** the empty-R guard — so that test had silently stopped
  exercising the thing it is named after.

Both were casualties of their own suite improving around them: each new guard shifted the earlier
ones out of reach of the fixtures that used to cover them. Worth generalising — **when a guard is
added upstream of existing ones, the tests for the downstream guards should be re-verified by
mutation, not assumed.** A green suite is equally consistent with "the rule holds" and "nothing
reaches the rule."

One method note. The first attempt at that mutation appeared to survive, and it hadn't run at all:
the regex targeted `if (located.size !== R.size)` while the real line reads
`if (R.size === 0 || located.size !== R.size)`. A mutation that does not mutate is
indistinguishable from a guard that is genuinely covered. Verify the edit landed before believing
a survivor.

## Whole-diff review rounds 5-7: one class, and what finally closed it

| Round | Finding | Disposition |
| --- | --- | --- |
| R5 | HIGH sixth counterexample `"... / May 6"` (month-day, no year) | FIXED, then superseded by the rewrite |
| R5 | MEDIUM date-partitioned multi-PDF never folds | ACCEPTED, `BL-AGENDA-PERLINK-COMPLETENESS` |
| R5 | MEDIUM `<summary>` model + Chromium-only proof | Spec corrected; verified in WebKit by hand, `BL-AGENDA-A11Y-WEBKIT-COVERAGE` |
| R5 | MEDIUM the AS SHIPPED table's throw contract was wrong | FIXED — my own authority table was incorrect |
| R6 | HIGH "this is not a whitelist" | CONCEDED; docstring corrected, `BL-AGENDA-PROSE-SECOND-DAY` |
| R6 | HIGH same month-day in two years | FIXED |
| R6 | MEDIUM month PREFIXES matched Marriott/Marketing/Augusta | FIXED — the worst of the set |
| R7 | HIGH global `Day N` strip; two phrases passed | FIXED by the rewrite below |
| R7 | MEDIUM `Track 2` / `Room 54` / `8th Floor` over-fire | FIXED by the same rewrite |
| R7 | LOW marker never measured collapsed | FIXED |

**The rewrite, and why it took seven rounds to reach.** Six counterexamples arrived one per round,
each a new way for a label to name a second day. Every fix was correct and every one was another
instance. What ended it was R7 reporting, in a single round, that the rule *both* under-fires
(`"Day 1 / Day 2"`) *and* over-fires (`"Room 54"`). Those are one generic "reject any leftover
number" check read from opposite sides — so rounds 6 and 7 had been trading one failure for the
other, and no adjustment could satisfy both. That is the tell, not the round count.

**The rule as it FINALLY ships** (this paragraph described the round-7 design until round 10; it
is corrected here because the mechanism changed three more times and a close-out artifact that
describes a superseded design is worse than none).

A label is ambiguous — and the extraction fails open — when any of these hold:

| Signal | Catches |
| --- | --- |
| more than one distinct month-day, read from FOUR date shapes: month-led, day-first (year required), slash, ISO | `"May 5, 2026 / May 6"`, `"/ 05/06/2026"`, `"/ 2026-05-06"`, `"/ 6 May 2026"` |
| more than one distinct year, recorded by EVERY shape | `"May 5, 2026 / 2027-05-05"` and every other pairing |
| more than one weekday name anywhere, OR any weekday after the date | `"Wednesday / Tuesday, May 5, 2026"`, `"May 5, 2026 / Wednesday"` |
| more than one `Day N` phrase | `"... Day 1 / Day 2"` |
| a plural day span, wherever it sits | `"Days 1-2, May 5, 2026"` |
| a spoken ordinal not followed by a capitalized noun | `"and the 6th"`, but not `"The 8th Floor"` |

Two decisions inside that are worth keeping visible. **Count AND position, never either alone** —
counting misses `"May 5, 2026 / Wednesday"` (one weekday, because the date carries none), and
position misses `"Wednesday / Tuesday, May 5, 2026"` (the second day leads). **A trailing `Day N`
is deliberately NOT a signal**, reversing a round-8 call: `"Tuesday, May 5, 2026 — Day 1"`,
`"Show Day 1"` and `"(Travel Day 2)"` name one day, and since ambiguity is checked with `.some()`,
one such heading unfolded an entire link. An over-fire silently disables the feature; an
under-fire only shows more than necessary.

## Rounds 8-10

| Round | Finding | Disposition |
| --- | --- | --- |
| R8 | HIGH six more second-day forms; counting fails when the primary date lacks the token | FIXED — replaced counting with position |
| R8 | MEDIUM signal-2 / signal-6 over-fires (`"2025 Awards"`, `"The 8th Floor"`) | FIXED |
| R8 | MEDIUM the a11y proof read a DOM property, not the accessibility tree | FIXED — role asserted; the measured limits recorded |
| R8 | LOW corpus guard claimed seven labels, held six | FIXED |
| R9 | HIGH leading second-day references | Already FIXED in `11652d7af` — I had swept the same forms myself |
| R9 | HIGH year mismatch escaped across date SHAPES | FIXED — every shape records its year |
| R9 | MEDIUM trailing `Day N` over-fire | FIXED, reversing the R8 call |
| R9 | MEDIUM the plan's reconciliation proofs never landed | FIXED — all three §5.2 behaviours pinned |

**Found by re-reading the function whole rather than from any report:** day-first matching required
no year, so the bare `"<number> <word>"` pattern invented a phantom second date in
`"Day 1 May 5, 2026"`, `"Session 3 May 5, 2026"`, `"Room 12 May 5, 2026"` and the pdfjs glyph-split
`"2 6 May 5, 2026"` — four ordinary headings silently unfolded.

## Three things this PR taught about its own tests

- **An oracle that shares the implementation's blind spot proves nothing.** The property test
  recognised only full `Month day, year` tokens — exactly what the code recognised — and reported
  zero violations across 6912 combinations while two reachable counterexamples sat in the space.
- **Later guards silently kill earlier ones.** Twice, adding a broader check upstream made a
  narrower downstream guard unreachable, leaving it deletable with the whole suite green. Both
  were found by mutation, not by reading. Removing the generic number scan then un-caught
  `"Days 1-2"`, which had only ever passed via a residual `-2` — the existing test failed
  immediately, which is the case for keeping tests that look redundant.
- **A mutation that does not apply is indistinguishable from a guard that holds.** Three times a
  mutation "survived" and had simply never run: a regex anchor reformatted by prettier, a `${i}`
  where the source says `${di}`, a replacement string that matched nothing. Assert the edit landed
  before reading anything into a survivor.

## Known limits, disclosed rather than defended

- **~~The layout spec is PATH-GATED, not PR-blocking.~~ SUPERSEDED — it now runs on every PR.** This
  bullet described the wiring this PR originally built. `origin/main` then retired seven per-feature
  workflows for one unfiltered `standalone-e2e.yml`, so both agenda specs run on EVERY PR and their
  allowlist rows were deleted. Precisely: **runs on every PR is not the same as merge-blocking** —
  review R4 (LOW) caught this bullet overstating it. No e2e job is among branch protection's twelve
  required contexts, so enforcement here is procedural (the registry's `shadowing` check fails on an allowlisted spec that is
  covered). Kept, struck through, because review R3 caught the un-struck version still asserting
  `PATH_GATED` two paragraphs after the merge account said the opposite.
- **jsdom cannot see visibility.** Adding `hidden` to the marker leaves all 12 jsdom tests green. Documented
  in that file's header with the mutation evidence, and covered instead by a browser assertion on the
  marker's box. A `toBeVisible()` there would be vacuous.
- **`tests/ci/_workflowCoverageScan.ts` counts any spec-path text in a `run:` body as invocation**, so an
  `echo` would satisfy it. Real, pre-existing, and deliberately out of scope — hardening it touches every
  spec in that registry and belongs in its own reviewed change.

## Process note

The spec and plan took seven adversarial rounds without converging, and each round's repairs generated the
next round's findings. Four probes settled in minutes what those rounds did not: the completeness rule (which
folded a day the viewer works, on an input five rounds had read past), React's reconciliation of `open` across
`router.refresh()`, the JSONB-cast throw, and the containment scope. The user then chose to proceed to
implementation with the code and its tests as the authority.

Implementing immediately found two design errors prose review had not: the matcher's signature recomputed an
intersection the caller already had, and a guard I had written was unreachable. Both are the kind of thing
only a caller and a mutation run can show.
