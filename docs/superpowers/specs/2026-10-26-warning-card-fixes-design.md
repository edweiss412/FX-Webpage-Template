# Warning card fixes: judgment calls you can see, accept, and jump from

**Status:** draft · **Branch:** `feat/warning-card-fixes` · **Base:** `6b63218188d52d06d9a1cb513141d8eb015008ef`

Line numbers below are drafting-time locators verified against the base commit. The durable anchor is the file plus the named symbol or quoted token; a drifted line number on an otherwise-correct claim is not a finding (`docs/agents/spec-self-review.md`, citation rule).

---

## 1. Why

Eric reviewed a real show ("RFI and PC Chicago") in onboarding Step 3 and hit six problems on the Sheet warnings cards. In his words, condensed:

- **Archived pull sheet.** The card says the include option lives in the "Gear section", there is no easy way to get there, and the operator should be able to resolve it from the card "unless it's useful" to go elsewhere.
- **Hotel line may be read wrong.** The same judgment call shows in two places (the Sheet warnings card and the Hotels section). Neither shows what we decided, only that we decided something, and they point at each other without a quick jump.
- **Open in Sheet.** The text link should be the same icon the section headers use, placed in the card's title row, not on its own row.
- **The word "warn".** Plain uppercase text. It should be a badge, or go.
- **Venue with no address.** The address cell exists and is empty; the card should deep-link to it.
- **The reading choice.** On a judgment card with the two-reading radio, the button should say Accept, not Ignore, and changing the reading should need a Save click instead of saving the moment a row is tapped.

Eric approved a mockup of the design below ("looks good") and settled two follow-ups in the brief: Save also accepts the card, and the Venue card gets no section jump.

### 1.1 Resolved scope: do not relitigate

| # | Decision | Ratified by | Status |
|---|---|---|---|
| R1 | Remove the visible "warn" / "info" word from every wizard Sheet-warnings card. Judgment codes (`isAmbiguityCode`, `lib/parser/ambiguityCodes.ts:29-31` over the set at `ambiguityCodes.ts:19-27`) get a neutral chip, a hollow ring dot, and a "Judgment call" tag. Needs-a-look cards keep the warm chip and dot, no tag. Info cards keep the info chip, no tag. | Eric, approved mockup, 2026-10-26 | CLOSED |
| R2 | The wizard card's text link becomes the shared `SheetIconLink` (`components/admin/SheetIconLink.tsx:79-106`) at the END of the title row. | Same | CLOSED |
| R3 | `VENUE_ADDRESS_MISSING` deep-links to the empty venue-address VALUE cell, falling back to the venue region link. | Same | CLOSED |
| R4 | The Venue-with-no-address card gets NO section jump. | Eric, brief follow-up | CLOSED |
| R5 | `HOTEL_GUEST_SPLIT_AMBIGUOUS` shows "Sheet says" vs "We read" on the card whenever no choice control renders; the inline emitter keeps the names it computed. The affected reservation in Hotels gets the tag, a "Sheet says" line, and a jump to the exact card; the card gets a jump to the reservation. | Eric, approved mockup | CLOSED |
| R6 | On judgment cards the per-row Ignore becomes Accept (same ignore mechanism). The reading choice no longer saves on tap: picking the other reading makes the row dirty, the main button reads Save with Cancel beside it and a "Not saved yet" hint; Save persists the reading through the EXISTING endpoint AND accepts the card; Cancel restores the in-use reading. Both wizard and published surfaces. | Eric, mockup + brief ("Save also accepts") | CLOSED |
| R7 | The archived-pull-sheet card shows the tab and case previews, renders the existing include action, keeps Ignore as "keep it skipped", and gets a "Go to Pack list" jump. The catalog copy that says "Gear section" is wrong; the section is labelled "Pack list" (`components/admin/wizard/step3ReviewSections.tsx:5260-5261`). | Eric, approved mockup | CLOSED |
| R8 | Every staged-wizard card whose warning routes to a section gets "Go to <Section label>". | Eric, approved mockup | CLOSED |
| R9 | The attention-pill count spacing fix shipped separately (PR #977) and is out of scope. | Brief | CLOSED |
| R10 | No new mutation surface. Every write reuses an existing, already-registered action or route (§10). | This spec | CLOSED |

### 1.2 Goals

1. A judgment call reads as a judgment call at a glance, on the card and on the thing it judged.
2. The card shows what we read, where we can show it truthfully.
3. Every card can reach the place it talks about in one tap: the sheet cell, the section, or the exact reservation.
4. Changing a reading is a deliberate act with a visible unsaved state, and accepting a judgment call is named as acceptance.
5. The archived pull sheet can be resolved from its own card.

### 1.3 Non-goals

- No change to which warnings are emitted, their severity, or the ignore fingerprint (`code` + normalized `rawSnippet`).
- No change to publish gating, rescan dirtiness, or the step-3 compact card's readiness buckets.
- No new server endpoint, server action, RPC, table, column or migration.
- No redesign of the published compact card shell (`components/admin/CompactAlertCard.tsx`). See Builder's call B1.
- No change to the "Ignored (N)" disclosure heading or its partition logic.

### 1.4 Anti-goals (things this must not become)

- A second state machine for the reading choice. The deferred selection is a thin local overlay on the existing pure derivation `deriveUseRawControlState` (`components/admin/UseRawControl.tsx:67-86`), not a replacement for it.
- A new recognizer. The venue value-cell lookup reuses the existing UNKNOWN_FIELD anchor scan and the parser's own alias resolver; it adds no grammar.
- A copy fork. Each new string has one source; the reading-display helpers live in one pure module used by both surfaces.

### 1.5 Constraints

- AGENTS.md invariants 5 (no raw codes in UI), 8 (impeccable critique + audit gate; the implementation plan carries the `impeccable-gate:` closeout marker), 10 (mutation-surface instrumentation), 11 (worktree, already satisfied), 1 and 6 (TDD, commit per task).
- §12.4 catalog edits take the three lockstep updates plus the warning-card copy registry (§9).
- Pre-code mechanical UI gate: no em dashes in user-visible copy, 44px tap targets, canonical type tokens.
- No ledger entry matches this work (searched `BACKLOG.md` and `DEFERRED.md` for warn, judgment, archived, venue, raw, hotel, sheet, accept, pull); invariant 12 does nothing here.

---

## 2. Surfaces and render sites (render-path enumeration)

There are three warning-card renderers (the wizard list, `PerShowActionableWarnings`, `NoteWarningCard`), and the brief named only the first.

| Surface | Render site | Prints "warn"? | Sheet link today |
|---|---|---|---|
| Wizard Step 3, Sheet warnings list (staged) | `WarningsBreakdown`, active rows `components/admin/wizard/step3ReviewSections.tsx:3267-3499` | **Yes**, `step3ReviewSections.tsx:3312-3314` | Text link on its own row, `step3ReviewSections.tsx:3422-3439` |
| Wizard Step 3, Ignored (N) disclosure | same file `step3ReviewSections.tsx:3509-3604` | No | None |
| Published review modal, per-section active cards | `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx:108-539`) mounted by `buildSectionWarningExtras` (`components/admin/showpage/sectionWarningExtras.tsx:226-248`) and crew under-row cards (`sectionWarningExtras.tsx:53-74`) | **No** (verified: no severity word anywhere in the file) | Text link sharing the controls band, `PerShowActionableWarnings.tsx:457-483` |
| Published, per-section Ignored (N) | `PerShowActionableWarnings tone="muted"` (`sectionWarningExtras.tsx:296-314`) | No | Same |
| Published, Sheet warnings info notes | `NoteWarningCard` (`components/admin/NoteWarningCard.tsx:59-132`) | No | Text link as controls band, `NoteWarningCard.tsx:86-96` |
| Staged review page | `StagedReviewCard` → `PerShowActionableWarnings` (`components/admin/StagedReviewCard.tsx:534`) | No | Same as published card |

Which mount runs where: the wizard modal and the published modal are the only two `ShowReviewSurface` mounts (`components/admin/wizard/Step3ReviewModal.tsx:1016`, `components/admin/showpage/PublishedReviewModal.tsx:1543`). The wizard list renders only when `routedWarningsRenderElsewhere` is false (`step3ReviewSections.tsx:3252-3266`), which is the staged wizard; the published modal routes warn rows into their sections (`components/admin/review/ShowReviewSurface.tsx:273-274`).

**Class sweep result for the "warn" word:** one site, `step3ReviewSections.tsx:3312-3314`. Nothing else renders it.

---

## 3. Fix A: card chrome (wizard; tag also on the published card)

### 3.1 Current wizard row (`step3ReviewSections.tsx:3275-3315`)

`<li class="flex gap-3">` holds a 28px severity chip (`step3ReviewSections.tsx:3291-3298`: warn = `bg-warning-bg text-warning-text` + `AlertTriangle`; info = `bg-info-bg text-text-subtle` + `Info`), then a content column `flex min-w-0 flex-1 flex-col gap-0.5` (`step3ReviewSections.tsx:3301`) whose first child is the title row `flex flex-wrap items-baseline gap-x-1.5 text-sm text-text` (`step3ReviewSections.tsx:3302`): a 6px dot (`step3ReviewSections.tsx:3303-3308`, warn `bg-warning-text`, info `bg-text-faint`), the title (`step3ReviewSections.tsx:3309-3311`), and the uppercase word (`step3ReviewSections.tsx:3312-3314`). Later children: row label or cell coordinate (`step3ReviewSections.tsx:3316-3397`), candidate (`step3ReviewSections.tsx:3398-3418`), helpful context (`step3ReviewSections.tsx:3419-3421`), the standalone "Open in Sheet ↗" link (`step3ReviewSections.tsx:3422-3439`, `min-h-tap-min`, its own row), then the controls.

### 3.2 Three row kinds

Let `isWarn = isWarnSeverity(w)` (already computed at `step3ReviewSections.tsx:3273`) and `isJudgment = isWarn && isAmbiguityCode(w.code)`.

| Element | Needs a look (`isWarn && !isJudgment`) | Judgment call (`isJudgment`) | Info (`!isWarn`) |
|---|---|---|---|
| Chip | unchanged: `bg-warning-bg text-warning-text`, `AlertTriangle` | `bg-info-bg text-text-subtle`, lucide `Circle` `size-4` (hollow ring glyph) | unchanged: `bg-info-bg text-text-subtle`, `Info` |
| Title-row dot | unchanged: `size-1.5 rounded-pill bg-warning-text` | `size-1.5 rounded-pill border-[1.5px] border-text-subtle bg-transparent` | unchanged: `size-1.5 rounded-pill bg-text-faint` |
| sr-only prefix before the title | `Needs a look: ` | none (the tag text says it) | `Note: ` |
| "Judgment call" tag | none | `JudgmentCallTag plate="surface"` after the title | none |
| Uppercase "warn" / "info" word | **removed** | **removed** | **removed** |

Why the chip glyph is lucide `Circle` in `text-text-subtle` and not an `attentionMarkClass` ring: `text-faint` lands at 2.79-3.04:1 on `info-bg`, under the 3:1 non-text floor (`app/globals.css:375-381`), and `attentionMarkClass` has no info-bg plate (`components/admin/review/attentionMark.ts:54-58`). `text-subtle` on `info-bg` is the shipped info chip's ink (`step3ReviewSections.tsx:3294`), so the judgment chip inherits a measured pairing.

The sr-only prefixes replace information the visible word carried for assistive tech; they reuse the wizard pill's vocabulary ("needs a look", `components/admin/wizard/Step3ReviewModal.tsx:648`). They are not live regions.

### 3.3 `JudgmentCallTag` (new file: components/admin/JudgmentCallTag.tsx)

Rendered element, exact markup:

```tsx
<span
  data-testid={testId}
  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border bg-surface-sunken px-1.5 py-px text-xs font-medium text-text ${TAG_BORDER[plate]}`}
>
  <span aria-hidden="true" className={attentionMarkClass("judgment", "sunken")} />
  Judgment call
</span>
```

- The fill mirrors the quiet judgment-only pill (`Step3ReviewModal.tsx:607`, `border border-text-faint bg-surface-sunken text-text`), so the ring paints on `surface-sunken`, a plate `tests/components/admin/attentionMarkParity.test.ts` already pins (3.02 / 4.11:1). Going through `attentionMarkClass` means the parity walk needs no new exemption row.
- `plate` is the background the TAG sits on, which decides its border token, the same split `DataQualityWarningControls` makes (`components/admin/DataQualityWarningControls.tsx:93-99`): `surface` and `surface-sunken` → `border-text-faint`; `warning-bg` → `border-control-outline-tinted`. Full literal class strings per key.
- Not interactive, no tab stop.

DESIGN.md gets one addendum line under the PILLMARK-1 corollary (`DESIGN.md:558`): the card tag reuses the judgment ring on its own sunken fill, and the card's 6px severity dot is a separate vocabulary (filled warm = needs a look, hollow subtle = judgment, filled faint = info). That edit is a UI surface and rides the invariant-8 gate.

### 3.4 Published card tag

`PerShowActionableWarnings` wraps its title (`PerShowActionableWarnings.tsx:496-498`) in `<span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">` and appends `JudgmentCallTag` when `isWarnSeverity(w) && isAmbiguityCode(w.code)`, with `plate` = `"warning-bg"` for `tone="warning"` and `"surface-sunken"` for `tone="muted"`. Testid `per-show-actionable-judgment-tag`. The title span keeps `data-testid="per-show-actionable-title"`. This reaches the staged review page too (shared component, §2). That is intended: the tag describes the warning, not a control, and that page mounts no controls (`StagedReviewCard.tsx:534` passes no `renderItemControls`). `NoteWarningCard` renders info rows only and never shows the tag.

### 3.5 The title row with the sheet icon link (wizard)

`href = w.sourceCell ? buildSheetDeepLink(dfid, w.sourceCell) : null` (unchanged expression, `step3ReviewSections.tsx:3427`). The standalone link block `step3ReviewSections.tsx:3422-3439` is deleted. The title row becomes:

```tsx
<div
  data-testid={`wizard-step3-card-${dfid}-warning-${i}-title-row`}
  className={`flex w-full items-center gap-2.5${href ? " min-h-tap-min" : ""}`}
>
  <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm text-text">
    {dot}{srPrefix}
    <span className="wrap-break-word font-medium text-text-strong">{renderEmphasis(title)}</span>
    {isJudgment ? <JudgmentCallTag plate="surface" testId={`wizard-step3-card-${dfid}-warning-${i}-judgment-tag`} /> : null}
  </span>
  {href ? (
    <SheetIconLink
      href={href}
      subjectLabel={stripEmphasis(title)}
      testId={`wizard-step3-card-${dfid}-warning-${i}-sheetlink`}
      ringOffset="surface"
    />
  ) : null}
</div>
```

- `stripEmphasis` is `lib/messages/collapsedSummary.ts:39`. The accessible name is the component's own: "Open the source sheet for <title> in Google Sheets (opens in a new tab)" (`SheetIconLink.tsx:96-100`).
- `ringOffset="surface"`: the panel card is `bg-surface` (`step3ReviewSections.tsx:1120`, `rounded-md border bg-surface p-tile-pad`).
- No `className` on the link. The containment guard allows only horizontal margins and `order-*` there (`tests/components/admin/sheetIconLinkContainment.test.ts:252-253`), so "end of row" comes from the cluster's `flex-1`, never from `ml-auto` on the anchor.
- The 44px floor is keyed on link presence, the same rule the section header uses (`step3ReviewSections.tsx:1014-1024`): a link-less row adds no height.
- The testid changes from `…-warning-${i}-open` to `…-warning-${i}-sheetlink`, matching the section-header link's suffix (`step3ReviewSections.tsx:1083`).

The four consuming-context requirements (`SheetIconLink.tsx:15-23`) and how this row meets them are the Dimensional Invariants in §13.

### 3.6 Published compact cards keep the text link

See Builder's call B1. `PerShowActionableWarnings` (`PerShowActionableWarnings.tsx:457-466`) and `NoteWarningCard` (`NoteWarningCard.tsx:86-96`) are unchanged in link form and placement.

---

## 4. Fix B: Venue with no address deep-links to the empty value cell

### 4.1 Current state

- Emitted by `emitVenueAddressMissing` (`lib/parser/warnings.ts:226-235`) from `lib/parser/index.ts:646`, with `blockRef: { kind: "venue" }` and `rawSnippet` = the venue name.
- It is in none of the three anchor sets: not `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:427`), not `HOTEL_REGION_ANCHORED` (`lib/drive/showDayTimeAnchors.ts:23-29`), not `LINK_ONLY_ANCHORED` (`showDayTimeAnchors.ts:65-72`). `attachSourceCellAnchors` skips it at the gate `showDayTimeAnchors.ts:216`, so it never gets `sourceCell` and renders link-less on both surfaces.
- Its siblings `VENUE_GEOCODE_UNRESOLVED` / `VENUE_TIMEZONE_UNRESOLVED` link the venue region through `CODE_TO_REGION` (`showDayTimeAnchors.ts:34-41`, branch `showDayTimeAnchors.ts:271-272`).
- The two label scans anchor the LABEL column only: `extractContentAnchors` (`lib/drive/contentAnchors.ts:63-77`) and `extractUnknownFieldAnchors` (`lib/drive/unknownFieldAnchors.ts:65-96`), both `c: block.absCol0`. The UNKNOWN_FIELD scan also records `kind` (`anchorNamespace`, `lib/parser/fieldNearMiss.ts:286-290`, `"venue"` for venue openers) and the row's normalized value.
- A grid block's cells are a contiguous column slice starting at `absCol0` (`lib/drive/exportSheetToMarkdown.ts:258-265`), so `cells[1]` sits at sheet column `absCol0 + 1`.
- The 2-column venue parser reads the address from `row[1]` when `col0Canon === "venue.address"` (`lib/parser/blocks/venue.ts:281-289`); `"venue.address"` aliases are `VENUE ADDRESS`, `Venue Address`, `Hotel Address` (`lib/parser/aliases.ts:31`), matched by `resolveAlias` (`aliases.ts:166-168`).

### 4.2 Change

1. Add `"VENUE_ADDRESS_MISSING"` to `LINK_ONLY_ANCHORED` (`showDayTimeAnchors.ts:65-72`). Not to `OPERATOR_ACTIONABLE_ANCHORED`: the staged page's card selection and dedup stay unchanged, which is that set's documented contract (`showDayTimeAnchors.ts:60-64`).
2. Add a dispatch branch in `attachSourceCellAnchors`, placed BEFORE the `CODE_TO_REGION` branch (`showDayTimeAnchors.ts:271`):

   ```ts
   } else if (w.code === "VENUE_ADDRESS_MISSING") {
     cell = resolveVenueAddressValueCell(sources.unknownField ?? []) ?? sources.region["venue"] ?? null;
   }
   ```
3. New exported pure function `resolveVenueAddressValueCell(anchors: UnknownFieldAnchor[]): SourceAnchor | null` in `lib/drive/unknownFieldAnchors.ts`:
   - candidates = anchors where `a.kind === "venue"`, `resolveAlias(a.label) === "venue.address"`, and `a.value === ""`;
   - exactly one candidate with `a.anchor.scope === "cell"` and a colon-free `a1`: decode its `a1`, add one to the column, re-encode, and return `{ title, gid, a1: valueA1, scope: "cell" }`;
   - zero or several: `null` (the caller falls back to the venue region). Same never-wrong-cell posture as `resolveUnknownFieldCell` (`unknownFieldAnchors.ts:111-127`).

The never-demote rule (`showDayTimeAnchors.ts:314`) means the cron's later region-only pass (`lib/sync/applyParseResult.ts:316`) cannot replace a value cell with the region range.

### 4.3 What the operator sees

- Wizard: the title-row icon link (§3.5) opens the empty cell. Because the anchor is a single cell, the existing "Sheet cell <Tab>!<A1>" line (`step3ReviewSections.tsx:3353-3396`) also appears. On region fallback the icon opens the venue range and no cell line renders (colon guard `step3ReviewSections.tsx:3358`).
- Published: the card's existing text link (`PerShowActionableWarnings.tsx:457-466`) and its "Sheet cell" band (`PerShowActionableWarnings.tsx:331-368`) appear by the same rules. The correction-loop follow-up sentence in the `?` popover now appears too (gated on a non-empty `a1`, `PerShowActionableWarnings.tsx:218-224`), which is the same behavior the region-anchored venue siblings already have.
- No section jump on this card (R4), on any surface.

### 4.4 Side effects, stated

- `warningIdentityKey` includes `sourceCell` (`lib/dataQuality/warningIdentity.ts`, the `cell` term). After the first re-scan or re-sync, a Venue-with-no-address warning's React key and report surface id change once. The ignore fingerprint is content-only, so existing ignores hold.
- Warnings persisted before this change carry no `sourceCell` until their next scan (documented limit L5).

---

## 5. Fix C: the hotel guest split, readable and cross-linked

### 5.1 Current state

- Structured emitter `emitHotelGuestSplitAmbiguity` (`lib/parser/warnings.ts:330-386`) attaches a resolvable `resolution` whose `parsed` carries the names (`warnings.ts:364-376`). `UseRawControl` shows "Our reading" vs "The whole cell as one guest" (`components/admin/UseRawControl.tsx:476-483`).
- Inline emitter `emitInlineHotelGuestAmbiguity` (`warnings.ts:639-659`) RECEIVES `parsedNames` (`warnings.ts:641`) and discards them: `resolution: { resolvable: false, reason: "raw-not-guest-scoped" }` (`warnings.ts:657`). `UseRawControl` then renders one sentence (`UseRawControl.tsx:444-458` with `DISABLED_REASON["raw-not-guest-scoped"]`, `UseRawControl.tsx:280-281`).
- The inline caller passes `parsedNames: amb.parsedNames` (`lib/parser/blocks/hotels.ts:172-178`), which is `row.names`, the same names that land on the reservation (`hotels.ts:933`).
- `blockRef.index` is the reservation's position in the final hotels array (`hotels.ts:141-142`, `kept.forEach((p, index)`), capped at `MAX_HOTELS = 4` (`hotels.ts:57`), below the review's display cap `HOTELS_CAP = 12` (`step3ReviewSections.tsx:192`). Staged hotels come from `arr(pr.hotelReservations)` (`components/admin/wizard/Step3SheetCard.tsx:502`) in parse order.
- All four hotel judgment codes carry `blockRef.index`: guest split (both emitters), `HOTEL_ADDRESS_SPLIT_AMBIGUOUS`, `HOTEL_INLINE_GROUP_OWN_HOTEL`, `HOTEL_INLINE_GROUP_HOTEL_SUSPECTED` (`warnings.ts:513-621`).
- `HotelsBreakdown` (`step3ReviewSections.tsx:2800-2837`) renders `HotelCard` (`step3ReviewSections.tsx:2889-2976`) per row with no index marker. It receives no warnings; on the staged surface the section chrome already carries `calloutEntries` (`{warning, index}`, full-array index) and `onJumpToWarning` for any section with active warn entries (`ShowReviewSurface.tsx:1169-1184`).
- **Brief correction.** The Hotels judgment callout's link is not one-way in the sense of "points at the section": it already jumps to the exact card (`SectionFlagCallout` calls `onJump(index, group)`, `step3ReviewSections.tsx:734`, which is `jumpToWarning`, `ShowReviewSurface.tsx:527-552`). What is missing is the card-to-reservation direction and any statement of what was read.

### 5.2 Parser: the inline emitter keeps its names

The non-resolvable variant of `UseRawResolution` (`lib/parser/types.ts:55-64`) gains one optional field:

```ts
| {
    resolvable: false;
    reason: "empty-raw" | "invalid-dmy" | "raw-not-guest-scoped" | "no-split-to-undo";
    /** What we read, for a read-only comparison. Set ONLY by
     *  emitInlineHotelGuestAmbiguity (reason "raw-not-guest-scoped"). Absent on
     *  every other emit and on warnings persisted before 2026-10-26 (jsonb,
     *  additive, no migration: the same posture as `resolution` itself). */
    readAs?: { kind: "hotels"; names: string[] };
  }
```

`emitInlineHotelGuestAmbiguity` sets `resolution: { resolvable: false, reason: "raw-not-guest-scoped", readAs: { kind: "hotels", names: [...params.parsedNames] } }`. Named `readAs`, not `parsed`, so no consumer that narrows `parsed` on `resolvable: true` (`lib/sync/useRawOverlay.ts:69-74`, `lib/sync/useRawDecisionState.ts:91-93`, `UseRawControl.tsx:461`) can read it by accident. The names are already crew-readable on `hotel_reservations.names`; storing them in the admin-only warning adds no data class.

### 5.3 The read-only comparison (both surfaces, one render path)

`UseRawControl`'s `disabled` branch (`UseRawControl.tsx:444-458`) gains a comparison block rendered ABOVE the existing reason sentence when `warning.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS"`. Because `UseRawControl` renders on the wizard card (`step3ReviewSections.tsx:3445-3454`) and the published card (`sectionWarningExtras.tsx:133-139`), one change covers both. The control's `warning` prop widens from `Pick<…, "code" | "resolution">` to include `"rawSnippet"`; both boundaries already pass the full warning (`components/admin/UseRawControlBoundary.tsx:84-89`).

```tsx
<span
  data-testid={tid("use-raw-reading")}
  className="grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs"
>
  {sheetSays ? (<><span className="text-text-subtle">Sheet says</span>
    <span data-testid={tid("use-raw-sheet-says")} className="wrap-break-word text-text">{sheetSays}</span></>) : null}
  {weRead ? (<><span className="text-text-subtle">We read</span>
    <span data-testid={tid("use-raw-we-read")} className="wrap-break-word text-text">{weRead}</span></>) : null}
</span>
```

The grid matches the parsed-reading grid the choice rows already use (`UseRawControl.tsx:519-537`). Values come from a new pure module, lib/admin/warningReadingDisplay.ts (new file) (§5.6).

### 5.4 Hotels section: the reservation marker (staged wizard only)

`HotelCard` gains `index: number` and `marker` props; `HotelsBreakdown` passes `i` and computes markers from `chrome?.calloutEntries`:

- `HOTEL_RESERVATION_JUDGMENT_CODES` = the four index-carrying hotel judgment codes listed in §5.1, each also asserted to be in `AMBIGUITY_CODES` by test.
- For reservation `i`, members = entries whose `warning.code` is in that set and whose `blockRef.index` passes `Number.isSafeInteger(x) && x >= 0 && x === i` and `i < shown.length` (`shown = hotels.slice(0, HOTELS_CAP)`, `step3ReviewSections.tsx:2808`).
- `HotelCard` root gets `data-hotel-index={index}` always (the jump target hook, same idiom as `data-room-nav`, `step3ReviewSections.tsx:2159`).

When members is non-empty, a block renders as the FIRST child of the card, above the hotel name (`step3ReviewSections.tsx:2903`):

```tsx
<div data-testid="wizard-step3-hotel-judgment-marker" className="flex flex-col gap-1">
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <JudgmentCallTag plate="surface" testId="wizard-step3-hotel-judgment-tag" />
    <button
      type="button"
      data-testid="wizard-step3-hotel-judgment-jump"
      onClick={() => chrome.onJumpToWarning!(first.index, members.map((m) => m.index))}
      className="inline-flex min-h-tap-min items-center text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      See how we read it<span className="sr-only"> for {hotelLabel}</span>
    </button>
  </div>
  {sheetSays ? (
    <p data-testid="wizard-step3-hotel-judgment-sheet-says" className="wrap-break-word text-xs text-text-subtle">
      Sheet says <span className="text-text">{sheetSays}</span>
    </p>
  ) : null}
</div>
```

- `first` = the member with the lowest full-array index; `sheetSays = sheetSaysText(first.warning.rawSnippet)`. One line only, by design (Builder's call C4).
- `hotelLabel` = `h.hotel_name || "Hotel"`, the card's own heading text (`step3ReviewSections.tsx:2905`).
- The plate is `surface` in both the flat and nested layouts: `HotelCard` paints no fill of its own (`step3ReviewSections.tsx:2897-2901`), so it sits on the panel's `bg-surface`.
- The marker needs `chrome.onJumpToWarning`, which exists only on the staged surface. On the published modal the marker does not render (`calloutEntries` absent). Accepted judgment calls drop out of `calloutEntries` because `bySection` is built from the ACTIVE partition (`ShowReviewSurface.tsx:286-293`), so accepting removes the marker.

### 5.5 The card's jump to the reservation, and the callout label

- Card: see §8. For the four hotel codes with a valid index, the section jump reads "Go to this reservation in Hotels" and calls the new `jumpToHotel(index)`.
- `jumpToHotel(index)` in `ShowReviewSurface` mirrors `jumpToRoom` (`ShowReviewSurface.tsx:558-566`): `setActive("hotels")`, query `[data-hotel-index="${index}"]` inside the scroller, `beginSuppressedScroll` + `scrollTo`, then the one-shot flash used by `jumpToWarning` (`clearWarningHighlight`, `data-step3-warning-flash`, `WARNING_HIGHLIGHT_MS`, `ShowReviewSurface.tsx:540-551`). A missing target degrades to `handleNavClick("hotels")`, the attention-jump precedent (`ShowReviewSurface.tsx:587-589`).
- `SectionFlagCallout` (`step3ReviewSections.tsx:641-762`): the judgment-variant jump label at `step3ReviewSections.tsx:716-717` becomes "See how we read it" when `readingShown(m.warning)` (§5.6) holds for EVERY member; otherwise it stays "Review in Sheet warnings". The flagged variant is unchanged. The sr-only `for {title}` suffix (`step3ReviewSections.tsx:737`) stays.

### 5.6 The reading-display module (new file: lib/admin/warningReadingDisplay.ts, pure, client-safe)

One home for every number and format in this section, so the card, the published card and the marker cannot drift.

| Export | Definition |
|---|---|
| `SHEET_SAYS_CAP` | `160` characters |
| `WE_READ_NAMES_CAP` | `6` names |
| `sheetSaysText(raw: unknown): string \| null` | non-string or blank → `null`; else `normalizeSnippet(raw)` (`lib/dataQuality/ignorableSnippet.ts:3-5`); longer than `SHEET_SAYS_CAP` → first `SHEET_SAYS_CAP` characters + `…` |
| `weReadGuestsText(readAs: unknown): string \| null` | not `{kind:"hotels", names: array}` → `null`; names filtered to non-blank trimmed strings; 0 → `no guests`; 1 → `1 guest: <name>`; n ≤ cap → `<n> guests: <a>, <b>, …`; n > cap → `<n> guests: <first six joined ", ">, and <n-6> more` |
| `USE_RAW_CODES` | the four use-raw codes, MOVED here from the module-local `IN_SCOPE` (`UseRawControl.tsx:55-60`), which then imports it, so one set governs both the control and the label below |
| `readingShown(w: ParseWarning): boolean` | true iff the card shows a reading: `USE_RAW_CODES.has(w.code) && w.resolution?.resolvable === true` (the choice control renders), OR `w.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS" && w.resolution?.resolvable === false && sheetSaysText(w.rawSnippet) !== null` (the §5.3 comparison renders). A use-raw code in a `legacy-unavailable` or other `disabled` state shows only a sentence and is false. |

The raw cell renders verbatim (whitespace-collapsed), not confirmation-stripped. Builder's call C3.

### 5.7 Help text

The card's help text is the catalog `helpfulContext`, so this is a §12.4 edit (§9). New `HOTEL_GUEST_SPLIT_AMBIGUOUS.helpfulContext`:

> If we split it wrong, fix the names in the sheet. Two people may have been merged, one split, part of the hotel name read as a person, or someone left out.

Builder's call C5 records the two deviations from the mockup's example.

---

## 6. Fix D: Accept, and a reading choice that waits for Save

### 6.1 Current state

- The per-row Ignore is `DataQualityWarningControls` (`components/admin/DataQualityWarningControls.tsx:101-268`), label `DataQualityWarningControls.tsx:247-253`, rendered only when `hasIgnorableSnippet` (`DataQualityWarningControls.tsx:116`, `DataQualityWarningControls.tsx:199`). Two backends: staged `setStagedWarningIgnore` (`app/admin/onboarding/_actions/stagedWarningIgnore.ts:130`), and the show routes `POST /api/admin/show/${slug}/data-quality/{ignore,unignore}` (`DataQualityWarningControls.tsx:124-133`). Success announces "Warning ignored." / "Warning restored." (`DataQualityWarningControls.tsx:179`), calls `onBeforeRefresh`, then `router.refresh()` (`DataQualityWarningControls.tsx:182-183`).
- The published bulk chip in `BulkIgnoreControls` reads "Ignore" / "Ignore <n>" (`components/admin/BulkIgnoreControls.tsx:173-178`), fail copy `BulkIgnoreControls.tsx:110`, announce `BulkIgnoreControls.tsx:135`.
- The reading choice `UseRawControl` saves on tap: `ChoiceRow.onClick` → `onSelect` → `fire(useRaw)` → `onToggle` (`UseRawControl.tsx:347-349`, `UseRawControl.tsx:420-430`); arrow keys select AND save (`UseRawControl.tsx:491-496`). `UseRawControlBoundary.onToggle` calls the surface action and `router.refresh()`es (`UseRawControlBoundary.tsx:56-82`).
- Wizard order inside a row: choice control (`step3ReviewSections.tsx:3445-3454`), role control (`step3ReviewSections.tsx:3455-3463`), controls note (`step3ReviewSections.tsx:3469-3476`), Report + Ignore (`step3ReviewSections.tsx:3480-3494`). Published order: Report + Ignore, then choice, then role (`sectionWarningExtras.tsx:122-146`).
- **Class sweep for the auto-save shape:** `RoleRecognizeControl` already has explicit Save and Cancel (`components/admin/RoleRecognizeControl.tsx:397-416`). `ArchivedTabOffer` writes only on its button. `UseRawControl` is the only control that writes on selection.
- **Controls-note sweep:** no judgment code carries a `controlsNote` today. The four that do are `UNKNOWN_FIELD`, `VENUE_ADDRESS_MISSING`, `PULL_SHEET_PARSE_PARTIAL`, `UNKNOWN_SECTION_HEADER` (`lib/messages/catalog.ts:1375`, `catalog.ts:1599`, `catalog.ts:1792`, `catalog.ts:2173`). So no shipped sentence says "Ignore" next to an Accept button; §15 adds a guard so none ever does.

### 6.2 Accept (all judgment codes, both surfaces)

`isJudgment = isWarnSeverity(warning) && isAmbiguityCode(warning.code)`, computed inside the component (both are pure, client-safe imports). Mechanism, endpoints, and testids (`dq-ignore-…`, `dq-unignore-…`, `dq-bulk-ignore-…`) are unchanged; only words change.

| Where | Needs a look (unchanged) | Judgment call |
|---|---|---|
| Active row button | `Ignore` / `Ignoring…` | `Accept` / `Accepting…` |
| Ignored-list row button | `Un-ignore` / `Un-ignoring…` | `Undo accept` / `Undoing…` |
| Announce on success | `Warning ignored.` / `Warning restored.` | `Judgment call accepted.` / `Judgment call restored.` |
| Error copy | unchanged (`DataQualityWarningControls.tsx:118-121`) | `Couldn't accept that judgment call. Refresh and try again.` / `Couldn't undo that. Refresh and try again.` |
| Published bulk chip (group of one code) | unchanged | text `Accept` / `Accepting…` / `Are you sure?`; accessible name `Accept <n>` / `Are you sure? Accept <n>` / `Accepting…`; announce `1 accepted.` / `<n> accepted.`; fail `Couldn't accept those judgment calls. Refresh and try again.` |

The "Ignored (N)" disclosure keeps its heading on both surfaces (Builder's call D3).

### 6.3 The deferred reading choice

**Where it applies.** Every row where `UseRawControl` would render the radio pair, i.e. `deriveUseRawControlState(w, decision, false)` is one of `transform-active`, `apply-pending`, `raw-active`, `clear-pending`, AND a `DataQualityWarningControls` renders in the same row. In production that is every such row on both surfaces: the wizard renders the choice control under `wizardSessionId && dfid` (`step3ReviewSections.tsx:3445`) and the action bar under `dq && dfid && isWarn` (`step3ReviewSections.tsx:3480`), every use-raw code is emitted at `warn` severity (for example `warnings.ts:378`), and a staged row without `dq` is NO-PREVIEW and has no controls at all (`components/admin/review/sectionData.ts:163-165`); the published per-item controls always render both (`sectionWarningExtras.tsx:122-139`). A mount with no action bar (standalone tests only) keeps today's immediate save.

**How the selection crosses components.** A new client module components/admin/useRawDraft.tsx (new file) exports `UseRawDraftProvider` and `useUseRawDraft()`:

- Provider props: `warning: ParseWarning`, `decision: UseRawDecision | undefined`, plus the same surface union `UseRawControlBoundary` takes (`{surface:"show", showId}` | `{surface:"wizard", wizardSessionId, driveFileId}`, `UseRawControlBoundary.tsx:36-40`).
- State: `pendingRaw: boolean | null` (`null` = nothing picked).
- Derived: `persistedRaw = state === "raw-active" || state === "apply-pending"` (the same expression as today's `rawChecked` minus the in-flight overlay, `UseRawControl.tsx:470-471`); `dirty = pendingRaw !== null && pendingRaw !== persistedRaw`. A refresh that makes `persistedRaw` equal `pendingRaw` therefore cleans the row with no extra code.
- Actions: `select(useRaw)` sets `pendingRaw` and clears any action-bar error; `cancel()` sets `pendingRaw = null`; `saveReading(): Promise<"ok" | "failed">` calls the existing action and clears `pendingRaw` on `ok`. It does NOT refresh; the action bar owns the single refresh.
- The action call is extracted from `UseRawControlBoundary.onToggle` into one exported function `callUseRawAction(surface, warning, useRaw)` in the same module, which both the boundary and the provider use. One argument assembly, two callers.

Mounts: the wizard wraps the row's controls block (`step3ReviewSections.tsx:3445-3494`) in the provider when the conditions above hold; the published `SectionWarningItemControls` wraps its fragment (`sectionWarningExtras.tsx:119-147`) the same way and, for these rows only, renders the choice control BEFORE `DataQualityWarningControls`. For every other code the choice control renders `null` (`UseRawControl.tsx:72`), so the reorder changes no other row.

**Choice control inside a provider.**

- `ChoiceRow.onSelect` and the arrow-key path call `draft.select(…)`; they never call `fire`. Arrow keys still move focus and select (WAI radio pattern) but no longer write.
- Checked row = `pendingRaw ?? persistedRaw`.
- `ChoiceRow` renders a `marker` prop as given instead of `checked && marker` (`UseRawControl.tsx:375-377`). Clean: the checked row gets today's marker ("In use", or "Selected" in the pending-apply states, `UseRawControl.tsx:487-488`), the other row `null`, byte-identical to today. Dirty: the persisted row keeps its marker while unchecked, the picked row gets none.
- The in-control error and "Try again" (`UseRawControl.tsx:594-612`) and the `Saving…` live text (`UseRawControl.tsx:590-592`) do not render inside a provider; the action bar owns progress and errors. The pending-apply notes (`UseRawControl.tsx:574-585`) still render from persisted state.

**Action bar (`DataQualityWarningControls` inside a provider).** One main button element whose label morphs, so focus on it survives every label change.

| State | Main button | Beside it |
|---|---|---|
| clean | `Accept` (active) or `Undo accept` (ignored list) | Report, as today |
| dirty | `Save` | Report; `Cancel` (ghost button); hint `Not saved yet` (`text-xs text-text-subtle`, `id` referenced by the main button's `aria-describedby`) |
| saving | `Saving…` (from dirty) or `Accepting…` / `Undoing…` (from clean); disabled, `aria-busy` | Cancel disabled; radio rows soft-disabled (`aria-disabled`, existing `ChoiceRow` path `UseRawControl.tsx:343-358`) |
| error | label of the underlying clean or dirty state | the existing error paragraph slot (`role="alert"`, `DataQualityWarningControls.tsx:257-265`) with the copy below |

When the row is not ignorable (`hasIgnorableSnippet` false), clean shows no main button (as today) and dirty still shows Save, Cancel and the hint.

Cancel classes: `inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-3 text-sm font-medium text-text transition-colors duration-fast hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` plus the plate's ring-offset class, the archived-tab ghost idiom (`components/admin/wizard/archivedTabOffer.tsx:64-66`) on this component's `px-3`. After Cancel, focus moves to the main button (Cancel unmounts).

**Save sequence.**

1. `saveReading()`. On `failed`: stay dirty, show `That didn’t save. The cell may have changed.` (the control's existing copy, `UseRawControl.tsx:597`), no refresh.
2. If the row is active AND ignorable: run the existing ignore arm (`runShowArm` / `runStagedArm`, `DataQualityWarningControls.tsx:124-148`). On failure: `router.refresh()` (the reading DID save, so the persisted state must re-read) and show `Your reading is saved, but we couldn't accept the judgment call. Refresh and try again.`
3. Success: announce `Reading saved. Judgment call accepted.` (active + ignorable) or `Reading saved.` (ignored list, or not ignorable); `onBeforeRefresh?.()`; `router.refresh()`.

Each step takes its own lock inside its own existing endpoint, one after the other; no lock nests (invariant 2 unchanged).

**Published bulk accept** acts on the persisted readings; a card with an unsaved pick loses the pick when it moves to the Ignored list (documented limit L8).

---

## 7. Fix E: the archived pull sheet card

### 7.1 Current state

- `emitArchivedTabWarnings` (`lib/sync/pullSheetOverride.ts:118-128`) emits per non-included tab: `message` = `Pull sheet found on archived tab "<name>"; left out of the parse.`, `rawSnippet` = `tab.headerPreviews.join(" | ")`, `blockRef: { kind: "pull_sheet_archived_tab", name }`. **Brief correction:** `message` is that sentence, not the tab name; the name is `blockRef.name`. Pushed on every scan path through `finalizeArchivedTabs` (`pullSheetOverride.ts:229-233`), cron included, so published shows carry it too.
- `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (`contentChangedWarning`, `pullSheetOverride.ts:136-143`) uses the same `blockRef.kind`.
- That kind is not in `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:28-51`), so both codes route to "warnings" (`warningsBySection`, `step3SectionStatus.ts:91-104`).
- The deep link already exists: tab scope via the visible-tab map (`showDayTimeAnchors.ts:285-290`).
- The include action is `ArchivedTabOffer` (`archivedTabOffer.tsx:107-210`): its own bordered card, title, previews list, sentence, button `Use this show’s gear` / `Including…` (`archivedTabOffer.tsx:183`), local "Keep skipped" (`archivedTabOffer.tsx:112`, `archivedTabOffer.tsx:186-198`). Offers come from `deriveArchivedOffers(tabs, staged, override)` (`archivedTabOffer.tsx:24-43`). Mounted in Pack list (`step3ReviewSections.tsx:2602-2612`) and the Step-3 Resolve box with `showDismiss={false}` (`Step3ReviewModal.tsx:1107-1114`). Published has its own `PublishedArchivedTabOffer` in Pack list (`step3ReviewSections.tsx:2620-2667`), with offer names derived from ACTIVE `PULL_SHEET_ON_ARCHIVED_TAB` warnings across all sections (`lib/admin/deriveActiveArchivedTabNames.ts:11-25`), so a published Ignore hides the published offer.
- Published `SectionData.archivedPullSheetTabs` is always `[]` (`components/admin/review/publishedAdapter.ts:85`).
- Catalog copy says "Gear section" in TWO rows: `PULL_SHEET_ON_ARCHIVED_TAB.helpfulContext` (`lib/messages/catalog.ts:1806-1807`) and `PULL_SHEET_OVERRIDE_CONTENT_CHANGED.helpfulContext` (`catalog.ts:1822-1823`). The brief named only the first; the class sweep found the second.

### 7.2 Routing: add the kind to `KIND_TO_SECTION`

`pull_sheet_archived_tab: "packlist"`. Consequences, all intended:

| Where | Before | After |
|---|---|---|
| Wizard Pack list section | clean (no warn routed) | flagged (amber chip, "Needs a look" pill) while an archived-tab warning is active; its `SectionFlagCallout` lists the warning with "Review in Sheet warnings" (`offersFix` is false: `lib/admin/warningFixAffordance.ts:15-24` counts only use-raw and role fixes) |
| Wizard Sheet warnings section | the warning counted in its flag | the warning still LISTED (the wizard list shows every row), no longer flagging this section on its own account |
| `deriveSectionStatuses().flaggedCount` | counts Sheet warnings | counts Pack list instead; same total when this is the only warn |
| Attention pill and menu (both surfaces) | row's second line "Sheet warnings" | "Pack list"; the pill COUNT is unchanged (it counts warnings, not sections) |
| Published modal | card in the Warnings section's extras, counted in `here` | card in Pack list's extras, directly below the published include offer; Warnings heading and rail count drop by one, Pack list gains its flag |
| Published offer derivation | unaffected | unaffected: `deriveActiveArchivedTabNames` walks every section |
| Card section jump (§8) | none | `Go to Pack list` |

The parser kind pin (`tests/parser/sectionKind.test.ts:29-31`) checks that parser-emittable kinds are routable; adding a sync-emitted key cannot fail it.

### 7.3 Wizard card body for `PULL_SHEET_ON_ARCHIVED_TAB`

Below the title row, in the same slot and type ramp as the row-label line (`text-xs text-text-subtle`, value in `text-text`):

- `Tab <name>` when `blockRef.name` is a non-blank string. Testid `…-warning-${i}-archived-tab`.
- `Cases <previews>` when at least one preview exists. Testid `…-warning-${i}-archived-cases`. Previews come from the matched tab's `headerPreviews` (match = `archivedPullSheetTabs` entry whose `tabName === blockRef.name`, exact); with no match, from `rawSnippet.split(" | ")` (documented limit L7). Format: each preview in typographic single quotes, joined with `, `; blank preview → `(no header text)` (the shipped wording, `archivedTabOffer.tsx:166`); at most `CASE_PREVIEWS_CAP = 3` shown, each cut at `CASE_PREVIEW_CHARS = 40` characters + `…`; more than three → ` and <k> more`. Example: `Cases ‘AUDIO 1’, ‘VIDEO RACK’, ‘(no header text)’ and 2 more`. Both constants live in lib/admin/warningReadingDisplay.ts (new file) with a pure `casePreviewsText(previews: unknown): string | null`.
- The include button, when the tab is in `deriveArchivedOffers(archivedPullSheetTabs, true, pullSheetOverride).offers` AND `wizardSessionId` and `dfid` are present. Label `Use this pull sheet` / `Including…`. Testid `…-warning-${i}-archived-include`.
- The section jump `Go to Pack list` (§8).
- The existing Report + Ignore. Ignore keeps its label (needs-a-look code) and means "keep it skipped": skipped is the default, nothing else is written.

The button comes from a new export `ArchivedTabIncludeButton` extracted from `ArchivedTabOffer` (`archivedTabOffer.tsx:116-139`, `archivedTabOffer.tsx:176-184`, `archivedTabOffer.tsx:214-216`): props `dfid`, `wizardSessionId`, `tab`, `label`, `plate: "tinted" | "surface"`, optional `onBeforeRefresh`. It POSTs the same body through `postPullSheetOverride` (`archivedTabOffer.tsx:68-82`) and renders the same always-mounted `role="status"` error region with `ARCHIVED_TAB_ERROR` (`archivedTabOffer.tsx:87-88`). `ArchivedTabOffer` re-renders its own button through it with its own label, so the two cannot diverge in behavior. The card passes `plate="surface"` (outline `border-text-faint`, per the per-call-site color rule at `archivedTabOffer.tsx:47-57`) and `onBeforeRefresh={holdFocusInPanel}`: success removes the warning, which unmounts the focused button, the same focus-loss class the ignore path already guards (`step3ReviewSections.tsx:3090-3101`). "Keep skipped" never renders on the card.

`WarningsBreakdown` gains staged-only props `archivedPullSheetTabs` and `pullSheetOverride`, passed from the warnings registry render (`step3ReviewSections.tsx:5332-5344`) inside the existing `isStaged(s)` spread.

### 7.4 Published card

No card-level include control. After §7.2 the card renders in Pack list directly below `PublishedArchivedTabOffer`, which is the include control, and the card's Ignore already hides that offer. The published card body is otherwise unchanged; it gains only the catalog copy fix.

### 7.5 Catalog copy (§12.4, see §9)

- `PULL_SHEET_ON_ARCHIVED_TAB.helpfulContext`: `We found a PULL SHEET on a tab that looks like an older copy, so we left it out to avoid mixing old gear in. If it really is this show's gear, include it from the Pack list section.`
- `PULL_SHEET_OVERRIDE_CONTENT_CHANGED.helpfulContext`: `A pull sheet you'd included changed since you last saw it, so we left it out rather than publish gear you haven't seen. Recheck the tab, then re-include it from the Pack list section.`

Both are true on both surfaces: the wizard Pack list renders `ArchivedTabOffer`, the published Pack list renders `PublishedArchivedTabOffer`.

---

## 8. Fix F: section jumps on the staged wizard

### 8.1 Current state

`onJumpToSection` (`step3ReviewSections.tsx:498`) reaches the Warnings section chrome only inside the `pointerTargets !== null` spread (`ShowReviewSurface.tsx:1154-1159`), and `pointerTargets` is non-null only when `routedWarningsRenderElsewhere` (`ShowReviewSurface.tsx:494-504`), i.e. published. Its one consumer is `ElsewherePointerSentence` (`step3ReviewSections.tsx:852`, `step3ReviewSections.tsx:3172-3176`). Only the Warnings `<section>` has a DOM id (`ShowReviewSurface.tsx:1088`); other sections are reached by ref (`sectionElsRef`, `ShowReviewSurface.tsx:1090-1093`) through `handleNavClick` (`ShowReviewSurface.tsx:472-487`).

### 8.2 Change

The Warnings section chrome on the staged surface gains, in one new spread inserted after the existing pointer spread:

```ts
...(s.id === "warnings" && isStaged(data)
  ? {
      onJumpToSection: (id: SectionId) => handleNavClick(id),
      jumpSections: sections.filter((x) => x.id !== "warnings" && x.id !== "report").map((x) => ({ id: x.id, label: x.label })),
      onJumpToHotel: jumpToHotel,
      hotelCount: Math.min(data.hotels.length, HOTELS_CAP),
    }
  : {}),
```

`jumpSections`, `onJumpToHotel` and `hotelCount` are new optional `Step3SectionChrome` fields, ABSENT elsewhere (exactOptionalPropertyTypes discipline, as the type documents at `step3ReviewSections.tsx:499-506`). The two spreads are mutually exclusive by construction (published vs staged), so neither overwrites the other.

### 8.3 The jump on a card

Rendered for a wizard ACTIVE row when all hold: `isWarn`; `w.code !== "VENUE_ADDRESS_MISSING"` (R4); `chrome.onJumpToSection` present; `target = sectionForWarning(w)` (`lib/admin/step3SectionStatus.ts:76-88`) is non-null and present in `chrome.jumpSections`. Placement: after the help text, in the slot the deleted text link occupied. Exactly one jump per card:

- `target === "hotels"`, code in `HOTEL_RESERVATION_JUDGMENT_CODES`, `blockRef.index` a safe integer with `0 <= index < chrome.hotelCount`, and `chrome.onJumpToHotel` present → `Go to this reservation in Hotels`, calls `onJumpToHotel(index)`.
- otherwise → `Go to <label>`, calls `onJumpToSection(target)`.

```tsx
<button
  type="button"
  data-testid={`wizard-step3-card-${dfid}-warning-${i}-section-jump`}
  data-jump={reservation ? "reservation" : target}
  onClick={…}
  className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
>
  {visibleLabel}<span className="sr-only"> for {stripEmphasis(title)}</span>
</button>
```

The classes are the deleted link's (`step3ReviewSections.tsx:3434`), so the slot keeps its type ramp and 44px floor. Info rows and Ignored-list rows get no jump: info rows are never routed (`warningsBySection` skips them, `step3SectionStatus.ts:96`), and an ignored row has nothing live in its section. The published modal gets no card jumps: its cards already render inside their sections.

---

## 9. Catalog lockstep (§12.4 and the warning-card copy registry)

Three `helpfulContext` rows change: `HOTEL_GUEST_SPLIT_AMBIGUOUS` (§5.7), `PULL_SHEET_ON_ARCHIVED_TAB` and `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (§7.5). `helpfulContext` is §12.4 prose compared by x1 parity (`lib/messages/catalog.ts:53-57`). Every row lands all of these in ONE commit:

| # | File | Location |
|---|---|---|
| 1 | Master spec §12.4 helpfulContext appendix | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3216`, `2026-04-30-fxav-crew-pages-v1.md:3230`, `2026-04-30-fxav-crew-pages-v1.md:3231` (yaml block inside §12.4, which opens at `2026-04-30-fxav-crew-pages-v1.md:2759`) |
| 2 | Regenerated codes | run `pnpm gen:spec-codes` (`scripts/extract-spec-codes.ts`), commit `lib/messages/__generated__/spec-codes.ts` |
| 3 | Runtime catalog | `lib/messages/catalog.ts:1645-1646`, `catalog.ts:1806-1807`, `catalog.ts:1822-1823` |
| 4 | Warning-card copy fixture | `EXPECTED_HELPFUL_CONTEXT` in `tests/messages/warningCardCopyRegistry.ts` (rows at `warningCardCopyRegistry.ts:238`, `warningCardCopyRegistry.ts:251`, `warningCardCopyRegistry.ts:253`) |
| 5 | The fixture's canonical table | `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.2 rows 12 (`2026-07-20-warning-card-copy-restore.md:132`), 35 (`2026-07-20-warning-card-copy-restore.md:155`), 36 (`2026-07-20-warning-card-copy-restore.md:156`); the fixture is "updated only by editing this spec" (`2026-07-20-warning-card-copy-restore.md:105`). Add one dated amendment line under its control-references paragraph (`2026-07-20-warning-card-copy-restore.md:177`), which states the include offer is "NOT on the warning card" and stops being true. |
| 6 | Hotel copy pin | `tests/messages/hotelAmbiguityCatalogCopy.test.ts:48-50` |

No `dougFacing`, `crewFacing`, `followUp`, `title`, `triggerContext`, `longExplanation` or `controlsNote` changes. No new code, so no new §12.4 row and no `WARNING_CARD_COPY_CODES` membership change (all three codes are already members, `warningCardCopyRegistry.ts:21`, `warningCardCopyRegistry.ts:43`, `warningCardCopyRegistry.ts:44`).

---

## 10. Invariants

- **Invariant 10 (mutation surfaces).** No new mutating route handler, no new `"use server"` file or export, no inline server action. Every write goes through a surface already in `AUDITABLE_MUTATIONS` (`tests/log/_auditableMutations.ts`): `setStagedWarningIgnore` (`_auditableMutations.ts:417`), the show `data-quality/ignore` route (`_auditableMutations.ts:100`), `setUseRawDecisionAction` (`_auditableMutations.ts:393`, `_auditableMutations.ts:398`), `setStagedUseRawDecisionAction` (`_auditableMutations.ts:403`, `_auditableMutations.ts:408`), and the onboarding `pull-sheet-override` route (`_auditableMutations.ts:346`, `_auditableMutations.ts:351`). components/admin/useRawDraft.tsx (new file) is a `"use client"` module that calls existing actions; the static discovery in `tests/log/_metaMutationSurfaceObservability.test.ts` walks `"use server"` files and route handlers, neither of which this adds.
- **Invariant 2 (advisory locks).** Unchanged. Save runs two existing endpoints sequentially from the client; each acquires its own lock at its own single layer.
- **Invariant 5.** No code string renders. Every new failure path maps to static copy; `callUseRawAction` returns `"ok" | "failed"` and never surfaces `result.code`.
- **Invariant 9.** No new Supabase call.
- **DB.** `resolution.readAs` and the venue `sourceCell` are additive jsonb on `shows_internal.parse_warnings` and `pending_syncs.parse_result`; no DDL, no CHECK, no RPC, no migration. The DB completeness matrix is N/A for every cell for that reason.

---

## 11. Copy: every new or changed user-visible string

Apostrophes follow the file the string lands in (Builder's call D7). No string contains an em dash.

| Where | String |
|---|---|
| Card tag, reservation tag | `Judgment call` |
| sr-only prefixes | `Needs a look: ` · `Note: ` |
| Sheet icon link accessible name | component-owned: `Open the source sheet for <title> in Google Sheets (opens in a new tab)` |
| Comparison labels | `Sheet says` · `We read` |
| We read values | `no guests` · `1 guest: <name>` · `<n> guests: <names>` · `<n> guests: <six names>, and <k> more` |
| Reservation marker link | `See how we read it` + sr-only ` for <hotel name>` |
| Callout judgment link (reading-shown members) | `See how we read it` |
| Card jumps | `Go to <section label>` · `Go to this reservation in Hotels`, each + sr-only ` for <title>` |
| Accept family | `Accept` · `Accepting…` · `Undo accept` · `Undoing…` |
| Save family | `Save` · `Saving…` · `Cancel` · `Not saved yet` |
| Announcements | `Judgment call accepted.` · `Judgment call restored.` · `Reading saved. Judgment call accepted.` · `Reading saved.` · `1 accepted.` · `<n> accepted.` |
| Errors | `Couldn't accept that judgment call. Refresh and try again.` · `Couldn't undo that. Refresh and try again.` · `Your reading is saved, but we couldn't accept the judgment call. Refresh and try again.` · `Couldn't accept those judgment calls. Refresh and try again.` · reused: `That didn’t save. The cell may have changed.` |
| Bulk chip names | `Accept <n>` · `Are you sure? Accept <n>` |
| Archived card | `Tab ` + name · `Cases ` + previews · `Use this pull sheet` · reused `Including…` · reused `(no header text)` |
| Catalog helpfulContext | the three strings in §5.7 and §7.5 |

The pre-code mechanical checklist (`_metaEmDashCopy`, tap floors, `text-xs/relaxed` and `text-subtle` usage) runs against this table before implementation starts.

---

## 12. Mode boundaries

| Element | Wizard needs-look | Wizard judgment | Wizard info | Wizard Ignored list | Published active card | Published muted card | Published note | Staged review page |
|---|---|---|---|---|---|---|---|---|
| Severity word | removed | removed | removed | never had | never had | never had | never had | never had |
| Chip | warm triangle | info-bg ring glyph | info | none | none (compact shell) | none | none | none |
| 6px dot | warm fill | hollow subtle ring | faint fill | none | none | none | none | none |
| Judgment tag | no | yes (`surface`) | no | no | judgment codes (`warning-bg`) | judgment codes (`surface-sunken`) | no | judgment codes (`warning-bg`) |
| Sheet link form | icon, title row | icon, title row | icon, title row | none | text, controls band | text, controls band | text, controls band | text, controls band |
| Section or reservation jump | yes (staged) | yes (staged) | no | no | no | no | no | no |
| Accept wording | n/a | Accept | n/a | Undo accept (judgment rows) | Accept | Undo accept | n/a | n/a (no controls) |
| Deferred Save | n/a | radio codes | n/a | n/a | radio codes | radio codes | n/a | n/a |
| Read-only comparison | n/a | inline guest split | n/a | n/a | inline guest split | inline guest split | n/a | n/a (no controls) |
| Archived card lines + include | lines + include (staged) | n/a | n/a | no | no (offer adjacent in Pack list) | no | n/a | no |

"Radio codes" = the four `USE_RAW_CODES` (§5.6) in a resolvable state. "Inline guest split" = `HOTEL_GUEST_SPLIT_AMBIGUOUS` in the `disabled` state. The reservation marker (§5.4) is not on a warning card: it renders on the hotel card in the Hotels section of the staged wizard only, and nowhere on the published modal or the staged review page.

---

## 13. Dimensional Invariants: the wizard title row with the sheet icon link

Parent: the title row `div` (§3.5). Children: the text cluster `span` and the `SheetIconLink` anchor. The anchor's 44px hit area is an out-of-flow ::before overlay, invisible to `getBoundingClientRect()` (`SheetIconLink.tsx:5-9`), so the overlay rows below are computed from the anchor rect plus its resolved insets (12 / 10 / 14 px).

| ID | Relationship | Guaranteed by | Assertion (px, tolerance 0.5) |
|---|---|---|---|
| DI-1 | row height ≥ 44 when the link renders | `min-h-tap-min` on the row (`--spacing-tap-min: 44px`, `app/globals.css:224`) | `row.height >= 44` |
| DI-2 | row has no 44px floor when the link is absent | conditional class | link-less single-line row `height < 44` |
| DI-3 | anchor box is 20×20 | `size-5` in `BASE_CLASSES` (`SheetIconLink.tsx:76`) | `link.width === 20 && link.height === 20` |
| DI-4 | anchor vertically centred in the row | `items-center` on the row | `(link.top - row.top) === (row.bottom - link.bottom)` |
| DI-5 | vertical overlay contained | DI-1 + DI-4 | `link.top - 12 >= row.top` and `link.bottom + 12 <= row.bottom` |
| DI-6 | heading-side clearance ≥ 10 | `gap-2.5` on the row | `link.left - cluster.right >= 10` |
| DI-7 | trailing edge free: anchor is the row's last box | DOM order + cluster `flex-1` | `link.right === row.right` |
| DI-8 | trailing overlay inside the panel's padding | panel `p-tile-pad` (`--spacing-tile-pad: 20px`, `globals.css:240`) ≥ 14 | `document.elementFromPoint(link.right + 13, link.top + 10)` is the anchor |
| DI-9 | row spans the content column | `w-full` on the row | `row.width === column.width` |
| DI-10 | a long title wraps inside the cluster, never under the link | `min-w-0 flex-1` on the cluster | at 320, 375 and 430 widths with a 120-character title: `cluster.right <= link.left - 10` and `link.top >= row.top` |
| DI-11 | the tag never splits | `whitespace-nowrap shrink-0` | tag `height` equals its single-line height at every width |

DI-1 to DI-9 run at 320, 375, 430, 640 and 1280 widths, on a needs-look, a judgment and an info row. A premise check first asserts each fixture row rendered its link and (for the judgment row) its tag, so three copies of one row cannot pass as three kinds.

---

## 14. Transition Inventory: the reading choice and its action bar

States: **C** clean (main button Accept), **D** dirty (Save, Cancel, hint), **S** saving (a write in flight), **V** saved (success handled: announce, focus hand-off, refresh), **E** error (copy shown over the underlying C or D).

| Pair | Reachable as | Treatment |
|---|---|---|
| C → D | pick the other reading | instant, local state |
| D → C | Cancel; or pick the persisted reading; or a refresh makes persisted equal pending | instant; Cancel moves focus to the main button |
| C → S | Accept | instant label swap `Accepting…` |
| S → C | not direct (only via V or E) | n/a |
| D → S | Save | instant label swap `Saving…` |
| S → D | unreachable: rows and Cancel are disabled during S | n/a |
| C → V / D → V | only through S | n/a |
| S → V | success | instant; the existing announce region speaks; the row then usually leaves the active list (existing instant move) |
| V → C | refresh keeps the row (not ignorable, or published ignored list) | instant |
| V → D | unreachable: success clears `pendingRaw` | n/a |
| S → E | any failure | instant; `role="alert"` paragraph appears (existing slot) |
| E → C | Cancel (if over D), or a retried Accept that succeeds via S → V | instant; error cleared |
| E → D | pick a row (clears the error, keeps or changes the pick) | instant |
| E → S | retry Save or Accept | instant |
| C ↔ E, D ↔ V, C ↔ S (reverse) | covered above or unreachable | n/a |

No state animates; every change is a text or presence swap, so `prefers-reduced-motion` needs no branch. The existing row move to the Ignored list and the existing flash are unchanged.

Compound transitions:

1. **Refresh during D** (another tab saved a reading): `persistedRaw` changes; if it now equals `pendingRaw` the row is C, else stays D with the new marker on the new persisted row.
2. **Warning disappears during D** (re-scan): the row unmounts; the pick is dropped silently; nothing was written.
3. **Report modal opened during D**: independent; the pick survives.
4. **Modal closes during S**: the request completes; a post-unmount state update is a no-op.
5. **Partial success** (reading saved, accept failed): refresh, then E over C (the persisted reading now equals the pick).
6. **Published bulk accept during D** on a sibling card in the same group: the card moves to Ignored; the unsaved pick is dropped (L8).
7. **Pending-apply note during D** (published): the note reflects persisted state and stays as is.

Card chrome (§3) and the jumps (§5, §8) have no state transitions: kind is derived from the code, and jump presence from data. Scrolling uses the existing `motion-safe` smooth scroll and flash.

---

## 15. Guard conditions

| Input | Null / empty / zero / NaN / out of range | Renders |
|---|---|---|
| `w.sourceCell` or `dfid` | absent, or `buildSheetDeepLink` returns null | no icon link; row has no 44px floor |
| title | always non-empty (`reviewWarningTitle` falls back) | `stripEmphasis(title)` whitespace-only → link uses its no-subject phrasing (`SheetIconLink.tsx:96-100`) |
| `w.rawSnippet` | not a string, or blank after normalize | no "Sheet says"; not ignorable, so no Accept (existing `hasIgnorableSnippet` rule) |
| `resolution.readAs` | absent (legacy, or other reasons) | no "We read" line |
| `readAs.names` | `[]`, or every entry blank | `We read` `no guests` |
| `readAs` malformed (jsonb is unvalidated) | not `{kind:"hotels", names: string[]}` | treated as absent |
| `blockRef.index` | absent, non-integer, `NaN`, negative, `>= hotelCount` | no reservation marker; card jump falls back to `Go to Hotels` |
| `chrome.calloutEntries` / `onJumpToWarning` | absent (published, standalone) | no reservation marker |
| `chrome.onJumpToSection` / `jumpSections` | absent | no card jump |
| `sectionForWarning(w)` | `null`, `"warnings"`, or not rendered | no card jump |
| `blockRef.name` (archived) | absent or blank | no `Tab` line; no include button (no tab to match) |
| `headerPreviews` / `rawSnippet` previews | empty | no `Cases` line |
| tab not in `offers` (override active, divergent, already included) | | no include button; jump and Ignore still render |
| `wizardSessionId` | absent | no choice control, no include button (existing gates) |
| `decision` | undefined | `transform-active`, persisted reading = ours |
| `dq` | absent on a staged row | NO-PREVIEW: no controls at all (existing) |
| Unknown anchor `kind` or several empty venue-address rows | | venue region link, never a guessed cell |

---

## 16. Test strategy

Each test states the failure it catches. Real-browser tests run in the existing step-3 and published modal harnesses (`tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/_publishedReviewModalHarness.tsx`).

### 16.1 Unit and jsdom

| Test | Catches |
|---|---|
| `resolveVenueAddressValueCell` over anchors built from a real xlsx fixture (2-col venue block, empty address) | value cell off by a column; matching a `Hotel Address` row in a hotel block (kind filter dropped); picking one of two empty rows (must be null) |
| `attachSourceCellAnchors` with both a cell and a region source, then a second region-only pass | region assigned when a cell exists; a later region pass demoting the cell |
| `LINK_ONLY_ANCHORED` exact-membership pins (`tests/drive/showDayTimeAnchors.test.ts`, `tests/parser/parseWarningDeepLinkRender.test.tsx`) updated | silent set drift |
| `emitInlineHotelGuestAmbiguity` emits `readAs.names` equal to the reservation's `names` (assert against the parsed `hotelReservations[index].names`, not a literal) | emitter storing names that differ from what the reservation shows |
| `weReadGuestsText`, `sheetSaysText`, `casePreviewsText` tables: 0, 1, cap, cap+1 names; blank names; non-string input; 159/160/161 chars; 0, 3, 4 previews; blank preview | off-by-one at each cap; blank leaking as an empty name |
| Wizard row kind matrix: one needs-look, one judgment, one info fixture; assert chip glyph, dot class, tag presence, sr prefix, and that the text `warn` / `info` appears nowhere in the row (scan the row with the title node removed so a title containing "info" cannot satisfy or break it) | the word surviving; tag on the wrong kind |
| Published card renders the tag for a judgment code and not for a needs-look code, in both tones, with the expected border class per plate | tag missing on published; wrong border on tinted plate |
| `DataQualityWarningControls` labels and announcements per kind and mode, testids unchanged | judgment rows still reading Ignore; testid churn breaking other suites |
| Deferred choice, inside the provider: select → no action call (spy on the server-action module) and Save appears; Cancel → no call, focus on main button; Save → reading action then ignore, in that order, then one refresh; reading fails → no ignore call, stays dirty; ignore fails → refresh happens and the partial-success copy renders; arrow keys select without calling | auto-save surviving; accept running on a failed save; double refresh; wrong order |
| Deferred choice transition audit: drive every reachable pair in §14 and assert the unreachable ones stay unreachable (S → D blocked while busy) | missing state handling |
| Provider absent: `UseRawControl` still saves on tap | fallback regression |
| Ignored-list row with a dirty pick: Save calls only the reading action, announces `Reading saved.` | re-accepting an accepted row |
| `BulkIgnoreControls` judgment group labels and names | chip still saying Ignore |
| `KIND_TO_SECTION` routes both archived-tab codes to `packlist`; `warningsBySection` buckets them there; re-run every suite that imports `KIND_TO_SECTION` (`tests/parser/sectionKind.test.ts`, `tests/parser/fuzz/groundTruth.ts`, `tests/components/admin/review/routedWarningsGate.test.tsx`, `tests/components/admin/review/__fixtures__/reviewSnapshot.ts` consumers, `tests/components/admin/wizard/step3ReviewSections.test.tsx`) | routing missed for the content-changed code; a snapshot that silently assumed Warnings |
| Archived card: lines from the matched tab; fallback split from `rawSnippet`; include button only when in `offers`; POST body equals `ArchivedTabOffer`'s for the same tab (both through `ArchivedTabIncludeButton`) | include on an already-overridden tab; a second POST shape |
| Section jump presence: per code, per rendered-section set; `VENUE_ADDRESS_MISSING` never; info rows never; published never | jump on the venue card; jump to an unrendered section |
| Catalog guard: no `AMBIGUITY_CODES` member's `controlsNote` mentions `Ignore` | a future note contradicting the Accept button |
| §9 lockstep: x1 parity (`tests/cross-cutting/codes.test.ts`), `_metaWarningCardCopy`, `hotelAmbiguityCatalogCopy` | one of the six places drifting |

### 16.2 Real browser (Playwright)

| Test | Why not jsdom |
|---|---|
| §13 DI-1 to DI-11 on the wizard title row | layout and hit-testing |
| Tap floors: every new button (jumps, Save, Cancel, include, marker link) ≥ 44px tall by rect | layout |
| Card → section jump: click `Go to Pack list`, assert the Pack list section top is within 8px of the scroller top after settle and the rail's active item is Pack list | real scrolling |
| Card → reservation and reservation → card: the target element carries `data-step3-warning-flash` and is in view | real scrolling plus flash attribute |
| One full Save flow on the step-3 harness with the action module stubbed: pick, Save, card leaves the active list, focus lands on the panel focus anchor | focus after unmount needs a real document |

### 16.3 Line-keyed censuses and pinned counts to re-derive

Edits shift lines in `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`, `components/admin/UseRawControl.tsx`, `components/admin/PerShowActionableWarnings.tsx` and `components/admin/DataQualityWarningControls.tsx`. Re-key, by kind and text, never by line arithmetic: `tests/styles/tapTargetCensus.ts` (rows at `tapTargetCensus.ts:329`, `tapTargetCensus.ts:540`), `tests/styles/forcedColorsCensus.ts` (UseRawControl `forcedColorsCensus.ts:415-426`, PerShowActionableWarnings `forcedColorsCensus.ts:501`, ShowReviewSurface rows), `tests/styles/controlOutlineScan.ts` (`controlOutlineScan.ts:200`, `controlOutlineScan.ts:249`, `controlOutlineScan.ts:326-327`). Re-derive the pinned counts in `tests/components/admin/sheetIconLinkContainment.test.ts` (call-site counts at `sheetIconLinkContainment.test.ts:1111`, `sheetIconLinkContainment.test.ts:1166`, `sheetIconLinkContainment.test.ts:1266`) and the new-tab census in `tests/styles/_metaNewTabAnnouncement.test.ts` (one text link with `NewTabHint` removed, one `SheetIconLink` added). Re-run each guard after the LAST edit to its file.

---

## 17. Documented limits

| ID | Input | Behavior | Why it is a limit, not a defect |
|---|---|---|---|
| L1 | v2/v1 3-column venue rows (`| VENUE | VENUE ADDRESS | <value> |`, `lib/parser/blocks/venue.ts:194-235`) | the anchor scan skips continuation rows with a blank first cell (`unknownFieldAnchors.ts:80-81`), so the card links the venue region | correct region, never a wrong cell |
| L2 | address under a label we do not read | no `venue.address` alias match → region | the near-miss detector's own `UNKNOWN_FIELD` card carries that row's link |
| L3 | address label recovered by fuzzy correction (`FIELD_LABEL_AUTOCORRECTED`) | exact `resolveAlias` misses → region | same posture |
| L4 | label cell merged across two columns | `absCol0 + 1` lands inside the label's merge, on the right row | the link opens the right row; no data is changed |
| L5 | warnings persisted before this change | venue cards stay link-less and inline hotel cards show no `We read` until the next scan or sync | jsonb additive fields appear on re-parse |
| L6 | venue block on a hidden tab | Sheets lands on the last visible tab (the UNKNOWN_FIELD scan does not filter hidden tabs) | same limit the UNKNOWN_FIELD links carry today |
| L7 | archived-tab card with no matching staged tab | previews come from splitting `rawSnippet` on ` | `; a preview containing ` | ` splits in two | display only |
| L8 | published bulk accept over a card with an unsaved pick | the pick is dropped; the persisted reading is what gets accepted | nothing was saved, nothing is lost that was persisted |
| L9 | wizard Ignore on the archived-tab card | the Pack list and Resolve box offers stay visible (offers derive from tabs, not warnings) | pre-existing wizard behavior; the published surface already hides its offer |
| L10 | `HOTEL_INLINE_GROUP_*` cards | no `We read` line (the emitter records no reading); the reservation jump shows what we read | no parsed data to show truthfully |
| L11 | the reservation marker on the published modal | not rendered | the card already sits in the same Hotels panel there |
| L12 | other `disabled` use-raw reasons (`empty-raw`, `invalid-dmy`, `no-split-to-undo`) | keep their single sentence | out of the brief's subject; revisit if Eric asks |

---

## 18. Flag lifecycle

N/A: no config flag, env var or persisted toggle is added. The new booleans are render predicates derived from data and prop presence (§15), each with a stated effect.

---

## 19. Builder's calls (decisions the brief did not settle)

**Chrome**

- **B1. Published compact cards keep the text "Open in Sheet" link.** The defect Eric named, a link "on its own row", is the wizard layout; the published link already shares the controls band with Report and Ignore, a placement ratified by the compact-card spec (`PerShowActionableWarnings.tsx:22-30`). Moving it into `CompactAlertCard`'s message row means making that shared shell meet SheetIconLink's four requirements, a shell redesign this PR does not otherwise touch (class-sweep exceptions (b) and (c)). **Open question for Eric:** swap it there too in a follow-up?
- **B2. The tag also renders on the published card** (and so on the staged review page, which mounts no controls), because the Accept wording lands on the published card and needs the label to make sense there.
- **B3. sr-only prefixes** (`Needs a look: `, `Note: `) replace what the removed visible word carried for screen readers.
- **B4. Chip glyph and dot ink.** Judgment chip = lucide `Circle` in `text-text-subtle` on `info-bg`; dot = `size-1.5` hollow ring in `border-text-subtle`. `text-faint` fails on `info-bg`, and the 6px dot is a different box and plate from the 8px pill marks, so it does not route through `attentionMarkClass` (and is not mark-shaped for the parity walk, which keys on `size-2`, `tests/components/admin/attentionMarkParity.test.ts:93-94`).
- **B5. Tag look** mirrors the quiet judgment-only pill (sunken fill, ring via `attentionMarkClass("judgment", "sunken")`), not the section header's info-bg "Parsed with judgment" pill (`step3ReviewSections.tsx:1104`), because a ring on info-bg has no verified ink.
- **B6. Link accessible name** uses the card title (`stripEmphasis(title)`) as the subject. The component's wording is fixed and pinned; changing it is out of scope.
- **B7. Testid** `…-warning-${i}-open` becomes `…-warning-${i}-sheetlink`.

**Hotel**

- **C1. Storage name `readAs`** on the non-resolvable resolution variant, not a top-level field and not `parsed`.
- **C2. One render path:** the comparison lives in `UseRawControl`'s `disabled` branch, scoped to `HOTEL_GUEST_SPLIT_AMBIGUOUS`, so both surfaces get it from one change.
- **C3. "Sheet says" is verbatim** (whitespace-collapsed), not confirmation-stripped. Precedent: the wizard Ignored list already shows the raw snippet (`ignoredRowSnippet`, `step3ReviewSections.tsx:3009-3017`). Stripping would make "Sheet says" untrue, the same honesty argument that renamed the raw choice to "The whole cell as one guest" (`UseRawControl.tsx:472-483`). The crew-readable rule governs persisted names, which this does not touch.
- **C4. The reservation marker** covers all four index-carrying hotel judgment codes (class sweep), renders on the staged wizard only, and shows one "Sheet says" line from the lowest-index member; the jump flashes every member.
- **C5. Help text** adapts the mockup's example: "If we split it wrong" instead of "If that split is wrong" (the text sits above the comparison on the wizard and inside the guidance line on published, so "that" has no referent in either), and it keeps "someone left out", a case the ratified copy covers today (`tests/messages/hotelAmbiguityCatalogCopy.test.ts:48-50`).
- **C6. Callout label** "See how we read it" only when `readingShown` holds for every grouped member, decided per warning (a use-raw code whose resolution is unusable shows no reading); otherwise "Review in Sheet warnings".

**Accept and Save**

- **D1. Accept covers all seven judgment codes** on both surfaces, including the bulk chip and the Ignored-list button (`Undo accept`). Testids stay keyed on the mechanism.
- **D2. Selection plumbing** is a per-row context provider plus one extracted action caller (§6.3). The provider-less fallback keeps immediate save and is unreachable in production.
- **D3. The "Ignored (N)" heading is unchanged.** Accepted judgment rows sit under it with an `Undo accept` button. **Open question for Eric:** split them into their own "Accepted (N)" disclosure?
- **D4. Dirty markers:** the persisted reading keeps its "In use" marker while unchecked; the hint lives in the action row and describes Save.
- **D5. Save order** is reading first, then accept; partial success refreshes and says the reading is saved.
- **D6. Arrow keys select without writing**, a direct consequence of R6.
- **D7. Apostrophes follow the host file:** ASCII `'` in new `DataQualityWarningControls` and `BulkIgnoreControls` strings (matching `Couldn't ignore`, `DataQualityWarningControls.tsx:120`), `&rsquo;` in `UseRawControl` JSX (`UseRawControl.tsx:597`), `’` in `archivedTabOffer.tsx` strings (`archivedTabOffer.tsx:183`). A REUSED string keeps the apostrophe it ships with, so the reused "That didn’t save" sentence stays typographic when the action bar renders it. Copy assertions are apostrophe-agnostic (precedent `tests/components/step3SheetCard.test.tsx:491`).

**Archived pull sheet and sections**

- **E1. Route `pull_sheet_archived_tab` to `packlist`.** It gives the card its "Go to Pack list" from the existing routing instead of a special case, flags the section the warning is about, and on published places the card beside the published include offer, which removes the need for a published card-level control. Consequences in §7.2.
- **E2. Extract `ArchivedTabIncludeButton`** instead of nesting the whole `ArchivedTabOffer` card inside the warning card (a card in a card, duplicating the title and previews).
- **E3. Card button label `Use this pull sheet`** (the approved mockup), while Pack list and the Resolve box keep `Use this show’s gear`. **Open question for Eric:** unify on one label?
- **E4. Fix both "Gear section" rows** (class sweep), not only the one the brief named.
- **E5. Jumps are warn-row only, staged only,** one per card, with the venue exclusion keyed on the one code Eric named.
- **E6. The venue value cell** is derived from the UNKNOWN_FIELD anchor scan (kind `venue`, `resolveAlias === "venue.address"`, empty value), the label anchor column plus one.

---

## 20. Consistency sweep (run after drafting and after every repair round)

Named values and their single definitions:

| Name | Value | Defined in |
|---|---|---|
| `SHEET_SAYS_CAP` | 160 characters | lib/admin/warningReadingDisplay.ts (new file) (§5.6) |
| `WE_READ_NAMES_CAP` | 6 | same |
| `CASE_PREVIEWS_CAP` | 3 | same (§7.3) |
| `CASE_PREVIEW_CHARS` | 40 | same |
| `HOTELS_CAP` | 12 (existing) | `step3ReviewSections.tsx:192` |
| `MAX_HOTELS` | 4 (existing) | `lib/parser/blocks/hotels.ts:57` |
| `--spacing-tap-min` | 44px (existing) | `app/globals.css:224` |
| `--spacing-tile-pad` | 20px (existing) | `app/globals.css:240` |

Counts stated in prose and their sources: seven judgment codes = `AMBIGUITY_CODES` (`lib/parser/ambiguityCodes.ts:19-27`); four radio codes = `USE_RAW_CODES` (today `IN_SCOPE`, `UseRawControl.tsx:55-60`); four hotel reservation codes (§5.1); three catalog rows (§9); six lockstep places (§9 table). Tests derive these from the named sets, never from the literals in this document.

Out-of-scope claims to keep consistent: published compact link form (§3.6, B1); published reservation marker (§5.4, L11); "Ignored (N)" heading (§1.3, D3); published archived card control (§7.4, E1).
