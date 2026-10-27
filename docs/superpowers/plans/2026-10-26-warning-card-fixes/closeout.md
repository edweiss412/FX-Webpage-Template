# Close-out — warning card fixes

Plan: 00-overview.md and the four task files in this directory. Spec: `docs/superpowers/specs/2026-10-26-warning-card-fixes-design.md`.

## Ordered steps (run on the final tree, after Task 19 is green)

1. **Cross-model review (Task 20).** Record each round's verdict and finding count here, per surface brief; a reversed decision is fenced in both directions in this file so it is not relitigated. If any stage reaches the round threshold, the review-round corpus filing for this branch is written before merge.
2. **UI quality gate (Task 21).** Section 12 below is filled in the gate-run commit, with the machine-checkable marker line written then and not before.
3. **Red-target re-read.** Confirm Task 19's citation re-read was done on the pre-change tree, and list any marker whose cited line no longer names the symbol its `why=` gives.
4. **Ship.** Push; real CI green on every required check (read the required-check list from the branch-protection API, not from memory); `gh pr merge --merge`; fast-forward local `main`; `git rev-list --left-right --count main...origin/main` reads `0  0`.
5. **Ledger.** No `BL-` / `DEF-` row is closed by this branch (spec §1.5), so invariant 12 adds and removes no marker. Any P2/P3 the gate defers files under the 2026-08-25 freeze rules (product-facing rows only, with `**Facing:**`).

## Review rounds

(filled during step 1)

## 12. Invariant-8 UI quality gate

(filled in the gate-run commit: the setup gates run, the findings table with dispositions, and the marker line)

## Documented limits

The spec's §17 (L1-L14) is the record. Spec R14 (2026-10-26) moved the 3-column venue layout out of L1: the venue card now links the empty value cell on both layouts every committed workbook uses (Task 2); L1 keeps the shapes the rule does not read.
