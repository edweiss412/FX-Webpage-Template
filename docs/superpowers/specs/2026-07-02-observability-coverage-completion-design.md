# Observability Coverage Completion — Design Spec

**Date:** 2026-07-02
**Branch/worktree:** `feat/observability-coverage-completion` @ `/Users/ericweiss/fxav-observability-completion` (off `origin/main` `95716b0e`)
**Status:** Draft → self-review → Codex adversarial-review (autonomous-ship; user spec+plan gates WAIVED per AGENTS.md).

---

## 0. Motivation

The post-#218/#220 re-audit (with an adversarial critic) found the observability gaps that remain after the breadcrumb + admin-outcome telemetry shipped. This milestone closes the six that are **live code today** (not deferred infra). It is additive log instrumentation plus two small structural changes (a new client global-error listener, and a new try/catch on the webhook infra path). **No DB migration. No advisory-lock topology change. No new Supabase call sites.**

Surfaces (issue numbers from the re-audit):

| # | Surface | Kind |
|---|---|---|
| S2 | Client telemetry is code-less → plumb `code`+`detail` through `clientLog → transport → route`; stamp `REALTIME_UNKNOWN_SYSTEM_EVENT` + forward the event name | client wiring |
| S4 | No `window.onerror`/`unhandledrejection` handler → async errors drop silently | new client component |
| S3 | Asset-proxy routes (`agenda`/`diagram`/`reel`) persist nothing on infra 500 | route logging |
| S5 | High-value server `log.error` sites are code-less (OAuth claim, agenda extract) | server codes |
| S6 | publish/archive/unarchive/undo-auto-publish untracked → `logAdminOutcome` | admin-outcome |
| S7 | Drive webhook + watch-channel renewal unlogged | boundary logging + new catch |
| S8 | DEF-3: manual re-sync clears a `permanent_ignore` that still fails, silently | one warn (logging-only) |

**Scope calls (stated up front to preempt review):**
- **S6 covers the 4 admin-invokable actions only.** The 2 *public* unpublish-via-link legs (`app/show/[slug]/unpublish/actions.ts`, `app/api/show/[slug]/unpublish/route.ts`) are **DEFERRED** — they're dormant (reachable only by clicking an emailed undo link, and notify email delivery is currently unconfigured), and they have no admin actor so they don't fit the admin-outcome registry cleanly. Filed as a follow-up for when notify delivery is enabled.
- **S7 covers 6 high-value codes**, not all 9 the scout enumerated. Skipped: `DRIVE_WATCH_CREATE_FAILED`/`ACTIVATE_FAILED`/`GC_STOP_FAILED` — the create/activate failures already raise a `WATCH_CHANNEL_ORPHANED` admin_alert (semi-visible), and gc-stop is best-effort cleanup (low value). Folded into `DRIVE_WATCH_RENEWAL_FAILED` (the real silent gap) + `DRIVE_WATCH_INFRA_FAULT`.
- **S8 is logging-only, NOT a behavior change.** A true auto-restore of the deferral could surprise an admin who deliberately re-synced; the minimal, safe fix is to make the "reprocesses every cron run until re-defer" condition *visible*. Auto-restore is filed to BACKLOG.
- **S5 is 4 high-value codes**, not a blanket sweep of the ~59 code-less server sites (YAGNI). The rest carry `source` + serialized `error` and are left alone.
- **Overlap:** S6 overlaps the `published-toggle` in-flight branch; S7 overlaps `watch-channel-health`. Both branches are spec/plan-stage (no code); per the user's decision, we instrument now (additive log lines those branches rebase over).

**Overlap with a moving base:** since PR #218's `logAdminOutcome` + the #220 meta-test are on `main`, this milestone EXTENDS `tests/log/_metaAdminOutcomeContract.test.ts` (adds S6's 4 codes to the registry).

---

## 1. Plan-wide invariants honored

- **Invariant 3 (email canonicalization):** S6 switches `requireAdmin()`→`requireAdminIdentity()` to obtain the already-canonical email (`requireAdmin.ts:208` `canonicalize(claims.email)`); passed as `actorEmail` (hashed internally). Never re-canonicalize.
- **Invariant 5 (no raw codes in user UI):** every new code is a **forensic log code** inside a `log.*`/`logAdminOutcome`/`clientLog` span (or, for the client route, a runtime variable — see §7). None appears in a user-facing surface or an HTTP body. §12.4 catalog untouched.
- **Invariant 9 (Supabase call-boundary):** no new Supabase call sites. S7 wraps existing calls in a new try/catch but destructuring/error-handling of the underlying calls is unchanged; logging is fire-and-forget (`void log.*`) and never throws over the caller.
- **Invariant 2 (advisory locks):** unchanged — the S6 mutations self-lock internally; telemetry fires post-commit, acquires no lock.

---

## 2. Surface S2/S4 — Client telemetry code + global error listener

**Files:** `lib/observe/clientLog.ts`, `lib/observe/clientErrorTransport.ts`, `app/api/observe/client-error/route.ts`, `components/realtime/ShowRealtimeBridge.tsx`, NEW `components/observe/GlobalErrorListener.tsx`, `app/layout.tsx`.

### 2.1 Plumb `code` + `detail` (back-compatible)
- **`clientLog`** (`lib/observe/clientLog.ts:5`): append two OPTIONAL params, keeping `context` 4th so all 15 realtime callers + `RightNowHero.tsx:419` + `RightNowCard.tsx:517` compile unchanged: `clientLog(level, source, message, context?, code?, detail?)`. Forward ONLY `code`/`detail` to `clientErrorTransport` (NOT `context`, which stays console-only — its never-mirrored behavior is unchanged). The `clientLog.test.ts:26` exact-equality on `{source,level,message}` for the code-less case must still hold → append `code`/`detail` to the transport payload only when present.
- **`clientErrorTransport`** (`lib/observe/clientErrorTransport.ts:16`): add optional `code?`/`detail?` to the input type + the `Record<string,string>` payload (`:31-37`), each capped via `CAPS` (`:3-10`; add `code:80`, `detail:500`). Append to payload ONLY when present.
- **route** (`app/api/observe/client-error/route.ts`): read `body.code`/`body.detail` at the validation region (`:84-95`), `cap()` them (`:48` helper; mirror the CAPS), and add `...(code ? { code } : {})` + `...(detail ? { detail } : {})` inside the `log[level](...)` fields object (`:122-129`). `code` is a reserved field (`logger.ts:10`) → becomes `app_events.code` and flips `info` persistence on.

### 2.2 SCANNER-SAFETY (critical nuance)
The route's `log[level](...)` is a **computed member** — `stripLogEmissionCalls` (`stripLogEmissionCalls.ts:26`, `LOG_CALL_AT` matches only dotted `log.error|warn|info|debug(` / `logAdminOutcome(`) does **NOT** strip it. It is safe ONLY because the route passes `code` as a **runtime variable** (`cap(body.code)`), never a quoted SHOUTY literal — `PRODUCER_RE` (`code:` + quoted SHOUTY) can't match a variable. **HARD RULE: the route must never contain a `code: "SHOUTY"` literal.** The code literals live in `components/` (NOT a scanned root — `ACTIVE_PRODUCER_ROOTS=["app","lib"]`) and flow to the route as POST-body values. `detail` is free-form (never `code:`), no risk.

### 2.3 Realtime unknown-event canary
`ShowRealtimeBridge.tsx:654-662` default branch: change `clientLog("warn", "client.realtime", "unknown system event", unknownEvent)` → `clientLog("warn", "client.realtime", "unknown system event", unknownEvent, "REALTIME_UNKNOWN_SYSTEM_EVENT", String(unknownEvent.event ?? "").slice(0, 120))`. Now the row carries a code AND the discriminating event name (currently dropped). (`components/` is unscanned → the literal is fine here.) Do NOT add/remove any of the 15 `clientLog` calls (a structural test pins the count).

### 2.4 Global error listener (S4)
NEW `components/observe/GlobalErrorListener.tsx` — a `'use client'` component returning `null` that, on mount, `window.addEventListener('error', …)` + `addEventListener('unhandledrejection', …)` → `clientLog('error', 'client.root', message, undefined, 'CLIENT_WINDOW_ERROR' | 'CLIENT_UNHANDLED_REJECTION', boundedDetail)`, with symmetric `removeEventListener` cleanup and a module-level idempotence guard (React StrictMode double-mount). Mount as `<GlobalErrorListener />` inside `<body>` at `app/layout.tsx:57-59` (RootLayout is a Server Component with no existing client-providers tree to reuse). Bound the detail (filename:lineno / reason message, capped ~300). This shares the existing `clientErrorTransport` dedup set, so a crash mirrored by both a React boundary and `window.onerror` de-dupes.

---

## 3. Surface S3 — Asset-proxy routes durable on infra 500

**Files:** `app/api/asset/agenda/[show]/[id]/route.ts`, `app/api/asset/diagram/[show]/[rev]/[key]/route.ts`, `app/api/asset/reel/[show]/route.ts`.

At each route's genuine **infra-fault** 500 return (Supabase read fail, Drive/Storage fetch fail — NOT the 404/not-found/expected-auth paths), add a `void log.error("<asset> fetch failed", { source: "api.asset.<kind>", code: "ASSET_<KIND>_FETCH_FAILED", showId?: <slug/id if resolvable>, error: <the underlying error> })` before returning the 500. Codes: `ASSET_AGENDA_FETCH_FAILED`, `ASSET_DIAGRAM_FETCH_FAILED`, `ASSET_REEL_FETCH_FAILED`. Each lives inside a dotted `log.error(...)` span → §12.4-exempt. `error`+ code always persists. Do NOT log 404/expected paths (over-logging).

---

## 4. Surface S5 — High-value server forensic codes

**Files + exact code-less sites (from the scout, verified):** add a `code:` to the existing code-less `log.error` fields object (message unchanged, existing `error:` kept):
- `app/auth/callback/route.ts` OAuth claim RPC fail → `OAUTH_CLAIM_RPC_FAILED`; claim-stamp fail → `OAUTH_CLAIM_STAMP_FAILED`.
- `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts:451,466` → `AGENDA_EXTRACT_REGION_FAILED`, `AGENDA_EXTRACT_PREEXTRACT_FAILED`.

Each is inside a dotted `log.error(...)` span → §12.4-exempt. The **left-alone** sites (documented, not changed): the ~55 other code-less `log.error`/`log.warn` sites carry `source` + serialized `error` and are adequately triageable by source; blanket-coding them is over-instrumentation (YAGNI). The exact anchors for the 4 chosen sites are pinned in the plan.

---

## 5. Surface S6 — publish/archive/unarchive/undo-auto-publish telemetry

**Files:** `app/admin/show/[slug]/_actions/{publish,archive,unarchive,undoAutoPublish}.ts`. `logAdminOutcome({ code, source, actorEmail, showId })` post-commit.

| Action | Code | Committed-success anchor | Actor | showId |
|---|---|---|---|---|
| `publish.ts` | `SHOW_PUBLISHED` | `if (result.ok)` (`:27`, post-commit — `publishShow` self-locks in-DB) | switch `requireAdmin()` (`:21`) → `requireAdminIdentity()` | `resolved.show.id` |
| `archive.ts` | `SHOW_ARCHIVED` | `if (result.ok)` (`:30`) | switch (`:24`) | `resolved.show.id` |
| `unarchive.ts` | `SHOW_UNARCHIVED_BY_ADMIN` | `if (result.ok)` (`:33`) | switch (`:27`) | `resolved.show.id` (+ `driveFileId=resolved.show.driveFileId`) |
| `undoAutoPublish.ts` | `SHOW_UNPUBLISHED_BY_ADMIN` | `case "success"` (`:82`) | switch (`:59`) | `result.showId` |

- **DIRECT emit (no outcome-ref):** each mutation fn (`publishShow`/`archiveShow`/`unarchiveShow` via the `showLifecycle` RPC chokepoint; `unpublishShow` owns `withShowLock`+`sql.begin` internally) resolves AFTER commit, so `logAdminOutcome` goes in the outer-scope `if (result.ok)` / `case "success"` block. `LifecycleResult` carries no showId → use `resolved.show.id` (available in the admin action).
- **Actor-identity migration:** `requireAdmin()` returns void; switch to `const { email } = await requireAdminIdentity()` (`requireAdmin.ts:279`, canonical email at `:208`). Same behavior-transparency note as #220 R3/R5: `requireAdmin` runs the `x-help-force-infra-fail` hook that `requireAdminIdentity` doesn't — but these admin *actions* (not routes) don't use that test hook, and the scout confirms the identity call is the clean source. Verify no test relies on the void `requireAdmin` shape in these 4 files; if the switch drops a hook a test needs, keep `await requireAdmin()` as the gate and add `requireAdminIdentity()` for the email (the #220-R3/R5 pattern).
- **Name-collision guard (verified):** `catalog.ts` already defines `SHOW_UNPUBLISHED` (`:962`), `SHOW_ARCHIVED_BY_ADMIN` (`:1565`), `SHOW_UNARCHIVED` (`:1577`), `SHOW_PUBLISHED_BY_ADMIN` (`:1589`), `WEBHOOK_HEADERS_MISSING` (`:2969`). The 4 chosen codes (`SHOW_PUBLISHED`, `SHOW_ARCHIVED`, `SHOW_UNARCHIVED_BY_ADMIN`, `SHOW_UNPUBLISHED_BY_ADMIN`) are all 0-hit verified.
- **Meta-test:** add the 4 `{file, code}` rows to `AUDITABLE_MUTATIONS` + the 4 codes to `SANCTIONED_CODES` (`tests/log/_metaAdminOutcomeContract.test.ts:13,34`), lockstep. Assertion 1 requires each file to import from exactly `@/lib/log/logAdminOutcome`, call `logAdminOutcome(`, and contain the quoted code.

---

## 6. Surface S7 — Drive webhook + watch-channel telemetry

**Files:** `app/api/drive/webhook/route.ts`, `lib/drive/watch.ts`. Neither imports `lib/log` today. `source: "drive.webhook"` / `"drive.watch"`. **Folder-level webhook → NO `driveFileId` at receipt/rejection**; pass `channelId`/`resourceId`/`resourceState` as NON-reserved context keys.

- **Receipt** (`route.ts:~251`, after headers extracted): `void log.info("drive webhook received", { source:"drive.webhook", code:"DRIVE_WEBHOOK_RECEIVED", channelId, resourceState })` — info NEEDS the code to persist. (Bounded: one per push; acceptable cardinality. If validation shows it's noisy, sample — but start un-sampled for the receipt-visibility goal.)
- **Headers-incomplete** (the 400 at `:243-254`): `void log.warn("drive webhook headers incomplete", { source:"drive.webhook", code:"DRIVE_WEBHOOK_HEADERS_INCOMPLETE" })`. (Distinct from the user-facing `WEBHOOK_HEADERS_MISSING`.)
- **Channel-inactive/expired** (the 410 at `:256-262`, `readActiveWatchChannel` null): `void log.warn("drive webhook channel inactive", { source:"drive.webhook", code:"DRIVE_WEBHOOK_CHANNEL_INACTIVE", channelId })`.
- **Infra fault (STRUCTURAL — needs a NEW catch):** the DB/infra fault (`DriveWebhookInfraError` from `callWebhookTx`) currently propagates uncaught through `run → withDefaultTx → POST` to a bare Next 500. Add a try/catch at the `POST`/`handleDriveWebhook` boundary (`:295-301`) that `void log.error("drive webhook infra fault", { source:"drive.webhook", code:"DRIVE_WEBHOOK_INFRA_FAULT", error: err.rootCause, operation: err.operation })` then re-returns the 500 (preserve the existing status/behavior). **This is a control-flow change — the plan must add the catch, not just a log line.**
- **DO NOT log** the ignored resource-states (`:284`, `isDispatchingState` false — high cardinality: sync/remove/trash/untrash/change/exists) and do NOT double-log the deferred dispatch (`:199-232` already writes `sync_log` per file).
- **Watch renewal failure** (`lib/drive/watch.ts`): `refreshWatchSubscriptions` (`:411-430`) discards `SubscribeResult.outcome` — an orphaned renewal is silent (bug-shaped gap). Log at the single orphan-marking chokepoint `markWatchOrphanedWithTx` (`:348-360`): `void log.warn("watch channel renewal failed", { source:"drive.watch", code:"DRIVE_WATCH_RENEWAL_FAILED", channelId: pendingChannelId, ...context })`.
- **Watch infra fault (STRUCTURAL — needs a catch):** `DriveWatchInfraError` from `callWatchTx` propagates uncaught through `refreshWatchSubscriptions`/`gcWatchChannels`. Add a try/catch at those sweep boundaries → `void log.error("watch infra fault", { source:"drive.watch", code:"DRIVE_WATCH_INFRA_FAULT", error: err.rootCause, operation: err.operation })`; preserve existing propagation/return.
- **New tests:** no co-located tests exist; add `tests/drive/webhook.test.ts` + `tests/drive/watch.test.ts` asserting emitted records via `setLogSink`/`resetLogSink` (from `lib/log`).

Codes (6): `DRIVE_WEBHOOK_RECEIVED`, `DRIVE_WEBHOOK_HEADERS_INCOMPLETE`, `DRIVE_WEBHOOK_CHANNEL_INACTIVE`, `DRIVE_WEBHOOK_INFRA_FAULT`, `DRIVE_WATCH_RENEWAL_FAILED`, `DRIVE_WATCH_INFRA_FAULT`. All inside dotted `log.*` spans → exempt.

---

## 7. Surface S8 — DEF-3 standing-ignore visibility

**File:** `lib/sync/runManualSyncForShow.ts` (~`:425`, where it deletes ANY live deferral). **Logging-only.** After the sync outcome is determined: if the manual re-sync (a) cleared a `permanent_ignore` deferral AND (b) the resulting outcome is still `hard_fail`/`parse_error`, emit `void log.warn("manual re-sync cleared a standing permanent-ignore that still fails", { source:"sync.manualResync", code:"MANUAL_RESYNC_CLEARED_STANDING_IGNORE", driveFileId, showId?, priorDeferralKind })`. This makes visible the "reprocesses every cron run until a human re-defers" condition (Anomaly A). The plan must confirm whether the prior-deferral-kind + outcome are both known at the log site (the deletion happens before the sync result; the log likely goes AFTER the result is known, guarded on the deletion having happened). Code inside a dotted `log.warn` span → exempt. **Auto-restore is NOT done here** (BACKLOG).

---

## 8. Scanner-safety design (recap)

`codeProducers.ts` scans `ACTIVE_PRODUCER_ROOTS=["app","lib"]` (NOT `components/`) with `stripLogEmissionCalls` removing dotted `log.*(...)` + `logAdminOutcome(...)` spans before `PRODUCER_RE`. Rules:
1. Every new code literal sits inside a dotted `log.*(...)` / `logAdminOutcome(...)` span, OR in `components/` (unscanned), OR flows as a runtime variable.
2. **The client route (`log[level](`, computed) is NOT stripped** → its `code` must be a variable (`cap(body.code)`), never a literal (§2.2).
3. No new code in any `NextResponse.json` body / plain object literal / doc comment.
4. `pnpm gen:internal-code-enums` + `pnpm gen:spec-codes` must be no-ops.
5. Meta-test: S6's 4 admin codes → `AUDITABLE_MUTATIONS`+`SANCTIONED_CODES`; the other ~17 plain-log/client codes → `NEW_FORENSIC_CODES` leak-guard. x1 `codes.test.ts` is the global backstop.

---

## 9. Disagreement-loop preempts

1. **The client route's `log[level]` is intentionally NOT stripped and that's fine** — code is a runtime variable, never a literal (§2.2). Don't relitigate as a leak.
2. **S6 defers the 2 public unpublish-via-link legs** — dormant (need notify delivery, which is off) + no admin actor; filed as follow-up. Not an omission.
3. **S7 trims to 6 codes** — create/activate already raise `WATCH_CHANNEL_ORPHANED` alerts; gc-stop is best-effort. Deliberate, not incomplete.
4. **S8 is logging-only** — auto-restore could undo an admin's deliberate re-sync; BACKLOG.
5. **S5 is 4 sites, not 59** — YAGNI; the rest carry source+error.
6. **Actor migration `requireAdmin`→`requireAdminIdentity`** in S6 mirrors #220 R3/R5; if a test needs the void gate + the hook, keep `requireAdmin()` + add `requireAdminIdentity()`.
7. **New forensic codes need NO §12.4 registration** — confirmed via the strip machinery.
8. **S7 infra logging requires NEW try/catch blocks** (webhook + watch sweeps) — this is a stated control-flow change, not just added log lines.

---

## 10. Test plan (per-surface failure modes; TDD)

- **S2/S4:** extend `clientLog.test.ts` (code/detail forwarded to transport only when present; the code-less exact-equality still holds), `clientErrorTransport.test.ts` (payload gains code/detail, capped), the route test (body.code/detail → the `log[level]` object; a spy asserts the emitted `code`), `showRealtimeBridge` test (default branch emits `REALTIME_UNKNOWN_SYSTEM_EVENT` + the event name; the 15-call structural count still holds). NEW `GlobalErrorListener` test (window error/rejection → clientLog with the right code + cleanup on unmount + StrictMode idempotence).
- **S3:** per-route tests — an injected infra fault produces `log.error` with the route's code; a 404/expected path does NOT log. Derive the expected code from the route.
- **S5:** spy the 4 sites — each fires its code on the fault; the message + `error` are preserved.
- **S6:** extend `_metaAdminOutcomeContract` (registry + SANCTIONED); per-action tests assert `logAdminOutcome` called with the right code + `actorEmail` + `showId` ONLY on `result.ok`/`case "success"`, NOT on failure. Derive actorEmail from the seeded admin identity.
- **S7:** NEW webhook/watch tests via `setLogSink` — receipt→info+code; headers-incomplete→warn; channel-inactive→warn; infra fault→error (and the new catch preserves the 500); renewal-failure→warn; ignored resource-states do NOT log; dispatch does NOT double-log.
- **S8:** re-sync that clears a permanent_ignore and still hard_fails → warn+code; a re-sync that succeeds (or clears a non-permanent deferral) does NOT emit.
- **Global:** `pnpm gen:internal-code-enums` + `gen:spec-codes` no-op; x1 `codes.test.ts` green; full typecheck + `format:check` + targeted suites green.

---

## 11. Numeric / self-consistency sweep

- **6** surfaces; **21** new codes total (S2/S4: 3; S3: 3; S5: 4; S6: 4; S7: 6; S8: 1), all 0-hit verified, **0** catalog changes.
- Meta-test: `AUDITABLE_MUTATIONS` +4 rows, `SANCTIONED_CODES` +4, `NEW_FORENSIC_CODES` +17.
- **0** DB migrations; **0** advisory-lock changes; **0** new Supabase call sites.
- **2** new files: `components/observe/GlobalErrorListener.tsx`, and the webhook/watch test files. **2** structural try/catch additions (webhook infra, watch infra).
- **1** UI-adjacent file: `app/layout.tsx` (mounting `<GlobalErrorListener/>`, a null-rendering listener — no visual change; invariant-8 impeccable gate is **N/A** since nothing renders. `GlobalErrorListener.tsx` returns `null`).

---

## 12. Deferred / out of scope

- Public unpublish-via-link telemetry (S6 legs) → follow-up when notify delivery is enabled.
- DEF-3 auto-restore (S8) → BACKLOG.
- The ~55 low-value code-less server sites (S5) → left as-is (source+error sufficient).
- Notify Resend configuration → deferred by the user (recipient safety confirmed: only the user's `admin_emails` row is active).
