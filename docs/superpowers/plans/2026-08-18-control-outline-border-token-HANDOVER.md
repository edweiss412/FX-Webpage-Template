# Arc F handover — `fix/control-outline-border-token`

**STATUS: IMPLEMENTED AND READY TO MERGE.** Spec accepted (5 rounds), plan accepted (6 rounds), all seven tasks shipped, whole-diff review run to 5 rounds.

This document described an unapproved, unimplemented arc for most of its life and was rewritten at closeout. If you are reading a sentence that says nothing shipped, it is gone now — everything below reflects the merged state.

## What shipped

| | |
| --- | --- |
| Controls swapped | **37** — `border-border` → `border-text-faint`, 26 files, 32 lines |
| Hover repair | **21 sites** — 8 delete, 10 raise to `border-text-subtle`, 3 raise to `border-accent-on-bg` |
| Census | 21 → **57** rows, with a per-row negation assertion and three fixtures |
| Excluded | 5 dividers, ShareHub's 2 `max-sm:` elements, one `<select>` outside the scanner's tag vocabulary |
| Mutation score | **65/65**, 0 unaccepted survivors |
| Invariant-8 gate | `impeccable-gate: critique=RAN audit=RAN p0=1 p1=1 dispositions=recorded` |
| Ledger | 1 row archived, **6** filed; relation `354 = 348 + 6` |

## Review history

Spec BLOCKING/NA ×5 → accepted. Plan BLOCKING ×5 + 1 → accepted. Diff: BLOCKING(4), NA(2), NA(1), NA(2), NA(3) — **no behavioural defect after round 1.**

**The defect worth knowing about.** Raising 37 resting outlines to 3.35:1 left four controls whose surviving hover cue was worth nothing — `hover:bg-surface-raised` where `--color-surface` and `--color-surface-raised` are both `#ffffff`, a literal 1.000 ratio. A per-path check confirmed a cue was PRESENT at every one and reported zero uncovered; that was true and insufficient. **Presence is not adequacy.** The operational test that separates them is whether a perceptible CHANNEL changes: the fill wash is identical at ~1.109:1 on both sides of the line, and what distinguishes adequate from not is a hue change at ΔE76 72.9/65.2 versus 5.6/4.6.

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
