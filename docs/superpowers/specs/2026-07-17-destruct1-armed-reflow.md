# DESTRUCT-1 — Armed-morph hit-target reflow fix

**Date:** 2026-07-17
**Branch:** `fix/destruct1-armed-reflow`
**Deferral closed:** `DEFERRED.md` DESTRUCT-1 · **Backlog closed:** `BACKLOG.md` BL-DESTRUCT-ARMED-REFLOW
**Parent:** spec `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md` (destructive-confirm pass, PR #408)

## 1. Problem

The destructive-confirm two-tap guards swap in a longer armed label on the first tap (recipe fill + `Confirm <verb>`). DESTRUCT-1 (deferred at PR #408) flagged that the longer armed label could grow or wrap the button between tap 1 and tap 2, moving the confirm hit-target out from under a phone user's traveling finger. It was deferred as "unverified at 360–390px; needs a real-browser measurement + a design decision."

This spec resolves DESTRUCT-1 with the measurement and a targeted fix.

### 1.1 Surface correction — three guards, not four

The deferral names **four** guards: `BulkIgnoreControls`, `PendingPanelDiscardButtons`, `RescanSheetButton`, `StagedReviewCard`. **`RescanSheetButton` no longer arms** — its G3 two-tap re-scan guard was **WITHDRAWN in PR #411** (reverted to one-tap, matching Re-sync; the apply path is already content-aware so the guard added friction without protection). Verified in the live tree: `components/admin/RescanSheetButton.tsx` has no `armed`/`Confirm` branch (single button class at `RescanSheetButton.tsx:177`). The DESTRUCT-1 surface is therefore **three** guards. This spec corrects the "four" wording in `BACKLOG.md:501`, `DEFERRED.md:625–627`.

## 2. Measurement (real browser, 360px viewport, 328px content width)

Method: a static HTML harness transcribing each guard's exact idle- and armed-state Tailwind classes (faithful token values from `app/globals.css`: `--spacing-tap-min: 44px`, `--text-sm: 0.875rem`, Inter font), served over HTTP, measured via Playwright `getBoundingClientRect()` at a 360px viewport with the admin `px-4` (16px) content gutter. Geometry is pure CSS (flex-wrap, text length, padding) — no React state logic affects layout, so a static transcription reproduces the app's box model exactly.

| Guard | idle box `[x, w]` | armed box `[x, w, h]` | Reflow verdict |
|---|---|---|---|
| **PendingPanelDiscardButtons** (`admin-pending-ignore-*`) | `x171 w147` — line 1, right of "Defer until modified" | `x16 w328 h44` — **drops to its own row** below Defer; moves **155px left + down one flex line** | **REAL HAZARD** — confirm target leaves the finger |
| **BulkIgnoreControls** (`dq-bulk-ignore-*`) | `x249 w95`, right=344 | `x209 w135 h51`, right=**344** — grows leftward + wraps to 2 lines, **right edge pinned** | Benign — right-anchored; the tapped point (toward the pinned right edge) stays covered |
| **StagedReviewCard** (`staged-review-discard-ignore`) | `x16 w152`, left=16 | `x16 w253 h44`, left=**16** — grows rightward, **left edge pinned** | Benign — idle box ⊂ armed box; the tapped point stays covered |

Only `PendingPanelDiscardButtons` relocates the hit-target. Its idle "Permanently ignore" sits on flex line 1 to the right of the one-tap "Defer until modified" sibling; the armed label "Confirm stop tracking this sheet permanently" is ~2.5× longer, overflows the remaining line-1 width at 360px, and (via the container's `flex-wrap`) reflows to a new full-width row below Defer. A finger already traveling toward the idle position lands on empty space (or the non-destructive Defer button), not the confirm.

The other two guards grow from a pinned edge that stays under the finger, so no mis-tap is possible; they are recorded **verified-benign, no code change**.

## 3. Fix (PendingPanelDiscardButtons only)

Make the two discard buttons **stack full-width on narrow viewports** so the armed morph happens inside a position-stable box:

- Add `basis-full sm:basis-auto` to **both** buttons in the existing `flex flex-wrap gap-2` container (`PendingPanelDiscardButtons.tsx:108`). The `defer` button (`:114`) and the `ignore` button in **both** its armed and idle class branches (`:127`, `:128`) receive the same pair.
- Effect `< sm` (viewport < 640px, Tailwind v4 default `sm` breakpoint): each button is `flex-basis: 100%`, so Defer occupies row 1 full-width and the ignore button occupies row 2 full-width. The ignore button's box is identical in idle and armed states — measured armed "Confirm stop tracking this sheet permanently" at full 328px width is a single line, `h44`, `x16`, the same box a full-width idle "Permanently ignore" occupies. **Arming recolors and re-texts in place: zero position change, no new-line wrap.**
- Effect `≥ sm`: `basis-auto` restores content-width sizing; the buttons sit side by side as today. At ≥640px the row has ample width (Defer ~150px + armed ignore ~332px + 8px gap = ~490px < 640px), so the armed label never wraps.

**No label edit.** The DESTRUCT-2-ratified armed label grammar (`Confirm <verb>[: <consequence>]`; "Confirm stop tracking this sheet permanently") is untouched — this fix is layout-only and does not relitigate DESTRUCT-2 (`DEFERRED.md:631`).

### 3.1 Why stack-both over the alternatives

- **Reserve armed width at idle (min-width / stacked-label grid):** would force the idle ignore button to the full armed width (~328px ≈ full content) even when idle, and force Defer onto its own row permanently, while looking oversized on desktop. Rejected — heavier layout change, worse at `sm+`.
- **Shorten the armed label:** would relitigate the DESTRUCT-2 grammar contract. Rejected.
- **Stack full-width `< sm` only (chosen):** the standard mobile stacked-button pattern; idle box == armed box on mobile (the only place the hazard exists), unchanged side-by-side layout on desktop, no label edit, minimal diff.

## 4. Dimensional invariants (fixed-box morph)

The armed morph must not change the ignore button's flex-line position at the mobile breakpoint. Verified in a real browser (jsdom computes no layout; this project's Tailwind v4 does not default `.flex` to `align-items: stretch`):

| Relationship | Guarantee | Assertion (360px) |
|---|---|---|
| ignore button `x` idle vs armed | full-width row identical across the recolor | `armed.x === idle.x` (±0.5px) |
| ignore button `y` / flex-row idle vs armed | armed stays on the same row it occupies idle | `armed.y === idle.y` (±0.5px) |
| ignore button never wraps to a new flex line on arm | `basis-full` reserves the whole row; armed label fits one line | `armed.top === idle.top` **and** ignore `y` > defer `y` (own row, below Defer) at 360px |
| ignore button height | one text line at full width | `armed.height === idle.height` (±0.5px), both `44` (min-tap) |

## 5. Guard conditions

- `pendingIngestionId` empty/malformed: unchanged — only affects `data-testid` suffix and the POST URL; layout is prop-independent.
- `armed === true` while `state.kind === "running"`: unreachable — `handleClick` clears `armed` at entry (`:76–77`); the layout classes are static per state and do not depend on both being true.
- Very long future label: `basis-full` makes the button full content width, so any label wraps within the fixed full-width box (grows taller, never sideways off-row) `< sm`; at `sm+` width is ample. No new overflow path introduced.

## 6. Out of scope / do-not-relitigate

- **BulkIgnoreControls, StagedReviewCard:** measured benign (§2); no code change. Do not add friction "to be safe" — a guard/layout change is only justified where measurement shows a hazard (the same principle that WITHDREW the G3 rescan guard, `DEFERRED.md`/#411).
- **DESTRUCT-2 label grammar + `ARM_REVERT_MS` timing:** ratified (RESOLVED PR #422); untouched here.
- **RescanSheetButton:** N/A (no arm state since #411); only the stale wording is corrected.
- No DB, no advisory locks, no new `§12.4` error codes, no telemetry surface added (layout-only change to an existing instrumented surface).

## 7. Deliverables

1. `components/admin/PendingPanelDiscardButtons.tsx` — `basis-full sm:basis-auto` on both discard buttons (3 class-string edits: defer, ignore-armed, ignore-idle).
2. A real-browser layout-dimensions test (Playwright, standalone harness mirroring `tests/e2e/agendaBreakdown.layout.spec.ts`) asserting the §4 invariants at 360px: armed ignore box `x/y/top/height` == idle ignore box, and the ignore button occupies its own row below Defer (no line-1 residency, no growth off-row).
3. Doc updates in the same PR: close `DEFERRED.md` DESTRUCT-1 (RESOLVED, with the §2 per-surface measurement), close `BACKLOG.md` BL-DESTRUCT-ARMED-REFLOW, correct the "four guards" → "three" wording in both.

## 8. Meta-test inventory

- **`tests/styles/_metaDestructiveConfirm.test.ts` — CHECKED, no change required.** The registry keys on `(file, occurrence-index)` where the index is the Nth line containing the unvarianted `bg-warning-text` + `text-warning-bg` pair, and asserts C1 token presence (`font-semibold`, `hover:opacity-90`) + forbidden-token absence (`bg-accent`/`bg-surface`/`bg-bg`, hover-variant `bg-*`). `basis-full`/`sm:basis-auto` are none of those and do not add a recipe line, so the `PendingPanelDiscardButtons.tsx` occurrence-0 row (`:41–46`) stays valid and C1 still holds. Confirmed by re-running the suite post-edit (fix-round regression budget).
- **Canonical Tailwind class order (eslint):** adding `basis-full sm:basis-auto` requires canonical ordering — enforced by `pnpm lint` (prettier-plugin-tailwindcss); run `pnpm format` + `pnpm lint` before commit (`format:check` green ≠ lint green).
- No new registry, advisory-lock topology, or admin-alert-catalog entry — layout-only change to an existing surface.

## 9. Verification

- `pnpm test tests/components/admin/pendingIngestionActions.test.tsx tests/styles/_metaDestructiveConfirm.test.ts` — existing unit + recipe registry green.
- New standalone layout spec green under `tests/e2e/standalone.config.ts` at 360px.
- `pnpm lint && pnpm format:check && pnpm typecheck` green.
- Invariant-8 impeccable v3 dual-gate (critique + audit) on the diff — UI surface (`components/**`).
- Full `pnpm test` before push.
