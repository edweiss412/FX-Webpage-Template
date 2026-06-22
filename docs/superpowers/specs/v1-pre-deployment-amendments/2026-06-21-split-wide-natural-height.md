# 2026-06-21 — Split-wide sections: natural height (items-start), not equal-height

**Status:** Ratified (owner-directed, live-desktop review).
**Supersedes:** the `align-items: stretch` / "tiles within a row stretch to equal height" invariant (master spec §8.4; DESIGN.md §7) **as it applied to the crew split-wide two-column grids**, the `items-stretch` clause in `2026-06-19-crew-mock-fidelity.md` "Dimensional invariants" (split-wide grid line), and the Crew-columns equal-height invariant in `2026-06-15-crew-page-redesign-phase1-design.md` (Dimensional Invariant #2). (The §8.4 "tiles stretch" language predates the 6-section redesign and describes the now-retired legacy tile grid; this amendment governs the current crew split-wide grids.)

## Decision

The four standing crew split-wide sections — **Schedule** (day list / Daily call times), **Crew** (Show crew / Key contacts), **Venue** (details / diagrams), **Travel** (getting there / hotels) — **and Today Mode A** (run-of-show / quick-cards) now use `min-[720px]:items-start` instead of `min-[720px]:items-stretch` on their `grid-cols-[1.6fr_1fr]` grids.

This makes the **shorter** column take its natural content height instead of stretching to match the taller column. It is the same posture **Today Mode B** already adopted in the 2026-06-19 amendment ("the two stacks differ in height").

## Why

On live-desktop review the owner observed dead space below the short column whenever the two columns were very unbalanced:

- **Schedule:** the ~3-row "Daily call times" card stretched to the full height of the tall day-card list.
- **Crew:** the ~2-contact "Key contacts" card stretched to the full height of the long crew roster.

Equal-height looks tidy when columns are close in height, but with a short card beside a tall list it reintroduces exactly the "wasted space on desktop" this pass set out to remove. There is no additional content to fill the short card.

## What stays the same

- The **1.6fr / 1fr ratio** and **side-by-side** layout at ≥720px.
- The **single-column stack** below 720px (no horizontal overflow).
- Every **one-sided collapse** rule (the grid only mounts when both columns have content).
- **No data-surface or privacy change.** Only `align-items` changes; the §5 Today privacy gate and all section gating are untouched.
- The Tailwind-v4 `.flex` no-stretch gotcha (DESIGN.md §7) still applies wherever genuine equal-height IS wanted (e.g. the Gear peer-card grid, the CrewSubNav tab bar, the admin Dashboard split) — those are unchanged.

## Test contract changes

The equal-height (±0.5px) assertion is dropped and **replaced by a positive real-browser `align-items` assertion** so the new contract is still enforced — without it, a regression that drops `min-[720px]:items-start` would pass the ratio + side-by-side checks alone (CSS grid defaults to `align-items: normal`, which renders as stretch) and silently restore the dead space (Codex adversarial finding, 2026-06-21). Chromium reports `start` for `items-start`, `stretch` for the old `items-stretch`, and `normal` for the unset default, so the gate asserts `getComputedStyle(grid).alignItems === "start"`. The ratio + side-by-side + 390px-stack assertions remain:

- `tests/e2e/crew-page.spec.ts` — `inv2` (Crew), `inv7` (Schedule/Venue/Travel): equal-height dropped, side-by-side + stack retained.
- `tests/e2e/crew-layout-dimensions.spec.ts` — `assertSplitWide` helper (Schedule/Venue/Travel/Crew) + the Today Mode A **and** Mode B tests: equal-height dropped, **`align-items === "start"` added**, ratio + stack retained.
- `tests/components/crew/sections/TodaySection.modeA.test.tsx` — the Mode A grid className assertion (`items-stretch` → `items-start`).

The admin Dashboard equal-height contract (`tests/components/admin/Dashboard.test.tsx`, the admin layout-dimensions specs) is **out of scope and unchanged**.

## Verification

Real-browser (compiled Tailwind CSS, 1.6fr/1fr grid, tall left + short right): before `items-stretch` the short card measured 321px (stretched to the left column); after `items-start` it measured 127px (its natural height). Ratio preserved (left 667 / right 417 ≈ 1.60); side-by-side preserved; 390px collapses to a single column.
