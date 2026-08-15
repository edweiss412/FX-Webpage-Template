# Diagram demote notice — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** render the transient `aria-hidden` "Full detail unavailable" chip on the affected lightbox slide at demote time, in lockstep with the existing sr announcement, with a literal 6000ms lifetime carried into the DESIGN.md §5.5 derived inventory.

**Architecture:** one branch `feat/diagram-demote-notice` off `origin/main`, TDD per task, impeccable dual gate (UI surface, Opus-owned), cross-model diff review, CI-green merge.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md` (spec-APPROVED, codex-guard R5 2026-08-15) · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 5 (plain copy, no code), 6 (conventional commits), 8 (impeccable dual gate — `components/diagrams/**` + `DESIGN.md` §5.5 row are UI surface), 11 (worktree-only), 12 (claims).
- Pre-code mechanical UI gate: no em dash; chip is non-interactive (no tap-target obligation); Reset-chip token family only, no new tokens/colors/contrast pins; duration tokens for motion (no literal ms in classes).
- Timing discipline (spec §1.1 item 5): `DEMOTE_CHIP_VISIBLE_MS = 6000` module-level literal; §5.5 row + `pnpm exec tsx scripts/scan-interaction-timings.cli.ts` regen in the SAME commit; `tests/docs/_metaInteractionTimingInventory.test.ts` green both directions.

## Pre-draft verification pass (writing-plans rule; run 2026-08-15 in the authoring worktree)

- Demote handler: `components/diagrams/GalleryLightbox.tsx` — `demotedRef.current.add(item.id)` at line 872, `onAnnounce` call in the same branch; `demotedRef` identity-stability comment at line 281.
- Reset chip block: absolute positioning + reflow rationale at line 604; classes at line 634; `top-2` slot at line 618.
- Announce region: `AnnounceLogRegion` at `components/diagrams/GalleryLightbox.tsx:588`; `role="log"` semantics `components/admin/announceLog.tsx:120`.
- Existing demote test: `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx:503`.
- Scanner forms: `scripts/scan-interaction-timings.ts` (timer-literal + named numeric binding); contract suite `tests/docs/interactionTimingScan.test.ts`; inventory parity `tests/docs/_metaInteractionTimingInventory.test.ts`; DESIGN.md §5.5 regen command per its header.
- Verify at execution (first step of C1): the scanner classifies a module-level `const DEMOTE_CHIP_VISIBLE_MS = 6000` in a `components/**` file as a named-binding timing site (its name-suffix matching against `MS`) — probe with a scratch snippet through `scanTimingSites` BEFORE writing the row; if the casing rule differs, rename the const to match the scanner's accepted form (the spec fixes the VALUE and literalness, not the exact casing).
- Duration tokens: `duration-fast` + `ease-out-quart` utilities (DESIGN.md §5.1/§5.2); reduced-motion collapse via tokens (§5.3) — no component opt-in needed.
- No screenshot baseline captures a demoted slide (capture manifest checked — no regen expected).

## Meta-test inventory (declared)

None created. EXTENDS: the §5.5 inventory table (a data row, not a test) — `tests/docs/_metaInteractionTimingInventory.test.ts` already walks it bidirectionally. No Supabase call, no mutation surface, no advisory lock, no new token. Declared explicitly: no registry applies because the change is client-render-only.

## Layout-dimensions task: N/A — declared

Spec §2.4: the chip is absolutely positioned out of flow; no fixed-dimension parent/flex-child relationship is created; the existing crew-layout geometry gate is unaffected.

## Acceptance criteria map (spec §3, referenced by the task markers)

- AC-1 chip on demote, lockstep with the announce entry, figure containment.
- AC-2 transient with spec-pinned literals; AC-2b close-begin and second-failure clears.
- AC-3 no chip without demote.
- AC-4 a11y untouched.
- AC-5 timing inventory row, both directions green.
- AC-6 reduced motion via tokens only.
- AC-7 impeccable dual gate.
- AC-8 ledger archive.

## Tasks

<!-- tasks: depth=3 -->

### Task C1 — chip state + render + timer (TDD)

<!-- task: red=`pnpm vitest run tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` ac=AC-1,AC-2,AC-3,AC-4 -->

Step 0 (probe, before any code): run the scanner-classification probe from the pre-draft pass; record the accepted const name.

RED: extend `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` with new cases. What is red and why: no chip markup exists — the production line whose absence makes them fail is the chip render branch in the slide body.

1. Demote path (the :503 scenario) → chip present on the affected slide: `data-testid="lightbox-demote-chip"`, exact copy, `aria-hidden="true"`, `pointer-events-none` class; containment: the chip's closest figure IS the affected slide's figure (the active-branch figure gains `relative` per spec §2.2 R1 F3 — assert the chip is a descendant of that figure, not of the viewport container); the announce entry ALSO fired (both channels, one event — assert the announce spy count unchanged vs the pre-chip baseline of 1) (AC-1).
2. Fake timers, spec-ratified literals (AC-2, R1 F4): advance 5999 → present; advance 1 more → gone (both literals in the test citing spec §2.1); separately assert the exported `DEMOTE_CHIP_VISIBLE_MS === 6000`. Timer cleanup on unmount (unmount inside the window, no act warnings / no state-update-after-unmount).
3. No-chip rows: successful original; FRESH clamped-tier failure with no preceding demote (placeholder path) (AC-3).
4. A11y: chip absent from the a11y tree; `role="log"` entries and focus sequence unchanged by the chip's presence (AC-4).
5. Second demote on another slide inside the window → first chip gone, second present (spec §2.1 clear 2, last-wins).
6. Close-begin clear (AC-2b, spec §2.1 clear 3): demote → close → immediate re-open inside the 220ms exit window (the retained-instance shape at `tests/components/diagrams/gallery.failedItem.test.tsx:553`) → no chip.
7. Exit-window repopulation blocked (AC-2b, spec R3 F1): close → demote DURING the exit window (the retained slide failing per the `gallery.failedItem.test.tsx:850` shape) → re-open (openNonce increments) → no chip; the sr announce entry still delivered per the parent contract.
8. Second-failure clear (AC-2b, spec §2.1 clear 4): the two-stage failure (`galleryLightbox.zoomGate.test.tsx:697` scenario) → no chip once "Image unavailable" shows.

GREEN: `demotedNoticeId` state + `closingRef` set-gate + the `openNonce` prop (parent increments per closed-to-open transition at `components/diagrams/Gallery.tsx:358`; lightbox effect resets `closingRef` + clears state) + timer effect (all four clear conditions) + `relative` on the active-branch figure + chip markup per spec §2.2 (`inset-x-0 bottom-2`, Reset-chip class family minus interactivity, fade-in via `duration-fast ease-out-quart` token utilities). Class-list assertion for AC-6: the chip's className names the token utility and contains no literal ms.

Commit: `feat(crew-page): transient demote chip on the affected lightbox slide`

### Task C2 — §5.5 inventory row (same-commit discipline check)

<!-- task: red=`pnpm vitest run tests/docs/_metaInteractionTimingInventory.test.ts` ac=AC-5 -->

RED (observed mid-task, the inventory gate's own bidirectionality): after C1's constant lands, run the inventory meta-test and observe it FAIL naming the unrowed constant; then regen (`pnpm exec tsx scripts/scan-interaction-timings.cli.ts`) + add the §5.5 row; green. NOTE: if C1 and C2 land in one commit (preferred — the spec's same-commit rule), the red run is recorded in the task record between edits, not between commits; the committed state is green.

Commit (amend into C1 or immediately after, per the same-commit rule): `docs(design): DEMOTE_CHIP_VISIBLE_MS joins the §5.5 interaction-constant inventory`

### Task C3 — dual gate + ledger + close

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-7,AC-8 -->

ORDER IS BINDING — two rules hold simultaneously: the marker-stripping archive commit is the PR's LAST pre-merge commit, AND the final review round examines the diff that merges (archive included — a review creates no commit, so archiving BEFORE the review satisfies both):

1. `/impeccable critique` + `/impeccable audit` on the unit diff (canonical v3 setup gates). P0/P1 fixed or DEFERRED-entried; findings + dispositions in `closeout.md` here with the filled `impeccable-gate:` marker line (AC-7).
2. Merge `origin/main`; full gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
3. Archive `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` as the intended-last commit (archive RED pattern), recording §4 limits and the §1.1 boundary ratification (AC-8).
4. Whole-diff codex-guard `--stage diff` review to APPROVE (REVIEWER ONLY; spec §1.1 do-not-relitigate list, including the two out-of-scope a11y siblings) — the reviewed diff INCLUDES the archive commit. If a round returns findings: repair, RE-DO the archive commit on top, and dispatch the next round against the full diff. Merge only from a round that examined the final tree.
5. PR; real CI green → `gh pr merge --merge` same turn (no commits after the APPROVE-reviewed tree) → ff main → `0 0`.

Commit (step 3): `docs(backlog): archive BL-DIAGRAM-DEMOTE-SIGHTED-PARITY — sighted demote chip shipped`

<!-- tasks: end -->

## Adversarial review (cross-model)

- This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff (round cap 4).
- Implementation branch: whole-diff `--stage diff` review to APPROVE before merge (C3.4).

## Execution handoff

Handoff-by-overlap, the L-wave §3 order-binding protocol (the transient dual-declaration is the DESIGNED handoff state): FIRST the impl branch `feat/diagram-demote-notice` is created off `origin/main`; from the MAIN checkout, `pnpm ledger:claims --check BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` is run EXPECTING exit 1 naming `docs/diagram-demote-notice-spec` and ONLY it (the planned-handoff signature; any OTHER branch = real collision, stop and reconcile); the impl branch marks the entry, pushes, and gets its ship-state marker file (stage "awaiting-implementer", blockedOn "awaiting Opus implementer pane", next "execute HANDOFF.md", NO sessionId). THEN the authoring branch strips its marker in its last pre-merge commit and its PR merges — no undeclared instant on origin. A fresh Opus pane executes from `HANDOFF.md` — UI work is Opus-owned per the AGENTS.md hard rule; its Step-0 claims check expects to see ONLY `feat/diagram-demote-notice`.

## Impeccable gate (closeout marker)

The unit's filled marker lands in this directory's `closeout.md` at close (C3.1).

impeccable-gate: pending — filled at C3.1 (critique + audit on the implementation diff)

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped against the live tree.
- [ ] Anti-tautology: AC-2 imports the constant; AC-1 derives the announce baseline from the existing case, not a hardcoded count; the no-chip rows exercise both non-demote paths.
- [ ] `red=` validity: C1's cases are new cases in an existing suite (invariant-1 shape, production line named); C2's red is the inventory gate observed mid-task; C3's red is the archive-RED pattern.
- [ ] Scanner-classification probe run and recorded BEFORE the constant is named in code.
- [ ] Snippets typechecked against strict tsconfig before dispatch.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
