# Consolidated Admin Show Page — shared Step-3 review surface

**Date:** 2026-07-16
**Status:** Draft (brainstorm converged in-session; all design sections user-approved)
**Autonomy:** approved — autonomous ship through merged PR (AGENTS.md brainstorming gate, 2026-07-16)
**Design mock:** `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page-mock/` — **COMMITTED** (verbatim Claude Design snapshot + `README.md` delta notes, commit `505f7e56c`). The mock is the visual reference for Phase 2 UI tasks; its README enumerates the deltas where the spec/DESIGN.md override the mock (diagrams rail item, teal all-clear hue, truncated chip rail artifact).

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
- No DB schema changes: no new tables or columns. **Ratified amendment (R7, 2026-07-16):** ONE new **read-only** RPC `get_admin_show_review_snapshot(p_show_id uuid)` is in scope (§3.3a) — it exists solely to make the published review read a single-statement snapshot. No mutation RPCs.
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
| `agendaBaseline` | `row.adminAgendaPreview` (`Step3SheetCard.tsx:602`) | `buildAdminAgendaPreview(shows.agenda_links, { validatedHrefs: true, freshByLinkKey })` with `freshByLinkKey` = indices whose `link.extracted` is non-null (`lib/agenda/agendaAdminPreview.ts:149`; §3.5 rationale), THEN href post-map: items with a `fileId` get `/api/asset/agenda/${showId}/${fileId}` (crew pattern `components/agenda/AgendaEmbed.tsx:97`; "never as a Drive host" `:20`); url-only links keep the builder's validated external URL |
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

```ts
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
- **Published:** the server page calls the §3.3a snapshot RPC once (Supabase call-boundary discipline, invariant 9: destructure `{ data, error }`, typed infra errors, meta-test registry row in `tests/admin/_metaInfraContract.test.ts` for the `.rpc` call site), then `publishedAdapter.ts` pure function `buildPublishedSectionData(snapshot)` maps the returned jsonb payload — the `shows` row, the `shows_internal` row (nullable), and the per-show rows of `crew_members`, `rooms`, `hotel_reservations`, `transportation`, `contacts` — to `SectionCore`. The adapter is pure and unit-testable without a DB. Column→field mapping is the §3.2 table — closed, not deferred. Missing `shows_internal` row ⇒ empty collections, never a throw (§11). The adapter reads ONLY already-persisted data — re-parsing is out of scope.
- **Read-completeness & ordering.** Completeness is guaranteed by construction: the snapshot RPC aggregates every child row via `jsonb_agg` subqueries in ONE SQL statement — no PostgREST row-limit or pagination truncation class exists on this path, and no client-side `.range()` loops are needed. Determinism: every `jsonb_agg` carries an internal `ORDER BY` — `hotel_reservations` by `ordinal` (crew-viewer precedent, `lib/data/getShowForViewer.ts:521`), all others by `id` — with display ordering (default `(kind?, name, id)`) applied in the adapter, pinned per-table in the plan. Section render caps (`CREW_CAP`/`ROOMS_CAP`/etc., `step3ReviewSections.tsx:127-137`) continue to govern display, but rail counts and warning anchoring operate on the complete row set. A structural test pins that the page's published read path goes ONLY through the snapshot RPC (no direct `.from(<child table>)` builder reads in the page/helper module).

### 3.3a Snapshot-consistency contract (published read) — single-statement RPC

Sync/finalize replaces the show's parent + child rows transactionally under the per-show lock (`lib/sync/applyStaged.ts:2004`), and OTHER admin mutation surfaces touch child rows WITHOUT bumping any `shows` marker (e.g. `undo_change` deletes/re-inserts `crew_members`, `supabase/migrations/20260608000003_undo_change_rpc.sql:46,:241`). Marker-based drift detection therefore cannot prove consistency. Contract (supersedes the earlier marker/retry design — R7 ratified):

- The ENTIRE published review payload is read by ONE new **read-only** RPC, `get_admin_show_review_snapshot(p_show_id uuid) RETURNS jsonb`, whose body is a single `SELECT` producing `{ show, internal, crew_members, rooms, hotel_reservations, transportation, contacts }` via subquery `jsonb_agg`s. A single SQL statement sees one snapshot (statement-level consistency under READ COMMITTED) — a hybrid parent/child page is impossible by construction, regardless of which surface mutates concurrently. No retry machinery, no drift markers, no unstable-snapshot UI state.
- Properties: performs no writes (`STABLE`); acquires no advisory locks (invariant 2 untouched — single-holder rule has no new holder). **Grants/gating follow the existing admin-RPC pattern** (the caller is the cookie-bound publishable-key server client, `createSupabaseServerClient()` → `lib/supabase/server.ts` — NOT service-role): `SECURITY DEFINER` body that returns nothing unless `public.is_admin()` (helper at `supabase/migrations/20260501002000_rls_policies.sql:23`; raise/`null` for non-admin), `REVOKE ALL FROM public`, `GRANT EXECUTE TO authenticated, service_role`, no grant to `anon`. Test asserts a non-admin authenticated JWT gets no data.
- Migration checklist applies (validation-schema-parity): apply locally + test, `pnpm gen:schema-manifest` + commit manifest, surgical apply to the validation project — same PR.
- Tests: RPC returns complete ordered child sets (fixture larger than any single-page heuristic); missing `shows_internal` row yields null `internal` (adapter guard §11); a pgTAP-style or SQL test asserts function volatility is `STABLE` and grants match; structural test per §3.3 pins the page's read path to this RPC only.

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

### 5.3a Raw-unrecognized callout (published placement)

`RawUnrecognizedCallout` renders OUTSIDE the `step3Sections` registry in the modal (`Step3ReviewModal.tsx:1313`) — extraction must not drop it. On the consolidated page it renders as `RawUnrecognizedCallout raw={sectionData.rawUnrecognized}` at the END of the section-panel column — after the last registry section (billing) and the `warnings` fallback section, BEFORE the Changes section — mirroring the modal's bottom-of-panel posture. It has no rail entry (same as the modal). Test: non-empty `shows_internal.raw_unrecognized` fixture renders the callout on the page; empty/null renders nothing (existing callout guard).

### 5.4 Changes (new rail section, last)

`ChangesFeed` (`components/admin/ChangesFeed.tsx:35`) + `readShowChangeFeed` — relocated, not redesigned.

### 5.5 Crew section extras (published mode)

Per-crew-member row gains the crew-scoped **Preview As** link (existing route `app/admin/show/[slug]/preview/[crewId]/page.tsx`) — rendered ONLY when `show.published === true && show.archived === false`, preserving the current gate (`app/admin/show/[slug]/page.tsx:11` posture: preview/parse affordances gate on published && !archived). Unpublished or archived: no link; the row shows the existing unavailable treatment. Tests cover all three states (published, unpublished, archived). Roster read cap honored (`CREW_ROSTER_READ_CAP`, `app/admin/show/[slug]/crewLinkMailto.ts`).

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

Page-shell states: rail-active-section (A), strip-pinned (B, boolean — always true, no transition), section warning-disclosure open/closed (C), modal-shell-over-page open/closed (D), publish-toggle pending (E), Overview/Changes rail-item hover (F), Overview/Changes chip-item hover (G).

| Pair | Treatment |
| --- | --- |
| A→A′ (rail highlight moves via scroll-spy or click) | instant highlight swap — no animation (matches modal scroll-spy; deterministic) |
| C open↔closed | existing disclosure treatment of the reused components — unchanged |
| D open↔closed | modal shell's existing entrance/exit animation hooks (`[data-step3-review-scrim]`/`[data-step3-review-panel]` in `app/globals.css`) — unchanged |
| E idle↔pending↔settled | existing `PublishedToggle` treatment — unchanged |
| F rest↔hover (Overview/Changes **side-rail** item) | fast colour affordance — `transition-colors duration-fast`, identical to every registry rail item (§5 hover parity); a background colour-fade on hover, NOT a state-swap animation. The active-section highlight itself is instant (row A). |
| G rest↔hover (Overview/Changes **chip-rail** item) | fast colour affordance — `transition-colors duration-fast`, identical to every registry chip item (§5 hover parity); background colour-fade on hover, not a state-swap animation. |
| Compound: scroll (A changes) while D open | body scroll lock (modal chrome) prevents it — assert lock still applies when modal opens over page |
| Compound: E pending while D open | freeze contract — modal's `isPublishRunActive` prop already governs (`Step3ReviewModal.tsx:180`); page strip toggle disabled while a publish run is active, same signal |
| Compound: C mid-toggle while A changes (user clicks rail during disclosure animation) | no coupling — disclosure state is per-section-local; no animation coordination needed (instant rail swap) |

The only transition classes this feature introduces are the F/G rail/chip **hover** colour-fades — a hover affordance carried for parity with the existing registry rail/chip items (they add +2 to the §7.4 modal+surface `transition-colors` count, taking it 9→11). Every state-pair transition (A–E) is instant or inherited from a relocated component; no new state-swap animation is introduced.

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
| zero warnings everywhere | rail chips show clean state; the `warnings` section STILL renders with its existing affirmative empty state (`WarningsBreakdown` all-clear) — the registry always appends it, and the page follows the registry exactly (shared-surface parity; R7 ratified) |
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
- Snapshot RPC tests (§3.3a): complete ordered child sets from a large fixture; null `internal` guard; `STABLE` volatility + grant assertions; structural pin that the page's published read path uses ONLY the snapshot RPC.
- Published agenda blocks test (§3.5): persisted `agenda_links` fixture with `extracted` payloads renders extraction blocks (not note-only rows) AND every fileId-backed href is `/api/asset/agenda/<show>/<fileId>` (never a Drive host).
- Published no-staged-traffic test (§3.5): render all published sections; assert zero `/api/admin/onboarding/*` URLs in tree and zero fetches to those routes.
- Raw-unrecognized page test (§5.3a): non-empty fixture renders the callout below the last section; empty renders nothing.
- Preview As gate tests (§5.5): link present only for published && !archived; absent for unpublished and archived rows.

### 14.4 Plan-mandated audits (pre-implementation)

- ~~Panel-by-panel `d.pr.*`/`d.row.*` usage audit~~ — DONE at spec level; §3.2 mapping table is the closed output. The plan re-verifies each cited line still matches before extraction (cheap grep pass).
- ~~Read-path audit (rooms/hotels persistence)~~ — DONE: per-domain tables `rooms`, `hotel_reservations`, `transportation`, `contacts` (schema manifest + `runScheduledCronSync.ts:1719,:1752`).
- Scroll-spy container-scope feasibility check (§10) — remains a plan task.

### 14.5 Meta-test inventory

- EXTENDS `tests/admin/_metaInfraContract.test.ts` (the admin call-boundary registry — new published-read helper row with behavioral coverage of returned-error AND thrown-error paths). `tests/auth/_metaInfraContract.test.ts` is NOT touched (no auth helper added).
- `tests/admin/_metaBoundedReads.test.ts`: NOT extended — the published read path has no builder list-reads (single snapshot RPC, §3.3a); the structural read-path pin (§3.3) is the guard for this surface instead.
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

---

## Amendment — 2026-07-20 (owner-ratified): Overview is conditional; lifecycle + open-sheet relocated

Three relocations have since hollowed out the Overview rail section described in §5.1/§6:

1. **Re-sync control → StatusStrip** (modal-header-reconciliation §4.3, already ratified).
2. **Share & access cluster → the status band's ShareHub popover** (share-hub T4, already ratified).
3. **This amendment:** the standalone **open-sheet link** is deleted (it duplicated the modal header's sheet anchor, `published-show-review-sheetlink`), and the **Archive / Unarchive** controls move into the ShareHub popover's new "Show" section — the single home for the lifecycle control in both directions.

**Consequences ratified with it:**

- **Overview renders only when it has content.** What remains in the section is the attention slot plus one line of sheet/sync guidance (the correction-loop callout, or the archived Re-sync-paused notice). A healthy live show with no alerts has neither, so the section AND its rail item drop out together — a rail entry whose panel is blank is the worse half. Condition: `hasAttention || archived || hasActionableWarnings` (`PublishedReviewModal.tsx`).
- **The `#overview` deep links stay safe by construction.** The strip's alert badge and the §10 hash target only exist when there are alerts, which is exactly when the section mounts. The one case that can miss is the §6.4 `alert_id` fallback for a stale link whose alert has cleared; it now scrolls the body to top rather than dead-ending on an absent anchor.
- **The ShareHub group is unconditional in the strip.** An archived show renders no share half, but the popover is Unarchive's only home, so the hub must still mount; its primary trigger relabels from "Share link" to "Show actions" rather than degrading to a bare kebab.

**Pinned by:** `tests/components/admin/showpage/publishedReviewModal.test.tsx` (Overview drops out / returns / archived mounts it / stale-link top fallback), `tests/components/admin/showpage/shareHub.test.tsx` (Show section, archived arm), `tests/components/admin/showpage/statusStrip.test.tsx` (unconditional group), `tests/components/admin/showpage/overviewSection.test.tsx` (no lifecycle or sheet-link control in any mode).
