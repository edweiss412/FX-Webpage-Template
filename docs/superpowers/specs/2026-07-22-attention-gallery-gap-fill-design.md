# Attention gallery gap-fill — tier-3 in switcher, compound axes, realistic many-state, rich fixture, section-grouped nav

**Date:** 2026-07-22
**Amends:** `docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md` (renders tier 3 in the switcher, revising that spec's ratified "Tier 3 stays materialize-only and is not rendered by the switcher" scope row — line 24) and `docs/superpowers/specs/2026-07-21-gallery-switcher-slim-bar-design.md` (bar gains a section group chip + jump dropdown inside the existing slim-row budget).
**Unchanged:** the scenario catalog's derivation core, `GalleryWriteGuard`, the materialize path's write set, `PublishedReviewModal` and every production module. This is a dev-surface-only feature; no DB schema, no migrations, no advisory locks, no mutation surfaces.

## §1 Purpose

The switcher gallery sweeps every attention atom (one scenario per alert code, per warning code, per structural axis) but almost never shows molecules: tier 3 (alerts+warnings, alerts+holds composites) is excluded from the switcher; `T2_MANY` renders 12 uncataloged filler codes with identical fallback cards; no scenario combines the pill's three clearing classes; degraded never co-occurs with holds; the feed's truncation notice is never rendered; and the host show is so sparse (1 crew row, zero rooms/hotels/transport/contacts) that every card sits in an unrealistically empty section. Separately, ~64 rendered scenarios navigate as one flat Prev/Next list with no organization. This spec fills those gaps.

### §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Tier 3 renders in the switcher. This deliberately amends the 2026-07-21 switcher spec's scope row ("Tier 3 stays materialize-only", line 24). Materialize stays available for tier 3 — the two presentations coexist. | This spec; user-approved 2026-07-22. |
| Rich base snapshot applies to ALL scenarios (no per-scenario `dense` flag). | User picked "Rich base for all" 2026-07-22. |
| Rich snapshot is **gallery-render-only**. Materialize writes raw scenario rows (`admin_alerts` insert `lib/dev/materialize/run.ts:207`, `sync_holds` insert `run.ts:252`, `shows_internal.update({parse_warnings})` `run.ts:269-270`) and never consumes `buildGallerySnapshot` — so the richer fixture changes zero DB writes. | `lib/dev/materialize/run.ts`; verified 2026-07-22 citation pass. |
| `T2_MANY` is REPLACED by the realistic mix (fillers deleted), not kept alongside. | User picked "Replace with real mix" 2026-07-22. |
| Nav = section-ordered walk + section jump dropdown + current-section chip (the "Jump menu + ordered walk" option). | User-approved 2026-07-22. |
| Close semantics, Escape swallowing, the body-portal control bar, and the dev-instrument a11y carve-out are all unchanged from the switcher spec (§1.1 there). | 2026-07-21 switcher spec. |
| Group labels in the bar are gallery-local human words ("Overview", "Crew", …), NOT raw catalog codes — invariant-5 posture of the bar is unchanged (codes stay on `data-codes` only, `components/admin/dev/SwitcherControls.tsx:20-21` and `components/admin/dev/SwitcherControls.tsx:60`). | 2026-07-21 switcher spec; this spec §3.5. |
| Scenario ids are stable: no existing id changes; deep-link contract (`?scenario=<id>`) unchanged. Tier-3 ids become deep-linkable as a consequence of rendering (the resolver already keys off the rendered list). | `buildSwitcherScenarios.ts:76-83`. |
| `MENU_CAP` stays 12 and keeps its name; the realistic mix targets 12 total items (11 alerts + 1 hold). The modal menu itself has NO hard cap — it scrolls (`AttentionMenu.tsx:122`, `max-h-96 overflow-y-auto`) — so 12 is a scenario-composition constant, not a modal contract. | Citation pass item 3. |
| No new completeness meta-test for scenario totality — tier-1 totality remains structural (runtime-derived from `ATTENTION_ROUTES` keys), per the 2026-07-20 catalog spec's declined gate. | `lib/dev/attentionScenarios/tier1.ts:1-7`. |

## §2 Current state (all verified 2026-07-22)

- `partitionScenarios` skips tier 3: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:50` (`if (s.tier === 3) continue;`).
- `GallerySwitcherScenario.tier: 1 | 2` — `lib/dev/galleryModalTypes.ts:33-39`; `SwitcherControls` prop `tier: 1 | 2` — `components/admin/dev/SwitcherControls.tsx:35`.
- `AttentionScenario` — `lib/dev/attentionScenarios/types.ts:50-66`: `{id, tier: 1|2|3, label, alerts, holds, warnings? (tri-state), bucket? (tier-2-only), degraded? (tier-2-only)}`. `validateScenario` (`lib/dev/attentionScenarios/validate.ts:161`) rejects bucket/degraded outside tier 2, duplicate alert codes (`lib/dev/attentionScenarios/validate.ts:187`), duplicate `(domain, entity_key)` holds (`lib/dev/attentionScenarios/validate.ts:197`).
- `ATTENTION_ROUTES` — `lib/admin/attentionItems.ts:103-151`, 45 codes: overview 34, crew 3, event 3 (anchor `opening_reel`), rooms 3 (anchor `diagrams`), warnings 2. Route shape `attentionItems.ts:34-37`; unregistered code falls back to overview (`toAlertItem`, `lib/admin/attentionItems.ts:272`).
- Clearing classes: `clearingKind = isSelfHealing(code) ? "self_heal" : "needs_look"` for non-actionable items (`attentionItems.ts:264-266`); `actionable = !isInboxRouted && !isAutoResolving` (`lib/admin/attentionItems.ts:261`). Pill segments computed in `components/admin/showpage/PublishedReviewModal.tsx:307-320`, rendered at `components/admin/showpage/PublishedReviewModal.tsx:760-802` ("N to confirm" / "N to review" / "N monitoring"), monitoring-only variant `components/admin/showpage/PublishedReviewModal.tsx:831-856`.
- Feed truncation notice: `components/admin/ChangesFeed.tsx:98-102` (`data-testid="change-feed-truncation"`, "Showing the 50 most recent changes…"); `components/admin/showpage/ChangesSection.tsx:31` feed prop `{entries, truncated} | null`, `truncated` forwarded at `components/admin/showpage/ChangesSection.tsx:73`. `buildScenarioFeed` currently hardcodes `truncated: false` (`lib/dev/deriveScenarioAttention.ts:60`).
- Warning→section routing: by warning **kind**, `KIND_TO_SECTION` `lib/admin/step3SectionStatus.ts:22-40`; `sectionForWarning` `lib/admin/step3SectionStatus.ts:70`; unmapped/unrendered → the `"warnings"` bucket (`warningsBySection`, `lib/admin/step3SectionStatus.ts:84-92`). `buildWarning` (`tier1.ts:139-151`) emits no `kind`, so tier-1 warning scenarios land in the warnings bucket.
- Snapshot adapter row narrowing (`components/admin/review/publishedAdapter.ts`): `toCrewRow` `components/admin/review/publishedAdapter.ts:125-136`, `toRoomRow` `components/admin/review/publishedAdapter.ts:138-157`, `toHotelRow` `components/admin/review/publishedAdapter.ts:159-170`, `toContactRow` `components/admin/review/publishedAdapter.ts:172-180`, `toTransportationRow` `components/admin/review/publishedAdapter.ts:182-197` + `pickTransportation` `components/admin/review/publishedAdapter.ts:202-207` (lowest-id, single pick). All expect `to_jsonb(row)`-shaped records.
- `deriveAlertRowFields(row, identity)` → `{identityText, messageParams, crewName}` — `lib/adminAlerts/deriveAlertRowFields.ts:46-54`; the gallery's `galleryIdentity` is that `identity` param.
- `AttentionItem` carries `sectionId: RoutedSectionId` (`"overview" | "changes" | SectionId`), `crewKey`, `actionable`, `clearingKind` — `lib/admin/attentionItems.ts:68-89`. No anchor field on the item.
- `deriveScenarioAttention` is the admitted second caller of `deriveAttentionItems` (topology pinned by `tests/admin/_metaAttentionItemsTopology.test.ts`; header `lib/dev/deriveScenarioAttention.ts:11-14`).
- Bar layout: single collapsed row that must clear the modal panel (slim-bar spec, `ATTN-GALLERY-CONTROLBAR-OVERLAP-1`); footnotes live behind the excluded-panel disclosure (`SwitcherControls.tsx:96-114`).

## §3 Design

### §3.1 Tier 3 renders in the switcher

- Delete the `tier === 3` skip in `partitionScenarios` (`buildSwitcherScenarios.ts:50`). Tier-3 scenarios flow through the SAME expressible/visible predicates as tiers 1–2. All three current composites pass both (no `bucket`, no `degraded`, each has items).
- Widen `GallerySwitcherScenario.tier` to `1 | 2 | 3` (`galleryModalTypes.ts:35`) and `SwitcherControls` `tier` prop to match (`SwitcherControls.tsx:35`). The tier chip renders "tier 3" with no other change.
- `resolveInitialScenario` needs NO edit: it already keys off the rendered list (`buildSwitcherScenarios.ts:82`); tier-3 ids become resolvable because they are now rendered. The old spec's "tier-3 → index 0" row (`docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md:148`) is superseded for rendered tier-3 ids; unknown/excluded ids still → null.
- Materialize (`MaterializeCard`, `applyAttentionScenario`) is untouched; tier 3 keeps both presentations.
- The tier-3 `galleryIdentity` divergence note (`tier3.ts:52-56`) stays accurate: switcher shows the declared identity; materialize resolves the real one.

### §3.2 New tier-2 compound axes

Four new tier-2 scenarios, appended to `tier2Scenarios()` and `T2_REQUIRED_IDS` (`tier2.ts:32-48`). All use the existing `alert()` / `hold()` / `scenario()` helpers and runtime `pickCode`-style selection so classes cannot silently rot.

| Id const | Id | Contents | Gap it closes |
| --- | --- | --- | --- |
| `T2_CLASS_MIX` | `t2-class-mix` | 3 alerts selected by the PILL's real predicates, not the routing ones: one with `actionable === true`, one deriving `clearingKind === "needs_look"`, one deriving `clearingKind === "self_heal"` (note `isAutoResolving` ≠ `isSelfHealing` — audience.ts:63 vs :102 — so a naive `pickCode("auto")` can still class as needs_look and collapse the pill to two segments). Selection helper classifies candidate codes through `deriveScenarioAttention` (or the same predicates it uses) at runtime and throws if any class empties. Pill renders all three segments ("to confirm" / "to review" / "monitoring", `components/admin/showpage/PublishedReviewModal.tsx:307-320` and `components/admin/showpage/PublishedReviewModal.tsx:760-802`). | Composite pill with all three segments live. |
| `T2_DEGRADED_WITH_HOLDS` | `t2-degraded-with-holds` | `degraded: true` + 1 hold (`hold("dana-reed")`), no alerts. The real production shape: alert read fault while hold-derived items still flow (`_showReviewModal.tsx:305-311` passes `alerts: []` + live feed when degraded). | Degraded co-occurring with items. |
| `T2_MULTI_HOLD` | `t2-multi-hold` | 3 holds with distinct entity keys (`dana-reed`, `sam-ito`, `kim-cho`), no alerts. Distinct keys satisfy the duplicate-hold rejection (`validate.ts:197`). | Multi-hold density in menu + Changes. |
| `T2_FEED_TRUNCATED` | `t2-feed-truncated` | 1 hold + new scenario field `feedTruncated: true` — renders the Changes truncation notice (`ChangesFeed.tsx:98-102`). | Truncation notice never rendered. |

**`feedTruncated` field.** New optional `feedTruncated?: boolean` on `AttentionScenario` (`types.ts`), tier-2-only exactly like `degraded` (validator arm added beside `validate.ts`'s tier-2 gate; rejected on tiers 1/3). Consumed in ONE place: `buildScenarioFeed` (`deriveScenarioAttention.ts:58-61`) returns `truncated: s.feedTruncated === true` instead of hardcoded `false`. When `feedTruncated` is true and `holds` is empty, the scenario is still valid but the feed is `null` (no entries → no feed) — so the canonical scenario carries ≥1 hold; the validator does NOT enforce that coupling (guard table §4 covers the render outcome). Materialize never reads `feedTruncated` (tier-2 is not materializable), so no write-path change.

**Flag lifecycle (`feedTruncated`):** storage = scenario literal (`tier2.ts`) | write path = none (never persisted) | read path = `buildScenarioFeed` only | effect = `feed.truncated` → truncation notice. No zombie column.

### §3.3 Realistic many-state (replaces the fillers)

`T2_MANY` keeps its id (`t2-many`) and label intent but its contents become 12 real items: **11 alerts + 1 hold**.

Composition rules (all enforced by construction in `tier2.ts`, not hand-maintained lists):

- 11 DISTINCT real codes (duplicate-code rejection `validate.ts:187` forces distinct).
- Section spread: 1 rooms-anchored (`anchoredCode()`), 1 event-anchored (new `eventCode()` helper — same shape as `anchoredCode()` but `sectionId === "event"`, excluding context-required/cut codes; throws if the class empties), 1 crew (`crewAlert()` — carries identity), 8 overview codes.
- Class spread within the overview 8: at least 1 inbox, 1 auto, 1 actionable (`pickCode` variants); remainder filled from the sorted context-free surviving list, skipping codes already used. If fewer than 8 such overview codes exist, take what exists and backfill from context-required codes WITH their `ALERT_ROW_OVERRIDES` contexts imported from tier1 (`tier1.ts:37-71`) — the override table is exported for reuse.
- Occurrence variety: exactly one of the 11 carries `occurrence_count: 7` (the repeat-count badge in a dense list).
- 1 hold (`hold("dana-reed")`) so the mix spans alert+hold kinds and the Changes badge participates.
- `GALLERY_FILLER_` codes are deleted entirely (grep must return zero hits post-change).
- Label: `"12 real items across sections and classes"` (count literal must equal 11 alerts + 1 hold; numeric-sweep anchor).

Anchors: `anchorsWantedFor` (`buildScenarioModalData.ts:39-47`) already populates diagrams/opening-reel flags from the codes' routes — the rooms/event items land in their true sections with no new mechanism.

### §3.4 Rich base snapshot

`buildGallerySnapshot` (`lib/dev/publishedModalFixture.ts:57-101`) gains realistic density. Every value fixed/deterministic (no `Date.now()`, no randomness). Target contents, shaped to pass the adapter's narrowing (§2 citations):

- `crew_members`: 6 rows (ids `cccccccc-…-0001`…`-0006`; names Gallery Crew One…Six with role variety: PM, TD, A1, V1, LD, Carp). Keep row 1's existing id/name so tier-2 crew scenarios' declared identity ("Dana Reed") still matches nothing structurally — the crew SECTION is display-only here; `crewKey` fallback behavior is what tier-2 probes.
- `rooms`: 3 rows through `toRoomRow` (`components/admin/review/publishedAdapter.ts:138-157`) — name, dims, power fields as the narrower expects.
- `hotel_reservations`: 2 rows through `toHotelRow` (`components/admin/review/publishedAdapter.ts:159-170`).
- `transportation`: 2 rows through `toTransportationRow` (`components/admin/review/publishedAdapter.ts:182-197`); `pickTransportation` (`components/admin/review/publishedAdapter.ts:202-207`) picks lowest-id — both rows carry sortable ids so the pick is deterministic.
- `contacts`: 2 rows through `toContactRow` (`components/admin/review/publishedAdapter.ts:172-180`).
- `agenda_links`: 1 entry (whatever shape the adapter/`PublishedSectionData` consumes at its narrowing site — verified at plan time).
- `pull_sheet`, `run_of_show`, financials: unchanged (empty) — out of scope.

The exact field lists for each row are pinned at PLAN time against the adapter narrowing functions line-by-line (pre-draft code-verification pass); this spec pins the COUNTS and the requirement that every row survives its narrower (a dropped row is a test failure, not a silent thinning).

Consequences: every scenario's backdrop becomes a populated show; `renderedSectionIds` will include more sections (rooms/hotels/transport/contacts render), which changes `bySection` inclusion for warning scenarios — warning placement itself is kind-routed and unaffected. Existing tests that assert against the sparse fixture (e.g. `tests/dev/buildScenarioModalData.test.ts`, switcher/page tests) are updated to the rich fixture's facts, never loosened.

### §3.5 Section-grouped nav

**Grouping model.** Each RENDERED scenario gets a `group: ScenarioGroupId` computed server-side in `partitionScenarios` from real routers — never a hand-tagged label:

- `sections := { item.sectionId for item of deriveScenarioAttention(s) } ∪ { sectionForWarning(w) ?? "warnings" for w of s.warnings ?? [] }` — alert/hold placement from the derived items' `sectionId` (`attentionItems.ts:71`), warning placement from the kind router (`lib/admin/step3SectionStatus.ts:70`), warnings bucket fallback mirroring `warningsBySection` (`lib/admin/step3SectionStatus.ts:84-92`).
- `|sections| === 0` → group `"baseline"` (empty + degraded-empty scenarios).
- `|sections| === 1` → that section's group.
- `|sections| > 1` → group `"mixed"`.

**Group order** (fixed): `overview`, `crew`, `rooms`, `event`, `changes`, `warnings`, `mixed`, `baseline`. Display labels (gallery-local, §1.1): Overview, Crew, Rooms, Event details, Changes, Warnings, Mixed, Baseline. Empty groups are omitted from the dropdown.

**Ordering.** `partitionScenarios` returns the rendered list SORTED by group order, stable within a group (existing catalog order preserved). Prev/Next walks this order; index math in `AttentionModalSwitcher` is unchanged.

**Bar.** `SwitcherControls` gains:

- A native `<select>` (jump dropdown) listing the non-empty groups as `<option>`s — label + scenario count (e.g. "Crew (9)"). Changing it jumps to the FIRST scenario of that group (`onJumpTo(index)` prop; the switcher owns index state). Native select keeps the a11y story free and the bar slim (one row; the select replaces no existing element and truncates via `max-w`). Value tracks the CURRENT scenario's group (stepping across a group boundary updates it).
- The current group is thereby always visible in the bar (the select doubles as the section chip — no separate chip element, one fewer thing fighting for row width).
- `tier` chip, live region, excluded toggle, Prev/Next: unchanged.

New `SwitcherControls` props: `group: ScenarioGroupId`, `groups: Array<{ id, label, count, firstIndex }>`, `onJumpTo(i: number)`. `GallerySwitcherScenario` gains `group: ScenarioGroupId`.

**Transition inventory (bar)** — see §3.6. select value change — instant, native control, no animation. Group boundary crossing during arrow stepping — instant select-value update, no animation. Excluded-panel disclosure — unchanged (existing instant toggle). No other visual states added; no fixed-dimension parent introduced (bar remains content-height, so no Dimensional Invariants section is required).

**A11y:** the select carries `aria-label="Jump to section"`; it participates in the existing dev-instrument carve-out (outside the modal's aria-modal tree, ratified in the switcher spec §1.1). The live region announcement (position + label) is unchanged and still fires on jump (index changes).

### §3.6 Transition Inventory

| State pair | Treatment |
| --- | --- |
| Select value change (jump) | Instant — native control, no animation. |
| Group boundary crossed via arrow stepping | Instant select-value update, no animation. |
| Excluded-panel disclosure open/close | Unchanged existing instant toggle. |
| Compound: jump while excluded panel open | Panel stays open; scenario + select update instantly. |

No other visual states are added.

### §3.7 Dimensional Invariants

None: the bar remains a content-height, content-width flex row (no fixed-dimension parent introduced); the new select sizes to content with a `max-w` truncation cap. No parent→child dimension guarantees are required, so no real-browser layout-dimensions task is mandated.

## §4 Guard conditions

| Input | Degenerate value | Rendered outcome |
| --- | --- | --- |
| `feedTruncated` on a holds-empty scenario | `true`, `holds: []` | `buildScenarioFeed` → `null` (no entries) → no feed, no notice; valid but pointless — canonical scenario carries a hold. |
| `feedTruncated` on tier 1/3 | any | `validateScenario` rejects (tier-2-only arm). |
| `groups` with one group total | single-entry select | Select renders with one option; jump is a no-op to index 0 of that group. |
| Group of a scenario whose warnings are all unmapped kinds | — | `"warnings"` section → warnings group (mirrors production bucket). |
| Tier-3 id in `?scenario=` | rendered id | Resolves (rendered list membership); excluded/unknown → null → index 0 (unchanged rule). |
| `eventCode()` / `pickCode` class empty after catalog drift | — | Throws at build (existing tier-2 posture, `tier2.ts:77-79`) — the matrix is updated, never silently skipped. |
| 12-item mix under duplicate-code drift | — | `validateScenario` duplicate rejection fails the catalog test; composition helpers select distinct codes by construction. |
| Rich fixture row dropped by adapter narrowing | malformed row | Test asserts adapter output counts (3 rooms, 2 hotels, 1 transport pick, 2 contacts, 6 crew) — a dropped row fails loud. |

## §5 Tests

Updated (facts change, assertions stay strict): `tests/app/admin/attentionGalleryPage.test.tsx`, `attentionModalGallery.serverProps.test.ts` (tier-3 now rendered; group field), `tests/components/admin/dev/switcherControls.test.tsx` (select, props), `attentionModalSwitcher.test.tsx` (onJumpTo, sorted order), `tests/dev/attentionScenariosTier2.test.ts` (+4 ids, T2_MANY composition), `attentionScenariosIndex.test.ts`, `attentionScenariosValidate.test.ts` (feedTruncated arms), `buildScenarioModalData.test.ts` + `deriveScenarioAttention.test.ts` (rich fixture, truncated feed), `tests/e2e/attention-modal-gallery.spec.ts` (grouped walk).

New assertions (anti-tautology: each states its failure mode):

1. **Grouping derivation** — for a fixed scenario set, group ids computed via the REAL routers equal expected; catches a hand-tagged or drifted group map.
2. **Sort order** — rendered list is group-ordered and stable; catches an unsorted regression that silently degrades nav.
3. **T2_MANY composition** — 11 distinct alert codes + 1 hold; ≥1 each of inbox/auto/actionable among the alerts; rooms, event, and crew each represented among the alerts' derived `sectionId`s (the hold contributes a fourth non-overview section, changes); one `occurrence_count: 7`; zero `GALLERY_FILLER_` hits repo-wide; derived item count = 12 asserted against `deriveScenarioAttention` output (the data source), not the rendered container.
4. **Tier-3 rendered** — partition output contains exactly `T3_IDS` beyond tiers 1–2 and excludes nothing tier-3; catches the skip regressing.
5. **feedTruncated** — `buildScenarioFeed` returns `truncated: true` only when flagged; validator rejects the flag on tiers 1/3.
6. **Rich fixture adapter round-trip** — adapter output counts per §4 last row.
7. **Truncation notice e2e/jsdom** — `change-feed-truncation` testid present on `t2-feed-truncated`, absent on `t2-multi-hold`; catches the notice never actually rendering (the original gap).

Meta-test inventory: no new registries. `_metaAttentionItemsTopology` unchanged (grouping calls `deriveScenarioAttention`, the already-admitted caller — no third call site). No mutation surfaces added (`_metaMutationSurfaceObservability` untouched). No Supabase call sites added (`_metaInfraContract` untouched).

## §6 Out of scope

Materializing tiers 1–2; any change to `PublishedReviewModal`, `AttentionMenu`, `ChangesFeed`, derivation semantics, or the materialize write set; per-scenario density flags; modal close semantics; new tier-3 composites (the 3 existing ones render; authoring more is future work); scenario-level (as opposed to section-level) entries in the jump dropdown.

## §7 UI gate

`SwitcherControls.tsx` (and any bar styling) is UI under `components/` — invariant 8 applies: `/impeccable critique` + `/impeccable audit` on the affected diff before cross-model close-out review, P0/P1 fixed or DEFERRED.md'd. Mechanical pre-code checklist applies (tap targets `min-h-tap-min` on the select, no em-dashes in visible copy, canonical token classes).
