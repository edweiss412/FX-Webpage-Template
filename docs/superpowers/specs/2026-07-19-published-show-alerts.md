# Published Show Alerts — unified attention surface in the admin show modal

**Date:** 2026-07-19
**Status:** Draft (autonomous-ship run; user design approval given in-session)
**Mock:** `docs/superpowers/specs/2026-07-19-published-show-alerts-mock/published-show-alerts-2b.dc.html` (committed snapshot of Claude Design project `37c93072-6ae5-4c2d-9340-31163318c932`, file "Published Show Alerts - 2b.dc.html"). Mock colors/px are illustrative; implementation uses live DESIGN.md tokens.
**Depends on:** admin-show-modal spec (`docs/superpowers/specs/2026-07-18-admin-show-modal.md`), alert-surface-ui spec (`2026-07-18-alert-surface-ui.md`), consolidated-admin-show-page spec (`admin/2026-07-16-consolidated-admin-show-page.md`).

## 1. Summary

The published show review modal (`/admin?show=<slug>`) currently surfaces per-show attention in three loosely-joined pieces: a header alert-count pill that is a plain `#overview` anchor (`components/admin/showpage/PublishedReviewModal.tsx:347-378`), the `PerShowAlertSection` card stack inside Overview (`components/admin/PerShowAlertSection.tsx:243`), and pending MI-11 sheet-change holds rendered far away in the Changes feed (`lib/sync/feed/readShowChangeFeed.ts:286-310`, actioned by `components/admin/Mi11GateActions.tsx`).

This feature replaces that with the mock's unified pattern:

- **One derivation** — a pure module produces `AttentionItem[]` from (a) unresolved per-show `admin_alerts` and (b) pending MI-11 holds. Four surfaces render from this single list, so counts can never drift.
- **Header pill + dropdown menu** — "N to confirm" pill; dropdown lists actionable items; clicking a row closes the menu, scrolls the modal body to that item's inline location, and flashes it. Auto-opens once per modal open when actionable items exist. "In sync" pill when nothing is open.
- **Inline placement** — every alert renders as an inline banner at its most-relevant location: under the matching crew row inside the Crew section when the alert resolves to a roster member, else at the top of its routed section. `PerShowAlertSection` is retired.
- **Nav propagation** — registry rail/chip items get the amber "needs review" dot when their section holds an actionable item; the Overview and Changes rail badges derive from the same list.

No new mutation surfaces, no DB changes, no advisory-lock code paths. Resolve = the existing show-scoped resolve route; approve/reject = the existing MI-11 gate actions.

### 1.1 Explicitly resolved scope decisions (do not relitigate)

- **No new confirmation workflows.** The mock's "Added as LEAD — needs confirming" row is illustrative. LEAD/FINANCIALS capability changes auto-apply and raise `ROLE_FLAGS_NOTICE` (`lib/messages/catalog.ts:855-861`); "confirming" IS resolving that alert. No held-LEAD state is added.
- **The mock's "edit conflict" row maps to pending MI-11 holds**, which already have a transactional approve/reject surface in the Changes section (`Mi11GateActions.tsx` — PF40 staleness token, typed results). Menu rows for holds navigate to that entry; the gate controls are NOT duplicated under crew rows. (Whole-parse `StagedReviewCard` review was deliberately dropped from published shows in `65d5be75a` — it is NOT remounted.)
- **`PerShowAlertSection` is retired** from the modal (user decision in-session). Its fetch (`fetchPerShowAlerts`) survives — it is the alert read path (§3.1).
- **Optimistic decrement is alerts-only** (§6.3). Hold counts reconcile on `router.refresh()`; threading an `onDone` callback through `ChangesSection → ChangesFeed → ChangeFeedEntry → Mi11GateActions` is deliberately out of scope.

## 2. Data sources (verified against live code)

| Source | Where fetched today | Shape |
| --- | --- | --- |
| Per-show alerts | loader wave `app/admin/_showReviewModal.tsx:238` (`fetchPerShowAlerts(showId)`) | `AdminAlertRow[]` (`components/admin/PerShowAlertSection.tsx:51-71`): `id, code, context, raised_at, occurrence_count, identityText, messageParams` — identity already resolved server-side, HEALTH codes excluded (`:165-167`) | 
| Pending MI-11 holds | loader wave `app/admin/_showReviewModal.tsx:234` (`readShowChangeFeed(showId)` → `feed` prop) | Feed entries with `status: "pending"`, `action: "approve_reject"`, a `gate` payload (holdId, disposition, baseModifiedTime) — `lib/sync/feed/readShowChangeFeed.ts:286-310`; pending summary copy from `mi11_pending_*` catalog codes (`:124-169`) |

Alert actionability classification (same rules `PerShowAlertSection` renders today, `:423-446`):

- `isInboxRouted(code)` (`lib/messages/adminSurface.ts`) → **auto-clearing** (read-only; clears when sheet is back / re-parses).
- `isAutoResolving(code)` (`lib/adminAlerts/audience.ts:63`) → **auto-clearing** (manual resolve suppressed; `autoResolveNote(code)` copy).
- Everything else → **actionable** (renders the resolve affordance).
- Pending MI-11 holds → always **actionable**.

## 3. Data model

### 3.1 `lib/admin/attentionItems.ts` (new, pure, client-safe)

```ts
export type RoutedSectionId = SectionId | "overview" | "changes"; // SectionId: lib/admin/step3SectionStatus.ts:6-20

export type AttentionAlertPayload = {
  alertId: string;
  code: string;
  /** Raw catalog dougFacing template when it fully interpolates, else null (PerShowAlertSection's safeDougFacingTemplate rule, :115-122). */
  template: string | null;
  params: MessageParams;
  action: AlertActionLink | null;      // precomputed via resolveAlertAction (lib/adminAlerts/alertActions.ts:131)
  helpHref: string | null;             // catalogHelpHref rule (PerShowAlertSection.tsx:127-130)
  raisedAt: string;
  occurrenceCount: number;
  /** Auto-clear note for non-actionable alerts (inbox-routed copy or autoResolveNote), null for actionable ones. */
  autoClearNote: string | null;
};

export type AttentionItem = {
  id: string;                  // "alert:<uuid>" | "hold:<holdId>" — the scroll-anchor key
  kind: "alert" | "hold";
  tone: "critical" | "notice"; // menu/banner dot color channel
  sectionId: RoutedSectionId;
  /** Canonicalized crew name for under-row placement in the Crew section; null = section-top. */
  crewKey: string | null;
  actionable: boolean;
  menuTitle: string;
  menuSubtitle: string | null;
  alert?: AttentionAlertPayload;  // exactOptionalPropertyTypes: ABSENT for holds, never undefined
};

export function deriveAttentionItems(args: {
  alerts: AdminAlertRow[];             // fetchPerShowAlerts success value
  feed: ShowChangeFeed | null;         // loader's feed (null on degraded read)
}): AttentionItem[];
```

Derivation rules:

- **Alerts** → one item each. `tone`: `"critical"` iff the cataloged severity is `"error"` (via `isMessageCode`/`messageFor`, the `lib/admin/bellTriage.ts:21-25` idiom), else `"notice"`. `menuTitle` = catalog `title` (required for every admin-alert code per the 2026-07-18 alert-copy sweep) or the generic fallback line for uncataloged codes. `menuSubtitle` = `identityText` (nullable). `actionable` per §2. `sectionId`/`crewKey` per §4.
- **Holds** → one item per pending `approve_reject` feed entry. `tone: "critical"`. `menuTitle` = the entry's already-rendered pending summary (the `mi11_pending_*` copy the feed fills at `readShowChangeFeed.ts:124-169`); `menuSubtitle: "Pick what happens in Changes"`. `sectionId: "changes"`, `crewKey: null` (holds render in Changes, not under crew rows — §1.1). `id` = `hold:<holdId>` from the entry's gate payload.
- **Ordering**: actionable before auto-clearing; within each, `critical` before `notice` (`TIER_ORDER` idiom, `bellTriage.ts:28`); within a tier, alerts by `raised_at` DESC (already the fetch order), holds after alerts in feed order.
- Pure function: no I/O, no Date.now (relative times render client-side from `raisedAt` + the loader's `now`).

Derivation runs **in the server loader** (`_showReviewModal.tsx`), after the existing `Promise.all` wave — both inputs are already fetched there; zero new round-trips. The serialized `AttentionItem[]` replaces the `alertCount` prop and the `alertSlot` ReactNode.

### 3.2 Infra degradation

- `fetchPerShowAlerts` returns `{kind:"infra_error"}` → items derive from holds only, and the modal receives `alertsDegraded: true`: the pill renders the degraded state (§5.1) and Overview renders the existing "Could not load alerts" notice card (copy parity with `PerShowAlertSection.tsx:250-263`). Never silently hide the failure (invariant 9 posture).
- `feed === null` (degraded `readShowChangeFeed`, loader `:183-204`) → hold items absent. The loader already logs `ADMIN_SHOW_CHANGE_FEED_READ_FAILED`; the ChangesSection already renders its own degraded notice. The pill may undercount during a feed outage — accepted, documented degrade.

## 4. Routing table (code → section, total over the union)

`ATTENTION_ROUTES` lives in `lib/admin/attentionItems.ts`, keyed over `AdminAlertCode` (`lib/adminAlerts/upsertAdminAlert.ts:3-39`, 36 codes). Every code gets an explicit row; a structural meta-test (§12) walks the union source and fails on any unrouted code, so a NEW code fails by default. Unknown codes at runtime (producer outside the union) fall back to `overview`.

| Route | Codes | Rationale |
| --- | --- | --- |
| `crew` + crewKey from resolved identity | `AMBIGUOUS_EMAIL_BINDING`, `ROLE_FLAGS_NOTICE`, `OAUTH_IDENTITY_CLAIMED` | crew-identity codes (`ALERT_IDENTITY_MAP`, `lib/adminAlerts/alertIdentityMap.ts:58`) |
| `overview` | every other code in the union (share/publish/picker codes, sync/sheet codes, resync codes, asset/reel codes, snapshot/tile/watch/webhook codes, wizard-race code) | Overview owns the sheet/sync cluster, Re-sync, share & access, and lifecycle controls — the closest actionable home (`RESYNC_SHRINK_HELD` precedent: `alertActions.ts:106-117`) |

Rows are per-code in the module (not a wildcard) so future codes route deliberately. Global codes (`show_id IS NULL` producers such as `BRANCH_PROTECTION_*`) never appear in a per-show fetch but still carry rows (harmless totality).

`crewKey` = the resolved crew segment's display name from the alert's identity (the same resolution `fetchPerShowAlerts` already performs), canonicalized `trim().toLowerCase()`. Matching against roster rows uses the same canonicalization of `CrewMemberRow.name` (`CrewBreakdown`, `components/admin/wizard/step3ReviewSections.tsx:1233`). First match wins (duplicate names share the first row); no match → `crewKey` kept but banner falls back to section-top (§5.4 guard).

## 5. Surfaces

All four surfaces derive from the one `AttentionItem[]`. Counts: `actionableCount = items.filter(i => i.actionable).length`, `clearingCount = items.length - actionableCount`, minus optimistically-done ids (§6.3).

### 5.1 Header pill (replaces `PublishedReviewModal.tsx:347-378`)

Same header slot position (before the close button), same token idiom (`rounded-pill`, `bg-warning-bg text-warning-text`, `bg-status-review` dot, `before:-inset-y-3` 44px hit band — the existing pill's arithmetic comment holds).

| State | Condition | Render |
| --- | --- | --- |
| **To confirm** | `actionableCount > 0` | `<button>` amber pill: status-review dot + `"N to confirm"` (cap `99+`, sr-only exact count past the cap — existing idiom `:360-376`) + chevron (`ChevronUp`/`ChevronDown` per menu open state, `aria-hidden`). `aria-expanded`, `aria-controls` on the menu panel. Toggles the menu. |
| **Clearing** | `actionableCount === 0 && clearingCount > 0` | Non-interactive neutral pill (`bg-surface-sunken text-text-subtle`, hollow teal ring dot — the auto-recovery glyph, mock footer idiom): `"N clearing"`. Nothing silently dark. |
| **In sync** | `items.length === 0` | Non-interactive teal pill: hollow ring dot (`border-[1.5px] border-status-positive`, the S3C-1 clean-dot recipe, DESIGN.md §92) + `"In sync"` in `text-status-positive-text` on a plain `bg-surface-sunken` pill (no positive-bg token exists — `--color-status-positive`/`-text` are dot/text tokens, DESIGN.md:43). |
| **Degraded** | `alertsDegraded` | Neutral non-interactive pill `"Alerts unavailable"`; Overview carries the notice card (§3.2). Hold-derived count still shows if holds exist (then the To-confirm state wins and the menu lists holds only). |

Count guard: derived from array length; the `Number.isInteger` guard is kept (existing defensive rule `:347`).

### 5.2 Dropdown menu (new client component `components/admin/showpage/AttentionMenu.tsx`)

- Anchored below the pill, right-aligned (`absolute top-[calc(100%+8px)] right-0`), width `min(400px, calc(100vw - 32px))`, `bg-surface-raised border border-border rounded-md shadow` per DESIGN.md raised-surface tokens; `z` above the subHeader band (the header band already stacks above the body, `_showReviewModal` chrome; plan verifies stacking against `ReviewModalShell`).
- Header row: uppercase eyebrow "Needs your confirmation" (`text-xs font-semibold tracking-eyebrow text-text-subtle`).
- One row per **actionable** item, in §3.1 order: tone dot (`bg-status-review` amber for notice, degraded-red token for critical — hue + the sr-only tier text, WCAG 1.4.1), `menuTitle` (strong), `menuSubtitle` (subtle), trailing `→` glyph (`aria-hidden`). Row = full-width `<button>`, `min-h-tap-min`, hover `bg-surface-sunken`.
- Row click: close menu → `jumpToAttention(item.id)` (§6.2).
- Footer (only when `clearingCount > 0`): hollow teal ring dot + `"N more clearing on their own — no action needed"` (`text-xs text-text-subtle`). Not a button.
- List scrolls internally past 8 rows: `max-h-96 overflow-y-auto` on the row list (cap behavior — the footer and header stay pinned).
- A11y: disclosure pattern, NOT `role="menu"` (rows are plain buttons; no arrow-key contract). Panel labelled by the eyebrow. Esc closes and returns focus to the pill; click-outside closes; focus is not trapped. Tab order: pill → rows → footer text is skipped (non-interactive).
- Auto-open (user requirement): opens once per modal mount when `actionableCount > 0`, via a ref guard (the `refreshFiredRef` idiom, `PublishedReviewModal.tsx:144-149`). Suppressed when an `alertId` deep link is present (§6.4) — the deep link's scroll wins; the pill still shows the count.

### 5.3 Nav propagation

- `attentionSections: ReadonlySet<string>` = sections (registry ids only) holding ≥1 **actionable** item. `ShowReviewSurface` accepts it as a new optional prop; `dotClass`/`dotStatusText` (`ShowReviewSurface.tsx:244-257`) OR it in: `review = flagged || hasAttention`. Absent prop → identical behavior (staged wizard untouched — mode boundary).
- Overview rail badge (`PublishedReviewModal.tsx:207-227`): count = actionable items routed to `overview` (replaces the old all-alerts `alertCount`); same badge DOM/token idiom, sr-only unit line preserved.
- Changes rail badge: NEW `railBadge` on the Changes extra (`ExtraSection.railBadge`, `ShowReviewSurface.tsx:132`) with the pending-hold count, same idiom. Zero → no badge (existing conditional-spread pattern).

### 5.4 Inline banners (new client component `components/admin/review/AttentionBanner.tsx`)

Rendered for **every** item with `kind: "alert"` (actionable AND auto-clearing — nothing silently dark after `PerShowAlertSection` dies). Hold items render nothing new (their surface is the existing Changes entry; §5.5).

Placement:

- `sectionId: "crew"` + `crewKey` matching a roster row: inside the Crew section list, directly under that member's `<li>` (`CrewBreakdown`, `step3ReviewSections.tsx:1233-1330`). `CrewBreakdown` gains an optional `attention?: { byCrewKey: ReadonlyMap<string, AttentionItem[]>; sectionItems: AttentionItem[]; renderBanner: (item) => ReactNode }`-shaped prop (plan pins the exact shape); absent → byte-identical (staged mode boundary).
- `sectionId: "crew"` without a roster match: top of the Crew section panel (above the list).
- `sectionId: "overview"` (and any other registry route): top of that section's panel. Overview banners mount inside `OverviewSection` above the archive row; other registry sections mount via the existing `renderSectionExtras` hook position semantics (plan decides exact slot per section — top-of-panel, before content).
- Banner DOM: wrapper `data-attention-anchor="<item.id>"`; `aria-current="true"` when it is the deep-link target (§6.4). Left rail 3px tone stripe (bell severity-rail exception, DESIGN.md §323 precedent): `border-l-[3px]` amber (`status-review`) for notice / degraded-red for critical, `bg-warning-bg` wash, `rounded-sm`.
- Banner content (alert payload): emphasis-rendered body — `renderCatalogEmphasis(template, params)` (`components/messages/renderEmphasis.tsx`) with the `template === null` fallback line "Something needs your attention on this show." (exact `PerShowAlertSection.tsx:341-345` behavior); then the per-code action link (`action`, external marker `↗`), the quiet "Learn more" help link (`helpHref`), identity sub-line (same suppression rule: hidden when `INLINE_IDENTITY_CODES.has(code) && template !== null`, `PerShowAlertSection.tsx:408-416` — and always hidden under a crew row, where the row IS the identity), relative "Raised …" timestamp, and:
  - actionable → the resolve button (§6.3);
  - auto-clearing → `autoClearNote` line, no button (`:423-443` parity).
- Confirmed state: after a successful resolve the banner body swaps in place to a single `✓ Confirmed` line (teal, `status-positive`); the wrapper and anchor stay mounted until `router.refresh()` reconciles (§6.3).

### 5.5 Changes entries (holds)

`ChangeFeedEntry` rows for pending holds gain `data-attention-anchor="hold:<holdId>"` (attribute only — no id, twin-nav rule `ShowReviewSurface.tsx:342`). Approve/reject controls unchanged.

## 6. Interactions

### 6.1 Ownership

`PublishedReviewModal` owns menu open state, optimistic `doneIds: Set<string>`, and the jump request. `ShowReviewSurface` owns scrolling/flash (it already owns the scroller contract, suppression, and flash timer).

### 6.2 Jump: `attentionJump` prop

New optional `ShowReviewSurface` prop `attentionJump?: { itemId: string; sectionId: string; nonce: number } | null`. On change (effect keyed by nonce):

1. `setActive(sectionId)` + hash replaceState per the `handleNavClick` contract (`:300-315`).
2. Container-scoped query `[data-attention-anchor="${itemId}"]`; found → `beginSuppressedScroll(scroller, sectionTopFor(scroller, target) - 8)` + `scroller.scrollTo` (the `jumpToWarning` shape, `:335-357`); not found → plain `handleNavClick(sectionId)` (section-top, no flash).
3. Flash: `clearWarningHighlight()` then `data-step3-warning-flash` + `WARNING_HIGHLIGHT_MS` timer — the existing one-highlight-at-a-time machinery and the existing `app/globals.css:837-850` keyframe (motion-reduce variant included there).

Menu row click sets the jump request; deep link (§6.4) sets it on mount.

### 6.3 Resolve lifecycle (alerts)

`PerShowAlertResolveButton` (sole consumer after the section dies) gains an optional `onResolved?: () => void` fired on the success path only. The banner passes it; the modal adds the item id to `doneIds`. Effects, all instant (§9): banner swaps to Confirmed; menu row disappears (menu with zero remaining actionable rows closes; pill flips per §5.1 state table); rail dot reverts when its section empties; Overview badge decrements. Server truth reconciles via the button's existing refresh behavior (plan verifies; the loader re-derives items and the Confirmed banner unmounts). Failure path: unchanged existing button error handling; no optimistic mutation.

Holds: approve/reject via `Mi11GateActions` unchanged; counts move only on refresh (§1.1).

### 6.4 Deep link `?alert_id`

Loader keeps passing `alertId` (`_showReviewModal.tsx:85,400`). The modal maps it to `alert:<alertId>`: item exists → mount-time `attentionJump` with `aria-current` on that banner (one-shot ref guard, replacing the `li[aria-current]` query effect at `PublishedReviewModal.tsx:192-203`); no matching item (resolved meanwhile) → fall back to the existing `#overview` scroll. Auto-open is suppressed whenever `alertId` is non-null.

## 7. Guard conditions

| Input | null / empty / zero / NaN behavior |
| --- | --- |
| `items` `[]` | In-sync pill; no menu; no banners; no dots/badges from attention (warning-derived dots unaffected) |
| `actionableCount` 0, `clearingCount` > 0 | Clearing pill (non-interactive), no menu |
| count NaN/non-integer | pill hidden (existing `Number.isInteger` guard) — cannot occur from array length; defensive only |
| `crewKey` unmatched in roster | section-top banner in Crew (no dropped item) |
| duplicate roster names | first row hosts the banner |
| `template` null | fallback body line (never a raw code — invariant 5) |
| `menuSubtitle`/`identityText` null | line omitted |
| `action`/`helpHref` null | link omitted |
| `feed` null | hold items absent; alerts unaffected (§3.2) |
| alerts infra_error | `alertsDegraded` pill state + Overview notice card (§3.2) |
| `alertId` with no matching item | `#overview` fallback scroll, no flash |
| roster over `CREW_ROSTER_READ_CAP` | crew section still renders rows (`_showReviewModal.tsx:305-320`), so under-row placement is unaffected |
| archived show | banners render read-only reality: resolve route is not lifecycle-gated (alerts remain resolvable); holds already render read-only per ChangesSection's archived handling (plan verifies exact behavior and pins it) |

## 8. Mode boundaries

- **Published modal only.** Staged wizard (`Step3ReviewModal`) passes none of the new props: no pill/menu (its shell is separate), no `attentionSections`, no `CrewBreakdown.attention`, no `attentionJump` — all optional with absent-prop = byte-identical rendering (the `ExtraSection`/`renderSectionExtras` precedent).
- Shared elements: `ShowReviewSurface` scroll/flash machinery (both modes), `dotClass` (both modes — attention OR-term only fires when the prop is passed), `CrewBreakdown` (attention prop published-mode only, like `previewAs`).

## 9. Transition inventory

Pill states: A = To confirm, B = Clearing, C = In sync, D = Degraded.

| Pair | Treatment |
| --- | --- |
| A→B, A→C, B→C, B→A, C→A, C→B, any↔D | **Instant** — server-data / optimistic count swaps; no animation (mock has none; text+token swap) |
| Menu closed→open | `motion-safe` fade+scale, `duration-fast ease-out-quart`; `motion-reduce` instant |
| Menu open→closed | **Instant** (mock behavior; also fires before scroll glide so no exit animation competes with the glide) |
| Banner present→Confirmed | **Instant** in-place body swap |
| Confirmed→unmounted | **Instant** on refresh reconcile (RSC swap) |
| Anchor flash | existing one-shot `step3-warning-flash` keyframe, 1600ms (`WARNING_HIGHLIGHT_MS`), motion-reduce variant per `globals.css:849` |
| Rail dot amber↔teal, badges appear/disappear | **Instant** (existing "§11 instant — deliberate" rail contract) |

Compound transitions:

| Compound | Behavior |
| --- | --- |
| Resolve while menu open | row vanishes instantly; last actionable row resolved → menu closes itself, pill flips A→B/C |
| Menu row click during an in-flight glide | `beginSuppressedScroll` replaces the target (documented no-queue contract, `ShowReviewSurface.tsx:277-292`) |
| Resolve while its banner is mid-flash | Confirmed swap keeps the wrapper (anchor + flash attribute holder) mounted; flash timer completes or is cleared by the next jump — no orphaned timer (existing `clearWarningHighlight` single-highlight rule) |
| Deep link + auto-open on the same mount | auto-open suppressed; deep-link jump fires |
| refresh reconcile while menu open | menu re-renders from fresh items; open state persists unless actionable count hits 0 (then closes) |
| Modal close (Esc/scrim) while menu open | modal's instant-close path unmounts everything; no menu-specific teardown beyond effect cleanup |

## 10. Dimensional invariants

No new fixed-dimension parent with flex/grid children is introduced. The menu is a self-bounded scroll container (`max-h-96 overflow-y-auto` on the list; header/footer outside it). The pill keeps the existing 44px `before:` hit-band arithmetic (`PublishedReviewModal.tsx:338-343`); the real-browser T-TAP probe extends to the new button. Banner wrappers are normal-flow blocks. (Declared explicitly per the spec checklist: none.)

## 11. Caps / truncation

- Pill count: visible `99+` cap, sr-only exact count (existing idiom).
- Menu list: no item cap; scrolls internally past ~8 rows (`max-h-96`). Footer clearing-count is a plain number, uncapped (single line).
- Banners: uncapped — each is an independent actionable/visible obligation (hiding any violates the nothing-silently-dark posture). Practical bound: per-show alert volume is small; menu ordering keeps critical first.
- `menuTitle`/`menuSubtitle`: single-line truncate (`truncate min-w-0`) in menu rows; full text lives on the banner.

## 12. Testing & structural defenses

- **Unit (`tests/admin/attentionItems.test.ts`)**: derivation — actionability partition (inbox-routed / auto-resolving / actionable / holds), tone mapping, ordering, crewKey canonicalization, id scheme, degraded inputs (`feed: null`, empty alerts). Anti-tautology: expected counts derived from fixture composition, not hardcoded mirrors; fixtures include unknown-code and null-context rows.
- **Routing meta-test (`tests/admin/_metaAttentionRoutes.test.ts`)**: parses the `AdminAlertCode` union source (the `_metaAdminAlertCatalog.test.ts:54` technique) and asserts every member has an explicit `ATTENTION_ROUTES` row — new codes fail by default.
- **Registry updates**: `fetchPerShowAlerts` keeps its `tests/auth/_metaInfraContract`-registered shape (registry row updated if the export moves file); no new Supabase call sites (derivation is pure). No new mutation surfaces → `_metaMutationSurfaceObservability` unaffected (statically verified by its walker).
- **Component (jsdom)**: pill state table (§5.1 all four states + guards), menu render/order/footer, banner content rules (template fallback, identity suppression, auto-clear note vs resolve button), optimistic doneIds flow.
- **Real-browser (Playwright, the step3 harness family)**: menu open/close + Esc/click-outside focus return; menu row click → scroll settles at anchor − 8px with flash attribute present; deep-link mount scroll; T-TAP hit-band probe on the new pill; crew-row banner placement (banner element is a following sibling within the matching row's `<li>` subtree).
- **Transition audit task**: §9 table verified — every conditional render either instant-by-declaration or motion-safe with reduce variant; compound cases exercised (resolve-while-open, jump-replaces-glide).
- **E2E (existing admin e2e family)**: seeded show with 1 actionable alert + 1 pending hold → pill "2 to confirm", auto-open, row click lands on crew banner, resolve → pill "1 to confirm"; seeded clean show → "In sync".
- **Affected existing tests (enumerated for the plan)**: `overviewSection.test.tsx` (pins the old pill's `#overview` jump), the modal transitions pin (currently 8 — new menu transition raises it), `PerShowAlertSection` render tests (retired/replaced), `tests/messages/_metaEmphasisRenderContract.test.ts` (references the section as an emphasis call site), any snapshot pinning `alertSlot`/`alertCount` props, T-TAP probes.
- **Impeccable dual-gate** (invariant 8) on the diff before cross-model review.

## 13. Invariant conformance

- **Inv 2 (advisory locks)**: untouched — no mutating path added or modified.
- **Inv 5 (no raw codes)**: all copy flows through `lib/messages/lookup.ts` templates / catalog titles; fallback lines are the existing cataloged-fallback strings; codes never render.
- **Inv 8**: impeccable critique + audit run on the diff (UI surface).
- **Inv 9**: no new Supabase call boundaries; existing registered helpers only.
- **Inv 10**: no new mutation surfaces; resolve/approve routes already registered in `AUDITABLE_MUTATIONS`.
- **Flag lifecycle**: no new config flags/toggles (menu open state and doneIds are ephemeral client state — no storage, no write path; declared to satisfy the checklist).

## 14. Out of scope

- LEAD confirm-gate workflow, new alert codes, catalog copy changes.
- Bell panel / dashboard alert surfaces (unchanged; `?alert_id` links keep working via §6.4).
- StagedReviewCard remount; `ParsePanel` cleanup (orphaned since the modal pivot) — left as-is; a BACKLOG entry may note it.
- Optimistic hold decrement (§1.1).
- Mobile bottom-sheet variant of the menu (dropdown clamps to viewport width instead).
