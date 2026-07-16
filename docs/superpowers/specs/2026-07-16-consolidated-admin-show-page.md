# Consolidated Admin Show Page — shared Step-3 review surface

**Date:** 2026-07-16
**Status:** Draft (brainstorm converged in-session; all design sections user-approved)
**Autonomy:** approved — autonomous ship through merged PR (AGENTS.md brainstorming gate, 2026-07-16)
**Design mock:** `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page-mock/` — **PENDING, not yet committed.** The Claude Design pass (§13) runs in parallel with spec/plan review; its fetches are committed verbatim to that directory. This is a **blocking pre-UI gate**: the plan's first UI-rendering task (Phase 2) carries an explicit precondition step that fails the task if the directory does not exist in the tree at execution time. Phase 1 (extraction, zero visible change) does NOT require the mock.

---

## 1. Problem & goals

Admins today have **no parsed-content read view of a published show inside admin chrome**. The only access is the crew page itself (`CrewPageLink` "Open Crew Page", `app/admin/show/[slug]/CrewPageLink.tsx`) or a crew-scoped Preview As link (`app/admin/show/[slug]/preview/[crewId]/page.tsx`). The admin show page (`app/admin/show/[slug]/page.tsx`, ~1067 lines) shows warnings, alerts, share tooling, and sync controls — but not what the parser actually published.

Meanwhile the wizard's Step-3 review modal (`components/admin/wizard/Step3ReviewModal.tsx`) is a mature, well-liked parsed-detail surface: side rail + chip rail navigation, per-section panels, warnings-by-section, scroll-spy, sheet deep links.

**Goals (user-ratified):**

1. Serve **both** jobs from one surface: read-verify ("what did the parser publish?") AND warning-anchored correction workflow.
2. **Full consolidation:** rebuild `/admin/show/[slug]` AROUND parsed sections — warnings/controls attach to their sections.
3. **Unify chrome:** one shared review surface component; the wizard Step-3 modal becomes a thin wrapper over it. Wizard look and behavior unchanged.
4. Page shell = **slim pinned status strip + Overview rail section** (option B of the brainstorm mockups).

**Non-goals (explicitly out of scope):**

- No change to what crew see (`app/show/[slug]/[shareToken]/page.tsx` untouched).
- No DB schema changes; no new tables, columns, or RPCs.
- No change to control write paths (role-recognize, use-raw, data-quality ignore server actions unchanged).
- The wizard staging pipeline's pre-overlay preview gap (`BL-ROLE-VOCAB-STAGING-OVERLAY`, BACKLOG.md:7) is NOT addressed here — it remains a wizard-only backlog item. The published page reads post-overlay persisted data, so it never exhibits that gap.
- Admin dashboard (`app/admin/page.tsx`) unchanged; it links to show pages as today.

## 2. Current state (verified citations)

| Concept | Where | Verified |
| --- | --- | --- |
| Step-3 modal | `components/admin/wizard/Step3ReviewModal.tsx` (1475 lines) | props at `Step3ReviewModal.tsx:173-193`: `{ data: SectionData; checked; isDirtyRescan; onRequestSetChecked; onClose; resolution?; isPublishRunActive? }` |
| Section panels + data shape | `components/admin/wizard/step3ReviewSections.tsx` (3620 lines) | `SectionData` at `step3ReviewSections.tsx:2952` — fields `pr: ParseResult`, `row: Step3Row`, `dfid`, `wizardSessionId`, `crewMembers`, `rooms`, `hotels`, `pullSheet`, `archivedPullSheetTabs`, `ros`, `warnings`, `agendaBaseline`, `useRawDecisions` |
| Section registry | `step3ReviewSections.tsx:3450` `step3Sections(d: SectionData): Step3SectionDef[]`; `Step3SectionDef` at `:2970` (id, label, group, Icon, railCount, render) | ✓ |
| Section ids | `lib/admin/step3SectionStatus.ts:6` — 14 ids: venue, event, crew, contacts, schedule, agenda, hotels, transport, rooms, diagrams, packlist, billing, warnings, report | ✓ |
| Warning→section mapping | `lib/admin/step3SectionStatus.ts:70` `sectionForWarning`, `:84` `warningsBySection`, `:110` `sectionStatus`, `:116` `deriveSectionStatuses` | ✓ |
| SectionData builder (staged) | `Step3SheetCard.tsx` — "The card builds the modal's `SectionData` from its own derived values" (`Step3SheetCard.tsx:16`) | ✓ |
| Admin show page | `app/admin/show/[slug]/page.tsx` (1067 lines) — imports enumerated §5 | ✓ |
| Published parsed data | `shows` columns incl. `title`, `client_label`, `dates`, `venue`, `event_details`, `coi_status`, `pull_sheet`, `pull_sheet_override`, `agenda_links`, `diagrams`, `client_contact`, `source_anchors`, `drive_file_id` (schema manifest); `shows_internal` columns `financials`, `parse_warnings`, `raw_unrecognized`, `run_of_show`, `use_raw_decisions` (manifest; upserted at `lib/sync/runScheduledCronSync.ts:1766`); per-domain tables `crew_members`, `rooms`, `hotel_reservations`, `transportation` (insert at `runScheduledCronSync.ts:1719`), `contacts` (insert at `:1752`) | ✓ |
| Flat warnings list on page | `components/admin/PerShowActionableWarnings.tsx:22` — `{ items: ParseWarning[]; driveFileId; renderItemControls; tone }` | ✓ |
| Live-now rule | `lib/time/showSpan.ts:30` `isShowLiveOnDate` (dates-derived; memory contract: today ∈ [dates.travelIn..travelOut]) | ✓ |
| Sync status strip pieces | `components/admin/StatusIndicator.tsx:26`; `lib/admin/syncStatus.ts:20` `syncStatusBucket`; `lib/admin/showDisplay.ts:92` `formatRelative` | ✓ |
| Existing modal regression tests | `tests/components/admin/wizard/`: `Step3ReviewModal.test.tsx`, `step3ReviewModal.transitions.test.tsx`, `Step3ReviewModalResolution.test.tsx`, `_metaStep3FreezeContract.test.ts`, `step3JudgmentChrome.test.tsx`, `step3DirtyRescan.test.tsx`, `step3ReviewSections.test.tsx` | ✓ |
| Step-3 chrome outside wizard already | `CorrectionLoopCallout.tsx:13` (bridges server page ↔ "use client" step3ReviewSections tree); `RescanSheetButton.tsx` | ✓ |

## 3. Architecture

### 3.1 Component family (new home: `components/admin/review/`)

```
components/admin/review/
  ShowReviewSurface.tsx    — rail + chip rail + section panels + scroll-spy (extracted modal body)
  sectionData.ts           — SectionCore type + mode extensions (moved/split from step3ReviewSections.tsx)
  publishedAdapter.ts      — published show rows → SectionCore  (client-safe pure mapping)
```

- **`ShowReviewSurface`** owns: desktop side rail, mobile horizontal chip rail, deterministic scroll-spy, section panel rendering via the existing `step3Sections` registry, warnings-by-section chips. It does NOT own: dialog chrome (scrim/focus trap/drag-dismiss), approve footer, page strip. Those belong to shells.
- **Modal shell** = `Step3ReviewModal.tsx`, reduced to: dialog topology (scrim, `useDialogFocus` trap, Esc, body scroll lock, sheet drag-to-dismiss below `sm`, entrance animation hooks), result-bearing publish footer, freeze contract (`isPublishRunActive`) — wrapping `ShowReviewSurface`. **Public props unchanged** (`Step3ReviewModal.tsx:173-193`). All existing wizard tests must pass without modification (§14.1).
- **Page shell** = rebuilt `app/admin/show/[slug]/page.tsx` + a client layout component: pinned status strip + `ShowReviewSurface` in full-page two-pane mode + Overview/Changes rail sections (§5).

### 3.2 SectionData split

Current `SectionData` (`step3ReviewSections.tsx:2952`) mixes render content with staged-only context. Split into:

The panel-by-panel `pr.`/`row.` usage audit is COMPLETE (this section is its output — every consumer enumerated below with citations). `SectionCore` is the closed contract:

```ts
// sectionData.ts
export type SectionCore = {
  // header
  title: string;                     // modal header title composition
  clientLabel: string | null;
  dates: ShowDates | null;           // header date segments + schedule + live-now
  // section content
  venue: VenueShape | null;
  eventDetails: EventDetailsShape | null;
  clientContact: ClientContactShape | null;
  contacts: ContactRow[];
  ros: RunOfShow;
  agendaBaseline: AdminAgendaItem[];
  hotels: HotelReservationRow[];
  transportation: TransportationShape | null;
  rooms: RoomRow[];
  diagrams: DiagramsShape | null;    // renders INSIDE the rooms section (§5.2)
  crewMembers: CrewMemberRow[];
  pullSheet: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  billing: {                         // OpsBreakdown rows (step3ReviewSections.tsx:1203-1207)
    coiStatus: string | null;
    proposal: string | null;
    po: string | null;
    invoice: string | null;
    invoiceNotes: string | null;
  };
  // cross-section
  warnings: ParseWarning[];
  useRawDecisions: UseRawDecision[];
  rawUnrecognized: RawUnrecognized | null;
  sourceAnchors: SourceAnchors;      // sheet deep links (modal :1294)
  driveFileId: string | null;        // deep links + control fingerprints; staged always has it
};
```

(Type names above refer to the existing shapes at their staged sources — the plan pins exact imports; no new shapes are invented.)

**Field-by-field mapping (staged source → published source):**

| `SectionCore` field | Staged source (verified) | Published source (verified) |
| --- | --- | --- |
| `title` | `pr.show.title \|\| row.driveFileName` (`Step3ReviewModal.tsx:831`) | `shows.title` |
| `clientLabel` | `pr.show.client_label` (`:832`) | `shows.client_label` |
| `dates` | `pr.show.dates` (`:833`, sections `:3500`) | `shows.dates` |
| `venue` | `pr.show.venue` (`step3ReviewSections.tsx:3458`) | `shows.venue` |
| `eventDetails` | `pr.show.event_details` (`:3466`) | `shows.event_details` |
| `clientContact` | `pr.show.client_contact` (`:3483,:3487`) | `shows.client_contact` |
| `contacts` | `pr.contacts` (`:3488`) | `contacts` table rows (insert `runScheduledCronSync.ts:1752`) |
| `ros` | already core (`SectionData.ros`) | `shows_internal.run_of_show` |
| `agendaBaseline` | `row.adminAgendaPreview` (`Step3SheetCard.tsx:602`) | `buildAdminAgendaPreview(shows.agenda_links)` (`lib/agenda/agendaAdminPreview.ts:149`) |
| `hotels` | already core | `hotel_reservations` table rows |
| `transportation` | `pr.transportation` (`:3536`) | `transportation` table rows (insert `:1719`) |
| `rooms` | already core | `rooms` table rows |
| `diagrams` | `pr.diagrams` (`:3557,:3566`) | `shows.diagrams` |
| `crewMembers` | already core | `crew_members` table rows |
| `pullSheet` | already core | `shows.pull_sheet` (+ `pull_sheet_override` semantics unchanged) |
| `archivedPullSheetTabs` | already core | **`[]` always** — archived-tab accept/skip is a staged-time decision; published rows carry the final pull sheet only. The archived-tabs disclosure renders staged-mode only. |
| `billing.*` | `pr.show.{coi_status,proposal,po,invoice,invoice_notes}` (`OpsBreakdown`, `:3598` + `:1203-1207`) | `shows.coi_status` + `shows_internal.financials.{proposal,po,invoice,invoice_notes}` (written `lib/sync/applyParseResult.ts:48,:249`) |
| `warnings` | already core | `shows_internal.parse_warnings` |
| `useRawDecisions` | already core | `shows_internal.use_raw_decisions` |
| `rawUnrecognized` | `pr.raw_unrecognized` (modal `:1313`) | `shows_internal.raw_unrecognized` |
| `sourceAnchors` | `row.sourceAnchors ?? {}` (modal `:1294`) | `shows.source_anchors` |
| `driveFileId` | `dfid` | `shows.drive_file_id` |

**Staged-only fields (NOT in `SectionCore`):** `pr` itself, `row`, `wizardSessionId`, `dfid` (superseded by `driveFileId`), `row.agendaStateKey` (AgendaBreakdown state key `:3515` — published mode renders the static agenda variant instead, §3.5, so no state key exists there), `row.lastFinalizeFailureCode` (finalize-demotion `:838`), `row.driveFileName` (title fallback).

export type StagedSectionData = SectionCore & {
  mode: "staged";
  pr: ParseResult;
  row: Step3Row;
  dfid: string;
  wizardSessionId: string;
};

export type PublishedSectionData = SectionCore & {
  mode: "published";
  showId: string;
  slug: string;
  archived: boolean;
  published: boolean;
};

export type SectionData = StagedSectionData | PublishedSectionData;
```

Rules:

- Section panels render **content** from `SectionCore` fields only. Every current `d.pr.*`/`d.row.*` content read is enumerated in the mapping table above; the plan's extraction tasks rewire each cited site.
- **Staged-only affordances** (anything coupled to finalize/approve, wizard session ids, dirty-rescan states, `deriveStep3DisplayState`) render only when `mode === "staged"`. **Published-only affordances** (per-section warning controls §5.3, Preview As links) render only when `mode === "published"`. Mode gates are explicit discriminated-union narrowing — never optional-field sniffing.
- `driveFileId` lives in `SectionCore` (nullable — guard §11); staged mode additionally keeps `dfid: string` for wizard-session plumbing that requires non-null.

### 3.3 Data adapters

- **Staged:** unchanged — `Step3SheetCard` keeps building the staged variant from its derived values (`Step3SheetCard.tsx:16`); mechanical rename to the new type.
- **Published:** `publishedAdapter.ts` pure function `buildPublishedSectionData(input)` where input = the `shows` row, the `shows_internal` row (nullable), and the per-show rows of the per-domain tables: `crew_members`, `rooms`, `hotel_reservations`, `transportation`, `contacts`. The server page fetches (Supabase call-boundary discipline, invariant 9: destructure `{ data, error }`, typed infra errors, meta-test registry row in `tests/admin/_metaInfraContract.test.ts`) and passes plain rows; the adapter is pure and unit-testable without a DB. Column→field mapping is the §3.2 table — closed, not deferred. Missing `shows_internal` row ⇒ empty collections, never a throw (§11). The adapter reads ONLY already-persisted data — re-parsing is out of scope.
- **Read-completeness contract (child tables).** This is a verification surface — silent truncation is a correctness bug. Every per-domain child-table read (`crew_members`, `rooms`, `hotel_reservations`, `transportation`, `contacts` filtered by `show_id`) MUST **paginate until complete** via `.range()` batches (batch size a named constant); a bare unranged `.select()` is forbidden. **Deterministic pagination order:** every paginated read applies `.order("id", { ascending: true })` (unique primary key = total order) BEFORE `.range()` — unordered range pagination can duplicate or skip rows across page boundaries. Display ordering is a separate, in-adapter concern: `hotel_reservations` sorts by `ordinal` (crew-viewer precedent, `lib/data/getShowForViewer.ts:521`); the other tables get named deterministic sort keys pinned in the plan (default `(kind?, name, id)`), matching or improving the crew viewer's presentation. No render-time data loss: section render caps (`CREW_CAP`/`ROOMS_CAP`/etc., `step3ReviewSections.tsx:127-137`) continue to govern display, but rail counts and warning anchoring operate on the complete row set. The new read helper registers in `tests/admin/_metaBoundedReads.test.ts` (`READ_MODULES`); the five child tables are added to its `UNBOUNDED_TABLES` coverage; a structural check asserts `.order("id")` accompanies every `.range()` in the helper; and a fixture test crosses a page boundary (rows > batch size) proving no loss, duplication, or reorder.

### 3.3a Snapshot-consistency contract (published read)

Sync/finalize replaces the show's parent + child rows transactionally under the per-show lock (`lib/sync/applyStaged.ts:2004` — "row + crew/hotel/rooms/transport/contacts/shows_internal mutate" together). Separate read-committed queries can straddle that commit and assemble a hybrid page (new warnings anchored to old rooms). Contract:

1. The read helper captures drift markers from the initial `shows` read: `last_synced_at` + `last_seen_modified_time`.
2. After `shows_internal` + all child-table reads complete, it re-reads the two markers.
3. On drift: retry the FULL read from step 1. Max 2 retries.
4. Still drifting after retries: **fail closed for correction controls.** Render the latest attempt with the existing "we're syncing now" info-notice treatment (`--color-info-bg`; informational UI copy, no new §12.4 code) AND `snapshotStable: false` — every section-anchored mutation control (`RoleRecognizeControlBoundary`, `UseRawControlBoundary`, `DataQualityWarningControls`, `BulkIgnoreControls`) renders disabled with the syncing note. A hybrid snapshot must never accept a correction decision against mismatched warning/section context. Show-level controls that do not depend on the parse snapshot (publish toggle, share panel, re-sync, archive) remain active — re-sync is in fact the natural recovery action.

The plan verifies at extraction time that finalize bumps at least one marker in the same transaction as child replacement; if it doesn't, the plan adds the marker bump to the SAME existing transaction (no new lock surface, invariant 2 untouched). A test simulates a sync commit landing between parent and child reads and asserts the retry produces a consistent snapshot.

### 3.5 Mode-specific section rendering (agenda + diagrams)

Two section bodies are NOT read-only today and MUST fork by mode:

| Section | Staged (unchanged) | Published (new, read-only) |
| --- | --- | --- |
| Agenda | `AgendaBreakdown` POSTs to `/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]` and polls (`step3ReviewSections.tsx:2502,:2767`) | Static render of `buildAdminAgendaPreview(shows.agenda_links, { validatedHrefs: true, freshByLinkKey })` where **published `freshByLinkKey` = the set of indices whose `link.extracted` is non-null**. Rationale: `buildAdminAgendaPreview` emits an extraction block ONLY for indices in `freshByLinkKey` (`lib/agenda/agendaAdminPreview.ts:149` — the `opts.freshByLinkKey?.has(i)` gate); persisted `agenda_links` and their `extracted` payloads are written together at finalize, so persisted extraction is fresh-by-construction for the persisted link. NO extract POST, NO polling, NO wizard-session dependency. PDF links resolve through the published asset route `app/api/asset/agenda/[show]/[id]/route.ts`. Fixture test: a persisted `agenda_links` fixture with `extracted` payloads MUST render extraction blocks (not note-only rows). |
| Diagrams (rooms sub-block) | Image srcs via staged route `app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts` (`step3ReviewSections.tsx:3040-3042`) | Image srcs via the published asset route `app/api/asset/diagram/[show]/[rev]/[key]/route.ts` (the crew `Gallery` pattern, `components/diagrams/Gallery.tsx:130-144`). |

Mechanism: the section body receives a mode-derived src/href builder (or branches on the §3.2 discriminated union) — staged identifiers NEVER appear in published mode, and published mode performs ZERO requests to any `/api/admin/onboarding/*` route. A test renders every published section and asserts no onboarding-route URL is present in the tree and no fetch to `/api/admin/onboarding/*` fires.

### 3.4 What published mode shows (post-overlay truth)

Published rows are written at finalize AFTER the role-mapping overlay and use-raw overlay apply (phase 2). The consolidated page therefore always shows post-overlay state. This is a deliberate asymmetry with the wizard staging path (pre-overlay, `BL-ROLE-VOCAB-STAGING-OVERLAY`) — do not relitigate; the backlog entry stays open for the wizard.

## 4. Page shell — strip

Slim, pinned (sticky top, below `AdminPageHeader` nav), always visible while any section scrolls:

| Strip element | Content source | Behavior |
| --- | --- | --- |
| Show title | `shows.title` | text only |
| Publish state | `PublishedToggle` (`components/admin/PublishedToggle.tsx`) | existing toggle relocated |
| Live-now badge | `isShowLiveOnDate` (`lib/time/showSpan.ts:30`) | render only when live; hidden otherwise |
| Sync age | `formatRelative(shows.last_synced_at)` + `syncStatusBucket(shows.last_sync_status)` via `StatusIndicator` | existing pieces relocated |
| Alert count badge | open `admin_alerts` count for this show (existing `PerShowAlertSection` count query) | click scrolls/navigates to Overview section anchor; hidden when 0 |
| Copy link | share-link copy action (existing `ShareLinkCopyButton` within `ShareTokenProvider` context) | one-click copy; hidden when no active share token |

Strip is **display + 2 actions max** (toggle, copy). Everything else lives in Overview.

## 5. Page shell — rail sections

Rail order: **Overview**, then the parsed sections in the existing `step3Sections` registry order, then **Changes** last.

### 5.1 Overview (new rail section, first, default-active)

Relocated from the current page (import list `app/admin/show/[slug]/page.tsx:19-77`):

- `PerShowAlertSection` — alert detail + resolve.
- Share panel: `CurrentShareLinkPanel`, `ShareChip`, rotate (`RotateShareTokenButton`), `CrewPageLink` (Open Crew Page), `PickerResetControl`.
- Sheet/sync: `ReSyncButton`, `CorrectionLoopCallout` (resync mode, `page.tsx:923`), open-sheet deep link.
- Archive: `ArchiveShowButton` / `UnarchiveShowButton`.

### 5.2 Parsed sections

The content sections exactly as the live `step3Sections` registry emits them (`step3ReviewSections.tsx:3453-3598`): venue, event, crew, contacts, schedule, agenda (conditional — the registry pushes it only when its condition holds, `:3505`; same condition applies on the page), hotels, transport, rooms, packlist, billing — 11 when agenda present, 10 otherwise. **Diagrams is NOT a separate section:** it renders as a sub-block inside Rooms (`:3557-3566`); the `SectionId` union contains `"diagrams"` (`step3SectionStatus.ts:6`) but the registry does not emit it, and this spec does not change that. Plus the `warnings` fallback section for warnings with no home (`sectionForWarning` returns null ⇒ `warningsBySection` fallback bucket) — same treatment as the modal. The `report` section (`:3610`) is wizard/crew-report-scoped; in published mode it is **omitted** (default ratified — the admin has richer per-section warnings already).

### 5.3 Per-section warning controls (published mode only)

Today's flat `PerShowActionableWarnings` list dissolves. Each parsed section panel renders, under its content, its own warnings (from `warningsBySection`) with the existing per-item control components attached:

- `RoleRecognizeControlBoundary` on `UNKNOWN_ROLE_TOKEN` warnings (crew section).
- `UseRawControlBoundary` on recoverable structural-transform warnings (rooms/hotels/dates sections).
- `DataQualityWarningControls` + `BulkIgnoreControls` ignore affordances, with the existing ignored-warnings partition (`partitionByIgnored`, `loadIgnoredWarnings`) — ignored items collapse into the existing disclosure pattern per section.

Server-action write paths unchanged; only render location moves. Rail chips show per-section warning counts and `sectionStatus` tint (flagged/judgment/clean) exactly as the modal does.

### 5.4 Changes (new rail section, last)

`ChangesFeed` (`components/admin/ChangesFeed.tsx:35`) + `readShowChangeFeed` — relocated, not redesigned.

### 5.5 Crew section extras (published mode)

Per-crew-member row gains the crew-scoped **Preview As** link (existing route `app/admin/show/[slug]/preview/[crewId]/page.tsx`). Roster read cap honored (`CREW_ROSTER_READ_CAP`, `app/admin/show/[slug]/crewLinkMailto.ts`).

## 6. Modes & edge cases

| State | Behavior |
| --- | --- |
| Published + active | Full page as specified. |
| Unpublished (never published or unpublished later) | Sections render from persisted rows (data persists). Strip toggle shows Unpublished. Share panel shows its existing inactive-notice state (`page.tsx:514` decision). |
| Archived | Read-only: every mutating control disabled/hidden per the existing archived rule (`page.tsx:11` — archived ParsePanel is read-only). Strip shows archived badge; Overview shows `UnarchiveShowButton`. |
| Rescan preview | Rescan of a published show still opens the **modal shell** (staged data, approve footer) over the consolidated page — same surface at two nesting levels. Staged-vs-published distinction = modal chrome + approve footer. |
| Missing `shows_internal` row | Adapter emits empty `SectionCore` collections; page renders with empty-section handling (§11). Never a 500. |
| Show not found / not admin | Existing `notFound()` / `requireAdmin` behavior unchanged (`page.tsx:20-21`). |

## 7. Responsive behavior

- **≥ lg:** two-pane — side rail (left) + scrolling panel column; strip pinned above. Mirrors modal ≥lg layout.
- **< lg:** rail collapses to the horizontal chip rail (existing modal pattern, twin navs), rendered under the strip; sections stack vertically.
- **< sm:** same as <lg. The page NEVER uses the bottom-sheet treatment (that is modal-shell chrome only).
- Strip wraps to two rows below `sm` if needed (title+toggle / status+badges); never overflows horizontally.

## 8. Dimensional invariants

(Read with §7. Real-browser Playwright assertions required — jsdom insufficient. Tailwind v4 does not default `.flex` to `align-items: stretch`.)

1. **Two-pane row (≥ lg):** the pane container is `flex` with `items-stretch` (explicit); `rail.height === panelColumn.height` within 0.5px when rail content is shorter than panels (rail stretches or is `self-stretch` + `sticky` inner). If the rail uses `position: sticky` inner nav, the invariant applies to the rail's outer wrapper.
2. **Strip:** `strip.width === page content column width` within 0.5px; strip is `sticky top-<nav-offset>` and remains `getBoundingClientRect().top === <nav-offset>` after scrolling 2000px.
3. **Chip rail (< lg):** single-row horizontal scroll container (`overflow-x: auto`); `chipRail.scrollWidth >= chipRail.clientWidth` allowed, vertical overflow NOT allowed (`scrollHeight === clientHeight` within 1px).
4. **Modal shell unchanged:** existing modal dimensional behavior is pinned by its existing tests; extraction must not alter any measured geometry (regression suite §14.1).

Every documented `data-testid` inside these parents gets a `getBoundingClientRect()` assertion in the layout task (plan §layout-dimensions).

## 9. Transition inventory

Page-shell states: rail-active-section (A), strip-pinned (B, boolean — always true, no transition), section warning-disclosure open/closed (C), modal-shell-over-page open/closed (D), publish-toggle pending (E).

| Pair | Treatment |
| --- | --- |
| A→A′ (rail highlight moves via scroll-spy or click) | instant highlight swap — no animation (matches modal scroll-spy; deterministic) |
| C open↔closed | existing disclosure treatment of the reused components — unchanged |
| D open↔closed | modal shell's existing entrance/exit animation hooks (`[data-step3-review-scrim]`/`[data-step3-review-panel]` in `app/globals.css`) — unchanged |
| E idle↔pending↔settled | existing `PublishedToggle` treatment — unchanged |
| Compound: scroll (A changes) while D open | body scroll lock (modal chrome) prevents it — assert lock still applies when modal opens over page |
| Compound: E pending while D open | freeze contract — modal's `isPublishRunActive` prop already governs (`Step3ReviewModal.tsx:180`); page strip toggle disabled while a publish run is active, same signal |
| Compound: C mid-toggle while A changes (user clicks rail during disclosure animation) | no coupling — disclosure state is per-section-local; no animation coordination needed (instant rail swap) |

No new animations introduced by this feature; every visual transition is inherited from a relocated component or explicitly instant.

## 10. Navigation & URL

- Route stays `/admin/show/[slug]`. No new routes.
- Rail clicks update an in-page anchor hash (`#overview`, `#crew`, …) so sections are deep-linkable; strip alert badge targets `#overview`. Hash restore on load scrolls to the section (existing modal scroll-spy machinery generalizes; plan verifies feasibility — if the modal's scroll-spy is container-scoped it adapts to page scroll context).

## 11. Guard conditions

| Input | null/empty/partial behavior |
| --- | --- |
| `shows_internal` row absent | empty warnings/ros/useRawDecisions/financials; sections render their existing empty-state treatment (sentinel-hiding contracts, `tests/components/tiles/_metaSentinelHidingContract.test.ts`) |
| `shows.dates` null/partial | live-now badge hidden (`hasFullShowDates` gate, `lib/time/showSpan.ts:16`); dates section renders existing partial-data treatment |
| `driveFileId` null (published mode) | sheet deep links hidden; warning controls that need dfid render disabled state (existing `PerShowActionableWarnings` prop is already `driveFileId: string \| null`, `PerShowActionableWarnings.tsx:29`) |
| no active share token | strip copy-link hidden; Overview share panel shows inactive notice (existing) |
| `crew_members` empty | crew section empty state; Preview As list empty |
| zero warnings everywhere | rail chips show clean state; no warnings fallback section rendered (existing modal rule for empty sections) |
| `last_synced_at` null | sync age omits relative time (existing `formatRelative` null handling — verify at plan time; `showDisplay.ts:92` signature takes `iso: string \| null`) |
| alert count 0 | strip badge hidden |

## 12. Copy & error codes

No new user-visible error codes. All relocated components keep their existing §12.4-routed copy through `lib/messages/lookup.ts` (invariant 5). Strip/rail labels are static UI copy, not error copy. If implementation surfaces a genuinely new failure state, it must go through the §12.4 lockstep process — expected count of new codes: **0** (deviation requires spec amendment).

## 13. Design-mock pass (Claude Design)

Before ANY UI task executes:

1. User runs the Claude Design kickoff prompt (delivered with this spec) to produce a reference mock of: (a) consolidated page ≥lg, (b) <lg chip-rail variant, (c) strip states (live/not-live, alert/no-alert, archived).
2. Fetches are committed **verbatim** to `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page-mock/` (standing rule: commit design-mock snapshots before UI-task dispatch).
3. The mock is the visual reference for impeccable critique/audit; DESIGN.md tokens govern where the mock and tokens disagree (tokens win; log the delta).

## 14. Testing

### 14.1 Wizard regression pin (the "thin wrapper" proof)

Existing tests pass **unmodified**: `Step3ReviewModal.test.tsx`, `step3ReviewModal.transitions.test.tsx`, `Step3ReviewModalResolution.test.tsx`, `_metaStep3FreezeContract.test.ts`, `step3JudgmentChrome.test.tsx`, `step3DirtyRescan.test.tsx`, `step3ReviewSections.test.tsx`, `step3SheetCard.*` (allowed change: import paths and type names only, via a mechanical codemod commit that is separately reviewable). Any assertion change beyond mechanical renames = the extraction changed behavior = P0.

### 14.2 Published adapter unit tests

Fixture `shows` + `shows_internal` + `crew_members` rows → `SectionCore`; every §11 guard row gets a test. Anti-tautology: expected values derived from fixture fields, never hardcoded to match adapter output.

### 14.3 Page tests

- Server page: fetch error paths (invariant 9 — `{ data, error }` destructure, typed infra results, meta-test registry rows in `tests/admin/_metaInfraContract.test.ts` or inline exemption).
- Rendering: strip elements per state matrix (§6), per-section control placement (assert the control renders INSIDE its section panel — clone tree and strip siblings per anti-tautology rule), archived read-only sweep.
- Real-browser layout task: §8 invariants via Playwright `getBoundingClientRect` (harness precedent: `reference_step3_modal_realbrowser_harnesses` — tsx-subprocess static markup + pinned esbuild live bundle).
- Transition audit task: §9 table, incl. both compound rows.
- Snapshot-consistency test (§3.3a): simulate sync commit between parent and child reads; assert retry yields consistent snapshot; assert max-retry fallback renders the info notice AND disables all four section-anchored correction controls (`snapshotStable: false` fail-closed).
- Published agenda blocks test (§3.5): persisted `agenda_links` fixture with `extracted` payloads renders extraction blocks, not note-only rows.
- Pagination boundary test (§3.3): child-table fixture larger than the batch constant survives pagination without loss/duplication/reorder.
- Published no-staged-traffic test (§3.5): render all published sections; assert zero `/api/admin/onboarding/*` URLs in tree and zero fetches to those routes.

### 14.4 Plan-mandated audits (pre-implementation)

- ~~Panel-by-panel `d.pr.*`/`d.row.*` usage audit~~ — DONE at spec level; §3.2 mapping table is the closed output. The plan re-verifies each cited line still matches before extraction (cheap grep pass).
- ~~Read-path audit (rooms/hotels persistence)~~ — DONE: per-domain tables `rooms`, `hotel_reservations`, `transportation`, `contacts` (schema manifest + `runScheduledCronSync.ts:1719,:1752`).
- Scroll-spy container-scope feasibility check (§10) — remains a plan task.

### 14.5 Meta-test inventory

- EXTENDS `tests/admin/_metaInfraContract.test.ts` (the admin call-boundary registry — new published-read helper row with behavioral coverage of returned-error AND thrown-error paths). `tests/auth/_metaInfraContract.test.ts` is NOT touched (no auth helper added).
- EXTENDS `tests/admin/_metaBoundedReads.test.ts`: new helper in `READ_MODULES`; `crew_members`, `rooms`, `hotel_reservations`, `transportation`, `contacts` added to `UNBOUNDED_TABLES` coverage (§3.3 read-completeness contract — mandatory, not conditional).
- Sentinel-hiding registry (`tests/components/tiles/_metaSentinelHidingContract.test.ts`): panels move, registry paths update — no contract change.
- Mutation-surface observability (`tests/log/_metaMutationSurfaceObservability.test.ts`): **no new mutation surfaces** — controls relocate with existing actions. Any incidental new action must satisfy invariant 10 (admin surfaces: `AUDITABLE_MUTATIONS` + behavioral proof).
- Advisory locks: NOT touched (read-only adapter; write paths unchanged) — no topology change.

### 14.6 Gates

Impeccable dual-gate (critique + audit) on the UI diff (invariant 8); whole-diff Codex adversarial review; full `pnpm test` + `pnpm typecheck`-equivalent + eslint + `pnpm format:check` + `next build` before push; real CI green; help-screenshot rebaseline from the pinned Docker image (`--platform linux/amd64`) since admin show route visuals change.

## 15. Rollout

Single spec, two plan phases:

- **Phase 1 — extraction (zero visible change):** create `components/admin/review/`, split `SectionData`, extract `ShowReviewSurface`, wizard modal becomes wrapper. Ships alone; only proof is §14.1 regression suite + unchanged screenshots.
- **Phase 2 — consolidated page:** published adapter, strip, Overview/Changes sections, per-section controls, page rebuild, layout/transition tasks, screenshot rebaseline.

Both phases land in this one PR (single review arc), but commits are phase-ordered so Phase 1 is independently revertable.

## 16. Do-not-relitigate (reviewer preempts)

- **Consolidation itself, shell option B, unify-chrome:** user-ratified in-session (brainstorm 2026-07-16). Not open for redesign.
- **Post-overlay vs pre-overlay asymmetry:** §3.4; `BL-ROLE-VOCAB-STAGING-OVERLAY` (BACKLOG.md:7) stays a wizard-scoped backlog item.
- **Read-only adapter / no advisory locks:** adapter never mutates; invariant-2 surface untouched.
- **`report` section omitted in published mode:** §5.2 default, revisit only if the plan audit finds admin-relevant content.
- **Archived read-only posture:** existing rule (`app/admin/show/[slug]/page.tsx:11`), generalized not invented.
- **Zero new §12.4 codes:** §12 — deviation is a spec amendment, not a review finding.
