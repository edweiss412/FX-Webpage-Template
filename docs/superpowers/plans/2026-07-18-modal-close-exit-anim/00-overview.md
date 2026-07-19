# Review-modal close exit animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Closing the review modal via X / Esc / scrim / grab-tap plays the reverse of the entrance before `onClose` fires, matching the drag-dismiss slide-out that already animates.

**Architecture:** `ReviewModalShell` gains `requestClose` — the single close entry point for every affordance and for Step3's programmatic success closes. It normalizes the panel's start state (snapshot-first, uniform across all motion states), applies mode-aware inline exit styles mirroring the existing drag path, and calls `onClose` at `transitionend`. The X button moves into a shared `ModalCloseButton` reading a new context; Step3's async success handlers reach `requestClose` through a `closeApiRef` because they sit above the provider.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, Tailwind v4, Vitest + jsdom (unit), Playwright (real-browser).

**Spec:** `docs/superpowers/specs/2026-07-18-modal-close-exit-anim.md` — APPROVED by cross-model adversarial review after 7 rounds. The spec is canonical; where this plan and the spec disagree, the spec wins.

---

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → green → commit. Never implementation before its test.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`). Don't batch tasks.
- **UI-only.** No DB, no advisory locks, no RPC, no auth surface. Invariants 2/3/4/9/10 are N/A — no code path in this diff touches Supabase, `pg_advisory*`, email, sync cursors, or a mutation surface.
- **No raw error codes in UI** (invariant 5): this diff renders no error copy at all; nothing to route through `lib/messages/lookup.ts`.
- **Invariant 8 — impeccable dual-gate.** Every file in this diff except tests/docs is a UI surface (`components/**`). `/impeccable critique` AND `/impeccable audit` run on the diff at Task 9, BEFORE the whole-diff Codex review. P0/P1 fixed or explicitly deferred via `DEFERRED.md`.
- **All work in the worktree** `/Users/ericweiss/FX-worktrees/modal-close-exit-anim`, branch `feat/modal-close-exit-anim`. Never the main checkout. Commit with `--no-verify` (shared global hooks contest the main checkout).
- **Durations come from tokens, never hardcoded ms in source:** `--duration-normal` (220ms, sheet) / `--duration-fast` (120ms, desktop), with the existing exported fallbacks `DURATION_NORMAL_FALLBACK_MS` (`ReviewModalShell.tsx:48`) and `DURATION_FAST_FALLBACK_MS` (`:52`) for the timers. Tests import these constants rather than restating numbers.
- **Pre-push gates** (green ≠ green): `pnpm test` (full suite, not scoped), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. E2E and env-bound tests are excluded from `pnpm test` — run the touched Playwright specs explicitly.

---

## Pre-draft code-verification pass — RESULTS

Every symbol, path, and line this plan names was grepped against the live worktree before drafting (`a8a7b065c`). Findings that shaped the plan:

| Claim | Verified | Note |
|---|---|---|
| `DRAG_DISMISS_THRESHOLD_PX = 110` | `ReviewModalShell.tsx:41` | exported |
| `DRAG_SLOP_PX = 6` | `:43` | exported |
| `DURATION_NORMAL_FALLBACK_MS = 220` | `:48` | exported |
| `DURATION_FAST_FALLBACK_MS = 120` | `:52` | exported |
| `panelRef` | `:91` | |
| `useDialogFocus(panelRef, initialFocusRef)` | `:141` | Task 2 must not disturb ordering |
| Esc handler calls `onClose()` | `:178-183` | |
| `dragRef` | `:194` | |
| `dismissingRef` | `:206` | |
| `settleTimerRef` | `:208` | |
| `clearPanelDragStyles()` | `:211-217` | blanks transform/transition/animation |
| drag latches `transition: "none"` | `:241` | the R1 finding's root |
| drag-dismiss branch | `:276-299` | sets `transition` before `transform` at `:282` |
| spring-back branch | `:302-321` | sets `transition` at `:304`; `settle()` calls `clearPanelDragStyles()` |
| `role="dialog"` | `:377` | subtree to inert |
| scrim `onClick={onClose}` | `:393` | + `absolute inset-0 bg-overlay-scrim` `:394` |
| grab strip `onClick` | `:414-416` | **`sm:hidden` at `:423` — SHEET MODE ONLY** |
| Published X | `PublishedReviewModal.tsx:276-285` | `onClick={handleClose}` |
| Step3 X | `Step3ReviewModal.tsx:436-445` | `onClick={onClose}` |
| **The two X buttons' `className` are byte-identical** | both | confirms the spec's shared-component extraction is a pure lift |
| Step3 success closes | `:236`, `:245`, `:299` | each `await`s then calls `onClose()` |
| `closeRef` / `initialFocusRef` | `Published:144,243,277` · `Step3:157,352,437` | |
| twin-scan `toBe(3)` | `reviewModalShell.test.tsx:193` | must stay 3 — entrance untouched |
| `pageTransitions` pin = 1 | `pageTransitions.test.tsx:123` | **stays 1**: the X swap adds no JSX conditional |
| e2e instant-unmount assertions | `published-review-modal.interactions.spec.ts:23`, `:254-292` | flip in Task 7 |
| `SHEET = {390,844}` / `POPUP = {1280,800}` | same file `:64-65` | reuse; don't invent viewports |
| focus-continuity pin | commit `7555c0316` | must stay green |

**Constraint this surfaced (spec §7.5(b)):** the grab strip is `sm:hidden`. The five-affordance suppression matrix therefore CANNOT run all five at one viewport — grab-tap and drag runs require `SHEET`; X/Esc/scrim run at both. Task 7 pins this explicitly. A desktop-only run would silently skip two affordances while appearing to pass.

---

## Meta-test inventory

**Extends:** `tests/components/admin/review/reviewModalShell.test.tsx` — gains the three structural guards from spec §7.6 (motion-state inventory completeness, single-close-path source scan, provider-boundary guard). Task 6.

**Creates:** none as a new file — the guards live with the shell's existing structural scans (the twin-scan already establishes that file as the shell's structural-test home).

**Not applicable, with reasons:**

| Registry | Why N/A |
|---|---|
| `tests/auth/_metaInfraContract.test.ts` | no Supabase call boundary in this diff |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | no `pg_advisory*` surface |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | no route handler, no `"use server"` action — this diff adds no mutation surface |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | no `admin_alerts` code, no §12.4 row |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | no tile optional-text surface |
| `tests/admin/no-inline-email-normalization.test.ts` | no email handling |

---

## Mandatory-task dispositions

| Required task | Disposition |
|---|---|
| **Transition-audit** (component has a Transition Inventory) | **Task 6.** The shell has no `AnimatePresence`; its motion is inline-style transitions plus CSS entrance keyframes. The audit is therefore a source-scan: all four non-drag affordances resolve to `requestClose`, every §3.1 guard is present, `handleGrabPointerEnd` early-returns on `dismissingRef`, and the §3.2 motion-state inventory is complete. Compound transitions (drag-held+Esc, spring-back, entrance-interrupt, action-resolves-during-exit) are exercised behaviorally in Task 7 (d)(e)(f)(g)(h) — the spec's inventory table maps 1:1 onto those cases. |
| **Layout-dimensions task** (fixed-dimension parent with flex/grid children) | **N/A — no dimensional change.** This diff alters `transform`, `opacity`, `transition`, `animation`, and `inert` only. No parent height/width, no flex/grid relationship, and no `items-stretch` dependency is added or modified; the panel's existing `items-stretch` (`ReviewModalShell.tsx:398-400`) is untouched. The existing `admin-layout-dimensions.spec.ts` remains the guard for that surface and must stay green. |

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `components/admin/review/ModalCloseButton.tsx` | **new** — shared X, reads close context, forwards ref | 1 |
| `components/admin/review/ReviewModalShell.tsx` | `ReviewModalCloseContext`, `requestClose`, `beginDismiss`, start-state normalization, mode-aware exit, scrim fade, `closeAffordancesDisabled`, `closeApiRef`, chokepoint guard | 1–5 |
| `components/admin/showpage/PublishedReviewModal.tsx` | X → `ModalCloseButton` | 1 |
| `components/admin/wizard/Step3ReviewModal.tsx` | X → `ModalCloseButton`; owns `closeApiRef`; success closes route through it | 1, 5 |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | `closeAffordancesDisabled={onClose === undefined}` | 4 |
| `tests/components/admin/review/reviewModalShell.test.tsx` | shell unit + 3 structural guards | 2–6 |
| `tests/components/admin/review/modalCloseButton.test.tsx` | **new** — button unit | 1 |
| `tests/components/admin/showpage/showReviewModalSkeleton.test.tsx` | **new** — dual-usage gate | 4 |
| `tests/e2e/published-review-modal.interactions.spec.ts` | flip instant-unmount; (a)(c)(d)(e)(f) | 7 |
| `tests/e2e/step3-review-modal.interactions.spec.ts` | (b) five-affordance matrix, (g), (h) | 7 |
| `docs/superpowers/specs/2026-07-18-admin-show-modal.md` | §6.5 amendment | 8 |
| `DEFERRED.md` | resolve `MODAL-CLOSE-EXIT-ANIM-1`; `MODAL-SKELETON-CLOSE-1` untouched | 8 |

---

## Anti-tautology rules for this plan

Several spec tests exist *because* an endpoint-only assertion would have passed while a regression shipped. Every test task must respect these; a test that only proves "the function was called" is a plan failure.

1. **Animation tests assert progression, not endpoints.** Sample the *computed* `transform`/`opacity` at ≥2 points inside the exit window and assert strict movement plus a value strictly between start and end. "Eventually closed" and "never snapped back" are both satisfied by an instant jump — the exact regression R1 caught.
2. **Assert exit-end arrived by `transitionend`, not by the fallback timer.** A broken exit still closes on the timer; only the event distinguishes them.
3. **The skeleton test must exercise affordances, not absence.** Checking "no X button" passes while scrim/Esc/grab/drag silently animate the loading frame away. Exercise all four.
4. **Derive expected values from fixtures/constants**, never hardcode: import `DRAG_SLOP_PX` / `DRAG_DISMISS_THRESHOLD_PX` / the duration fallbacks rather than restating 6 / 110 / 120 / 220.
5. **State the concrete failure mode each test catches** in a comment above it. If the answer is "the function is called," strengthen it.
6. **Structural guards must fail-by-default.** The motion-state completeness scan enumerates the shell's motion-state *sources* and fails on any without an inventory row — a new state must break CI rather than inherit unnormalized behavior.

---

## Task list

| # | Task | Deliverable |
|---|---|---|
| 1 | `ModalCloseButton` + close context | X routes through context in both consumers; entrance untouched |
| 2 | `requestClose` guards + shared `beginDismiss` | step 0/1/2 guards, `inert` at dismiss-commit, drag branch shares it |
| 3 | Start-state normalization + mode-aware exit + scrim fade | the animation itself, S1–S4 uniform |
| 4 | `closeAffordancesDisabled` + skeleton dual-usage | server fallback inert to all five affordances |
| 5 | `closeApiRef` + Step3 success closes | single close path, no fallback |
| 6 | Structural guards (§7.6) | motion-state completeness, single-close-path scan, provider-boundary |
| 7 | Real-browser matrix (a)–(h) | flip instant-unmount; five-affordance suppression at correct viewports |
| 8 | Spec §6.5 amendment + `DEFERRED.md` | ratified transition-inventory row updated |
| 9 | Impeccable critique + audit pair | invariant 8, before the whole-diff review |

Task bodies: `01-tasks.md`.
