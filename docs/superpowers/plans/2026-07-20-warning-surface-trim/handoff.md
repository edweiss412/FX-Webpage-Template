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

Run 2026-07-21, impeccable 3.9.1, canonical v3 setup (context load → PRODUCT.md, register
`reference/product.md`, this being admin tooling where design serves the product). Surfaces:
`step3ReviewSections.tsx` (WarningsBreakdown region), `ShowReviewSurface.tsx`,
`PerShowActionableWarnings.tsx`, `sectionWarningExtras.tsx`, `PublishedReviewModal.tsx`,
`CorrectionLoopCallout.tsx`.

**Method: dual-agent.** Assessment A (design review) and Assessment B (detector + static evidence)
ran as two isolated sub-agents and did not see each other's output. Browser visualization was
SKIPPED with cause: the surface is admin-only behind Supabase auth and needs a seeded database, so
there is no cheap viewable URL. No overlay was produced and none is claimed.

### Critique

Design health 24/40 on the first pass, 26/40 after repairs. Detector: 1 finding
(`broken-image`, `step3ReviewSections.tsx:3191`), a verified FALSE POSITIVE — a documented
deliberate revert that is already on `origin/main` and not in this diff.

| Sev | Finding | Disposition |
| --- | --- | --- |
| P0 | Silent shipped an empty bordered, shadowed card: chrome persisted around a null body while the real cards render below it | **FIXED** `b47c2b25d` + `79bb287ea`. Surface computes `suppressPanelCard`. The first attempt inspected `children` and silently did nothing, because a body whose expressions all evaluate to null is still a populated children array. |
| P0 | Suppressing the card ALSO dropped `parseNotes`, the exclusive render site for `PARSE_ERROR_LAST_GOOD` / `RESYNC_QUALITY_REGRESSED` | **FIXED** `79bb287ea`. Introduced by the P0 repair above and caught by the re-critique. A structural no-drop violation; the predicate now covers everything the body renders, with a regression test mounting Silent + a parse notice. |
| P0 | Rail dot derived from every warn row including ignored ones, so an all-ignored sheet showed amber "needs a look" above "Nothing needs a look on this sheet." | **FIXED** `b47c2b25d`. Derives from the ACTIVE counts. |
| P1 | The heading rendered its count and its amber pill in one text run: "(0) Needs a look" | **FIXED** `79bb287ea`. Pill derives from the active bucket count; a test asserts the inverse so the fix cannot become "never flag". |
| P1 | The ignored list promised a clear: "we'll re-read the sheet and clear this" on already-dismissed warnings | **FIXED** `b47c2b25d`. `followUpCopy` rides the active list only. |
| P1 | The popover's paragraph break never rendered (`"\n\n"` into a plain div) | **FIXED** `b47c2b25d` as a rendering fix; joined with a space. A real break needs `whitespace-pre-line` on the SHARED `HoverHelp` body, deferred. |
| P2 | `hasWarnRow` gated on `routedWarnings` alone while the trim gates on the conjunction | **FIXED** `79bb287ea`. Same gate. |
| P1/P3 | Heading count "(0)" in Silent; panel still titled "Parse warnings" | **DEFERRED** — both touch numbers or names ratified in the spec; see `DEFERRED.md`. |

### Audit

16/20. Accessibility 3, Performance 3, Theming 4, Responsive 3, Anti-patterns 3.

| Sev | Finding | Disposition |
| --- | --- | --- |
| P1 | `hasWarnRow` counted `elsewhere`, so AT announced "Parse warnings (0) — needs review" immediately before the body says "Nothing else to note here" | **FIXED** `<this commit>`. `here` only; those warnings light their own sections' dots. Regression test asserts across BOTH rails. |
| P2 | No live region announces the state change | **DEFERRED** — pre-existing on this surface; see `DEFERRED.md`. |
| P2 | The follow-up sentence enters every card's accessible description (12 cards, 12 repeats) | **DEFERRED** — per-card placement is ratified in spec §4; per-group is a design change. |
| P2 | "…are in their own sections" names no section | **DEFERRED** — spec §3.4 authored copy. |
| P3 | Extras `border-t` reads as a heading underline when the card is suppressed; stale `data-warning-index` comment | **DEFERRED**, both cosmetic or latent. |

Verified NOT issues: suppressing the card does not break heading hierarchy (`<h3>` unchanged) or
orphan a landmark, and cannot drop focus (it fires only when the body has zero focusable nodes).
New empty-state lines measure 6.8:1 light and 6.4:1 dark on `bg-surface`, clearing AA. The diff adds
no interactive element, no fixed width, no `transition-*` or `animate-*`, and no one-off class.

**Every P0 and P1 is FIXED. No P0 or P1 is deferred.**
