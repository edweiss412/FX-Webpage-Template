# SheetIconLink — closing BL-HEADER-LINK-AFFORDANCE-CLASS

**Date:** 2026-07-26 · **Branch:** `feat/sheet-icon-link-affordance-class` · **Backlog:** BACKLOG.md:121 (root) (BL-HEADER-LINK-AFFORDANCE-CLASS) · **Owner ratification:** design approved interactively 2026-07-26; autonomous-to-merge approved same session.

## §0 Summary

The icon-only "open the source sheet" link exists in three admin surfaces with three class spellings, all coloured with a token DESIGN.md forbids for action targets. This spec extracts one shared component, components/admin/SheetIconLink.tsx (new file), consumed by all icon-only sites; fixes the colour tokens, the hit-overlay bleed, and the sub-block tap-floor; and unifies the accessible-name phrasing. Backlog items closed: 1, 3, 4, 5, 6 (item 2 was closed by PR #592).

The class sweep mandated by AGENTS.md ("class-sweep before patching") found a **fourth member** the backlog missed: `Step3ReviewModal.tsx` carries an identical icon-only sheet link. It is in scope.

## §1 Resolved scope — do not relitigate

1. **Backlog inset prescription superseded.** BACKLOG.md:131 (root) prescribes `before:-inset-x-2.5`, which yields a 20+10+10 = 40px-wide hit area — below the 44px tap floor this repo's mechanical gate enforces (`tests/e2e/section-header-layout.layout.spec.ts:937-938` asserts ≥44 both axes). This spec ships the asymmetric overlay in §5 instead (44×44, zero name-side bleed). Owner-ratified 2026-07-26.
2. **Centred title below `sm` stays out of bounds.** BACKLOG.md:134 (root), owner-ratified from a measured four-way comparison.
3. **`components/crew/primitives/SourceLink.tsx` is NOT in the class.** It is a deliberately recessive crew-surface text-labelled affordance ("In sheet" + glyph, `text-text-faint`, own `hitDirection` overlay machinery — `SourceLink.tsx:1-49`). Different surface, different design language, text carries the affordance. Excluded.
4. **`components/admin/settings/DriveConnectionPanel.tsx:249` is NOT in the class.** Its `ExternalLink` glyph trails a text-labelled "Open folder" button-style anchor (a Drive folder, not a sheet); the visible words carry the affordance. Excluded.
5. **Site C (`Step3SheetCard.tsx:141-168`) keeps its text-link pattern.** Title-as-link wraps, works for no-details rows, and carries the affordance in `text-text-strong` + hover underline; its trailing glyph is aria-hidden decoration beside a strong text link, not the affordance itself. BACKLOG.md:127 (root) names only the icon-only sites for the token violation. Site C is untouched by this change.
6. **`duration-fast` is retained on the new component.** The token emits no CSS repo-wide (Tailwind v4 reads `--transition-duration-*`; this repo defines `--duration-fast`) — a known, class-wide defect across ~89 files with its own fix shape. Repairing it here would be scope creep; parity with every sibling is kept deliberately.
7. **Phrasing at site A supersedes PR #592's wording by extension only.** #592's new-tab announcement and `.trim()` fallback are preserved verbatim; this change adds "in Google Sheets" so all sites share one phrasing (2 of 3 already had it). BACKLOG.md:128 (root) records #592's closure of item 2; nothing in that closure is reverted.
8. **`min-h-tap-min` removal is scoped to sub-blocks only** and amends the 2026-07-26 wide-inline spec §2.4 ("44px regardless of pill") to top-level sections only. That is exactly BACKLOG.md:132 (root)'s filed intent (the Diagrams sub-block never renders a link, so the floor buys nothing and defeats the deliberate `size-6`/`text-sm` subordination).
9. **Link presence remains instant** (no enter/exit animation): presence follows data, not a state transition — existing ratified comment at `step3ReviewSections.tsx:978`.

## §2 Current state (verified live at `396416778`)

| Site | File:line | Idiom | Rest colour | Aria phrasing |
| --- | --- | --- | --- | --- |
| A — section header | `components/admin/wizard/step3ReviewSections.tsx:991-1006` | `size-5` + `before:-inset-3` overlay | `text-text-subtle` | "Open the source sheet for X (opens in a new tab)" |
| B — published modal title | `components/admin/showpage/PublishedReviewModal.tsx:714-729` | `size-tap-min` 44px box | `text-text-subtle` | "…for X in Google Sheets (opens in a new tab)" |
| D — step-3 review modal title | `components/admin/wizard/Step3ReviewModal.tsx:402-417` | `size-tap-min` 44px box | `text-text-subtle` | "…for X in Google Sheets (opens in a new tab)" |
| C — sheet card title (out of scope) | `components/admin/wizard/Step3SheetCard.tsx:141-168` | text link + trailing glyph | text: `text-text-strong` | "…for X in Google Sheets (opens in a new tab)" |

DESIGN.md forbids the rest colour at every icon-only site: `--color-text-subtle` is "Never used for action targets" (`DESIGN.md:27`) and "never an action target" (`DESIGN.md:58`).

Other current facts this spec relies on:

- A's row: `gap-2.5` (10px) between name group and link (`step3ReviewSections.tsx:932`); at `sm`+ the link carries `sm:order-1 sm:ml-0.5` and its left neighbour is the inline pill at gap+margin = 12px (`step3ReviewSections.tsx:1002`).
- B's and D's title rows: `flex min-w-0 items-center gap-1` (`PublishedReviewModal.tsx:707`, `Step3ReviewModal.tsx:392`).
- Tap floors: `min-h-tap-min` unconditional on A's line-1 wrapper (`step3ReviewSections.tsx:932`); `sm:min-h-tap-min` unconditional on the outer row (`step3ReviewSections.tsx:930`). `--spacing-tap-min: 44px` (`app/globals.css:162`).
- Wrong-precedent comment: "The show card's own header already uses an icon-only sheet link" (`step3ReviewSections.tsx:979-980`) — `Step3SheetCard.tsx` renders a TEXT title link; the genuine icon-only precedents are B and D.
- `sub` is true exactly for the Diagrams sub-block (headingLevel 4 — `step3ReviewSections.tsx:886-889`); a sub-block never gets a link (`sheetHref` requires `sectionId !== undefined`; Diagrams has none — `step3ReviewSections.tsx:899-905`).
- The name-axis compensation token `pr-header-link-slot` is 30px = 20px link box + 10px gap (`app/globals.css:177`, rationale at `step3ReviewSections.tsx:948-955`) — unchanged by this spec (link box stays 20px, gap stays 10px).

## §3 Component contract — components/admin/SheetIconLink.tsx (new file)

Pure presentational, no hooks, no `"use client"` directive (client parents may import it freely).

```ts
type SheetIconLinkProps = {
  /** Resolved sheet deep link. Call sites keep their existing null-gating:
   *  null → the component is never rendered. Never pass "". */
  href: string;
  /** Show/section title for the accessible name. Trimmed internally;
   *  whitespace-only → the no-subject fallback phrasing. */
  subjectLabel: string;
  testId: string;
  /** Container-matched focus ring offset (DESIGN.md focus-ring row: never bare). */
  ringOffset: "bg" | "surface";
  /** Positional classes ONLY (order/margin, e.g. site A's "sm:order-1 sm:ml-0.5").
   *  Never colour, size, or hit-area classes. */
  className?: string;
};
```

Renders one `<a target="_blank" rel="noopener noreferrer">` containing `<ExternalLink aria-hidden className="size-4" />` (lucide-react).

**Accessible name (one phrasing, all sites):**

- `subjectLabel.trim()` non-empty → `Open the source sheet for ${trimmed} in Google Sheets (opens in a new tab)`
- else → `Open the source sheet in Google Sheets (opens in a new tab)`

**Class string (single literal + ring-offset lookup; full literals per branch so the Tailwind JIT sees complete names, same discipline as `SourceLink.tsx:60`):**

```
relative inline-grid size-5 shrink-0 place-items-center rounded-sm
text-text transition-colors duration-fast
before:absolute before:-inset-y-3 before:-left-2.5 before:-right-3.5 before:content-['']
hover:text-text-strong active:text-text-strong
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
focus-visible:ring-offset-2 focus-visible:ring-offset-bg | focus-visible:ring-offset-surface
```

**Guard conditions per prop:** `href` — non-null by contract (call sites gate; the component itself never branches on it). `subjectLabel` — null/undefined impossible under the type; `""`/whitespace → fallback phrasing (rendered, functional). `testId` — passed through verbatim. `ringOffset` — closed union; lookup map has exactly two rows. `className` — undefined → base classes only.

**Colour rationale (item 1):** `text-text` at rest (16.5:1/14.8:1 — `DESIGN.md` §1.2), `text-text-strong` on hover AND on active. Active is **colour-only, no transform**: `BL-HEADER-PROBE-RESIDUAL-VACUITY` item 2 (BACKLOG.md:147 (root)) documents that :active is outside the transition sweep, so geometry must not move in that state; colour-active also gives touch users press feedback where hover never fires.

## §4 Per-site changes

### 4.1 Site A — `step3ReviewSections.tsx`

- Replace the inline `<a>` (`components/admin/wizard/step3ReviewSections.tsx:991-1006`) with `<SheetIconLink href={sheetHref} subjectLabel={label} testId={…same…} ringOffset="bg" className="sm:order-1 sm:ml-0.5" />`. The testid string is unchanged.
- Delete the wrong-precedent sentence (item 3) with the rest of the superseded comment block; the component carries the idiom rationale, the call site keeps only site-specific notes (the §11 instant-presence line, the `sm:order-1` positioning rationale).
- Aria gains "in Google Sheets" (item 4; supersession note §1.7).
- **Item 6 floors:** line 932's `min-h-tap-min` and line 930's `sm:min-h-tap-min` both become conditional on `!sub`. Guard comment at the site: the floor exists for link-bearing headers; sub-blocks never carry links (§2 fact); if a future sub-block gains a link, the floor condition must be revisited with it.

### 4.2 Site B — `PublishedReviewModal.tsx`

- Replace the inline `<a>` (`components/admin/showpage/PublishedReviewModal.tsx:714-729`) with `<SheetIconLink href={openSheetHref} subjectLabel={displayTitle} testId={`${TESTID_BASE}-sheetlink`} ringOffset="surface" />`.
- Title row `gap-1` → `gap-2.5` (`components/admin/showpage/PublishedReviewModal.tsx:707`) so the left clearance meets the §5 invariant.

### 4.3 Site D — `Step3ReviewModal.tsx`

- Replace the inline `<a>` (`components/admin/wizard/Step3ReviewModal.tsx:402-417`) with `<SheetIconLink href={sheetLink} subjectLabel={title} testId={`wizard-step3-card-${dfid}-review-sheetlink`} ringOffset="surface" />`.
- Title row `gap-1` → `gap-2.5` (`components/admin/wizard/Step3ReviewModal.tsx:392`).

### 4.4 Not changed

Site C; `SourceLink`; `DriveConnectionPanel`; `pr-header-link-slot` (§2); every aria string at B/C/D (already canonical).

## §5 Dimensional invariants (single source of truth for all geometry numbers)

| Relationship | Value | Guaranteeing class |
| --- | --- | --- |
| Anchor visual box | 20×20px | `size-5` |
| Icon glyph | 16×16px, centred | `size-4` + `place-items-center` on `inline-grid` |
| Hit overlay width | 10 + 20 + 14 = **44px** | `before:-left-2.5 before:-right-3.5` |
| Hit overlay height | 12 + 20 + 12 = **44px** | `before:-inset-y-3` |
| Left (name/title-side) overlay reach | 10px — never exceeds the row gap | `before:-left-2.5` vs `gap-2.5` (10px) on every consuming row |
| Right overlay reach | 14px — into row-end padding / free flex space only | `before:-right-3.5`; the link is the row's last visual element at every site |
| A at `sm`+: pill-side clearance | 12px available ≥ 10px reach (2px slack) | `gap-2.5` + `sm:ml-0.5` (kept) |
| Top-level header line floor | 44px | `min-h-tap-min` (below `sm`, line-1 wrapper) / `sm:min-h-tap-min` (outer row) — **top-level only** after item 6 |
| Sub-block header line | natural height (no floor) | floor classes omitted when `sub` |
| Anchor in title rows (B/D) | vertically centred, never stretched | parent `items-center`, anchor `shrink-0` |

The overlay is out-of-flow (`before:absolute`) and invisible to `getBoundingClientRect()` — every 44px assertion must use hit testing (`elementFromPoint`), per the established oracle at `section-header-layout.layout.spec.ts:879`.

**Bleed invariant (item 5):** the overlay must not cover any part of the heading/title text box. With 10px left reach against a 10px gap the overlap is exactly 0; the test asserts it by probing the title box's link-side edge.

## §6 Transition inventory

States: idle, hover, focus-visible, active (+ link presence).

| Pair | Treatment |
| --- | --- |
| idle ↔ hover | colour only, `transition-colors duration-fast` (§1.6 caveat: token dead → effectively instant; accepted parity) |
| idle ↔ focus-visible | ring appears — instant, no transition (matches every sibling focus ring) |
| idle ↔ active | colour only, same channel as hover |
| hover ↔ active | no visual change (both `text-text-strong`) — deliberate |
| hover ↔ focus-visible | independent channels (colour vs ring), both rules compose |
| focus-visible ↔ active | colour only |
| absent ↔ present | instant — presence follows data (§1.9) |

Compound: active while hovered = hover colour (no conflict); focus while hovered = ring + colour. No transform in any state (§3 colour rationale).

## §7 Test plan (shapes; the plan assigns TDD tasks)

Updated:

1. `tests/e2e/published-review-modal.layout.spec.ts:621-625` — the sheetlink rider asserts the anchor's own rect ≥44px; under the overlay idiom the rect is 20px. Rewrite to the hit-testing oracle (overlay-derived width/height ≥44), mirroring `section-header-layout.layout.spec.ts:883-938`.
2. `tests/e2e/section-header-layout.layout.spec.ts` — T2 comments reference `-inset-3` (`tests/e2e/section-header-layout.layout.spec.ts:874` and :893); the overlay box is read from resolved insets so assertions adapt, comments updated. Sub-row (level-4 / G4 cells) height expectations change from the 44px floor to natural height at every viewport (item 6; §1.8 supersession). The pill-side `elementFromPoint` case (`tests/e2e/section-header-layout.layout.spec.ts:809-832`) stays green (reach shrinks 12→10px against 12px clearance).
3. `tests/components/admin/review/reviewModalShell.test.tsx:347` byte-for-byte baseline + `tests/components/admin/review/__fixtures__/step3-header-baseline.html` — regenerate: markup legitimately changes.
4. `tests/components/a11y/newTabAnnouncementBehavior.test.tsx` — site A's expected label gains "in Google Sheets"; the `.trim()` fallback case keeps its fallback string (also extended).
5. Unit suites pinning B/D markup or labels (`tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/admin/wizard/Step3ReviewModal.test.tsx`) — labels unchanged; any class-shape assertions move to the shared idiom.

New:

6. `SheetIconLink` unit tests: aria builder (subject / whitespace-only fallback), ring-offset lookup, className passthrough, `rel`/`target` hardening, aria-hidden icon. Anti-tautology: expected label strings derived from the props fed in, not re-read from the component's own constant.
7. **Bleed assertion (item 5's missing catcher):** real-browser probe at the heading/title box's link-side edge → `elementFromPoint` must resolve to the heading, not the link, at A (below `sm`, name-side) and at B/D (title-side). This is the assertion the existing tap test structurally cannot make (BACKLOG.md:131 (root)).
8. D-site tap coverage: hit-tested 44×44 for `Step3ReviewModal`'s sheetlink (none exists today).
9. Sub-block footprint: Diagrams header line height < 44px at 375 and 1280 (real browser), pinning item 6.

Every geometry expectation derives from §5's table, not hardcoded independently. Invariant-8 impeccable dual-gate (critique + audit) runs on the affected diff before cross-model review; UI is Opus-owned.

## §8 Out of scope

Dead `duration-fast` token repair (§1.6); crew surfaces; DriveConnectionPanel; centred-title decision (§1.2); any change to `buildSheetDeepLink` or link resolution; BL-HEADER-PROBE-RESIDUAL-VACUITY items (separate entry — though item 7 above narrows its untested-:active exposure by mandating no transform in any state).
