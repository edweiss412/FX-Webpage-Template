# The show-modal attention panel is an index

**Date:** 2026-07-24
**Surface:** published-show review modal — attention pill, attention dropdown, per-section alert cards
**Supersedes (partially):** `2026-07-21-attention-needs-attention-split.md` §3.2–§3.4 (three-group split), `2026-07-22-monitoring-badge-expand.md` §3.1–§3.2 (three-segment pill)

---

## 1. Problem

The attention dropdown groups a show's alerts into three headings: **Needs your confirmation**, **Needs a look**, **Monitoring** (`components/admin/showpage/AttentionMenu.tsx:126`, `components/admin/showpage/AttentionMenu.tsx:176`, `components/admin/showpage/AttentionMenu.tsx:238`). The pill mirrors them as three counted segments (`components/admin/showpage/PublishedReviewModal.tsx:789`, `components/admin/showpage/PublishedReviewModal.tsx:807`, `components/admin/showpage/PublishedReviewModal.tsx:829`).

Four defects follow from that shape.

**1. The first two headings name a distinction that isn't a category.** The split is computed as `actionable = !isInboxRouted(row.code) && !isAutoResolving(row.code)` (`lib/admin/attentionItems.ts:267`). That predicate means "this alert has a resolve button on its card" — not "this needs a human." Both groups need a human; they differ only in *where the clearing act happens*. That is a property of one alert, not a class of alerts.

**2. The ladder inverts effort.** "Needs your confirmation" reads heavier than "Needs a look", but 18 of the 19 resolve-eligible codes render the button as "Mark resolved", not "Confirm" (`lib/adminAlerts/resolveActionLabel.ts:49-69`, labels at `lib/adminAlerts/resolveActionLabel.ts:73-74`) — and the heaviest work in the panel sits under "Needs a look", whose fix hints are imperatives: "Re-share the sheet with the service account.", "Replace the reel link with a video URL.", "Trim the gallery under 60 images / 50MB / 3GB." (`lib/admin/needsLookHints.ts:13-24`).

**3. Rows and cards duplicate each other.** `bucketAttention` is called with the full item list, unfiltered by `actionable` (`components/admin/showpage/PublishedReviewModal.tsx:551`), so every alert renders a card in its section *and* a row in the dropdown. For needs-look items the row carries the same message and the same action link as the card (`AttentionMenu.tsx:204-219` vs `components/admin/review/AttentionBanner.tsx:158-171`).

**4. Two entries are not issues at all.** `SHOW_FIRST_PUBLISHED` ("now live for crew at its share-token URL", `lib/messages/catalog.ts:1120-1121`, `severity: "info"`, `followUp: null`) and `PICKER_EPOCH_RESET` (whose own `helpfulContext` reads "Nothing to fix; this is a record of the reset.", `lib/messages/catalog.ts:3222`) describe events that happened, not conditions standing between the sheet and the crew page. Today they make the badge count up when something goes *right*.

**Framing this spec adopts:** the panel is an **index of a show's issues**. Each entry points at one issue; the issue's full card renders where it is most relevant in the modal. A row's job is to take you there.

---

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Three groups collapse to two. The button-here/fix-elsewhere distinction is per-row, not per-group. | This spec §2.1; rationale §1 defect 1 |
| **Monitoring rows stay read-only** — no chevron, no jump, no interactive descendants. The group whose meaning is "nothing for you" does not get an affordance that invites action. | `2026-07-22-monitoring-badge-expand.md` §3.2, implemented `AttentionMenu.tsx:242-261`; unchanged by this spec |
| Needs-look defaults **fail-visible**: a non-actionable item with no `clearingKind` counts as needs-you, never monitoring. | `2026-07-21-attention-needs-attention-split.md` §3.4, implemented `AttentionMenu.tsx:98`, `PublishedReviewModal.tsx:310` |
| A mistagged actionable item is counted once, in the merged group only — never doubled into monitoring. | `AttentionMenu.tsx:99-101`, `PublishedReviewModal.tsx:313-318` |
| Holds ARE index entries but NOT card entries. They render as actionable rows in the panel (`lib/admin/attentionItems.ts:318-323`) and jump to the `changes` section, whose `Mi11GateActions` control is their landing place; `bucketAttention` skips them so they never produce a card. This spec does not change that. | `lib/admin/sectionAttention.ts:104-109`; section id at `components/admin/showpage/PublishedReviewModal.tsx:642` |
| The Changes feed is NOT a destination for relocated alerts. It reads `show_change_log` + open `sync_holds` and its `change_kind` values are sheet-data changes. | `lib/sync/feed/readShowChangeFeed.ts:1-8`; `change_kind` CHECK is `length > 0` only (`supabase/migrations/20260608000001_show_change_log.sql:33-35`) |
| The pill stays interactive when only monitoring items exist, and keeps its quiet palette in that state. | `2026-07-22-monitoring-badge-expand.md` §3.1, implemented `PublishedReviewModal.tsx:323-324`, `components/admin/showpage/PublishedReviewModal.tsx:764-771` |
| Separators between pill segments are real `" · "` text nodes, in the announced string as well as the visible one. | `PublishedReviewModal.tsx:804-806`; memory #537 space-node rule |
| No new §12.4 message codes. No DB migration. No advisory-lock surface. | This spec §10 |

---

## 2. Change

### 2.1 Grouping — two groups

`AttentionMenu` derives two lists instead of three:

```
needsYou = items.filter((i) => !(!i.actionable && i.clearingKind === "self_heal"))
monitoring = items.filter((i) => !i.actionable && i.clearingKind === "self_heal")
```

`monitoring` is the existing `selfHeal` filter verbatim (`AttentionMenu.tsx:101`). `needsYou` is its complement, which preserves the fail-visible default: an item with no `clearingKind` lands in `needsYou`.

Headings, as rendered eyebrow text, replacing the three at `AttentionMenu.tsx:126`, `components/admin/showpage/AttentionMenu.tsx:176`, `components/admin/showpage/AttentionMenu.tsx:238`:

| Group | Heading | Renders when |
| --- | --- | --- |
| 1 | `Needs you` | `needsYou.length > 0` |
| 2 | `Monitoring` | `monitoring.length > 0` |

The heading for group 1 renders **only** when the group is non-empty — the existing `hasActionable` conditional (`AttentionMenu.tsx:123`) generalises to `needsYou.length > 0`. Its purpose is unchanged: a monitoring-only panel must not carry an empty section header.

Panel accessible name (`AttentionMenu.tsx:112-118`) becomes a two-branch fallthrough:

```
aria-label={needsYou.length > 0 ? "Needs you" : "Monitoring"}
```

**Ordering is unchanged.** `deriveAttentionItems` already returns `[...holdItems, ...actionableAlerts, ...needsLook, ...selfHeal]` (`lib/admin/attentionItems.ts:376`). Merging the middle two into one rendered group preserves button-clearable-first ordering inside it for free; no sort changes.

**"Needs attention" is not available as a heading.** It already names the dashboard section (`components/admin/Dashboard.tsx:751`), the route `/admin/needs-attention` (`app/admin/needs-attention/page.tsx:54`), and `components/admin/NeedsAttentionSummaryCard.tsx:46`. Reusing it here would make one label mean a narrower set in a different place.

### 2.2 Row behaviour — press to jump, no inline links

Every row under **Needs you** becomes the row shape currently used by actionable rows (`AttentionMenu.tsx:134-159`): a full-width `<button>` that calls `onClose()` then `onNavigate(item)`, with the trailing `→` glyph and the filled tone dot.

The needs-look row shape at `AttentionMenu.tsx:185-222` is deleted, along with its inner action `<a>` (`components/admin/showpage/AttentionMenu.tsx:208-218`). Its two informative parts survive inside the button: the title (`item.menuTitle`) and the fix hint from `NEEDS_LOOK_HINTS` (`lib/admin/needsLookHints.ts:12`), which renders in the same slot the actionable row uses for `item.menuSubtitle`.

**This is required, not stylistic:** an `<a>` cannot be nested inside a `<button>`. The single row shape is what makes the whole row pressable.

**Second-line rule.** Every alert item carries `menuSubtitle` (`lib/admin/attentionItems.ts:295`), and needs-look items additionally resolve a fix hint. The row renders **the hint when one exists, otherwise `menuSubtitle`**, never both. This is behaviour-preserving on both sides, not a new choice: `NEEDS_LOOK_HINTS` is typed `Record<NeedsLookCode, string>` (`lib/admin/needsLookHints.ts:12`), so no actionable code can resolve a hint, and today's needs-look row already renders the hint in place of the subtitle (`components/admin/showpage/AttentionMenu.tsx:201-203`).

**Tone dot.** The merged row uses the actionable row's filled `TONE_DOT[item.tone]` dot (`components/admin/showpage/AttentionMenu.tsx:41-44`, `components/admin/showpage/AttentionMenu.tsx:144`). Former needs-look rows therefore change from a hollow `border-status-review` dot to a filled one — deliberate, since the hollow/filled contrast now carries the needs-you-versus-monitoring distinction rather than a distinction inside one group. Their screen-reader tone text is unchanged: needs-look rows already emit `TONE_DOT.notice.srText` (`components/admin/showpage/AttentionMenu.tsx:196`), which is the same string the merged row emits for a `notice`-tone item.

**The jump already works for these items.** The `alert_id` deep-link effect looks the item up in the unfiltered `attentionItems` list and calls `setJump({ itemId, sectionId: effectiveSectionId(item), nonce })` (`PublishedReviewModal.tsx:481-491`); nothing on that path is restricted to `actionable` items. `handleNavigate` uses the same `setJump` shape (`components/admin/showpage/PublishedReviewModal.tsx:421`). Wiring needs-look rows to `onNavigate` reuses a working path.

**Every item has somewhere to land.** For hold items the landing place is the `changes` section and its `Mi11GateActions` control, not a card (§1.1); holds are already pressable rows today, so this spec changes nothing for them. For alert items it is a card, and `bucketAttention` resolves an item's section to `opts.sectionAvailable(item.sectionId) ? item.sectionId : "overview"` (`lib/admin/sectionAttention.ts:123-126`). Under this spec that fallback is a **correctness guarantee**, not defensive code: an index entry with nowhere to land is an index that lies. The code comment at `sectionAttention.ts:113-115` calling the warnings-channel fallback "defensive" must be updated to say so.

Two items land on the Sheet-warnings panel rather than a card, because the notes channel intercepts them before the card path: `PARSE_ERROR_LAST_GOOD` and `RESYNC_QUALITY_REGRESSED` (`sectionAttention.ts:111-121`, routes at `lib/admin/attentionItems.ts:128`, `lib/admin/attentionItems.ts:131`). Their jump targets the warnings section. This is correct and in scope only as a test assertion (§6).

### 2.3 The card — a destination where the button would be

In `AttentionBanner`, the `footerRight` slot holds `PerShowAlertResolveButton` for actionable items and the italic `autoClearNote` otherwise (`components/admin/review/AttentionBanner.tsx:185-201`).

For **needs-you items that are not actionable** (the former needs-look set), `footerRight` becomes a **destination chip** rendering `a.action`, and the `autoClearNote` line is dropped — once the footer names a destination, "it clears when you've done it" is the only thing it could mean. `footerLeft`'s action link (`AttentionBanner.tsx:158-171`) is removed for these items, since the chip replaces it; the "Raised …" line stays.

Chip label is derived from `action.external`, not authored per code:

| `action.external` | Chip label | Applies to |
| --- | --- | --- |
| `true` | `Google Sheets ↗` | the 6 `openSheet` codes (`lib/adminAlerts/alertActions.ts:163-168`) |
| `false` | `Overview →` (the destination section's display name) | `PARSE_ERROR_LAST_GOOD`, `RESYNC_QUALITY_REGRESSED` (`alertActions.ts:169-170`) |

The chip carries no verb. Every verb tried in design committed to an amount of work and was wrong for some member of the set ("confirm" too small, "review" too soft, "fix" wrong for a deliberate state such as `SHOW_UNPUBLISHED`). A destination name commits to nothing and stays true.

**Self-link suppression (guard).** `SHOW_UNPUBLISHED` and `RESYNC_SHRINK_HELD` both route their card to the `overview` section (`attentionItems.ts:136`, `lib/admin/attentionItems.ts:130`) *and* point their action at `#overview` (`alertActions.ts:171`, `lib/adminAlerts/alertActions.ts:141-149`). The chip would point at the place the card already is. When `action.external === false` and the action's target section equals `effectiveSectionId(item)`, **no chip renders** and the footer keeps only the "Raised …" line.

Actionable cards and monitoring cards are unchanged: the resolve button and the `autoClearNote` respectively.

### 2.4 The badge

Three counted segments collapse to two (`PublishedReviewModal.tsx:785-840`):

| Segment | Text | Renders when |
| --- | --- | --- |
| 1 | `N issues` / `1 issue` | `needsYou.length > 0` |
| 2 | `N monitoring` | `monitoring.length > 0` |

Worked example, replacing today's `4 to confirm · 7 to review · 1 monitoring`: **`11 issues · 1 monitoring`**.

`issues` is a noun for the same reason the card chip has no verb, and it pluralises with an ordinary `s` — no subject-verb agreement branch, which "N need you" would have required at `N = 1`.

Retained verbatim from the current pill: the `99+` visible cap with the exact count preserved for assistive tech past the cap (`components/admin/showpage/PublishedReviewModal.tsx:787-798`), now on the single issues segment; the `" · "` real-text separator, rendered only between two present segments; the `monitoringOnly` quiet palette and its hollow leading dot (`components/admin/showpage/PublishedReviewModal.tsx:764-782`); the `title` attribute on the monitoring-only pill (`components/admin/showpage/PublishedReviewModal.tsx:758-762`); the `before:-inset-y-3` tap-band arithmetic (`components/admin/showpage/PublishedReviewModal.tsx:764`).

`interactive` (`components/admin/showpage/PublishedReviewModal.tsx:323`) and `monitoringOnly` (`components/admin/showpage/PublishedReviewModal.tsx:324`) keep their current definitions, restated over the merged lists: `interactive = needsYou.length > 0 || monitoring.length > 0`; `monitoringOnly = needsYou.length === 0 && monitoring.length > 0`.

### 2.5 Event-shaped codes leave the index

`SHOW_FIRST_PUBLISHED` and `PICKER_EPOCH_RESET` are excluded from the per-show attention index.

**Mechanism.** A new exported set `EVENT_SHAPED_CODES` in `lib/adminAlerts/audience.ts`, alongside the existing `SELF_HEALING_CODE_LIST` / `NEEDS_LOOK_CODE_LIST` pair (`lib/adminAlerts/audience.ts:75-94`). `deriveAttentionItems` (`lib/admin/attentionItems.ts:332`) drops alert rows whose code is in it, before `toAlertItem` runs.

**Layer choice.** The exclusion lands in `deriveAttentionItems`, NOT in `fetchPerShowAlerts`, so the bell is untouched.

**Nothing is lost.** The bell excludes only inbox-routed codes, plus health codes for non-developers (`lib/admin/bellAudience.ts:8-12`). Neither code is inbox-routed and both are `audience: "doug"`, so **both already appear in the notification bell today**. This removes a duplicate from the issue index; the notice survives in the surface built for notices.

**Dead wiring removed.** `SHOW_FIRST_PUBLISHED` is the only code that reads a data-gaps digest onto an attention item (`attentionItems.ts:307`), and `AttentionBanner`'s `detailBand` is its only consumer (`AttentionBanner.tsx:170-181`). With the code out of the index, `dataGaps` on the alert item and the `readDataGapsDigest` call are dead and are removed. The dashboard computes per-show data gaps from its own read (`components/admin/Dashboard.tsx:442-474`), so no user-visible information is lost.

### 2.6 The two button verbs

Both relocated codes keep a resolve button in the bell — `resolveActionLabels` is shared by the show modal, the bell, and the developer telemetry panel (`lib/adminAlerts/resolveActionLabel.ts:4-6`). Their intent is wrong today:

| Code | Today | Becomes | Why |
| --- | --- | --- | --- |
| `SHOW_FIRST_PUBLISHED` (`resolveActionLabel.ts:60`) | `resolve` → "Mark resolved" | `confirm` → "Confirm" | The show went live. Nothing is broken; there is nothing to resolve. |
| `PICKER_EPOCH_RESET` (`resolveActionLabel.ts:58`) | `resolve` → "Mark resolved" | `confirm` → "Confirm" | A deliberate reset. Its catalog `helpfulContext` says "Nothing to fix; this is a record of the reset." |

The module's own rule: `confirm` = approving a deliberate change that already applied; `resolve` = clearing a fault (`resolveActionLabel.ts:10-13`). The remaining 16 resolve-eligible codes are faults and keep `resolve`.

---

## 3. Guard conditions

| Input / state | Value | Rendered result |
| --- | --- | --- |
| `items` | `[]` | Panel does not mount — the pill is non-interactive and renders as a `<span>` (`PublishedReviewModal.tsx:323`, existing behaviour) |
| `needsYou` | empty, `monitoring` non-empty | No "Needs you" heading; Monitoring group leads the panel and takes the `rounded-t-md` treatment (existing logic at `AttentionMenu.tsx:235` generalises); `aria-label` = "Monitoring" |
| `monitoring` | empty, `needsYou` non-empty | No Monitoring group; no separator border |
| `item.clearingKind` | `undefined` on a non-actionable item | Counts as `needsYou` (fail-visible, §1.1) |
| `item.actionable` | `true` **and** `clearingKind === "self_heal"` | Counted once, in `needsYou` only |
| `item.menuSubtitle` / hint | both `null` or empty | Row renders title only; no empty second line (matches `AttentionMenu.tsx:150-154`) |
| `item.menuSubtitle` / hint | hint present, subtitle also present | Hint renders; subtitle suppressed (§2.2 second-line rule) |
| `item.tone` | `critical` | Filled `bg-status-degraded` dot and its existing screen-reader tone prefix, unchanged (`components/admin/showpage/AttentionMenu.tsx:42`). Reached today only by hold items, which are already pressable rows and keep their `changes` jump |
| `item.kind` | `"hold"` | Row renders as today: `menuSubtitle` "Pick what happens in Changes", jump to the `changes` section, no card. Never receives a destination chip (§2.3 applies to alert items only) |
| `a.action` | `null` (builder failed its fail-quiet guard) | No destination chip; footer keeps "Raised …" only |
| `a.action` | internal, target section == card's `effectiveSectionId` | No chip (§2.3 self-link suppression) |
| `needsYou.length` | `1` | Badge reads `1 issue` (singular) |
| `needsYou.length` | `> 99` | Badge reads `99+ issues`; exact count in an `sr-only` span (existing pattern `components/admin/showpage/PublishedReviewModal.tsx:790-798`) |
| `needsYou.length` | `0` and `monitoring.length` `0` | Pill non-interactive; menu cannot open (existing derived-open contract `components/admin/showpage/PublishedReviewModal.tsx:350-356`) |
| Alert read fault | `alertsDegraded === true` | Unchanged: empty attention list, degraded pill, Overview notice (`PublishedReviewModal.tsx:306`) |

---

## 4. Transition inventory

Panel states: **closed (C)**, **open/needs-you-present (O1)**, **open/monitoring-only (O2)**.

| Pair | Treatment |
| --- | --- |
| C → O1 | Existing entrance: `scale-95 opacity-0` → `scale-100 opacity-100`, `duration-fast ease-out-quart`, flipped inside a rAF (`AttentionMenu.tsx:67`, `components/admin/showpage/AttentionMenu.tsx:119-121`). Unchanged. |
| C → O2 | Same entrance. Unchanged. |
| O1 → C | Existing: unmount on `open === false`. Unchanged. |
| O2 → C | Same. Unchanged. |
| O1 → O2 | **Instant — no animation.** Live data removing the last needs-you item collapses the group with no transition, matching the current monitoring group's "no transitions" contract (`AttentionMenu.tsx:227-229`). |
| O2 → O1 | **Instant — no animation.** |

**Compound transitions:**

| Scenario | Treatment |
| --- | --- |
| Last needs-you item clears while the panel is mid-entrance | Entrance continues; group set is read at render, so the panel completes its entrance already in O2. No re-trigger. |
| Interactivity lost (both groups empty) while open | Unchanged: `menuEffectivelyOpen` is derived, so the panel unmounts in the same render that removes the trigger, then the post-commit effect rescues focus to the dialog root (`PublishedReviewModal.tsx:350-356`, `components/admin/showpage/PublishedReviewModal.tsx:358-380`). |
| A focused row unmounts while the panel stays open | Unchanged: dep-less effect refocuses the pill when `activeElement` is `<body>` or outside the dialog (`components/admin/showpage/PublishedReviewModal.tsx:361-371`). **This spec increases the exposure** — every needs-you row is now focusable, where needs-look rows previously exposed only their inner link. Test coverage required (§6). |
| Row pressed → menu closes → jump scrolls the card | Existing `onClose()`-then-`onNavigate()` order (`AttentionMenu.tsx:138-141`); the close-first order exists so a same-route anchor does not scroll its target behind the open menu (`components/admin/showpage/AttentionMenu.tsx:205-207`). Preserved for the newly-pressable rows. |

---

## 5. Dimensional invariants

| Parent | Child | Guarantee |
| --- | --- | --- |
| Scroll region `max-h-96 overflow-y-auto` (`AttentionMenu.tsx:130`) | both groups | The scroll boundary wraps ALL groups, so rows below the fold scroll into reach rather than extending past the viewport. Unchanged; re-asserted because the merged group can now be longer than either predecessor. |
| Row `<button>` | row content | `min-h-tap-min w-full` (`AttentionMenu.tsx:142`) — the 44px tap floor now applies to every needs-you row, including ones that previously rendered as a non-interactive `<div>` with no such floor (`components/admin/showpage/AttentionMenu.tsx:188`). |
| Pill `<button>` | `before:absolute before:inset-x-0 before:-inset-y-3` (`PublishedReviewModal.tsx:764`) | Resolved tap band ≥ 44px. Unchanged by the segment merge; re-verified because the pill's text length changes. |
| Row title span | `truncate` within `min-w-0 flex-1` (`AttentionMenu.tsx:146-149`) | Long titles ellipsise instead of widening the panel. Now applies to former needs-look titles, which used `truncate` on a `block` inside a non-flex parent (`components/admin/showpage/AttentionMenu.tsx:198-200`). |

Tailwind v4 does not default `.flex` to `align-items: stretch`; every relationship above is stated by an explicit class, and the plan verifies each with a real-browser `getBoundingClientRect` assertion (jsdom does not compute layout).

---

## 6. Tests (TDD)

Each bullet is a failing-test-first task.

1. **Two groups only.** Mount `AttentionMenu` with one actionable, one needs-look, one self-heal item; assert exactly two group headings, reading "Needs you" and "Monitoring", and that "Needs your confirmation" / "Needs a look" are absent from the panel.
2. **Merged group ordering.** With two actionable and two needs-look items, assert the four rows appear actionable-first, in `deriveAttentionItems` order, under one heading.
3. **Every needs-you row is a button that jumps.** For a needs-look item, assert the row is a `<button>`, that pressing it calls `onClose` then `onNavigate` with that item, and that the row contains **no** `<a>` descendant. Scope the query to the row's own `data-testid`, not the panel.
4. **Monitoring rows stay inert.** Assert a monitoring row is not a button and has no interactive descendant.
5. **Empty-group headings.** needs-you-only → no "Monitoring" heading, `aria-label` "Needs you". monitoring-only → no "Needs you" heading, `aria-label` "Monitoring", and the group carries `rounded-t-md`.
6. **Badge copy and pluralisation.** Assert `1 issue` at count 1, `11 issues` at 11, `99+ issues` plus an `sr-only` exact count at 120, and that the visible string is exactly `11 issues · 1 monitoring` with real text separators. Derive counts from the fixture, never hardcode.
7. **Card chip: external.** For `SHEET_UNAVAILABLE`, assert the footer-right slot holds a `Google Sheets ↗` link with `target="_blank"` and `rel="noopener noreferrer"`, that the `autoClearNote` text is absent, and that `footerLeft` no longer carries a duplicate action link.
8. **Card chip: self-link suppression.** For `SHOW_UNPUBLISHED` (card in Overview, action `#overview`), assert **no** chip renders and the footer holds only the "Raised …" line. This is the anti-tautology case for §2.3 — a naive implementation that always renders the chip passes test 7 and fails this one.
9. **Card chip: null action.** With `action: null`, assert no chip and no crash.
10. **Event codes leave the index.** `deriveAttentionItems` over rows including `SHOW_FIRST_PUBLISHED` and `PICKER_EPOCH_RESET` returns neither, and returns the other rows unchanged. Assert against the returned list, not a rendered container.
11. **Bell still carries them.** Assert `bellExcludedCodes(false)` and `bellExcludedCodes(true)` both exclude neither code — the guard that makes §2.5's "nothing is lost" claim true rather than assumed.
12. **Button verbs.** `resolveActionLabels("SHOW_FIRST_PUBLISHED").idle === "Confirm"`, same for `PICKER_EPOCH_RESET`, and a fault code still reads "Mark resolved".
13. **Warnings-channel jump.** For `PARSE_ERROR_LAST_GOOD`, assert `effectiveSectionId` resolves to `warnings` and the row's `onNavigate` payload carries it.
14. **Focus rescue with a pressable needs-look row.** Focus a needs-look row, remove it from `items`, assert focus lands on the pill and not `<body>`. jsdom cannot prove visibility here — assert `document.activeElement` identity, not `toBeVisible()`.
15. **Layout (real browser).** Playwright assertions for every §5 invariant: each needs-you row's height ≥ 44px, the pill's resolved tap band ≥ 44px, the scroll region clips at `max-h-96` with 12 needs-you rows, and a long title does not widen the panel past its `w-[min(400px,calc(100vw-32px))]` box.

---

## 7. Meta-test inventory

Existing suites that pin the three-group shape and must be rewritten in the same commits, not deleted:

| File | Pins |
| --- | --- |
| `tests/components/admin/showpage/attentionMenuGroups.test.tsx` | All three headings, the empty-header conditional, the `aria-label` fallthrough (`tests/components/admin/showpage/attentionMenuGroups.test.tsx:143-159`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:315-319`) |
| `tests/dev/fullSplitCompositeRender.test.tsx` | Exact pill string `1 to confirm · 2 to review · 2 monitoring`, group order, needs-look rows with their links (`tests/dev/fullSplitCompositeRender.test.tsx:69-125`) |
| `tests/components/admin/showpage/attentionMenu.test.tsx` | Row shapes and navigation |
| `tests/components/admin/showpage/publishedPill.test.tsx` | Pill segments |
| `tests/components/admin/showpage/pageTransitions.test.tsx` | The "Needs your confirmation" header case at `tests/components/admin/showpage/pageTransitions.test.tsx:144` |
| `tests/components/admin/showpage/pillFocusReconcile.test.tsx` | Focus reconciliation — extended by test 14 |
| `tests/e2e/published-show-attention.spec.ts`, `tests/e2e/attention-pill-focus.spec.ts`, `tests/e2e/published-review-modal.layout.spec.ts` | Live panel behaviour and layout |
| `tests/e2e/_publishedReviewModalHarness.tsx` | Harness fixture shape |
| `lib/dev/attentionScenarios/tier2.ts` | Dev scenario expectations built on the three-group split (`lib/dev/attentionScenarios/tier2.ts:150`, `lib/dev/attentionScenarios/tier2.ts:184`) |

`tests/help/spec-citation-integrity.test.ts` verifies help-page spec citations; confirm no help page documents the retired pill copy before landing (checked at draft time: `app/help/admin/per-show-panel/page.mdx` does not).

---

## 8. UI gate

Every changed surface is UI under invariant 8: `components/admin/showpage/AttentionMenu.tsx`, `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/review/AttentionBanner.tsx`. `/impeccable critique` and `/impeccable audit` both run on the diff before close-out, with P0/P1 findings fixed or deferred via `DEFERRED.md`. Pre-code mechanical checklist applies: no em dashes in user-visible copy, apostrophe literals, `min-h-tap-min` on every new tap target, canonical `text-xs/relaxed` and `text-subtle` tokens.

No new colour token is introduced — the destination chip reuses the existing warning-surface foreground, so no new contrast pin is required in `DESIGN.md`.

---

## 9. Numeric sweep

| Value | Meaning | Source |
| --- | --- | --- |
| 3 → 2 | Rendered groups | §2.1 |
| 3 → 2 | Pill segments | §2.4 |
| 19 | Resolve-eligible codes registry-wide | `resolveActionLabel.ts:46-70` |
| 18 → 16 | Codes reading "Mark resolved" after §2.6 | §2.6 |
| 1 → 3 | Codes reading "Confirm" after §2.6 | §2.6 |
| 12 | Needs-look codes | `lib/adminAlerts/audience.ts:81-94` |
| 3 | Self-healing codes | `lib/adminAlerts/audience.ts:75-79` |
| 6 | `openSheet` (external) needs-look codes | `alertActions.ts:163-168` |
| 2 | Internal-action needs-look codes that get a chip | `alertActions.ts:169-170` |
| 2 | Self-linking codes suppressed by §2.3 | `SHOW_UNPUBLISHED`, `RESYNC_SHRINK_HELD` |
| 2 | Codes leaving the index | §2.5 |
| 2 | Codes landing on the warnings panel, not a card | §2.2 |
| 99 | Pill visible count cap | `PublishedReviewModal.tsx:789` |
| 44 | Tap-target floor in px | §5 |
| 400 | Panel max width in px | `AttentionMenu.tsx:119` |

The `6 + 2 + 2 + 2 = 12` needs-look codes reconcile: 6 external-chip, 2 internal-chip, 2 self-link-suppressed, 2 with no registered action (`USE_RAW_DECISION_STALE`, `ASSET_RECOVERY_BYTES_EXCEEDED` — absent from `ALERT_ACTION_CODES`, `alertActions.ts:13-37`).

---

## 10. Out of scope

- **Any DB migration.** No table, CHECK, enum, RPC, or trigger changes. No advisory-lock surface is touched.
- **New §12.4 message codes.** No catalog rows are added; §2.6 edits `RESOLVE_INTENTS` only, which is not the §12.4 catalog.
- **The bell's own grouping or copy.** §2.5 relies on existing bell behaviour and changes none of it.
- **The dashboard "Needs attention" inbox.** Named only to establish that its label is taken (§2.1).
- **Retiring `clearingKind`.** It still separates monitoring from needs-you and stays as-is.
- **Whether monitoring rows should jump.** Ratified read-only in §1.1.
