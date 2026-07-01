# Spec — Resolve BL-SHOWSTABLE-720-TITLE-FLOOR (raise the shows-table stacked→columnar breakpoint)

**Date:** 2026-07-01
**Slug:** `shows-720-title-floor`
**Surface:** `components/admin/ShowsTable.tsx` + the band-sweep `tests/e2e/admin-layout-dimensions.spec.ts`.
**Type:** UI-only. No DB / parser / RPC / migration / advisory-lock change.

## 1. Goal

Fix the pre-existing gap filed as **BL-SHOWSTABLE-720-TITLE-FLOOR**: the shows-table's 5-column grid
activates at `min-[720px]`, but at exactly 720px the `minmax(0,1fr)` title track resolves to ~106px —
below the band-sweep's `MIN_TITLE_PX = 120` floor. Raise the **stacked→columnar breakpoint from
`min-[720px]` to `min-[768px]`** so the table stacks (the existing `<720` mobile layout) below 768px,
where the 5 columns genuinely don't fit with a readable title. This also removes the `≥810`
title-floor exception #209 had to add, making the gate honest again.

The measured data point (real browser, #209): 720px → title ~106px. The 5-col title budget is
`title ≈ viewport − 614` (content = `viewport − 64` admin padding; 5-col fixed overhead ≈ 550px). So
the floor crosses 120px at `viewport ≈ 734`; **768px → title ~154px** (comfortable margin). The
band-sweep test is the binding arbiter.

## 2. Scope

**In scope:** the `min-[720px]` responsive classes in `components/admin/ShowsTable.tsx` that gate the
5-column grid, its cells, and the mobile sub-line — move ALL of them to `min-[768px]`. The Status
column's `min-[960px]` gate (#209) is UNTOUCHED.

**Out of scope / explicitly NOT changed:**
- The admin layout's `min-[720px]:pb-page-pad-desktop` (`app/admin/layout.tsx:151`) — that gates the
  fixed mobile **bottom tab bar's** padding reservation, a nav concern independent of the table's
  column layout. Leaving it at 720 is intentional; the two breakpoints need not align.
- The dashboard two-col split (`min-[1240px]`) and the Status column (`min-[960px]`) — unrelated.
- No copy, token, or data change.

## 3. The change (exact)

In `components/admin/ShowsTable.tsx`, replace `min-[720px]` with `min-[768px]` at all **9
`min-[720px]:` class utilities** (across 7 lines; the `min-[960px]` occurrences stay):

- `ROW_GRID` (`ShowsTable.tsx:65`): `min-[720px]:grid`, `min-[720px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_1.25rem]`, `min-[720px]:items-center`, `min-[720px]:gap-4` → all `min-[768px]:…`. The `min-[960px]:grid-cols-[…6 tracks…]` (Status column) is unchanged.
- Mobile sub-line (`ShowsTable.tsx:447`): `min-[720px]:hidden` → `min-[768px]:hidden`.
- Dates / Crew / Sync cells (`ShowsTable.tsx:461,465,470`): `min-[720px]:block` → `min-[768px]:block`.
- Chevron cell (`ShowsTable.tsx:485`): `min-[720px]:block` → `min-[768px]:block`.
- Update the `ROW_GRID` comment block (`ShowsTable.tsx:58-64`) to say the 5-col grid activates at
  768px (not 720), and why (720px starved the title track).

## 4. Responsive behavior

| Viewport band   | Layout                                  | Status pill           |
| --------------- | --------------------------------------- | --------------------- |
| `< 768px`       | **stacked** (title + stacked Dates/Crew/Sync sub-line) | inline pill |
| `768px – 959px` | 5-column grid (Show/Dates/Crew/Sync/chevron) | inline pill      |
| `≥ 960px`       | 6-column grid (adds the Status column)  | Status column         |

Only the stacked↔5-col boundary moves (720→768). The 5-col↔6-col boundary (960) and everything above
are unchanged. `768–959` shows the inline status pill exactly as `720–959` did before.

## 5. Dimensional invariant

The 5-column grid's first track is `minmax(0,1fr)` (the title). At every band where the grid is
active (`≥768px`), it must resolve `≥120px`, with no row overflow and no header Show/Dates overlap.
Below 768px the row is `flex flex-col` (grid off), so the title is full-width and never starved —
`getComputedStyle(row).gridTemplateColumns === "none"`. Worked bands (estimates; the band-sweep is
the arbiter): 768→~154, 810→~196, 960→(6-col, per #209). All clear 120.

## 6. Band-sweep changes (`tests/e2e/admin-layout-dimensions.spec.ts`)

1. `TITLE_BANDS` (`:166`) — add `768` (the new activation band): `[720, 768, 810, 960, 1024, 1080, 1100, 1152, 1240, 1280, 1400, 1520]`.
2. Replace the #209 `if (width >= 810) { ≥120 } else { ≥90 tripwire }` block (`:194-217`) with a
   **stacked-aware** check. The `-1` sentinel (`:191`, `gridTemplateColumns === "none"`) now cleanly
   means "stacked" (correct for any band below the 768 activation, i.e. `720`):

   ```ts
   if (titleTrack === -1) {
     // Grid off (< 768px): the row is flex-col stacked, so the title is a full-width
     // flex child, never starved. Pin the intended STACKED presentation (not merely
     // "not grid"): the mobile sub-line is visible and the desktop cells are hidden.
     const mobileMetaVisible = await firstRow
       .locator("[data-testid^='shows-meta-mobile-']")
       .isVisible();
     const desktopChevronHidden = !(await firstRow
       .locator("[data-testid^='shows-chevron-']")
       .isVisible());
     expect(mobileMetaVisible, `mobile sub-line visible (stacked) at ${width}px`).toBe(true);
     expect(desktopChevronHidden, `desktop cells hidden (stacked) at ${width}px`).toBe(true);
   } else {
     expect(titleTrack, `title grid track width at ${width}px`).toBeGreaterThanOrEqual(MIN_TITLE_PX);
   }
   ```

   `shows-meta-mobile-{slug}` (`ShowsTable.tsx:446`) is the stacked meta (`min-[768px]:hidden` after
   this change → visible `<768`); `shows-chevron-{slug}` is a desktop-only cell (`hidden
   min-[768px]:block` → hidden `<768`). Both are unique to their render site.
3. Remove the `≥90` tripwire and the `≥810` gate (both were the pre-existing-720-gap workaround, now
   obsolete — the grid no longer activates at 720).
4. Update ALL stale `≥720`/grid-mode comments to `768`: the sweep header (`:147-162`), the
   `titleTrack` comment "grid is active at >= 720px, so all bands resolve to px tracks" (`:188`) →
   "grid is active at >= 768px; bands < 768 resolve `none` (stacked)", the `:191` inline "(< 720px)"
   → "(< 768px)", and the header-overlap comment "Header grid is active at >= 720px" (`:218`) →
   `768`.

The overflow (part b, `:198-200`) and header-overlap (part c, `:202-...`) checks run at all bands;
in stacked mode they trivially pass (flex-col row, `hidden` header). The new `768` band exercises the
5-col grid at its activation (title ~154 ≥120).

## 7. Guard conditions

- `< 768px` (stacked): `titleTrack === -1`; the title is a full-width flex child, never below the
  floor. The test asserts the concrete stacked presentation (mobile sub-line visible + desktop
  chevron hidden, §6.2), not merely "grid off" — so a broken impl that turns off the grid without
  restoring the stacked sub-line fails.
- `768px` exactly (`min-[768px]` = `@media (min-width:768px)`): grid ON; title ~154 ≥120.
- Empty rows / Find-empty: existing empty states unchanged; no grid rows → nothing to measure (the
  band-sweep requires `rowCount > 0`, seeded).
- The Status column (`min-[960px]`) and its tests are unaffected — `768–959` is still 5-col with the
  inline pill.

## 8. BACKLOG

Remove the **BL-SHOWSTABLE-720-TITLE-FLOOR** entry from `BACKLOG.md` (resolved by this change).

## 9. Test plan

- **Real-browser band-sweep** (`admin-layout-dimensions.spec.ts`, desktop-chromium, local — not in
  PR CI): every band ≥768 has title ≥120 + no overflow + no header overlap; bands <768 (720) are
  stacked (`gridTemplateColumns === "none"`). **Failure mode caught:** the 5-col grid activating at a
  width where the title collapses (the original bug), or the grid failing to stack below 768.
- **Component (jsdom, `ShowsTable.test.tsx`):** assert `ROW_GRID` now uses `min-[768px]:grid` +
  `min-[768px]:grid-cols-[…5 tracks…]` and still `min-[960px]:grid-cols-[…6 tracks…]`; the mobile
  sub-line + cells carry `min-[768px]`. (jsdom can't test the breakpoint itself; it pins the class
  strings so a regression is caught at unit speed.) **Failure mode caught:** a stray `min-[720px]`
  left behind, or the Status `min-[960px]` accidentally moved.
- Run the full ShowsTable/Dashboard/transition-audit unit files to confirm no regression.

## 10. Invariant-8 (impeccable v3 dual-gate)

UI change (`components/admin/ShowsTable.tsx`). Run `/impeccable critique` AND `/impeccable audit` on
the diff; HIGH/CRITICAL fixed or `DEFERRED.md`. (Expected clean — this only shifts a breakpoint value;
no new elements, tokens, or copy.)

## 11. Watchpoints / do-not-relitigate

- **768, not 720:** the 5-col grid title track is ~106px at 720px (measured, #209) — below the 120px
  floor. 768 gives ~154px. Any value ≥~740 works; 768 is the standard tablet-portrait width and gives
  comfortable margin. The band-sweep pins it.
- **The admin nav's `min-[720px]` bottom-bar padding stays at 720** — it is a separate concern from
  the table's column layout; the two breakpoints deliberately differ.
- **Deviating from the project's app-wide `min-[720px]` mobile↔desktop breakpoint is intentional and
  scoped to THIS table.** `min-[720px]` is the standard breakpoint across the app (`AdminNav`,
  `Dashboard`, per-show, crew sections, `ArchivedShowRow`, etc.); this change does NOT touch any of
  them. A wide **data table** legitimately stacks at a higher breakpoint than the nav/chrome (it has
  more columns to fit), so at `720–767px` the nav/dashboard are in desktop mode while the shows
  table stacks — a deliberate, common responsive pattern, not an inconsistency to "fix". The
  alternative (keep columns at 720 by reclaiming width) was considered and declined by the user in
  favor of this cleaner stacking approach.
- **This resolves a pre-existing gap; it is not a regression introduced by #209** — #209 gated its
  new Status column at 960 precisely to avoid worsening the already-tight 720 band. This change fixes
  the underlying 720 gap for the 5 existing columns.
