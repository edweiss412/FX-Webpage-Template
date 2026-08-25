# Adversarial review — spec, round 1

## Your role

**REVIEWER ONLY.** Do not fix issues, do not propose patches as commits, do not imply changes you will make. Challenge the design and surface findings. Fixes are the implementer session's job in a separate dispatch.

Do NOT invoke any nested cross-model review from inside this session (no `/codex:adversarial-review`, no companion script, no `/codex:review`). Your verdict comes from your own direct output.

**Fresh eyes.** Treat this document as if you have not seen it before. There is no prior round to follow.

## Subject

One file: `docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md`, at branch `feat/planlint-ac-command-observability`, commit `b1472fdf6`.

It specifies a new `spec:lint` arm over plan documents. A plan opts one markdown table in with a declaration comment naming which column holds the producing command; in a declared table the arm asserts hard that each row's command cell carries a command, and advises when a row cites a `tests/`-rooted pin the command cannot reach.

Background you may need: `lib/specLint/` is the pure lint core, `scripts/spec-lint.ts` is the CLI adapter that owns every subprocess, `BACKLOG.md` holds the ledger row `BL-PLANLINT-AC-COMMAND-OBSERVABILITY` this arc implements.

## Convergence criterion for this review

**Consequence bound.** Every data row of every DECLARED table is handled correct or signaled, never silently wrong: it is either checked correctly or reported by name. There is no input for which the arm silently accepts an unrunnable cell in a declared command column. A worst case of "conservative outcome plus a surfaced finding" is a DOCUMENTED LIMIT and files to section 7, not to a finding.

**PROBE DOMAIN.** The plan corpus under `docs/superpowers/plans/`, plus the four historical blobs of the fixture named in section 1.2 (`173bfccfe`, `b1db667e0`, `f921a138b`, `b3705cebd`). An admissible probe is an input drawn from that set, or one ordinary authoring edit away from an input in it. A constructed fixture outside that domain files to section 7's documented limits, not to a finding.

**Threat-model fence.** The arm defends against accidental authoring mistakes by an ordinary contributor writing a plan. Adversarial obfuscation is explicitly out of scope. A contributor who wants the arm silent deletes the declaration line, which is one line and leaves a diff, so there is nothing for obfuscation to buy.

**Admissibility.** Every clause below cites the fence and the domain above.

- (a) A claim about current repo behaviour or corpus content is settled by PROBE. Include the command and its output. Do not argue it.
- (b) A hypothetical input is a finding only if a probe drawn from the PROBE DOMAIN shows silent corruption or a wrong accept. Otherwise it files to section 7.
- (c) No tightening of the recognizer is accepted without a probe, from the PROBE DOMAIN, demonstrating the corruption it prevents. The spec's central argument is that recognizer growth is the losing move here; a finding that proposes more grammar must clear that bar.
- (d) A constructed fixture outside the threat fence is not a finding.

**Exhaust the vector.** Enumerate ALL instances of each finding class you identify in THIS round. A repeated vector dripped one instance per round is a review defect, not thoroughness. If you find one stale number, sweep the whole document for stale numbers before you write the finding.

## Explicitly do not relitigate

Each is ratified in the document with its evidence. Verify the citation if you doubt it; do not re-derive the decision.

1. **Declaration instead of recognition.** Section 2 measures it: 34 AC coverage tables in the corpus, 34 distinct header rows, zero repeats, 24 distinct enclosing headings, column counts 2 to 6. Do not propose header-name matching, enclosing-heading matching, or a last-column heuristic. Section 6's accounting shows the last-column heuristic producing 19 hard findings on six v1-era tables whose last column is a Notes column.
2. **The hard/advisory split.** Hard for (a), advisory for (b). Ratified in the ledger row itself, quoted verbatim in section 1.1.
3. **`sh -nc` alone is not the mechanism.** Section 3 executes it against all four prose cells the ledger row cites; all four exit 0. The correction (the cell must contain an inline code span) is a narrowing, not a widening.
4. **Arm (b) validates, it does not discover.** Documented limit L-2, with the reason: at the blob r4 F2 was raised against, the row cited no pin at all. Do not file "arm (b) would not have caught r4 F2" as a finding; the spec says so first.
5. **Thirty-three corpus tables go unlinted on day one.** Documented limit L-3, accepted deliberately as the price of refusing a recognizer.
6. **The five true corpus instances in section 6 are not repaired here.** Class-sweep disposition exception (c), stated in section 11 of the ledger discipline: the repair spans a tree this PR does not otherwise touch, and each is a judgment call about what that plan's third column means.
7. **The `--` repair to `scripts/spec-lint.ts:864` IS in scope.** Same defect class, same seam the new arm calls, class-sweep default is repair-in-the-same-PR.

## Where to look hardest

- **Section 8.2.1's boundary table.** Is there a boundary input drawn from the PROBE DOMAIN that it does not name, whose behaviour would be a silent wrong accept? That is the highest-value finding available.
- **The accept-set.** "At least one inline code span whose content is not blank, and whose first such span exits 0 under `sh -nc --`." Is that an accept-set keyed on structure, or does it smuggle in a denylist?
- **Section 8.3's seam reuse.** The claim is that reusing `extractSpans` and `classifySpan` means no second recognizer can drift. Check that claim against the actual code.
- **Numeric consistency.** Sections 2, 4, 5 and 6 carry counts. Section 6 carries an accounting table that must reconcile: 6 tables + 5 tables = 11, and 19 hard + 7 hard = 26. Check every number against the body it describes.
- **Whether any documented limit in section 7 is really a defect wearing a limit's clothes.**

## Output format

Number each finding. For each: the claim, the file and line, the probe you ran with its output, and the consequence if unrepaired. Then, on their own lines at the very end:

```
FINDINGS: <n>
VERDICT: <APPROVE | NEEDS-ATTENTION | BLOCKING>
```

`FINDINGS: 0` when you raise none. If you find nothing admissible under the criterion above, say so plainly and APPROVE.
