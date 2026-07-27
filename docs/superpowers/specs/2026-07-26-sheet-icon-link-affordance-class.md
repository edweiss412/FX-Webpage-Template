# SheetIconLink — closing BL-HEADER-LINK-AFFORDANCE-CLASS

**Date:** 2026-07-26 · **Branch:** `feat/sheet-icon-link-affordance-class` · **Backlog:** BL-HEADER-LINK-AFFORDANCE-CLASS (graduated 2026-07-27 to BACKLOG-archive.md; grep by id) · **Owner ratification:** design approved interactively 2026-07-26; autonomous-to-merge approved same session. · **Review:** Codex r1 BLOCKING → repaired (this revision).

## §0 Summary

The icon-only "open the source sheet" link exists at three admin sites in two class spellings (site A divergent; sites B and D byte-identical), beside a third, text-link variant at site C — and every icon-only site is coloured with a token DESIGN.md forbids for action targets. This spec extracts one shared component, components/admin/SheetIconLink.tsx (new file), consumed by all three icon-only sites; fixes the colour tokens, the hit-overlay bleed, and the sub-block tap-floor; and unifies the accessible-name phrasing. Backlog items closed: 1, 3, 4, 5, 6 (item 2 was closed by PR #592).

The class sweep mandated by AGENTS.md ("class-sweep before patching") found a **fourth member** the backlog missed: `Step3ReviewModal.tsx` carries an icon-only sheet link byte-identical to `PublishedReviewModal.tsx`'s. It is in scope (site D).

## §1 Resolved scope — do not relitigate

1. **Backlog inset prescription superseded.** the archived entry's item 5 (BACKLOG-archive.md, BL-HEADER-LINK-AFFORDANCE-CLASS) prescribes `before:-inset-x-2.5`, which yields a 20+10+10 = 40px-wide hit area — below the 44px tap floor this repo's mechanical gate enforces (`tests/e2e/section-header-layout.layout.spec.ts:937-938` asserts ≥44 both axes). This spec ships the asymmetric overlay in §5 instead (44×44, zero name-side bleed). Owner-ratified 2026-07-26.
2. **Centred title below `sm` stays out of bounds.** the archived entry's "Out of bounds" note (BACKLOG-archive.md, BL-HEADER-LINK-AFFORDANCE-CLASS), owner-ratified from a measured four-way comparison.
3. **`components/crew/primitives/SourceLink.tsx` is NOT in the class.** It is a deliberately recessive crew-surface text-labelled affordance ("In sheet" + glyph, `text-text-faint`, own `hitDirection` overlay machinery — `SourceLink.tsx:1-49`). Different surface, different design language, text carries the affordance. Excluded.
4. **`components/admin/settings/DriveConnectionPanel.tsx:249` is NOT in the class.** Its `ExternalLink` glyph trails a text-labelled "Open folder" button-style anchor (a Drive folder, not a sheet); the visible words carry the affordance. Excluded.
5. **Site C (`Step3SheetCard.tsx:141-168`) keeps its text-link pattern.** Title-as-link wraps, works for no-details rows, and carries the affordance in `text-text-strong` + hover underline; its trailing glyph is aria-hidden decoration beside a strong text link, not the affordance itself. the archived entry (BACKLOG-archive.md, BL-HEADER-LINK-AFFORDANCE-CLASS) names only the icon-only sites for the token violation. Site C is untouched by this change.
6. **`duration-fast` is retained on the new component.** The token emits no CSS repo-wide (Tailwind v4 reads `--transition-duration-*`; this repo defines `--duration-fast`) — a known, class-wide defect across ~89 files with its own fix shape. Repairing it here would be scope creep; parity with every sibling is kept deliberately.
7. **Phrasing at site A supersedes PR #592's wording by extension only.** #592's new-tab announcement and `.trim()` fallback are preserved verbatim; this change adds "in Google Sheets" so all sites share one phrasing (2 of 3 already had it). the archived entry's item 2 (BACKLOG-archive.md, BL-HEADER-LINK-AFFORDANCE-CLASS) records #592's closure; nothing in that closure is reverted.
8. **`min-h-tap-min` removal is scoped to LINKLESS sub-blocks only** (`sub && sheetHref === null` — ratified audit P2 amendment, §4.1 item 6) and amends the 2026-07-26 wide-inline spec §2.4 ("44px regardless of pill") to link-bearing rows. That is exactly the archived entry's item-6 filed intent (BACKLOG-archive.md, BL-HEADER-LINK-AFFORDANCE-CLASS) (the Diagrams sub-block never renders a link, so the floor buys nothing and defeats the deliberate `size-6`/`text-sm` subordination); a future linked sub-block gets its floor back by construction.
9. **Link presence remains instant** (no enter/exit animation): presence follows data, not a state transition — existing ratified comment at `step3ReviewSections.tsx:978`.
10. **B/D title rows gain the 44px floor and a 2px trailing margin.** Codex r1 finding 1: without a floor, the overlay's 12px vertical reach lands on B's subline and D's eyebrow/subline, and the 14px right reach can cross the shell header's 12px `gap-3` toward the actions cluster. The repair — `min-h-tap-min` + `gap-2.5` + `mr-0.5` on the consuming rows (§5.1) — is the same containment recipe site A already uses and is ratified here; do not propose per-site inset variants or a boxed-idiom revert instead. **Height effect: none** (Codex r2 finding 3): the rows are already 44px tall because the current boxed anchor is a 44px child; the floor preserves that band when the anchor shrinks to 20px. The baseline effect is markup-only.
11. **The agenda error-state source link (`step3ReviewSections.tsx:3480-3490`, testid `agenda-source-link`) is NOT in the class.** Visible words "Open the source sheet" + `text-text-strong` + underline carry the affordance — the same text-carried pattern as site C. Retained unchanged; it earns the file a pinned row in the §7.10 guard.

## §2 Current state (verified live at `396416778`)

| Site | File:line | Idiom | Rest colour | Aria phrasing |
| --- | --- | --- | --- | --- |
| A — section header | `components/admin/wizard/step3ReviewSections.tsx:991-1006` | `size-5` + `before:-inset-3` overlay | `text-text-subtle` | "Open the source sheet for X (opens in a new tab)" |
| B — published modal title | `components/admin/showpage/PublishedReviewModal.tsx:714-729` | `size-tap-min` 44px box | `text-text-subtle` | "…for X in Google Sheets (opens in a new tab)" |
| D — step-3 review modal title | `components/admin/wizard/Step3ReviewModal.tsx:402-417` | `size-tap-min` 44px box (byte-identical class string to B — `Step3ReviewModal.tsx:413` vs `PublishedReviewModal.tsx:725`) | `text-text-subtle` | "…for X in Google Sheets (opens in a new tab)" |
| C — sheet card title (out of scope) | `components/admin/wizard/Step3SheetCard.tsx:141-168` | text link + trailing glyph | text: `text-text-strong` | "…for X in Google Sheets (opens in a new tab)" |

DESIGN.md forbids the rest colour at every icon-only site: `--color-text-subtle` is "Never used for action targets" (`DESIGN.md:27`) and "never an action target" (`DESIGN.md:58`).

Other current facts this spec relies on:

- A's row: `gap-2.5` (10px) between name group and link (`step3ReviewSections.tsx:932`); at `sm`+ the link carries `sm:order-1 sm:ml-0.5` and its left neighbour is the inline pill at gap+margin = 12px (`step3ReviewSections.tsx:1002`).
- B's and D's title rows: `flex min-w-0 items-center gap-1`, no height floor (`PublishedReviewModal.tsx:707`, `Step3ReviewModal.tsx:391`).
- B's subline sits directly below its title row (`PublishedReviewModal.tsx:736-738`); D has an eyebrow line above (`Step3ReviewModal.tsx:386-388`) and a subline below (`Step3ReviewModal.tsx:419-421`).
- Both modal headers render inside the shell's `<header className="flex shrink-0 items-start gap-3 …">` — the title block is `min-w-0 flex-1`, the actions cluster is `shrink-0`, separated by `gap-3` = 12px (`ReviewModalShell.tsx:654`, consumer comment `PublishedReviewModal.tsx:700-703`). The cluster's FIRST box is non-interactive at both sites: D leads with the state chip (`Step3ReviewModal.tsx:443-465`), B's clean/degraded states lead with non-interactive pills (`PublishedReviewModal.tsx:879-901`); the close button sits beyond. Clearance and probes therefore target the nearest CONTENT box, not the nearest interactive element.
- The phrase "Open the source sheet" currently occurs in four component files (five occurrence groups): the three inline icon-only anchors (A/B/D, incl. the label-quoting comment `Step3ReviewModal.tsx:27` and site A's fallback-comment at `step3ReviewSections.tsx:989`), site C's aria-label (`Step3SheetCard.tsx:152`), and the agenda error-state text link (`step3ReviewSections.tsx:3488`).
- Tap floors: `min-h-tap-min` unconditional on A's line-1 wrapper (`step3ReviewSections.tsx:932`); `sm:min-h-tap-min` unconditional on the outer row (`step3ReviewSections.tsx:930`). `--spacing-tap-min: 44px` (`app/globals.css:162`). `--spacing-tile-pad: 20px` (`app/globals.css:178`).
- Wrong-precedent comment: "The show card's own header already uses an icon-only sheet link" (`step3ReviewSections.tsx:979-980`) — `Step3SheetCard.tsx` renders a TEXT title link; the genuine icon-only precedents are B and D.
- `sub` is true exactly for the Diagrams sub-block (headingLevel 4 — `step3ReviewSections.tsx:886-889`); a sub-block never gets a link (`sheetHref` requires `sectionId !== undefined`; Diagrams has none — `step3ReviewSections.tsx:899-905`).
- The name-axis compensation token `pr-header-link-slot` is 30px = 20px link box + 10px gap (`app/globals.css:177`, rationale at `step3ReviewSections.tsx:948-955`) — unchanged by this spec (link box stays 20px, gap stays 10px).
- The byte-for-byte header baseline pins **site D's** header markup (`tests/components/admin/review/reviewModalShell.test.tsx:347` renders `Step3ReviewModal`; the fixture's testids are `wizard-step3-card-…-review-sheetlink` etc.).
- The section-header tap oracle currently reads ONE resolved inset component and applies it symmetrically (`tests/e2e/section-header-layout.layout.spec.ts:891-901`); the pill-side non-bleed oracle probes one pixel inside the neighbour's box (`tests/e2e/section-header-layout.layout.spec.ts:822-833`).
- The only jsdom pin on the old idiom is `expect(link.className).toMatch(/\bsize-tap-min\b/)` (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:310`); site A's jsdom labels lack "in Google Sheets" (`tests/components/a11y/newTabAnnouncementBehavior.test.tsx:293` and :304).

## §3 Component contract — components/admin/SheetIconLink.tsx (new file)

Pure presentational, no hooks, no `"use client"` directive (client parents may import it freely).

```ts
type SheetIconLinkProps = {
  /** Resolved sheet deep link. Call sites keep their existing null-gating:
   *  null → the component is never rendered. */
  href: string;
  /** Show/section title for the accessible name. Trimmed internally;
   *  whitespace-only → the no-subject fallback phrasing. */
  subjectLabel: string;
  testId: string;
  /** Container-matched focus ring offset (DESIGN.md focus-ring row: never bare). */
  ringOffset: "bg" | "surface";
  /** Positional classes ONLY (order/margin, e.g. "sm:order-1 sm:ml-0.5", "mr-0.5").
   *  Never colour, size, or hit-area classes. */
  className?: string;
};
```

Renders one `<a target="_blank" rel="noopener noreferrer">` containing `<ExternalLink aria-hidden className="size-4" />` (lucide-react).

**Accessible name (one phrasing, all sites):**

- `subjectLabel.trim()` non-empty → `Open the source sheet for ${trimmed} in Google Sheets (opens in a new tab)`
- else → `Open the source sheet in Google Sheets (opens in a new tab)`

**Class string (single base literal + backdrop-skin lookup keyed by `ringOffset`; full literals per branch so the Tailwind JIT sees complete names, same discipline as `SourceLink.tsx:60`):**

```
relative inline-grid size-5 shrink-0 place-items-center rounded-sm
text-text transition-colors duration-fast
before:absolute before:-inset-y-3 before:-left-2.5 before:-right-3.5 before:content-['']
hover:text-text-strong active:text-text-strong
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
focus-visible:ring-offset-2
```

plus exactly one backdrop-matched skin selected by `ringOffset` (ratified amendment, impeccable audit P2 — see §12.2 of the handoff doc: the press/hover wash must sit one REAL neutral step above its backdrop in both themes; `bg-surface-sunken` over `bg-bg` measures 1.03:1 in dark — invisible — so the `bg` site steps up to `bg-surface`; no `dark:` variant exists in this repo, so per-theme splits would be dead classes):

```
bg      = focus-visible:ring-offset-bg hover:bg-surface active:bg-surface
surface = focus-visible:ring-offset-surface hover:bg-surface-sunken active:bg-surface-sunken
```

**Guard conditions, every prop × every degenerate value (explicit dispositions):**

| Prop | null / undefined | `""` | whitespace-only | zero / NaN |
| --- | --- | --- | --- | --- |
| `href` | type-excluded (`string`, required); call sites gate `null` upstream and never render the component | never passed by contract — the component does not branch on it; an empty href would render a same-page link, which no call site can produce (`buildSheetDeepLink` returns a URL or null) | same as `""` | n/a (string) |
| `subjectLabel` | type-excluded (required) | fallback phrasing (rendered, functional) | `.trim()` → fallback phrasing | n/a (string) |
| `testId` | type-excluded (required) | would render `data-testid=""` — harmless, but no call site passes it (all three pass non-empty template literals) | passed through verbatim | n/a (string) |
| `ringOffset` | type-excluded (closed union, required) | type-excluded | type-excluded | type-excluded |
| `className` | undefined AND null → base classes only (the component appends `className ?? ""`, so a runtime `null` from an untyped JS caller is inert rather than rendering the string "null") | base classes only (empty append) | tolerated — class parsing ignores extra whitespace | n/a (string) |

No numeric props exist. TypeScript excludes `null` statically on every prop; the `?? ""` append is the one place a runtime null could otherwise leak into output, and it is neutralised there. The component has zero branches other than the aria-label ternary, the backdrop-skin lookup, and that append.

**Colour rationale (item 1):** `text-text` at rest (16.5:1/14.8:1 — `DESIGN.md` §1.2), `text-text-strong` PLUS the backdrop-matched wash on hover AND on active — `bg-surface` at the `bg`-backed site, `bg-surface-sunken` at the `surface`-backed sites, per the §3 skin lookup (impeccable-gate amendments, critique P1 + audit P2: the text lift alone measures ~12/255 per channel on a 16px stroke — perceptually null — the wash is the established sibling icon-control idiom, and it must be a real neutral step above its own backdrop in both themes; still colour-only, no geometry). Active is **colour-only, no transform**: BL-HEADER-PROBE-RESIDUAL-VACUITY item 2 (BACKLOG-archive.md; graduated 2026-07-27) documents that :active is outside the transition sweep, so geometry must not move in that state; colour-active also gives touch users press feedback where hover never fires. The no-transform contract is asserted by the §7.6 token test.

## §4 Per-site changes

### 4.1 Site A — `step3ReviewSections.tsx`

- Replace the inline `<a>` (`components/admin/wizard/step3ReviewSections.tsx:991-1006`) with `<SheetIconLink href={sheetHref} subjectLabel={label} testId={…same…} ringOffset="bg" className="sm:order-1 sm:ml-0.5" />`. The testid string is unchanged.
- Delete the wrong-precedent sentence (item 3) with the rest of the superseded comment block; the component carries the idiom rationale, the call site keeps only site-specific notes (the §11 instant-presence line, the `sm:order-1` positioning rationale).
- Aria gains "in Google Sheets" (item 4; supersession note §1.7).
- **Item 6 floors:** line 932's `min-h-tap-min` and line 930's `sm:min-h-tap-min` both become conditional on link presence — dropped only when `sub && sheetHref === null` (ratified amendment, impeccable audit P2: keying on `!sub` alone detached the floor from the link it exists to contain; a future sub-block that gains a `sheetHref` now gets its floor back by construction). Guard comment at the site: the floor is SheetIconLink consuming-context requirement 1 and must never detach from the link; today's sub-blocks never carry links (§2 fact), so the Diagrams subordination is unchanged.
- A's consuming context already satisfies §5.1: floor present (top-level rows), left clearance 10px (`gap-2.5`), right side has no interactive neighbour (row end; ≥20px `p-tile-pad` non-interactive padding beyond).

### 4.2 Site B — `PublishedReviewModal.tsx`

- Replace the inline `<a>` (`components/admin/showpage/PublishedReviewModal.tsx:714-729`) with `<SheetIconLink href={openSheetHref} subjectLabel={displayTitle} testId={`${TESTID_BASE}-sheetlink`} ringOffset="surface" className="mr-0.5" />`.
- Title row (`components/admin/showpage/PublishedReviewModal.tsx:707`): `gap-1` → `gap-2.5`, add `min-h-tap-min` (§1.10; contains the overlay vertically so it never reaches the subline).

### 4.3 Site D — `Step3ReviewModal.tsx`

- Replace the inline `<a>` (`components/admin/wizard/Step3ReviewModal.tsx:402-417`) with `<SheetIconLink href={sheetLink} subjectLabel={title} testId={`wizard-step3-card-${dfid}-review-sheetlink`} ringOffset="surface" className="mr-0.5" />`.
- Title row (`components/admin/wizard/Step3ReviewModal.tsx:391`): `gap-1` → `gap-2.5`, add `min-h-tap-min` (contains the overlay vertically — neither the eyebrow above nor the subline below is reachable).
- Reword the comment at `components/admin/wizard/Step3ReviewModal.tsx:27` to stop quoting the label literal (the §7.10 guard pins per-file counts; the comment keeps its heading-safety meaning without the phrase).

### 4.4 Not changed

Site C; `SourceLink`; `DriveConnectionPanel`; `pr-header-link-slot` (§2); aria strings at B/C/D (already canonical).

## §5 Dimensional invariants (single source of truth for all geometry numbers)

| Relationship | Value | Guaranteeing class |
| --- | --- | --- |
| Anchor visual box | 20×20px | `size-5` |
| Icon glyph | 16×16px, centred | `size-4` + `place-items-center` on `inline-grid` |
| Hit overlay width | 10 + 20 + 14 = **44px** | `before:-left-2.5 before:-right-3.5` |
| Hit overlay height | 12 + 20 + 12 = **44px** | `before:-inset-y-3` |
| Left (heading-side) overlay reach | 10px — never exceeds the row gap | `before:-left-2.5` vs `gap-2.5` (10px) on every consuming row |
| Right overlay reach | 14px | `before:-right-3.5` |
| Vertical overlay reach | 12px each way — contained by the row floor | `before:-inset-y-3` inside a 44px `min-h-tap-min` row, anchor centred (`items-center` / row centring) |

### 5.1 Consuming-context requirements (every current and future call site MUST hold all four)

| Requirement | Site A | Sites B/D |
| --- | --- | --- |
| 44px row floor containing the anchor (vertical containment) | `min-h-tap-min` line-1 wrapper below `sm` / `sm:min-h-tap-min` outer row (link-keyed: dropped only when `sub && sheetHref === null`; §4.1 item 6) | ADDED to the title row (§4.2/§4.3) |
| Left interactive clearance ≥ 10px | `gap-2.5` (below `sm`, name side); `gap-2.5` + `sm:ml-0.5` = 12px (pill side, `sm`+) | `gap-2.5` (title side) |
| Right clearance ≥ 14px to the nearest CONTENT box (interactive or not — a chip or pill under the overlay is a capture defect too), or no neighbouring box | no neighbouring box — row end, then ≥20px `p-tile-pad` padding | `mr-0.5` (2px) + shell `gap-3` (12px) = 14px to the cluster's first box (D: state chip; B: state pill — §2) |
| Anchor vertically centred in the floor | row centring (line-1 `items-center`) | title row `items-center` |

The overlay is out-of-flow (`before:absolute`) and invisible to `getBoundingClientRect()` — every 44px assertion must use hit testing (`elementFromPoint`), per the established oracle at `section-header-layout.layout.spec.ts:879`.

**Bleed invariant (item 5, generalised by Codex r1 finding 1):** the overlay must not cover any pixel of ANY neighbouring content box — heading/title text, count, pill, subline, eyebrow, or the actions cluster. With the §5.1 clearances every overlap is exactly 0. §7.7 asserts an empty rect intersection against every neighbouring box, per site.

## §6 Transition inventory

Interaction states: idle, hover, focus-visible, active. Presence: absent, present (orthogonal axis — while absent, no interaction state exists).

| Pair | Treatment |
| --- | --- |
| idle ↔ hover | colour only, `transition-colors duration-fast` (§1.6 caveat: token dead → effectively instant; accepted parity) |
| idle ↔ focus-visible | ring appears — instant, no transition (matches every sibling focus ring) |
| idle ↔ active | colour only, same channel as hover |
| hover ↔ active | no visual change (both `text-text-strong`) — deliberate |
| hover ↔ focus-visible | independent channels (colour vs ring), both rules compose |
| focus-visible ↔ active | colour only |
| absent ↔ present (idle) | instant mount/unmount — presence follows data (§1.9) |
| absent ↔ hover / focus-visible / active | impossible as a transition INTO absent-with-state (no element, no state); on unmount WHILE hovered/focused/active the element disappears instantly, the browser drops hover/focus natively, no exit animation |

Compound states: hover+focus-visible (colour + ring), hover+active (single colour — identical values), focus-visible+active (colour + ring), hover+focus-visible+active (colour + ring). All compose without conflict because exactly one colour channel and one ring channel exist. Presence flip while any interaction state is non-default: instant, as above. No transform in any state or compound (§3 colour rationale, asserted §7.6).

## §7 Test plan (shapes; the plan assigns TDD tasks and each site's RED edge)

Updated:

1. `tests/e2e/published-review-modal.layout.spec.ts:621-625` — the sheetlink rider asserts the anchor's own rect ≥44px; under the overlay idiom the rect is 20px. Rewrite to the hit-testing oracle plus an anti-inflation twin: visible rect < 44px both axes (red on the current 44px box — site B's RED edge), hit-tested target ≥44px both axes.
2. `tests/e2e/section-header-layout.layout.spec.ts` T2 oracle (`tests/e2e/section-header-layout.layout.spec.ts:891-901`) — currently reads one resolved inset component and assumes symmetry. Update to read all four resolved pseudo-element ::before inset components and compute target width = left-reach + 20 + right-reach, height = top-reach + 20 + bottom-reach; assert both ≥44 with the §5 asymmetric values. Comments at lines 874 and 893 updated. Sub-row (level-4 / G4 cells) height expectations change from the 44px floor to natural height at every viewport (item 6; §1.8 supersession; site A's floors RED edge). The pill-side probe (`tests/e2e/section-header-layout.layout.spec.ts:809-832`) stays green (reach shrinks 12→10px against 12px clearance) and is re-derived in comments.
3. `tests/components/admin/review/reviewModalShell.test.tsx:347` byte-for-byte baseline + its fixture — pins **site D's** header (§2): regenerating it is part of the D adoption, recorded in that commit.
4. `tests/components/a11y/newTabAnnouncementBehavior.test.tsx:293` and :304 — site A's expected labels gain "in Google Sheets" (both subject and fallback forms; site A's phrasing RED edge).
5. `tests/components/admin/wizard/Step3ReviewModal.test.tsx:299-310` — the `size-tap-min` className pin becomes the shared-idiom token-set assertion (site D's jsdom RED edge); test name reworded from "44px icon anchor". `tests/components/admin/showpage/publishedReviewModal.test.tsx` labels are already canonical and must stay green untouched.

New:

6. `SheetIconLink` unit suite: aria builder (subject / whitespace-only fallback / `.trim()`), backdrop-skin lookup (each variant's full skin present, other absent), className passthrough, `rel`/`target` hardening, aria-hidden icon, **and the colour/motion contract via SET-EQUALITY** (Codex r2 finding 4 killed the ban-pattern form — negative utilities, `skew-*`, arbitrary transforms, and stacked variants all slipped a prefix regex): the rendered anchor's whitespace-split className token set must EQUAL, exactly, the expected literal set (the §3 base literal ∪ the selected backdrop-skin literal ∪ the tokens of the `className` prop passed in the test). Set-equality makes every unexpected utility — any transform spelling under any variant stack, and `text-text-subtle` — fail by construction, with no enumeration to outgrow (the project's ring-token precedent). This, not the bleed probe, is what narrows BL-HEADER-PROBE-RESIDUAL-VACUITY item 2's untested-:active exposure. Expected label strings and the expected token set are literals in the test, never imported from the component.
7. **Edge-complete bleed assertions via RECT INTERSECTION** (Codex r3 finding 1 killed the coordinate-probe form — a centred line-2 pill does not span the link's centre-x, "1px below the row" lands in `mt-0.5` margin, and the shell's `items-start` puts the link's centre-y below D's ~24px chip; hand-picked probe points cannot be guaranteed to land inside their named neighbour). The replacement needs no coordinate guessing: compute the OVERLAY RECT as the anchor's `getBoundingClientRect()` expanded by the four resolved pseudo-element ::before inset components (exactly the §7.2 oracle's computation), read each neighbour's own rect, and assert the **intersection is empty** for EVERY neighbouring content box — title/heading, count, pill, subline, eyebrow, action-cluster chip — regardless of where that box sits. Pure geometry, immune to margins, centring, and alignment offsets. Per site, the asserted neighbour sets:
   - **A, below `sm` (saturated-name cell added to `_sectionHeaderCellHarness.tsx` — long name + count filling the row at 320/375):** count node (`step3ReviewSections.tsx:970-976`), heading, line-2 pill (`step3ReviewSections.tsx:1014-1027`).
   - **A, `sm`+:** inline pill (both orders — the PILLED case carries the executable saturated adjacency: gap-2.5 + sm:ml-0.5 = 12px pinned by construction; the no-pill order is a containment-only proof, its layout free space by construction (left-aligned name, flex-1 slack) and documented as such, never claimed saturated — whole-diff F3 disposition), count/heading. The existing `elementFromPoint` case (`tests/e2e/section-header-layout.layout.spec.ts:809-832`) is retained as the paint-order spot check and re-derived for the 10px reach.
   - **B and D (saturated long title — precedent `tests/e2e/step3-review-modal.layout.spec.ts:613-639`):** title box, subline, D's eyebrow, the action cluster's FIRST content box (D: state chip `Step3ReviewModal.tsx:443-465`; B: state pill `PublishedReviewModal.tsx:879-901`) and the close button.
   - **RED edge + anti-vacuity (wording corrected per Codex r4):** every shipped assertion is the SAME empty-intersection check. The TDD red run executes the new suite against the pre-fix tree, where the saturated count-node case MUST fail — the old 12px reach overlaps the 10px-distant count by 2px — and that observed failure (recorded as the RED count in the task's commit message, per the plan's global TDD constraint) is what proves the mechanism detects the defect. No inverted assertion ships. The remaining intersections are containment proofs that are green on both trees; each asserts its neighbour rect is non-degenerate (width and height > 0) so an unrendered neighbour cannot green-wash the case.
   - One `elementFromPoint` spot check per site (inside the overlay → resolves to the link; the §7.8/T2 hit tests already cover this angle) keeps paint-order honest alongside the geometry.
8. Site D tap coverage (none exists today): hit-tested ≥44×44 in `tests/e2e/step3-review-modal.layout.spec.ts`.
9. Sub-block footprint: Diagrams header line height < 44px and ≥ 24px (the icon chip — so a collapsed row cannot pass) at 375 and 1280 (real browser), pinning item 6.
10. **Adoption catcher (Codex r1 finding 3; predicate corrected per r2 finding 1 — the exactly-one-file form could never go green, since sites C and the agenda link legitimately keep the phrase):** a structural containment guard walking `components/**/*.tsx` (filesystem walk, not a named list) asserting **per-file occurrence counts of the literal `Open the source sheet` as set-equality**: components/admin/SheetIconLink.tsx = 2 (subject + fallback literals), `components/admin/wizard/Step3SheetCard.tsx` = 1 (§1.5 text link), `components/admin/wizard/step3ReviewSections.tsx` = 1 (§1.11 agenda text link — the header-block occurrences at `components/admin/wizard/step3ReviewSections.tsx:989-1000` die with the A swap), every other file = 0. Count-pinning keeps the guard live even inside allowlisted files: a re-inlined anchor anywhere bumps a count and fails. Consequence for D: the label-quoting comment at `Step3ReviewModal.tsx:27` is reworded during the D adoption (meaning kept, literal dropped — §4.3). Red until the last site adopts; lands with the final adoption task. **Call-site className contract (whole-diff r5 amendment; TS-AST since r7; DEFAULT-DENY since r8):** the same guard file asserts, by TypeScript-AST parse of every walked source file (`.js`/`.jsx`/`.mts`/`.cts`/`.mdx` and the root `mdx-components.tsx` included), that every reference to the `SheetIconLink` identifier outside the component's own file is one of exactly two sanctioned shapes — an un-renamed `import { SheetIconLink }` specifier, or a JSX tag whose attributes carry no spread and whose `className`, when present, is a plain string literal with every token in the closed positional allowlist (responsive-prefixed non-negative margin 0-3 in half steps, and order utilities). ANY other reference (assignment, destructuring, parameter default, object property, default export, export clause, property access, …) and any non-sanctioned import/export of the component module path fail by construction. Static alias creation requires the identifier or the module path, so the consumer-bypass class is closed by construction, not enumeration; runtime indirection is out of a static guard's reach and explicitly out of scope. Negative plants pin every form.

Every geometry expectation derives from §5's table, not hardcoded independently. Invariant-8 impeccable dual-gate (critique + audit) runs on the affected diff before cross-model review; UI is Opus-owned.

## §8 Out of scope

Dead `duration-fast` token repair (§1.6); crew surfaces; DriveConnectionPanel; centred-title decision (§1.2); any change to `buildSheetDeepLink` or link resolution; BL-HEADER-PROBE-RESIDUAL-VACUITY items (separate entry — §7.6's no-transform token assertion narrows its untested-:active exposure at these sites; nothing else there is touched).
