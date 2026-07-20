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

## 2. Visual design

Card = vertical flex, `rounded-sm border border-border border-l-[3px] bg-warning-bg` with the existing stripe channel (`border-l-status-review` / `border-l-status-degraded`, AttentionBanner.tsx:56).

Bands, top to bottom:

1. **Message row** — `flex gap-2.5 p-3 pb-2.5`: severity glyph (existing card semantics; a 16px round `!` marker, `aria-hidden`), message block (`text-sm font-semibold text-text-strong`, emphasis-rendered), optional `?` help trigger at row end.
2. **Detail band** (optional) — `border-t border-dashed border-warning-text/25`, `px-3 py-1.5`, horizontal wrap of detail entries. Entry = caps micro-label (`text-[10px] uppercase tracking-wider font-semibold text-warning-text/70`) + value (`text-xs font-semibold text-text`). Numeric counts `tabular-nums`. Sheet-row quotes render in `font-mono text-xs`. Band renders ONLY when at least one entry exists.
3. **Footer bar** — `border-t border-warning-text/20`, `flex items-center justify-between gap-3 px-3 py-2`. Left cluster: primary link(s) + `·` separator + relative time, `text-xs text-text-subtle`. Right: action button (existing button components) or auto-clear note (`text-xs italic text-text-subtle`).

Muted tone (`tone="muted"`, ignored list): swap `bg-warning-bg` for `bg-surface-sunken`, drop the stripe, dividers become `border-border`; ring offsets follow (PerShowActionableWarnings.tsx:49-52 pattern).

## 3. Components

### 3.1 `CompactAlertCard` (NEW FILE created by this work: `components/admin/CompactAlertCard.tsx (new, does not exist yet)`)

Pure presentational shell. No data fetching, no state.

```ts
type CompactAlertCardProps = {
  message: ReactNode;                 // required; rendered in message row
  helpTrigger?: ReactNode;            // rendered at message-row end
  detailBand?: ReactNode;             // wrapped in the dashed-divider band; band omitted when null/undefined
  footerLeft?: ReactNode;             // left cluster
  footerRight?: ReactNode;            // right cluster
  tone?: "warning" | "muted";        // default "warning"
  stripe?: "review" | "degraded" | "none"; // default "review"; "none" for muted
  className?: string;                 // wrapper extras (e.g. data-attention-anchor host adds none)
  // host spreads its own data-* / aria-* via a wrapper div it owns
};
```

Rules:

- `detailBand` null/undefined/false ⇒ NO band element, NO divider (guard-condition table §5).
- Footer bar renders when `footerLeft` OR `footerRight` present; both absent ⇒ two-band card without footer (not expected on any current surface, but the shell must not render an empty bar).
- The shell renders the `!` glyph itself; hosts never duplicate it.
- Shell owns the tone/stripe class map; hosts pass enums, never class strings.

### 3.2 `HoverHelp` extension (edit, `components/admin/HoverHelp.tsx`)

Reused as the help popover. Changes:

1. **Escape containment.** Add an element-level `onKeyDown` on the root wrapper: when `open` and `e.key === "Escape"`, `e.preventDefault(); e.stopPropagation(); close`.

   Mechanism, verified against live code: `ReviewModalShell`'s Escape handler is a `document`-level native listener that closes unconditionally — it does NOT inspect `defaultPrevented` (ReviewModalShell.tsx:239-245). Containment therefore rests ENTIRELY on `stopPropagation`, not on `preventDefault`: React 18 attaches synthetic handlers at the root container, which sits below `document`, so stopping propagation in the React handler prevents the native event from ever reaching the shell's listener. This is the same mechanism `CrewRowActions` already relies on (components/admin/wizard/CrewRowActions.tsx:115-121); its inline comment describing the shell as "ignoring defaultPrevented" is inaccurate about the shell but its code is correct. `preventDefault` is kept for defense in depth only.

   The existing window-level listener (HoverHelp.tsx:111-121) stays for hover-open and focus-outside dismissal. Residual, accepted: a mouse-hover-opened popover inside the modal still closes together with the modal on Escape, because that path never reaches a React handler. Pre-existing HoverHelp behavior, not a regression.
2. **Custom trigger fit.** No API change needed — `trigger` prop (HoverHelp.tsx:65) accepts the amber `?` trigger node. Trigger keeps `min-h-tap-min min-w-tap-min` hit area (HoverHelp.tsx:164) with a 22px visual glyph.
3. `align="right"` used on cards (existing prop, HoverHelp.tsx:68).

Popover renders on a card ONLY when the surface has `helpfulContext` or an admissible `helpHref`; otherwise no trigger at all. Learn-more emission stays gated by `shouldEmitLearnMore` (lib/messages/renderer-gate.ts:17) exactly where the surface already gates it today; the popover body uses `learnMore={{ href }}` (HoverHelp.tsx:78-88) which drops `role="tooltip"` and becomes a disclosure.

## 4. Surface mappings

### 4.1 AttentionBanner (components/admin/review/AttentionBanner.tsx)

- Message: `renderCatalogEmphasis(a.template, a.params)` else `ATTENTION_FALLBACK_TITLE` (unchanged source, AttentionBanner.tsx:78).
- Help trigger: renders when `a.helpHref` non-null (AttentionBanner.tsx:93). Popover body: catalog `helpfulContext` via `lookupHelpfulContext` (lib/messages/lookup.ts:120) when non-null, plus `learnMore={{ href: a.helpHref }}`. When `helpfulContext` is null and `helpHref` non-null, popover body is the Learn-more link with a one-line lead-in ("More about this alert in the help pages."). The freestanding "Learn more" quiet link (AttentionBanner.tsx:93-101) is deleted.
- Detail band entries: `Failed` → `failedKeys.join(" · ")` when non-empty (AttentionBanner.tsx:102-109); `Dropped` → `formatDataGapBreakdown(a.dataGaps)` when non-null (AttentionBanner.tsx:110-117). Testids `attention-banner-failed-sources-*` / `attention-banner-data-gaps-*` preserved on the entries.
- Identity sub-line (`showIdentity`, AttentionBanner.tsx:57-60, 118-125) DELETED along with the `INLINE_IDENTITY_CODES` import; `testid="attention-banner-identity"` removed. `menuSubtitle` remains in `AttentionItem` (lib/admin/attentionItems.ts:54) for the AttentionMenu; `underCrewRow` prop is removed from the component signature and its two call sites, verified live: `components/admin/showpage/PublishedReviewModal.tsx` (the `bannerFor` helper) and `tests/components/admin/review/attentionBanner.test.tsx`. Impact on `tests/adminAlerts/_metaInlineIdentityContract.test.ts` and `tests/messages/_metaAdminAlertCatalog.test.ts` resolved at plan time: the contract those pin (inline-identity codes need no sub-line) becomes vacuously satisfied for this surface; registry rows referencing the banner's identity rendering are updated, not deleted, per their file-local instructions.
- Footer left: action link (label + external `↗`, unchanged semantics AttentionBanner.tsx:81-91) then `·` then `Raised <relative>` time (`formatRelativeRaisedAt`, lib/admin/attentionItems.ts:172; `<time dateTime>` + `suppressHydrationWarning` kept, AttentionBanner.tsx:126-131). No action ⇒ time alone.
- Footer right: `PerShowAlertResolveButton` (components/admin/PerShowAlertResolveButton.tsx:48) when actionable; else auto-clear note `a.autoClearNote` right-aligned italic (AttentionBanner.tsx:132-148). Auto-clear cards keep time on the left.
- Confirmed swap, `data-attention-anchor`, `aria-current`, testids: unchanged (R11).

### 4.2 PerShowActionableWarnings (components/admin/PerShowActionableWarnings.tsx)

- Message: catalog title / human-message fallback logic unchanged (PerShowActionableWarnings.tsx:56-61).
- Help trigger: renders when `entry.helpfulContext` non-null (PerShowActionableWarnings.tsx:62); the inline context line (PerShowActionableWarnings.tsx:90-92) moves into the popover body. No Learn-more here (no helpHref wiring exists on this surface today; none added).
- Detail band: `Sheet row` → `labelFromRawSnippet(w.rawSnippet)` mono, UNKNOWN_FIELD gate unchanged (PerShowActionableWarnings.tsx:79-80); testid `per-show-actionable-row-label` preserved.
- Footer left: `Open in Sheet ↗` when `sourceCell` resolves (PerShowActionableWarnings.tsx:63, 93-102). No timestamp (R7). No link and no controls ⇒ footer bar omitted entirely; card degrades to message(+detail) bands.
- Footer right: `renderItemControls(w, i)` slot output (R8).
- `tone="muted"` maps to shell muted skin; key stability via `stableWarningKeys` unchanged (PerShowActionableWarnings.tsx:40).

### 4.3 HealthAlertsPanel (components/admin/telemetry/HealthAlertsPanel.tsx)

Per `HealthAlertRowItem` row:

- Message row: title line + weight badge (existing markup, kept inside `message`).
- Detail band entries: detail template, follow-up template, `identityText`, `occurrence_count` occurrences (HealthAlertsPanel.tsx:106-133). Templates are sentence-length: they render as full-width entries (band wraps), not label/value pairs.
- Footer left: `View show` link when present, action link when present, `·`, `Raised <relative>` (HealthAlertsPanel.tsx:126-152).
- Footer right: `HealthAlertResolveButton` or `autoResolveNote(row.code)` italic (HealthAlertsPanel.tsx:155-160).
- No help popover on this surface (no helpfulContext wiring today; none added). Panel headings, sections, Load more, empty and degraded states untouched.

## 5. Guard conditions

| Input | null/empty/absent behavior |
|-------|---------------------------|
| `detailBand` | band + dashed divider absent |
| `footerLeft` and `footerRight` both absent | footer bar absent |
| `helpTrigger` absent | message row without trailing trigger; text spans full width |
| `a.template` null | `ATTENTION_FALLBACK_TITLE` (unchanged) |
| `a.action` null | footer left = time only |
| `a.failedKeys` null or `[]` | no Failed entry |
| `a.dataGaps` null | no Dropped entry |
| `helpfulContext` null + `helpHref` null | no trigger, no popover |
| `w.sourceCell` null | no Open in Sheet link |
| `rawSnippet` label null / non-UNKNOWN_FIELD | no Sheet-row entry |
| `items.length === 0` | component returns null (unchanged, PerShowActionableWarnings.tsx:37) |
| `renderItemControls` absent | footer right empty; bar renders if link present |
| `occurrence_count` any number | rendered with existing singular/plural logic |

## 6. Transition inventory

States: card default (D), card with popover open (P), confirmed swap (C — AttentionBanner only), resolve-error inline (E — inside PerShowAlertResolveButton / HealthAlertResolveButton, unchanged internals).

| Pair | Treatment |
|------|-----------|
| D↔P | instant — no animation (HoverHelp has no transition today; unchanged) |
| D→C | instant swap — no animation (existing behavior, AttentionBanner.tsx:68) |
| P→C | resolve clicked while popover open: body swap unmounts trigger+popover; instant; focus falls per §8 |
| D→E / E→D | button-internal error line, unchanged component, instant |
| P→E | popover stays open (independent subtrees); instant |
| C→D | never (refresh reconciles the card away, R11) |

Compound: resolve in flight while popover open — popover remains interactive (no shared state); on success both unmount with the swap. No AnimatePresence anywhere in the diff; `tests/components/admin/transitionAudit.test.tsx` extended to pin the new conditional blocks as deliberately instant.

## 7. Dimensional invariants

None. No fixed-height/width parent with flex/grid children is introduced: card and all bands are content-sized; footer buttons keep their own fixed heights internally. Declared explicitly per AGENTS.md: N/A, no fixed-dimension parent.

## 8. Accessibility

- Popover: existing HoverHelp contract — trigger `aria-expanded`; body `role="tooltip"` without Learn-more, disclosure with `aria-controls` when Learn-more present (HoverHelp.tsx:78-88). Focus stays on trigger (no focus move into popover; link reachable by Tab per existing HoverHelp order).
- Escape: contained per §3.2. Focus after P→C swap: trigger unmounts; browser default drops focus to body — acceptable because swap is user-initiated from the resolve button (focus was there, and that button also unmounts today; behavior unchanged from shipped swap).
- Tap targets ≥44px: help trigger via `min-h-tap-min min-w-tap-min`; footer links keep `inline-flex min-h-tap-min items-center` (AttentionBanner.tsx:86, HealthAlertsPanel.tsx:138).
- Glyph `!` is `aria-hidden`; severity remains conveyed by text and existing testid/weight badge semantics.
- No `role="alert"` additions (cards are server-rendered lists, not live regions).
- Copy: no em-dashes, straight apostrophes per project copy rules; all message text still flows through catalog lookup (invariant 5 — no raw codes).

## 9. Testing

Unit (vitest + RTL):

- Shell: band/divider conditionals per §5 table (each row an assertion); tone/stripe class map; no empty footer bar.
- AttentionBanner adapter: existing suite `tests/components/admin/review/attentionBanner.test.tsx` updated — identity assertions removed, footer composition asserted (action+time left, resolve right; auto-clear note right + time left), failed/dropped entries in band, popover renders only with helpHref, freestanding Learn-more gone. Confirmed-swap tests unchanged.
- PerShowActionableWarnings: `tests/admin/perShowActionable*.test.tsx` + `tests/parser/parseWarningDeepLinkRender.test.tsx` updated — helpfulContext now in popover body (open before asserting), row-label mono entry, no-footer degradation, muted tone, key stability untouched.
- HealthAlertsPanel: `tests/components/healthAlertsPanel*.test.tsx` updated for band/footer composition.
- HoverHelp Escape containment: keydown Escape on open popover → `defaultPrevented` true, propagation stopped (spy on parent handler), popover closed; regression: closed popover does not swallow Escape.
- Anti-tautology: assertions derive expected strings from fixture data (catalog entries, fixture failedKeys), never from the rendered container; popover-body assertions query by role/testid after clone-and-strip of the message row (sr-only accName lessons).

Real-browser (Playwright, existing standalone harness pattern):

- Footer bar single line at 400px and 320px card widths: left cluster and button `getBoundingClientRect` vertical centers within 0.5px; no wrap.
- Help trigger hit area ≥44×44 via `getBoundingClientRect`.
- Popover overlays (not clipped): popover box intersects outside card box; card has no clipping overflow.

Gates: impeccable critique + audit on the diff (invariant 8); `pnpm spec:lint` + citation/numeric transcripts attached to review dispatches; full suite + typecheck + eslint + format:check before push.

## 10. Meta-test inventory

- EXTENDS `tests/components/admin/transitionAudit.test.tsx`, which already registers `components/admin/review/AttentionBanner.tsx` in its scanned file list (transitionAudit.test.tsx:41); the new conditional blocks are pinned instant there, and `components/admin/CompactAlertCard.tsx (new)` is added to that list.
- UPDATES registry rows in `tests/adminAlerts/_metaInlineIdentityContract.test.ts` (identity sub-line removal) — resolution enumerated at plan time.
- No new admin route, table, or `admin_alerts` code ⇒ §12.4/catalog gates, `_metaAdminAlertCatalog` templates, invariant-10 registries unaffected (no new mutation surface; resolve routes untouched).
- Supabase call-boundary meta-test: no new Supabase call sites ⇒ no registry rows.
- Advisory locks, email canonicalization, sync cursor: not touched (pure UI diff).

## 11. Out of scope

- Any copy rewrite of catalog entries (G3 hybrid split rejected).
- HealthAlertsPanel help wiring, pagination, sections.
- Dark theme work; admin app renders light-theme runtime tokens (app/globals.css:285-303).
- The retired `PerShowAlertSection` reference in AttentionBanner's header comment (history, not code).
- StagedReviewCard/BulkIgnoreControls internals beyond their PerShowActionableWarnings embed.
