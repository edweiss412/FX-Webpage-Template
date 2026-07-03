# Observability Coverage Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the six live-code observability gaps from the post-#218/#220 re-audit — client telemetry codes + global error listener, asset-500 logging, high-value server codes, publish/archive/unpublish outcome telemetry, Drive webhook + watch-channel logging, and DEF-3 standing-ignore visibility.

**Architecture:** Additive log instrumentation + two structural try/catch blocks (webhook/watch infra) + one new null-render client component. No DB migration, no advisory-lock change, no new Supabase call sites. 18 new forensic codes (all inside `log.*`/`logAdminOutcome` spans or `components/` or runtime variables → §12.4-exempt).

**Spec:** `docs/superpowers/specs/2026-07-02-observability-coverage-completion-design.md` (Codex-APPROVED, 4 rounds). Every anchor is verified against live code.

## Global Constraints
- **TDD per task, commit per task.** Conventional commits; scopes: `observe`, `asset`, `auth`, `agenda`, `admin`, `drive`, `sync`, `log`.
- **Scanner-safety:** every new code literal sits inside a dotted `log.*(...)`/`logAdminOutcome(...)` span, OR in `components/` (unscanned root), OR flows as a runtime variable. The client route's `log[level](` is a COMPUTED member (NOT stripped) → its `code` MUST be `cap(body.code)` (variable), never a literal. No code in any HTTP body / plain object / doc comment.
- **Client telemetry is warn/error only** (both always persist) — `code` there is categorization, not persistence.
- **S6:** KEEP `await requireAdmin()` gate + ADD `const { email } = await requireAdminIdentity()`; `await logAdminOutcome(...)` post-commit (await is load-bearing).
- **S7:** two NEW try/catch blocks (webhook infra, watch infra) — control-flow change, preserve existing 500/propagation.
- **Meta-test (Task 14) runs LAST.** DEFERRED.md (Task 15) for the impeccable disposition.
- Derive test expectations from fixtures; spy-on-log assertions required.

**New codes (18):** client — `REALTIME_UNKNOWN_SYSTEM_EVENT`, `CLIENT_WINDOW_ERROR`, `CLIENT_UNHANDLED_REJECTION`; server — `OAUTH_CLAIM_RPC_FAILED`, `OAUTH_CLAIM_STAMP_FAILED`, `AGENDA_EXTRACT_REGION_FAILED`, `AGENDA_EXTRACT_PREEXTRACT_FAILED`; admin-outcome — `SHOW_PUBLISHED`, `SHOW_ARCHIVED`, `SHOW_UNARCHIVED_BY_ADMIN`, `SHOW_UNPUBLISHED_BY_ADMIN`; drive — `DRIVE_WEBHOOK_RECEIVED`, `DRIVE_WEBHOOK_HEADERS_INCOMPLETE`, `DRIVE_WEBHOOK_CHANNEL_INACTIVE`, `DRIVE_WEBHOOK_INFRA_FAULT`, `DRIVE_WATCH_RENEWAL_FAILED`, `DRIVE_WATCH_INFRA_FAULT`; sync — `MANUAL_RESYNC_CLEARED_STANDING_IGNORE`. **S3 reuses existing `infraError` codes (0 new).**

---

## Task 1: clientLog + transport — plumb `code`/`detail`

**Files:** `lib/observe/clientLog.ts`, `lib/observe/clientErrorTransport.ts`; Test: `tests/observe/clientLog.test.ts`, `tests/observe/clientErrorTransport.test.ts`.

- [ ] **Step 1: failing tests** — clientLog: passing `code`/`detail` (5th/6th args) forwards them to the transport; the code-less 4-arg call still produces the exact `{source,level,message}` transport payload (existing `:26` equality holds). transport: `code`/`detail` appear in the payload only when present, each capped.
- [ ] **Step 2: run → FAIL.**
- [ ] **Step 3: impl** — `clientLog(level, source, message, context?, code?, detail?)` (append params, keep `context` 4th); forward only `code`/`detail` to `clientErrorTransport` (not `context`). `clientErrorTransport`: add optional `code?`/`detail?` to the input type + payload (`:16-37`), cap via `CAPS` (`:3-10`; add `code:80, detail:500`), append only when present.
- [ ] **Step 4: run → PASS + the 15-realtime-call structural test still green.**
- [ ] **Step 5: commit** — `feat(observe): plumb optional code+detail through clientLog+transport`

## Task 2: client-error route — read/emit `code`/`detail`

**Files:** `app/api/observe/client-error/route.ts`; Test: the route's test (grep `client-error`).

- [ ] **Step 1: failing test** — a POST body with `code`/`detail` → the emitted `log[level]` record carries `code` (spy the sink) + `detail` in context; over-cap `code`/`detail` are truncated; a body without `code` still logs (no code).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — read `body.code`/`body.detail` at `:84-95`, `cap()` them (mirror `CAPS`), add `...(code ? { code } : {})` + `...(detail ? { detail } : {})` inside the `log[level]({ source, ... })` object (`:122-129`). **`code` stays a variable (`cap(body.code)`) — NO literal** (computed-member span isn't stripped).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(observe): client-error route accepts code+detail`

## Task 3: ShowRealtimeBridge — REALTIME_UNKNOWN_SYSTEM_EVENT

**Files:** `components/realtime/ShowRealtimeBridge.tsx:654-662`; Test: `tests/realtime/showRealtimeBridge.test.tsx` (or `tests/observe/showRealtimeBridge.test.tsx`).

- [ ] **Step 1: failing test** — an unknown system event → `clientLog` called with `"REALTIME_UNKNOWN_SYSTEM_EVENT"` + the event name as detail; the 15-call structural count unchanged.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — `clientLog("warn", "client.realtime", "unknown system event", unknownEvent, "REALTIME_UNKNOWN_SYSTEM_EVENT", String(unknownEvent.event ?? "").slice(0, 120))`. (In `components/` → literal is fine.)
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(observe): code+event-name on realtime unknown-system-event`

## Task 4: GlobalErrorListener (window.onerror/unhandledrejection)

**Files:** NEW `components/observe/GlobalErrorListener.tsx`, `app/layout.tsx`; Test: NEW `tests/observe/globalErrorListener.test.tsx`.

- [ ] **Step 1: failing test** — mounting the component registers `error`+`unhandledrejection` listeners; a `window` error → `clientLog('error','client.root', msg, undefined, 'CLIENT_WINDOW_ERROR', detail)`; a rejection → `'CLIENT_UNHANDLED_REJECTION'`; unmount removes listeners; double-mount (StrictMode) registers once.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — `'use client'` component returning `null`; on mount `addEventListener('error'|'unhandledrejection')` → `clientLog(...)` with a bounded detail (filename:lineno / reason, ~300 cap); symmetric `removeEventListener` cleanup; module-level idempotence guard. Mount `<GlobalErrorListener />` inside `<body>` at `app/layout.tsx:57-59`.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(observe): global window error + unhandledrejection listener`

## Task 5: Asset-proxy infra-500 logging (agenda, diagram, reel)

**Files:** `app/api/asset/agenda/[show]/[id]/route.ts`, `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`, `app/api/asset/reel/[show]/route.ts`; Test: `tests/api/agenda-asset-route.test.ts`, `tests/api/diagram-asset-route.test.ts`, `tests/api/reel-asset-route.test.ts`.

- [ ] **Step 1: failing tests** — an injected infra fault on GET → `log.error` with the route's `code` (spy the sink); the SAME on HEAD; a 404/benign path does NOT log.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — inside each route's `infraError(code)` helper (agenda `:118`, reel `:162`, diagram's analogous), add `void log.error("asset infra fault", { source: "api.asset.<kind>", code })` (import `log`). `code` is the helper's PARAMETER (variable → scanner-safe). Covers GET+HEAD+all call sites.
- [ ] **Step 4: PASS (both verbs).**
- [ ] **Step 5: commit** — `feat(asset): log.error on asset-proxy infra 500 (GET+HEAD via infraError)`

## Task 6: Server forensic codes (OAuth claim, agenda extract)

**Files:** `app/auth/callback/route.ts`, `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts:451,466`; Test: the callback + extract-agenda tests.

- [ ] **Step 1: failing tests** — spy the sink: the OAuth claim-RPC fault → `OAUTH_CLAIM_RPC_FAILED`; claim-stamp fault → `OAUTH_CLAIM_STAMP_FAILED`; extract-agenda region/pre-extract faults → `AGENDA_EXTRACT_REGION_FAILED`/`AGENDA_EXTRACT_PREEXTRACT_FAILED`. Message + `error` preserved.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — add `code: "<CODE>"` to the existing code-less `log.error` fields object at each of the 4 verified sites (message + `error` unchanged): `app/auth/callback/route.ts:99` (`"claim_oauth_identity returned error"` → `OAUTH_CLAIM_RPC_FAILED`), `:131` (`"claim-stamp threw"` → `OAUTH_CLAIM_STAMP_FAILED`); `extract-agenda/…/route.ts:451` (`"unexpected error in extract/merge region:"` → `AGENDA_EXTRACT_REGION_FAILED`), `:466` (`"unexpected error before extraction:"` → `AGENDA_EXTRACT_PREEXTRACT_FAILED`). (Leave the lean-leave sites `callback:84` getUser + `:121` alert-emission — source+error suffice.)
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(auth,agenda): forensic codes on OAuth-claim + agenda-extract faults`

## Tasks 7–10: publish / archive / unarchive / undo-auto-publish telemetry

Each task (one per file) follows the SAME shape. **Files** (one each): `app/admin/show/[slug]/_actions/publish.ts` (`SHOW_PUBLISHED`, `:27`), `archive.ts` (`SHOW_ARCHIVED`, `:30`), `unarchive.ts` (`SHOW_UNARCHIVED_BY_ADMIN`, `:33`), `undoAutoPublish.ts` (`SHOW_UNPUBLISHED_BY_ADMIN`, `case "success"` `:82`). **Tests:** the per-action test files (grep the action name).

- [ ] **Step 1: failing test** — a committed success (`result.ok` / `case "success"`) → `await logAdminOutcome` called once with `{ code, source, actorEmail, showId }`; a failure/no-op does NOT emit. Derive `actorEmail` from the seeded admin identity; `showId=resolved.show.id` (or `result.showId` for undo).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — keep `await requireAdmin()`; add `const { email } = await requireAdminIdentity()` (import both). In the committed-success block, `await logAdminOutcome({ code: "<CODE>", source: "admin.show.<action>", actorEmail: email, showId })`. Import `logAdminOutcome` from exactly `@/lib/log/logAdminOutcome`. Code literal rides the `logAdminOutcome(...)` call (stripped → exempt).
- [ ] **Step 4: PASS + typecheck the file.**
- [ ] **Step 5: commit** — `feat(admin): <CODE> telemetry on <action>`

## Task 11: Drive webhook logging + infra catch

**Files:** `app/api/drive/webhook/route.ts`; Test: NEW `tests/drive/webhook.test.ts` (via `setLogSink`/`resetLogSink`).

- [ ] **Step 1: failing tests** — receipt → `log.info DRIVE_WEBHOOK_RECEIVED` (info persists via code); headers-incomplete → `log.warn DRIVE_WEBHOOK_HEADERS_INCOMPLETE`; channel-inactive(410) → `log.warn DRIVE_WEBHOOK_CHANNEL_INACTIVE`; an injected `DriveWebhookInfraError` → `log.error DRIVE_WEBHOOK_INFRA_FAULT` AND the response is still the existing 500; an ignored resource-state does NOT log; the deferred dispatch does NOT double-log.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — import `log`. Add the receipt/headers/channel `void log.*` at `:251/:243/:256`. **Add a try/catch** at the `POST`/`handleDriveWebhook` boundary (`:295-301`) catching `DriveWebhookInfraError` → `void log.error(..., { code:"DRIVE_WEBHOOK_INFRA_FAULT", error: err.rootCause, operation: err.operation })` then re-return the existing 500 (preserve status). Do NOT log ignored resource-states / dispatch.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(drive): durable webhook receipt/rejection/infra logging`

## Task 12: Watch-channel renewal + infra logging

**Files:** `lib/drive/watch.ts`; Test: NEW `tests/drive/watch.test.ts`.

- [ ] **Step 1: failing tests** — a renewal whose `subscribe` returns `outcome:"orphaned"` → `log.warn DRIVE_WATCH_RENEWAL_FAILED` (in `refreshWatchSubscriptions`, NOT for initial create/activate); an injected `DriveWatchInfraError` in the sweep → `log.error DRIVE_WATCH_INFRA_FAULT` + existing propagation preserved.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — in `refreshWatchSubscriptions` (`:425-428`), `const result = await subscribe(row.watchedFolderId); if (result.outcome === "orphaned") void log.warn("watch channel renewal failed", { source:"drive.watch", code:"DRIVE_WATCH_RENEWAL_FAILED", channelId: result.channelId, watchedFolderId: row.watchedFolderId })`. Add a try/catch around the sweep bodies catching `DriveWatchInfraError` → `void log.error(..., { code:"DRIVE_WATCH_INFRA_FAULT", error: err.rootCause, operation: err.operation })`; preserve propagation.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(drive): watch-channel renewal-failure + infra logging`

## Task 13: DEF-3 standing-ignore visibility

**Files:** `lib/sync/runManualSyncForShow.ts`; Test: `tests/sync/runManualSyncForShow.test.ts`.

- [ ] **Step 1: failing test** — a manual re-sync that clears a `permanent_ignore` deferral AND still `hard_fail`s → `log.warn MANUAL_RESYNC_CLEARED_STANDING_IGNORE`; a re-sync that succeeds, or clears a `defer_until_modified`, or had no deferral → does NOT emit.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: impl** — declare outer `let priorDeferralKind: string | undefined`. Inside the `withShowLock` callback, before `:425`: `const priorDeferral = await tx.readLiveDeferral?.(driveFileId); priorDeferralKind = priorDeferral?.deferred_kind;` then `await tx.deleteLiveDeferral?.(driveFileId)`. After `applyResult` resolves (`:441`, post-commit): `if (priorDeferralKind === "permanent_ignore" && "outcome" in applyResult && (applyResult.outcome === "hard_fail" || applyResult.outcome === "parse_error")) void log.warn("manual re-sync cleared a standing permanent-ignore that still fails", { source:"sync.manualResync", code:"MANUAL_RESYNC_CLEARED_STANDING_IGNORE", driveFileId, ...(("showId" in applyResult && applyResult.showId) ? { showId: applyResult.showId } : {}) })`.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: commit** — `feat(sync): surface manual re-sync clearing a still-failing permanent-ignore`

## Task 14: Extend meta-test (LAST — after Tasks 7–10 + all codes exist)

**Files:** `tests/log/_metaAdminOutcomeContract.test.ts`.

- [ ] **Step 1: extend** — `AUDITABLE_MUTATIONS` += 4 rows (the 4 S6 action files → their codes); `SANCTIONED_CODES` += `SHOW_PUBLISHED, SHOW_ARCHIVED, SHOW_UNARCHIVED_BY_ADMIN, SHOW_UNPUBLISHED_BY_ADMIN`; `NEW_FORENSIC_CODES` += the 14 non-admin codes (client 3, server 4, drive 6, sync 1). **Tighten Assertion 1** from `/logAdminOutcome\(/` to `/await\s+logAdminOutcome\(/`.
- [ ] **Step 2: run → all 4 assertions PASS** (existing rows already `await`).
- [ ] **Step 3: negative-regression** — temporarily drop the `await` on one S6 action → Assertion 1 FAILS; restore. Temporarily leak one new code in a plain object → Assertion 4 FAILS; restore.
- [ ] **Step 4: commit** — `test(log): extend _metaAdminOutcomeContract for completion codes + await guard`

## Task 15: DEFERRED.md impeccable disposition

- [ ] **Step 1** — add a `DEFERRED.md` entry: the impeccable v3 dual-gate is DEFERRED for `components/observe/GlobalErrorListener.tsx` (returns `null` — zero rendered output) + the `app/layout.tsx` `<GlobalErrorListener/>` mount (single non-visual line); rationale: no visual surface for `/impeccable critique`+`audit` to evaluate. Cite invariant 8.
- [ ] **Step 2: commit** — `docs(deferred): impeccable-gate disposition for null-render GlobalErrorListener`

## Task 16: Whole-diff verification

- [ ] **Step 1** — `pnpm gen:internal-code-enums` + `pnpm gen:spec-codes` → no diff.
- [ ] **Step 2** — x1 `tests/cross-cutting/codes.test.ts` (via `pnpm test:audit:x1-catalog-parity`) + `tests/messages/codeProducers.test.ts` → PASS (no leaked producer).
- [ ] **Step 3** — targeted suites: `tests/observe tests/realtime tests/api tests/auth tests/agenda tests/drive tests/sync/runManualSyncForShow.test.ts tests/log` → PASS.
- [ ] **Step 4** — `pnpm typecheck` clean; `pnpm lint` (0 errors); `pnpm format:check` clean (prettier-write any agent-authored files first).
- [ ] **Step 5** — full `pnpm test` → green except the known env-only failures (verify unrelated at merge-base).

---

## Self-review checklist
- **Spec coverage:** S2/S4→T1-T4; S3→T5; S5→T6; S6→T7-T10; S7→T11-T12; S8→T13; meta-test→T14; DEFERRED.md→T15; verify→T16.
- **Type consistency:** `logAdminOutcome`/`AdminOutcome`, `clientLog(...,code?,detail?)`, `tx.readLiveDeferral`, `SubscribeResult.outcome` all match live signatures.
- **Scanner-safety:** every code inside a log/logAdminOutcome span or components/ or a runtime variable; the client route uses `cap(body.code)` (no literal); S3 reuses the `infraError` param.
- **Await:** T7-T10 use `await logAdminOutcome`; T14 tightens the guard.
- **Structural:** T11/T12 add try/catch preserving existing 500/propagation.
