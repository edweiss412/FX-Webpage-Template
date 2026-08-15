# Review-round filing — docs/archive-dup-ids-spec

## spec — 7 rounds

**Examined:** the spec rounds to date on `docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md` (R1 BLOCKING/3, R2 BLOCKING/1, R3 NEEDS-ATTENTION/2, R4 NEEDS-ATTENTION/1, R5 NEEDS-ATTENTION/1 — the all-depth probe surfaced two live `###`/`####` pairs and the repair set became 43, R6 NEEDS-ATTENTION/2 — the demotion rule and verbatim-clause wording widened to match, R7 APPROVE/0). One vector dominated R2-R4: the collision scan's LEVEL RANGE — first hardcoded [2,3] (R2 F1), then a union form whose §1.1 edit silently no-opped while §2.2 landed (R3 F1, a `str.replace` without an assert — the #786 lesson re-learned live), then the union form itself escaped by a one-character depth typo (R4 F1). Converged by widening the scan to every mdast depth and letting the DOMAIN pass alone bound judged ids, with fire-plants for both escape shapes.

**Mechanizable:** (1) doc-edit scripts must assert every `str.replace` matched — the R3 F1 no-op is exactly the class `feedback_derive_closeout_counts_dont_retype_them` records; a shared `assert old in s` helper for spec-repair heredocs would have saved a full round. (2) A "scan-range narrower than claim-range" checker is the general shape of R2 F1/R4 F1 — when a spec states a domain claim ("every registered family", "any depth") the executable design must derive its range from the SAME source as the claim, never restate constants; spec:lint cannot see this today, and the repair pattern (derive, don't enumerate) is already the AGENTS.md class-sweep rule applied to level sets.

**Judgment:** R1's three findings (handoff protocol spelled out; AC-2/§2.4 contradiction; discovery overclaim vs `LEDGER_FAMILIES`) were genuine spec-completeness catches with no mechanizable arm — each was settled by citing the live registry/protocol precedent rather than by a probe.

## plan — 5 rounds

**Examined:** the plan rounds on `docs/superpowers/plans/2026-08-15-archive-duplicate-ids/plan.md` (R1 NEEDS-ATTENTION/4, R2 NEEDS-ATTENTION/1, R3 NEEDS-ATTENTION/3, R4 NEEDS-ATTENTION/1, R5 APPROVE/0). The train converged on ONE artifact: the survivor-direction discriminator. R2 F1 showed diff-stat could not see a reversal; R3 demanded the verifier exist, run, and sit in the A3 post-merge gates; R4 demanded the gate mutant carry a green baseline. The closing state — expectations JSON + verifier authored, probed (pre-repair red, repaired-scratch-tree green, single-row mutant red by id), and committed at plan time — also pre-validated the 43-demotion repair rule end-to-end before any implementer touches it.

**Mechanizable:** the no-baseline mutant probe (R4 F1) is `feedback_reason_class_pinning_kills_ok_stable_mutants`' baseline rule re-learned on a docs gate — every gate mutant needs a no-defect baseline in the SAME probe, and the probe harness should refuse to report a kill without one. The exit-inverted `grep -c` and bounded-log gates recurred from the sibling arc (class-swept here before dispatch, which is why they did not cost this arc rounds).

**Judgment:** R1 F2's offender-rule narrowing (drop the prefix disjunct, judge by domain membership alone) was a genuine spec-alignment catch — the wider rule was a recognizer widening the spec had not ratified, exactly the repair-direction-under-recurrence rule's NARROWING arm.
