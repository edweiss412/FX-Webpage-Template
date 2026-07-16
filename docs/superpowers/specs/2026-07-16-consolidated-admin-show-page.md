# Consolidated Admin Show Page — shared Step-3 review surface

**Date:** 2026-07-16
**Status:** Draft (brainstorm converged in-session; all design sections user-approved)
**Autonomy:** approved — autonomous ship through merged PR (AGENTS.md brainstorming gate, 2026-07-16)
**Design mock:** `docs/superpowers/specs/2026-07-16-consolidated-admin-show-page-mock/` — committed reference mock from the Claude Design pass (§13). UI tasks MUST NOT begin until this directory exists and is committed.

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
| Published parsed data | `shows` columns incl. `dates`, `venue`, `event_details`, `pull_sheet`, `agenda_links`, `diagrams`, `client_contact` (schema manifest); `shows_internal` columns `financials`, `parse_warnings`, `raw_unrecognized`, `run_of_show`, `use_raw_decisions` (manifest); `crew_members` rows | ✓ |
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

```ts
// sectionData.ts
export type SectionCore = {
  crewMembers: CrewMemberRow[];
  rooms: RoomRow[];
  hotels: HotelReservationRow[];
  pullSheet: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  ros: RunOfShow;
  warnings: ParseWarning[];
  agendaBaseline: AdminAgendaItem[];
  useRawDecisions: UseRawDecision[];
  // every field a section panel reads for CONTENT — exact list finalized by the
  // plan's panel-by-panel `pr.`/`row.` usage audit (§14.4)
};

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
  driveFileId: string | null;
  archived: boolean;
  published: boolean;
};

export type SectionData = StagedSectionData | PublishedSectionData;
```

Rules:

- Section panels render **content** from `SectionCore` fields only. Any panel currently reading `d.pr.*` or `d.row.*` for content gets that value lifted into `SectionCore` (plan enumerates each — the `pr` usage audit is a mandatory plan task, §14.4).
- **Staged-only affordances** (anything coupled to finalize/approve, wizard session ids, dirty-rescan states, `deriveStep3DisplayState`) render only when `mode === "staged"`. **Published-only affordances** (per-section warning controls §5.3, Preview As links) render only when `mode === "published"`. Mode gates are explicit discriminated-union narrowing — never optional-field sniffing.
- `dfid` is staged-only as a field; published mode carries `driveFileId: string | null` (nullable — guard §11).

### 3.3 Data adapters

- **Staged:** unchanged — `Step3SheetCard` keeps building the staged variant from its derived values (`Step3SheetCard.tsx:16`); mechanical rename to the new type.
- **Published:** `publishedAdapter.ts` pure function `buildPublishedSectionData(input)` where input = the `shows` row, the `shows_internal` row (nullable), and `crew_members` rows. The server page fetches (Supabase call-boundary discipline, invariant 9: destructure `{ data, error }`, typed infra errors, meta-test registry row) and passes plain rows; the adapter is pure and unit-testable without a DB.
  - `shows` → dates/venue/event/contacts/diagrams/packlist/agenda-link content (`dates`, `venue`, `event_details`, `pull_sheet`, `pull_sheet_override`, `agenda_links`, `diagrams`, `client_contact` columns).
  - `shows_internal` → `ros` (`run_of_show`), `warnings` (`parse_warnings`), `useRawDecisions` (`use_raw_decisions`), billing content (`financials`), raw-unrecognized callout (`raw_unrecognized`).
  - `crew_members` → `crewMembers`.
  - Missing `shows_internal` row ⇒ empty arrays / empty RunOfShow, never a throw (§11).
  - The exact column→`SectionCore`-field mapping (including rooms/hotels, which live inside persisted JSON payloads, not top-level columns) is finalized by the plan's read-path audit of the crew page + `Step3SheetCard` derivations. The adapter reads ONLY already-persisted data — re-parsing is out of scope.

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

The 12 content sections from `step3Sections` (venue, event, crew, contacts, schedule, agenda, hotels, transport, rooms, diagrams, packlist, billing) plus the `warnings` fallback section for warnings with no home (`sectionForWarning` returns null ⇒ `warningsBySection` fallback bucket) — same treatment as the modal. The `report` section is wizard/crew-report-scoped; in published mode it is **omitted** unless the plan's audit finds it renders admin-relevant content (default: omit — the admin has richer per-section warnings already).

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

- Server page: fetch error paths (invariant 9 — `{ data, error }` destructure, typed infra results, meta-test registry rows in `tests/auth/_metaInfraContract.test.ts` or inline exemption).
- Rendering: strip elements per state matrix (§6), per-section control placement (assert the control renders INSIDE its section panel — clone tree and strip siblings per anti-tautology rule), archived read-only sweep.
- Real-browser layout task: §8 invariants via Playwright `getBoundingClientRect` (harness precedent: `reference_step3_modal_realbrowser_harnesses` — tsx-subprocess static markup + pinned esbuild live bundle).
- Transition audit task: §9 table, incl. both compound rows.

### 14.4 Plan-mandated audits (pre-implementation)

- Panel-by-panel `d.pr.*` / `d.row.*` usage audit of `step3ReviewSections.tsx` → finalized `SectionCore` field list.
- Read-path audit: where rooms/hotels live in persisted rows (crew page + `Step3SheetCard` derivations) → adapter mapping.
- Scroll-spy container-scope feasibility check (§10).

### 14.5 Meta-test inventory

- EXTENDS `tests/auth/_metaInfraContract.test.ts` (new published-read helper registry row).
- EXTENDS bounded-reads meta-test (`_metaBoundedReads`) if the new read helper adds list reads.
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
