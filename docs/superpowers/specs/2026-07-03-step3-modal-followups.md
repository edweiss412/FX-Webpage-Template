# Step-3 Review Modal Follow-ups (post-PR-#280)

**Date:** 2026-07-03 · **Status:** Draft for adversarial review · **Mode:** autonomous ship (user gates waived)

Seven user-reported follow-ups on the wizard Step-3 review modal shipped in PR #280. UI-dominant; two small API-surface additions/changes; **no DB schema change, no migrations, no advisory-lock topology change** (the one new route is read-only). The Step-3 PAGE redesign remains deferred (unchanged from PR #280 scope).

Parent spec (contracts still binding): `docs/superpowers/specs/2026-07-02-step3-review-modal-redesign.md`. Design-mock snapshot: `docs/superpowers/specs/2026-07-02-step3-review-modal-mock/` (the mock's only diagrams treatment is a one-line field row — `data.jsx:32` — so Item B's grid is additive design in the modal's established visual language, not a mock-fidelity port).

## 0. Resolved decisions (user, 2026-07-03)

1. **Nav:** fix the click-vs-scroll-spy race AND make the rail indicator slide.
2. **Diagrams:** thumbnails + folder link (feasibility-refined in §B0: a new admin-only staged-preview route replaces the "existing proxy" premise, which turned out infeasible pre-finalize).
3. **Report:** dedicated rail entry + inline form in the detail pane, through the existing `/api/report` pipeline.
4. **"Needs a look" context:** BOTH inline per-section callouts AND jump-links to the full warning entry.
5. (Unasked, single obvious answer) Unpublish button replaces the no-op checked-state CTA; rooms notes get visual separation; rescan result stops shifting the footer.

## 1. Items at a glance

| Item | Kind | Surfaces |
|---|---|---|
| A. Nav race + sliding indicator | bug + polish | `Step3ReviewModal.tsx`, `globals.css`, transitions test |
| B. Diagrams section | additive UI + new read-only API route | `step3ReviewSections.tsx`, `step3SectionStatus.ts`, new `app/api/admin/onboarding/staged-diagram/...` |
| C. Unpublish footer button (+ demoted-footer gate) | UX + correctness | `Step3ReviewModal.tsx`, `Step3SheetCard.tsx` (copy reuse) |
| D. Report-an-issue rail entry | additive UI + report API loosening | `step3ReviewSections.tsx`, `app/api/report/route.ts`, `lib/reports/submit.ts` |
| E. Flag callouts + warning jump-links | UX | `step3SectionStatus.ts`, `step3ReviewSections.tsx`, `Step3ReviewModal.tsx`, `globals.css` |
| F. Rooms notes separation | visual | `step3ReviewSections.tsx` |
| G. Rescan result overlay | bug (layout shift) | `components/admin/RescanSheetButton.tsx`, `Step3ReviewModal.tsx` |

## 2. Named constants (single source of truth — every later mention references these)

| Name | Value | Home |
|---|---|---|
| `NAV_SCROLL_SETTLE_TIMEOUT_MS` | 700 | exported from `Step3ReviewModal.tsx` |
| `NAV_SCROLL_SETTLE_EPSILON_PX` | 2 | exported from `Step3ReviewModal.tsx` |
| `INDICATOR_INSET_PX` | 12 | exported from `Step3ReviewModal.tsx` (matches the current `inset-y-3`) |
| `DIAGRAM_TILE_CAP` | 12 | exported from `step3ReviewSections.tsx` |
| `CALLOUT_MAX_ENTRIES` | 3 | exported from `step3ReviewSections.tsx` |
| `REPORT_MESSAGE_MAX_CHARS` | 2000 | exported from `step3ReviewSections.tsx` |
| `REPORT_PARSE_WARNINGS_CAP` | 50 | exported from `step3ReviewSections.tsx` |
| `WARNING_HIGHLIGHT_MS` | 1600 | exported from `Step3ReviewModal.tsx` |
| `STAGED_DIAGRAM_CACHE_SECONDS` | 300 | exported from the new route file |
| `STAGED_DIAGRAM_OBJECT_ID_MAX` | 256 | exported from the new route file |

New constants that govern interaction (not visual tokens) get one-line entries in DESIGN.md §5.5 (which already documents `SCROLL_SPY_OFFSET_PX`/drag constants, DESIGN.md:246-253): `NAV_SCROLL_SETTLE_TIMEOUT_MS`, `NAV_SCROLL_SETTLE_EPSILON_PX`, `WARNING_HIGHLIGHT_MS`.

---

## A. Sidebar nav: race fix + sliding indicator

### A1. Current behavior (verified)

- `handleNavClick(id)` (`Step3ReviewModal.tsx:171-177`) sets `active` then calls `scroller.scrollTo({ top: sectionTopFor(scroller, target) - 8 })`; smoothness comes from CSS `motion-safe:scroll-smooth` (L741), so the scroll glides while the rAF scroll-spy (L187-223) keeps re-deriving `activeSectionFor` — the indicator visibly hops across intermediate sections mid-glide.
- The active indicator is a conditionally-mounted span per rail item (`Step3ReviewModal.tsx:665-668`, classes `absolute inset-y-3 left-0 w-1 rounded-r-pill bg-accent`); transitions test T6 currently pins "indicator no-slide" (`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`).

### A2. Race fix — scroll-spy suppression during programmatic scroll

Add two refs to the modal: `spySuppressedRef: boolean` and `spyTargetTopRef: number | null`.

- On `handleNavClick(id)` (and on the Item-E jump-link path, §E4): compute `targetTop = sectionTopFor(scroller, target) - 8` (clamped to `[0, scrollHeight - clientHeight]`), set `active` to the clicked id, set `spySuppressedRef = true`, `spyTargetTopRef = clampedTargetTop`, start (restart) a `NAV_SCROLL_SETTLE_TIMEOUT_MS` timeout, then `scrollTo`. If `|scroller.scrollTop - clampedTargetTop| <= NAV_SCROLL_SETTLE_EPSILON_PX` **before** calling `scrollTo` (already there), release immediately (no scroll event will fire).
- The scroll-spy `evaluate()` (L192-216): while `spySuppressedRef` is true it does NOT call `setActive`; instead it checks release conditions and, when released, falls through to normal derivation on the same frame. Release when ANY of:
  1. **Settled:** `|scroller.scrollTop - spyTargetTopRef| <= NAV_SCROLL_SETTLE_EPSILON_PX`.
  2. **Bottom-clamped:** `scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1` (target below the max scroll position — the glide stops short of `targetTop`).
  3. **Timeout:** the `NAV_SCROLL_SETTLE_TIMEOUT_MS` fallback fired (covers zero-event and interrupted-glide cases).
  4. **User input:** a `wheel`, `touchstart`, or `pointerdown` event on the scroller (three listeners added alongside the existing scroll listener, passive) — manual interaction cancels the override instantly so the spy follows the user.
- A second nav/jump click during suppression replaces the target and restarts the timeout (no queuing).
- Cleanup: the effect's teardown clears the timeout and the three extra listeners; suppression state is refs, so unmount is safe. The clicked id stays `active` for the whole suppressed window — that is the intent (no flicker on either the desktop rail or the mobile chip rail, which share `active`).
- The pure `activeSectionFor` (exported, L85-101) is UNCHANGED.

### A3. Sliding indicator (desktop rail only)

Replace the per-item conditional span with **one** shared indicator element, first child of the rail `<nav>` (L637): `aria-hidden="true"`, absolutely positioned at `left-0`, classes `w-1 rounded-r-pill bg-accent`, positioned via inline `style` `transform: translateY(<y>px)` and `height: <h>px`.

- Measurement: a `useLayoutEffect` on `[active, sections]` reads the active rail button and the nav container via `getBoundingClientRect()` deltas plus `nav.scrollTop` (same container-relative technique as `sectionTopFor`, L110-116 — NOT `offsetTop`, consistent with parent-spec §6.3a): `y = btnRect.top - navRect.top + nav.scrollTop + INDICATOR_INSET_PX`, `h = btnRect.height - 2 * INDICATOR_INSET_PX`.
- Transition: `transition-[transform,height] duration-fast ease-out-quart motion-reduce:transition-none` (height animates on an absolutely-positioned overlay — no sibling reflow; the motion-law "don't animate layout properties" concerns in-flow layout thrash, and this element is out of flow).
- First paint: a `hasMeasuredRef` gate — the very first measurement applies position with transitions suppressed (add the transition classes only after first measure, or set them via a state flag) so the indicator does not slide in from `translateY(0)` on mount.
- Guard: active button ref missing (e.g., `sections` changed) → indicator hidden (`display: none` / null style) until next successful measure.
- The mobile chip rail is unchanged visually (race fix applies via shared `active`); no `scrollIntoView` auto-scroll is added (out of scope, §10).
- `aria-current` on rail buttons is unchanged (L657) — the indicator is decorative.

### A4. Transitions test update

T6 currently pins "indicator no-slide"; it flips to pin the slide: the shared indicator carries the `transition-[transform,height] duration-fast` classes and is `aria-hidden`; rail/chip buttons still carry only `transition-colors duration-fast`. New behavioral test: during a nav click, `active` never takes a value other than the pre-click id or the clicked id (see §9).

---

## B. Diagrams section

### B0. Feasibility (verified) — why a new route

- At step 3, `parseResult.diagrams.embeddedImages` IS populated with `EmbeddedImageStub[]` (`lib/parser/types.ts:248-265`; enrichment at scan time via `enrichWithDrivePins` — `lib/sync/runOnboardingScan.ts:950-1012`), but every `snapshotPath` is `null` — snapshot bytes are only persisted at Apply into `shows.diagrams` (`lib/sync/applyStaged.ts:505,527`), and the wizard approve path writes ONLY `pending_syncs.wizard_approved` + the manifest (`lib/sync/applyStaged.ts:1857`); **no `shows` row exists pre-finalize**.
- The existing asset route `app/api/asset/diagram/[show]/[rev]/[key]/route.ts` resolves strictly from `shows.diagrams` snapshots (L192-201) — it cannot serve staged rows. The user-selected option's "reusing the existing diagram asset proxy" premise is therefore replaced: thumbnails are served by a **new admin-only, read-only preview route** that fetches bytes fresh from Drive using the same injectable helper the snapshot pipeline uses: `snapshotFetchEmbeddedImageBytesTimed(entry, deps)` (`lib/sync/defaultSnapshotAssetsForApply.ts:39-77`) — authenticated `contentUrl` fetch with stall guard and bounded read, fail-soft `null`.
- `contentUrl` may go stale; the snapshot pipeline already relies on stored `contentUrl` working later, fail-soft (`defaultSnapshotAssetsForApply.ts` returns `null` → partial failure). The preview route adopts the same posture: `null` → 404 → the tile's `onError` placeholder.

### B1. New route: `app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts`

- **GET only.** Auth: `requireAdminIdentity` exactly as the sibling wizard route (`app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts:127-133`): non-admin → 403 `ADMIN_FORBIDDEN`, infra → 500 `ADMIN_SESSION_LOOKUP_FAILED` (existing §12.4 codes; **no new codes anywhere in this spec**). JSON error bodies are fine — the consumer is an `<img>`, whose `onError` renders the placeholder tile.
- **Row lookup:** mirror the unapprove route's guard exactly (unapprove route L80-92): select `parse_result` from `pending_syncs` where `drive_file_id = $driveFileId` AND `wizard_session_id = $wizardSessionId::uuid` AND the session is the active one per `app_settings.pending_wizard_session_id` (`pending_syncs.wizard_session_id` — migration `20260501001000_internal_and_admin.sql:150`; `app_settings.pending_wizard_session_id` — same file L243; there is NO `pending_wizard_session_id` column on `pending_syncs`). 0 rows (superseded/absent/inactive session) → 404.
- **Param validation:** `objectId` decoded via `decodeURIComponent`, must match `/^[A-Za-z0-9_-]{1,STAGED_DIAGRAM_OBJECT_ID_MAX}$/` else 400. Match against `stub.objectId` (a `string` — `lib/parser/types.ts:250`) over `parse_result.diagrams.embeddedImages`; first match wins; no match → 404.
- **Byte fetch:** stub `contentUrl` null (XLSX-media entry) → 404 without any Drive call. Otherwise `snapshotFetchEmbeddedImageBytesTimed(stub)` (no `fetchXlsxBytes` dep). Two contract details the helper imposes:
  - **Throws are NOT fail-soft in the helper** — it returns `null` only for non-ok/no-body responses and guard timeouts and RETHROWS other fetch/token/read errors (`defaultSnapshotAssetsForApply.ts:60-77`). The route wraps the call in try/catch and maps ANY throw to 404 (the fail-soft posture lives at the route boundary, not in the helper).
  - **Return type is a union** — `Promise<SnapshotAssetBytes | null>` where `SnapshotAssetBytes = Uint8Array | BoundedByteResult` (`lib/sync/snapshotAssets.ts:30`) and the contentUrl path normally returns `readBoundedWebStream`'s `{ bytes, sha256Base64Url, md5Hex }` shape (`lib/sync/boundedBytes.ts:11-15`). The route normalizes: `payload = result instanceof Uint8Array ? result : result.bytes`; `null` → 404.
- **Response:** 200 with the bytes; `Content-Type` = stub `mimeType` only if in the raster allowlist `image/png, image/jpeg, image/gif, image/webp`, else 404 (no SVG — inline-SVG XSS). Headers: `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: private, max-age=STAGED_DIAGRAM_CACHE_SECONDS`, `Content-Length`.
- **Invariants:** read-only — plan-wide invariant 2 (advisory lock) applies to mutation paths and is explicitly N/A here; DB access uses the same postgres.js pattern as the sibling onboarding routes (not supabase-js), so the `_metaInfraContract` supabase-registry is N/A — the plan declares this in its meta-test inventory, and the route carries a comment referencing this spec §B1 if any linter/meta expectation needs it.

### B2. Section registry + status

- `SectionId` union (`lib/admin/step3SectionStatus.ts:3-15`) gains `"diagrams"` (and `"report"`, §D2). `KIND_TO_SECTION` (L17-40) is UNCHANGED — the parser emits no `diagrams` blockRef kind (kinds are dynamic section names; verified none map to diagrams today); any future diagram-kind warn falls to the `warnings` bucket per the existing unmapped rule (L57). Consequence: the diagrams rail dot is always ok-tone.
- Registry (`step3ReviewSections.tsx` `step3Sections(d)`, L1621-1742): insert `{ id: "diagrams", label: "Diagrams", group: "Gear" }` **after `rooms`, before `packlist`**, included **conditionally** (like agenda, L1673-1689) only when `d.pr.diagrams != null && (d.pr.diagrams.linkedFolder != null || arr(d.pr.diagrams.embeddedImages).length > 0 || arr(d.pr.diagrams.linkedFolderItems).length > 0)` — the same shape (minus `linkedFolderItems`) as the card's `hasDiagrams` badge gate (`Step3SheetCard.tsx:370-371`), so badge-and-section presence agree whenever the badge shows. `railCount`: `embeddedImages.length + linkedFolderItems.length`, or `null` when 0 (folder-link-only).
- Registry-math test updates (`step3ReviewSections.test.tsx:237,252,267`): base defs without agenda and without diagrams = **12** (report is unconditional, §D2); +agenda = 13; +diagrams = 13; both = 14.

### B3. Section body (`DiagramsBreakdown` in `step3ReviewSections.tsx`)

- Header line: count summary (e.g. "3 embedded images · 2 folder files" — omit zero parts).
- **Thumbnail grid** (embedded images only): `grid grid-cols-3 sm:grid-cols-4 gap-2`; max `DIAGRAM_TILE_CAP` tiles, overflow → a quiet note "+N more — all images are snapshotted when the show publishes." Each tile: an `<a>` (opens the same preview URL in a new tab, `rel="noreferrer"`) wrapping `<img loading="lazy" decoding="async">` with `src=/api/admin/onboarding/staged-diagram/${wizardSessionId}/${driveFileId}/${encodeURIComponent(objectId)}`, `alt = stub.alt ?? "Diagram from " + stub.sheetTab`, classes `aspect-[4/3] w-full object-cover rounded-card border border-border bg-surface-sunken` — mirroring the crew Gallery's raw-`<img>` + `onError`-placeholder pattern (`components/diagrams/Gallery.tsx:130-144`; raw `<img>` there is deliberate — next/image drops cookies).
- **Placeholder tile** (same footprint, icon + "Preview unavailable"): rendered (a) upfront when `stub.contentUrl == null` (no fetch attempted), (b) on `<img>` `onError`.
- **Folder row:** when `linkedFolder != null`, an external-link anchor "Open diagrams folder in Drive" using `linkedFolder.driveFolderUrl` verbatim (it is the full captured clickable URL — `lib/parser/diagrams.ts:39-42`), `target="_blank" rel="noopener noreferrer"`, plus "N files" when `linkedFolderItems.length > 0`. Linked-folder items get NO thumbnails (out of scope, §10).
- Guards: `pr.diagrams` null → section not rendered (registry gate); all-empty diagrams object → not rendered; `embeddedImages` empty but folder present → folder row only, no grid. Testids: `-section-diagrams` body, `-diagram-tile-${i}`, `-diagram-folder-link`.

---

## C. Footer: Unpublish + demoted gate

### C1. Current behavior (verified)

`publishLabel` (`Step3ReviewModal.tsx:463-468`) renders "Selected to publish" when checked; `handlePublish` (L448-461) always calls `onRequestSetChecked(true)` — the checked-state click is an idempotent approve that just closes. The full uncheck path already exists: `requestSetChecked(false)` (`Step3SheetCard.tsx:298-321`) → `toggleOne` / `postPublishIntent(..., false)` → `"unapprove"` (`lib/admin/publishIntent.ts:18`) → `handleWizardStagedUnapprove` under the per-show advisory lock (`app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts`). The modal is unaware of finalize demotion: the card suppresses its checkbox when `isFinalizeDemoted = row.lastFinalizeFailureCode != null` (`Step3SheetCard.tsx:256,404`) and shows `NotPublishableNote` (L214-224), but the modal footer still offers "Publish this show" for demoted rows — an existing gap this item closes.

### C2. Behavior

Footer primary-slot state machine (non-dirty branch; the `isDirtyRescan` branch at L774-792 is unchanged and takes precedence):

| Row state | Primary slot |
|---|---|
| `isFinalizeDemoted` (new prop, §C3) | No publish/unpublish button. Render the card's `NotPublishableNote` copy (extract the component or its copy from `Step3SheetCard.tsx:214-224` into a shared export — extraction preferred; copy reused verbatim). RescanSheetButton still renders. |
| not checked | "Publish this show" — unchanged (approve → close on success). |
| checked | **"Unpublish"** button: quiet/secondary style (not accent-filled; exact treatment at design stage under impeccable), no Check icon. Pending label: "Removing…" (`aria-busy`, disabled — same mechanics as L814-815). Click → `onRequestSetChecked(false)`; resolve `true` → `publishState` back to idle and the **modal stays open** (the `checked` prop flips via the card's settlement, so the slot swaps to "Publish this show" — instant swap, matching the existing footer-swap inventory rows); resolve `false` → the existing publish-failure affordance fires (same element/copy as the current publish error path — plan cites its exact lines). |

- The settlement contract (parent spec §9.2) is untouched: `onRequestSetChecked: (next: boolean) => Promise<boolean>` (L120-132) already carries `next=false`; value-specific waiter-queue resolution applies as-is.
- The sr-only aria-live region on the card (`Step3SheetCard.tsx:523-530`) announces the settlement outcome for unpublish exactly as it does for the checkbox path (no new announcement surface).
- Guard: rapid double-click — button disabled while pending (existing mechanics). Unpublish while a rescan result overlay (§G) is visible: independent, both allowed.

### C3. Plumbing

`Step3ReviewModal` derives `isFinalizeDemoted` from data it already receives: `data.row.lastFinalizeFailureCode != null` (`Step3Row.lastFinalizeFailureCode`, `Step3Review.tsx:100`; `SectionData.row: Step3Row` — `step3ReviewSections.tsx:1580`, populated at `Step3SheetCard.tsx:567-587`). No new prop. Branch order in the footer: dirty → demoted → normal (dirty is a demotion subtype: `RESCAN_REVIEW_REQUIRED` ⇒ `lastFinalizeFailureCode != null`).

---

## D. Report-an-issue rail entry

### D1. Pipeline (verified)

`POST /api/report` (`app/api/report/route.ts`) with `surface: "admin"` authenticates via `requireAdminIdentity` (L114-124) and delegates to `submitReport` (`lib/reports/submit.ts`), which files a GitHub issue (title `Bug report: <surface>`, admin body `buildAdminIssueBody` L396-434) with idempotency (unique `reports.idempotency_key`, lease protocol), rate limiting (admin = 10/hour, `lib/reports/rateLimit.ts:54,98-99` → 429 `REPORT_RATE_LIMITED_ADMIN`, which has dougFacing copy, `lib/messages/catalog.ts:1476-1488`), and `admin_alerts` bookkeeping. The crew UI is `components/shared/ReportModal.tsx`; **no live admin caller exists today** (only a dead stub at `app/admin/dev/page.tsx:307-315`).

### D2. Rail entry + section

- `SectionId` gains `"report"` (with `"diagrams"`, §B2). Registry entry `{ id: "report", label: "Report an issue", group: "Checks" }`, **unconditional, last** (after `warnings`). `railCount: null`. The rail item renders **no status dot** — add an optional `hideDot?: true` field to the section def consumed by both navs (the only section using it). Scroll-spy includes it naturally (it's a rendered section).
- Status derivation: nothing maps to `report` (`KIND_TO_SECTION` unchanged); it can never be flagged; it is excluded from nothing else — `deriveSectionStatuses` semantics (any warn ⇒ `flaggedCount ≥ 1`, unmapped → `warnings`) are byte-identical.

### D3. Section body (`ReportIssueSection` in `step3ReviewSections.tsx`)

- Explainer line: "Spotted something wrong or missing that the checks above didn't flag? Send it to the developer."
- Form: one labeled textarea ("What's wrong or missing?"), `maxLength={REPORT_MESSAGE_MAX_CHARS}`, required (submit disabled while empty-after-trim or pending); submit button "Send report".
- Status line (`role="status" aria-live="polite"`, instant text swaps): pending "Sending…"; success "Sent — thanks. The developer will take a look." (draft cleared; no GitHub link exposed); errors render **copy, never codes, never empty** (plan-wide invariant 5). Single resolution rule for every failure: `copy = isMessageCode(code) ? messageFor(code).dougFacing : null` (`lib/messages/lookup.ts:91,95`); render `copy` only if non-null and non-empty after trim, else the component's exported generic fallback constant `REPORT_GENERIC_ERROR_COPY = "Couldn't send the report. Try again in a moment."`. This guard is load-bearing: the route can return codes whose catalog entry has `dougFacing: null` (e.g. `ADMIN_SESSION_LOOKUP_FAILED`, `lib/messages/catalog.ts:2213-2215`, reachable via `app/api/report/route.ts:114-124`) — the naked `messageFor(code).dougFacing` expression would render an empty status. Network/fetch failure maps to code `NETWORK_UNREACHABLE` and 500-with-no-code to `REPORT_PIPELINE_FAILED` before entering the same rule. Duplicate (200 `status:"duplicate"|"recovered"`) counts as success.
- Payload: `{ surface: "admin", show_id: null, showTitle: row.stagedShowTitle ?? row.driveFileName ?? null, showSlug: null, idempotency_key, message, reporterUrl: window.location.href, viewerVisibleSection: <active section id, §D3a>, userAgent: navigator.userAgent, parseWarnings: warnings.slice(0, REPORT_PARSE_WARNINGS_CAP), fieldRef: { kind: "wizard-step3", driveFileId, wizardSessionId, driveFileName: row.driveFileName ?? null, stagedShowTitle: row.stagedShowTitle ?? null } }`. Setting top-level `showTitle` (an existing `RequestBody` field, `submit.ts:24`) routes the staged title through the formatters' existing title branch, minimizing §D4's formatter changes.
- **§D3a — active-section plumbing:** `active` is `Step3ReviewModal` local state (`Step3ReviewModal.tsx:155-157`) and section bodies receive only `SectionData` (`step3ReviewSections.tsx:1577-1601`). The modal extends the existing `Step3SectionChromeContext` value (`step3ReviewSections.tsx:250`) with `getActiveSection: () => SectionId` — ref-backed (reads a ref the modal keeps in sync with `active`), so the context value stays referentially stable and section bodies don't re-render on scroll. `ReportIssueSection` calls it at submit time; outside the modal chrome context the field is omitted. The §K4 test changes the active section before submitting and asserts the submitted `viewerVisibleSection` follows it (a hardcoded `"report"` value must fail the test).
- Idempotency semantics mirror ReportModal's contract in lean form (NOT a reuse of the 700-line component; deliberate divergence): mint `crypto.randomUUID()` per attempt, persist under `sessionStorage["fxav-report-attempt-wizard-" + driveFileId]` so a retry of a failed attempt reuses the key; rotate (delete) only on terminal success (`ReportModal.tsx:110-133,327` is the reference pattern). `REPORT_HORIZON_EXPIRED` (410) → treat as terminal: rotate the key and show its dougFacing copy.
- Guards: modal unmount mid-flight → fire-and-forget (the key persists; a retry after reopen is a duplicate → success). Textarea content survives within the mount only (no draft persistence — acceptable; the section is short-form).
- Testids: `-section-report`, `-report-textarea`, `-report-submit`, `-report-status`.

### D4. API loosening (`show_id: null` for admin)

Staged wizard rows have **no** `shows.id` (§B0), and `reports.show_id` is a nullable FK (`supabase/migrations/20260501001000_internal_and_admin.sql:311`), but the route currently 400s unless `show_id` is UUIDv4 (`app/api/report/route.ts:32-40`). Changes:

- `RequestBody.show_id: string | null` (`lib/reports/submit.ts:23`).
- Route validation: `show_id` may be `null` **only when `surface === "admin"`**; when a string it must still be UUIDv4; crew path unchanged (still required — crew always has a show).
- The lease layer already tolerates null (`ReportLeaseDb`/`acquireReportLease` take `showId: string | null` — `lib/reports/leaseProtocol.ts:10`; `claimed.show_id: string | null`, `submit.ts:586`; `admin_alerts` upsert uses `coalesce(show_id::text,'')`, L645-647). The show-context lookup does NOT: `readReportShowContext(showId: string)` (`submit.ts:309`) is called unconditionally with `body.show_id` at BOTH call sites (`submit.ts:1035` expired-retry path and `submit.ts:1039` normal path). Required change: widen it to `showId: string | null` returning the existing not-found/empty-context shape immediately when null (no DB query), so both call sites pass `null` through untouched — enumerate and test both paths.
- **Formatter changes are REQUIRED (they do not exist today):** `showLine` (`submit.ts:263-270`) currently ends with `return body.show_id` — with `show_id: string | null` that is a typecheck break and, if silenced, renders `null` into issue text. Required: every `body.show_id` interpolation site handles null — `showLine` (L263-270: title/slug branches interpolate `— ${body.show_id}` only when non-null; terminal fallback when all of title/slug/show_id are null → the literal string `"staged wizard sheet (no show record)"`), `showContextLine` (L278-282, falls through to `showLine`), `issueSummaryLine` (L361-388, considers only `body.showTitle` — already fed by the §D3 payload; must not emit `null` when both are null). Because the §D3 payload sets top-level `showTitle`, the normal wizard path exercises the existing title branches; the null-null-null terminal is the hardening case. §K6 asserts no `"null"` literal in title or body for BOTH fixtures: (a) showTitle set + show_id null, (b) all three null.
- postgres.js nullable-bind discipline: pass `null` explicitly, never `undefined` (established gotcha — coalesce at the write chokepoint).
- **Tier×domain matrix: N/A** — no DDL, no CHECK, no enum, no RPC signature change; the only DB-adjacent change is passing `null` into an already-nullable column. **Flag lifecycle: N/A** — no new boolean config.

---

## E. "Needs a look" callouts + jump-links

### E1. Current behavior (verified)

Flagged sections show only tone + the "Needs a look" badge (`ModalSectionChrome`, `step3ReviewSections.tsx:282-286`); warning text renders ONLY in `WarningsBreakdown` (L1072-1176). Nothing links the two.

### E2. `warningsBySection` helper (`lib/admin/step3SectionStatus.ts`)

New export:

```ts
warningsBySection(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): ReadonlyMap<SectionId, readonly { warning: ParseWarning; index: number }[]>
```

- `index` is the warning's position in the FULL input array — it is the jump-target key (WarningsBreakdown renders `-warning-${i}` over the same array, L1102).
- Same rules as today's `deriveSectionStatuses` (L48-60): warn-severity only; mapped kind → its section when rendered, else the `warnings` bucket; unmapped → `warnings` bucket. `deriveSectionStatuses` is refactored to derive from this map (flagged = keySet, flaggedCount = size) so the two can never disagree; its exported signature and the **no-false-"All clean" contract (any warn ⇒ flaggedCount ≥ 1) are byte-identical** — existing tests in `tests/admin/step3SectionStatus.test.ts` must pass unmodified.

### E3. Inline callout

For every flagged section EXCEPT `warnings` (its body IS the warning list — a callout would be circular), the modal renders a compact callout as the first child inside the section panel card (above the body): warning tone `rounded-card border border-border-strong bg-warning-bg text-warning-text px-3 py-2 text-xs` (tokens: DESIGN.md:36-37), AlertTriangle icon, then up to `CALLOUT_MAX_ENTRIES` rows: the hardened title via `reviewWarningTitle` (L1044-1058 — all invariant-5 hardening applies transitively) + a per-row "View details" jump button. More than the cap → final line "+N more in Parse warnings" which is itself a jump button to the warnings section top. Testid `-section-${id}-flag-callout`.

Plumbing: the modal computes `warningsBySection` once (alongside the existing `deriveSectionStatuses` call) and passes the section's entries + a jump callback through `ModalSectionChrome` (new optional props; `BreakdownSection` outside the modal chrome context renders nothing new — page-context rendering is unchanged).

### E4. Jump behavior + highlight

- Jump(`index`): `setActive("warnings")`, engage the §A2 suppression (same refs/timeout), scroll the scroller so the target `li` (`-warning-${index}`, located via container-scoped query on a new `data-warning-index` attribute — **no `id` attributes**, consistent with the twin-nav id ban and container-scoped-query convention) sits at `sectionTopFor`-style container-relative top − 8px (clamped), then apply the highlight.
- Highlight: a `data-step3-warning-flash` attribute set on the `li` for `WARNING_HIGHLIGHT_MS`, then removed (timeout cleared on unmount and on a second jump — one highlight at a time). CSS in `globals.css` next to the existing `[data-step3-review-*]` block (L620-642): motion-safe → one-shot background-fade keyframe over `WARNING_HIGHLIGHT_MS`; `prefers-reduced-motion` → steady `background-color` tint (no keyframe), removed with the attribute.
- "+N more" jump targets the `warnings` section heading (plain §A2 nav-click semantics, no highlight).

---

## F. Rooms & scope: notes separation

`RoomsBreakdown` (`step3ReviewSections.tsx:740-823`): the room-detail list (`ROOM_DETAIL_FIELDS`, currently a plain `pl-7 text-xs text-text-subtle` list, L803-805) visually merges into the gear-scope grid above it. Fix: wrap the detail list in an inset container `mt-2 rounded-card bg-surface-sunken px-3 py-2` headed by an eyebrow "Room notes" (existing `EYEBROW_CLASS`); list items drop the `pl-7` indent (the container provides the offset) and use `text-text` values with `font-medium text-text-strong` labels. Constraints: **no side-stripe borders** (absolute ban), AA contrast on `bg-surface-sunken`, testid `-room-${i}-detail` stays on the `<ul>`. The gear-scope grid (L768-793) is unchanged. Exact spacing/weights may be tuned at design stage under impeccable within these constraints.

---

## G. Rescan result: no layout shift

`RescanSheetButton` (`components/admin/RescanSheetButton.tsx`) mounts its result block below the button in flow (L128-142), growing the modal footer when a result appears (footer `flex flex-wrap items-center`, `Step3ReviewModal.tsx:769-834`).

- New optional prop `resultPlacement?: "stacked" | "overlay"`, default `"stacked"` — the two card call sites (`Step3SheetCard.tsx:347,555`) keep today's markup byte-identically.
- `"overlay"`: root wrapper becomes `relative`; the result block keeps `role="status" aria-live="polite"` and its tone classes but is positioned `absolute bottom-full right-0 mb-2 z-10 w-max max-w-[min(20rem,80vw)]` with the app's card shadow — out of flow, so **footer height is constant before/during/after a result** (Playwright-asserted, §9). Entrance: fast pop-in reusing the existing `--duration-fast` pattern; `prefers-reduced-motion` → none. Exit: instant.
- Overlay results gain a dismiss button (icon X, `aria-label="Dismiss"`) since a floating layer must be closable; stacked placement is unchanged (persists until next click, L94). No auto-dismiss (it's a status message).
- The modal footer (L809) passes `resultPlacement="overlay"`. Mode boundaries: identical in sheet/popup/two-pane; on phones `max-w-[min(20rem,80vw)]` keeps it inside the viewport.

---

## H. Transition inventory (additions/changes to the parent-spec §11 table)

| # | Transition | Treatment |
|---|---|---|
| T6′ | Rail indicator item→item (any pair) | slides — `transform`+`height`, `--duration-fast` `--ease-out-quart`; `motion-reduce`: instant. REPLACES T6's "no-slide" pin. First mount: positioned without transition. |
| N1 | `active` during suppressed programmatic scroll | held constant (no intermediate values) — behavioral, tested |
| N2 | Callout presence | static with section render — no mount animation |
| N3 | Warning highlight | one-shot background fade, `WARNING_HIGHLIGHT_MS`; reduced-motion: steady tint, removed with attribute |
| N4 | Rescan overlay result appear / disappear | fast pop-in (`--duration-fast`) / instant; reduced-motion: none |
| N5 | Publish ↔ Unpublish ↔ Removing… ↔ NotPublishable slot swaps | instant (matches existing footer-swap rows) |
| N6 | Diagram tile img load / error→placeholder | browser default / instant |
| N7 | Report status idle→pending→success/error | instant text swaps in aria-live region |

Compound transitions: jump-link clicked during an in-flight nav glide → suppression target replaced, timer restarted (§A2); drag-dismiss or unmount during highlight/suppression → timers cleared in effect teardown; unpublish resolves while rescan overlay is open → independent (footer slot swaps under the overlay); report pending while modal closed → fire-and-forget with persisted idempotency key (§D3); checked flips (external settlement) while suppressed scroll in flight → footer swap is instant and does not touch nav state.

## I. Dimensional invariants

- Modal footer height with `resultPlacement="overlay"`: `footer.getBoundingClientRect().height` identical (±0.5px) before and after a rescan result renders (real-browser assertion; jsdom insufficient).
- Diagram grid: tiles never overflow the detail pane (no horizontal scroll in the scroller: `scroller.scrollWidth <= scroller.clientWidth`); tile aspect enforced by `aspect-[4/3]`.
- Rail indicator: `height = activeButton.height − 2·INDICATOR_INSET_PX`, `y` aligns to the active button (±0.5px) after any nav click settles.

## J. Accessibility

- Indicator `aria-hidden`; `aria-current` remains the programmatic active signal on BOTH navs (hidden twin inert via `display:none`, unchanged).
- Jump buttons are real `<button>`s with discernible text ("View details" + sr-only warning title suffix); highlight is supplementary (never the only affordance — the jump also moves focus? No: focus stays on the trigger; the target is announced contextually by the existing warnings-list semantics. Scroll+highlight only; this matches the existing nav-click pattern which also does not move focus).
- Report form: label wired via `htmlFor`; status `role="status" aria-live="polite"`; errors also rendered inline (not color-only).
- Unpublish: settlement announced via the card's existing sr-only live region; button has `aria-busy` while pending.
- Rescan overlay keeps `role="status" aria-live="polite"`; dismiss button labeled.
- All new interactive targets ≥ 44×44px effective hit area (parent-spec class-sweep rule).

## K. Testing contract (anti-tautology rules apply; concrete failure modes stated)

Unit/jsdom:
1. `warningsBySection` — mapped/unmapped/info-severity/index-fidelity; property: union of values' counts ≥ 1 whenever any warn exists; `deriveSectionStatuses` results byte-equal to pre-refactor across the existing test matrix (catches: refactor silently changing flag membership).
2. Registry math 12/13/13/14 (§B2) + report entry always last + `hideDot` only on report (catches: conditional-insert breaking rail order).
3. Footer state machine: checked→Unpublish label; click fires `onRequestSetChecked(false)` and does NOT close on success; failure path renders the existing error affordance; demoted rows render NotPublishableNote copy and no buttons — assertions scope to the footer element, siblings removed per anti-tautology rule (catches: unpublish wired to `true`, close-on-unpublish, demoted gap resurfacing).
4. Report form: submit posts the §D3 payload shape (assert against the mocked `fetch` body, not the DOM), including `viewerVisibleSection` following a pre-submit active-section change per §D3a; key persistence across a failed→retry sequence; rotation on success and on 410; rate-limit 429 renders `REPORT_RATE_LIMITED_ADMIN` dougFacing copy and NEVER the literal code string; a coded response whose catalog entry has `dougFacing: null` (fixture: `ADMIN_SESSION_LOOKUP_FAILED`) renders `REPORT_GENERIC_ERROR_COPY`, never an empty status (catches: raw-code leak, empty-status leak, key churn making duplicates unlinkable).
5. Report route: `show_id: null` + `surface:"admin"` → accepted; `show_id: null` + crew surface → 400; string non-UUID → 400 (catches: loosening leaking to crew).
6. `submitReport` with null show: issue title/body contain the fieldRef fallbacks and no `"null"` literal (derive expectations from the fixture's fieldRef, not hardcoded strings).
7. Staged-diagram route: unauth 403; superseded session 404; unknown objectId 404; null-contentUrl stub 404 with zero Drive calls (spy); happy path returns bytes + exact header set with the helper stubbed to return the realistic `BoundedByteResult` wrapped shape `{ bytes, sha256Base64Url, md5Hex }` (NOT a raw `Uint8Array` fixture — catches un-normalized union handling); helper returning raw `Uint8Array` also served; helper THROWING → 404 not 500; non-allowlisted mime 404 (catches: SVG passthrough, session-guard bypass, 500s for stale Drive fetches).
8. Diagrams body: cap at `DIAGRAM_TILE_CAP` with "+N more" note derived from fixture length (fixture must exceed the cap); null-contentUrl tile renders placeholder without an `<img src>` fetch; folder-only renders link and no grid.
9. Callouts: flagged section renders ≤ `CALLOUT_MAX_ENTRIES` titles + overflow line; `warnings` section renders NO callout; titles come through `reviewWarningTitle` (fixture includes a token-shaped message → generic fallback asserted).
10. Transitions audit update: T6′ pin flip + N1-N7 rows (extend `step3ReviewModal.transitions.test.tsx`).

Real-browser (extend the two existing standalone-config specs + harnesses; `tests/e2e/_step3ReviewModalHarness.tsx` / `_step3ReviewModalLiveEntry.tsx`):
11. Nav race: click a far section; sample `aria-current` on rail buttons every frame until settle; assert the set of observed active ids ⊆ {pre-click id, clicked id} (catches: the reported flicker). Then wheel mid-glide → spy resumes (active changes with scroll).
12. Indicator: after click+settle, indicator `getBoundingClientRect()` aligns to the active button per §I (±0.5px); computed `transition-property` contains `transform`.
13. Jump-link: click a callout "View details" → scroller lands with the target warning row in view + `data-step3-warning-flash` present, gone after `WARNING_HIGHLIGHT_MS` (+slack).
14. Footer no-shift: stub `fetch` in the live entry; click Re-scan; assert footer heights equal per §I and the overlay is visible; dismiss works.
15. Layout: diagrams grid no-horizontal-scroll assertion per §I (fixture with > cap images).

Meta-tests: no new supabase-js call sites (staged-diagram route is postgres.js → declared N/A in plan's meta-test inventory); no new `.toLowerCase()`/`.trim()` in `lib/drive`/`lib/sync`; no §12.4 catalog edits (x1 unaffected). Full suite + `pnpm typecheck` + `pnpm format:check` before push.

## L. Mock deviations & design-stage latitude

The mock has no diagrams grid, report form, unpublish button, callouts, notes inset, or overlay — all additive, designed in the modal's established language (tokens, radii, tone system) under impeccable v3 (critique + audit on the affected diff, invariant 8). Fixed by this spec: placement, structure, copy, testids, constants, transitions. Free at design stage: exact spacing/weights/iconography within the stated constraints (notably: no side-stripes, no gradient text, AA contrast).

## M. Out of scope (deferred, not silently dropped)

- Step-3 PAGE redesign (unchanged deferral from PR #280).
- Mobile chip-rail auto-scroll-into-view of the active chip.
- Diagram lightbox/zoom; linked-folder item thumbnails; crew Gallery changes.
- Draft persistence for the report textarea; report attachments.
- Post-finalize wizard rows serving snapshot-backed diagram bytes (the preview route always live-fetches; unifying with the snapshot route is future work).
- Card call sites keeping `stacked` rescan results (only the modal footer had the reported shift).

## N. Do-not-relitigate (with precedent)

- Settlement waiter-queue contract and `PublishCheckbox` purely-controlled design — parent spec §9.2 (ratified through 12 rounds + whole-diff APPROVE).
- Warning-title hardening rules — parent spec §8 / `reviewWarningTitle` (L1044-1058).
- Twin-nav rules (both in JSX, no ids inside navs, container-scoped queries) — parent spec §9.4.
- `motion-safe:scroll-smooth` CSS-driven smooth scroll (not JS behavior option) — parent spec §6.3a.
- Raw `<img>` (not next/image) for diagram assets — `Gallery.tsx:108-128` documented revert (cookies not forwarded).
- Fail-soft null-byte posture of `snapshotFetchEmbeddedImageBytesTimed` — `defaultSnapshotAssetsForApply.ts:33-40` (DXT-2).
- Admin reports rate limit 10/hour and lease/idempotency protocol — `lib/reports/rateLimit.ts`, `submit.ts` (shipped surface).
- No new §12.4 codes in this batch — reuse of existing REPORT_*/ADMIN_* codes is deliberate (avoids the 3-way lockstep + 4 CI touchpoints for zero copy benefit).

## O. Numeric sweep anchor

700 / 2 / 12 / 12 / 3 / 2000 / 50 / 1600 / 300 / 256 appear ONLY via the §2 table names. Registry counts: 12 base, 13 (+agenda), 13 (+diagrams), 14 (both). Admin report quota 10/hour (cited, not chosen here). Callout cap 3; tile cap 12; warnings-payload cap 50.
