# Spec — Admin dashboard "Status" column (published / unpublished)

**Date:** 2026-06-30
**Slug:** `admin-shows-status-column`
**Author:** Opus (Claude Code), autonomous-ship pipeline
**Surface:** Admin dashboard shows table (`components/admin/ShowsTable.tsx`) + the dashboard two-column split (`components/admin/Dashboard.tsx`) + admin skeleton (`app/admin/loading.tsx`).
**Type:** UI-only. **No DB / parser / RPC / migration / advisory-lock change.**

---

## 1. Goal

Surface each show's publish state as a dedicated, sortable **Status** column in the admin shows
table. Today the publish state is rendered only as a title-area pill that appears for the
non-published states (Live / Publishing… / Held) and renders **nothing** for fully-published
shows (`components/admin/ShowsTable.tsx:108-147` — `StatePill` returns `null` when `row.published`).
The change gives every row an explicit, positive label and moves it into its own column on wide
viewports.

## 2. Scope

**In scope** — the `ShowsTable` component, which renders:

- the **Active** dashboard bucket (`components/admin/Dashboard.tsx:535-548`), and
- the **/admin/unpublished** "Held shows" view (`app/admin/unpublished/page.tsx:72-89`).

Both consume the same component, so the column appears in both. In the Held view every row is
`Held` by construction — that is consistent and acceptable.

**Out of scope** (explicit):

- The **Archived** bucket renders via a different component, `components/admin/ArchivedShowRow.tsx`
  (`components/admin/Dashboard.tsx:512-521`), not `ShowsTable`. Archived shows already render an
  "Archived (date)" line; their publish state is moot. **No change to `ArchivedShowRow`.**
- No change to data: `published`, `isLive`, `finalizeOwned` are already computed once in
  `fetchDashboardData` and carried on `ActiveShowRow` (`lib/admin/showDisplay.ts:24,28,38`;
  computed at `components/admin/Dashboard.tsx:357-373`). This spec **reads** them; it never
  recomputes or re-fetches.
- No copy added to spec §12.4 (no error codes); no `lib/messages` change.

## 3. State vocabulary

Four mutually-exclusive states, derived **only** from the precomputed row fields (never recomputed
in the component — same contract as today's `StatePill`). The derivation precedence matches the
existing `StatePill` (`components/admin/ShowsTable.tsx:108-146`):

| State          | Condition (precedence order)            | Status token (existing)        | Column label   | Inline-pill label (mobile) |
| -------------- | --------------------------------------- | ------------------------------ | -------------- | -------------------------- |
| **Live**       | `row.isLive`                            | `status-live` (+ ping)         | `Live`         | `Live`                     |
| **Published**  | `row.published && !row.isLive`          | `status-positive` (teal) — NEW | `Published`    | `Published`                |
| **Publishing…**| `!row.published && row.finalizeOwned`   | `status-warn`                  | `Publishing…`  | `Publishing…`              |
| **Held**       | `!row.published && !row.finalizeOwned`  | `status-idle`                  | `Held`         | `Held — not published`     |

Tokens already exist in `app/globals.css:76-85` (`--color-status-live`, `--color-status-positive`,
`--color-status-warn`, `--color-status-idle`, plus `-text` variants). Color is **never** the sole
carrier — every pill pairs a dot with a text label (DESIGN §1 color-blind floor), exactly as the
current pills do.

**The only new state is `Published`** (`status-positive`/teal). Today `StatePill` returns `null` for
published rows; this spec adds the positive pill.

### 3.1 Label compaction (the one mode-dependent difference)

The only label that differs between the desktop **column** and the mobile **inline pill** is
**Held**:

- **Column (desktop):** `Held` — compact, so the column track stays narrow.
- **Inline pill (mobile):** `Held — not published` — the existing copy is **preserved verbatim**
  (`tests/components/admin/ShowsTable.test.tsx:116` asserts `/Held — not published/`; master spec
  §3.2 defines this string). We do **not** change §3.2 copy.

`StatePill` takes a `compact?: boolean` prop. `compact` only affects the `Held` label; `Live` /
`Published` / `Publishing…` are identical in both modes (already short). This is the **only**
behavioral fork between the two render sites.

## 4. Render placement & responsive behavior

The publish state appears in exactly **one** place at any viewport width:

| Viewport band      | Layout                                 | Where the status shows                          |
| ------------------ | -------------------------------------- | ----------------------------------------------- |
| `< 720px`          | stacked rows (mobile)                  | **inline pill** beside the title                |
| `720px – 959px`    | 5-column grid (unchanged from today)   | **inline pill** beside the title                |
| `≥ 960px`          | 6-column grid (adds the Status column) | **Status column** (inline pill hidden)          |

Rationale: the existing 5-column grid is at width capacity at its 720px activation (the title
`minmax(0,1fr)` track sits at its ~120px floor — see §6). A 6th column cannot share the 720px
breakpoint, so the **Status column is gated at a higher breakpoint (960px)** while the five existing
columns keep their 720px breakpoint untouched. Below 960px the status remains fully visible as the
inline pill (today's behavior, now including the `Published` variant). This is progressive
disclosure: the dedicated column appears only where there is room for it.

### 4.1 Render sites (both always in the DOM; CSS toggles visibility)

Because jsdom keeps display:none nodes in the DOM, the **inline pill** and the **column pill** are
two separate render sites with **distinct `data-testid`s**, CSS-toggled so only one is visible per
band (a single `getByTestId` therefore never matches two visible elements):

- **Inline pill** (existing site, `ShowsTable.tsx:381`): wrapped so it is visible `< 960px` and
  hidden `≥ 960px` (`min-[960px]:hidden`). Non-compact labels. Keeps the **existing** testids
  (`shows-live-pill-{slug}`, `shows-published-pill-{slug}` (new), `shows-publishing-{slug}`,
  `shows-held-pill-{slug}`).
- **Column pill** (new cell, before the chevron): `hidden min-[960px]:block`. Compact labels.
  New testid namespace: `shows-status-{slug}` wrapper containing the pill; per-state testids
  `shows-statuscol-{state}-{slug}` (`live` | `published` | `publishing` | `held`).

## 5. Sortability

The Status column header is a sort button matching the M12.10 pattern
(`components/admin/ShowsTable.tsx:217-250`). Add `"status"` to `SortKey`
(`ShowsTable.tsx:64`), a `sortValue` case (`ShowsTable.tsx:67-87`), and a severity rank constant
analogous to `SYNC_SORT_RANK` (`ShowsTable.tsx:91`). Severity order (attention-first), mirroring how
sync sorts problems first:

```
STATUS_SORT_RANK = { publishing: 0, held: 1, live: 2, published: 3 }
```

`sortValue("status")` returns `${STATUS_SORT_RANK[state]}|${label}` so ties break on the visible
label, then the existing title tiebreak (`ShowsTable.tsx:99,104`). The status state is **never
null**, so status rows never sort "last" (consistent with the sync column, `ShowsTable.tsx:82-84`).

The sort button is part of the 6-column header and therefore also gated `≥ 960px`
(`hidden min-[960px]:...`), so it is absent from the 5-column grid where there is no Status column to
sort. Testid `shows-sort-status` (matches the `shows-sort-{key}` convention,
`ShowsTable.tsx:223`).

## 6. Dimensional Invariants

The shows table is a fixed-track grid; Tailwind v4 does **not** default `.flex`/`.grid` children to
`align-items: stretch` (see `memory/feedback_tailwind_v4_flex_items_stretch.md` and
`components/admin/Dashboard.tsx:443-447`), so every track relationship is stated explicitly and
verified in a **real browser** (Playwright), never jsdom.

### 6.1 Grid tracks

- **5-column grid (720–959px), unchanged:**
  `grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_1.25rem]` — Show(1fr) / Dates(10rem) / Crew(5rem) /
  Sync(12rem) / chevron(1.25rem). `gap-4` (16px), row `px-4` (32px total).
- **6-column grid (≥960px), new:**
  `grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_6rem_1.25rem]` — inserts **Status(6rem)** between Sync
  and chevron. `6rem` (96px) is sized to fit the widest compact pill, `Publishing…`
  (dot + label + pill padding + border ≈ 92px). The Status cell is `display:none` below 960px, so
  the 5-column grid has exactly 5 cells in 5 tracks; at ≥960px the Status cell is `block`, giving 6
  cells in 6 tracks. The chevron is always the **last** DOM cell and maps to the last track in both
  grids.

### 6.2 Title-track floor (the binding constraint)

The first track is `minmax(0,1fr)` (the title). It must resolve `≥ 120px` at **every** band where a
grid is active, with no horizontal row overflow and no header Show/Dates overlap — the exact
invariants the existing band-sweep gate asserts
(`tests/e2e/admin-layout-dimensions.spec.ts:160-206`, `MIN_TITLE_PX = 120`).

Width budget (admin wrapper `px-page-pad-desktop` = 64px total at ≥640px; inter-column
`gap-tile-gap` = 16px; `max-w-[1600px]` caps content ≥1600px):

- **Single-column (split off):** `showsCol = viewport − 64`.
- **Two-column (split on):** `showsCol = viewport − 64 − inboxWidth − 16`.
- 6-column fixed overhead ≈ `548px tracks + 80px gaps + 32px px-4 ≈ 660px`; title ≈ `showsCol − 660`.
  Title `≥ 120` ⇒ `showsCol ≥ 780px`.

These hand figures are **approximate**; the **binding gate is the band-sweep test**, which measures
the browser-resolved first track. Breakpoint targets below are tuned against it — if any band falls
below 120px, the implementer raises the corresponding breakpoint until green (never lowers
`MIN_TITLE_PX`).

### 6.3 Responsive breakpoint budget — three coordinated changes

| Lever                              | Today                                              | New                                                  | Why                                                                          |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Status column gate                 | n/a                                                | `min-[960px]`                                        | 6-col grid needs `showsCol ≥ 780`; at 960 single-col `showsCol = 896` ✓      |
| Two-column split (`dashboard-split`) | `min-[1080px]` (`Dashboard.tsx:463,468`)         | `min-[1240px]`                                       | At ≥960 the 6-col grid is active; at the old 1080 two-col band `showsCol≈680` starves the title. At 1240 two-col (inbox 320) `showsCol≈840` ✓ |
| Inbox widen                        | `min-[1280px]:w-[480px]` (`Dashboard.tsx:554`)     | `min-[1400px]:w-[480px]` (base `min-[1240px]:w-80`)  | At 1280 with a 480px inbox `showsCol≈720` starves the title; delaying the widen to 1400 keeps `showsCol≈840` ✓ |

`app/admin/loading.tsx:31,36` mirrors the split + inbox classes and must move in lockstep
(`min-[1080px]`→`min-[1240px]`, `min-[1280px]:w-[480px]`→`min-[1400px]:w-[480px]`). The stale
comment block `Dashboard.tsx:448-460` (which says the inbox widens to "360px" — the code actually
says 480px) is rewritten to describe the new budget.

### 6.4 Worked band table (targets; test is the arbiter)

| Band (px) | Grid    | Split | Inbox | `showsCol` ≈ | Title ≈ | Result      |
| --------- | ------- | ----- | ----- | ------------ | ------- | ----------- |
| 720       | 5-col   | off   | —     | 656          | unchanged from today | ✓ (existing) |
| 810       | 5-col   | off   | —     | 746          | unchanged | ✓ (existing) |
| 960       | 6-col   | off   | —     | 896          | 234     | ✓           |
| 1024      | 6-col   | off   | —     | 960          | 298     | ✓           |
| 1080      | 6-col   | off   | —     | 1016         | 354     | ✓           |
| 1152      | 6-col   | off   | —     | 1088         | 426     | ✓           |
| 1240      | 6-col   | on    | 320   | 840          | 178     | ✓ (new band)|
| 1280      | 6-col   | on    | 320   | 880          | 218     | ✓ (existing)|
| 1400      | 6-col   | on    | 480   | 840          | 178     | ✓ (new band)|
| 1520      | 6-col   | on    | 480   | 960          | 298     | ✓ (new band)|

`tests/e2e/admin-layout-dimensions.spec.ts` `TITLE_BANDS` (`:160`) is extended by appending
`1240, 1400, 1520` (the new boundary bands); the existing bands `720,810,960,1024,1080,1100,1152,1280`
stay and continue to pass. Bands 720/810 still exercise the **unchanged 5-column grid** (so their
title-track behavior is identical to today). The assertion body (`:183-206`) is unchanged — it
already handles grid-on bands.

## 7. Transition Inventory

The status pill has 4 states; the table also crosses the 960px breakpoint (inline↔column). All
transitions are **instant — no animation** (matching the existing pills, which animate only the
`status-live` ping; `components/admin/StatusIndicator.tsx:32-44`):

| Transition                                   | Treatment                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Any state ↔ any state (data change → re-render) | Instant — no animation. Pills are pure render of precomputed fields.    |
| `Live` pill                                  | Retains the existing `status-live` CSS ping (`StatusIndicator`), `motion-reduce:hidden`. |
| Inline pill (`<960`) ↔ column pill (`≥960`)  | Instant — CSS media-query visibility toggle of two static DOM nodes; no JS, no animation. |
| 5-col grid ↔ 6-col grid at 960px             | Instant — `grid-template-columns` media-query swap; Status cell `display` toggles. |
| Two-col split at 1240 / inbox widen at 1400  | Instant — existing flex/width media queries; unchanged animation posture. |

No `AnimatePresence`, ternary-mounted, or conditionally-mounted animated element is added.
Compound transition (e.g. a row's `published` flips while the viewport is mid-resize across 960px):
both render sites are static and CSS-toggled, so there is no animation state to interleave — the new
data simply renders in whichever site the current width shows. Instant by construction.

## 8. Guard conditions (partial / edge data)

`ActiveShowRow` fields are typed non-optional booleans (`lib/admin/showDisplay.ts:24,28,38`), but the
component must be defensive (React renders partial data during editing/loading):

- `isLive`, `published`, `finalizeOwned` falsy/undefined → the precedence chain in §3 still yields a
  state: missing `published`+`finalizeOwned` ⇒ `Held` (the safe, neutral terminal state — fail
  toward "not published", matching the existing fail-toward-Held contract,
  `lib/admin/showDisplay.ts:29-38`).
- `isLive` truthy with `published` falsy is not a real state from `fetchDashboardData` (live ⇒
  published), but precedence puts `Live` first, so the row renders `Live` and never crashes.
- Empty `rows` / Find-filtered-to-empty → existing empty states are unchanged (`ShowsTable.tsx:314-340`);
  no Status column renders because no rows render.
- The `StatePill` `compact` prop defaulting to `false`/`undefined` ⇒ the verbose `Held — not
  published` label (the safe default that preserves existing copy).

## 9. Files touched

- `components/admin/ShowsTable.tsx` — `StatePill` (Published variant + `compact` prop), inline-pill
  visibility wrapper (`min-[960px]:hidden`), new Status header sort button + Status cell
  (`hidden min-[960px]:block`), 6-col grid template, `SortKey`/`sortValue`/`STATUS_SORT_RANK`.
- `components/admin/Dashboard.tsx` — split breakpoint `1080`→`1240` (`:463,468`), inbox width
  classes (`:554`), comment block (`:448-460`).
- `app/admin/loading.tsx` — mirror split + inbox breakpoints (`:31,36`).
- `tests/e2e/admin-layout-dimensions.spec.ts` — extend `TITLE_BANDS` (`:160`).
- `tests/components/admin/ShowsTable.test.tsx` — new Status column + Published-variant assertions;
  update any "published row shows no pill" assumptions.
- `tests/admin/unpublishedView.test.tsx`, `tests/components/admin/Dashboard-archived.test.tsx`,
  `tests/e2e/admin-lifecycle-transitions.spec.ts` — update for the column / pill relocation as
  needed (TDD will surface exact deltas).

## 10. Test plan

- **Component (jsdom, `ShowsTable.test.tsx`):** each of the 4 states renders the correct column pill
  (`shows-statuscol-{state}-{slug}`) AND the correct inline pill (existing testids + new
  `shows-published-pill`); mutual exclusivity per row; `Published` pill renders for
  `published && !isLive`; `compact` Held label is `Held` in the column and `Held — not published`
  inline; the Status sort button toggles asc/desc and groups by `STATUS_SORT_RANK`
  (asc: publishing < held < live < published). **Failure mode caught:** a published row silently
  showing no status; the column pill and inline pill diverging in state; sort ordering by hidden data.
- **Real-browser layout (`admin-layout-dimensions.spec.ts`):** title track `≥ 120px`, no row
  overflow, no header overlap at every band incl. the new `1240 / 1400 / 1520`. **Failure mode
  caught:** the 6th column starving the title track (the exact collapse the gate exists for).
- **Anti-tautology:** column-pill assertions read `row` state derived from fixture fields, not the
  rendered container; the inline-vs-column scan clones the row and removes the hidden sibling before
  asserting a single visible pill, so a broken CSS toggle (both visible) fails rather than passes.
- **Negative regression:** flipping a fixture row `published: true → false` must move it Published →
  Held in both render sites; a test that still passes after that mutation is tautological and must be
  strengthened.

## 11. Invariant-8 (impeccable v3 dual-gate)

This diff touches UI (`components/`, no `@theme`/token additions — reuses existing tokens). Before
the whole-diff cross-model review, run `/impeccable critique` AND `/impeccable audit` on the diff;
HIGH/CRITICAL findings fixed or deferred via `DEFERRED.md`. Findings + dispositions recorded in the
PR / handoff.

## 12. Watchpoints / do-not-relitigate

- **Three breakpoint bumps are required, not optional.** The 720px grid is at title-floor capacity
  (§6.2); a 6th column at 720 collapses the title below 120px. Gating Status at 960 + split at 1240 +
  inbox-widen at 1400 is the minimal set that keeps every band ≥120px (§6.4). The band-sweep test is
  the proof. (The user chose "compact label + bump breakpoint" over the no-new-track option in
  brainstorming.)
- **Inline pill and column pill are intentionally two DOM nodes** with distinct testids, CSS-toggled
  (§4.1). This is deliberate (jsdom keeps display:none nodes), not duplication to "fix".
- **The asymmetry where crew hides sentinels but a modal shows as-parsed does not apply here** — this
  is admin-only, no sentinel/optional-text surface.
- **`Held — not published` mobile copy is preserved verbatim** (§3.1); only the desktop **column**
  uses the compact `Held`. This is not a §3.2 spec-copy change.
- **Inbox base width stays `w-80` (320px) through 1240–1399** and only widens to `w-[480px]` at 1400
  (was 1280). This narrows the inbox on 1280–1399 screens vs. today — a deliberate consequence of the
  width budget, not a regression to undo.

## 13. Out of scope / non-goals

- Archived bucket (`ArchivedShowRow`).
- Any data, RPC, migration, advisory-lock, or `lib/messages` change.
- New design tokens (reuses `status-live/positive/warn/idle`).
- Filtering by status (only sorting). A future "filter by status" is a separate feature.
