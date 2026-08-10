# Round-economy filing — feat/heavy-phase-semaphore

## spec — 13 rounds

**Examined:** thirteen rounds to APPROVE/0 (10/6/3/5/3/3/4/5/2/3/1/1/0; one SIGTERM'd dispatch and one usage-limit dispatch not counted) on
`docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md`. The train's
dominant class is behavior-asserted-without-probe on OS/tool semantics: R1 landed
node-spawn fd non-inheritance and the vitest env-over-serial-pin layering; R2 landed
the worktree-locality of the build lock and the non-atomic config publication; R3 the
resolve-vs-acquire resize race; R4 the inode-identity gap, `os.link` source retention,
and the nested-acquisition deadlock. Every finding that survived carried a runnable
probe, and every accepted repair either deleted a mechanism (worker sizing, R1) or
replaced an argued property with a validated one (post-acquire identity+index check).
Two full reversals occurred on the build-exclusion question (R1 F6 out, R2 F1 back
in), each probe-forced; the decision is now fenced both directions in spec §1.1.

**Judgment:** the round burn was concentrated where the spec asserted semantics of
surfaces outside the repo (kernel flock/fd inheritance, vitest config resolution,
`os.link`) from documentation-level knowledge. The §4.0 probe section shrank rounds it
covered (P1/P2 claims were never re-litigated); every un-probed semantic claim cost a
round. The transferable rule is already in `docs/agents/spec-self-review.md`
(probe-before-argue) — this arc's lesson is that for a design whose ENTIRE substance
is OS semantics, the probe pass must cover every syscall-level claim, not just the
headline mechanism.

**Mechanizable:** none — the escaping class (unprobed external-semantics claims) has
no static signature `spec:lint` could match without probing the semantics itself;
`CITATION_FILE_MISSING`/numeric sweeps already ran clean on every round.

## plan — 4 rounds

**Examined:** four rounds to APPROVE/0 (3/4/3/0) on
`docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md`. Every finding was a
plan-discipline defect, none a design defect: R1 — task-green scope wider than its
tested cases, ambient reentrancy marker vacuating the dogfooded suite's fixtures,
post-merge tree mutation; R2 — a warn-cadence sliver still ahead of its first oracle,
an untested AGENTS.md prose contract, the closeout not using the priority convention
it ships, and a mechanically-impossible corpus-row sequencing requirement; R3 — an
AC's claimed coverage wider than its case body, an unobserved guard RED, and the
string-guard's missing operator enumeration.

**Judgment:** the spec's 13-round hardening left nothing design-shaped for the plan
rounds to find — the residue was all TDD-ordering and oracle-ownership bookkeeping,
which the task-contract linter cannot see because it checks marker FORM, not whether
a green scope exceeds its red's cases. The reviewer's per-behavior red-green framing
(each mechanism lands in the task whose case first asserts it) is the transferable
authoring rule; applying it while drafting would have made R1 F1/R2 F1/R3 F2 free.

**Mechanizable:** none new — green-scope-vs-case ownership requires reading both the
plan prose and the spec case bodies; `TASK_AC_MISSING`/marker grammar already ran
clean from round 1.

## diff — 5 rounds

**Examined:** five counted rounds on the implementation diff, dispatched as two
tight-scope reviews per the split-review default. The wrapper half
(`scripts/with-heavy-slot.py` + `tests/scripts/withHeavySlot.test.ts`, ~1600 lines,
the arc's entire mechanism) took APPROVE/0 in round 1 and was never re-opened; its
reviewed scope is byte-identical from that verdict to merge. Every counted round
after round 1 belongs to the other half: the AGENTS.md prose rule and its
string-presence guard, 4/1/1/1/1 findings across rounds 1-5.

That split is the finding. The half with kernel semantics, fd lifetimes across
`execvp`, inode identity, and an atomic swap protocol converged immediately, because
spec §7 had already enumerated its defect classes as executable cases and thirteen
spec rounds had probed each one. The half that burned three rounds is a paragraph of
English and a regex list.

**Judgment:** all six diff findings are one class — *the guard's stated coverage is
wider than its enforced coverage* — and the arc kept re-entering it because each
repair changed WHERE the gap lived rather than removing the possibility of one. R1
found members the hand-written list omitted; the repair derived the member set from
spec §4.6 spans, which closed omission and opened misclassification. R2 found a span
misclassified `ignore`, introduced BY that repair. R3 found an `ignore` row whose
prose reason ("pinned by its own clause") named a clause that pinned something
weaker. The bidirectional completeness test cannot see either, because an `ignore`
row IS an accounted-for span — the registry was complete and wrong.

R3's repair — `pinnedBy` as a REQUIRED, ASSERTED field on every `ignore` row, so a
row cannot claim coverage it does not have because asserting the claim IS the
coverage — was filed here after round 3 as closing the class. **Round 4 disproved
that claim, and the correction is the most useful thing in this filing.** It closed
the ignore-row SUBCASE. The wider class had another member the ignore rows could not
reach: R4 deleted three characters, the `non-` in "non-interactive", putting
interactive Playwright on the MUST side in direct contradiction with the MUST-NOT
side, with every registered code span and every clause pattern intact.

Round 5 then did it again, and that is what finally identified the real shape. It
produced seven more inversions — `never by alias` to `also by alias`, `stay
unwrapped` to `stay wrapped`, `bounds nothing across worktrees` to `bounds across
worktrees` — and the round-4 repair's own claim to have "swept every
polarity-bearing qualifier" was false for the same reason the round-3 claim was:

**The invertible set is every declarative clause in the paragraph.** Closing it by
adding patterns is an enumeration over English, which does not terminate. Three
rounds were spent discovering that, each one adding patterns and each one declaring
a class closed that the next round re-opened with an ordinary three-character edit.

The close is a VERBATIM PIN of the bullet against
`tests/docs/fixtures/agents-heavy-phase-rule.md`, whitespace-normalized so markdown
may reflow but no word may change. Every inversion fails, including all fifteen the
reviewer produced and every one nobody thought of, and the criterion is closed
rather than open: there is no "what if they word it differently", because any
different wording fails. The cost is one deliberate fixture update when the contract
genuinely changes — the correct ceremony for a document other harnesses depend on
and cannot see the spec behind.

The pattern checks stay, for two reasons that are worth separating. They name WHAT
broke, which a pin cannot; and the spec-derived registry closes the one axis the pin
structurally cannot see — a shape ADDED to spec §4.6 that the bullet never picked
up, where the bullet is unchanged and therefore matches its pin perfectly.

**The transferable rule, stated at the cost of five rounds:** a guard over PROSE can
close two things by assertion — that named things are present and on the right side,
and that the text is the text. It cannot close "the prose does not mean the opposite"
by pattern, at any length of pattern list. Decide at authoring time which of the
three you need, and reach for the pin the moment the answer is the third. The
round-3 and round-4 filings each declared this class closed one round before being
refuted, and both of those overclaims are left in the history above rather than
edited out, because the pattern they make is the finding.

Worth stating plainly against the round-1 brief: it named the mutation-family closure
as the convergence criterion and demanded a surviving mutant per finding, and every
round complied — eight findings, fifteen mutants, zero speculation, and no ratchet
into a markdown parser or an AST. Every round cost was bounded by a concrete accepted
document rather than an argument. The criterion did its job: it kept every round
honest and it is why the arc ends with a closed criterion instead of a longer list.
What a per-finding mutant requirement cannot do is tell you the enumeration you are
inside will not terminate — that took five rounds to see, and seeing it is what
produced the pin.

**Mechanizable:** the inversion class is now closed by construction (the verbatim
pin), the exemption-claim axis is type-required (`pinnedBy`), the spec-derived
registry catches a shape added to §4.6, and all twenty-five mutants five rounds
produced are `OPERATORS` rows, so no repair can silently regress an earlier one. What
remains unmechanized is the authoring judgement — knowing to reach for a pin rather
than a pattern list when the guard's subject is prose. That has no static signature;
it belongs in `docs/agents/writing-plans.md` alongside the anti-tautology rule, and
the paragraph above is written to be liftable there verbatim.

**Infra:** the sandboxed reviewer could not start Vitest (`EPERM` creating its temp
dir) in any of the three rounds and transpiled the exported pure checker in memory
instead. That worked only because the guard was authored as an exported pure function
over text with the file-reading confined to two module-level constants. A guard
written as a terminal script would have been unverifiable under the same sandbox — the
same shape the source-mutation registry requires for enrolment, arrived at
independently.
