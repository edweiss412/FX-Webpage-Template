# Review-round filing — `fix/control-outline-border-token`

Base `2ddbf038bdf4`. Arc: the 2026-08-18 text-ramp ruling for control outlines at `border-border`.
Spec: `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md`.

## spec — 5 rounds

**Examined:** all five dispatches were `--stage spec` against the same reviewer configuration, 19 findings total (4 / 5 / 3 / 4 / 3), verdicts NEEDS-ATTENTION, NEEDS-ATTENTION, BLOCKING, BLOCKING, NEEDS-ATTENTION. Round 5 was authorised as a bounded CONFIRMATION round with a five-item verification surface and no fresh axis, and it returned three findings all inside that surface. Every finding was confirmed by probe before repair and none was refuted. Each round independently reproduced the arc's derived counts — universe 362, 42 token carriers, swap set 37, 26 files, 32 source-edit lines, 63 lexical occurrences, 5 dividers, the 12/6/3 hover partition — so the arithmetic is agreed across four independent runs and only the claims about it moved.

**Judgment:** the round count was NOT driven by reviewer imagination or by a recognizer ratcheting, which is the failure mode the round-economy rule exists to catch. It was driven by **the artifact making a factual claim about a live population that the artifact's own author had not measured**. Every round's findings landed on a different axis:

| Round | Axis | Design content? |
| --- | --- | --- |
| 1 | §9 asserted a transition utility across 37 sites without measuring it; chasing that surfaced the hover inversion the swap CAUSES at 21 sites | **Yes** — §3.6 is a real design consequence |
| 2 | the hover classification was computed over the UNION of an element's strings when it must be PER RENDER PATH | **Yes** — moved one site from delete to raise |
| 3 | the "no ground shift can invert" bound was false at 7 sites; one `aria-expanded:` border override was unretargeted | **Partly** — the bound was a claim defect, the `aria-expanded:` miss was a code change |
| 4 | census length 58 vs 57 (an overlapping row), "any state" vs "any enabled state", a false tinted-plate claim, a stale prescription in the probe record | **No** — four consistency and arithmetic errors |
| 5 | four residual 57/36 wordings, a disabled-composite band that excluded the unfilled case, and one path-numbering inconsistency between two sections | **No** — three document-hygiene errors, every one of them a residue of a round-4 repair |

Design content is monotonically decreasing and reached zero at round 4, and round 5 confirmed it: every one of its three findings was residue from a round-4 repair rather than anything about the design. That is convergence, and it is the signal the count alone hides. The stage was accepted after round 5 by orchestrator ruling, with the standing condition that a confirmation round returning only document hygiene ends the stage rather than minting another.

**The recurrence worth recording — one shape, three instances, two of which cost a round.** The arc repeatedly repaired the INSTANCE a finding named and left the DOCUMENT unswept:

| Instance | Shape | Cost |
| --- | --- | --- |
| R2 F1 → R4 F3 | reasoning over `allStrings(element)` (the union of every render alternative) where the question is about a single render path; fixed in the §3.6 hover classification, left standing in the §6 tinted-plate claim | one round |
| R4 F1 → R5 F1 | the census arithmetic corrected where the finding pointed, leaving nine other claims built on the old number — five caught pre-dispatch by diffing the brief's bound against the spec's, four by the reviewer | one round |
| R4 F2 → R5 F2 | the disabled composite stated as a BAND that excluded the unfilled ground; restated, still wrong, now given per ground | part of a round |

**The generalisable rule is narrower than "class-sweep the code" and it is the one this arc would pay for:** a finding names an instance; the repair owes the document. When review finds a reasoning error or corrects a number, sweep every CLAIM built on that reasoning or that number — across the spec, the plan, and the probe record — not only the site the finding cites. The third instance also shows the sub-rule: when a summary statistic has been wrong twice, stop summarising and state the underlying values.

**Mechanizable:** three of the nineteen.

- **The census overlap (R4 F1) — `declined: repaired in-branch, no ledger row warranted`.** `21 + 37 = 58` was arithmetic done in prose; the live answer is a set union, and `new Set([...old, ...arc]).size` returns 57. Any spec that states a post-change collection size should derive it rather than add it. The plan's Task 1.4 now pins 57 as an assertion, so the implementation cannot ship the wrong number even if a future reader repeats the addition.
- **Citation shorthand (R1 F2, R2 F5) — filed as `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE`.** Pure lint debt — 18 hard failures in round 1 and 13 more in the probe record at round 2, all the empty-path `` `:213` `` form. `pnpm spec:lint` catches every one of them and was not run before the first dispatch. Running it pre-dispatch is free and would have removed two findings' worth of reviewer attention from the count; the filed row moves the check into `codex-guard` itself, beside the mutation-score refusal, because the habit was already written down and was not followed here.

- **The union-over-strings reasoning error (R2 F1, R4 F3) — filed as `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`.** It beat human scrutiny twice, two rounds apart, in two different sections, which is the signal that it is not an attention problem. Two mechanical forms are available and the row carries both: a derived helper that answers "does this render path carry X" so a spec author cannot reach for `allStrings` when the question is per-path, and a document-level check that a corrected number or claim has no surviving occurrences of its predecessor.

The remaining sixteen are not mechanizable: they required measuring a live population (the transition utilities, the hover overrides, the 20-of-21 predecessor shape, the disabled composite) or reading render paths the way the runtime does.

**Infra:** none. No dispatch was reaped, no `no_verdict` result, no wrapper fault; all four returned `status: "verdict"` with a declared `FINDINGS:` line.

## plan — 5 rounds

**Examined:** five `--stage plan` dispatches, 32 findings (10 / 4 / 9 / 5 / 4), every verdict BLOCKING. Every finding was confirmed by probe; one was refuted in the other direction, where the reviewer's physical-edit count was right and this arc's was wrong. Each round independently reproduced the derived counts (362 / 13 unresolved / 42 carriers / 37 swap / 26 files / 32 edits / 21 hover elements), so the arithmetic was never in dispute — the claims about it were.

**Judgment: this stage was an UNDER-VERIFIED RESTRUCTURE, and that is a different failure from the spec stage's.** The spec stage burned rounds because the artifact asserted facts about a population nobody had measured. The plan stage burned them because **each repair was verified only against the finding that prompted it**, while the restructure it required touched invariants the repair never re-checked. The evidence is that three consecutive rounds found fallout from one earlier repair:

| Round | What was repaired | What that repair broke, found next round |
| --- | --- | --- |
| 1 → 2 | the tautological RED (P0) — a region and markers were added | the fix split one TDD cycle across two tasks, so a RED suite was committed and a `red-state=authored` named a task that authored nothing (R2 P0) |
| 2 → 3 | the tasks were merged and renumbered | six P0s: gates that ran before the commit they measured, an expected-RED count off by twelve, `red-target` values pointing at unrelated files, a mutant-passable doc assertion, a stale ledger figure, and a whole class of stale task references (R3) |
| 3 → 4 | greps tightened, references swept | two greps that still could not observe their subject, one stale reference the sweep missed, and a spec correction that had not reached the spec's own AC-6 (R4) |
| 4 → 5 | the ONE systematic audit, on orchestrator instruction | the audit CLOSED the union-vs-per-path class — R5 ran the stated mutant against `pathsCarrying()` and it is killed — but the R4 sequencing fix produced its own cluster (R5 F1, F2) |

**The audit worked, and that is the transferable result.** Rounds 1–4 patched finding-by-finding and each round found more of the same shape. Round 5, after a single pass over every invariant at once — every `red-target`, every `red=` command, every cross-reference, every AC proof channel, every gate observation window, every runnable block executed against the live tree — found **no new instance of the class**, and independently verified the repair. **Patching a restructure's fallout one round at a time is a drip even when every finding is real.**

**A pre-dispatch re-run of already-passing invariant checks caught a defect no finding named** (a backticked `origin/main...HEAD` in prose being read as a file citation). That is now a standing step rather than a one-off.

**Mechanizable:** two of the thirty-two.

- **The union-versus-per-path shape (R5 F1, and its two spec-stage instances) — filed as `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`.** Three instances across two stages. The repair that finally held was a named `pathsCarrying()` helper the assertions are written against, not a third careful hand-check — which is the general lesson: when the same reasoning error recurs, give the correct reasoning a name that is easier to reach for than the wrong one.
- **`red-target=` cannot name a repo-root production surface — filed as `BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE`.** It forced two TDD tasks outside the red-contract region, so `--exec-red` validates less than the plan describes. The row also proposes the cheap half: an advisory when a plan has a red-contract region AND `##`-level tasks outside it, so an unnoticed opt-out is visible.

The remaining thirty were not mechanizable: they required reading a gate against the commit boundary it runs at, counting elements rather than lexical occurrences, or knowing which half of a two-part AC a step actually proves.

**Infra:** none. All ten dispatches across both stages returned `status: "verdict"` with a declared `FINDINGS:` line; no reap, no `no_verdict`, no wrapper fault.
