# Implementation plan — pre-review gate arms (cluster A)

Spec: `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md`
Branch: `feat/pre-review-gate-arms`

This plan is the **first enrolled plan** under the convention it ships. Its own task markers are inert until Task 3 lands, at which point `pnpm spec:lint` on this file begins checking them. That is deliberate dogfooding: if the convention is unusable, this plan is where it shows.

**It already showed.** The spec's first enrollment model made a task "every heading of the declared depth after the enrollment line". Probed against this file, that selected 12 headings where 7 are tasks — and `## Blocking note`, which trails the last task at the same depth, proved no start-only marker could ever exclude it. The spec now delimits a region at both ends (design §3.2), and the probe below returns exactly 7. The convention earned its first correction before shipping a line of code.

## Pre-draft verification (run, not described)

Every claim below was verified against this branch's merge base before drafting.

| Claim | Verification |
| --- | --- |
| `Check` union has 5 members | `lib/specLint/types.ts:2` |
| `CHECK_ORDER` maps every `Check` | `lib/specLint/run.ts:8` |
| plans short-circuit out of section checks | `lib/specLint/sections.ts:27` |
| `parseDoc` exposes `lines`, `fencedInfo`, `headings` | `lib/specLint/parse.ts:65` |
| waiver regex is prefix `spec-lint:`, so `<!-- task: -->` cannot collide | `lib/specLint/parse.ts:35` |
| CLI renders checks from a literal list | `scripts/spec-lint.ts:46` |
| `--artifact` requires `--fallback` | `scripts/codex-guard.mjs:147` |
| prompt composed once at startup | `scripts/codex-guard.mjs:254` |
| result contract written by one function | `scripts/codex-guard.mjs:580` |
| codex-guard test harness exists | `tests/codexGuard/harness.ts` |
| specLint tests are per-module | `tests/specLint/run.test.ts`, `tests/specLint/cli.test.ts` |

**Consequence for Task 2 that the spec did not pin:** `extractSpans` (`lib/specLint/parse.ts:37`) turns the marker's backticked `red=` command into an inline-code span, which the citation checker then sees as a candidate. Commands containing whitespace are excluded from the candidate domain by the ratified rule at `docs/superpowers/specs/2026-07-19-spec-lint.md:23`, so realistic `red=` values are safe — but a single-token dotted command (`` `foo.ts` ``) would be read as a citation. Task 2 pins this with an explicit fixture rather than leaving it to be discovered in review.

## Meta-test inventory (mandatory declaration)


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **CREATES:** `tests/specLint/taskContract.test.ts` — the check's own behavioral suite.
- **EXTENDS:** `tests/specLint/_metaPureCore.test.ts` — the new module must stay I/O-free, and that guard walks the core; adding a file that imports `node:fs` must fail it.
- **EXTENDS:** `tests/specLint/cli.test.ts` — new check must appear in rendered output ordering.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **CREATES:** `tests/codexGuard/lintDoc.test.ts` — flag parsing, embedding, exit-2 refusal, `lintArm` field.
- **Advisory-lock topology:** N/A — this plan touches no `pg_advisory*` path, no DB, and no `shows`/`crew_members` mutation.
- **Layout-dimensions task:** N/A — no UI surface. The diff touches no file under `app/`, none under `components/`, and neither `app/globals.css` nor `DESIGN.md`.
- **Transition-audit task:** N/A — same reason.
- **Mutation-surface observability (invariant 10):** N/A — no HTTP route handler and no `"use server"` action is added.

impeccable-gate: N/A — no UI surface

## Design validation — a reference implementation was built and run

`docs/agents/writing-plans.md:19` caps prose iteration on a surviving design vector: after three rounds, build the probe rather than patch the wording again. The §3 grammar reached that point, so a throwaway reference implementation of design §3.2, §3.3 and §3.4.1 was written and run against **this plan**, which is enrolled under the convention.

It reads the document correctly — `enrolled, depth=2, tasks=7` — and after the repairs below reports **zero findings**. Two real defects surfaced only when the rules were executed rather than read:

1. The AC boundary rule rejected `**Verify.** AC-14.` — `.` is legal inside an id (`AC-1.1`) and therefore sat in the boundary class, so the commonest citation form an author writes never resolved. Three spurious findings on this plan alone; shipped as written it would have fired on nearly every plan.
2. `TASK_MARKER_ORPHANED` overlapped the form codes for a malformed marker outside every extent, producing two findings for one line against a stated one-code rule.

**Task 1 ports this reference implementation's case table rather than inventing fixtures.** The AC-29 table-driven test is that port. Writing the cases fresh would re-derive, and probably re-miss, the two defects above.

## Mutation-family closure (guard surface, mandatory)

`taskContract` is a structural guard, so its mutation-operator families are enumerated up front. **This enumeration is the closure set the review converges against.** A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| Family | Mutation | Killed by |
| --- | --- | --- |
| M1 enrollment presence | delete the enrollment line | AC-7 fixture flips to zero findings |
| M2 enrollment arity | add a second enrollment line | `TASK_ENROLL_DUPLICATE` |
| M3 enrollment value | `depth=0`, `depth=7`, `depth=x`, `depth=` | `TASK_ENROLL_MALFORMED` |
| M4 fence evasion | move enrollment or marker inside a fence | AC-9: inert, plan unenrolled |
| M5 marker presence | delete a task's marker | `TASK_MARKER_MISSING` |
| M6 marker arity | duplicate a marker in one extent | `TASK_MARKER_DUPLICATE` |
| M7 marker placement | move a marker above the first task | `TASK_MARKER_ORPHANED` |
| M8 key set | add `foo=bar`; drop `red=`; drop `ac=` | `TASK_MARKER_MALFORMED` / `TASK_RED_EMPTY` / `TASK_AC_MISSING` |
| M9 value shape | `red=` unbackticked; `red=``` empty; `ac=` empty; `ac=NOTANID` | `TASK_RED_EMPTY` / `TASK_AC_MISSING` / `TASK_MARKER_MALFORMED` |
| M10 depth confusion | add headings above and below the enrolled depth | AC-12: neither satisfies nor violates |
| M11 self-satisfaction | cite an `ac=` id that appears only in markers | `TASK_AC_UNRESOLVED` (AC-13) |
| M12 kind leakage | lint the same text as `kind=spec` | AC-10: zero findings |
| M13 region escape | depth-N heading before the open, or after `tasks: end` | AC-15 |
| M14 unmatched close | `tasks: end` with no preceding open | AC-16 (`TASK_ENROLL_MALFORMED`) |
| M15 shallower boundary | mid-document heading shallower than enrolled depth | AC-17 extent termination |
| M16 empty region | valid in-range depth selecting zero tasks (wrong depth; open after last heading) | `TASK_ENROLL_EMPTY` (AC-22) |
| M17 enroll form | `depth=3 extra=x`; `depth=3 depth=4` | `TASK_ENROLL_MALFORMED` (AC-23) |
| M18 marker form | repeated key; reordered fields; `ac=AC-1,,AC-2` | `TASK_MARKER_MALFORMED` |
| M19 id prefix | prose holds only `AC-10` / `AC-1a` / `AC-1.1` / `AC-1-child` for `ac=AC-1` | `TASK_AC_UNRESOLVED` (AC-24) |
| M20 launch geometry | wrapper launched from main checkout, `--cwd` a worktree | AC-18, AC-19 |
| M21 report visibility | union + CHECK_ORDER wired, CLI renderer list untouched | AC-25 |
| M22 budget | embedded reports crossing 200,000 bytes | AC-21 truncation notice |
| M23 sequential regions | `open -> close -> open -> close` | `TASK_ENROLL_DUPLICATE` on the second open (AC-26) |
| M24 code overlap | missing `ac=`; empty `ac=`; `red=` with empty backticks AND with whitespace-only backticks | exactly one code by §3.3 precedence, and the two empty-`red` spellings draw the SAME code (AC-27) |
| M32 pipe truncation | capture the CLI through a pipe rather than a file | AC-35: summary line present, byte-identical to redirect |
| M33 infra-as-findings | pre-adapter exit 1 with empty stdout; ENOENT; signal death | AC-36, AC-37: refuse, dispatch nothing |
| M38 shape-check backstop | revert the AC-35 fix, leaving a truncating CLI at status 0 | AC-36: shape check refuses, verified `shapeOK=false` |
| M34 id punctuation | ids `AC-1.`, `AC-1..1`, `AC-1.-child`, `AC-1-` | AC-38: `TASK_MARKER_MALFORMED` |
| M35 left boundary | resolver dropping the preceding-character check | AC-42: `XAC-1`, `0AC-1`, `.AC-1`, `MY-AC-1` must not resolve `AC-1` |
| M36 indented marker | 1-3 leading spaces on an enrollment or task marker | AC-39: 1-3 recognized, 4+ not |
| M37 surplus close | `open -> close -> close` | `TASK_ENROLL_MALFORMED` on the surplus close |
| M31 sentence-final id | `**Verify.** AC-14.` as the only occurrence | AC-34: resolves; naive boundary rule reports a false UNRESOLVED |
| M30 orphan-form overlap | malformed marker outside every extent | AC-33: ORPHANED alone, asserted as a full list |
| M28 greedy escape | repeated `ac=`, unknown key, empty-then-junk, repeated `red=` absorbed by a greedy command group | AC-31 |
| M29 enroll-failure silencing | malformed open alone; unmatched close alone; duplicate opens | AC-32 line-pass findings survive |
| M27 cascade | rejected duplicate open leaving its close to report a phantom unmatched-close | AC-30: exactly one finding, asserted as a full list |
| M26 table totality | a line class reaching no row of design §3.4.1 | AC-29 table-driven test, incl. the fall-through case |
| M25 post-close marker | marker after `tasks: end`, before the next equal-or-shallower heading | `TASK_MARKER_ORPHANED` plus the task's own `TASK_MARKER_MISSING` (AC-28) |
| M39 grammar/table drift | an implementation reading design §3.4.1's rows while ignoring §3.2's indentation allowance | AC-39 + AC-29: the table restates the patterns verbatim, so an indented marker is recognized by both or neither |
| M40 EOF region drop | region left unclosed at end of document; implementation drops the trailing tasks or reports it unterminated | AC-43 |
| M41 enrollment ambiguity | duplicate openings, implementation picks a region and reports task findings against the guess | AC-26: full-list equality, first region holding a **marker-less** task — a well-formed one cannot discriminate the mutant |
| M42 sections leakage | `taskContract` wired by replacing the `kind === "plan"` short-circuit in `lib/specLint/sections.ts` | AC-40: plan draws `taskContract` findings and zero `sections`-family findings |
| M43 embed drops findings | filter that removes findings alongside the `INVENTORY` block | AC-1: finding-line sets from raw stdout and embedded body compared, not merely `INVENTORY` absence |
| M44 length-only compare | AC-35 asserted with `Buffer.byteLength` equality instead of buffer equality | AC-35: `Buffer.compare` — two different reports of equal length must fail |
| M45 last-line-only shape | shape check validating only the `summary:` line | AC-36 third probe: real child emitting `wrong-header` + a valid `summary:` line must still refuse |
| M46 unamended authority | shipping the arm while `docs/agents/spec-self-review.md:25` still demands "full output" | AC-41: the amended completeness clause lands in the same PR |
| M47 pass-gating leak | marker form/placement judged during the line scan, so a trailing duplicate opening cannot retract it | design §3.4.1: every marker code is pass 2; dup-open + malformed marker yields `[TASK_ENROLL_DUPLICATE]` alone |
| M48 set-vs-multiset | embed compared to raw as a set, so two identical finding lines collapse to one and still pass | AC-1: multiset comparison (`rawCount=2, embeddedCount=1, setEquality=true`) |
| M49 wrong-document header | shape check matching `^spec:lint .+` rather than the requested path | AC-36 fourth probe: `spec:lint some-other.md` plus a valid summary must refuse |
| M50 waiver suppression | assuming task-contract codes are unwaivable | design §6 item 9 + Task 3's waiver case — they are suppressible, by design |
| M51 notice unbudgeted | truncate the body to the allowance, then append the notice | AC-21.1: sum of emitted blocks `<= 200000`, notices included (prototype ran to `-29`, `-64`) |
| M52 summary truncated away | drop whole lines from the end, taking `summary:` first | AC-21.2: summary asserted on the EMITTED block, not the pre-budget body |
| M53 unseatable request | enough `--lint-doc` args that frames alone exceed the budget; drop whole reports silently | AC-21.4: exit 2 naming count and budget (2500 frames = 242500 bytes, well under `ARG_MAX`) |
| M54 detail-line loss | remove every `detail:` line after correctly removing `INVENTORY` | AC-1: full ordered line-sequence comparison — finding-line multiset comparison passes this mutant |
| M55 broadened precedence | classify ``red=`` `` + `foo=x` as `TASK_RED_EMPTY` rather than `TASK_MARKER_MALFORMED` | design §3.4.1 pass-2 rows carry the "in every respect except" prerequisite; AC-11, AC-31 |
| M56 unresolved on orphans | fire `TASK_AC_UNRESOLVED` for an orphaned marker's ids | §3.4 catalog row gated on a well-formed marker inside an extent; AC-33's ORPHANED-alone |
| M57 extent-boundary placement | ignore the shallower-heading boundary | AC-17 with the marker placed AFTER the shallower heading: correct `[MISSING, ORPHANED]` vs mutant `[]` |
| M58 summary requirement dropped | amend the rule without the `summary:` clause | AC-41 asserts the four amendment properties individually |
| M59 greedy allocation | earlier report expands into a later report's frame | AC-21.1 with **two or more** reports forced to truncate (greedy gave `sum=6089` against 6000; reserving downstream floors gives 5945) |
| M60 frame erosion | drop head lines to make room under the budget | AC-21.5: all three head lines survive, in order — the sum shrinks, so assertions 1-3 all still pass |
| M61 notice last | emit the notice after the summary | AC-21.6: summary last, notice immediately before it |
| M62 false notice math | fixed or inverted `N`/`M` in the truncation notice | AC-21.7: both recomputed in the test, never read back from the notice |
| M63 cardinality blindness | count only well-formed markers toward duplication | AC-44 matrix: DUPLICATE fires alongside RED_EMPTY / AC_MISSING / MARKER_MALFORMED / AC_UNRESOLVED |
| M64 unqualified non-refusal | seating exception stated in one place, "dispatch proceeds" left standing elsewhere | design §2.2.2 bullet, §2.3 row, AC-21 lead all carry the seatable qualifier |
| M65 judge-despite-failed-enrollment | classify recorded markers although enrollment failed | AC-45 matrix over all three failure modes, each fixture carrying a malformed marker, asserted as a FULL list |
| M66 orphan form leakage | special-case the pinned orphan classes, keep form/resolution checks for the rest | AC-46 matrix over five form classes, each a full list |
| M67 slot occupancy by class | count only well-formed markers as occupying the slot | AC-27 matrix: RED_EMPTY / AC_MISSING / MARKER_MALFORMED / AC_UNRESOLVED each alone, no MISSING |
| M68 second result writer | add `lintArm` to `writeResult` only, leaving `main().catch`'s direct writer without it | AC-5 pins BOTH writers (`scripts/codex-guard.mjs:580` and `scripts/codex-guard.mjs:891`), both values |
| M69 inventory drift | §1.2's change list naming fewer edits than the ACs require | AC-14 + §1.2 both name the accept-set rule AND the marker convention |

## Tasks

<!-- tasks: depth=2 -->

## Task 1 — enrollment and task segmentation, pure

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-7,AC-9,AC-12,AC-15,AC-16,AC-17,AC-22,AC-26,AC-28,AC-29,AC-30,AC-32,AC-33,AC-39,AC-43,AC-45,AC-46 -->


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**RED.** Create `tests/specLint/taskContract.test.ts` covering, against in-memory `DocModel` values built through `parseDoc` (never hand-built objects, so the fence model under test is the real one):

- **the design §3.4.1 classification table, driven as a table** (M26, AC-29): one case per row, every line class against every region state, plus a fall-through case asserting an arbitrary line is classified as ordinary prose rather than reaching no row. This is the structural defense for the class that produced findings in three consecutive rounds; write it first, because the individual family cases below are then rows of it rather than separate inventions;
- families M1, M3, M4, M10, M13, M14, M15, M16, M23, M25, M27, M29, M30, M36, M37, M39, M40, M41, M47 from the closure table. **M47** is the pass-gating case: a plan with duplicate openings AND a malformed marker must report `[TASK_ENROLL_DUPLICATE]` alone — an implementation judging marker form during the line scan emits the form finding before pass 2 can learn the plan is unenrolled. **M41 is the enrollment-ambiguity case, and its fixture only works one way**: `open → close → open → close` where the **first region holds a depth-N heading with no marker at all**, asserted as whole-list equality against `[TASK_ENROLL_DUPLICATE]`. Putting a *well-formed* task there instead makes the case unfalsifiable — a valid task yields no task-level findings under either behavior, so the mutant survives. Measured against a reference implementation of design §3.4.1, flipping pass 2's conclusion from `openCount === 1` to `openCount >= 1`: the valid-marker fixture gives `[DUPLICATE]` both ways; the marker-less fixture gives `[DUPLICATE]` correct versus `[DUPLICATE, TASK_MARKER_MISSING]` mutant. Write the second one. **M40** leaves a region unclosed at EOF and asserts its tasks are still checked, with no unterminated-region finding — every other fixture closes its region explicitly, so nothing else covers it. **M39** runs the indentation cases through the table itself rather than as standalone assertions, since the defect it kills is the table and the prose grammar disagreeing about indentation. M27 asserts the FULL finding list, not the presence of one code: a cascade is invisible to a test that only checks the expected code is there. M16 gets two fixtures, not one: a region whose declared depth matches no heading, and a region whose opening line follows the last matching heading. Both are valid in-range depths selecting nothing, and a checker silent on either has accepted a plan while checking no tasks at all;
- a plan whose enrolled depth is 2 with `###` sub-headings inside a task, asserting the sub-headings do not end the extent;
- a plan with depth-N headings **both before the opening line and after `<!-- tasks: end -->`**, asserting neither is a task (M13, AC-15). The trailing half is the load-bearing one: it is the case that refuted the start-only model, and a fixture carrying only the leading half would have passed against the broken design;
- a plan with a mid-document heading *shallower* than the enrolled depth, asserting it terminates the preceding task's extent (M15, M57, AC-17). **Place the task's marker AFTER that shallower heading** — with it before, correct behavior and a mutant ignoring the boundary both report `[]` and the case certifies nothing; after, correct reports `[TASK_MARKER_MISSING, TASK_MARKER_ORPHANED]` and the mutant reports `[]`. No plan in the current corpus exercises this branch, so the fixture is the only coverage it gets.

Each case states the mutant it kills. Confirm every case fails before implementation, for the stated reason.


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN.** Create `lib/specLint/taskContract.ts` exporting `checkTaskContract(model, kind)`. It reads only `model.lines`, `model.fencedInfo`, and `model.headings`. No `node:fs`, no `node:child_process` — `tests/specLint/_metaPureCore.test.ts` enforces this.

**Verify.** AC-7, AC-9, AC-12. Plus: the module appears in the pure-core guard's walked set.

**Raise the walker floor in the same commit.** `tests/specLint/_metaPureCore.test.ts:28` asserts `files.length >= 7`, and `lib/specLint/` holds exactly 7 files today. Adding an eighth satisfies the floor without moving it, so a later deletion of the new module would leave the suite green — the floor would still be met by the seven survivors. Bump it to 8 when the file lands, so the guard actually pins the new module's existence rather than merely tolerating it.

**Commit.** `feat(spec-lint): segment plan tasks from a declared depth, never from heading text`

## Task 2 — marker grammar and the ten codes

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-6,AC-8,AC-11,AC-13,AC-23,AC-24,AC-27,AC-31,AC-34,AC-38,AC-42,AC-44 -->

**RED.** Extend the Task 1 suite with families M2, M5, M6, M7, M8, M9, M11, M17, M18, M19, M24, M28, M31, M34, M35, M55, M56 — one case per code, each asserting the code fires on a fixture exhibiting it **and does not fire** on a sibling fixture exhibiting only the neighbouring defect. That negative half is what makes AC-8 non-tautological: a checker that returned every code on every input would pass the positive half alone.

**M55 — the specific codes require an otherwise-well-formed marker.** ``red=`` `` combined with `foo=x`, and ``red=`cmd` `` combined with a missing `ac=`, are each `TASK_MARKER_MALFORMED`, not `TASK_RED_EMPTY` or `TASK_AC_MISSING`. A line carrying junk as well as an empty field is malformed whatever else is wrong with it; classifying it under the higher-precedence code contradicts AC-11 and AC-31.

**M65/M66/M67 — three rules quantified over a class, each pinned as a matrix.** This shape produced a finding in three consecutive rounds, so all three land together rather than one per round. **M65 (AC-45)**: enrollment failure discards recorded markers unjudged — one fixture per failure mode (malformed opening, unmatched close, duplicate openings), each carrying a **malformed marker**, asserted as a FULL list; a presence assertion cannot catch the spurious extra finding. **M66 (AC-46)**: `TASK_MARKER_ORPHANED` alone across five form classes — generic malformed, empty `red`, missing `ac`, unresolved `ac`, well-formed. **M67 (AC-27)**: a defective marker occupies its task's slot whatever code it drew, across all four defect codes, each asserting no accompanying `TASK_MARKER_MISSING`.

**M63 — duplication is about cardinality, not classification (AC-44).** Pin it as a matrix: two markers in one extent, the second well-formed, the first drawing each of `TASK_RED_EMPTY`, `TASK_AC_MISSING`, `TASK_MARKER_MALFORMED`, `TASK_AC_UNRESOLVED` in turn — each case asserting `TASK_MARKER_DUPLICATE` **and** the defect code. The well-formed pair is the base case, not one of the four. A mutant counting only well-formed markers toward duplication passes AC-8, AC-27 and AC-29 and silently omits duplication in every mixed extent.

**M56 — `TASK_AC_UNRESOLVED` does not fire for an orphaned marker's ids.** An orphan reports `TASK_MARKER_ORPHANED` alone (AC-33); a checker resolving its ids anyway adds a second finding for a line that belongs to no task.

Add the citation-collision fixture the pre-draft pass surfaced: a marker whose `red=` is a single dotted token, asserting the interaction with the citations check is whatever the implementation actually does, pinned rather than assumed.

Add the **inline-mention fixture**, from a live probe against this very plan. Extracting `ac=` values with a naive substring scan over this file returns `NOTANID` — a string that appears only as an illustrative cell inside the M9 row of the closure table above, never as a marker. The spec anchors markers to a full line (`^<!-- task: (.*) -->$`), so the shipped checker must ignore it. Fixture: a plan whose prose and table cells contain `ac=`, `red=`, and a complete marker-shaped string mid-sentence, asserting zero findings from those and correct findings from the real full-line markers. Failure mode caught: a checker that scans for the marker substring anywhere on a line, which would report phantom tasks in any plan that documents the convention — including this one.


<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN.** Implement the ten codes in `lib/specLint/taskContract.ts`.

**Verify.** AC-6, AC-8, AC-11, AC-13, and closure families M2 and M5 through M11.

**Commit.** `feat(spec-lint): ten hard task-contract codes, fail-closed on every unmodelled shape`

## Task 3 — wire the check into the run and the CLI

<!-- task: red=`pnpm vitest run tests/specLint/run.test.ts tests/specLint/cli.test.ts` ac=AC-10,AC-25,AC-40 -->

**RED.** Cover M21 first: assert the CLI's stdout carries a `taskContract:` section with code, line, and message (AC-25). `CHECK_ORDER` does not drive the renderer — `scripts/spec-lint.ts:46` iterates its own closed literal list — so a run can exit 1 while the embedded report shows only an aggregate count, which is exactly what a reviewer would receive under design §2. Then extend `tests/specLint/run.test.ts` with a plan-kind document producing a `taskContract` finding, and a spec-kind document with identical text producing none (AC-10, closure family M12 — the identical-text pairing is what makes it a leakage test rather than two unrelated fixtures). Extend `tests/specLint/cli.test.ts` asserting `taskContract` findings render under their own heading in the documented check order.

Add the **sections-leakage case (M42, AC-40)**: a plan fixture with task-contract defects asserts a non-empty `taskContract` finding list and a `sections` finding list that is exactly empty. `lib/specLint/sections.ts:27` short-circuits plans today, enforcing the prior spec's ratified decision that plans skip section-presence checks; the tempting wiring for a plan-only check is to reuse that branch, which would start every plan in the corpus drawing spec-only section failures. Assert on the finding lists, not by grepping the source for the unchanged line — a refactor could preserve the line and re-enable the checks through another path.

**Pin the waiver interaction (M50, design §6 item 9), against the read mechanism rather than a guess.** A waiver targets the next non-blank, non-waiver line (`lib/specLint/run.ts:53`) and drops every `severity: "fail"` finding on it bar two unsuppressible codes (`lib/specLint/run.ts:93`, `lib/specLint/run.ts:17`). All ten task-contract codes are hard, so all ten are waivable. Three cases: a waiver immediately before a marker-less task heading suppresses `TASK_MARKER_MISSING`; the same waiver separated by blank lines still suppresses, since blanks are skipped; a waiver whose target is ordinary prose leaves the finding standing **and** draws the "waiver suppressed nothing" advisory. The last one is what keeps the case from being a tautology — without it the test passes against an implementation that suppresses everything unconditionally.

**GREEN.** Add `"taskContract"` to the `Check` union (`lib/specLint/types.ts:2`), give it an entry in `CHECK_ORDER` (`lib/specLint/run.ts:8`), call `checkTaskContract` from `runLint`, and add it to the CLI's rendered check list (`scripts/spec-lint.ts:46`). **`lib/specLint/sections.ts` is not modified** — `taskContract` is a sibling check gated on `kind` in its own module. The first two wiring points are compiler-enforced (`CHECK_ORDER` is `Record<Check, number>`, so omitting the entry is `TS2741`); the renderer's list is a plain literal and is not, which is why AC-25 asserts against real CLI stdout.

**Verify.** AC-10, AC-40. From this commit on, `pnpm spec:lint docs/superpowers/plans/2026-08-03-pre-review-gate-arms.md` checks this plan's own markers; run it and record the output in the commit body.

**Commit.** `feat(spec-lint): run the task-contract check for plans, render it in the CLI`

## Task 4 — codex-guard `--lint-doc`

<!-- task: red=`pnpm vitest run tests/codexGuard/lintDoc.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-18,AC-19,AC-20,AC-21,AC-35,AC-36,AC-37 -->


**Harness API, verified.** `tests/codexGuard/harness.ts` exports `mkRun` (`tests/codexGuard/harness.ts:107`), `writeScenario` (`tests/codexGuard/harness.ts:133`), `guardEnv` (`tests/codexGuard/harness.ts:148`), `runGuard` (`tests/codexGuard/harness.ts:162`), `readResult` (`tests/codexGuard/harness.ts:201`), and `readCalls` (`tests/codexGuard/harness.ts:205`). `readCalls` returns the `CallRecord` shape at `tests/codexGuard/harness.ts:74`, carrying each invocation's `argv` — which is what makes AC-3's "dispatched nothing" directly assertable (empty array) and AC-1's embed assertable against the real composed prompt rather than a restatement of it.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->

**RED.** Create `tests/codexGuard/lintDoc.test.ts` using that harness, covering:

- AC-1 the embedded block's delimiters, and that its body equals the CLI's stdout for the same doc **with the `INVENTORY` section removed** — captured by running the CLI in the test and applying the documented filter, never by hardcoding expected text. Byte-equality against raw stdout is explicitly not the assertion: it would contradict AC-20 for any report carrying an inventory, which is nearly all of them. Add the property that replaces it (M43, M48, M54): extract the finding lines from raw stdout and from the embedded body and assert the two are equal as **multisets** — same lines, same multiplicities, same order. A set comparison passes a transformation that collapses two identical finding lines into one (`rawCount=2, embeddedCount=1, setEquality=true`), silently losing a real finding. Assert this only on a report that fits the budget; the over-budget case is AC-21 prefix-plus-notice, per design §2.2.4 P2 and P3. Without it the suite only proves `INVENTORY` is gone, which a transformation that dropped findings alongside it would also satisfy — and "findings may never be filtered" is the exact clause design §2.2.4 amends the self-review rule to require;
- AC-2 `--lint-doc` without `--fallback`, and composed with `--artifact` under `--fallback`;
- AC-3 a doc that makes the CLI exit 2 causes codex-guard to exit 2 and dispatch nothing — asserted by `readCalls` returning an empty array. **Create the symlink in the test's own fixture directory; do not point at the corpus.** The tracked symlink at `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M11-user-facing-docs.md` (verified mode 120000, exit 2, `not a regular file (symlink)`) is the only one today, and a test depending on it silently stops testing anything the day someone de-symlinks that file. Assert the message too, so this exit 2 is distinguishable from AC-19's out-of-repo exit 2;
- AC-4 a doc with hard findings still dispatches;
- AC-5 `lintArm` is `"present"` or `"absent"` in the written result, **from both writers** (M68): the centralized `writeResult` (`scripts/codex-guard.mjs:580`) and the direct `writeFileSync` in `main().catch` (`scripts/codex-guard.mjs:891`). Drive the second by making a valid lint run precede a Codex spawn failure — a happy-path fixture passes with only `writeResult` updated, and then the wrapper-fault result carries no `lintArm` at all, which is the case §2.4's machine-visibility promise most depends on;
- **M51/M52/M53/M59/M60/M61/M62/M64 — budget arithmetic, asserted on the EMITTED block.** Assert the sum of emitted blocks is `<= 200000` **including** each truncation notice (the natural implementation fits the body then appends the notice, overshooting every time — a prototype ran to `-29` and `-64`); assert `summary:` is present in every emitted block, truncated or not, checked on the emitted block rather than the pre-budget body; and assert that a request whose reports cannot be seated at their frame-plus-notice floor exits 2 naming the count and the budget (M53, M64 — check the seatable-vs-unseatable branches are distinct, since the spec previously said both "dispatch proceeds" and "exit 2" for one input). Use **two or more** truncating reports (M59): a single-report fixture cannot expose greedy allocation, which overran to `sum=6089` against a 6000 budget before downstream floors were reserved. Then assert the three properties that survive all of the above (M60, M61, M62): all three head lines intact and in order, the summary last with the notice immediately before it, and `N`/`M` recomputed in the test rather than read back. Build the oversize input from real corpus reports.

- **M32/M33/M38/M44/M45, AC-35 through AC-37 — the CLI must survive being captured.** `scripts/spec-lint.ts:236` calls `process.exit()` one statement after writing stdout, which truncates on a pipe (async write) but not to a file (sync write). Fix it to `process.exitCode` + natural exit, and assert behaviorally that a piped capture ends with the `summary:` line and is **byte-identical** to a redirect — `Buffer.compare(pipeBuf, fileBuf) === 0`, comparing buffers, not their lengths (M44). Equal `byteLength` is a proxy that two different reports of the same length both satisfy; reserve it for the failure message. Then assert the infra shapes each refuse the dispatch: pre-adapter exit 1 with empty stdout, `ENOENT`, signal death — **a real child emitting `wrong-header` plus a valid `summary:` line** (M45), and **a child emitting `spec:lint some-other.md` plus a valid summary** (M49), which forces the header to name the REQUESTED document rather than merely exist. Both of them lack a summary, so a shape check validating only the last line passes them while accepting a report whose header names a different document than the reviewer was told they were reading;
- **M20, AC-18 and AC-19 — launch geometry.** Run the guard with its process cwd set to a directory *other* than `--cwd`, and assert a doc valid in the `--cwd` repo lints identically either way. This is the case that breaks the feature in normal use, because invariant 11 makes launch-cwd and `--cwd` differ on every worktree run. Separately assert a doc outside the `--cwd` repo exits 2 with a message naming both the path and the repo root, distinguishable from the unreadable-file exit 2;
- **M22, AC-20 and AC-21 — content and budget.** Assert the embedded block drops exactly the lines from the bare `INVENTORY` line to the line before `summary:`, and **keeps** the headers, every check section, and the summary line — asserting only that `INVENTORY` is gone would pass an implementation that also dropped the summary; then, with enough `--lint-doc` arguments to cross 200,000 bytes, assert argument order is preserved, the block truncates at a line boundary, the truncation notice is present, and the dispatch still proceeds. Build the oversize input from real corpus reports rather than synthetic padding, so the test exercises the byte profile that motivated the budget.

**GREEN.** Add the flag to `parseArgs`/`buildConfig`, spawn the CLI per doc with cwd = `--cwd`, embed in `composePrompt` (`scripts/codex-guard.mjs:254`), and add `lintArm` in `writeResult` (`scripts/codex-guard.mjs:580`).

**Verify.** AC-1 through AC-5, AC-18 through AC-21, closure families M20 and M22.

**Commit.** `feat(codex-guard): embed spec:lint output in the brief, and record whether it was asked for`

## Task 5 — the two documentation rules

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-14,AC-41 -->

**RED.** The existing docs meta-tests are the RED surface: add the §4.1 accept-set rule and the §3.2 plus §3.3 marker convention to `docs/agents/spec-self-review.md`, and confirm `pnpm vitest run tests/docs` plus `pnpm spec:lint` on the edited file stay green. Where no existing guard asserts the rule's presence, state that plainly rather than inventing a test that only proves a string exists.

**Amend the completeness clause in the same commit (M46, AC-41).** `docs/agents/spec-self-review.md:25` currently mandates attaching the CLI's *full* output. Task 4's embed removes the `INVENTORY` block and may truncate past the budget, so shipping the arm against the unamended rule would put it in standing violation of the authority design §2.2.4 cites for it — and a later reviewer resolving that conflict the other way would delete the filtering and reintroduce the composition-cap failure. Replace the clause with design §2.2.4's wording: every finding plus the `summary:` line, `INVENTORY` optional, abridgement disclosed with its size. **Assert the four properties individually (M58, AC-41)** — a docs mutant dropping just the `summary:` clause satisfies a test that only checks findings-not-filtered, inventory-optional and abridgement-disclosed. This is a rule edit, not an addition, and it is the one place this plan changes text it did not author — flagged here so it is a deliberate act rather than a diff surprise.

**GREEN.** The doc edits, plus the `--lint-doc` usage line in the AGENTS.md codex-guard section so the cross-CLI contract records it.

**Verify.** AC-14, AC-41, and M69 — §1.2's change inventory names both `spec-self-review.md` edits, matching what AC-14 requires.

**Commit.** `docs(agents): accept-set discipline for detector specs, and the task-marker convention`

## Task 6 — full local gate

<!-- task: red=`pnpm test` ac=AC-1,AC-14 -->

**RED.** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm spec:lint` on both the spec and this plan.

Two corrections to what an earlier draft of this task asserted, both verified against the repo. `pnpm typecheck` is a single `tsc --noEmit` over one `tsconfig.json` (`package.json:29`) — there is no separate playwright project to run. And env-bound files are **not** excluded from a local `pnpm test`: the exclusion is a project-level gate on `VITEST_EXCLUDE_ENV_BOUND=1`, which only `unit-suite.yml` sets (`.github/workflows/unit-suite.yml:132`, `.github/workflows/unit-suite.yml:164`). Locally they run. This diff does not touch them, but the task must not claim a local exclusion that does not exist.

**GREEN.** Fix whatever the gate surfaces.

**Verify.** All gates green, output recorded in the commit body.

**Commit.** `test: full local gate for the pre-review gate arms`

## Task 7 — adversarial review (cross-model), CI, merge

<!-- task: red=`gh pr checks` ac=AC-1,AC-14 -->

Whole-diff cross-model review, then push, real CI green, `gh pr merge --merge`, fast-forward local `main` and verify `git rev-list --left-right --count main...origin/main` reports `0  0`. Stage 4.4 then removes the cron nudge and both herdr labels.

<!-- tasks: end -->

## Note — the cross-model review gate was briefly unavailable, and is not

Recorded because the transient looked permanent and a stale blocker is worse than none.

Three dispatches on 2026-08-03 around 20:5x CDT each exited 1 in ~10s with `ERROR: You've hit your usage limit … try again at Aug 10th, 2026 6:16 PM`, and `~/.codex/` holds a single account with no alternate profile. Read literally, that put the spec gate, the plan gate, and the whole-diff gate out of reach for a week, and this section was written as the escalation `docs/agents/writing-plans.md:15` calls for.

**The limit cleared the same evening.** Spec rounds have since dispatched and returned verdicts normally through `codex-guard`. The gate is available and Task 7 is not blocked.

Two things worth keeping from the episode. The failure shape was `nonzero_exit`, not the `no_o_file` silent-death documented in `AGENTS.md` — a usage limit is a loud, fast, self-describing failure, and mistaking it for the reaper bug would send an investigator down a wrong and expensive path. And a quoted reset timestamp is a **ceiling, not a schedule**: treating it as a commitment converted a several-hour wait into a seven-day plan change. Re-probe before believing it.
