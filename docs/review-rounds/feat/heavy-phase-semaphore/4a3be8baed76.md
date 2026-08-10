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

## diff — 3 rounds

**Examined:** three counted rounds so far on the implementation diff, dispatched as two
tight-scope reviews per the split-review default. The wrapper half
(`scripts/with-heavy-slot.py` + `tests/scripts/withHeavySlot.test.ts`, ~1600 lines,
the arc's entire mechanism) took APPROVE/0 in round 1 and was never re-opened; its
reviewed scope is byte-identical from that verdict to merge. Every counted round
after round 1 belongs to the other half: the AGENTS.md prose rule and its
string-presence guard, 4/1/1 findings across rounds 1-3.

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

R3's repair is the first one that removes the possibility rather than the instance:
`pinnedBy` is now a REQUIRED, ASSERTED field on every `ignore` row, so a row cannot
claim coverage it does not have — asserting the claim IS the coverage. The peers were
swept in the same commit (three operator rows, not the one reported). The
transferable rule: when an exemption carries a prose justification, the justification
is the next defect site, and the fix is to make the exemption's own claim executable.
This is the same shape as the repo's `// not-subject-to-meta: <reason>` and
`ADMIN_SURFACE_EXEMPTIONS` conventions, and it should have been the round-1 design.

Worth stating plainly against the round-1 brief: it named the mutation-family closure
as the convergence criterion and demanded a surviving mutant per finding, and every
round complied — six findings, six mutants, zero speculation, no ratchet into a
markdown parser. The criterion worked. What it could not do was stop a repair from
introducing its own gap, which is why rounds 2 and 3 exist at all.

**Mechanizable:** the specific defect is now mechanized in-repo — `pinnedBy` is
type-required, so an unpinned `ignore` row is a compile error, and the eleven mutants
three review rounds produced are `OPERATORS` rows rather than prose. The general form
(a prose exemption reason that no assertion backs) has no static signature a linter
could match across the repo's other registries without knowing what each reason
claims; it belongs in authoring guidance, not a gate.

**Infra:** the sandboxed reviewer could not start Vitest (`EPERM` creating its temp
dir) in any of the three rounds and transpiled the exported pure checker in memory
instead. That worked only because the guard was authored as an exported pure function
over text with the file-reading confined to two module-level constants. A guard
written as a terminal script would have been unverifiable under the same sandbox — the
same shape the source-mutation registry requires for enrolment, arrived at
independently.
