# Shape brief — Crew-page IA redesign (Cluster C1)

**Date:** 2026-05-14
**Cluster:** C1
**Items:** M4-D2 (tile reorder), M4-D3 (header weight), M4-D6 (viewport bug), M4-D4 (test-attribute relocation)
**Implementer:** Opus / Claude Code (per AGENTS.md UI-always-Opus rule)
**Status:** Awaiting confirmation

---

## 1. Feature Summary

Restructure the crew-page (`/show/[slug]`) information architecture so a crew member walking onto a venue floor finds their answer ("what's my call time, what room") in the first vertical sweep. Two coordinated moves: a phase-aware **TODAY** band above the general tile grid that pins the next-action tiles, and a **shrunken page header** that surrenders the page's primary visual moment to the RightNowCard.

## 2. Primary User Action

Within ~5 seconds of opening `/show/[slug]`, the crew member should already have their eyes on (a) the RightNowCard hero, (b) the TODAY band's Schedule tile, and — on set/strike/travel days — (c) the second TODAY tile (PackList or Transport). The header has retreated to context; the eye doesn't compete with it.

## 3. Design Direction

- **Color strategy:** Restrained (no change). Orange remains ≤10% of viewport. The header's orange hairline is **removed** (it was fighting the RightNowCard's accent for the eye).
- **Theme scene sentence:** Crew member, walking from the loading dock toward a ballroom at 6:42am with a coffee in their off-hand, glancing once at their phone to confirm where they're standing in 18 minutes. Forces light-mode-first design, but dark mode equally first-class per DESIGN.md.
- **Anchor references:**
  - Magazine table-of-contents (small eyebrow labels above content bands — "TODAY", later potentially "LOGISTICS" / "REFERENCE").
  - Apple's Mail.app inbox-priority headers (lightweight section eyebrows, never bordered).
  - Strava activity card top-strip (compact metadata head, oversized actionable body below).
- **Anti-references:** Notion's "Today" page (too much chrome / too many cards stacked). Gmail's filtered inbox (too quiet, no spatial moment).

## 4. Scope

- **Fidelity:** Production-ready.
- **Breadth:** Two surfaces — `app/show/[slug]/page.tsx` tile mounts (M4-D2) + `components/layout/Header.tsx` (M4-D3). Plus mechanical fixes for the spec file (M4-D6 viewport test) and `components/right-now/RightNowCard.tsx` (M4-D4 test-attribute move).
- **Interactivity:** No new interactive surfaces. Phase-derivation runs server-side at the existing currentPhase call site.
- **Time intent:** Polish-until-it-ships. C1 is the IA foundation for the rest of M9; downstream work depends on the order being final.

## 5. Layout Strategy

### 5.1 New page-vertical structure

```
┌─────────────────────────────────────┐
│  PAGE HEADER (shrunken context)     │  ← M4-D3 — text-xs eyebrow + text-base
│  FXAV CLIENT · Spring Tour          │     title + date · venue inline,
│  April 17, 2026 · Hilton Anatole    │     no orange hairline
├─────────────────────────────────────┤
│                                     │
│  [ RIGHT NOW CARD — hero, padded ]  │  ← page's primary moment, unchanged
│                                     │
├─────────────────────────────────────┤
│  TODAY                              │  ← M4-D2 — text-xs uppercase
│  ┌────────┐ ┌────────┐              │     tracking-eyebrow text-text-subtle
│  │Schedule│ │PackList│              │     (phase-derived 2nd tile)
│  └────────┘ └────────┘              │
├─────────────────────────────────────┤
│  Lodging   Venue     Transport      │  ← M4-D2 — Logistics-first flat grid
│  Crew      Contacts  ShowStatus     │     reorder (see §5.3 for full order)
│  Diagrams  Opening   Audio          │
│  Video     Lighting  PackList*      │     *PackList stays in flat grid even
│  Financials Notes                   │      when Today-promoted (reference,
│                                     │      not remount).
└─────────────────────────────────────┘
│  FOOTER                             │
```

### 5.2 Header rebalance (M4-D3)

- Eyebrow `client_label`: `text-xs uppercase tracking-eyebrow text-text-faint` (unchanged).
- Title `show.title`: `text-base font-semibold text-text-strong sm:text-lg` (was `text-2xl sm:text-3xl font-bold`). Drops one major step on the modular scale.
- Date · venue line: `text-xs text-text-subtle` (was `text-sm`). Compresses metadata into one line on mobile via inline · separator.
- **Removed:** the 1px orange hairline at the band bottom (`border-b-accent`). The page header is context-chrome; the hairline was a brand moment that the RightNowCard already owns.
- FXAV right-side wordmark: kept at `text-xs tracking-eyebrow-strong text-text-faint` (one tone down from `text-text-subtle`). It's a badge, not a logo.
- Vertical padding: tighter — `py-3 sm:py-4` (was `pb-5 pt-7 sm:pb-6 sm:pt-9`). The header reads as a strip.

### 5.3 Today band (M4-D2)

- **Position:** Between RightNowCard and the flat tile grid.
- **Heading:** `<h2 class="text-xs uppercase tracking-eyebrow text-text-subtle">TODAY</h2>`. Same eyebrow voice as KeyValue dt and Section heading — no new visual atom.
- **Phase-aware tile rule** (derived from spec §8.2's `currentPhase`):
  | Phase | Today tiles |
  |---|---|
  | `pre_travel` (before travel-in date) | Schedule only |
  | `travel_in_day` / `travel_out_day` | Schedule + Transport |
  | `set_day` / `strike_day` | Schedule + PackList |
  | `show_day` | Schedule only |
  | `unknown` (no dates parsed) | Schedule only |
- **Layout:** 1-col on mobile (each Today tile full-width), 2-col on `sm:` and up. Today tiles use the same `WrappedTile` shell — they get the regular `--spacing-tile-pad` / `--shadow-tile` treatment, NOT visual promotion via accent border. Promotion is positional, not chromatic.
- **PackList in flat grid:** PackList stays mounted in its persona-urgency flat-grid position (12th) even when Today-promoted. The promoted instance is the same component instance — not a duplicate render. If we cannot achieve "same instance, two positions" cleanly, the fallback is to skip the flat-grid PackList on set/strike days and keep it only in Today. The brief authorizes either implementation as long as the user-facing result is: PackList visible exactly once when promoted, exactly once when not.

### 5.4 Flat grid order — Logistics-first (M4-D2)

Final order (after Today band):
```
1.  Lodging
2.  Venue
3.  Transport
4.  Crew
5.  Contacts
6.  ShowStatus
7.  Diagrams
8.  OpeningReel
9.  Audio
10. Video
11. Lighting
12. PackList
13. Financials
14. Notes
```

Schedule (#5 in current order) is removed from the flat grid — it lives in Today.

### 5.5 Dimensional invariants

| Parent → Child relationship | Guarantee class |
|---|---|
| Today band 2-col flex/grid → each Today tile fills row height | `items-stretch` on the band, `h-full` on each `WrappedTile`. Per DESIGN.md §7, Tailwind v4 does not default `.flex` to `align-items: stretch` — must be explicit. |
| Flat grid → each tile fills its grid cell | Same `items-stretch` + `h-full` contract as existing implementation. |
| Header band → eyebrow + title + meta line stack | Block flow; no fixed-height parent. No new invariant. |

A real-browser Playwright assertion will verify the Today band's tiles stretch to equal height across the breakpoint range, mirroring the existing tile-grid test pattern.

## 6. Key States

| State | What renders |
|---|---|
| Default (all tiles loaded) | Header strip → RightNowCard → TODAY band (Schedule + phase 2nd) → flat grid |
| LodgingTile null (whole-tile-missing) | Lodging slot omits from flat grid; rest unchanged. Existing behavior preserved. |
| Transport not visible (`transportTileVisible === false`) | Transport slot omits from flat grid AND from Today band on travel days. Today band on travel day with no Transport: Schedule only. |
| `unknown` phase (no dates) | Today band shows Schedule only. |
| Set/strike day with no PackList data | Today band shows Schedule only (PackList is hidden from Today when no pack data, even though pack-list-tile mounts in flat grid with an empty state). The Today band promotes actionability, not presence. |
| Empty state on any flat-grid tile | Existing per-tile empty state (§8.3 catalog) renders unchanged. |
| Tile error (one tile) | Existing `TileErrorBoundary` fallback renders unchanged. |
| Page header on a show with no `client_label` | Title carries alone; eyebrow row omits. |

## 7. Interaction Model

- **No new interactions.** All tiles retain existing click/expand/disclose affordances.
- **Phase-derivation timing:** runs once at server-render. No client-side recompute, no hydration mismatch (phase derives from the same `currentPhase` the RightNowCard already consumes).
- **Test-attribute relocation (M4-D4):** `data-state` / `data-rendered-state` / `data-treatment` move from the screen-reader-traversed `<p>` to a sibling `<span data-testid="right-now-debug" hidden>` outside the AT tree. The hidden span carries all three attributes. E2E tests update their selectors in the same commit.

## 8. Content Requirements

- **"TODAY" eyebrow:** literal string `TODAY`. English-only; no i18n stake in v1.
- **No new error messages, no new empty-state copy.** This is a structural reorder, not a content change.
- **Header copy:** unchanged strings; only typographic scale changes.

## 9. Recommended References

- DESIGN.md §2.6 — eyebrow tracking tokens (Today band's eyebrow MUST consume `tracking-eyebrow`, never a new arbitrary value).
- DESIGN.md §7 — Tailwind v4 flex/items-stretch contract.
- Spec §8.2 — `currentPhase` derivation (the source of truth for Today band's phase-aware logic).
- Spec §8.4 — tile grid dimensional invariants (2/3/4-col breakpoints stay intact).
- Memory `feedback_tailwind_v4_flex_items_stretch.md`.

## 10. Open Questions

1. **Same-instance dual-position for PackList** — does React's reconciler allow a `WrappedTile` to mount in two parent positions without a remount cost? If implementation discovers this is messy, fall back to "Today position only on set/strike days; flat-grid position on other days." User authorized either resolution.
2. **`role` on the TODAY heading** — leave as `<h2>` (semantic) or change to `<p>` with `aria-label`? Defer to implementation; H2 is the cleaner default but introduces a new heading level in the page outline. If the page already uses `<h2>` elsewhere (Section headings), H2 is the right choice.

## 11. Anti-goals

- **Today band must not get its own visual chrome.** No bordered card around it, no orange tint, no shadow upgrade. Promotion is positional.
- **Header must not become invisible.** Eyebrow + title + date · venue must remain readable at AAA contrast; we're shrinking weight, not destroying it.
- **Tile reorder must not break any e2e test by tile-position assertion.** Tests that read tile order receive the new canonical order in the same commit.
- **No new tokens introduced.** All sizes, colors, and spacings consume existing tokens from `app/globals.css` `@theme`.

## 12. Definition of done

- `app/show/[slug]/page.tsx` mounts tiles in: TODAY band (Schedule + phase 2nd) → flat grid in Logistics-first order.
- `components/layout/Header.tsx` shrinks per §5.2; orange hairline removed.
- `components/right-now/RightNowCard.tsx` data-* attributes moved to hidden sibling span; affected e2e tests updated in the same commit.
- `tests/e2e/crew-page.spec.ts:118` either gets `await page.setViewportSize({ width: 390, height: 667 })` at the top OR `testMatch` is scoped to `mobile-safari` (M4-D6).
- New Playwright assertion verifies Today-band tile-stretch invariant.
- All existing e2e tests pass against the new order (tests updated where they assert tile position).
- `pnpm typecheck` + `pnpm lint` clean.
- `/impeccable critique` + `/impeccable audit` dual gate pass on the C1 diff.
- Codex adversarial review converges to APPROVE.
