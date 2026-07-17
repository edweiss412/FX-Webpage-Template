# RightNowHero show-day progress segment — restore brand vibrancy (ACCENT-PASS-1)

**Date:** 2026-07-17
**Status:** spec (autonomous-ship pipeline; both user-review gates WAIVED per AGENTS.md autonomous-ship gate)
**Deferral source:** `DEFERRED.md` → `ACCENT-PASS-1` (P2, deferred from the 2026-07-16 accent-contrast token pass). Backlog: `BL-HERO-SEGMENT-VIBRANCY`.

---

## Resolved decisions (single source of truth for shared values)

- **New active-segment class:** `border border-accent-edge bg-accent` (replaces `bg-accent-on-bg`). Inactive segment unchanged (`bg-border`).
- **Token pairing is already ratified.** `border-accent-edge bg-accent` is the exact recipe DESIGN.md §1.2 blesses as the "ON-state control boundary (toggle track border, active step pill)" and that the 2026-07-16 accent-contrast pass applied to all 5 toggles + the wizard active step pill (spec §4.1b class **B**, "Stateful fill — TREATED"). This spec extends that same treatment to one more surface; it introduces **no new token**.
- **The vibrant fill is `#ff8c1a` (`--color-accent`), identical in both themes.** The load-bearing 3:1 boundary is carried by the **edge**, not the fill.
- **Scope is exactly one surface.** ONLY `RightNowHero.tsx` show-day progress segments change. The `BellPanel.tsx` unread pip (the other §4.1b **B4** darkened surface) stays `bg-accent-on-bg` — see §9.
- **Contrast authority:** the ratified DESIGN.md §1.2 numbers are canonical (accent-edge = 3.61:1 vs the orange track, 8.06:1 vs bg light; dark track 8.16:1 vs bg). This spec does not re-derive them; it cites them.

---

## 1. Problem / current state

`components/crew/RightNowHero.tsx:544-563` renders the show-day progress bar: N `h-1.5 flex-1 rounded-pill` segments inside a `role="img"` "Show day N of M" indicator (`:537-543`). The first `progressActive` segments are "filled":

```tsx
active ? "bg-accent-on-bg" : "bg-border",   // :559
```

The 2026-07-16 accent-contrast pass changed the active fill `bg-accent` → `bg-accent-on-bg` (`#a65000` light) because raw `#ff8c1a` is **2.23:1 vs bg** and **1.83:1 vs the inactive `bg-border` segments** (`#e5e4e0`) — both below the WCAG 1.4.11 3:1 floor for a load-bearing graphical object (accent-contrast spec §4.1b, class **B4**; `docs/superpowers/specs/2026-07-16-accent-contrast-token-pass.md:110`). (The B4 row's `1.46:1` figure is raw accent vs `border-strong` `#cfcdc7`, a different token than the segment's actual `bg-border` inactive — the failing-premise holds under either.)

The darkened fill clears contrast but is muted. This is the **one surface PRODUCT.md reserves for expressive orange** (the crew's "you are here in the run" glance, read on a sunlit venue floor). Critique P2 flagged the loss of brand vibrancy; the fix was deferred as `ACCENT-PASS-1` because restoring `#ff8c1a` needs its own contrast math + a registry/treatment change + a brand judgment (not a token swap). Deferral trigger: "a crew-page brand/vibrancy pass." This spec is that pass.

## 2. The change

Active segment fill returns to vibrant `#ff8c1a` (`bg-accent`); a 1px `border-accent-edge` stroke supplies the 1.4.11 boundary:

```tsx
active ? "border border-accent-edge bg-accent" : "bg-border",
```

This is the identical recipe already carried by every ON-state toggle (`components/admin/PublishedToggle.tsx`, `AutoPublishToggle.tsx`, `DeveloperToggleButton.tsx`, `NotifyToggle.tsx`, `AutoRefreshControl.tsx`) and the `OnboardingWizard.tsx` active step pill. The edge is what clears 3:1; the fill is freed to full chroma.

Inactive segments (`bg-border`) are **unchanged** — they were never the sub-contrast surface (the ratified requirement was on the ACTIVE fill: 3:1 vs bg AND 3:1 vs inactive).

**Box model:** Tailwind default `box-sizing: border-box`, so the 1px border is drawn INSIDE the 6px (`h-1.5`) pill and the `flex-1` width — no layout shift, no change to the `flex items-stretch gap-1.5` row geometry. `rounded-pill` applies to the border edge.

## 3. Contrast tables (WCAG 1.4.11, ≥3:1 for graphical objects)

The load-bearing graphical information is **which segments are filled**. Each segment sits on the hero surface with a `gap-1.5` (6px) surface gutter between segments (`RightNowHero.tsx:542`) — so under WCAG 1.4.11 the required adjacency is **each active segment's boundary vs the surface behind it**, NOT active-fill vs inactive-fill (those are not adjacent colors — surface separates them). The boundary is the `border-accent-edge` stroke.

**Surface caveat — the segment can render on `bg-stale-tint`, not only `bg-surface`.** Progress normally renders on `bg-surface` (`#ffffff` light / `#16171c` dark). But during a `morph-to-last-good` transition the hero holds the last-good `show_day_n` body — progress bar included — while `isStale` paints the section `bg-stale-tint` (`#f4ece0` / `#26221b`): `showProgress` gates on `!isHeroDegraded(renderState.kind)` (`RightNowHero.tsx:440`), which stays false while `surfaceClass` is `bg-stale-tint` (`:431,:432`) during the stale morph (`:410`). So the edge must clear 3:1 on BOTH surfaces; the tables cover both.

### Light mode (edge `#7a3d00`, fill `#ff8c1a`)

| Required adjacency | Pair | Ratio | Floor | Pass |
|---|---|---|---|---|
| Edge vs `bg-surface` (segment boundary perceivable) | `#7a3d00` / `#ffffff` | **8.42:1** (8.06:1 vs `#fafaf9`, DESIGN.md:35) | 3.0 | ✅ |
| Edge vs `bg-stale-tint` (morph-to-last-good path) | `#7a3d00` / `#f4ece0` | **7.18:1** | 3.0 | ✅ |
| Edge vs its own orange fill (edge readable on the fill) | `#7a3d00` / `#ff8c1a` | **3.61:1** (DESIGN.md:35,62) | 3.0 | ✅ |

Each active segment is a bounded object whose edge clears 3:1 against whichever surface it renders on — so "which segments are filled" clears 3:1 by the edge alone, independent of the fill's 2.23:1-vs-surface. The vibrant `#ff8c1a` fill carries no contrast burden.

### Dark mode (edge `#ffa047`, fill `#ff8c1a`)

| Required adjacency | Pair | Ratio | Floor | Pass |
|---|---|---|---|---|
| Edge vs `bg-surface` | `#ffa047` / `#16171c` | **8.84:1** (8.16:1 vs `#0f1014`, DESIGN.md:35) | 3.0 | ✅ |
| Edge vs `bg-stale-tint` (morph path) | `#ffa047` / `#26221b` | **7.82:1** | 3.0 | ✅ |
| Active fill vs `bg-surface` (fill itself already clears) | `#ff8c1a` / `#16171c` | **7.69:1** | 3.0 | ✅ |
| Active fill vs `bg-stale-tint` | `#ff8c1a` / `#26221b` | **6.80:1** | 3.0 | ✅ |

In dark mode the vibrant fill itself already clears 3:1 on every surface (dark `#ff8c1a` was never the sub-contrast case — only light was). The dark edge `#ffa047` is decorative-consistency with the toggles (DESIGN.md §1.2 documents the dark edge as decorative: "the track itself is the boundary"). No dark regression.

### Inactive "track" segments — unchanged, sub-3:1 by ratified design (not introduced here)

Inactive (unfilled) segments stay `bg-border` (`#e5e4e0` / `#2a2b30`) — the empty-track ground. Their own contrast vs the surface is low by design (light `#e5e4e0` = 1.27:1 vs `#ffffff`, 1.09:1 vs `#f4ece0`) and is the **pre-existing ratified contract** carried unchanged from the 2026-07-16 accent-contrast pass, which kept inactive = `bg-border` (`RightNowHero.tsx:559`, accent-contrast spec §4.1b B4). This spec does NOT touch the track and introduces NO new sub-3:1 relation. An unfilled slot conveying "not yet done" is the absence-of-fill ground, not a graphical object that must carry a 3:1 boundary; all load-bearing information (which slots ARE filled) is carried entirely by the 3:1-edge-bounded active segments. (Earlier draft mis-labeled an "edge vs inactive across the 6px gap" row as a required adjacency — corrected: it is not a direct 1.4.11 adjacency.)

## 4. Dimensional invariants / real-browser assertion — DEFERRED-AS-N/A

The active segment's dimensions are CSS literals: `h-1.5` (6px), `flex-1`, `rounded-pill`, `border` (1px). The parent is `flex items-stretch gap-1.5`. **There is no fixed-height-parent → flex-child stretch dependency that the border could break** (border-box absorbs the 1px inside the existing 6px/`flex-1` box; the row height is content-driven by `h-1.5`, not a fixed parent that children must stretch to fill). Per the project layout-dimensions rule, a real-browser `getBoundingClientRect` parity assertion is only mandatory for fixed-dimension parents with stretch-dependent children — not present here.

The one genuinely visual question (does a 1px stroke on a 6px pill read as a crisp hairline vs a heavy frame) is a **screenshot** judgment, not a dimensional invariant — it is covered by the invariant-8 impeccable dual-gate real-browser critique/audit on the diff, not by a jsdom or Playwright dimension test. Formal deferral row lands in `DEFERRED.md` as `HERO-VIBRANCY-DIM-1` (mirrors `KINDDOT-DIM-1`).

## 5. Files touched

| File | Change |
|---|---|
| `components/crew/RightNowHero.tsx` | `:559` active-segment class `bg-accent-on-bg` → `border border-accent-edge bg-accent`; update the load-bearing comment at `:556-558`. |
| `tests/components/crew/rightNowHero.test.tsx` | `:489-496` flip the class assertion (§6.1). |
| `tests/styles/_metaBgAccentInventory.test.ts` | add one `edge-treated` row for the new `bg-accent` occurrence (§6.2). |
| `DESIGN.md` | §1.2 accent-edge row: add "active show-day progress segment" to the boundary-consumer list (§6.3). |
| `DEFERRED.md` | `ACCENT-PASS-1` → ✅ RESOLVED; add `HERO-VIBRANCY-DIM-1` DEFERRED-AS-N/A row. |
| `BACKLOG.md` | `BL-HERO-SEGMENT-VIBRANCY` → ✅ RESOLVED. |

## 6. Tests

### 6.1 `tests/components/crew/rightNowHero.test.tsx` (existing test, `:489-496`)

The active-segment class assertion lives in the `mount in show_day_1 … re-derives to show_day_2` test (`rightNowHero.test.tsx:478`, assertion block `:488-496`), which currently asserts the active segment carries `bg-accent-on-bg` and NOT `bg-accent`. Flip both, and add an edge assertion. Anti-tautology: assert on the `[data-segment-active="true"]` node's own class token set (not a container).

```tsx
// progress lives in a role="img" indicator — NOT decorative. The ACTIVE segment
// carries the vibrant bg-accent fill; its WCAG 1.4.11 3:1 boundary is the
// border-accent-edge stroke (DESIGN.md §1.2: 8.06:1 vs bg, 3.61:1 vs the fill).
const activeSeg = progress(container)?.querySelector('[data-segment-active="true"]');
expect(activeSeg, "active segment not rendered").toBeTruthy();
const segTokens = new Set((activeSeg!.getAttribute("class") ?? "").split(/\s+/));
expect(segTokens.has("bg-accent")).toBe(true);
expect(segTokens.has("border-accent-edge")).toBe(true);
expect(segTokens.has("border")).toBe(true);
expect(segTokens.has("bg-accent-on-bg")).toBe(false);
```

Concrete failure mode caught: a future edit that drops the edge (regressing to a raw-accent 2.23:1 fill with no boundary) or reverts to the darkened fill.

### 6.2 `tests/styles/_metaBgAccentInventory.test.ts` (extend the registry)

Adding `bg-accent` to the active segment creates a SECOND exact-token `bg-accent` occurrence in `RightNowHero.tsx`. Occurrence 0 is the live-dot (`:498`, already registered `decorative`); the new active-segment occurrence is index **1**, in source line order after the live-dot. Add:

```ts
E("components/crew/RightNowHero.tsx", 1),
```

The `E(...)` helper's context string is `"border-accent-edge bg-accent"`; the active-segment source line (`active ? "border border-accent-edge bg-accent" : "bg-border",`) contains that substring, and the `edge-treated` disposition's `border-accent-edge` guard is satisfied. The existing `D("components/crew/RightNowHero.tsx", 0)` row (live-dot) is unchanged. The fails-by-default walker would otherwise flag the new occurrence as `UNREGISTERED`.

### 6.3 `DESIGN.md` §1.2

Append "active show-day progress segment" to the accent-edge row's consumer list ("toggle track border, active step pill, active show-day progress segment"). No numeric change (same pairing, same ratios).

## 7. Meta-test inventory

- **EXTENDS** `tests/styles/_metaBgAccentInventory.test.ts` (one `edge-treated` row). No new meta-test. No advisory-lock, admin-alert, sentinel-hiding, or email-canonicalization surface touched.
- No `pg_advisory*` surface, no DB, no telemetry/mutation surface (pure presentational className change) → invariants 2, 3, 9, 10 N/A.

## 8. Invariant checklist

- **1 (TDD):** §6.1 test flips first (RED — current code has `bg-accent-on-bg`), then the `RightNowHero.tsx` edit makes it GREEN. §6.2 registry row added alongside the impl (the walker fails RED without it).
- **5 (no raw error codes in UI):** N/A (no copy).
- **8 (impeccable dual-gate):** UI surface (`components/**` + `DESIGN.md`) → `/impeccable critique` + `/impeccable audit` on the diff before whole-diff review; P0/P1/P2 fixed or DEFERRED. Results recorded in the plan §12.

## 9. Disagreement-loop preempts (EXPLICITLY DO NOT RELITIGATE)

- **The darkened `bg-accent-on-bg` was ratified in the 2026-07-16 accent-contrast pass — this spec does NOT regress that decision.** ACCENT-PASS-1 was filed AT THAT TIME as the explicit, deferred follow-up (`DEFERRED.md` ACCENT-PASS-1, trigger "a crew-page brand/vibrancy pass"). Restoring vibrancy via the edge treatment is the planned resolution, not a reversal. Cite: `docs/superpowers/specs/2026-07-16-accent-contrast-token-pass.md:110`.
- **The `BellPanel.tsx` unread pip stays `bg-accent-on-bg` — out of scope, by design.** The pip is an 8×8 dot with a `ring-surface` halo; a 1px edge on an 8px dot is visual noise, and the pip is not the brand-glance surface ACCENT-PASS-1 names. The two §4.1b **B4** surfaces are being dispositioned differently ON PURPOSE. Do not expand scope to the pip.
- **The edge, not the fill, carries 1.4.11.** A reviewer measuring the raw `#ff8c1a` fill at 2.23:1 vs bg and calling it a violation is measuring the wrong pair — the segments have a 6px `gap-1.5` white gutter between them, so each segment's adjacency is the surface, and the 8.06:1 edge is the boundary (identical logic to the ratified toggle treatment). §3 tables.
- **No real-browser dimension test — DEFERRED-AS-N/A (§4).** Border-box absorbs the stroke; no fixed-parent stretch dependency exists on this surface. Mirrors the ratified `KINDDOT-DIM-1` deferral.

## 10. Numeric sweep (self-consistency)

Every literal in this spec: `#ff8c1a` (fill, both themes), `#7a3d00` (light edge), `#ffa047` (dark edge), `#a65000` (the OLD darkened fill being replaced), `#e5e4e0`/`#2a2b30` (inactive track light/dark), `#ffffff`/`#16171c` (surface light/dark), `#f4ece0`/`#26221b` (stale-tint light/dark), `#cfcdc7` (border-strong, only in §1's mis-cite note), `6px`/`h-1.5`, `1px`/`border`, `gap-1.5`. Contrast literals — DESIGN.md-anchored (`8.06`, `3.61`, `8.16`, `2.23`) cited verbatim from DESIGN.md:35,62; edge-vs-surface derivations `8.42`/`7.18` (light: surface/stale-tint), `8.84`/`7.82` (dark), fill-vs-surface `7.69`/`6.80` (dark), raw-fill fails `2.23` (vs bg) / `1.83` (vs bg-border) / `1.46` (vs border-strong, §1 note), track-vs-surface `1.27`/`1.09` (ratified sub-3:1, unchanged). Every edge/fill boundary value ≥3.0 on every surface it can render on. Occurrence index `1` (active segment), `0` (live-dot). All consistent across §2/§3/§5/§6.
