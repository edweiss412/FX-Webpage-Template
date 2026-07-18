# Spec — DataQualityBadge affordance a11y pass (FLOW4-2 + FLOW4-3)

**Date:** 2026-07-17
**Status:** design (autonomous ship; user spec-review WAIVED per `/ship-feature`)
**Surface:** admin shows-table data-quality badge — `components/admin/DataQualityBadge.tsx`
**Findings resolved:** `FLOW4-2` (`DEFERRED.md:473`), `FLOW4-3` (`DEFERRED.md:479`). Backlog refs `BL-DATAQUALITY-BADGE-TOUCH-DETAIL`, `BL-DATAQUALITY-BADGE-SEGMENT-GLYPH`.

---

## 1. Problem

`DataQualityBadge` (`components/admin/DataQualityBadge.tsx:10-58`) renders BOTH the parse-data-gap signal and the Flow-4 roster-shift signal with a single amber `TriangleAlert` glyph (`:55`). Two deferred findings:

- **FLOW4-2** — the roster/gap breakdown reaches sighted users only through the `title` tooltip on a non-focusable `<span>` (`:52`). Invisible on touch (venue-floor phone) and keyboard. AT is fine (the `role="img"` + `aria-label` at `:50-51` carries the full breakdown).
- **FLOW4-3** — one amber glyph conflates "parse gaps" and "roster changed"; a sighted glance cannot tell which signal (or how many of each) is active. The `aria-label` DOES split them for AT (`:29-46`), but no visible split exists.

## 2. Goal

Make the badge's PRIMARY signal — signal type + count — **visible without hover/tap** and **visually distinct per signal type**, so touch/keyboard/mouse users all get parity with what a desktop-hover user gets today at a glance. Keep the component **presentational and hook-free — no `"use client"`, no state, no effects** (as today, `components/admin/DataQualityBadge.tsx:4` "safe in a client island OR an RSC"; it is in fact rendered inside client islands at `ShowsTable.tsx:19` and `Step3SheetCard.tsx:1`, both `"use client"`). Keep the exact `aria-label`/`title`/`data-testid`/`role="img"` contract unchanged (invariant 5; existing tests pin it).

## 3. Non-goals (explicit — do-not-relitigate)

- **No interactive disclosure / popover / focusable control.** Rejected in brainstorming: the summary becoming visible dissolves the hover-only dependency; the FULL class-level breakdown (which gap classes, added/removed/renamed split) stays in `aria-label` + `title` as progressive enhancement. No client island, no dismiss-on-outside-click, no focus management. (This is the deliberate scope boundary — a reviewer proposing a popover is relitigating a settled decision.)
- **No new color token / no hue-based distinction.** Both signals stay `text-status-warn-text` amber. Per Flow-4 spec §6.4 (`2026-07-07-flow4-auto-applied-strip-roster-badge.md:209-215`) both are "needs-a-glance" states sharing the data-quality badge; per the DESIGN.md §1 color-blind floor (`DESIGN.md:15` — "red and green are NEVER used as primary semantic carriers … every state signal pairs color with text or icon") and the status dot/text-pairing rule (`DESIGN.md:84`) signals are never carried by hue alone. Distinction is carried by **glyph shape + visible count**, not color.
- **CARDREPORT-1** (crew card-header touch targets, `DEFERRED.md:187`) — separate surface, stays deferred.
- No DB, no advisory-lock, no telemetry surface, no §12.4 catalog code, no RPC.

## 4. Current behavior (cited)

`components/admin/DataQualityBadge.tsx`:
- Props: `{ slug: string; dataGaps: DataGapsSummary | undefined; rosterShift?: RosterShiftSummary | undefined }` (`:10-21`).
- `DataGapsSummary` = `lib/parser/dataGaps.ts:76`; `formatDataGapBreakdown(summary, cap=4)` = `lib/parser/dataGaps.ts:349`.
- `RosterShiftSummary` = `lib/admin/showDisplay.ts:19` = `{ added: number; removed: number; renamed: number; total: number }`.
- Render gate: `if (gapTotal === 0 && rosterTotal === 0) return null` (`:24`), where `rosterTotal = rosterShift?.total ?? 0` (`:22`), `gapTotal = dataGaps?.total ?? 0` (`:23`).
- `aria-label` = `[rosterLabel, gapLabel].filter(Boolean).join(". ")` (`:46`), roster segment THEN gap segment per Flow-4 spec §6.5 (`2026-07-07-flow4-auto-applied-strip-roster-badge.md:217-222`).
- Output: single `<span data-testid={`shows-data-quality-${slug}`} role="img" aria-label={label} title={label} className="inline-flex shrink-0 items-center text-status-warn-text"><TriangleAlert aria-hidden="true" className="size-3.5" /></span>` (`:47-56`).

Call sites (verified):
- `components/admin/ShowsTable.tsx:468` — passes `dataGaps` AND `rosterShift` (the ONLY site that can light a roster chip).
- `components/admin/ArchivedShowRow.tsx:59` — passes `dataGaps` only (no `rosterShift`) → roster chip never appears.
- `components/admin/wizard/Step3SheetCard.tsx:703` — passes `dataGaps` only → roster chip never appears.

## 5. Target design

The badge renders **up to two visible chips** inside the unchanged outer `role="img"` span. Each chip = a glyph + its count, both `text-status-warn-text`.

> **Amendment (2026-07-17, FLOW4-2/3-POLISH):** glyph size and inter-chip gap in §5.1/§5.2/§5.4 below are superseded by `docs/superpowers/specs/2026-07-17-badge-glance-polish.md` — glyphs are `size-4` (16px, was `size-3.5`/14px) and the outer inter-chip gap is `gap-2` (8px, was `gap-1.5`/6px), to sharpen at-a-glance silhouette distinction on a sunlit phone. The values below are updated to the amended state; the dimensional invariant `badgeHeight === glyphHeight` is unchanged (still holds at the 16px baseline; `leading-none` on the 12px count box is still load-bearing).

### 5.1 Chip inventory

| Chip | Condition | Glyph | Count |
|------|-----------|-------|-------|
| Roster-shift | `rosterTotal > 0` | lucide `Users` (precedent: `components/admin/wizard/step3ReviewSections.tsx:60,3519`) | `rosterShift.total` |
| Parse-gap | `gapTotal > 0` | lucide `TriangleAlert` (unchanged) | `dataGaps.total` |

- **Order: roster chip THEN gap chip**, matching the §6.5 aria-label concatenation order (roster segment then gap segment). Prevents a visual-vs-AT order mismatch a reviewer would flag.
- Each glyph is `className="size-4"` (16px; FLOW4-2/3-POLISH amendment, was `size-3.5`/14px).
- Each count: `text-xs font-medium tabular-nums leading-none`. `tabular-nums` is the project's numeric-value idiom (`components/atoms/KeyValue.tsx:134,144`); `text-xs`/`font-medium` are standard small-label sizes. **`leading-none` is load-bearing for the §5.4 dimensional invariant**: `text-xs` on this project is `0.75rem` with line-height `1.4` (`app/globals.css:106-107`, `DESIGN.md:132`) → a `12px × 1.4 = 16.8px` line box, taller than the 16px (`size-4`) glyph, which would grow the badge height; `leading-none` collapses the count's line box to its 12px font size so the 16px glyph remains the tallest child and the badge height stays at the single-glyph baseline.
- Glyphs are `aria-hidden="true"`; counts are visible text but semantically subsumed by the outer `role="img"` name (screen readers read only the `aria-label`, never the inner text — unchanged AT behavior).

### 5.2 Outer element (contract-preserving)

Unchanged: `<span data-testid={`shows-data-quality-${slug}`} role="img" aria-label={label} title={label}>`. ClassName becomes `inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-status-warn-text` (adds `gap-2` between chips — FLOW4-2/3-POLISH amendment, was `gap-1.5` — and `whitespace-nowrap` so the two-chip cluster never wraps within a table cell). Each chip is an inner `<span aria-hidden="true" className="inline-flex items-center gap-0.5 leading-none">{glyph}{count}</span>` (the count span carries the `text-xs font-medium tabular-nums leading-none` of §5.1).

`label`, `rosterLabel`, `gapLabel`, and `data-testid` are byte-identical to today. The **render gate is hardened** (see §5.3): from the old strict `gapTotal === 0 && rosterTotal === 0` (`components/admin/DataQualityBadge.tsx:24`) to `if (!hasGap && !hasRoster) return null`, where `hasGap`/`hasRoster` are the positive-total predicates below. `slug` is interpolated only into `data-testid`; it is never rendered as content and has no effect on the render gate or chips.

### 5.3 Guard conditions (every prop / input state)

Define the two positive-total predicates once, and drive BOTH the render gate and each chip off them:

```
const gapTotal    = dataGaps?.total ?? 0;
const rosterTotal = rosterShift?.total ?? 0;
const hasGap    = Number.isFinite(gapTotal)    && gapTotal    > 0;
const hasRoster = Number.isFinite(rosterTotal) && rosterTotal > 0;
if (!hasGap && !hasRoster) return null;
```

| `dataGaps.total` | `rosterShift.total` | `hasGap` / `hasRoster` | Rendered |
|-----------|--------------|----------|----------|
| undefined / 0 / negative / NaN | undefined / 0 / negative / NaN | false / false | `null` (instant unmount, no animation) |
| finite > 0 | undefined / 0 / negative / NaN | true / false | gap chip only (`TriangleAlert` + gap count) |
| undefined / 0 / negative / NaN | finite > 0 | false / true | roster chip only (`Users` + roster count) |
| finite > 0 | finite > 0 | true / true | both chips, roster then gap |

- `?? 0` guards a missing summary object → contributes 0.
- **Domain of the totals:** both totals are **finite non-negative integers by construction** — `dataGaps.total` is `total += 1` over matched warnings (`lib/parser/dataGaps.ts:243`), `rosterShift.total` is `added + removed + renamed` of integer RPC counts (`lib/admin/loadRecentAutoApplied.ts:207`). `NaN`, `±Infinity`, and negative totals are therefore all **type-impossible** on the reachable domain.
- **`Number.isFinite` + `> 0`** hardens the chip/gate predicate against the pre-existing gap in `:24`'s strict `=== 0` gate, which only rejected exactly `0`: a `NaN`, `±Infinity`, or negative total (`NaN === 0`, `Infinity === 0`, `-1 === 0` are all `false`) would slip past `=== 0`. `Number.isFinite(t) && t > 0` rejects all four non-signals uniformly (NaN, +Infinity, −Infinity, negatives), so `hasGap`/`hasRoster` — and therefore every rendered chip and count — is only ever true for a finite positive integer. No count is rendered as `0`, negative, `NaN`, or `Infinity`.
- **Gate-vs-label consistency:** the (unchanged) label builder still uses the raw `rosterTotal > 0` / `gapTotal > 0` conditions (`:30,:42`), NOT `hasGap`/`hasRoster`. On the finite-integer domain the two agree exactly. They could diverge ONLY on `+Infinity` (`Infinity > 0` is `true` but `hasX` is `false`; `-Infinity > 0` is `false`, so it agrees with the gate) — i.e. a `+Infinity` total could emit a label segment with no matching chip, or reach `aria-label`. That input is type-impossible (see domain above); it is the same type-contract posture as the `classes` case and is NOT runtime-revalidated (§3 boundary). The gate hardening is the belt; the finite-integer type is the suspenders.
- **`slug`** (`string`): interpolated only into `data-testid={`shows-data-quality-${slug}`}`. An empty/whitespace slug yields an empty-suffixed but still-valid testid; it never renders as visible content and never affects the gate or chips. No behavior change from today (`:49`).
- The chip **count** is always the finite positive `.total` integer that made its predicate true.
- **Roster subcounts + gap classes (label builder — unchanged, `components/admin/DataQualityBadge.tsx:29-46`).** This pass does NOT touch the label builder; its malformed-input behavior is pre-existing and specified here for completeness. `rosterLabel` filters `[added, removed, renamed]` by `n > 0` (`:37`) — a malformed roster where `total > 0` but every subcount is `0`/missing/`NaN` degrades gracefully to the bare prefix `"Roster changed since last review: "` (empty enumeration) while the chip still shows `total`; this is bounded, plain-language, and carries no raw code (invariant 5 held). No crash, no `NaN`/`undefined` leaking into the label (the `.filter` drops non-positive subcounts). `gapLabel` routes `dataGaps.classes` through `formatDataGapBreakdown` (`lib/parser/dataGaps.ts:349`, which reads `summary.classes[code]` at `:333`, capped at 4 classes + "+N more") — also unchanged and inherently bounded. **`classes` is a REQUIRED, non-optional field of `DataGapsSummary` (`lib/parser/dataGaps.ts:76-79`: `classes: Record<GapCode, number>`), always seeded as a full all-GapCode-keys record by `zeroClasses()` (`:91-92`) before any increment, and inside `summarizeDataGaps` (`:232-247`) `total` and the class counts are incremented in lockstep (`classes[w.code as GapCode] += 1; total += 1;`, `:242-243`) — so `total > 0 ⟹ ≥1 class is positive` and `classes` is never null/undefined/`{}`.** The badge trusts this type contract exactly as today; a `null`/missing `classes` is a type violation outside the component's contract (the same class as passing a non-object `dataGaps`) and is NOT runtime-revalidated here — re-validating would breach the "label builder unchanged" boundary (§3). On the roster side, `rosterShift.total` is composed as `added + removed + renamed` of the RPC's integer counts at `lib/admin/loadRecentAutoApplied.ts:207` (the `roster_shift_counts` SQL returns `added,removed,renamed` per show; the loader forms the total), so `total === added + removed + renamed` holds by construction. Both degraded paths are defensive, not expected states.

### 5.4 Dimensional invariants

The badge sits inline beside the show title in a shows-table row (`ShowsTable.tsx:468`) and in the archived row / Step-3 card. It is a **flex parent with glyph+count children**; Tailwind v4 does not default `.flex` to `align-items: stretch` (`AGENTS.md` / `DESIGN.md`), so vertical centering is explicit.

| Parent → child | Guarantee |
|----------------|-----------|
| Outer badge span → chips | `items-center` (vertical center), `gap-2` (inter-chip; FLOW4-2/3-POLISH, was `gap-1.5`), `whitespace-nowrap` (no wrap) |
| Chip span → glyph + count | `inline-flex items-center gap-0.5` |
| Chip count → glyph | `leading-none` on the count so its line box (~12px) never exceeds the 16px (`size-4`; FLOW4-2/3-POLISH, was `size-3.5`) glyph → glyph is the tallest child → badge height == glyph height |
| Badge → table row | `shrink-0` (never squeezed); badge must NOT increase the row's height beyond its existing single-glyph height, and must NOT wrap to a second line |

**Baseline definition (precise):** the invariant is `badgeHeight === glyphHeight` (the 16px `size-4` box; FLOW4-2/3-POLISH, was 14px `size-3.5`), NOT "unchanged vs today" in the abstract — today's single-glyph badge already == glyph height, and `leading-none` on the count keeps the two-chip badge at that same height. Verified by a real-browser (Playwright) assertion in the plan: render a row with both chips, `getBoundingClientRect()` on the badge testid AND on a chip glyph, assert `|badge.height − glyph.height| ≤ 0.5px`, and assert the badge does not wrap (its height is within 0.5px of a single-chip badge's height, i.e. no second line). jsdom is insufficient (no layout).

### 5.5 Transition inventory

4 states: `{none, gap-only, roster-only, both}`. Each is a pure function of props (the component holds no state) and only changes on the next sync's full re-render — there is no client state, no user-driven toggle. All `4·3/2 = 6` unordered state-transition pairs, each **INSTANT** (plain ternary / `&&` / early-return; no `AnimatePresence`, no framer-motion, no `exit`/`initial`/`animate`):

| # | Transition pair | Treatment |
|---|-----------------|-----------|
| 1 | none ↔ gap-only | INSTANT — gap chip mounts/unmounts via `hasGap` early-return / `&&` |
| 2 | none ↔ roster-only | INSTANT — roster chip mounts/unmounts via `hasRoster` |
| 3 | none ↔ both | INSTANT — outer span + both chips mount/unmount together |
| 4 | gap-only ↔ roster-only | INSTANT — one chip swaps for the other on re-render |
| 5 | gap-only ↔ both | INSTANT — roster chip appears/disappears beside the persisting gap chip |
| 6 | roster-only ↔ both | INSTANT — gap chip appears/disappears beside the persisting roster chip |

**Compound transitions:** none. The badge holds no client state and shares none with any sibling; every state is a pure re-render given props, so there is no "state A animates while state B mid-transition" hazard — nothing animates, nothing to interrupt. The existing `dataGapsTransitionAudit.test.tsx` asserts no motion imports (still true — the two-chip markup adds none) BUT it ALSO pins the exact old gate literal `if (gapTotal === 0 && rosterTotal === 0) return null;` at `tests/components/admin/dataGapsTransitionAudit.test.tsx:146` as its "instant early-return" proof. The hardened gate (§5.3) changes that literal, so **this audit's expected regex MUST be updated in lockstep** to `/if \(!hasGap && !hasRoster\) return null;/` (a TDD task, §8) — it is not a "passes unchanged" file. The motion-absence assertion is unaffected.

## 6. DESIGN.md amendment (the FLOW4-3 "DESIGN.md decision")

FLOW4-3's deferral trigger is explicitly "a DESIGN.md decision to split data-quality signal types" (`DEFERRED.md:483`). Add a short subsection to `DESIGN.md` recording the convention: the admin data-quality badge carries up to two amber chips, each a distinct glyph + count (`Users` = roster changed, `TriangleAlert` = parse gaps), both `--color-status-warn-text`; distinction is by glyph+count, never hue (upholds the §1 color-blind floor at `DESIGN.md:15`, dot/text-pairing rule `DESIGN.md:84`). This edit makes `DESIGN.md` part of the diff → **invariant-8 impeccable dual-gate applies** (badge diff + DESIGN.md).

## 7. Invariants & meta-test inventory

- **Invariant 5** (no raw codes in UI): preserved — `aria-label`/`title` are plain-language, byte-identical to today; counts are integers, never codes.
- **Invariant 8** (impeccable dual-gate): `/impeccable critique` + `/impeccable audit` on the badge + DESIGN.md diff; P0/P1 fixed or `DEFERRED.md`-deferred BEFORE cross-model review.
- **Invariants 2, 3, 4, 9, 10**: N/A — no DB/lock/email/Supabase-call/mutation surface touched.
- **Meta-test inventory:** CREATES none. **EXTENDS one:** `tests/components/admin/dataGapsTransitionAudit.test.tsx:146` — its "instant early-return" grep pins the exact gate literal, which the §5.3 hardening changes; the regex is updated to the new gate in lockstep (the motion-absence assertions in that file are untouched). `tests/components/admin/DataQualityBadge.rosterShift.test.tsx` (aria-label contract) passes unchanged (label builder byte-identical). New behavioral assertions land in a NEW test file (§8), not a new meta-test. No new structural registry is warranted (no new call boundary, no new §12.4 code, no new advisory-lock surface).

## 8. Test plan (TDD)

New file `tests/components/admin/DataQualityBadge.chips.test.tsx` (jsdom), anti-tautology throughout (counts derived from fixture `.total`, never hardcoded; glyphs scoped so a chip can't pass by a sibling's glyph):

1. **gap-only** → exactly one `TriangleAlert`, no `Users`; visible count text === `dataGaps.total` (from `mkDataGaps` fixture, `tests/helpers/dataGapsFixture.ts:9`).
2. **roster-only** → exactly one `Users`, no `TriangleAlert`; visible count === `rosterShift.total`.
3. **both** → `Users` chip precedes `TriangleAlert` chip in DOM order; both counts match their respective fixture totals.
4. **0/0** → renders nothing (`container` empty; `queryByRole("img")` null).
5. **Hardened-gate guard (§5.3)** → for each non-signal value `v ∈ {NaN, -1, Infinity}`: a lone `{total: v}` on `rosterShift` (gaps absent) renders nothing, and a lone `{total: v}` on `dataGaps` (roster absent) renders nothing (no `role="img"`, no empty-label span). Also `{total: NaN}`+`{total: NaN}` → nothing. Proves `Number.isFinite && > 0` rejects NaN/negative/±Infinity uniformly — catching the failure mode where such a total slips past the old `=== 0` gate into an empty/`Infinity`-`aria-label` badge. (These values are type-impossible on the real domain per §5.3; the test exercises the defensive gate directly, not a reachable production state.)
6. **aria-label unchanged** → assert the exact §6.5 strings for roster-only / gap-only / both (mirrors the existing rosterShift test's derivation via `formatDataGapBreakdown`), proving the contract preserved.
7. Glyph identification: assert by a stable per-chip hook (e.g. `data-testid` on each chip span, `roster` / `gap`) — clone-and-scope so the gap assertion cannot be satisfied by the roster chip and vice-versa.

Real-browser layout task (Playwright) per §5.4 — badge height parity + no-wrap, both-chips vs gap-only.

**Lockstep meta-test update (§5.5/§7):** update the gate-literal grep at `tests/components/admin/dataGapsTransitionAudit.test.tsx:146` from `/if \(gapTotal === 0 && rosterTotal === 0\) return null;/` to `/if \(!hasGap && !hasRoster\) return null;/`. It still proves the badge is an instant early-return (not an animated presence); its motion-absence assertions are untouched. This lands in the SAME task/commit as the gate change (a source-grep audit fails immediately otherwise).

Regression (verified query mechanism per file): `DataQualityBadge.rosterShift.test.tsx` (queries `role="img"` + `aria-label`), `dataQualityBadgeArchivedTab.test.tsx` (`data-testid` + `aria-label`), `ShowsTable.test.tsx` (`data-testid` + `aria-label`), `step3SheetCard.test.tsx` (`data-testid`) → pass unchanged (contract preserved). `dataGapsTransitionAudit.test.tsx` is NOT in this "unchanged" set — it is a **source-grep audit** updated in lockstep above. Run the FULL suite before push (a page-adjacent component rebuild can fan out to source-scanning meta-tests).

## 9. Watchpoints (§6-style, pre-load the reviewer)

- The visible counts inside a `role="img"` are intentionally NOT read by AT — the `aria-label` is the single source of the accessible name. This is the established pattern (`:50`), not a defect.
- Roster chip appears at ONE call site only (`ShowsTable.tsx:468`); the archived row and Step-3 card pass no `rosterShift` by design (`ArchivedShowRow.tsx:59`, `Step3SheetCard.tsx:703`) — do not "fix" them to pass roster data.
- No popover / focusable control — see §3. Settled in brainstorming.
- Amber-only, no hue split — see §3. Settled per Flow-4 §6.4 + DESIGN.md §1 floor.
