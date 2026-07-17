# Spec — CARDREPORT-1: ≥44×44 tap targets for crew-card header affordances

**Date:** 2026-07-17
**Slug:** `cardreport-tap-targets`
**Deferred item:** `DEFERRED.md` §"Per-card report affordance" → CARDREPORT-1 (P3).
**Owner routing:** UI → Opus / Claude Code (invariant-8 impeccable dual-gate applies).

---

## 1. Problem

Two affordances sit in every source-backed crew SectionCard header `action` slot:

- `SourceLink` (`components/crew/primitives/SourceLink.tsx:40`) — an `<a>` rendering a 14px sheet glyph + the label "In sheet" (`text-xs font-medium`). Classes: `inline-flex h-fit shrink-0 items-center gap-1 … [&_svg]:size-3.5` (`:52`).
- `CardReportTrigger` (`components/shared/CardReportTrigger.tsx:44`) — an icon-only `<button>` rendering a 14px flag glyph. Classes: `inline-flex h-fit shrink-0 items-center … [&_svg]:size-3.5` (`:74`).

Both render at intrinsic glyph height (~14–16px). `CardReportTrigger` is also intrinsic width (~14px). Both are **below the 44×44px floor** mandated by `PRODUCT.md` (accessibility floor: "All interactive targets ≥44×44px", non-inline) and `DESIGN.md:188` (`--spacing-tap-min: 44px`, `app/globals.css:162`). Neither qualifies for the WCAG 2.5.5 inline-prose exception — they are header chrome, not inline body links.

They are clustered by `CardHeaderActions` (`components/crew/primitives/CardHeaderActions.tsx:42`): `<div data-slot="card-header-actions" class="inline-flex h-fit shrink-0 items-center gap-2">` → `SourceLink` then `CardReportTrigger`, in that fixed order.

---

## 2. Constraints (from the deferral trigger + dimensional invariants)

1. **≥44×44px hit target** for BOTH affordances.
2. **No header-height change.** The header row height must be unperturbed — the existing real-browser invariant `tests/e2e/source-link-dimensional.spec.ts` asserts every body row keeps its height with vs. without the affordances (spec §5.4), and that each affordance's border box does not exceed the header band. Both assertions must stay green.
3. **No sibling hit-area overlap.** The two enlarged hit areas must not overlap each other, and neither may overlap the OTHER affordance's clickable box (a tap in the overlap zone would fire both the sheet link and the report modal — the exact mis-tap the deferral names).
4. **No bleed into adjacent interactive targets.** The enlarged hit areas must not extend into an adjacent interactive body row (e.g. `KeyValue` rows are themselves 44px tap rows, `KeyValue.tsx:122`).
5. **Recessive appearance unchanged.** The affordances stay visually recessive (`text-text-faint`, 14px glyphs). Only the *invisible* hit area grows.

---

## 3. Mechanism — transparent out-of-flow pseudo-element overlay (repo-canonical)

This is an established pattern in this codebase, not a new invention:

- `components/admin/HoverHelp.tsx:171` — `before:absolute before:-inset-3 before:content-['']` on a `relative` compact "?" keeps a 20px visual but a 44px hit area.
- `components/admin/PublishedToggle.tsx:143` — same recipe for the toggle.

A `::before` pseudo-element with `position: absolute` on a `position: relative` host **does not participate in layout** — it does not change `getBoundingClientRect()` of the host element, so it cannot perturb row heights or the header band. It DOES capture pointer events (default `pointer-events: auto`), so it enlarges the *hit* target. This is why constraint 2 holds automatically and the existing dimensional assertions stay green **unchanged** (the deferral speculated the invariant would need flipping to "row height unchanged"; it does not — the pseudo-overlay is invisible to box metrics, so both the row-height AND the box≤header assertions remain valid).

The sizing token is `--spacing-tap-min` (44px) — utilities `size-tap-min` / `h-tap-min` / `w-tap-min` resolve from the Tailwind v4 `--spacing-*` namespace (existing `min-h-tap-min` / `min-w-tap-min` usages: `ThemeToggle.tsx:132`, `KeyValue.tsx:123`). The exact `before:`-variant utility strings are pinned by the plan's TDD (a real-browser probe fails if a utility does not compile).

### 3.1 Per-affordance geometry

**Cluster change (`CardHeaderActions.tsx:42`): `gap-2` → `gap-4`** (8px → 16px). This widens the horizontal clearance between the two glyphs so a *symmetric* 44px overlay on the trigger clears SourceLink's box (see below). It changes cluster WIDTH only, never header HEIGHT (constraint 2 unaffected — the row is `items-center`, and the affordances keep `h-fit`).

**SourceLink — vertical-only overlay.** SourceLink is **already ≥44px wide** (14px glyph + 4px gap + "In sheet" at `text-xs font-medium` ≈ 58px total; its ≥44px width relies on the constant "In sheet" label — documented guard). It is only too SHORT. Overlay: `relative` host + a `::before` that is full host-width, vertically centered, 44px tall:
`before:absolute before:inset-x-0 before:top-1/2 before:h-tap-min before:-translate-y-1/2 before:content-['']`.
Because the overlay's width equals the host box (`inset-x-0`) and never overflows horizontally, it **cannot** overlap the trigger regardless of gap. Only its 44px height grows the hit area.

**CardReportTrigger — symmetric 44×44 overlay.** 14px in both dimensions → needs full growth both ways. Overlay: `relative` host + a centered 44×44 `::before`:
`before:absolute before:left-1/2 before:top-1/2 before:size-tap-min before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']`.
Symmetric horizontal growth is ±(44−14)/2 = ±15px from the glyph box edges. Its leftward 15px extension lands inside the **16px** gap-4 (15 < 16 → 1px clearance from SourceLink's right box edge) — constraint 3 satisfied. Its rightward 15px extension lands in the header's trailing dead space (the card's `p-tile-pad` = 20px right padding; `SectionCard.tsx:39`) — no card overflow.

### 3.2 Vertical bleed analysis (constraint 4)

Card shell: `flex h-full flex-col gap-3 … p-tile-pad` (`SectionCard.tsx:39`) → **20px** padding above the header, **12px** (`gap-3`) between header and the first body child. Every source-backed crew SectionCard renders the section icon (`size-7` = 28px, `SectionCard.tsx:51`), so the header band is ≥28px.

A 44px-tall overlay centered on a ≥28px band extends ≤8px above the band top and ≤8px below the band bottom:
- **Above:** 8px < 20px `p-tile-pad` → stays in padding, never reaches the card's top edge.
- **Below:** 8px < 12px `gap-3` → stops inside the gap, never reaches the first body row.

Therefore the overlays never overlap an adjacent interactive target on a real crew card. **The dev harness (`app/admin/dev/source-link-dim/page.tsx`) `card-with-actions` MUST render with the production-representative section `icon` + `title`** so its header band is ≥28px and the probe exercises the real geometry (see §5).

---

## 4. Paint-order note (why the overlay wins its own zone but not the body row's)

The `::before` is absolutely positioned, so within the card's stacking context it paints above in-flow body rows. In any zone where it geometrically overlaps a body row it would win `elementFromPoint`. §3.2 proves it never geometrically reaches a body row, so this is moot — but it is WHY constraint 4 must be geometric (dead-space containment), not z-order-based.

---

## 5. Testing — extend `tests/e2e/source-link-dimensional.spec.ts`

The existing suite (real-browser Playwright, `desktop-chromium` project) already:
- asserts each `dim-*` body row keeps its height with/without the SourceLink and with/without the full `CardHeaderActions` (constraint 2) — **unchanged, must stay green**;
- asserts each affordance's border box ≤ header band height (`:176-183`) — **unchanged, must stay green** (pseudo-overlay is invisible to `boundingBox()`).

**Add one new test** — a functional `elementFromPoint` hit-probe (anti-tautology: probes the live compositor's actual hit-testing, not class strings). For the `card-with-actions` harness card:

1. **Hit area reaches ≥44px.** For each affordance, read its glyph center via `getBoundingClientRect()`, then assert `document.elementFromPoint(cx, cy ± 21)` and (for the trigger) `(cx ± 21, cy)` resolve to an element whose `.closest('[data-slot=<slot>]')` is that affordance. 21px < 22px (half of 44) guarantees the point is inside a correctly-sized hit area and fails if the overlay is missing/too small. (SourceLink is probed vertically only; it is already ≥44px wide.)
2. **No sibling overlap (constraint 3).** Assert `elementFromPoint(SourceLink glyph center)` does NOT `.closest('[data-slot=card-report-trigger]')`, and `elementFromPoint(trigger glyph center)` does NOT `.closest('[data-slot=source-link]')`. Assert a probe at each glyph center resolves to its OWN affordance.
3. **No bleed into body rows (constraint 4).** Assert `elementFromPoint(center of the first `dim-*` body row)` resolves to that row (via `.closest('[data-testid=dim-*]')`), NOT to either affordance — proving neither overlay steals the adjacent interactive row's taps.

All coordinates DERIVED from measured rects (anti-hardcode); the only literal is the ±21px probe offset (justified: strictly inside the 22px half-extent of a valid 44px target).

**Harness change:** update `card-with-actions` in `app/admin/dev/source-link-dim/page.tsx` to pass a production-representative `icon` + `title` to its `SectionCard` (§3.2), so the probe exercises the ≥28px band. This is a dev-only harness under the build-gate (route absent in production artifacts) — not a product surface.

---

## 6. Guard conditions

| Input / state | Behavior |
| --- | --- |
| `SourceLink` `href === null` (no source sheet) | Renders nothing (`SourceLink.tsx:43`) — no overlay, unchanged. |
| `CardReportTrigger` `showId` falsy | Renders `null` (`CardReportTrigger.tsx:58`) — no overlay, unchanged. |
| Card without a section icon (title-only band <28px) | Not a real crew source-card shape; §3.2 bleed-guarantee assumes the ≥28px icon band. If such a card ever wires `CardHeaderActions`, the plan's probe on that shape would catch bleed. Out of scope: all current `CardHeaderActions` call sites (`BudgetSection`, `ScheduleSection`, `TodaySection`, …) render the icon. |
| Very long future SourceLink label | Only widens the ≥44px width further — vertical-only overlay still correct. A hypothetical label short enough to drop <44px width would need a width overlay; documented as the label-dependency guard, not in scope (label is the constant "In sheet"). |

---

## 7. Non-goals / out of scope

- No visual restyle of either affordance (color, glyph, label unchanged).
- No change to `ReportModal`, the report surface bundle, or `SourceLink`'s deep-link logic.
- No consolidation of the two affordances into one control (a separate future option the deferral names).
- No DB, no server actions, no advisory locks, no error-code catalog, no email boundaries.

---

## 8. Files touched

| File | Change |
| --- | --- |
| `components/crew/primitives/SourceLink.tsx` | `relative` + vertical-only `::before` 44px overlay. |
| `components/shared/CardReportTrigger.tsx` | `relative` + centered 44×44 `::before` overlay. |
| `components/crew/primitives/CardHeaderActions.tsx` | `gap-2` → `gap-4`. |
| `app/admin/dev/source-link-dim/page.tsx` | `card-with-actions` gets production-representative `icon`+`title`. |
| `tests/e2e/source-link-dimensional.spec.ts` | New `elementFromPoint` hit-probe test (§5). |
| `DEFERRED.md` | Mark CARDREPORT-1 ✅ RESOLVED with the shipped mechanism. |

Invariant-8 impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) runs on the UI diff before cross-model close-out. No new meta-test registry rows (no auth/DB/mutation surface touched).
