# Close-out — warning card fixes

Plan: 00-overview.md and the four task files in this directory. Spec: `docs/superpowers/specs/2026-10-26-warning-card-fixes-design.md`.

## Ordered steps (after Task 18 is green)

1. **UI quality gate (Task 19), first.** Gate fixes and the gate-run commit (section 12 below, its marker line, any `DEFERRED.md` rows) land before verification and review, per AGENTS.md invariant 8.
2. **Full local verification (Task 20)** on the clean, committed tree, including the red-target re-read.
3. **Final cross-model review (Task 21).** Rounds are recorded only in the review-round corpus, which codex-guard writes per dispatch. This file is not edited after the final review dispatch, so the reviewed diff is the merged diff; a fix after any round re-runs step 2 and the next round.
4. **Ship (Task 22).** Push; real CI green on every required check (read the required-check list from the branch-protection API, not from memory); `gh pr merge --merge`; fast-forward local `main`; `git rev-list --left-right --count main...origin/main` reads `0  0`. No file edits.
5. **Ledger.** No `BL-` / `DEF-` row is closed by this branch (spec §1.5), so invariant 12 adds and removes no marker. Any P2/P3 the gate defers files in step 1, under the 2026-08-25 freeze rules (product-facing rows only, with `**Facing:**`).

## 12. Invariant-8 UI quality gate

(filled in the gate-run commit of step 1: the setup gates run, the findings table with dispositions, and the marker line)

## Documented limits

The spec's §17 (L1-L14) is the record. Spec R14 (2026-10-26) moved the 3-column venue layout out of L1: the venue card now links the empty value cell on both layouts every committed workbook uses (Task 2); L1 keeps the shapes the rule does not read.
