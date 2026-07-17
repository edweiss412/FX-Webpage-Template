# Spec — DataQualityBadge glance-distinction polish (FLOW4-2/3-POLISH)

**Date:** 2026-07-17
**Status:** design artifact for an amendment to the ratified `docs/superpowers/specs/2026-07-17-badge-affordance-a11y.md` (shipped #413). **This document does not itself resolve the finding or supersede the parent spec** — resolution is effected only when the lockstep implementation commits enumerated in §6 (component + parent-spec prose + Playwright doc-comment + `DEFERRED.md`) land on this same branch. Once they do, this amendment supersedes ONLY the glyph-size and inter-chip-gap values in the parent's §5.1/§5.2/§5.4; everything else in the parent spec stands. Until then this is a proposal, not a claim of done.
**Finding targeted (addressed by the proposed amendment, NOT resolved until the §6 lockstep implementation lands):** `FLOW4-2/3-POLISH` (`DEFERRED.md:482`). Backlog context: `BL-DATAQUALITY-BADGE-SEGMENT-GLYPH` (closed by parent), this is the deferred glance-legibility follow-up.

## 1. Problem

The admin shows-table `DataQualityBadge` (`components/admin/DataQualityBadge.tsx`) renders up to two amber chips — `Users` (roster changed) at `:69` and `TriangleAlert` (parse gaps) at `:79` — both at `className="size-3.5"` (14px), separated by the outer span's `gap-1.5` (6px, `:58`). Both chips are the same hue (`text-status-warn-text`); the signals are distinguished by glyph silhouette + per-chip count.

The parent spec's impeccable v3 critique (Assessment A, P2) deferred a glance-legibility concern: at 14px with a 6px gap, the two same-hue silhouettes (people-outline vs triangle-with-`!`) can momentarily conflate on a sunlit venue-floor phone _before_ the reader parses the counts. AT and low-vision users are already served (the full breakdown is in the unchanged `aria-label`/`title`); this is purely a sighted at-a-glance improvement.

## 2. Change (the only delta from the parent spec)

| Element | Parent spec value | This spec |
| --- | --- | --- |
| Each chip glyph (`Users`, `TriangleAlert`) | `size-3.5` (14px) | **`size-4` (16px)** |
| Outer badge span inter-chip gap | `gap-1.5` (6px) | **`gap-2` (8px)** |

Nothing else changes. Specifically **unchanged**: the count span (`text-xs font-medium tabular-nums leading-none`), the intra-chip glyph↔count `gap-0.5`, `whitespace-nowrap`, `shrink-0`, `items-center`, the outer contract (`data-testid`/`role="img"`/`aria-label`/`title`), the label builder, the render gate, and the roster-then-gap chip order.

## 3. Guard conditions (props)

Identical to the parent spec — the size/gap change touches no prop logic. For completeness, unchanged behavior: `dataGaps` undefined / `total` 0/NaN/negative/±Infinity ⇒ no gap chip; same finite-positive predicate for `rosterShift.total`; `if (!hasGap && !hasRoster) return null` (both absent ⇒ nothing rendered). Bumping glyph size cannot render a chip that the gate would otherwise suppress — size is applied only inside an already-gated chip branch.

## 4. Dimensional invariants (the load-bearing section)

The parent spec's §5.4 invariant is **`badgeHeight === glyphHeight`**, NOT "14px in the abstract." The count span is `text-xs` (0.75rem = 12px) with `leading-none` collapsing its line box to 12px (`app/globals.css:106-107`, `DESIGN.md:132`). The glyph is the tallest child, so the badge height equals the glyph height.

Bumping the glyph 14px → 16px moves the badge's baseline to 16px. **The 16px glyph remains strictly taller than the 12px count line box (16 > 12), so the invariant `badge == glyph` still holds** — the count's `leading-none` is still load-bearing and still sufficient (no count-size change). The gap change (`gap-1.5` → `gap-2`) is horizontal only — zero height effect.

| Parent → child | Guarantee |
| --- | --- |
| Outer badge span → chips | `items-center` (vertical center), **`gap-2`** (inter-chip), `whitespace-nowrap` (no wrap) |
| Chip span → glyph + count | `inline-flex items-center gap-0.5` |
| Chip count → glyph | `leading-none` on the count so its line box (12px) never exceeds the **16px (`size-4`)** glyph → glyph is the tallest child → badge height == glyph height |

**Re-verification (mandatory, real-browser):** the parent's `tests/e2e/dataQualityBadge.layout.spec.ts` asserts, per rendered badge, `|badge.height − ownGlyph.height| ≤ 0.5px` (relative, so it passes at any glyph size) AND no-wrap (`both`-chip badge height within 0.5px of the single-chip `roster` badge). Both assertions survive the size change unchanged because they are relative and same-size across chips. The spec REQUIRES this Playwright spec be re-run green against the size-4 markup (jsdom cannot verify layout) and its 14px/`size-3.5` prose comment (`:9`) updated to 16px/`size-4` in lockstep so the doc-comment does not go stale.

**Absolute-height note:** the badge grows 14px → 16px. It sits inline (`inline-flex`, `items-center`) beside the show-title text in a table cell that already sizes to its tallest inline content (title text ≥ 14px). A 16px glyph is not expected to change the table-row height; the real-browser spec is the arbiter (no new row-height assertion is added — the existing no-wrap + height-parity assertions already fence the badge's own box, and the badge is not a fixed-dimension parent whose row height it drives).

## 5. Transition inventory

Unchanged from the parent spec. 4 states `{none, gap-only, roster-only, both}`, all 6 unordered pairs INSTANT (plain ternary / `&&` / early-return; no `AnimatePresence`, no framer-motion). The size/gap change adds no state, no motion, no client state → no compound transitions. The gate literal pinned by `tests/components/admin/dataGapsTransitionAudit.test.tsx` (`if (!hasGap && !hasRoster) return null;`) is **NOT touched** by this change — its motion-absence and gate-literal assertions pass unchanged.

## 6. Lockstep edits (single commit with the component change)

1. `components/admin/DataQualityBadge.tsx` — `:58` `gap-1.5` → `gap-2`; `:69` + `:79` `size-3.5` → `size-4`.
2. `docs/superpowers/specs/2026-07-17-badge-affordance-a11y.md` — §5.1 (`:55` "keeps `size-3.5`" → `size-4`), §5.2 (`:61` `gap-1.5` → `gap-2`), §5.4 table + baseline prose (`:98`/`:100`/`:103` — `size-3.5`/14px → `size-4`/16px; the parent's `:56` count-line-box math stays 12px vs the now-16px glyph, still glyph-dominant). Add a one-line pointer to this amendment spec at the top of §5.
3. `tests/e2e/dataQualityBadge.layout.spec.ts` — update the `:9` doc-comment `14px`/`size-3.5` → `16px`/`size-4` (the assertions are relative and untouched).
4. `DEFERRED.md:482` — mark `FLOW4-2/3-POLISH` RESOLVED with the branch/spec reference. **This edit lands in the implementation commit(s), never in the spec-only commit** — the deferred item is not marked resolved until the size-4/gap-2 change itself is in the diff.

**DESIGN.md:** the FLOW4-3 two-glyph convention note (`DESIGN.md:88`) records glyph _identity_ (`Users`/`TriangleAlert`) and the by-shape-not-hue rule — it does NOT pin a glyph size. Size is a presentational detail, not part of the recorded design convention, so **no `DESIGN.md` edit is required.** (Invariant-8 impeccable dual-gate still applies because `components/**` is a UI surface regardless of whether `DESIGN.md` changes.)

## 7. Invariant-8 impeccable dual-gate

`components/admin/DataQualityBadge.tsx` is a UI surface (invariant 8). `/impeccable critique` AND `/impeccable audit` run on the affected diff; P0/P1 findings fixed or deferred via `DEFERRED.md` before cross-model review. The change is expected to be clean (it is the direct implementation of the parent critique's own deferred P2 recommendation).

## 8. Test plan

- **Unit (`tests/components/admin/DataQualityBadge.chips.test.tsx`, extend):** assert each rendered glyph carries `size-4` (not `size-3.5`) and the outer badge span carries `gap-2` (not `gap-1.5`). Concrete failure mode caught: a partial edit that bumps one glyph but not the other, or bumps size without widening the gap (or vice-versa). Scope the assertion to the specific glyph SVG / outer span classList, not a container that also renders siblings (anti-tautology).
- **Real-browser (`tests/e2e/dataQualityBadge.layout.spec.ts`, re-run):** existing height-parity + no-wrap assertions must stay green against the size-4 markup. This is the dimensional gate; jsdom is insufficient.
- **Contract-unchanged (`tests/components/admin/DataQualityBadge.rosterShift.test.tsx`, `dataGapsTransitionAudit.test.tsx`):** pass unchanged (label builder + gate literal byte-identical).

## 9. Out of scope

Count text size (stays `text-xs`), any hue change (forbidden — §1 color-blind floor), any new token, the mobile auto-applied disposition surface (FLOW4-1, separate), and any change to the badge's outer contract or label strings. No numeric literal in this spec is contradicted across sections: the only two changed values are `size-4` (16px) and `gap-2` (8px), stated once in §2 and referenced everywhere else.
