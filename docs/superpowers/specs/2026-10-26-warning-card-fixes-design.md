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
| R11 | The published cards ALSO get the sheet icon: `PerShowActionableWarnings` and `NoteWarningCard` move their "Open in Sheet" text link to a `SheetIconLink` at the end of the message row, through their shared shell `CompactAlertCard`. This supersedes the compact-card placement ratified at `PerShowActionableWarnings.tsx:22-30` (link inline at the left of the controls band) and the compact-card spec's footer-link line (`docs/superpowers/specs/2026-07-20-show-alert-compact.md:172`). | Eric, answer to open question B1, 2026-10-26 | CLOSED |
| R12 | Accepted judgment rows get their own collapsed "Accepted (N)" disclosure; every other ignored row stays in "Ignored (N)". Both surfaces. | Eric, answer to open question D3, 2026-10-26 | CLOSED |
| R13 | One include label everywhere: `Use this pull sheet`, on the card, in Pack list, and in the Resolve box (today `Use this show’s gear`, `components/admin/wizard/archivedTabOffer.tsx:183`). | Eric, answer to open question E3, 2026-10-26 | CLOSED |
| R14 | The venue empty-cell link must work on the layout Eric's shows use: the v2/v1 3-column scope block (`| VENUE | VENUE NAME | <value> |` then `|  | VENUE ADDRESS | <value> |`, `lib/parser/blocks/venue.ts:194-235`), the layout of every committed workbook that raises `VENUE_ADDRESS_MISSING`. A dedicated anchor computed from the venue grid block replaces the round-0 lookup through the UNKNOWN_FIELD scan, which cannot see that layout; the generic UNKNOWN_FIELD scan is unchanged (§4.2). | Orchestrator relaying Eric's request, 2026-10-26 (plan-time probe) | CLOSED |
| R15 | Unsaved reading changes are not silently lost. Publish, Re-scan and closing the review stop and say "You have N unsaved reading changes" with Discard / Go back; with no unsaved change every action behaves exactly as today (§6.5). | Eric, answer to the UI gate's P1 (an unsaved pick is dropped by Publish, Re-scan or closing the review), 2026-10-30: "Warn before losing it" | CLOSED |

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
- No change to the ignored partition itself: the Ignored / Accepted split (R12) is display-only. Which rows are ignored, the rail and heading counts derived from that partition, and the ignore fingerprint are unchanged.
- No change to `CompactAlertCard` consumers that do not pass the new `sheetLink` slot (`components/admin/telemetry/HealthAlertsPanel.tsx`, `components/admin/review/AttentionBanner.tsx`): their message row stays byte-identical (§3.6).

### 1.4 Anti-goals (things this must not become)

- A second state machine for the reading choice. The deferred selection is a thin local overlay on the existing pure derivation `deriveUseRawControlState` (`components/admin/UseRawControl.tsx:67-81`), not a replacement for it.
- A new recognizer. The venue value-cell lookup reads the exporter's own grid blocks (the pipeline the UNKNOWN_FIELD scan already uses), the venue region's own header rule, and the parser's own alias resolver, at two fixed label columns; it adds no grammar and leaves the generic UNKNOWN_FIELD scan unchanged.
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
| Wizard Step 3, Ignored (N) disclosure (split into Ignored and Accepted by R12, §6.4) | same file `step3ReviewSections.tsx:3509-3604` | No | None |
| Published review modal, per-section active cards | `PerShowActionableWarnings` (`components/admin/PerShowActionableWarnings.tsx:108-539`) mounted by `buildSectionWarningExtras` (`components/admin/showpage/sectionWarningExtras.tsx:226-248`) and crew under-row cards (`sectionWarningExtras.tsx:53-74`) | **No** (verified: no severity word anywhere in the file) | Text link sharing the controls band, `PerShowActionableWarnings.tsx:457-483` |
| Published, per-section Ignored (N) (split into Ignored and Accepted by R12, §6.4) | `PerShowActionableWarnings tone="muted"` (`sectionWarningExtras.tsx:296-314`) | No | Same |
| Published, Sheet warnings info notes | `NoteWarningCard` (`components/admin/NoteWarningCard.tsx:59-132`) | No | Text link as controls band, `NoteWarningCard.tsx:86-96` |
| Staged review page | `StagedReviewCard` → `PerShowActionableWarnings` (`components/admin/StagedReviewCard.tsx:534`) | No | Same as published card |

Which mount runs where: the wizard modal and the published modal are the only two `ShowReviewSurface` mounts (`components/admin/wizard/Step3ReviewModal.tsx:1016`, `components/admin/showpage/PublishedReviewModal.tsx:1543`). The wizard list renders only when `routedWarningsRenderElsewhere` is false (`step3ReviewSections.tsx:3252-3266`), which is the staged wizard; the published modal routes warn rows into their sections (`components/admin/review/ShowReviewSurface.tsx:273-274`).

**Class sweep result for the "warn" word:** one site, `step3ReviewSections.tsx:3312-3314`. Nothing else renders it.

**Class sweep result for the warning "Open in Sheet ↗" text link:** three sites, the wizard row (`step3ReviewSections.tsx:3422-3439`), `PerShowActionableWarnings.tsx:457-466`, and `NoteWarningCard.tsx:86-96`. All three become `SheetIconLink` (R2, R11). Out of class: the alert action link in `components/admin/review/AttentionBanner.tsx:179-195`. That link renders whatever label `lib/adminAlerts/alertActions.ts` assigns ("Open in Sheet" is one of several, `alertActions.ts:81`, `alertActions.ts:120`), so it is a label-driven alert action, not the warning card's sheet link; swapping it is a separate decision (Builder's call B9).

---

## 3. Fix A: card chrome (both surfaces)

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

### 3.6 Published compact cards: the icon moves into the shell's message row (R11)

**Current shell.** `CompactAlertCard` (`components/admin/CompactAlertCard.tsx:76-155`) renders, in order, the message row `flex gap-2.5 p-3 pb-2.5` (`CompactAlertCard.tsx:101`: severity glyph, message `min-w-0 flex-1`, optional help trigger in a `shrink-0` wrapper, `CompactAlertCard.tsx:113`), then the detail band, footer and controls band. The help trigger is `HoverHelp` in `compactTrigger` mode: a 22px box with a `before:inset-[-11px]` overlay (`components/admin/HoverHelp.tsx:554-555`). Four consumers: `PerShowActionableWarnings`, `NoteWarningCard`, `HealthAlertsPanel`, `AttentionBanner`.

**Shell change.** A new optional data prop, so the shell owns the one `SheetIconLink` call site and the four consuming-context requirements are met in one place:

```ts
/** Icon-only source-sheet link, rendered LAST in the message row (R11).
 *  Absent, null: the message row renders byte-identically to today. */
sheetLink?: { href: string; subjectLabel: string; testId: string } | null;
```

```tsx
const LINK_PLATE = { warning: "warning-bg", muted: "surface-sunken", neutral: "surface" } as const;
// …
<div
  data-testid="compact-alert-message"
  className={`flex gap-2.5 p-3 pb-2.5${sheetLink ? " min-h-tap-min" : ""}`}
>
  {glyph}{message}{help}
  {sheetLink ? (
    <SheetIconLink
      href={sheetLink.href}
      subjectLabel={sheetLink.subjectLabel}
      testId={sheetLink.testId}
      ringOffset={LINK_PLATE[tone]}
      className="ml-3 mr-0.5"
    />
  ) : null}
</div>
```

Why each piece (the numbers are the §13.2 invariants):

- Row alignment stays the default stretch, so the severity glyph and the help trigger keep their top alignment against a multi-line message. The anchor has a definite height (`size-5`), so it sits at the content-box top: 12px below the row top (`p-3`). Its 12px vertical reach then starts exactly at the row top and ends 44px below it, and `min-h-tap-min` guarantees the row is at least 44px tall. The "floor" for this site is therefore the row's top 44px band, with the anchor centred in it. Cost: a single-line card with no help trigger grows from about 42px to 44px; a card with a help trigger is already 44px (12 + 22 + 10).
- `ml-3` plus the row's `gap-2.5` puts 22px between the anchor and the box before it. The help trigger's overlay reaches 11px right and the link's reaches 10px left, so the two 44px hit areas cannot overlap (11 + 10 = 21 < 22). Without a help trigger the 22px sits after the `flex-1` message, which is ≥ the 10px requirement.
- `mr-0.5` plus the row's 12px right padding is 14px, exactly the anchor's trailing reach, so the overlay ends at the card's inner edge with no neighbouring box (requirement 3).
- Both classes are on the containment guard's positional allowlist (`tests/components/admin/sheetIconLinkContainment.test.ts:252-253`).

**`SheetIconLink` gains two backdrops.** `ringOffset` widens from `"bg" | "surface"` (`SheetIconLink.tsx:58-59`) to add `"warning-bg"` and `"surface-sunken"`, with full-literal `BACKDROP_SKIN` entries (`SheetIconLink.tsx:70-73`):

| Key | Classes | Wash vs backdrop, light / dark (measured from `app/globals.css` runtime tokens) |
|---|---|---|
| `warning-bg` (active amber card) | `focus-visible:ring-offset-warning-bg hover:bg-surface active:bg-surface` | `#ffffff` vs `#fff3d6` 1.103:1 / `#16171c` vs `#3a2e14` 1.347:1 |
| `surface-sunken` (muted card) | `focus-visible:ring-offset-surface-sunken hover:bg-surface active:bg-surface` | 1.109:1 / 1.092:1, the same pair the shipped `surface` backdrop already uses in reverse |

The glyph's resting ink stays `text-text`: 15.60:1 / 10.64:1 on `warning-bg`. The pressed glyph is `text-text-strong` on `bg-surface`, already pinned (`tests/styles/status-token-contrast.test.ts:392-399`). The class-token set test (`tests/components/admin/sheetIconLink.test.tsx:127`) is extended first, as the component header requires (`SheetIconLink.tsx:40-41`).

**Adapters.**

- `PerShowActionableWarnings`: passes `sheetLink={href ? { href, subjectLabel: stripEmphasis(title), testId: "per-show-actionable-sheetlink" } : null}`. The text-link node (`PerShowActionableWarnings.tsx:457-466`) and `linkOffsetClass` (`PerShowActionableWarnings.tsx:165-168`, used only by that link) are deleted. `controlsBand` becomes the controls cluster alone, rendered exactly as today's no-link branch (`PerShowActionableWarnings.tsx:473-483` with `sheetLink` null). The header comment at `PerShowActionableWarnings.tsx:22-30` is rewritten to record R11.
- `NoteWarningCard`: passes `sheetLink={href ? { href, subjectLabel: stripEmphasis(title), testId: "note-warning-sheet-link" } : null}` (the existing testid moves to the icon) and no `controlsBand`, so a note card is now its message row alone. The component comment (`NoteWarningCard.tsx:48-53`) is updated.
- `HealthAlertsPanel`, `AttentionBanner`: no change; they pass no `sheetLink`.

Every published mount inherits this: active section cards, crew under-row condensed cards, the muted Ignored and Accepted lists, the info notes, and the staged review page. `NewTabHint` leaves both adapters; the anchor's own accessible name says "(opens in a new tab)" (`SheetIconLink.tsx:96-100`).

**Ratifications this supersedes, per Eric (R11):** the single-controls-band placement at `PerShowActionableWarnings.tsx:22-30` and `PerShowActionableWarnings.tsx:471-472`; the compact-card spec's footer-link line (`docs/superpowers/specs/2026-07-20-show-alert-compact.md:172`) and its test plan's link rows (`2026-07-20-show-alert-compact.md:228`, `2026-07-20-show-alert-compact.md:327`); the note-card link in the warning-trim un-defer spec (`docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md`, §2.4, as cited at `NoteWarningCard.tsx:48-53`). Those specs are dated records and are not edited; this section is the amendment.

---

## 4. Fix B: Venue with no address deep-links to the empty value cell

### 4.1 Current state

- Emitted by `emitVenueAddressMissing` (`lib/parser/warnings.ts:226-235`) from `lib/parser/index.ts:646`, with `blockRef: { kind: "venue" }` and `rawSnippet` = the venue name.
- It is in none of the three anchor sets: not `OPERATOR_ACTIONABLE_ANCHORED` (`lib/parser/dataGaps.ts:427`), not `HOTEL_REGION_ANCHORED` (`lib/drive/showDayTimeAnchors.ts:23-29`), not `LINK_ONLY_ANCHORED` (`showDayTimeAnchors.ts:65-72`). `attachSourceCellAnchors` skips it at the gate `showDayTimeAnchors.ts:216`, so it never gets `sourceCell` and renders link-less on both surfaces.
- Its siblings `VENUE_GEOCODE_UNRESOLVED` / `VENUE_TIMEZONE_UNRESOLVED` link the venue region through `CODE_TO_REGION` (`showDayTimeAnchors.ts:34-41`, branch `showDayTimeAnchors.ts:271-272`).
- The two label scans anchor the LABEL column only: `extractContentAnchors` (`lib/drive/contentAnchors.ts:63-77`) and `extractUnknownFieldAnchors` (`lib/drive/unknownFieldAnchors.ts:65-96`), both `c: block.absCol0`. The UNKNOWN_FIELD scan also records `kind` (`anchorNamespace`, `lib/parser/fieldNearMiss.ts:286-290`, `"venue"` for venue openers) and the row's normalized value.
- A grid block's cells are a contiguous column slice starting at `absCol0` (`lib/drive/exportSheetToMarkdown.ts:258-265`), so `cells[1]` sits at sheet column `absCol0 + 1`.
- The 2-column venue parser reads the address from `row[1]` when `col0Canon === "venue.address"` (`lib/parser/blocks/venue.ts:281-289`); `"venue.address"` aliases are `VENUE ADDRESS`, `Venue Address`, `Hotel Address` (`lib/parser/aliases.ts:31`), matched by `resolveAlias` (`aliases.ts:166-168`).
- The 3-column scope layout (`lib/parser/blocks/venue.ts:194-235`) puts the label in the block's SECOND column on blank-col0 continuation rows (`|  | VENUE ADDRESS | <value> |`). The UNKNOWN_FIELD scan skips a row whose first cell is blank (`lib/drive/unknownFieldAnchors.ts:81`), so no lookup keyed on that scan can reach this layout. Plan-time probe over the committed workbooks: `VENUE_ADDRESS_MISSING` fires on `fintech.xlsx`, `rpas.xlsx` and `fixed-income.xlsx`, all 3-column; only `east-coast.xlsx` is 2-column (`INFO!A8` `Hotel Address`), and it fires only with its address cell blanked.
- The venue REGION link is `REGION_ANCHOR_SPEC.venue` (`lib/sheet-links/buildSheetDeepLink.ts:126-131`): tab `INFO`, strategy `header-block`, header `/^VENUE$/i`. `extractSourceAnchors` picks the first spec tab present in the gid map and in `SOURCE_LINK_ALLOWLIST` (`lib/drive/sourceAnchors.ts:197-207`), and `headerBlock` (`lib/drive/sourceAnchors.ts:149`) starts the range at the first row whose first non-blank cell matches the header.

### 4.2 Change

1. Add `"VENUE_ADDRESS_MISSING"` to `LINK_ONLY_ANCHORED` (`showDayTimeAnchors.ts:65-72`). Not to `OPERATOR_ACTIONABLE_ANCHORED`: the staged page's card selection and dedup stay unchanged, which is that set's documented contract (`showDayTimeAnchors.ts:60-64`).
2. Add a dispatch branch in `attachSourceCellAnchors`, placed BEFORE the `CODE_TO_REGION` branch (`showDayTimeAnchors.ts:271`):

   ```ts
   } else if (w.code === "VENUE_ADDRESS_MISSING") {
     cell = sources.venueAddress ?? sources.region["venue"] ?? null;
   }
   ```

   `WarningAnchorSources` (`showDayTimeAnchors.ts:168-183`) gains `venueAddress?: SourceAnchor | null`, optional like `unknownField` so every existing `{ showDay, crewRole, region }` call site still typechecks. `attachWarningAnchors` populates it beside the other families (`lib/sync/attachWarningAnchors.ts:82-89`) as `venueAddress: safe(() => extractVenueAddressAnchor(bytes, gids), null)`. The cron's region-only pass (`lib/sync/applyParseResult.ts:316-321`) and the archived-tab pass (`lib/sync/attachWarningAnchors.ts:115`) pass none, so they fall to the region or leave the warning alone.
3. New module lib/drive/venueAddressAnchor.ts (new file), pure apart from the one workbook read:
   - `resolveVenueAddressCell(blocks: readonly SynthesizedBlock[], titleToGid: ReadonlyMap<string, number>): SourceAnchor | null`;
   - `extractVenueAddressAnchor(buffer: ArrayBuffer, titleToGid: ReadonlyMap<string, number>): SourceAnchor | null`, which is `resolveVenueAddressCell(synthesizeBlocksFromXlsx(buffer).blocks, titleToGid)` (`lib/drive/exportSheetToMarkdown.ts:395`).

   The rule, stated once:
   - **Tab:** the first tab in `REGION_ANCHOR_SPEC.venue.tabs` that is in `titleToGid` and in `SOURCE_LINK_ALLOWLIST`, the same choice `extractSourceAnchors` makes for the venue region. None → `null`.
   - **Venue block(s):** each `kind: "grid"` block on that tab that has a row whose `cells[0]` matches `REGION_ANCHOR_SPEC.venue.header` as-is (`headerBlock` also tests the raw cell, `lib/drive/sourceAnchors.ts:149-160`) (`/^VENUE$/i`, the row the region's `header-block` starts at). Rows considered: from that header row to the end of its block, skipping rows whose `absRow` is `null`.
   - **Address rows:** a row is an address row when, for the FIRST `i` in `[0, 1]`, `resolveAlias(cells[i] ?? "") === "venue.address"`. `i = 0` is the 2-column layout (`Hotel Address | <value>`); `i = 1` is the 3-column continuation row (`| | VENUE ADDRESS | <value> |`).
   - **Link:** exactly one address row across the venue block(s), AND its value cell `cells[i + 1] ?? ""` has no non-whitespace character, tested as `!/\S/.test(...)` (the condition that raised the warning; the lib/drive non-blank idiom, `lib/drive/sourceAnchors.ts:109-112`, because `tests/admin/no-inline-email-normalization.test.ts:95` rejects an unexempted `.trim()` in any `lib/drive` file) → `{ title: tab, gid, a1: XLSX.utils.encode_cell({ r: absRow, c: block.absCol0 + i + 1 }), scope: "cell" }`. A grid block's cells are a contiguous column slice from `absCol0` (`lib/drive/exportSheetToMarkdown.ts:258-265`), so `absCol0 + i + 1` is the value column. Zero address rows, several, or a non-empty value cell → `null`, and the caller falls back to the venue region. Same never-wrong-cell posture as `resolveUnknownFieldCell` (`unknownFieldAnchors.ts:111-127`).

   Plan-time probe of this rule on every committed workbook: `fintech.xlsx`, `rpas.xlsx` and `fixed-income.xlsx` (3-column, all emit the warning) each resolve to `INFO!C14`; `east-coast.xlsx` with `INFO!B8` blanked resolves to `INFO!B8`; unedited `east-coast.xlsx`, `ria.xlsx`, `consultants.xlsx` and `redefining-fi.xlsx` each have exactly one address row with a non-empty value, so they resolve to `null` (and emit no warning).

The never-demote rule (`showDayTimeAnchors.ts:314`) means the cron's later region-only pass (`lib/sync/applyParseResult.ts:316`) cannot replace a value cell with the region range.

### 4.3 What the operator sees

- Wizard: the title-row icon link (§3.5) opens the empty cell. Because the anchor is a single cell, the existing "Sheet cell <Tab>!<A1>" line (`step3ReviewSections.tsx:3353-3396`) also appears. On region fallback the icon opens the venue range and no cell line renders (colon guard `step3ReviewSections.tsx:3358`).
- Published: the card's sheet icon (§3.6, replacing the text link at `PerShowActionableWarnings.tsx:457-466`) and its "Sheet cell" band (`PerShowActionableWarnings.tsx:331-368`) appear by the same rules. The correction-loop follow-up sentence in the `?` popover now appears too (gated on a non-empty `a1`, `PerShowActionableWarnings.tsx:218-224`), which is the same behavior the region-anchored venue siblings already have.
- No section jump on this card (R4), on any surface.

### 4.4 Side effects, stated

- `warningIdentityKey` includes `sourceCell` (`lib/dataQuality/warningIdentity.ts`, the `cell` term). After the first re-scan or re-sync, a Venue-with-no-address warning's React key and report surface id change once. The ignore fingerprint is content-only, so existing ignores hold.
- Warnings persisted before this change carry no `sourceCell` until their next scan (documented limit L5).

---

## 5. Fix C: the hotel guest split, readable and cross-linked

### 5.1 Current state

- Structured emitter `emitHotelGuestSplitAmbiguity` (`lib/parser/warnings.ts:330-386`) attaches a resolvable `resolution` whose `parsed` carries the names (`warnings.ts:364-376`). `UseRawControl` shows "Our reading" vs "The whole cell as one guest" (`components/admin/UseRawControl.tsx:471-478`).
- Inline emitter `emitInlineHotelGuestAmbiguity` (`warnings.ts:639-659`) RECEIVES `parsedNames` (`warnings.ts:641`) and discards them: `resolution: { resolvable: false, reason: "raw-not-guest-scoped" }` (`warnings.ts:657`). `UseRawControl` then renders one sentence (`UseRawControl.tsx:439-453` with `DISABLED_REASON["raw-not-guest-scoped"]`, `UseRawControl.tsx:275-276`).
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

`emitInlineHotelGuestAmbiguity` sets `resolution: { resolvable: false, reason: "raw-not-guest-scoped", readAs: { kind: "hotels", names: [...params.parsedNames] } }`. Named `readAs`, not `parsed`, so no consumer that narrows `parsed` on `resolvable: true` (`lib/sync/useRawOverlay.ts:69-74`, `lib/sync/useRawDecisionState.ts:91-93`, `UseRawControl.tsx:456`) can read it by accident. The names are already crew-readable on `hotel_reservations.names`; storing them in the admin-only warning adds no data class.

### 5.3 The read-only comparison (both surfaces, one render path)

`UseRawControl`'s `disabled` branch (`UseRawControl.tsx:439-453`) gains a comparison block rendered ABOVE the existing reason sentence when `warning.code === "HOTEL_GUEST_SPLIT_AMBIGUOUS"`. Because `UseRawControl` renders on the wizard card (`step3ReviewSections.tsx:3445-3454`) and the published card (`sectionWarningExtras.tsx:133-139`), one change covers both. The control's `warning` prop widens from `Pick<…, "code" | "resolution">` to include `"rawSnippet"`; both boundaries already pass the full warning (`components/admin/UseRawControlBoundary.tsx:84-89`).

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

The grid matches the parsed-reading grid the choice rows already use (`UseRawControl.tsx:514-532`). Values come from a new pure module, lib/admin/warningReadingDisplay.ts (new file) (§5.6).

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
- The reading choice `UseRawControl` saves on tap: `ChoiceRow.onClick` → `onSelect` → `fire(useRaw)` → `onToggle` (`UseRawControl.tsx:342-344`, `UseRawControl.tsx:415-425`); arrow keys select AND save (`UseRawControl.tsx:486-491`). `UseRawControlBoundary.onToggle` calls the surface action and `router.refresh()`es (`UseRawControlBoundary.tsx:56-82`).
- Wizard order inside a row: choice control (`step3ReviewSections.tsx:3445-3454`), role control (`step3ReviewSections.tsx:3455-3463`), controls note (`step3ReviewSections.tsx:3469-3476`), Report + Ignore (`step3ReviewSections.tsx:3480-3494`). Published order: Report + Ignore, then choice, then role (`sectionWarningExtras.tsx:122-146`).
- **Class sweep for the auto-save shape:** `RoleRecognizeControl` already has explicit Save and Cancel (`components/admin/RoleRecognizeControl.tsx:397-416`). `ArchivedTabOffer` writes only on its button. `UseRawControl` is the only control that writes on selection.
- **Controls-note sweep:** no judgment code carries a `controlsNote` today. The four that do are `UNKNOWN_FIELD`, `VENUE_ADDRESS_MISSING`, `PULL_SHEET_PARSE_PARTIAL`, `UNKNOWN_SECTION_HEADER` (`lib/messages/catalog.ts:1375`, `catalog.ts:1599`, `catalog.ts:1792`, `catalog.ts:2173`). So no shipped sentence says "Ignore" next to an Accept button; §15 adds a guard so none ever does.

### 6.2 Accept (all judgment codes, both surfaces)

`isJudgment = isWarnSeverity(warning) && isAmbiguityCode(warning.code)`, computed inside the component (both are pure, client-safe imports). Mechanism, endpoints, and testids (`dq-ignore-…`, `dq-unignore-…`, `dq-bulk-ignore-…`) are unchanged; only words change.

| Where | Needs a look (unchanged) | Judgment call |
|---|---|---|
| Active row button | `Ignore` / `Ignoring…` | `Accept` / `Accepting…` |
| Restore button (Ignored list / Accepted list, §6.4) | `Un-ignore` / `Un-ignoring…` | `Undo accept` / `Undoing…` |
| Announce on success | `Warning ignored.` / `Warning restored.` | `Judgment call accepted.` / `Judgment call restored.` |
| Error copy | unchanged (`DataQualityWarningControls.tsx:118-121`) | `Couldn't accept that judgment call. Refresh and try again.` / `Couldn't undo that. Refresh and try again.` |
| Published bulk chip (group of one code) | unchanged | text `Accept` / `Accepting…` / `Are you sure?`; accessible name `Accept <n>` / `Are you sure? Accept <n>` / `Accepting…`; announce `1 accepted.` / `<n> accepted.`; fail `Couldn't accept those judgment calls. Refresh and try again.` |

Accepted judgment rows leave the "Ignored (N)" disclosure for their own "Accepted (N)" disclosure (§6.4, R12). Testids keep naming the mechanism (`dq-ignore-…` on an Accept button), so no existing selector moves.

### 6.3 The deferred reading choice

**Where it applies.** Every row where `UseRawControl` would render the radio pair, i.e. `deriveUseRawControlState(w, decision, false)` is one of `transform-active`, `apply-pending`, `raw-active`, `clear-pending`, AND a `DataQualityWarningControls` renders in the same row. In production that is every such row on both surfaces: the wizard renders the choice control under `wizardSessionId && dfid` (`step3ReviewSections.tsx:3445`) and the action bar under `dq && dfid && isWarn` (`step3ReviewSections.tsx:3480`), every use-raw code is emitted at `warn` severity (for example `warnings.ts:378`), and a staged row without `dq` is NO-PREVIEW and has no controls at all (`components/admin/review/sectionData.ts:163-165`); the published per-item controls always render both (`sectionWarningExtras.tsx:122-139`), in the active list and in the Accepted list (§6.4). A mount with no action bar (standalone tests only) keeps today's immediate save.

**Where the state lives.** A new client module components/admin/useRawDraft.tsx (new file) exports `UseRawDraftProvider` and `useUseRawDraft()`. Provider props: `warning: ParseWarning`, `decision: UseRawDecision | undefined`, plus the surface union `UseRawControlBoundary` takes (`{surface:"show", showId}` | `{surface:"wizard", wizardSessionId, driveFileId}`, `UseRawControlBoundary.tsx:36-40`). The action call is extracted from `UseRawControlBoundary.onToggle` (`UseRawControlBoundary.tsx:56-82`) into one exported `callUseRawAction(surface, warning, useRaw): Promise<"ok" | "failed">` in the same module; the boundary (provider-less fallback) and the provider both use it. One argument assembly, two callers.

Mounts: the wizard wraps the row's controls block (`step3ReviewSections.tsx:3445-3494`) in the provider when the conditions above hold; the published `SectionWarningItemControls` wraps its fragment (`sectionWarningExtras.tsx:119-147`) the same way and, for these rows only, renders the choice control BEFORE `DataQualityWarningControls`. For every other code the choice control renders `null` (`UseRawControl.tsx:67`), so the reorder changes no other row.

**The reading model (exact).** This replaces the single `pendingRaw` value of the round-0 draft, which cleared on a successful Save before refreshed props arrived (so the radio snapped back to the old reading while accept ran) and could leave a dormant draft that a later external change resurrected. The shipped control already guards the first hazard with its own optimistic `pendingChoice` (`UseRawControl.tsx:399-403`, `UseRawControl.tsx:460-466`); this model generalizes that guard.

- `persistedRaw` (derived, from props): `state === "raw-active" || state === "apply-pending"`, where `state = deriveUseRawControlState(warning, decision, false)`.
- Local state, two pieces:
  - `draft: boolean | null`, the operator's unsaved selection (`true` = the sheet's reading, `false` = ours);
  - `submitted: boolean | null`, a reading sent to the server and not yet reconciled with props.
- **Displayed reading** (the checked row): `submitted ?? draft ?? persistedRaw`.
- **Dirty:** `submitted === null && draft !== null`. By the rules below, a non-null `draft` never equals `persistedRaw`.
- **Busy:** the action bar's existing `running` flag (`DataQualityWarningControls.tsx:115`, `state.kind === "running"`), reported to the provider through the same `onRunningChange` signal §7.3 defines (inside a provider the action bar calls the provider's setter). Busy is a UI lock, not part of the reading model. Report stays enabled while busy (§7.3, "Report is exempt").
- **Radio rows soft-disable** (`aria-disabled`, the existing `ChoiceRow` path, `UseRawControl.tsx:338-353`) while busy OR while `submitted !== null`. A select can therefore never land while a submitted reading is awaiting reconciliation, where it would change nothing visible.

Rules:

1. **Select** reading `r` (click or arrow key): if `r === persistedRaw`, `draft = null` (abandoned; the row is clean); else `draft = r`. Either way the action bar's error clears. Arrow keys still move focus and select (WAI radio pattern) but never write.
2. **Save pressed** (only while dirty): `submitted = draft; draft = null`; busy until the sequence ends; radio rows and Cancel disabled.
3. **Save fails** (the reading request returns `failed`): `draft = submitted; submitted = null`; error shown; still dirty, Save available again; no refresh.
4. **Save succeeds:** `submitted` STAYS, so the acknowledged reading stays displayed. If the row is active and ignorable, the accept request starts.
   - Accept succeeds: announce, `onBeforeRefresh?.()`, `router.refresh()`. `submitted` still stays until reconciliation.
   - Accept fails: the reading is saved, the card is not accepted. `router.refresh()` (the persisted reading must re-read) and show the partial-success copy. `submitted` still stays until reconciliation. The main button reads `Accept`, which retries the accept request only.
   - Row not ignorable, or the row is in the Accepted list: no accept request; announce `Reading saved.`, `router.refresh()`.
5. **Reconciliation**, on ANY change of the `persistedRaw` prop value: if `draft !== null && draft === persistedRaw`, then `draft = null`; and if `submitted !== null`, then `submitted = null`. The refreshed prop is authoritative whether or not it equals what was sent. Applied with the store-the-previous-prop pattern during render (React's "adjusting state when a prop changes"), not in an effect, so no frame paints the stale combination.
   - `submitted` clears ONLY here (a change of the `persistedRaw` prop) and in rule 3 (Save fails). Nothing waits on refresh completion: `router.refresh()` returns nothing and offers no completion signal (it dispatches a refresh action inside its own `startTransition`, node_modules/next/dist/client/components/app-router-instance.js lines 352-357), so no part of this design may key on "the refresh finished". The residual is limit L13.
6. **Cancel:** `draft = null`; focus moves to the main button (Cancel unmounts).

A change between `apply-pending` and `raw-active` (or `clear-pending` and `transform-active`) does not change `persistedRaw`, so it is not a reconciliation event; only the marker word changes.

**Choice control inside a provider.**

- `ChoiceRow.onSelect` and the arrow-key path call `draft.select(…)` (rule 1); they never call `fire`.
- `ChoiceRow` renders a per-row `marker` prop instead of `checked && marker` (`UseRawControl.tsx:370-372`). Markers by state:
  - clean (`submitted === null && draft === null`): the checked row gets today's marker, `In use` or `Selected` (`UseRawControl.tsx:482-483`); the other row none. Byte-identical to today.
  - dirty: the persisted row keeps its marker while unchecked; the draft row (checked) has none.
  - `submitted !== null`: the submitted row (checked) shows `Selected`, the word the shipped control already uses for "chosen, crew pages not updated yet"; the persisted row shows none.
- The in-control error and "Try again" (`UseRawControl.tsx:589-607`) and the `Saving…` live text (`UseRawControl.tsx:585-587`) do not render inside a provider; the action bar owns progress and errors. The pending-apply notes (`UseRawControl.tsx:569-580`) still render from persisted state.

**Action bar (`DataQualityWarningControls` inside a provider).** One main button element whose label morphs, so focus on it survives every label change.

| Condition | Main button | Beside it |
|---|---|---|
| not busy, not dirty | `Accept` (active list) or `Undo accept` (Accepted list); none if not ignorable (as today) | Report |
| not busy, dirty | `Save` | Report; `Cancel` (ghost button); hint `Not saved yet` (`text-xs text-text-subtle`, `id` referenced by the main button's `aria-describedby`) |
| busy | `Saving…` (sequence started from Save) or `Accepting…` / `Undoing…` (started from the clean button); disabled, `aria-busy` | Cancel disabled |
| error present | label for the not-busy condition above | the existing error slot (`role="alert"`, `DataQualityWarningControls.tsx:257-265`) with the copy below |

Cancel classes: `inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-3 text-sm font-medium text-text transition-colors duration-fast hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` plus the plate's ring-offset class: the archived-tab ghost idiom (`components/admin/wizard/archivedTabOffer.tsx:64-66`) on this component's `px-3`.

Error copy: rule 3 shows `That didn’t save. The cell may have changed.` (the control's existing sentence, `UseRawControl.tsx:592`); rule 4's accept failure shows `Your reading is saved, but we couldn't accept the judgment call. Refresh and try again.` An error stays until the next select, Save, Accept or Cancel.

Each request takes its own lock inside its own existing endpoint, one after the other; no lock nests (invariant 2 unchanged).

**Published bulk accept** acts on the persisted readings; a card with an unsaved draft loses the draft when it moves to the Accepted list (documented limit L8).

### 6.4 The Accepted (N) disclosure (R12)

**Partition.** A row in the ignored partition is ACCEPTED when `isWarnSeverity(w) && isAmbiguityCode(w.code)`; every other ignored row stays IGNORED. The split happens at render; the partition, its counts in the rails and headings (`wizardPanelCount`, the rail's `ignoredWarnCount`, `step3ReviewSections.tsx:5315-5329`), and the ignore store are unchanged.

**Wizard** (`WarningsBreakdown`, today one disclosure at `step3ReviewSections.tsx:3509-3604`). `ignoredItems` (`step3ReviewSections.tsx:3083`) splits into `ignoredOnly` and `accepted`, each with its own `stableWarningKeys` (as `ignoredKeys` today, `step3ReviewSections.tsx:3089`). Two `<details>`, both still OUTSIDE the active-list ternary so they survive the all-dismissed case (the reason given at `step3ReviewSections.tsx:3503-3508`), each rendered only when its count is above zero:

1. `Ignored (N)`: existing testids `wizard-step3-card-${dfid}-ignored-warnings` / `-ignored-summary` / `-ignored-list`, now holding non-judgment rows only.
2. `Accepted (N)`: new testids `wizard-step3-card-${dfid}-accepted-warnings` / `-accepted-summary` / `-accepted-list`.

Both use today's classes (`group mt-3` on the `details`, the summary and list classes at `step3ReviewSections.tsx:3510-3524`) and today's row markup (title, `Sheet row` discriminator, `DataQualityWarningControls mode="ignored"` with the same `ignoreOrigin` routing, `step3ReviewSections.tsx:3525-3600`). Accepted rows' button reads `Undo accept`. No choice control in either wizard list (unchanged).

**Published** (`buildSectionWarningExtras`, today one disclosure per section at `sectionWarningExtras.tsx:283-317`). Split the RECORDS, not the warnings: today each row's report id is read as `model.ignored[i].reportSurfaceId` by position in `ignoredWarnings` (`sectionWarningExtras.tsx:168`, `sectionWarningExtras.tsx:306`), so filtering the warnings alone would hand rows the wrong report ids. Each list is built from its own filtered record array and reads `records[i].reportSurfaceId` from it. Two `<details>`, each only when non-empty:

1. `Ignored (N)`: existing testids `section-ignored-warnings-${id}` / `section-ignored-summary-${id}` / `section-ignored-list-${id}`.
2. `Accepted (N)`: new testids `section-accepted-warnings-${id}` / `section-accepted-summary-${id}` / `section-accepted-list-${id}`.

Same classes as today; both lists `PerShowActionableWarnings tone="muted"` with no `followUpCopy`. Accepted rows keep the choice control (inside a provider, §6.3), so a reading can still be changed after acceptance; Save there saves the reading only. The empty-seam guard (`sectionWarningExtras.tsx:257`) keeps testing the union.

**Order.** `Ignored` first, `Accepted` second, on both surfaces: the same order as the attention menu's groups (needs a look, then judgment calls, `components/admin/wizard/WizardAttentionMenu.tsx:118-131`). The two `details` sit 12px apart (`mt-3` on the wizard; the extras column's `gap-3`, `sectionWarningExtras.tsx:268-269`, on published). Each keeps its own native open state.

**Bulk and undo.** Bulk exists only on ACTIVE groups (`BulkIgnoreControls`, mounted at `sectionWarningExtras.tsx:279`); a judgment group's chip reads `Accept <n>` and moves its cards into `Accepted (N)`. Neither disclosure has a bulk action (unchanged). Undo is per row: `Un-ignore` in Ignored, `Undo accept` in Accepted; either returns the row to the active list.

### 6.5 Unsaved reading guard (R15)

**Why.** Since §6.3 a picked reading is a local draft until Save. Publishing, re-scanning or closing the review unmounts the row (or replaces its warning), and the draft goes with it, silently. Eric's decision (R15, 2026-10-30): those actions stop and ask first.

**The count.** `N` = the number of mounted `UseRawDraftProvider`s in ONE review surface whose `dirty` is true (`dirty = submitted === null && draft !== null`, `components/admin/useRawDraft.tsx:162`). A new client module components/admin/review/unsavedReadings.tsx (new file) holds a per-surface registry: a provider registers itself, with a discard callback that applies §6.3 rule 6's `draft = null` and clears the action bar's error (without rule 6's focus move), when it becomes dirty, and unregisters when it becomes clean or unmounts (one effect keyed on `dirty`). Clean includes pressing Save (rule 2 sets `draft = null`), so a row whose Save is in flight is not counted; a failed Save (rule 3) makes it dirty and counted again.

**Where the registry lives.** One per `ReviewModalShell` instance, which is one per review surface: the wizard Step 3 modal (`components/admin/wizard/Step3ReviewModal.tsx:505`), the published review modal (`components/admin/showpage/PublishedReviewModal.tsx:1018`), and the streaming skeleton, which renders no rows, so its `N` is always 0. The shell provides it as a React context around the panel interior, next to `ReviewModalCloseContext` (`components/admin/review/ReviewModalShell.tsx:595`), so every row provider and every guarded control inside the panel (body, header, sub-header and footer slots) reaches it. A `UseRawDraftProvider` with no registry above it (standalone tests) registers nothing.

**Guard.** `guard(action, trigger)`: when `N === 0` it calls `action()` synchronously in the same event and writes no state, so every guarded control behaves exactly as today. When `N > 0` it does not run `action`; it opens the prompt below and remembers `action` and `trigger`. A guarded control with no registry above it (it is not inside a review surface) runs its action unguarded.

**Guard points.** Every control that unmounts the review or replaces its warnings, found by grepping each surface's close, publish, re-scan and re-sync paths:

| # | Surface | Control | Hook point | Why it loses a draft |
|---|---|---|---|---|
| G1 | both modals | header close button (`ModalCloseButton`) | `useReviewModalClose()` then `onClick={requestClose}` (`components/admin/review/ModalCloseButton.tsx:13`, `components/admin/review/ModalCloseButton.tsx:19`), mounted at `Step3ReviewModal.tsx:807` and `PublishedReviewModal.tsx:1445` | the review unmounts |
| G2 | both modals | Escape | the shell's document `keydown` listener, after `onEscapeCapture` declines (`ReviewModalShell.tsx:251-270`, `requestClose()` at `ReviewModalShell.tsx:262`) | the review unmounts |
| G3 | both modals | backdrop (scrim) tap | `onClick={requestClose}` (`ReviewModalShell.tsx:609-619`) | the review unmounts |
| G4 | both modals | grab strip tap (sheet mode) | `onClick` then `requestClose()` (`ReviewModalShell.tsx:663-671`) | the review unmounts |
| G5 | both modals | grab strip drag past `DRAG_DISMISS_THRESHOLD_PX` (sheet mode) | `handleGrabPointerEnd`'s dismiss branch, `beginDismiss()` at `ReviewModalShell.tsx:501` | the review unmounts; while `N > 0` the drag springs back (the existing below-threshold branch, `ReviewModalShell.tsx:520-542`) and the prompt opens |
| G6 | wizard | Publish this show | `onClick={handlePublish}` (`Step3ReviewModal.tsx:996`; `handlePublish` at `Step3ReviewModal.tsx:456` closes the modal on success) | the review unmounts |
| G7 | wizard | Approve & apply (re-apply resolution footer) | `onClick={handleApproveResolve}` (`Step3ReviewModal.tsx:914`; closes on success, `Step3ReviewModal.tsx:244-277`) | the review unmounts (it finalizes the sheet) |
| G8 | wizard | Ignore this sheet (re-apply resolution footer) | `onClick={handleIgnoreResolve}` (`Step3ReviewModal.tsx:897`; closes on success, `Step3ReviewModal.tsx:279-294`) | the review unmounts |
| G9 | wizard | Re-scan, every placement inside the review: the three footer placements (`Step3ReviewModal.tsx:903`, `Step3ReviewModal.tsx:953`, `Step3ReviewModal.tsx:972`) and Pack list's rescan-needed note (`components/admin/wizard/step3ReviewSections.tsx:2829`) | inside `RescanSheetButton`, its trigger's `onClick` (`components/admin/RescanSheetButton.tsx:213`; `handleClick` at `components/admin/RescanSheetButton.tsx:149`) | the re-parse replaces the warnings; a row whose warning changed unmounts (§14 sequence 8) |
| G10 | published | Re-sync, and the shrink confirm's `Apply reduced version` | inside `ReSyncButton`, both `post` call sites (`components/admin/ReSyncButton.tsx:414`, `components/admin/ReSyncButton.tsx:539`; `post` at `components/admin/ReSyncButton.tsx:361`), mounted in the modal's footer through `StatusStrip` (`components/admin/showpage/StatusStrip.tsx:422`) | the sync re-parses and refreshes; a changed warning's row unmounts |
| G11 | both | the browser unloading the page (reload, tab close, external navigation) | a `beforeunload` listener, registered while `N > 0`, removed when `N` returns to 0 or the surface unmounts | the page goes |

Not guarded, with the reason: `Unpublish` (`Step3ReviewModal.tsx:983`) keeps the modal open on success, so drafts survive it. `closeApiRef` (`ReviewModalShell.tsx:299-305`) stays the UNGUARDED close: G6 to G8 call it after their already-guarded action succeeds. Re-scan and Re-sync placements outside a review surface (`components/admin/wizard/Step3SheetCard.tsx:479`, `components/admin/wizard/Step3SheetCard.tsx:700`, `components/admin/FinalizeButton.tsx:968`, the dashboard row actions) have no registry above them and no drafts to lose. Accept, Undo accept, Ignore, include and the other row actions refresh without unmounting other rows, so drafts on other rows survive them (§6.3 rule 5 keys only on each row's own `persistedRaw`).

**Consumer-owned handlers.** G6 to G8 are closures in `Step3ReviewModal`'s own body, ABOVE the shell's provider: the position that made the shell expose `closeApiRef` (`ReviewModalShell.tsx:72-80`). The shell therefore populates a second optional ref prop, `guardApiRef`, with its `guard` in the same layout effect, cleared on unmount; the handlers call `guardApiRef.current` and run the action directly when it is null. G1 to G5 are inside the shell; G9 and G10 read the context.

**The prompt.** In-page, never `window.confirm`. It follows the one existing dialog that stacks over a review modal, `FinalizeBlockerDialog` (`components/admin/FinalizeButton.tsx:753`): its own portal node appended to `document.body` (`FinalizeButton.tsx:760-771`); every other body child set `inert` and `aria-hidden` while open and restored on close, the outer focus snapshot taken before inerting (`FinalizeButton.tsx:781-806`); `useDialogFocus(panelRef, goBackRef)` for the Tab trap and initial focus (`FinalizeButton.tsx:810`); a capture-phase document Escape listener with `stopImmediatePropagation`, so the review shell's own Escape (G2) never sees the key (`FinalizeButton.tsx:840-860`). Container and panel classes are that dialog's (`FinalizeButton.tsx:864-900`); the backdrop is the non-interactive `aria-hidden` scrim of its blocking states (a tap on it does nothing); the panel has no close button.

Markup and copy (no em dash anywhere):

- Root: `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` naming the title, `aria-describedby` naming the body; testid `unsaved-readings-prompt`.
- Title (`h2`, testid `unsaved-readings-prompt-title`): `You have 1 unsaved reading change` when `N === 1`, else `You have ${N} unsaved reading changes`. It follows `N` live while open.
- Body (`p`): `Your pick is not saved until you press Save.`
- Buttons, in this DOM order, each `inline-flex min-h-tap-min` (44px tall):
  - `Go back` (testid `unsaved-readings-prompt-go-back`, the accent fill, initial focus): closes the prompt, runs nothing, keeps every draft, returns focus to the trigger.
  - `Discard and continue` (testid `unsaved-readings-prompt-discard`, the outlined quiet button): closes the prompt, calls every registered discard callback (all drafts on this surface clear), returns focus to the trigger, then runs the remembered action (the action itself, not the guard again).
- Escape while open is `Go back`.

**Focus return.** The trigger is the control the operator pressed, captured when the guard ran: the clicked button for G1, G4 and G6 to G10; the element focused when the key was pressed for G2; the grab strip for G5. The backdrop (G3) is out of the tab order (`tabIndex={-1}`, `ReviewModalShell.tsx:616`), so its trigger is the dialog's close button (the shell's `initialFocusRef`). A trigger no longer in the document falls back to the element focused when the prompt opened. The restore is the shared helper's own: the prompt hands that target to `useDialogFocus` as its `restoreTargetRef` (`lib/a11y/dialogFocus.ts`), so the helper's single focus call lands on it; a second, manual focus call would be overridden by the helper's restore to the element focused when the prompt opened, which is not the trigger when the click did not move focus (Safari never focuses a clicked button; UI gate P2). On `Discard and continue` the prompt unmounts, and focus returns, BEFORE the action runs, so an action that closes the review starts from a live dialog that is no longer inert.

**Transitions.** Two prompt states, **P0** closed and **P1** open. Nothing animates, so `prefers-reduced-motion` needs no branch.

| Transition | Reachable as | Treatment |
|---|---|---|
| P0 → P1 | a guarded control (G1 to G10) pressed while `N > 0` | instant mount; focus to `Go back`; background inert; the action has not run |
| P0 → P0 | a guarded control pressed while `N === 0` | no prompt; the action runs in the same event (passthrough) |
| P1 → P0 by `Go back` or Escape | operator | instant unmount; focus to the trigger; drafts kept; the action does not run |
| P1 → P0 by `Discard and continue` | operator | instant unmount; focus to the trigger; drafts cleared; then the action runs |
| P1 → P0 by `N` reaching 0 | every counted row went clean or unmounted while open | as `Go back`: instant unmount, focus to the trigger, the action does NOT run (the operator never confirmed it); pressing the control again then passes through |

Compound cases while P1 is open:

1. **A Save already in flight resolves.** The row was not counted (rule 2 cleared its draft when Save was pressed). Success keeps it uncounted, so `N` is unchanged. Failure restores its draft (rule 3), so `N` rises by one and the title follows. No Save can START while P1 is open: the background is inert.
2. **A row's warning disappears** (a refresh from an earlier Accept, include or sync lands, §14 sequence 8): its provider unmounts and unregisters, and `N` falls by one; at 0, the last row of the table applies.
3. **Reconciliation** (§6.3 rule 5) on a counted row: when `draft === persistedRaw` the draft clears, the row unregisters, and `N` falls; at 0, the last row of the table applies.
4. **A second guarded control:** unreachable, the background is inert.
5. **The review unmounts underneath the prompt** (its parent closes it): the shell renders the prompt, so it unmounts too; the action does not run.
6. **`beforeunload`:** independent of the prompt; the browser shows its own.

**`beforeunload` (G11).** While `N > 0` the surface registers a `window` `beforeunload` listener that calls `event.preventDefault()` and sets `event.returnValue = ""`; the browser shows its own wording, and no custom copy is possible. It is removed when `N` returns to 0 and on unmount. At `N === 0` no listener exists.

**Guard conditions.** `N === 0`: every guard point passes through and no listener exists. No registry above a control: passthrough. `guardApiRef.current` null: passthrough. Trigger null or detached: focus returns to the element focused when the prompt opened. `N` changes while open: the title re-renders; at 0, the last transition row applies.

**Tests (§16.1, §16.2).** One jsdom test per guard point G1 to G10 that fails if that point is not guarded: with one dirty row, pressing it shows the prompt and the action has not run (`onClose`, the publish request, the resolution callback, the rescan or sync `fetch`). The count: one and two dirty rows give the singular and plural titles; a Save press lowers it; a failed Save raises it while open. Both buttons: `Go back` keeps the draft (`Save` still shown) and returns focus to the trigger, including when focus was elsewhere at the press (a reading toggle focused, then Publish or the backdrop pressed without moving focus: focus lands on Publish, or on the close button for the backdrop); `Discard and continue` clears the draft and runs the action exactly once. Zero-dirty passthrough: each guard point with no dirty row runs its action in the same event with no prompt. `beforeunload`: no listener at `N = 0`; a listener that prevents default at `N > 0`; removed when the draft clears and on unmount. Real browser (`tests/e2e/warning-card-flows.spec.ts`): both buttons ≥ 44px tall by rect, the panel inside the viewport at 320 and 1280 widths, and focus on `Go back` when it opens.

**Limits.** L15: a client-side navigation that unmounts the review without passing a guard point (the browser's Back button inside the app, a link inside the review) is not guarded, and `beforeunload` does not fire for it. L16: the prompt counts unsaved changes but does not name the rows holding them.

---

## 7. Fix E: the archived pull sheet card

### 7.1 Current state

- `emitArchivedTabWarnings` (`lib/sync/pullSheetOverride.ts:118-128`) emits per non-included tab: `message` = `Pull sheet found on archived tab "<name>"; left out of the parse.`, `rawSnippet` = `tab.headerPreviews.join(" | ")`, `blockRef: { kind: "pull_sheet_archived_tab", name }`. **Brief correction:** `message` is that sentence, not the tab name; the name is `blockRef.name`. Pushed on every scan path through `finalizeArchivedTabs` (`pullSheetOverride.ts:229-233`), cron included, so published shows carry it too.
- `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` (`contentChangedWarning`, `pullSheetOverride.ts:136-143`) uses the same `blockRef.kind`.
- That kind is not in `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:28-51`), so both codes route to "warnings" (`warningsBySection`, `step3SectionStatus.ts:91-104`).
- The deep link already exists: tab scope via the visible-tab map (`showDayTimeAnchors.ts:285-290`).
- The include action is `ArchivedTabOffer` (`archivedTabOffer.tsx:107-210`): its own bordered card, title, previews list, sentence, button `Use this show’s gear` / `Including…` (`archivedTabOffer.tsx:183`, retired by R13), local "Keep skipped" (`archivedTabOffer.tsx:112`, `archivedTabOffer.tsx:186-198`). Offers come from `deriveArchivedOffers(tabs, staged, override)` (`archivedTabOffer.tsx:24-43`). Mounted in Pack list (`step3ReviewSections.tsx:2602-2612`) and the Step-3 Resolve box with `showDismiss={false}` (`Step3ReviewModal.tsx:1107-1114`). Published has its own `PublishedArchivedTabOffer` in Pack list (`step3ReviewSections.tsx:2620-2667`), with offer names derived from ACTIVE `PULL_SHEET_ON_ARCHIVED_TAB` warnings across all sections (`lib/admin/deriveActiveArchivedTabNames.ts:11-25`), so a published Ignore hides the published offer.
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
- The include button, when the tab is in `deriveArchivedOffers(archivedPullSheetTabs, true, pullSheetOverride).offers` AND `wizardSessionId` and `dfid` are present. Visible label `Use this pull sheet`, pending `Including…` (R13, same on every surface). Testid `…-warning-${i}-archived-include`.
- The section jump `Go to Pack list` (§8).
- The existing Report + Ignore. Ignore keeps its label (needs-a-look code) and means "keep it skipped": skipped is the default, nothing else is written.

The button comes from a new export `ArchivedTabIncludeButton` extracted from `ArchivedTabOffer` (`archivedTabOffer.tsx:116-139`, `archivedTabOffer.tsx:176-184`, `archivedTabOffer.tsx:214-216`): props `dfid`, `wizardSessionId`, `tab`, `plate: "tinted" | "surface"`, `pending: boolean`, `onPendingChange(next: boolean): void`, optional `blocked: boolean` and optional `onBeforeRefresh`. **It owns no pending state.** Its click handler returns at once when `pending || blocked`, calls `onPendingChange(true)` before the POST and `onPendingChange(false)` in `finally`, exactly where `ArchivedTabOffer` sets its own flag today (`archivedTabOffer.tsx:118-120`, `archivedTabOffer.tsx:136-137`). It is disabled while `pending || blocked`, and shows `Including…` only while `pending` (a `blocked` button keeps its idle label). It owns only its error text and the error region. The label is not a prop: R13 makes it one string, exported from `archivedTabOffer.tsx` as `ARCHIVED_TAB_INCLUDE_LABEL = "Use this pull sheet"` and `ARCHIVED_TAB_INCLUDE_PENDING = "Including…"` (the pending word is unchanged; it names the system action, include, that the catalog copy also uses). It POSTs the same body through `postPullSheetOverride` (`archivedTabOffer.tsx:68-82`) and renders the same always-mounted `role="status"` error region with `ARCHIVED_TAB_ERROR` (`archivedTabOffer.tsx:87-88`). `ArchivedTabOffer` (Pack list and the Resolve box) re-renders its own button through it, so the card, Pack list and the Resolve box share one button, one label and one behavior.

**Pending ownership, per placement.** The flag lives in the placement's parent, never in the button:

- `ArchivedTabOffer` keeps its ONE `pending` state (`archivedTabOffer.tsx:111`) and passes `pending` / `onPendingChange={setPending}` down, so `Keep skipped` stays `disabled={pending}` (`archivedTabOffer.tsx:194`) for the whole include, exactly as today. The extraction must not split that flag; §16.1 has the test that fails if it does.
- The warning card row owns the flag through a new per-row client component, `ArchivedTabWarningActions` (in `archivedTabOffer.tsx`), because the row is rendered inline in a `.map` (`step3ReviewSections.tsx:3268`) and cannot hold state itself. It owns `includePending: boolean` and `ignoreRunning: boolean` and renders the include button and the row's `DataQualityWarningControls`:
  - while `includePending`: the card's Ignore is disabled (`DataQualityWarningControls` gets `blocked={includePending}`);
  - while `ignoreRunning`: the include button is disabled (`blocked={ignoreRunning}`), keeping its idle label;
  - `DataQualityWarningControls` reports its own request through a new optional `onRunningChange(running: boolean)` prop, called `true` when its request starts and `false` when it ends, success or failure (it already tracks this as `state.kind === "running"`, `DataQualityWarningControls.tsx:115`, `DataQualityWarningControls.tsx:151`).
- **Report is exempt** from both locks, on this row and in the §6.3 action bar: it writes nothing to the warning, the tab, the override or the reading, so it cannot race any of those writes, and `ReportButton` has no disabled state to drive (`components/shared/ReportButton.tsx:43-75`). The one interaction (a Report modal opened during a pending include, then the success unmounting the row) is the same one every row already has when its Ignore succeeds, since Report stays enabled while Ignore runs today (`DataQualityWarningControls.tsx:203-237`).
- Not locked across placements: the same tab's include on the card, in Pack list and in the Resolve box are three independent flags, as Pack list and the Resolve box are two today. A second POST for the same tab fails the route's row-state CAS and takes its existing 409 refresh path (`app/api/admin/onboarding/pull-sheet-override/route.ts:31-36`).
- `PublishedArchivedTabOffer` keeps its own single `pending` shared by its include and `Skip` buttons (`PublishedArchivedTabOffer.tsx:166-185`); it does not use the extracted button. The card passes `plate="surface"` (outline `border-text-faint`, per the per-call-site color rule at `archivedTabOffer.tsx:47-57`) and `onBeforeRefresh={holdFocusInPanel}`: success removes the warning, which unmounts the focused button, the same focus-loss class the ignore path already guards (`step3ReviewSections.tsx:3090-3101`). "Keep skipped" never renders on the card.

**One label on every surface (R13).** The accessible name is `Use this pull sheet from tab <name>` while idle and `Including…` while pending, everywhere:

- `ArchivedTabIncludeButton` (card, Pack list, Resolve box): visible `Use this pull sheet`, plus an sr-only suffix ` from tab <tab.tabName>` rendered only while idle.
- `PublishedArchivedTabOffer` (published Pack list, `components/admin/review/PublishedArchivedTabOffer.tsx:167-176`): visible text changes from `Include this gear` to `ARCHIVED_TAB_INCLUDE_LABEL` and its pending text to `ARCHIVED_TAB_INCLUDE_PENDING`; its `aria-label` (`Include gear from <tab>`, `PublishedArchivedTabOffer.tsx:172`) is replaced by the same sr-only suffix. It keeps its own POST (a different endpoint) and its `Skip` button. This site is in R13's class (the same action in the same Pack list) though the decision text names the staged button; Builder's call E7.

Old labels are pinned by `tests/components/admin/wizard/archivedTabOffer.render.test.tsx:27`, `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx:166`, `Step3ReviewModalResolution.test.tsx:218`, `Step3ReviewModalResolution.test.tsx:242`, `Step3ReviewModalResolution.test.tsx:259`, `Step3ReviewModalResolution.test.tsx:272`, `Step3ReviewModalResolution.test.tsx:286`, and ten assertions in `tests/components/admin/review/publishedArchivedTabOffer.test.tsx` (`Include this gear` / `Include gear from`). No message registry, catalog row or e2e spec pins either label (searched `tests/`, `lib/`, `components/`, `app/`). The dated specs that quote the old wording (`docs/superpowers/specs/step3-onboarding/2026-07-06-pull-sheet-archived-tab-override.md`, `docs/superpowers/specs/step3-onboarding/2026-07-17-archived-tab-resolve-box-offer.md`) are records and are not edited.

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

The classes are the deleted link's (`step3ReviewSections.tsx:3434`), so the slot keeps its type ramp and 44px floor. Info rows and rows in the Ignored or Accepted lists get no jump: info rows are never routed (`warningsBySection` skips them, `step3SectionStatus.ts:96`), and a dismissed row has nothing live in its section. The published modal gets no card jumps: its cards already render inside their sections.

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
| Sheet icon link accessible name (wizard card and every compact card) | component-owned: `Open the source sheet for <title> in Google Sheets (opens in a new tab)`; the visible `Open in Sheet ↗` text leaves all three warning-card sites |
| Comparison labels | `Sheet says` · `We read` |
| We read values | `no guests` · `1 guest: <name>` · `<n> guests: <names>` · `<n> guests: <six names>, and <k> more` |
| Reservation marker link | `See how we read it` + sr-only ` for <hotel name>` |
| Callout judgment link (reading-shown members) | `See how we read it` |
| Card jumps | `Go to <section label>` · `Go to this reservation in Hotels`, each + sr-only ` for <title>` |
| Accept family | `Accept` · `Accepting…` · `Undo accept` · `Undoing…` |
| Save family | `Save` · `Saving…` · `Cancel` · `Not saved yet` |
| Announcements | `Judgment call accepted.` · `Judgment call restored.` · `Reading saved. Judgment call accepted.` · `Reading saved.` · `1 accepted.` · `<n> accepted.` · `Not saved yet` (on a pick that makes the row dirty, §15; the hint's own string) |
| Errors | `Couldn't accept that judgment call. Refresh and try again.` · `Couldn't undo that. Refresh and try again.` · `Your reading is saved, but we couldn't accept the judgment call. Refresh and try again.` · `Couldn't accept those judgment calls. Refresh and try again.` · reused: `That didn’t save. The cell may have changed.` |
| Bulk chip names | `Accept <n>` · `Are you sure? Accept <n>` |
| Archived include button (card, Pack list, Resolve box, published Pack list) | `Use this pull sheet` (replaces `Use this show’s gear` and `Include this gear`) · accessible name `Use this pull sheet from tab <name>` · pending `Including…` (unchanged) |
| Archived card lines | `Tab ` + name · `Cases ` + previews · reused `(no header text)` |
| Disclosures | `Accepted (<n>)` (new) · `Ignored (<n>)` (unchanged) |
| Catalog helpfulContext | the three strings in §5.7 and §7.5 |
| Unsaved reading prompt (§6.5) | `You have 1 unsaved reading change` · `You have <n> unsaved reading changes` · `Your pick is not saved until you press Save.` · `Go back` · `Discard and continue` |

The pre-code mechanical checklist (`_metaEmDashCopy`, tap floors, `text-xs/relaxed` and `text-subtle` usage) runs against this table before implementation starts.

---

## 12. Mode boundaries

| Element | Wizard needs-look | Wizard judgment | Wizard info | Wizard Ignored list | Wizard Accepted list | Published active card | Published Ignored list | Published Accepted list | Published note | Staged review page |
|---|---|---|---|---|---|---|---|---|---|---|
| Severity word | removed | removed | removed | never had | never had | never had | never had | never had | never had | never had |
| Chip | warm triangle | info-bg ring glyph | info | none | none | none (compact shell) | none | none | none | none |
| 6px dot | warm fill | hollow subtle ring | faint fill | none | none | none | none | none | none | none |
| Judgment tag | no | yes (`surface`) | no | no | no | judgment codes (`warning-bg`) | no (never judgment) | yes (`surface-sunken`) | no | judgment codes (`warning-bg`) |
| Sheet link | icon, title row (§3.5) | icon, title row | icon, title row | none | none | icon, message row (§3.6, `warning-bg`) | icon, message row (`surface-sunken`) | icon, message row (`surface-sunken`) | icon, message row (`surface`) | icon, message row (`warning-bg`) |
| Section or reservation jump | yes (staged) | yes (staged) | no | no | no | no | no | no | no | no |
| Restore / accept wording | Ignore | Accept | n/a | Un-ignore | Undo accept | Ignore / Accept by kind | Un-ignore | Undo accept | n/a | n/a (no controls) |
| Deferred Save | n/a | radio codes | n/a | n/a | n/a (no choice control) | radio codes | n/a | radio codes (reading only) | n/a | n/a |
| Read-only comparison | n/a | inline guest split | n/a | n/a | n/a | inline guest split | n/a | inline guest split | n/a | n/a (no controls) |
| Archived card lines + include | lines + include (staged); include and Ignore lock each other, Report never locked (§7.3) | n/a | n/a | no | n/a | no (offer adjacent in Pack list) | no | n/a | n/a | no |

"Radio codes" = the four `USE_RAW_CODES` (§5.6) in a resolvable state. "Inline guest split" = `HOTEL_GUEST_SPLIT_AMBIGUOUS` in the `disabled` state. Accepted lists hold only judgment rows and Ignored lists only non-judgment rows, by the §6.4 partition, which is why the tag column reads "no (never judgment)" for Ignored. The reservation marker (§5.4) is not on a warning card: it renders on the hotel card in the Hotels section of the staged wizard only, and nowhere on the published modal or the staged review page.

---

## 13. Dimensional Invariants: the sheet icon link's two host rows

### 13.1 The wizard title row

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

### 13.2 The compact card message row (§3.6)

Parent: `compact-alert-message`. Children: the severity glyph (warning tone only), the message `div`, the help-trigger wrapper (optional), and the `SheetIconLink` anchor. Insets as in §13.1 (12 / 10 / 14 px); the help trigger's overlay is 11px on every side (`HoverHelp.tsx:555`).

| ID | Relationship | Guaranteed by | Assertion (px, tolerance 0.5) |
|---|---|---|---|
| DI-C1 | row height ≥ 44 when `sheetLink` is present | `min-h-tap-min` added on that branch | `row.height >= 44` |
| DI-C2 | row unchanged when `sheetLink` is absent | conditional class | the row's `className` equals today's literal `flex gap-2.5 p-3 pb-2.5` on `HealthAlertsPanel` and `AttentionBanner` renders |
| DI-C3 | anchor box is 20×20 | `size-5` | `link.width === 20 && link.height === 20` |
| DI-C4 | anchor sits at the content-box top, so its overlay starts at the row top | default stretch row + definite anchor height + `p-3` | `link.top - row.top === 12` |
| DI-C5 | vertical overlay contained | DI-C1 + DI-C4 | `link.bottom + 12 <= row.bottom` |
| DI-C6 | no overlap with the help trigger's hit area | `gap-2.5` + `ml-3` = 22 ≥ 11 + 10 | with a help trigger: `link.left - help.right >= 22`; hit test `elementFromPoint(help.right + 10, help.top + 11)` is the help button and `elementFromPoint(link.left - 9, link.top + 10)` is the anchor |
| DI-C7 | heading-side clearance without a help trigger | same classes | `link.left - message.right >= 22` |
| DI-C8 | trailing overlay ends at the card's inner edge | `mr-0.5` + `p-3` right = 14 | `row.right - link.right === 14`; `elementFromPoint(link.right + 13, link.top + 10)` is the anchor |
| DI-C9 | the message still takes the slack | message `min-w-0 flex-1` | at 320 and 375 with a 120-character title, `message.right <= link.left - 22` and the anchor's top stays at DI-C4 |

DI-C1 to DI-C9 run at 320, 375, 430 and 1280 widths on all three tones, with and without a help trigger, and on a condensed crew under-row card (its `pl-6` wrapper, `sectionWarningExtras.tsx:52`). Premise: each fixture asserts its tone class and the presence or absence of the help trigger before measuring.

---

## 14. Transition Inventory: the reading choice and its action bar

States, defined on the §6.3 model (`P` = `persistedRaw`):

| State | Definition | Displayed reading | Main button |
|---|---|---|---|
| **C** clean | `submitted === null && draft === null`, not busy | `P` | `Accept` / `Undo accept` |
| **D** dirty | `submitted === null && draft !== null`, not busy | `draft` | `Save` (+ Cancel, hint) |
| **S** saving | busy (a reading or accept request in flight) | `submitted ?? draft ?? P` | `Saving…` / `Accepting…` / `Undoing…`, disabled |
| **V** saved, not yet reconciled | `submitted !== null`, not busy | `submitted` | `Accept` (retry accept only) or `Undo accept` |
| **E** error | an error is shown, over D (failed Save), over V (accept failed after a saved reading), or over C (failed plain Accept) | as the underlying state | as the underlying state |

Pairs (5 states, so 10 unordered pairs; both directions of each are listed):

| Pair | Reachable as | Treatment |
|---|---|---|
| C → D | select the non-persisted reading (rule 1) | instant, local state |
| D → C | Cancel (rule 6); select the persisted reading (rule 1); reconciliation with `draft === P` (rule 5) | instant; Cancel moves focus to the main button |
| C → S | Accept | instant label swap `Accepting…` |
| S → C | plain Accept succeeds and the row stays (refresh keeps it) | instant |
| D → S | Save (rule 2) | instant label swap `Saving…`; radio rows and Cancel disabled |
| S → D | unreachable directly: a failed Save goes S → E (over D) | n/a |
| C → V | unreachable: `submitted` is only set from D | n/a |
| V → C | reconciliation clears `submitted` (rule 5) | instant; the displayed reading becomes `P`, which after a successful save equals `submitted` |
| D → V | only through S | n/a |
| V → D | unreachable: radio rows are soft-disabled while `submitted !== null` | n/a |
| S → V | reading request succeeds (rule 4) | instant; the acknowledged reading stays checked |
| V → S | Accept retry after a partial success | instant label swap `Accepting…` |
| C → E / D → E / V → E | only through S | n/a |
| S → E | any failure (rules 3 and 4) | instant; `role="alert"` paragraph appears |
| E → C | Cancel from E over D; selecting the persisted reading from E over D (rule 1); reconciliation from E over V | instant; error cleared by the next action |
| E → D | select the non-persisted reading from E over C (from E over D the only unchecked row is the persisted reading, so a select there returns to C by rule 1) | instant; error cleared |
| E → S | retry Save or Accept | instant |
| E → V | unreachable directly | n/a |

No state animates; every change is a text or presence swap, so `prefers-reduced-motion` needs no branch. The existing row move between the active list and the Ignored / Accepted lists, and the existing flash, are unchanged.

**Sequences** (each is a probe-test case in §16.1; `r` = the reading picked, `¬r` = the other):

1. **Full success, delayed refresh.** `P = ¬r`. Select `r` (D, shows `r`) → Save (S, `submitted = r`, shows `r`) → reading ok (S, accept running, shows `r`) → accept ok (announce, focus hand-off, refresh requested; V, shows `r`) → [refresh delayed: still V, shows `r`, never `¬r`] → refresh lands with `P = r`: the row moves to the Accepted list (unmount). If the row stays in place, reconciliation gives C showing `r`.
2. **Accept fails after the reading saved.** As 1 through "reading ok" → accept fails → refresh requested, E over V (shows `r`, partial-success copy) → refresh lands with `P = r` → reconciliation: `submitted = null`, C showing `r`; the copy stays until the next action; `Accept` retries the accept only.
3. **Retained rows** (not ignorable, or the published Accepted list). D → S → reading ok → V (shows `r`, announce `Reading saved.`) → refresh with `P = r` → C showing `r`.
4. **Select back, then an external save.** `P = ¬r`. Select `r` (D) → select `¬r` (rule 1: equals `P`, `draft = null`, C) → another tab saves `r` → refresh with `P = r` → C showing `r`, NOT D. (The round-0 model resurrected "Save / Not saved yet" here.)
5. **Failed save, refresh equals the draft, then an external revert.** `P = ¬r`. Select `r` (D) → Save (S) → fails (rule 3: `draft = r`, E over D, shows `r`) → refresh with `P = r` (the request committed despite the error, or another tab saved `r`) → reconciliation: `draft === P`, `draft = null`; C showing `r` → another tab reverts to `¬r` → refresh with `P = ¬r` → C showing `¬r`, NOT D.
6. **Refresh during D with no change to `P`.** No reconciliation event; stays D showing `draft`.
7. **Select attempted during V** (after a partial success, before the refresh lands): blocked, rows are soft-disabled; nothing changes until reconciliation returns the row to C.
13. **Refresh lands without moving `P`** (another tab reverted between our Save and our refresh, or the refresh returned identical props): no reconciliation event; the row stays V, showing and locked on `submitted`, until `P` next changes or the review remounts (L13).
8. **Warning disappears during D or V** (re-scan): the row unmounts; nothing unsaved was written.
9. **Report modal opened during D**: independent; the draft survives.
10. **Modal closes during S**: the requests complete; post-unmount state updates are no-ops.
11. **Published bulk accept during D** on a sibling card: the card moves to the Accepted list; its draft is dropped (L8).
12. **Pending-apply note during D or V** (published): reflects persisted state only.

### 14.1 The archived-tab card row: include and Ignore (§7.3)

States: **I** idle (both enabled), **N** include pending (`includePending`; Ignore disabled), **G** Ignore pending (`ignoreRunning`; include disabled). Report is enabled in all three.

| Pair | Reachable as | Treatment |
|---|---|---|
| I → N | include pressed | instant; include shows `Including…`, Ignore disabled |
| N → I | include ends: failure (error in the include's status region), or success (the existing code clears the flag in `finally` after requesting a refresh, `archivedTabOffer.tsx:129-137`) | instant |
| I → G | Ignore pressed | instant; Ignore shows `Ignoring…`, include disabled with its idle label |
| G → I | Ignore ends: failure (the existing `dq-error` alert) or success | instant |
| N → G | unreachable: Ignore is disabled during N | n/a |
| G → N | unreachable: include is disabled during G | n/a |

Compound transitions:

1. **Include succeeds, refresh not yet landed:** N → I re-enables both controls until the refresh removes the warning (existing `ArchivedTabOffer` behavior). A second include fails the route's CAS and takes the 409 refresh path; an Ignore in that window writes a dismissal for a warning about to disappear, which is harmless.
2. **Ignore succeeds, refresh not yet landed:** the existing `onBeforeRefresh` focus hand-off then the move to the Ignored list (unmount).
3. **The same tab included from Pack list or the Resolve box while the card is in N:** independent flags; the later POST takes the 409 refresh path.
4. **Report opened during N or G:** allowed (Report exempt); if the write succeeds the row unmounts with the modal, the existing Ignore behavior.
5. **`ArchivedTabOffer` during an include:** `Keep skipped` disabled for the whole request, unchanged.

### 14.2 What has no transitions

Card chrome (§3), the shell link (§3.6), the disclosures (§6.4) and the jumps (§5, §8) have no state transitions of their own: kind is derived from the code, list membership from the partition, jump presence from data. Each disclosure's open state is native `<details>` state; a disclosure whose count drops to zero unmounts (instant), and a row moving between lists is the existing instant move. Scrolling uses the existing `motion-safe` smooth scroll and flash.

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
| `CompactAlertCard.sheetLink` | absent, `null` (href null, or `driveFileId` null) | no icon; message row keeps today's classes (no 44px floor) |
| `sheetLink.subjectLabel` | `stripEmphasis(title)` whitespace-only | the component's no-subject phrasing |
| ignored partition | 0 accepted rows / 0 other rows | that disclosure does not render; with both 0, neither renders (wizard all-clean copy and the published empty-seam guard unchanged) |
| ignored record without a `reportSurfaceId` match (published) | records split as records (§6.4), never by warning position | each row reads its own record's id |
| `submitted` vs refreshed `persistedRaw` | refreshed value differs from what was sent | the refreshed value wins (rule 5) |
| archived tab name for the include accessible name | blank | the sr-only suffix is omitted; the visible label stands alone |
| `ArchivedTabIncludeButton.pending` / `blocked` | `pending` true | disabled, `Including…`; a click is a no-op |
| | `blocked` true, `pending` false | disabled, idle label `Use this pull sheet`; a click is a no-op |
| `DataQualityWarningControls.blocked` | true | main button disabled; Report enabled |
| `DataQualityWarningControls.onRunningChange` | absent | no report; every existing mount is unchanged |
| venue block | no venue tab in the gid map, no `VENUE` header row, zero or several address rows, or a non-empty value cell | venue region link (link-less when the region is absent too), never a guessed cell |
| unsaved reading count `N` (§6.5) | 0 | every guard point passes through; no prompt, no `beforeunload` listener |
| | falls to 0 while the prompt is open | the prompt closes as `Go back` would; the guarded action does not run |
| guard registry / `guardApiRef.current` (§6.5) | absent or null | the control runs its action unguarded (as today) |
| prompt trigger (§6.5) | null or no longer in the document | focus returns to the element focused when the prompt opened |
| a reading pick (§6.3 rule 1; UI gate P2) | clean → dirty (`draft` was null, the pick sets it) | `Not saved yet` is announced once through the surface's polite channel, `WarningAnnounceContext` (the channel Accept and undo use, rendered by `ShowReviewSurface`'s `AnnounceLogRegion`); the string is the hint's own constant (`NOT_SAVED_YET`, components/admin/useRawDraft.tsx). |
| | dirty → dirty (repeat pick of the draft), dirty → clean (the persisted reading, Cancel), a failed Save restoring the draft (rule 3), no provider channel | nothing is announced (the failed Save's `role="alert"` copy speaks for itself; outside a review surface the channel is a no-op) |
| jump target (the card's `Go to <section>` §8.3, `Go to this reservation in Hotels` §5.5, the reservation marker's `See how we read it` §5.4; UI gate P2, WCAG 2.4.3) | not focusable (a `section`, the hotel card, the warning card `li`) | after the scroll and flash, focus moves to the target with `preventScroll` (the scroll is already handled); a target with no `tabindex` gets `tabindex="-1"`, so it takes programmatic focus and never joins the tab order. A missing reservation card falls back to the Hotels section, focused the same way. The shared `jumpToWarning` also serves the section callouts' existing `Fix` / `Review in Sheet warnings` links, so they move focus to the card too; the attention-menu jump and the rail and chip clicks keep their own focus handling, unchanged |

---

## 16. Test strategy

Each test states the failure it catches. Real-browser tests run in the existing step-3 and published modal harnesses (`tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/_publishedReviewModalHarness.tsx`).

### 16.1 Unit and jsdom

| Test | Catches |
|---|---|
| `resolveVenueAddressCell` / `extractVenueAddressAnchor` on real workbooks: a 3-column fixture that emits the warning (`fintech.xlsx`) gets the empty value cell, its `a1` derived from the fixture (the INFO cell whose text is `VENUE ADDRESS`, same row, next column), not typed; `east-coast.xlsx` with its address cell blanked gets that cell; negatives in the same suite: two address rows in one venue block → `null`, unedited `east-coast.xlsx` (non-empty value) → `null` | value cell off by a column on either layout; a 3-column row missed; matching an address row with a value; picking one of two rows |
| `attachSourceCellAnchors` with both a cell and a region source, then a second region-only pass | region assigned when a cell exists; a later region pass demoting the cell |
| `LINK_ONLY_ANCHORED` exact-membership pins (`tests/drive/showDayTimeAnchors.test.ts`, `tests/parser/parseWarningDeepLinkRender.test.tsx`) updated | silent set drift |
| `emitInlineHotelGuestAmbiguity` emits `readAs.names` equal to the reservation's `names` (assert against the parsed `hotelReservations[index].names`, not a literal) | emitter storing names that differ from what the reservation shows |
| `weReadGuestsText`, `sheetSaysText`, `casePreviewsText` tables: 0, 1, cap, cap+1 names; blank names; non-string input; 159/160/161 chars; 0, 3, 4 previews; blank preview | off-by-one at each cap; blank leaking as an empty name |
| Wizard row kind matrix: one needs-look, one judgment, one info fixture; assert chip glyph, dot class, tag presence, sr prefix, and that the text `warn` / `info` appears nowhere in the row (scan the row with the title node removed so a title containing "info" cannot satisfy or break it) | the word surviving; tag on the wrong kind |
| Published card renders the tag for a judgment code and not for a needs-look code, in both tones, with the expected border class per plate | tag missing on published; wrong border on tinted plate |
| `CompactAlertCard` with and without `sheetLink`, per tone: the anchor renders last in `compact-alert-message` with `ringOffset` from `LINK_PLATE`; without `sheetLink` the row's `className` equals today's literal; `HealthAlertsPanel` and `AttentionBanner` renders unchanged | link in the wrong band; consumers that pass nothing changing |
| `PerShowActionableWarnings` and `NoteWarningCard`: no `Open in Sheet` text and no `NewTabHint` remain; the icon carries the link; `controlsBand` holds controls only; a note card has no controls band | the text link surviving beside the icon; an empty controls band |
| `SheetIconLink` class-token set for the two new `ringOffset` keys (extend `tests/components/admin/sheetIconLink.test.tsx:127` first) and wash steps pinned in `tests/styles/status-token-contrast.test.ts` (surface on warning-bg 1.103 / 1.347; surface on surface-sunken 1.109 / 1.092) | a token edit that makes the press wash vanish |
| `DataQualityWarningControls` labels and announcements per kind and mode, testids unchanged | judgment rows still reading Ignore; testid churn breaking other suites |
| Deferred choice rules (§6.3), one assertion per rule: select non-persisted → `draft` set, Save shown, no action call (spy on the server-action module); select persisted → `draft = null`, clean; Save → `submitted = draft`, `draft = null`, rows and Cancel disabled; Save fails → `draft = submitted`, `submitted = null`, error, still dirty; Save ok → `submitted` kept, accept starts only when active and ignorable; accept fails → refresh requested, partial-success copy, `Accept` retries the accept request only; reconciliation clears `draft` when equal and `submitted` always; Cancel → `draft = null`, focus on the main button; arrow keys select without calling | auto-save surviving; accept on a failed save; the snap-back and dormant-draft defects |
| **Deferred-response probe** (jsdom, React Testing Library): the reading-action promise, the accept promise and the prop update (re-render with a new `decision`) are each controlled by the test and resolved in a chosen order. For every §14 sequence 1 to 7 and 13, assert the checked radio (`aria-checked`), the main button label, and the presence of `Not saved yet` after EACH step. Sequence 1 asserts the checked row is `r` after reading ok, after accept ok, and during the delayed refresh; sequences 4 and 5 assert no `Save` after the external change. Sequence 13 asserts the row stays V (checked `r`, rows `aria-disabled`, no `Save`) after a re-render whose `decision` leaves `persistedRaw` unchanged, then returns to C on the next change. The `router.refresh` mock is a plain spy: the test asserts it was called, never that it completed | the two round-1 defects; any ordering the model does not cover; a regression that clears `submitted` without a prop change |
| Transition audit: every reachable pair in §14 reached, every unreachable one asserted unreachable (S → D, V → D, C → V) | missing state handling |
| Provider absent: `UseRawControl` still saves on tap | fallback regression |
| Published Accepted-list row with a draft: Save calls only the reading action, announces `Reading saved.`, no accept request | re-accepting an accepted row |
| Accepted / Ignored split, wizard and published: judgment rows only in `…-accepted-…`, others only in `…-ignored-…`; each disclosure absent at 0; order Ignored then Accepted; rail and heading counts unchanged from the unsplit partition; published rows carry the report id of THEIR record (fixture with a judgment row between two non-judgment rows in `model.ignored`, asserting each row's `reportSurfaceId`) | report ids misaligned by the split; a disclosure rendering at 0; counts drifting |
| `BulkIgnoreControls` judgment group labels and names; after a bulk accept the cards appear under `Accepted (N)` | chip still saying Ignore; bulk-accepted cards landing in Ignored |
| Include label: `ArchivedTabIncludeButton` (card, Pack list, Resolve box) and `PublishedArchivedTabOffer` render `Use this pull sheet`, accessible name `Use this pull sheet from tab <name>`, pending `Including…`; update the pins listed in §7.3 | a surface keeping an old label |
| `KIND_TO_SECTION` routes both archived-tab codes to `packlist`; `warningsBySection` buckets them there; re-run every suite that imports `KIND_TO_SECTION` (`tests/parser/sectionKind.test.ts`, `tests/parser/fuzz/groundTruth.ts`, `tests/components/admin/review/routedWarningsGate.test.tsx`, `tests/components/admin/review/__fixtures__/reviewSnapshot.ts` consumers, `tests/components/admin/wizard/step3ReviewSections.test.tsx`) | routing missed for the content-changed code; a snapshot that silently assumed Warnings |
| Archived card: lines from the matched tab; fallback split from `rawSnippet`; include button only when in `offers`; POST body equals `ArchivedTabOffer`'s for the same tab (both through `ArchivedTabIncludeButton`) | include on an already-overridden tab; a second POST shape |
| `ArchivedTabOffer` shared pending, regression guard: hold the POST promise, click include, assert `Keep skipped` is disabled and that clicking it does not dismiss the card; reject the promise, assert both buttons re-enable and the error shows | the extraction splitting the offer's single flag (the round-2 defect) |
| Archived card row lock, §14.1: hold the include POST → card Ignore disabled, Report enabled, Ignore click sends nothing; release; hold the Ignore request → include disabled with its idle label, include click sends nothing; N → G and G → N attempts each assert no second request | Ignore racing include on the card; include racing Ignore |
| `ArchivedTabIncludeButton` with `pending` / `blocked` driven by the test: disabled and label per the §15 rows; `onPendingChange` called `true` then `false` on both success and failure; no internal pending state (re-render with `pending={false}` mid-request re-enables it) | the button holding its own flag again |
| Section jump presence: per code, per rendered-section set; `VENUE_ADDRESS_MISSING` never; info rows never; published never | jump on the venue card; jump to an unrendered section |
| Catalog guard: no `AMBIGUITY_CODES` member's `controlsNote` mentions `Ignore` | a future note contradicting the Accept button |
| §9 lockstep: x1 parity (`tests/cross-cutting/codes.test.ts`), `_metaWarningCardCopy`, `hotelAmbiguityCatalogCopy` | one of the six places drifting |
| `Not saved yet` announcement (§15): with a spy on `WarningAnnounceContext`, a pick that makes a published card dirty announces exactly `Not saved yet` once; a repeat pick, a return to the persisted reading and Cancel add nothing; a second clean → dirty pick announces again; a failed Save that restores the draft adds nothing; the wizard row announces through the same channel | a silent pick for screen-reader users; an announcement on every pick or on the rule 3 restore |
| Jump focus (§15, WCAG 2.4.3), on the real staged modal: after `Go to <section>`, `Go to this reservation in Hotels`, its `Go to Hotels` fallback and the marker's `See how we read it`, `document.activeElement` is the section, the hotel card, the Hotels section and the warning card respectively, each with `tabIndex === -1` | a jump that scrolls but leaves focus on the button; a target added to the tab order |
| Unsaved reading guard (§6.5): one test per guard point G1 to G10 (with one dirty row, pressing it opens the prompt and the action has not run); the singular and plural titles; a Save press lowering `N`; a failed Save raising it while open; `Go back` keeping the draft and returning focus to the trigger, also when the press moved no focus (backdrop: the close button); `Discard and continue` clearing the draft then running the action once; each guard point passing through at `N = 0`; `beforeunload` absent at 0, preventing default at `N > 0`, removed on clean and on unmount | an unguarded close, publish, re-scan or re-sync path; a guard that blocks with nothing to lose; a discard that runs the action twice or not at all; a listener left behind |

### 16.2 Real browser (Playwright)

| Test | Why not jsdom |
|---|---|
| §13 DI-1 to DI-11 on the wizard title row | layout and hit-testing |
| §13.2 DI-C1 to DI-C9 on the compact card message row (published harness, plus `tests/e2e/_compactAlertCardLiveEntry.tsx`) | layout and hit-testing |
| Tap floors: every new button (jumps, Save, Cancel, include, marker link) ≥ 44px tall by rect | layout |
| Card → section jump: click `Go to Pack list`, assert the Pack list section top is within 8px of the scroller top after settle and the rail's active item is Pack list | real scrolling |
| Card → reservation and reservation → card: the target element carries `data-step3-warning-flash` and is in view | real scrolling plus flash attribute |
| One full Save flow on the step-3 harness with the action module stubbed: pick, Save, card leaves the active list, focus lands on the panel focus anchor | focus after unmount needs a real document |
| The unsaved-reading prompt (§6.5): both buttons ≥ 44px tall by rect, the panel inside the viewport at 320 and 1280 widths, focus on `Go back` when it opens | layout and focus |

### 16.3 Line-keyed censuses, pinned counts and snapshots to re-derive

Edits shift lines in `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`, `components/admin/UseRawControl.tsx`, `components/admin/PerShowActionableWarnings.tsx`, `components/admin/NoteWarningCard.tsx`, `components/admin/CompactAlertCard.tsx`, `components/admin/DataQualityWarningControls.tsx`, `components/admin/showpage/sectionWarningExtras.tsx`, `components/admin/wizard/archivedTabOffer.tsx` and `components/admin/review/PublishedArchivedTabOffer.tsx`. Re-key by kind and text, never by line arithmetic:

- `tests/styles/tapTargetCensus.ts` (rows at `tapTargetCensus.ts:329`, `tapTargetCensus.ts:540`, `tapTargetCensus.ts:584`), plus rows for every new button and the new Accepted `<summary>` on both surfaces.
- `tests/styles/forcedColorsCensus.ts`: the `PerShowActionableWarnings.tsx:458` row (`forcedColorsCensus.ts:501`, the text link's ring-offset pair) is DELETED with the link; the UseRawControl rows (`forcedColorsCensus.ts:415-426`) and ShowReviewSurface rows re-key.
- `tests/styles/controlOutlineScan.ts` (`controlOutlineScan.ts:200`, `controlOutlineScan.ts:249`, `controlOutlineScan.ts:326-327`).
- `tests/styles/subtleInteractiveExemptions.ts`: the Ignored `<summary>` rows (`subtleInteractiveExemptions.ts:128-144`) re-key, and two new rows register the Accepted `<summary>` (same classes) in `step3ReviewSections.tsx` and `sectionWarningExtras.tsx`.
- `tests/components/admin/sheetIconLinkContainment.test.ts`: call-site counts (`sheetIconLinkContainment.test.ts:1111`, `sheetIconLinkContainment.test.ts:1166`, `sheetIconLinkContainment.test.ts:1266`) gain the second `step3ReviewSections.tsx` site and the new `CompactAlertCard.tsx` site.
- `tests/styles/_metaNewTabAnnouncement.test.ts`: three `NewTabHint` text links removed (wizard row, `PerShowActionableWarnings`, `NoteWarningCard`), two `SheetIconLink` call sites added.
- `tests/styles/noBareRingOffset.test.ts`: the `BACKDROP_SKIN` registration (`noBareRingOffset.test.ts:28`) covers the new keys; re-run.
- `tests/components/admin/__snapshots__/stagedCardBaseline.test.tsx.snap`: the staged review card baseline contains the text link and must be regenerated deliberately, with the diff reviewed to show only the link-to-icon change and the tag.
- Tests that assert the text link or its placement: `tests/admin/perShowActionableRenderControls.test.tsx`, `tests/components/admin/compactAlertCard.test.tsx`, `tests/components/admin/sheetWarningsPanel.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`, `tests/parser/parseWarningDeepLinkRender.test.tsx`.
- Tests that put judgment rows in an ignored fixture and expect them under `Ignored`: re-derive from the list in `tests/` matching `ignored-summary|ignored-warnings|Ignored \(` (for example `tests/components/admin/showpage/sectionWarningControls.test.tsx`, `tests/components/admin/showpage/publishedWarningsPanel.test.tsx`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`); run the grep, do not trust this list.

Re-run each guard after the LAST edit to its file.

---

## 17. Documented limits

| ID | Input | Behavior | Why it is a limit, not a defect |
|---|---|---|---|
| L1 | venue address shapes the §4.2 rule does not read: a combined `VENUE NAME/VENUE ADDRESS` label row (one label naming two fields, so no row resolves to `venue.address`); the horizontal header-table layout (venue fields across one header row, values in the row below); a venue table with no row opening on `VENUE` (the v4 `VENUE NAME`-opened table), which the venue region does not find either | the card links the venue region, or stays link-less when the region is absent too (the same as the region-linked venue siblings) | correct region or no link, never a wrong cell; the 2-column and 3-column scope layouts, which every committed workbook uses, are covered |
| L2 | address under a label we do not read | no `venue.address` alias match → region | the near-miss detector's own `UNKNOWN_FIELD` card carries that row's link |
| L3 | address label recovered by fuzzy correction (`FIELD_LABEL_AUTOCORRECTED`) | exact `resolveAlias` misses → region | same posture |
| L4 | label cell merged across two columns | `absCol0 + i + 1` lands inside the label's merge, on the right row | the link opens the right row; no data is changed |
| L5 | warnings persisted before this change | venue cards stay link-less and inline hotel cards show no `We read` until the next scan or sync | jsonb additive fields appear on re-parse |
| L6 | venue block on a hidden tab | Sheets lands on the last visible tab (the venue anchor, like the venue region, does not filter hidden tabs) | same limit the UNKNOWN_FIELD links carry today |
| L7 | archived-tab card with no matching staged tab | previews come from splitting `rawSnippet` on ` | `; a preview containing ` | ` splits in two | display only |
| L8 | published bulk accept over a card with an unsaved draft | the draft is dropped; the persisted reading is what gets accepted | nothing was saved, nothing is lost that was persisted |
| L9 | wizard Ignore on the archived-tab card | the Pack list and Resolve box offers stay visible (offers derive from tabs, not warnings) | pre-existing wizard behavior; the published surface already hides its offer |
| L10 | `HOTEL_INLINE_GROUP_*` cards | no `We read` line (the emitter records no reading); the reservation jump shows what we read | no parsed data to show truthfully |
| L11 | the reservation marker on the published modal | not rendered | the card already sits in the same Hotels panel there |
| L12 | other `disabled` use-raw reasons (`empty-raw`, `invalid-dmy`, `no-split-to-undo`) | keep their single sentence | out of the brief's subject; revisit if Eric asks |
| L13 | a refresh after a successful Save that never delivers a changed `persistedRaw` (another tab reverted between this tab's Save and its refresh, or the refresh returned identical props) | the radio stays showing, and locked on, the reading this tab submitted, until `persistedRaw` next changes or the review remounts (§14 sequence 13) | conservative: the displayed reading is always one this tab actually sent and the server acknowledged, never one nobody sent; a locked row can save nothing, so nothing is written that the operator did not press; the `Selected` marker (not `In use`) already says crew pages may not match; the window needs two concurrent editors of one warning; a router refresh has no completion signal to key a release on (§6.3 rule 5) |
| L14 | a `CompactAlertCard` message row with a sheet link but no help trigger | grows from about 42px to 44px | the 44px row is the link's tap floor (§3.6) |
| L15 | a client-side navigation that unmounts the review without passing a §6.5 guard point (the browser's Back button inside the app, a link inside the review) | the draft is lost unprompted; `beforeunload` does not fire for an in-app navigation | every control the review itself offers to leave, publish, re-scan or re-sync is guarded (§6.5 G1 to G11); in-app history navigation has no interception point the router exposes |
| L16 | the §6.5 prompt with several unsaved changes | it says how many, not which rows | the drafts stay visible and checked on their rows after `Go back` |

---

## 18. Flag lifecycle

N/A: no config flag, env var or persisted toggle is added. The new booleans are render predicates derived from data and prop presence (§15), each with a stated effect.

---

## 19. Decisions: Eric's answers and the builder's calls

**Eric's answers to round-0 open questions (2026-10-26)**, recorded as R11 to R13 in §1.1:

- **R11, was B1:** the published compact cards also get the sheet icon, at the end of the message row, through `CompactAlertCard` (§3.6). Supersedes `PerShowActionableWarnings.tsx:22-30`.
- **R12, was D3:** accepted judgment rows go in their own `Accepted (N)` disclosure, both surfaces (§6.4).
- **R13, was E3:** one include label, `Use this pull sheet`, on the card, Pack list and the Resolve box (§7.3).

**Chrome**

- **B2. The tag also renders on the published card** (and so on the staged review page, which mounts no controls), because the Accept wording lands on the published card and needs the label to make sense there.
- **B3. sr-only prefixes** (`Needs a look: `, `Note: `) replace what the removed visible word carried for screen readers.
- **B4. Chip glyph and dot ink.** Judgment chip = lucide `Circle` in `text-text-subtle` on `info-bg`; dot = `size-1.5` hollow ring in `border-text-subtle`. `text-faint` fails on `info-bg`, and the 6px dot is a different box and plate from the 8px pill marks, so it does not route through `attentionMarkClass` (and is not mark-shaped for the parity walk, which keys on `size-2`, `tests/components/admin/attentionMarkParity.test.ts:93-94`).
- **B5. Tag look** mirrors the quiet judgment-only pill (sunken fill, ring via `attentionMarkClass("judgment", "sunken")`), not the section header's info-bg "Parsed with judgment" pill (`step3ReviewSections.tsx:1104`), because a ring on info-bg has no verified ink. On the amber card the sunken fill is near-invisible in light mode (1.006:1 against `warning-bg`); the `border-control-outline-tinted` border delineates the tag there.
- **B6. Link accessible name** uses the card title (`stripEmphasis(title)`) as the subject, on every surface. The component's wording is fixed and pinned.
- **B7. Testids:** wizard `…-warning-${i}-open` becomes `…-warning-${i}-sheetlink`; the published card's icon is `per-show-actionable-sheetlink`; the note card keeps `note-warning-sheet-link` on its icon.
- **B8. The shell owns the published `SheetIconLink` call site** (data prop `sheetLink`, not a ReactNode slot), so the four consuming-context requirements live in one file and adapters cannot pass a link with the wrong positional classes. `SheetIconLink` gains `warning-bg` and `surface-sunken` backdrops, each washing to `bg-surface` (measured steps in §3.6), the same neutral-step rule its header states (`SheetIconLink.tsx:64-69`).
- **B9. The AttentionBanner alert action link stays text** (`AttentionBanner.tsx:179-195`): a label-driven alert action, not the warning card's sheet link. Class-sweep exception (a): changing alert actions is a product decision R11 did not make. **Open question for Eric** if he wants it.

**Hotel**

- **C1. Storage name `readAs`** on the non-resolvable resolution variant, not a top-level field and not `parsed`.
- **C2. One render path:** the comparison lives in `UseRawControl`'s `disabled` branch, scoped to `HOTEL_GUEST_SPLIT_AMBIGUOUS`, so both surfaces get it from one change.
- **C3. "Sheet says" is verbatim** (whitespace-collapsed), not confirmation-stripped. Precedent: the wizard Ignored list already shows the raw snippet (`ignoredRowSnippet`, `step3ReviewSections.tsx:3009-3017`). Stripping would make "Sheet says" untrue, the same honesty argument that renamed the raw choice to "The whole cell as one guest" (`UseRawControl.tsx:467-478`). The crew-readable rule governs persisted names, which this does not touch.
- **C4. The reservation marker** covers all four index-carrying hotel judgment codes (class sweep), renders on the staged wizard only, and shows one "Sheet says" line from the lowest-index member; the jump flashes every member.
- **C5. Help text** adapts the mockup's example: "If we split it wrong" instead of "If that split is wrong" (the text sits above the comparison on the wizard and inside the guidance line on published, so "that" has no referent in either), and it keeps "someone left out", a case the ratified copy covers today (`tests/messages/hotelAmbiguityCatalogCopy.test.ts:48-50`).
- **C6. Callout label** "See how we read it" only when `readingShown` holds for every grouped member, decided per warning (a use-raw code whose resolution is unusable shows no reading); otherwise "Review in Sheet warnings".

**Accept and Save**

- **D1. Accept covers all seven judgment codes** on both surfaces, including the bulk chip and the Accepted-list button (`Undo accept`). Testids stay keyed on the mechanism.
- **D2. Selection plumbing** is a per-row context provider plus one extracted action caller (§6.3). The provider-less fallback keeps immediate save and is unreachable in production.
- **D4. Markers:** the persisted reading keeps its marker while unchecked during a draft; a submitted reading awaiting reconciliation shows `Selected`; the hint lives in the action row and describes Save.
- **D5. Save order** is reading first, then accept; partial success refreshes and says the reading is saved.
- **D6. Arrow keys select without writing**, a direct consequence of R6.
- **D7. Apostrophes follow the host file:** ASCII `'` in new `DataQualityWarningControls` and `BulkIgnoreControls` strings (matching `Couldn't ignore`, `DataQualityWarningControls.tsx:120`), `&rsquo;` in `UseRawControl` JSX (`UseRawControl.tsx:592`), `’` in `archivedTabOffer.tsx` strings (`archivedTabOffer.tsx:183`). A REUSED string keeps the apostrophe it ships with, so the reused "That didn’t save" sentence stays typographic when the action bar renders it. Copy assertions are apostrophe-agnostic (precedent `tests/components/step3SheetCard.test.tsx:491`).
- **D8. The reading model** is the two-state model (`draft`, `submitted`) the coordinator specified, with `submitted` clearing only on a `persistedRaw` change or a failed Save. One addition is the builder's: radio rows stay soft-disabled while `submitted !== null`, so a select can never land invisibly. The residual of the no-completion-signal router is L13.
- **D9. Disclosure order** is Ignored then Accepted, matching the attention menu's group order; each disclosure renders only at a count above zero.
- **D10. The published split filters records, not warnings,** so every row keeps its own `reportSurfaceId` (§6.4).

**Archived pull sheet and sections**

- **E1. Route `pull_sheet_archived_tab` to `packlist`.** It gives the card its "Go to Pack list" from the existing routing instead of a special case, flags the section the warning is about, and on published places the card beside the published include offer, which removes the need for a published card-level control. Consequences in §7.2.
- **E2. Extract `ArchivedTabIncludeButton`** instead of nesting the whole `ArchivedTabOffer` card inside the warning card (a card in a card, duplicating the title and previews). After R13 it owns the label; there is no `label` prop. It owns no pending state: each placement's parent owns the flag and passes `pending` / `onPendingChange` (and the card row a `blocked` lock both ways), so `ArchivedTabOffer`'s single flag still disables `Keep skipped` during an include (§7.3, §14.1).
- **E10. Report is exempt from row locks** (the archived row and the §6.3 action bar): it writes nothing any lock protects, `ReportButton` has no disabled state, and Report already stays enabled while Ignore runs today.
- **E4. Fix both "Gear section" rows** (class sweep), not only the one the brief named.
- **E5. Jumps are warn-row only, staged only,** one per card, with the venue exclusion keyed on the one code Eric named.
- **E6. The venue value cell** comes from the venue grid block itself (R14): the row whose label at column 0 or 1 resolves to `venue.address`, value column `absCol0 + i + 1`, linked only when that row is unique and its value is empty. The round-0 derivation from the UNKNOWN_FIELD anchor scan was dropped because that scan skips the 3-column layout's blank-col0 rows (`lib/drive/unknownFieldAnchors.ts:81`), which is every committed workbook that raises the warning.
- **E7. The published Pack list offer joins R13** (`Include this gear` becomes `Use this pull sheet`): same action, same section, so the class-sweep default applies though the decision text names the staged button.
- **E8. Pending text stays `Including…`** on every surface: it names the system action (include) the catalog copy also uses, and a third verb would add nothing.
- **E9. One accessible-name format** for the include button: `Use this pull sheet from tab <name>` while idle (sr-only suffix), `Including…` while pending, replacing the published `aria-label` so the visible label is always the start of the name.

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
| Compact row link spacing | `gap-2.5` (10px) + `ml-3` (12px) = 22px heading side; `mr-0.5` (2px) + `p-3` (12px) = 14px trailing | `CompactAlertCard.tsx` (§3.6) |
| Help trigger overlay | 11px each side (existing) | `components/admin/HoverHelp.tsx:555` |
| Venue address label columns | `i` in `[0, 1]` (2-column, 3-column scope rows); value column `absCol0 + i + 1` | lib/drive/venueAddressAnchor.ts (new file) (§4.2) |
| Venue block header | `REGION_ANCHOR_SPEC.venue.header` (`/^VENUE$/i`), read, never retyped | `lib/sheet-links/buildSheetDeepLink.ts:126-131` |
| `ARCHIVED_TAB_INCLUDE_LABEL` / `ARCHIVED_TAB_INCLUDE_PENDING` | `Use this pull sheet` / `Including…` | `archivedTabOffer.tsx` (§7.3) |

Counts stated in prose and their sources: seven judgment codes = `AMBIGUITY_CODES` (`lib/parser/ambiguityCodes.ts:19-27`); four radio codes = `USE_RAW_CODES` (today `IN_SCOPE`, `UseRawControl.tsx:55-60`); four hotel reservation codes (§5.1); three catalog rows (§9); six lockstep places (§9 table); three warning text-link sites (§2); four `CompactAlertCard` consumers (§3.6); two disclosures per surface (§6.4); five transition states (§14). Tests derive these from the named sets, never from the literals in this document.

Out-of-scope claims to keep consistent: the AttentionBanner alert link (§2, B9); compact-card consumers without `sheetLink` (§1.3, DI-C2); published reservation marker (§5.4, L11); the ignored partition and its counts (§1.3, §6.4); published archived card control (§7.4, E1). Round-1 sweep: every place that derived the checked row or dirtiness now uses §6.3's model (§6.3, §12, §14, §15, §16.1); every mention of the include label reads `Use this pull sheet` (§1.1, §7.3, §11, §16.1, §19); every Ignored-list mention of judgment rows now points at the Accepted list (§6.2, §6.4, §12, §16.1). Round-2 sweep: every sibling that shares a pending or running state is stated with its owner (the use-raw provider's busy, §6.3; the archived row's two flags, §7.3, §14.1; `ArchivedTabOffer` and `PublishedArchivedTabOffer` keep one flag each); nothing in the spec keys on refresh completion (§6.3 rule 5, §14 sequence 13, L13). Plan round-5 oracle amendment: the E → D row claimed a select from E over D stays D; a reference model of §6.3 rules 1-6 shows the only selectable row there is the persisted one, which rule 1 returns to C, so E → D is reachable from E over C only and the E → C row gains that select (§14 table). R14 amendment sweep: every mention of the venue lookup now names the venue-block anchor and no longer the UNKNOWN_FIELD scan (§1.1 R14, §1.4, §4.1, §4.2, §15, §16.1, §17 L1, L4, L6, §19 E6); the venue code stays in `LINK_ONLY_ANCHORED` and nowhere else (§4.2 item 1). R15 amendment sweep (2026-10-30): the unsaved-reading guard is stated once, in §6.5, and every other section points at it (§1.1 R15, §11 copy row, §15 guard rows, §16.1 and §16.2 rows, §17 L15 and L16); no other section's behavior changes, and with `N === 0` every guarded control is byte-for-byte today's behavior.
