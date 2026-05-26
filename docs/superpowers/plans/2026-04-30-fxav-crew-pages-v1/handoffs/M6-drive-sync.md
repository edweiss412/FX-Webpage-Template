# Handoff — M6: Drive sync (cron + push) + admin parse panel

**Handed off:** 2026-05-08 by Eric Weiss
**Implementer:** **split-mode (manual / Level 1)** — backend = **GPT-5.5 / Codex CLI**, UI = **Opus 4.7 / Claude Code**, two concurrent terminals coordinating through this doc. Per `ROUTING.md` M6 row + UI hard rule. Backend goes first because the §A engine pins every type and route signature §B's parse-panel UI consumes.
**Adversarial reviewer:** Opus 4.7 / Claude Code (per ROUTING.md M6 row — backend is the larger surface, so the cross-model partner is Opus).
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/06-drive-sync.md` (Tasks 6.1–6.13; AC-6.1..6.27).

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

Verbatim from spec §17.1 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3404-3458`). Every AC ID must have at least one §A-side or §B-side test.

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
- **AC-6.11** — AMENDED by overview Amendment 9. Original M6 shipped the pre-amendment live first-seen staging behavior (`FIRST_SEEN_REVIEW`; no `shows` row until Apply) and therefore did not close amended AC-6.11. M6.5 closes Amendment 9 / M6-D12 with live first-seen auto-publish + 24h unpublish undo while preserving onboarding-scan first-seen review. See `M6.5-amendment-9.md`. [§A · 6.4 + M6.5 closure]
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
- [x] Amendment 9 — first-seen auto-publish + 24h unpublish undo — **Satisfied via the M6.5 backend coda.** The plan text in `06-drive-sync.md` describes the ratified target contract; original M6 deferred it as M6-D12, and `M6.5-amendment-9.md` records the closure scope.

M6 does not touch the report pipeline or the parser registry. Amendment 9 was ratified after the M6 convergence loop and is closed by the M6.5 backend coda, not by the original Tasks 6.8-6.10 review loop.

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

### Round 4 — re-review against R3 fixes (Codex via direct `codex exec`, not companion)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `c362bf3` (R3 convergence log commit; includes 143a940/e8a52fe/b887814/242bb55).
- Codex review: dispatched via direct `codex exec -c 'mcp_servers={}'` (not the companion broker — the companion + 4 retries hung systematically because of a misconfigured serena MCP in `~/.codex/config.toml` pointing at `/Users/ericweiss/GigShift`; codex worker blocked on serena startup. See `feedback_codex_hang_caused_by_orphan_mcp.md`. The `-c 'mcp_servers={}'` flag disables all MCP servers for the single invocation, unblocking the worker).
- Verdict: **needs-attention.** No regressions on R1/R2/R3 fixes — fresh-eyes audit surfaced 3 NEW findings. One particularly important: F3 catches a class-sweep gap from R3 itself (the structural test we added in R3 was lexical-scoped not call-flow-scoped, so it missed two more outbox violations on the watch surface). Exactly why fresh-eyes rounds matter.
- Findings (all §A backend):
  1. **[high] Revision-race cooldown gate is not implemented** — `lib/sync/runScheduledCronSync.ts:1306`. Sync pipeline returns `STAGED_PARSE_REVISION_RACE` immediately on binding/export/enrichment races, but never writes or consults `revision_race_cooldowns`. A repo sweep shows `STAGED_PARSE_REVISION_RACE_COOLDOWN` and `revision_race_cooldowns` only in catalog/schema/tests, NOT in runtime sync code. Violates the M6 spec requirement that cron and push back off repeated races for the same `drive_file_id` + revision token and clear the cooldown on successful Phase 2. Recommendation: add runtime cooldown read/upsert/clear support for cron and push (check before Drive fetch, upsert/increment on each revision race, skip with `STAGED_PARSE_REVISION_RACE_COOLDOWN` inside the window, delete cooldown rows after a successful Phase 2 commit). Add regression tests for cron, push, manual bypass, backoff progression, and success clear.
  2. **[high] Wizard onboarding scan writes pending rows without show advisory locks** — `lib/sync/runOnboardingScan.ts:278`. `PostgresOnboardingScanTx` mutates `pending_ingestions` and `pending_syncs` for wizard scope, but `runOnboardingScan` only uses its own transaction; `tests/sync/_advisoryLockSingleHolderContract.test.ts` explicitly records `key: none` for this path. Violates plan-wide invariant 2: every code path mutating `pending_syncs` or `pending_ingestions` runs inside per-show advisory lock keyed by `drive_file_id`. Wizard-session CAS + partial indexes isolate row partitions but do NOT serialize concurrent cron/manual/admin work for the same Drive file. Recommendation: wrap each file's DB write phase in the existing single-holder advisory lock keyed by `drive_file_id`, keeping Drive preparation work outside the lock. Update advisory-lock structural test so `runOnboardingScan` is registered as delegating to that holder rather than exempting itself.
  3. **[medium] R3 outbox class-sweep gap — refresh + GC still await Drive calls inside default DB transactions** — `lib/drive/watch.ts:399`. `refreshWatchSubscriptions` opens `withDefaultTx`, then while that transaction is still active calls `subscribeToWatchedFolder` for each due row. `gcWatchChannels` has the same shape: opens `withDefaultTx`, lists candidates, then awaits `stopChannel` before marking rows stopped. R3 fixed only `subscribeToWatchedFolder` itself; the structural test added in R3 missed these because it checks lexical Drive calls inside selected helper bodies, NOT call flows that delegate to those helpers. Recommendation: split refresh and GC into short DB phases (list candidates in one tx, commit, perform Drive calls outside any tx, then activate/mark stopped in separate short txns). Extend the watch boundary test to cover call-stack flow, not just lexical body checks.
- Routing: all three findings → §A (`/codex:rescue --fresh -c 'mcp_servers={}'`). Class-sweep mandate is heavier this round because F3 itself was a class-sweep gap from R3:
  - F1 class-sweep: every revision-race emission site (binding, export, enrichment, embedded fetch) — each must consult and update the cooldown. Every cron, push, recovery, manual bypass entrypoint — different policies.
  - F2 class-sweep: every other path that mutates `pending_syncs` / `pending_ingestions` outside a per-show advisory lock. Walk every helper that takes a transaction port and writes to those tables.
  - F3 class-sweep: every other helper that opens `withDefaultTx` then calls Drive. Extend the structural test to use call-flow analysis (or at minimum, walk every Drive helper's reachable call sites and check the wrapping transaction context).

- Fix SHAs:
  - **Finding 1: `7a0b6ce`** `fix(sync): wire revision-race cooldown gate into cron+push`. Added `revision_race_cooldowns` runtime read+upsert+clear in `lib/sync/runScheduledCronSync.ts` (172-line production diff). Cooldown checked before Drive fetch in cron+push; on STAGED_PARSE_REVISION_RACE, UPSERTs row with retry_count + 1, expires_at = NOW() + LEAST(60 * 2^retry_count, 600); on successful Phase 2 commit, DELETEs cooldown row. Manual + onboarding bypass per Amendment 7. 138-line test suite covers the full backoff progression (60→120→240→480→600 cap), bypass cases, and successful-Phase-2-clears-cooldown.
  - **Finding 2: `1275147`** `fix(sync): wrap onboarding scan pending writes in per-show advisory lock`. Wrapped `runOnboardingScan`'s pending_ingestions/pending_syncs writes in the per-show advisory lock keyed by `drive_file_id` — Drive prep (listing/fetch/parse) stays outside the lock, DB writes inside. Updated `tests/sync/_advisoryLockSingleHolderContract.test.ts` to register `runOnboardingScan` as a lock holder (no longer `key: none`). Major refactor (412-line restructuring) + 74-line concurrency contract test asserting two concurrent `runOnboardingScan` calls for the same drive_file_id serialize.
  - **Finding 3: `fdd5d09`** `fix(drive): split refresh+GC outbox phases, no Drive in tx`. Split `refreshWatchSubscriptions` and `gcWatchChannels` into short DB phases — list candidates in tx1, COMMIT, perform Drive calls outside any tx, then activate/mark stopped in fresh transactions. Test extension (131 lines) covers the call-flow contract beyond R3's lexical-only check; closes the class-sweep gap that R3 missed.
- Verification: per-finding targeted vitest paths green (46/46 tests across runScheduledCronSync, advisory-lock contract, onboarding, watch). pnpm typecheck + pnpm lint clean on my orchestrator machine. Codex breadth gate ~25s with only the same 3 pre-existing fetch-failed suites — no new regressions.
- Tooling note: R4 dispatch (both review AND fix) had to bypass the codex-companion broker because of a misconfigured serena MCP in `~/.codex/config.toml` causing the codex worker to hang on startup. Used direct `codex exec` with `--sandbox workspace-write -c 'mcp_servers={}'`. Captured in `feedback_codex_hang_caused_by_orphan_mcp.md` for future reference.

### Round 5 — re-review against R4 fixes (Codex via direct `codex exec`, MCP disabled)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `2807a81` (R4 convergence log commit; includes 7a0b6ce/1275147/fdd5d09).
- Codex review: dispatched via direct `codex exec --sandbox read-only -c 'mcp_servers={}'`. Duration: 4m 31s. Verdict file at `/tmp/m6-r5-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R4 fixes — fresh-eyes audit surfaced 3 NEW findings. Two notable patterns: F1 catches *another* parallel surface gap from R3 (third Drive-fetch surface that R3's locked-recovery fix didn't cover), and F2 catches a brand-new numerical bug in R4's cooldown gate (the test pinned the WRONG formula so negative-regression didn't catch it — exactly the failure mode `feedback_negative_regression_verification` warns about).
- Findings (all §A backend):
  1. **[high] Initial binding fetch failures bypass locked recovery** — `lib/sync/runScheduledCronSync.ts:1450`. The initial `captureBinding` call sits OUTSIDE the try/catch blocks that route Drive failures through `handleFetchFailure_unlocked`. If `fetchDriveFileMetadata` 404s/500s during this first binding capture, the error bubbles to the cron per-file catch and only logs as a parse error: it does NOT mark an existing show `sheet_unavailable`/`drive_error`, does NOT create the `SHEET_UNAVAILABLE` alert, does NOT write first-seen `pending_ingestions` inside locked recovery. R3 fix covers xlsx fetch + final reverify failures only — this is a parallel Drive-fetch surface that the R3 class-sweep missed. Recommendation: wrap the initial binding capture in the same locked recovery handling. For first-capture failures use `fileMeta.modifiedTime` as fallback observed-modtime for first-seen ingestion. Add tests for initial captureBinding 404 and non-404 failures for both existing-show and first-seen cases.
  2. **[medium] Revision-race cooldown uses `retry_count - 1`** — `lib/sync/runScheduledCronSync.ts:75`. Implementation computes `Math.min(60 * 2 ** Math.max(retryCount - 1, 0), 600)` and the SQL mirrors that at read/upsert sites. Active M6/R4 contract says cron and push compute `LEAST(60 * 2^retry_count, 600)` for the persisted row; after first race is stored with `retry_count = 1`, next automatic pass should still be inside a 120s gate, NOT a 60s gate. Tests currently assert the implementation's 60s behavior, so the regression suite is **pinning the wrong formula** — exactly the failure mode `feedback_negative_regression_verification` warns about. Recommendation: change the helper + SQL to use `retry_count` directly. Update cooldown tests to assert the ratified R4 formula against persisted rows, including the second pass after `retry_count = 1`.
  3. **[medium] Push duplicate no-op happens AFTER lock acquisition** — `lib/sync/runScheduledCronSync.ts:1404`. `runPushSyncForShow` delegates to `processOneFile`, which acquires `withPostgresSyncPipelineLock` BEFORE calling `processOneFile_unlocked`; only THEN does `perFileProcessor` return `WEBHOOK_NOOP_ALREADY_SYNCED`. AC-6.16 requires duplicate push notifications for the same `(drive_file_id, modifiedTime)` to log `WEBHOOK_NOOP_ALREADY_SYNCED` and short-circuit BEFORE acquiring the per-show lock. Under duplicate webhook bursts, current code competes for the advisory lock and can report `CONCURRENT_SYNC_SKIPPED` instead of the specified no-op. Recommendation: add a push-specific pre-lock no-op gate or split a read-only watermark preflight before `withPostgresSyncPipelineLock`, leaving mutating gates in the locked path. Add a test that two same-modtime push deliveries produce one commit + one `WEBHOOK_NOOP_ALREADY_SYNCED` without invoking the lock wrapper for the no-op delivery.
- Routing: all three findings → §A (direct `codex exec --sandbox workspace-write -c 'mcp_servers={}'`). Class-sweep mandate: F1 is itself a class-sweep gap, so the R5 fix MUST audit ALL Drive-fetch surfaces in the per-file pipeline (initial binding capture, xlsx export, post-fetch reverify, embedded fetch — every one needs locked-recovery handling).

- Fix SHAs:
  - **Finding 1: `55f8e57`** `fix(sync): wrap initial binding capture in locked Drive-fetch recovery`. Closes the third Drive-fetch surface (initial `captureBinding`) that R3's locked-recovery fix didn't cover. 281-line diff (41 production, 242 test) covering existing-show + first-seen × 404/non-404 branches. Used `fileMeta.modifiedTime` as fallback observed-modtime per R5 review recommendation.
  - **Finding 2: `31a3bb6`** `fix(sync): correct revision-race cooldown formula to match spec`. Tiny but critical fix — 6-line production change (`Math.max(retryCount - 1, 0)` → `retryCount`) + 16-line test update to assert the spec-literal formula (60s for retry_count=0, 120s for 1, 240s for 2, etc., 600s cap). Negative-regression now correctly catches the buggy old formula.
  - **Finding 3: `77d18e6`** `fix(sync): short-circuit duplicate push deliveries before lock acquisition`. NEW file `lib/sync/runPushSyncForShow.ts` with pre-lock no-op gate; 175-line test asserts two same-modtime push deliveries produce one commit + one WEBHOOK_NOOP_ALREADY_SYNCED with the no-op delivery NOT invoking the lock wrapper. Closes AC-6.16.
- Verification: per-finding targeted vitest paths green (49/49 tests across runScheduledCronSync, webhook, runPushSyncForShow). pnpm typecheck + pnpm lint clean. Codex breadth gate: 3 pre-existing fetch-failed suites + 2 NEW Drive suites failed in Codex's sandbox due to `oauth2.googleapis.com` DNS isolation — verified locally that those Drive suites pass on a real network (`tests/drive/realDriveMarkdownSmoke.test.ts` + `tests/drive/round-trip-fixture.test.ts` 2/2 pass).
- Tooling note: had a 30+ min false-start on the R5 §A fix dispatch tracking down a misdiagnosed "codex hang." Real cause was missing `< /dev/null` on `codex exec` (codex CLI sat waiting for stdin EOF in non-interactive context). Captured in `feedback_codex_exec_needs_stdin_closed.md` (supersedes earlier `feedback_codex_hang_caused_by_orphan_mcp.md` which was wrong). Subsequent retries with `< /dev/null` worked but slow — the API took ~10 min for the heavy 3-finding fix. Network-bytes monitor is the right "still working vs hung" signal, not CPU%.

### Round 6 — re-review against R5 fixes (Codex via direct `codex exec`, third account)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `b95e258` (R5 fix-SHAs convergence log commit).
- Codex review: dispatched via direct `codex exec --sandbox read-only -c 'mcp_servers={}' < /dev/null`. Duration: 5m 1s. Verdict at `/tmp/m6-r6-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R5 fixes — fresh-eyes audit surfaced just **ONE** new finding. Significant convergence signal: after 5 rounds of 3 findings each, R6 found just 1. Each prior round's fix has held up across 5 subsequent fresh-eyes passes.
- Tooling note: hit codex usage limit on second account; user logged in with a third account before R6 could complete.
- Findings (1, §A backend):
  1. **[high] Wizard Apply approves rows without Drive reverify (AC-6.26 violation)** — `lib/sync/applyStaged.ts:841`. The wizard-source branch reads staged row, validates wizard session, then calls `approveWizardPendingSync` and `markWizardManifestApplied` WITHOUT fetching current Drive metadata or checking the file still belongs to `app_settings.pending_folder_id`. Live branch DOES reverify later in the same file. AC-6.26 + M6 plan require the same trust-boundary check for onboarding rows, pinned to `pending_folder_id` (NOT watched_folder_id). Sheet moved out of candidate folder or deleted after scan can be marked applied in the wizard, instead of returning STAGED_PARSE_SOURCE_OUT_OF_SCOPE / STAGED_PARSE_SOURCE_GONE and blocking finalize via wizard-scoped hard-fail state. Recommendation: add wizard-scope Drive metadata reverify before approval, compare parents against `pending_folder_id`, handle deleted/out-of-scope/outdated rows by writing wizard partition recovery state and marking `onboarding_scan_manifest` `hard_failed`. Add regression tests for valid pending-folder, moved, and deleted wizard Apply cases.
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`. Class-sweep: every Apply path that approves rows without re-checking Drive scope.

- Fix SHA:
  - **Finding 1: `909dd06`** `fix(sync): add wizard-scope Drive trust-boundary reverify on Apply (AC-6.26)`. Added Drive metadata reverify in the wizard-source branch BEFORE approval — fetches current Drive metadata, compares parents against `app_settings.pending_folder_id` (NOT watched_folder_id, per spec wizard-scope rule), handles 404→`STAGED_PARSE_SOURCE_GONE` + manifest hard_failed, moved→`STAGED_PARSE_SOURCE_OUT_OF_SCOPE` + manifest hard_failed, modtime drift→`STAGED_PARSE_REVISION_RACE` per Amendment 6. 591-line diff (316 production / 281 test, 4 new tests covering all 4 branches). Negative-regression: 3 of 4 tests fail when production hunk reverted (positive case still passes; failure cases need the new reverify path). Drive call happens OUTSIDE the lock per R3/R4 outbox pattern; recovery DB writes inside fresh transaction.
- Verification: 36/36 R6 targeted tests pass on my orchestrator machine (codex sandbox confirmed same — only the 3 pre-existing fetch-failed suites fail in breadth gate). Typecheck + lint clean.

### Round 7 — re-review against R6 fix (Codex via direct `codex exec`)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `2f255da` (R6 fix-SHA convergence log commit).
- Codex review: dispatched via direct `codex exec --sandbox read-only -c 'mcp_servers={}' < /dev/null`. Duration: ~5m. Verdict at `/tmp/m6-r7-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R6 fixes — fresh-eyes audit surfaced just **ONE** new finding (same as R6). Convergence holding at 1 finding/round. The finding is about pre-existing M6 architecture, not anything R1-R6 introduced.
- Findings (1, §A backend, ARCHITECTURAL):
  1. **[medium] Sync holds advisory lock ACROSS Drive fetch and parse — violates §5.2 lock-window contract** — `lib/sync/runScheduledCronSync.ts:1412`. `processOneFile` acquires `withPostgresSyncPipelineLock` BEFORE entering `processOneFile_unlocked`, and the locked body then performs `captureBinding` and `fetchSheetAsMarkdownAtRevision` BEFORE Phase 1/2 writes. Spec §5.2 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1040`) explicitly says lock-before-fetch is NOT used and fetch/parse happen BEFORE the advisory lock. Holding the DB transaction and show lock across slow external Drive calls can make push/cron skip or admin paths block for the duration of network/export work, violating the intended monotonic-guard design. Recommendation: split the pipeline so Drive binding/export/parse/enrich/reverify happen BEFORE opening the per-show transaction; keep Phase 1/Phase 2 DB writes and fetch-failure recovery mutations inside a fresh locked transaction. Add a regression that proves Drive fetch/parse dependencies run before `withShowLock` is entered.
- **Important interaction with prior fixes:** This finding requires careful coordination with R3 (242bb55 — locked Drive fetch-failure handler) and R5 F1 (55f8e57 — initial captureBinding wrapped in locked recovery). The R3/R5 fixes added MORE behavior INSIDE the existing locked block. The R7 fix needs to RESTRUCTURE: move the Drive ops OUT of the lock per §5.2, but preserve the R3/R5 recovery semantics (the failure-recovery DB writes — status update, sync_log, admin alert, pending_ingestions row — still happen inside a fresh locked transaction, just AFTER the Drive call completes/fails outside the lock).
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`. Class-sweep critical: every Drive ops + lock interaction in the per-file pipeline (cron, push, manual, onboarding) must be audited.

- Fix SHA:
  - **Finding 1: `445d0b4`** `refactor(sync): move Drive ops outside per-show lock per spec §5.2`. Substantial restructure: 351-line diff in `lib/sync/runScheduledCronSync.ts`, plus updates to `runManualSyncForShow.ts` (35 lines), advisory-lock structural test, and tests for both. 376 insertions / 148 deletions across 5 files. Drive binding/export/parse/enrich now happen BEFORE the per-show lock acquires; Phase 1 + Phase 2 DB writes (and R3/R5 fetch-failure recovery mutations) happen inside a fresh locked transaction AFTER the Drive call completes. Preserves R3 (242bb55) + R5 F1 (55f8e57) + R6 (909dd06) recovery semantics — failure → status update + sync_log + admin alert + pending_ingestions row, all inside the new fresh-locked-tx pattern.
- Verification: 36/36 R7 targeted tests pass on my orchestrator machine (codex sandbox saw 51/51 sync). pnpm typecheck + pnpm lint clean. Negative-regression: reverting only the production patch makes the new lock-boundary tests fail (proving they pin the §5.2 contract).

### Round 8 — re-review against R7 fix (Codex via direct `codex exec`)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `77f2c8c` (R7 fix-SHA convergence log commit).
- Codex review: dispatched via direct `codex exec --sandbox read-only -c 'mcp_servers={}' < /dev/null`. Duration: ~3m. Verdict at `/tmp/m6-r8-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R6 fixes — fresh-eyes audit caught a NEW lock-window violation that R7 itself inadvertently introduced (1 finding, medium severity, surgical).
- Findings (1, §A backend, **R7 regression**):
  1. **[medium] R7 introduced regression — deferral auto-clear DELETE happens BEFORE the lock** — `lib/sync/perFileProcessor.ts:200`. After R7, `processOneFile` calls `prepareProcessOneFile` before acquiring `withShowLock`, and that prepare path invokes `perFileProcessor`. For an automatic cron/push run where a live `defer_until_modified` row has advanced, `perFileProcessor` DELETEs from `deferred_ingestions` BEFORE the per-show advisory lock is acquired. Breaks R7's OWN pattern (DB writes inside lock). Can race an admin discard/retry or another sync worker, allowing a sheet to be processed despite a newer serialized deferral decision. Recommendation: split the gate so the pre-lock phase is READ-ONLY, then re-read and clear `deferred_ingestions` INSIDE the locked transaction before Phase 1/2. Add a regression proving the deferral DELETE occurs only after `withShowLock` has entered. Extend the structural lock test to catch pre-lock DB writes, not just advisory SQL holders.
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`. Class-sweep critical: this is the second class-sweep gap on the lock-window class (R7 was the first). The structural test must extend beyond "advisory SQL holders" to catch any pre-lock DB write.

- Fix SHAs:
  - **Finding 1: `2ae1f49`** `fix(sync): make deferral auto-clear DELETE happen inside the locked tx`. 242-line diff. Split the deferral gate: pre-lock phase is now READ-ONLY (SELECT to determine state), inside the locked tx re-SELECTs (consistent read under lock) and DELETEs if appropriate. Touches `lib/sync/perFileProcessor.ts` (-23 lines) and `lib/sync/runScheduledCronSync.ts` (+106 lines, gate moved into locked tx).
  - **Meta-test: `0e20beb`** `test(sync): extend structural lock contract to catch pre-lock DB writes`. 67-line extension to `tests/sync/_advisoryLockSingleHolderContract.test.ts`. Asserts mutating SQL (DELETE / UPDATE / INSERT against deferred_ingestions, pending_syncs, pending_ingestions) only appears AFTER the lock acquisition in the call flow — not just advisory SQL holders. Closes the class-sweep gap that allowed R7 to introduce the deferral DELETE regression in the first place.
- Verification: 48/48 R8 targeted tests pass on my orchestrator machine. pnpm typecheck + pnpm lint clean. Negative-regression: the new tests fail on pre-fix state, pass after restore (Codex confirmed).

### Round 9 — re-review against R8 fix (Codex via direct `codex exec`, fourth account)

- Base: `afa0906` (milestone-base; full-milestone scope unchanged).
- Head: `fc9b7c2` (R8 fix-SHA convergence log commit).
- Codex review: dispatched via direct `codex exec --sandbox read-only -c 'mcp_servers={}' < /dev/null`. Duration: 3m. Verdict at `/tmp/m6-r9-verdict.json`.
- Tooling note: third codex account hit usage limit after R8; user logged in with a fourth account. Four codex accounts exhausted across this session (initial + R3§A retry + R4 fix + R6 fix + R9 review).
- Verdict: **needs-attention.** No regressions on R1-R8 fixes — fresh-eyes audit caught 2 NEW lock-window violations that R7 (architectural restructure) missed AND R8 (class-sweep meta-test) didn't catch either. Both findings are R7 class-sweep gaps on parallel surfaces.
- Findings (2, §A backend):
  1. **[high] Live Apply performs Drive work UNDER the show lock** — `lib/sync/applyStaged.ts:1083`. The LIVE Apply path enters `withPostgresSyncPipelineLock`, reaches `applyStaged_unlocked`, verifies the advisory lock, and THEN calls `deps.fetchDriveFileMetadata` while the lock is held. Asset-review Apply can also call `retryEmbeddedRevisionAvailability` from the same locked body before Phase 2. Violates R7/spec §5.2 lock-window contract on a surface R7 didn't touch. Note: R6 (909dd06) already moved the WIZARD Apply Drive call outside the lock per the R3/R4 outbox pattern — the live Apply branch needs the same treatment. Recommendation: mirror the wizard Apply shape — short locked preflight to read pending/show/folder state, release the lock, perform Drive metadata/revision checks outside the lock, then reacquire and re-read/CAS `pending_syncs.staged_id` plus `base_modified_time` before DB writes. Extend the structural lock test to reject Drive helpers inside locked bodies (not just mutating SQL).
  2. **[medium] Manual `_unlocked` helper bakes in Drive-under-lock violation** — `lib/sync/runManualSyncForShow.ts:96`. `runManualSyncForShow_unlocked` accepts a `LockedShowTx`, asserts the lock is held, and then fetches Drive metadata before delegating to `processOneFile_unlocked`. Current route avoids this by prefetching through `runManualSyncForShow`, but the EXPORTED unlocked helper is explicitly intended for future lock-owning callers — bakes in the same Drive-under-lock violation. R8 structural guard only scans `runManualSyncForShow`, not this unlocked helper, so the gap is unprotected. Recommendation: change the unlocked helper to require a caller-provided `fileMeta` OR split it into pre-lock preparation plus locked DB body. Add `runManualSyncForShow_unlocked` to the lock-window structural sweep.
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`. Class-sweep critical: this is the THIRD round dealing with the lock-window class (R7 restructure → R8 R7-regression-repair → R9 more R7-class-sweep-gaps). The structural lock contract test must be extended yet again to cover Drive helpers inside locked bodies, applyStaged Apply path, and exported `_unlocked` helpers.

- Fix SHAs:
  - **Finding 1: `89ee4ce`** `fix(sync): move live Apply Drive work outside the show lock`. 464-line diff in `lib/sync/applyStaged.ts` (228 production / 271+17 test). Mirrors R6 wizard Apply shape (909dd06): short locked preflight → release → Drive metadata + revision checks outside lock → reacquire + CAS `pending_syncs.staged_id` and `base_modified_time` → Phase 2 DB writes. Same pattern for asset-review Apply branch (retryEmbeddedRevisionAvailability).
  - **Finding 2: `c660032`** `refactor(sync): require caller-provided fileMeta in runManualSyncForShow_unlocked`. 45-line diff. Removes the Drive-fallback path so the exported `_unlocked` helper requires preparation by lock-owning callers — no more Drive-under-lock baking. **Bonus: Codex's class-sweep ALSO removed `processOneFile_unlocked`'s Drive-preparation fallback** (a third parallel surface I didn't name in the prompt — the deeper code-shape-based mandate found it independently).
  - **Meta-test: `8772f0f`** `test(sync): comprehensive lock-window structural sweep across lib/sync + lib/drive + lib/asset`. 149-line new test that walks every `.ts` file in the three subtrees, finds every function that opens a lock or postgres transaction, and asserts NO Drive helper invocation appears in the call flow from lock-open to lock-release. Allowlist with explicit comments for any intentional exception. Designed to be the LAST extension needed for this class.
- Verification: 81/81 R9 targeted tests pass on my orchestrator machine. pnpm typecheck + pnpm lint clean. Codex breadth gate (~25s) shows only the 3 documented pre-existing fetch-failed suites.
- Methodology note: this round used a **deeper class-sweep mandate** (code-shape based, not entry-point-name-list based — see `feedback_class_sweep_must_be_code_shape_not_name_list.md`). Codex independently found `processOneFile_unlocked` as a third surface beyond the two named in R9's findings, validating the approach. The structural test (8772f0f) walks the entire subtree rather than scanning named files, which should prevent future class-sweep gaps for this class.

### Round 10 — re-review against R9 fix (Codex via direct `codex exec`)

- Base: `afa0906`. Head: `fb2b81d` (R9 fix-SHAs convergence log commit).
- Codex review duration: 5m. Verdict at `/tmp/m6-r10-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R9 fixes — fresh-eyes audit caught 1 NEW finding in a DIFFERENT class (message catalog correctness, not lock-window). Lock-window class is now stable; fresh-eyes is moving to other surfaces.
- Findings (1, §A backend):
  1. **[medium] Apply collapses extra/duplicate reviewer choices into the wrong code (§6.8.2/§12.4 violation)** — `lib/sync/applyStaged.ts:312`. Spec §6.8.2 requires distinct server outcomes for reviewer-choice validation: missing → `MISSING_REVIEWER_CHOICE`, extra → `EXTRA_REVIEWER_CHOICE`, duplicate → `DUPLICATE_REVIEWER_CHOICE`, invalid action → `INVALID_REVIEWER_ACTION`. Current validator maps duplicate item IDs and extra choices to `INVALID_REVIEWER_ACTION`; `lib/messages/catalog.ts` doesn't define `EXTRA_REVIEWER_CHOICE` or `DUPLICATE_REVIEWER_CHOICE` rows from §12.4. Doug sees wrong recovery copy for stale or duplicated Apply payloads; route doesn't emit the canonical codes the spec promises. Recommendation: add `EXTRA_REVIEWER_CHOICE` and `DUPLICATE_REVIEWER_CHOICE` constants/result union/status handling, return those exact codes from `validateReviewerChoices`, add §12.4 catalog entries with helpful context, extend `applyStaged` + M6 catalog tests for missing/extra/duplicate/invalid as separate cases.
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`. Surgical fix — well-scoped to the validator + catalog + tests. The R2 catalog meta-test (extended at 720f692) should automatically catch missing producer-write-site for the new codes.

- Fix SHAs:
  - **`f714119`** `feat(messages): add EXTRA_REVIEWER_CHOICE + DUPLICATE_REVIEWER_CHOICE codes per §12.4`. New catalog entries with helpful context per spec.
  - **`3b2a128`** `fix(sync): emit distinct extra/duplicate reviewer-choice codes from validateReviewerChoices`. Validator now classifies extra (item ID not in pending) → EXTRA_REVIEWER_CHOICE, duplicate (item ID appears more than once) → DUPLICATE_REVIEWER_CHOICE, INVALID_REVIEWER_ACTION reserved for unknown action verbs only. 89-line test addition covers all 4 reviewer-choice cases as separate tests.
- Verification: 107/107 R10 targeted tests pass on my orchestrator machine. pnpm typecheck + pnpm lint clean. Codex confirmed §4.6 does NOT classify malformed reviewer-choice submissions as `admin_alerts` producers (no upsertAdminAlert call needed); R2 catalog meta-test passed and would catch any catalog/producer mismatch for the new codes.

### Round 11 — re-review against R10 fix (Codex via direct `codex exec`)

- Base: `afa0906`. Head: `973897d` (R10 fix-SHAs convergence log commit).
- Codex review duration: 3m. Verdict at `/tmp/m6-r11-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R10 fixes — fresh-eyes audit caught 1 NEW finding. Same class as R3 F2 (cron folder-diff), R6 (wizard Apply reverify), R9 F1 (live Apply reverify) — "verify sheet is in scope before processing" — but on the manual re-sync surface that prior class-sweeps missed.
- Findings (1, §A backend):
  1. **[high] Manual re-sync bypasses watched-folder scope check** — `lib/sync/runManualSyncForShow.ts:106`. §5.2 says the manual single-show path replaces folder listing with `files.get(...)` and must return WITHOUT processing if the file is not in the configured watched folder. Current wrapper fetches Drive metadata, then immediately delegates to `processOneFile` without reading `app_settings.watched_folder_id` or checking `fileMeta.parents`. Because `perFileProcessor` bypasses automatic gates for `manual`, an admin Re-sync can Phase 2-apply a show whose sheet was moved out of the watched folder but remains readable by the service account, violating the folder-as-publish-gate contract. Recommendation: add a manual preflight that resolves the active watched folder and rejects metadata whose `parents` excludes it before Phase 1/2 processing; record the specified error/status under the per-show lock; add regression tests for out-of-folder and 404 manual re-sync cases.
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`. Class-sweep mandate (yet another surface in the "scope check" class): every entrypoint that processes a single sheet by ID without the cron folder listing — manual re-sync (named), maybe push (verify it gates on watched folder), maybe webhook handlers, maybe asset-recovery flows.

- Fix SHAs:
  - **`583c0c3`** `fix(sync): reject manual re-sync when sheet is outside the watched folder`. 406-line diff. Manual preflight resolves `app_settings.watched_folder_id` via `getActiveWatchedFolderId` (R1 helper), fetches Drive metadata, compares parents, rejects + records error/status under per-show lock if excluded. 232-line test addition covers valid/out-of-folder/404/no-folder cases.
  - **`70c09c8`** `fix(sync): scope-check push metadata fallback by watched folder`. **Class-sweep found a SECOND parallel surface** (push metadata fallback) that wasn't in R11's named finding — same scope-check bug class. 75-line addition.
  - **`97258dd`** `test(sync): structural sweep for sheet-scope check on single-sheet-by-id entrypoints`. New 156-line `tests/sync/_scopeCheckContract.test.ts` walks every entrypoint that fetches single-sheet metadata; asserts each call site has a documented scope check. Allowlist documented in code for lower-level helpers / exceptions.
- Verification: 97 tests pass per Codex; 11/11 R11 targeted tests pass on my orchestrator machine. pnpm typecheck + pnpm lint clean. Negative-regression confirmed.
- Methodology note: code-shape class-sweep (per `feedback_class_sweep_must_be_code_shape_not_name_list.md`) found `runPushSyncForShow` metadata fallback as a parallel surface beyond the named manual re-sync. Validates the deeper-mandate approach a third time (R7→R9→R11 each had at least one parallel surface independently surfaced by Codex).

### Round 12 — re-review against R11 fix (Codex via direct `codex exec`)

- Base: `afa0906`. Head: `3d82eb7` (R11 fix-SHAs convergence log commit).
- Codex review duration: 3m. Verdict at `/tmp/m6-r12-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R11 fixes — fresh-eyes audit caught 1 NEW finding, the FIRST §B UI finding of the entire convergence loop. Routes to me (Opus) per AGENTS.md UI invariant.
- Findings (1, §B UI — handled inline by Opus, NOT routed to Codex):
  1. **[medium] Raw parser warning codes render in staged review UI** — `components/admin/StagedReviewCard.tsx:347` (rendering surface) + `lib/sync/phase1.ts:110` (builder). The card renders `row.warningSummary` verbatim; `warningSummary` is built as `parseResult.warnings.map((w) => w.code).join(", ")`. Doug sees raw codes (`UNKNOWN_FIELD`, `UNKNOWN_ROLE_TOKEN`, etc.). Violates AGENTS.md invariant 5 (no raw error codes in user-visible UI) + §12.4 catalog contract for parser soft warnings.
- Fix SHA:
  - **`d95f64a`** `fix(sync): render parser warnings as human messages, drop raw codes`. Changed `warningSummary` builder in `lib/sync/phase1.ts` to use the parser's already-built `message` field (which has context filled in: "Unrecognized venue row label: 'CONTACT'", "Unknown role token 'XR' for 'Calvin Saller' — dropped") and filter `severity === "info"` warnings (admin-log-only like TYPO_NORMALIZED). 53-line diff with 38/38 phase1 tests passing including a new regression test that asserts the summary contains parser human messages and never contains raw code strings.
- Verification: 38/38 phase1 tests + 17/17 StagedReviewCard tests pass on my orchestrator machine. pnpm typecheck + pnpm lint clean. Negative-regression confirmed (exactly 1 test, the new one, fails on pre-fix code).
- Note: this is the FIRST §B UI finding across 12 review rounds. Up to now every finding has been §A backend. Convergence loop is now hitting different surfaces.

### Round 13 — re-review against R12 fix (Codex via direct `codex exec`)

- Base: `afa0906`. Head: `a63ada7` (R12 review + fix convergence log commit).
- Codex review duration: 5m. Verdict at `/tmp/m6-r13-verdict.json`.
- Verdict: **needs-attention.** No regressions on R1-R12 fixes — fresh-eyes audit caught 2 NEW spec-contract violations, both §A backend.
- Findings (2, §A backend):
  1. **[high] Phase 2 rewrites immutable show slugs** — `lib/sync/runScheduledCronSync.ts:778`. Production Phase 2 adapter updates existing shows with `set slug = $2`, while `lib/sync/phase2.ts` derives a fresh slug on every successful parse. Spec says a show slug is derived on FIRST successful parse and immutable thereafter, with collisions resolved by suffix. Title/date edits silently change crew/admin URLs (real user-visible regression). First-seen shows with duplicate derived slugs hit the unique `shows.slug` constraint because no collision retry exists. Recommendation: preserve existing `shows.slug` on update, derive slug only for inserts, implement suffix retry or equivalent collision handling for new shows inside locked Phase 2 path. Add regression tests for existing-show slug immutability and duplicate first-seen slug collisions.
  2. **[medium] Existing-show hard failures persist invalid sync status** — `lib/sync/runScheduledCronSync.ts:498`. `updateShowParseError()` writes `last_sync_status = 'hard_fail'` for existing-show invariant failures, but spec status set uses `parse_error` (does NOT include `hard_fail`). Phase 1 fake transaction test expects `parse_error` — tested behavior diverges from production SQL adapter. Once stored, invalid status can persist through pending-review restore paths via `prior_last_sync_status`. Recommendation: change production adapter to persist `last_sync_status = 'parse_error'` and keep hard-fail code/message in `last_sync_error`; add a production-adapter or structural regression test proving no SQL writes unsupported `last_sync_status` values.
- Routing: §A → direct `codex exec --sandbox workspace-write -c 'mcp_servers={}' < /dev/null`.

- Fix SHAs:
  - **`a693e6b`** `fix(sync): preserve immutable show slug + retry first-seen collisions`. 188-line diff. Production Phase 2 adapter now: (a) preserves `shows.slug` on UPDATE for existing shows, (b) derives slug only on INSERT, (c) retries with suffix on unique-violation collision. Title/date edits no longer change crew/admin URLs.
  - **`c1ff8f2`** `fix(sync): persist last_sync_status='parse_error' for existing-show hard failures`. Tiny 4-line fix: production adapter now persists `parse_error` (matching spec enum + Phase 1 fake test) and keeps the hard-fail code/message in `last_sync_error`. Also includes a related migration fix.
  - **`6659403`** `test(sync): structural sweep for last_sync_status enum compliance`. New 174-line test that walks every site writing `last_sync_status` and asserts only spec-defined enum values appear. Closes the class so future writes can't silently introduce invalid statuses.
- Verification: 41/41 R13 targeted tests pass on my orchestrator machine. pnpm typecheck + pnpm lint clean. Negative-regression confirmed.

### Round 14 — re-review against R13 fix (Codex via direct `codex exec`)

- Base: `afa0906`. Head: `97b44b4` (R13 fix-SHAs convergence log commit).
- Codex review duration: 6m. Verdict at `/tmp/m6-r14-verdict.json`.
- Verdict: **APPROVE.** Fresh-eyes review found R1-R13 fixes intact and NO new high/medium-severity issues in the M6 diff. Zero findings.

```json
{"verdict":"approve","summary":"R14 fresh-eyes review found the R1-R13 fixes intact and no new high- or medium-severity issues in the M6 diff.","findings":[]}
```

## 🎉 M6 convergence complete

M6 is approved. Final stats:

- **14 review rounds** (R1 needs-attention → R14 APPROVE).
- **31 fixes landed** across 31 commits (30 §A backend + 1 §B UI).
- **4 structural meta-tests** prevent the recurring classes from regressing:
  - `tests/sync/_advisoryLockSingleHolderContract.test.ts` (lock-window — R8 + R9 extension)
  - `tests/sync/_scopeCheckContract.test.ts` (sheet-scope check — R11)
  - `tests/messages/_metaAdminAlertCatalog.test.ts` (producer-write-site — R2 + R10 extension)
  - structural sweep for `last_sync_status` enum compliance (R13, embedded in `runScheduledCronSync.test.ts`)
- **Convergence trajectory:** R1-R5: 3 findings each → R6-R8: 1/1/1 → R9: 2 (R7 class-sweep gaps) → R10-R12: 1/1/1 → R13: 2 (last spec-contract gaps) → R14: 0 ✅
- **Tooling cost:** 5 codex accounts exhausted (initial + 4 logins during the loop). One ~30-min false start chasing a misdiagnosed serena MCP red herring before isolating the actual bug (missing `< /dev/null` on direct `codex exec`).
- **Memory updates:** `feedback_codex_exec_needs_stdin_closed.md` (real cause of all "codex hangs"), `feedback_codex_hang_caused_by_orphan_mcp.md` (deprecated wrong hypothesis), `feedback_class_sweep_must_be_code_swape_not_name_list.md` (deeper class-sweep mandate that found 4 additional parallel surfaces beyond named instances across R7+R9+R11), `feedback_detect_codex_hangs_via_log_growth.md` (monitor methodology).

Per the handoff §10 exit criteria, M6 §A backend convergence loop is closed. DEFERRED.md M6-D12 (Amendment 9 auto-publish + 24h-undo) remains open as the explicit deferred follow-up.

### Cross-model verification (Claude Sonnet 4.6 via feature-dev:code-reviewer agent)

After Codex's R14 APPROVE, dispatched a Claude-side independent review as a second-opinion cross-validation. The Claude reviewer investigated four threads beyond Codex's audit (`logSync` guard at runScheduledCronSync.ts:1347, `listPostgresLiveShows` query shape, `processOneFile` ConcurrentSyncSkipped return path, `provisionAddedCrewAuth` semantics) plus the broader M6 surface.

```
VERDICT: approve
SUMMARY: All open review threads resolved cleanly — logSync guard, ConcurrentSyncSkipped return path, listPostgresLiveShows query shape, and provisionAddedCrewAuth semantics are all correct; no high-confidence issues found.
FINDINGS: none
```

**Both models (Codex GPT-5.5 + Claude Sonnet 4.6) independently APPROVED M6.** Strong cross-model agreement on convergence — the milestone is genuinely converged, not an artifact of single-model blind spots.
