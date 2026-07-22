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
4. **Caps and overflow** — "+N more people/rooms/hotels", "+N more" failed keys, schedule "Show all M times" + "…and N more days" + strike/loadout rows, >2 crew under-row stack disclosure, diagram thumbnail grid + "+N more" images, pack-list case/item overflow, agenda schedule-block overflow notes, warning-pointer overflow. (The 99+ pill cap was found production-unreachable during review R2 and is out of scope — §1.1.)
5. **Ignored warnings** — "Ignored (N)" disclosure, Un-ignore control, muted cards.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Classes 1–5 in scope; class 6 (action-outcome pending/error/success states) deferred via `DEFERRED.md`; classes 7 (staged-only branches), 8 (loading skeleton), 9 (critical alert tone) out of scope | User AskUserQuestion answer 2026-07-22: "1-5: all static states, 6 to deferred.md" |
| Ship autonomously through merged PR; user spec/plan review gates waived | Same exchange: "Yes, ship autonomously" |
| New scenario fields are **tier-2-only, gallery-render-only** — materialize is untouched. Precedent: `degraded` and `feedTruncated` (`lib/dev/attentionScenarios/types.ts:62-67`) are already declared "not reproducible from stored rows", tier-2-only. | Scenario-catalog spec §3.3 storable-inputs contract, amended for tier-2 read-model fields by the 2026-07-20 spec itself (`types.ts:62-67`); this spec extends the same class |
| Tier-3 renders in switcher; nav grouped by landing section; rich base fixture for all scenarios | Gap-fill spec (PR #552) §1.1 — carried forward unchanged |
| `feedTruncated` stays a flag (not derived from row count vs limit) | Gap-fill spec §3.2 — carried forward |
| The 99+ pill cap is OUT OF SCOPE as an unreachable production state: `admin_alerts` carries a partial unique index on (show_id, code) for open alerts (cited in `lib/dev/attentionScenarios/validate.ts:189-190`) and the whole `ATTENTION_ROUTES` registry holds ~45 codes, so no real show can field >99 open alert rows — the cap is defensive headroom, same class as the critical tone (class 9). The gallery must not teach a state that cannot exist (the scenario catalog's own §3.3 fidelity rule). The attention menu itself is uncapped (`MENU_CAP` at `lib/dev/attentionScenarios/tier2.ts:15` is a gallery composition constant, not a modal cap); menu scrolling is already demonstrated by `t2-many`. | This spec §3.4/§3.6 (T2_ATTENTION_EXTRAS replaces the earlier pill-overflow idea) |
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
  archived?: boolean; // default false. archived: true FORCES published false + finalizeOwned false in the applied output (archive is atomic archived=true/published=false in the lifecycle migration, and the loader forces finalizeOwned false when archived, app/admin/_showReviewModal.tsx:300); explicitly combining archived: true with published: true or finalizeOwned: true is a validation error
  published?: boolean; // default true
  finalizeOwned?: boolean; // default false
  isLive?: boolean; // default false. Requires published not false, archived not true, and datesAbsent not true; the applied output ALSO reshapes snapshot dates to span GALLERY_NOW (2026-07-01: travelIn 2026-06-30, showDays ["2026-07-01"], travelOut 2026-07-02) so the badge is date-consistent with production's published && isShowLiveOnDate derivation (app/admin/_showReviewModal.tsx:384); contradictions are validation errors
  lastSyncStatus?: string | null; // default "ok"; e.g. "drive_error", "shrink_held"
  neverSynced?: boolean;       // true → lastSyncedAt/lastCheckedAt null
  titleAbsent?: boolean; // true → modal-level title override is NULL (production converts empty adapter title to null, app/admin/_showReviewModal.tsx:288), so header (title || slug) AND StatusStrip/ShareHub (title ?? slug) both fall back to slug; snapshot show.title is "" (the adapter's storable empty), which is exactly what production's loader nullifies
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
    schedule?: "overflow"; // §3.4 recipe: 15 pure-agenda ros days × 8 agenda-kind entries + 1 synthetic-only day (strike/loadout)
    diagramImages?: number; // embedded images in the diagrams anchor; >12 → "+N more"
    packlist?: { cases: number; itemsPerCase: number }; // PullSheetCase[] rows generated into snapshot pull_sheet; cases > PACK_LIST_CASES_CAP (12) → "+N more cases", itemsPerCase > PACK_LIST_ITEMS_CAP (8) → per-case "Show all" disclosure; shape verified against the adapter's PullSheetCase at plan time
    agenda?: "overflow"; // base agenda link gains an `extracted` payload overflowing the preview caps (droppedSessions/Days/Tracks all > 0); see roster row t2-agenda-overflow
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

containing exactly the current mapping + `sortKeyFromRaw` merge logic (moved, not duplicated). `readShowChangeFeed` calls it after its three reads; `truncated`/`totalShown` stay in `readShowChangeFeed` (they need the count query). The `ChangeLogRow` type AND the `isCrewDomainChangeKind` helper + its `CREW_DOMAIN_CHANGE_KINDS` set (`lib/sync/feed/readShowChangeFeed.ts:62-69`) move to the new module — the mapping calls the helper, and leaving it behind would make the shaper depend back on the module that imports it. `readShowChangeFeed` RE-EXPORTS `isCrewDomainChangeKind` so its existing public import path (used by `tests/sync/feed/isCrewDomainChangeKind.test.ts:1`) keeps working unchanged. Behavior change: none — pinned by existing feed tests plus a new unit test comparing shaped output on a mixed fixture.

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

`venue: null` is legal by construction: `ShowReviewSnapshot["show"]` is `Record<string, unknown>` (`lib/admin/readShowReviewSnapshot.ts:22-26`) and the adapter normalizes it (`venue: ... ?? null`, `components/admin/review/publishedAdapter.ts:66`), rendering the "No venue details parsed." branch.

### 3.4 Volumes

Synthetic generators in the fixture module (deterministic, index-derived names — no `Math.random`):

- `crew: 31` → 6 base rows + 25 generated (`Crew Member 07`…) — crosses `CREW_CAP` 30 → "+1 more people" (`step3ReviewSections.tsx:1381-1382`).
- `rooms: 21`, `hotels: 13` — same pattern against `ROOMS_CAP` / `HOTELS_CAP`; `hotels: 1` → flat-solo hotel card (chrome + exactly 1).
- `schedule: "overflow"` → `run_of_show` (`RunOfShow` = `Record<ISO, ScheduleDay>`, `lib/parser/types.ts:445-451`) with 16 ros-only ISO days: days 1-15 carry 8 agenda-kind `AgendaEntry` rows each (no `kind` field, i.e. agenda), day 16 carries ONLY `strike` + `loadout` entries. Renderer semantics this recipe is built against (`components/admin/wizard/step3ReviewSections.tsx`): the per-day cap slices ONLY agenda-kind rows (lines 1589-1592), so "Show all 8 times" needs >6 agenda-kind rows on one day and synthetic rows never trigger it; the day cap exempts synthetic-bearing days and non-Show aggregate bookends (lines 1723-1727), so the "…and N more days" note (lines 1728-1731) counts only dropped non-exempt days — the base fixture's Travel In / Travel Out bookends are exempt, leaving 1 aggregate Show day + 15 pure-agenda ros days = 16 cap-subject days, exceeding `SCHEDULE_DAYS_CAP` 14 by 2. The synthetic day's muted strike/loadout rows render regardless of its position (cap-exempt).
- `diagramImages: 13` → diagrams anchor's `embeddedImages` gets 13 generated entries typed as full `PersistedEmbeddedImage` rows (`lib/parser/types.ts:332-348`): `objectId`, `mimeType` (allowed image MIME), `sheetTab`, `sheetsRevisionId`, `embeddedFingerprint`, `recovery_disposition`, plus the snapshot path field — the render guards (`lib/admin/stagedDiagramGuards.ts:11-29`) filter entries missing the string trio, and the published preview additionally requires the snapshot path + allowed MIME (`components/admin/wizard/step3ReviewSections.tsx` near line 3594). Generator output is pinned by a unit test asserting 12 rendered tiles + a "+1 more" note. Requires `anchors.diagrams` (validation error otherwise).

The 99+ pill cap is DESCOPED: `validateScenario` rejects duplicate alert codes because `admin_alerts` has a partial unique index on (show_id, code) for open alerts (`lib/dev/attentionScenarios/validate.ts:187-191`), and `ATTENTION_ROUTES` holds ~45 codes total — so >99 open rows in one class is not a production-reachable state and the gallery must not fabricate it. Failed-keys "+N more" (>6, `components/admin/review/AttentionBanner.tsx:142`) is a `TILE_PROJECTION_FETCH_FAILED` context with 7 keys. The >2 crew under-row stack disclosure ("N more") needs 3 cards under ONE rendered member: only two crew-scoped autocorrect codes exist, and under-row routing requires an autocorrect subject matching a rendered member's canonical key (`lib/admin/sectionWarningModel.ts:119-136`) — plain `buildWarning` rows carry no such payload. The stack therefore composes 2 crew-scoped warnings WITH autocorrect subject payloads naming one fixture member PLUS 1 crew-routed alert whose identity names the same member (`AMBIGUOUS_EMAIL_BINDING` with a matching `galleryIdentity`); a unit test asserts 3 cards stack under that member. All plain scenario data.

### 3.5 Ignored warnings

`ignoreWarningIndexes` maps declared `warnings` entries to fingerprints via the real `warningFingerprint` (`lib/dataQuality/warningFingerprint.ts:9`), and `buildScenarioModalData` passes the resulting set as `ignoredFingerprints` to `buildSectionWarningModel`. Referenced warnings MUST carry a `rawSnippet` (fingerprint returns null otherwise — validation error). Renders "Ignored (N)" disclosure (`sectionWarningExtras.tsx:241-247`), muted cards, and the Un-ignore control (`DataQualityWarningControls.tsx`, ignored mode).

### 3.6 New scenario roster (all tier 2)

| id | Demonstrates | Key fields |
| --- | --- | --- |
| `t2-changelog-history` | all 5 badges, Undo, Accept, "Accept all (3)", "Accepted" tag, the acceptable+undoable co-render, and the undone+"Accepted" composition, + 1 pending hold gate | `changeLog`, exactly 9 rows: (1) applied crew_renamed undoable, source mi11_approve, not acceptable → Undo only; (2)+(3) applied field_changed auto_apply ack-null → 2 Accept buttons; (4) applied crew_added auto_apply ack-null undoable → Accept AND Undo co-rendered (production permits acceptable∧undoable, `components/admin/ChangeFeedEntry.tsx:129-141`) — with (2)+(3) this makes "Accept all (3)"; (5) applied field_changed auto_apply acknowledged → "Accepted" tag; (6) rejected; (7) undone (never acknowledged); (8) undone crew_renamed WITH `acknowledged_at` set → "Undone" badge + "Accepted" tag together (`components/admin/ChangeFeedEntry.tsx:113-125`); (9) superseded. Plus `holds`: 1 email_change → pending gate row. Feed total: 10 entries. `landing: "changes"` |
| `t2-hold-dispositions` | rename + removal explanation lines and forWhom variants | `holds`: 3 (email_change, rename, removal) |
| `t2-feed-infra-error` | `change-feed-infra-error` notice | `feedNull: true`; `landing: "changes"` |
| `t2-archived` | archived badge, read-only strip (publish toggle AND Re-sync both absent — `components/admin/showpage/StatusStrip.tsx:186` renders the badge INSTEAD of the toggle, and the Re-sync trigger is `!archived`-gated near `StatusStrip.tsx:297`), "Show actions" + Unarchive in the hub | `fixture: { archived: true, published: false }`; `landing: "overview"` |
| `t2-unpublished` | toggle OFF, "Share link · paused", paused note | `fixture: { published: false }`; `landing: "overview"` |
| `t2-finalizing` | finalize chip on toggle | `fixture: { finalizeOwned: true }`; `landing: "overview"` |
| `t2-live-now` | "Live now" badge | `fixture: { isLive: true }`; `landing: "overview"` |
| `t2-sync-drive-error` | warn bucket "Couldn't reach Drive" | `fixture: { lastSyncStatus: "drive_error" }`; `landing: "overview"` |
| `t2-sync-sheet-unavailable` | warn bucket "Sheet not in folder" | `fixture: { lastSyncStatus: "sheet_unavailable" }`; `landing: "overview"` |
| `t2-sync-parse-error` | warn bucket "Couldn't read the sheet" | `fixture: { lastSyncStatus: "parse_error" }`; `landing: "overview"` |
| `t2-sync-shrink-held` | warn bucket "Re-sync held (data loss)" | `fixture: { lastSyncStatus: "shrink_held" }`; `landing: "overview"` |
| `t2-sync-pending-review` | review bucket "Changes to review" | `fixture: { lastSyncStatus: "pending_review" }`; `landing: "overview"` |
| `t2-sync-pending` | idle bucket "Sync in progress" | `fixture: { lastSyncStatus: "pending" }`; `landing: "overview"` |
| `t2-sync-not-yet` | idle bucket "Not synced yet" (null status WITH a non-null sync timestamp — the only combination that renders this label, since a null timestamp suppresses the whole sync element, `components/admin/showpage/StatusStrip.tsx:129`) | `fixture: { lastSyncStatus: null }`; `landing: "overview"` |
| `t2-sync-unknown` | defensive warn bucket "Unknown sync state" (`lib/admin/syncStatus.ts:42-44`) | `fixture: { lastSyncStatus: "mystery_future_status" }`; `landing: "overview"` |
| `t2-never-synced` | sync element entirely ABSENT (`lastSyncedAt` null suppresses it before any bucket runs) | `fixture: { neverSynced: true }`; `landing: "overview"` |
| `t2-minimal-header` | slug-fallback title, no sheet link, "Dates not detected", no client | `fixture: { titleAbsent, sheetLinkAbsent, datesAbsent, clientAbsent }`; `landing: "overview"` |
| `t2-nothing-parsed` | every "No X parsed." empty state at once | `fixture: { empty: [all 8], datesAbsent: true }`; `landing: "mixed"` |
| `t2-overflow-volumes` | "+N more" people/rooms/hotels + schedule overflow | `fixture: { volumes: { crew: 31, rooms: 21, hotels: 13, schedule: "overflow" } }`; `landing: "mixed"` |
| `t2-solo-hotel` | flat-solo hotel card | `fixture: { volumes: { hotels: 1 } }`; `landing: "mixed"` |
| `t2-diagram-images` | thumbnail grid + "+1 more" images | diagrams-anchored alert + `fixture: { volumes: { diagramImages: 13 } }` |
| `t2-attention-extras` | failed-keys "+N more", >2 under-row stack disclosure | 7-key `TILE_PROJECTION_FETCH_FAILED` + the §3.4 same-member stack trio (2 autocorrect-subject crew warnings + 1 identity-matched crew alert) |
| `t2-ignored-warnings` | "Ignored (2)" disclosure, muted cards, Un-ignore, active "Ignore all 2" bulk chip | 4 warnings, all with non-blank distinct `rawSnippet`s routing to ONE section: indexes 0+1 active, SAME code with two DISTINCT normalized snippets (drives the bulk "Ignore all 2" chip, `lib/dataQuality/bulkIgnoreGroups.ts`); indexes 2+3 ignored via `ignoreWarningIndexes: [2, 3]` (same code as each other, distinct snippets, distinct from the active pair's fingerprints) → one "Ignored (2)" disclosure |
| `t2-packlist-overflow` | "+1 more cases" (>12) and per-case "Show all 9 items" (>8) | `fixture: { volumes: { packlist: { cases: 13, itemsPerCase: 9 } } }`; `landing: "mixed"` |
| `t2-agenda-overflow` | published-agenda schedule block with "…and N more sessions/days/tracks" overflow notes | `fixture: { volumes: { agenda: "overflow" } }` — the base agenda link's `extracted` payload holds an extraction whose session/day/track counts exceed the preview caps so `block.droppedSessions/droppedDays/droppedTracks` are all > 0 (`components/admin/wizard/step3ReviewSections.tsx:2927-2932`); exact `AgendaLink.extracted` shape verified against `buildAgendaBaseline` → `buildAdminAgendaPreview` (`components/admin/review/publishedAdapter.ts:110-122`) with a unit test asserting all three notes render; `landing: "mixed"` |
| `t2-warning-spread` | section-warning callout "+N more in Parse warnings" and the warning-pointer overflow past 3 named sections (`POINTER_NAME_CAP` 3, `components/admin/wizard/step3ReviewSections.tsx:708`) | warn-severity warnings routing to 5+ distinct sections, with enough rows in one section to trip the callout's "+N more" (conditions verified at plan time against `components/admin/wizard/step3ReviewSections.tsx:601-606` and `components/admin/wizard/step3ReviewSections.tsx:707-717`); `landing: "mixed"` |

Base-fixture enrichment (all scenarios): `event_details` gains `dress_code` and one boolean field when the event anchor is active; venue gains a loading dock; transport row 1 gains loadout/notes/schedule legs; room 1 gains `floor`. Verified against adapter render branches in `components/admin/wizard/step3ReviewSections.tsx` (event details fields near line 2043, transport spec cells near line 1191, room floor pill near line 1799) at plan time — each enrichment must actually flip its branch.

### 3.7 Grouping and partition

- `scenarioGroup` (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:46`): when derived sections ∪ warning sections is empty AND `s.landing` is set, return `s.landing` (instead of `"baseline"`). Fixture-only scenarios thereby land in their real modal section group. `landing` is ignored when real sections exist (real routers win).
- `isModalVisible` (`buildSwitcherScenarios.ts:32`): fixture/changeLog/feedNull scenarios pass today via the clean-baseline arm (`alerts.length === 0 && holds.length === 0`); no change required. `isModalExpressible` unchanged.
- Validation (`lib/dev/attentionScenarios/validate.ts`): each new field gets an arm mirroring `degraded`/`feedTruncated` — tier-2-only, shape-checked. Additional cross-field guards: §3.1 (feedNull exclusivity), §3.4 (diagramImages requires diagrams anchor), §3.5 (rawSnippet required on ignored indexes; indexes in range), `landing` must be a `GROUP_ORDER` member, `fixture.empty` entries unique, `volumes` positive integers.

### 3.8 Materialize posture

Materialize (`lib/dev/materialize/`) is untouched. All new fields are tier-2-only; tier-2 scenarios are already gallery-only for the fields' class (read-model conditions / fixture shaping). Materialize rejects every scenario whose tier is not 3 (`lib/dev/materialize/plan.ts:60-61`, refusal `scenario_not_tier3`), and `validateScenario` guarantees the new fields never appear on tier-3 scenarios — so materialize can never observe them. No materialize change needed.

## 4. Guard conditions (per new field)

| Field state | Behavior |
| --- | --- |
| `changeLog: []` | Legal; contributes no entries (same as absent) |
| `changeLog` row with unknown `status`/`change_kind`/`source` | Validation error (typed unions; validate re-checks at runtime for JS callers) |
| `feedNull: true` + holds/changeLog/feedTruncated | Validation error (§3.1) |
| `fixture: {}` | Legal no-op |
| `fixture.volumes.crew: 0` | Validation error (positive integers only; use `empty` for zero) |
| `fixture.empty` + `volumes` on same section | Validation error (contradictory) |
| `archived: true` + explicit `published: true` | Validation error (archive is atomically archived+unpublished) |
| `archived: true` + `finalizeOwned: true` | Validation error (loader forces finalize ownership false when archived, app/admin/_showReviewModal.tsx:300) |
| `isLive: true` + (`published: false` or `archived: true` or `datesAbsent: true`) | Validation error (live derives from published && date-window; absent dates cannot be live) |
| `datesAbsent: true` + `volumes.schedule` | Validation error (ros-only days render regardless of dates, contradicting the empty-run-of-show intent) |
| `neverSynced: true` + non-null explicit `lastSyncStatus` | Validation error (a null timestamp suppresses the sync element before the status is read — the combination demonstrates nothing) |
| `empty` contains `"agenda"` + `volumes.agenda` | Validation error (contradictory) |
| ignored-index warning with blank/whitespace `rawSnippet` | Validation error (fingerprint would be null, lib/dataQuality/warningFingerprint.ts:9) |
| ignored-index fingerprint collides with an ACTIVE warning's fingerprint (same code + same normalized snippet) | Validation error (partitionByIgnored would ignore both) |
| `ignoreWarningIndexes` out of range / duplicate / warning lacks `rawSnippet` | Validation error |
| `landing` on tier 1/3, or any new field on tier 1/3 | Validation error (tier-2-only, same as `degraded`) |
| `landing` set but scenario derives real sections | `landing` ignored; real routers win (§3.7) |
| `titleAbsent` | modal `title: null` (production parity), snapshot `show.title: ""`; header and StatusStrip both fall back to slug |

## 5. Testing

Unit (Vitest):

- `shapeChangeFeed` extraction: mixed log+hold fixture → statuses, acceptable, undo gating, newest-first microsecond ordering — asserted against the same expectations the existing `readShowChangeFeed` tests pin (those tests keep passing unmodified: refactor-proof).
- Validation arms: one test per guard row in §4.
- `applyFixture` mapping: lifecycle knob consistency (snapshot vs modal-data halves agree), empty/volume shaping, deterministic generated rows.
- `buildScenarioFeed`: feedNull → null; changeLog+holds merged newest-first; absent-all → null (existing behavior pinned).
- `scenarioGroup` landing fallback: fixture-only scenario + landing → landing; landing + real sections → real group.
- Roster pins: each new scenario id present, validates clean, and drives its target branch (e.g. `t2-changelog-history` derives exactly 1 attention item — the hold — while its feed carries 10 entries).
- Fixture enrichment: adapter output flips each enriched branch (dress code renders, transport route legs render, room floor pill renders).

e2e (Playwright, existing `tests/e2e/attention-modal-gallery.spec.ts` dev-build project):

- `t2-changelog-history` deep link: 10 feed entries; all four non-pending badges visible; "Accept all (3)" + three per-row Accept buttons; two Undo buttons (rows 1 and 4 of the §3.6 matrix, the second co-rendered with Accept); two "Accepted" tags (acknowledged row + undone-acknowledged row); one pending gate row.
- `t2-archived`: archived badge visible, publish toggle absent.
- `t2-nothing-parsed`: "No crew parsed." and "No rooms parsed." visible.
- `t2-overflow-volumes`: "+1 more people" note visible.
- `t2-ignored-warnings`: "Ignored (2)" disclosure opens to muted cards.
- Group-select still jumps correctly with the enlarged roster (existing test re-run).

This feature touches `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` (§3.7), a UI surface under invariant 8 — the impeccable critique + audit pair runs on the affected diff before the whole-diff cross-model review, no exemption.

## 6. Numeric sweep anchors

Caps cited once in §2 (`CREW_CAP` 30 / `ROOMS_CAP` 20 / `HOTELS_CAP` 12 / `SCHEDULE_DAYS_CAP` 14 / `SCHEDULE_ENTRIES_CAP` 6) plus `PACK_LIST_CASES_CAP` 12 / `PACK_LIST_ITEMS_CAP` 8 / `POINTER_NAME_CAP` 3 (`components/admin/wizard/step3ReviewSections.tsx:152-163` and `components/admin/wizard/step3ReviewSections.tsx:708`). Roster volumes (crew 31 / rooms 21 / hotels 13 / schedule 15×8 agenda + 1 synthetic day / 13 diagram images / 13×9 pack list) each exceed their cap by construction. 26 new scenarios in §3.6 (3 changes-class, 4 lifecycle, 9 sync-posture, 1 minimal-header, 1 nothing-parsed, 5 volume/overflow, 1 diagram, 1 attention-extras, 1 ignored-warnings). 8 `empty` keys. 5 change-log statuses; 7 change-kinds; 4 sources; 9 `t2-changelog-history` log rows + 1 hold = 10 feed entries.

## 6.1 Dimensional Invariants

None. This feature changes no component, layout, or styling — it adds scenario data, fixture shaping, and one pure-function extraction. No fixed-dimension parent/child relationships are introduced or altered.

## 6.2 Transition Inventory

None. No new visual states or animations are introduced; every state this feature makes reachable already exists in the shipped components with its own (already reviewed) transition behavior. The gallery switches scenarios by full remount (`key={scenario.id}` pattern in the switcher), which is instant by design.

## 7. Meta-test inventory

- Extends: `tests/dev/attentionScenariosValidate.test.ts` (new arms), scenario index pins (`tests/dev/attentionScenariosIndex.test.ts` — no-tier-1/3 carrier pins for each new field), switcher partition tests (`tests/app/admin/attentionModalGallery.serverProps.test.ts`).
- Creates: `shapeChangeFeed` unit suite and a fixture-knob suite (new test module publishedModalFixtureKnobs under tests/dev, created by this feature).
- Not applicable: Supabase call-boundary registry (no new Supabase calls — `shapeChangeFeed` is pure; `readShowChangeFeed`'s calls are unchanged and already registered), advisory locks (no mutation paths), mutation-surface observability (no new mutation surfaces), §12.4 catalog (no new codes).

## 8. Review record

**R2 (Codex via codex-guard, 2026-07-22): BLOCKING, 8 findings — all repaired.** F1: 99+ pill descoped as production-unreachable (duplicate-code validation + partial unique index + 45-code registry); scenario renamed `t2-attention-extras` carrying only the failed-keys + under-row-stack states. F2: changelog matrix extended to 9 rows/10 entries adding the acceptable∧undoable co-render and the undone+"Accepted" composition. F3: `isLive` now reshapes fixture dates around GALLERY_NOW and forbids `datesAbsent`. F4: impeccable exemption removed — invariant-8 dual-gate runs unconditionally. F5: titleAbsent unified on modal `title: null`. F6: pin-test cardinality corrected to 10. F7: full `PersistedEmbeddedImage` field list named. F8: bookend cap arithmetic corrected (16 cap-subject days).

**R1 (Codex via codex-guard, 2026-07-22): BLOCKING, 12 findings — all repaired.**

- F1 (BLOCKING, MENU_CAP not a modal cap): already fixed in the pre-dispatch self-review commit; §1.1/§3.6 now state the menu is uncapped.
- F2 (BLOCKING, schedule recipe wrong vs renderer): recipe rebuilt against the real cap semantics (agenda-only entry cap, synthetic-day + bookend day-cap exemptions) — §3.4.
- F3 (BLOCKING, lifecycle contradictions unguarded): archived⊃¬published+¬finalizeOwned, isLive⊃published∧¬archived, datesAbsent×volumes.schedule — all validation errors, §3.2/§4.
- F4 (NA, three lifecycle claims stale): archived row no longer claims a resync arm; neverSynced semantics corrected (element suppressed, not label-without-time); titleAbsent now maps to `title: null` (production parity).
- F5 (BLOCKING, sync labels uncovered): roster expanded to all 8 reachable `syncStatusBucket` labels + the suppressed-element posture (9 scenarios).
- F6 (NA, 99+ is per-class): recipe rewritten to guarantee per-class counts — then SUPERSEDED by R2 F1, which showed >99 open rows is production-impossible (partial unique index on (show_id, code)); 99+ descoped entirely.
- F7 (NA, ignored-warning guards): blank-snippet, fingerprint-collision, and same-section composition guards added, §3.5/§4/roster.
- F8 (NA, diagram + under-row shapes): full persisted-image shape required; stack trio recomposed as 2 autocorrect-subject warnings + 1 identity-matching crew alert.
- F9 (NA, missed static states): roster + volumes gained pack-list overflow, agenda overflow, warning-spread (callout "+N more" + pointer overflow), and the active bulk-ignore chip.
- F10 (NA, changelog matrix ambiguous): explicit 7-row matrix, 8 feed entries, no undo/accept overlap.
- F11 (NA, `isCrewDomainChangeKind` ownership): helper + set move into the shaper module; reader re-exports for the existing test import path.
- F12 (NIT, stale claims): venue-null contingency dropped (legal by construction); materialize wording corrected to "rejects every tier other than 3".
