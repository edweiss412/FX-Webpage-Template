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
