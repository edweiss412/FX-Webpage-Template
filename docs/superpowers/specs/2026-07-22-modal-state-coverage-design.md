# Modal State Coverage — Design Spec

Date: 2026-07-22
Status: Draft for adversarial review
Predecessors: `docs/superpowers/specs/2026-07-22-attention-gallery-gap-fill-design.md` (gap-fill, PR #552), `docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md` (switcher), `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md` (scenario catalog)

## 1. Goal

The dev attention-gallery switcher (`/admin/dev/attention-gallery`) must demonstrate every static UI state of the published show modal outside the happy path — not just attention/alert states. A class sweep of the modal component tree (2026-07-22, this session) found 9 unreachable state classes; the user ratified classes 1–5 in scope, class 6 recorded in `DEFERRED.md`, classes 7–9 out of scope.

In scope:

1. **Change-log feed states** — Applied / Rejected / Undone / Superseded badges, Undo button, Accept + "Accept all (N)", "Accepted" tag, rename/removal hold dispositions, `feed === null` infra-error notice.
2. **Lifecycle variants** — archived, unpublished, finalize-owned, live-now, non-`ok` sync buckets, never-synced, title→slug fallback, missing sheet link, "Dates not detected", missing client label.
3. **Empty-section states** — "No crew parsed." / "No venue details parsed." / "No hotels parsed." / "No transportation parsed." / "No rooms parsed." / "No billing details parsed." / "No run-of-show parsed." / agenda section absent / contacts empty.
4. **Caps and overflow** — "+N more people/rooms/hotels", 99+ pill cap, "+N more" failed keys, schedule "Show all M times" + "…and N more days" + strike/loadout rows, >2 crew under-row stack disclosure, diagram thumbnail grid + "+N more" images.
5. **Ignored warnings** — "Ignored (N)" disclosure, Un-ignore control, muted cards.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Classes 1–5 in scope; class 6 (action-outcome pending/error/success states) deferred via `DEFERRED.md`; classes 7 (staged-only branches), 8 (loading skeleton), 9 (critical alert tone) out of scope | User AskUserQuestion answer 2026-07-22: "1-5: all static states, 6 to deferred.md" |
| Ship autonomously through merged PR; user spec/plan review gates waived | Same exchange: "Yes, ship autonomously" |
| New scenario fields are **tier-2-only, gallery-render-only** — materialize is untouched. Precedent: `degraded` and `feedTruncated` (`lib/dev/attentionScenarios/types.ts:62-67`) are already declared "not reproducible from stored rows", tier-2-only. | Scenario-catalog spec §3.3 storable-inputs contract, amended for tier-2 read-model fields by the 2026-07-20 spec itself (`types.ts:62-67`); this spec extends the same class |
| Tier-3 renders in switcher; nav grouped by landing section; rich base fixture for all scenarios | Gap-fill spec (PR #552) §1.1 — carried forward unchanged |
| `feedTruncated` stays a flag (not derived from row count vs limit) | Gap-fill spec §3.2 — carried forward |
| Class-4 pill-cap scenario uses ~110 synthetic alert rows of catalog codes; the pill displays "99+" while the attention menu renders ALL items uncapped in its scroll area (`components/admin/showpage/AttentionMenu.tsx` has no list cap — `MENU_CAP` at `lib/dev/attentionScenarios/tier2.ts:15` is a gallery scenario-composition constant, not a modal cap) — both behaviors are the point of the scenario | This spec §3.6 (T2_PILL_OVERFLOW) |
| Base-fixture enrichment (dress code, event booleans, loading dock, transport loadout/route/notes, room floor pill) applies to ALL scenarios, same "rich base for all" rationale ratified for PR #552 | Gap-fill spec §1.1 "Rich base for all" |

## 2. Sweep inventory (what is unreachable and why)

Authoritative sweep: session transcript 2026-07-22. Summary of root causes:

- `buildGallerySnapshot` (`lib/dev/publishedModalFixture.ts:57`) returns one fixed snapshot: sections always populated, volumes below every cap (`CREW_CAP` 30, `ROOMS_CAP` 20, `HOTELS_CAP` 12, `SCHEDULE_DAYS_CAP` 14, `SCHEDULE_ENTRIES_CAP` 6 — `components/admin/wizard/step3ReviewSections.tsx:152-163`).
- `buildGalleryModalData` (`lib/dev/publishedModalFixture.ts:202`) pins `archived:false, published:true, finalizeOwned:false, isLive:false, lastSyncStatus:"ok"`, non-null `lastSyncedAt`, title, `openSheetHref`, and `feed: { entries: [], truncated: false }` — never null.
- `buildScenarioFeed` (`lib/dev/deriveScenarioAttention.ts:58`) emits only pending mi11 gate rows via `shapeHoldEntry`; the change-log half of the production feed (`readShowChangeFeed`, `lib/sync/feed/readShowChangeFeed.ts:98`) is never modeled, so `ChangeFeedBadge`'s applied/rejected/undone/superseded arms, `ChangeFeedEntry`'s undo/accept arms, and `ChangesFeed`'s "Accept all (N)" are dead in the gallery.
- `ignoredFingerprints` is always `new Set()` (`lib/dev/buildScenarioModalData.ts` and `publishedModalFixture.ts:207`), so `sectionWarningExtras.tsx:241` "Ignored (N)" and the un-ignore control never mount.

## 3. Design

### 3.0 Schema — new tier-2-only scenario fields

`AttentionScenario` (`lib/dev/attentionScenarios/types.ts:50`) gains five optional fields, each following the `degraded`/`feedTruncated` pattern (tier 2 only, rejected on other tiers by `validateScenario`):

```ts
/** Tier 2 only - storable show_change_log rows shaped by the REAL feed shaper. */
changeLog?: ScenarioChangeLogRow[];
/** Tier 2 only - renders the ChangesSection feed-infra-error notice (feed === null). */
feedNull?: boolean;
/** Tier 2 only - reshapes the base fixture (lifecycle flags, empty sections, volumes). */
fixture?: ScenarioFixture;
/** Tier 2 only - indexes into `warnings` marked as ignored (content-keyed ignore). */
ignoreWarningIndexes?: number[];
/** Tier 2 only - nav group for scenarios whose state carries no attention items or warnings. */
landing?: ScenarioGroupId;
```

`ScenarioChangeLogRow` mirrors the columns `readShowChangeFeed` selects (`lib/sync/feed/readShowChangeFeed.ts:71-82` `ChangeLogRow`), minus `id` (synthesized like alert/hold ids):

```ts
export type ScenarioChangeLogRow = {
  occurred_at: string;
  status: "applied" | "pending" | "rejected" | "undone" | "superseded";
  summary: string;
  entity_ref: string | null;
  change_kind:
    | "crew_added" | "crew_removed" | "crew_renamed" | "crew_email_changed"
    | "field_changed" | "section_shrunk" | "asset_drift";
  individually_undoable: boolean;
  source: "auto_apply" | "mi11_approve" | "mi11_reject" | "undo";
  acknowledged_at: string | null;
};
```

`ScenarioFixture` (all knobs optional; absent knob = base behavior):

```ts
export type ScenarioFixture = {
  // Lifecycle (flow into buildGalleryModalData overrides AND snapshot.show where applicable)
  archived?: boolean;          // default false
  published?: boolean;         // default true
  finalizeOwned?: boolean;     // default false
  isLive?: boolean;            // default false
  lastSyncStatus?: string | null; // default "ok"; e.g. "drive_error", "shrink_held"
  neverSynced?: boolean;       // true → lastSyncedAt/lastCheckedAt null
  titleAbsent?: boolean;       // true → title "" → header falls back to slug
  sheetLinkAbsent?: boolean;   // true → openSheetHref null; snapshot drive_file_id KEPT (per-section "In sheet" links are a separate surface, not this knob's target)
  datesAbsent?: boolean;       // true → snapshot dates all null → "Dates not detected" + empty run-of-show
  clientAbsent?: boolean;      // true → client_label null
  // Empty sections (snapshot collections emptied)
  empty?: Array<"crew" | "venue" | "rooms" | "hotels" | "transport" | "contacts" | "billing" | "agenda">;
  // Volumes (synthetic rows generated past the render caps)
  volumes?: {
    crew?: number;    // > CREW_CAP (30) → "+N more people"
    rooms?: number;   // > ROOMS_CAP (20) → "+N more rooms"
    hotels?: number;  // > HOTELS_CAP (12) → "+N more hotels"; exactly 1 → flat-solo card
    schedule?: "overflow"; // 15 days × 7 entries incl. strike/loadout kinds
    diagramImages?: number; // embedded images in the diagrams anchor; >12 → "+N more"
  };
};
```

### 3.1 Change-log feed — real shaper, extracted

The log-row → `FeedEntry` mapping currently lives inline in `readShowChangeFeed` (`lib/sync/feed/readShowChangeFeed.ts:158-181`), including the acceptable predicate, the undo gate (`status==='applied' && isCrewDomainChangeKind && individually_undoable`), and the microsecond-precise merge sort with `shapeHoldEntry` rows. Hand-rolling that in the gallery would violate the fidelity contract.

**Refactor:** extract a pure exported function `shapeChangeFeed` into a NEW module under `lib/sync/feed/` (module name shapeChangeFeed, created by this feature):

```ts
export function shapeChangeFeed(
  logRows: ChangeLogRow[],
  holdRows: HoldRow[],
): FeedEntry[]
```

containing exactly the current mapping + `sortKeyFromRaw` merge logic (moved, not duplicated). `readShowChangeFeed` calls it after its three reads; `truncated`/`totalShown` stay in `readShowChangeFeed` (they need the count query). `ChangeLogRow` type moves to (or is re-exported from) the new module. Behavior change: none — pinned by existing feed tests plus a new unit test comparing shaped output on a mixed fixture.

Gallery: `buildScenarioFeed` (`lib/dev/deriveScenarioAttention.ts:58`) becomes:

- `s.feedNull === true` is NOT handled here — `buildScenarioFeed`'s `null` already means "absent, use the base empty feed" and cannot also mean "infra error". Instead `buildScenarioModalData` handles it: when `s.feedNull`, it passes an explicit `feed: null` override to `buildGalleryModalData` (the `GalleryModalData.feed` type is nullable via the modal props), which renders `ChangesSection`'s infra-error notice (`components/admin/showpage/ChangesSection.tsx:60`, testid `change-feed-infra-error`).
- Else → `{ entries: shapeChangeFeed(toChangeLogRows(s), toHoldRows(s)), truncated: s.feedTruncated === true }`, where `toChangeLogRows` synthesizes ids (`${s.id}-log-${i}`) like `toHoldRows` does. Returns `null` (as today) only when the scenario has no holds AND no changeLog AND no feedNull — preserving the current "absent feed → base empty feed" default in `buildScenarioModalData`.

Attention items: change-log rows never become attention items (production: only pending mi11 gate rows pass `toHoldItem`, `lib/admin/attentionItems.ts:284-286`). `deriveScenarioAttention` passes only hold-derived entries to `deriveAttentionItems` — the shaped log rows are feed-only. This mirrors production exactly, because `deriveAttentionItems` filters via `toHoldItem` anyway; no special-casing needed beyond passing the merged feed (the filter drops log rows).

Guard: `feedNull: true` combined with non-empty `holds` or `changeLog` or `feedTruncated` is a validation error — a null feed cannot carry entries, and holds would desync the changes-rail badge from the feed (Codex R1 P1 class from the switcher spec).

### 3.2 Lifecycle knobs

`buildScenarioModalData` (`lib/dev/buildScenarioModalData.ts:50`) threads `s.fixture` into both halves:

- Snapshot half — `buildGallerySnapshot(warnings, { anchors, fixture })`: `titleAbsent` → `show.title: ""`; `datesAbsent` → `dates: { travelIn: null, set: null, showDays: [], travelOut: null }`; `clientAbsent` → `client_label: null`; `archived`/`published` mirrored into `show.archived`/`show.published`; `empty`/`volumes` per §3.3/§3.4.
- Data half — `buildGalleryModalData` overrides: `archived`, `published`, `finalizeOwned`, `isLive`, `lastSyncStatus`, `neverSynced` → `lastSyncedAt: null, lastCheckedAt: null`, `titleAbsent` → `title: ""`, `sheetLinkAbsent` → `openSheetHref: null`.

Consistency is owned by ONE mapping function (`applyFixture`, unit-tested) so the snapshot and the modal props can never disagree on `archived`/`published`/title.

Header fallback: `components/admin/showpage/PublishedReviewModal.tsx:239` region falls back to slug when title is empty; `components/admin/showpage/PublishedReviewModal.tsx:711` renders "Dates not detected" when `segs.length === 0`. Status strip: `components/admin/showpage/StatusStrip.tsx:186` archived badge; `components/admin/showpage/StatusStrip.tsx:213` live badge; `components/admin/showpage/StatusStrip.tsx:129` sync buckets via `syncStatusBucket` (`lib/admin/syncStatus.ts:20`). ShareHub arms: `components/admin/showpage/ShareHub.tsx:215` `linkActive`; archived relabels the primary to "Show actions" with Unarchive inside (`components/admin/showpage/ShareHub.tsx:15`).

### 3.3 Empty sections

`empty` list empties the corresponding snapshot collections: `crew` → `crew_members: []`; `venue` → `venue: null`; `rooms` → `rooms: []`; `hotels` → `hotel_reservations: []`; `transport` → `transportation: []`; `contacts` → `contacts: []`; `billing` → `coi_status: null` (and no other billing sources); `agenda` → `agenda_links: []`. Empty-state copy verified in `components/admin/wizard/step3ReviewSections.tsx` at lines 1442 (crew), 1031 (venue), 2364 (hotels), 1128 (transport), 1779 (rooms), 1323 (billing), 1739 (run-of-show), 1987 (event details). Run-of-show empty comes via `datesAbsent` (bookend days derive from dates; `run_of_show` is already `{}` in the base fixture).

Guard: `venue: null` must be legal in `ShowReviewSnapshot["show"]` — verify the type before implementation; if `venue` is non-nullable, empty it to `{ name: null, address: null }`-shaped minimal value that yields `rows.length === 0` instead. (Plan task verifies against the live type and picks the legal encoding.)

### 3.4 Volumes

Synthetic generators in the fixture module (deterministic, index-derived names — no `Math.random`):

- `crew: 31` → 6 base rows + 25 generated (`Crew Member 07`…) — crosses `CREW_CAP` 30 → "+1 more people" (`step3ReviewSections.tsx:1381-1382`).
- `rooms: 21`, `hotels: 13` — same pattern against `ROOMS_CAP` / `HOTELS_CAP`; `hotels: 1` → flat-solo hotel card (chrome + exactly 1).
- `schedule: "overflow"` → `run_of_show` with 15 dated days × 7 entries, entry kinds cycling through regular + `strike`/`loadout` → "Show all M times" expander (>6/day, `SCHEDULE_ENTRIES_CAP`), "…and N more days" (>14, `SCHEDULE_DAYS_CAP`), and the muted synthetic strike/loadout rows. The exact `run_of_show` storable shape is verified against `lib/admin/readShowReviewSnapshot.ts` types at plan time.
- `diagramImages: 13` → diagrams anchor's `embeddedImages` gets 13 generated image entries → thumbnail grid + "+1 more" (>12). Requires `anchors.diagrams` (validation error otherwise).

Pill/menu overflow needs no schema: a tier-2 scenario with ~110 alert rows (catalog codes, `manyAlerts`-style composition extended) drives the 99+ pill cap (`PublishedReviewModal.tsx:747`). Failed-keys "+N more" (>6, `AttentionBanner.tsx:128`) is a `TILE_PROJECTION_FETCH_FAILED` context with 7 keys. The >2 crew under-row stack disclosure is 3 crew-scoped warnings on one rendered member. All plain scenario data.

### 3.5 Ignored warnings

`ignoreWarningIndexes` maps declared `warnings` entries to fingerprints via the real `warningFingerprint` (`lib/dataQuality/warningFingerprint.ts:9`), and `buildScenarioModalData` passes the resulting set as `ignoredFingerprints` to `buildSectionWarningModel`. Referenced warnings MUST carry a `rawSnippet` (fingerprint returns null otherwise — validation error). Renders "Ignored (N)" disclosure (`sectionWarningExtras.tsx:241-247`), muted cards, and the Un-ignore control (`DataQualityWarningControls.tsx`, ignored mode).

### 3.6 New scenario roster (all tier 2)

| id | Demonstrates | Key fields |
| --- | --- | --- |
| `t2-changelog-history` | all 5 badges, Undo, Accept, "Accept all (2)", "Accepted" tag, + 1 pending hold gate | `changeLog`: applied+undoable (crew_renamed), 2× applied+acceptable (auto_apply, ack null), applied+acknowledged, rejected, undone, superseded; `holds`: 1 email_change; `landing: "changes"` |
| `t2-hold-dispositions` | rename + removal explanation lines and forWhom variants | `holds`: 3 (email_change, rename, removal) |
| `t2-feed-infra-error` | `change-feed-infra-error` notice | `feedNull: true`; `landing: "changes"` |
| `t2-archived` | archived badge, read-only strip, "Show actions" + Unarchive, resync arm | `fixture: { archived: true }`; `landing: "overview"` |
| `t2-unpublished` | toggle OFF, "Share link · paused", paused note | `fixture: { published: false }`; `landing: "overview"` |
| `t2-finalizing` | finalize chip on toggle | `fixture: { finalizeOwned: true }`; `landing: "overview"` |
| `t2-live-now` | "Live now" badge | `fixture: { isLive: true }`; `landing: "overview"` |
| `t2-sync-drive-error` | warn sync bucket label "Couldn't reach Drive" | `fixture: { lastSyncStatus: "drive_error" }`; `landing: "overview"` |
| `t2-never-synced` | sync cell absent / "Not synced yet" posture | `fixture: { neverSynced: true, lastSyncStatus: null }`; `landing: "overview"` |
| `t2-minimal-header` | slug-fallback title, no sheet link, "Dates not detected", no client | `fixture: { titleAbsent, sheetLinkAbsent, datesAbsent, clientAbsent }`; `landing: "overview"` |
| `t2-nothing-parsed` | every "No X parsed." empty state at once | `fixture: { empty: [all 8], datesAbsent: true }`; `landing: "mixed"` |
| `t2-overflow-volumes` | "+N more" people/rooms/hotels + schedule overflow | `fixture: { volumes: { crew: 31, rooms: 21, hotels: 13, schedule: "overflow" } }`; `landing: "mixed"` |
| `t2-solo-hotel` | flat-solo hotel card | `fixture: { volumes: { hotels: 1 } }`; `landing: "mixed"` |
| `t2-diagram-images` | thumbnail grid + "+1 more" images | diagrams-anchored alert + `fixture: { volumes: { diagramImages: 13 } }` |
| `t2-pill-overflow` | 99+ pill cap, uncapped scrolling menu, failed-keys "+N more", >2 under-row stack | ~110 alert rows + 7-key `TILE_PROJECTION_FETCH_FAILED` + 3 same-member crew warnings |
| `t2-ignored-warnings` | "Ignored (2)" disclosure, muted cards, Un-ignore | 2 active + 2 ignored warnings (with rawSnippet); `ignoreWarningIndexes: [2, 3]` |

Base-fixture enrichment (all scenarios): `event_details` gains `dress_code` and one boolean field when the event anchor is active; venue gains a loading dock; transport row 1 gains loadout/notes/schedule legs; room 1 gains `floor`. Verified against adapter render branches in `components/admin/wizard/step3ReviewSections.tsx` (event details fields near line 2043, transport spec cells near line 1191, room floor pill near line 1799) at plan time — each enrichment must actually flip its branch.

### 3.7 Grouping and partition

- `scenarioGroup` (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:46`): when derived sections ∪ warning sections is empty AND `s.landing` is set, return `s.landing` (instead of `"baseline"`). Fixture-only scenarios thereby land in their real modal section group. `landing` is ignored when real sections exist (real routers win).
- `isModalVisible` (`buildSwitcherScenarios.ts:32`): fixture/changeLog/feedNull scenarios pass today via the clean-baseline arm (`alerts.length === 0 && holds.length === 0`); no change required. `isModalExpressible` unchanged.
- Validation (`lib/dev/attentionScenarios/validate.ts`): each new field gets an arm mirroring `degraded`/`feedTruncated` — tier-2-only, shape-checked. Additional cross-field guards: §3.1 (feedNull exclusivity), §3.4 (diagramImages requires diagrams anchor), §3.5 (rawSnippet required on ignored indexes; indexes in range), `landing` must be a `GROUP_ORDER` member, `fixture.empty` entries unique, `volumes` positive integers.

### 3.8 Materialize posture

Materialize (`lib/dev/materialize/`) is untouched. All new fields are tier-2-only; tier-2 scenarios are already gallery-only for the fields' class (read-model conditions / fixture shaping). The materialize path continues to reject nothing new — `validateScenario` guarantees the fields never appear on tier-1/3 scenarios, which are the materializable tiers. (Verified at plan time: materialize consumes only tier-1/3 or per-scenario rows; if materialize can target tier-2 scenarios today, the plan adds an explicit skip/error for scenarios carrying gallery-only fields.)

## 4. Guard conditions (per new field)

| Field state | Behavior |
| --- | --- |
| `changeLog: []` | Legal; contributes no entries (same as absent) |
| `changeLog` row with unknown `status`/`change_kind`/`source` | Validation error (typed unions; validate re-checks at runtime for JS callers) |
| `feedNull: true` + holds/changeLog/feedTruncated | Validation error (§3.1) |
| `fixture: {}` | Legal no-op |
| `fixture.volumes.crew: 0` | Validation error (positive integers only; use `empty` for zero) |
| `fixture.empty` + `volumes` on same section | Validation error (contradictory) |
| `ignoreWarningIndexes` out of range / duplicate / warning lacks `rawSnippet` | Validation error |
| `landing` on tier 1/3, or any new field on tier 1/3 | Validation error (tier-2-only, same as `degraded`) |
| `landing` set but scenario derives real sections | `landing` ignored; real routers win (§3.7) |
| `titleAbsent` | `title: ""` both halves; header renders slug (`PublishedReviewModal.tsx:239` region) |
| `neverSynced` with non-null `lastSyncStatus` | Legal (bucket label shown without time); roster uses `lastSyncStatus: null` for the pure never-synced posture |

## 5. Testing

Unit (Vitest):

- `shapeChangeFeed` extraction: mixed log+hold fixture → statuses, acceptable, undo gating, newest-first microsecond ordering — asserted against the same expectations the existing `readShowChangeFeed` tests pin (those tests keep passing unmodified: refactor-proof).
- Validation arms: one test per guard row in §4.
- `applyFixture` mapping: lifecycle knob consistency (snapshot vs modal-data halves agree), empty/volume shaping, deterministic generated rows.
- `buildScenarioFeed`: feedNull → null; changeLog+holds merged newest-first; absent-all → null (existing behavior pinned).
- `scenarioGroup` landing fallback: fixture-only scenario + landing → landing; landing + real sections → real group.
- Roster pins: each new scenario id present, validates clean, and drives its target branch (e.g. `t2-changelog-history` derives exactly 1 attention item — the hold — while its feed carries 7 entries).
- Fixture enrichment: adapter output flips each enriched branch (dress code renders, transport route legs render, room floor pill renders).

e2e (Playwright, existing `tests/e2e/attention-modal-gallery.spec.ts` dev-build project):

- `t2-changelog-history` deep link: all four non-pending badges visible, "Accept all (2)" button present, Undo button present.
- `t2-archived`: archived badge visible, publish toggle absent.
- `t2-nothing-parsed`: "No crew parsed." and "No rooms parsed." visible.
- `t2-overflow-volumes`: "+1 more people" note visible.
- `t2-ignored-warnings`: "Ignored (2)" disclosure opens to muted cards.
- Group-select still jumps correctly with the enlarged roster (existing test re-run).

The UI diff is expected to be near-zero (scenario system + fixture only; no component changes besides none-anticipated) — if any file under `components/` or `app/` (non-api) changes beyond `buildSwitcherScenarios.ts`/gallery modules, invariant 8's impeccable dual-gate runs on the affected diff.

## 6. Numeric sweep anchors

Caps cited once in §2 (`CREW_CAP` 30 / `ROOMS_CAP` 20 / `HOTELS_CAP` 12 / `SCHEDULE_DAYS_CAP` 14 / `SCHEDULE_ENTRIES_CAP` 6); roster volumes (31/21/13/15×7/13 images/110 alerts) each exceed their cap by construction. 16 new scenarios in §3.6. 8 `empty` keys. 5 change-log statuses; 7 change-kinds; 4 sources.

## 6.1 Dimensional Invariants

None. This feature changes no component, layout, or styling — it adds scenario data, fixture shaping, and one pure-function extraction. No fixed-dimension parent/child relationships are introduced or altered.

## 6.2 Transition Inventory

None. No new visual states or animations are introduced; every state this feature makes reachable already exists in the shipped components with its own (already reviewed) transition behavior. The gallery switches scenarios by full remount (`key={scenario.id}` pattern in the switcher), which is instant by design.

## 7. Meta-test inventory

- Extends: `tests/dev/attentionScenariosValidate.test.ts` (new arms), scenario index pins (`tests/dev/attentionScenariosIndex.test.ts` — no-tier-1/3 carrier pins for each new field), switcher partition tests (`tests/app/admin/attentionModalGallery.serverProps.test.ts`).
- Creates: `shapeChangeFeed` unit suite and a fixture-knob suite (new test module publishedModalFixtureKnobs under tests/dev, created by this feature).
- Not applicable: Supabase call-boundary registry (no new Supabase calls — `shapeChangeFeed` is pure; `readShowChangeFeed`'s calls are unchanged and already registered), advisory locks (no mutation paths), mutation-surface observability (no new mutation surfaces), §12.4 catalog (no new codes).

## 8. Review record

(appended per round)
