# Multi-Region Task Enrollment — Design

**Date:** 2026-08-09 · **Status:** RATIFIED (adversarial review APPROVE, R4, 2026-08-09) · **Closes:** `BL-TASK-ENROLLMENT-SINGLE-DEPTH` (BACKLOG.md)
**Amends:** `docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` §3.2, §3.4, §3.4.1 (line-pass and Pass-2 rows), AC-26/AC-30, AC-29, AC-32, AC-45, §6 items 6–7
**Surface:** `lib/specLint/taskContract.ts` (enrolled mutation-guard surface, `tests/mutation/source/registry.ts:153`)

## 1. Problem

The declared task contract (`<!-- tasks: depth=N -->` … `<!-- tasks: end -->`, origin spec §3.2; checker `lib/specLint/taskContract.ts`, wired at `lib/specLint/run.ts:37`) supports exactly one region per plan, watching exactly one heading depth. Two measured corpus shapes cannot enroll (origin spec §6 items 6–7, filed as `BL-TASK-ENROLLMENT-SINGLE-DEPTH`):

- **Shape A — task units at two depths** (7 of 533 plans at filing). Example: `docs/superpowers/plans/observability/2026-07-04-mutation-surface-observability.md` — `## Task 6`, group header `## Tasks 7–16`, children `### Task 7`…`### Task 16`, then `## Task 17`. Enrolling either depth silently excludes the units at the other.
- **Shape B — non-task headings at the task depth between the first and last task** (6 plans at filing). Example: `docs/superpowers/plans/2026-07-26-stripcomments-shared.md` — `### Canonical migration procedure ("PROC", used by Tasks 3–46)` between Task 2 and Task 3. A single region cannot exclude a heading in its middle; the interloper draws `TASK_MARKER_MISSING`.

The feature is live and standard for new plans — 12 plans enrolled as of 2026-08-09 (`rg -l 'tasks: depth=' docs/superpowers/plans/` → 12 files), all flat single-depth. The limit costs authors of hierarchical plans a forced flattening, and keeps the 13 measured legacy-shaped plans permanently unenrollable.

**Fix (ratified — Option A):** a plan may declare any number of *sequential* regions, each with its own depth. Close a fence before an odd stretch, reopen after. Every rule inside a region is unchanged.

### 1.1 Resolved scope — do not relitigate

1. **Option A (sequential multi-region) over per-heading skip notes (B), nested parent/child semantics (C), and leave-as-documented-limit (D).** User-ratified 2026-08-09 in the design session for this spec, from a rendered four-option comparison. B and C file to §7 (documented limits) as re-open triggers, not gaps.
2. **The nested-open code keeps the name `TASK_ENROLL_DUPLICATE`; the message changes.** User-approved design §2. Rationale: code stability across the origin spec's catalog, the existing suite, and the review-round corpus outweighs the more honest name `TASK_ENROLL_NESTED`; the message ("task-region opening inside an unclosed region") carries the semantics. Renaming proposals are out of scope.
3. **This spec supersedes the origin spec's single-region ratification deliberately, not by oversight.** Origin §3.2 (*Every opening line after the first is `TASK_ENROLL_DUPLICATE` — whether or not a close intervenes… Multiple regions are not supported, and the unsupported case must be loud*) was correct *given* single-region support: the unsupported case had to be loud. This spec makes the case supported, so the loudness rationale no longer applies to it. The nested-open case — the one shape that is still not supported — stays loud. The origin fence against "guessing which of two declared regions the author meant" (§3.2) is not violated: no intent is inferred; the already-open region continues by deterministic rule and the nested line is refused with a finding.
4. **No legacy plan is enrolled by this work.** The 13 shaped plans become *enrollable*, not enrolled. Enrollment stays opt-in (origin §6 item 2).
5. **Threat model (fence):** the checker defends against accidental authoring mistakes by an ordinary contributor. Adversarial obfuscation of enrollment lines is out of scope and files to documented limits. **Consequence bound:** every input is either checked correctly or draws a surfaced finding; a conservative refusal plus a surfaced finding is a documented limit, not a finding. **Convergence criterion for review:** the surface is enrolled in the source-mutation registry (`tests/mutation/source/registry.ts:153`), so convergence is the mutation score plus an empty unaccepted-survivor set — a "guard does not pin what it claims" finding is admissible only with a surviving mutant from the declared operator set.

### 1.2 Out of scope

- Per-heading skip notes (Option B) and parent/child nesting with marked parents (Option C) — §7 items 1–2.
- Enrolling any existing plan; authoring markers for legacy tasks.
- Any change to marker grammar (`MARKER`, `MARKER_AC_ABSENT`, `ID` at `lib/specLint/taskContract.ts:28-39`), AC-id resolution (`resolvesId`), finding order (`compareFindings`), or any other `spec:lint` check family.
- Changes to `codex-guard --lint-doc` or `scripts/spec-lint.ts` — the checker's callers are untouched.

## 2. Design

### 2.1 Grammar — unchanged line forms, plural regions

The three line forms are byte-identical to origin §3.2: `OPEN` (`lib/specLint/taskContract.ts:19`), `END` (`lib/specLint/taskContract.ts:20`), and the marker forms. Indentation rules (0–3 spaces), fence-inertness, and CRLF normalization are unchanged. What changes is document-level cardinality: a plan may contain any number of regions, in sequence. There is no new syntax and no region count cap.

### 2.2 Region model

Lines are read in order; fenced lines are inert (unchanged). Region state is a single open/closed flag plus a rejected-opens counter, exactly as today (`lib/specLint/taskContract.ts:74-75`):

| Line | Region closed | Region open |
| --- | --- | --- |
| `OPEN` match | **starts a new region** (this is the behavior change) | `TASK_ENROLL_DUPLICATE`, message "task-region opening inside an unclosed region"; the line is inert — no region starts, the open region continues; `rejectedOpens += 1` |
| `END` match | consumed silently if `rejectedOpens > 0` (decrement); else `TASK_ENROLL_MALFORMED` "task-region close with no matching opening" | closes the current region |
| other `<!-- tasks:` line | `TASK_ENROLL_MALFORMED` (unchanged, `lib/specLint/taskContract.ts:123-133`) | same |

- End of document closes an unclosed region (unchanged, `lib/specLint/taskContract.ts:146`). Only the last region can be unclosed, since an `OPEN` while open never starts a region.
- The close-pairing rule is unchanged from origin §3.2: in `open open close close`, the first close closes the region (deterministic — the nested open's "intended" region is never guessed; the author was already told at the nested open), and the second close is consumed silently against the rejected open. In `open close close` the second close draws `TASK_ENROLL_MALFORMED`.
- A document with a `<!-- tasks:` line but **zero well-formed regions** (e.g. only `<!-- tasks: depth=7 -->`) keeps today's conclusion: the line-pass findings stand and recorded marker-shaped lines are discarded unjudged (origin §3.4.1's discard row, narrowed from "not exactly one opening" to "no well-formed region"). Note a lone unclosed `OPEN` *is* a well-formed region (EOF-closed), so this case is reachable only via malformed lines.

**Enrollment redefined:** a plan is enrolled iff it contains at least one well-formed region. The origin's two-pass correctness argument ("whether a region counts at all is not knowable until every enrollment line has been seen", `lib/specLint/taskContract.ts:8-12`) dissolves under this model — a region is final at its close, and no later line can invalidate it, because a nested `OPEN` is inert rather than disqualifying. Pass structure becomes an implementation choice, not a correctness requirement; the file's header comment must be updated to say so.

### 2.3 Per-region checking — all existing rules, region-local

For each region, with `depth`, `regionStart`, `regionEnd` now per-region:

- **Task selection** (unchanged formula, `lib/specLint/taskContract.ts:154-156`): headings of exactly the region's depth, strictly between the region's open and close lines.
- **`TASK_ENROLL_EMPTY`** (unchanged, `lib/specLint/taskContract.ts:157-165`): per region, anchored at that region's open line. An empty region does not affect any other region's checking, and marker classification still proceeds (the existing not-an-early-return rule).
- **Extents** (unchanged formula, `lib/specLint/taskContract.ts:169-178`): a task's extent runs to the next heading of the region's depth or shallower, the region's close, or end of document — whichever is first. An extent never crosses its region's close, so prose between two regions belongs to no task.
- **Marker ownership, cardinality, classification** (`lib/specLint/taskContract.ts:182-243`): unchanged. Extents from different regions are disjoint by construction (regions are disjoint and extents are clipped to their region), so the global marker-to-extent assignment is unambiguous. A marker outside every extent — including one between regions, or after a region's close — draws `TASK_MARKER_ORPHANED` (existing code; it now also covers the between-fences gap).
- **Fenced marker-shaped lines** (`markerShaped`, `lib/specLint/taskContract.ts:137-144`) stay a global, document-wide set; AC-id resolution (`resolvesId`) is document-wide and unchanged.
- **Finding order** (`compareFindings`, `lib/specLint/taskContract.ts:266`): unchanged; the comparator is already total over line/code/message and regions add no new tie shape.

Depths are independent per region; consecutive regions may declare the same depth (that is exactly the Shape-B split).

### 2.4 The two corpus shapes, worked

**Shape A** (`docs/superpowers/plans/observability/2026-07-04-mutation-surface-observability.md`): depth-2 region over `## Task 1`–`## Task 6` · close · the group header `## Tasks 7–16` sits between fences, unchecked · depth-3 region over `### Task 7`–`### Task 16` · close · depth-2 region over `## Task 17`–`## Task 22`. The group header is not a task and demands no marker.

**Shape B** (`docs/superpowers/plans/2026-07-26-stripcomments-shared.md`): the plan's depth-3 headings from its first task through its last are `### Task 1`, `### Task 2`, the interloper `### Canonical migration procedure ("PROC", used by Tasks 3–46)`, then `### Task 3`, `### Task 4`, `### Tasks 5–22`, `### Tasks 23–28`, `### Tasks 29–41`, `### Task 42`, `### Tasks 43–46`, `### Task 47`. Enrollment: depth-3 region over Task 1–Task 2 · close before the PROC interloper · reopen depth-3 over the remaining nine task headings · close.

**The unit of enrollment is the heading, not the numbered task.** A range heading like `### Tasks 5–22` is one checkable unit — it takes exactly one marker (its `red=` names the batch's verification command), which matches the origin's declared-grain rule: the checker never parses heading text to discover that eighteen tasks live inside. An author who instead wants a range heading unchecked fences it out exactly as the PROC interloper is fenced out. Both dispositions are expressible; neither is silent (an in-region range heading with no marker draws `TASK_MARKER_MISSING`).

## 3. Supersession map

The origin spec stays in place; this table is the normative delta. Each superseded locus gains a one-line pointer to this spec (same PR).

**Derived, not hand-listed.** The inventory comes from `rg -n 'TASK_ENROLL_DUPLICATE|exactly one|only one|second opening|duplicate open|Multiple regions' docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md` — every hit is either a row below or verified non-conflicting: the origin §3.2 close-pairing mechanics are retained verbatim; §3.4.1's "Pass 1 emits only `TASK_ENROLL_DUPLICATE` and `TASK_ENROLL_MALFORMED`" stays true (`TASK_ENROLL_EMPTY` remains a post-close conclusion); AC-8's each-code-fires matrix still holds because the code still exists; the catalog-driven CLI fixture rule (origin AC-45's preamble) follows the catalog wherever it lands; the remaining hits (AC-34, AC-41, §6 item 7) match the pattern on unrelated content.

| Origin locus | Old rule | New rule |
| --- | --- | --- |
| §3.2 "enrolled iff **exactly one** opening line" (restated in §3.4.1's enrolled row) | one region or nothing | enrolled iff ≥1 well-formed region |
| §3.2 *Every opening line after the first is `TASK_ENROLL_DUPLICATE` — whether or not a close intervenes* | sequential reopen is an error | reopen after close starts a new region; only an open **while open** draws the code |
| §3.2 "A duplicate opening leaves the plan unenrolled… task-level rows are skipped" (restated in §3.4.1's Pass-2 duplicate-openings paragraph) | any second open discards all marker judgement | a nested open is inert with a finding; all well-formed regions are checked. Discard survives only for zero-well-formed-region documents |
| §3.2 close-pairing probe: "the second opening correctly draws `TASK_ENROLL_DUPLICATE`" in `open → close → open → close` | that probe's premise | the sequence is now two regions and draws no enrollment finding; the pairing *mechanics* the probe motivates are retained for the nested-open case |
| §3.2 "single valid region could not be established" discard clause ("single valid region could not be established") | attempted-and-failed = anything other than exactly one valid opening | attempted-and-failed = zero well-formed regions; line-pass findings still always stand |
| §3.4 catalog row `TASK_ENROLL_DUPLICATE` — "any opening line after the first, intervening close or not" | catalog trigger | trigger becomes "opening line while a region is open"; message per below |
| §3.4 "Every marker code is pass 2, and that is a correctness requirement" | two passes required for correctness, because a trailing duplicate opening can retroactively unenroll the document | a closed region is final — no later line can invalidate it — so pass structure is an implementation choice (spec §2.2) |
| §3.4.1 line-pass rows: "no open seen yet" / "any open seen before → `TASK_ENROLL_DUPLICATE`" | state = "any open ever" | state = "currently open" |
| §3.4.1 conclusion rows "not exactly one opening → findings stand, markers discarded" and "enrolled (exactly one opening line)" | — | "no well-formed region → findings stand, markers discarded"; "enrolled (≥1 well-formed region)" |
| AC-26 / AC-30 | duplicate-open fixtures expect exactly `[TASK_ENROLL_DUPLICATE]` with task-level checks skipped | replaced by AC-2/AC-3 below; the `open → close → open → close` probe now expects **zero** enrollment findings |
| AC-29 — every line class × every region state | the OPEN × "open seen before" cell yields `TASK_ENROLL_DUPLICATE` | that cell splits: OPEN × "currently open" → the finding; OPEN × "closed, opens seen before" → starts a region |
| AC-32 — line-pass findings survive across all three not-enrolled shapes | third shape = duplicate openings | the malformed-opening and unmatched-close arms survive unchanged; the duplicate-openings arm is retired — that document is now enrolled (two regions) and fully checked |
| AC-45 duplicate-openings row | duplicate-open document expects `[TASK_ENROLL_DUPLICATE]` with markers unjudged | retired with the discard-all behavior; nested-open coverage moves to AC-3/AC-10 below (AC-46, the orphan-form matrix, is untouched) |
| §6 item 6, §6 item 7 | documented limits | closed by this spec; pointer added |

The `TASK_ENROLL_DUPLICATE` message changes from "second task-region opening; only one is supported" (`lib/specLint/taskContract.ts:98`) to "task-region opening inside an unclosed region".

## 4. Documentation changes

1. `docs/agents/spec-self-review.md` convention block (`docs/agents/spec-self-review.md:27-36`): after the existing example, add one sentence: a plan may declare several sequential regions, each with its own depth — close one and open the next; headings between regions are unchecked.
2. `docs/superpowers/specs/README.md` — row in the Cross-corpus amendments table for this spec.
3. Origin spec pointers per §3 above.
4. `BACKLOG.md` — `BL-TASK-ENROLLMENT-SINGLE-DEPTH` graduates to the archive on ship (marker off in the PR's last commit per invariant 12; archive entry cites this spec).

## 5. Acceptance criteria

Every criterion asserts the complete findings array, not presence (origin §5's rule; presence assertions cannot catch spurious extras — and R1 findings 3–5 each demonstrated a wrong implementation slipping through a presence-worded or EMPTY-inconsistent criterion, so the rule is load-bearing here, not inherited style). Finding arrays are stated in **report order** — the retained comparator's line-then-code-then-message order (`lib/specLint/taskContract.ts:266`); a suite helper that asserts sorted code lists adapts mechanically. Two fixture disciplines apply to every criterion: **every fixture region holds at least one marked task unless the criterion itself targets `TASK_ENROLL_EMPTY`** (an incidental empty region adds an EMPTY finding the expected list must otherwise carry), and **every `[]`-expecting criterion has a defect-variant sibling** proving the region it exercises is actually checked (probe-fixture-must-vary-the-field).

- **AC-1 — two depths, both checked.** Two fixtures: (a) a Shape-A-shaped fixture (depth-2 region, close, depth-3 region, close, depth-2 region; every task marked; group header between fences) reports `[]` — kills the retained single-region implementation, which reports `TASK_ENROLL_DUPLICATE` at the second open; (b) the same fixture with one depth-3 child marker-less reports exactly `[TASK_MARKER_MISSING]` at that child — proves the depth-3 region is checked inside a mixed-depth document, not merely tolerated.
- **AC-2 — reopen is not an error, and the second region is genuinely checked.** Two fixtures, both required: (a) `open close open close` with valid marked tasks in both regions → `[]`; (b) the same with a marker-less task in the *second* region → `[TASK_MARKER_MISSING]` at that task. Fixture (b) exists because (a) alone is an absence assertion — an implementation that *ignores* everything after the first region also reports `[]`.
- **AC-3 — nested open is loud, inert, and non-disqualifying.** `open(d2), marked task, open(d3), close, close` reports exactly `[TASK_ENROLL_DUPLICATE]` at the nested line — the outer region's task is judged (its marker classified), the nested open starts nothing, and its close is consumed silently. A second variant with the outer task marker-less reports `[TASK_MARKER_MISSING, TASK_ENROLL_DUPLICATE]` — the task heading precedes the nested open, so line order puts `TASK_MARKER_MISSING` first — proving the outer region is checked rather than skipped (supersedes origin AC-26/AC-30's skip-all expectation).
- **AC-4 — a marker between regions is orphaned, not assigned.** Both regions hold one marked task; a marker sits after region 1's close and before region 2's open. Report: exactly `[TASK_MARKER_ORPHANED]`. The full-list form is the discriminant: an implementation that *also* assigns the marker to an adjacent extent adds `TASK_MARKER_DUPLICATE` to the list and fails.
- **AC-5 — per-region EMPTY independence.** Region 1 selects zero tasks; region 2 holds a marker-less task. Report: `[TASK_ENROLL_EMPTY]` at region 1's open line plus `[TASK_MARKER_MISSING]` at region 2's task. Kills an abort-on-first-empty mutant.
- **AC-6 — EOF closes the last region in a multi-region document.** A closed well-formed region (marked task) followed by an unclosed second region whose final task is marker-less reports exactly `[TASK_MARKER_MISSING]` (origin AC-43's discipline: the final task must be defective so "checked" and "dropped" are distinguishable).
- **AC-7 — same-depth split around an interloper.** Two fixtures: (a) a Shape-B-shaped fixture (depth-3 region, close, interloper heading at depth 3, open depth-3, more marked tasks, close) reports `[]` — the interloper draws nothing; (b) the same with one post-reopen task marker-less reports exactly `[TASK_MARKER_MISSING]` — the interloper still draws nothing while its neighbors are demonstrably checked.
- **AC-8 — zero well-formed regions still discards.** A document whose only `<!-- tasks:` line is malformed (e.g. `depth=7`), containing a marker-shaped line, reports exactly `[TASK_ENROLL_MALFORMED]`. **The whole-array equality is what discriminates:** an implementation that judges recorded markers after failed enrollment reports `[TASK_ENROLL_MALFORMED, TASK_MARKER_ORPHANED]`, because zero regions means zero extents and every recorded marker therefore lies outside all of them. The fixture must use a malformed line, not a lone `OPEN` — a lone unclosed `OPEN` is a well-formed EOF-closed region.

> **Correction (2026-08-09, whole-diff R1 finding 1 — probed).** As ratified, this criterion instead read "**The marker must be defective in a form-classifiable way** (e.g. empty `red=`): a wrong implementation that judges markers after failed enrollment then adds `TASK_RED_EMPTY` and fails, whereas a valid marker produces the same list under both behaviors and proves nothing (R1 finding 4)." That rationale is wrong against this implementation. Removing the zero-well-formed-region return and running both marker forms gives, for each of them, clean `[TASK_ENROLL_MALFORMED]` and mutant `[TASK_ENROLL_MALFORMED, TASK_MARKER_ORPHANED]`: the orphan path emits `TASK_MARKER_ORPHANED` alone and classifies nothing, so `TASK_RED_EMPTY` never appears and the marker's form changes nothing. The criterion's REQUIREMENT is unchanged — the fixture and its expected list are exactly as ratified — and the empty-`red` marker is retained deliberately, as a strictly stronger input that additionally kills any implementation classifying a recorded marker without the orphan check.
- **AC-9 — extents clip at the region close.** Region 1's sole task is marker-less; a marker sits after region 1's close and before region 2's open; region 2 holds a marked task. Report: exactly `[TASK_MARKER_MISSING, TASK_MARKER_ORPHANED]`. An implementation whose extents leak past the close assigns the marker to the task and reports `[]` — the origin suite's AC-28 pattern (`tests/specLint/taskContract.test.ts:206`) extended across a region boundary, where the leak has somewhere to go.
- **AC-10 — close pairing unchanged.** (a) `open, marked task, close, close` → exactly `[TASK_ENROLL_MALFORMED]` at the second close; (b) `open(d2), marked task, open(d3), close, close` → exactly `[TASK_ENROLL_DUPLICATE]`, the second close consumed silently. The marked task exists because a task-less fixture adds `TASK_ENROLL_EMPTY` per §2.3 and the lists here must stay a function of the pairing behavior alone (R1 finding 5; case (b) is AC-3's first fixture, cross-referenced not duplicated).
- **AC-11 — every region is checked, not the first or last.** Three regions where the first and third each hold one defect and the middle holds a marked task (clean, non-empty) report exactly both findings. Kills first-region-only and last-region-only mutants.
- **AC-12 — docs.** `docs/agents/spec-self-review.md` documents multi-region enrollment (verified by grep in the plan; no new meta-test).
- **AC-13 — mutation gate.** `pnpm mutation:guards` on the `taskContract` surface: score does not regress and the unaccepted-survivor set is empty. If tests land in a new file, `tests/mutation/source/registry.ts` `suitePaths` gains the row in the same commit (the registry row's own comment records why both suites are load-bearing).

## 6. Testing notes

New cases extend the existing suites (`tests/specLint/taskContract.test.ts`, `tests/specLint/taskContractFindingOrder.test.ts` — the registry's declared `suitePaths`). Existing fixtures asserting the retired semantics are rewritten to the new expectations in the same commit as the behavior change. The migration rule is derived, not enumerated: every existing case whose fixture holds more than one `OPEN` line is re-expected under the new semantics. The two known clusters are the M2/AC-26/AC-30 duplicate-open cases and the M29/AC-32/AC-45 failed-enrollment case's third assertion (`tests/specLint/taskContract.test.ts:170` — its fixture `open, task, malformed marker, close, open, close` currently expects `[TASK_ENROLL_DUPLICATE]`; under the new semantics both regions enroll and it expects `[TASK_MARKER_MALFORMED, TASK_ENROLL_EMPTY]` in line order — the first region's marker is judged, the second region is empty); the derivation catches any case the clusters miss — TDD order: rewrite expectations red first, then change the checker.

The derivation spans every suite that builds enrollment fixtures, and the sweep (R3) found exactly one hit outside the main suite: `tests/specLint/taskContractWiring.test.ts`'s catalog-driven `TASK_ENROLL_DUPLICATE` fixture is sequential-reopen shaped (`tests/specLint/taskContractWiring.test.ts:76-90`) and under §2.2 becomes two regions reporting `[TASK_ENROLL_EMPTY]`. It is rewritten to the nested-open shape (`open, marked task, open, close, close`) so the retained code keeps its executable severity proof in the all-ten-codes CLI assertion. The wiring suite's caller contract (`lib/specLint/run.ts:37`) is otherwise unchanged, and `tests/codexGuard/lintDoc.test.ts`'s single-region fixture is unaffected.

## 7. Documented limits

1. **A parent task cannot itself carry a marker while its children are enrolled.** Group headers between fences are unchecked by design; a plan wanting a *marked* parent with marked children needs the Option-C nesting model. Re-open trigger: an author asks for a marked parent. (This is `BL-TASK-ENROLLMENT-SINGLE-DEPTH`'s deliberate residue, fenced by ratification §1.1 item 1, not a gap.)
2. **No per-heading skip notes.** Exclusion is expressed only by fence placement (Option B declined). Re-open trigger: a corpus shape where splitting produces pathological region counts.
3. **Fence placement is a silent per-heading opt-out.** Any heading left outside every region is invisible to the checker, and nothing accounts for which headings were excluded. Same trade as enrollment being opt-in at the plan level (origin §6 item 2), one level down. An author who fences out a real task gets no warning; the reviewer sees the fence placement in the diff.
4. **Depth is uniform within a region.** A plan interleaving depths heading-by-heading needs a region per run — verbose but expressible.
5. **Deterministic close pairing can differ from intent.** In `open open close close` the first close closes the *outer* region regardless of the author's intent for the nested pair; the nested-open finding is the signal. Conservative refusal plus surfaced finding — a documented limit per §1.1 item 5's consequence bound.
