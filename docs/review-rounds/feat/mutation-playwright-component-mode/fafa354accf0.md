## plan — 4 rounds

**Examined:** R1–R4, 13 findings (10 + 2 + 1 + 0; R4 APPROVE).

**Mechanizable:**

- "an AC summary line contradicts the task body it indexes" (R3-F1, and the R1 self-found
  AC-index insertion is the same surface) — the prose-count/self-consistency class;
  `BL-SPECLINT-PROSE-COUNT-PARITY` (in flight, PR #792) covers numeric instances, and the
  non-numeric contract-statement variant ("markers off in X commit" stated in two places)
  is its natural extension — noted against that row rather than a new one.
- "a gate command blind to the state it claims to check" (R1-F9 `.[0]` head-SHA, R2-F2
  three-dot diff vs working tree) — already the writing-plans probed-gate rule; both
  instances were authoring failures of an existing rule, not rule gaps. Mechanizable arm:
  `BL-SPECLINT-RED-EXECUTABILITY-ARM` (in flight, PR #794) clause (c) advisory covers
  gate-command probe annotations.

**Judgment:** R1's parity-registry finding (F1) and graduation-sequencing train
(R1-F10 → R2-F1 → R3-F1) were genuine design work — reconciling invariant 12's same-commit
rule with "review covers what merges" took three rounds to converge on
graduation-before-final-review + corpus-row-only last commit, and the final form is now
stated identically in Task 9, plan AC-7, and spec AC-7. R1's ten findings arrived in one
round with zero relitigation across R2-R4 — the exhaust-the-vector instruction held.

**Infra:** spec-stage R2 first dispatch died to the machine's background-task SIGTERM
(wrapper killed, `no_verdict` row recorded); re-dispatched detached (nohup+disown) and
every subsequent dispatch ran to verdict on attempt 1.
