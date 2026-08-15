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
4. Decode `parse_result` through the existing `asParseResult` decode path (the same guard `applyRescanDecisionUnderLock` uses, `lib/onboarding/applyRescanDecisionUnderLock.ts:107-116`) — never a bare cast. Decode failure → failure surface (§2.7).
5. Build the projection: `buildStagedShowForViewer(parseResult, { driveFileId, sourceAnchors, requestedViewerId: as ?? null })` (§2.2–§2.3).
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
```

Derivability, covering all 23 top-level `ShowForViewer` fields (`lib/data/getShowForViewer.ts:143-321`; `ParseResult` at `lib/parser/types.ts:527`):

| Bucket | Fields | Source |
| --- | --- | --- |
| Direct | `show`, `hotelReservations`, `transportation`, `contacts`, `pullSheet`, `runOfShow` (`parse.runOfShow ?? null`; `RunOfShow` IS `Record<string, ScheduleDay>`, `lib/parser/types.ts:493` — same shape) | Same-named `ParseResult` fields |
| Direct, reshaped | `crewMembers` (add surrogate `id`, camel-case restrictions per the projection shape at `lib/data/getShowForViewer.ts:145`), `rooms` (`RoomRow` → `ProjectedRoomRow`) | `parse.crewMembers`, `parse.rooms` |
| Derived in-memory | `transportationOwnerIds` via the existing `resolveTransportOwners` helper (applied at `lib/data/getShowForViewer.ts:792`) with the surrogate roster · `financials?: FinancialsRow` (shape at `lib/data/getShowForViewer.ts:85`) built from the parse's `ShowRow` `po`/`proposal`/`invoice`/`invoice_notes` fields (`lib/parser/types.ts:238`), PRESENT only when the selected roster row is entitled (LEAD or FINANCIALS flag, mirroring `financialsEntitled` at `lib/data/getShowForViewer.ts:385`) | Existing helpers over parse data |
| Defaulted | `tileErrors: {}` · `lastSyncedAt: null` · `lastCheckedAt: null` · `lastSyncStatus: null` · `diagrams: null` · `openingReelHasVideo: false` · `viewerVersionToken: "staged-preview"` (inert; its consumer, the realtime bridge, is suppressed §2.6) · `sourceAnchors`/`driveFileId` from `opts` | Constants / opts |
| Viewer-derived | `viewerId` (= the selected surrogate id), `viewerName`, `viewerNameAliases` (`[name]`, matching the current-name-only contract near `lib/data/getShowForViewer.ts:345`), `viewerFlightInfo` | The selected roster row |

Surrogate ids: `CrewMemberRow` has NO id (`lib/parser/types.ts:177-186` — `name/email/phone/role/role_flags/date_restriction/stage_restriction/flight_info`), and `resolveViewerContext` fail-closes by throwing `UnmatchedViewerError` when `viewer.crewMemberId` misses `data.crewMembers[].id` (`lib/data/viewerContext.ts` — the `c.id === viewer.crewMemberId` find in the crew/admin_preview branch). The adapter therefore mints deterministic ids `staged-crew-<index>` (roster order), resolves the requested viewer itself (unknown or absent `requestedViewerId` falls back to roster index 0 — never reaching the fail-closed throw), and returns the `roster` list plus `selectedId` so the route renders the picker and the identity line from the same source of truth. Empty roster (`parse.crewMembers.length === 0`) returns `{ kind: "empty_roster" }` and the route renders the §2.7 empty-roster surface — never a synthetic viewerless render (both viewer kinds that render crew pages require a matched row).

Guard conditions (spec-self-review rule, per input): `parse` fields are trusted post-`asParseResult` (typed decode); `opts.driveFileId` null → projection `driveFileId: null` (existing `ShowForViewer` shape allows it; sheet-link affordances render their existing no-link state); `opts.sourceAnchors` `{}` → source-link affordances absent, existing behavior; `opts.requestedViewerId` null, empty, or unknown → adapter selects roster index 0 (never an error). Role flags pass through verbatim — `financialsVisible` and the budget gate then behave exactly as the published admin-preview does (gate follows the PREVIEWED member's LEAD flag, `app/admin/show/[slug]/preview/[crewId]/page.tsx:29-31` comment, enforced inside `CrewShell`).

Placement note: `lib/data/` beside `getShowForViewer.ts`/`viewerContext.ts` — NOT a new lib/viewers directory (none exists; the arc brief's paths for this surface were stale: the step-3 section module really lives at `components/admin/wizard/step3ReviewSections.tsx`, not under an app/admin/wizard tree). Adapter-shape precedents: `buildStagedSectionData` (`components/admin/review/sectionData.ts:110`) and `buildPublishedSectionData` (`components/admin/review/publishedAdapter.ts:44`).

### §2.3 Viewing-as picker

GET-only navigation: the banner (§2.5) renders one link per roster entry (`?as=staged-crew-<i>`, preserving `s`), current entry marked non-link. Cap (list-growth rule): at most 12 entries rendered inline; beyond 12, the banner renders the first 11 + an overflow `<details>` disclosure listing the rest (same roster, no truncation of CONTENT — only of inline chrome). Every link ≥44px tap target (`min-h-tap-min`). Default viewer = roster index 0.

### §2.4 What a staged preview cannot show (degradations, all to EXISTING states)

| Surface | Staged behavior | Existing state it lands on |
| --- | --- | --- |
| Diagrams / floor plans | `diagrams: null` | Gear section's no-diagrams rendering (already exercised by fixtures with `diagrams: null`, e.g. the `makeShowForViewer` default) |
| Opening reel | `openingReelHasVideo: false` | Reel affordance absent — existing false-path |
| Sync freshness line | `lastSyncedAt: null` | Existing "not yet synced" rendering |
| Realtime refresh | Bridge not mounted (§2.6) | Static page; refresh = reload |
| Report flows / share links | Footer report props absent in preview posture (§2.6) | Footer renders without report affordance |

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
2. **No `after()` work.** The deferred `resolveAdminAlert`/`sweepTileRenderAlerts` calls (`_CrewShell.tsx` near lines 203 and 445) are skipped — they reference a persisted show id that does not exist.
3. **No realtime bridge.** `ShowRealtimeBridge` (`_CrewShell.tsx` near line 507) is not mounted — it fetches `/api/realtime/subscriber-token` and `/api/show/[slug]/version` for a show that has no row (both would fail; the bridge's null render hides the failure but the requests are noise and the token RPC would log).
4. **No report affordance.** Footer report props take their absent form (the footer already branches on viewer kind / report context, `buildCardReportContext`).

Mode-boundary statement (spec-self-review rule): `staticPreview` gates exactly the four emissions above. Everything else — section registry, budget gate, section toggle, right-now derivation from `nowDate()`, empty states — is SHARED between live, published-preview, and staged-preview modes.

### Transition Inventory

The new surface is a static server render. Client-state transitions introduced by this spec: NONE. Every apparent state change is a full navigation — picker link (viewer A → viewer B), section deep-link, Back to setup — each **instant, no animation**. Inside `CrewShell`, the existing `CrewSections` client toggle keeps its own already-specced transitions unchanged in every mode; this spec adds no state to it, so there are no new pairs to enumerate (N=1 static state → 0 pairs) and no compound transitions.

### Dimensional Invariants

None introduced. The banner is a sticky flow element (`position: sticky; top: 0`, the `PreviewBanner` recipe) stacked above `CrewShell`'s own layout in normal document flow; no fixed-height or fixed-width parent with flex/grid children is added by this spec. The plan's layout-dimensions task therefore records the verdict N/A (no fixed-dimension parent introduced) with a citation to this section, and upgrades to a real `getBoundingClientRect` assertion only if implementation gives the banner fixed dimensions.

### §2.7 Failure surfaces (invariant 5)

All admin-only, all plain-language, following the published preview's inline-copy precedent (`INFRA_ERROR_COPY` with `// not-subject:M5-D8` comment, `app/admin/show/[slug]/preview/[crewId]/page.tsx:44-49` — admin-facing copy may be inline when no §12.4 crew-facing row applies; no new §12.4 rows needed, so the three-way lockstep rule is untouched):

| Condition | Surface |
| --- | --- |
| Staged row not found / non-UUID param | `notFound()` |
| Row read infra error | "We could not load this preview." + Back to setup link (testid `staged-preview-infra-error`) |
| `parse_result` fails `asParseResult` decode | Same copy, testid `staged-preview-decode-error` |
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

- **AC-1** `buildStagedShowForViewer` returns a projection that renders every entitled section through the REAL `CrewShell` for a parser fixture with populated schedule/crew/hotels/rooms/contacts/pull-sheet — asserted via direct `CrewShell` invocation in jsdom (the `crewShellSections.test.tsx` harness pattern) with NO Supabase mock needed beyond the alert-sink spy proving zero calls.
- **AC-2** Preview posture emits nothing: with `staticPreview: true`, `upsertAdminAlert` spy records zero calls even when `tileErrors` is non-empty (defect-injection arm), no `ShowRealtimeBridge` in the tree, no `after()` work registered.
- **AC-3** `?as=` selects the viewer: restrictions/aliases/budget gate follow the selected roster row (LEAD row sees budget section key; non-LEAD does not — the entitlement assertion pattern of `crewShellSections.test.tsx`); unknown `?as=` lands on the default viewer, not an error.
- **AC-4** Route guards: non-UUID → 404; missing row → 404; infra error / decode failure / empty roster → their §2.7 surfaces (testids), never a raw code string in the rendered output.
- **AC-5** Step-3 modal renders the "Open crew preview" link with the row's `staged_id` href, `target="_blank"`, ≥44px target.
- **AC-6** Real-browser (Playwright, seeded staged row): the route renders the banner + crew page in both themes at 390px and 1280px; picker navigation switches the identity line; "Back to setup" returns to `/admin`.
- **AC-7** Ledger: archive entry + new BL row land per §3.3; `tests/docs/_metaLedgerInProgress.test.ts` and the archive's no-in-flight rule stay green.
- **AC-8** Both existing `CrewShell` callers behave byte-identically with the prop absent (regression: existing suites stay green untouched).

## §5 Non-goals

- No preview from the admin show-review staged modal (`PublishedReviewModal` / `ShowReviewSurface`) — same adapter would serve it later; out of scope per §1.1.
- No dashboard/bell/banner surface for `app_events` (arm 2 is the reverse decision).
- No screenshot/thumbnail of the preview inside the modal.
- No persistence of picker choice; `?as=` is the whole state.
- No new §12.4 catalog rows (admin-only copy, §2.7 precedent).
- No change to `getShowForViewer`, `viewerContext`, or either existing preview/crew route beyond the additive `staticPreview` prop.

## §6 Documented limits

- Staged preview shows the parse as staged NOW; it does not re-read the sheet. A sheet edited after staging previews stale until re-scan — same contract as step 3 itself.
- Diagrams, opening reel, asset-backed images cannot render from a staged parse (no persisted asset rows); they land on existing empty states (§2.4). Not a finding; re-open only with a persisted-asset design.
- "Back to setup" restores `/admin` (wizard step 3), not the modal's scroll/tab position.
- The preview's "Right now" derivation uses the real clock against staged dates — a show staged before its dates exist renders the same pre-show state the live page would.
- Surrogate ids are per-render-order; they are not stable across re-stages (a re-scan may reorder the roster). The picker always reflects the CURRENT staged roster, so a stale bookmarked `?as=` falls back to the default viewer (§2.2) — conservative, surfaced by the identity line.

## §7 Test plan (spec level; the plan carries task-grain TDD)

Unit/jsdom: adapter derivability table (each bucket), surrogate-id determinism, empty-roster arm, AC-1/2/3/8. Route-level: AC-4 via direct page-function invocation with mocked lookup (the admin-preview route's own test pattern). Browser: AC-6 as a seeded e2e spec (registered in the e2e coverage allowlist as `UNSEEN` or wired per current batch policy — plan decides with citation to `tests/ci/_metaE2eWorkflowCoverage.test.ts`). Docs: AC-7 meta-tests already exist. Anti-tautology: AC-2's defect-injection arm (non-empty `tileErrors` with posture on) proves the suppression test can fail; AC-3 derives expected section keys from the fixture's role flags, never hardcodes.

impeccable-gate: required for arm 1 (UI surface) — dual `critique` + `audit` on the diff before adversarial review; marker line lands in the plan's closeout per invariant 8.
