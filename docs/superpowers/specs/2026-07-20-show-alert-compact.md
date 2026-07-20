# Show Alert Compact — compact banded alert cards

**Date:** 2026-07-20
**Source design:** claude.ai/design project `16f7daf6-41a8-4c4f-a04c-119bf8dcea3b`, file `Show Alert Compact.dc.html`, iterated with the user to treatment C + G2. Committed mock snapshot: `docs/superpowers/specs/2026-07-20-show-alert-compact-mock/guidance-placement.html` (final iteration; shows the treatment-C detail band and all three guidance-placement options, G2 ratified).
**Authorization:** user approved design AND autonomous ship-to-merged-PR 2026-07-20 00:55 CDT (AGENTS.md brainstorming gate).
**Review status:** APPROVED-BY-LADDER, not by a third reviewer verdict. Rounds R1 (11 findings) and R2 (30 findings) both landed and were fully repaired; R3 was dispatched three times in the same inlined form that succeeded for R2 and died silently each time (`no_verdict`, `no_o_file`), as did R2's whole-document and two tight-scope dispatches. Fifteen dispatch attempts in total. Per AGENTS.md ("`status:\"no_verdict\"` → apply the existing skip/self-review ladder"), the spec proceeds on self-review; the whole-diff cross-model review at implementation close-out is the remaining adversarial gate, and it reviews this design as built.

**Review history:** adversarial R1 (11 findings, all verified true, all repaired); class sweep (2 further source-scanning constraints); adversarial R2 inlined (30 findings, repaired by the wholesale rewrite this document now is). R2's whole-document and tight-scope dispatches died silently three times each; the inlined no-tool variant succeeded. Recorded so a later round does not re-derive the dispatch history.

## 1. Overview

Restyle three amber alert-card surfaces into a compact BANDED card. A card has up to four bands, in order: message row, optional detail band, optional footer bar, optional controls band. Longform help folds into a quiet `?` popover.

Compactness claim, stated precisely (an earlier draft's unqualified "half the vertical spend" was stale after amendment A1): the CHROME above hosted controls shrinks by roughly half versus today's stacked banner, because the action link, relative time, and primary button collapse from three stacked rows into one bar, and secondary detail lines collapse into one wrapping band. Cards that host expansive control clusters (§3.3) are NOT materially shorter, since those controls dominate their height.

Surfaces:

1. `components/admin/review/AttentionBanner.tsx` — per-alert inline banner in the published-show review modal (AttentionBanner.tsx:43).
2. `components/admin/PerShowActionableWarnings.tsx` — operator-actionable parse-warning cards (PerShowActionableWarnings.tsx:22). Consumers: `components/admin/showpage/sectionWarningExtras.tsx`, `components/admin/StagedReviewCard.tsx`, `components/admin/BulkIgnoreControls.tsx`, `app/admin/show/staged/[stagedId]/page.tsx`.
3. `components/admin/telemetry/HealthAlertsPanel.tsx` — per-row health-alert items on the dev telemetry page (`HealthAlertRowItem`, HealthAlertsPanel.tsx:85-161).

Non-goals: every other `bg-warning-bg` usage (inline form errors, pills, badges, count chips, `app/help` Callouts, panel-level degraded fallbacks such as HealthAlertsPanel.tsx:214-228) is untouched.

## 1.1 Resolved scope — do not relitigate

Ratified interactively with the user on 2026-07-19/20, or pinned by existing code. Verify the contract; do not re-derive it.

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | Scope = the three surfaces above; inline errors/badges/pills untouched | User selection "All three incl. HealthAlertsPanel" |
| R2 | Shared presentational shell `CompactAlertCard` + shared help-popover primitive; surfaces become adapters | User selection "Shared shell + popover primitive" |
| R3 | Help popover, not icon-link and not text link (G2): `helpfulContext` + route-gated Learn-more live inside the popover | User selections "Icon-button popover", "g2" |
| R4 | The popover primitive is the EXISTING `HoverHelp` (components/admin/HoverHelp.tsx:51) with a custom amber trigger and an Escape-containment fix — not a new component | HoverHelp already implements trigger/aria-expanded/Escape/learnMore (HoverHelp.tsx:110-121, 78-88); a duplicate would violate reuse |
| R5 | Detail band = treatment C: own band between message and footer, dashed divider, caps micro-label + weighted values, mono sheet-row quote; band absent when no detail data | User: "yes commit to c" |
| R6 | AttentionBanner identity sub-line DELETED (modal supplies show context) | User: "i dont think we need the … line right since this alert appears in the show modal" |
| R7 | Parse-warning footer has NO timestamp — `ParseWarning` (lib/parser/types.ts:48) carries none | Approved in design section 2 |
| R8 | Ignore controls live at the card's bottom, not inline in the message | User: "ignore control placement confirmed" (refined by A1) |
| R9 | Card-owned state transitions are instant, no animation | Approved in design section 3 (scoped by A2) |
| R10 | Existing tokens only; no new `@theme` block | Approved in design section 3; design file text "Same tokens as the current banner" |
| R11 | "✓ Confirmed" in-place swap and mounted-wrapper contract unchanged (AttentionBanner.tsx:68-74) | Prior spec published-show-alerts §5.4; out of scope |
| R12 | HealthAlertsPanel stays a server component; popover is a client leaf | Approved in design section 2 |

**Amendments** (each forced by live code that refuted a design-time assumption of MINE, never a user decision; user intent preserved throughout):

| # | Amendment | Why |
|---|-----------|-----|
| A1 | R8 refined: compact single controls go in `footerRight`; EXPANSIVE control clusters go in a `controlsBand` below the footer (§3.3) | `renderItemControls` returns three full control components (sectionWarningExtras.tsx:35-60), not an Ignore button |
| A2 | R9 scoped to CARD-owned states. The help popover's pre-existing `duration-fast` fade (HoverHelp.tsx:189) is inherited unchanged | The fade predates this work; removing it is out of scope |
| A3 | §1's compactness claim scoped to chrome, not to hosted control clusters | Follows from A1 |
| A4 | `shouldEmitLearnMore` is ADDED at the help adapter (it is not applied on these surfaces today) | AttentionBanner.tsx:93 and attentionItems.ts:224 apply no route gate |
| A5 | A third shell tone, `neutral`, exists for HealthAlertsPanel; `muted` is NOT reused there | Health rows are `bg-surface` (HealthAlertsPanel.tsx:87) while `muted` is `bg-surface-sunken` (PerShowActionableWarnings.tsx:43). R2 F1 caught the contradiction |
| A6 | Popover placement policy DESCOPED to HoverHelp's existing defaults; no new placement rule is invented (§8) | R2 F7/F8/F10 showed the invented "last 40% of viewport" rule was unmeasurable and unprovable in prose. Per AGENTS.md's spike-before-spec rule, an invented geometry policy is replaced by inheriting shipped behavior plus a recorded residual |

## 2. Visual design

Card root: `flex flex-col rounded-sm border` plus the tone skin (§3.1). Bands, in order:

1. **Message row** — `flex gap-2.5 p-3 pb-2.5`.
   - Severity glyph: 16px round `!` marker, `aria-hidden`, `shrink-0`. Rendered only for the `warning` tone; `muted` and `neutral` tones omit it (they are not severity surfaces).
   - Message block: `min-w-0 flex-1 text-sm font-semibold text-text-strong`, wrapping via `wrap-break-word`. `min-w-0` is load-bearing: without it a long unbroken token would push the help trigger out of the card (R2 F27).
   - Help trigger: `shrink-0`, at row end.
2. **Detail band** — `border-t border-dashed border-warning-text/25 px-3 py-1.5`, `flex flex-wrap items-center gap-x-4 gap-y-1`. Two entry shapes:
   - **Label/value entry** (default): caps micro-label `text-[10px] uppercase tracking-wider font-semibold text-warning-text/70` + value `text-xs font-semibold text-text`; numeric counts `tabular-nums`; sheet-row quotes `font-mono text-xs`.
   - **Sentence entry** (HealthAlertsPanel detail/follow-up templates only): no micro-label, `w-full text-xs text-text-subtle`, one per line. Declared because §4.3's templates are sentences, not label/value pairs (R2 F21).
3. **Footer bar** — `border-t border-warning-text/20 px-3 py-2`, `flex flex-wrap items-center gap-x-3 gap-y-1.5`.
   - Left cluster: `flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1`, `text-xs text-text-subtle`; link labels carry `min-w-0 truncate`.
   - Right cluster: `ml-auto shrink-0`. **`ml-auto`, not `justify-between`** — with only a right cluster present, `justify-between` leaves that single child at the START edge (R2 F2). `ml-auto` pins it right in both the one-child and two-child cases.
   - Containment: long labels ellipsize; the left cluster wraps to a second line before anything overflows. A two-line footer at 320px for long-label alerts is CORRECT (live labels include "Open branch settings" and "Review & re-sync", lib/adminAlerts/alertActions.ts:75, 113). Overflow is the failure; wrapping is not.
4. **Controls band** — `border-t border-warning-text/20 px-3 py-2`, full width, no height cap, no overflow, no transform (§3.3).

Divider color follows the tone: `warning-text/…` on the warning skin, `border-border` on `muted` and `neutral`.

## 3. Components

### 3.1 `CompactAlertCard` (NEW FILE created by this work: `components/admin/CompactAlertCard.tsx (new, does not exist yet)`)

Pure presentational shell. No data fetching, no state, no effects.

```ts
type CompactAlertTone = "warning" | "muted" | "neutral";
type CompactAlertStripe = "review" | "degraded" | "none";

type CompactAlertCardProps = {
  message: ReactNode;
  helpTrigger?: ReactNode;
  detailBand?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  controlsBand?: ReactNode;
  tone?: CompactAlertTone;      // default "warning"
  stripe?: CompactAlertStripe;  // default "review"
  className?: string;
};
```

Tone skins (each a full literal class string so the Tailwind JIT resolves it):

| tone | card skin | divider | glyph | stripe |
|------|-----------|---------|-------|--------|
| `warning` | `border-border bg-warning-bg text-warning-text` | `border-warning-text/20`, detail band dashed `/25` | rendered | honors `stripe` prop |
| `muted` | `border-border bg-surface-sunken text-text-subtle` | `border-border` | omitted | forced `none` |
| `neutral` | `border-border bg-surface text-text` | `border-border` | omitted | forced `none` |

`neutral` reproduces the live HealthAlertsPanel row skin exactly (HealthAlertsPanel.tsx:87). `muted` reproduces the live ignored-warning skin (PerShowActionableWarnings.tsx:43). Both forcibly override `stripe` inside the shell, so no caller can put a semantic stripe on a non-severity card.

Rules:

- **Slot presence is the HOST's decision.** The shell treats a slot as present iff the prop is not `null`, `undefined`, `false`, or `""`. It does NOT inspect rendered output: a component returning null is indistinguishable from content at the shell boundary without rendering it. Every adapter therefore computes each slot as an expression that evaluates to `null` when it has nothing to show — that is the contract adapter tests assert (§9.2), and it is what prevents empty bands. Restated as the shell invariant: **the shell never emits a band or bar whose slot is absent by the rule above.**
- Band/bar presence: detail band + dashed divider iff `detailBand` present; footer bar iff `footerLeft` OR `footerRight` present; controls band iff `controlsBand` present.
- `message` typing: `ReactNode` INCLUDES `null`, `undefined`, and booleans, so a "non-nullable at the type level" guarantee is impossible (R2 F5) and is not claimed. The shell instead treats an absent `message` as a programming error: it renders the message row regardless (the row is structural), and each adapter's message expression terminates in a non-empty fallback — `ATTENTION_FALLBACK_TITLE` (AttentionBanner), `"Data quality issue"` (PerShowActionableWarnings, PerShowActionableWarnings.tsx:61), the catalog heading or its existing fallback (HealthAlertsPanel). Pinned per adapter in §9.2, not in the shell.
- `tone`/`stripe` are non-nullable unions with defaults; there is no null or NaN case.
- `className` is merged onto the card root, never replacing shell classes. Host `data-*`/`aria-*` attributes live on a host-owned wrapper element.

### 3.2 `HoverHelp` extension (edit, `components/admin/HoverHelp.tsx`)

Reused as the help popover. Changes:

1. **Escape containment.** Add an element-level `onKeyDown` on the root wrapper: when `open` and `e.key === "Escape"`, `e.preventDefault(); e.stopPropagation();` then close.

   Mechanism, verified live: `ReviewModalShell`'s Escape handler is a `document`-level native listener that closes UNCONDITIONALLY — it does not inspect `defaultPrevented` (ReviewModalShell.tsx:239-245). Containment therefore rests entirely on `stopPropagation`, never on `preventDefault`. React attaches synthetic handlers at the root container, which sits below `document`, so stopping propagation there prevents the native event from reaching the shell's listener. (This checkout runs React 19.2.4, package.json:76; root-container delegation is unchanged from 18.) `CrewRowActions` relies on the same topology (components/admin/wizard/CrewRowActions.tsx:115-121); its comment describing the shell as "ignoring defaultPrevented" misdescribes the shell, though its code is correct. `preventDefault` is kept only for defense in depth.

   The existing window-level listener (HoverHelp.tsx:111-121) stays for hover-open and focus-outside dismissal. Residual, accepted: a mouse-hover-opened popover inside the modal still closes together with the modal on Escape, because that path never reaches a React handler. Pre-existing behavior, not a regression.
2. **Custom trigger.** No API change — the `trigger` prop (HoverHelp.tsx:65) takes the amber `?` node, which keeps HoverHelp's `min-h-tap-min min-w-tap-min` hit area (HoverHelp.tsx:164) around a 22px visual glyph. Trigger visual spec (R2 F26): `grid size-[22px] place-items-center rounded-pill border border-warning-text/40 bg-transparent text-xs font-bold text-warning-text`, hover `bg-warning-text/10`, focus via the repo's standard `focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2` with the tone's ring-offset class (the `linkOffsetClass` pattern at PerShowActionableWarnings.tsx:49-52).

**Pre-existing behaviors inherited unchanged** (each verified live; the test and transition sections depend on them):

- The body stays MOUNTED while closed, hidden by Tailwind's `hidden` class, so `aria-describedby` always resolves (HoverHelp.tsx:174-179, 202). Presence in the DOM therefore proves nothing about openness (§9.1).
- Opening is not instant: `transition-[opacity,display] duration-fast transition-discrete starting:opacity-0` (HoverHelp.tsx:189). Recorded in §6, not asserted away (A2).
- The body is absolutely positioned IN FLOW, not portaled (HoverHelp.tsx:193), and carries `w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto`. Placement and clipping consequences: §8.

**Help adapter contract** (single normative statement; R1 found the earlier draft self-contradictory):

- A card renders a help trigger iff `popoverBody` is non-empty, where `popoverBody` = the surface's `helpfulContext` when it is a non-empty string after trimming, plus a Learn-more link when the surface has a non-empty-after-trim `helpHref` AND `shouldEmitLearnMore` passes for the current route. Both absent ⇒ no trigger and no `HoverHelp` element at all.
- `shouldEmitLearnMore` (lib/messages/renderer-gate.ts:17) is NOT applied on either surface today (AttentionBanner.tsx:93; lib/admin/attentionItems.ts:224 copies the catalog href unconditionally). This spec ADDS it at the adapter, fed by `usePathname()` — the same default `HelpAffordance` uses. A deliberate behavior change, stated as such (A4).
- Required `HoverHelp` inputs per surface: `label` = `"What does this mean?"` (names the trigger and scopes the Learn-more accessible name, HoverHelp.tsx:61, 216); `align="right"`; `placement` omitted (A6, §8); `testId` = `` `attention-banner-help-${a.alertId}` `` / `` `per-show-actionable-help-${key}` `` (keys from `stableWarningKeys`), so body and trigger testids derive as `<testId>-body` / `<testId>-trigger`.

**`rootTestId` is deliberately NOT set, and each call site carries an exemption comment instead.** Both popovers are PER-ITEM: their testids interpolate an alert id or a warning key, so no fixed literal exists. The affordance-matrix parity gate matches a LITERAL `rootTestId`/`testId` string against the live concrete-row set (_metaAffordanceMatrixParity.test.ts:90), and a separate assertion requires every concrete id to occur EXACTLY ONCE across the domain (_metaAffordanceMatrixParity.test.ts:100-116) — a per-item testid would violate both. The matrix's own shape test additionally BANS concrete parse-warning rows, because "Amendment 1 folds per-code parse warnings into the error-message template family" (_affordance-matrix-shape.test.ts:75-79). The registration route is therefore the template family, exactly as per-code error help already works (app/help/_affordanceMatrix.ts:233-239).

### 3.3 Footer right vs controls band (amends R8 as A1)

R8 was ratified on my design-time claim — WRONG — that `renderItemControls` yields a single Ignore button. Live code: `SectionWarningItemControls` (sectionWarningExtras.tsx:35-60) returns `DataQualityWarningControls` + `UseRawControlBoundary` + `RoleRecognizeControlBoundary` together: a Report/Ignore pair with multiline inline errors (DataQualityWarningControls.tsx:67), a full-width two-row radio interface (UseRawControl.tsx:472), and an expandable role editor with its own mount animation and spinner (RoleRecognizeControl.tsx:83, 343). None fits a single-row footer's right cluster.

Amended contract, preserving R8's intent (controls at the card's bottom, footer stays compact):

- `footerRight` accepts ONE compact control: a button, a link, or a short note. AttentionBanner and HealthAlertsPanel use it for their resolve button / auto-clear note.
- `controlsBand` hosts expansive clusters. **PerShowActionableWarnings passes `renderItemControls` output here and leaves `footerRight` unset.** Hosted controls keep their internal layout, states, and animations untouched; the band is a container only.

## 4. Surface mappings

### 4.1 AttentionBanner (components/admin/review/AttentionBanner.tsx)

- Early return unchanged: non-alert items and items without `alert` render nothing (AttentionBanner.tsx:52).
- Tone `warning`. **Stripe** (R2 F6): `item.tone === "critical"` ⇒ `"degraded"`, else `"review"` — the live rule at AttentionBanner.tsx:56, preserved verbatim.
- Message: `renderCatalogEmphasis(a.template, a.params)` when `a.template` is a non-empty string; otherwise `ATTENTION_FALLBACK_TITLE` (lib/admin/attentionItems.ts:59). If emphasis rendering yields no visible text, the fallback applies (guard in §5.2).
- Help trigger: per §3.2. Body = `lookupHelpfulContext(a.code, a.params)` (lib/messages/lookup.ts:120) when non-empty after trim; Learn-more = `a.helpHref` when non-empty after trim AND the route gate passes. Learn-more without `helpfulContext` ⇒ body is the lead-in "More about this alert in the help pages." plus the link. The freestanding quiet "Learn more" link (AttentionBanner.tsx:93-101) is deleted.
- Detail band entries (label/value shape):
  - `Failed` → the `failedKeys` entries trimmed, empties dropped, joined with `" · "`. Entry omitted when the resulting list is empty (AttentionBanner.tsx:102-109). Cap: at most 6 keys shown, then `+N more` (R2 F28 — an unbounded join defeats the compact goal). Testid `attention-banner-failed-sources-${alertId}` preserved.
  - `Dropped` → `formatDataGapBreakdown(a.dataGaps)` (lib/parser/dataGaps.ts:349) ONLY when `a.dataGaps` is non-null AND `Number.isFinite(a.dataGaps.total) && a.dataGaps.total > 0`. This is a deliberate tightening of the live `{a.dataGaps ? (` conditional and forces the §10 scanner update. Testid `attention-banner-data-gaps-${alertId}` preserved.
- Identity sub-line (`showIdentity`, AttentionBanner.tsx:57-60, 118-125) DELETED with the `INLINE_IDENTITY_CODES` import; `attention-banner-identity` testid removed. `menuSubtitle` stays in `AttentionItem` (lib/admin/attentionItems.ts:54) for AttentionMenu. The `underCrewRow` prop is removed from the signature and its two call sites, verified live: `components/admin/showpage/PublishedReviewModal.tsx` (`bannerFor`) and `tests/components/admin/review/attentionBanner.test.tsx`.
  - **Meta-test impact, corrected** (R1 F9; acting on the earlier false claim would have weakened a live global guard): `tests/adminAlerts/_metaInlineIdentityContract.test.ts` holds NO AttentionBanner rows — it proves bidirectional equality between catalog identity placeholders and `INLINE_IDENTITY_CODES` (_metaInlineIdentityContract.test.ts:26-45), still consumed by `components/admin/BellPanel.tsx`; `tests/messages/_metaAdminAlertCatalog.test.ts` consumes the same set for interpolation coverage (_metaAdminAlertCatalog.test.ts:613). Neither contract is affected and NEITHER FILE MAY BE EDITED by this work.
- Footer left: action link (label + external `↗`, semantics unchanged from AttentionBanner.tsx:81-91) when `a.action` is non-null, then a `·` separator, then `Raised <relative>` (`formatRelativeRaisedAt`, lib/admin/attentionItems.ts:172; `<time dateTime>` + `suppressHydrationWarning` kept). No action ⇒ time alone, no leading separator. The `now: Date` prop keeps driving the relative time; the component must never read the clock itself (§10 constraint).
- Footer right: **`a.autoClearNote` non-empty ⇒ the italic note; otherwise the resolve button.** This is the live branch (AttentionBanner.tsx:132) and it keys off the note, NOT off `item.actionable` (R2 F4 corrected a stale claim). `PerShowAlertResolveButton` (PerShowAlertResolveButton.tsx:48) is unchanged.
- Confirmed swap, `data-attention-anchor`, `aria-current`, existing testids: unchanged (R11).

### 4.2 PerShowActionableWarnings (components/admin/PerShowActionableWarnings.tsx)

- `items.length === 0` ⇒ component returns null (unchanged, PerShowActionableWarnings.tsx:37).
- Tone: `warning`, or `muted` when the existing `tone` prop is `"muted"` (ignored list). Stripe: `"none"` on this surface — the live card has no stripe (PerShowActionableWarnings.tsx:41-44), and adding one would be an unratified visual change.
- Message: catalog title / human-message / `"Data quality issue"` fallback chain unchanged (PerShowActionableWarnings.tsx:56-61).
- Help trigger: body = `entry.helpfulContext` when non-empty after trim (PerShowActionableWarnings.tsx:62); the inline context line (PerShowActionableWarnings.tsx:90-92) moves into the popover. No Learn-more on this surface (no `helpHref` wiring exists), so the route gate is not consulted here.
- Detail band: `Sheet row` entry → `labelFromRawSnippet(w.rawSnippet)` in mono, rendered only for `UNKNOWN_FIELD` (gate unchanged, PerShowActionableWarnings.tsx:79-80) and only when the label is non-empty after trim. Testid `per-show-actionable-row-label` preserved.
- Footer left: `Open in Sheet ↗` iff `buildSheetDeepLink(driveFileId, w.sourceCell)` returns a href. Two-input guard: a non-null `sourceCell` with a NULL `driveFileId` yields no link, so the adapter branches on the RESULT, never on `sourceCell` alone. No timestamp (R7). Focus ring-offset follows the tone via the existing `linkOffsetClass` pattern.
- Controls: `renderItemControls(w, i)` output goes to `controlsBand`, never `footerRight` (A1). The prop being absent, or its return being nullish, ⇒ no controls band.
- With no href and no controls, the footer bar is absent and the card is message(+detail) only.
- Key stability via `stableWarningKeys` unchanged (PerShowActionableWarnings.tsx:40).

### 4.3 HealthAlertsPanel (components/admin/telemetry/HealthAlertsPanel.tsx)

Per `HealthAlertRowItem` row:

- **Tone `neutral`, stripe forced `none`** (A5). This reproduces the live `border-border bg-surface` skin (HealthAlertsPanel.tsx:87) exactly. Severity keeps being carried by the existing weight badge (HealthAlertsPanel.tsx:96-103) inside the message row, never by the container, so `degraded` and `notice` rows remain visually distinguished exactly as today. The `weight` prop continues to drive only the badge.
- Message row: heading line + weight badge (existing markup, moved intact into `message`). No `!` glyph (the `neutral` tone omits it).
- Detail band, sentence entries in this order when present: detail template, follow-up template (HealthAlertsPanel.tsx:106-115); then label/value entries: `Identity` → `row.identityText`, `Seen` → `<n> occurrence(s)` with the existing singular/plural logic (HealthAlertsPanel.tsx:132). Band absent iff all four are absent.
- Footer left: the present items among `View show` link (rendered iff BOTH `row.show_id` and `row.slug` are present — the live condition, HealthAlertsPanel.tsx:134) and the action link (iff `action` non-null), then `Raised <relative>`, joined by `·` separators interleaved BETWEEN present items only. Zero links ⇒ time alone with no leading separator. Implemented as filter-then-interleave, never a fixed template (R2 F25: the one-present/one-absent case of `show_id`/`slug` collapses to "no link" by the live AND condition, which §9.2 tests explicitly).
- Footer right: `HealthAlertResolveButton` (HealthAlertsPanel.tsx:160) when `isAutoResolving(row.code)` is false, else the italic `autoResolveNote(row.code)`.
- No help popover on this surface (no `helpfulContext` wiring today; none added). Panel headings, sections, Load more, empty and degraded states untouched. The panel stays a server component; only the resolve button remains a client leaf (R12).

## 5. Guard conditions

Two tiers, because the shell and the adapters have different input domains. The earlier draft's claim that shell tests cover every row is withdrawn — most rows below are adapter conditions the shell cannot see.

### 5.1 Shell inputs (`CompactAlertCard`)

Presence rule for every slot: absent iff `null`, `undefined`, `false`, or `""`. Any other ReactNode — including `0`, `NaN`, an empty array, or an empty fragment — counts as PRESENT and renders its band. This is a deliberate, uniform rule (R2 F23 flagged the earlier inconsistency between "nullish" and "false"); adapters never pass those shapes because §5.2 requires them to normalize to `null` first.

| Input | Value | Behavior |
|-------|-------|----------|
| `message` | any | message row always renders (structural); emptiness prevented per adapter (§3.1) |
| `helpTrigger` | absent | no trigger; message block spans the row |
| `detailBand` | absent / present | band + dashed divider omitted / rendered |
| `footerLeft`, `footerRight` | both absent | NO footer bar, NO divider |
| `footerLeft` only | present | bar renders; left cluster at start edge |
| `footerRight` only | present | bar renders; right cluster pinned RIGHT via `ml-auto` (not `justify-between`) |
| `controlsBand` | absent / present | band + divider omitted / rendered |
| `tone` | omitted | `"warning"` |
| `tone` | `"muted"` / `"neutral"` | corresponding skin; `stripe` forced `"none"`; glyph omitted |
| `stripe` | omitted | `"review"` (applies only under `tone="warning"`) |
| `className` | omitted / present | merged onto the card root |

### 5.2 Adapter inputs

Normalization rule binding all three adapters: every slot expression trims strings, drops whitespace-only values, and evaluates to `null` when nothing remains. "Non-empty" below always means non-empty after trim.

| Surface | Input | Value | Behavior |
|---------|-------|-------|----------|
| AttentionBanner | `item.kind !== "alert"` or `!item.alert` | — | returns null (unchanged) |
| AttentionBanner | `a.template` | null, empty, whitespace, or renders no visible text | `ATTENTION_FALLBACK_TITLE` |
| AttentionBanner | `a.action` | null | footer left = time alone, no leading separator |
| AttentionBanner | `a.failedKeys` | null, `[]`, or all entries empty/whitespace | no Failed entry |
| AttentionBanner | `a.failedKeys` | > 6 surviving entries | first 6 joined, then `+N more` |
| AttentionBanner | `a.dataGaps` | null | no Dropped entry |
| AttentionBanner | `a.dataGaps.total` | 0, negative, or non-finite | no Dropped entry |
| AttentionBanner | `a.autoClearNote` | non-empty | footer right = italic note |
| AttentionBanner | `a.autoClearNote` | null, empty, or whitespace | footer right = resolve button |
| AttentionBanner | `helpfulContext` empty AND (no `helpHref` OR route gate fails) | — | no trigger, no `HoverHelp` element |
| AttentionBanner | `a.helpHref` | whitespace-only | treated as absent |
| PerShowActionableWarnings | `items.length === 0` | — | returns null |
| PerShowActionableWarnings | `buildSheetDeepLink(driveFileId, w.sourceCell)` | null (incl. non-null `sourceCell` + null `driveFileId`) | no Open in Sheet link |
| PerShowActionableWarnings | `labelFromRawSnippet(w.rawSnippet)` | null, empty, whitespace, or code ≠ `UNKNOWN_FIELD` | no Sheet-row entry |
| PerShowActionableWarnings | `entry.helpfulContext` | null, empty, or whitespace | no trigger |
| PerShowActionableWarnings | `renderItemControls` | absent, or returns nullish | no controls band |
| PerShowActionableWarnings | catalog title, human message, and code-derived title all empty | — | `"Data quality issue"` |
| HealthAlertsPanel | `row.identityText` | null, empty, or whitespace | no Identity entry |
| HealthAlertsPanel | `occurrence_count` | 1 | "1 occurrence" |
| HealthAlertsPanel | `occurrence_count` | 0, negative, or non-finite | no Seen entry |
| HealthAlertsPanel | detail / follow-up templates | null, empty, or whitespace | that sentence entry absent |
| HealthAlertsPanel | all four detail inputs absent | — | no detail band |
| HealthAlertsPanel | `show_id` XOR `slug` present | — | no View-show link (live AND condition) |

## 6. Transition inventory

R2 F15 correctly identified that the popover is an ORTHOGONAL dimension, not a peer state. The model is therefore a product of two independent axes:

- **Resolve axis (card-owned):** `D` default → `Rp` request in flight → `C` confirmed swap (AttentionBanner only) or `Ep` inline error (AttentionBanner only; `PerShowAlertResolveButton.tsx:46, 92-94`).
- **Popover axis:** `closed` ↔ `open`.

### 6.1 Resolve axis (all pairs, both directions)

| Pair | Treatment |
|------|-----------|
| D→Rp | button-internal pending state, unchanged component, instant |
| Rp→C | instant swap (AttentionBanner.tsx:68-74) |
| Rp→Ep | inline error line appears, instant |
| Ep→Rp | retry re-enters the request (PerShowAlertResolveButton.tsx:52), instant |
| Rp→D | not reachable: the request always terminates in C or Ep |
| D↔Ep | not reachable directly — Ep is entered only via Rp, and left only via Rp. Declared, per R2 F13 |
| D↔C | not reachable directly — C is entered only via Rp. Declared |
| Ep→C | NOT a direct pair. Reachable only as Ep→Rp→C after a successful retry; both legs are inventoried above (R2 F12 corrected the earlier draft's mislabeling) |
| C→anything | terminal until `router.refresh()` reconciles the card away (R11) |

**HealthAlertsPanel's resolve axis is D→Rp only, and its exit is out of this diff's control** (R2 F14): `HealthAlertResolveButton` has a pending state and no inline error state (HealthAlertResolveButton.tsx:19); on completion the panel is re-rendered by the surrounding server flow, so the row either disappears or re-renders in place. This work neither introduces nor changes that exit, and asserts nothing about it beyond the row rendering correctly in both states.

### 6.2 Popover axis and compounds

| Pair | Treatment |
|------|-----------|
| closed→open, open→closed | NOT instant, deliberately: pre-existing HoverHelp opacity/display fade, `duration-fast` + `transition-discrete` + `starting:opacity-0` (HoverHelp.tsx:189). Inherited unchanged (A2) |
| open × (D→Rp), open × (Rp→Ep), open × (Ep→Rp) | independent subtrees, no shared state; each resolve-axis transition behaves as in §6.1 with the popover still open |
| open × (Rp→C) | the confirmed swap unmounts the whole body, including trigger and popover. No cleanup needed: the fade is CSS-only with no timers |
| closing mid-fade × any resolve transition | unmount during the CSS fade is safe for the same reason; no interrupted-animation handling is required |

**Spatial note, corrected** (R2 F17 refuted the earlier "cannot overlap" claim): the popover is absolutely positioned from the message row and CAN paint over the detail, footer, or controls bands. That is intended tooltip behavior. It has no interaction consequence because the popover sets `pointer-events-none` while closed and the bands beneath remain reachable once it closes; no hosted control is disabled or occluded while the popover is closed.

### 6.3 Hosted control states (unchanged by this work)

Enumerated because A1 moves these controls into a new container: `DataQualityWarningControls` idle / running / error with multiline inline errors (DataQualityWarningControls.tsx:67); `UseRawControl` two-row radio interface with pending / applied states (UseRawControl.tsx:472); `RoleRecognizeControl` collapsed / editor / saving / saved / stale / conflict, including a mount animation and spinner (RoleRecognizeControl.tsx:83, 343).

This work adds, removes, and alters NO transition inside them, so their internal pair matrix is out of scope and is not restated here (R2 F16 asked for it; the honest answer is that re-specifying a state machine this work does not touch would create a second source of truth that can drift). What IS in scope and asserted: the container imposes no height, no overflow, and no transform, so no hosted animation is clipped or confined.

## 7. Dimensional invariants

N/A — no fixed-height or fixed-width parent with flex/grid children is introduced. Card and all bands are content-sized; buttons keep their own internal heights. Declared explicitly per AGENTS.md.

## 8. Accessibility and popover geometry

- Popover semantics: existing HoverHelp contract — trigger `aria-expanded`; body `role="tooltip"` without Learn-more, disclosure with `aria-controls` when Learn-more is present (HoverHelp.tsx:78-88). Focus stays on the trigger; the Learn-more link is reachable by Tab in existing order.
- The body stays mounted-but-`hidden` while closed (HoverHelp.tsx:174-179, 202), which keeps `aria-describedby` resolvable and means DOM presence proves nothing about openness (§9.1).
- Escape: contained per §3.2.
- Focus after the Rp→C swap: the resolve button (which had focus) unmounts with the body; focus falls to `document.body`. Unchanged from the shipped swap behavior (R11), not introduced here.
- Tap targets ≥44px: help trigger via `min-h-tap-min min-w-tap-min`; footer links keep `inline-flex min-h-tap-min items-center` (AttentionBanner.tsx:86, HealthAlertsPanel.tsx:138).
- The `!` glyph is `aria-hidden`; severity is conveyed by text and, on HealthAlertsPanel, by the weight badge.
- No `role="alert"` additions.
- Copy: no em-dashes, straight apostrophes; all message text flows through catalog lookup (invariant 5 — no raw codes).

**Popover placement and clipping — DESCOPED to inherited behavior (A6).** An earlier draft invented a "cards in the last 40% of the scroll viewport pass `placement="top"`" rule. R2 F7/F8/F10 correctly showed that rule was unmeasurable in prose (no measurement moment, no re-evaluation on scroll or resize, no boundary definition) and that the proposed test could not prove it. Rather than patch geometry prose a third time — AGENTS.md caps design-correctness vectors at three prose rounds and prescribes a spike instead — this spec DESCOPES the policy:

- Every card passes `align="right"` and OMITS `placement`, inheriting HoverHelp's shipped default (`bottom`) exactly as the eight existing consumer files do (verified: `rg -l '<HoverHelp' app components`).
- Known residual, recorded rather than solved: AttentionBanner cards sit inside a scroll container (`overflow-y-auto`, ShowReviewSurface.tsx:869) nested in an `overflow-clip` panel (ReviewModalShell.tsx:614), and HoverHelp is positioned in flow rather than portaled (HoverHelp.tsx:193). A popover opened on a card near the bottom of the scroll viewport can therefore be visually clipped, and `getBoundingClientRect()` will not reveal it (it reports the unclipped box). The user can scroll to reveal it.
- This residual is PRE-EXISTING for every HoverHelp consumer inside a scrolling admin surface and is not created by this work. It is filed as a backlog item (`BL-HOVERHELP-PORTAL`: portal the popover body or adopt an anchor-positioning polyfill, then assert containment against both clipping ancestors). If a future round wants containment guaranteed, that is the spike, not more prose here.
- §9 therefore asserts what CAN be proven without the policy: the popover opens, is positioned below and right-aligned to its trigger, and is not clipped by the CARD itself. It does not claim scroll-container containment.

## 9. Testing

### 9.1 How popover state is asserted (repo-specific; R2 F30)

The repo loads no CSS into jsdom (`vitest.config.ts:61` sets `setupFiles: ["tests/setup.ts"]` only) and has NO existing `toBeVisible()` usage. Tailwind's `hidden` class is therefore inert in unit tests: `toBeVisible()` would return true for a closed popover, and an earlier draft's before/after visibility assertion would have been silently vacuous.

Binding rules:

- **Unit tests assert popover STATE, not visibility:** the trigger's `aria-expanded` flips `false`→`true`, and the body element carries the `hidden` class when closed and not when open. Both are real DOM facts in jsdom.
- **Real visibility is asserted only in the Playwright test**, where CSS actually applies (`toBeVisible()` there is meaningful).
- Presence-only queries (`getByTestId` on the body) are NEVER used as evidence of openness, because the body is mounted while closed.
- The earlier "clone the card and strip the message row" instruction is WITHDRAWN: the popover body is nested inside the `HoverHelp` root, which IS the message-row-end trigger, so that clone would delete the subject under test. Disambiguation between message text and popover text is by testid scoping (`<testId>-body`).

### 9.2 Unit (vitest + RTL)

Shell (`CompactAlertCard`) — one assertion per §5.1 row:

- each slot absent (`null`, `undefined`, `false`, `""`) ⇒ no band element AND no divider element (assert the divider class is absent, not merely that text is missing);
- `footerRight` alone ⇒ bar renders and the right cluster carries `ml-auto` (the concrete failure this catches: a `justify-between` implementation leaves a lone child at the start edge);
- `footerLeft` alone ⇒ bar renders;
- all three tones ⇒ correct skin classes, and `muted`/`neutral` force `stripe="none"` even when a stripe is passed, and omit the glyph;
- `className` merges rather than replaces.

AttentionBanner adapter (`tests/components/admin/review/attentionBanner.test.tsx`, updated) — identity assertions and the `underCrewRow` prop removed; added or retained: invalid item and missing `alert` ⇒ null; null / empty / whitespace `template` ⇒ fallback; null `action` ⇒ time alone with no leading separator; `failedKeys` null / `[]` / all-whitespace ⇒ no entry; > 6 keys ⇒ `+N more`; `dataGaps` null, `total: 0`, and `total: NaN` ⇒ no entry; `autoClearNote` whitespace-only ⇒ resolve button (not note); stripe `review` vs `degraded` from `item.tone`; trigger presence across all four combinations of (helpfulContext, admissible helpHref) with `shouldEmitLearnMore` exercised for a passing and a failing route; freestanding Learn-more gone; confirmed swap unchanged; Ep→Rp→C retry path.

PerShowActionableWarnings (`tests/admin/perShowActionable*.test.tsx`, `tests/parser/parseWarningDeepLinkRender.test.tsx`, updated) — empty `items` ⇒ null; helpfulContext asserted in the popover body per §9.1; all row-label suppression cases (null, empty, whitespace, non-`UNKNOWN_FIELD`); `sourceCell` present with null `driveFileId` ⇒ no link; no link and no controls ⇒ no footer bar; controls land in `controlsBand` and NOT in the footer (assert the controls node's ancestor band); `renderItemControls` absent and returning null ⇒ no band; all-empty title chain ⇒ `"Data quality issue"`; muted tone skin; key stability untouched.

HealthAlertsPanel (`tests/components/healthAlertsPanel*.test.tsx`, updated) — `neutral` tone skin and absence of any stripe or glyph; weight badge still distinguishes degraded from notice; separator interleaving across every link-presence combination including `show_id` XOR `slug`; `occurrence_count` 0 / 1 / 2 / negative / non-finite; identity empty and whitespace; all four detail inputs absent ⇒ no band.

Escape containment — render the card inside a real `ReviewModalShell`, open the popover, dispatch Escape from inside it, then assert BOTH that the popover closed AND that the shell's close callback was NOT called. That second assertion is the load-bearing one: it exercises the real `document`-level native listener. `defaultPrevented` is explicitly NOT used as evidence (the shell ignores it), and a synthetic-parent-handler spy is insufficient alone. Regression pair: a CLOSED popover does not swallow Escape, and the shell closes normally.

Anti-tautology: expected strings derive from fixture data (catalog entries, fixture `failedKeys`), never read back off the rendered container; band-membership assertions scope to the band element so a value rendered in the message row cannot satisfy them.

### 9.3 Real-browser (Playwright, existing standalone harness pattern)

- **Footer containment (hard invariant):** at 400px and 320px card widths, with both a short-label fixture and the longest live action label ("Open branch settings", lib/adminAlerts/alertActions.ts:75), assert that every DESCENDANT of the footer bar (not just the two cluster elements — R2 F29) has a bounding rect within the footer bar's content box, left and right, within 0.5px.
- **Truncation is load-bearing, asserted directly:** for the long-label fixture, assert the link element's `scrollWidth > clientWidth` (proving ellipsis actually engaged) rather than inferring it from containment, which ancestor clipping could satisfy on its own.
- Single-line check applies ONLY to the short-label fixture: left cluster and right cluster vertical centers within 0.5px, one flex line. The long-label fixture is asserted to wrap to two lines WITHOUT overflowing; wrapping is correct behavior, not a failure.
- Help trigger hit area ≥44×44 via `getBoundingClientRect`.
- Popover: opens on click (`toBeVisible()` is meaningful here), is positioned below its trigger and right-aligned to it, and is not clipped by the CARD. Per A6 this test does NOT assert scroll-container containment and does not encode a placement policy.
- Message-row containment: with a long unbroken token as the message, the help trigger remains inside the card (proves `min-w-0` on the message block).

### 9.4 Gates

Impeccable critique + audit on the diff (invariant 8); `pnpm spec:lint` plus citation and numeric transcripts attached to review dispatches; full suite + typecheck + eslint + format:check before push. Every new or renamed test file gets its `testMatch`/project-glob home confirmed against `vitest.projects.ts` at plan time, and every new Playwright spec its workflow path filter.

## 10. Meta-test inventory

Exhaustive, from a sweep of every `readFileSync`-based test referencing these surfaces. A missing row here is a CI failure at implementation time.

- **EXTENDS** `tests/components/admin/transitionAudit.test.tsx` — already scans `components/admin/review/AttentionBanner.tsx` (transitionAudit.test.tsx:41). Add `components/admin/CompactAlertCard.tsx (new)`, `components/admin/PerShowActionableWarnings.tsx`, and `components/admin/telemetry/HealthAlertsPanel.tsx` to the motion-free list, so R9 cannot be violated on an adapter outside the current scan (R2 F19).
- **EXTENDS** `tests/components/admin/dataGapsTransitionAudit.test.tsx` — source-scans AttentionBanner and pins the exact conditional `/\{a\.dataGaps \? \(/` (dataGapsTransitionAudit.test.tsx:147). §4.1 tightens that guard to require a positive finite `total`, so the pinned regex MUST be updated in the same commit as the component change.
- **SATISFIED BY EXEMPTION** `tests/help/_metaAffordanceMatrixParity.test.ts` — every `<HoverHelp` call site must resolve a live literal matrix testid or carry an exemption comment matching `/\/\/\s*not-a-help-affordance:\s*\S/` (_metaAffordanceMatrixParity.test.ts:9, 76-98). Both new call sites carry `// not-a-help-affordance: per-item popover; registered as a template-family row, see app/help/_affordanceMatrix.ts` within the three lines above the element. They do NOT set `rootTestId` (§3.2 explains why a per-item testid would break two separate assertions in this gate).
- **EXTENDS** `app/help/_affordanceMatrix.ts` with ONE new `template-family` row (kind `"template-family"`, the shape at app/help/_affordanceMatrix.ts:19-27) covering the per-item help popover across both surfaces. **No concrete row is added**, so the pinned concrete-row count and its ratified id list (_affordance-matrix-shape.test.ts:95-99, 60-73) are UNCHANGED and the "no parse-warning-row concrete testid" assertion (_affordance-matrix-shape.test.ts:75-79) stays satisfied. Adding a concrete row instead would break three assertions at once; this is the single most load-bearing registry detail in the diff.
- **UPDATES** the matrix comment stating that per-alert education IS a freestanding `helpHref` link (app/help/_affordanceMatrix.ts:105-112) — rewritten to describe the popover. Comment-only; no row-set change.
- **CONSTRAINS** `tests/components/admin/class-sweep-now-utility.test.ts` — scans AttentionBanner and asserts it consumes the caller-supplied `now: Date` and never reads the clock (class-sweep-now-utility.test.ts:126-133; forbids `Date.now(` and `new Date()`). No test edit needed; the constraint binds the implementation.
- **CONSTRAINS** `tests/styles/status-token-contrast.test.ts` — pins AA contrast for text tokens on the `--color-warning-bg` wash, framed as the attention banner's pairing (status-token-contrast.test.ts:150-158). The detail band uses only already-pinned tokens (R10), so no edit is needed; substituting a token later would require one.
- **NOT TOUCHED, must not be edited:** `tests/adminAlerts/_metaInlineIdentityContract.test.ts`, `tests/messages/_metaAdminAlertCatalog.test.ts` (§4.1).
- No new admin route, table, or `admin_alerts` code ⇒ §12.4 catalog gates and invariant-10 mutation registries unaffected; no new Supabase call sites ⇒ no call-boundary registry rows; advisory locks, email canonicalization, and the sync cursor are untouched (pure UI diff).

## 11. Out of scope

- Any copy rewrite of catalog entries (the G3 hybrid split was rejected at design time).
- Portaling the HoverHelp popover or guaranteeing scroll-container containment (A6; filed as `BL-HOVERHELP-PORTAL`).
- Re-specifying hosted control state machines this work does not modify (§6.3).
- HealthAlertsPanel help wiring, pagination, and section chrome.
- Dark theme work; the admin app renders the light-theme runtime tokens (app/globals.css:285-303).
- StagedReviewCard and BulkIgnoreControls internals beyond their PerShowActionableWarnings embed.
