# Show Alert Compact — compact footer-bar alert cards

**Date:** 2026-07-20
**Source design:** claude.ai/design project `16f7daf6-41a8-4c4f-a04c-119bf8dcea3b`, file `Show Alert Compact.dc.html`, iterated with the user to treatment C + G2. Committed mock snapshot: `docs/superpowers/specs/2026-07-20-show-alert-compact-mock/guidance-placement.html` (final iteration; shows the treatment-C detail band and all three guidance-placement options, G2 ratified).
**Authorization:** user approved design AND autonomous ship-to-merged-PR 2026-07-20 00:55 CDT (AGENTS.md brainstorming gate).

## 1. Overview

Restyle the three amber alert-card surfaces into a compact three-band card: message row on top, optional detail band, divided footer bar holding the deep link + relative time on the left and the primary action on the right. Longform help folds into a quiet `?` popover. Roughly half the vertical spend of the current stacked banner; same design tokens.

Surfaces:

1. `components/admin/review/AttentionBanner.tsx` — per-alert inline banner in the published-show review modal (AttentionBanner.tsx:43).
2. `components/admin/PerShowActionableWarnings.tsx` — operator-actionable parse-warning cards (PerShowActionableWarnings.tsx:22). Consumers: `components/admin/showpage/sectionWarningExtras.tsx`, `components/admin/StagedReviewCard.tsx`, `components/admin/BulkIgnoreControls.tsx`, `app/admin/show/staged/[stagedId]/page.tsx`.
3. `components/admin/telemetry/HealthAlertsPanel.tsx` — per-row health-alert items on the dev telemetry page (`HealthAlertRowItem`, HealthAlertsPanel.tsx:155-160 action branch).

Non-goals: every other `bg-warning-bg` usage (inline form errors, pills, badges, count chips, `app/help` Callouts, panel-level degraded fallbacks such as HealthAlertsPanel.tsx:214-228) is untouched.

## 1.1 Resolved scope — do not relitigate

All items below were ratified interactively with the user on 2026-07-19/20 (session decision record) or are pinned by existing code. Verify the contract; do not re-derive it.

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | Scope = the three surfaces above; inline errors/badges/pills untouched | User selection "All three incl. HealthAlertsPanel" |
| R2 | Shared presentational shell `CompactAlertCard` + shared help-popover primitive; surfaces become adapters | User selection "Shared shell + popover primitive" |
| R3 | Help popover, not icon-link and not text link (G2): `helpfulContext` + route-gated Learn-more live inside the popover | User selections "Icon-button popover", "g2" |
| R4 | The popover primitive is the EXISTING `HoverHelp` (components/admin/HoverHelp.tsx:51) with a custom amber trigger and an Escape-containment fix — not a new component. Refines R2's "new HelpPopover" to reuse; behavior contract unchanged | HoverHelp already implements trigger/aria-expanded/Escape/learnMore (HoverHelp.tsx:110-121, 78-88); building a duplicate would violate reuse |
| R5 | Detail band = treatment C: own band between message and footer, dashed divider, caps micro-label + weighted values, mono sheet-row quote; band absent when no detail data | User: "yes commit to c" |
| R6 | AttentionBanner identity sub-line DELETED (modal supplies show context) | User: "i dont think we need the … line right since this alert appears in the show modal" |
| R7 | Parse-warning footer has NO timestamp — `ParseWarning` (lib/parser/types.ts:48) carries none | Approved in design section 2 |
| R8 | Ignore controls stay in footer right via the existing `renderItemControls` slot (PerShowActionableWarnings.tsx:31) | User: "ignore control placement confirmed" |
| R9 | All state transitions instant, no animation | Approved in design section 3 |
| R10 | Existing tokens only; no new `@theme` block. Mock hexes are design-canvas styling; the app renders the light-theme runtime values (app/globals.css:285-303) | Approved in design section 3; design file text "Same tokens as the current banner" |
| R11 | "✓ Confirmed" in-place swap and mounted-wrapper contract unchanged (AttentionBanner.tsx:68-74 and header comment 17-19) | Prior spec published-show-alerts §5.4; out of scope to change |
| R12 | HealthAlertsPanel stays a server component; popover is a client leaf | Approved in design section 2 |

**Amendments after adversarial round 1** (each forced by live code that contradicted a design-time assumption of MINE, not a user decision; the user's intent is preserved in every case):

| # | Amendment | Why |
|---|-----------|-----|
| A1 | R8 refined: compact controls go in `footerRight`; EXPANSIVE control clusters go in a new `controlsBand` below the footer (§3.3) | `renderItemControls` returns three full control components, not an Ignore button (sectionWarningExtras.tsx:35-60). R8's intent (controls at the card's bottom, footer stays compact) is preserved; only the container changes |
| A2 | R9 scoped: "instant" governs CARD states. The help popover's pre-existing `duration-fast` fade (HoverHelp.tsx:189) is inherited unchanged | R9 was ratified about the card; the primitive's fade predates this work and is out of scope to remove |
| A3 | §1's "half the vertical spend" scoped to card chrome, not to hosted control clusters | Follows from A1 |
| A4 | `shouldEmitLearnMore` is ADDED at the help adapter (it is not applied on these surfaces today) | Earlier draft asserted the gate already applied; false (AttentionBanner.tsx:93, attentionItems.ts:224) |
| A5 | HealthAlertsPanel rows pass `tone="muted"` / no stripe, keeping today's neutral skin + weight badge | Shell defaults (`warning`/`review`) would have re-skinned severity semantics (HealthAlertsPanel.tsx:86-88) |

## 2. Visual design

Card = vertical flex, `rounded-sm border border-border border-l-[3px] bg-warning-bg` with the existing stripe channel (`border-l-status-review` / `border-l-status-degraded`, AttentionBanner.tsx:56).

Bands, top to bottom:

1. **Message row** — `flex gap-2.5 p-3 pb-2.5`: severity glyph (existing card semantics; a 16px round `!` marker, `aria-hidden`), message block (`text-sm font-semibold text-text-strong`, emphasis-rendered), optional `?` help trigger at row end.
2. **Detail band** (optional) — `border-t border-dashed border-warning-text/25`, `px-3 py-1.5`, horizontal wrap of detail entries. Entry = caps micro-label (`text-[10px] uppercase tracking-wider font-semibold text-warning-text/70`) + value (`text-xs font-semibold text-text`). Numeric counts `tabular-nums`. Sheet-row quotes render in `font-mono text-xs`. Band renders ONLY when at least one entry exists.
3. **Footer bar** — `border-t border-warning-text/20`, `flex items-center justify-between gap-3 px-3 py-2`. Left cluster: primary link(s) + `·` separator + relative time, `text-xs text-text-subtle`. Right: one compact control (§3.3) — action button or auto-clear note (`text-xs italic text-text-subtle`).

   **Containment contract** (single-line is a goal, staying inside the card is the invariant). Live action labels run long — "Open branch settings", "Review & re-sync" (lib/adminAlerts/alertActions.ts:75, 113) — beside a 44px-tall button, so a naive `flex justify-between` with `nowrap` would overflow the card rather than wrap. Required classes:
   - bar: `flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5`;
   - left cluster: `flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1`;
   - link labels: `min-w-0 truncate` so a long single label ellipsizes instead of pushing the row wide;
   - right cluster: `shrink-0`.

   Behavior at narrow widths: the left cluster wraps to a second line before anything overflows; the action button never shrinks below its tap target. This is a two-line footer at 320px for long-label alerts, which is CORRECT and preferred over overflow. The Playwright assertion (§9) therefore checks CONTAINMENT (every footer child's rect inside the card's padding box) as the hard invariant, and single-line-ness only for the short-label fixture.

4. **Controls band** (optional, §3.3) — `border-t border-warning-text/20 px-3 py-2`, full width, no height cap, no overflow, no transform.

Muted tone (`tone="muted"`, ignored list): swap `bg-warning-bg` for `bg-surface-sunken`, drop the stripe, dividers become `border-border`; ring offsets follow (PerShowActionableWarnings.tsx:49-52 pattern).

## 3. Components

### 3.1 `CompactAlertCard` (NEW FILE created by this work: `components/admin/CompactAlertCard.tsx (new, does not exist yet)`)

Pure presentational shell. No data fetching, no state.

```ts
type CompactAlertCardProps = {
  message: ReactNode;                 // required; rendered in message row
  helpTrigger?: ReactNode;            // rendered at message-row end
  detailBand?: ReactNode;             // dashed-divider band; omitted when the host passes nothing
  footerLeft?: ReactNode;             // left cluster of the footer bar
  footerRight?: ReactNode;            // right cluster of the footer bar (compact controls only)
  controlsBand?: ReactNode;           // full-width band BELOW the footer, for expansive controls (§3.3)
  tone?: "warning" | "muted";        // default "warning"
  stripe?: "review" | "degraded" | "none"; // default "review"
  className?: string;                 // extra classes merged onto the card root
};
```

Rules:

- The shell renders the `!` glyph itself; hosts never duplicate it.
- Shell owns the tone/stripe class map; hosts pass enums, never class strings.
- **Slot presence is decided by the HOST, not by the shell inspecting children.** The shell treats a slot as present iff the prop is not `null`/`undefined`/`false`. It does NOT attempt to detect "a ReactNode that renders nothing" (impossible without rendering; an empty `<>` or a component returning null is indistinguishable from content at the shell boundary). Every adapter therefore computes each slot as an explicit conditional expression that evaluates to `null` when it has no content — this is the contract the adapter tests assert, and it is what keeps empty bands and empty bars from rendering. Restated as the invariant the shell tests pin: **the shell must never emit a band or bar whose only content is a nullish slot.**
- Band/bar presence:
  - detail band + its dashed divider render iff `detailBand` is present;
  - footer bar renders iff `footerLeft` OR `footerRight` is present;
  - controls band + its divider render iff `controlsBand` is present.
- `message` is required and non-nullable at the type level. An empty-string message is an adapter bug, not a shell state: every adapter's message expression terminates in a non-empty fallback (`ATTENTION_FALLBACK_TITLE` for AttentionBanner, `"Data quality issue"` for PerShowActionableWarnings, the catalog heading for HealthAlertsPanel). Pinned per adapter, not in the shell.
- `tone`/`stripe` are non-nullable unions with defaults; there is no null/NaN case. `tone="muted"` forces `stripe="none"` inside the shell regardless of the passed value, so a muted card can never carry a semantic stripe.
- `className` is merged, never replaces the shell's own classes; hosts use it for spacing only. `data-*`/`aria-*` attributes stay on a host-owned wrapper element, not on the shell.

### 3.3 Footer right vs controls band (BLOCKING R1 repair, amends R8)

R8 ratified "ignore controls stay in the footer right" on the understanding — stated by me during design, and WRONG — that `renderItemControls` yields a single Ignore button. Live code refutes this: `SectionWarningItemControls` (components/admin/showpage/sectionWarningExtras.tsx:35-60) returns `DataQualityWarningControls` + `UseRawControlBoundary` + `RoleRecognizeControlBoundary` together. Those render, respectively, a Report/Ignore button pair with multiline inline errors, a full-width two-row radio interface (components/admin/UseRawControl.tsx:472), and an expandable role editor with its own mount animation and spinner (components/admin/RoleRecognizeControl.tsx:83, 343). None of that fits a single-row footer's right cluster.

Amended contract, preserving R8's intent (controls stay at the bottom of the card, footer stays compact):

- `footerRight` accepts ONLY compact single-control content: one button, one link, or one short note. AttentionBanner (resolve button / auto-clear note) and HealthAlertsPanel (resolve button / auto-resolve note) use it.
- `controlsBand` is a full-width band below the footer bar, `border-t border-warning-text/20 px-3 py-2`, for expansive control clusters. **PerShowActionableWarnings passes its `renderItemControls` output here, and leaves `footerRight` unset.** The controls keep their own internal layout, states, and animations untouched; the band is a container, nothing more.
- Consequence for the compact goal: warning cards WITH controls are not shorter than today (the controls dominate their height); the compact win is on the message/detail/footer chrome above them, and on every card without controls (StagedReviewCard's embed passes no `renderItemControls` at all — components/admin/StagedReviewCard.tsx usage). This is stated so the reviewer does not read "half the vertical spend" (§1) as a claim about controls-bearing cards. §1's claim is hereby scoped to the chrome, not to hosted control clusters.

### 3.2 `HoverHelp` extension (edit, `components/admin/HoverHelp.tsx`)

Reused as the help popover. Changes:

1. **Escape containment.** Add an element-level `onKeyDown` on the root wrapper: when `open` and `e.key === "Escape"`, `e.preventDefault(); e.stopPropagation(); close`.

   Mechanism, verified against live code: `ReviewModalShell`'s Escape handler is a `document`-level native listener that closes unconditionally — it does NOT inspect `defaultPrevented` (ReviewModalShell.tsx:239-245). Containment therefore rests ENTIRELY on `stopPropagation`, not on `preventDefault`. React attaches synthetic handlers at the root container, which sits below `document`, so stopping propagation in the React handler prevents the native event from ever reaching the shell's listener. (This checkout runs React 19.2.4, package.json:76; root-container delegation is unchanged from 18 and the mechanism holds. Earlier drafts said "React 18" — corrected.) This is the same mechanism `CrewRowActions` already relies on (components/admin/wizard/CrewRowActions.tsx:115-121); its inline comment describing the shell as "ignoring defaultPrevented" is inaccurate about the shell, but its code is correct. `preventDefault` is kept for defense in depth only.

   The existing window-level listener (HoverHelp.tsx:111-121) stays for hover-open and focus-outside dismissal. Residual, accepted: a mouse-hover-opened popover inside the modal still closes together with the modal on Escape, because that path never reaches a React handler. Pre-existing HoverHelp behavior, not a regression.
2. **Custom trigger fit.** No API change needed — `trigger` prop (HoverHelp.tsx:65) accepts the amber `?` trigger node. Trigger keeps `min-h-tap-min min-w-tap-min` hit area (HoverHelp.tsx:164) with a 22px visual glyph.
3. `align="right"` used on cards (existing prop, HoverHelp.tsx:68).

**Pre-existing popover behaviors this spec inherits and does NOT change** (each verified live; listed because the transition/test sections depend on them):

- The popover body stays MOUNTED while closed and is hidden with `hidden` (display:none), so `aria-describedby` always resolves (HoverHelp.tsx:174-179, 202). Any test that asserts popover content must therefore assert VISIBILITY, never mere presence (§9).
- Opening is not instant: the body carries `transition-[opacity,display] duration-fast transition-discrete starting:opacity-0` (HoverHelp.tsx:189). R9's "instant" ratification covers the CARD's own states; this fade is pre-existing HoverHelp behavior, in scope for neither change nor removal, and is recorded in the §6 inventory as such rather than asserted to be instant.
- The popover is absolutely positioned IN FLOW, not portaled (HoverHelp.tsx:193). Clipping ancestors therefore matter — see §8 and §9.

**Help adapter contract** (single normative statement; earlier drafts contradicted themselves between a general rule and the AttentionBanner mapping):

- A card renders a help trigger iff `popoverBody` is non-empty, where `popoverBody` = the surface's `helpfulContext` (when a non-empty string) plus a Learn-more link (when the surface has a non-empty `helpHref` AND `shouldEmitLearnMore` passes for the current route). Both absent ⇒ no trigger, no `HoverHelp` element at all.
- `shouldEmitLearnMore` (lib/messages/renderer-gate.ts:17) is NOT applied on either surface today: AttentionBanner tests `a.helpHref` directly (AttentionBanner.tsx:93) and `attentionItems` copies the catalog href unconditionally (lib/admin/attentionItems.ts:224). This spec ADDS the gate at the adapter, feeding it `usePathname()` from the client component (the same default `HelpAffordance` uses, components/admin/HelpAffordance.tsx). Stated as a deliberate behavior change, not a restatement of current behavior.
- Required `HoverHelp` inputs, specified per surface because they carry accessible names and test hooks: `label` = `"What does this mean?"` on every card (it names the trigger and scopes the Learn-more accessible name, HoverHelp.tsx:61, 216); `align="right"`; `testId` = `` `attention-banner-help-${a.alertId}` `` on AttentionBanner and `` `per-show-actionable-help-${key}` `` on PerShowActionableWarnings (keys from `stableWarningKeys`), so trigger/body testids derive as `<testId>-trigger` / `<testId>-body`; `rootTestId` = the affordance-matrix id registered per §10.

## 4. Surface mappings

### 4.1 AttentionBanner (components/admin/review/AttentionBanner.tsx)

- Message: `renderCatalogEmphasis(a.template, a.params)` else `ATTENTION_FALLBACK_TITLE` (unchanged source, AttentionBanner.tsx:78).
- Help trigger: per the §3.2 adapter contract. Body = `lookupHelpfulContext(a.code, a.params)` (lib/messages/lookup.ts:120) when it returns a non-empty string; Learn-more = `a.helpHref` when non-empty AND `shouldEmitLearnMore({ route: usePathname(), helpHref: a.helpHref })` passes. `helpfulContext` empty and Learn-more gated off ⇒ no trigger. Learn-more present without `helpfulContext` ⇒ body is the one-line lead-in "More about this alert in the help pages." plus the link. The freestanding "Learn more" quiet link (AttentionBanner.tsx:93-101) is deleted.
- Detail band entries: `Failed` → `failedKeys.join(" · ")` when non-empty (AttentionBanner.tsx:102-109); `Dropped` → `formatDataGapBreakdown(a.dataGaps)` when non-null (AttentionBanner.tsx:110-117). Testids `attention-banner-failed-sources-*` / `attention-banner-data-gaps-*` preserved on the entries.
- Identity sub-line (`showIdentity`, AttentionBanner.tsx:57-60, 118-125) DELETED along with the `INLINE_IDENTITY_CODES` import; `testid="attention-banner-identity"` removed. `menuSubtitle` remains in `AttentionItem` (lib/admin/attentionItems.ts:54) for the AttentionMenu; `underCrewRow` prop is removed from the component signature and its two call sites, verified live: `components/admin/showpage/PublishedReviewModal.tsx` (the `bannerFor` helper) and `tests/components/admin/review/attentionBanner.test.tsx`. **Meta-test impact, corrected** (an earlier draft claimed these hold banner registry rows that go vacuous — false, and the correction matters because acting on the false claim would have weakened a live global guard): `tests/adminAlerts/_metaInlineIdentityContract.test.ts` contains NO AttentionBanner rows. It proves a bidirectional equality between catalog identity placeholders and `INLINE_IDENTITY_CODES` (_metaInlineIdentityContract.test.ts:26-45), a contract still consumed by `components/admin/BellPanel.tsx`; `tests/messages/_metaAdminAlertCatalog.test.ts` consumes the same set for interpolation coverage (_metaAdminAlertCatalog.test.ts:613). Deleting the banner's sub-line touches NEITHER contract, and neither file may be edited by this work. `INLINE_IDENTITY_CODES` remains exported and consumed; only AttentionBanner's import of it goes away.
- Footer left: action link (label + external `↗`, unchanged semantics AttentionBanner.tsx:81-91) then `·` then `Raised <relative>` time (`formatRelativeRaisedAt`, lib/admin/attentionItems.ts:172; `<time dateTime>` + `suppressHydrationWarning` kept, AttentionBanner.tsx:126-131). No action ⇒ time alone.
- Footer right: `PerShowAlertResolveButton` (components/admin/PerShowAlertResolveButton.tsx:48) when actionable; else auto-clear note `a.autoClearNote` right-aligned italic (AttentionBanner.tsx:132-148). Auto-clear cards keep time on the left.
- Confirmed swap, `data-attention-anchor`, `aria-current`, testids: unchanged (R11).

### 4.2 PerShowActionableWarnings (components/admin/PerShowActionableWarnings.tsx)

- Message: catalog title / human-message fallback logic unchanged (PerShowActionableWarnings.tsx:56-61).
- Help trigger: body = `entry.helpfulContext` when non-empty (PerShowActionableWarnings.tsx:62); the inline context line (PerShowActionableWarnings.tsx:90-92) moves into the popover body. No Learn-more on this surface (no `helpHref` wiring exists today; none added), so the route gate is not consulted here.
- Detail band: `Sheet row` → `labelFromRawSnippet(w.rawSnippet)` mono, UNKNOWN_FIELD gate unchanged (PerShowActionableWarnings.tsx:79-80); testid `per-show-actionable-row-label` preserved.
- Footer left: `Open in Sheet ↗` iff `buildSheetDeepLink(driveFileId, w.sourceCell)` returns a href (PerShowActionableWarnings.tsx:63, 93-102). Note the two-input guard: a non-null `sourceCell` with a NULL `driveFileId` yields no link, so the adapter branches on the RESULT, never on `sourceCell` alone. No timestamp (R7). No href ⇒ `footerLeft` is null; with `footerRight` also unset (§3.3) the footer bar is omitted entirely and the card degrades to message(+detail)(+controls) bands.
- Controls: `renderItemControls(w, i)` output goes to `controlsBand`, NOT `footerRight` (§3.3 amends R8). Absent prop ⇒ `controlsBand` null ⇒ no band, matching StagedReviewCard's embed.
- `tone="muted"` maps to shell muted skin; key stability via `stableWarningKeys` unchanged (PerShowActionableWarnings.tsx:40).

### 4.3 HealthAlertsPanel (components/admin/telemetry/HealthAlertsPanel.tsx)

Per `HealthAlertRowItem` row:

- **Skin (explicit — the shell defaults are WRONG for this surface).** Live rows are neutral: `border border-border bg-surface`, with severity carried by the weight badge, not by the container (HealthAlertsPanel.tsx:86-88, badge at 96-103). That semantic is preserved: every Health row passes `tone="muted"` — which forces `stripe="none"` per §3.1 — and keeps the existing weight badge inside `message`. Health rows never inherit `tone="warning"` or a `stripe`, and the `degraded` vs `notice` distinction stays exactly where it is today (the badge), so no row is re-skinned by severity. The `weight` prop (HealthAlertsPanel.tsx:62-68) continues to drive only the badge.
- Message row: heading line + weight badge (existing markup, kept inside `message`).
- Detail band entries: detail template, follow-up template, `identityText`, `occurrence_count` occurrences (HealthAlertsPanel.tsx:106-133). Templates are sentence-length: they render as full-width entries (band wraps), not label/value pairs.
- Footer left: `View show` link when present, action link when present, `·` separators BETWEEN present items only (zero items ⇒ time alone with no leading separator; one item ⇒ one separator; both ⇒ two), then `Raised <relative>` (HealthAlertsPanel.tsx:126-152). Separator joining is a `.filter(Boolean)`-then-interleave, never a fixed template.
- Footer right: `HealthAlertResolveButton` or `autoResolveNote(row.code)` italic (HealthAlertsPanel.tsx:155-160).
- No help popover on this surface (no helpfulContext wiring today; none added). Panel headings, sections, Load more, empty and degraded states untouched.

## 5. Guard conditions

Two tiers, because the shell and the adapters have genuinely different input domains. Shell guards are pinned by shell tests; adapter guards by each adapter's suite (§9). The earlier draft's claim that shell tests cover every row is withdrawn — most rows below are adapter conditions the shell cannot see.

### 5.1 Shell inputs (`CompactAlertCard`)

| Input | Value | Behavior |
|-------|-------|----------|
| `message` | any ReactNode (required, non-nullable type) | rendered; emptiness is an adapter bug, guarded per adapter |
| `helpTrigger` | null / undefined / false | no trigger element; message spans full width |
| `helpTrigger` | present | rendered at message-row end |
| `detailBand` | null / undefined / false | NO band element, NO dashed divider |
| `detailBand` | present | band + divider |
| `footerLeft`, `footerRight` | both nullish | NO footer bar, NO divider |
| `footerLeft` XOR `footerRight` | one present | footer bar renders; `justify-between` still pins the present side to its edge |
| `controlsBand` | nullish / present | band + divider omitted / rendered |
| `tone` | omitted | `"warning"` |
| `tone` | `"muted"` | muted skin AND `stripe` forced to `"none"` |
| `stripe` | omitted | `"review"` |
| `className` | omitted / present | merged onto the card root; never replaces shell classes |

A slot holding a ReactNode that itself renders nothing (empty fragment, component returning null) is NOT detectable at the shell boundary and is explicitly the adapter's responsibility (§3.1). The shell test asserts the nullish cases only.

### 5.2 Adapter inputs

| Surface | Input | Value | Behavior |
|---------|-------|-------|----------|
| AttentionBanner | `item.kind !== "alert"` or `item.alert` falsy | — | component returns null (unchanged, AttentionBanner.tsx:52) |
| AttentionBanner | `a.template` | null | `ATTENTION_FALLBACK_TITLE` (unchanged) |
| AttentionBanner | `a.action` | null | footer left = time alone, no leading separator |
| AttentionBanner | `a.failedKeys` | null, `[]`, or every entry empty/whitespace after trim | no Failed entry (entries are trimmed and empties dropped BEFORE the emptiness test) |
| AttentionBanner | `a.dataGaps` | null | no Dropped entry |
| AttentionBanner | `a.dataGaps.total` | 0, negative, or NaN | no Dropped entry — the adapter requires `Number.isFinite(total) && total > 0` before calling `formatDataGapBreakdown` |
| AttentionBanner | `a.autoClearNote` | non-empty | footer right = italic note, no resolve button |
| AttentionBanner | `a.autoClearNote` | null or empty/whitespace | footer right = resolve button |
| AttentionBanner | `helpfulContext` empty/whitespace AND Learn-more gated off | — | no trigger, no `HoverHelp` element |
| PerShowActionableWarnings | `items.length === 0` | — | component returns null (unchanged, PerShowActionableWarnings.tsx:37) |
| PerShowActionableWarnings | `buildSheetDeepLink(driveFileId, w.sourceCell)` | null (incl. non-null `sourceCell` with null `driveFileId`) | no Open in Sheet link |
| PerShowActionableWarnings | `labelFromRawSnippet(w.rawSnippet)` | null, empty, or code ≠ UNKNOWN_FIELD | no Sheet-row entry |
| PerShowActionableWarnings | `entry.helpfulContext` | null or empty/whitespace | no trigger |
| PerShowActionableWarnings | `renderItemControls` | absent | `controlsBand` null ⇒ no controls band |
| PerShowActionableWarnings | title, human message, and catalog title all empty | — | `"Data quality issue"` fallback (unchanged, PerShowActionableWarnings.tsx:61) |
| HealthAlertsPanel | `row.identityText` | null or empty/whitespace | no identity entry |
| HealthAlertsPanel | `occurrence_count` | 1 | "1 occurrence" (unchanged singular/plural, HealthAlertsPanel.tsx:132) |
| HealthAlertsPanel | `occurrence_count` | 0, negative, or non-finite | no occurrences entry — the adapter requires `Number.isFinite(n) && n > 0` |
| HealthAlertsPanel | `row.show_id`/`row.slug` and `action` | any combination of present/absent | separators interleave between present items only (§4.3) |
| HealthAlertsPanel | detail/follow-up templates | null | those entries absent; band absent iff ALL entries absent |

## 6. Transition inventory

Scope note: this inventory covers states the CARD owns or hosts. Controls mounted inside `controlsBand` keep their own internal state machines unchanged; they are enumerated as hosted states (§6.2) so the container change is auditable, but this work neither adds nor alters a transition inside them.

### 6.1 Card-owned states

D = card default. P = help popover open. C = confirmed swap (AttentionBanner only). Ep = inline resolve error inside `PerShowAlertResolveButton` (PerShowAlertResolveButton.tsx:46, 92-94). Rp = resolve request in flight.

| Pair | Treatment |
|------|-----------|
| D↔P | NOT instant, and deliberately so: pre-existing HoverHelp opacity/display fade, `duration-fast` with `transition-discrete` + `starting:opacity-0` (HoverHelp.tsx:189). Inherited unchanged; R9's instant ratification scopes to card states, not to this pre-existing primitive |
| D→Rp | button-internal pending state, unchanged component, instant |
| Rp→C | instant swap (existing behavior, AttentionBanner.tsx:68-74) |
| Rp→Ep | inline error line appears, instant |
| Ep→Rp | retry: error clears, pending returns, instant (PerShowAlertResolveButton.tsx:52 re-entry) |
| Ep→C | reachable — a retry after a failure succeeds and swaps. Instant. (Absent from the earlier draft) |
| P→C, P→Ep, P→Rp | popover and resolve state are independent subtrees; each transitions as above with the popover still open. On C the whole body swaps, unmounting the popover with it |
| C→D, C→P, C→Ep | never — the confirmed card is terminal until `router.refresh()` reconciles it away (R11) |

HealthAlertsPanel's resolve button has a pending state but NO inline error state (HealthAlertResolveButton.tsx:19), so Ep and Ep-derived pairs do not exist on that surface. The earlier draft attributed an error state to both buttons; corrected.

Compound: resolve in flight while the popover is open, and popover opened mid-request, are both covered by the P-row above (no shared state, no ordering hazard). A popover fade interrupted by the C swap simply unmounts mid-fade; no cleanup is required because the fade is CSS-only with no timers.

### 6.2 Hosted control states (PerShowActionableWarnings `controlsBand`, unchanged by this work)

Enumerated for auditability because §3.3 moves these controls into a new container: `DataQualityWarningControls` idle/running/error with multiline inline errors (DataQualityWarningControls.tsx:67); `UseRawControl` two-row radio interface with its own pending/applied states (UseRawControl.tsx:472); `RoleRecognizeControl` collapsed/editor/saving/saved/stale/conflict, including a mount animation and spinner (RoleRecognizeControl.tsx:83, 343). This work changes none of their internals, adds no transition, and removes none. The container band imposes no height, no overflow, and no transform, so no hosted animation is clipped or confined. Compound with P: the popover is anchored in the message row, the controls band is below the footer; they share no state and cannot overlap.

`tests/components/admin/transitionAudit.test.tsx` (which already scans `components/admin/review/AttentionBanner.tsx`, transitionAudit.test.tsx:41) is extended with `components/admin/CompactAlertCard.tsx (new)` and pins the new conditional blocks as motion-free source.

## 7. Dimensional invariants

None. No fixed-height/width parent with flex/grid children is introduced: card and all bands are content-sized; footer buttons keep their own fixed heights internally. Declared explicitly per AGENTS.md: N/A, no fixed-dimension parent.

## 8. Accessibility

- Popover: existing HoverHelp contract — trigger `aria-expanded`; body `role="tooltip"` without Learn-more, disclosure with `aria-controls` when Learn-more present (HoverHelp.tsx:78-88). Focus stays on trigger (no focus move into popover; link reachable by Tab per existing HoverHelp order). The body stays mounted-but-`hidden` while closed (HoverHelp.tsx:174-179, 202), which is what keeps `aria-describedby` resolvable; it also means "present in the DOM" proves nothing about openness (§9).
- **Clipping.** `HoverHelp` positions its body absolutely IN FLOW (HoverHelp.tsx:193) — it is not portaled. On the AttentionBanner surface the card sits inside a scroll container (`overflow-y-auto`, ShowReviewSurface.tsx:869) nested in an `overflow-clip` modal panel (ReviewModalShell.tsx:614), so a popover extending past either ancestor's box IS visually clipped even though `getBoundingClientRect()` still reports the full unclipped rectangle. The contract this spec adopts: the popover must remain within the SCROLL CONTAINER's visible box, achieved by `align="right"` plus HoverHelp's existing `max-w-[80vw]` / `max-h-[min(60vh,24rem)]` caps, and `placement="bottom"` except for cards in the last 40% of the scroll viewport, which pass `placement="top"` (existing prop, HoverHelp.tsx:68-77). The §9 assertion measures against the ancestors' rects, not the card's, because a card-relative check cannot detect this class at all.
- Escape: contained per §3.2. Focus after P→C swap: trigger unmounts; browser default drops focus to body — acceptable because swap is user-initiated from the resolve button (focus was there, and that button also unmounts today; behavior unchanged from shipped swap).
- Tap targets ≥44px: help trigger via `min-h-tap-min min-w-tap-min`; footer links keep `inline-flex min-h-tap-min items-center` (AttentionBanner.tsx:86, HealthAlertsPanel.tsx:138).
- Glyph `!` is `aria-hidden`; severity remains conveyed by text and existing testid/weight badge semantics.
- No `role="alert"` additions (cards are server-rendered lists, not live regions).
- Copy: no em-dashes, straight apostrophes per project copy rules; all message text still flows through catalog lookup (invariant 5 — no raw codes).

## 9. Testing

Unit (vitest + RTL):

- Shell: every §5.1 row as an assertion — nullish `detailBand`/`controlsBand`/both-footer-slots emit no band, no bar, and NO divider element (assert the divider class is absent, not merely that text is missing); one-slot footer still renders; `tone="muted"` forces `stripe="none"` even when a stripe is passed.
- AttentionBanner adapter: `tests/components/admin/review/attentionBanner.test.tsx` updated — identity assertions and the `underCrewRow` prop removed; footer composition asserted (action + time left, resolve right; auto-clear note right with time still left); failed/dropped entries in the band including the `total: 0` and NaN cases from §5.2; trigger presence driven by the §3.2 contract (helpfulContext-only, Learn-more-only, both, neither) with `shouldEmitLearnMore` exercised for an admin route and a gated-off route; freestanding Learn-more link gone. Confirmed-swap tests unchanged; Ep→C retry-then-succeed added per §6.1.
- PerShowActionableWarnings: `tests/admin/perShowActionable*.test.tsx` + `tests/parser/parseWarningDeepLinkRender.test.tsx` updated — helpfulContext asserted in the popover body (VISIBILITY, see below), row-label mono entry, `sourceCell` present with `driveFileId` null yields no link, footer omitted when neither link nor controls, controls land in `controlsBand` and NOT in the footer (assert the controls node's ancestor band), muted tone, key stability untouched.
- HealthAlertsPanel: `tests/components/healthAlertsPanel*.test.tsx` updated for band/footer composition, the `tone="muted"`/no-stripe skin, separator interleaving across all four link-presence combinations, and `occurrence_count` 0/1/negative.

**Popover assertions must prove openness, not presence.** The body is in the DOM while closed (HoverHelp.tsx:174-179, 202), so a testid/text query passes even if opening is broken. Every popover assertion therefore asserts computed visibility — `expect(body).not.toBeVisible()` before the interaction and `toBeVisible()` after (jest-dom resolves `display:none` from the `hidden` class) — and the concrete failure mode each catches is stated in the test name. The earlier draft's "clone the card and strip the message row" instruction is WITHDRAWN: the popover body is nested inside the `HoverHelp` root, which IS the message-row-end trigger, so that clone would delete the subject under test. Where a label appears in both message and popover, disambiguation is by testid scoping (`<testId>-body`), not by tree surgery.

**Escape containment test** (the earlier draft's version could pass while the modal still closed):

- Render the card inside a real `ReviewModalShell`, open the popover, dispatch Escape from inside the popover.
- Assert: popover closed AND the shell's `onDismiss`/close callback NOT called. That is the load-bearing assertion — it exercises the actual `document`-level native listener rather than a stand-in.
- Do NOT assert `defaultPrevented` as proof of containment; the shell ignores it (§3.2). A synthetic-parent-handler spy is likewise insufficient on its own.
- Regression pair: a CLOSED popover does not swallow Escape (shell closes normally).

Anti-tautology: expected strings derive from fixture data (catalog entries, fixture `failedKeys`), never read back off the rendered container; band-membership assertions scope to the band element so a value rendered in the message row cannot satisfy them.

Real-browser (Playwright, existing standalone harness pattern):

- **Footer containment (hard invariant):** at 400px and 320px card widths, with BOTH a short-label fixture and the longest live action label ("Open branch settings", lib/adminAlerts/alertActions.ts:75), every footer child's `getBoundingClientRect()` lies within the card's padding box (left/right within 0.5px tolerance). Catches the overflow a nowrap layout would produce, which a wrap-only check cannot see.
- Single-line check applies ONLY to the short-label fixture: left cluster and button vertical centers within 0.5px, one flex line. The long-label fixture is asserted to wrap to two lines WITHOUT overflowing — wrapping is correct behavior (§2), not a failure.
- Help trigger hit area ≥44×44 via `getBoundingClientRect`.
- **Popover clipping, measured against the real ancestors:** render the AttentionBanner card inside the actual modal (scroll container + `overflow-clip` panel, §8), open the popover on the LAST card in the scroll viewport, and assert the popover rect is contained within the scroll container's client rect. Card-relative assertions are explicitly insufficient and are not used.

Gates: impeccable critique + audit on the diff (invariant 8); `pnpm spec:lint` + citation/numeric transcripts attached to review dispatches; full suite + typecheck + eslint + format:check before push.

## 10. Meta-test inventory

Every source-scanning registry this diff touches, enumerated. A missing row here is a CI failure at implementation time, which is why the list is exhaustive rather than representative.

- **EXTENDS** `tests/components/admin/transitionAudit.test.tsx` — already scans `components/admin/review/AttentionBanner.tsx` (transitionAudit.test.tsx:41); `components/admin/CompactAlertCard.tsx (new)` is added to the same motion-free list.
- **EXTENDS** `tests/components/admin/dataGapsTransitionAudit.test.tsx` — source-scans AttentionBanner and pins the EXACT conditional `/\{a\.dataGaps \? \(/` (dataGapsTransitionAudit.test.tsx:147). §5.2 changes that guard to require a positive finite `total`, so the pinned regex no longer matches and MUST be updated in the same commit as the component change. This scanner was missing from the earlier draft.
- **EXTENDS** `tests/help/_metaAffordanceMatrixParity.test.ts` — every `<HoverHelp` call site must reference a live affordance-matrix testid or carry an explicit exemption (_metaAffordanceMatrixParity.test.ts:76). Both new call sites (AttentionBanner, PerShowActionableWarnings) therefore need matrix rows with `rootTestId` wired, per §3.2.
- **EXTENDS** `app/help/_affordanceMatrix.ts` + `tests/help/_affordance-matrix-shape.test.ts` — adding matrix rows changes the finite row set and its pinned count (_affordance-matrix-shape.test.ts:37, 98) and feeds the Playwright affordance walker, so counts and walker expectations are updated in the same commit. The matrix's current comment states per-alert education IS a freestanding `helpHref` link on AttentionBanner (app/help/_affordanceMatrix.ts:105-112); this work invalidates that statement and rewrites it to describe the popover.
- **NOT TOUCHED, and must not be edited:** `tests/adminAlerts/_metaInlineIdentityContract.test.ts` and `tests/messages/_metaAdminAlertCatalog.test.ts`. Both pin catalog-level contracts around `INLINE_IDENTITY_CODES` that survive the banner's identity-line removal intact (§4.1). The earlier draft wrongly listed the first as needing updates.
- No new admin route, table, or `admin_alerts` code ⇒ §12.4/catalog gates and invariant-10 mutation registries unaffected (no new mutation surface; resolve routes untouched).
- Supabase call-boundary meta-test: no new Supabase call sites ⇒ no registry rows.
- Advisory locks, email canonicalization, sync cursor: not touched (pure UI diff).

## 11. Out of scope

- Any copy rewrite of catalog entries (G3 hybrid split rejected).
- HealthAlertsPanel help wiring, pagination, sections.
- Dark theme work; admin app renders light-theme runtime tokens (app/globals.css:285-303).
- The retired `PerShowAlertSection` reference in AttentionBanner's header comment (history, not code).
- StagedReviewCard/BulkIgnoreControls internals beyond their PerShowActionableWarnings embed.
