# Published review modal — freshness cue on the sections a realtime refresh changed

**Backlog entry:** `BL-MODAL-REALTIME-UPDATED-CUE` (`BACKLOG.md:315`).
**Decision:** the user was shown the options and chose a subtle flash-then-fade cue on the updated field. That settles WHAT ships; this document settles HOW.

---

## 1. Scope

The admin published review modal (`/admin?show=<slug>`) refreshes itself in place when a realtime broadcast lands. Today that refresh is completely silent: content swaps under the reader with no animation, no indicator, and no screen-reader announcement.

**The trigger is an in-place content swap, not specifically a broadcast.** Round 2 established by enumeration that the same surface calls `router.refresh()` after a use-raw toggle, an ignore or unignore, a bulk ignore, an archived-tab action, a manual re-sync, and a lifecycle toggle. Those reconcile exactly like a broadcast does, and the detector cannot tell them apart, so they cue too. That is deliberate rather than tolerated: the cue answers "what just changed here", and the answer is equally useful whether the change arrived from another operator or from this one. What it must never do is fire when NOTHING changed, and §3's probes are what establish it does not.

This spec adds two legs, both one-shot and both scoped to the modal:

1. **Visual.** A flash-then-fade cue on the panel card of every registry section whose *content* changed across the refresh, capped so a full re-parse cannot strobe.
2. **Announcement.** An sr-only `role="status"` region naming what changed, so a reader who cannot see the flash (or has motion disabled) gets the same information.

Both legs fire from ONE detector, so they can never disagree.

### 1.1 Resolved scope — do not relitigate

| # | Resolved | Ratification |
|---|---|---|
| R1 | **The realtime spec did NOT ratify a silent-by-design posture.** `docs/superpowers/specs/2026-07-19-admin-modal-realtime-refresh.md:75` (§4.3) says only that the bridge component renders `null`, and `2026-07-19-admin-modal-realtime-refresh.md:173` (§9) says its transition inventory is N/A because the bridge adds no visual states. Both are statements about the BRIDGE, not about the surface it refreshes. Nobody weighed a cue and rejected it. | `docs/superpowers/specs/2026-07-19-admin-modal-realtime-refresh.md:75`, `2026-07-19-admin-modal-realtime-refresh.md:173` |
| R2 | **Shipping a cue is a design decision, not a reversal of one.** Follows from R1. The entry, whose text opens `Impeccable` P3, asserts that the spec ratified silence; that sentence is wrong and this spec corrects it where the entry graduates. Its un-defer signal (a user reporting that modal content changed without explanation) is NOT the gate either: the user made the call directly. | `BACKLOG-archive.md:23` |
| R3 | **The share-link flash is the precedent and its vocabulary is reused, not re-invented.** `DESIGN.md:278-299` documents the pattern; its stated rationale ("a one-shot ‘this just changed’ signal has no correct steady state, and a permanent tint would assert something no longer true") is exactly why flash-then-fade beats a persistent "updated just now" badge here. A reviewer proposing a persistent badge is relitigating the user's decision. | `DESIGN.md:297` |
| R4 | **A NEW constant with the SAME value is the house pattern, not a reuse of an existing one.** `WARNING_HIGHLIGHT_MS` (`components/admin/wizard/Step3ReviewModal.tsx:107`) and `SHARE_LINK_FLASH_MS` (`components/admin/showpage/ShareHub.tsx:138`), both 1600, are two constants with one value, each pinned to its own owning module. `SECTION_FRESHNESS_FLASH_MS` is the third. Do not propose collapsing them. | `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md:32` (R8) |
| R5 | **Reduced motion gets NO visual cue**, matching the share-link row and deliberately unlike the step3 warning row. The announcement leg is what carries the information there, and it is motion independent. | `DESIGN.md:297`, `app/globals.css:933-937` |
| R6 | **Overview and Changes are out of the visual cue's scope** (§4.3). Not an oversight. | §4.3 |
| R7 | **Nothing currently observes the confusion this addresses.** `components/realtime/ShowRealtimeBridge.tsx` emits no `log.*` or `logAdminOutcome` call on the refresh path and returns `null` (`components/realtime/ShowRealtimeBridge.tsx:901`), and the realtime spec declares invariant 10 N/A at `2026-07-19-admin-modal-realtime-refresh.md:160` (§9.6). There is no support note, no `DEFERRED.md` row, and no commit since 2026-07-20 mentioning it. The absence of reports is therefore not evidence of absence, because nothing records it. This is stated so a reviewer does not treat "no reported incidents" as an argument against the cue. | `components/realtime/ShowRealtimeBridge.tsx:901`, `docs/superpowers/specs/2026-07-19-admin-modal-realtime-refresh.md:160` |

---

## 2. Current state (citations)

| Fact | Where |
|---|---|
| The bridge mounts as the modal loader's LAST child, conditional on a non-null version token. | `app/admin/_showReviewModal.tsx:454-456` |
| A broadcast schedules a 100ms-debounced `router.refresh()`; catch-up paths refresh synchronously. | `components/realtime/ShowRealtimeBridge.tsx:272-285`, `ShowRealtimeBridge.tsx:292-324` |
| The bridge renders `null` and has no visual output. | `components/realtime/ShowRealtimeBridge.tsx:901` |
| The modal fires its own `router.refresh()` exactly once per mounted instance (prefetch revalidation). | `components/admin/showpage/PublishedReviewModal.tsx:174-193` |
| A freshness readout already exists on this surface: `Synced <relative>` plus a `Live` pill, omitted entirely when `lastSyncedAt` is null. | `components/admin/showpage/StatusStrip.tsx:88`, `StatusStrip.tsx:117-119`, `StatusStrip.tsx:173` |
| Crew rows are keyed `` `${m.name}-${i}` `` so a rename or reorder remounts the row. | `components/admin/wizard/step3ReviewSections.tsx:1751` |
| Each registry section renders inside a stable-keyed wrapper registered by rail id. | `components/admin/review/ShowReviewSurface.tsx:1047-1056` |
| Inside that wrapper, the heading row and then the panel card: `rounded-md border bg-surface p-tile-pad shadow-(--shadow-tile)`, carrying `data-testid="wizard-step3-card-<dfid>-section-<sectionId>-panel-card"` only when `chrome.sectionId !== undefined`. | `components/admin/wizard/step3ReviewSections.tsx:1029-1038` |
| Sub-blocks (Diagrams under Rooms) render the same chrome at `headingLevel` four, with NO `sectionId`, which is why the panel-card testid is already conditional. | `components/admin/wizard/step3ReviewSections.tsx:1031-1035`, `step3ReviewSections.tsx:888-890` |
| The per-section chrome arrives through a context provider built per rail section. | `components/admin/review/ShowReviewSurface.tsx:1060-1146` |
| Extras (Overview, Changes) render in a plain `<div key={extra.id}>` with no chrome context and no testid. | `components/admin/review/ShowReviewSurface.tsx:834-847` |
| Two one-shot flashes already exist, each a JS constant plus a `data-*` attribute plus keyframes in `app/globals.css`, each with an explicit reduced-motion override. | `app/globals.css:882-896` (step3 warning), `globals.css:903-937` (share link) |
| The sr-only `role="status"` announcement pattern, including the branch-stable-node requirement. | `DESIGN.md:479`, example at `components/admin/showpage/ShareHub.tsx:836-841` |
| Contrast floors are asserted from the live hex in `app/globals.css`, per theme. | `tests/styles/status-token-contrast.test.ts:81-82`, `status-token-contrast.test.ts:248-261` |

---

## 3. The empirical spike

Per `docs/agents/spec-self-review.md:21`, a surface involving component lifecycle and cross-surface concurrency gets a probe BEFORE the prose. The crux question was the one the brief named: **RSC reconciles in place, so React hands us no changed-field list. What, concretely, is "the updated field"?**

### 3.1 Probe A — is the payload deterministic at the DB layer?

If the snapshot RPC returned rows in an unstable order, a content hash would report "everything changed" on every refresh and the cue would be worthless.

Read of the live function body on the local database (`get_admin_show_review_snapshot(p_show_id uuid)`) shows **every** aggregate explicitly ordered: `crew_members` by `c.id`, `rooms` by `r.id`, `hotel_reservations` by `h.ordinal, h.id`, `transportation` by `t.id`, `contacts` by `k.id`; `show` and `internal` are single-row `to_jsonb` projections, whose key order jsonb canonicalises.

Five consecutive reads of the same show, hashed:

```text
$ for i in 1 2 3 4 5; do psql ... -tAc "<the RPC body inlined>" ; done
cd2e2dce1d916e5650220b614ac96a8b
cd2e2dce1d916e5650220b614ac96a8b
cd2e2dce1d916e5650220b614ac96a8b
cd2e2dce1d916e5650220b614ac96a8b
cd2e2dce1d916e5650220b614ac96a8b
```

**Result: byte-stable.** Ordering is guaranteed at the source, not by luck.

### 3.2 Probe B — does the adapter preserve that, and does a hash isolate the change?

`buildPublishedSectionData` (`components/admin/review/publishedAdapter.ts:43-104`) is pure, reads no clock, and re-sorts every row set itself (`sortCrew` `publishedAdapter.ts:234-238`, `sortRooms` `publishedAdapter.ts:216-223`, `sortContacts` `publishedAdapter.ts:225-232`, `pickTransportation` lowest-id `publishedAdapter.ts:208-213`). The probe fed it the RPC-shaped payload, projected each rail section's fields, hashed them, and diffed.

```text
sections rendered for the base snapshot: [venue, event, crew, contacts, schedule, hotels, transport, rooms, packlist, billing, warnings]
section count changed on a full re-parse: 11

PASS  P2  identical snapshot re-render (the open-time refresh)   changed = []
PASS  P2b reordered input rows                                   changed = []
PASS  P3  one crew role edited                                   changed = [crew]
PASS  P4  sync stamps only, no content change                    changed = []
PASS  P5  full re-parse (worst case)                             changed = [billing, contacts, crew, event,
                                                                            hotels, packlist, rooms, schedule,
                                                                            transport, venue, warnings]
PASS  P6  published toggled                                      changed = []
```

Six findings, each of which decides something below:

- **P2 answers the brief's open-time question directly.** The modal's once-per-mount `router.refresh()` re-serialises the same content into a NEW object. A detector comparing object identity would flash the whole modal every time it opened. A detector comparing content hashes reports zero. §4.1 therefore hashes content and never identity.
- **P2b, corrected and narrowed by the round-1 review.** The adapter's own sorts absorb an input reorder for crew, for rooms, for contacts, while `pickTransportation` takes the lowest id. **Hotels are NOT sorted by the adapter**: `hotels` is a bare `map` over `snapshot.hotel_reservations` (`components/admin/review/publishedAdapter.ts:75`). The round-1 reviewer probed it and refuted the original blanket claim:

  ```text
  {"base":["B","A"],"reordered":["A","B"],"equal":false}
  ```

  So hotel ordering is guaranteed by the RPC's `order by h.ordinal, h.id` (Probe A), not by the adapter, and the two row sets have different guarantors. Both hold in production, and the spec now says which is which instead of asserting one mechanism for all of them. D2 in §11.1 is scoped accordingly and gains a companion row that pins the hotel path to the RPC guarantee rather than to a sort that does not exist.
- **P3** is the target behaviour: a single edited field lights exactly one section.
- **P4 is the one that keeps the cue honest.** `shows.last_checked_at` moves on every successful cron poll whether or not content changed (`app/admin/_showReviewModal.tsx:291-295`), and `last_synced_at` moves on every apply. Neither is section content, so a poll that found nothing new produces zero cues. The `Synced <relative>` readout silently flipping to "just now" stays the correct and only signal for that case, which is how this cue avoids contradicting `StatusStrip.tsx:173`.
- **P5 sizes the strobe risk empirically: every one of the rendered sections can change at once.** The probe's fixture had an empty `agendaBaseline`, so it rendered eleven; a show with agenda links renders twelve (`components/admin/review/sectionInclusion.ts:27-29`). Either way the finding is the same and the cap is what answers it. That is what §4.4's cap exists for. It is not a hypothetical.
- **P6** shows a lifecycle flip is not section content. Publishing state has its own affordances in the strip and the share hub; the sections do not flash for it.

### 3.3 Probe C — what the version token is, and why it is not the detector

`viewer_version_token(p_show_id)`, read live, is
`greatest(shows.last_synced_at, max(crew_members.last_changed_at), shows.picker_epoch_bumped_at) : picker_epoch : published`.

It is a perfectly good "something changed" fence, and the bridge already uses it as one. It is useless as "WHICH thing changed", and it moves on `last_synced_at` alone, so it would fire on P4's no-content-change case. The detector does not read it.

---

## 4. Design

### 4.1 Detection: a per-section content signature

In `PublishedReviewModal` (already a client component holding the RSC props), compute one signature per rail section, memoised on the identity of the props it reads so the stringify cost is paid once per RSC pass and not on every client-state render:

```tsx
const signature = useMemo(
  () => buildSectionSignatures({ data, bySection, attentionBySection }),
  [data, bySection, attentionBySection],
);
```

`buildSectionSignatures` lives in the new pure module `components/admin/review/sectionFreshness.ts (new)` and returns `ReadonlyMap<SectionId, string>`. Its per-section projection is the single source of truth for what counts as a section’s content.

**A section’s content is not only its own data fields.** Two review rounds established that four other things render inside a section’s card and change independently of those fields, and a projection that omitted them produced a silently missed cue: the warnings ROUTED to that section, the rendered state of the use-raw decision attached to each routed warning, the section’s “In sheet” anchor, and the attention items bucketed under it. Each is part of the section’s signature.

**The projection is narrowed to what each body RENDERS, not to what it stores.** The whole-diff review settled this by static-render probe and it is the sharpest correction in the document. Hashing whole persistence rows is not a conservative default: it produces FALSE cues, and this spec's own priority is that a false cue is worse than a missed one. Every one of these is read by the adapter and reaches no DOM, and each flashed a byte-identical card: `confirmation_no` (documented as never rendered at `components/admin/wizard/step3ReviewSections.tsx:2719`), `ordinal` and `notes` on a hotel, `role_flags` / `stage_restriction` / `flight_info` on crew, `power` / `digital_signage` / `notes` on a room, `notes` on a contact, `notes` and `timezone` on the venue, `rawSnippet` on a pack item, and any `event_details` key outside the closed `EVENT_DETAIL_GROUPS` vocabulary.

**A card can also render content derived from the WHOLE routed map.** The Sheet-warnings panel, when it has no rows of its own, renders a sentence naming the sections that do (`components/admin/wizard/step3ReviewSections.tsx:2906`). So a warn landing in Crew rewrites two cards: Crew, which gains the routed row, and Sheet-warnings, which goes from silent to "the warnings are in Crew". The signature carries that pointer state under the SAME gate the render uses — own rows absent AND at least one target present — because hashing it unconditionally cued this card whenever any unrelated section appeared or vanished. Editing an already-routed warning moves the target set not at all and correctly cues Crew alone.

**And lifecycle is not always invisible.** `published && !archived` gates the crew row actions (`components/admin/wizard/step3ReviewSections.tsx:4183`) and the pack-list archived-tab affordances (`step3ReviewSections.tsx:4310`), so an unpublish removes a control from every crew row. That IS a rendered change and it must cue; the earlier blanket claim that a lifecycle flip cues nothing was wrong, and the test asserting it was asserting the defect.

**Round 4: the detector and the renderer must agree on what "the same value" means, and on which rows exist at all.** Round-3 review probed the shipped renderers and found ~40 fields across venue, event, billing and transport where changing `"x"` to `" x "` moved the signature while the DOM stayed byte-identical. That is one defect with forty faces. Two normalizations close it for every field that exists now and every one added later:

- **Every string leaf is trimmed, and empty collapses to `null`**, which is exactly what each body does before it paints (`components/admin/wizard/step3ReviewSections.tsx:256`; `hasContent` at `components/admin/wizard/step3ReviewSections.tsx:223` is the same predicate spelled as a guard). Applied at the leaf, inside the hash, so no projection has to remember it.
- **Rows the body FILTERS OUT do not reach the signature.** A transportation leg with a blank stage is dropped before render (`components/admin/wizard/step3ReviewSections.tsx:1349`), so its date, time and assigned names cannot paint and must not cue. The projection applies the same filter through the same imported predicate.

**The hash carries two independent lanes.** A single 32-bit djb2 plus a length has constructible same-length collisions, and round-3 review constructed one: two crew payloads that render different HTML hashed identically, which is a MISSED cue on a card that really changed. A second lane with a different multiplier and seed makes an accidental collision require agreement on both lanes and the length at once. It remains a change DETECTOR, not a digest — nothing here is a security boundary.

**An attention item contributes only what ITS OWN render site paints, and there are two sites with disjoint field sets.** Round-3 review reported every payload field as a false cue; that is true of one channel and false of the other, and the probe happened to use the first.

- **Note channel** (`lib/admin/sectionAttention.ts:143`): entered only when `toNoteItem` accepts the item AND it routed to `warnings` AND that section renders. `composeParseNote` then reads `alert.code` and `alert.errorCode` (`lib/admin/parseAttentionNote.ts:44`, `lib/admin/parseAttentionNote.ts:48`) and the DOM adds `item.id`. Nothing else is on screen.
- **Banner channel**: the stripe reads `tone` (`components/admin/review/AttentionBanner.tsx:108`), the clearing copy reads `actionable` and `clearingKind` (`components/admin/review/AttentionBanner.tsx:162`), the anchor reads `id` (`components/admin/review/AttentionBanner.tsx:261`), and the payload paints `alertId`, `code`, `template`, `params`, `action`, `helpHref`, `raisedAt`, `autoClearNote`, `failedKeys`, `dataGaps`.

`occurrenceCount` is excluded from BOTH channels: it is written at `lib/admin/attentionItems.ts:311` and has no non-test reader, so a repeated occurrence cued a byte-identical card. `errorCode` is excluded from the banner, where nothing reads it. The projection branches on the SAME predicate the router uses, which is what makes both answers right at once.

**The announcement outlives the flash.** The 1600ms constant is the duration of a CSS animation. A `polite` region is delivered when the screen reader is next idle, which can be later, so clearing the message on the visual deadline can retract it before it is spoken. The cue and the announcement are two legs of one signal on two clocks, and only the visual leg has a deadline. Leaving the message costs nothing: the region is `sr-only`, an equal string reconciles onto the same text node and is therefore never re-announced, and the next batch replaces it wholesale. The one state that does clear it is the modal hiding, which is a real end of context.

**Three rounds of review found projection-fidelity defects one field at a time, so the third one closed the class structurally rather than naming another field.** Three mechanisms, each of which turns "a reviewer notices" into "a test fails":

1. **Caps are IMPORTED, never re-typed.** Every list body slices to a permanent cap before rendering, so row 31 of a 30-row crew table is not content that will scroll into view — it is content the card can never show, and hashing it flashes a byte-identical card. The projection imports `CREW_CAP`, `ROOMS_CAP`, `HOTELS_CAP`, `PACK_LIST_CASES_CAP`, `PACK_LIST_ITEMS_CAP`, `SCHEDULE_DAYS_CAP`, `SCHEDULE_ENTRIES_CAP` and `DIAGRAM_TILE_CAP` from the module that applies them, so raising one widens the signature in the same commit. Test N11 asserts each is imported AND used, and that no bare `slice(0, <number>)` survives anywhere in the detector.
2. **Render normalization runs through the SHIPPED function.** A source anchor is not the value that renders; the link is. `buildSheetDeepLink` collapses every anchor outside `SOURCE_LINK_ALLOWLIST`, and every one with a non-numeric `gid`, onto a single `#gid=0`, discarding `gid` and `a1` (`lib/sheet-links/buildSheetDeepLink.ts:22`). The signature therefore hashes the RESOLVED href. Test N12 pins the import and forbids the raw anchor reaching the hash.
3. **Auxiliary models are narrowed to their rendered fields, at their own render site.** An attention item contributes only what `AttentionBanner` draws — the alert payload, `tone`, `actionable`, `clearingKind`, `id` (`components/admin/review/AttentionBanner.tsx:103`, `components/admin/review/AttentionBanner.tsx:108`, `components/admin/review/AttentionBanner.tsx:162`, `components/admin/review/AttentionBanner.tsx:261`). `menuTitle` and `menuSubtitle` are excluded on purpose: they render in the attention MENU, which is modal chrome and not a section card.

Two claims from that round were REFUTED by probe and are recorded so nobody re-derives them. A warning's raw `message` IS rendered — it is a live fallback when the catalog has no entry (`components/admin/PerShowActionableWarnings.tsx:139-140`, rendered at `components/admin/PerShowActionableWarnings.tsx:312`) — so hashing it is correct, not over-hashing. And `diagrams.pending` does not exist on the published type at all (`lib/parser/types.ts:513`); the wrapper that has one resolves to `current` before this data is built (`lib/data/diagrams.ts:54`), so it can never be hashed here.

**The converse matters as much, and the second review round found it too.** Hashing MORE than a card renders is not a safe default; it is a false cue, which is worse than a missed one because it teaches the reader the cue means nothing. Two over-hashings were removed: the Sheet-warnings section no longer hashes the whole warning list (it renders only what routed to IT, so an edit to a crew-routed warning left its panel byte-identical while cueing it), and a use-raw decision contributes only the fields that reach the control.

| Rail id | Own fields | Feeds |
|---|---|---|
| `venue` | `venue` | `step3ReviewSections.tsx:4147` |
| `event` | `eventDetails` | `step3ReviewSections.tsx:4155` |
| `crew` | `crewMembers` (capped at `CREW_CAP`, plus the length), `previewRoster` | `step3ReviewSections.tsx:4162`, row actions at `step3ReviewSections.tsx:1677-1746` |
| `contacts` | `clientContact`, `contacts` | `step3ReviewSections.tsx:4190-4195` |
| `schedule` | `ros` (days capped at `SCHEDULE_DAYS_CAP`, entries at `SCHEDULE_ENTRIES_CAP`, plus both lengths), and ONLY the four rendered date fields `travelIn` / `set` / `showDays` / `travelOut` | `components/admin/wizard/step3ReviewSections.tsx:4207`, caps at `components/admin/wizard/step3ReviewSections.tsx:1979` and `components/admin/wizard/step3ReviewSections.tsx:1836`, dates via `lib/crew/agendaDisplay.ts:119` |
| `agenda` | `agendaBaseline` | `step3ReviewSections.tsx:4221-4230` |
| `hotels` | `hotels` (capped at `HOTELS_CAP`, plus the length) | `components/admin/wizard/step3ReviewSections.tsx:4241`, cap at `components/admin/wizard/step3ReviewSections.tsx:2685` |
| `transport` | `transportation` | `step3ReviewSections.tsx:4249` |
| `rooms` | `rooms` (capped at `ROOMS_CAP`, plus the length), `diagrams` narrowed to `linkedFolder` + the first `DIAGRAM_TILE_CAP` embedded images + both lengths (`linkedFolderItems` renders as a COUNT only, `components/admin/wizard/step3ReviewSections.tsx:3752`) | `components/admin/wizard/step3ReviewSections.tsx:4258-4271`, caps at `components/admin/wizard/step3ReviewSections.tsx:2018` and `components/admin/wizard/step3ReviewSections.tsx:3745` |
| `packlist` | `pullSheet` (cases capped at `PACK_LIST_CASES_CAP`, items at `PACK_LIST_ITEMS_CAP`, plus both lengths), `archivedPullSheetTabs`, `pullSheetOverride`, `pullSheetOverrideWire`, `archivedTabOffer` | `step3ReviewSections.tsx:4287-4302`, offer cards at `step3ReviewSections.tsx:2449-2498` |
| `billing` | `billing` | `step3ReviewSections.tsx:4314` |
| `warnings` | when it has rows of its own: nothing beyond the routed row below. When it has NONE: the ordered list of rendered sections that DO carry warnings, plus the rendered section total — the exact input the "warnings are elsewhere" sentence consumes | `components/admin/wizard/step3ReviewSections.tsx:4337-4346`, sentence at `components/admin/wizard/step3ReviewSections.tsx:2906`, parts at `components/admin/wizard/step3ReviewSections.tsx:745` |

Plus, for EVERY rail id in the table:

| Component | Value | Why it belongs to the section |
|---|---|---|
| Routed warnings | `bySection[id]`, the server-derived per-section warning model already passed to this component as a prop | The routed cards render as the panel card’s LAST child, inside the border they describe: the `Step3SectionChromeContext` value threads them (`components/admin/review/ShowReviewSurface.tsx:1060-1146`) and the record type is `SectionWarningRecord` (`lib/admin/sectionWarningModel.ts:69`). A warn arriving for Crew changes the Crew card while `crewMembers` is untouched. |
| Routed use-raw decisions | for each warning in `bySection[id]`, ONLY the rendered state of the decision `findUseRawDecision` matches it to: `code`, `contentHash`, `preference`, `applied` (`components/admin/wizard/step3ReviewSections.tsx:572-583`) | The control renders the warning plus `preference` and `applied`. `target` is documented display-only (`lib/sync/useRawOverlay.ts:35`) and `decidedAt` / `decidedBy` reach no element, so hashing the whole persisted row cued a card whose HTML was unchanged. Matching goes through the canonical matcher rather than a reimplementation: a second matcher would be a second source of truth. |
| Section anchor | `sourceAnchors[SECTION_REGION_MAP[id]]` when the region is non-null (`lib/admin/step3SectionStatus.ts:53-68`) | The heading’s “In sheet” link resolves its target through that anchor (`components/admin/wizard/step3ReviewSections.tsx:896-906`), so an anchor move changes where the section’s link goes. `diagrams`, `warnings` and `report` map to `null` and contribute nothing. |
| Routed attention items | the LIVE items the modal buckets under this section, supplied by the caller as `attentionBySection` — every live item, not only the actionable ones (`components/admin/showpage/PublishedReviewModal.tsx:445` iterates `live`), because a clearing item paints a card too | The second review round found this by probe: attention items render inline card content in the crew, event, rooms and warnings bodies of `components/admin/wizard/step3ReviewSections.tsx`, so adding, editing or resolving one changes a card no own-field signature can see. The caller supplies the grouping because it already resolves the placement predicate through `resolveEffectiveSection` (`components/admin/showpage/PublishedReviewModal.tsx:415-416`); resolving it again inside the detector would be a second source of truth for where an item belongs. |

Only ids present in `renderedSectionIds(data)` (`components/admin/review/sectionInclusion.ts:54-59`) get an entry, so a section that is not rendered can never be cued. `report` is staged-only (`sectionInclusion.ts:44-46`) and never appears in this modal.

The hash is `JSON.stringify` of the NORMALIZED projected value (every string trimmed, empty collapsed to `null`) reduced to TWO independent rolling lanes joined with the string length. One lane had a constructible same-length collision, built in round-3 review from two crew payloads that render different HTML. It is a **change detector, not a digest**: a collision costs one missed cue on a surface that already showed the new content correctly, so a cryptographic hash would buy nothing and cost a `node:crypto` dependency in a client module.

`changedSectionIds(prev, next)` diffs over the UNION of both maps’ keys, not over `next` alone. Iterating `next` alone would silently miss a section that disappeared, which is precisely the Agenda-removal case §4.6 has to handle.

### 4.2 The state machine

Render-phase derived state, the same “adjust state when a prop changes” idiom `ShareHub` uses for this exact shape of problem, a `useState` pair adjusted during render (`components/admin/showpage/ShareHub.tsx:470-497`).

State is a MAP from section id to its arming, not a single cue object:

```tsx
type Arming = { batch: number; value: "1" | "2" };

// ONE state cell holds the last-seen signature AND whether the mount baseline
// has been taken. Both are per-committed-render facts, so neither may live in a
// ref written during render.
const [seen, setSeen] = useState({ signature, baseline: false });
const [armed, setArmed] = useState<ReadonlyMap<SectionId, Arming>>(EMPTY);
const [batch, setBatch] = useState(0);
const [announced, setAnnounced] = useState<{ batch: number; text: string } | null>(null);
```

**Why `seen.baseline` is state and not a ref, which round 2 settled by probe.** A ref mutated during render is written by renders that are then ABANDONED. React 19 discards the render but keeps the mutation, so a suspended payload that the reader never saw consumed the mount baseline, and the NEXT payload, the first one actually committed, got armed instead of taken as the baseline. That is precisely the stale-prefetch flash this branch exists to prevent. The probe:

```text
BASELINE B / SUSPEND B / AFTER-B DOM <span>A</span>
render sig=C prev=A baseline=true armed=false
ARM C / AFTER-C DOM <span>C</span>
```

Render-phase `setState` on the same component does not have this problem: an abandoned render's queued state is thrown away with it.

The map is what makes each cue expire on its own clock. A single shared cue object meant a change to Venue at T plus 400ms yanked Crew’s attribute mid-hold, and since the cue holds to 45% of 1600ms, Crew was still at full strength and snapped. Round 1 measured that. Per-section arming removes it.

Branches, exhaustively, on `prevSignature !== signature`:

1. **Same memo identity** (a client-state render: nav click, scroll spy, close transition). Nothing runs. Live cues are untouched.
2. **The FIRST transition after mount.** `seen.baseline` flips and NOTHING is armed, whatever changed. This is the open-time refresh, the one the `refreshFiredRef` guard fires exactly once per mounted instance (`components/admin/showpage/PublishedReviewModal.tsx:174-193`), and it exists because a prefetched open can serve a payload minutes old: without this branch, opening a stale-cached modal flashes every section that changed while it was CLOSED, which is exactly the “flashing on open would be wrong” case. The baseline is the refreshed payload, not the prefetched one.
3. **A later transition with zero changed ids** (a poll that found nothing; a lifecycle flip). `prevSignature` advances and live cues are **left running** rather than cleared. Clearing would truncate an in-flight animation for a refresh that changed nothing.
4. **A later transition with one or more changed ids.** `batch` increments. Within the cap, each changed id is written into `armed` with the new batch and with its value FLIPPED from whatever it held (`"1"` to `"2"`, or `"1"` when it was absent), which is what restarts the animation for a section cued twice in a row (§4.7). Ids that did not change keep their existing arming and their existing expiry. Over the cap, `armed` is emptied instead.

Expiry is per batch, and the timers deliberately do NOT cancel each other:

```tsx
const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

useEffect(() => {
  if (batch === 0) return;
  const b = batch;
  const t = setTimeout(() => {
    timersRef.current.delete(b);
    setArmed((m) => {
      const next = new Map(m);
      for (const [id, a] of next) if (a.batch === b) next.delete(id);
      return next;
    });
    // The announcement is NOT cleared here: a polite region is delivered when the
    // reader is next idle, which can outlast a 1600ms animation. See §4.
  }, SECTION_FRESHNESS_FLASH_MS);
  // Replace this batch's own timer if one already exists. Under a double-
  // invoked effect the naive `set` would overwrite the first handle and leak
  // it, since only the surviving handle is ever cleared. Clearing the prior
  // handle for THIS batch is safe in a way a blanket cleanup is not: it
  // touches no other batch.
  const prior = timersRef.current.get(b);
  if (prior !== undefined) clearTimeout(prior);
  timersRef.current.set(b, t);
  // No cleanup returned ON PURPOSE. A cleanup keyed on `batch` would cancel
  // batch N when batch N+1 armed, and batch N's sections would stay lit
  // forever. The per-batch replacement above is what makes that safe.
}, [batch]);

useEffect(() => {
  const timers = timersRef.current;
  return () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}, []);
```

The unmount-only effect is what satisfies the no-orphan-timer requirement.

**There IS a closed-but-mounted state, and round 2 refuted the first draft's claim that there is not.** A COMMITTED close unmounts the instance, but an ABORTED close does not: `closing` is local state that hides the shell by passing `open={!closing}`, and the shell's closed arm renders `null` while this component, which owns the freshness state, stays mounted above it (`components/admin/showpage/PublishedReviewModal.tsx:205-210`, `PublishedReviewModal.tsx:858`, `components/admin/review/ReviewModalShell.tsx:122-127`). The probe:

```text
{"freshnessOwnerStaysAboveShell":true,"closeOnlySetsShellOpenFalse":true,
 "closedShellReturnsNull":true,"abortedCloseReusesInstance":true}
```

Left alone, an aborted close reopened inside the flash window would remount a card still wearing its attribute and restart the animation on whatever remained of the old timer, and a refresh arriving while hidden would arm a cue for content the reader was not present for, contradicting §8. So the design mirrors the `linkActive` visibility predicate `ShareHub` already uses (`components/admin/showpage/ShareHub.tsx:491`):

```tsx
// Written over VISIBILITY, not over any one cause. Clearing on hide also makes
// the reopen a fresh baseline, since the next transition is branch 2 again.
if (closing && (armed.size > 0 || announced !== null || seen.baseline)) {
  setArmed(EMPTY);
  setAnnounced(null);
  setSeen({ signature, baseline: false });
}
```

While `closing` is true, branch 4 does not arm: a hidden surface has no reader to cue.

### 4.3 What can be cued, and what deliberately cannot

**Registry sections only.** The attribute rides the panel card, threaded through the chrome context that `ShowReviewSurface` already builds per rail section (`components/admin/review/ShowReviewSurface.tsx:1060-1146`), and applied under the SAME `chrome.sectionId !== undefined` guard the panel-card testid already uses (`components/admin/wizard/step3ReviewSections.tsx:1031-1035`). That guard is load-bearing: the Diagrams sub-block renders the same chrome at `headingLevel` four, with no `sectionId` (`step3ReviewSections.tsx:888-890`), and without it a Rooms change would paint two nested flashes.

**Overview is excluded.** It hosts the share and lifecycle chrome, whose changes already have dedicated cues: the share-link flash (`components/admin/showpage/ShareHub.tsx:870`) and the strip's own readout (`components/admin/showpage/StatusStrip.tsx:173`). A second cue over the top of those would duplicate one signal and contradict the other.

**Changes is excluded.** The Changes feed is the ledger of what changed. Flashing the ledger of changes to signal that something changed is tautological, and the feed's new row is self-describing in a way a venue address is not. Recorded as a documented limit (§8), not as an oversight.

Both extras also lack the chrome context entirely (`ShowReviewSurface.tsx:834-847`), so excluding them keeps the implementation to one attribute site rather than three.

**Mode boundary: the staged wizard surface stays byte-identical.** `ShowReviewSurface` and `step3ReviewSections.tsx` are shared with the staged review modal (`components/admin/wizard/Step3ReviewModal.tsx`). The cue is a published-mode feature: the flashing id set originates in `PublishedReviewModal` and reaches the chrome only through a new optional field on `Step3SectionChrome` (`components/admin/wizard/step3ReviewSections.tsx:449`). The staged caller passes nothing, the field is ABSENT rather than `undefined` (the `exactOptionalPropertyTypes` discipline the type already documents at `step3ReviewSections.tsx:465-467`), and the panel card renders exactly the attributes it renders today. A structural test asserts the staged surface never emits the attribute.

**Crew-row remount is a non-issue at this granularity, and that is the reason for choosing it.** Crew rows remount on a rename or reorder (`step3ReviewSections.tsx:1751`) while everything else reconciles in place. The cue rides the section's panel card, which does not remount in either case, so the two mechanisms the brief flagged as "possibly two different treatments" collapse into one. The card is the smallest element that is stable under both.

### 4.4 The cap

P5 measured 11 simultaneous section changes on a full re-parse. Eleven cards flashing at once is a strobe, and on a phone at a venue it is also meaningless: a cue that points at everything points at nothing.

```
SECTION_FRESHNESS_MAX_CUES = 3
```

- `1 <= changed.length <= 3` → each changed section's card flashes; the announcement names them.
- `changed.length > 3` → **no card flashes**, and the cue moves to the sub-header BAND, with the announcement degrading to the whole-surface sentence in §4.6.

**The band is a round-3 correction and the first version was inverted.** It dropped the visual leg entirely over the cap, which meant the largest possible change, a full re-parse, produced the least visual evidence: a sighted reader learned nothing precisely when the most had moved, while a screen reader still heard the surface sentence. One calm mark on the band is the visual equivalent of that sentence, and it is what the two legs agreeing actually requires.

The over-cap branch still refuses to flash the first three of eleven. Picking three of eleven would assert that those three are the interesting ones, which is false. Three is the point at which "these specific things changed" stops being a readable claim on a phone-width scrolling column; above it the honest statement is the one about the surface as a whole.

### 4.5 Visual treatment

The cue is a 2px `accent-edge` outline on the panel card, held to 45% then faded, structurally a narrowing of the share-link cue (`app/globals.css:912-937`).

**It was a wash plus an outline, and the impeccable critique removed the wash.** Both reasons are design-substantive rather than stylistic. `PRODUCT.md:31` reserves the orange for "this matters now" and spends it sparingly; a background reconcile is informational, and a full-card wash on a 390px phone can be the entire viewport. And the wash was occluded unevenly: cards hold opaque children (`surface-sunken` tiles, nested cards, warning callouts), so a sparse section washed fully while a dense one showed colour only in the gaps, and the SAME event read at very different loudness depending on which section moved. The outline renders identically on every card, so it is the whole cue.

**Why an outline rather than a border or a box-shadow.** The card already owns its `border` (which switches to `border-border-strong` when `flagged`, `step3ReviewSections.tsx:1046`) and its `shadow-(--shadow-tile)`. Animating either would fight an existing state. `outline` is layout-neutral, composes with both, and follows `border-radius`.

Three consequences of that choice, each verified rather than assumed:

- An outline draws OUTSIDE the border box and is not clipped by the card, so it needs room. The scroll container separates sections with `gap-6`, twelve times the 2px the outline occupies, so two adjacent flashing cards cannot collide (`components/admin/review/ShowReviewSurface.tsx:1029`).
- `outline-color` is an animatable property, which is why the keyframes animate the colour while the width and style are set once by the attribute rule.
- The attribute rule is UNLAYERED, like the two flash blocks it sits beside, so it wins over Tailwind v4 preflight regardless of specificity arithmetic.

Normative CSS, added to `app/globals.css` next to the existing two flashes. The `-1` / `-2` pairs are byte-identical apart from their names; §4.7 explains why both exist.

```css
@keyframes section-freshness-flash-1 {
  0%,
  45% {
    outline-color: var(--color-accent-edge);
  }
  100% {
    outline-color: transparent;
  }
}
@keyframes section-freshness-flash-2 {
  0%,
  45% {
    outline-color: var(--color-accent-edge);
  }
  100% {
    outline-color: transparent;
  }
}
[data-section-freshness-flash] {
  outline: 2px solid transparent;
  outline-offset: 0;
}
[data-section-freshness-flash="1"] {
  animation: section-freshness-flash-1 1600ms ease-out;
}
[data-section-freshness-flash="2"] {
  animation: section-freshness-flash-2 1600ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  [data-section-freshness-flash] {
    animation: none;
    outline-color: transparent;
  }
}
```

The reduced-motion block resolves `animation-name` to `none` AND pins the outline transparent, so the resting paint is byte-identical to a card with no attribute at all. That matches R5 and the share-link precedent: a one-shot signal has no correct steady state.

### 4.6 The announcement

A branch-stable sr-only region, per `DESIGN.md:479`. The REGION element is always mounted with a stable key and is never conditionally rendered and never `display: contents`, because a region that mounts at the same moment its text appears is unreliably announced.

Placement: the shell's `subHeader` slot, as a key-stable sibling of `StatusStrip` (`components/admin/showpage/PublishedReviewModal.tsx:1077`), with `key="freshness-announce"`.

NOT the body slot, which was the first draft and is wrong. `ReviewModalShell` documents a contract that its `children` mount directly in the panel's flex column with no wrapper, so that the consumer's surface root IS the body element and owns the scroller (`components/admin/review/ReviewModalShell.tsx:20-21`, `ReviewModalShell.tsx:688-696`). `ShowReviewSurface` is that sole child. A second body child would contradict the contract for no gain. The `subHeader` band is inside the same dialog subtree, so the live region is announced identically, and it is where a status readout about this surface already lives.

**The text node is keyed by batch, and that is load-bearing.** Round 1 found the obvious implementation silent on a repeat: Crew changes at T, Crew changes again at T plus 400ms, and React reconciles the identical string `Updated: Crew.` onto the same text node. No DOM mutation, no announcement, so the visual restarts while the screen reader hears nothing. Keying the inner node on the batch forces a remove-and-insert inside the stable region, which is a childList mutation and re-announces:

```tsx
<span role="status" aria-live="polite" className="sr-only" data-testid="published-show-review-freshness-announce">
  {announced === null ? null : <span key={announced.batch}>{announced.text}</span>}
</span>
```

The region itself still never unmounts. Only its child does, which is the distinction `DESIGN.md:479` is actually about.

Copy, owned by `components/admin/review/sectionFreshness.ts (new)` alongside the detector so the two can never drift:

| Case | Text |
|---|---|
| No live cue | region present, no child |
| One changed section | `Updated: Crew.` |
| Two, up to the cap | `Updated: Crew, Rooms & scope.` |
| Three, up to the cap | `Updated: Crew, Hotels, Rooms & scope.` |
| Over the cap | `Show details updated.` |
| Any changed section is no longer rendered | `Show details updated.` |

**Labels come from the registry, never from a copy of it.** `freshnessAnnouncement` takes a `labelOf` callback and the modal supplies it from `step3Sections(data)`, the same list that renders the rail chip and the section heading. An earlier draft wrote sample copy from memory and produced `Updated: Crew, Rooms and scope.`, which no real combination can generate: the registry `label` is the single item `Rooms & scope` (`components/admin/wizard/step3ReviewSections.tsx:4262`), so a two-item join reads `Updated: Crew and Rooms & scope.` A duplicated label map would have made that drift permanent and a "verbatim" test would have pinned the wrong strings; taking the callback makes parity structural.

**Only sections that are still rendered can be named, and a mixed case is not partially named.** A section can change by DISAPPEARING: `agenda` drops out of the rail when `agendaBaseline` empties (`components/admin/review/sectionInclusion.ts:27-29`). Naming it would send the reader after something that is not there. But naming only the survivors is worse than it looks: with `changed = ["agenda", "crew"]` and agenda gone, `Updated: Crew.` states something true and implies something false, that Crew is all that moved. So the rule is not an intersection, it is a gate: **if any changed id is absent from the new signature map, the announcement is the surface sentence.** The reader is told the surface changed, which is true, and is not sent hunting for a section that no longer exists.

The list joins with COMMAS ONLY, no trailing conjunction. A registry label can itself contain "and" as an ampersand, so `Rooms & scope` joined with a final "and" produced `Crew, Rooms & scope and Hotels`, which reads as four items rather than three. A plain comma list is unambiguous at every length. No em dashes and no apostrophes (`DESIGN.md:381`); the `&` in `Rooms & scope` is the registry's, not this spec's.

The announcement fires in the over-cap case even though no card flashes. That is the point: over the cap the surface-level statement is the true one, and dropping the visual leg must not drop the information.

Invariant 5 is not engaged: none of this copy is an error code, so it does not route through `lib/messages/lookup.ts`. It follows the house pattern for non-error copy, a constant in the owning module, exactly as `ARM_EXPIRED_ANNOUNCEMENT` does in `lib/admin/destructiveConfirm.ts`.

### 4.7 Restart under a burst

The 100ms debounce (`components/realtime/ShowRealtimeBridge.tsx:284`) coalesces a burst, but two writes 400ms apart produce two refreshes inside one 1600ms window. If the same section changes twice, the second cue must visibly restart.

Changing an attribute's VALUE does not restart a CSS animation, and the trick `ShareHub` uses (a `key` on the flashed node derived from the token, whose `flash` state is deliberately not the key, `ShareHub.tsx:860`) is unavailable here: remounting a section card would destroy scroll position and focus inside it, which is the exact property the whole realtime design exists to preserve.

The mechanism is an alternating attribute value held PER SECTION in the arming map and flipped on each re-arm of that section, giving `"1"` or `"2"`. Per-section rather than a global parity counter, because with independent expiries two sections can be mid-flash on different batches and a global counter would flip a section that was not re-armed. Because the two values select different `animation-name`s, the browser restarts the animation on the switch, with no remount and no rAF hack. The duplicated keyframes are the cost, and a structural test pins the pair byte-identical apart from the name so they cannot drift.

---

## 5. Guard table

Every input, and what renders.

| Input | Value | Behaviour |
|---|---|---|
| `data` | any valid `PublishedSectionData` | signatures built for exactly `renderedSectionIds(data)` |
| a hashed field | `null` / `undefined` | hashed as `null`; a field going from absent to present is a change, correctly |
| a hashed field | `[]` / `{}` | hashed normally; an empty-to-empty refresh is not a change |
| a hashed field | `NaN` inside a nested number | `JSON.stringify` emits `null`; two NaNs compare equal, so no spurious cue |
| `renderedSectionIds(data)` | a section appears | absent-then-present is a change, so a section that newly renders is cued (correct: content arrived) |
| `renderedSectionIds(data)` | a section disappears | present-then-absent is a change over the UNION diff, but the card is gone: nothing paints and the announcement does not name it (§4.6) |
| `changed.length` | `0` | no cue armed, live cues left running (§4.2 branch 3) |
| `changed.length` | `1..3` | cards flash, announcement lists them |
| `changed.length` | `4..12` | `armed` is emptied, so no card flashes; announcement is the surface sentence |
| the first transition after mount | any `changed` | baseline only, nothing armed (§4.2 branch 2) |
| `changed` names only sections that disappeared | | nothing to flash; announcement is the surface sentence (§4.6) |
| `armed` | empty | no attribute anywhere, region present with no child |
| `chrome.sectionId` | `undefined` (sub-block) | no attribute, matching the existing panel-card testid guard |
| `prefers-reduced-motion` | `reduce` | no visual cue at all; announcement unchanged |
| modal | unmounts mid-flash | effect cleanup clears the timer; no orphan |
| show | archived or unpublished | cues `crew` and `packlist`, whose CONTROLS the pair gates, and nothing else. A third consequence, found by probe in round 2: the loader clears `archivedTabOffer` when a show stops being published-and-unarchived (`app/admin/_showReviewModal.tsx:364-368`), so a show that was showing archived-tab offer cards loses them and Pack list cues. That is a real content change, the cards genuinely disappear, so the cue is correct and the earlier blanket claim was the thing that was wrong |
| modal | `closing` is true (an aborted close, still mounted) | armed cues and the announcement clear, nothing new arms, and the next transition is a fresh baseline (§4.2) |
| refresh source | an operator action rather than a broadcast | cues identically; the detector cannot and need not distinguish them (§1) |

---

## 6. Transition inventory

Three visual states per card: **A** resting (no attribute), **B** flashing on value `"1"`, **C** flashing on value `"2"`. All `3 * 2 / 2 = 3` unordered pairs, both directions:

| Pair | Direction | Treatment |
|---|---|---|
| A to B | this section armed, previous value absent or `"2"` | animated: a 1600ms `ease-out` outline fade, holding to 45% |
| B to A | this section's own batch timer expires | animated: the keyframe has already settled to resting by 100%, and the attribute is removed at exactly 1600ms, so removal is invisible |
| A to C | this section armed, previous value `"1"` | animated: identical to A to B |
| C to A | as B to A | animated: identical |
| B to C | this section re-armed inside its own window | animated, and this is the case the alternating value exists for: `animation-name` changes, so the animation restarts from 0% |
| C to B | as B to C | animated, restart |

Compound transitions, enumerated:

| Compound case | Behaviour |
|---|---|
| A refresh changes a DIFFERENT section while one is mid-flash | both flash, each on its own batch clock. The first card is NOT truncated: round 1 measured that the old shared-cue design yanked it at full tint, since the cue holds through 720ms of a 1600ms animation. Per-section expiry (§4.2) is the fix, and this row is what it is for. |
| A refresh changes the SAME section mid-flash | B to C or C to B above: restart, no remount |
| A refresh arrives mid-flash changing NO section | branch 3: every live flash runs to completion undisturbed |
| A refresh takes the change count over the cap mid-flash | `armed` empties, so a mid-hold card DOES snap to resting. Deliberate and the one truncation left in the design: over the cap the announcement no longer supports a per-card claim, so leaving a card lit would assert something the announcement has stopped saying. Recorded as a documented limit (§8) rather than hidden. |
| The open-time refresh, whatever it changed | branch 2: baseline only, nothing animates |
| A section disappears while flashing | its card unmounts with the section; the arming entry is harmless and expires on its own timer |
| A section APPEARS (agenda gains links) under the cap | absent to flashing: the card mounts already wearing the attribute, so its animation runs from first paint |
| A section APPEARS over the cap | absent to resting: the card mounts with no attribute, and the announcement is the surface sentence |
| A section disappears while at rest | resting to absent: nothing animates, and the announcement is the surface sentence because a changed id is no longer rendered (§4.6) |
| The modal is hidden by an aborted close mid-flash | every attribute and the announcement clear at once; a reopen is a fresh baseline, so nothing is left mid-animation to resume |
| The modal closes mid-flash | the instance unmounts and the unmount-only effect clears every outstanding batch timer |
| A flash starts while the attention pill or banner is reconciling | independent subtrees, no shared state; the pill has no transition that the card's `animation` composes with |
| A flash starts while the share-link flash is running in the open share popover | independent elements and independent constants; both are 1600ms one-shots and neither reads the other's state |
| A flash starts while a warning-jump highlight (`data-step3-warning-flash`) is live on a row INSIDE the flashing card | both paint, and they no longer compete: the row keeps its own `background-color` animation while the card animates only its OUTLINE, which is outside the card entirely. Removing the wash removed this compound case's only real hazard |
| Reduced motion, any of the above | no visual state exists; only the announcement changes |

Announcement transitions, which are separate from the card's and were the round-1 silent failure:

| Case | Behaviour |
|---|---|
| Empty to a message | child mounts inside the stable region: announced |
| A message to a DIFFERENT message | child remounts on a new batch key: announced |
| A message to an IDENTICAL message | child still remounts, because the key is the batch and not the text: announced. Reconciling the same string onto the same node would have been silent. |
| A message to empty on expiry | DOES NOT HAPPEN. The message is not cleared on the flash deadline at all: see the announcement-lifetime paragraph in §4. The only clear is the modal hiding, which unmounts the region with everything else, and announces nothing because there is no reader context left to announce into |

## 7. Dimensional invariants

The cue paints `outline-color` over a constant `outline-width`, and NOTHING else — the background wash was cut on design review (§4.5, pinned by `N9`). Neither property participates in layout, and `outline` (unlike `border`) does not occupy space. The panel card's box is byte-identical with and without the attribute.

That claim is worth an assertion rather than a sentence, because the surface has a real fixed-height parent with flex children (the scroll container carrying `scrollerRef`, `ShowReviewSurface.tsx:1036`) and Tailwind v4 does not default `.flex` to `align-items: stretch`. The plan carries a real-browser `getBoundingClientRect()` check that the card's rect is unchanged across arming and expiry, to 0.5px, and that the scroll container's `scrollHeight` does not move.

---

## 8. Documented limits

- **A section that disappears is announced only as a surface-level change** (§4.6), never by name, because naming it sends the reader after something that is no longer rendered.
- **The Changes feed does not flash** (§4.3). A sync that only appends a feed row and changes no section produces no visual cue. The feed row is itself the description of the change, and `StatusStrip.tsx:173` moves to "just now".
- **Overview does not flash** (§4.3), including a share-token rotation, which has its own cue.
- **A change that lands while the modal is closed is not cued**, and §4.2 branch 2 is what makes that true rather than aspirational. A prefetched open can serve a payload minutes old and then reconcile fresh data in place, so without the baseline branch the first refresh after opening would flash everything that changed while the modal was shut. The cue is a transition signal for changes the reader was present for. The cost is stated plainly: a genuine broadcast landing in the window between mount and the open-time refresh settling is folded into the baseline and not cued. That window is one RSC round trip, the reader has been looking at the surface for less than that, and the alternative is flashing on open, which is the failure the brief named.
- **Over the cap, a mid-hold card snaps to resting** (§6). The only truncation in the design, and it is preferred to leaving a card lit under an announcement that has stopped making a per-card claim.
- **Off-screen cards flash unseen.** The modal is a scrolling column and a changed section may be below the fold. The announcement names it regardless, and no scroll is forced: yanking the reader's viewport on a background sync would be a far worse outcome than a missed flash. Auto-scroll is out of scope (§9).
- **A sighted reader with `prefers-reduced-motion: reduce` gets no visual signal at all.** The outline is the whole cue now that the wash is gone, and reduced motion removes it. This is the ratified posture (R5) applied honestly rather than a gap: a one-shot signal has no correct steady state, and a permanent outline would assert something that is no longer true. The announcement is motion-independent and carries the information. Raised by the audit half of the invariant-8 gate and accepted with this reasoning, not silently.
- **A hash collision costs a missed cue** (§4.1). The content is still correct on screen.
- **Hotel ordering rests on the RPC's `order by h.ordinal, h.id`, and nothing in this diff pins the tie-break.** Two reservations sharing an ordinal could reorder between reads and cue Hotels spuriously. No corpus instance is known; filing a tie-break assertion on the RPC is a separate, cheap follow-up rather than a rider here.
- **Over the cap the reader is told the surface changed, not which parts** (§4.4). Deliberate.

---

## 9. Out of scope

- Scrolling or focusing the changed section. See §8.
- Any persistent "updated" badge or per-field timestamp. R3.
- Cueing the crew page or any surface other than this modal.
- Telemetry on the refresh path. Invariant 10 is not engaged: this diff adds no mutation surface, no route handler, and no server action. It remains true (R7) that nothing observes this path; opening that is a separate backlog item, not a rider on a UI cue.
- Changing the debounce, the catch-up paths, or anything else inside `ShowRealtimeBridge`.

---

## 10. Numbers

Single source of truth for every literal in this document.

| Value | Name | Where it lives | Referenced by |
|---|---|---|---|
| `1600` | `SECTION_FRESHNESS_FLASH_MS` | `components/admin/review/sectionFreshness.ts (new)` | §4.2 timer, the four `1600ms` durations in §4.5, tests N1 and N2 |
| `3` | `SECTION_FRESHNESS_MAX_CUES` | same module | §4.4, §5, §6 |
| `720` | the hold point in ms, `45%` of the duration | derived, never written as a literal | the state-machine and transition sections, where it is why truncation is visible |
| `45%` | keyframe hold point | `app/globals.css` (§4.5 normative block) | §4.5, mirrors `app/globals.css:915` |
| `2px` | outline width | same | §4.5 |
| `11` | sections changed on a full re-parse | measured, §3.2 P5 | §4.4 rationale |
| `12` | rail ids this modal can render | `sectionInclusion.ts:54-59` minus staged-only `report` | §5 guard table |
| `100ms` | bridge debounce, quoted not set here | `ShowRealtimeBridge.tsx:108` | §4.7 |
| the keyframe endpoints, zero and full | written only in the normative block | the §4.5 normative block | §4.5 only |
| `outline-offset: 0` | outline placement | same | §4.5 only |
| `0.5px` | the real-browser rect tolerance | the dimension task | the dimensional-invariants and real-browser sections |
| the text and non-text contrast floors | `TEXT_FLOOR` and `DOT_FLOOR` | `tests/styles/status-token-contrast.test.ts:81-82` | §11.4 |
| the measured ratios | recorded once in the contrast table, quoted in DESIGN.md | measured at spec time | the contrast section, plus DESIGN.md |
| `400ms` | the burst example's spacing, illustrative only | not a constant anywhere | the restart section, plus the transition inventory |

---

## 10.1 Matrices that do not apply

Stated rather than omitted, so a reviewer does not have to infer the omission was deliberate.

| Matrix | Status |
|---|---|
| Tier x domain completeness | N/A. No DB object is created, altered, or read differently. |
| CHECK / enum migration | N/A. No CHECK, no enum, no migration; `supabase/migrations/` is untouched. |
| Flag lifecycle | N/A. No boolean config field or toggle is added. The two new constants are numeric and both are read on every render of the surface that declares them, so neither can become a zombie. |
| Build vs runtime gate | N/A. No env-gated behaviour; the cue is unconditional client behaviour subject only to the media query in §4.5. |

## 10.2 File inventory

| File | Change |
|---|---|
| `components/admin/review/sectionFreshness.ts (new)` | the detector, the two constants, the announcement copy builder |
| `components/admin/showpage/PublishedReviewModal.tsx` | memoised signature, the §4.2 state machine, the announcement region, the id set passed down |
| `components/admin/review/ShowReviewSurface.tsx` | an optional flashing-id-set prop, threaded into the per-section chrome value it already builds at `ShowReviewSurface.tsx:1060-1146` |
| `components/admin/wizard/step3ReviewSections.tsx` | one optional field on `Step3SectionChrome`, one conditional attribute on the panel card under the existing `chrome.sectionId` guard |
| `app/globals.css` | the §4.5 normative block |
| `DESIGN.md` | the §5.5 animation-durations entry and the four measured ratios |
| the test files named in §11 | the suites in §11 |
| `BACKLOG.md` / `BACKLOG-archive.md` | the entry graduates carrying R1 |

## 11. Testing

### 11.1 Detector unit tests (`tests/components/admin/review/sectionFreshness.test.ts (new)`)

The probe in §3.2 becomes the shipped suite. Fixtures are built from an RPC-shaped snapshot and driven through the real `buildPublishedSectionData` and the real `buildSectionWarningModel`, never through hand-written `PublishedSectionData` or `SectionWarningRecord` literals: a literal would prove the hash function hashes, not that it isolates a real edit through the real pipeline.

| Id | Assertion | Failure it catches |
|---|---|---|
| D1 | two identical snapshots produce zero changed ids | the cue firing on every modal open (P2) |
| D2 | reordered crew, room and contact input rows produce zero changed ids | the cue firing on a reorder the adapter's own sorts absorb (P2b) |
| D2b | hotel rows are NOT adapter-sorted, so a reordered hotel input DOES change the `hotels` signature | the round-1 HIGH: a spec claiming one ordering mechanism for row sets that have two, and a D2 that would have to be wrong to pass. **What D2b does NOT prove**, per round 2: it pins the adapter's order-sensitivity, not the RPC's tie-break. The existing DB test seeds distinct ordinals, so dropping `h.id` from the RPC's `order by` would still pass everything here, and two hotels sharing an ordinal could then reorder between reads and produce a spurious Hotels cue. Recorded as a documented limit (§8) rather than claimed as covered |
| D3 | one edited crew role produces exactly `["crew"]`, and every other rendered id is byte-identical | over-broad projection: a field appearing in two sections' hashes |
| D4 | moving `last_checked_at` and `last_synced_at` alone produces zero changed ids | the cue firing on a poll that found nothing, contradicting the strip (P4) |
| D5 | toggling `published` produces exactly `["crew", "packlist"]` | BOTH directions at once: those two sections' CONTROLS are gated on `published && !archived`, so a toggle visibly changes them and a cue is required; every other section must stay silent, so the flag cannot leak in as content. This row asserted zero until a probe falsified it, at which point the test was asserting the defect |
| D6 | a full re-parse produces every rendered id, and the set equals the rendered set minus untouched sections | a projection that silently drops a section, which would make D3 pass vacuously |
| D7 | a section absent from `renderedSectionIds` never appears in the signature map, for both an empty `agendaBaseline` and a populated one | cueing a section that is not on screen |
| D8 | `null`, `undefined`, `[]`, `{}` and a nested `NaN` each hash stably across two builds | spurious cues from guard-condition inputs |
| **D9** | adding a warn routed to Crew, with `crewMembers` byte-identical, produces `["crew", "warnings"]` and NOT `["warnings"]` alone | **round-1 BLOCKING.** The routed card renders inside the Crew panel; a projection over own-fields only leaves the changed card silent |
| **D10** | changing the use-raw decision attached to a Crew-routed warning changes the `crew` signature | round-1 BLOCKING: the control's rendered state is the decision, and it lives in the owning section's card |
| **D11** | attaching or removing `archivedTabOffer` changes the `packlist` signature and nothing else | round-1 BLOCKING: the offer cards are visible pack-list content |
| **D12** | replacing a persisted crew row id while every displayed field stays equal changes the `crew` signature | round-1 BLOCKING: `previewRoster` is what the row actions target, so the card changed even though it reads the same |
| **D13** | moving `sourceAnchors` for one region changes exactly the sections mapped to that region, and moving a `null`-mapped region changes nothing | round-1 BLOCKING for the omission, plus the over-correction of hashing the whole anchor map into every section |
| **D14** | `changedSectionIds` reports a section that vanished between the two maps, and one that appeared | a diff that iterates the new map alone and silently drops removals. D7 cannot catch this: it checks map membership, not the diff |

D6 and D14 are the anti-tautology partners of D3 and D9: D3 alone passes if the projection returns one entry, and D9 alone passes if the diff never reports removals.

**Fixture discipline.** The base snapshot is built once by a helper and deep-cloned per case, so a case that mutates cannot leak into the next. Expected section id lists are derived from `renderedSectionIds` on the fixture and from `SECTION_REGION_MAP` for D13, never hardcoded.

**GREEN:** `pnpm vitest run tests/components/admin/review/sectionFreshness.test.ts`.

### 11.2 State-machine tests (`tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx (new)`)

jsdom, on the existing harness at `tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx`, mirroring the shape of `tests/components/admin/showpage/shareHubFlashState.test.tsx`.

| Id | Assertion |
|---|---|
| S1 | first render arms nothing: no card carries the attribute |
| S2 | the FIRST prop transition after mount arms nothing EVEN WHEN sections changed, and the second transition with the same change does arm. Two cases in one row, because asserting only the content-equal transition would leave the stale-prefetch path untested |
| S3 | a later transition with one changed section puts the attribute on exactly that section's panel card and on no other element in the tree |
| S4 | the attribute clears at exactly `SECTION_FRESHNESS_FLASH_MS`, and is still present at `SECTION_FRESHNESS_FLASH_MS - 1` |
| S5 | a second change to the same section inside the window flips the attribute value between `"1"` and `"2"` |
| S6 | a content-equal refresh arriving mid-flash leaves the attribute in place and does not extend or reset the timer |
| S7 | four or more changed sections arm no attribute anywhere, and the announcement reads the surface sentence |
| S8 | exactly three changed sections DO arm, all three (the boundary in the other direction) |
| S9 | no card remounts across arming or expiry: a ref captured on the panel card before the change is the same node after |
| S10 | unmounting mid-flash leaves no pending timer (`vi.getTimerCount()`), including with TWO batches outstanding, which is the case a cleanup-per-batch would have broken. The double-invoked-effect half is deliberately NOT claimed here: a probe showed the update effect runs once under this harness (`{"mountEffectRuns":[0,0],"updateEffectRuns":[1]}`), so a row asserting it would pass without exercising anything. The per-batch replacement is defended by construction and by the comment that explains it, not by a test that cannot reach it |
| S11 | the announcement REGION is present in the tree at all times, including when there is no cue, carries `role="status"`, `aria-live="polite"` and `sr-only`, and sits inside the dialog subtree in the `subHeader` band. Node IDENTITY is asserted across an arm and an expiry, because React keys are not observable in jsdom and a "stable key" claim is otherwise untestable |
| S11b | a refresh that changes NOTHING leaves the region empty and announces nothing, and a content-equal refresh arriving mid-flash neither clears nor re-announces the live message |
| S11c | under `prefers-reduced-motion: reduce` the announcement is byte-identical to the motion-allowed case, since it is the leg that carries the information there |
| S12 | announcement copy for one, two, three and over-cap cases matches the §4.6 table verbatim, and contains no em dash and no apostrophe. Labels are asserted to equal the RENDERED registry labels for those ids, read from `step3Sections(data)` rather than a list in the test, so the suite cannot pin a stale copy of the label map |
| S13 | a Diagrams sub-block never carries the attribute while its parent Rooms card does. It renders INSIDE the Rooms card and has no id in the section registry, so the emit's `chrome.sectionId !== undefined` gate is what keeps a sub-block from wearing a second nested outline for one change. The fixture MUST render a real sub-block, in the persisted `{ current }` envelope with a `snapshot_revision_id` (`lib/data/diagrams.ts:45`, `lib/data/diagrams.ts:54`): round-4 review found the row vacuous against a `diagrams: null` harness, where the assertion held over an empty set and would have stayed true against an implementation that leaked onto every sub-block there was |
| **S14** | with Crew mid-flash, changing Venue arms Venue AND LEAVES CREW ARMED, then expires each at its own 1600ms, Crew first. An implementation that replaces the id set leaves Crew snapping at full tint; an implementation that shares one timer expires them together |
| **S15** | crossing from a live under-cap cue straight to an over-cap update clears every previously armed attribute. S7 starts from rest and cannot catch a merge that leaves them on |
| **S16** | a repeat cue on the same section with IDENTICAL announcement copy remounts the region's child, asserted by node identity, not by text. Text equality holds in both the working and the broken implementation, so asserting text would pass against the silent bug |
| **S17** | a section that disappears is not named, and the announcement is the surface sentence in BOTH the disappearance-only case and the MIXED case (agenda vanishes while crew is edited). The mixed case is the one that matters: naming only the survivor states something true and implies something false |
| **S11d** | the announcement OUTLIVES the flash: past the 1600ms deadline the cards are bare while the message is unchanged, asserted by node identity so an empty-and-refill (which would be a second announcement of the same change) fails, and the next batch still replaces it |
| **S18** | a section that APPEARS under the cap mounts already wearing the attribute, and over the cap mounts without it. Driven through AGENDA, the one rail section gated on having content and therefore the only one whose card can enter and leave the rail; the case also asserts the card EXISTS, since "no attribute" would otherwise pass on a section that failed to render |
| **D13c** | swapping one unusable anchor for another cues NOTHING, because `buildSheetDeepLink` collapses both onto the same `#gid=0`. The false-cue direction of D13, and the reason the signature hashes the resolved href rather than the raw anchor |
| **N11** | every render cap is IMPORTED from the module that applies it and is actually USED, and no bare `slice` with a numeric literal survives in the detector. The structural close on the projection-fidelity vector: raising a cap widens the signature in the same commit instead of drifting |
| **D16** | the alert payload cues ONLY through what the banner paints, over all seven inputs round-4 review probed: an uninterpolated `param`, a `failedKey` past the cap (with its overflow COUNT still cueing, since the banner paints a `+N more` tail), a whitespace-only key, a gap class past the formatter's four-class cap, and a `dataGaps.total` change that leaves the painted classes equal (with crossing zero still cueing, since that flips the band on). The payload runs through the banner's own `usableFailedKeys`, `FAILED_KEYS_CAP` and `formatDataGapBreakdown`, so these hold for whatever the banner does next rather than for its shapes today |
| **N12** | the detector resolves anchors through the SHIPPED `buildSheetDeepLink`, and the raw anchor does not reach the hash alongside it. A reimplementation of that normalization would be a second source of truth that drifts the first time the allowlist changes |

S3's scan clones the tree and removes the announcement region before counting attribute-bearing nodes, so the assertion cannot pass on the region's own text.

**GREEN:** `pnpm vitest run tests/components/admin/showpage/publishedModalFreshnessCue.test.tsx`.

### 11.3 Structural tests (`tests/components/admin/review/sectionFreshnessCss.test.ts (new)`)

Mirrors `tests/components/admin/showpage/shareHubFlashTransitions.test.ts`.

| Id | Assertion |
|---|---|
| N1 | `SECTION_FRESHNESS_FLASH_MS === 1600` as a value, AND the module source matches the exact declaration, so the constant cannot be computed out from under the test |
| N2 | the §4.5 normative CSS block appears in `app/globals.css` byte for byte, at brace depth 0, with an EOF brace-balance self-check |
| N3 | each of the four `@keyframes` names is declared exactly once, and the count of `section-freshness-flash` occurrences in `app/globals.css` equals the count inside the normative block, so no stray rule exists elsewhere |
| N4 | the `-1` and `-2` keyframe bodies are byte-identical after removing their names, which is what makes the restart mechanism in §4.7 sound rather than accidental |
| N5 | the reduced-motion block sets both `animation: none` and `outline-color: transparent` |
| N6 | no `@keyframes` is declared in any `.tsx` file touched by this change |
| N7 | `SECTION_FRESHNESS_MAX_CUES === 3` as a value, and the component imports it rather than repeating a literal |
| N8 | rendering the STAGED surface with the same fixture emits no `data-section-freshness-flash` anywhere, and the staged caller passes no flashing-id prop |

### 11.4 Contrast (`tests/styles/status-token-contrast.test.ts`, new rows)

The cue is an OUTLINE only, so the rows measure the outline against the two grounds it actually touches. Both themes, read from the live hex:

| Id | Assertion | Floor | Measured light / dark |
|---|---|---|---|
| C1 | `--color-accent-edge` against `--color-surface` | 3:1 | 8.42 / 8.84 |
| C2 | `--color-accent-edge` against `--color-surface-sunken` | 3:1 | 7.59 / 9.65 |

**The text-on-tint rows this section used to carry are gone with the wash.** They measured `text` and `text-subtle` against `--color-accent-tint`, which was the right pin while the cue washed a whole card full of body text. It does not any more, and a row asserting a pairing that never renders is worse than no row: it reads as coverage. The numbers were fine; they simply stopped describing anything.

C1 is the load-bearing row: `--color-surface` is the ground for the card AND for the sub-header band the cue marks over the cap (`components/admin/review/ReviewModalShell.tsx:682`). An earlier draft of this section called the band `surface-sunken`, which the audit half of the invariant-8 gate corrected. C2 stays as a defensive second ground rather than being deleted with the wrong claim: a future band retune toward the sunken tone must not drop the cue below floor unnoticed.

Measured from the live hex in `app/globals.css` with the same relative-luminance formula the harness uses. Both reproduce values `DESIGN.md:297` already pins for the share-link ring, which is what validates the measurement rather than merely reporting it.

C3 and C4 duplicate ratios the share-link rows already assert (`tests/styles/status-token-contrast.test.ts:248-261`). They are restated on this surface's own row because DESIGN.md's note that the outline carries the dark-theme signal makes it non-decorative here too, and a future edit to the share-link rows must not silently remove this surface's floor.

**Two honest limits on what these rows prove**, both raised in round 2 and neither papered over:

- **C4's ground is an approximation.** The outline draws outside the card, so its outward neighbour is the transparent scroll container over the shell's own ground, not the card's `surface`. Measured against the real ground the edge clears 8.06:1 light and 9.39:1 dark, comfortably above the 3:1 floor, so the approximation is conservative rather than flattering. C4 keeps `surface` because that is the ground the outline shares its EDGE with at the moment the wash is still painted; the outward figure is recorded here.
- **The floors pin the endpoints, not the fade.** Compositing the edge part-way through its fade puts it below 3:1 by construction, on the way to fully transparent. That is what a fade IS, and pinning a floor across it would forbid fading at all. The claim these rows support is that nothing the cue leaves ON SCREEN sits below its floor, at the hold and at rest. The claim they do not support, and the spec does not make, is that every intermediate frame clears AA.

DESIGN.md §5.5 gains the `SECTION_FRESHNESS_FLASH_MS` entry in the animation-durations list with its owning module, its keyframe names, its reduced-motion posture, and the four measured ratios.

### 11.5 Real-browser dimension check

Added to the existing `tests/e2e/admin-layout-dimensions.spec.ts` rather than a new spec, so no new `testMatch` row or CI wiring is required (`tests/ci/_metaE2eWorkflowCoverage.test.ts` is run to confirm). It asserts the panel card's `getBoundingClientRect()` is unchanged to 0.5px across arming and expiry, and that the scroll container's `scrollHeight` does not move.

### 11.6 End-to-end

`tests/e2e/published-review-modal.realtime.spec.ts` already drives a real broadcast through `publish_show_invalidation` (`published-review-modal.realtime.spec.ts:248`) behind a `test.skip` on `MODAL_REALTIME_E2E` (`published-review-modal.realtime.spec.ts:60-63`), and its `playwright` run line is already wired into `.github/workflows/published-modal-e2e.yml:149`. Two cases are added to that spec, so again no new wiring:

- **E1** a write that changes one section, then a broadcast: the matching panel card carries the attribute within the debounce window plus a readiness margin, no other card does, and the attribute is gone after the flash duration.
- **E2** a broadcast with no content change: no card ever carries the attribute. Sampling runs on a `MutationObserver` armed BEFORE the broadcast is sent, because a poll of the DOM after the fact cannot distinguish "never armed" from "armed and already expired". The observer is disconnected in a `finally` so it cannot outlive the element.

Readiness for both: the spec's existing gate, never `networkidle` alone.

---

## 12. Gates

- Invariant 1: TDD per task, one commit per task, RED and GREEN inside the same commit.
- Invariant 8: `/impeccable critique` AND `/impeccable audit` on the diff, critique as two isolated parallel sub-agents, with the `impeccable-gate:` marker line written into the plan only after both have actually run.
- Invariant 11: all work in the `feat/modal-freshness-cue` worktree.
- Invariant 12: `BL-MODAL-REALTIME-UPDATED-CUE` marked in progress in `BACKLOG.md` for the life of the branch, graduating to `BACKLOG-archive.md` at merge carrying R1's correction and the user's decision.
- Invariant 6: engaged. Conventional-commit form, one commit per task, scoped `feat(admin)` / `test(admin)` / `docs(spec)` as the touched area dictates.
- Invariant 7: engaged, and worth stating rather than assuming given this document and its plan were briefly in contradiction over CI wiring. The spec is canonical; where the plan was RIGHT and this document was wrong, as it was about the grep-filtered workflow steps, the fix is to correct the spec, which §11.5 now does. The plan does not supersede the spec anywhere.
- Invariants 2, 3, 4, 9, 10: not engaged. No DB write, no email boundary, no sync cursor, no Supabase call site, no mutation surface.
- Invariant 5: not engaged (§4.6).
- Pre-code mechanical UI checklist run BEFORE implementation: no em dashes in user-visible copy, no apostrophe literals, 44px tap targets (this cue adds no interactive element), canonical type and token classes, and a contrast pin in DESIGN.md for the repurposed token (§11.4).
