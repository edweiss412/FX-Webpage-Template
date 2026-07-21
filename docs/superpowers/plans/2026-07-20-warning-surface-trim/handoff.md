# Warning surface trim — handoff

**Branch:** `feat/warning-surface-trim`
**Spec:** `docs/superpowers/specs/2026-07-20-warning-surface-trim-design.md`
**Plan:** `docs/superpowers/plans/2026-07-20-warning-surface-trim/plan.md`
**Base:** `222c25bd7`

---

## 1. What shipped

Three trims to what the show modal shows an operator, all of the same shape: a surface rendered something a second time, or rendered something that was not a problem.

1. The published Parse warnings panel lists info-severity rows only. Warn-severity rows already render as actionable cards inside their own sections, so the flat copy was a duplicate, and it was the copy with no controls.
2. The correction-loop sentence moved out of the panel and into each warning card's `?` popover, so it exists per warning instead of per panel.
3. Info-severity alerts stop reaching the modal's attention surface, restoring an exclusion the alert-audience-split spec ratified and that had lost every production consumer.

## 2. Invariant compliance

| Invariant | Status |
| --- | --- |
| 1 TDD per task | Every task red-green-commit. The two baselines (no-loss precondition, staged snapshot) are Step 0 of the tasks whose red phase depends on them, so no task adds implementation before its test. |
| 2 Per-show advisory lock | N/A. No `pg_advisory*` path, no mutation. |
| 3 Email canonicalization | N/A. No email boundary touched. |
| 4 No global sync cursor | N/A. |
| 5 No raw error codes in UI | Held. Both new sentences are plain language; §12.4 catalog untouched. |
| 6 Commit per task | Held, conventional commits. |
| 7 Spec is canonical | Held. Mechanism APPROVE'd at spec review R5a. |
| 8 UI quality gate | §12 below. |
| 9 Supabase call-boundary | N/A. No new client call site. |
| 10 Mutation-surface observability | N/A. No mutating route, no server action, no new admin surface. |
| 11 Isolated worktree | Held. All work in `FX-worktrees/warning-surface-trim`. |

## 3. Files changed

**Source**

- `lib/admin/visibleWarningRows.ts` (new) — the one predicate both the panel body and its rail count consume.
- `lib/admin/routedWarnings.ts` (new) — `deriveRoutedWarnings`, the active here/elsewhere counts.
- `lib/admin/attentionItems.ts` — `DOUG_EXCLUDED_CODES` filter plus the injected-set test seam.
- `components/admin/wizard/step3ReviewSections.tsx` — body filter, four-state empty branch, retired published guidance, widened `railCount`.
- `components/admin/review/ShowReviewSurface.tsx` — gate derivation and context threading.
- `components/admin/showpage/PublishedReviewModal.tsx` — derives and passes `routedWarnings`.
- `components/admin/showpage/sectionWarningExtras.tsx` — passes `followUpCopy`.
- `components/admin/PerShowActionableWarnings.tsx` — popover composition.
- `components/admin/CorrectionLoopCallout.tsx` — export only.

**Tests** — `tests/helpers/warningSurfaceFixture.ts`, plus suites for the predicate, the gate, no-loss, the panel, retired guidance, the popover, the staged baseline, the exclusion set, bell inclusion, and transitions.

## 4. The gate

The trim is enabled by the CONJUNCTION of `routedWarnings` and `renderSectionExtras` both being present, derived inside `ShowReviewSurface`. Resting it on the extras hook alone would let a mount enable the trim while supplying no counts, so the panel would drop warn rows with nothing to select its body-empty copy. Both partial configurations fail safe to today's render.

It is not a prop on `WarningsBreakdown` because it cannot be: the section registry mounts that component through `render: (s) => ...`, which receives only `SectionData`, and `railCount` has the same shape.

## 5. The four body-empty states

| Body list | `here` | `elsewhere` | State | Rendered |
| --- | --- | --- | --- | --- |
| non-empty | any | any | List | the info list, nothing else |
| empty | > 0 | any | Silent | nothing; the actionable cards render immediately below |
| empty | 0 | > 0 | Elsewhere | "Nothing else to note here. The warnings that need a look are in their own sections." |
| empty | 0 | 0 | Clean | "Nothing needs a look on this sheet." |

`here` and `elsewhere` count ACTIVE rows only, so an all-ignored sheet reads Clean rather than claiming work that is already dispositioned.

## 6. Scope deferrals

- The card origin discriminator ("from the sheet" / "from the app") was scoped, then cut: after the attention cut, nearly every alert left in the modal traces to the operator's sheet or Drive, so an origin label is a distinction without a difference.
- `warnings`-bucket extras still render BELOW the panel body. The Silent state exists so the copy stays true while that holds.
- `SHOW_UNPUBLISHED` and `LIVE_ROW_CONFLICT` stay in the modal.
- The data-gaps digest is not rehomed; the bell still carries it.

## 7. Review history

Spec: R1 (BLOCKING, 11 findings) → R2 split after three `no_verdict` dispatches → R2a/R2b (BLOCKING) → R3a/R3b → R4a/R4b → R5a **APPROVE** on mechanism. The test-plan vector was closed under the AGENTS.md three-round cap with its limits stated in spec §12.1.

Plan: R1 (BLOCKING, 3 ordering/factual defects) → R2 → R3 → R4 → R5, closed with every substantive finding addressed.

## 8. Defects the reviews caught that would have shipped

- The gate could not have worked as first specified: no channel exists from the modal to the registry render.
- Task ordering was unsatisfiable twice: a no-loss assertion that could not pass on unmodified code, and a rail count that switched a task before the body it counts.
- `String.prototype.trim` DOES strip U+00A0; both spec and plan asserted the opposite from memory until a one-line measurement settled it.

## 9. Defects the tests caught during implementation

- `blockRef.kind` is `rooms`, not `room`; the singular fell through to the fallback bucket and made the Elsewhere state unreachable.
- `stableWarningKeys` was computed from the full array while the list rendered the trimmed rows, which would have migrated per-warning control state.
- `warningFingerprint` returns null without a `rawSnippet`, so an all-ignored assertion built on snippet-less fixtures was ignoring nothing.
- A frozen literal used a curly apostrophe where the source builds a straight one, so an absence assertion was passing against a string that appears nowhere.
- An omitted required prop threw asynchronously after assertions passed: vitest exit 1 while the Tests line read all-green.

## 10. Assertions verified by mutation

Each was confirmed to fail against a deliberate defect and pass otherwise:

| Assertion | Mutant |
| --- | --- |
| rail and context receive the same gate | rail given "counts present" instead of the conjunction |
| no-loss precondition | ignored disclosure deleted from the extras |
| bell renders the cut codes | `BellPanel` self-filters them, importing no forbidden symbol |
| disclosure survives the compound transition | `<details>` re-keyed to force a remount |

## 11. Verification

Typecheck clean, eslint clean (one pre-existing `Link` warning, confirmed present at merge-base), prettier applied. Full component and admin trees green. Exit codes checked directly rather than read off the summary line.

## 12. Impeccable dual-gate record (invariant 8)

_Pending: critique and audit results are recorded here before this section is committed._
