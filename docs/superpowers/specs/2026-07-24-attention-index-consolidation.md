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

**3. Rows and cards duplicate the way out.** `bucketAttention` is called with the full item list, unfiltered by `actionable` (`components/admin/showpage/PublishedReviewModal.tsx:551`), so an alert is represented both in its section and as a row in the dropdown. For needs-look items the row and the card render the same `a.action` link (`components/admin/showpage/AttentionMenu.tsx:204-219` and `components/admin/review/AttentionBanner.tsx:158-171`), so the way out is stated twice.

Two precisions, because the obvious stronger claims are both false. The row and the card do **not** show the same text: the row shows `item.menuTitle`, a short title (`components/admin/showpage/AttentionMenu.tsx:199`), while the card shows the full catalog sentence (`components/admin/review/AttentionBanner.tsx:239`). And **not every alert renders a card** — the notes channel intercepts exactly two codes before the card path and folds them into the Sheet-warnings panel instead (`lib/admin/parseAttentionNote.ts:23`, `lib/admin/sectionAttention.ts:116-121`), though only while that panel is available: if it is not, both fall through to an Overview card so nothing is dropped (`lib/admin/sectionAttention.ts:111-128`). Both facts are load-bearing later: the first is why deleting the row's link loses no text, the second drives §2.3.

**4. Two event-shaped alerts wear a fault's button verb.** `SHOW_FIRST_PUBLISHED` ("now live for crew at its share-token URL", `lib/messages/catalog.ts:1120-1121`, `severity: "info"`, `followUp: null`) and `PICKER_EPOCH_RESET` (whose own `helpfulContext` reads "Nothing to fix; this is a record of the reset.", `lib/messages/catalog.ts:3222`) describe events that happened, not conditions to clear. Both render a button reading "Mark resolved".

Note what this defect is **not**. Both codes are already excluded from the per-show index (§2.5, verified by execution), so neither reaches this panel or its badge. The wrong verb is visible in the **bell**, which shares the same label resolver. Defects 1 through 3 are about this panel; defect 4 is a copy bug that rides along because it lives in the same registry.

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
| The Changes feed is NOT a home for event-shaped alerts, should anyone propose moving them there rather than leaving them excluded. It reads `show_change_log` + open `sync_holds`, and its `change_kind` values are sheet-data changes in practice (`crew_added`, `crew_renamed`, `crew_removed`, `crew_email_changed`, `field_changed`). The column has no enum to appeal to — its CHECK is only `length(change_kind) > 0` — so the semantics live in the producers, which is exactly why an app-milestone alert has no home there without inventing a kind. | `lib/sync/feed/readShowChangeFeed.ts:1-8`; producers at `lib/dev/attentionScenarios/tier2.ts:430`, `lib/dev/attentionScenarios/tier2.ts:447`, `lib/dev/attentionScenarios/tier2.ts:457`, `lib/dev/attentionScenarios/tier2.ts:470`, `lib/dev/attentionScenarios/tier2.ts:477`; CHECK at `supabase/migrations/20260608000001_show_change_log.sql:33-35` |
| The pill stays interactive when only monitoring items exist, and keeps its quiet palette in that state. | `2026-07-22-monitoring-badge-expand.md` §3.1, implemented `PublishedReviewModal.tsx:323-324`, `components/admin/showpage/PublishedReviewModal.tsx:764-771` |
| Separators between pill segments are real `" · "` text nodes, in the announced string as well as the visible one. | `PublishedReviewModal.tsx:803`; memory #537 space-node rule |
| `SHOW_FIRST_PUBLISHED` and `PICKER_EPOCH_RESET` are ALREADY excluded from the index. This spec adds no exclusion mechanism and must not introduce a second registry for that policy. | Verified by execution (§2.5); `lib/adminAlerts/audience.ts:34-39` + `lib/admin/attentionItems.ts:367`; `lib/admin/attentionItems.ts:351-370`; pinned by `tests/admin/attentionExclusionSet.test.ts:107-120` and `tests/admin/pickerEpochCut.test.ts:20-39` |
| Removing the now-dead `dataGaps` wiring is OUT of scope. It is dead at HEAD, not made dead here. | §2.5, §10 |
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

The heading for group 1 renders **only** when the group is non-empty — the existing `hasActionable` conditional (`components/admin/showpage/AttentionMenu.tsx:123`) generalises to `needsYou.length > 0`. Its purpose is unchanged: a monitoring-only panel must not carry an empty section header.

**Heading placement is preserved, not normalised.** At HEAD the first group's heading sits OUTSIDE the scroll region — it renders at `components/admin/showpage/AttentionMenu.tsx:123-129` and the scroller opens after it at `components/admin/showpage/AttentionMenu.tsx:130` — while the second and third group headings render inside. This spec **keeps that structure**: "Needs you" stays pinned above the scroll area, "Monitoring" scrolls with the rows. Stated because "generalise the existing conditional" alone permits either placement, and the asymmetry is more visible with two groups than three. It is a deliberate retention: the pinned heading labels the panel while a long needs-you list scrolls under it. §6 test 5b pins the DOM relationship so it cannot drift silently.

Panel accessible name (`AttentionMenu.tsx:112-118`) becomes a two-branch fallthrough:

```
aria-label={needsYou.length > 0 ? "Needs you" : "Monitoring"}
```

**Ordering is unchanged.** `deriveAttentionItems` already returns `[...holdItems, ...actionableAlerts, ...needsLook, ...selfHeal]` (`lib/admin/attentionItems.ts:376`). Merging the middle two into one rendered group preserves button-clearable-first ordering inside it for free; no sort changes.

**"Needs attention" is not available as a heading.** It already names the dashboard section (`components/admin/Dashboard.tsx:751`), the route `/admin/needs-attention` (`app/admin/needs-attention/page.tsx:54`), and `components/admin/NeedsAttentionSummaryCard.tsx:46`. Reusing it here would make one label mean a narrower set in a different place.

**"Needs a look" survives as a per-section chip and is NOT retired.** The same words label a chip on a review-modal section that contains flagged rows (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:1264` pins it). This spec retires the dropdown *heading* only. The two surfaces are unrelated: one groups index entries, the other marks a section. An implementer sweeping for the string must leave the chip alone (§7.1).

### 2.2 Row behaviour — press to jump, no inline links

Every row under **Needs you** becomes the row shape currently used by actionable rows (`AttentionMenu.tsx:134-159`): a full-width `<button>` that calls `onClose()` then `onNavigate(item)`, with the trailing `→` glyph and the filled tone dot.

The needs-look row shape at `AttentionMenu.tsx:185-222` is deleted, along with its inner action `<a>` (`components/admin/showpage/AttentionMenu.tsx:208-218`). Its two informative parts survive inside the button: the title (`item.menuTitle`) and the fix hint from `NEEDS_LOOK_HINTS` (`lib/admin/needsLookHints.ts:12`), which renders in the same slot the actionable row uses for `item.menuSubtitle`.

**This is required, not stylistic:** an `<a>` cannot be nested inside a `<button>`. The single row shape is what makes the whole row pressable.

**Second-line rule.** Every alert item carries `menuSubtitle` (`lib/admin/attentionItems.ts:295`), and needs-look items additionally resolve a fix hint. The row renders **the hint when one exists, otherwise `menuSubtitle`**, never both.

This is behaviour-preserving for every item the production derivation can produce today, but **not** for one shape the component deliberately admits, and that difference is an intended improvement rather than an oversight. The fail-visible class — a non-actionable item with no `clearingKind` whose code is outside `NEEDS_LOOK_CODES` — classifies into needs-look (`components/admin/showpage/AttentionMenu.tsx:94-101`) but resolves no hint, and today's needs-look renderer has no `menuSubtitle` fallback (`components/admin/showpage/AttentionMenu.tsx:179-203`), so it renders as a bare title. Under the merged rule it gains its identity subtitle.

That is the right outcome: the fail-visible path exists so an unclassified item still surfaces, and surfacing it with its identity text ("Crew · John Redcorn") is strictly more useful than a bare title. The current one-line render is an artefact of two renderers differing, not a decision. An existing regression fixture has exactly this shape and pins the boundary (`tests/components/admin/showpage/attentionMenu.test.tsx:18-30` builds it, `tests/components/admin/showpage/attentionMenu.test.tsx:117-124` pins it), so the change is observable and must be re-pinned rather than allowed to drift — see §6 test 3b.

**Tone dot.** The merged row uses the actionable row's filled `TONE_DOT[item.tone]` dot (`components/admin/showpage/AttentionMenu.tsx:41-44`, `components/admin/showpage/AttentionMenu.tsx:144`). Former needs-look rows therefore change from a hollow `border-status-review` dot to a filled one — deliberate, since the hollow/filled contrast now carries the needs-you-versus-monitoring distinction rather than a distinction inside one group. Their screen-reader tone text is unchanged: needs-look rows already emit `TONE_DOT.notice.srText` (`components/admin/showpage/AttentionMenu.tsx:196`), which is the same string the merged row emits for a `notice`-tone item.

**The jump already works for these items.** The `alert_id` deep-link effect looks the item up in the unfiltered `attentionItems` list and calls `setJump({ itemId, sectionId: effectiveSectionId(item), nonce })` (`PublishedReviewModal.tsx:481-491`); nothing on that path is restricted to `actionable` items. `navigateTo` uses the same `setJump` shape (`components/admin/showpage/PublishedReviewModal.tsx:419-422`). Wiring needs-look rows to `onNavigate` reuses a working path.

**Jump target and card placement agree by construction, for every route.** `effectiveSectionId` wraps `resolveEffectiveSection` (`lib/admin/sectionAttention.ts:70-85`) with the SAME `placement` predicate pair that `bucketAttention` receives (`components/admin/showpage/PublishedReviewModal.tsx:553`), so a jump can never target a section the card did not land in. That covers the two anchored route families a needs-look item can take: `event`/`opening_reel` and `rooms`/`diagrams` resolve to their declared section when the anchor is mounted, and fall back to Overview when it is not (`lib/admin/sectionAttention.ts:77-83`) — the card falls back with it. No needs-look route needs special handling.

**Every item has somewhere to land.** For hold items the landing place is the `changes` section and its `Mi11GateActions` control, not a card (§1.1); holds are already pressable rows today, so this spec changes nothing for them. For alert items it is a card, and `bucketAttention` resolves an item's section to `opts.sectionAvailable(item.sectionId) ? item.sectionId : "overview"` (`lib/admin/sectionAttention.ts:123-126`). Under this spec that fallback is a **correctness guarantee**, not defensive code: an index entry with nowhere to land is an index that lies. The code comment at `sectionAttention.ts:113-115` calling the warnings-channel fallback "defensive" must be updated to say so.

Two items land on the Sheet-warnings panel rather than a card, because the notes channel intercepts them before the card path: `PARSE_ERROR_LAST_GOOD` and `RESYNC_QUALITY_REGRESSED` (`sectionAttention.ts:111-121`, routes at `lib/admin/attentionItems.ts:128`, `lib/admin/attentionItems.ts:131`). Their jump targets the warnings section. This is correct and in scope only as a test assertion (§6).

### 2.3 The card — a destination where the button would be

In `AttentionBanner`, the `footerRight` slot holds `PerShowAlertResolveButton` for actionable items and the italic `autoClearNote` otherwise (`components/admin/review/AttentionBanner.tsx:185-201`).

For **needs-you items that are not actionable** (the former needs-look set), `footerRight` becomes a **destination chip** rendering `a.action`, and the `autoClearNote` line is dropped — once the footer names a destination, "it clears when you've done it" is the only thing it could mean. `footerLeft`'s action link (`AttentionBanner.tsx:158-171`) is removed for these items, since the chip replaces it; the "Raised …" line stays.

**The chip is external-only. Every chip that can ever render reads `Google Sheets ↗`.** That is a derived fact, not a style choice, and both directions of the derivation must hold:

The only needs-look codes with an *internal* action are four: `PARSE_ERROR_LAST_GOOD`, `RESYNC_QUALITY_REGRESSED` (`lib/adminAlerts/alertActions.ts:169-170`), `SHOW_UNPUBLISHED` (`lib/adminAlerts/alertActions.ts:171`), and `RESYNC_SHRINK_HELD` (`lib/adminAlerts/alertActions.ts:141-149`). Each must be shown chip-less, and **all four are covered by the self-link guard below** — the notes channel is a second reason for two of them, not the primary one:

| Code | Warnings section available | Warnings section unavailable |
| --- | --- | --- |
| `PARSE_ERROR_LAST_GOOD` | Notes channel intercepts before the card path (`lib/admin/parseAttentionNote.ts:23`, `lib/admin/sectionAttention.ts:116-121`) — no card, so no chip | Falls **through** to the card path and lands in Overview (`lib/admin/sectionAttention.ts:111-128`, pinned by `tests/admin/bucketAttention.test.ts:64-71`). Card is in Overview, action targets `#overview`, so the self-link guard suppresses the chip |
| `RESYNC_QUALITY_REGRESSED` | Same as above | Same as above |
| `SHOW_UNPUBLISHED` | Card in Overview, action `#overview` — self-link guard | Unchanged |
| `RESYNC_SHRINK_HELD` | Card in Overview, action `#overview` — self-link guard | Unchanged |

An earlier draft derived external-only from "the notes codes never render a card." **That premise is false in the warnings-unavailable state**, where the router deliberately falls through to Overview so nothing is dropped. The invariant survives only because `resolveEffectiveSection` returns Overview in that state (`lib/admin/sectionAttention.ts:70-85`) and both note-code actions target Overview, so the self-link guard catches them there too. The guard is therefore the load-bearing mechanism for **all four** internal codes; the notes channel is a redundancy for two.

So the label rule has one live branch:

| `action.external` | Chip label | Applies to |
| --- | --- | --- |
| `true` | `Google Sheets ↗` | the 6 `openSheet` codes (`lib/adminAlerts/alertActions.ts:163-168`) |
| `false` | no chip | unreachable in practice, by both bullets above |

An internal-destination chip is therefore **not** implemented. If a future code gains an internal action *and* renders a card in a different section from its target, that is a new case requiring a spec amendment — not something the implementer should generalise for speculatively.

The chip carries no verb. Every verb tried in design committed to an amount of work and was wrong for some member of the set ("confirm" too small, "review" too soft, "fix" wrong for a deliberate state such as `SHOW_UNPUBLISHED`). A destination name commits to nothing and stays true.

**Self-link suppression (guard).** `SHOW_UNPUBLISHED` and `RESYNC_SHRINK_HELD` both route their card to the `overview` section (`lib/admin/attentionItems.ts:136`, `lib/admin/attentionItems.ts:130`) *and* point their action at `#overview` (`lib/adminAlerts/alertActions.ts:171`, `lib/adminAlerts/alertActions.ts:141-149`). The chip would point at the place the card already is. When `action.external === false` and the action's target section equals `effectiveSectionId(item)`, **no chip renders** and the footer keeps only the "Raised …" line. This guard is what makes the external-only statement true from the card side, so it is load-bearing rather than redundant with the table above.

Actionable cards and monitoring cards are unchanged: the resolve button and the `autoClearNote` respectively.

### 2.4 The badge

Three counted segments collapse to two (`PublishedReviewModal.tsx:785-840`):

| Segment | Text | Renders when |
| --- | --- | --- |
| 1 | `N issues` / `1 issue` | `needsYou.length > 0` |
| 2 | `N monitoring` | `monitoring.length > 0` |

Worked example, replacing today's `4 to confirm · 7 to review · 1 monitoring`: **`11 issues · 1 monitoring`**.

`issues` is a noun for the same reason the card chip has no verb, and it pluralises with an ordinary `s` — no subject-verb agreement branch, which "N need you" would have required at `N = 1`.

Retained verbatim from the current pill: the `99+` visible cap with the exact count preserved for assistive tech past the cap (`components/admin/showpage/PublishedReviewModal.tsx:787-798`), now on the single issues segment; the `" · "` real-text separator, rendered only between two present segments; the `monitoringOnly` quiet palette and its hollow leading dot (`components/admin/showpage/PublishedReviewModal.tsx:764-782`); the `title` attribute on the monitoring-only pill (`components/admin/showpage/PublishedReviewModal.tsx:758-762`); the `before:-inset-y-3` tap-band arithmetic (`components/admin/showpage/PublishedReviewModal.tsx:763`).

`interactive` (`components/admin/showpage/PublishedReviewModal.tsx:323`) and `monitoringOnly` (`components/admin/showpage/PublishedReviewModal.tsx:324`) keep their current definitions, restated over the merged lists: `interactive = needsYou.length > 0 || monitoring.length > 0`; `monitoringOnly = needsYou.length === 0 && monitoring.length > 0`.

### 2.5 The two event-shaped codes are ALREADY excluded — no change

An earlier draft of this spec proposed removing `SHOW_FIRST_PUBLISHED` and `PICKER_EPOCH_RESET` from the per-show attention index via a new `EVENT_SHAPED_CODES` set. **That work is already done in the tree.** Verified by execution, not by reading: a probe calling `deriveAttentionItems` with each code returned zero items for both, with `LIVE_ROW_CONFLICT` returning one as a control.

Two independent existing filters do it:

- `DOUG_EXCLUDED_CODES` is every `severity: "info"` code UNION `HEALTH_CODES` (`lib/adminAlerts/audience.ts:34-39`), applied inside `deriveAttentionItems` at `lib/admin/attentionItems.ts:367`. `SHOW_FIRST_PUBLISHED` carries `severity: "info"` (`lib/messages/catalog.ts:1119`), so it is in the info arm. Already pinned by `tests/admin/attentionExclusionSet.test.ts:107-120`.
- `PICKER_EPOCH_RESET` has an explicit clause in `deriveAttentionItems` (`lib/admin/attentionItems.ts:351-370`), pinned by `tests/admin/pickerEpochCut.test.ts:20-39`, which asserts the `ATTENTION_ROUTES` row "REMAINS for registry totality" while the derivation yields nothing.

**Therefore this spec adds no exclusion mechanism.** Introducing `EVENT_SHAPED_CODES` would put the same policy in a second registry — precisely the drift `tests/admin/attentionExclusionSet.test.ts` was written to prevent (its injected-set test proves the filter is set-driven rather than a hand-list). The remaining defect in this area is the button verb, which is §2.6.

**Consequence for the `dataGaps` field.** `dataGaps` is read onto an attention item only for `SHOW_FIRST_PUBLISHED` (`lib/admin/attentionItems.ts:307`), which never becomes an attention item, so that wiring is **already dead at HEAD** — this spec does not make it dead. Removing it is correct cleanup but it is pre-existing dead code with a 19-file test fan-out (§7.2), unrelated to the index consolidation. It is therefore **out of scope** (§10) and belongs in its own change.

### 2.6 The two button verbs

Both codes keep a resolve button in the bell — `resolveActionLabels` is shared by the show modal, the bell, and the developer telemetry panel (`lib/adminAlerts/resolveActionLabel.ts:4-6`). Their intent is wrong today:

| Code | Today | Becomes | Why |
| --- | --- | --- | --- |
| `SHOW_FIRST_PUBLISHED` (`resolveActionLabel.ts:60`) | `resolve` → "Mark resolved" | `confirm` → "Confirm" | The show went live. Nothing is broken; there is nothing to resolve. |
| `PICKER_EPOCH_RESET` (`resolveActionLabel.ts:58`) | `resolve` → "Mark resolved" | `confirm` → "Confirm" | A deliberate reset. Its catalog `helpfulContext` says "Nothing to fix; this is a record of the reset." |

The module's own rule: `confirm` = approving a deliberate change that already applied; `resolve` = clearing a fault (`lib/adminAlerts/resolveActionLabel.ts:9-12`). The remaining 16 resolve-eligible codes are faults and keep `resolve`.

**Where this is user-visible.** Both codes are excluded from the per-show index (§2.5), so the wrong verb does NOT appear in the show modal. It appears in the **bell**, which shares the same label resolver — one `admin_alerts` row renders in the show modal, the bell, and the developer telemetry panel, and the label is a property of the alert's intent rather than the surface (`lib/adminAlerts/resolveActionLabel.ts:4-6`). This is the only reason §2.6 is live work.

**Three lockstep updates, or CI fails.** `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` gates every intent change with defenses the change must satisfy together, in one commit:

| Gate | Assertion | Required action |
| --- | --- | --- |
| `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:38` | "the confirm set is exactly the approved list" | Add both codes to that approved list |
| `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:49` | "a warning-severity code is never confirm intent" | Confirm neither code is `severity: "warning"` before flipping. `SHOW_FIRST_PUBLISHED` is `severity: "info"` (`lib/messages/catalog.ts:1119`); `PICKER_EPOCH_RESET` declares no `severity` key |
| `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:63`, `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:71` | `RESOLVE_INTENTS` agrees with a committed baseline, plus a git-history layer | Regenerate/update the committed baseline in the same commit |

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
| `item.menuSubtitle` / hint | **no hint, subtitle present** | Subtitle renders. This is the fail-visible boundary shape (non-actionable, no `clearingKind`, code outside `NEEDS_LOOK_CODES`) and it is the ONE case where the merged rule changes observable output: today it renders a bare title. Deliberate (§2.2), pinned by §6 test 3b |
| `item.menuSubtitle` / hint | hint present, subtitle `null` | Hint renders; single second line. Unchanged from today's needs-look row |
| `item.tone` | `critical` | Filled `bg-status-degraded` dot and its existing screen-reader tone prefix, unchanged (`components/admin/showpage/AttentionMenu.tsx:42`). Reached today only by hold items, which are already pressable rows and keep their `changes` jump |
| `item.kind` | `"hold"` | Row renders as today: `menuSubtitle` "Pick what happens in Changes", jump to the `changes` section, no card. Never receives a destination chip (§2.3 applies to alert items only) |
| `a.action` | `null` (builder failed its fail-quiet guard) | No destination chip; footer keeps "Raised …" only |
| `a.action` | internal, target section == card's `effectiveSectionId` | No chip (§2.3 self-link suppression) |
| `needsYou.length` | `1` | Badge reads `1 issue` (singular) |
| `needsYou.length` | `> 99` | Badge reads `99+ issues`; exact count in an `sr-only` span (existing pattern `components/admin/showpage/PublishedReviewModal.tsx:789-798`) |
| `needsYou.length` | `0` and `monitoring.length` `0` | Pill non-interactive; menu cannot open (existing derived-open contract `components/admin/showpage/PublishedReviewModal.tsx:350-356`) |
| Alert read fault, **no pending hold** | `alertsDegraded === true` | Empty attention list, non-interactive degraded pill, Overview notice (`components/admin/showpage/PublishedReviewModal.tsx:306-308`, `components/admin/showpage/PublishedReviewModal.tsx:569`, `components/admin/showpage/PublishedReviewModal.tsx:877`) |
| Alert read fault, **one or more pending holds** | `alertsDegraded === true` | **NOT empty.** The loader zeroes only the alerts arm and passes the independently-read feed through, so hold items still flow (`app/admin/_showReviewModal.tsx:303-312`). `needsYou` is hold-only, the pill is interactive and counts those holds as issues, the menu lists them, AND the Overview degraded notice still renders. Producible state, already named `T2_DEGRADED_WITH_HOLDS` (`lib/dev/attentionScenarios/tier2.ts:395`). Hiding a live approve/reject hold during an alert-read fault is a P0 regression |

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

**Row-level transition, new to the former needs-look rows.** The actionable row carries `transition-colors duration-fast` for its hover state (`components/admin/showpage/AttentionMenu.tsx:142`); the needs-look `<div>` carried none (`components/admin/showpage/AttentionMenu.tsx:188`). Converting those rows to buttons therefore adds a hover colour transition where there was no hover state at all. Intended — it is the affordance that makes the row read as pressable — and it inherits `motion-reduce` handling from the same token set as the panel. Recorded here because it is a state change this inventory is supposed to enumerate, not because it needs mitigating.

**Dot vocabulary inside the merged group.** Three appearances coexist: `bg-status-degraded` for holds (`tone: "critical"`), filled `bg-status-review` for actionable alerts, and filled `bg-status-review` for former needs-look rows (previously hollow, §2.2). Holds keep their distinct critical dot; the hollow/filled contrast now separates needs-you from monitoring rather than separating rows inside one group.

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
| Scroll region `max-h-96 overflow-y-auto` (`components/admin/showpage/AttentionMenu.tsx:130`) | all ROWS, and the Monitoring heading | The scroller opens at `components/admin/showpage/AttentionMenu.tsx:130`, **after** the first group's heading (`components/admin/showpage/AttentionMenu.tsx:123-129`). So the first heading is pinned above the scroll area while every row and the second group's heading scroll inside it. Preserved exactly (§2.1). Re-asserted because the merged group can be longer than either predecessor. |
| Row `<button>` | row content | `min-h-tap-min w-full` (`components/admin/showpage/AttentionMenu.tsx:142`) — the 44px tap floor now applies to every needs-you row. Former needs-look rows were a `<div>` carrying only `py-3` (`components/admin/showpage/AttentionMenu.tsx:188`); their tap target was the **inner link**, which had its own floor (`components/admin/showpage/AttentionMenu.tsx:214`). So the change replaces a small in-row target with a full-width one rather than adding a floor where none existed — an improvement to verify, not a regression risk to mitigate. |
| Pill `<button>` | `before:absolute before:inset-x-0 before:-inset-y-3` (`PublishedReviewModal.tsx:763`) | Resolved tap band ≥ 44px. Unchanged by the segment merge; re-verified because the pill's text length changes. |
| Row title span | `truncate` within `min-w-0 flex-1` (`AttentionMenu.tsx:146-149`) | Long titles ellipsise instead of widening the panel. Now applies to former needs-look titles, which used `truncate` on a `block` inside a non-flex parent (`components/admin/showpage/AttentionMenu.tsx:197-200`). |

Tailwind v4 does not default `.flex` to `align-items: stretch`; every relationship above is stated by an explicit class, and the plan verifies each with a real-browser `getBoundingClientRect` assertion (jsdom does not compute layout).

---

## 6. Tests (TDD)

Each bullet is a failing-test-first task.

1. **Two groups only.** Mount `AttentionMenu` with one actionable, one needs-look, one self-heal item; assert exactly two group headings, reading "Needs you" and "Monitoring", and that "Needs your confirmation" / "Needs a look" are absent from the panel.
2. **Merged group ordering.** With two actionable and two needs-look items, assert the four rows appear actionable-first, in `deriveAttentionItems` order, under one heading.
3. **Every needs-you row is a button that jumps.** For a needs-look item, assert the row is a `<button>`, that pressing it calls `onClose` then `onNavigate` with that item, and that the row contains **no** `<a>` descendant. Scope the query to the row's own `data-testid`, not the panel.
4. **Monitoring rows stay inert.** Assert a monitoring row is not a button and has no interactive descendant.
5. **Empty-group headings.** needs-you-only → no "Monitoring" heading, `aria-label` "Needs you". monitoring-only → no "Needs you" heading, `aria-label` "Monitoring", and the group carries `rounded-t-md`.
3b. **Fail-visible boundary row gains its subtitle.** Build the shape the existing fixture uses — non-actionable, no `clearingKind`, code outside `NEEDS_LOOK_CODES`, non-null `menuSubtitle` — and assert the row renders BOTH its title and its `menuSubtitle`, where today it renders the title alone. Update `tests/components/admin/showpage/attentionMenu.test.tsx:117-124` in the same commit rather than leaving two suites disagreeing. This is a deliberate boundary change (§2.2), so the test's comment must say so; an unlabelled change here would read as a regression to the next person.
4b. **Degraded read with a hold still flowing.** Mount with `alertsDegraded` true and one pending hold. Assert the pill is interactive and reads `1 issue`, that the menu lists the hold under "Needs you", AND that the Overview degraded notice renders. Derive the expected count from the fixture. This is the anti-tautology guard for §3's split row: an implementation that short-circuits to an empty list on `alertsDegraded` passes every other test and fails this one, while hiding a live approve/reject control. The scenario already exists as `T2_DEGRADED_WITH_HOLDS` (`lib/dev/attentionScenarios/tier2.ts:395`).
5b. **Heading placement, as a DOM relationship.** With both groups populated, assert the "Needs you" heading is NOT a descendant of the `max-h-96 overflow-y-auto` scroll container, and that the "Monitoring" heading IS. Assert containment via `element.contains`, not by class name or position — a class assertion would pass if the heading moved inside a differently-styled wrapper. This is the guard for §2.1's placement retention; without it either placement satisfies every other test.
6. **Badge copy and pluralisation.** Assert `1 issue` at count 1, `11 issues` at 11, `99+ issues` plus an `sr-only` exact count at 120, and that the visible string is exactly `11 issues · 1 monitoring` with real text separators. Derive counts from the fixture, never hardcode.
7. **Card chip: external.** For `SHEET_UNAVAILABLE`, assert the footer-right slot holds a `Google Sheets ↗` link with `target="_blank"` and `rel="noopener noreferrer"`, that the `autoClearNote` text is absent, and that `footerLeft` no longer carries a duplicate action link.
8. **Card chip: self-link suppression.** For `SHOW_UNPUBLISHED` (card in Overview, action `#overview`), assert **no** chip renders and the footer holds only the "Raised …" line. This is the anti-tautology case for §2.3 — a naive implementation that always renders the chip passes test 7 and fails this one.
9. **Card chip: null action.** With `action: null`, assert no chip and no crash.
9b. **Card chip: the external-only invariant across BOTH warnings states.** A matrix, not a single case, because §2.3's derivation depends on two different mechanisms in the two states. For each of `PARSE_ERROR_LAST_GOOD` and `RESYNC_QUALITY_REGRESSED`: (a) warnings section AVAILABLE — assert `bucketAttention` puts the item in `notes` and produces no `sectionTop`/`byAnchor` card, so no chip can exist; (b) warnings section UNAVAILABLE — assert the item falls through to an Overview card (the documented no-drop fallback) AND that the rendered card carries **no** destination chip, which is the self-link guard doing the work. Case (b) is the one that matters: without it a compliant implementation passes (a) while the state the spec calls unreachable is in fact reachable.
10. **The two event codes stay out of the index — as a REGRESSION guard, not a new behaviour.** Both are already excluded at HEAD (§2.5), so a behavioural assertion here cannot fail first and is not a TDD task. It is written instead as a characterisation test that pins the existing contract against accidental removal during this refactor, and its comment must say so. Coverage already exists (`tests/admin/attentionExclusionSet.test.ts:107-120`, `tests/admin/pickerEpochCut.test.ts:20-39`); the only new work is asserting the merged-group derivation does not resurrect them. **No `EVENT_SHAPED_CODES` export is introduced** (§1.1), so there is no new mechanism to test.
11. **Bell still carries both codes.** Assert `bellExcludedCodes(false)` and `bellExcludedCodes(true)` exclude neither — this is what makes §2.6 live work rather than a change to a surface nobody sees.
12. **Button verbs, with their three lifecycle gates.** `resolveActionLabels("SHOW_FIRST_PUBLISHED").idle === "Confirm"`, same for `PICKER_EPOCH_RESET`, and a fault code still reads "Mark resolved". The change is incomplete unless `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` passes in the same commit — approved-confirm list, warning-severity prohibition, and committed baseline (§2.6).
13. **Warnings-channel jump.** For `PARSE_ERROR_LAST_GOOD`, assert `effectiveSectionId` resolves to `warnings` and the row's `onNavigate` payload carries it.
14. **Focus rescue with a pressable needs-look row.** Focus a needs-look row, remove it from `items`, assert focus lands on the pill and not `<body>`. jsdom cannot prove visibility here — assert `document.activeElement` identity, not `toBeVisible()`.
15. **Layout (real browser).** Playwright assertions for every §5 invariant: each needs-you row's height ≥ 44px, the pill's resolved tap band ≥ 44px, the scroll region clips at `max-h-96` with 12 needs-you rows, and a long title does not widen the panel past its `w-[min(400px,calc(100vw-32px))]` box.

---

## 7. Meta-test inventory

This inventory is **generated, not hand-listed**, so it is reproducible rather than a judgement call. Two sweeps, both run against the rebased tree at draft time.

### 7.1 Panel-shape sweep (20 files)

```
grep -rl '"Needs your confirmation"\|"Needs a look"\|Needs your confirmation\|attention-needslook-row\|attention-monitoring-group\|attention-menu-row\|attention-pill-monitoring-segment\|alert-pill' tests/ lib/dev/ app/
```

Unit — `tests/app/admin/showReviewModalLoader.test.tsx`, `tests/components/admin/showpage/attentionMenu.test.tsx`, `attentionMenuGroups.test.tsx`, `clearingPillLabel.test.tsx`, `flaggedZeroCountHeader.test.tsx`, `mappedSectionActiveFlag.test.tsx`, `pageTransitions.test.tsx`, `pillFocusReconcile.test.tsx`, `publishedPill.test.tsx`, `publishedReviewModal.test.tsx`, `publishedWarningsPanel.test.tsx`, `statusStrip.test.tsx`, `tests/components/admin/wizard/Step3ReviewModal.test.tsx`, `tests/dev/fullSplitCompositeRender.test.tsx`.

E2E — `tests/e2e/attention-modal-gallery.spec.ts`, `attention-pill-focus.spec.ts`, `published-review-modal.interactions.spec.ts`, `published-review-modal.layout.spec.ts`, `published-review-modal.realtime.spec.ts`, `published-show-attention.spec.ts`.

Highest-value pins within that set:

| File | Pins |
| --- | --- |
| `tests/components/admin/showpage/attentionMenuGroups.test.tsx` | All three headings, the empty-header conditional, the `aria-label` fallthrough (`tests/components/admin/showpage/attentionMenuGroups.test.tsx:143-159`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:315-319`) |
| `tests/dev/fullSplitCompositeRender.test.tsx` | Exact pill string `1 to confirm · 2 to review · 2 monitoring`, group order, needs-look rows with their links (`tests/dev/fullSplitCompositeRender.test.tsx:69-125`) |
| `tests/components/admin/showpage/pageTransitions.test.tsx` | The "Needs your confirmation" header case at `tests/components/admin/showpage/pageTransitions.test.tsx:144` |
| `tests/components/admin/showpage/pillFocusReconcile.test.tsx` | Focus reconciliation — extended by §6 test 14 |


### 7.1b Dev-gallery sweep (2 files) — a surface the marker grep does NOT reach

The §7.1 pattern returns **zero** matches in `lib/dev/attentionScenarios/`, because those files name the three classes in prose and scenario ids rather than in rendered markup or testids. They still pin the retired model and need a second, separate sweep:

```
grep -rln 'confirm, review\|MONITORING_ONLY\|clearingKind' lib/dev/
```

| File | Pins |
| --- | --- |
| `lib/dev/attentionScenarios/tier2.ts` | The three-class model throughout: `T2_MONITORING_ONLY` scenario id (`lib/dev/attentionScenarios/tier2.ts:38`), `T2_CLASS_MIX` described as "One of each pill class: confirm, review, monitoring" (`lib/dev/attentionScenarios/tier2.ts:386`), a comment expecting the pill to read "2 monitoring" (`lib/dev/attentionScenarios/tier2.ts:377-378`), and the actionable/`clearingKind` split helpers (`lib/dev/attentionScenarios/tier2.ts:163`, `lib/dev/attentionScenarios/tier2.ts:184`) |
| `lib/dev/attentionScenarios/tier3.ts` | Scenario label "Everything at once: confirm, review, and monitoring" (`lib/dev/attentionScenarios/tier3.ts:100`) |

`tests/dev/attentionScenariosTier1.test.ts:13-17` asserts the gallery covers every `ATTENTION_ROUTES` code, so a scenario rename must keep that totality intact.

**One listed suite is DARK and currently proves nothing.** `tests/e2e/attention-pill-focus.spec.ts` exists (21.7KB of tests) but appears **zero** times in `playwright.config.ts`, and `npx playwright test --list` collects zero tests from it. Every project's `testMatch` is an explicit allow-list, and the config says so directly: "a spec absent from this regex runs NOWHERE and silently proves nothing" (`playwright.config.ts:87-88`). Verified at draft time:

```
grep -c "attention-pill-focus" playwright.config.ts   # 0
npx playwright test --list | grep -c attention-pill-focus  # 0
```

Editing it as part of this change would produce the appearance of coverage with none of the substance. The plan must therefore run it locally first and then either wire it into `desktop-chromium`'s `testMatch` alongside the other `published-review-modal.*` specs, or record it as pre-existing dark debt with a backlog reference. This spec does not decide which — it only forbids silently editing a file that never executes. Pre-existing condition, not caused by this change.

**Two matches are a different surface and must NOT be rewritten.** `tests/components/admin/wizard/Step3ReviewModal.test.tsx` and `publishedWarningsPanel.test.tsx` match on the per-section chip "Needs a look", which this spec does not retire (§2.1). They are listed so the implementer checks them for accidental coupling and then leaves them alone. `tests/components/admin/wizard/sectionCountChip.test.ts` is the same case.

### 7.2 dataGaps sweep (19 files) — recorded as a NO-CHANGE verification

`dataGaps` on the attention item is dead at HEAD and its removal is **out of scope** (§1.1, §2.5, §10). Nothing in this sweep is edited by this change. It is kept only so the implementer can verify none of these files needed touching, and so the follow-up change that does remove the field starts with its fan-out already mapped. Files carrying the attention item's `dataGaps`:

```
for f in $(grep -rl "dataGaps" tests/); do grep -q "alertId\|AttentionItem\|attentionItems" $f && echo $f; done
```

`tests/admin/anchorRouting.test.ts`, `attentionItems.test.ts`, `bucketAttention.test.ts`, `crewMatchFanout.test.ts`, `parseAttentionNote.test.ts`, `parseNoteCopy.test.ts`, `tests/components/admin/anchorMount.test.tsx`, `compactAlertCompoundTransitions.test.tsx`, `tests/components/admin/review/attentionBanner.test.tsx`, `tests/components/admin/review/showReviewSurfaceAnchors.test.tsx`, `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx`, `tests/components/admin/showpage/attentionMenu.test.tsx`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx`, `tests/components/admin/showpage/pageTransitions.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `warningsPanelNotes.test.tsx`, `tests/e2e/_compactAlertCardLiveEntry.tsx`, `_pillFocusLiveEntry.tsx`, `_publishedReviewModalHarness.tsx`.

For the future change, not this one: most carry `dataGaps: null` as a fixture key and would only need the key dropped, while two carry **live assertions** on the detail band that would have to go with the field — `tests/components/admin/review/attentionBanner.test.tsx:148` and `tests/components/admin/review/attentionBanner.test.tsx:257`. Under this spec all 19 stay exactly as they are.

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
| 12 | Entries in `NEEDS_LOOK_CODE_LIST` | `lib/adminAlerts/audience.ts:81-94` |
| 11 | Of those, codes that can actually reach the panel | §9 reconciliation below |
| 3 | Self-healing codes | `lib/adminAlerts/audience.ts:75-79` |
| 6 | `openSheet` (external) needs-look codes | `alertActions.ts:163-168` |
| 2 | Notes-channel codes: internal action; carded only when the warnings section is unavailable, chip-less in both states via the self-link guard | `lib/admin/parseAttentionNote.ts:23`, `lib/admin/sectionAttention.ts:111-128` |
| 2 | Self-linking codes suppressed by §2.3 | `SHOW_UNPUBLISHED`, `RESYNC_SHRINK_HELD` |
| 0 | Codes this spec removes from the index (both already excluded at HEAD) | §2.5 |
| 2 | Codes landing on the warnings panel when it is available, and on an Overview card when it is not | §2.2, §2.3 |
| 4 | Internal-action needs-look codes, all chip-less via the self-link guard | §2.3 |
| 3 | ALERT codes that can reach the merged group's button-clearable half | `ROLE_FLAGS_NOTICE`, `AMBIGUOUS_EMAIL_BINDING`, `LIVE_ROW_CONFLICT`. Holds also occupy that half but clear through the Changes section's approve/reject control, not a resolve button (§1.1) |
| 99 | Pill visible count cap | `PublishedReviewModal.tsx:789` |
| 44 | Tap-target floor in px | §5 |
| 400 | Panel max width in px | `AttentionMenu.tsx:119` |

`NEEDS_LOOK_CODE_LIST` has 12 entries but only **11** can reach the panel, and the twelfth is worth stating because it looks like an omission otherwise. `USE_RAW_DECISION_STALE` is in the list (`lib/adminAlerts/audience.ts:92`) and in the catalog (`lib/messages/catalog.ts:207`), but it is NOT an admin-alert producer code — it is absent from `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9`), and `tests/admin/_metaAttentionRoutes.test.ts:14` asserts `ATTENTION_ROUTES` keys are set-equal to that registry, so it has no route and never becomes an attention item. It sits in the list only to type the fix-hint map.

The remaining 11 reconcile as `6 + 2 + 2 + 1`: 6 external-chip; 2 notes-channel (internal action, intercepted before the card path when warnings is available and self-link-suppressed on the Overview fallback when it is not, so chip-less in both states); 2 self-link-suppressed (`SHOW_UNPUBLISHED`, `RESYNC_SHRINK_HELD`); 1 with a route but no registered action (`ASSET_RECOVERY_BYTES_EXCEEDED` — routed at `lib/admin/attentionItems.ts:120`, absent from `ALERT_ACTION_CODES` at `lib/adminAlerts/alertActions.ts:13-37`). **Only the first bucket ever renders a chip** (§2.3).

---

## 10. Out of scope

- **Removing the dead `dataGaps` wiring.** It is dead at HEAD, not made dead by this spec (§2.5), and carries a 19-file test fan-out (§7.2). Its own change.
- **Any new exclusion mechanism.** `EVENT_SHAPED_CODES` was proposed and withdrawn; the policy already lives in `DOUG_EXCLUDED_CODES` plus the explicit picker clause (§1.1).

- **Any DB migration.** No table, CHECK, enum, RPC, or trigger changes. No advisory-lock surface is touched.
- **New §12.4 message codes.** No catalog rows are added; §2.6 edits `RESOLVE_INTENTS` only, which is not the §12.4 catalog.
- **The bell's own grouping or copy.** §2.5 relies on existing bell behaviour and changes none of it.
- **The dashboard "Needs attention" inbox.** Named only to establish that its label is taken (§2.1).
- **Retiring `clearingKind`.** It still separates monitoring from needs-you and stays as-is.
- **Whether monitoring rows should jump.** Ratified read-only in §1.1.
