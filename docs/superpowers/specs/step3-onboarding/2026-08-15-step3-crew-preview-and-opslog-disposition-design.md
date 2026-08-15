# Step-3 crew-page preview + operator-log disposition — design

**Date:** 2026-08-15 · **Branch:** `feat/admin-ui-surfaces` · **Ledger:** `BL-STEP3-FULL-CREW-PREVIEW` (build), `BL-OPS-LOG-DASHBOARD-BANNER` (audit + won't-build)
**Routing:** Arm 1 is UI → Opus + impeccable dual-gate (invariant 8). Arm 2 is docs/ledger work.

## §1 Summary

Two arms, one arc:

1. **Arm 1 — staged crew-page preview.** Wizard step 3 reviews a staged parse through section cards; the crew page itself is invisible until publish. Ship an admin-only, read-only route that renders the REAL crew page (`CrewShell`) from a staged `parse_result` — no DB show row, no publish — reached by an "Open crew preview" link in the step-3 review modal. The substance is a pure `parse_result → ShowForViewer` adapter plus a non-emitting preview posture on `CrewShell`.
2. **Arm 2 — operator-log disposition.** `app_events` gets NO new admin surface. The spec carries an actionability audit showing every Doug-actionable event class already reaches an admin surface (bell alerts, per-show sync status, nav health indicator); the ledger entry is re-dispositioned WON'T BUILD with a re-open trigger, and one gap row is filed.

### §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Preview form = **link-out new tab** (option C), not a modal tab (A) or docked phone (B) | User answer 2026-08-15 via AskUserQuestion against the decision-mockup artifact (claude.ai artifact 4296d4f3, in-context renderings of all three options); carried into this spec |
| `BL-OPS-LOG-DASHBOARD-BANNER` = **audit + won't-build**; dev telemetry stays the sole `app_events` reader | User answer 2026-08-15 ("Audit + won't-build"), after user challenged the entry's premise: "sync health is already surfaced elsewhere in UI" — confirmed by probe (§3.2) |
| **Audience-actionability principle:** nothing graduates from dev-only UI unless it is actionable by the surface's audience | User statement 2026-08-15: "warnings should not graduate from dev only ui unless they are actually actionable by dev/doug" |
| Dashboard banner/panel affordances were deliberately retired TWICE (global AlertBanner → NotifBell; AppHealthPanel → nav AppHealthIndicator) | `app/admin/page.tsx:104-107` and `app/admin/page.tsx:118-123` (comment blocks recording both removals) |
| Preview shows ONE crew member at a time via a viewing-as picker; floor plans and opening reel degrade to their existing empty states | Stated in the mockup + question text the user answered; consequence of §2.4 derivability (diagrams/reel are not derivable from a staged parse) |
| Severity/window/dismissal questions (S1–S3, D1–D3) are DEAD with arm 2's won't-build | Follows from the won't-build answer; do not re-open |
| Preview route is wizard-scoped (step-3 staged rows); generalizing to the admin show-review staged modal is a NON-GOAL here | §5 non-goals; ledger entry names step 3 only |

**Convergence contract for reviews of this spec:** consequence bound — every staged parse renders a preview or a plain-language failure surface, never a raw code (invariant 5) and never a silent blank; conservative degradation to an existing empty state is a DOCUMENTED LIMIT (§6), not a finding. Threat fence — the surface defends against accidental operator error (stale link, malformed staged row), not adversarial input: the route is `requireAdmin`-gated and read-only. Probe domain — the live tree at this branch, the committed fixture corpus (`tests/fixtures/showForViewer.ts`, parser fixtures), and the validation `app_events` corpus quoted in §3.2.

## §2 Arm 1 — staged crew-page preview

### §2.0 Feasibility evidence (executable, pre-draft)

- `CrewShell` is an async Server Component consuming its projection as PROPS: `{ data: ShowForViewer, viewer, showId, rawSection, slug?, shareToken?, identityChip? }` (`app/show/[slug]/[shareToken]/_CrewShell.tsx`, component signature near line 147). It performs no projection fetch of its own.
- The existing suite renders `CrewShell` happy-path in jsdom from a hand-built `ShowForViewer` fixture with NO database — `tests/components/crew/crewShellSections.test.tsx` (fixture `makeShowForViewer` from `tests/fixtures/showForViewer.ts`; only `upsertAdminAlert` and `nowDate` are mocked).
- An admin route already renders `CrewShell` under the admin layout: `app/admin/show/[slug]/preview/[crewId]/page.tsx` (render site near line 233), with `PreviewBanner` above it. Theme/CSS carry over; the crew route's own layout adds only a wrapper div (`app/show/[slug]/layout.tsx`).
- The step-3 review UI is a client tree (`components/admin/wizard/Step3ReviewModal.tsx:1`, `components/admin/wizard/step3ReviewSections.tsx:1`, both `"use client"`), so the preview CANNOT be a directly-imported child there; a link-out route sidesteps the boundary entirely (ratified, §1.1).
- The staged parse is server-readable: `components/admin/OnboardingWizard.tsx` (Server Component) selects `staged_id, drive_file_id, staged_modified_time, parse_result, source_anchors, …` from `pending_syncs` (select list near line 380–384); `staged_id` is `uuid not null default gen_random_uuid()` (`supabase/migrations/20260501001000_internal_and_admin.sql:148`).

### §2.1 Route

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
`app/admin/wizard/preview/[stagedId]/page.tsx` — Server Component, `export const dynamic = "force-dynamic"`, `metadata.title = "Crew preview · Admin · FXAV"`.

Flow (mirrors the published admin-preview route's shape, `app/admin/show/[slug]/preview/[crewId]/page.tsx`):

1. `await requireAdmin()`.
2. `await params` → `stagedId`; `await searchParams` → `{ as?: string; s?: string }` (`as` = surrogate viewer id §2.3; `s` = raw section deep-link threaded to `rawSection` exactly as the published preview does).
3. Look up the staged row by `staged_id` with the session-bound server client (RLS engaged, defense-in-depth like `lookupShow` at `app/admin/show/[slug]/preview/[crewId]/page.tsx:71`): select `staged_id, drive_file_id, parse_result, source_anchors, staged_modified_time` from `pending_syncs` where `staged_id = <uuid>`, `maybeSingle()`. Three-way result per invariant 9: `found` / `not_found` → `notFound()` / `infra_error` → plain-language failure surface (§2.7). A non-UUID `stagedId` param short-circuits to `notFound()` before the query (Postgres would reject the cast; check with a regex first).
4. Decode `parse_result` through the existing `asParseResult` decode path (the same guard `applyRescanDecisionUnderLock` uses, `lib/onboarding/applyRescanDecisionUnderLock.ts:107-116`) — never a bare cast. **Scope honestly stated:** `asParseResult` validates top-level container shapes only and casts the rest (`lib/db/coerceJsonbObject.ts:133-189`), so NESTED fields remain untrusted after it; the adapter normalizes them to the projection's runtime grain (§2.2 guard conditions). Container-level decode failure → failure surface (§2.7). Two backstops close the generic-error-boundary path: the route wraps adapter + projection prep in try/catch (synchronous residuals), and the route segment ships its own error boundary — `error.tsx` beside the page, rendering the §2.7 decode-error copy — because a throw inside a DESCENDANT Server Component's render (e.g. `CrewShell`'s `buildRightNowContext` work) never passes through the page function's try/catch. A malformed staged row must land on §2.7 copy, never on the generic admin error boundary.
5. Build the projection: `buildStagedShowForViewer(parseResult, { driveFileId, sourceAnchors, stagedModifiedTime, checkedAt: (await nowDate()).toISOString(), requestedViewerId: as ?? null })` (§2.2–§2.3).
6. Render: `StagedPreviewBanner` (§2.5) + `CrewShell` with `data`, `viewer: { kind: "admin_preview", crewMemberId: selectedId }`, `showId: "staged-preview"`, `rawSection: s`, and the new posture prop (§2.6). No `slug`/`shareToken` (both optional today).

No advisory lock: the route mutates nothing (invariant 2 N/A — read-only surface, no lock holder added). No mutating handler, no server action: invariant 10 N/A, stated here so the meta-test discussion is pre-empted — `tests/log/_metaMutationSurfaceObservability.test.ts` discovers mutating routes only; a GET page is out of its population.

### §2.2 Adapter

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
New module `lib/data/stagedShowForViewer.ts` — one exported pure function, the arm's substance:

```ts
export function buildStagedShowForViewer(
  parse: ParseResult,
  opts: {
    driveFileId: string | null;
    sourceAnchors: Record<string, SourceAnchor>;
    // pending_syncs.staged_modified_time is Drive's file.modifiedTime for the
    // staged sheet (captured at scan: lib/sync/runOnboardingScan.ts:353-360 via
    // lib/sync/phase1.ts:558), i.e. content as of its last sheet edit.
    // Becomes the projection's lastSyncedAt (type-completeness; the crew page's
    // Footer receives asOf={null} hardcoded, _CrewShell.tsx:509, so no as-of
    // line renders from it).
    stagedModifiedTime: string | null;
    // The route's own read moment (nowDate() at request time); becomes
    // lastCheckedAt, which IS the footer's freshness driver (Footer.tsx:165-171
    // renders StaleFooter from it). A fresh value sits in StaleFooter's quiet
    // <10-minute tier (components/shared/StaleFooter.tsx:80-84) so a merely-old
    // sheet never shows a false SYNC_DELAYED_* warning. Passed in so the
    // adapter stays pure.
    checkedAt: string;
    // The raw `?as=` value, unvalidated. The adapter owns the roster, so it
    // resolves the selection itself: unknown/absent → roster index 0.
    requestedViewerId: string | null;
  },
):
  | {
      kind: "ok";
      data: ShowForViewer;
      selectedId: string;
      roster: Array<{ id: string; name: string; role: string }>;
    }
  | { kind: "empty_roster" }
  | { kind: "decode_error" } // nested data unrenderable after defensive normalization

```

**The adapter's governing rule (structural, closes the class):** the adapter reproduces, for staged data, EVERY viewer-dependent transform `readShowDataForViewer` applies between raw rows and the projection — reusing the exported helper wherever one exists, never a hand-rolled variant. The complete transform census below was swept from the projection assembly (the reads plus the post-wave block at `lib/data/getShowForViewer.ts:775-830`); a transform present there and absent here is a spec defect. Derivability, covering all 23 top-level `ShowForViewer` fields (`lib/data/getShowForViewer.ts:143-321`; `ParseResult` at `lib/parser/types.ts:527`):

| Bucket | Fields | Source / transform |
| --- | --- | --- |
| Direct | `transportation`, `contacts`, `pullSheet` | Same-named `ParseResult` fields (entries defensively filtered to object shape, guard conditions below) |
| Direct, reshaped | `show` (two strips, mirroring the live projection: `agenda_links` entries lose `fileId` and `extracted` — §2.6a: the agenda proxy authorizes against PERSISTED `agenda_links`, so inline embeds cannot work, and fileId-less entries render nothing (`components/crew/sections/ScheduleSection.tsx:143-148`) — and the four financial scalars `po`/`proposal`/`invoice`/`invoice_notes` are NULLED exactly as the live projection nulls them (`lib/data/getShowForViewer.ts:438-442`; the values are captured FIRST for the entitlement-gated `financials` field below, so a non-entitled viewer's projection carries no financial strings anywhere) · `crewMembers` (surrogate `id` + the SAME two boundary transforms the projection applies: `normalizeDateRestriction(decoded, show.dates)` at `lib/data/getShowForViewer.ts:494-497` and the stage-restriction fold `effectiveViewerDateRestriction(show.dates, show.schedule_phases, normalized, stageRestriction)` at `lib/data/getShowForViewer.ts:511-516` (helper imported from `lib/crew/stageSchedule.ts`); `role_flags` coerced to array) · `rooms` (`RoomRow` → `ProjectedRoomRow` with minted `id: "staged-room-<index>"` — `RoomRow` has no id, `lib/parser/types.ts:259`, and `ProjectedRoomRow.id` is a sort tie-break and React key, `lib/crew/resolveKeyTimes.ts:37-44`; index-minted ids are collision-free even for duplicate names like the two MABEL 1 rooms in the East Coast fixture) | `parse.show`, `parse.crewMembers`, `parse.rooms` |
| Viewer-filtered | `hotelReservations` — the projection filters for crew/admin_preview viewers (`isAdmin || viewerName === null ? allHotels : allHotels.filter(hotelVisibleToViewer(...))`, `lib/data/getShowForViewer.ts:784-787`); the adapter applies the SAME filter with the selected viewer's alias set · `runOfShow` — the projection gates days to (decoded keys) ∩ `aggregateDays(show.dates)` ∩ the ACTIVE viewer's normalized date restriction (`lib/data/getShowForViewer.ts:795-830`); the adapter applies the same gating (`parse.runOfShow ?? null` first; `RunOfShow` IS `Record<string, ScheduleDay>`, `lib/parser/types.ts:493`) | Parse fields + the selected viewer |
| Derived in-memory | `transportationOwnerIds` via the existing `resolveTransportOwners` helper (applied at `lib/data/getShowForViewer.ts:792`) with the surrogate roster · `financials?: FinancialsRow` (shape at `lib/data/getShowForViewer.ts:85`) built from the parse's `ShowRow` `po`/`proposal`/`invoice`/`invoice_notes` fields (`lib/parser/types.ts:238`), PRESENT only when the selected roster row is entitled (LEAD or FINANCIALS flag, mirroring `financialsEntitled` at `lib/data/getShowForViewer.ts:385`) | Existing helpers over parse data |
| Defaulted | `tileErrors: {}` · `lastCheckedAt` = `opts.checkedAt` — the footer's actual freshness driver (`components/layout/Footer.tsx:165-171` renders `StaleFooter` from `lastCheckedAt`; a null here with `asOf={null}` hardcoded at `_CrewShell.tsx:509` would render the false "syncing" arm at `Footer.tsx:178-182`); a route-read-moment value sits in `StaleFooter`'s quiet under-10-minute tier (`components/shared/StaleFooter.tsx:80-84`), never a false `SYNC_DELAYED_*` escalation for a merely-old sheet · `lastSyncedAt` = `opts.stagedModifiedTime` (type-completeness; not rendered by the crew page's footer) · `lastSyncStatus: null` · `diagrams: null` · `openingReelHasVideo: false` · `viewerVersionToken: "staged-preview"` (inert; its consumer, the realtime bridge, is suppressed §2.6) · `sourceAnchors`/`driveFileId` from `opts` | Constants / opts |
| Viewer-derived | `viewerId` (= the selected surrogate id), `viewerName`, `viewerNameAliases` (`[name]`, matching the current-name-only contract near `lib/data/getShowForViewer.ts:345`), `viewerFlightInfo` | The selected roster row |

Surrogate ids: `CrewMemberRow` has NO id (`lib/parser/types.ts:177-186` — `name/email/phone/role/role_flags/date_restriction/stage_restriction/flight_info`), and `resolveViewerContext` fail-closes by throwing `UnmatchedViewerError` when `viewer.crewMemberId` misses `data.crewMembers[].id` (`lib/data/viewerContext.ts` — the `c.id === viewer.crewMemberId` find in the crew/admin_preview branch). The adapter therefore mints deterministic ids `staged-crew-<index>` (roster order), resolves the requested viewer itself (unknown or absent `requestedViewerId` falls back to roster index 0 — never reaching the fail-closed throw), and returns the `roster` list plus `selectedId` so the route renders the picker and the identity line from the same source of truth. Empty roster (`parse.crewMembers.length === 0`) returns `{ kind: "empty_roster" }` and the route renders the §2.7 empty-roster surface — never a synthetic viewerless render (both viewer kinds that render crew pages require a matched row).

Guard conditions (spec-self-review rule, per input): NESTED parse fields are UNTRUSTED (`asParseResult` validates containers only, §2.1 step 4) and the adapter normalizes them to the PROJECTION'S RUNTIME GRAIN — the structural contract, not a retail field list: for every field the `ShowForViewer` type declares, the adapter's output satisfies that type at runtime, via per-field normalizers derived FROM the type (strings by `typeof` with drop-the-entry or documented default; arrays by `Array.isArray`; nested unions — restrictions, `show.dates` and its `showDays[]` elements, `runOfShow` `ScheduleDay` values, room `name`/`set_time`/`show_time`/`strike_time` — recursively). The plan carries the full normalizer table and its derivation. Named worked examples (the shapes that reach `CrewShell`'s OWN projection work before any section error wrapper — `buildRightNowContext` → `resolveKeyTimes` sorts on `room.name.trim()` and dereferences schedule-day fields, `_CrewShell.tsx:257-265`, `lib/crew/resolveKeyTimes.ts:121-169`): a room entry with `name: null` is dropped; a crew entry that is `null` or lacks a string `name` is dropped; `role_flags` via `Array.isArray(...) ? ... : []` (the projection's `?? []` at `lib/data/getShowForViewer.ts:504`); restrictions through `decodeJsonbColumn`-equivalent decode with `{ kind: "none" }` fallback (`lib/data/getShowForViewer.ts:495-497`); a `show.dates` that fails its union shape makes the adapter return `{ kind: "decode_error" }` (dates drive too much to default). The adapter never throws on malformed input — anything unrenderable is `decode_error`, and residual render-time throws are caught by the route-segment error boundary (§2.7), not by a page-body try/catch, because a thrown descendant Server Component render happens OUTSIDE any try/catch in the page function. `opts.driveFileId` null → projection `driveFileId: null` (existing `ShowForViewer` shape allows it; sheet-link affordances render their existing no-link state); `opts.sourceAnchors` `{}` → source-link affordances absent, existing behavior; `opts.stagedModifiedTime` null → footer falls to its existing null arm (accepted, documented in §6); `opts.requestedViewerId` null, empty, or unknown → adapter selects roster index 0 (never an error). Role flags (post-coerce) pass through verbatim — `financialsVisible` and the budget gate then behave exactly as the published admin-preview does (gate follows the PREVIEWED member's LEAD flag, `app/admin/show/[slug]/preview/[crewId]/page.tsx:29-31` comment, enforced inside `CrewShell`).

Placement note: `lib/data/` beside `getShowForViewer.ts`/`viewerContext.ts` — NOT a new lib/viewers directory (none exists; the arc brief's paths for this surface were stale: the step-3 section module really lives at `components/admin/wizard/step3ReviewSections.tsx`, not under an app/admin/wizard tree). Adapter-shape precedents: `buildStagedSectionData` (`components/admin/review/sectionData.ts:110`) and `buildPublishedSectionData` (`components/admin/review/publishedAdapter.ts:44`).

### §2.3 Viewing-as picker

GET-only navigation: the banner (§2.5) renders one link per roster entry (`?as=staged-crew-<i>`), current entry marked non-link. Picker links deliberately do NOT carry `?s=`: section switching inside the page is `CrewSections`' shallow `history.pushState` toggle (`components/crew/CrewSections.tsx:75-83`), invisible to a Server-Component banner, so a server-composed `s` would routinely point at the WRONG section after in-page toggling; switching viewer therefore lands on the default section (documented in §6). The `?s=` deep-link still works on ENTRY (from the step-3 modal or a pasted URL) exactly as the published preview threads it. Cap (list-growth rule): at most 12 entries rendered inline; beyond 12, the banner renders the first 11 + an overflow `<details>` disclosure listing the rest (same roster, no truncation of CONTENT — only of inline chrome). Every link ≥44px tap target (`min-h-tap-min`). Default viewer = roster index 0.

### §2.4 What a staged preview cannot show (degradations, all to EXISTING states)

| Surface | Staged behavior | Existing state it lands on |
| --- | --- | --- |
| Diagrams / floor plans | `diagrams: null` | Gear section's no-diagrams rendering (already exercised by fixtures with `diagrams: null`, e.g. the `makeShowForViewer` default) |
| Opening reel | `openingReelHasVideo: false` | Reel affordance absent — existing false-path |
| Agenda PDFs | `agenda_links` entries stripped of `fileId`/`extracted` in the adapter (§2.2) — the proxy `app/api/asset/agenda/[show]/[id]/route.ts:17-20` authorizes against a persisted show's `agenda_links`, so an embed can only 404 | The agenda area is ABSENT entirely: both the schedule section's agenda block and `AgendaEmbed` render only `fileId`-bearing entries (`components/crew/sections/ScheduleSection.tsx:143-148`, `components/agenda/AgendaEmbed.tsx:68-72`), so the strip lands on the existing no-agenda state — no proxy iframe, no failing HEAD probes (`AgendaPdfViewer.tsx:217-223` never mounts) |
| Sync freshness line | `lastCheckedAt` = route read moment (§2.2 Defaulted row) | `StaleFooter`'s quiet under-10-minute tier — truthful "just checked", never a false `SYNC_DELAYED_*` and never the "syncing" arm (`components/layout/Footer.tsx:165-182`) |
| Realtime refresh | Bridge not mounted (§2.6) | Static page; refresh = reload |
| Page-level report flow | Footer report props absent in preview posture (§2.6) | Footer renders without report affordance |
| Card-level report triggers | explicit `cardReport={null}` in preview posture (§2.6 item 5 — omission alone would hit the `DEFAULT_CARD_REPORT` parameter defaults) | Card headers render without the report trigger (each `CardReportTrigger` site simply absent) |

### §2.5 `StagedPreviewBanner`

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
New component `components/admin/StagedPreviewBanner.tsx`, patterned on `PreviewBanner` (`components/admin/PreviewBanner.tsx`, the visual template the mockup's option C showed): sticky top strip, `role="status"`, `bg-warning-bg text-warning-text` (DESIGN.md §1.1 warning tokens; body/title contrast rows pinned in §1.2), copy:

- Title: **"Previewing from the sheet (not published yet)"** (the em-dash ban on user-visible copy is why this is parenthesized, per the pre-code mechanical gate in AGENTS.md's cross-cutting list)
- Identity: "Viewing as <Name> (<Role>)" + the §2.3 picker links
- Exit affordance: "Back to setup" → `/admin` (the wizard re-renders step 3 from its own state; the modal's scroll/tab state is NOT preserved — documented limit §6)

All copy strings are enumerated in the plan and run through the mechanical checklist (em-dash ban, apostrophe literals, 44px tap targets, canonical type/token classes) BEFORE the impeccable gate.

### §2.6 `CrewShell` preview posture

New optional prop `staticPreview?: boolean` (default `false` — absent everywhere except the new route, so the two existing callers, crew page and published admin preview, are byte-identical in behavior). When `true`:

1. **No alert writes.** The `TILE_PROJECTION_FETCH_FAILED` producer (`upsertAdminAlert` call, `_CrewShell.tsx` near line 162) is skipped — adapter output has `tileErrors: {}` anyway; the skip makes the invariant structural, not incidental.
2. **No `after()` work.** The deferred `resolveAdminAlert`/`sweepTileRenderAlerts` calls (`_CrewShell.tsx` near lines 203 and 443) are skipped — they reference a persisted show id that does not exist.
3. **No realtime bridge.** `ShowRealtimeBridge` (`_CrewShell.tsx` near line 507) is not mounted — it fetches `/api/realtime/subscriber-token` and `/api/show/[slug]/version` for a show that has no row (both would fail; the bridge's null render hides the failure but the requests are noise and the token RPC would log).
4. **No page-level report affordance.** Footer report props take their absent form.
5. **No card-level report triggers.** `CrewShell` builds and threads the `cardReport` context to every section (`_CrewShell.tsx:328-423`), and `CardReportTrigger` mounts whenever its `showId` is truthy (`components/shared/CardReportTrigger.tsx:49-54`) — with the synthetic id, every trigger would mount and its POST would be rejected by `/api/report`'s UUID check (`app/api/report/route.ts:28-44`): broken controls plus emitted POSTs. Omitting the prop does NOT suppress anything: all seven sections and `CardHeaderActions` apply a `cardReport = DEFAULT_CARD_REPORT` PARAMETER default, which fires on `undefined` (`components/crew/primitives/CardHeaderActions.tsx:28`, `lib/crew/cardReportContext.ts:26`). The mechanism is therefore an EXPLICIT disabled state: widen the `cardReport` prop type to `CardReportContext | null` at the seven section components, `CardHeaderActions`, and `CardReportTrigger`; explicit `null` (distinct from `undefined`, which keeps today's default) means reporting disabled and renders no trigger; `CrewShell` passes `cardReport={null}` in preview posture. Additive and type-checked at every site; both existing callers pass a built context and are untouched.

#### §2.6a Emission census (closes the class)

The five posture items plus two data-level strips above were derived from a SWEEP, not from incident reports: every `fetch(`/`/api/`-touching module under `CrewShell`'s tree (`grep -rln "CardReportTrigger\|/api/\|fetch(" components/crew/ components/agenda/ components/shared/CardReportTrigger.tsx components/layout/Footer.tsx components/realtime/`) plus every server-side write in `_CrewShell.tsx` itself. Complete disposition table — a `CrewShell`-descendant network/write surface absent from this table is a spec defect:

| Surface | Mechanism | Disposition |
| --- | --- | --- |
| `upsertAdminAlert` write + `after()` resolve/sweep (`_CrewShell.tsx`) | server-side writes | Posture items 1–2 |
| `ShowRealtimeBridge` (subscriber token + version poll) | client fetch | Posture item 3 |
| Footer `/api/report` page-level flow | client POST | Posture item 4 |
| `CardReportTrigger` sites across all seven sections | client POST | Posture item 5 |
| `AgendaEmbed`/`AgendaPdfViewer` proxy GET/HEAD | client fetch keyed on `agenda_links[].fileId` | Data-level strip (§2.2 `show` row, §2.4) |
| `DiagramsBlock` diagram asset proxy fetches | client fetch keyed on `diagrams` | Dead by `diagrams: null` (§2.2) |
| `OpeningReelVideo` `/api/asset/reel/<showId>` (`components/crew/sections/GearSection.tsx:26-27`) | client fetch keyed on `openingReelHasVideo` | Dead by `openingReelHasVideo: false` (§2.2) |

Mode-boundary statement (spec-self-review rule): `staticPreview` gates exactly the five emissions above; the two asset families are suppressed at the DATA level in the adapter. Everything else — section registry, budget gate, section toggle, right-now derivation from `nowDate()`, empty states — is SHARED between live, published-preview, and staged-preview modes.

### Transition Inventory

The new surface introduces NO client-state transitions of its own. The chrome this spec ADDS (banner, picker, exit link) changes state only by full navigation — picker link (viewer A → viewer B), entry deep-link, Back to setup — each **instant, no animation**. Inside `CrewShell`, in-page section taps remain the EXISTING `CrewSections` client toggle (shallow `history.pushState` + its already-specced section transition, `components/crew/CrewSections.tsx:75-83`), identical in every mode; this spec adds no state to it. New pairs to enumerate: none (the added chrome has N=1 static state → 0 pairs); compound transitions: none added (a picker navigation is a fresh document, so it cannot compose with a mid-flight section toggle).

### Dimensional Invariants

None introduced. The banner is a sticky flow element (`position: sticky; top: 0`, the `PreviewBanner` recipe) stacked above `CrewShell`'s own layout in normal document flow; no fixed-height or fixed-width parent with flex/grid children is added by this spec. The plan's layout-dimensions task therefore records the verdict N/A (no fixed-dimension parent introduced) with a citation to this section, and upgrades to a real `getBoundingClientRect` assertion only if implementation gives the banner fixed dimensions.

### §2.7 Failure surfaces (invariant 5)

All admin-only, all plain-language, following the published preview's inline-copy precedent (`INFRA_ERROR_COPY` with `// not-subject:M5-D8` comment, `app/admin/show/[slug]/preview/[crewId]/page.tsx:44-49` — admin-facing copy may be inline when no §12.4 crew-facing row applies; no new §12.4 rows needed, so the three-way lockstep rule is untouched):

| Condition | Surface |
| --- | --- |
| Staged row not found / non-UUID param | `notFound()` |
| Row read infra error | "We could not load this preview." + Back to setup link (testid `staged-preview-infra-error`) |
| `parse_result` fails `asParseResult` decode, adapter returns `decode_error`, or the route's try/catch backstop catches a synchronous residual (§2.1 step 4) | Same copy, testid `staged-preview-decode-error` — never the generic admin error boundary |
| A residual throw during descendant render (past every normalizer) | Route-segment `error.tsx` (new file beside the page) rendering the same plain-language copy, testid `staged-preview-render-error` — the structural guarantee that NO failure shape reaches the generic admin error boundary |
| Empty roster | "This sheet has no crew members yet, so there is no crew page to preview." + Back to setup (testid `staged-preview-empty-roster`) |
| `CrewShell` throws `MalformedProjectionError`/`UnmatchedViewerError` | Cannot occur by construction (adapter validates `?as=` and mints matching ids) — but the route does NOT strip CrewShell's own catch arms; they stay as the backstop they already are |

### §2.8 Entry affordance

`Step3ReviewModal` footer, leading position (the mockup's option C placement): an anchor "Open crew preview" with external-tab affordance (`target="_blank" rel="noopener noreferrer"`, `text-accent-on-bg` link recipe, `min-h-tap-min`), href `/admin/wizard/preview/<stagedId>`. The modal already receives its row's staged identity through the step-3 data flow (the select near `components/admin/OnboardingWizard.tsx:380` includes `staged_id`; the plan verifies the exact prop threading — if `staged_id` is not currently threaded into the modal's props, threading it is part of the task). Rendered for every staged row regardless of warning state: previewing a warned parse is exactly the point. Keyboard/AT: it is a link, named by its text; no dialog-focus changes (the modal's focus trap already handles tab order; links inside the trap are standard).

## §3 Arm 2 — operator-log disposition (audit + won't-build)

### §3.1 Principle (ratified 2026-08-15)

A dev-only surface's content graduates to an admin surface only when the AUDIENCE of that surface can act on it. Applied here: `app_events` is the forensic run log; its Doug-actionable content must reach Doug through the alerting pipeline (which it does, §3.2), and the log itself stays dev-only.

### §3.2 Audit — Doug-actionable classes vs existing surfaces

Existing admin-visible pipeline (all verified this branch):

- **Bell alerts:** `admin_alerts` via `upsertAdminAlert` — 37-code union (`lib/adminAlerts/upsertAdminAlert.ts:3-40`) covering sync/content faults Doug acts on: `DRIVE_FETCH_FAILED`, `SHEET_UNAVAILABLE`, `PARSE_ERROR_LAST_GOOD`, `SYNC_STALLED`, `ONBOARDING_SHEET_UNREADABLE`, `OPENING_REEL_*`, `RESYNC_*`, email delivery codes, etc. Producers span the sync pipeline (`lib/sync/runScheduledCronSync.ts`, `applyStaged.ts`, `runManualSyncForShow.ts`, …) and the watch/auth surfaces.
- **Stall escalation:** persistent cron failure fires `SYNC_STALLED` through `detectAndResolveStall`, invoked by `runNotify` (`lib/notify/runNotify.ts:22`) from `app/api/cron/notify/route.ts` — so "the nightly sync keeps failing" reaches the bell without any `app_events` reader.
- **Per-show status:** dashboard `ShowsTable` sync column + per-show `StatusStrip` (DESIGN.md §1.3) carry per-show sync state; the nav `AppHealthIndicator` escalates positive → notice → degraded (DESIGN.md §1.1 `--color-status-degraded` row).

`app_events` error/warn residue (validation project, 60-day retention window, queried 2026-08-15 via the observe read-core; full counts in the probe record): `CRON_RUN_SUMMARY` warn 1,967 / error 102 (run-level summaries — single-run failures are transient by design; persistence escalates via `SYNC_STALLED` above), then single/double digits: `REALTIME_UNKNOWN_SYSTEM_EVENT` 23, null-code warns 18, `SHOW_ARCHIVED_IMMUTABLE` 12, `ADMIN_SESSION_LOOKUP_FAILED` 10, `AGENDA_EXTRACT_SESSION_GONE` 7, `ADMIN_ALERT_RESOLVE_FAILED` 3, `DEVELOPER_SESSION_LOOKUP_FAILED` 2. Source enumeration of `log.warn`/`log.error` emit codes (this branch) adds the same classes: `*_EMIT_FAILED` / `*_ALERT_WRITE_FAILED` (telemetry-about-telemetry — cannot alert via the channel whose failure they record), `*_LOOKUP_FAILED` / `*_INFRA_FAULT` / `*_READ_RETURNED_ERROR` (infra faults; the Doug-visible consequence, a degraded surface, is already rendered by the surface itself per invariant 9), and wizard/stage action failures (surfaced inline in the acting admin's UI at the moment of action, e.g. the step-3 modal's inline error note, `Step3ReviewModal.tsx` header contract).

**Classification:** every class above is dev-actionable or already paired with an admin-visible consequence at the point of impact. No Doug-actionable class lands ONLY in `app_events`. One defect found on the way, filed rather than fixed here (class-sweep disposition exception (a) — needs its own decision on desired behavior): `LogLevel` includes `"debug"` (`lib/log/types.ts:2`) but the `app_events` CHECK accepts only `('info','warn','error')` (`supabase/migrations/20260629000002_app_events.sql:4`), so a debug-level persist is CHECK-rejected and degrades to console (`lib/log/persist.ts:12-40` swallow-and-log contract) — silent by design but surprising; filed as `BL-APP-EVENTS-DEBUG-LEVEL-CHECK-MISMATCH`.

### §3.3 Ledger changes (this branch)

1. `BL-OPS-LOG-DASHBOARD-BANNER` → `BACKLOG-archive.md`, terminal state **RESOLVED — WON'T BUILD**, body: the §3.2 audit summary, the §3.1 principle, both prior banner retirements, and the **re-open trigger** (conjunctive): *a Doug-actionable event class is found landing in `app_events` with no admin_alert pairing and no point-of-impact surface — then design the surface for THAT class, not a generic log reader.*
2. File `BL-APP-EVENTS-DEBUG-LEVEL-CHECK-MISMATCH` (§3.2, probe evidence inline: the type line, the CHECK line, the swallow path).
3. In-progress markers come off both entries in the PR's last commit (invariant 12).

## §4 Acceptance criteria

- **AC-1** `buildStagedShowForViewer` returns a projection that renders every entitled section through the REAL `CrewShell` for a parser fixture with populated schedule/crew/hotels/rooms/contacts/pull-sheet — asserted via direct `CrewShell` invocation in jsdom (the `crewShellSections.test.tsx` harness pattern) with NO Supabase mock needed beyond the alert-sink spy proving zero calls. A NON-entitled viewer's rendered output contains none of the fixture's four financial strings (values derived from the fixture, per the §2.2 `show` nulling; entitled viewer sees them only via the `financials` channel).
- **AC-2** Preview posture emits nothing: with `staticPreview: true`, `upsertAdminAlert` spy records zero calls even when `tileErrors` is non-empty (defect-injection arm), no `ShowRealtimeBridge` in the tree, no `after()` work registered, no `CardReportTrigger` in any section's rendered output, and no element referencing `/api/asset/agenda/`, `/api/asset/diagram/`, or `/api/asset/reel/` anywhere in the tree.
- **AC-3** `?as=` selects the viewer, through the REAL projection transforms: an explicit `M/D`-restricted viewer (RIA-fixture shape, `fixtures/shows/exporter-xlsx/ria.md:28`) sees exactly their normalized ISO days in schedule AND run-of-show; an `ONLY***` stage-restricted viewer (Fintech-fixture shape) sees only their folded worked days; a viewer named on one hotel reservation sees only that reservation (and Right Now uses it); LEAD sees the budget section key, non-LEAD does not (entitlement pattern of `crewShellSections.test.tsx`); unknown `?as=` lands on the default viewer, not an error. Expected day/reservation sets are DERIVED from the fixture, never hardcoded.
- **AC-4** Route guards: non-UUID → 404; missing row → 404; infra error / decode failure / empty roster → their §2.7 surfaces (testids), never a raw code string in the rendered output. Nested-malformation arms: a staged row whose `parse_result` passes `asParseResult` but carries (a) `role_flags: null` on one crew entry, (b) one `null` crew element, and (c) a room entry with `name: null` renders the preview with each normalized/dropped (never the admin error boundary); a `crewMembers: "garbage"`-class container failure lands on `staged-preview-decode-error`; and a defect-injection arm proves the segment boundary — a forced descendant render throw lands on `staged-preview-render-error`, not the admin error boundary.
- **AC-5** Step-3 modal renders the "Open crew preview" link with the row's `staged_id` href, `target="_blank"`, ≥44px target.
- **AC-6** Real-browser (Playwright, seeded staged row): the route renders the banner + crew page in both themes at 390px and 1280px; picker navigation switches the identity line (landing on the default section by design, §2.3); "Back to setup" returns to `/admin`; the page emits zero requests to `/api/report`, `/api/realtime/`, or `/api/asset/` (network-request assertion).
- **AC-7** Ledger: archive entry + new BL row land per §3.3; `tests/docs/_metaLedgerInProgress.test.ts` and the archive's no-in-flight rule stay green.
- **AC-8** Both existing `CrewShell` callers behave byte-identically with the prop absent (regression: existing suites stay green untouched).

## §5 Non-goals

- No preview from the admin show-review staged modal (`PublishedReviewModal` / `ShowReviewSurface`) — same adapter would serve it later; out of scope per §1.1.
- No dashboard/bell/banner surface for `app_events` (arm 2 is the reverse decision).
- No screenshot/thumbnail of the preview inside the modal.
- No persistence of picker choice; `?as=` is the whole state.
- No new §12.4 catalog rows (admin-only copy, §2.7 precedent).
- No change to `getShowForViewer`, `viewerContext`, or either existing preview/crew route. The only shared-surface changes are additive and inert for existing callers: the `staticPreview` prop on `CrewShell` and the `CardReportContext | null` widening of the seven sections' + `CardHeaderActions`' + `CardReportTrigger`'s `cardReport` prop (§2.6 item 5 — existing callers pass a built context or rely on the unchanged `undefined` default).

## §6 Documented limits

- Staged preview shows the parse as staged NOW; it does not re-read the sheet. A sheet edited after staging previews stale until re-scan — same contract as step 3 itself.
- Diagrams, opening reel, asset-backed images cannot render from a staged parse (no persisted asset rows); they land on existing empty states (§2.4). Not a finding; re-open only with a persisted-asset design.
- "Back to setup" restores `/admin` (wizard step 3), not the modal's scroll/tab position.
- The preview's "Right now" derivation uses the real clock against staged dates — a show staged before its dates exist renders the same pre-show state the live page would.
- Surrogate ids are per-render-order; they are not stable across re-stages (a re-scan may reorder the roster). The picker always reflects the CURRENT staged roster, so a stale bookmarked `?as=` falls back to the default viewer (§2.2) — conservative, surfaced by the identity line.
- Switching viewer via the picker lands on the default section, not the section currently toggled in-page (§2.3 — in-page section state is a client-only `pushState` the server-rendered picker cannot observe).
- The agenda area is absent entirely in preview (§2.4 — the asset proxy authorizes against persisted rows, and the schedule section renders agenda affordances only for `fileId`-bearing entries, so the strip lands on the existing no-agenda state). Extracted inline agenda schedules are likewise absent until publish.
- The preview's footer freshness reads "checked moments ago" (the route read), not the sheet's edit age — `lastCheckedAt` is deliberately the read moment so `StaleFooter` cannot fire a false sync-delay warning; the sheet's own edit time is not rendered by the crew footer (its `asOf` slot is hardcoded null by `CrewShell`).

## §7 Test plan (spec level; the plan carries task-grain TDD)

Unit/jsdom: adapter derivability table (each bucket), surrogate-id determinism, empty-roster arm, AC-1/2/3/8. Route-level: AC-4 via direct page-function invocation with mocked lookup (the admin-preview route's own test pattern). Browser: AC-6 as a seeded e2e spec (registered in the e2e coverage allowlist as `UNSEEN` or wired per current batch policy — plan decides with citation to `tests/ci/_metaE2eWorkflowCoverage.test.ts`). Docs: AC-7 meta-tests already exist. Anti-tautology: AC-2's defect-injection arm (non-empty `tileErrors` with posture on) proves the suppression test can fail; AC-3 derives expected section keys from the fixture's role flags, never hardcodes.

impeccable-gate: required for arm 1 (UI surface) — dual `critique` + `audit` on the diff before adversarial review; marker line lands in the plan's closeout per invariant 8.
