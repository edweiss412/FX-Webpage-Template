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
| 4 | **Sheet link is a 20px glyph with a `before:-inset-3` expanded hit area, NOT the `size-tap-min` box the card header uses.** Deliberate deviation from `components/admin/wizard/Step3ReviewModal.tsx:409`. Measured: a 44px corner box outweighs the 28px status icon and drags the name 8–29px left; the 20px glyph holds it within 4–17px. The 44px touch target is fully preserved (20 + 2×12 = 44). Hit-area idiom precedent: `components/admin/HoverHelp.tsx:547`, which pairs a `size-5` glyph with `before:-inset-3` for exactly this 44px result. **Tokenized, not a raw pixel value** — round 7 correctly noted that `before:inset-[-12px]` would hardcode px spacing in violation of `DESIGN.md:361`, the same rule this spec invokes to reject `pr-[30px]`. `-inset-3` resolves to `calc(var(--spacing) * -3)` = -12px, so 20 + 2x12 = 44px with no magic number. | §3.1.3, measured. |
| 5 | **The name's residual off-centre spread across states (+4px to −17px) is accepted.** It follows from putting the count inside the centered group, which is decision 1. Not a defect to be engineered away with a compensating spacer. | §3.1.5. |
| 6 | **The empty right corner is compensated with padding on the group, NOT a reserved spacer element.** Measured identical geometry (+4px / +2px) both ways; padding adds no element to a gapped row, which is this batch's whole point. | §3.1.5, measured. |
| 7 | **`components/admin/showpage/ShowReviewModalSkeleton.tsx:152` keeps its `flex-1` Skeleton.** Its row is `flex w-full items-center gap-2` with one sibling and a `w-full` parent, so the bar always has width — it is not a collapsing pusher. The static guard that would have registered it is descoped (§6), so no registry exists; the row is documented here as the reason it is left alone. | §6. |
| 8 | **`components/crew/sections/TravelSection.tsx:593` needs no fix — REFUTED, do not re-raise.** It looks like a second blank-eyebrow instance (identical classes) but its `<p>` always contains a `<span>` child, so the empty-element selector can never match. More importantly it is unreachable-blank: it renders only under `showStructured = seg.structured && hasContent` (`components/crew/sections/TravelSection.tsx:577`), and the `dateRaw: null` construction sets `structured: false` (`lib/crew/flightDisplay.ts:184`); structured segments always carry a `dateRaw` (`lib/crew/flightDisplay.ts:152`). | §3.3. |
| 9 | **No new error codes, no §12.4 catalog edits, no migrations.** This batch is presentational plus test wiring, **plus the two small `hasRenderableCount` edits in §4.2** — noted so "presentational" is not read as "no logic changes at all". The three-way §12.4 lockstep and the `validation-schema-parity` gate are therefore N/A. | §7. |

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

`ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:850`) is the component under change. Its header row is at `components/admin/wizard/step3ReviewSections.tsx:891` (`flex items-center gap-2.5`, with `mb-2`/`mb-3` by variant).

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

The count moves from a right-hand sibling into the centered group, immediately after the heading. Its *visibility* gains one gate (`hasRenderableCount`, §4.2); its membership and zero-suppression rules are unchanged. It stays **outside** the `<Heading>` element so the heading's accessible name remains the section name alone. `showCount` logic is unchanged — it still comes from `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708`), which returns false unless the section is in `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:697` — `crew`, `contacts`, `rooms`, `warnings`) with a non-null count and a real `sectionId`, and additionally suppresses a flagged `(0)`.

**Consequence worth stating:** only 4 of the ~13 rendered sections ever show a count, so the name-only geometry is the common case, not the exception. Both are specified below.

#### 3.1.3 Sheet link

Becomes icon-only, in the right corner:

```
className="relative inline-grid size-5 shrink-0 place-items-center rounded-sm text-text-subtle
           transition-colors duration-fast hover:text-text
           before:absolute before:-inset-3 before:content-['']
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

### 3.2 Three pushers plus one decorative hairline

| Site | Change |
| ---- | ------ |
| `components/admin/BellPanel.tsx:323` | Delete the spacer; add `ml-auto` to the right-hand content. Right content is present iff `!entry.isHealth`, and is either the auto-note `<p>` or the resolve `<button>` — **both** get it. |
| `components/admin/nav/AdminNav.tsx:144` | Delete the spacer; add `ml-auto` to the following action-cluster `<div>` (`components/admin/nav/AdminNav.tsx:146`). Always rendered, so no empty-state case. |
| `components/admin/nav/OnboardingTopBar.tsx:67` | Delete the spacer; add `ml-auto` to the following action-cluster `<div>` (`components/admin/nav/OnboardingTopBar.tsx:69`). Always rendered. |
| `components/admin/wizard/step3ReviewSections.tsx:2150` | **Not a pusher** — a decorative hairline. **Measured: it never collapses in the supported range, so the treatment is a `min-w-4` floor ALONE, no breakpoint.** See below. |

`ml-auto` (not `justify-between`) is the established idiom here: `components/admin/CompactAlertCard.tsx:138` records why — "a lone child under `justify-between` sits at the START edge". Nothing moves visually on any of these three; they are not crowded today.

**The `components/admin/wizard/step3ReviewSections.tsx:2150` hairline — the measurement-dependent branch, resolved.** Round 3
correctly flagged that §3.2 demanded a breakpoint while §10 said floor-only. The branch, stated
explicitly:

- **Collapses somewhere in the supported range** → breakpoint + floor, mirroring
  `components/admin/BulkIgnoreControls.tsx:202` (`min-[480px]:block` + `min-w-6`); tests then
  assert BOTH sides of the breakpoint and the floor value.
- **Never collapses** → floor only, no breakpoint — hiding a rule that draws correctly at every
  supported width is a visual regression.

**Measured: it never collapses.** Its titles are a closed set of five (`components/admin/wizard/step3ReviewSections.tsx:386-401`),
longest "Wardrobe & key moments", and the row holds only that label plus the rule. At the narrowest
REAL row — 240px, i.e. a 320px viewport's 280px pane minus `--spacing-tile-pad: 20px` on each side
of the panel card — the rule draws **22.94px**, reaching 0 only at rows ≤215px, 25px narrower than
anything reachable. **Therefore: floor only, `min-w-4` (16px).** Not `min-w-6` (24px), which
EXCEEDS the 22.94px available at a 240px row and would bind, wrapping the 207.1px label onto a
second line. That wrap — not `width > 0` — is the discriminator between the two floors, as round 3
correctly noted.

### 3.3 TravelRow eyebrow (`components/crew/sections/TravelSection.tsx:124`)

Add `empty:hidden` to the eyebrow `<p>`. A ground leg whose stage was promoted to the primary line passes `label=""` (`components/crew/sections/TravelSection.tsx:408`), and `label` is typed `string` (`components/crew/sections/TravelSection.tsx:101`), so React renders no child node at all and the empty-element selector matches. The element keeps its documented slot and costs nothing when blank — the `DESIGN.md` §7a idiom.

**Caveat to carry into the plan:** a literal space or `{" "}` inside that `<p>` silently re-enables the 2px gap. The test must assert rendered geometry, not the class.

`components/crew/sections/TravelSection.tsx:593` is **not** a second instance — see §1.1 item 8.

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

The real taxonomy — **five** cases, not one:

| Case | Sections | Link? |
| ---- | -------- | ----- |
| Staged, and valid published | every top-level section **except** `report` | link present |
| `report` ("Report an issue") | one | linkless — excluded at `components/admin/wizard/step3ReviewSections.tsx:887` |
| Diagrams sub-block | one | linkless — no `dfid`, no `sectionId`, `headingLevel: 4` |
| Defensive: malformed / null data (`dfid === ""`) | all top-level sections | linkless — a mode-agnostic defensive state, NOT the normal published state. `buildStagedSectionData` also accepts a plain string (`components/admin/review/sectionData.ts:110-168`), so it is not published-only. |
| **Partial / standalone providers** — chrome mounted with neither `dfid` nor `sectionId` at default `headingLevel: 3` | `tests/components/admin/crewRowBannerIntegration.test.tsx:54-72`, `tests/components/admin/wizard/step3ReportIssueSection.test.tsx:111-122`, `tests/e2e/_attentionAnchorEntry.tsx:82-95`, `tests/components/admin/anchorMount.test.tsx:37-43` | linkless, padded, count-suppressed — but **top-level `h3`, NOT the Diagrams `h4` state**. Round 3 correctly caught that the round-2 taxonomy conflated "no `sectionId`" with Diagrams. **Declared SUPPORTED** (both props are optional by design, `components/admin/wizard/step3ReviewSections.tsx:513-514`) and included in the test matrix as its own geometry class. |

So the padded (`pr-header-link-slot`) geometry is the **two-section case plus a defensive
fallback**, exactly as §3.1.5 measured — not a published default. Consequences for testing:

- §3.1.5's measured offsets stand for the states they name.
- The plan measures padded × counted / flagged / judgment as the **defensive** cells (reachable
  only with malformed data), and must label them that way rather than as the published norm.

### 4.1a Geometry-class matrix — the rows tests 1-3 bind to

Round 4 correctly noted that §4 held an input table and a link taxonomy but no **matrix**, while
test 1 referred to "the §4 matrix". These are the reachable geometry classes; tests 1-3 enumerate
exactly these rows and nothing else. The synthetic Cartesian product is NOT the test surface.

Status reachability is **per row**, verified against the live providers — not a blanket cross with
all three values, which round 5 correctly called out as contradicting the word "reachable".

| # | Class | Heading | Count | Link | Statuses reachable | Reachability |
| - | ----- | ------- | ----- | ---- | ------------------ | ------------ |
| G1 | top-level, counted, link | `h3` | shown | yes | clean, flagged, judgment | PRODUCTION — crew, contacts, rooms, warnings |
| G2 | top-level, uncounted, link | `h3` | none | yes | clean, flagged, judgment | PRODUCTION — venue, event details, crew schedule, hotels, transport, pack list, billing, agenda |
| G3 | `report`, linkless | `h3` | none | no | **clean only** | PRODUCTION — warning routing never targets `report`; unmapped warnings go to `warnings` |
| G4 | Diagrams sub-block | `h4` | suppressed | no | **clean only** | PRODUCTION — both providers hardcode `flagged: false` and omit `judgment` (`components/admin/wizard/step3ReviewSections.tsx:3714-3715`, `components/admin/wizard/step3ReviewSections.tsx:3769-3770`) |
| G5 | partial / standalone provider | `h3` | suppressed | no | **clean only** | SUPPORTED — all four cited callers are clean; other statuses are type-valid but unreached, so neither tested nor promised |
| G6a | defensive `dfid === ""`, counted | `h3` | shown | no | clean, flagged, judgment | DEFENSIVE — malformed data only |
| G6b | defensive `dfid === ""`, uncounted | `h3` | none | no | clean, flagged, judgment | DEFENSIVE — malformed data only |

G6 is split because "shown or none" is two distinct geometries and would let tests 2-3 measure only
one. **Each browser fixture binds to exactly one (row, status) cell**, and the cell set is the sum
of the reachable statuses above — 3+3+1+1+1+3+3 = **15 cells**, not 6x3=18.

**One-prop partial providers** (`dfid` without `sectionId`, or the reverse) are **declared
UNSUPPORTED**: both props are optional for provider-mount convenience, but no caller passes exactly
one, and the derivation requires both for a link. They are not tested and no behaviour is promised;
a caller that needs one of them must add the other.

### 4.2 Invalid numbers

`count: number | null` does not exclude `NaN`, `Infinity`, or `-Infinity`, and
`shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708-714`) tests only `null`, membership, and
`count === 0 && flagged` — so `NaN` would reach the chip and render "(NaN)".

**Guard boundary — corrected (round-5/6 finding 1).** Round 4's answer was wrong: putting the check
inside `shouldShowSectionCount` does NOT cover both paths. That helper has exactly one caller,
`ModalSectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:876`), while the legacy `BreakdownSection` path renders its count gated on
nothing but `count !== null` (`components/admin/wizard/step3ReviewSections.tsx:1010`). A check inside the helper would leave legacy `(NaN)`
intact while test 7 requires both paths to reject it.

**The implementable shared boundary** is a new small exported predicate called by BOTH paths:

- `hasRenderableCount(count: number | null): boolean` → `count !== null && Number.isFinite(count)`.
- `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708-714`) calls it first; its membership and zero-suppression
  semantics are unchanged after that point.
- The legacy conditional at `components/admin/wizard/step3ReviewSections.tsx:1010` **is replaced** by `hasRenderableCount(count)`. This is a real
  edit to the legacy path, listed as scope in §3 and §7.

Both render paths then share one boundary, and test 7 asserts all three non-finite values at both.

**Disposition:** the guard treats a non-finite count as absent
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
| content pane (`components/admin/review/ShowReviewSurface.tsx:1030`) | registry section (`components/admin/review/ShowReviewSurface.tsx:1055`, `flex min-w-0 flex-col`) | spans the pane's inner width | **ASSERTED ONLY, not guaranteed** — see the note below |
| registry section | breakdown section (`components/admin/wizard/step3ReviewSections.tsx:999`, `flex min-w-0 flex-col`) | spans the registry section | **ASSERTED ONLY, not guaranteed** |
| breakdown section | outer column | column spans the breakdown section's inner width | **GUARANTEED** by `w-full` on the outer column (added by this batch). Both wrappers are `flex-col` and Tailwind v4 does not stretch flex children by default. |
| breakdown section | panel card (`components/admin/wizard/step3ReviewSections.tsx:942`) | card spans the same width as the outer column — siblings that must not diverge | **ASSERTED ONLY** — this batch does not modify the panel card |
| outer column | header line | line spans the column | `items-stretch` on the column **plus** `w-full` on the header line |
| outer column | pill line | line spans the column, so `justify-center` centres against the full width | `items-stretch` on the column **plus** `w-full` on the pill line |
| sheet link | its hit area | ≥44×44 despite a 20px box | `relative` + `before:absolute before:-inset-3` |

Height invariants to assert (epsilon **±0.5px**): header line 44px in every state; whole header
44px with no pill and 72.8px with one, at 320/375/430/1280.

**Width invariants to assert in a real browser** — rounds 1 and 2 both raised this, and the
round-2 edit silently failed to land, so it is spelled out here. The FULL chain, each within
±0.5px. **The pane comparison is against its CONTENT box, not `clientWidth`** — the pane carries
`p-tile-pad` (20px per side, `app/globals.css:170`) and `clientWidth` INCLUDES padding, so a
naive equality is off by 40px on the real tree and would misreport correct layout as an upstream
defect (round-4 finding 1). Assert
`registrySection.width === pane.clientWidth − paddingLeft − paddingRight` using the pane's
computed inline paddings, or compare content-box edges directly. Then:
`breakdownSection.width === registrySection.clientWidth`;
`outerColumn.width === breakdownSection.clientWidth`;
`headerLine.width === pillLine.width === outerColumn.width`; and
`panelCard.width === outerColumn.width`. `flex justify-center` centres a pill INSIDE its wrapper
— it does not make the wrapper span its parent. Without these equalities every offset in §3.1.5
is measured against the wrong box, and a regression at the registry-section or panel-card
boundary stays invisible and mis-attributed.

**GUARANTEED vs ASSERTED — the distinction round 3 correctly demanded.** An equality assertion
detects a failure; it does not create the relationship. This batch **guarantees** exactly the
boundaries it adds classes to: the outer column (`w-full` + `items-stretch`), the header line
(`w-full`), and the pill line (`w-full`). The three upstream/sibling boundaries — pane → registry
section, registry section → breakdown section, and breakdown section → panel card — are
pre-existing and **NOT modified here**; they are asserted so a violation is caught and attributed
upstream instead of being blamed on this change. The earlier "explicit at every level" phrasing
overclaimed and is withdrawn. If an upstream assertion fails on the untouched tree, that is a
pre-existing defect: the plan escalates it rather than quietly adding classes to code this batch
does not own.

## 6. Static guard — DESCOPED from this batch

**The guard is removed from scope.** It survived three adversarial rounds (R1 finding 1, R2
finding 3, R3 finding 1) without converging, which trips the explicit rule in
`docs/agents/spec-self-review.md`: *"If a design-correctness vector survives 3 adversarial rounds,
stop patching prose: build the probe/prototype, descope the vector, or mark it UNRATIFIED pending
a spike."* Descoping is the prescribed action, not a concession.

Why it cannot be patched again in this spec:

- **The written rule and a working prototype disagree on the census.** Under the round-3 rule
  (since removed with the rest of the guard design)
  (any identifier, member access, or unresolved call anywhere makes an element opaque), a template
  literal like `` `size-1.5 rounded-full ${pill.dot}` `` IS opaque, giving **27 rows now / 23
  after repairs**. A prototype that resolves static template parts instead gives **17 / 13**. R3
  is correct that both cannot hold, and that opacity-propagation through template literals,
  arrays/`.join`, ternaries, and `+` concatenation was never actually pinned. That is a detector
  design question needing its own spike, and it is on a **self-imposed extra** — no backlog item
  in this batch asks for it.
- Three rounds on a nice-to-have tripwire, while the three real backlog items sat finished, is
  negative marginal value by the same rule's reasoning.

**What covers reintroduction meanwhile** (all in scope, all landing in this batch). Round 4 was
right that the round-3 version of this list overclaimed: the three pusher surfaces are mounted by
no existing probe, so item 1 alone did not cover them. Test 10(a) is what closes that, and the
**residual gap is stated plainly**: outside these three sites and the measured probe surfaces,
reintroduction of a childless growable elsewhere in the repo is NOT detected by this batch — that
is exactly what the deferred backlog spike is for.

**10(a) and 10(b) cover different failures; neither substitutes for the other** (round-5 finding 2).
10(a) catches a spacer that exists or returns; 10(b) catches a missing `ml-auto`. A repair that
deletes the spacer but forgets `ml-auto` passes 10(a) and fails 10(b); one that adds `ml-auto` while
leaving the spacer in place passes 10(b) and fails 10(a). Both are required per site.

1. The existing runtime phantom-gap probes, which measure realised extent and are indifferent to
   className syntax — the instrument that found the original defect.
2. §9.3 test 10's trailing-alignment geometry on all three repaired pushers, which fails if a
   spacer is deleted and `ml-auto` forgotten — the specific failure mode a membership guard was
   being asked to cover.
3. §9.3 test 11's floor assertion on the decorative hairline.
4. §3.5's four ledger deletions, whose stale-row assertions fail if a repair is faked.

**Carried forward:** the plan files a BACKLOG entry (`BL-CHILDLESS-GROWABLE-STATIC-GUARD`)
recording the R1–R3 constraints so a future attempt starts from them rather than rediscovering
them: axis-awareness (a one-axis size token is not proof of extent), DOM-vs-component tags
(`FilterTextInput` renders an `<input>`; `Skeleton` forwards to one div), runtime-empty children
(`{null}`), style-prop and indirected-style pushers, shrink-to-zero items with no growable token,
and — the unresolved core — how opacity must propagate through composed classNames, with the
census reconciled against a run.

## 7. Not in scope

- No new §12.4 error codes, no `lib/messages/catalog.ts` edits, no `pnpm gen:spec-codes` run. Nothing here surfaces a code to a user.
- No migrations, so `pnpm gen:schema-manifest` and the validation-project apply are N/A, and `validation-schema-parity` is unaffected.
- No change to `COUNT_SECTIONS` (`components/admin/wizard/step3ReviewSections.tsx:697`) or `buildSheetDeepLink` behaviour — the count and link *placement* changes, their *derivation* does not. **Two count-related code changes ARE in scope** (§4.2): `shouldShowSectionCount` (`components/admin/wizard/step3ReviewSections.tsx:708`) gains a `hasRenderableCount` call, and the legacy `BreakdownSection` count conditional (`components/admin/wizard/step3ReviewSections.tsx:1010`) is replaced by the same predicate. Neither alters membership or zero-suppression semantics.
- `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` unchanged (§1.1 item 7).
- `components/crew/sections/TravelSection.tsx:593` unchanged (§1.1 item 8).
- **The static guard (§6) is descoped** and files a backlog entry instead. Nothing in this batch claims repo-wide closure of the childless-growable class.
- The three unmeasured pusher sites get `ml-auto` plus §9.3 test 10's trailing-alignment geometry, but **no new phantom-gap probe mount**: a probe detects a zero-extent item and therefore cannot detect a MISSING `ml-auto` (a deleted spacer leaves no offender to find), so a direct geometry assertion is the stronger instrument for this repair. Ratified deviation from BACKLOG.md:48 (root), reasoned in §9.3.

## 8. Transition inventory

**Pair inventory over REACHABLE states, not a 24-state Cartesian product** (round-5 finding 4;
`docs/agents/spec-self-review.md:12` requires all `N*(N-1)/2` pairs plus compounds). Heading level is
**fixed per call site** and cannot transition, so it is excluded from the state count rather than
multiplied in. Within one mounted header the transitionable axes are status (clean / flagged /
judgment), count (shown / absent) and link (present / absent) = **12 states, 66 pairs**. Every pair
resolves to the same treatment — **instant, no animation** — because presence follows data and no
element is animated in or out; the table below therefore enumerates the axis-level classes and the
compounds, and declares the uniform treatment for all 66 pairs rather than repeating one row 66
times. Any future pair needing a non-instant treatment must be broken out explicitly. Presence of each element follows **data**, not a user-driven state change. **The header CAN change while mounted.** `key={showId}` (`app/admin/_showReviewModal.tsx:413-419`) remounts only when the SHOW changes; `router.refresh()` reconciles fresh data for the same show under the same key in place (`components/admin/showpage/PublishedReviewModal.tsx:162-174`), so a pill or count can appear, change, or disappear on a mounted header. Rounds 1 and 2 both flagged this; the round-2 correction did not land because the edit was applied without an assertion. The treatment stays instant — but the reason is that same-key reconciliation is deliberately unanimated, NOT that the change only happens across a remount.

| Transition | Treatment |
| ---------- | --------- |
| none → flag pill | **instant — deliberate.** Matches the existing contract comment at `components/admin/wizard/step3ReviewSections.tsx:927` and `Step3ReviewModal.tsx:401` (the comment reads "instant / deliberate", noting that link presence follows data rather than a state transition). |
| none → judgment pill | instant — deliberate, same reason |
| flag ↔ judgment | instant — deliberate; mutually exclusive and data-derived (`components/admin/wizard/step3ReviewSections.tsx:871`) |
| count shown ↔ hidden | instant — deliberate; derived from `shouldShowSectionCount` |
| link present ↔ absent | instant — deliberate; existing ratified contract at `components/admin/wizard/step3ReviewSections.tsx:927` |
| sub ↔ top-level | not a transition — fixed per call site |
| Compound: pill appears while the count mutates | instant on both |
| Compound: count changes while a pill is ALREADY present | instant |
| Compound: pill + link change together | instant |
| Compound: count + link change together | instant |
| Compound: pill + count + link all change | instant |
| Can link presence change under same-key reconciliation? | **Yes in principle** — `sheetHref` derives from `chrome.dfid`/`chrome.sectionId`, so a refresh returning malformed data (`dfid === ""`) flips it. Enumerated rather than assumed away, and instant like the rest. |
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
7. **Non-finite count** — `NaN`, `Infinity`, **and `-Infinity`** each render no chip, asserted at
   the boundary named in §4.2. All three, per round-4 finding 4: naming only two lets an
   implementation that accepts `-Infinity` pass.
8. **`empty:hidden` eyebrow — measured as DISPLACEMENT, not as the eyebrow's own height.** Round 4
   correctly noted that an empty `<p>` can already have a zero-height box while remaining a flex
   item whose 2px gap still displaces its siblings, so "eyebrow height is 0" passes before the fix.
   Assert the parent-child relationship instead
   (`components/crew/sections/TravelSection.tsx:123-131`): for a **blank** eyebrow the primary
   line's top equals the `.tcol` stack's content-box top with **no 2px displacement**; for a
   **labelled** eyebrow the displacement equals the eyebrow's height **plus** the 2px `gap-0.5`.
   That measures the defect directly and is red before the fix. Geometry, not class presence — a
   class assertion cannot catch the `{" "}` regression.
9. *(removed — the static guard is descoped, §6.)*

### 9.3 Behavioural proof for the pusher repairs (round-1 finding 2)

Round 1 was right that a membership guard would pass if an implementation merely deleted a
spacer and forgot `ml-auto`, leaving the trailing cluster at the START edge — and that
"nothing moves visually" was an unproven claim. BACKLOG.md:48 (root) asked for a probe mount, and
dropping it was not ratified. It is ratified here, with a substitute that is strictly stronger
per unit of cost:

10. **Spacer-collapse detection FIRST, then alignment.** Round 4 correctly showed the
    alignment-only version of this test **cannot fail before the repair**: the existing spacers
    already hold the trailing clusters against the right edge, and they also pass if a spacer is
    later reintroduced *alongside* `ml-auto`. An assertion that cannot go red is not a TDD oracle
    (invariant 1) and does not detect reintroduction. So this test has two parts, and part (a) is
    the one that must be RED before the fix:
    **(a) Reintroduction detection — PER SITE, each independently red before the fix.** Three
    separate assertions; **aggregation across sites is prohibited**, because an aggregate can go red
    on the nav rows while never exercising BellPanel at all (round-5/6 finding 2).
    - **`components/admin/nav/AdminNav.tsx:144`** and
      **`components/admin/nav/OnboardingTopBar.tsx:67`** — non-wrapping rows, so narrowing is
      monotonic: mount each in a deliberately CROWDED fixture and assert no in-flow child of the row
      has zero main-axis extent. Red today, green once the spacer is deleted.
    - **`components/admin/BellPanel.tsx:323`** — a **structural absence** oracle instead. Its action
      row is `flex-wrap` (`components/admin/BellPanel.tsx:288`), so narrowing can move the trailing
      item to another flex line and the spacer regains that line's free width; zero extent occurs
      only at a specifically calibrated boundary, making "narrow enough" fragile rather than reliably
      red. Assert instead that the action row directly contains **no childless growable child
      element** — red today (the `<span className="flex-1" />` at `components/admin/BellPanel.tsx:323` is exactly that), green
      after deletion, red again on reintroduction, with no fixture calibration to get wrong.
    Scoped to these three sites only; this does not revive the descoped repo-wide guard.
    **(b) Trailing alignment**, real browser, for all three repaired pushers
    (`BellPanel` action row, `AdminNav` top bar, `OnboardingTopBar`): assert the trailing
    cluster's **right edge is flush with the parent's content-box right edge** (±0.5px) at a wide
    width where free space exists — which fails if `ml-auto` is missing — and that the cluster
    does not overflow the parent at 320px. For `BellPanel` the row also wraps, so assert it in
    both the wrapped and unwrapped states, **and in BOTH of its mutually exclusive
    trailing-content branches** — `entry.isAutoResolving` true (the auto-note `<p>`) and false (the
    resolve `<button>`), `components/admin/BellPanel.tsx:324-338`. §3.2 puts `ml-auto` on both, so
    the test must exercise both or an implementation can repair one branch and pass (round-3
    finding 5). Wrapping coverage assigned explicitly: unwrapped at a wide width, wrapped at 320px,
    for EACH branch.
    *Why this and not three new probe mounts:* the phantom-gap probes detect a zero-extent item;
    they cannot detect a MISSING `ml-auto`, because a deleted spacer leaves no offender to find.
    This assertion targets the actual failure mode of this repair. Recorded as a deviation from
    BACKLOG.md:48 (root) with that reasoning.
11. **Hairline floor** — with the LONGEST real title, at the narrowest real row (240px), assert
    all three: (a) the rule is DRAWN (`width > 0`) — a permanently hidden rule would satisfy the
    phantom-gap probes while violating the intent; (b) **the resolved `min-width` computes to
    exactly `16px`** — round 4 correctly noted that `width > 0` + no-wrap passes on today's
    NO-FLOOR tree (it already measures 22.94px and does not wrap), so without this the test cannot
    distinguish `min-w-4` from no floor at all and is not red before the fix; (c) the label does
    **not** wrap, which is what rules `min-w-6` out. No breakpoint is asserted because the measured
    branch selected floor-only (§3.2).
    *Anti-tautology:* a short title cannot collapse, so the longest of the five closed-set titles is
    mandatory or the test passes vacuously.
12. **Phantom-gap probes** re-run green with all four ledger rows deleted; the stale-row
    assertion proves the debt is repaid rather than re-ledgered.
13. **Archived-bucket probe** per §3.4, anchor captured live.

## 10. Invariant checklist

- **Invariant 1 (TDD):** every task is failing test → minimal implementation → passing test → commit.
- **Invariant 5 (no raw codes in UI):** no user-visible copy changes except removing the words "In sheet"; no codes involved.
- **Invariant 8 (UI quality gate):** `components/**` and `DESIGN.md` are touched, so `/impeccable critique` **and** `/impeccable audit` both run on the diff before close-out. **Both
  run with the canonical v3 setup gates**, which round 3 correctly noted were missing: the skill's
  context.mjs context load (PRODUCT.md + DESIGN.md) → register reference read (brand.md or
  product.md), per
  `AGENTS.md` invariant 8. Findings + dispositions go in §12 of the close-out doc. Pre-code mechanical sweep: em-dash ban in user-visible copy, apostrophe literals, 44px tap targets, canonical type/token classes.
- **Invariant 10 (mutation-surface telemetry):** no mutating route, action, or admin surface is added or changed. N/A.
- **Invariant 11 (worktree):** all work in `../FX-worktrees/section-header-rebuild`, branched off `origin/main`, with `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` completed before any test run.
- **`BACKLOG.md` lifecycle (round-4 finding 7):** BACKLOG.md:5 (root) requires a shipped item to move
  **wholesale** into `BACKLOG-archive.md` rather than being annotated in place. So the plan (a) moves
  all three closed entries — `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`,
  `BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW`, `BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET` — into the archive
  with provenance (branch + spec path), and (b) adds `BL-CHILDLESS-GROWABLE-STATIC-GUARD` to the OPEN
  queue with the R1-R3 constraints. Leaving the three in the open queue would turn it into a
  changelog, which is exactly what that file's header forbids.
- **`DESIGN.md`:** §7a gains (a) the centered-section-header pattern with its measured offsets, and (b) an explicit note that a childless *growable* element used as a right-pusher is replaced by `ml-auto` rather than hidden at a breakpoint — the decorative-hairline rule already there does not cover pushers, which is why five sites drifted. (c) The corrected hairline guidance: measure before hiding — a rule that never collapses gets a floor, not a breakpoint. (d) **Reconcile a now-false sentence:** `DESIGN.md:327` says the decorative `flex-1` rule "is not childless" and that the empty-element selector never matches it. Both real rules — `components/admin/BulkIgnoreControls.tsx:200` and `components/admin/wizard/step3ReviewSections.tsx:2150` — ARE childless spans, so it does match. §7a needs the distinction between an intentionally PAINTED empty element (a decorative rule: must stay visible, so `empty:hidden` is exactly wrong for it) and an empty CONTENT SLOT (nothing to show: `empty:hidden` is right). (e) Document `--spacing-header-link-slot`. (f) **Update §7a's "Current sites" list** at `DESIGN.md:325`, which today names only `OverviewSection.tsx` and `ScheduleDayRow` — the TravelRow eyebrow (`components/crew/sections/TravelSection.tsx:124`) becomes a third, and the list would otherwise go stale (round-3 finding 8).

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
| header row today | `components/admin/wizard/step3ReviewSections.tsx:891` |
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
| Skeleton bar left alone (§1.1 item 7) | `components/admin/showpage/ShowReviewModalSkeleton.tsx:152` |
| TravelRow eyebrow | `components/crew/sections/TravelSection.tsx:124` |
| `label` typed `string` | `components/crew/sections/TravelSection.tsx:101` |
| stage-promoted empty label | `components/crew/sections/TravelSection.tsx:408` |
| flight eyebrow render gate | `components/crew/sections/TravelSection.tsx:577` |
| flight eyebrow (refuted sibling) | `components/crew/sections/TravelSection.tsx:593` |
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
