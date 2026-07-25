# Section-header rebuild + childless-spacer sweep (2026-07-25)

**Status:** spec, awaiting adversarial review.
**Branch:** `feat/section-header-rebuild-phantom-spacers`.
**Backlog items closed:** `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`, `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET`.

---

## 1. Why

`BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW` was filed as a 20px wasted-gap item: `ModalSectionChrome`'s header row holds a childless `<span className="flex-1" />` (`components/admin/wizard/step3ReviewSections.tsx:916`) that collapses to zero width in a crowded row while the row still charges `gap-2.5` on both sides of it.

**Measurement refutes the framing and finds something worse.** Only one of those two gaps is waste (the other is legitimate separation between the count and the pill), so the gap cost is **10px, not 20px**. The real defect is that on a flagged section at phone width the row runs out of space and the *section name* is what yields:

| viewport | header row content box | header height | section name |
| -------- | --------------------- | ------------- | ------------ |
| 320px    | 280px                 | **124px**     | **26.7px across 5 lines** |
| 360px    | 320px                 | 49.6px        | 66.8px, 2 lines |
| 375px    | 335px                 | 49.6px        | 81.8px, 2 lines |
| 390px    | 350px                 | 49.6px        | 96.8px, 2 lines |
| 430px    | 390px                 | 44px          | 116.2px, 1 line |
| 1280px   | 561px                 | 44px          | 116.2px, 1 line |

At 320px the row is **2.8× its normal height** and the name is unreadable. Every number in this spec was measured in Chromium against the real component via the DB-free static harness (`tests/e2e/_step3ReviewModalHarness.tsx`, driven under the pattern that `tests/e2e/step3-review-modal.layout.spec.ts:118-190` establishes), at the header row's real content-box widths — never estimated. §11 records the measurement method so the plan can reproduce it.

Repairing only the 10px gap does **not** fix this: measured, it buys the name 10px and leaves 5 lines at 320px and 2 lines at 375px. The header content itself has to change.

## 1.1 Resolved scope — do not relitigate

Each row is a decision already taken, with its ratification. Verify the citation; do not re-derive.

| # | Decision | Ratified |
| - | -------- | -------- |
| 1 | **Layout is D1: name + count centered, sheet link in the right corner.** Owner-selected 2026-07-25 from a measured 4-way comparison (C1 name+link centered / D1 / D2 all-centered / D3 balanced-gutter). | Owner decision, this session. §3.1 carries the measurements. |
| 2 | **The pill gets its own centered line; it does NOT stay inline.** A centered name and an inline pill cannot share a row: measured, the inline variant reintroduces a 2-line name at 320px (the original bug) and lands the name 48–60px off the row's axis. | §3.1.4, measured. |
| 3 | **Flagged/judgment sections therefore cost 72.8px instead of 44px, at every width.** Accepted. Only sections that need attention pay it; every ordinary section stays a single 44px row. This is the trade the centered layout forces — not an oversight. | §3.1.4. |
| 4 | **Sheet link is a 20px glyph with a `before:inset-[-12px]` expanded hit area, NOT the `size-tap-min` box the card header uses.** Deliberate deviation from `components/admin/wizard/Step3ReviewModal.tsx:409`. Measured: a 44px corner box outweighs the 28px status icon and drags the name 8–29px left; the 20px glyph holds it within 4–17px. The 44px touch target is fully preserved (20 + 2×12 = 44). Hit-area idiom precedent: `components/admin/HoverHelp.tsx:537`. | §3.1.3, measured. |
| 5 | **The name's residual off-centre spread across states (+4px to −17px) is accepted.** It follows from putting the count inside the centered group, which is decision 1. Not a defect to be engineered away with a compensating spacer. | §3.1.5. |
| 6 | **The empty right corner is compensated with padding on the group, NOT a reserved spacer element.** Measured identical geometry (+4px / +2px) both ways; padding adds no element to a gapped row, which is this batch's whole point. | §3.1.5, measured. |
| 7 | **`components/admin/showpage/ShowReviewModalSkeleton.tsx:152` keeps its `flex-1` Skeleton.** Its row is `flex w-full items-center gap-2` with one sibling and a `w-full` parent, so the bar always has width — it is not a collapsing pusher. It is the single allowlisted row in the §6 guard registry. | §6. |
| 8 | **`components/crew/sections/TravelSection.tsx:588` needs no fix — REFUTED, do not re-raise.** It looks like a second blank-eyebrow instance (identical classes) but its `<p>` always contains a `<span>` child, so the empty-element selector can never match. More importantly it is unreachable-blank: it renders only under `showStructured = seg.structured && hasContent` (`components/crew/sections/TravelSection.tsx:572`), and the `dateRaw: null` construction sets `structured: false` (`lib/crew/flightDisplay.ts:184`); structured segments always carry a `dateRaw` (`lib/crew/flightDisplay.ts:152`). | §3.3. |
| 9 | **No new error codes, no §12.4 catalog edits, no migrations.** This batch is presentational plus test wiring. The three-way §12.4 lockstep and the `validation-schema-parity` gate are therefore N/A. | §7. |

## 2. Current state (cited)

| Site | Shape | Flattens today? |
| ---- | ----- | --------------- |
| `components/admin/wizard/step3ReviewSections.tsx:916` | childless `<span className="flex-1" />`, pushes pill + sheet link right | **Yes** — 0px wide, charging 10px each side, on flagged sections at ≤390px |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | `<span aria-hidden className="h-px flex-1 bg-border" />` — decorative hairline | Not measured (no probe mounts this surface) |
| `components/admin/BellPanel.tsx:323` | childless `<span className="flex-1" />` in `flex flex-wrap items-center gap-x-2 gap-y-1` | Not measured |
| `components/admin/nav/AdminNav.tsx:144` | childless `<div className="flex-1" />` | Not measured |
| `components/admin/nav/OnboardingTopBar.tsx:67` | childless `<div className="flex-1" />` | Not measured |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` | `<Skeleton className="h-11 flex-1 rounded-sm" />` | No — never crowded (§1.1 item 7) |

Ledgered debt to be repaid (both assert exact occurrence counts, and both files' stale-row assertions fail if a row outlives its repair):

- `tests/e2e/admin-layout-dimensions.spec.ts:500` — `KNOWN_SHOW_MODAL_PHANTOM_ITEMS`, 2 rows (`rooms`, `warnings`), width 375, `axis: "column-gap"`, `gap: 10`, `count: 1`.
- `tests/e2e/crew-layout-dimensions.spec.ts:1037` — `KNOWN_CREW_PHANTOM_ITEMS`, 2 rows (widths 390 and 1000), `axis: "row-gap"`, `gap: 2`, `count: 2`.

`ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:850`) is the component under change. Its header row is at `components/admin/wizard/step3ReviewSections.tsx:892` (`flex items-center gap-2.5`, with `mb-2`/`mb-3` by variant).

## 3. The change

### 3.1 `ModalSectionChrome` header (`step3ReviewSections.tsx:850-941`)

#### 3.1.1 Target structure

The outer element becomes a column; the header line and the pill line are its two children.

```
<div className={`${sub ? "mb-2" : "mb-3"} flex w-full flex-col items-stretch gap-1.5`}>
  <div className="flex w-full min-h-tap-min items-center gap-2.5">   ← header line
    {statusIcon}                                                 ← unchanged tones
    <div className={`flex min-w-0 flex-1 items-center justify-center gap-1.5${linkless ? " pr-header-link-slot" : ""}`}>
      <Heading …>{label}</Heading>
      {showCount ? <span …>({count})</span> : null}
    </div>
    {sheetHref !== null ? <a … /> : null}                        ← 20px glyph, corner
  </div>
  {pill !== null ? <div className="flex w-full justify-center">{pill}</div> : null}
</div>
```

The childless `flex-1` spacer at `components/admin/wizard/step3ReviewSections.tsx:916` is **deleted**, not repurposed.

#### 3.1.2 Count placement

The count moves from a right-hand sibling into the centered group, immediately after the heading. It stays **outside** the `<Heading>` element so the heading's accessible name remains the section name alone. `showCount` logic is unchanged — it still comes from `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708`), which returns false unless the section is in `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:697` — `crew`, `contacts`, `rooms`, `warnings`) with a non-null count and a real `sectionId`, and additionally suppresses a flagged `(0)`.

**Consequence worth stating:** only 4 of the ~13 rendered sections ever show a count, so the name-only geometry is the common case, not the exception. Both are specified below.

#### 3.1.3 Sheet link

Becomes icon-only, in the right corner:

```
className="relative inline-grid size-5 shrink-0 place-items-center rounded-sm text-text-subtle
           transition-colors duration-fast hover:text-text
           before:absolute before:inset-[-12px] before:content-['']
           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring
           focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
```

with `<ExternalLink aria-hidden="true" className="size-4" />` inside. The existing `aria-label={`Open the source sheet for ${label}`}` and the `target="_blank" rel="noopener noreferrer"` pair are **unchanged**, so removing the visible words "In sheet" costs nothing to assistive tech. Touch target: 20 + 2×12 = **44px**, satisfying the `min-h-tap-min` floor without a 44px visual box. See §1.1 item 4 for why this deviates from the card header.

`sheetHref` remains null for the Diagrams sub-block (no `dfid`) and for "Report an issue" (`sectionId === "report"`), per the existing derivation at `components/admin/wizard/step3ReviewSections.tsx:884-888`.

#### 3.1.4 Pill line

The flag pill ("Needs a look") and the judgment pill ("Parsed with judgment") are mutually exclusive (`judgment = chrome.judgment === true && !flagged`, `components/admin/wizard/step3ReviewSections.tsx:871`). Whichever renders moves to its own line, centered. When neither renders, **no second line and no wrapper element is emitted** — the header collapses to a single 44px row. This is a real requirement, not a nicety: an always-rendered empty wrapper inside the new `flex flex-col gap-1.5` would charge 6px and recreate exactly the class this batch removes.

Measured heights: **72.8px** with a pill, **44px** without, at every width from 320px to 1280px.

#### 3.1.5 Centring geometry (measured)

Distance of the name's text from the header row's true horizontal centre, at 375px (row 335px). Negative = left of centre.

| State | Sections | Offset |
| ----- | -------- | ------ |
| no count, link present | venue, event details, crew schedule, hotels, transport, pack list, billing & docs | **+4px** |
| count present, link present | crew, contacts, rooms, warnings | **−8.4px** |
| count present, link, longest real name + 3-digit count | `Sheet warnings (128)` | **−17px** |
| no count, no link, `pr-header-link-slot` | report an issue | **+4px** |
| sub-block, no count, no link, `pr-header-link-slot` | diagrams | **+2px** |

The compensation is a NAMED token, not a raw pixel utility: `--spacing-header-link-slot: 30px` (= the link's 20px footprint + the row's 10px `gap-2.5`) is added to the `@theme` spacing block in `app/globals.css` beside `--spacing-tap-min` and documented in `DESIGN.md`, then consumed as `pr-header-link-slot`. A raw `pr-[30px]` would violate `DESIGN.md:361` ("Components MUST NOT hardcode hex values, ms values, or px spacing magic numbers"), which round 1 correctly flagged. `--spacing-confirm-box` (`app/globals.css:169`) is the precedent for a measured, commented token. Without it those two sections drift to **+19px** and **+17px** — visibly off-axis against neighbouring sections. With it they match the common case. Measured identical to a reserved 20px spacer element; padding is chosen because it adds no element (§1.1 item 6).

### 3.2 The four childless pushers

| Site | Change |
| ---- | ------ |
| `components/admin/BellPanel.tsx:323` | Delete the spacer; add `ml-auto` to the right-hand content. Right content is present iff `!entry.isHealth`, and is either the auto-note `<p>` or the resolve `<button>` — **both** get it. |
| `components/admin/nav/AdminNav.tsx:144` | Delete the spacer; add `ml-auto` to the following action-cluster `<div>` (`components/admin/nav/AdminNav.tsx:146`). Always rendered, so no empty-state case. |
| `components/admin/nav/OnboardingTopBar.tsx:67` | Delete the spacer; add `ml-auto` to the following action-cluster `<div>` (`components/admin/nav/OnboardingTopBar.tsx:69`). Always rendered. |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | **Not a pusher** — a decorative hairline. Apply the settled `DESIGN.md` §7a rule: `hidden min-[N]:block` plus a `min-w-*` floor, `N` **measured**, not assumed. |

`ml-auto` (not `justify-between`) is the established idiom here: `components/admin/CompactAlertCard.tsx:138` records why — "a lone child under `justify-between` sits at the START edge". Nothing moves visually on any of these three; they are not crowded today.

For `components/admin/wizard/step3ReviewSections.tsx:2150`, the plan measures the width at which the hairline first draws non-zero and uses that as `N`, mirroring how `components/admin/BulkIgnoreControls.tsx:202` arrived at `min-[480px]:block` with a `min-w-6` floor. **`N` is an output of the plan's measurement task, not a value this spec asserts.**

### 3.3 TravelRow eyebrow (`components/crew/sections/TravelSection.tsx:121`)

Add `empty:hidden` to the eyebrow `<p>`. A ground leg whose stage was promoted to the primary line passes `label=""` (`components/crew/sections/TravelSection.tsx:403`), and `label` is typed `string` (`components/crew/sections/TravelSection.tsx:92`), so React renders no child node at all and the empty-element selector matches. The element keeps its documented slot and costs nothing when blank — the `DESIGN.md` §7a idiom.

**Caveat to carry into the plan:** a literal space or `{" "}` inside that `<p>` silently re-enables the 2px gap. The test must assert rendered geometry, not the class.

`components/crew/sections/TravelSection.tsx:588` is **not** a second instance — see §1.1 item 8.

### 3.4 Archived-bucket probe

`T-NOPHANTOM-DASH` measures `/admin` in its active bucket only; `tests/e2e/admin-layout-dimensions.spec.ts:362-367` records why the archived bucket was left out — `pnpm db:seed` seeds no archived shows, so a probe there would anchor on nothing and be vacuously green.

The archived fixture already exists: `supabase/seedWalkerFixtures.ts` seeds `walker-archived-2026` with `archived: true` (`supabase/seedWalkerFixtures.ts:117-123`). So this is wiring, not a new fixture.

1. In `.github/workflows/phantom-gap-e2e.yml`, run `pnpm dlx tsx supabase/seedWalkerFixtures.ts` after the existing `pnpm db:seed` step.
2. Add a `T-NOPHANTOM-DASH [archived]` case at both existing widths (390, 1280) navigating `/admin?bucket=archived`.
3. Anchor non-vacuity on `archived-show-row-walker-archived-2026` (`components/admin/ArchivedShowRow.tsx:48` is the testid template). The anchor must be **captured from a live `visited` dump**, not guessed — `tests/e2e/admin-layout-dimensions.spec.ts:370-376` records that the active-bucket anchors had to be, because a container whose children carry testids never enters `visited` under its own name.

`supabase/seed*` is already a workflow path trigger, so no trigger edit is needed for the seed change; `.github/workflows/phantom-gap-e2e.yml` triggers on itself.

### 3.5 Ledger deletions

Delete all four rows named in §2. The stale-row assertion in each file fails if a repaired row is kept, so these deletions are load-bearing and cannot be deferred.

## 4. Mode boundaries and guard conditions

**There is no `sheetHref` prop.** It is a local derived at `components/admin/wizard/step3ReviewSections.tsx:884-888` from the
OPTIONAL `chrome.dfid` and `chrome.sectionId` (both `?:` at `components/admin/wizard/step3ReviewSections.tsx:513-514`). The
spec's round-1 wording treated it as an input; the real inputs are `dfid × sectionId × status ×
count × headingLevel`, and the derivation is what §3.1 keys the padded geometry on. The
implementation reads a single local `linkless = sheetHref === null`.

| Input | Values | Effect |
| ----- | ------ | ------ |
| `chrome.dfid` | `string \| undefined`, **and `""` is reachable** | Falsy ⇒ `sheetHref` null ⇒ linkless + padded. `""` is not hypothetical: published data carries `driveFileId: string \| null` (`components/admin/review/sectionData.ts:59`) and `components/admin/review/ShowReviewSurface.tsx:251` coerces null to `dfid = ""`. |
| `chrome.sectionId` | `SectionId \| undefined` | `undefined` (sub-block) ⇒ no count AND no link. `"report"` ⇒ no link (excluded at `components/admin/wizard/step3ReviewSections.tsx:887`). |
| `headingLevel` | 3 (default) / 4 | 4 ⇒ `sub`: `<h4>`, `text-sm`, `size-6` icon, `mb-2`. 3 ⇒ `<h3>`, `text-base`, `size-7` icon, `mb-3`. Same three-slot row, same `gap-2.5`. |
| status | `flagged` / `judgment` / clean | `flagged` ⇒ amber chip + "Needs a look" pill. `judgment` (`=== true && !flagged`, `components/admin/wizard/step3ReviewSections.tsx:871`) ⇒ info chip + "Parsed with judgment" pill. Clean ⇒ sunken chip, **no pill line**. |
| `count` | `number \| null` | Chip renders only when `shouldShowSectionCount` is true (`components/admin/wizard/step3ReviewSections.tsx:708`). |

### 4.1 Which sections are linkless — corrected

Round 2 **refuted** the round-2 claim that published mode is linkless for every section, and it
was right. `components/admin/review/publishedAdapter.ts:102` preserves `show.drive_file_id`, and
that column is `not null` in the schema
(`supabase/migrations/20260501000000_initial_public_schema.sql:5`). So `data.driveFileId` is
populated for real published shows and the `?? ""` at
`components/admin/review/ShowReviewSurface.tsx:248-251` is **defensive**, not the normal path.

Round 1 flagged the `?? ""` coercion and this spec over-generalised from it without checking
whether `null` was reachable. Recorded so neither claim is re-derived.

The real taxonomy — three cases, not one:

| Case | Sections | Link? |
| ---- | -------- | ----- |
| Staged, and valid published | every top-level section **except** `report` | link present |
| `report` ("Report an issue") | one | linkless — excluded at `components/admin/wizard/step3ReviewSections.tsx:887` |
| Diagrams sub-block | one | linkless — no `dfid`, no `sectionId`, `headingLevel: 4` |
| Defensive: malformed / null published data (`dfid === ""`) | all top-level sections | linkless — a defensive state, NOT the normal published state |

So the padded (`pr-header-link-slot`) geometry is the **two-section case plus a defensive
fallback**, exactly as §3.1.5 measured — not a published default. Consequences for testing:

- §3.1.5's measured offsets stand for the states they name.
- The plan measures padded × counted / flagged / judgment as the **defensive** cells (reachable
  only with malformed data), and must label them that way rather than as the published norm.

### 4.2 Invalid numbers

`count: number | null` does not exclude `NaN`, `Infinity`, or `-Infinity`, and
`shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708-714`) tests only `null`, membership, and
`count === 0 && flagged` — so `NaN` would reach the chip and render "(NaN)".

**Disposition:** the plan adds a guard so a non-finite count is treated as absent
(`Number.isFinite(count)` gate), with a unit test passing **all three** named values — `NaN`,
`Infinity`, AND `-Infinity`. Round 2 correctly noted that testing only the first two lets an
implementation that accepts `-Infinity` pass. This is
specified rather than dismissed as unreachable, because the count arrives from parsed sheet
data and "prove it unreachable" is a stronger claim than the code currently supports.

### 4.3 Empty/zero/null sweep

`count === 0` ⇒ `(0)` renders only when not flagged. `count === null` / non-finite ⇒ chip
omitted. `dfid === ""` or `undefined` ⇒ linkless + padded. `sectionId === undefined` ⇒ no count
and no link, combined with `sub` in the Diagrams case — the narrowest geometry (§3.1.5, +2px).
`label` is typed `string` (`components/admin/wizard/step3ReviewSections.tsx:855` via `chrome.label`) and reaches
`ModalSectionChrome` dynamically from the `step3Sections` registry through
`components/admin/review/ShowReviewSurface.tsx:1063` — **not** from the `BreakdownSection`
`label=` literals, which round-1 §4 mis-cited. An empty label would render icon + empty group +
link with no crash; no caller produces one.

## 5. Dimensional invariants

Tailwind v4 does not default `.flex` to `align-items: stretch`, so every relationship below is stated explicitly and must be asserted in a real browser (jsdom computes no layout).

| Parent | Child | Invariant | Guaranteed by |
| ------ | ----- | --------- | ------------- |
| header line | status icon | icon keeps its intrinsic 28px (sub: 24px); never shrinks | `shrink-0` + `size-7`/`size-6` on the icon |
| header line | centered group | group absorbs all free width | `flex-1` + `min-w-0` on the group |
| header line | sheet link | link keeps 20px; never shrinks or grows | `shrink-0` + `size-5` |
| header line | itself | line is ≥44px tall in every state | `min-h-tap-min` on the line |
| centered group | heading | heading may shrink and wrap-break; never forces overflow | `min-w-0` + `wrap-break-word` on the heading |
| centered group | count | count keeps intrinsic width | `shrink-0` |
| content pane | registry section (`components/admin/review/ShowReviewSurface.tsx:1055`, `flex min-w-0 flex-col`) | spans the pane's inner width | pre-existing; asserted as the chain's root so an upstream regression is attributed correctly |
| registry section | breakdown section (`components/admin/wizard/step3ReviewSections.tsx:999`, `flex min-w-0 flex-col`) | spans the registry section | pre-existing |
| breakdown section | outer column | column spans the breakdown section's inner width | `w-full` on the outer column — **both wrappers are `flex-col` and Tailwind v4 does NOT stretch flex children by default**, so this is explicit at every level |
| breakdown section | panel card (`components/admin/wizard/step3ReviewSections.tsx:942`) | card spans the same width as the outer column — siblings that must not diverge | asserted: `panelCard.width === outerColumn.width` |
| outer column | header line | line spans the column | `items-stretch` on the column **plus** `w-full` on the header line |
| outer column | pill line | line spans the column, so `justify-center` centres against the full width | `items-stretch` on the column **plus** `w-full` on the pill line |
| sheet link | its hit area | ≥44×44 despite a 20px box | `relative` + `before:absolute before:inset-[-12px]` |

Height invariants to assert (epsilon **±0.5px**): header line 44px in every state; whole header
44px with no pill and 72.8px with one, at 320/375/430/1280.

**Width invariants to assert in a real browser** — rounds 1 and 2 both raised this, and the
round-2 edit silently failed to land, so it is spelled out here. The FULL chain, each within
±0.5px: `registrySection.width === pane.clientWidth`;
`breakdownSection.width === registrySection.clientWidth`;
`outerColumn.width === breakdownSection.clientWidth`;
`headerLine.width === pillLine.width === outerColumn.width`; and
`panelCard.width === outerColumn.width`. `flex justify-center` centres a pill INSIDE its wrapper
— it does not make the wrapper span its parent. Without these equalities every offset in §3.1.5
is measured against the wrong box, and a regression at the registry-section or panel-card
boundary stays invisible and mis-attributed.

## 6. Static guard — childless growable elements

Round-1 review established that the round-1 design could not satisfy its own set-equality
contract, and that its detector had several fail-open shapes. This section is the corrected
design; the registry below is **enumerated from an actual run of the detector**, not estimated.

### 6.1 Semantic scope (axis-aware)

The defect is: *an in-flow child of a gapped flex/grid container has zero extent along the
container's main axis, so the container spends a gap on something invisible.* A fixed size on
ONE axis does not rule it out — `h-px` fixes height and still collapses to zero WIDTH in a row
(that is precisely the `components/admin/wizard/step3ReviewSections.tsx:2150` hairline), and `w-6` fixes width and still collapses to zero
HEIGHT in a column. So the guard MUST NOT treat "has a size token" as a clearance.

Because the parent's axis and gap are not reliably knowable statically, the guard does not try
to prove the defect. It asserts a **membership** contract instead: every childless element that
carries a growable token, or whose classes cannot be shown to be growable-free, must be a known
row. Registered rows carry a justification; anything new fails.

**Scope claim, narrowed (round-2 finding 3).** This guard does NOT close the defect class
repo-wide, and the spec no longer claims it does. It closes one **syntactic subset**: a
statically-recognisable growable token, or an unresolvable className, on a syntactically
childless element. Three shapes are explicitly OUT of the guard's reach:

1. **Runtime-empty, not syntactically childless** — `<span className="flex-1">{null}</span>` has a
   JSX child expression, so the classifier does not see it as childless, yet it is zero-extent at
   runtime.
2. **Style-only pushers the regex cannot read** — `style={SPACER_STYLE}`, a spread
   (`style={{ ...base }}`), or `flexBasis` supplied via an identifier. The literal
   `style={{ flexGrow: 1 }}` form IS covered; an indirected one is not.
3. **Shrink-to-zero items that carry no growable token at all** — a childless `basis-1/2`, or a
   `w-*` item in a row / `h-*` item in a column with no `shrink-0` and no minimum, can still be
   squeezed to zero because the parent axis is unknown. This is why §6.5 deliberately keeps
   "generic fixed-size element clears" as a NEGATIVE control: treating a one-axis size token as
   proof of extent is precisely the error §6.1 warns about, so the guard does not attempt it.

Those three remain covered by the runtime phantom-gap probes, which measure realised extent and
do not care about syntax. The guard is the cheap repo-wide tripwire for the common shape; the
probes remain the proof for the measured surfaces. Neither subsumes the other, and §7 states the
same boundary.

### 6.2 What counts as childless

- **DOM tags only for the automatic decision.** A self-closing *component* tag says nothing
  about what it renders: `<FilterTextInput />` (`components/admin/telemetry/EventFilters.tsx:74`)
  renders an `<input>`. Treating every self-closing component as childless mis-classifies it.
- **But excluding components entirely is a hole**, because a className-forwarding wrapper is a
  real spacer: `<Skeleton className="h-11 flex-1 rounded-sm" />`
  (`components/admin/showpage/ShowReviewModalSkeleton.tsx:152`) forwards to a single `div`.
  Component tags carrying a growable token are therefore ALSO registry rows — classified by hand,
  never auto-cleared.
- Void DOM tags (`input`, `img`, `br`, `hr`, `source`, `track`, `area`, `col`) are legitimately
  childless and are excluded.

### 6.3 Growable tokens and fail-closed shapes

Recognised: `flex-1`, `grow`, `flex-auto`, `basis-full`, and arbitrary `flex-[…]`, `grow-[…]`,
`basis-[…]`. Also `style={{ flexGrow: n }}` / `style={{ flex: n }}` for non-zero `n` — a
className-only scan misses the style prop entirely.

**Fail closed, never open.** Classes are resolved by concatenating the STATIC parts of string
literals, template literals, ternaries, arrays, `.join(…)`, and `+` concatenation. A part that
is an identifier, member access, or unresolvable call (an imported/shared class constant, a
`cn()` result) makes the element **opaque**, and opaque ⇒ must be registered. Unresolvable is
never treated as clear.

### 6.4 Registry — enumerated from a detector run (current tree)

**17 rows total: 13 DOM-tag + 4 component-tag.** Verified by running the detector over
`components/**` + `app/**` (244 files, 109 childless DOM elements with a className).

DOM tags — growable (8):

| Site | Disposition |
| ---- | ----------- |
| `components/admin/wizard/step3ReviewSections.tsx:916` | REPAIRED by §3.1 — row removed |
| `components/admin/BellPanel.tsx:323` | REPAIRED by §3.2 — row removed |
| `components/admin/nav/AdminNav.tsx:144` | REPAIRED by §3.2 — row removed |
| `components/admin/nav/OnboardingTopBar.tsx:67` | REPAIRED by §3.2 — row removed |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | KEEPS a row — decorative rule, floored per §3.2 |
| `components/admin/BulkIgnoreControls.tsx:200` | KEEPS a row — the already-repaired precedent (`hidden` + `min-w-6`) |
| `components/admin/OnboardingWizard.tsx:196` | KEEPS a row — step connector; the plan must verify it cannot reach zero extent, or floor it |
| `components/crew/RightNowHero.tsx:549` | KEEPS a row — progress segments that share a row; the plan must verify siblings guarantee width |

DOM tags — opaque (5), all fixed-size today, registered so a future growable edit fails:
`components/admin/BellPanel.tsx:575`, `components/admin/BellPanel.tsx:611`, `components/admin/review/ShowReviewSurface.tsx:947`,
`components/admin/review/ShowReviewSurface.tsx:1013`, `components/admin/settings/DeveloperToggleButton.tsx:96`.

Component tags (4): growable — `ShowReviewModalSkeleton.tsx:152` (keeps a row, §1.1 item 7),
`EventFilters.tsx:74` (keeps a row — renders an `<input>`, not a spacer); opaque —
`ReSyncButton.tsx:339`, `step3ReviewSections.tsx:2061`.

**Registry after the repairs: 13 rows.** The four repaired rows are deleted by the tasks that
repair them, so a stale row is a failure exactly like a new match.

### 6.5 Controls (test 9 must cover every supported syntax)

Round 1 noted that exercising only `flex-1` plus one fixed-size negative lets a `flex-1`-only
implementation pass; round 2 showed the follow-up list was still short of the resolver branches
§6.3 claims. **One distinct positive control per supported form — no form may be claimed without
one:**

| Form | Control |
| ---- | ------- |
| `flex-1`, `grow`, `flex-auto`, `basis-full` | one each |
| arbitrary `flex-[2_2_0%]`, `grow-[3]`, **`basis-[50%]`** | one each |
| **variant-prefixed** `sm:flex-1` | one — and §6.3 must state whether a variant-gated growable counts (it does: it is growable at some width) |
| `style={{ flexGrow: 1 }}` **and `style={{ flex: 1 }}`** | one each |
| template literal with a growable static part | one |
| array + `.join(" ")` with a growable element | one |
| **ternary** composition | one |
| **`+` string concatenation** | one |
| opaque **identifier** className | one |
| opaque **member access** (`styles.foo`) | one |
| opaque **call** (`cn(...)`, `clsx(...)`) | one |
| **component tag** carrying a growable token | one |

Negative controls: a fixed-size DOM element (see §6.1 — this is a deliberate limitation, not a
proof of extent), a void tag, and a self-closing component with no growable token. Plus the
walker must report a non-empty, named file set, so "found nothing" cannot pass.
## 7. Not in scope

- No new §12.4 error codes, no `lib/messages/catalog.ts` edits, no `pnpm gen:spec-codes` run. Nothing here surfaces a code to a user.
- No migrations, so `pnpm gen:schema-manifest` and the validation-project apply are N/A, and `validation-schema-parity` is unaffected.
- No change to `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708`), `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:697`), or `buildSheetDeepLink` behaviour — the count and link *placement* changes, their *derivation* does not.
- `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` unchanged (§1.1 item 7).
- `components/crew/sections/TravelSection.tsx:588` unchanged (§1.1 item 8).
- The three unmeasured pusher sites get `ml-auto` and the §9.3 test-10 trailing-alignment assertions, but **no new phantom-gap probe mount**. Per §6.1's narrowed scope the static guard closes only a syntactic subset — it is a tripwire, not repo-wide closure — so the boundary is stated honestly in both places: the three shapes it cannot reach stay covered by the existing runtime probes on the measured surfaces, and the pusher repairs get direct geometry assertions instead. Ratified deviation from BACKLOG.md:48 (root), reasoned in §9.3.

## 8. Transition inventory

The header has 3 pill states (flag / judgment / none) × 2 count states × 2 link states × 2 heading levels. Presence of each element follows **data**, not a user-driven state change. **The header CAN change while mounted.** `key={showId}` (`app/admin/_showReviewModal.tsx:413-419`) remounts only when the SHOW changes; `router.refresh()` reconciles fresh data for the same show under the same key in place (`components/admin/showpage/PublishedReviewModal.tsx:162-174`), so a pill or count can appear, change, or disappear on a mounted header. Rounds 1 and 2 both flagged this; the round-2 correction did not land because the edit was applied without an assertion. The treatment stays instant — but the reason is that same-key reconciliation is deliberately unanimated, NOT that the change only happens across a remount.

| Transition | Treatment |
| ---------- | --------- |
| none → flag pill | **instant — deliberate.** Matches the existing contract comment at `components/admin/wizard/step3ReviewSections.tsx:927` and `Step3ReviewModal.tsx:401` (the comment reads "instant / deliberate", noting that link presence follows data rather than a state transition). |
| none → judgment pill | instant — deliberate, same reason |
| flag ↔ judgment | instant — deliberate; mutually exclusive and data-derived (`components/admin/wizard/step3ReviewSections.tsx:871`) |
| count shown ↔ hidden | instant — deliberate; derived from `shouldShowSectionCount` |
| link present ↔ absent | instant — deliberate; existing ratified contract at `components/admin/wizard/step3ReviewSections.tsx:927` |
| sub ↔ top-level | not a transition — fixed per call site |
| Compound: pill appears while a re-sync mutates the count | instant on both; no animation to interleave, so no compound case exists |
| Hover/focus on the sheet link | `transition-colors duration-fast` on colour only — preserved from the current link |

No `AnimatePresence`, no ternary-rendered animated block is introduced. The one *layout* change that could be animated — the header growing 44px → 72.8px when a pill appears — is deliberately instant, and it DOES occur on a mounted header via same-key reconciliation, so the transition-audit task asserts that no layout transition is attached rather than relying on remount.

## 9. Tests

All layout assertions run in a real browser. jsdom computes no layout, and a class-presence
assertion only restates the fix. **Epsilon is ±0.5px for every dimension equality** unless a
test states otherwise.

### 9.1 Independent oracles (round-1 finding 5)

Round 1 correctly noted that "derive expected values from measured fixture geometry" becomes
tautological if the expected centre is computed from the rendered name being tested. Two rules:

- **Centring oracle is FORMULA-derived, not render-derived.** The expected name-slot centre is
  computed from the row's content box and the KNOWN fixed widths — icon (28px top-level / 24px
  sub), link slot (30px, or the `pr-header-link-slot` compensation when linkless), and the 10px
  `gap-2.5` — never from the name element's own rect. The test then compares the measured text
  centre against that independent figure, and additionally asserts the CROSS-STATE invariant:
  the linkless-padded states land within ±1px of the link-present state, which is the property
  `pr-header-link-slot` exists to produce.
- **The count's rendered width is part of the oracle, and it is measured, not assumed.** Round 2
  correctly showed the formula cannot come from fixed widths alone: with a top-level link the name
  offset is `+4px − (6px count-gap + rendered count width) / 2`, and the count width differs
  between `(0)`, two-digit and three-digit values — which is exactly what produces the −8.4px and
  −17px rows. The oracle therefore measures the COUNT element's own width (a different element
  from the name under test, so this is not self-referential), substitutes it into that formula, and
  compares the result against the measured name centre. Reading the count's box to predict the
  NAME's position is an independent measurement; reading the name's box to predict itself is the
  tautology being avoided.
- **Tolerances are numbers, not a reference.** §3.1.5 lists offsets, not tolerances. The
  contract asserted is: name text centre within **±2px** of the formula centre for a given
  state, and the per-state offsets in §3.1.5 reproduced within **±1px**.

### 9.2 The tests

1. **Name line count + row height** — real browser, the §4 matrix (including the §4.1
   padded × counted / flagged / judgment cells) × 320/375/430/1280. Assert the name occupies
   exactly **one** text line box; header 44px with no pill, 72.8px with one.
   *Anti-tautology:* count lines from `Range.getClientRects()` on the name's own text node, never
   the heading's bounding box — the box is inflated by the link and reports "1 line" even when
   the text wraps. This exact error produced a wrong reading during spec measurement.
   Set `box-sizing: content-box` on the width-pinned wrapper (§11 item 4).
2. **Width equalities** — the FULL §5 chain (pane → registry section → breakdown section → outer
   column → header/pill lines, plus panel-card equality), ±0.5px. Fails if `items-stretch`/`w-full` is omitted, which is what makes every
   centring number meaningful.
3. **Centring** — per §9.1, formula oracle + cross-state comparison.
4. **Hit target — by hit TESTING, not by reading CSS.** An anchor's `getBoundingClientRect()`
   stays 20×20 and does **not** include its `before:` overlay, so measuring the box cannot prove
   44px (round-1 finding 5). Assert instead that `document.elementFromPoint` returns the link (or
   a descendant of it) at points just inside all four edges of the intended 44×44 area, and that
   a point just outside does not. Uses viewport coordinates. This also catches an overlay clipped
   by an ancestor's `overflow`, which a CSS read cannot see.
5. **Accessible names** — the link's accessible name still resolves to
   `Open the source sheet for <label>` after the visible words are removed, and the heading's
   accessible name is the section name **without** the count.
6. **Pill line presence is keyed to the PILL, not to `flagged`** — round 1 correctly caught that
   round-1 test 5 equated "unflagged" with "no pill": a judgment section is unflagged and
   deliberately renders a pill. Assert: clean ⇒ exactly one child line and no pill wrapper in the
   DOM; flagged ⇒ two lines with the amber pill; judgment ⇒ two lines with the info pill.
7. **Non-finite count** — `NaN` and `Infinity` render no chip (§4.2).
8. **`empty:hidden` eyebrow** — real browser: on a stage-promoted ground leg the eyebrow
   contributes **zero** height to the `.tcol` stack; on a labelled leg it contributes its normal
   height. Geometry, not class presence — a class assertion cannot catch the `{" "}` regression.
9. **Static guard** — §6.5 controls in full: a positive control per supported syntax, negative
   controls, and a non-empty named file set.

### 9.3 Behavioural proof for the pusher repairs (round-1 finding 2)

Round 1 was right that the §6 membership guard passes if an implementation merely deletes a
spacer and forgets `ml-auto`, leaving the trailing cluster at the START edge — and that
"nothing moves visually" was an unproven claim. BACKLOG.md:48 (root) asked for a probe mount, and
dropping it was not ratified. It is ratified here, with a substitute that is strictly stronger
per unit of cost:

10. **Trailing-alignment geometry**, real browser, for all three repaired pushers
    (`BellPanel` action row, `AdminNav` top bar, `OnboardingTopBar`): assert the trailing
    cluster's **right edge is flush with the parent's content-box right edge** (±0.5px) at a wide
    width where free space exists — which fails if `ml-auto` is missing — and that the cluster
    does not overflow the parent at 320px. For `BellPanel` the row also wraps, so assert it in
    both the wrapped and unwrapped states.
    *Why this and not three new probe mounts:* the phantom-gap probes detect a zero-extent item;
    they cannot detect a MISSING `ml-auto`, because a deleted spacer leaves no offender to find.
    This assertion targets the actual failure mode of this repair. Recorded as a deviation from
    BACKLOG.md:48 (root) with that reasoning.
11. **Hairline floor boundary** — assert the hairline's width is > 0 at the narrowest real row
    (240px) with the LONGEST real title, and that the label does **not** wrap there (which is what
    rules out `min-w-6`; see §3.2). Round 1 warned that a permanently hidden rule would satisfy
    the phantom-gap probes while violating the intent — this asserts the rule is still DRAWN.
    *Anti-tautology:* a short title cannot collapse, so the longest of the five closed-set titles
    is mandatory or the test passes vacuously.
12. **Phantom-gap probes** re-run green with all four ledger rows deleted; the stale-row
    assertion proves the debt is repaid rather than re-ledgered.
13. **Archived-bucket probe** per §3.4, anchor captured live.

## 10. Invariant checklist

- **Invariant 1 (TDD):** every task is failing test → minimal implementation → passing test → commit.
- **Invariant 5 (no raw codes in UI):** no user-visible copy changes except removing the words "In sheet"; no codes involved.
- **Invariant 8 (UI quality gate):** `components/**` and `DESIGN.md` are touched, so `/impeccable critique` **and** `/impeccable audit` both run on the diff before close-out, with findings and dispositions recorded. Pre-code mechanical sweep: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type/token classes.
- **Invariant 10 (mutation-surface telemetry):** no mutating route, action, or admin surface is added or changed. N/A.
- **Invariant 11 (worktree):** all work in `../FX-worktrees/section-header-rebuild`, branched off `origin/main`, with `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` completed before any test run.
- **`DESIGN.md`:** §7a gains (a) the centered-section-header pattern with its measured offsets, and (b) an explicit note that a childless *growable* element used as a right-pusher is replaced by `ml-auto` rather than hidden at a breakpoint — the decorative-hairline rule already there does not cover pushers, which is why five sites drifted. (c) The corrected hairline guidance: measure before hiding — a rule that never collapses gets a floor, not a breakpoint. (d) **Reconcile a now-false sentence:** `DESIGN.md:327` says the decorative `flex-1` rule "is not childless" and that the empty-element selector never matches it. Both real rules — `components/admin/BulkIgnoreControls.tsx:200` and `components/admin/wizard/step3ReviewSections.tsx:2150` — ARE childless spans, so it does match. §7a needs the distinction between an intentionally PAINTED empty element (a decorative rule: must stay visible, so `empty:hidden` is exactly wrong for it) and an empty CONTENT SLOT (nothing to show: `empty:hidden` is right). (e) Document `--spacing-header-link-slot`.

## 11. Measurement method (reproducible)

So the plan can regenerate every number rather than trusting this document:

1. `node_modules/.bin/tsx tests/e2e/_step3ReviewModalHarness.tsx <out.json>` renders the real component tree to static markup outside Playwright's JSX transform. Requires `HASH_FOR_LOG_PEPPER` and `JWT_SIGNING_SECRET` in the environment or the harness throws at import (`lib/email/hashForLog.ts:9`).
2. Compile the real token CSS: prepend `@source "<harness.html>"` to a copy of `app/globals.css`, then `pnpm dlx @tailwindcss/cli@4.2.4`.
3. Serve over `node:http` and measure with `getBoundingClientRect` plus `Range.getClientRects()` for text line boxes.
4. **Set `box-sizing: content-box` on the width-pinned wrapper.** Tailwind's preflight sets `border-box` globally, so a padded wrapper measured at "335px" is really 319px of content. Every number in this spec's first draft was 16px narrow until this was fixed; the plan must not repeat it.
5. Header row content-box widths per viewport: 320→280, 360→320, 375→335, 390→350, 430→390, 1280→561.

## 12. Citations

| Claim | Location |
| ----- | -------- |
| `ModalSectionChrome` definition | `components/admin/wizard/step3ReviewSections.tsx:850` |
| header row today | `components/admin/wizard/step3ReviewSections.tsx:892` |
| childless spacer to delete | `components/admin/wizard/step3ReviewSections.tsx:916` |
| link-presence instant/deliberate contract | `components/admin/wizard/step3ReviewSections.tsx:927` |
| decorative hairline | `components/admin/wizard/step3ReviewSections.tsx:2150` |
| `COUNT_SECTIONS` | `components/admin/wizard/step3ReviewSections.tsx:697` |
| `shouldShowSectionCount` | `components/admin/wizard/step3ReviewSections.tsx:708` |
| `sub` / `judgment` derivation | `components/admin/wizard/step3ReviewSections.tsx:870-871` |
| `sheetHref` derivation | `components/admin/wizard/step3ReviewSections.tsx:884-888` |
| card-header icon-only sheet link (44px box) | `components/admin/wizard/Step3ReviewModal.tsx:403-412` |
| expanded hit-area idiom | `components/admin/HoverHelp.tsx:537` |
| `ml-auto` over `justify-between` | `components/admin/CompactAlertCard.tsx:138` |
| hairline breakpoint + `min-w` precedent | `components/admin/BulkIgnoreControls.tsx:202` |
| BellPanel pusher | `components/admin/BellPanel.tsx:323` |
| AdminNav pusher | `components/admin/nav/AdminNav.tsx:144` |
| OnboardingTopBar pusher | `components/admin/nav/OnboardingTopBar.tsx:67` |
| allowlisted Skeleton bar | `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` |
| TravelRow eyebrow | `components/crew/sections/TravelSection.tsx:121` |
| `label` typed `string` | `components/crew/sections/TravelSection.tsx:92` |
| stage-promoted empty label | `components/crew/sections/TravelSection.tsx:403` |
| flight eyebrow render gate | `components/crew/sections/TravelSection.tsx:572` |
| flight eyebrow (refuted sibling) | `components/crew/sections/TravelSection.tsx:588` |
| `dateRaw` type | `lib/crew/flightDisplay.ts:24` |
| structured segment always has `dateRaw` | `lib/crew/flightDisplay.ts:152` |
| `structured: false` when no date | `lib/crew/flightDisplay.ts:184` |
| show-modal phantom ledger | `tests/e2e/admin-layout-dimensions.spec.ts:500` |
| archived-bucket coverage boundary | `tests/e2e/admin-layout-dimensions.spec.ts:362-367` |
| live-captured anchor requirement | `tests/e2e/admin-layout-dimensions.spec.ts:370-376` |
| crew phantom ledger | `tests/e2e/crew-layout-dimensions.spec.ts:1037` |
| archived fixture | `supabase/seedWalkerFixtures.ts:117-123` |
| archived row testid | `components/admin/ArchivedShowRow.tsx:48` |
| harness env requirement | `lib/email/hashForLog.ts:9` |
| harness bootstrap pattern | `tests/e2e/step3-review-modal.layout.spec.ts:118-190` |
| `empty:hidden` idiom + zero-width sibling rule | `DESIGN.md` §7a |
