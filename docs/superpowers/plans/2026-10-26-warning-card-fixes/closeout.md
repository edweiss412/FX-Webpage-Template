# Close-out — warning card fixes

Plan: 00-overview.md and the four task files in this directory. Spec: `docs/superpowers/specs/2026-10-26-warning-card-fixes-design.md`.

## Ordered steps (after Task 18 is green)

1. **UI quality gate (Task 19), first.** Gate fixes and the gate-run commit (section 12 below, its marker line, any `DEFERRED.md` rows) land before verification and review, per AGENTS.md invariant 8.
2. **Full local verification (Task 20)** on the clean, committed tree, including the red-target re-read.
3. **Final cross-model review (Task 21).** Rounds are recorded only in the review-round corpus, which codex-guard writes per dispatch. This file is not edited after the final review dispatch, so the reviewed diff is the merged diff; a fix after any round re-runs step 2 and the next round.
4. **Ship (Task 22).** Push; real CI green on every required check (read the required-check list from the branch-protection API, not from memory); `gh pr merge --merge`; fast-forward local `main`; `git rev-list --left-right --count main...origin/main` reads `0  0`. No file edits.
5. **Ledger.** No `BL-` / `DEF-` row is closed by this branch (spec §1.5), so invariant 12 adds and removes no marker. Any P2/P3 the gate defers files in step 1, under the 2026-08-25 freeze rules (product-facing rows only, with `**Facing:**`).

## 12. Invariant-8 UI quality gate

Run by the orchestrator on `feat/warning-card-fixes` at 36f21ae60 (the full UI diff of Tasks 6-17), then re-run on the guard and accessibility follow-ups (36f21ae60..e224fc9e6): the P1 was confirmed resolved and the re-run found no P0 or P1. Setup gates ran each time: the context loader's read of PRODUCT.md and DESIGN.md, then the product-register reference. Critique used two isolated passes (design review; detector plus browser overlay) over scratch builds of the standalone harnesses (wizard layout, archived, save and jumps scenarios; the published compact card), light and dark, 375px and 1280px. The detector's single CLI hit was a false positive (an `<img>` inside a JSDoc comment, pre-existing).

Critique 27/40. Audit 17/20 (a11y 3, performance 4, responsive 3, theming 4, integrity 3).

| # | Pass | Tier | Where | Finding | Disposition |
|---|---|---|---|---|---|
| 1 | critique | P1 | useRawDraft.tsx, DataQualityWarningControls.tsx | An unsaved reading pick was dropped without a prompt on Publish, Re-scan or closing the review. | Fixed: Eric chose "warn before losing it" (spec R15, §6.5); dffe9f58c (spec §6.5, plan Task 18b) and a5ac73274. |
| 2 | audit | P2 | ShowReviewSurface.tsx, step3ReviewSections.tsx | The three new jumps scrolled and flashed their target but left focus on the button (WCAG 2.4.3). | Fixed: 67ebdbc10. |
| 3 | audit | P2 | DataQualityWarningControls.tsx | Picking a reading announced nothing; "Not saved yet" was reachable only from Save. | Fixed: e224fc9e6. |
| 4 | critique | P2 | step3ReviewSections.tsx (linked title row) | The 44px floor on a linked title row sits the title about 8px below the chip's centre. | Accepted: the floor is DI-1 (spec §13) and the tap target is the binding constraint; the offset is visual only. |
| 5 | critique | P2 | step3ReviewSections.tsx (title wrap at 375px) | A long judgment title wraps, leaving the dot alone on line 1. | Accepted: the wrap is pre-existing; the icon only makes it more frequent. |
| 6 | critique | P3 | step3ReviewSections.tsx (judgment chip) | The hollow Circle chip can read as an unchecked radio above the reading radios. | Accepted: glyph is spec builder call B4 (contrast); ring and tag are ratified R1. |
| 7 | critique | P3 | catalog.ts, archivedTabOffer.tsx | Help text says "include it from the Pack list section" above the inline button; actions stack in three rows. | Accepted: the copy also serves the Pack list placement (R13). |
| 8 | critique | P3 | PerShowActionableWarnings.tsx | A neutral Judgment call tag on an amber published card. | Accepted: the amber tone is the pre-existing published surface. |
| 9 | critique | P3 | warningReadingDisplay.ts | The "(no header text)" placeholder is quoted like a case name. | Accepted: documented limit territory, rare input. |
| 10 | critique | P3 | step3ReviewSections.tsx (Accepted rows) | Wizard Accepted rows do not show which reading was accepted; published rows do. | Accepted: out of the brief's scope. |
| 11 | audit | P3 | sectionWarningExtras.tsx | Reading choice sits before Report/Accept on choice rows and after on others. | Accepted: matches the spec's §6.3 layout. |
| 12 | audit | P3 | PerShowActionableWarnings.tsx | A nested flex wrapper holds one child. | Accepted: harmless. |
| 13 | re-run audit | P2 | unsavedReadings.tsx | The prompt's focus return ran before the shared dialog helper's own restore, so focus could land on the previously focused control instead of the trigger. | Fixed: 62dbf4a74. |
| 14 | re-run critique | P3 | ShowReviewSurface.tsx | Jump targets had no accessible name. | Fixed: c880985fe. |
| 15 | re-run critique | P3 | unsavedReadings.tsx | The prompt body stayed singular at two or more unsaved rows. | Fixed: d03a31381. |
| 16 | re-run critique | P3 | unsavedReadings.tsx | The prompt appears instantly where FinalizeBlockerDialog slides up. | Accepted: instant is the reduced-motion-safe default; no layout shift. |
| 17 | re-run critique | P3 | unsavedReadings.tsx | "Discard and continue" does not name the action; the prompt cannot name or save the rows it counts. | Accepted: copy is spec §6.5 (R15); naming rows is limit L16. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=1 dispositions=recorded

## Documented limits

The spec's §17 (L1-L14) is the record. Spec R14 (2026-10-26) moved the 3-column venue layout out of L1: the venue card now links the empty value cell on both layouts every committed workbook uses (Task 2); L1 keeps the shapes the rule does not read.
