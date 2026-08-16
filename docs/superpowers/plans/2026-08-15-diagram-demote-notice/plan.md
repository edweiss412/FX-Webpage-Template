# Diagram demote notice — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** render the transient `aria-hidden` "Full detail unavailable" chip on the affected lightbox slide at demote time, in lockstep with the existing sr announcement, with a literal 6000ms lifetime carried into the DESIGN.md §5.5 derived inventory.

**Architecture:** one branch `feat/diagram-demote-notice` off `origin/main`, TDD per task, impeccable dual gate (UI surface, Opus-owned), cross-model diff review, CI-green merge.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/crew/2026-08-15-diagram-demote-notice-design.md` (spec-APPROVED, codex-guard R5 2026-08-15) · **Status:** plan-APPROVED (codex-guard R5, 2026-08-15, FINDINGS: 0)

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

<!-- task: red=`pnpm vitest run tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6 -->

Step 0 (probe, before any code): run the scanner-classification probe from the pre-draft pass; record the accepted const name.

RED: extend `tests/components/diagrams/galleryLightbox.zoomGate.test.tsx` with new cases. What is red and why: no chip markup exists — the production line whose absence makes them fail is the chip render branch in the slide body.

Harness note (plan R1 F1): the zoomGate suite mounts `GalleryLightbox` directly with a no-op `onClose` (`tests/components/diagrams/galleryLightbox.zoomGate.test.tsx:248`), which cannot exercise the parent nonce or retained-instance lifecycle. Cases 1-5 and 8 extend that suite; the SESSION cases (6, 7, 9) are driven through the REAL parent `Gallery` (the `gallery.failedItem.test.tsx` harness pattern — it already exercises close, canceled exits, and retained instances) so `openNonce` and retention are the live mechanisms under test, not simulated props.

1. Demote path (the :503 scenario) → chip present on the affected slide: `data-testid="lightbox-demote-chip"`, exact copy, `aria-hidden="true"`, `pointer-events-none` class; containment: the chip's closest figure IS the affected slide's figure (the active-branch figure gains `relative` per spec §2.2 R1 F3 — assert the chip is a descendant of that figure, not of the viewport container); the announce entry ALSO fired (both channels, one event — assert the announce spy count unchanged vs the pre-chip baseline of 1) (AC-1).
2. Fake timers, spec-ratified literals (AC-2, R1 F4): advance 5999 → present; advance 1 more → gone (both literals in the test citing spec §2.1); separately assert the exported `DEMOTE_CHIP_VISIBLE_MS === 6000`. Timer-cancel ORACLE (plan R1 F2 — an absent act-warning is not a cleanup proof under React 19): the repository precedent `tests/devcapture/useDevCapture.test.tsx:342` — assert `vi.getTimerCount()` returns to its pre-chip baseline after unmount, after a close-clear, and after a second-failure clear.
3. No-chip rows: successful original; FRESH clamped-tier failure with no preceding demote (placeholder path) (AC-3).
4. A11y: chip absent from the a11y tree; `role="log"` entries and focus sequence unchanged by the chip's presence (AC-4).
5. Second demote on another slide inside the window → first chip gone, second present, AND the window RESTARTS (plan R1 F2): advance 5999 after the second demote → second chip still present (a non-restarted timer would have expired), then 1 more → gone.
6. Close-begin clear, ALL THREE initiators (AC-2b, spec §2.1 clear 3; plan R1 F2): Escape, backdrop click, and the Close button each: demote → that initiator → immediate re-open inside the 220ms exit window (the retained-instance shape at `tests/components/diagrams/gallery.failedItem.test.tsx:553`) → no chip; timer count back to baseline.
7. Exit-window repopulation blocked (AC-2b, spec R3 F1): close → demote DURING the exit window (the retained slide failing per the `gallery.failedItem.test.tsx:850` shape) → re-open (real parent increments `openNonce`) → no chip; the sr announce entry still delivered per the parent contract.
8. Second-failure clear (AC-2b, spec §2.1 clear 4): the two-stage failure (`galleryLightbox.zoomGate.test.tsx:697` scenario) → no chip once "Image unavailable" shows; timer count back to baseline.
9. POSITIVE re-entry ordering (spec R4 F1 — the case the render-time reset exists for; plan R1 F1): close → re-entry commits → the retained slide's PENDING original failure fires after the re-entry commit → the chip RENDERS (a conforming implementation that used an effect-timed reset fails this case; it is the executable pin of "render-time, not effect").
10. Swipe-return compound (C2 audit table row 3; plan R2 F1 — the case is RED here, in the pre-implementation batch, because after C1's GREEN no new test can honestly fail): demote, swipe away, swipe BACK inside the window → chip present with its REMAINING lifetime (advance to expiry proves the timer never reset on swipe).
11. Simultaneous-Reset compound (C2 audit table row 6; plan R2 F1): demote while scale > 1 → BOTH chips present, disjoint slots (top-2 vs bottom-2) — assert both testids visible simultaneously.

GREEN (as shipped; spec §2.1's 2026-08-16 amendments supersede the names below): `demotedNotice: { id, nonce }` state rendered only while its stamp matches `openNonce` + the `closedAtNonce !== openNonce` set-gate + the `openNonce` prop (parent increments per closed-to-open transition at `components/diagrams/Gallery.tsx:358`; the lightbox resets `closingRef` and clears chip state DURING RENDER via the guarded `lastNonceRef` comparison — spec §2.1 clear 3's render-time seam, NOT an effect; plan R1 F1) + the timer with all four clear conditions + `relative` on the active-branch figure + chip markup per spec §2.2 (`inset-x-0 bottom-2`, Reset-chip class family minus interactivity). Enter-motion mechanism, full class contract (plan R1 F3 — duration/easing classes alone transition nothing): the chip carries `transition-opacity duration-fast ease-out-quart` plus a mount-time opacity ramp (starting-style/appear pattern per the implementer's choice), and AC-6's assertion names the FULL set: `transition-opacity` present, a duration TOKEN utility present, no literal ms anywhere in the className.

The §5.5 inventory row is PART OF THIS TASK and THIS COMMIT (plan R1 F4 — a separate task cannot satisfy both the one-commit-per-task invariant and the spec's same-commit timing lockstep, so the row belongs to C1): after the constant lands, run `pnpm vitest run tests/docs/_metaInteractionTimingInventory.test.ts` and OBSERVE it fail naming the unrowed constant (the inventory gate's own bidirectionality — this observed red is recorded in the task record); regen (`pnpm exec tsx scripts/scan-interaction-timings.cli.ts`) + add the DESIGN.md §5.5 row; the meta-test goes green on the same command; commit EVERYTHING as C1's single commit (AC-5).

Transition audit (the writing-plans mandatory audit content, folded into THIS task per plan R2 F1 + R3 F1 — see the C2 tombstone below for the derivation). The spec's §2.3 Transition Inventory, with every row's executable oracle or explicit instant declaration:

| Transition | Oracle |
|---|---|
| absent to visible (demote) | the AC-6 full class contract (case 1 + the `transition-opacity` + token assertions; the GREEN carries the mount-time opacity ramp) |
| visible to absent (timer) | instant unmount, DECLARED deliberate — the chip render branch gets no exit-presence wrapper; the enumeration step below records it |
| visible while user swipes away and back (compound) | case 10 (remaining-lifetime pin) |
| dialog closes while visible (compound) | case 6 (all three initiators) |
| demoted slide's clamped tier fails while chip visible (compound) | case 8 (second-failure clear — plan R4 F1: the row was omitted while its test already existed; the table now mirrors spec §2.3's seven rows one-for-one) |
| second demote while visible (compound) | case 5 (restart pinned) |
| Reset chip visible simultaneously (compound) | case 11 (disjoint slots) |

Audit enumeration (a GREEN-phase step of this task, recorded in the task record before the commit): list every JSX `AnimatePresence` usage across `components/diagrams/Gallery.tsx` and `components/diagrams/GalleryLightbox.tsx` in the post-implementation tree (pre-draft probe: exactly one — the session-level open/close presence at the `components/diagrams/Gallery.tsx:446` region; zero in the lightbox) and every ternary/conditional branch the diff adds or touches that renders the chip, the Reset chip, or the placeholder; give each row its disposition (exit-presence wrapper or declared instant). Any transition the enumeration surfaces that the table lacks is NEW work — it gets a real RED against a repair commit, not a seat in this one.

Commit: `feat(crew-page): transient demote chip on the affected lightbox slide (constant + §5.5 row in lockstep)`

**Tombstone — the former Task C2, folded into C1 (plan R2 F1 + R3 F1).** A separate post-implementation transition-audit task cannot carry an honest RED on this surface: its behavioral compound cases pass on arrival once C1's implementation exists (R2 F1 — they now live in C1's pre-implementation RED batch as cases 10 and 11, where the chip render branch's absence genuinely fails them), and a manifest-style structural test turns green by editing test-local data with production untouched — the anti-tautology shape writing-plans prohibits (R3 F1). The mandated audit content — the §2.3 inventory table with per-row oracles, the AnimatePresence/ternary enumeration with dispositions, the deliberate-instant declaration, and the compound-transition tests — lives in full inside Task C1's body and single commit, where the compound tests have a real red. No separate commit exists for C2.

### Task C3 — dual gate + ledger + close

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-7,AC-8 -->

ORDER IS BINDING — two rules hold simultaneously: the marker-stripping archive commit is the PR's LAST pre-merge commit, AND the final review round examines the diff that merges (archive included — a review creates no commit, so archiving BEFORE the review satisfies both):

1. Merge `origin/main` (resolve any conflicts); full gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
2. `/impeccable critique` + `/impeccable audit` on the unit diff AS IT WILL MERGE — run AFTER the merge and gate repairs (plan R1 F5: invariant 8 binds on the affected diff, so the gate examines the final UI tree, not a pre-merge snapshot). P0/P1 fixed or DEFERRED-entried; findings + dispositions in `closeout.md` here with the filled `impeccable-gate:` marker line (AC-7).
3. Archive `BL-DIAGRAM-DEMOTE-SIGHTED-PARITY` as the intended-last commit (archive RED pattern), recording §4 limits and the §1.1 boundary ratification (AC-8).
4. Whole-diff codex-guard `--stage diff` review to APPROVE (REVIEWER ONLY; spec §1.1 do-not-relitigate list, including the two out-of-scope a11y siblings) — the reviewed diff INCLUDES the archive commit. If a round's repairs touch ANY UI file, RE-RUN both impeccable halves on the delta before the next round (the closeout records each re-run); then RE-DO the archive commit on top and dispatch the next round against the full diff. Merge only from a round that examined the final tree, with the impeccable record covering that same tree.
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

The line below is the pre-implementation placeholder form the closeout walker accepts (the batch precedent: the 2026-08-15-step3-tap-cluster unit, merged with this exact shape). This unit IS a UI surface; C3.2 writes the real filled `critique=RAN audit=RAN p0=<n> p1=<n> dispositions=<recorded|none>` marker into `closeout.md` in this directory, which then carries the closeout truth.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped against the live tree.
- [ ] Anti-tautology: AC-2 imports the constant; AC-1 derives the announce baseline from the existing case, not a hardcoded count; the no-chip rows exercise both non-demote paths.
- [ ] `red=` validity: C1's cases are new cases in an existing suite (invariant-1 shape, production line named; the §5.5 inventory-gate red is ALSO observed inside C1; the audit compound cases are C1 cases 10-11, red in the pre-implementation batch); C2 is a tombstone, not a task — no marker, no commit (plan R2 F1 + R3 F1); C3's red is the archive-RED pattern.
- [ ] Scanner-classification probe run and recorded BEFORE the constant is named in code.
- [ ] Snippets typechecked against strict tsconfig before dispatch.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
