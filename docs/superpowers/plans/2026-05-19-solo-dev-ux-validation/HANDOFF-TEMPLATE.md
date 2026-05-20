# M12 Plan Adversarial-Review Handoff Template

Per AGENTS.md mandatory writing-plans step + user R0 authorization (up to 40 rounds, fresh-eyes per round, anchored on milestone-base).

Each round's handoff lives in `handoffs/round-NN.md` and follows this template. Round numbers are 1-indexed and run consecutively until Codex returns APPROVE or the 40-round cap is reached.

---

## Template

```markdown
# Round NN Handoff

**Date:** YYYY-MM-DD
**Codex thread ID:** <captured from companion output>
**Diff base:** <SHA of milestone-base; the parent of 00-overview.md's first commit>
**Verdict:** APPROVE / needs-attention

## Focus prompt sent

<paste the focus text>

## Findings

| # | Severity | Section | Disposition |
|---|---|---|---|
| F1 | P0/P1/P2 | <plan section ref> | <fix description + commit SHA> |

## Class-sweep additions

- <any class-sweep items beyond the named findings>

## Repair commit

<commit SHA + message>

## Next round

If verdict was `needs-attention`, fire round N+1 with the same focus pattern (lead with fresh-eyes whole-plan audit; prior-round findings in secondary checklist).
If verdict was `APPROVE`, plan proceeds to execution (Phase 0.A).
If round 40 was reached without APPROVE, plan proceeds to execution regardless per user R0 authorization; remaining findings documented in the FINAL ROUND handoff.
```

---

## Notes

- **Each round is fresh-eyes** anchored on the milestone-base, NOT scoped to the previous round's fix-base (per memory `feedback_adversarial_review_full_milestone_scope`).
- **Lead with fresh-eyes** (whole-diff audit anchored on plan watchpoints); prior findings + commit SHAs go in secondary checklist below (per memory `feedback_review_prompt_fresh_eyes_first`).
- **Reviewer never fixes** (per memory `feedback_adversarial_review_repair_routing`); Codex returns findings; Opus repairs in this plan-tree session.
- **Class-sweep before patching** (per memory `feedback_class_sweep_before_patch`) — when review surfaces a bug, grep the plan for the same class BEFORE patching only the named instance.
- **Iterate until APPROVE** (per memory `feedback_iterate_until_convergence`) — don't halt because each round surfaces new bugs; halt only when Codex returns APPROVE OR the 40-round cap is reached.
- **Same-vector recurrence triggers comprehensive re-analysis** — if 3 consecutive rounds find on the same vector, do comprehensive re-analysis of that vector before round N+1 (per AGENTS.md + memory `feedback_same_vector_recurrence_triggers_comprehensive_reanalysis`).
