# Spec — CARDREPORT-1: ≥44×44 tap targets for crew-card header affordances

**Date:** 2026-07-17
**Slug:** `cardreport-tap-targets`
**Deferred item:** `DEFERRED.md` §"Per-card report affordance" → CARDREPORT-1 (P3).
**Owner routing:** UI → Opus / Claude Code (invariant-8 impeccable dual-gate applies).

---

## 1. Problem

Two affordances sit in every source-backed crew card header `action` slot:

- `SourceLink` (`components/crew/primitives/SourceLink.tsx:40`) — an `<a>` rendering a 14px sheet glyph + the label "In sheet" (`text-xs font-medium`). Classes: `inline-flex h-fit shrink-0 items-center gap-1 … [&_svg]:size-3.5` (`:52`).
- `CardReportTrigger` (`components/shared/CardReportTrigger.tsx:44`) — an icon-only `<button>` rendering a 14px flag glyph. Classes: `inline-flex h-fit shrink-0 items-center … [&_svg]:size-3.5` (`:74`).

Both render at intrinsic glyph height (~14–16px). `CardReportTrigger` is also intrinsic width (~14px). Both are **below the 44×44px floor** mandated by `PRODUCT.md` (accessibility floor: "All interactive targets ≥44×44px", non-inline) and `DESIGN.md:188` (`--spacing-tap-min: 44px`, `app/globals.css:162`). Neither qualifies for the WCAG 2.5.5 inline-prose exception — they are header chrome, not inline body links.

They are clustered by `CardHeaderActions` (`components/crew/primitives/CardHeaderActions.tsx:42`): `<div data-slot="card-header-actions" class="inline-flex h-fit shrink-0 items-center gap-2">` → `SourceLink` then `CardReportTrigger`, in that fixed order.

### 1.1 The three real header contexts (this drives the whole design)

`CardHeaderActions` is mounted in **three geometrically distinct** header contexts — verified in live code, not assumed:

| Context | Host | Band height | Space ABOVE the band | Space BELOW the band | Below-neighbor interactive? |
| --- | --- | --- | --- | --- | --- |
| **A. Icon SectionCard** | `SectionCard` with `icon`+`title` (e.g. `TodaySection.tsx:501`, `GearSection`, `VenueSection`) | ≥28px (`size-7` icon, `SectionCard.tsx:51`) | `p-tile-pad` 20px + 32px inter-section gap (`gap-section-gap`, `CrewSections.tsx:115`; `--spacing-section-gap: 32px`) | `gap-3` 12px (`SectionCard.tsx:39`) | **Yes** — body rows below can be interactive. |
| **B. Title-only SectionCard** | `SectionCard` with `title` only, NO icon (`BudgetSection.tsx:102`, `TodaySection.tsx:509/514`) | ~16px (`text-xs` title) | same as A (20px pad + 32px gap) | `gap-3` 12px | **Yes** — `BudgetSection` renders `KeyValueRows`, whose rows wrap values in `<a href="tel:…">`/`mailto:` and are themselves 44px tap rows (`KeyValue.tsx:117-122`). |
| **C. Bare schedule header** | NOT a `SectionCard` — a flush `<div class="mb-2 flex justify-end">` above the day list (`ScheduleSection.tsx:251`) | ~16px | `gap-4` 16px to the agenda area above (`ScheduleSection.tsx:149-160`, may contain links) | `mb-2` 8px | **No** — `DayCard` (`components/crew/primitives/DayCard.tsx`) renders no `<a>`/`<button>`/`onClick`; the day list is non-interactive. |

**The key asymmetry:** in contexts A/B the interactive neighbor is BELOW (12px away) and the roomy non-interactive space is ABOVE (52px); in context C the non-interactive neighbor is BELOW (day cards) and the possibly-interactive neighbor (agenda) is ABOVE. The safe direction to grow a hit target is therefore **opposite** between {A,B} and C.

---

## 2. Constraints

1. **≥44×44px hit target** for BOTH affordances.
2. **No header-height change.** The header band height must be unperturbed. `tests/e2e/source-link-dimensional.spec.ts` asserts every body row keeps its height with vs. without the affordances (§5.4), and that each affordance's *border box* does not exceed the header band. Both assertions must stay green — the mechanism (pseudo-overlay, §3) is invisible to box metrics, so they hold unchanged.
3. **No sibling hit-area overlap.** The two enlarged hit areas must not overlap each other, and neither may overlap the OTHER affordance's clickable box (a tap in the overlap zone would fire both the sheet link and the report modal — the mis-tap the deferral names).
4. **No bleed into an adjacent INTERACTIVE target.** An enlarged hit area may extend over non-interactive dead space (padding, gaps, non-interactive day cards), but MUST NOT intersect any adjacent *interactive* element's box (a 44px `KeyValue` tel/mailto row, an agenda link). This is the operative safety property — verified behaviorally per context (§5), not by geometric assumption.
5. **Recessive appearance unchanged.** Glyphs, color (`text-text-faint`), and labels are untouched. Only the *invisible* hit area grows.

---

## 3. Mechanism — direction-aware out-of-flow pseudo-element overlay

Repo-canonical pattern (not new): a transparent `::before` with `position: absolute` on a `position: relative` host enlarges the *hit* target without participating in layout — it does not change the host's `getBoundingClientRect()`, so it cannot perturb row heights or the header band (constraint 2 holds automatically). Precedents: `components/admin/HoverHelp.tsx:171` (`before:absolute before:-inset-3 before:content-['']` → 20px visual, 44px hit) and `components/admin/PublishedToggle.tsx:145` (`… before:absolute before:-inset-y-2 …`). Sizing uses the `--spacing-tap-min` (44px) token via `before:h-tap-min` / `before:w-tap-min` (the `--spacing-*` namespace generates `h-*`/`w-*`/`size-*` utilities; `min-h-tap-min` is already in use at `ThemeToggle.tsx:132`, `KeyValue.tsx:123`).

### 3.1 Direction-aware anchoring (the core idea)

Because the safe growth direction is context-dependent (§1.1), the overlay is **anchored to one edge of the affordance box and grows the full 44px in ONE direction** — never centered. A new `hitDirection: "up" | "down"` prop (default `"up"`) selects the anchor:

- **`"up"` (default — contexts A, B):** overlay bottom edge is flush with the affordance box bottom; it grows 44px upward. `before:bottom-0 before:h-tap-min` (+ `before:top-auto`). **Zero downward overhang** → it can never intersect the interactive rows below (constraint 4 for A/B). The ~28–30px upward overhang lands in the 20px `p-tile-pad` + 32px inter-section gap — structurally non-interactive (the previous section's own `p-tile-pad` keeps its last interactive row ≥20px inside its card).
- **`"down"` (context C — the bare schedule header):** overlay top edge is flush with the affordance box top; it grows 44px downward. `before:top-0 before:h-tap-min` (+ `before:bottom-auto`). **Zero upward overhang** → it can never reach the (possibly-interactive) agenda area above. The ~28px downward overhang lands in the `mb-2` gap + the non-interactive `DayCard` list.

`ScheduleSection`'s bare `schedule-days` cluster (`ScheduleSection.tsx:253`) passes `hitDirection="down"`. Every other call site inherits the `"up"` default. The prop threads `CardHeaderActions` → both `SourceLink` and `CardReportTrigger`.

### 3.2 Horizontal geometry (orthogonal to direction)

- **Cluster gap `gap-2` → `gap-4`** (`CardHeaderActions.tsx:42`; 8px → 16px). Widens horizontal clearance so a symmetric-width trigger overlay clears SourceLink. Changes cluster WIDTH only, never band height.
- **SourceLink** is already ≥44px wide (14px glyph + 4px gap + "In sheet" `text-xs font-medium` ≈ 58px; width relies on the constant "In sheet" label — documented guard §6). Its overlay is **full host-width** (`before:inset-x-0`) so it never overflows horizontally and **cannot** overlap the trigger, at any gap.
- **CardReportTrigger** overlay is a fixed 44px wide, horizontally centered on its 14px box: `before:left-1/2 before:-translate-x-1/2 before:w-tap-min`. Symmetric ±(44−14)/2 = ±15px. Its leftward 15px lands inside the 16px `gap-4` (15 < 16 → ≥1px clearance from SourceLink's right box edge, constraint 3). Its rightward 15px lands in the header's trailing `p-tile-pad` (context A/B) or the flush-right justify padding (context C) — no card overflow.

### 3.3 Paint-order note

The `::before` is positioned, so it paints above in-flow siblings and would win `elementFromPoint` in any geometric overlap. §3.1 keeps every overlay clear of interactive neighbors by construction (single-direction growth into the non-interactive side), so this never bites — but it is WHY constraint 4 is enforced geometrically (direction + zero overhang on the interactive side) rather than by z-order.

---

## 4. Testing — extend `tests/e2e/source-link-dimensional.spec.ts`

The existing suite (real-browser Playwright, `desktop-chromium`) already asserts row-height invariance and affordance-box ≤ header band — **unchanged, must stay green** (the pseudo-overlay is invisible to `boundingBox()`).

**Add a functional `elementFromPoint` hit-probe** — it interrogates the live compositor's real hit-testing, not class strings (anti-tautology). The harness (§4.1) renders BOTH growth directions with realistic interactive neighbors. For each affordance in each context:

1. **Hit target reaches 44px in the intended direction.** From the affordance's measured box rect, probe the two extreme points of the expected 44px span along the growth axis (e.g. for `"up"`: `(cx, boxBottom−1)` and `(cx, boxBottom−43)`) and assert each resolves to an element whose `.closest('[data-slot=<slot>]')` is that affordance. Fails if the overlay is missing, undersized, or a `before:*` utility failed to compile (F5 — the probe asserts computed hit behavior, not class presence). SourceLink is probed only along the vertical axis (already ≥44px wide); the trigger is also probed at `(cx±21, cy)` for width.
2. **No overhang on the interactive side (constraint 4 — boundary probe, not center).** Probe just past the affordance's anchored edge on the interactive side and assert it does NOT resolve to the affordance:
   - `"up"` contexts (A/B): `(cx, boxBottom+2)` must NOT `.closest` the affordance, AND the first interactive neighbor below (a seeded `tel:` `KeyValue` row) must be hittable at its own box — probe its TOP edge `(rowCx, rowTop+1)` and assert it resolves to the row's link, proving the overlay does not shave the row's top strip.
   - `"down"` context (C): mirror — `(cx, boxTop−2)` must NOT resolve to the affordance (nothing stolen from above).
3. **No sibling overlap (constraint 3 — edge probe, not just glyph centers).** Assert the trigger hit area does not cover SourceLink's clickable box: probe SourceLink's right box edge `(srcRight−2, srcCy)` and its label mid-point and assert both `.closest('[data-slot=source-link]')`, NOT `card-report-trigger`. Symmetrically assert SourceLink's overlay does not cover the trigger glyph center.

All coordinates DERIVED from measured rects; the only literals are the ±1/±2/±21/−43 probe offsets (each justified as strictly inside/outside the 44px span with a 1–2px anti-flake margin).

### 4.1 Harness (`app/admin/dev/source-link-dim/page.tsx`)

Add two context cards next to the existing measured cards (the file is a dev-only, build-gated route — absent from production artifacts, so this is not a product surface):

- **`card-actions-up`** — an icon+title `SectionCard` with `CardHeaderActions` (default `"up"`) whose body's FIRST child is an interactive `KeyValueRows` row wrapping a `tel:` link (`data-testid="dim-tel-row"`), so probe 2 exercises a real interactive below-neighbor.
- **`card-actions-down`** — a replica of the bare schedule header: `<div class="mb-2 flex justify-end"><div data-slot="section-card-action">…CardHeaderActions hitDirection="down"…</div></div>` above a non-interactive `DayCard`-style stub, so probe 2/3 exercise the down-growth path.

The existing `card-with-actions` row-height assertions are retained unchanged.

---

## 5. Guard conditions

| Input / state | Behavior |
| --- | --- |
| `SourceLink` `href === null` | Renders nothing (`SourceLink.tsx:43`) — no overlay. Unchanged. |
| `CardReportTrigger` `showId` falsy | Renders `null` (`CardReportTrigger.tsx:58`) — no overlay. Unchanged. |
| `hitDirection` omitted | Defaults to `"up"` — correct for all 22 SectionCard call sites (A/B). |
| A future SectionCard whose below-neighbor is interactive AND whose above-space is <44px | Not a current shape (all SectionCards get 20px pad + 32px section gap above). If one is ever added, the harness pattern + probe 2 would catch a bleed; add a `"down"` variant or reserve band height at that point. |
| Very long future SourceLink label | Only widens the ≥44px width further — vertical overlay unaffected. A label short enough to drop <44px width would need a width overlay; documented label-dependency guard (not in scope — label is the constant "In sheet"). |
| Context C day cards ever become interactive | The `"down"` overhang would then intersect them; revisit to reserve a 44px band on the schedule header instead. Documented; out of current scope (`DayCard` is non-interactive today). |

---

## 6. Non-goals / out of scope

- No visual restyle of either affordance (color, glyph, label unchanged).
- No change to `ReportModal`, the report surface bundle, or `SourceLink`'s deep-link logic.
- No consolidation of the two affordances into one control (a separate future option the deferral names).
- No DB, no server actions, no advisory locks, no error-code catalog, no email boundaries.

---

## 7. Files touched

| File | Change |
| --- | --- |
| `components/crew/primitives/SourceLink.tsx` | Accept `hitDirection?: "up"\|"down"` (default `"up"`); `relative` + direction-anchored full-width `::before` 44px overlay. |
| `components/shared/CardReportTrigger.tsx` | Accept `hitDirection?`; `relative` + direction-anchored centered 44×44 `::before` overlay. |
| `components/crew/primitives/CardHeaderActions.tsx` | Accept `hitDirection?` (default `"up"`), thread to both children; `gap-2` → `gap-4`. |
| `components/crew/sections/ScheduleSection.tsx` | Bare `schedule-days` cluster passes `hitDirection="down"` (`:253`). |
| `app/admin/dev/source-link-dim/page.tsx` | Add `card-actions-up` (interactive tel row below) + `card-actions-down` (bare header) harness contexts. |
| `tests/e2e/source-link-dimensional.spec.ts` | New direction-aware `elementFromPoint` hit-probe (§4). |
| `DEFERRED.md` | Mark CARDREPORT-1 ✅ RESOLVED with the shipped mechanism. |

Invariant-8 impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) runs on the UI diff before cross-model close-out. No new meta-test registry rows (no auth/DB/mutation surface touched).
