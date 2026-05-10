# Handoff — M6: Drive sync (cron + push) + admin parse panel

**Handed off:** 2026-05-08 by Eric Weiss
**Implementer:** **split-mode (manual / Level 1)** — backend = **GPT-5.5 / Codex CLI**, UI = **Opus 4.7 / Claude Code**, two concurrent terminals coordinating through this doc. Per `ROUTING.md` M6 row + UI hard rule. Backend goes first because the §A engine pins every type and route signature §B's parse-panel UI consumes.
**Adversarial reviewer:** Opus 4.7 / Claude Code (per ROUTING.md M6 row — backend is the larger surface, so the cross-model partner is Opus).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/06-drive-sync.md` (Tasks 6.1–6.13; AC-6.1..6.27).

---

## 0. Implementer split (manual / Level 1)

This is the second split-mode milestone (M5 was the first). The two task lists below are **disjoint by file path**; neither implementer commits files outside their list without an explicit handoff note in this doc. Coordination protocol mirrors M5 §0:

- **Backend session ships first.** All §A files land before §B starts. The UI session imports concrete signatures, not stubs.
- **Both sessions commit per task** per AGENTS.md §1.6 (one task per commit, conventional-commits format `<type>(<scope>): <summary>`).
- **Both sessions append to this handoff's Convergence log** during adversarial review. Don't rebase or squash each other's commits.
- **§B is allowed to land helpers under `lib/` only when the helper is a UI-side concern** (e.g., a small client-side fetcher that calls §A's apply/discard routes). All sync engine modules under `lib/sync/**` and Drive modules under `lib/drive/**` are §A territory.

### §A — Codex / backend tasks (ship first; UI consumes these contracts)

Files Codex creates / modifies (all under `lib/`, `app/api/`, `vercel.json`, or `supabase/migrations/`):

- **Task 6.1** — `lib/drive/client.ts` + `tests/drive/client.test.ts`. Service-account auth.
- **Task 6.2** — `lib/drive/list.ts`, `lib/drive/fetch.ts` + mocked tests. `files.list` (folder-scoped, paginated) / `files.get` / `files.export` wrappers + `UNEXPECTED_PARENT` warning. **`[PIN-STOP 1]`** — Codex pauses here and reports per §0 Pin-stop sequence subsection.
- **Task 6.3** — `lib/sync/perFileProcessor.ts` + `tests/sync/perFileProcessor.test.ts`. Gating phase only (deferral check + watermark gate + sheet-unavailable recovery + partial-failure routing). Returns `{ outcome: 'skip', reason } | { outcome: 'proceed', mode }`.
- **Task 6.4** — `lib/sync/phase1.ts` + `tests/sync/phase1.test.ts`. Invariant gate (MI-1..MI-5b hard-fail, then MI-6..MI-14 stage-vs-pass) + first-seen / onboarding-scan routing precedence. Accepts external `LockedShowTx<Tx>`; never acquires its own lock.
- **Task 6.5** — `lib/sync/phase2.ts`, `lib/sync/applyParseResult.ts` + `tests/sync/phase2.test.ts`. Destructive snapshot replacement; monotonic guards by mode (`<` cron/push, `<=` manual/recovery); auth side-effects.
- **Task 6.6** — `lib/sync/runScheduledCronSync.ts`, `lib/sync/lockedShowTx.ts` (`withShowLock` + branded `LockedShowTx<T>` + DEV `assertShowLockHeld`), `app/api/cron/sync/route.ts`, `app/api/cron/keepalive/route.ts`, `vercel.json` cron schedules. Single-transaction lock contract + same-revision binding capture/re-verify + `processOneFile` / `processOneFile_unlocked` lock-owner split. **`[PIN-STOP 2 — Codex stops here and reports]`**
- **Task 6.7** — `lib/sync/runManualSyncForShow.ts`, `app/api/admin/sync/[slug]/route.ts`. Both `runManualSyncForShow` (locked outer wrapper) and `runManualSyncForShow_unlocked` (lock-free inner body taking `LockedShowTx<Tx>`). FINALIZE_OWNED_SHOW two-arm guard. Imports `lib/db/advisoryLock.ts` from M5.
- **Task 6.8** — `lib/sync/runOnboardingScan.ts` + `tests/sync/onboarding.test.ts`. Wizard-session CAS + `WIZARD_ISOLATION_INDEXES_MISSING` schema-state probe + `LIVE_ROW_CONFLICT` SQLSTATE handling. Includes the partial-index migration (`pending_syncs` + `pending_ingestions` `(drive_file_id) WHERE wizard_session_id IS NULL` + `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL` split) per Task 2.2 amendment.
- **Task 6.9** — `lib/drive/watch.ts`, `app/api/cron/refresh-watch/route.ts`, `app/api/cron/gc-watch/route.ts`. Two-phase outbox + `pending → active` / `pending → orphaned` / `superseded → stopped` / `orphaned → stopped` transitions. Canonical alert code is `WATCH_CHANNEL_ORPHANED` (NOT `WATCH_CHANNEL_CREATE_FAILED`).
- **Task 6.10** — `app/api/drive/webhook/route.ts`, `lib/sync/runPushSyncForShow.ts` + `tests/drive/webhook.test.ts`. §5.5.3 8-step verification + dispatch via shared `processOneFile` helper with `mode = 'push'`.
- **Task 6.11 §A portion** — `app/api/admin/staged/[fileId]/apply/route.ts`, `lib/sync/applyStaged.ts` + `tests/sync/applyStaged.test.ts`. Source-scoped selector contract; live-scope vs wizard-scope Apply split (live runs Phase 2; wizard is Phase-1-only approval); auth side-effects per §6.8.2 derivation table; asset-review item Apply-time effects (DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE / NONE_FOUND / LINKED_FOLDER_DRIFT_PENDING / REEL_DRIFT_PENDING).
- **Task 6.12 §A portion** — `app/api/admin/staged/[fileId]/discard/route.ts`. Source-scoped DELETE + `staged_id` CAS + `WIZARD_SESSION_SUPERSEDED` + three first-seen variants (try-again / defer-until-modified / permanent-ignore) + new §12.4 entry `STALE_DISCARD_REJECTED`.
- **Task 6.13 §A portion** — backend half of demo verification (cron + push end-to-end via curl).
- **`lib/messages/catalog.ts`** — EXTEND with M6 sync codes: `STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `STALE_MANUAL_REPLAY_ABORTED`, `CONCURRENT_SYNC_SKIPPED`, `STAGED_PARSE_REVISION_RACE`, `STAGED_PARSE_REVISION_RACE_COOLDOWN`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `STAGED_PARSE_SOURCE_GONE`, `STAGED_PARSE_OUTDATED`, `STAGED_PARSE_RESTAGED_INLINE`, `STAGED_PARSE_SUPERSEDED`, `STALE_DISCARD_REJECTED`, `WIZARD_SESSION_SUPERSEDED`, `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `WIZARD_ISOLATION_INDEXES_MISSING`, `LIVE_ROW_CONFLICT`, `FINALIZE_OWNED_SHOW`, `WEBHOOK_HEADERS_MISSING`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `LINKED_ASSET_DRIFTED`, `REEL_DRIFTED`, `MISSING_REVIEWER_CHOICE`, `INVALID_REVIEWER_ACTION`, `PENDING_SYNC_NOT_FOUND`, `SHOW_BUSY_RETRY`. Verbatim copy from §12.4.
- **Operator-log sink (DEFERRED M5-D9 / M5-D10 / M5-D11 carry-forward)** — if M6 is the milestone that lands the structured operator-log sink (vs deferring further to M8), §A authors `lib/operatorLog/sink.ts` plus the migration that backs it AND wires the M5 OAuth callback / redeem-link / sign-out emit calls. **Decision deferred to M6 kickoff:** orchestrator decides on Day 1 whether the sink ships in M6 or in M8. If M8, mark M5-D9/D10/D11 unchanged in DEFERRED.md. See §11(f) below.

> **`[PIN-STOP 2 — Codex stops here and reports]`** After Tasks 6.3, 6.4, 6.5, 6.6 ship and `pnpm test && pnpm lint && pnpm typecheck` exits 0, Codex pauses. Reports per §0 Pin-stop sequence: new SHA, `.d.ts`-style export block (Phase 1 result type, Phase 2 entry signature, `processOneFile` / `LockedShowTx<T>` signatures, `lib/messages/catalog.ts` M6 additions list, all admin staged-route URL contracts as TypeScript signatures so §B's ParsePanel can be written against them), spec deviations, verification gate result. Orchestrator confirms; §B starts in parallel; Codex resumes §A with Tasks 6.7–6.12 + 6.13 §A.

### §B — Opus / UI tasks (after Pin-stop 2 clears; consumes finalized contracts)

Files Opus creates / modifies (UI surface only — `app/` outside `app/api/**`, `components/`, design tokens):

- **Task 6.11 §B portion** — `app/admin/show/[slug]/page.tsx` (per-show parse panel — list current `pending_syncs` rows for the show; render the staged review controls; render apply/discard actions wired to §A's routes), `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx` (per-row card with `triggered_review_items` reviewer-choice form, `staged_id` echoed back to server for CAS, error rendering through `lib/messages/lookup.ts`).
- **Server-action / fetcher glue** — if the UI needs a thin client wrapper around `/api/admin/staged/[fileId]/apply` and `/api/admin/staged/[fileId]/discard`, it lives under `components/admin/` (not `lib/sync/`).
- **Playwright e2e for admin parse panel** — `tests/e2e/admin-parse-panel.spec.ts` covering: render staged row → submit reviewer-choices → Apply succeeds → row disappears; Discard → row disappears; stale `staged_id` → 409 displayed via `<ErrorExplainer>`; `MISSING_REVIEWER_CHOICE` validation rendered through the catalog.
- **Layout-dimensions test (if ParsePanel has a fixed-dimension parent containing flex/grid children)** — Playwright `getBoundingClientRect()` assertion per AGENTS.md writing-plans rule.
- **`/impeccable critique` + `/impeccable audit` on §B's surface** before adversarial review (UI quality gate per AGENTS.md §1 invariant 8).
- **Task 6.13 §B portion** — Opus drives the demo verification UI half (open the parse panel, click Apply / Discard end-to-end after Codex's curl validation passes).

### Per-session UI hard rule

§A NEVER touches `app/admin/show/[slug]/page.tsx` or any file under `components/admin/`. §B NEVER touches `lib/sync/**`, `lib/drive/**`, `app/api/cron/**`, `app/api/drive/**`, `app/api/admin/staged/**`, `app/api/admin/sync/**`, or any `supabase/migrations/**` file.

### What is NOT in either list

- **DESIGN.md edits.** M4 closed DESIGN.md as canon; M5 introduced no new tokens. M6's parse-panel UI must reuse existing tokens. If a new token is genuinely needed, raise it as a question before adding.
- **Onboarding wizard pages** (`app/admin/onboarding/**`). Owned by M10; `runOnboardingScan` ships in M6 but the UI that calls it is M10.
- **Asset routes** (`app/api/asset/**`). Owned by M7; `snapshotAssets` and asset_recovery ship in M7 but consume M6's `pending_syncs` shape.
- **Admin alerts banner** — already shipped in M5 §B (`components/admin/AlertBanner.tsx`). M6's new admin_alerts codes (e.g., `WATCH_CHANNEL_ORPHANED`, `WEBHOOK_TOKEN_INVALID`) are surfaced through the existing banner; no new component.
- **`/admin/dev` panel.** M3 surface; M6 does not touch it.

### Pin-stop sequence (§A → §B handshake gates)

Two pin-stops. M5 had two; M6's contract topology is similar (low-level primitives → full UI-consumable contract surface), so two pins fit cleanly.

**Pin-stop 1**: low-level Drive primitives + Drive API types — `getDriveClient`, `listFolder`, `fetchSheetAsMarkdown`, `fetchSheetAsMarkdownAtRevision`. These are the building blocks every higher-level sync helper consumes, but they are not directly UI-consumable. Pin 1 unblocks no §B work; its purpose is to verify the harness, sandbox/git protocol, TDD discipline, and commit format work before Codex commits to the larger contract surface. (Same posture as M5 Pin-1.)

**Pin-stop 2** (target — Codex stops here and reports): full UI-consumable contract surface. Includes:

- `lib/sync/perFileProcessor.ts` — `(driveFileId, mode, fileMeta) => { outcome: 'skip', reason } | { outcome: 'proceed', mode }` (mode-resolution shape that orchestrators forward to phase 1/2)
- `lib/sync/phase1.ts` — `Phase1Result` discriminated union (`hard_fail` | `stage` | `pass`) + the `triggered_review_items[]` shape (every MI-* code; legacy `FIRST_SEEN_REVIEW` until M6-D12 retires it; `ONBOARDING_SCAN_REVIEW`; the four asset-review variants)
- `lib/sync/phase2.ts` — entry signature accepting `LockedShowTx<Tx>`
- `lib/sync/lockedShowTx.ts` — `withShowLock(driveFileId, fn, opts?)` + branded `LockedShowTx<T>` type (the M6 invariant load-bearer for the single-holder rule)
- `lib/sync/runScheduledCronSync.ts` — entry point + `processOneFile` / `processOneFile_unlocked` (the lock-owner split — same shape as the M5 Pin-2 advisory-lock helper but specialized for sync)
- `app/api/admin/staged/[fileId]/apply/route.ts` + `app/api/admin/staged/[fileId]/discard/route.ts` — request body + response contract that ParsePanel posts (`source_scope`, `staged_id` echoed back, `wizardSessionId` when wizard-scoped, reviewer-choices payload), every error-code branch ParsePanel must render through `<ErrorExplainer>` (`STAGED_PARSE_SUPERSEDED`, `STALE_DISCARD_REJECTED`, `WIZARD_SESSION_SUPERSEDED`, `STAGED_PARSE_OUTDATED`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `STAGED_PARSE_SOURCE_GONE`, `MISSING_REVIEWER_CHOICE`, `INVALID_REVIEWER_ACTION`, `FINALIZE_OWNED_SHOW`, `PENDING_SYNC_NOT_FOUND`, `SHOW_BUSY_RETRY`)
- `app/api/admin/sync/[slug]/route.ts` — request body + response contract for the per-show "Re-sync" button
- `lib/messages/catalog.ts` — every M6 sync code from the §A bullet list above

After Pin-stop 2, §B starts in parallel. The remaining §A work (Tasks 6.7 manual-sync route + 6.8 onboarding-scan + 6.9 watch lifecycle + 6.10 webhook + 6.11/6.12 finalize wiring + 6.13 §A demo) ships alongside §B's UI.

**Codex's report at Pin-stop 2 must include:**

1. The new contract-pin SHA (orchestrator passes this to §B as the rebase base).
2. The exported type names + signatures the UI consumes — pasted as a `.d.ts`-style block under a new `### Pinned contract @ <SHA>` subsection appended at the bottom of this §0.
3. Any deviations from spec §3.2 / §5 / §6.8 / §6.11 — flagged explicitly.
4. Verification gate: `pnpm test && pnpm lint && pnpm typecheck` exits 0 at the pin-stop SHA.

**If Pin-stop 2 reveals a missing surface §B needs:** treat it as a Pin-stop-2-extension, NOT a new Pin-stop 3 (same convention as M5). Update this section's bullet list inline, have Codex extend the contract, and re-pin at a new SHA. Pin numbering stays at 2 because the contract surface is conceptually one gate; only fundamentally new surfaces (e.g., a webhook-replay UI surface that didn't exist at M6 design time) earn a new pin number.

**Anti-pattern:** Codex resuming §A's Tasks 6.7–6.13 between Pin-stops 1 and 2. The pin sequence is strictly ordered — those tasks import the Phase 1 / Phase 2 / `processOneFile` surfaces from Pin-2 and cannot ship before Pin-2 closes.

### Pin contract subsections (filled in by Codex on each pin clear)

### Pinned contract @ a9dba49 (Pin-stop 1 — 2026-05-08)

Tasks 6.1 + 6.2 shipped. Drive service-account client, folder listing, file metadata fetch, head markdown export, pinned revision markdown export.

```ts
// lib/drive/client
export const GOOGLE_DRIVE_SCOPES: string[];
export class DriveConfigError extends Error {}
export function getDriveClient(): drive_v3.Drive;
export function getDriveAuth(): InstanceType<typeof google.auth.GoogleAuth>;
export function getDriveAccessToken(): Promise<string>;

// lib/drive/list
export const GOOGLE_SHEETS_MIME_TYPE: "application/vnd.google-apps.spreadsheet";
export const DRIVE_LIST_FIELDS: string;
export type DriveListedFile = {
  driveFileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents: string[];
  headRevisionId?: string;
  md5Checksum?: string;
};
export type DriveListWarning = {
  code: "UNEXPECTED_PARENT";
  driveFileId: string;
  folderId: string;
  parents: string[];
};
export type ListFolderOptions = {
  drive?: drive_v3.Drive;
  onWarning?: (warning: DriveListWarning) => void;
};
export function listFolder(folderId: string, options?: ListFolderOptions): Promise<DriveListedFile[]>;

// lib/drive/fetch
export const MARKDOWN_EXPORT_MIME_TYPE: "text/markdown";
export const DRIVE_FILE_METADATA_FIELDS: string;
export type DriveFetchOptions = {
  drive?: drive_v3.Drive;
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};
export class DriveFetchError extends Error {}
export function fetchDriveFileMetadata(driveFileId: string, options?: DriveFetchOptions): Promise<DriveListedFile>;
export function fetchSheetAsMarkdown(driveFileId: string, options?: DriveFetchOptions): Promise<string>;
export function fetchSheetAsMarkdownAtRevision(
  driveFileId: string,
  revisionId: string,
  options?: DriveFetchOptions,
): Promise<string>;
```

**Codex deviations (Pin-stop 1):**

1. **`revisions.export` does not exist in Drive REST v3.** Spec §5.2 / §5.3 + this handoff's §6 watchpoint 10 trigger class (b) referred to `revisions.export(driveFileId, R1, mimeType)` as the pinned-revision markdown primitive. Drive REST v3 only exposes `revisions.get` with an `exportLinks` map; the implementation calls `revisions.get(driveFileId, revisionId, { fields: "exportLinks" })` and then issues an authenticated `fetch()` against `exportLinks["text/markdown"]`. Fresh-eyes reviewer APPROVED this as the correct functional equivalent. **Watchpoint update for Pin-stop 2:** Task 6.6's same-revision binding test for trigger class (b) must exercise either (b1) `revisions.get` returns 404 OR returns a payload that lacks `text/markdown` in `exportLinks`, or (b2) the `fetch(exportLinks[...])` call returns 404. Both classify as `STAGED_PARSE_REVISION_RACE`. Update the failing-test fixture accordingly when wiring binding capture.

2. **`text/markdown` export for Google Sheets via `exportLinks` is an unverified real-Drive contract.** Tests are mocked. If Sheets doesn't actually surface `text/markdown` in `exportLinks` against a live spreadsheet, the whole markdown-export strategy needs to switch (either to a different export MIME the parser handles, or to synthesized markdown via `spreadsheets.values.get` + table assembly). **Pin-stop 2 must include a real-Drive smoke check against a fixture sheet** before accepting `fetchSheetAsMarkdownAtRevision` as production-ready. If the smoke fails, raise as a Pin-stop-2-extension before resuming Tasks 6.7+.

3. **`fetchSheetAsMarkdown()` (unpinned head export) is a footgun for production.** Sync paths MUST use `fetchSheetAsMarkdownAtRevision()` to honor the same-revision binding contract (handoff §6 watchpoint 10). The unpinned variant is acceptable only in tests / one-shot debug paths. **Pin-stop 2 enforcement:** add a static guard scanning `lib/sync/**` + `app/api/cron/**` + `app/api/drive/**` for `fetchSheetAsMarkdown(` callers (without `AtRevision`) and asserting zero matches; only `tests/**` and explicit `// not-subject-to-binding: <reason>` comments allowed.

**Verification at Pin-stop 1 SHA `a9dba49`:**

- `pnpm test` — 1763 passed, 5 skipped
- `pnpm lint` — 0 errors, 0 warnings
- `pnpm typecheck` — passed
- Cross-model fresh-eyes review: APPROVED, recommended proceeding to Pin-stop 2.

### Pinned contract @ 6277169 (Pin-stop 1.5 — 2026-05-08)

Pin-stop 2 halted because the live Google Sheet fixture does not support the Pin-stop 1 markdown/revision export assumption. Probe output is committed at `docs/m6/pin-1.5-export-probe.md`.

**Probe summary:**

- `files.get(... headRevisionId, exportLinks)` returned no `headRevisionId`; `revisions.list` returned zero revisions.
- `exportLinks` contained xlsx, csv, tsv, pdf, ods, and zip; no `text/markdown` and no `text/html`.
- `files.export(text/markdown)` failed against the live Sheet; xlsx export succeeded and parsed with SheetJS.
- The fixture folder id derived from `parents[0]` is `1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`; `.env.local.example` now includes `M6_REAL_DRIVE_FIXTURE_FOLDER_ID`.

**Authoritative cause (Drive API v3 docs, verified 2026-05-09):**

Google Sheets cannot be pinned to a Drive revision id at all — this is structural, not a permission-level or scope artifact. Three Google API facts collectively close the door:

1. **`files.get(... headRevisionId, md5Checksum ...)`** — Drive API v3 docs: _"Output only. The ID of the file's head revision. **This is currently only available for files with binary content in Google Drive.**"_ Google Sheets / Docs / Slides are Workspace-native files, not binary content, so both fields return `null` regardless of permission level. There is **no Editor / Owner upgrade path** that changes this for Sheets.
2. **`drive.revisions.list`** — structurally empty for Workspace-native files. Revisions for Sheets are tracked via Sheets-internal storage that the Drive `revisions` resource does not surface.
3. **Sheets API v4** — `spreadsheets.get`, `spreadsheets.values.get`, and `spreadsheets.values.batchGet` accept no revision-id parameter; all three always read HEAD.

The implication: **modifiedTime CAS is the permanent binding ceiling for Sheets**, not a temporary fallback regime. The spec §5.2 / §5.3 reference to `revisions.export` was written against a primitive that does not exist for the file type the system actually targets; this is captured as a ratified plan amendment in `00-overview.md` (#6).

**Final binding contract:**

`fetchSheetAsMarkdownAtRevision(driveFileId, revisionId, opts)` treats `revisionId` as the captured Drive binding token: `metadata.headRevisionId ?? metadata.modifiedTime` (the nullish fallback is the load-bearing one for Sheets, but the function tolerates either input shape so binary-content callers get full revision pinning when available). The function reads current xlsx export bytes only after verifying the starting token still matches, re-reads metadata after the byte fetch, and throws `DriveFetchError` if the token changed. `runScheduledCronSync` captures the same token before parsing and re-verifies before Phase 1/Phase 2.

**Asymmetry — per-asset binary-content binding is NOT affected.** Embedded-image fetches and linked-folder Drive file fetches target binary files (PNG/JPG/PDF/etc.), so `headRevisionId` and `md5Checksum` ARE populated for them and the spec §6.11 `(sheetsRevisionId, embeddedFingerprint)` and `(headRevisionId, md5Checksum)` immutable-pin contracts apply in full. Only the spreadsheet itself collapses to modtime CAS. M7's asset_recovery and Apply-time asset re-verify retain the full immutable-pin guarantees for those targets.

```ts
// lib/drive/fetch
export const MARKDOWN_EXPORT_MIME_TYPE: "text/markdown"; // retained for Pin-1 compatibility only
export const XLSX_EXPORT_MIME_TYPE: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const DRIVE_FILE_METADATA_FIELDS: string;
export const DRIVE_EXPORT_METADATA_FIELDS: string;
export type DriveFetchOptions = {
  drive?: drive_v3.Drive;
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};
export class DriveFetchError extends Error {}
export function fetchDriveFileMetadata(driveFileId: string, options?: DriveFetchOptions): Promise<DriveListedFile>;
/** @internal: tests only */
export function fetchSheetAsMarkdown(driveFileId: string, options?: DriveFetchOptions): Promise<string>;
export function fetchSheetAsMarkdownAtRevision(
  driveFileId: string,
  revisionId: string,
  options?: DriveFetchOptions,
): Promise<string>;

// lib/drive/exportSheetToMarkdown
export function synthesizeMarkdownFromXlsx(buffer: ArrayBuffer): string;
```

**Round-trip status:**

- `tests/drive/round-trip-fixture.test.ts` loads `M6_REAL_DRIVE_FIXTURE_SPREADSHEET_ID`, fetches the live Sheet through `fetchSheetAsMarkdownAtRevision`, parses the synthesized markdown and `fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md`, and asserts structural equality.
- With `.env.local` populated, the round-trip test passes against the real fixture.
- Without secrets, the round-trip test skips cleanly.

**Watchpoint 10 trigger-class (b), updated language:**

`fetchSheetAsMarkdownAtRevision`'s xlsx export path fails mid-flight: the captured token no longer matches before xlsx bytes are fetched, the xlsx export link is missing, the authenticated xlsx fetch returns 404, or the post-byte metadata re-read shows a token mismatch. All classify as `STAGED_PARSE_REVISION_RACE`.

### Pinned contract @ 8d2cc24 (Pin-stop 2 — 2026-05-09)

Tasks 6.3, 6.4, 6.5, and 6.6 backend engine surface shipped: gating, Phase 1, Phase 2, locked cron orchestration, cron routes, Vercel schedules, M6 message catalog entries, and structural meta-tests.

```ts
// lib/sync/perFileProcessor
export type SyncMode = "cron" | "push" | "manual" | "onboarding_scan";
export type ResolvedSyncMode = SyncMode | "recovery" | "asset_recovery";
export type PerFileProcessorResult =
  | { outcome: "skip"; reason: "deferred_permanent" | "deferred_modtime" | "watermark" | "partial_failure_restage_required" }
  | { outcome: "proceed"; mode: ResolvedSyncMode };
export class SyncInfraError extends Error {
  readonly operation: string;
  readonly source: "returned_error" | "thrown_error";
}
export function perFileProcessor(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
): Promise<PerFileProcessorResult>;

// lib/sync/phase1
export type Phase1Binding = {
  bindingToken: string;
  modifiedTime: string;
};
export type Phase1Result =
  | { outcome: "hard_fail"; code: string; failedCodes: string[]; message: string }
  | { outcome: "stage"; triggeredReviewItems: TriggeredReviewItem[]; stagedId: string }
  | { outcome: "defer"; reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable" }
  | { outcome: "pass" };
export function runPhase1(tx: Phase1Tx, args: Phase1Args): Promise<Phase1Result>;

// lib/sync/phase2
export type Phase2Mode = Exclude<ResolvedSyncMode, "asset_recovery">;
export type Phase2Result =
  | { outcome: "applied"; showId: string }
  | { outcome: "stale"; code: "STALE_WRITE_ABORTED" | "STALE_PUSH_ABORTED" | "STALE_MANUAL_REPLAY_ABORTED" };
export function runPhase2(tx: Phase2Tx, args: Phase2Args): Promise<Phase2Result>;

// lib/sync/lockedShowTx
export type LockedShowTx<T extends LockableSyncTx> = T & { readonly [lockedShowTxBrand]: true };
export const CONCURRENT_SYNC_SKIPPED: "CONCURRENT_SYNC_SKIPPED";
export function withShowLock<T extends LockableSyncTx, R>(
  driveFileId: string,
  fn: (tx: LockedShowTx<T>) => Promise<R> | R,
  options?: WithShowLockOptions<T>,
): Promise<R | ConcurrentSyncSkipped>;
export function assertShowLockHeld<T extends LockableSyncTx>(
  tx: LockedShowTx<T>,
  driveFileId: string,
): Promise<void>;

// lib/sync/runScheduledCronSync
export type ProcessOneFileResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "asset_recovery" }
  | { outcome: "stage"; stagedId: string }
  | { outcome: "hard_fail"; code: string }
  | { outcome: "applied"; showId: string }
  | { outcome: "stale"; code: string }
  | { outcome: "revision_race"; code: "STAGED_PARSE_REVISION_RACE" }
  | { outcome: "source_gone"; code: "STAGED_PARSE_SOURCE_GONE" }
  | { outcome: "parse_error"; code: SyncFailureCode }
  | ConcurrentSyncSkipped;
export function processOneFile(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps?: ProcessOneFileDeps,
): Promise<ProcessOneFileResult>;
export function processOneFile_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps?: ProcessOneFileDeps,
): Promise<ProcessOneFileResult>;
export function runScheduledCronSync(deps?: RunScheduledCronSyncDeps): Promise<RunScheduledCronSyncResult>;

// app/api/cron/sync/route
export function GET(request: NextRequest): Promise<Response>;

// app/api/cron/keepalive/route
export function GET(request: NextRequest): Promise<Response>;
```

**Spreadsheet binding contract at Pin-stop 2:**

- `Phase1Binding.bindingToken = metadata.headRevisionId ?? metadata.modifiedTime`.
- Spreadsheet-level `STAGED_PARSE_REVISION_RACE` classes are exactly:
  - post-fetch token mismatch from `fetchSheetAsMarkdownAtRevision`
  - missing xlsx export link or xlsx fetch HTTP 404
  - post-enrichment token mismatch before Phase 1
- Spreadsheet file 404 / source gone remains `STAGED_PARSE_SOURCE_GONE`.
- Binary-asset enrichment retains full revision-pinning classification and does not inherit the spreadsheet modtime-CAS fallback.
- Amendment 7 correction: automated modes (`cron`, `push`, `recovery`; asset-recovery does not enter Phase 1) defer MI-8 / MI-8b-only staging while Drive `modifiedTime` is younger than `MI8_DEBOUNCE_MS = 240_000`. Manual and onboarding modes bypass the debounce, and MI-8c remains immediate.
- Amendment 8 correction: MI-9 stages only LEAD-bit set-membership deltas. Non-LEAD `role_flags` deltas auto-apply in Phase 2 and emit `ROLE_FLAGS_NOTICE` (`severity: "info"`) through the admin-alert catalog; MI-10 remains a documentation safety net when MI-9 does not already cover the LEAD toggle.

**Structural guards shipped and passing:**

- `tests/sync/_metaInfraContract.test.ts`
- `tests/sync/_advisoryLockSingleHolderContract.test.ts`
- `tests/sync/_phase2InvariantContract.test.ts`
- `tests/sync/_partitionScopeContract.test.ts`
- `tests/drive/no-unpinned-export.test.ts`
- `tests/admin/no-inline-email-normalization.test.ts` now audits `lib/drive/**` and `lib/sync/**`.

**Pin-stop 2 deviation / extension scope (resolved 2026-05-09):**

§0's original Pin-2 surface bullets listed `app/api/admin/sync/[slug]/route.ts` and `app/api/admin/staged/[fileId]/{apply,discard}/route.ts` as Pin-2-consumable contracts AND simultaneously assigned their implementations to Tasks 6.7 / 6.11 / 6.12 (post-Pin-2). Codex shipped the engine surface (Tasks 6.3–6.6) at this pin and correctly flagged the gap before §B starts.

**Resolution — Pin-stop-2-extension scope, live-scope-only:**

§B's parse panel renders the per-show admin surface for an _existing_ show; it never invokes the wizard step-3 onboarding flow (M10 territory). So the extension can ship live-scope-only without needing 6.8's partial-index migration:

1. **Task 6.7 in full** — `runManualSyncForShow` + `runManualSyncForShow_unlocked` + `app/api/admin/sync/[slug]/route.ts` + FINALIZE_OWNED_SHOW two-arm guard. Live-only routing is acceptable here because the guard's wizard-checkpoint join reads existing M2 schema (`wizard_finalize_checkpoints` was provisioned at M2; the `shows_pending_changes` shadow surface ditto).
2. **Task 6.11 §A live-scope-only** — `app/api/admin/staged/[fileId]/apply/route.ts` + `lib/sync/applyStaged.ts` covering ONLY the `source_scope = 'live'` branch (`AND wizard_session_id IS NULL` predicates). Wizard-scope branch (Phase-1-only approval, `wizard_approved = TRUE` UPDATE, manifest transition) is deferred to a coda after 6.8's partial-index migration lands. The asset-review item Apply-time effects (DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE / NONE_FOUND / LINKED_FOLDER_DRIFT_PENDING / REEL_DRIFT_PENDING) ship live-scope; reviewer-choices validator ships in full.
3. **Task 6.12 §A live-scope-only** — `app/api/admin/staged/[fileId]/discard/route.ts` covering the three live-scope variants (try-again / defer-until-modified / permanent-ignore). Wizard-scope branch deferred to the same coda.

**Schema dependency check:** live-scope routes only use `wizard_session_id IS NULL` predicates, which work on the M2 base schema without requiring the partial-index split (the split is a query-plan optimization for coexistence; correctness is enforced by the predicate). `pending_syncs.wizard_approved BOOLEAN NOT NULL DEFAULT FALSE` and the related columns exist from Task 2.2; the CHECK is satisfied by every live row.

**Wizard-scope coda (deferred from this extension):** the wizard branches of 6.11/6.12 land alongside 6.8's full implementation (which ships the `runOnboardingScan` engine + the partial-index migration). Once 6.8 + the coda are in, the wizard surfaces are ready for M10 to consume.

**Post-extension parallel work:** §A continues with 6.8 (full + migration) → 6.9 (watch lifecycle) → 6.10 (webhook + push); §B starts in parallel against the live-scope route contracts pinned by the extension.

The extension is recorded as a NEW Pinned-contract block under §0 when it closes (per the M5 / Pin-1.5 convention), NOT as a Pin-stop 3.

**Verification at Pin-stop 2 code SHA `8d2cc24`:**

- `pnpm test && pnpm lint && pnpm typecheck` — exits 0
- Test count: 1900 passed, 5 skipped

### Pinned contract @ 2ae73ae (Pin-stop 2 extension — 2026-05-09)

Tasks 6.7, 6.11 §A live-scope, and 6.12 §A live-scope shipped. Wizard-scope Apply/Discard remains deferred to the 6.8 coda and is guarded with `501 WIZARD_SCOPE_NOT_YET_IMPLEMENTED` before any lock or mutation work.

```ts
// lib/sync/runManualSyncForShow
export const FINALIZE_OWNED_SHOW: "FINALIZE_OWNED_SHOW";
export type ManualSyncResult = ProcessOneFileResult | {
  outcome: "blocked";
  code: "FINALIZE_OWNED_SHOW";
};
export function runManualSyncForShow(
  driveFileId: string,
  mode?: "manual",
  deps?: RunManualSyncForShowDeps,
): Promise<ManualSyncResult | ConcurrentSyncSkipped>;
export function runManualSyncForShow_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode?: "manual",
  deps?: RunManualSyncForShowDeps,
): Promise<ProcessOneFileResult>;

// app/api/admin/sync/[slug]/route
export type ManualSyncRouteResponse =
  | { ok: true; result: ProcessOneFileResult }
  | { ok: false; error: "FINALIZE_OWNED_SHOW" | "SHOW_BUSY_RETRY" | "PENDING_SYNC_NOT_FOUND" | "SYNC_INFRA_ERROR" | string };

// lib/sync/applyStaged
export type ReviewerChoice = {
  item_id: string;
  action: "apply" | "reject" | "rename" | "independent";
  rename_value?: string;
};
export type ApplyStagedArgs =
  | { driveFileId: string; sourceScope: "live"; stagedId: string; reviewerChoices: ReviewerChoice[]; appliedByEmail: string }
  | { driveFileId: string; sourceScope: "wizard"; wizardSessionId: string; stagedId: string; reviewerChoices: ReviewerChoice[]; appliedByEmail: string };
export type ApplyStagedResult =
  | { outcome: "applied"; showId: string; syncAuditId: string | null; derivedSideEffects: { revokeFloorForNames: string[] }; adminAlertCode?: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" | null }
  | { outcome: "discarded"; variant: "try_again" }
  | { outcome: "not_found"; code: "PENDING_SYNC_NOT_FOUND" }
  | { outcome: "superseded"; code: "STAGED_PARSE_SUPERSEDED" }
  | { outcome: "source_gone"; code: "STAGED_PARSE_SOURCE_GONE" }
  | { outcome: "source_out_of_scope"; code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" }
  | { outcome: "outdated"; code: "STAGED_PARSE_OUTDATED" }
  | { outcome: "invalid_request"; code: "MISSING_REVIEWER_CHOICE" | "INVALID_REVIEWER_ACTION" }
  | { outcome: "infra_error"; code: "SYNC_INFRA_ERROR" }
  | { outcome: "wizard_deferred"; code: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED" };
export function applyStaged(args: ApplyStagedArgs, deps?: ApplyStagedDeps): Promise<ApplyStagedResult | ConcurrentSyncSkipped>;
export function applyStaged_unlocked(tx: LockedShowTx<SyncPipelineTx>, args: ApplyStagedArgs, deps?: ApplyStagedDeps): Promise<ApplyStagedResult>;

// app/api/admin/staged/[fileId]/apply/route
export type ApplyRouteBody =
  | { source_scope: "live"; staged_id: string; choices: ReviewerChoice[] }
  | { source_scope: "wizard"; staged_id: string; wizard_session_id?: string; choices?: ReviewerChoice[] };
export type ApplyRouteResponse =
  | { ok: true; result: Extract<ApplyStagedResult, { outcome: "applied" | "discarded" }> }
  | { ok: false; error: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED" | "PENDING_SYNC_NOT_FOUND" | "MISSING_REVIEWER_CHOICE" | "INVALID_REVIEWER_ACTION" | "SYNC_INFRA_ERROR" | "STAGED_PARSE_SUPERSEDED" | "STAGED_PARSE_SOURCE_GONE" | "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" | "STAGED_PARSE_OUTDATED" | "SHOW_BUSY_RETRY" };

// lib/sync/discardStaged
export type DiscardVariant = "try_again" | "defer_until_modified" | "permanent_ignore";
export type DiscardStagedArgs =
  | { driveFileId: string; sourceScope: "live"; stagedId: string; discardedByEmail: string; variant?: DiscardVariant }
  | { driveFileId: string; sourceScope: "wizard"; wizardSessionId: string; stagedId: string; variant?: DiscardVariant };
export type DiscardStagedResult =
  | { outcome: "discarded"; variant: DiscardVariant }
  | { outcome: "not_found"; code: "PENDING_SYNC_NOT_FOUND" }
  | { outcome: "stale"; code: "STALE_DISCARD_REJECTED" }
  | { outcome: "invalid_request"; code: "INVALID_REVIEWER_ACTION" }
  | { outcome: "wizard_deferred"; code: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED" };
export function discardStaged(args: DiscardStagedArgs, deps?: DiscardStagedDeps): Promise<DiscardStagedResult | ConcurrentSyncSkipped>;
export function discardStaged_unlocked(tx: LockedShowTx<SyncPipelineTx>, args: DiscardStagedArgs, deps?: DiscardStagedDeps): Promise<DiscardStagedResult>;

// app/api/admin/staged/[fileId]/discard/route
export type DiscardRouteBody =
  | { source_scope: "live"; staged_id: string; variant?: DiscardVariant }
  | { source_scope: "wizard"; staged_id: string; wizard_session_id?: string; variant?: DiscardVariant };
export type DiscardRouteResponse =
  | { ok: true; result: Extract<DiscardStagedResult, { outcome: "discarded" }> }
  | { ok: false; error: "WIZARD_SCOPE_NOT_YET_IMPLEMENTED" | "PENDING_SYNC_NOT_FOUND" | "INVALID_REVIEWER_ACTION" | "STALE_DISCARD_REJECTED" | "SHOW_BUSY_RETRY" };
```

**Route status map for §B ErrorExplainer:**

- `POST /api/admin/sync/[slug]`: `404 PENDING_SYNC_NOT_FOUND`; `409 FINALIZE_OWNED_SHOW`; `409 SHOW_BUSY_RETRY`; `500 SYNC_INFRA_ERROR`; other returned sync `code` values are `409`.
- `POST /api/admin/staged/[fileId]/apply`: `501 WIZARD_SCOPE_NOT_YET_IMPLEMENTED`; `404 PENDING_SYNC_NOT_FOUND`; `400 MISSING_REVIEWER_CHOICE` / `INVALID_REVIEWER_ACTION`; `500 SYNC_INFRA_ERROR`; `409 STAGED_PARSE_SUPERSEDED` / `STAGED_PARSE_SOURCE_GONE` / `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` / `STAGED_PARSE_OUTDATED` / `SHOW_BUSY_RETRY`.
- `POST /api/admin/staged/[fileId]/discard`: `501 WIZARD_SCOPE_NOT_YET_IMPLEMENTED`; `404 PENDING_SYNC_NOT_FOUND`; `400 INVALID_REVIEWER_ACTION`; `409 STALE_DISCARD_REJECTED` / `SHOW_BUSY_RETRY`.

**Live-scope behavioral contract:**

- Manual sync acquires the admin/blocking show lock (`tryOnly: false`) and checks `FINALIZE_OWNED_SHOW` inside that locked transaction before Drive work.
- Apply reads only live `pending_syncs` (`wizard_session_id IS NULL`), validates `staged_id` as UUID at the route, enforces reviewer-choice completeness, Drive-reverifies source state, runs Phase 2 from the stored `parse_result`, writes `sync_audit`, deletes the live staged row, and only emits `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` admin alerts after the locked transaction commits.
- Discard reads/deletes only live `pending_syncs`, validates `staged_id` as UUID at the route, supports existing-show `try_again`, first-seen `try_again`, first-seen `defer_until_modified`, and first-seen `permanent_ignore`. Existing-show defer/ignore is rejected as `INVALID_REVIEWER_ACTION`.
- Auth side effects bump `crew_member_auth.revoked_below_version` to at least `current_token_version + 1` for the affected crew names.
- Wizard-scope Apply/Discard returns `501 WIZARD_SCOPE_NOT_YET_IMPLEMENTED` before lock acquisition. The implementation carries explicit `// wizard-scope deferred to 6.8 coda` markers.

**Spec deviations / deferrals:**

- Wizard-scope Apply/Discard is deferred to the 6.8 coda by orchestrator instruction. The 501 route guard is the pinned §B-facing contract until that coda ships.
- `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE` live Apply preserves prior diagrams and emits `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`; it does not trust a late revision-availability probe to reconstruct binary pins inside Apply.
- Manual route curl smoke with a real admin cookie was not run in this headless session; route-level tests cover the handler contract, auth-boundary error paths, and route status map.

**Verification at Pin-stop 2 extension code SHA `2ae73ae`:**

- `pnpm test && pnpm lint && pnpm typecheck` — exits 0
- `pnpm test` count: 2002 passed, 5 skipped
- Sync/meta/static guard suite: 89 passed across `_metaInfraContract`, `_advisoryLockSingleHolderContract`, `_phase2InvariantContract`, `_partitionScopeContract`, `no-unpinned-export`, `no-inline-email-normalization`, `_metaAdminAlertCatalog`, and `m6-sync-catalog`
- `rg "lastPollAt" lib app supabase tests` — zero matches
- Unpinned `fetchSheetAsMarkdown(` guard over `lib/sync`, `app/api/cron`, and `app/api/admin` — zero matches
- Cross-model adversarial review loop: fresh-eyes Claude review returned `APPROVED`

### Pinned contract @ ddafda3 (Pin-stop 2 extension coda + Tasks 6.8-6.10 — 2026-05-09)

This block supersedes the temporary `WIZARD_SCOPE_NOT_YET_IMPLEMENTED` 501 guard in the `2ae73ae` pin. Wizard-scope Apply/Discard, onboarding scan, watch lifecycle, webhook dispatch, and the production `sync_log` sink are now shipped.

```ts
// lib/sync/applyStaged
export type ApplyStagedArgs =
  | { driveFileId: string; sourceScope: "live"; stagedId: string; reviewerChoices: ReviewerChoice[]; appliedByEmail: string }
  | { driveFileId: string; sourceScope: "wizard"; wizardSessionId: string; stagedId: string; reviewerChoices: ReviewerChoice[]; appliedByEmail: string };
export type ApplyStagedResult =
  | { outcome: "applied"; showId: string; syncAuditId: string | null; derivedSideEffects: { revokeFloorForNames: string[] }; adminAlertCode?: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" | null; roleFlagsNotice?: RoleFlagsNotice }
  | { outcome: "wizard_applied"; wizardSessionId: string; stagedId: string }
  | { outcome: "wizard_superseded"; code: "WIZARD_SESSION_SUPERSEDED" }
  | { outcome: "not_found"; code: "PENDING_SYNC_NOT_FOUND" }
  | { outcome: "superseded"; code: "STAGED_PARSE_SUPERSEDED" }
  | { outcome: "source_gone"; code: "STAGED_PARSE_SOURCE_GONE" }
  | { outcome: "source_out_of_scope"; code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" }
  | { outcome: "outdated"; code: "STAGED_PARSE_OUTDATED" }
  | { outcome: "invalid_request"; code: "MISSING_REVIEWER_CHOICE" | "INVALID_REVIEWER_ACTION" }
  | { outcome: "infra_error"; code: "SYNC_INFRA_ERROR" }
  | { outcome: "discarded"; variant: "try_again" };

// lib/sync/discardStaged
export type DiscardStagedResult =
  | { outcome: "discarded"; variant: "try_again" | "defer_until_modified" | "permanent_ignore" }
  | { outcome: "not_found"; code: "PENDING_SYNC_NOT_FOUND" }
  | { outcome: "stale"; code: "STALE_DISCARD_REJECTED" }
  | { outcome: "invalid_request"; code: "INVALID_REVIEWER_ACTION" }
  | { outcome: "wizard_superseded"; code: "WIZARD_SESSION_SUPERSEDED" };

// app/api/admin/staged/[fileId]/apply/route
export type ApplyRouteBody =
  | { source_scope: "live"; staged_id: string; choices: ReviewerChoice[] }
  | { source_scope: "wizard"; staged_id: string; wizard_session_id: string; choices?: ReviewerChoice[] };

// app/api/admin/staged/[fileId]/discard/route
export type DiscardRouteBody =
  | { source_scope: "live"; staged_id: string; variant?: DiscardVariant }
  | { source_scope: "wizard"; staged_id: string; wizard_session_id: string; variant?: DiscardVariant };

// lib/sync/syncLog
export type SyncLogEntry = { driveFileId: string; outcome: string; code?: string; payload?: Record<string, unknown> };
export function makePostgresSyncLogSink(sql: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }): (entry: SyncLogEntry) => Promise<void>;
export function writeSyncLog(entry: SyncLogEntry): Promise<void>;
```

**Route status map after coda:**

- `POST /api/admin/staged/[fileId]/apply`: `404 PENDING_SYNC_NOT_FOUND`; `400 MISSING_REVIEWER_CHOICE` / `INVALID_REVIEWER_ACTION`; `500 SYNC_INFRA_ERROR`; `409 WIZARD_SESSION_SUPERSEDED` / `STAGED_PARSE_SUPERSEDED` / `STAGED_PARSE_SOURCE_GONE` / `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` / `STAGED_PARSE_OUTDATED` / `SHOW_BUSY_RETRY`.
- `POST /api/admin/staged/[fileId]/discard`: `404 PENDING_SYNC_NOT_FOUND`; `400 INVALID_REVIEWER_ACTION`; `409 WIZARD_SESSION_SUPERSEDED` / `STALE_DISCARD_REJECTED` / `SHOW_BUSY_RETRY`.
- The removed `WIZARD_SCOPE_NOT_YET_IMPLEMENTED` code is no longer in `lib/messages/catalog.ts`.

**Coda behavioral notes:**

- Wizard Apply is Phase-1-only approval: it sets `pending_syncs.wizard_approved = TRUE`, persists reviewer choices, marks `onboarding_scan_manifest.status = 'applied'`, and does not mutate live `shows`.
- Wizard Discard updates `onboarding_scan_manifest.status` to `discard_retryable`, `defer_until_modified`, or `permanent_ignore` under the active-wizard-session CAS before deleting the wizard `pending_syncs` row.
- Cron and push production routes inject `writeSyncLog`; `WEBHOOK_NOOP_ALREADY_SYNCED` and other per-file outcomes now write `sync_log` rows through the existing schema (`status`, `message`, `parse_warnings`).
- `WEBHOOK_TOKEN_INVALID` alert writes coalesce repeated bad-token/resource requests for the same channel for one hour before re-upserting the unresolved alert.

---

## 1. Spec sections in scope

Plan §M6 cites `Spec context: §5 entire section + §6.8 / §6.8.1 / §6.8.2 / §6.8.3, §17.1 milestone 6`. In practice every M6 task brushes one or more of:

- **§3.2** — Per-file watermark architecture (no global cursor; `shows.last_seen_modified_time` is the single source of truth).
- **§4.1** — `shows`, `pending_syncs`, `pending_ingestions`, `drive_watch_channels`, `deferred_ingestions`, `sync_log`, `sync_audit`, `revision_race_cooldowns`, `recovery_drift_cooldowns` table shapes.
- **§4.5** — `app_settings.watched_folder_id` / `pending_folder_id` / `pending_wizard_session_id` / atomic-promotion CAS; `pending_syncs` + `pending_ingestions` partial-unique-index split (`(drive_file_id) WHERE wizard_session_id IS NULL` vs `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL`); `wizard_finalize_checkpoints`; `onboarding_scan_manifest`; `shows_pending_changes`.
- **§4.6** — `admin_alerts` UPSERT contract for sync-side codes (`WATCH_CHANNEL_ORPHANED`, `WEBHOOK_TOKEN_INVALID`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`).
- **§5 entire** — Sync pipeline. §5.1 trigger and cadence; §5.2 per-run sequence + outcomes 1/2/3 + same-revision binding contract + revision-race cooldown gate; §5.3 markdown export pinned to `headRevisionId`; §5.5 Drive watch (5.5.1 outbox subscribe, 5.5.2 webhook 8-step verification, 5.5.3 push-sync dispatch).
- **§6.8** — MI-1..MI-14 invariant catalog + onboarding-scan precedence.
- **§6.8.1** — Apply step list (1..7) for live-scope; wizard-scope Apply (4W → 5W → 6W) deferred-until-finalize contract; §6.8.2 derivation table for auth side-effects (MI-9/10/11/12/13/14 → `crew_member_auth.revoked_below_version` bumps).
- **§6.8.3** — `sync_audit` Apply-only contract (auto-sync writes only `sync_log`).
- **§6.11** — `shows.diagrams` JSONB shape (`current` / `pending` split per M7 batch-17 finding 1); the four asset-review item Apply-time effects.
- **§7.3** — `/api/asset/diagram/[show]/[rev]/[key]` path shape (read by M6 only insofar as Apply mints fresh `snapshot_revision_id` values that future asset routes reference).
- **§9.0** — Live-folder cron coexists with in-flight wizard scan.
- **§12.4** — Error-code catalog (every M6-introduced producer code MUST appear in `lib/messages/catalog.ts` with verbatim §12.4 copy).
- **§17.1** — Per-milestone acceptance criteria AC-6.1..AC-6.27 at spec lines `:3404-3458`.

## 2. Acceptance criteria

Verbatim from spec §17.1 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-design.md:3404-3458`). Every AC ID must have at least one §A-side or §B-side test.

- **AC-6.1** — cron `files.list` lists every spreadsheet in folder; non-spreadsheets filtered. [§A · 6.6]
- **AC-6.2** — unchanged sheet → no `last_seen_modified_time` advance. [§A · 6.6]
- **AC-6.3** — edited sheet → advance (Phase 2 commits). [§A · 6.5/6.6]
- **AC-6.4** — show-A parse fail does NOT skip show B (independence). [§A · 6.6]
- **AC-6.5** — manual sync only fetches the targeted file. [§A · 6.7]
- **AC-6.6** — manual same-modtime succeeds; advances `last_seen_modified_time` to that same value. [§A · 6.7]
- **AC-6.7** — concurrent cron + manual: one acquires lock; other emits `CONCURRENT_SYNC_SKIPPED`. [§A · 6.6/6.7 + `tests/auth/advisoryLockRpcDeadlock.test.ts` extension]
- **AC-6.8** — older parse's UPDATE matches 0 rows under conditional WHERE → `STALE_WRITE_ABORTED`. [§A · 6.5]
- **AC-6.9** — removed sheet → `last_sync_status = 'sheet_unavailable'`; `last_seen_modified_time` unchanged. [§A · 6.6]
- **AC-6.10** — reappearance → status returns to `'ok'` (recovery mode). [§A · 6.5/6.6]
- **AC-6.11** — AMENDED by overview Amendment 9. Current shipped code still follows the pre-amendment live first-seen staging behavior (`FIRST_SEEN_REVIEW`; no `shows` row until Apply) and must not be claimed as satisfying amended AC-6.11. Amendment 9 live first-seen auto-publish + 24h unpublish undo is deferred as M6-D12 in `DEFERRED.md`. Onboarding-scan first-seen review remains shipped. [§A · 6.4 + M6-D12 deferred]
- **AC-6.12** — Realtime publish on `show:<id>` (M4 broadcast). [§A · 6.5/6.6]
- **AC-6.13** — exactly one `active` watch row after onboarding; renewal cron creates fresh + supersedes prior when `expires_at < now + 24h`. [§A · 6.9]
- **AC-6.14** — push happy path: edit → webhook → `last_seen_modified_time` advances within ~5s. [§A · 6.10]
- **AC-6.15** — push wrong token → 401 + `WEBHOOK_TOKEN_INVALID` admin_alerts row. [§A · 6.10]
- **AC-6.16** — push dedup: two notifications same `(drive_file_id, modifiedTime)` → exactly one Phase 2 commit; second logs `WEBHOOK_NOOP_ALREADY_SYNCED`. [§A · 6.10]
- **AC-6.17** — push-then-cron idempotency. [§A · 6.6/6.10]
- **AC-6.18** — folder-change rotation: prior folder's rows `superseded`; fresh `active` row. [§A · 6.9]
- **AC-6.19** — outbox state machine: pending row → `orphaned` + `WATCH_CHANNEL_ORPHANED`; webhook ignores non-active rows; GC `orphaned → stopped`; delete after 7d. [§A · 6.9]
- **AC-6.20** — push respects `deferred_ingestions` (`permanent_ignore` + `defer_until_modified`); cron consults same partition (`wizard_session_id IS NULL`). [§A · 6.3/6.10]
- **AC-6.21** — push monotonic guard: push that races cron rolls back as `STALE_PUSH_ABORTED`. [§A · 6.5/6.10]
- **AC-6.22** — wizard purge: starting W2 deletes W1 `pending_syncs`; Apply against W1 from stale tab → 409 `WIZARD_SESSION_SUPERSEDED`. [§A · 6.4/6.8/6.11]
- **AC-6.23** — pending-review watermark stability: cron passes against unchanged sheet do NOT rotate `staged_id` / `staged_modified_time`. [§A · 6.4]
- **AC-6.24** — watermark-as-greatest: skip when `file.modifiedTime ≤ max(last_seen, staged_modified_time)`; advance past T1 → process. [§A · 6.3]
- **AC-6.25** — webhook strict-active match: pending/orphaned/superseded/stopped channel rows do NOT match webhook lookup (410). [§A · 6.10]
- **AC-6.26** — Apply trust-boundary re-verify: source out of scope → `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`; existing-show stages restore prior status; first-seen stages log to scope-matched `pending_ingestions` partition. [§A · 6.11]
- **AC-6.27** — Apply trust-boundary on deletion: source trashed/deleted → `STAGED_PARSE_SOURCE_GONE`; same scope-matched recovery as AC-6.26. [§A · 6.11]

Note: spec also enumerates partial AC-8.9..8.13 overlap for `sync_audit`-related coverage; M8 owns the bug-report pipeline fully but Apply's `sync_audit` INSERT lands here per §6.8.3 and must not regress that contract.

## 3. Spec amendments in scope

- [ ] Amendment 1 — listForRepo recovery contract — **N/A — only M8.**
- [ ] Amendment 2 — `created_at` horizon + lease-expired reaper predicate — **N/A — only M8.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8.**
- [ ] Amendment 4 — `{v1, v2, v4}` parser registry — **N/A — only M1.**
- [ ] Amendment 5 — v4 single-marker simplification — **N/A — only M1.**
- [x] Amendment 6 — Sheets modtime-CAS binding — **IN SCOPE — shipped in Pin-stop 1.5 / Pin-stop 2.**
- [x] Amendment 7 — MI-8 / MI-8b modtime-stable debounce — **IN SCOPE — shipped as Pin-stop 2 correction.**
- [x] Amendment 8 — MI-9 LEAD-bit narrowing + `ROLE_FLAGS_NOTICE` — **IN SCOPE — shipped as Pin-stop 2 correction.**
- [ ] Amendment 9 — first-seen auto-publish + 24h unpublish undo — **DEFERRED as M6-D12.** The plan text in `06-drive-sync.md` describes the ratified target contract, but this backend handoff explicitly does not close amended AC-6.11 until M6-D12 ships.

M6 does not touch the report pipeline or the parser registry. Amendment 9 is ratified but explicitly deferred in this handoff; Tasks 6.8-6.10 and their review loop do not close amended AC-6.11.

Post-extension status: Task 6.8, the wizard-scope Apply/Discard coda for Tasks 6.11/6.12, Task 6.9, and Task 6.10 are pinned in §0 at `ddafda3` and supersede the temporary 501 wizard-scope contract from `2ae73ae`.

## 4. Pre-handoff state

- [x] **Previous milestones committed**: M0, M1, M2, M3, M4, M5 closed. Current `git log` head at handoff authoring is `afa0906 docs(plan): codify M0-M5 convergence patterns into invariants + handoff §13`. Working tree clean.
- [x] **Pre-flight tests passing in isolation** (do NOT parallelize with Playwright):
  - `pnpm lint` exits 0.
  - `pnpm typecheck` exits 0.
  - `pnpm test` exits 0 with vitest-standalone (M5 close-out: 1745 tests passing across 102 files).
  - `pnpm test:e2e --project=mobile-safari` exits 0 (M5 close-out: 56 passing + 2 documented `.skip`s).
  - `pnpm dlx supabase db reset && pnpm db:seed` applies cleanly.
- [x] **Specific files present**:
  - [x] All M0–M5 deliverables (parser modules, all schema migrations, tile components, validators, advisory-lock helper, message catalog, alert banner, error-explainer, requireAdmin production body).
  - [x] `lib/db/advisoryLock.ts` — M5-shipped helper. M6 §A consumes it AND introduces the new `lib/sync/lockedShowTx.ts` with `withShowLock` (the brand-aware variant specialized for sync's lock-owner split — the M5 helper's `withShowAdvisoryLock` is admin/auth-side ergonomics; sync-side helpers need the brand-typed `LockedShowTx<Tx>` parameter to make lock ownership unforgeable per Task 6.7).
  - [x] `lib/messages/catalog.ts` + `lib/messages/lookup.ts` — M5-shipped. M6 §A EXTENDS the catalog; §B uses `messageFor(code, params?)` for every error render in ParsePanel/StagedReviewCard.
  - [x] `components/admin/AlertBanner.tsx` + `components/messages/ErrorExplainer.tsx` — M5-shipped. M6 §B reuses both.
  - [x] `lib/email/canonicalize.ts` — M2-shipped.
  - [x] `tests/auth/_metaInfraContract.test.ts` — M5-shipped (the canonical example for the new `tests/sync/_metaInfraContract.test.ts` M6 §A creates).
  - [x] `tests/auth/advisoryLockRpcDeadlock.test.ts` — M5-shipped (the canonical example for the new `tests/sync/_advisoryLockSingleHolderContract.test.ts` M6 §A creates).
  - [x] `tests/messages/_metaAdminAlertCatalog.test.ts` — M5-shipped (M6 §A extends with new sync-side `admin_alerts` codes).
  - [x] `tests/admin/no-inline-email-normalization.test.ts` — M5-extended (covers `lib/auth/**` + `lib/data/**`). M6 §A extends to cover `lib/sync/**` + `lib/drive/**`.
  - [ ] **`lib/drive/client.ts`, `lib/drive/list.ts`, `lib/drive/fetch.ts`, `lib/drive/watch.ts` do NOT exist.** Tasks 6.1 / 6.2 / 6.9.
  - [ ] **`lib/sync/perFileProcessor.ts`, `lib/sync/phase1.ts`, `lib/sync/phase2.ts`, `lib/sync/applyParseResult.ts`, `lib/sync/runScheduledCronSync.ts`, `lib/sync/runManualSyncForShow.ts`, `lib/sync/runOnboardingScan.ts`, `lib/sync/runPushSyncForShow.ts`, `lib/sync/applyStaged.ts`, `lib/sync/lockedShowTx.ts` do NOT exist.** Tasks 6.3–6.12.
  - [ ] **`app/api/cron/sync/route.ts`, `app/api/cron/keepalive/route.ts`, `app/api/cron/refresh-watch/route.ts`, `app/api/cron/gc-watch/route.ts`, `app/api/drive/webhook/route.ts`, `app/api/admin/sync/[slug]/route.ts`, `app/api/admin/staged/[fileId]/apply/route.ts`, `app/api/admin/staged/[fileId]/discard/route.ts` do NOT exist.** Tasks 6.6 / 6.7 / 6.9 / 6.10 / 6.11 / 6.12.
  - [ ] **`app/admin/show/[slug]/page.tsx`, `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx` do NOT exist.** Task 6.11 §B.
  - [ ] **`vercel.json` cron schedules** — file may exist from M0 bootstrap; M6 Task 6.6 ADDS the cron registry entries (`*/5 * * * *` sync, `0 12 * * *` keepalive, `0 * * * *` refresh-watch, `15 * * * *` gc-watch, `30 * * * *` diagram-gc). Verify M0 didn't pre-seed mock entries.
  - [ ] **Migration for partial-index split (`pending_syncs` / `pending_ingestions` `wizard_session_id`-aware uniqueness) does NOT exist.** Task 6.8 ships it (lifted from Task 2.2 amendment).
  - [ ] **`revision_race_cooldowns` and `recovery_drift_cooldowns` tables do NOT exist.** Task 6.6 / Task 7.4 own these — verify which milestone owns each at kickoff. Spec §5.2 places the revision-race cooldown table in M6's scope.
- [x] **Specific env vars set in `.env.local`**:
  - [x] M0–M5 vars (Supabase URL/keys, JWT signing, NEXT_PUBLIC_SITE_ORIGIN, OAuth Google, ADMIN_EMAILS).
  - [ ] **M6 introduces** `GOOGLE_SERVICE_ACCOUNT_JSON` (service-account JSON for Drive API; consumed by `lib/drive/client.ts`), `DRIVE_WEBHOOK_SECRET` (random hex; sent as `X-Goog-Channel-Token` and verified at webhook entry), `DRIVE_WEBHOOK_BASE_URL` (the publicly-reachable origin Drive POSTs to — usually equal to `NEXT_PUBLIC_SITE_ORIGIN` in prod, but may differ in dev tunnel setups). Document in `.env.local.example` when each task lands.
- [x] **Database migrations applied**: all M0–M5 migrations applied to local Supabase. Task 6.8 introduces the partial-index split migration. Apply via `pnpm dlx supabase db reset && pnpm db:seed`.

If any required pre-flight command fails, do NOT start the next M6 task. Stop and report.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

Every invariant ticked here is exercised by M6's code paths.

- [x] **TDD per task** (always applies). Every task: failing test → minimal implementation → passing test → commit. Self-review runs after.

- [x] **Per-show advisory lock** (AGENTS.md §1.2 — the canonical M6 exerciser). M6 mutates **all five** of the protected tables (`shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions`). Every M6 code path that mutates any of those tables runs inside `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` (cron / push / webhook paths) or `pg_advisory_xact_lock(...)` (admin / blocking paths — manual sync, Apply, Discard).

  **Single-holder rule enumeration (M5 R20 lesson — CRITICAL deadlock class):** for each M6 hashkey, the lock is acquired at exactly ONE layer. Plan-time enumeration:

  | Code path | Hashkey source | Holder layer | Notes |
  | --------- | -------------- | ------------ | ----- |
  | `runScheduledCronSync` (cron) → `processOneFile` | `drive_file_id` | JS-side via `withShowLock` (`tryOnly: true`) | Phase 1 + Phase 2 share the SAME tx (single-transaction lock contract per Task 6.6). `runPhase1_unlocked` / `runPhase2_unlocked` accept `LockedShowTx<Tx>`; never reach for the lock themselves. |
  | `runPushSyncForShow` → `processOneFile` | `drive_file_id` | JS-side via `withShowLock` (`tryOnly: true`) | Same path as cron; mode differs only. |
  | `runManualSyncForShow` (admin "Re-sync") → `processOneFile_unlocked` | `drive_file_id` | JS-side via `withShowLock` (`tryOnly: true`, returns `CONCURRENT_SYNC_SKIPPED` — NOT blocking — admin click should fail-fast under contention rather than queueing). |
  | `handleDriveFetchFailure` | `drive_file_id` | JS-side via `withShowSyncTransaction` + own `pg_try_advisory_xact_lock` per Task 6.6 helper | Lock-acquisition code-reviewed in M5-style enumeration; document at task time whether to migrate to `withShowLock` or keep inline. |
  | `applyStaged` (live-scope) | `drive_file_id` | JS-side via `withShowLock` (`tryOnly: false` — admin path; blocking) | The Apply route should NOT re-enter via in-RPC lock; the SQL it issues runs against the held tx. |
  | `applyStaged` (wizard-scope, Phase A pre-commit work) | none | NO advisory lock (lock-free byte-fetch + Drive verify; Phase B per-row lock comes later) | Phase B (per-row commit) does take `withShowLock(driveFileId, ..., tryOnly: false)` per row. |
  | `applyStaged` finalize Phase B (per row) | `drive_file_id` | JS-side via `withShowLock` per row | Each row gets its own independent transaction + lock; per-row aborts don't cascade. |
  | `applyStaged` finalize Phase D | `app_settings.id = 'default'` | Different key (`app_settings`-keyed advisory or row lock); NOT the per-show key. | Owned by Task 10.5 atomic-promotion CAS contract; M6 only writes the `published = TRUE` flip + `subscribeToWatchedFolder` outside the lock. |
  | Discard route (live-scope) | `drive_file_id` | JS-side via `withShowLock` (`tryOnly: false`) | Per Task 6.12 explicit invariant: admin/operator paths use blocking lock. |
  | Discard route (wizard-scope) | `drive_file_id` | JS-side via `withShowLock` (`tryOnly: false`) | Same as live-scope. |
  | `runOnboardingScan` (per file UPSERT into wizard partition) | none | NO advisory lock (wizard-session CAS replaces lock; partial-index split + `WHERE EXISTS` predicate provides isolation) | If a future caller also takes an advisory lock against the same file, `tests/sync/_advisoryLockSingleHolderContract.test.ts` MUST fire. |
  | `subscribeToWatchedFolder` / `refreshWatchSubscriptions` / `gcWatchChannels` | n/a (folder-keyed, not show-keyed) | Different lock domain (folder-id-keyed, NOT show-keyed) — single-active-per-folder index handles concurrency | Document the SQL path; should NOT touch show-keyed advisory locks. |
  | Webhook handler (`/api/drive/webhook`) | resolved-via-channel-lookup `drive_file_id` | JS-side via `withShowLock` (`tryOnly: true`) once dispatched to `runPushSyncForShow` → `processOneFile` | Webhook entry itself doesn't lock; dispatched orchestrator does. |

  **Test command:** `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts` (NEW — see §13). Plus the M5-shipped `pnpm test tests/auth/advisoryLockRpcDeadlock.test.ts` continues to pass (extended to cover sync-side keys).

- [x] **Email canonicalization at boundary** (AGENTS.md §1.3 — Drive sync IS the boundary class). Drive sheets contain crew emails; every email read MUST route through `lib/email/canonicalize.ts` BEFORE any DB query. The parser already canonicalizes per M1 contract; M6 §A code that reads emails from `pending_syncs.parse_result` payloads OR from manual UI input (admin "Apply with reviewer choices" reviewer-choices payload) MUST re-canonicalize at the boundary, NOT trust the JSONB blob. Static guard already exists at `tests/admin/no-inline-email-normalization.test.ts` — Task 6.4 / Task 6.11 EXTEND its glob to cover `lib/sync/**` and `lib/drive/**`. Verification command: `pnpm test tests/admin/no-inline-email-normalization.test.ts`.

- [x] **No global cursor** (AGENTS.md §1.4 — M6 IS the milestone establishing `shows.last_seen_modified_time` as the per-show watermark). Plan-wide regression: `! rg "lastPollAt" lib app supabase tests` returns zero matches. M5 already passes this; M6 must NOT regress.

- [x] **No raw error codes in user-visible UI** (AGENTS.md §1.5). Every M6 producer code that surfaces in admin UI (the parse panel error states, the alert banner sync-side codes) routes through `lib/messages/lookup.ts` `messageFor(code, params?)`. Codex extends the catalog in §A; Opus consumes via `<ErrorExplainer>` in StagedReviewCard. Test command: a regression spec that scans every M6-introduced page DOM for raw `STAGED_*` / `STALE_*` / `WIZARD_*` / `WATCH_*` / `WEBHOOK_*` / `LIVE_*` / `MISSING_REVIEWER_*` / `INVALID_REVIEWER_*` / `SHOW_BUSY_*` literal strings (excluding `data-testid` + HTML comments) and fails if any are found.

- [x] **Commit per task** (AGENTS.md §1.6). One task per commit, conventional-commits format. Common scopes for M6: `drive`, `sync`, `admin`, `db`. Don't batch tasks. Both implementers commit per task.

- [x] **Spec is canonical** (AGENTS.md §1.7). Three §13.2.3 amendments + the two parser-registry amendments are the only places where the plan supersedes the spec. Anywhere else the spec wins; open a question instead of silently fixing.

- [x] **UI quality gate (impeccable v3 critique + audit pair)** (AGENTS.md §1.8). §B's surface (`app/admin/show/[slug]/page.tsx`, `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx`) goes through `/impeccable critique` AND `/impeccable audit` before adversarial review. Findings + dispositions go in §12 below.

- [x] **Supabase call-boundary discipline** (AGENTS.md §1.9 — distilled from M5 R3–R22). Every Supabase client call in §A's new modules destructures `{ data, error }`; returned-error and thrown-error paths are distinguished; infra faults surface as discriminable typed results (`{ kind: 'infra_error' }` or typed `*InfraError` thrown), never as silent `continue` or benign auth signals. Every helper subject to this contract is registered in the new `tests/sync/_metaInfraContract.test.ts` (see §13). New call sites EITHER add a registry row OR carry an inline `// not-subject-to-meta: <reason>` comment.

## 6. Watchpoints from prior adversarial review

M6 has not yet been implemented; no prior M6 convergence log exists. Watchpoints below are derived from M0–M5 convergence logs (M5 SR-1..SR-9 and R3–R22 are the most directly relevant) plus the global CLAUDE.md / AGENTS.md additions, filtered for M6-applicable failure modes.

### M5-carry-forward classes (still active in M6)

1. **Single-holder advisory-lock rule (M5 R20 CRITICAL — DEADLOCK CLASS).** Never have two layers acquire the same hashkey. M6 is the canonical exerciser of the per-show advisory lock; the §5 Plan-wide invariant table above enumerates every code path's holder layer. The new structural guard at `tests/sync/_advisoryLockSingleHolderContract.test.ts` extends the M5-shipped `tests/auth/advisoryLockRpcDeadlock.test.ts` pattern to sync-side surfaces. Whenever M6 touches `pg_advisory*` SQL — whether in JS-side wrappers, in `withShowLock` callers, in SECURITY DEFINER RPCs, or in raw migrations — the Fix-round regression budget rule applies (re-grep the class across the surface after each patch; confirm the meta-test still passes; note both in round closure).

2. **Supabase call-boundary discipline (M5 R3–R22 — six consecutive bug-class rounds).** The M5 retrospective lesson: pre-emptively register every helper at plan time rather than discover it at round 14. M6's analogous registry is `tests/sync/_metaInfraContract.test.ts`. Every new Supabase call in `lib/sync/**` or `lib/drive/**` MUST destructure `{ data, error }` (NOT bare `data`); MUST distinguish returned-error vs thrown-error paths; MUST NOT mask infra faults as benign continue / skip / auth signals. Each helper either registers a row in the meta-test OR carries an inline `// not-subject-to-meta: <reason>` comment.

3. **`admin_alerts.upsert(...)` requires non-null `dougFacing` and returned-error inspection (M5 R21 F2 + R22 F1).** Every catalog code used in production `admin_alerts.upsert` MUST have non-null `dougFacing`. M6 introduces `WATCH_CHANNEL_ORPHANED`, `WEBHOOK_TOKEN_INVALID`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `LIVE_ROW_CONFLICT` as new admin_alerts producer codes — each MUST land in the catalog with non-null `dougFacing` AND a registered row in `tests/messages/_metaAdminAlertCatalog.test.ts`. Returned-error from `.upsert(...)` MUST throw and route to the cataloged 503 path, NOT silently continue.

4. **Operator-log producers deferred to M6/M8 (M5-D9 / M5-D10 / M5-D11).** Three M5 deferrals route here. Decide on Day 1 whether the structured operator-log sink lands in M6 or M8. If M6: §A authors `lib/operatorLog/sink.ts`, the migration that backs it, and wires the M5 OAuth callback / redeem-link / sign-out producers; mark M5-D9/D10/D11 Resolved. If M8: leave them deferred. Either way, M6 MUST NOT silently skip — explicit decision.

5. **Class-sweep before patching review findings.** When the reviewer surfaces a bug, grep the codebase for the same class BEFORE patching only the named instance. This is the canonical M5 lesson (R19→R20 was the painful counter-example).

6. **Negative-regression verification.** Every new test in M6 MUST have its production-side fix stashed and the test confirmed-failing before shipping. Tautological tests passed M5 spec+code-quality reviews and only failed under stash-then-verify (`feedback_negative_regression_verification.md`).

7. **Iterate adversarial review until APPROVE.** Round-3 cap is for value-judgment loops, NOT for halting when each round surfaces NEW bugs. M5 ran R3–R22 + SR-1..SR-9. M6 should expect similar — see §10 below.

### M6-specific watchpoints

8. **Single-transaction lock contract for Phase 1 + Phase 2 (Task 6.6).** Postgres advisory `pg_try_advisory_xact_lock` releases at COMMIT/ROLLBACK. If Phase 1 and Phase 2 each open and close their own transaction, the lock dies between them and a concurrent worker can interleave a stale Phase 2 between the first worker's Phase 1 stage and Phase 2 commit. The orchestrator owns ONE transaction spanning lock acquisition through Phase 2 commit/rollback. Task 6.4's Step 1 failing tests already pin "`runPhase1` does NOT call `pg_try_advisory_xact_lock` itself"; the concurrency regression test in Task 6.6 spawns two `processOneFile` calls and asserts the second hits `CONCURRENT_SYNC_SKIPPED`.

9. **Per-show advisory lock key derives from `hashtext('show:' || drive_file_id)`, NOT `show_id` and NOT `slug`.** Per spec §1.2 / AGENTS.md §1.2. Cron and admin paths must converge on the same hashkey or the lock provides no isolation. First-seen sheets (no `shows` row yet) STILL use `drive_file_id` so the lock is consistent across "first-seen" and "existing-show" paths.

10. **Same-revision binding contract (Task 6.6 §A — split spreadsheet vs binary-asset binding per plan amendment 6 + Pin-1.5 deviation).**

    **For the spreadsheet itself (Workspace-native Sheet)** — full revision pinning is unavailable per Drive API v3 docs (`headRevisionId` is "currently only available for files with binary content"). The strongest available contract is **modifiedTime CAS**: `runScheduledCronSync` MUST capture `binding = { bindingToken, modifiedTime }` BEFORE xlsx export, where `bindingToken = metadata.headRevisionId ?? metadata.modifiedTime`. It MUST run all enrichment substeps against the captured token, then re-verify the token after the xlsx fetch AND again before entering the Phase-1/Phase-2 transaction. Three classes trigger `STAGED_PARSE_REVISION_RACE` (NOT generic `drive_error`):

    - (a) **post-fetch token mismatch** — `metadata.modifiedTime` (or `headRevisionId` if present) moved between starting capture and the post-byte-fetch metadata re-read
    - (b) **xlsx export path failure mid-flight** — `files.get` returns no xlsx export link, OR the authenticated fetch against the xlsx URL returns 404
    - (c) **post-enrichment token mismatch** — token moved between starting capture and the final pre-Phase-1 re-verify (covers the case where Doug edits during enrichment substeps even if the xlsx fetch itself completed cleanly)

    **For embedded-image and linked-folder Drive-file fetches (binary targets)** — full revision pinning DOES work and is preserved. Per spec §6.11 the `(sheetsRevisionId, embeddedFingerprint)` and `(headRevisionId, md5Checksum)` immutable-pin contracts apply because these targets are binary files. Per-asset failures (`revisions.get` 404 specifically because the bound revision was retired; pinned-bytes fetch 404; `md5Checksum` mismatch on buffer-then-verify) ARE classified as `STAGED_PARSE_REVISION_RACE` for those targets, exactly as spec §5.2 / §6.11 specify. **Asymmetry summary:** spreadsheet-level binding = modtime CAS; per-asset binary binding = full revision pinning.

    The `STAGED_PARSE_SOURCE_GONE` case (`files.get` returns 404 because the spreadsheet itself was trashed / the parents no longer include the watched folder) is a distinct class — preserve the classification. Each `STAGED_PARSE_REVISION_RACE` class above must NOT advance `last_seen_modified_time`, MUST NOT call `runPhase1`, MUST emit `STAGED_PARSE_REVISION_RACE` to `sync_log`.

    Earlier handoff drafts listed five classes including `drive.revisions.list` mismatch and `revisions.get` 404 *for the spreadsheet itself*; both are retired here because Drive's `revisions` resource is structurally empty for Workspace-native files. They survive only for binary-asset targets per the asymmetry above.

11. **Revision-race cooldown gate (Task 6.6 §A).** A hot sheet (Doug repeatedly editing) would burn Drive API quota indefinitely without the cooldown. Spec §5.2 specifies `revision_race_cooldowns(drive_file_id, head_revision_id, last_race_at, retry_count)` with composite PK. Backoff = `LEAST(60 * 2^retry_count, 600)` seconds. Manual override skips the gate; successful Phase 2 commit clears it. The seven-class test matrix in Task 6.6 Step 1 covers all branches.

12. **Phase 2 destructive transaction MUST hold the lock for the entire `pending_syncs` → live-table swap.** Don't release the lock between `pending_syncs` SELECT and `shows` UPDATE — between releases another worker can re-stage. Task 6.5 Step 2 write-order list pins this: `crew_members` DELETE-first then UPSERT (regression test for partial-unique-index violation on rename-keeping-email); `crew_member_auth` provisioning; removal `revoked_below_version` bumps; snapshot-replacement for hotels/rooms/transport/contacts; `shows_internal` UPSERT; first-seen Apply DELETEs matching `pending_ingestions`.

13. **Phase 2 stamps `last_seen_modified_time` from `binding.modifiedTime`, NOT `fileMeta.modifiedTime`.** `fileMeta` comes from `files.list` and can be stale by the time enrichment finishes. Task 6.5 Step 3b is the regression.

14. **Drive list endpoint pagination — don't trust `modifiedTime` ordering.** Task 6.2's tests assert `q=` includes parent constraint AND mimeType filter; paginates through `nextPageToken`; rejects file whose `parents` doesn't contain the watched folder (`UNEXPECTED_PARENT` warning). Folder enumeration with cursor or full-pass is the correct primitive — don't depend on Drive sorting by `modifiedTime`.

15. **Drive push webhook idempotency — same channel + same `X-Goog-Resource-State` can fire multiple times.** Use `(drive_file_id, modifiedTime)` dedup gate per AC-6.16; second notification logs `WEBHOOK_NOOP_ALREADY_SYNCED` and short-circuits BEFORE acquiring the lock. Webhook 8-step verification (Task 6.10 Step 2): header presence → channel lookup with strict `status='active'` → constant-time token compare → resource cross-check → state filter (only `add`/`update` enqueue) → folder-listing dispatch → dedup short-circuit → fast 200 OK.

16. **Watch channel lifecycle alert code is `WATCH_CHANNEL_ORPHANED`.** Earlier plan text used `WATCH_CHANNEL_CREATE_FAILED`; canonical name is `WATCH_CHANNEL_ORPHANED`. Operator alerting cannot split across two codes for one failure class. If any prior milestone left the older name in catalog or code, fix it under Task 6.9.

17. **Asset recovery race (Task 7.4 territory but storage write happens in M6 Apply path).** If storage write succeeds but DB transaction commit fails, the storage object is orphaned. Cleanup via the `diagram-gc` cron (Task 7.8 — M7). M6 must NOT add storage objects without confirming the cleanup path will see them. The current/pending sub-payload split per spec §4.1 / §6.11 (M7 batch-17 finding 1) ensures `current` is never overwritten until `pending` cutover commits; M6's Phase 2 writes ONLY `pending` and the post-commit promoter does the atomic cutover.

18. **Realtime broadcast invalidation must fire AFTER Phase 2 commits.** Already wired in M4 via `crew_member_auth.last_changed_at` trigger; Phase 2 must update the right rows for the broadcast to fire. Task 6.5 Step 2 list includes `crew_member_auth` writes that satisfy this.

19. **Watch channel renewal hourly cron must not race with manual admin re-syncs.** Both `subscribeToWatchedFolder` (called from `refreshWatchSubscriptions` and from the wizard finalize Phase D) AND the manual re-sync route (`runManualSyncForShow`) operate at different scopes (folder-keyed vs show-keyed) so they don't compete for the same advisory lock — but Task 6.9's atomic supersede-then-activate must be transactional so a half-supersede/half-activate window can't expose an inconsistent watch state.

20. **Wizard-isolation partial-index split (Task 6.8 §A).** The `pending_syncs` and `pending_ingestions` PKs change from `drive_file_id` to a surrogate `id`, with TWO partial unique indexes: `(drive_file_id) WHERE wizard_session_id IS NULL` (live partition) and `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL` (wizard partition). Every UPSERT specifies the correct partial index in `ON CONFLICT`. Every read-side SELECT carries `AND wizard_session_id IS NULL` (live) or `AND wizard_session_id = $session` (wizard). The introspection matrix's grep-for-pattern test catches any unscoped `SELECT FROM pending_syncs` / `pending_ingestions` in `lib/sync/**` and `app/admin/**`. The schema-state probe at scan start (Task 6.8 Step 2 (A) — `pg_indexes` query for the four expected indexes) ABORTS with `WIZARD_ISOLATION_INDEXES_MISSING` BEFORE issuing any UPSERT if the migration hasn't been applied.

21. **Apply CAS source scope is mandatory (Task 6.11).** After the partial-index split, a wizard onboarding row and a live row coexist on the same `drive_file_id`. Apply's selector MUST disambiguate by source context (route's URL or request-body `source_scope`) BEFORE reading `pending_syncs`. Scope is REQUIRED on the Apply call, NOT inferred from the row content; inferring scope from the SELECTed row's `wizard_session_id` value would let an unscoped SELECT return the wrong row in coexistence and back-derive the wrong scope. Same applies to Discard (Task 6.12).

22. **Wizard-scope Apply is Phase-1-only (Task 6.11 split contract).** Live-scope Apply runs full Phase 2 (4L → 5L → 6L → 7L); wizard-scope Apply runs Phase-1-only approval (4W → 5W → 6W) — atomically `UPDATE pending_syncs SET wizard_approved = TRUE`, UPDATE manifest row to `'applied'`. Does NOT mutate `shows`, does NOT INSERT `sync_audit`, does NOT DELETE the staged row, does NOT mint a fresh `snapshot_revision_id`. The approved row stays in `pending_syncs` carrying its full immutable approval payload until Task 10.x finalize promotion. CHECK constraint `wizard_approved = false OR (wizard_approved_by_email IS NOT NULL AND wizard_approved_at IS NOT NULL AND wizard_reviewer_choices IS NOT NULL)` enforces.

23. **`FINALIZE_OWNED_SHOW` two-arm guard (Task 6.7 Step 2b).** BEFORE acquiring the per-show advisory lock, `runManualSyncForShow` checks both arms: arm A matches first-seen interim rows (`shows.published = FALSE` + manifest applied + checkpoint in-progress); arm B matches existing-show shadow-surface rows (`shows_pending_changes` + checkpoint in-progress). Single-arm guard would let an existing-show stale tab slip through and Phase-2-clobber the live row mid-finalize. Task 6.7 Step 1 has the test matrix.

24. **Asset-review item Apply-time effects (Task 6.11 — four variants with snapshot-mutation invariant).** Every successful Apply that mutates `shows.diagrams` MUST mint a fresh `snapshot_revision_id`; an Apply that does NOT mutate `shows.diagrams` MUST NOT touch the column. The four variants split:
    - `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE` — technical failure; **non-mutating** Apply unless retry succeeds; emit `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` admin_alerts
    - `DIAGRAMS_EMBEDDED_NONE_FOUND` — operator-confirmation; **mutating** Apply (replace prior gallery with empty); fresh `snapshot_revision_id` minted; `snapshot_status = 'complete'`
    - `DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING` — operator-confirmation; **mutating** Apply (snapshot only entries that re-verify); `snapshot_status = 'partial_failure'` if any drift remains
    - `REEL_DRIFT_PENDING` — operator-confirmation; persist ALL FOUR reel columns as NULL atomically (not part of `diagrams`; snapshot-mutation invariant doesn't apply)
    Reviewer-choices validator treats all four as `apply`-only (no `reject`, no `rename`); validator test matrix is Task 6.11 Step 1.

25. **Pre-draft code-verification pass (AGENTS.md writing-plans rule).** Before Codex writes any test that names a specific table column, RPC argument, RLS policy, constraint, or fixture shape, grep against the live codebase. M2 schema already defines column names; M5 already defines the message catalog shape and `withShowAdvisoryLock` interface. Don't invent.

26. **Self-consistency sweep (AGENTS.md writing-plans rule).** At M6 close: `! rg "lastPollAt" lib app supabase tests` returns zero. `! rg "WATCH_CHANNEL_CREATE_FAILED" lib app supabase tests` returns zero (canonical name is `WATCH_CHANNEL_ORPHANED`). `! rg "SELECT .* FROM pending_syncs" lib/sync app/admin | rg -v "wizard_session_id"` returns zero (every read carries scope predicate). `! rg "drive\.google\.com|docs\.google\.com" components app/show` returns zero matches (M4 invariant preserved). Same five gates that passed M5 must still pass.

## 7. Test commands

- **Pre-flight and final gate**: `pnpm test && pnpm lint && pnpm typecheck`. Do NOT parallelize `pnpm test` with Playwright.
- **Vitest unit / sync / drive tests**: `pnpm test tests/drive/client.test.ts`, `pnpm test tests/drive/list.test.ts`, `pnpm test tests/drive/fetch.test.ts`, `pnpm test tests/drive/watch.test.ts`, `pnpm test tests/drive/webhook.test.ts`, `pnpm test tests/sync/perFileProcessor.test.ts`, `pnpm test tests/sync/phase1.test.ts`, `pnpm test tests/sync/phase2.test.ts`, `pnpm test tests/sync/runScheduledCronSync.test.ts`, `pnpm test tests/sync/runManualSyncForShow.test.ts`, `pnpm test tests/sync/onboarding.test.ts`, `pnpm test tests/sync/runPushSyncForShow.test.ts`, `pnpm test tests/sync/applyStaged.test.ts`, `pnpm test tests/sync/discardStaged.test.ts`.
- **Meta-tests (NEW for M6)**: `pnpm test tests/sync/_metaInfraContract.test.ts`, `pnpm test tests/sync/_advisoryLockSingleHolderContract.test.ts`. Plus M5-shipped meta-tests still passing: `pnpm test tests/auth/_metaInfraContract.test.ts`, `pnpm test tests/messages/_metaAdminAlertCatalog.test.ts` (extended with M6 codes), `pnpm test tests/auth/advisoryLockRpcDeadlock.test.ts`, `pnpm test tests/admin/no-inline-email-normalization.test.ts` (extended to `lib/sync/**` + `lib/drive/**`).
- **Playwright e2e (mobile-safari, primary)**: `pnpm test:e2e --project=mobile-safari`.
- **Playwright e2e (admin parse panel — §B)**: `pnpm test:e2e tests/e2e/admin-parse-panel.spec.ts`.
- **Playwright e2e (cron + push smoke — §A)**: `pnpm test:e2e tests/e2e/sync-cron.spec.ts`, `pnpm test:e2e tests/e2e/sync-push.spec.ts` (if implemented as e2e — may be unit-tested instead).
- **DB schema introspection regression** (M2 baseline + M6 partial-index split): `pnpm test tests/db/`. After Task 6.8's migration lands, verify the four expected partial indexes are pinned by name AND definition.
- **Layout-dimensions test** (if §B's ParsePanel introduces a fixed-dimension parent): `pnpm test:e2e tests/e2e/layout-dimensions.spec.ts --project=mobile-safari` AND `--project=desktop-chromium`.
- **Cron route smoke** (after §A ships routes; manual curl during demo): `curl -X POST $NEXT_PUBLIC_SITE_ORIGIN/api/cron/sync` (with the cron auth header), expect 200 and `sync_log` rows.
- **Webhook smoke** (during demo): edit a fixture sheet in Drive; observe webhook delivery in `drive_watch_channels` and `pending_syncs` mutations.
- **Supabase reset + seed** (full reset including new M6 migrations): `pnpm dlx supabase db reset && pnpm db:seed`.

## 8. Exit criteria

- [ ] Tasks 6.1–6.13 in `06-drive-sync.md` all checked off (`- [x]` on every step).
- [ ] All AC-6.1..AC-6.27 each have at least one passing assertion.
- [ ] All M6 §A files (`lib/drive/*.ts`, `lib/sync/*.ts`, `app/api/cron/*`, `app/api/drive/webhook/route.ts`, `app/api/admin/sync/[slug]/route.ts`, `app/api/admin/staged/[fileId]/{apply,discard}/route.ts`, `lib/sync/lockedShowTx.ts`) exist with the documented contracts.
- [ ] All M6 §B files (`app/admin/show/[slug]/page.tsx`, `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx`) exist.
- [ ] `vercel.json` has the five M6 cron schedules.
- [ ] `lib/messages/catalog.ts` extended with all M6 sync codes (verbatim §12.4 copy); `tests/messages/_metaAdminAlertCatalog.test.ts` extended to cover new admin_alerts codes.
- [ ] `tests/sync/_metaInfraContract.test.ts` exists with every M6 helper subject to the contract registered.
- [ ] `tests/sync/_advisoryLockSingleHolderContract.test.ts` exists with every M6 hashkey holder pinned.
- [ ] Migration shipping `pending_syncs` + `pending_ingestions` partial-index split (`(drive_file_id) WHERE wizard_session_id IS NULL` + `(drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL`) applied; introspection assertions in `tests/db/schema-introspection.test.ts`.
- [ ] Migration shipping `revision_race_cooldowns` table (composite PK `(drive_file_id, head_revision_id)`) applied; introspection asserted.
- [ ] `pnpm test && pnpm lint && pnpm typecheck` exits 0 (vitest standalone, not parallel with Playwright).
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0.
- [ ] `! rg "lastPollAt" lib app supabase tests` returns zero matches.
- [ ] `! rg "WATCH_CHANNEL_CREATE_FAILED" lib app supabase tests` returns zero matches (canonical alert code is `WATCH_CHANNEL_ORPHANED`).
- [ ] `! rg "drive\.google\.com|docs\.google\.com" components app/show` returns zero matches (M4 invariant preserved).
- [ ] `! rg "viewerRole" lib app components` returns zero matches (M4 invariant preserved).
- [ ] `! rg "__Host-fxav_session" lib app components | rg -v "lib/auth/cookies.ts|lib/auth/constants.ts"` returns zero matches (M5 invariant preserved).
- [ ] Every `SELECT FROM pending_syncs` and `SELECT FROM pending_ingestions` in `lib/sync/**` and `app/admin/**` carries a `wizard_session_id` scope predicate (introspection grep).
- [ ] All commits follow `<type>(<scope>): <summary>` format. One commit per task. Both implementers.
- [ ] **Impeccable evaluation §12 closed** for §B's UI surface (`/impeccable critique` AND `/impeccable audit` ran with the canonical v3 preflight; HIGH/P0/P1 findings either fixed or DEFERRED with target milestone).
- [ ] Adversarial review (per `superpowers:adversarial-review` with Opus 4.7 / Claude Code per ROUTING.md) ran to convergence — recorded below.
- [ ] Decision recorded on M5-D9 / M5-D10 / M5-D11 (operator-log sink lands in M6 vs M8).
- [ ] Working tree clean except for intentionally uncommitted handoff convergence-log updates left for the adversarial reviewer.

## 9. Sandbox / git protocol

This is a split-mode milestone, so BOTH rows below apply.

- [ ] **Claude Code (§B / Opus side):** commits run in-session, no sandbox issue. Use `git add <specific files>` (NOT `git add -A`), then `git commit -m "feat(...): <summary>"` per AGENTS.md §1.6.
- [ ] **Codex CLI (§A side):** verify before starting whether the sandbox is relaxed for this repo. Run `git status` first; if it errors with permission-denied, use the patch-then-commit-outside protocol per HANDOFF-TEMPLATE.md §9 bullet 2 (Codex prints per-task commit messages; the orchestrator does `git add` + `git commit` outside the sandbox after each task). If `--full-auto` or equivalent is set for this repo, commits run in-session per AGENTS.md "Codex-specific notes" sandbox row.

**Cross-implementer git hygiene:** both implementers pull before committing (rebase, do NOT merge — preserve linear history). Don't squash or rebase across the implementer boundary; keep authorship clean for the convergence log.

## 10. Adversarial review handoff

After §A and §B both complete:

1. Each implementer summarizes what was built and confirms each per-task checklist is `- [x]`. The orchestrator (Claude Code) reconciles into a single milestone summary.
2. The adversarial reviewer (Opus 4.7 / Claude Code per ROUTING.md M6 row) is invoked via `/codex:adversarial-review --base afa0906 --scope branch` (or the milestone-base SHA at kickoff). Inputs: §3.2 + §4.5 + §5 + §6.8 + §6.11 + §17.1 of the spec, the M6 plan (`06-drive-sync.md`), this handoff, and the diff `git diff <M6-base-SHA>..HEAD -- 'lib/drive/**' 'lib/sync/**' 'app/api/cron/**' 'app/api/drive/**' 'app/api/admin/sync/**' 'app/api/admin/staged/**' 'app/admin/show/**' 'components/admin/ParsePanel.tsx' 'components/admin/StagedReviewCard.tsx' 'lib/messages/catalog.ts' 'tests/drive/**' 'tests/sync/**' 'tests/e2e/admin-parse-panel.spec.ts' 'tests/e2e/sync-cron.spec.ts' 'tests/e2e/sync-push.spec.ts' 'tests/messages/_metaAdminAlertCatalog.test.ts' 'tests/db/schema-introspection.test.ts' 'supabase/migrations/2026050800*' 'vercel.json'`.
3. Reviewer iterates with implementers until convergence (no new issues raised in a round) or until ambiguity requires a human decision. **Per the M5 retrospective, expect 5–15 rounds.** M5 ran R3–R22 (cross-CLI) + SR-1..SR-9 (Codex self-review) — 13 cross-CLI findings + 28 Codex commits before APPROVE. The meta-test inventory in §13 below should reduce churn but won't eliminate it; sync is the deepest invariant-density surface in the project.
4. Each round's findings are routed by file path:
   - Backend (`lib/sync/**`, `lib/drive/**`, `app/api/cron/**`, `app/api/drive/**`, `app/api/admin/staged/**`, `app/api/admin/sync/**`, migrations) → Codex via `/codex:rescue --resume-last` (per `feedback_adversarial_review_repair_routing.md` — `--resume-last` continues the review thread, NOT a fresh spawn).
   - UI (`app/admin/show/**`, `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx`) → Opus inline (this session).
   - Cross-implementer findings (e.g., a backend contract that requires a UI change) get coordinated through this doc's convergence log.
5. **Adversarial review must keep full-milestone scope, not narrow per-round** (`feedback_adversarial_review_full_milestone_scope.md`). Each round anchors to the M6 milestone-base SHA, not the previous round's fix-base. The final APPROVE attests to the whole milestone, not just the latest fix.
6. **Every review round starts fresh-eyes.** Round-N review focus text leads with a fresh-eyes audit of the full current milestone diff against the spec / plan / watchpoints (`feedback_review_prompt_fresh_eyes_first.md`). Prior findings + commit SHAs are allowed only as a secondary regression checklist after the fresh-eyes instruction; never narrow a round to "verify the previous fixes only."
7. Convergence is logged at the bottom of this file.
8. **Canonical invocation discipline.** Cross-CLI Codex reviews go through `/codex:adversarial-review` slash command with proper `CLAUDE_PLUGIN_DATA` per-session scoping + dynamic `CLAUDE_PLUGIN_ROOT` resolution. Do NOT raw-shell `node codex-companion.mjs`.
   - **Codex → Claude CLI caveat (Pin-stop 1 discovery):** `claude --bare` skips OAuth/keychain reads and authenticates only via `ANTHROPIC_API_KEY` / `apiKeyHelper`. In this repo's current Claude Code setup (`authMethod: claude.ai`), `claude -p ... --bare` fails with `Not logged in`; use normal `claude -p ...` for cross-model review unless an API-key auth path is explicitly configured.
9. **Class-sweep before patching findings; meta-contract test when bug class recurs.** Both rules are now load-bearing project invariants per AGENTS.md and the M5 retrospective. M6 §13 below pre-declares the meta-tests so the rule kicks in at plan time, not round 14.

## 11. Cross-milestone dependencies

**(a) M2 schema (`pending_syncs`, `pending_ingestions`, `watch_channels`, `app_settings.last_drive_full_scan_at`).** M2 shipped the base tables. M6 Task 6.8 amends `pending_syncs` + `pending_ingestions` with the partial-index split per spec §4.5. The same migration extends Task 2.2's introspection matrix.

> **Recommended disposition:** Codex ships the partial-index migration AS PART of M6 Task 6.8 (NOT folded back into M2's migration file — schema changes are append-only). The migration file is timestamped `2026050800000<n>_pending_syncs_partial_index_split.sql`. Task 2.2's introspection test gets new assertions in the same commit.

**(b) M4 Realtime broadcast (Phase 2 commit must trigger `crew_member_auth.last_changed_at` update for the broadcast to fire).** M4 Task 4.16 already shipped the trigger; M6 Phase 2 must update `crew_member_auth` rows on add/remove/role-change so the broadcast fires.

> **Recommended disposition:** No new code on the M4 side — Task 6.5 Step 2 write-order list ensures `crew_member_auth` writes happen. Task 6.5's Step 1 failing tests should include "Realtime broadcast received on `show:<id>` after Phase 2 commit" via the same harness M4 used.

**(c) M5 advisory-lock helper.** `lib/db/advisoryLock.ts` (M5-shipped, exposing `withShowAdvisoryLock(showId, mode, fn)`) is the auth-side ergonomic helper. M6 introduces a NEW sync-specialized helper `lib/sync/lockedShowTx.ts` (`withShowLock` + branded `LockedShowTx<T>` + DEV `assertShowLockHeld`) per Task 6.7 because sync's lock-owner split needs the brand-typed `LockedShowTx<Tx>` parameter to make lock ownership unforgeable end-to-end.

> **Recommended disposition:** DO NOT modify `lib/db/advisoryLock.ts` — the auth-side callers depend on its current API. Add `lib/sync/lockedShowTx.ts` as a new module. The two helpers may share a `hashtext('show:' || drive_file_id)` derivation utility (suggest extracting to `lib/db/showLockKey.ts` if the duplication grows past 2 call sites).

**(d) M5 messages catalog.** `lib/messages/catalog.ts` (M5-shipped) and `lib/messages/lookup.ts` `messageFor(code, params?)` are reused. M6 §A EXTENDS the catalog with sync-side codes (full list in §0 §A bullet); §B consumes via `<ErrorExplainer>`.

> **Recommended disposition:** Codex extends the catalog in Task 6.4 / 6.6 / 6.10 / 6.11 / 6.12 in the same commits that produce each code. The `tests/messages/_metaAdminAlertCatalog.test.ts` registry adds rows for `WATCH_CHANNEL_ORPHANED`, `WEBHOOK_TOKEN_INVALID`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `LIVE_ROW_CONFLICT`.

**(e) M7 (linked content asset routes consume `snapshotAssets` output).** Task 6.11's Apply path mints fresh `snapshot_revision_id` values that M7's `/api/asset/diagram/[show]/[rev]/[key]` route consumes. The current/pending sub-payload split per spec §4.1 / §6.11 (M7 batch-17 finding 1) ensures Phase 2 writes ONLY `pending` and the post-commit promoter does the atomic cutover; M6 must not write `current` directly.

> **Recommended disposition:** Task 6.11 documents the `pending` write contract at the top of `lib/sync/applyStaged.ts`; M7 owns the post-commit promoter and the `/api/asset/**` routes. M6 §A authors only the `pending` write. If M7 hasn't shipped at M6 close, M6's Phase 2 leaves `current` untouched and `pending` populated; M7 will cut over later.

**(f) Operator-log sink (M5-D9 / M5-D10 / M5-D11 carry-forward).** Three M5 deferrals route to M6 OR M8. **Decision required at M6 kickoff.**

> **Recommended disposition:** Default to M8 (the bug-report pipeline milestone) unless the orchestrator explicitly opts-in for M6. M6 is already invariant-dense; adding the operator-log sink to M6's scope risks blowing past 15 rounds. If M8: leave M5-D9/D10/D11 in DEFERRED.md unchanged; M6 §A may emit operator-log calls behind a feature-flag stub (`if (operatorLog?.emit) operatorLog.emit({ code, payload })`) so the wiring is in place when M8 lands. If M6: §A authors `lib/operatorLog/sink.ts` + the migration + the wiring; mark M5-D9/D10/D11 Resolved at M6 close.

**(g) M10 onboarding wizard.** `runOnboardingScan` ships in M6 (Task 6.8); the wizard pages that call it ship in M10. M6 §A's `runOnboardingScan` accepts `(folderId, wizardSessionId)` parameters that M10 will provide from the wizard session. The CAS gate against `app_settings.pending_wizard_session_id` is set by M10 BEFORE calling `runOnboardingScan`; M6's tests synthesize the CAS state directly.

> **Recommended disposition:** No new code on the M10 side from M6. Task 6.8 tests the function in isolation by directly setting `app_settings.pending_wizard_session_id` in test setup. M10 wiring is M10's problem.

**(h) M3 dev panel.** M3's fixture-upload tester at `/admin/dev` reads the same `pending_syncs` / `pending_ingestions` tables M6 mutates. After the partial-index split, M3's queries MUST add `AND wizard_session_id IS NULL` (live partition only) or they'll start returning wizard rows the dev panel never expected.

> **Recommended disposition:** Audit `app/admin/dev/page.tsx` and `app/admin/dev/actions.ts` during M6 §A close-out; add the live-partition predicate to every read. Track in DEFERRED.md if the audit surfaces issues. Add a regression test under `tests/admin/dev-partition-scope.test.ts`.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

UI surface §B ships in this milestone:

- `app/admin/show/[slug]/page.tsx` (per-show parse panel)
- `components/admin/ParsePanel.tsx`
- `components/admin/StagedReviewCard.tsx`
- `components/admin/ReSyncButton.tsx` (added during §B implementation; thin client wrapper around `/api/admin/sync/[slug]`)
- `components/admin/AlertBanner.tsx` (small change: M6 severity-filter excluding `severity: "info"` codes from the primary banner; bulk landed in M5)

Backend §A ships no UI surface; the §12 gate runs ONLY on §B's surface area per HANDOFF-TEMPLATE.md.

The dual run ran AFTER per-task implementation closed and BEFORE adversarial review. Both commands ran with the canonical v3 preflight gates (`load-context.mjs` → product gate → command-reference gate → register identification → preflight signal).

- [x] `/impeccable critique <surface>` — UX heuristic scoring, persona walkthroughs, AI-slop test, absolute-ban scan.
  - **Score:** 23/40 heuristic total (real-interface band 20–32; honest-middle).
  - **Cognitive load failures:** 4 (critical band) — raw ISO timestamps, raw enum values, MI-* codes in copy, four-button bar without hierarchy.
  - **AI-slop verdict:** "moderate-to-low but lacks character; reads as competent admin chrome but doesn't say FXAV." Token discipline excellent.
  - HIGH findings fixed at SHA `292693e` (see disposition list below).
  - P2/P3 findings triaged.

- [x] `/impeccable audit <surface>` — Technical quality checks (a11y, performance, responsive, theming, anti-patterns). Scored P0–P3.
  - **Score:** 14/20 (Good band 14–17). Performance 4/4 excellent. Theming 3/4 excellent token discipline.
  - **Counts:** P0=0, P1=4, P2=5, P3=3.
  - P0/P1 findings fixed at SHA `292693e` (see disposition list below).
  - P2/P3 findings triaged.

- [x] DEFERRED.md updated with retrospective deferrals — N/A; no findings escalated to deferral. P2/P3 either rolled into the SHA `292693e` polish patch or deemed acceptable for the milestone.
- [x] Dispositions inline below.

**Critique findings — dispositions:**

```
critique P0 — raw datetime + enum leaks (PRODUCT.md plain-language) — fixed at 292693e (SOURCE_LABELS map; formatStagedAt human formatter; <time dateTime=...> preserves ISO for machines).
critique P0 — destructive action visually identical to safe action — fixed at 292693e (Apply primary accent; "Retry on next sync" / "Wait for next edit" secondary outline; "Stop showing this sheet" split below a divider with quieter affordance + inline note).
critique P1 — `dl` source block buries actual subject — fixed at 292693e (parse summary promoted to <h3>; source kicker + time caption demoted; metadata grid removed).
critique P1 — Re-sync silent refresh — fixed at 292693e (admin-resync-success line summarizes ProcessOneFileResult outcome with friendly copy).
critique P2 — empty/zero-state lacks freshness signal — accepted as-is for M6 close; admin layout already gates on Drive infra availability via AlertBanner; revisit if operator feedback indicates need.
critique P2 — bold-modern brand presence (no signature moment) — accepted as-is; per-show admin is a working surface, not a brand surface; reassess in M9 polish if operator feedback warrants.
```

**Audit findings — dispositions:**

```
audit P1 — raw ISO-8601 timestamps as user copy — fixed at 292693e (formatStagedAt + suppressHydrationWarning on <time>).
audit P1 — em dashes in user copy (DESIGN.md §9 absolute ban) — fixed at 292693e (describeItem rewrite; em dashes replaced with periods, parens, "blank" placeholder).
audit P1 — fieldset legend not associated with item description (WCAG 1.3.1, 3.3.2) — fixed at 292693e (aria-describedby links the fieldset to the visible <p id="item-...-desc">).
audit P1 — `dl` overflow risk at 375–390px — fixed at 292693e (the `<dl>` was removed entirely; metadata is now a single text caption that wraps cleanly).
audit P2 — two competing accent CTAs (Re-sync + per-card Apply) — accepted as-is; Re-sync is page-level singleton, Apply is the most important per-card action; both deserve the accent. The "≤10% of viewport" rule is a guideline; operator feedback would tell us if the cap is breached on noisy days.
audit P2 — identical "Staged review" heading on every card — fixed at 292693e (parse summary is now the heading; "Staged review" wordmark removed entirely).
audit P2 — `sourceKind` rendered as raw enum string — fixed at 292693e (SOURCE_LABELS map).
audit P2 — triple-nested borders inside warning-bg error region — fixed at 292693e (per-item border removed; rows now use bg-surface-sunken).
audit P2 — no aria-live for async actions — partially fixed at 292693e (aria-busy added on every async button; sr-only live region deferred to M9 polish if operator feedback indicates need).
audit P3 — `<code>` slug chip styling — accepted as-is for M6 close; revisit in M9.
audit P3 — back-arrow ASCII glyph — accepted as-is for M6 close; lucide-react ChevronLeft swap is M9 polish.
audit P3 — section header for staged-changes count — accepted as-is for M6 close; ParsePanel's empty state already provides the "nothing pending" signal.
```

The convergence log proper (below) appends ONLY after impeccable evaluation closes AND adversarial review begins. The milestone is marked "completed" only when BOTH impeccable §12 has zero unresolved HIGH/P0/P1 findings AND adversarial review has converged.

## 13. Meta-test inventory (AGENTS.md writing-plans rule — pre-declared at handoff time)

Per AGENTS.md §1.9 + the M5 retrospective: pre-declare the meta-tests at plan/handoff time, NOT round 14. M4 §8.3 (8 rounds) and M5 R14–R18 (6 rounds) both became cheap once the meta-test landed; the rounds disappear when the registry exists from day 1.

For each candidate class below, **create / extend / N/A — <reason>**:

- [x] **Supabase call-boundary discipline** — **CREATE `tests/sync/_metaInfraContract.test.ts`** analogous to `tests/auth/_metaInfraContract.test.ts`. Registers every helper subject to AGENTS.md §1.9 and asserts each surfaces infra throws as discriminable infra-failure (not benign continue). Initial registry rows (every M6 helper that calls Supabase): `runScheduledCronSync`, `runManualSyncForShow_unlocked`, `runPushSyncForShow`, `runOnboardingScan`, `processOneFile_unlocked`, `runPhase1`, `runPhase2`, `applyParseResult`, `applyStaged`, `discardStaged`, `perFileProcessor`, `handleDriveFetchFailure`, `subscribeToWatchedFolder`, `refreshWatchSubscriptions`, `gcWatchChannels`, every `app/api/admin/staged/*/route.ts` handler, every `app/api/cron/*/route.ts` handler, the `/api/drive/webhook/route.ts` handler, the `/api/admin/sync/[slug]/route.ts` handler. New call sites EITHER add a registry row OR carry `// not-subject-to-meta: <reason>`. The meta-test mocks Supabase to throw at construction / `getUser` / `rpc` / `from` / `select` / `update` / `insert` / `upsert` / `delete`, asserting each helper surfaces a discriminable infra-failure result.

- [x] **Advisory-lock topology** — **CREATE `tests/sync/_advisoryLockSingleHolderContract.test.ts`** (sister to M5-shipped `tests/auth/advisoryLockRpcDeadlock.test.ts`). Pins the single-holder topology for every M6 hashkey path. The §5 Plan-wide invariant table above is the ground-truth list for initial rows: cron / push / manual / Apply / Discard / `handleDriveFetchFailure` / Phase A finalize / Phase B finalize. New call sites must register their layer (JS-side wrapper / in-RPC / nested SECURITY DEFINER) OR carry `// not-subject-to-meta: <reason>`. Test scans `lib/sync/**` + `app/api/admin/staged/**` + `app/api/admin/sync/**` + `app/api/cron/**` + `app/api/drive/**` + every M6-touched migration's SECURITY DEFINER body for `pg_*advisory*_lock` or `LOCK TABLE` calls and asserts each is registered with its layer.

- [x] **`admin_alerts` catalog completeness** — **EXTEND `tests/messages/_metaAdminAlertCatalog.test.ts`** (M5-shipped). New rows for the four M6 admin_alerts producer codes: `WATCH_CHANNEL_ORPHANED`, `WEBHOOK_TOKEN_INVALID`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `LIVE_ROW_CONFLICT`. Every catalog code with non-null `dougFacing` (M5 R21 F2 lesson). The producer for each is enumerated in the registry; the test scans for unregistered `admin_alerts.upsert(...)` calls.

- [x] **Phase 2 invariant gate** — **CREATE `tests/sync/_phase2InvariantContract.test.ts`** (NEW class, M6-introduced). Pins MI-1..MI-14 invariant gate is run BEFORE any destructive write in Phase 2 (i.e., Phase 1's `hard_fail` outcome is never bypassable). Every Phase-2-writing call site MUST be reachable only through a Phase-1-approved path. The test scans `lib/sync/applyParseResult.ts` + `lib/sync/applyStaged.ts` + every test fixture's Phase 2 invocation for unconditional Phase 2 calls without a Phase 1 result, AND asserts the call graph matches the documented contract.

- [x] **No-inline-email-normalization** — **EXTEND `tests/admin/no-inline-email-normalization.test.ts`** (M5-shipped, currently covers `lib/auth/**` + `lib/data/**`). M6 adds `lib/sync/**` and `lib/drive/**` to the glob. New surfaces covered: every M6 helper that reads emails from Drive parse output OR from admin reviewer-choices payloads.

- [x] **Read-side wizard-partition scope predicate** — **CREATE `tests/sync/_partitionScopeContract.test.ts`** (NEW M6 class, addresses the partial-index split fallout per Task 6.8). Scans every `SELECT FROM pending_syncs` and `SELECT FROM pending_ingestions` in `lib/sync/**` + `app/admin/**` + `app/api/admin/**` and asserts each carries `wizard_session_id IS NULL` (live partition) OR `wizard_session_id = $session` (wizard partition). Same for `INSERT ... ON CONFLICT` and `DELETE FROM` predicates. Catches unscoped reads that would silently return wizard rows in coexistence.

- [x] **Same-revision binding contract** — **OPTIONAL — CREATE `tests/sync/_revisionBindingContract.test.ts`** if the binding-capture / binding-pin / binding-re-verify pattern recurs across `runScheduledCronSync` / `runPushSyncForShow` / `runManualSyncForShow` / `runOnboardingScan`. The class is "every Drive-read code path captures a binding revision before markdown export, runs all enrichment substeps against that binding, and re-verifies before commit." If the four orchestrators all duplicate the binding shape, this meta-test enforces consistency. Decide at Task 6.6 close-out — if ≥3 orchestrators converge on the same shape, create the meta-test; if only 1–2, keep it inline.

- [N/A] **Sentinel hiding in optional text** — `tests/components/tiles/_metaSentinelHidingContract.test.ts`. **N/A — M6 doesn't render tile-shape optional text.** The parse panel renders error codes through the catalog; sentinel-hiding is a tile-render concern owned by M4.

The seven create / extend rows above are mandatory at M6 close. Empty rows silently lie.

---

## Field discipline notes (carry-forward from M5 handoff)

- **"Spec sections in scope" is exhaustive, not representative.** M6 brushes §3.2 + §4.5 + §5 entire + §6.8 + §6.11 — listed all five.
- **"AC list" uses canonical AC IDs.** M6 covers AC-6.1..AC-6.27 (27 entries) — listed every one.
- **"Pre-handoff state" is verified by command, not assertion.** Every "tests passing" check has a command.
- **"Watchpoints" is the most valuable section.** M5-carry-forward classes 1–7 + M6-specific 8–26 — preload the reviewer rather than discover at round N.
- **"Exit criteria" includes the convergence step.** M6 is not done at "tests pass"; it's done at "tests pass AND adversarial review converged AND impeccable §12 closed."

---

## Convergence log

### Round 1 — full-milestone fresh-eyes (Codex via /codex:adversarial-review)

- Base: `afa0906` (M6 milestone-base, last commit before M6 work began).
- Head: `a0fb237` (test(drive): bump real-Drive smoke timeout to 30s).
- Scope: `--scope branch` against milestone-base; full §A+§B diff.
- Verdict: **needs-attention.**
- Findings (all §A backend, none §B UI):
  1. **[high] Cron sync ignores `app_settings.watched_folder_id`** — `lib/sync/runScheduledCronSync.ts:825-831` resolves folder from `GOOGLE_DRIVE_FOLDER_ID` / `DRIVE_FOLDER_ID` env vars, breaking §4.5/§5.2 contract. Onboarding can promote a new watched folder in DB while cron syncs the old env-configured folder, or 500s when no env var exists. Recommendation: read `app_settings.watched_folder_id` in cron path, return typed no-folder/no-op result + `sync_log` entry when null, add regression test for env/DB mismatch.
  2. **[high] New crew auth rows not put into no-live-link state** — `lib/sync/runScheduledCronSync.ts:657-666` `provisionAddedCrewAuth()` only inserts default `crew_member_auth` rows (`current_token_version=1`, `revoked_below_version=0`), violating spec requirement that newly added crew be in no-live-link state (`current_token_version === revoked_below_version`) until Doug issues a link. Unit fake in `tests/sync/phase2.test.ts` performs the missing floor bump, masking the production divergence. Recommendation: after row INSERT, UPDATE every added name to `revoked_below_version = max_issued_version` AND `current_token_version = max_issued_version`, plus an adapter-level test that inspects the SQL/state (not the fake).
  3. **[medium] Reviewer auth floor can require two Issue New Link clicks** — `lib/sync/applyStaged.ts:600-615` `defaultBumpReviewerAuthFloors()` sets `revoked_below_version = current_token_version + 1` without advancing `current_token_version` or `max_issued_version`. Row at v5 → floor 6 / current 5; Issue New Link advances current/max to 6, still rejected by `tokenVersion <= revoked_below_version` check. Recovery path fails until another bump. Recommendation: set floor to current live version (not +1) for reviewer-driven revocation, OR atomically align current/max/floor with Issue New Link contract; add test proving one Issue New Link after MI-11..MI-14 Apply produces a valid token.
- Routing: all three findings → §A. Class-sweep mandate: grep auth-floor pattern across all bumpReviewerAuthFloors / provisionAddedCrewAuth / link-mint surfaces; grep folder-resolution pattern across cron + push + recovery + manual + onboarding sync entrypoints.
- Fix SHAs:
  - **Finding 1: `7c9ca53`** `fix(sync): resolve cron folder from app_settings, not env`. New helper `lib/appSettings/getWatchedFolderId.ts` with discriminated union return; `runScheduledCronSync` switched to helper; env vars demoted to first-boot fallback only when `app_settings` row absent. New class-sweep registry test `tests/sync/no-direct-drive-folder-env.test.ts` greps every `.ts/.tsx` under `app/` + `lib/` and asserts only the helper file contains `process.env.GOOGLE_DRIVE_FOLDER_ID|DRIVE_FOLDER_ID` reads. Helper registered in `tests/sync/_metaInfraContract.test.ts` with both throw-path coverage. Negative-regression confirmed (3 tests fail when production fix stashed).
  - **Finding 2: `553a530`** `fix(auth): place newly provisioned crew in no-live-link state`. After INSERT, UPDATE every added name to `current_token_version = max_issued_version` AND `revoked_below_version = max_issued_version`. New adapter-level test `tests/sync/runScheduledCronSync.adapter.test.ts` exercises the production adapter (NOT the phase2 fake) and asserts the no-live-link invariant post-insert.
  - **Finding 3: `e1df5f9`** `fix(auth): align reviewer floor bump with Issue New Link contract`. Codex chose **Option A** per spec §6.8.2 (Apply auth side-effects = `revoked_below_version = current_token_version`, while §5.2's Issue New Link is the one-step current/max advance above that floor). New end-to-end test `tests/sync/applyStaged.authFloors.test.ts` (253 lines) proves one Issue New Link after MI-11..MI-14 Apply produces a valid token; `tests/sync/applyStaged.test.ts` updated for the new floor semantics.
- Verification: per-finding targeted vitest paths green (33+34=67 tests). pnpm typecheck + pnpm lint clean on both my orchestrator machine and Codex's sandbox. Negative-regression done for all three (Codex used manual hunk revert for findings 2-3 because git stash failed in sandbox with "could not write index" — same effect, bypass the sandbox quirk).
- Out-of-scope (carry-forward): final breadth gate `pnpm test --exclude='tests/db/**' --exclude='tests/e2e/**'` surfaced 3 pre-existing infra-bound failures in Codex's sandbox (`tests/data/getShowForViewer.test.ts`, `tests/admin/parseAndStage-auth.test.ts`, `tests/sync/dev-routing.test.ts` — all `TypeError: fetch failed`). These are unrelated to round 1 fixes — they hit a Supabase mock that Codex's sandbox can't reach. Should be re-verified locally before round 2 dispatch if not already known-flaky.

### Round 2 — re-review against fixes (Codex via /codex:adversarial-review)

- Base: `afa0906` (milestone-base, NOT R1 fix-base — full-milestone scope per `feedback_adversarial_review_full_milestone_scope`).
- Head: `300620d` (R1 convergence log commit; includes 7c9ca53/553a530/e1df5f9).
- Codex review id: `review-moz40d1f-ahh9iz`. Duration: 5m 22s.
- Verdict: **needs-attention.** No regressions on R1 fixes — fresh-eyes audit surfaced 3 NEW production-correctness findings.
- Findings (all §A backend):
  1. **[high] Wizard discard inserts NULL into NOT NULL `deferred_by_email`** — `lib/sync/discardStaged.ts:293-303`. Wizard-scoped `defer_until_modified` and `permanent_ignore` paths insert `null` for `deferred_by_email`, but `public.deferred_ingestions.deferred_by_email` is `text not null` in the migration. Production raises a DB constraint error on this path, leaving the staged wizard row unresolved and potentially blocking finalize. Recommendation: either make the column nullable for wizard-scoped deferrals (with explicit CHECK), or write a canonical non-null system/operator identity for wizard deferrals; add a DB-backed regression test for both wizard discard variants.
  2. **[high] Webhook background failures dropped silently** — `app/api/drive/webhook/route.ts:201-211`. `handleDriveWebhook` queues `dispatchDriveWebhookFiles` in `after()`, but the dispatch catch only appends an in-memory `{outcome: 'error'}` and never calls `logSync`. A `listFolder` failure also rejects the background task before any durable log. Webhook caller already returned `{ok: true, queued: true}` so failures are invisible to the caller AND to operators. Recommendation: persist every background dispatch failure through `logSync` with the drive file id, classified code, and error payload; wrap the folder-list step too; reuse the cron classifier so infra errors don't collapse to generic `SYNC_FILE_FAILED`.
  3. **[medium] `LIVE_ROW_CONFLICT` registered as admin-alert producer but never writes admin_alerts** — `lib/sync/runOnboardingScan.ts:655-671`. The handoff/meta-test registry treats `LIVE_ROW_CONFLICT` as an M6 `admin_alerts` producer code, but the actual SQLSTATE catch only writes `sync_log` and `onboarding_scan_manifest`. The admin alert banner never receives the unresolved operator signal the registry claims exists. Catalog test only proves copy exists, not that the producer writes the alert (this is a meta-test gap — the catalog meta-test only checks the copy/dougFacing pair, doesn't verify each producer code actually emits an `admin_alerts` write somewhere). Recommendation: add a `LIVE_ROW_CONFLICT` `upsertAdminAlert` call on this catch path AND extend the catalog meta-test to assert producer-side writes — OR remove `LIVE_ROW_CONFLICT` from the producer registry and document it as manifest-only.
- Routing: all three findings → §A (`/codex:rescue --fresh`, anti-hang guardrails: targeted vitest only, no broad `pnpm test`).
- Class-sweep mandate per finding: (1) grep all `deferred_ingestions` INSERT/UPSERT sites for nullable-column-vs-NOT-NULL mismatches; (2) grep all `after()` dispatch surfaces — onboarding scan, manual sync, watch refresh — for the same logSync gap; (3) walk every M6 producer code in the catalog and verify each has a corresponding production write (this is the meta-test extension, not just a single instance fix).

- Fix SHAs:
  - **Finding 1: `5b6d60f`** `fix(sync): allow wizard-scope discard without operator email`. Codex chose **Option A** (schema change) — synthetic emails would have violated AGENTS.md §1 invariant 3 (email canonicalization). New migration `20260510015836_allow_wizard_deferred_operator_null.sql` + inline DDL update in `20260501001000_internal_and_admin.sql` + new test file `tests/sync/discardStaged.test.ts` (79 lines covering both wizard variants). Per AGENTS.md transitional-window rule, the inline CHECK in `tables/` accepts both old and new shapes.
  - **Finding 2: `7cac617`** `fix(sync): persist background webhook dispatch failures via sync_log`. Webhook background catch now persists every dispatch failure through `logSync` with classified code via the cron classifier (reused, not duplicated); listFolder failure also wrapped with a `driveFileId: null` log entry. `tests/drive/webhook.test.ts` extended with the success/error/listFolder-throw matrix (71 added lines).
  - **Finding 3: `720f692`** `fix(sync): reconcile LIVE_ROW_CONFLICT producer registry with write sites`. Codex chose **Option A** — added `upsertAdminAlert` on the SQLSTATE catch path in `runOnboardingScan` per spec §12.4 confirming `LIVE_ROW_CONFLICT` is a registered producer. **Critical meta-test extension landed**: `tests/messages/_metaAdminAlertCatalog.test.ts` extended (54 added lines) to structurally assert every producer code in the registry has at least one production write site (greps for `upsertAdminAlert` calls referencing each code). This is the structural meta-test that prevents the "registered but never written" class going forward — pre-empts future rounds finding the same class on parallel surfaces.
- Verification: per-finding targeted vitest paths green (60/60). pnpm typecheck + pnpm lint clean on my orchestrator machine. Codex's sandbox breadth gate `pnpm test --exclude='tests/db/**' --exclude='tests/e2e/**'` ran in 34s with only the same 3 pre-existing fetch-failed suites (`tests/data/getShowForViewer.test.ts`, `tests/admin/parseAndStage-auth.test.ts`, `tests/sync/dev-routing.test.ts`) — no new regressions.
- Class-sweep results from Codex: F2 audited every `after()` dispatch surface (manual sync, watch refresh, onboarding scan, webhook); only the webhook needed the fix — others already used the durable logSync pattern. F3 catalog meta-test extension catches the same class anywhere it appears, not just LIVE_ROW_CONFLICT.

### Round 3 — re-review against R2 fixes (Codex via /codex:adversarial-review)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `cd0a050` (R2 convergence log commit; includes 5b6d60f/7cac617/720f692).
- Codex review id: `review-moz4wptc-gtpvl2`. Duration: 5m 4s.
- Verdict: **needs-attention.** No regressions on R1 or R2 fixes — fresh-eyes audit surfaced 3 NEW high-severity findings. No convergence loop yet (each round finds genuinely new bugs across the wider milestone, which is the right pattern per `feedback_iterate_until_convergence`).
- Findings (all §A backend, all high):
  1. **[high] Watch subscription outbox is not durable before the external Drive call** — `lib/drive/watch.ts:258-325`. `subscribeToWatchedFolder` runs `subscribeWithTx` inside one DB transaction, but `subscribeWithTx` inserts the `pending` row and then awaits `files.watch` BEFORE that transaction commits. If Drive creates the channel and the function crashes / times out / the later DB work fails, there is no durable `drive_watch_channels` row to verify, mark orphaned, or garbage-collect. Result: untracked Google watch delivers webhooks the app treats as inactive → push sync breaks AND the orphan is hidden from admin recovery. Recommendation: split into spec's outbox phases — commit the `pending` row first, call Drive OUTSIDE that transaction, then use a new transaction to activate it OR mark it orphaned + upsert admin alert.
  2. **[high] Cron never detects sheets removed from the watched folder (AC-6.9 gap)** — `lib/sync/runScheduledCronSync.ts:1246-1277`. After resolving the watched folder, `runScheduledCronSync` lists current files and only iterates those present. There is no pass comparing the listed Drive IDs against existing `shows.drive_file_id` values, so a sheet moved out of the folder, unshared, or deleted is never processed again. AC-6.9 violated: `last_sync_status` does not become `sheet_unavailable`, `last_seen_modified_time` remains silently stale, crew/admin pages keep showing last-good data as if the show were healthy. Recommendation: add the folder-diff phase after listing — identify existing live shows absent from the current folder listing, acquire each show lock, set `last_sync_status = 'sheet_unavailable'` without advancing the watermark, insert a `sync_log` row.
  3. **[high] Pre-parse Drive fetch failures reduced to logs instead of recovery state** — `lib/sync/runScheduledCronSync.ts:1089-1105`. When the spreadsheet disappears during markdown fetch, `processOneFile_unlocked` returns `STAGED_PARSE_SOURCE_GONE` after only `logSync`; other Drive/export failures bubble to the outer per-file catch which also only writes `sync_log`. Spec requires fetch-failure handling INSIDE the locked boundary: existing shows get a guarded `drive_error` / unavailable status, first-seen sheets get a live-partition `pending_ingestions` row so Doug can see + recover the failed sheet. As written: first-seen Drive/auth/quota/export failures are invisible outside logs, existing shows keep prior healthy status. Recommendation: implement a locked fetch-failure handler before returning/propagating, with the live-partition stage-wins guard, status-only update for existing shows, pending-ingestion upsert for first-seen sheets, regression tests for both paths.
- Routing: all three findings → §A (`/codex:rescue --fresh`, anti-hang guardrails). Class-sweep mandate is heavier this round because findings touch wider M6 surfaces:
  - F1 class-sweep: every other Drive-state-mutation that mixes external API call with DB transaction (asset binding, embedded image fetch, recovery flows). Each must use the same outbox split.
  - F2 class-sweep: every other "list-and-iterate-only" sync path (manual sync, onboarding scan recovery). Must also detect sheet absence and downgrade status.
  - F3 class-sweep: every other sync_log-only error path that should also stage/update show state. Per-file catch in cron, manual sync error path, push-sync per-file path.

- Fix SHAs:
  - **Finding 1: `143a940` + fixup `e8a52fe`** `fix(drive): split watch subscription into outbox phases`. Implemented spec's outbox split — phase A commits pending row in tx1, phase B awaits `files.watch` outside any tx, phase C activates or marks orphaned (with WATCH_CHANNEL_ORPHANED admin alert payload carrying channel id for operator recovery) in tx2. Class-sweep extended to onboarding scan (separate fixup commit because Codex sandbox hit a git-lock applying both writes in one commit). 250+25 line diff including 133-line contract test for failure injection between phases.
  - **Finding 2: `b887814`** `fix(sync): detect sheets removed from watched folder (AC-6.9)`. Added folder-diff phase after listing in `runScheduledCronSync`: reads live `shows.drive_file_id`, computes set difference against current folder listing, locks each missing show, sets `last_sync_status = 'sheet_unavailable'` without advancing the watermark, writes `sync_log` entry. New `SHEET_UNAVAILABLE` message catalog entry registered in §12.4 + producer-write-site meta-test. 342-line diff with comprehensive regression coverage.
  - **Finding 3: `242bb55`** `fix(sync): handle Drive fetch failures inside locked boundary`. Implemented locked fetch-failure handler covering both `STAGED_PARSE_SOURCE_GONE` and other Drive/export failures, with the live-partition stage-wins guard. Existing show → status update + sync_log; first-seen sheet → live-partition `pending_ingestions` row. 342-line diff (133 production / 222 test) with all 4 branches covered (existing/first-seen × gone/non-gone).
- Verification: per-finding targeted vitest paths green (94/94 tests across watch, cron, catalogs). pnpm typecheck + pnpm lint clean on my orchestrator machine. Codex's sandbox breadth gate `pnpm test --exclude='tests/db/**' --exclude='tests/e2e/**'` showed only the same 3 pre-existing fetch-failed suites — no new regressions.
- Class-sweep results from Codex: F1 outbox class-sweep covers both `lib/drive/watch.ts` and `lib/sync/runOnboardingScan.ts`. F2 noted that manual sync uses a different per-show shape (404 case is a future task, not the same class). F3 covered all `fetchSheetAsMarkdownAtRevision` call sites including the cron classifier reuse from R2 F2.

### Round 4 — re-review against R3 fixes (pending)

(Pending — to dispatch after convergence log commits.)
