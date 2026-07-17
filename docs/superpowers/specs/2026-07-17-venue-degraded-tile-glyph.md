# VCR-4 — Terminal degraded venue map tile: glyph empty-state

**Date:** 2026-07-17
**Status:** spec
**Cluster:** VCR-4 (`DEFERRED.md:398-404`), backlog ref `BL-VENUE-DEGRADED-TILE-LABEL`
**Surface:** `components/admin/wizard/VenueMapTile.tsx` (UI — invariant-8 impeccable dual-gate applies)

---

## 1. Problem

`VenueMapTile` (`components/admin/wizard/VenueMapTile.tsx:22-121`) paints an always-present
stripe base (`:46-54`) plus a `map` mono corner label (`:55-60`) under two distinct conditions
that are **pixel-identical** at the moment shown:

- **Loading / standard tile** — geocodable venue (`query !== ""`). The `<img>` proxy
  (`:69-86`) is still fetching (or, pre-hydration, `theme === null` so no `<img>` yet). The
  stripe + `map` label show **transiently** (~200ms) until the raster loads and covers them.
- **Terminal degraded / link-only tile** — `query === ""` with a valid `mapHref`. There is
  **never** an `<img>` (nothing to geocode — the img is gated on `query !== ""`, `:69`). The
  stripe + `map` label are **permanent**.

Both render the same chrome, so the `map` label reads as "a map is coming" on a tile where no
map will ever arrive. Nothing signals "no preview, ever." (VCR-4, `DEFERRED.md:402`.)

The link-only tile exists because VCR-3 (RESOLVED, merged) changed the parent to mount the map
region on `query || mapHref` (`step3ReviewSections.tsx:991`, pinned by
`venueTransitionAudit.test.ts:66`), so a venue with a Maps link but no geocodable
name/address still shows a (degraded) Directions tile instead of collapsing.

## 2. Change

On the **terminal degraded tile only** (`query === ""`), replace the transient `map` corner
label with a **centered muted map-pin glyph empty-state** (`lucide-react` `MapPin` + a
`no preview` caption). The loading / standard tile (`query !== ""`) is **unchanged** — it keeps
the `map` corner label. The two treatments are mutually exclusive on the `query` value: a plain
conditional render, no state, no motion, no transition. (If a row's venue data is edited live the
`query` value can flip on a mounted tile — see §7; the swap is instant by construction.)

### 2.1 Terminal predicate (exact, render-time)

`query` is derived in the parent as `[name, address].filter(Boolean).join(", ")` over already
`.trim()`-ed fields (`step3ReviewSections.tsx:949-958`), so `query === ""` **iff** both name and
address are empty — no whitespace leak, no ambiguity. The component already branches on this exact
value: the `<img>` is gated `query !== ""` (`:69`) and the defensive guard is `!query && !mapHref`
(`:39`). The new label/glyph split mirrors that existing predicate style:

- `query !== ""` → render the `map` corner label (existing behavior).
- `query === ""` → render the glyph empty-state (new). In this branch `mapHref` is always
  truthy (else the guard `:39` returns `null`, or the parent never mounts the tile), so the
  glyph only ever appears inside the anchor branch (`:104-115`).

### 2.2 Rendered elements (exact)

Corner label (existing `:55-60`), now gated on `query !== ""`, gains a testid for assertability:

```tsx
{query !== "" ? (
  <span
    data-testid="venue-map-label"
    aria-hidden="true"
    className="absolute top-2.5 left-2.5 rounded-sm bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] text-text-subtle"
  >
    map
  </span>
) : null}
```

Glyph empty-state (new), rendered only when `query === ""`:

```tsx
{query === "" ? (
  <span
    data-testid="venue-map-no-preview"
    aria-hidden="true"
    className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 pb-9 text-text-subtle"
  >
    <MapPin aria-hidden="true" className="size-6" />
    <span className="font-mono text-[10px] tracking-wide">no preview</span>
  </span>
) : null}
```

`pb-9` (36px bottom padding) lifts the centered group clear of the Directions button, which sits
inset at `bottom-2.5` with `min-h-tap-min` (`:91-99`); the glyph therefore centers in the visual
space **above** the button, not behind it. Import: add `MapPin` to the existing
`import { Navigation } from "lucide-react"` line (`:4`) → `import { MapPin, Navigation } from "lucide-react"`.

### 2.3 Accessibility

The glyph layer is `aria-hidden="true"`, matching the existing decorative corner label (`:56`)
and Directions span (the anchor is the semantic element). The tile's `<a>` carries
`aria-label="Open the venue in Google Maps (opens in a new tab)"` (`:110`), which already conveys
the actionable meaning to assistive tech. **No new screen-reader-announced element is added** —
the change is purely visual, consistent with the tile's existing decorative-overlay pattern. The
`no preview` caption is decorative text inside the `aria-hidden` group (not an error message, not
a status — invariant 5 is not implicated; it is plain UI copy, no raw error code).

## 3. Contrast (WCAG)

The glyph (icon + caption) uses `text-text-subtle` directly on the stripe base, which alternates
`--color-surface-sunken` and `--color-surface` bands (`:50-53`). No backing chip is used (unlike
the corner label's `bg-surface/85`), so contrast must hold on the **darker** stripe band
(`--color-surface-sunken`) in both themes. Caption is small text (10px) → body threshold **4.5:1**;
the `MapPin` icon is a graphical object → **3:1** (WCAG 1.4.11). Token values from
`app/globals.css:267-276` (light) / `:317-326` (dark):

| Theme | `text-subtle` | Darkest stripe band (`surface-sunken`) | Ratio | Caption ≥4.5 | Icon ≥3 |
| ----- | ------------- | -------------------------------------- | ----- | ------------ | ------- |
| Light | `#5a5b62`     | `#f4f3f1`                              | 6.09:1 | ✓            | ✓       |
| Light | `#5a5b62`     | `#ffffff` (lighter band)               | 6.76:1 | ✓            | ✓       |
| Dark  | `#9c9a93`     | `#0b0c10`                              | 6.94:1 | ✓            | ✓       |
| Dark  | `#9c9a93`     | `#16171c` (lighter band)               | 6.36:1 | ✓            | ✓       |

All four cells clear the body threshold with margin (worst case 6.09:1 vs the 4.5:1 requirement). No opacity reduction is applied (which would erode the ratio); the muted
read comes from the `text-subtle` token itself. Ratios to be re-verified at implementation with the
project's luminance check and the impeccable real-browser render.

## 4. Guard conditions (every input)

| `query` | `mapHref` | Branch | Corner `map` label | Glyph empty-state | `<img>` | Directions |
| ------- | --------- | ------ | ------------------ | ----------------- | ------- | ---------- |
| `""` | valid URL | anchor (`:104`) | — | **✓ (new)** | — | ✓ |
| `""` | `null` | — | guard `:39` returns `null` (unchanged) | | | |
| non-empty | valid URL | anchor | ✓ | — | ✓ (post-hydration) | ✓ |
| non-empty | `null` | div (`:116`) | ✓ | — | ✓ | — |

Whitespace-only `query` is impossible (§2.1 — parent trims + `filter(Boolean)`); pre-existing
behavior, out of scope. `theme === null` (SSR / first client render) only suppresses the `<img>`
(`:69`), never the corner label or glyph, so the terminal glyph paints at first paint (no
hydration mismatch — server and first client render agree, both `query === ""`).

## 5. Mode boundaries

- **Standard tile** (`query !== ""`): stripe base + `map` corner label + (`<img>` once theme
  resolves) + (Directions if `mapHref`). Unchanged by this spec.
- **Terminal degraded tile** (`query === ""`, always `mapHref` truthy): stripe base + glyph
  empty-state + Directions. The corner `map` label and the `<img>` are both absent.

The stripe base (`venue-map-fallback`, `:47`) and the Directions span (`venue-directions`,
`:93`) are **shared** across both modes and unchanged.

## 6. Dimensional invariants

The glyph layer is `absolute inset-0` — a self-contained overlay, exactly like the existing
stripe (`:49`), corner label (`:57`), `<img>` (`:84`), and Directions (`:94`) layers. It adds
**no** parent→child stretch dependency to the fixed-height map region
(`h-40 sm:h-auto self-stretch`, `step3ReviewSections.tsx:994`; DI-1,
`2026-07-06-venue-card-redesign-design.md:186`). Internal centering uses
`flex flex-col items-center justify-center` on the absolutely-positioned overlay itself, whose box
is `inset-0` (fills the region) — no reliance on Tailwind v4 default `align-items`. No layout-
dimensions Playwright task is required (no new fixed-parent→flex-child height contract; the region
geometry is unchanged and already covered by `tests/e2e/step3-review-modal.layout.spec.ts`).

## 7. Transition inventory (spec §8 parity — all instant)

| State pair | Treatment |
| ---------- | --------- |
| stripe ↔ glyph (terminal mount) | **Instant** — both static layers, no animation. |
| corner-label ↔ glyph | **Instant by construction.** A live swap *is* possible: `VenueMapTile` has no local remount `key` (it renders under `ShowReviewSurface`'s stable `key={s.id}`, `ShowReviewSurface.tsx:797-843`, via the section registry `step3ReviewSections.tsx:3523`), so editing a row's venue data while the modal stays mounted could flip `query` `"" ↔ non-empty` on the same tile. That swap is a plain conditional render between two static layers — no `AnimatePresence`, no `transition-*`, no opacity/transform — so it is instant, exactly what `venueTransitionAudit.test.ts:35-50` pins. |
| map-image ↔ fallback | **Instant** (unchanged; `2026-07-06-venue-card-redesign-design.md:207`). |

No `AnimatePresence`, `exit`, `initial`, or `transition-*` class is introduced. Pinned by
`venueTransitionAudit.test.ts:35,50` (tile scanned for no-motion) — the glyph is a static
`<span>`/`<svg>`, so those assertions stay green (verified at implementation per fix-round
regression budget).

## 8. Files

- **Modify:** `components/admin/wizard/VenueMapTile.tsx` — add `MapPin` import (`:4`); gate the
  corner label on `query !== ""` (+ `venue-map-label` testid); add the `query === ""` glyph
  empty-state layer.
- **Test:** `tests/components/admin/wizard/venueMapTile.test.tsx` — new/extended cases (§9).
- **Docs:** `DEFERRED.md` VCR-4 → RESOLVED; `docs/superpowers/specs/2026-07-06-venue-card-redesign-design.md`
  §7 (Fallback tile label, `:222`) gets a one-line VCR-4 divergence note (the terminal tile
  diverges from the ratified `map` label — the standard tile keeps it). No BACKLOG change
  (`BL-VENUE-DEGRADED-TILE-LABEL` is an aspirational ref in `DEFERRED.md:404`, never filed —
  grep-verify at implementation; if genuinely absent, close directly in DEFERRED with a note, do
  not invent a BACKLOG row).

## 9. Tests (anti-tautology)

Each case scopes its assertion to the tile's **own** rendered nodes (not a container that renders
both states), deriving presence/absence from the `query`/`mapHref` inputs:

1. **Terminal (`query="" mapHref` valid) → glyph present, corner label absent, no img.**
   `venue-map-no-preview` present; `venue-map-label` **absent**; `venue-map-img` absent;
   `venue-map-fallback` + `venue-directions` present (extends the existing VCR-3 case,
   `venueMapTile.test.tsx:13-21`). *Catches:* glyph missing on terminal; stale `map` label leaking
   onto the terminal tile; regression collapsing the tile.
2. **Standard (`query="X" mapHref` valid) → corner label present, glyph absent.**
   `venue-map-label` present; `venue-map-no-preview` **absent**; `venue-map-img` present.
   *Catches:* the glyph bleeding onto the loading/standard tile; corner label dropped on the
   standard tile (would regress the ratified `map` label).
3. **`no preview` caption text asserted on the terminal glyph node only** (query the
   `venue-map-no-preview` subtree, not the whole container). *Catches:* empty/placeholder glyph
   with no caption.
4. **Guard unchanged** (`query="" mapHref=null` → `null`) — existing case
   (`venueMapTile.test.tsx:23-26`) stays green.
5. **Transition audit** (`venueTransitionAudit.test.ts`) re-run: no-motion assertions stay green
   with the glyph added (no new test needed; verified as a regression check).

## 10. Meta-test inventory

- **CREATE:** none.
- **EXTEND:** none structurally required. `venueTransitionAudit.test.ts` is the relevant existing
  structural guard (no-motion in the tile); the glyph adds no motion, so it stays green — verified,
  not extended.
- `_metaBgAccentInventory.test.ts`: **N/A** — no `bg-accent` token is added (the glyph uses
  `text-text-subtle`).
- No new admin route / table / RPC / advisory-lock surface → the auth/mutation/DML/observability
  meta-tests are **N/A** (invariants 2, 9, 10 not implicated; no server code touched).

## 11. Plan-wide invariant checklist

| # | Invariant | Status |
| - | --------- | ------ |
| 1 | TDD per task | ✓ — failing test → glyph impl → pass → commit. |
| 2 | Per-show advisory lock | N/A — no DB/mutation path. |
| 3 | Email canonicalization | N/A. |
| 4 | No global sync cursor | N/A. |
| 5 | No raw error codes in UI | ✓ — `no preview` is plain copy, not an error code; no message-catalog lookup needed (decorative caption). |
| 6 | Commit per task | ✓ — `feat(admin):` / `test(admin):`. |
| 7 | Spec canonical | ✓ — §8 records the one ratified-label divergence (VCR-4-sanctioned) as a spec note. |
| 8 | UI impeccable dual-gate | ✓ — critique + audit on the diff before whole-diff review (Task 2). |
| 9 | Supabase call-boundary | N/A — no client call. |
| 10 | Mutation-surface telemetry | N/A — no mutation surface. |

## 12. Disagreement-loop preempts (for the reviewer)

**EXPLICITLY DO NOT RELITIGATE:**

1. **"The `map` label is ratified (spec §3.2, `2026-07-06-venue-card-redesign-design.md:222`) —
   don't touch it."** VCR-4's own deferral trigger sanctions this exact change: *"a design decision
   to distinguish loading vs terminal-degraded map states (e.g. terminal label copy, or a distinct
   degraded treatment)"* (`DEFERRED.md:404`). The **standard/loading tile keeps `map`**; only the
   **terminal link-only tile** (`query === ""`) diverges. The divergence is the point of VCR-4.
2. **"Adds a branch to the deliberately-simple always-painted layer" (`DEFERRED.md:403`).** The
   branch is exactly what VCR-4 authorizes. It is a render-fixed conditional (no state, no motion,
   no effect); corner label and glyph are mutually exclusive on `query === ""`.
3. **"Over-designed for a P3 near-zero-trigger edge; label copy would be lighter."** The glyph
   (vs the lighter label-copy option) is the user's explicit, ratified choice after reviewing a
   visual mockup of both mechanisms. Not a defect to relitigate.
4. **"Caption contrast on the bare stripe."** Pre-computed both themes, both stripe bands, §3 —
   all clear the body 4.5:1 threshold (worst case ~6.3:1); re-verified at the impeccable gate.
5. **"a11y: the glyph should be announced."** Deliberately `aria-hidden` — the anchor's
   `aria-label` (`:110`) carries the meaning; the glyph mirrors the existing decorative corner
   label / Directions span. Adding an SR-announced element would duplicate the anchor label.

## 13. Numeric sweep

- Icon size: `size-6` (24px) — single literal, glyph icon only.
- Caption: `text-[10px]` — matches the existing corner label size (`:57`), single literal.
- Glyph bottom padding: `pb-9` (36px) — clears the Directions button (`min-h-tap-min` ≈ 44px inset
  at `bottom-2.5` ≈ 10px). Single literal.
- Terminal predicate literal: `query === ""` / `query !== ""` — mirrors existing `:69` (`query !== ""`).
- No other numeric literals introduced.
