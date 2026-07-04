# Step-3 "Review & publish" page redesign — Variant B

**Date:** 2026-07-04
**Status:** Spec (autonomous ship)
**Design mock:** `docs/superpowers/specs/2026-07-04-step3-review-page-variant-b-mock/` (snapshot of Claude Design project `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd`, file `Step 3 Review - Publish (B).html`).
**Owner routing:** UI surface → Opus + impeccable v3 (AGENTS.md routing hard rule).

---

## 1. Summary & scope

Redesign the onboarding-wizard **Step-3 page shell** to the ratified Variant-B mock. The Step-3 review **modal** (`Step3ReviewModal`) is already implemented and shipped (PR #280 + follow-ups) and is **out of scope** — this feature restyles only the page that lists the parsed sheets and hosts the publish action.

Four visible changes, full-fidelity, reconciling every real state:

1. **Stepper** — redesign the shared `StepIndicator` (numbers-only pills → pill + visible label + connector line + completed-check). Affects Steps 1–2 too (shared component).
2. **Header** — `h1` "Review what we found" + a **composed summary line** driven by real counts (pluralized, guard-branched).
3. **Sheet list** — replace the responsive grid of expandable `Step3SheetCard`s with a **single-column list of compact row-cards** (checkbox + title/meta + right cluster). Clean-with-warnings → warn chip + **Review**; clean-no-warnings → **View**; both open the existing modal. Inline card expansion is dropped (detail lives in the modal). The stale-review no-checkbox variant is preserved.
4. **Sticky publish bar** — a bottom bar with the live selected-count + **Back** + the primary **Publish** action, re-homing the existing `FinalizeButton` (full behavior preserved). Step 3 drops the top Back (moves into the bar); Steps 1–2 keep the top Back.

Plus edge-case reconciliation: **Needs your attention** (blocking), **set-aside** (ignored/deferred/skipped), and the **empty** state are restyled into the new idiom (testids preserved).

### In scope
View-layer only: `components/admin/OnboardingWizard.tsx` (StepIndicator, BackLink placement, Step-3 container width), `components/admin/wizard/Step3ReviewWithFinalize.tsx` (page frame + sticky bar), `Step3Review.tsx` (header + list + edge sections), `Step3SheetCard.tsx` (grid card → compact list card), and the `FinalizeButton` re-home (behavior unchanged). Test updates for every changed DOM contract.

### Explicitly OUT of scope (do NOT relitigate)
- The **modal** (`Step3ReviewModal`, `step3ReviewSections.tsx` section bodies) — already shipped; unchanged except being opened from the new Review/View buttons.
- The **finalize server contract** — `/api/admin/onboarding/finalize`, `/finalize-cas`, the NDJSON streaming protocol, advisory locks, RPCs, DB schema. Zero backend change (§13).
- Adding a **green/success color** — the design system has **no success token** (`app/globals.css` @theme has only `--color-warning-bg/-text`, `--color-info-bg`, and `--color-status-{live,positive,review,warn,idle}` dots; `StatusIndicator` `components/admin/StatusIndicator.tsx:15`). The mock's green stepper-check and green "clean" chip are **intentionally not** reproduced; done/ready use neutral treatment + the sanctioned `status-review`/`warning` hues for the needs-a-look signal only. This is a ratified deviation (§6).
- Doug-facing **copy semantics** already governed by `lib/messages/lookup.ts` — reused verbatim (invariant 5).

---

## 2. Design source → live-code mapping

| Mock element (`step3-app.jsx` / `step3.css`) | Live target | Notes |
| --- | --- | --- |
| `Stepper` (labels *Share folder · Verify · Review & publish*) | `StepIndicator` `OnboardingWizard.tsx:94-153` | Shared; keep props `{step, maxReachedStep}`, testids, Link/span reachability. |
| `.wizhead h1` + `p` summary | `Step3Review` header `Step3Review.tsx:929-993` | Replace eyebrow/h2/subhead copy; compose summary from counts. |
| `.sheetcard` `StarCard` (warn border, chip, **Review**) | clean `Step3SheetCard` **with** `summarizeDataGaps(warnings).total > 0` | `Step3SheetCard.tsx:342-345`. |
| `.sheetcard` `OtherCard` (ghost **View**) | clean `Step3SheetCard` with `total === 0` | — |
| `.sc-check` | existing publish checkbox `wizard-step3-checkbox-${driveFileId}` `Step3SheetCard.tsx:115` | lifted optimistic state, unchanged. |
| `.sc-title` + `.sc-meta` (client · dates · venue) | `pr.show` fields | client `pr.show.client_label` (`Step3SheetCard.tsx:348`), dates `dateSummarySegments(pr.show.dates)` (`:349`), venue `venueDisplay(pr.show.venue).name` (`:359`). |
| Review/View button → modal | existing `Step3ReviewModal` open (`Step3SheetCard.tsx:517-570`) | mount-on-open unchanged. |
| `.wizbar` (count + Back + Publish) | new sticky bar in `Step3ReviewWithFinalize.tsx` wrapping `FinalizeButton` | `FinalizeButton.tsx:117-545` behavior preserved. |

---

## 3. Component architecture & DOM order

Route: `app/admin/page.tsx:200-212` → `OnboardingWizard` → (`step===3`) `Step3Container` (`OnboardingWizard.tsx:501-503`) → `Step3ReviewWithFinalize` → `Step3Review` + `FinalizeButton`.

**Server (`OnboardingWizard`)** keeps the top chrome:
- `StepIndicator` (redesigned) — always.
- `BackLink` — rendered when `step === 2` only (was `step !== 1`). **Step 3 no longer renders the top Back**; it moves into the sticky bar. `OnboardingWizard.tsx:492-495`.
- Step-3 container width unchanged (`max-w-2xl lg:max-w-6xl` → **narrow to `max-w-3xl`** for the single-column list; the wide grid is gone — see §5). Update the comment at `OnboardingWizard.tsx:481-485`.

**Client (`Step3ReviewWithFinalize`)** becomes the page frame:
```
<div class="relative flex min-h-… flex-col">           (positioning context for the sticky bar)
  <Step3Review …/>            ← scrollable body: header + needs-attention + list + set-aside
  <Step3PublishBar>           ← NEW sticky bottom bar (rendered when rows.length > 0)
     count (live)  ·  spacer  ·  Back(→step 2)  ·  <FinalizeButton …/>
  </Step3PublishBar>
</div>
```
`Step3Review` no longer renders the finalize CTA itself (it never did — the button lives in the wrapper). The bar's live count uses the existing `onCountsChange` overlay (`Step3ReviewWithFinalize.tsx:45-52`).

**`Step3PublishBar`** is a new presentational client component (`components/admin/wizard/Step3PublishBar.tsx`). It owns layout/stickiness only; the publish state machine stays entirely inside the re-homed `FinalizeButton` (no state lifted, no split of its `state`). See §5.4 for how running/terminal surfaces coexist with the thin bar.

---

## 4. Section specs

### 4.1 Stepper (shared `StepIndicator`)

Redesign `StepIndicator` (`OnboardingWizard.tsx:94-153`) from numbers-only pills to **pill + visible label + connector**, preserving all behavior.

**Per-step visual states** (3 steps: 1 Share folder, 2 Verify, 3 Review & publish):
- **done** (`n < step`): pill shows a `Check` glyph (lucide, `size-3.5`, `aria-hidden`); pill `bg-surface border border-border-strong text-text-subtle`; label `text-text-subtle`. (Neutral — no green; §6.)
- **active** (`n === step`): pill `bg-accent text-accent-text` (unchanged token); label `text-text-strong font-semibold`.
- **todo, reachable** (`n > step && n <= maxReachedStep`): `<Link>` pill `bg-surface-sunken text-text-subtle hover:text-text-strong`; label `text-text-subtle`.
- **todo, unreached** (`n > maxReachedStep`): `<span aria-disabled>` pill `bg-surface-sunken text-text-faint`; label `text-text-faint`.
- **connector** between pills: `h-px flex-1` line, `bg-border-strong` when the pill to its **left** is done, else `bg-border`. Max width matches mock (`max-w-[60px]` desktop; connectors may hide `< sm` — see dimensional invariants).

**Reachability / nav / a11y — unchanged:** reachable pills stay `<Link href="/admin?step=${n}">`; unreached stay non-interactive `<span>`. Keep `data-testid="wizard-step-indicator"`, `wizard-step-indicator-${n}`, `aria-current="step"`, the direction-aware `aria-label`s, and the sr-only `Step {step} of 3`. `aria-label="Onboarding progress"` on the `<nav>`.

**Labels** are new visible text. Labels array `["Share folder","Verify","Review & publish"]`. On very narrow screens (`< sm`) labels for **non-active** steps hide (`hidden sm:inline`), the active label always shows, so the row never overflows (dimensional invariant DI-1).

Guard: `step`/`maxReachedStep` are typed `1|2|3`; no null path. An out-of-range value cannot occur (server-derived), but the map over `[1,2,3]` is total (every n gets exactly one branch).

### 4.2 Header + composed summary

Replace the current eyebrow + `h2 "Review & publish your sheets"` + subhead (`Step3Review.tsx:929-965`) with:
- `h1` **"Review what we found"** (`data-testid="wizard-step3-heading"`, keep `id` for `aria-labelledby`; bump `h2`→`h1`, `text-2xl font-semibold` retained or `text-2xl sm:text-[28px]` per mock scale). Keep the existing `HelpTooltip` beside it (`Step3Review.tsx:941-960`) verbatim.
- Drop the "Step 3 of 3" eyebrow **text** (`wizard-step3-eyebrow`, `Step3Review.tsx:930-936`) — the redesigned stepper now names the step visibly. Removing the eyebrow requires updating any test asserting `wizard-step3-eyebrow` (§9).
- **Composed summary** `<p data-testid="wizard-step3-summary">` (renamed from the static subhead) — see the copy catalog below.

**Count definitions** (all derived from `rows: Step3Row[]`, filters only — never NaN; the partition mirrors the live `publishRows`/`selectableRows` split at `Step3Review.tsx:644-655`):
- `cleanRows` = `publishRows` = rows with `staged | applied` (`isCleanRow`, `Step3Review.tsx:500-502,644`).
- `selectableRows` = `publishRows.filter(hasReviewablePreview(r) && !r.lastFinalizeFailureCode)` (`Step3Review.tsx:653-655`) — the only rows with a real checkbox / publish-intent.
- `noDetailsRows` = clean rows with **no reviewable preview** (`!hasReviewablePreview` — `parseResult` null/`!pr.show`); rendered as the "couldn't read" card (`data-no-details`, `Step3SheetCard.tsx:308-320`). No checkbox, no Review/View, excluded from `selectableRows`.
- `demotedRows` = clean rows with `lastFinalizeFailureCode != null` (`isFinalizeDemoted`, `Step3SheetCard.tsx:237`); checkbox suppressed, "review before publishing" banner + re-apply, excluded from `selectableRows`.
- `blockingRows` = `hard_failed | live_row_conflict | discard_retryable` (`BLOCKING_STATUSES`, `Step3Review.tsx:614-619`).
- `skippedRows` = `skipped_non_sheet`.
- **ready** = a **selectable** row with `summarizeDataGaps(stripLegacyUnknownFieldAnchors(arr(pr.warnings))).total === 0`. `readyCount` = count of those.
- **needs a look** = every clean row that is not ready: `needsLookCount = cleanRows.length − readyCount` (i.e. selectable-with-warnings + `demotedRows` + `noDetailsRows`). Each such card shows its specific state; the headline groups them.
- `blockingCount = blockingRows.length`; `sheetCount = rows.length − skippedRows.length` (skipped are "not a Google Sheet", excluded from "sheets parsed").

**Verb/noun agreement** (the mock reads "1 **needs** a quick look"): nouns use `n===1?"":"s"` ("sheet"/"sheets"); the verb "need" is the inverse — `needsVerb = n===1 ? "needs" : "need"`, and the pronoun clause is `n===1 ? "it goes" : "they go"`. Never emit "1 need".

**Copy catalog** (plaintext; no raw codes; `n===1 ? "" : "s"` pluralization; "needs a look" span uses `text-warning-text`):

| Condition | Rendered summary (`wizard-step3-summary`) |
| --- | --- |
Let `cleanCount = cleanRows.length` (= `readyCount + needsLookCount`).

| `rows.length === 0` | *(no summary paragraph — the empty card at §4.5 renders instead)* |
| `cleanCount === 0` (only blocking / set-aside) | "**{sheetCount} sheet{s}** parsed from your Drive folder." *(readiness clause omitted; blocking handled by the resolution line below)* |
| `cleanCount > 0`, `needsLookCount === 0` | "**{sheetCount} sheet{s}** parsed from your Drive folder. **All {readyCount} ready** to publish. Nothing publishes until you say so." |
| `cleanCount > 0`, `needsLookCount > 0`, `readyCount > 0` | "**{sheetCount} sheet{s}** parsed from your Drive folder. **{readyCount} ready** to publish — *{needsLookCount} {needsVerb} a quick look* before {needsLookCount===1?"it goes":"they go"} live. Nothing publishes until you say so." |
| `cleanCount > 0`, `readyCount === 0` (all clean need a look) | "**{sheetCount} sheet{s}** parsed from your Drive folder. *{needsLookCount} {needsVerb} a quick look* before {needsLookCount===1?"it goes":"they go"} live. Nothing publishes until you say so." |

where `needsVerb = needsLookCount===1 ? "needs" : "need"` (so the singular reads "1 **needs** a quick look before it goes live"). `sheetCount` guard: if only skipped rows exist, `sheetCount===0` → "**0 sheets** parsed…" reads fine and the Skipped set-aside section explains them; the `cleanCount===0` branch applies (no readiness clause).

**Resolution status line** (`wizard-step3-resolution-status`, `Step3Review.tsx:982-992`) — keep verbatim, including `data-all-resolved` / `data-unresolved-count` / `data-blocking-count` attributes (wizard chrome + tests depend on them). Its copy already handles the blocking case ("Clear the sheets under Needs your attention to finish setup.").

### 4.3 Sheet-card list (`Step3SheetCard` → compact list card)

The publishable clean rows render as a **single-column list** (`<ul data-testid="wizard-step3-card-grid">` — keep the testid; change classes from grid to `flex flex-col gap-3`). The comment at `Step3Review.tsx:1046-1053` is rewritten (no more multi-column grid).

Each clean row is a compact card (`Step3SheetCard`), **one row of content**:

```
[checkbox] [ title                                    ] [chip?] [Review|View]
           [ client · dates · venue                   ]
```

- **checkbox** — `wizard-step3-checkbox-${driveFileId}` (`Step3SheetCard.tsx:115`), lifted optimistic `checked`/`onToggleChecked`, unchanged. `applied` rows render checked (existing rule).
- **title** — plain text (NOT a link): `pr.show.title ?? row.stagedShowTitle ?? row.driveFileName ?? row.driveFileId`. New testid `wizard-step3-card-${dfid}-title`. The old **`-title-link`** anchor to the sheet is **removed** from the card face (the "open in Google Sheet" affordance already lives in the modal header). `Step3SheetCard.tsx:152`.
- **meta line** — `client · dates · venue`, segments joined by a `·` separator, **each segment omitted when absent** (never an empty segment or a dangling dot): client `pr.show.client_label` (testid `-client`), dates `dateSummarySegments(pr.show.dates).join(" · ")` (testid `-dates`), venue `venueDisplay(pr.show.venue).name` (testid `-venue`). City is folded away (dropped from the card face; still in the modal). If **all three** are absent, render nothing (no meta line).
- **right cluster** — depends on the row variant:
  - **selectable, data-gap warnings** (`total > 0`): a chip (`data-testid="wizard-step3-card-${dfid}-review-chip"`) = `bg-status-review` dot + `bg-warning-bg text-warning-text` pill (dot + text paired, DESIGN.md §1.3), label **"{total} {total===1?'needs':'need'} a look"**; **+ a "Review" button**.
  - **selectable, no warnings** (`total === 0`): a **"View" button** only, no chip.
  - **demoted / stale-review** (`lastFinalizeFailureCode != null`, see below): a chip with the **non-numeric** label **"Needs another look"** (`bg-status-review` dot; NO count — a demoted row can have `total === 0`, so a numeric chip would render "0"); the card carries the existing banner + re-apply; button label "Review". No checkbox.
  - **no-details** (`!hasReviewablePreview`, see below): no chip and **no Review/View button** (there is no modal to open); the "couldn't read" copy is the card body.
- **Button treatment (accent-budget safe):** neither Review nor View is a filled-accent CTA. **View** = `ghost` (`text-text-subtle hover:bg-surface-sunken`); **Review** = `outline` (`border-border-strong bg-surface text-text-strong`). The single filled-accent CTA on the page stays the **Publish** button in the bar (plus the one active step pill and checked checkboxes), keeping accent ≤10% (DESIGN.md:11) even for an unbounded list of Review rows. The warn signal is carried by the chip, not an accent fill.
- Button testid stays `wizard-step3-card-${dfid}-more` (modal-open trigger, `Step3SheetCard.tsx:517-530`); **visible label** becomes "Review" (has warnings/demoted) / "View" (no warnings). Opens `Step3ReviewModal` (mount-on-open, `:548-570`) unchanged. Absent on the no-details card.
- **Card border**: warn-tinted `border-border-strong` when needs-a-look (warnings/demoted); neutral `border-border` otherwise. (No warn-*border* token exists; use `border-border-strong` per §6.)

**Removed from the *selectable* card face** (detail now lives in the modal): the collapsed `<dl>` summary (`-summary`, `-dates`/`-venue`/`-city` in the dl form — note `-dates`/`-venue` are **re-added** on the compact meta line above, `-city` dropped), the per-class data-gap chips (`-data-gaps`, `-data-gap-${key}`), the `Diagrams ✓` / `Reel ✓` badges (`-badge-diagrams`, `-badge-reel`), and the standalone `-publish-live` label. The `-title-link` anchor is dropped **from the selectable card** (title → plain `-title` text) but **retained on the non-selectable variants** (no-details `Step3SheetCard.tsx:316` and demoted `:397`, which keep `SheetTitleLink`). Each removal drives a test update (§9). The **rescan** affordance (`wizard-step3-rescan-review-${dfid}`, `Step3SheetCard.tsx:196`) is retained on the demoted/stale-review variant.

**Demoted / stale-review variant** (`isFinalizeDemoted` = `row.lastFinalizeFailureCode != null` — **any** finalize-failure code, not only `RESCAN_REVIEW_REQUIRED`; `Step3SheetCard.tsx:230-240`): checkbox **suppressed**; card shows the existing "review before publishing" banner (verbatim copy at the current `Step3SheetCard.tsx:178-201`) + Review button + rescan (`wizard-step3-rescan-review-${dfid}`). Chip = the non-numeric "Needs another look" (never a "0"). Contributes **0** to `readyCount`/publish-intent (already excluded from `selectableRows`). Warn treatment.

**No-details variant** (`!pr || !pr.show` → `!hasReviewablePreview`; the current `data-no-details` card at `Step3SheetCard.tsx:308-320`): **no checkbox, no chip, no Review/View button/modal** (there is nothing to review). Card body = the title (via `SheetTitleLink`, which retains the `-title-link` testid) + the verbatim "We couldn't read the details of this sheet." warn copy. Excluded from `selectableRows` and from `readyCount`; folds into `needsLookCount` for the headline. Neutral-warn card. Restyle to the compact list idiom (`data-no-details` attribute + `-summary` testid preserved).

### 4.4 Sticky publish bar (`Step3PublishBar` + re-homed `FinalizeButton`)

A new bottom bar, `position: sticky; bottom: 0`, full-width within the Step-3 container, `bg-surface/88 backdrop-blur border-t border-border`, `z`-above content, safe-area padding on mobile. Rendered by `Step3ReviewWithFinalize` when `rows.length > 0` (matching the current `FinalizeButton` render guard `:53`).

**Idle row layout:** `[ "<b>N</b> of <total> selected to publish" ]  [spacer]  [Back]  [FinalizeButton primary]`.
- **count** — `data-testid="wizard-step3-publish-count"` **moves here** from the header select-all block (`Step3Review.tsx:530,561`). It reads `<b>{selectedCount}</b> of {selectableTotal} selected to publish`, `tabular-nums`. **These must come from `selectableRows`, NOT from the existing `publishCount`/`uncheckedCleanCount`** — the current `onCountsChange` overlay reports over `publishRows` (so `publishCount + uncheckedCleanCount == publishRows.length`, *including* demoted/no-details rows per `Step3Review.tsx:811-817`), whereas the header's "N of M" already uses `selectableRows` (`appliedCount`/`cleanCount`, `Step3Review.tsx:805-806`). So: **extend `Step3PublishCounts` (`Step3Review.tsx:105-108`)** with two fields sourced from the already-computed selectable counts — `selectableTotal = cleanCount (= selectableRows.length)` and `selectedCount = appliedCount (= selectableRows.filter(isChecked).length)`. The FinalizeButton's existing `publishCount`/`uncheckedCleanCount` (over `publishRows`) are **unchanged** (its "Publish N shows" label and finalize behavior keep their current semantics). Guard: `selectableTotal === 0` → "0 of 0 selected to publish" (bar still shows; Publish disabled by `finishable`). **Select-all** stays in the header (§4.2 note) — the bar shows the count only, not the select-all control. The header's `Step3PublishHeader` (`Step3Review.tsx:519-561`) is refactored to render select-all **without** the count (the count's two current sites there are removed; the moved testid is single-sourced in the bar).
- **Back** — a `<Link href="/admin?step=2" data-testid="wizard-step3-back">` styled ghost, `ChevronLeft` + "Back". (Distinct testid from the top `wizard-back-link`, which is absent on step 3.) Same read-only safety as `BackLink` (§ `OnboardingWizard.tsx:156-160`).
- **FinalizeButton** — re-homed **unchanged in behavior**: same props (`wizardSessionId`, `disabled={!finishable}`, `publishCount`, `uncheckedCleanCount`), same idle label "Publish N shows & finish setup", same soft-confirm, NDJSON streaming, race_row / cas_per_row / error / complete states, focus management, SR announcer, all testids (`wizard-finalize*`). Only its **container and idle-button chrome** adapt to the bar (`size="lg" inline selfStart shadow` already bar-friendly).

**Running / terminal coexistence with the thin bar** (design decision, §1 approved): today `FinalizeButton`'s root is `<div class="flex flex-col gap-3">` rendering, in order, `[sr-announcer] → [button|ProgressPanel] → [confirm] → [race] → [cas] → [error] → [complete]` (`FinalizeButton.tsx:422-543`) — i.e. its transient/terminal panels render **below** the trigger. A wrapper alone therefore **cannot** float those panels above the count/Back/Publish row. Getting the mock's "panels above the bar" requires a **layout-only** change to `FinalizeButton`. The change is explicitly bounded to presentation:

- **Preserved verbatim** (do NOT touch): the `ButtonState` state machine, `runLoop`/`readFinalizeBatch`/`readFinalizeCas`, the fetch/NDJSON streaming contract, `completedRef`/`grandTotalRef`, focus effects (`panelRef`/`alertRef` + the `useEffect` keyed on `state.kind`), every `role`/`aria`/`data-testid`, the soft-confirm dialog + its focus trap, and all copy.
- **May change**: only the root container's child **order/placement** so panels sit above the trigger — via an optional prop (e.g. `panelPlacement?: "above" | "below"`, default `"below"` = current behavior; the bar passes `"above"`) implemented as a CSS/order-only concern (`flex-col-reverse` on the root reverses the visual stack — the hidden sr-announcer's position is immaterial), OR the equivalent explicit reordering. This is view-layer, keeps `FinalizeButton.test.tsx` green (testids unchanged), and is the ONLY edit to the component.
- **Acceptable fallback** (if `"above"` proves risky under impeccable/adversarial review): keep the natural order (panels below the trigger) with the bar growing upward from the bottom edge — the operator is mid-publish/committed, so a downward-growing panel under a bottom-sticky bar is the failure mode to avoid, which either ordering prevents because the bar is bottom-anchored and its content lays out within the viewport. The plan picks one during implementation and pins it with the DI-3 real-browser assertion (§7).

`Step3PublishBar` composes `[count][spacer][Back][<FinalizeButton panelPlacement="above"/>]` in an `items-end` row so the trigger baseline aligns with the count/Back while panels stack upward over the button column. No `FinalizeButton` state is lifted or split.

### 4.5 Edge-case reconciliation

- **Needs your attention** (`wizard-step3-needs-attention`, `Step3Review.tsx:1016-1044`) — keep the section, heading, description, per-row `RowItem`s, and all child testids (`wizard-step3-row-*`, `wizard-step3-retry-*`, `wizard-step3-ignore-*`, `wizard-step3-conflict-dashboard-*`). Restyle the plate to the new idiom: `rounded-lg border border-border-strong bg-surface-sunken p-tile-pad`, warn `AlertTriangle` + heading, rendered **above** the clean list (unchanged order). Blocking rows have **no checkbox** and are **excluded** from `publishCount`/`selectableTotal`.
- **Set-aside** (`wizard-step3-ignored` / `-deferred` / `-skipped`, `Step3Review.tsx:1083-1108`) — keep sections + testids + copy; restyle each `SetAsideSection` card to the quiet recessed idiom (`bg-surface-sunken`, lighter title), rendered **below** the list.
- **Empty state** (`wizard-step3-empty`, `Step3Review.tsx:995-1005`) — keep testid + copy; restyle the card. When empty, the sticky bar and summary paragraph are **not** rendered (bar guard `rows.length > 0`).

---

## 5. Layout & responsive

- **Container width:** Step-3 narrows from `max-w-2xl lg:max-w-6xl` to **`max-w-3xl`** (single column, no grid). `OnboardingWizard.tsx:485`.
- **List:** `flex flex-col gap-3`, one column at all widths. **No item cap** — the list is unbounded and grows with the number of parsed sheets; it lives in the normal page scroll (the `appscroll`-equivalent), so a large folder scrolls rather than truncates. No "+N more" affordance (unlike the modal's per-section previews); every sheet is always listed so none is silently hidden from the publish decision.
- **Card:** `flex items-center gap-4`; on `< sm`, the right cluster wraps to a second row (`flex-wrap`, `sc-right` becomes full-width `justify-between`) so the title never wraps per-word (mock `step3.css` `@media(max-width:640px)`).
- **Sticky bar:** full-width, `sticky bottom-0`; body gets bottom padding (`pb-28` / space for the bar) so the last card isn't occluded. On mobile the bar stacks (count row above the button row if needed) and respects `env(safe-area-inset-bottom)`.
- **Stepper:** connectors `flex-1 max-w-[60px]`; non-active labels `hidden sm:inline`.

---

## 6. Token usage (sanctioned only)

| Purpose | Token / utility | Source |
| --- | --- | --- |
| Active step pill, primary CTA | `bg-accent text-accent-text` | globals.css:56-58 |
| Accent hover | `bg-accent-hover` | globals.css:57 |
| Neutral surfaces | `bg-surface`, `bg-surface-sunken`, `bg-surface-raised` | :47-49 |
| Borders | `border-border`, `border-border-strong` | :54-55 |
| Needs-a-look chip / warn plate | `bg-warning-bg text-warning-text` pill + a `bg-status-review` dot | globals.css:61-62; `bg-status-review` utility globals.css:88 / `StatusIndicator.tsx:18` |
| Info / set-aside quiet | `bg-surface-sunken text-text` (info tone) | toneClasses `Step3Review.tsx:156-163` |
| Radii | `rounded-sm/md/lg/pill` (6/12/16/999) | :189-192 |
| Shadow | `shadow-(--shadow-tile)` | :231 |
| Spacing | `p-tile-pad`(20) `gap-section-gap`(32) `min-h-tap-min`(44) | :163,165,155 |
| Focus | `ring-focus-ring` `duration-fast` | :64,196 |

**No new token is introduced.** The needs-a-look dot reuses the existing `bg-status-review` utility (`app/globals.css:88`) — the same status hue `StatusIndicator` uses; the spec does **not** invent a `status-review` class (the utility is `bg-status-review`). There is **no success/green token**; "done" step and "ready" count use neutral (`text-text-subtle` / `text-text-strong`) treatment. The single accent (`--color-accent`) stays ≤10% coverage (DESIGN.md:11): after this change it appears only on the **one active step pill**, the **single Publish CTA in the bar**, and **checked checkboxes** — Review/View buttons are deliberately non-accent (§4.3), so an unbounded list of Review rows cannot breach the budget.

---

## 7. Dimensional invariants (Tailwind v4 — no default `align-items: stretch`)

- **DI-1 (stepper row):** the stepper `<nav>` is `flex items-center`; each `st` group is `flex items-center gap-2`; connectors are `h-px flex-1 self-center`. The row must not overflow at 320px → non-active labels `hidden sm:inline`. **Assert:** stepper `<nav>` scrollWidth ≤ clientWidth at 320px.
- **DI-2 (card row height):** card is `flex items-center` (icon/checkbox, text block, right cluster vertically centered). Checkbox `size-[22px]` fixed; text block `flex-1 min-w-0` (title truncates, meta wraps); right cluster `shrink-0`. **Assert:** checkbox and Review/View button are vertically centered within the card (`getBoundingClientRect` centers within 1px) and the card height equals its content (no stretch).
- **DI-3 (sticky bar):** bar is `sticky bottom-0`, `flex flex-col` bottom-anchored; the idle row is `flex items-center gap-3` with `min-h-tap-min`; the count/Back/Publish are vertically centered. Terminal panels render above the idle row. **Assert (real browser):** at desktop width, the idle bar's Publish button `getBoundingClientRect().bottom` is within the viewport and the bar spans the container width (`bar.width === container.width` within 0.5px); the last list card is not occluded (body `pb` ≥ bar height).

These are verified with a **real-browser (Playwright) layout assertion** (jsdom is insufficient), per the writing-plans additions.

---

## 8. Transition inventory

The page has few animated states; most are instant. Enumerated:

| Transition | Treatment |
| --- | --- |
| Modal closed ↔ open (Review/View) | Owned by the already-shipped `Step3ReviewModal` (pop-in / bottom-sheet). Unchanged. |
| Checkbox unchecked ↔ checked | Instant optimistic flip (existing) — color swap, `duration-fast`. |
| Select-all off ↔ on | Instant flip of every box (existing overlay). |
| Publish count value change | Instant text swap, `tabular-nums` so no layout shift (existing invariant). |
| Stepper todo → active → done (navigation) | Full page navigation (`?step=` `<Link>`); no in-page animation. Pill color/label swap on the new page render. |
| Card hover | `box-shadow`/`transition:.15s` raise (existing tile hover). |
| FinalizeButton idle → running (ProgressPanel morph) | Existing instant swap; native `<progress>` value animates. Bar grows upward — height change is instant (no morph animation), acceptable. |
| FinalizeButton running → error/race/cas/complete | Existing instant panel swap + focus move. |
| Needs-a-look chip present ↔ absent | Determined at render by warning count; no live toggle within a render (data is server-fetched). Instant. |
| **Compound:** open modal while a publish is running | Not reachable — the bar's Publish morphs to the progress panel and the operator is committed; the Review/View buttons remain but opening the modal mid-publish is the existing modal's concern (unchanged). No new compound animation. |

No new `AnimatePresence`/ternary animations are introduced; every state swap above is deliberately instant or owned by existing components.

---

## 9. DOM / test-contract delta

**Preserved testids** (assert unchanged): `onboarding-wizard`, `wizard-step-indicator`, `wizard-step-indicator-{1,2,3}`, `wizard-back-link` (steps 1–2), `wizard-step3`, `wizard-step3-heading`, `wizard-step3-card-grid`, `wizard-step3-select-all`, `wizard-step3-publish-count` (moved to bar), `wizard-step3-checkbox-*`, `wizard-step3-resolution-status` (+ its data-attrs), `wizard-step3-needs-attention` (+ children), `wizard-step3-ignored/-deferred/-skipped`, `wizard-step3-empty`, `wizard-step3-row-*`, all `wizard-finalize*`, `wizard-step3-rescan-review-*`, and the **no-details/demoted card** contract `wizard-step3-card-${dfid}` + `data-no-details="true"` (no-details) + `-summary` + `-title-link` (both non-selectable variants keep `SheetTitleLink`).

**Removed from the *selectable* card only** (tests updated in the same task; the no-details variant is unaffected): `wizard-step3-eyebrow` (header); and on the selectable card `-title-link` (→ plain `-title`), `-summary` (dl), `-city`, `-data-gaps`, `-data-gap-${key}`, `-badge-diagrams`, `-badge-reel`, `-publish-live`.

**Added:** `wizard-step3-summary` (header), `wizard-step3-card-${dfid}-title`, `-client`, `-review-chip`, `wizard-step3-back` (bar).

**Test files to reconcile** (each change lands with its test edit — TDD): `tests/components/admin/wizard/Step3Review.test.tsx`, `Step3ReviewWithFinalize.test.tsx`, `step3ReviewSections.test.tsx`, `step3PublishSettlement.test.tsx`; `tests/components/step3SheetCard.test.tsx` (asserts `-title-link`, `-summary`, badges, data-gaps, no-details at `:356,459,529,566` — the biggest delta) and `tests/components/step3SheetCard.transitions.test.tsx` (live-region/transition coverage `:116`); `tests/components/admin/onboardingWizardNav.test.tsx`, `step3NeedsAttention.test.tsx`, `OnboardingWizard.test.tsx`, `step3Checkbox.test.tsx`; `tests/components/admin/FinalizeButton.test.tsx` (behavior unchanged — assert the re-home + `panelPlacement` prop didn't break any testid/state). **Anti-tautology:** where a test scans for a label also rendered by a sibling (e.g. "Review" appears on both the card button and the modal), scope the query to the card subtree (clone + remove modal) before asserting.

---

## 10. Guard conditions (per prop/input)

- `rows = []` → empty state (§4.5); no summary, no bar.
- `parseResult == null` / `!pr.show` on a clean row → **no-details variant** (§4.3), NOT "ready": `data-no-details` "couldn't read" card, no checkbox, no chip, no Review/View, excluded from `selectableRows` and `readyCount`, folded into `needsLookCount`. Title falls back via `SheetTitleLink` to `driveFileName ?? driveFileId`.
- `client_label` / `dates` / `venue` individually null → that meta segment omitted (no empty dot); all three absent → no meta line. (Only reachable on a selectable card, which by definition has `pr.show`.)
- `dataGaps.total === 0` on a selectable row → **View**, no chip. `> 0` → **Review** + chip "{total} {total===1?'needs':'need'} a look".
- `lastFinalizeFailureCode != null` (any code) → demoted/stale-review variant (no checkbox), needs-a-look, non-numeric "Needs another look" chip, 0 publish-intent, excluded from `selectableRows`.
- `publishCount` NaN — impossible (integer filter counts); `selectableTotal === 0` → bar shows "0 of 0", Publish disabled via `finishable`.
- `step`/`maxReachedStep` typed `1|2|3` — total map, no fallthrough.
- Reduced motion — inherited from existing components / global `motion-reduce` rules; the native `<progress>` and modal already honor it.

---

## 11. Accessibility

- Stepper: keeps `nav[aria-label]`, `aria-current="step"`, direction-aware `aria-label`s, sr-only "Step N of 3", focus ring on link pills. Connectors and the completed `Check` are `aria-hidden`.
- Card: checkbox keeps its accessible name; Review/View button is a real `<button>` with `aria-haspopup` semantics as today; chip is `aria-hidden` decoration paired with the visible count text.
- Bar: `min-h-tap-min` on interactive targets; Back is a real link; FinalizeButton's SR announcer + focus management preserved verbatim.
- Color-blind floor: the needs-a-look signal is **dot + text**, never hue-only (DESIGN.md §1.3).

---

## 12. Non-goals / do-not-relitigate (reviewer preempt)

- **No green/success color** — no such token exists (§6); the mock's green is intentionally dropped. Cite globals.css @theme + StatusIndicator.
- **No finalize/backend change** — the `FinalizeButton` state machine, fetch/NDJSON-streaming contract, advisory-lock/RPC paths, focus refs, and testids are untouched. The ONLY `FinalizeButton` edit is a **layout-only** optional `panelPlacement` prop (default = current order) so the bar can stack its panels above the action row (§4.4). Cite `FinalizeButton.tsx` diff = container/child-order only.
- **Modal unchanged** — opened from the new buttons; not restyled.
- **Select-all stays in the header**, not the bar (the bar shows the count only) — deliberate, keeps the bar thin and the select-all discoverable with the list.
- **Dropping inline card expansion** is intentional (detail → modal), ratified in brainstorming.
- **Sticky bar grows upward for terminal panels** rather than splitting `FinalizeButton` — deliberate, to preserve the state machine and all testids/focus.

---

## 13. Plan-wide invariant compliance

1. TDD per task — yes (§ test plan in the plan).
2. Advisory lock — **N/A**, no code path mutating `shows`/`crew_*`/`pending_*` is touched (view layer only).
3. Email canonicalization — **N/A**, no email boundary touched.
4. No global sync cursor — **N/A**.
5. No raw error codes in UI — preserved; all copy routes through existing `lib/messages/lookup.ts` / `resolveIngestionCopy` (unchanged); new summary/label copy is plain English.
6. Commit per task — yes.
7. Spec canonical — this spec + the ratified mock govern; no silent scope creep.
8. **UI quality gate** — impeccable v3 **critique + audit** dual-gate on the diff before Codex + close-out; HIGH/CRITICAL fixed or `DEFERRED.md`.
9. Supabase call-boundary — **N/A**, no Supabase client call added (loader `fetchStep3Data` unchanged).

**Meta-test inventory:** none created or extended (no auth boundary, DB write, admin-alert catalog, advisory-lock, or sentinel-hiding surface touched). Declared explicitly per the writing-plans additions.

---

## 14. Test plan (preview — detailed in the plan)

- Stepper: renders labels + connectors; done shows `Check`; active `bg-accent`; reachable `<Link>`, unreached `<span aria-disabled>`; testids/aria preserved; 320px no-overflow (real browser).
- Header: each summary branch (empty / clean-only / clean+needsLook / all-needsLook / blocking-only) renders the exact catalog string with correct pluralization; derived from row fixtures, not hardcoded totals.
- Card: clean-no-warn → View, no chip; clean-with-warn → Review + "N need a look" (N from fixture data-gap count); stale-review → no checkbox + rescan; meta segments omit when absent; button opens modal.
- Bar: live count reflects checkbox flips; Back → `?step=2`; FinalizeButton behavior suite still green (re-home); dimensional invariant DI-3 (real browser).
- Edge: needs-attention / set-aside / empty testids + copy preserved.
- Layout: DI-1/DI-2/DI-3 real-browser assertions.
