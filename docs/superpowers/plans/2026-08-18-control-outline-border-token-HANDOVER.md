# Arc F handover — `fix/control-outline-border-token`

**STATUS: spec ACCEPTED · plan NOT APPROVED · nothing implemented.**

## The decision owed

Plan adversarial round 6 could not run. Codex reported the account's usage limit exhausted until **2026-08-23 15:40**; all three attempts exited 1 with that message, `failureReason: attempts_exhausted`, no signal, native binary resolved. That is a hard external block, not a reap and not a wrapper fault.

Five plan rounds completed (32 findings, all repaired). Round 5 confirmed the R4 systematic audit closed the recurring defect class and independently killed the target mutant. Round 6 was a confirmation round. A six-dimension self-review stood in and found zero findings — **it is not an approval and is not claimed as one.**

**RULED by the orchestrator (2026-08-18): none of the above — RETRY.** The credits block is being lifted by purchase, so R6 is deferred on a **credits outage, not skipped by choice**. Retry the dispatch periodically; if it is still refused after several attempts, implement against the repaired-but-unconfirmed plan and take the confirmation round at the DIFF stage, where a reviewer reads real code rather than a description of it. The six-dimension self-review stays in the round-economy filing as a **documented limit, not a substitute for the round**.

## Who decided what — the boundary matters

**The USER personally ruled exactly one thing on this arc: the text ramp** (2026-08-18), against a published mockup rendering three candidate weights in both themes, including the crew surfaces the 2026-08-16 arc never showed. Crew half is ratified, not inferred. That ruling is the one a future reader should treat as settled by the product owner.

**Everything else was the ORCHESTRATOR's**, including two decisions an earlier revision of this document wrongly credited to the user: the Option A marker-removal sequencing, and the choice to hand over explicitly unapproved. Both were made by `bl-orch` driving this session's prompt, which an implementer session cannot distinguish from user input — which is precisely why the attribution is corrected here rather than left to inference. A reader who believes the user personally ratified the sequencing would treat it as unreviewable; it is an orchestrator call and is open to revision.

## Scope, and why it is not the ledger's 30

The published cover is one quadrant of the class. `DESIGN.md` §1.2a's ratified predicate reads "filled with one of the four neutral ground tokens **or left unfilled**"; the cover implemented only the first disjunct and additionally admitted a divider.

| Class | Count | Disposition |
| --- | --- | --- |
| full resting outline, neutral fill | 29 | SWAP |
| full resting outline, unfilled | 8 | SWAP (second disjunct of the ratified predicate) |
| dividers (`border-t`/`-b`/`-l`) | 5 | EXCLUDE, evidenced per site |
| ShareHub `max-sm:` | 2 | FILED under class-sweep exception (b) |

**37 swapped** (36 census additions; one overlaps the predecessor census), 26 files, 32 source edits.

**FINAL partition: 8 delete / 10 raise to `border-text-subtle` / 3 raise to `border-accent-on-bg`.** It was drafted 13/5, ruled 12/6 at spec review, and reached 8/10 only at whole-diff review, when four sites moved from delete to raise because their surviving cue measured ~1.1:1 and delivered nothing. Any 12/6/3 or 9/9/3 you meet in an earlier round's prose is superseded by this line.

## The finding the brief did not anticipate

**The swap causes a hover inversion at 21 controls.** Rest moves to 3.35:1 while `hover:border-border-strong` stays at 1.59:1 — hovering would read *fainter*, contradicting the ruling being implemented. Not pre-existing: the predecessor's 21 contained exactly one `hover:border-*` and it was a semantic escalation. Repaired in-branch: 8 delete, 10 → `border-text-subtle`, 3 → `border-accent-on-bg` (both `hover:` and `aria-expanded:`). 17 physical edits, 13 files.

## Two things a reviewer should not re-derive

- **The spec moved after acceptance.** §4.2, §5.1 and AC-6 were stale against the spec's own ratified §3.6 and were corrected; §3.6 itself is unchanged. Verify the correction matches §3.6; do not re-open §3.6.
- **Marker-removal sequencing was ruled Option A by the ORCHESTRATOR** (2026-08-18 17:28), not by the user. Invariant 12's "so it never reaches main" names absence-at-merge as the purpose; the displacement risk is handled by the arming window (do not arm `--auto` until the ledger-closeout commit is pushed — PR #838).

## Artifacts

- Spec `docs/superpowers/specs/2026-08-18-control-outline-border-token-design.md` (accepted, spec round 5)
- Plan `docs/superpowers/plans/2026-08-18-control-outline-border-token.md` (**unapproved**)
- Probe record `docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md`
- Round-economy filing `docs/review-rounds/fix/control-outline-border-token/2ddbf038bdf4.md` — both stages, and the round-6 infra block
- Mockup https://claude.ai/code/artifact/0d4d6979-e998-414e-8b42-5120a1d72673

Three ledger rows filed: `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE`, `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`, `BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE`. The arc's own row stays **IN PROGRESS** — nothing is merged.

All gates green: `spec:lint` 0 hard on spec and plan, `--exec-red` validates, ledger and round-economy meta-tests pass. Tree clean, `0 0` against origin.
