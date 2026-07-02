# Watch-Channel Health: Monitoring, Recovery, and Honest Alerting

**Date:** 2026-07-01
**Status:** Draft (autonomous pipeline — user review gates waived per AGENTS.md brainstorming gate)
**Branch:** `worktree-watch-channel-health` off `origin/main` @ `af05b114`

## 1. Problem

The `WATCH_CHANNEL_ORPHANED` admin alert (Google Drive push-subscription registration failed) has five compounding defects, confirmed by live investigation on 2026-07-01:

1. **Jargon copy.** The shipped copy says "cron" (`lib/messages/catalog.ts:249`), "The cron job" (`catalog.ts:253,256`), and "until the developer reconciles the subscription" (`catalog.ts:253`). The audience is Doug, a non-technical admin (`crewFacing: null`, `catalog.ts:250`).
2. **Misleading verb.** The banner's "Resolve" button (`components/admin/ResolveAlertButton.tsx:108`) only stamps `resolved_at`/`resolved_by` on the alert row (`app/admin/actions.ts:95-103`). It performs zero remediation, yet clears the only signal that real-time sync is broken.
3. **No recovery path.** A failed subscription becomes `status='orphaned'` and is never re-attempted: the hourly renewal queries `WHERE status = 'active'` only (`lib/drive/watch.ts:191-196`), and the GC cron only tears orphaned rows down (`watch.ts:214`). Recovery requires a developer to re-run onboarding finalize — the only production subscribe caller (`app/api/admin/onboarding/finalize-cas/route.ts:831,894`).
4. **No admin self-service.** There is no in-app action that re-registers the channel.
5. **Live incident.** On the validation deployment, `DRIVE_WEBHOOK_BASE_URL` is not provisioned (verified via `vercel env ls`; 23 vars, none matching). `webhookPublicUrl()` throws before the Drive API is reached (`lib/drive/watch.ts:94-99`). All 10 channel rows ever created on validation are `stopped`, zero ever activated; the unresolved alert row shows `reason: "watch_create_failed"`, `occurrence_count: 10`, raised 2026-06-28. The underlying error is swallowed by bare `catch {}` blocks (`watch.ts:383,396`) and never logged.

## 2. Resolved decisions (user-ratified 2026-07-01)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Recovery architecture | **Approach A**: reconcile pass on the existing hourly `fxav_cron_refresh_watch` cron; no new cron, no new tables. Approach B (dedicated 15-min cron + backoff table) goes to `BACKLOG.md`. |
| D2 | Dev escalation | **Sentry + best-effort email** + banner escalated state. Email degrades gracefully when Resend is unconfigured; Sentry is a no-op without DSN (`sentry.server.config.ts:4-9`). |
| D3 | Admin retry surface | **Both** the alert banner and the Settings → Drive connection panel, sharing one server action. |
| D4 | Ship mode | Autonomous through merged PR. Ops step (Vercel env var) confirmed with user before applying. |

**Named constants** (single source of truth; every later section references these names, not literals):

- `ESCALATION_THRESHOLD` = **3** consecutive failures (`occurrence_count` on the unresolved alert row).
- `STALE_PENDING_MAX_AGE_MS` = **3,600,000** (1 hour) — `pending` rows older than this are swept to `orphaned`.
- Reconcile cadence = hourly (existing `fxav_cron_refresh_watch`, `'0 * * * *'`, `supabase/migrations/20260527000003_schedule_cron_jobs.sql:106`).

## 3. Design

### 3.1 Error capture and classification (watch.ts)

The two bare `catch {}` branches in `subscribeToWatchedFolder` (`lib/drive/watch.ts:383-392, 396-408`) become `catch (err)` and:

1. Classify the error via a new pure function `classifyWatchError(err: unknown): WatchErrorClass` where `WatchErrorClass = "config" | "drive_api" | "db"`:
   - `"config"`: message matches the `DRIVE_WEBHOOK_BASE_URL is required` throw (`watch.ts:97`) or Google auth/credential shapes (`invalid_grant`, `Could not load the default credentials`, missing `GOOGLE_SERVICE_ACCOUNT_JSON`).
   - `"db"`: `err instanceof DriveWatchInfraError` (`watch.ts:10-22`) — tx-layer failures.
   - `"drive_api"`: everything else (Drive HTTP errors, timeouts, malformed watch response from `watch.ts:297-298`).
2. Extend the alert context written by `markWatchOrphanedWithTx` (`watch.ts:348-360`) with two new keys, written by **every** producer (uniform shape is what makes render-time derivation safe, since the upsert RPC replaces context wholesale — `supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:55-69`, non-failedKeys contexts are not merged):
   - `error_class`: the classification above.
   - `error_message`: `String(err?.message ?? err)` truncated to 300 chars (sanitized: no tokens; the messages at issue are env-var names and Drive API error strings).
3. Log the failure: `log.error("drive watch subscribe failed", { source: "drive.watch", error: err, watchedFolderId, channelId, errorClass })` (`lib/log/logger.ts:100-105`; error-level always persists to `app_events`, `logger.ts:22`). No `code:` field outside a log call (scanner rule, `tests/cross-cutting/codes.test.ts:32-45` + `stripLogEmissionCalls`).

Guard conditions: `err` may be anything (string throw, undefined) — `classifyWatchError` must total-function over `unknown` and default to `"drive_api"`. `error_message` of a non-Error stringifies via `String()`.

### 3.2 Reconcile pass (new function in watch.ts, called from the refresh-watch cron route)

New exported function `reconcileWatchChannels(deps): Promise<ReconcileResult>` in `lib/drive/watch.ts`, invoked by `app/api/cron/refresh-watch/route.ts` **after** `refreshWatchSubscriptions()` in the same `runCronRoute` handler (route currently 16 lines; `rejectUnauthorizedCron` guard at `app/api/cron/_auth.ts:3`).

Steps, in order:

1. **Stale-pending sweep (silent hygiene — no alert upsert).** `UPDATE drive_watch_channels SET status='orphaned' WHERE status='pending' AND created_at < now() - STALE_PENDING_MAX_AGE_MS` (parameterized), logged via `log.warn` with the swept ids. This closes the crash-window gap (rows abandoned between insert-pending and the catch, `watch.ts:374-383`). The sweep deliberately does **not** touch `admin_alerts`: if the folder is actually healthy a zombie `pending` row is not a user-visible problem, and if it is unhealthy, step 3's failed re-subscribe raises/bumps the alert. Keeping the automatic producers to exactly one per cycle also keeps `occurrence_count` bumps at +1 per hour (relevant to step 5).
2. **Health predicate.** Read the singleton configured folder via `getActiveWatchedFolder()` (`lib/appSettings/getWatchedFolderId.ts:43-45`; `app_settings` singleton, CHECK `id='default'`, `supabase/migrations/20260501001000_internal_and_admin.sql:246`). Outcomes:
   - `no_folder_configured` → healthy-vacuous: nothing to watch. Auto-resolve any open alert (step 4) and return.
   - `infra_error` → `ReconcileResult.outcome = "infra_error"`, fault `"folder_read"` recorded (recorded-not-thrown, matching the `runNotify` contract, `lib/notify/runNotify.ts:141-147`); do not attempt subscribe. HTTP mapping per the route contract below.
   - Folder present → healthy iff ≥1 row `WHERE watched_folder_id = <folder> AND status='active' AND expires_at > now()`. (The join against `app_settings.watched_folder_id` matters: after a folder switch, an old folder's active channel must not count — `getWatchedFolderId.ts` gotcha.)
3. **Unhealthy → re-attempt.** Call `subscribeToWatchedFolder(folderId)` once per reconcile run. It never throws on Drive failure — it returns `{ outcome: "orphaned" }` and upserts the alert itself (`watch.ts:362-409`), so the reconcile adds **no new producer site** for the meta-test (`tests/messages/_metaAdminAlertCatalog.test.ts:151-154` continues to pin `lib/drive/watch.ts`).
4. **Healthy → auto-resolve.** `resolveAdminAlert({ showId: null, code: "WATCH_CHANNEL_ORPHANED" })` (`lib/adminAlerts/resolveAdminAlert.ts:11-24`; sets `resolved_at` only; established detector pattern per `lib/notify/detect/stall.ts:15-17`). Resolve calls are unpinned by meta-tests (verified).
5. **Escalation check** (only on the unhealthy path, after step 3's subscribe returns `orphaned`): read the unresolved alert row (`code='WATCH_CHANNEL_ORPHANED' AND show_id IS NULL AND resolved_at IS NULL` — unique by partial index `admin_alerts_one_unresolved_idx`, `20260501001000_internal_and_admin.sql:279-280`). Fire escalation **iff** (`occurrence_count >= ESCALATION_THRESHOLD` **or** `context.error_class === "config"`) **and** no prior escalation is recorded for this alert row. The fired-once record is an `app_events` row (`source = 'drive.watch.escalation'`, `context.alertId = <alert row id>`), checked via `app_events WHERE source = 'drive.watch.escalation' AND context->>'alertId' = <alert row id> LIMIT 1`. `app_events` is append-only — immune to the context wholesale-replacement hazard that rules out storing a flag on the alert row (§3.1.2), and durable across cron restarts. A `>=` trigger + durable guard is robust to multi-bump cycles (e.g., an admin manual retry bumping the count between reconcile runs), which an exact-equality trigger is not.

   **Guard write contract (R1 finding 1):** the guard row is written by a **direct, failure-visible insert** (registered Supabase call boundary destructuring `{ data, error }`), NOT via best-effort `log.*` persistence (`lib/log/logger.ts` swallows persist failures by design). Ordering: guard insert FIRST; only on confirmed success do Sentry/email fire (at-most-once bias). Guard insert error → recorded infra fault for this cycle, no notifications, retry next hour (fail-closed for duplication, fail-open only in time). The residual crash window (process death between guard insert and sends) under-notifies once and is accepted — the Resend idempotency key on the same alert row id makes true email loss require both failures at once. Both reads/writes here are new Supabase call boundaries → registry rows (§4 meta-test inventory).

   **Retention bound:** `app_events` rows are pruned after 60 days (`supabase/migrations/20260629000002_app_events.sql:58-62`). The fired-once guarantee is therefore scoped: **at most once per alert-row lifetime within the 60-day retention window**. An alert continuously unresolved for 60+ days re-escalates once per window — accepted and desirable (a quarterly-broken system should re-notify). A dismissed-then-re-raised alert is a new row id → escalates again (correct: new incident window). `log.error` is still emitted alongside for observability, but it is not the guard.

`ReconcileResult` = `{ outcome: "healthy" | "recovered" | "still_orphaned" | "vacuous" | "infra_error"; sweptPending: number; escalated: boolean; faults: string[] }` — `faults` names each recorded failure step (`"folder_read"`, `"guard_write"`, `"alert_row_read"`, `"pref_read"`, `"email_send"`).

**Route HTTP contract (R1 finding 2), mirroring the notify route's `statusFor` precedent (`app/api/cron/notify/route.ts:30-38`):** the refresh-watch route runs refresh (per-row try/catch; failures recorded, loop continues) then reconcile, and returns:
- **HTTP 200**, summary `outcome: "ok"` — no infra faults. Body `{ ok: true, refreshed, refreshFailures, reconcile: { outcome, sweptPending, escalated } }`. `still_orphaned`/`vacuous` reconcile outcomes and Drive-side subscribe failures (which resolve to `orphaned` + alert, the handled degradation path) are **200** — they are the system working as designed, and a 5xx here would page on every hour of an already-alerted incident.
- **HTTP 500**, summary `outcome: "infra_error"` — any recorded infra fault: a refresh row that threw `DriveWatchInfraError` (tx-layer), reconcile `outcome: "infra_error"` (folder read `infra_error`, alert-row read failure, guard-write failure), or an escalation pref-read `infra_error` (never fail-open, `runNotify.ts:252-270`). Body `{ ok: false, refreshed, refreshFailures, reconcile: { outcome, faults } }`. Work already completed in the cycle is kept (recorded-not-thrown); the 5xx is scheduler-visible per the notify precedent.
- Summary counts: `{ refreshed, refreshFailures, sweptPending, escalated: 0|1 }` via the existing `CronRunSummary` counts map (`lib/cron/withCronRunSummary.ts`).

**Hardening (same diff):** `refreshWatchSubscriptions` (`watch.ts:411-430`) gets per-row try/catch so one failing folder no longer aborts the remaining expiring renewals (current behavior: sequential loop, no per-row handling, `watch.ts:425-428`). Failures are logged (§3.1 style) and the loop continues; the function's `{ refreshed }` return keeps only successes.

**Concurrency.** No advisory locks — `lib/drive/watch.ts` holds none today (verified: zero `pg_advisory`/`hashtext` hits), and the duplicate-active defense is the partial unique index `drive_watch_channels_one_active_per_folder_idx` (`20260501001000_internal_and_admin.sql:302-303`) plus same-tx supersession inside `activatePending` (`watch.ts:140-160`). Reconcile, admin retry, hourly refresh, and finalize may race; the worst case is redundant Drive channels, which supersession + GC already handle (`watch.ts:432-454`). Invariant-2 does not apply (no mutation of `shows`/`crew_members`/`crew_member_auth`/`pending_syncs`/`pending_ingestions`). Advisory-lock holder enumeration for the plan: **zero holders on every surface this feature touches**; the finalize routes call subscribe **post-commit, outside** `withTx` and outside `tryFinalizeLock` (`finalize-cas/route.ts:819-831, 893-894`).

### 3.3 Escalation (Sentry + email)

Fired from the reconcile path (§3.2 step 5), in a helper `escalateWatchOrphaned(alert: { id, occurrenceCount, context })`:

1. **Sentry:** `Sentry.captureException(new Error("WATCH_CHANNEL_ORPHANED escalated"), { tags: { errorClass }, extra: { occurrenceCount, watchedFolderId } })` via `import * as Sentry from "@sentry/nextjs"` — same manual-capture pattern as `lib/observe/captureBoundaryError.ts:13`, wrapped in try/catch. No DSN → no-op (`sentry.server.config.ts:6`, pinned by `tests/observe/sentryNoopGate.test.ts`). Explicit capture is required because `runCronRoute` handlers catch-and-return (never reach `onRequestError`, `instrumentation.ts:8`).
2. **Email (best-effort, gated):**
   - Gate 1 — `configValid()` (`lib/notify/config.ts:6-12`); invalid → deliberate skip (not a fault), mirroring `runNotify.ts:234-236`.
   - Gate 2 — `alert_on_sync_problems` pref via `getAlertOnSyncProblems()` (`lib/appSettings/getAlertOnSyncProblems.ts:12`); a watch escalation is sync-problem-shaped (gating precedent `runNotify.ts:240-242`). `infra_error` from the pref read → recorded fault, no email (never fail-open, `runNotify.ts:252-270`).
   - Recipients — `activeRecipients()` (`lib/notify/recipients.ts:13`, reads `admin_emails` where `revoked_at IS NULL`).
   - Send — `sendEmail({ to, subject, html, text, idempotencyKey: baseKey("watch_escalation", alert.id, recipient) })` (`lib/notify/send.ts:28`; `baseKey` at `lib/notify/idempotencyKey.ts:5-7`). Keying on the alert **row id** means at most one email per recipient per alert-row lifetime; a dismissed-then-re-raised alert is a new row → a new (correct) notification. Resend-side idempotency-window expiry could theoretically re-send after ~24h; combined with the fired-once `app_events` guard (§3.2.5) the app sends the request once, so this is a non-issue.
   - Email copy (plain, non-jargon): subject `"FXAV: live updates are down for <folder name>"`; body states shows still sync on schedule, automatic retries continue hourly, and the admin Retry action exists. Full literal strings specified at plan time; rendered with the existing minimal HTML-escape helpers used by digest templates.
3. **Banner escalated state** is *derived at render time*, not stored (context is replaced wholesale on upsert — see §3.1.2): `escalated = context.error_class === "config" || occurrence_count >= ESCALATION_THRESHOLD`. This is the same condition as the notification trigger (§3.2.5) minus the fired-once guard, so the banner and the notifications agree on when a state is "escalated"; the banner may briefly show escalated before the next hourly reconcile actually sends the notifications (render-time derivation vs. cron-time firing) — accepted and documented.

**Sentry/email are notification channels only.** The durable record is the alert row + `app_events` (`log.error` persistence, `lib/log/persist.ts:13-23`). Neither channel ever suppresses the banner.

**Flag lifecycle table:**

| Flag | Storage | Write path | Read path | Effect |
|------|---------|-----------|-----------|--------|
| `alert_on_sync_problems` | `app_settings` (existing) | Settings toggle (existing) | `getAlertOnSyncProblems()` in `escalateWatchOrphaned` (new reader) | Gates the escalation **email only**; never gates banner or Sentry |
| `context.error_class` | `admin_alerts.context` jsonb | every orphan producer via `markWatchOrphanedWithTx` (§3.1) | banner derivation (§3.4), escalation trigger (§3.2.5) | escalate-fast for config errors; shown in panel detail |
| `context.error_message` | same | same | banner expanded panel (§3.4) | diagnosability (the live incident took DB forensics because this was absent) |
| SENTRY_DSN | env | ops | `sentry.server.config.ts:5` | absent → escalation Sentry capture no-ops (validation currently absent — noted to user) |
| escalation fired-once record | `app_events` row (`source='drive.watch.escalation'`, `context.alertId`) | direct failure-visible insert in `escalateWatchOrphaned` (§3.2.5 guard write contract; NOT via `log.*`) | guard query in §3.2.5 (new registered read) | prevents duplicate Sentry/email per alert-row lifetime within the 60-day `app_events` retention window |

### 3.4 Banner UI (AlertBanner + buttons)

`components/admin/AlertBanner.tsx` changes:

1. **SELECT adds `occurrence_count`** (`AlertBanner.tsx:108-119`) — needed for the escalated derivation; `AlertRow` type extends accordingly (`:44-52`).
2. **Action slot** (`:399-424`): for `alert.code === "WATCH_CHANNEL_ORPHANED"` **and** `show_id === null`, the global action becomes a `<form action={retryWatchSubscriptionFormAction}>` wrapping a new `RetryWatchButton` (client island mirroring `ResolveAlertButton`'s `useFormStatus` pending pattern, `ResolveAlertButton.tsx:123-163`, no local resolving flag — M9-D-C4-1). Label: idle `"Retry now"`, pending `"Retrying…"`. **No two-tap confirm** (retry is safe/idempotent). All other global alerts keep the existing Dismiss form unchanged. This is the first per-code render branch in AlertBanner (verified: none exists today); the branch keys on the same `isMessageCode`-narrowed code string the copy lookup already uses (`:227-229`).
3. **Dismiss relocation for this code only:** the expanded panel (`:359-397`) gains a compact `<form action={resolveAdminAlertFormAction}>` + `ResolveAlertButton` row beneath the helpful-context paragraph, so dismissal stays possible without crowding the action slot. Slot-integrity contract preserved: forms never inside `<summary>`/`<details>` (test `tests/components/AlertBanner.test.tsx:651`) — the panel is a grid *sibling* of `<details>` (`:359`), so a form there is legal.
4. **Escalated status line** (chrome, panel-only): when escalated (derivation §3.3.3), render a short status line in the expanded panel: `"We've flagged this for support — no action needed."`; when not escalated: `"Retrying automatically every hour."` These are UI chrome in the same class as "Details"/"Hide"/"+N more →" (`AlertBanner.tsx:343-344,386-395`), not §12.4 message copy; the substantive explanation lives in the cataloged `helpfulContext` (§3.5). If `context.error_message` is present, the panel renders it in a muted `<code>` line (aids the validation-incident class where the message names the missing env var).

**Verb rename (global):** `ResolveAlertButton` labels change `"Resolve"` → `"Dismiss"`, `"Confirm resolve"` → `"Confirm dismiss"`, `"Resolving…"` → `"Dismissing…"` (`ResolveAlertButton.tsx:108,145`). The two-tap confirm + 3s auto-revert stay. Literal-label assertions updated: `tests/components/ResolveAlertButton.test.tsx:34-37,42-46,63,76,91`, `tests/components/AlertBanner.test.tsx:617-629`. Server action name `resolveAdminAlertFormAction` and DB columns are unchanged (rename is presentation-only).

**Mode boundaries** (per-state element inventory):

| Element | Global non-watch alert | Watch alert, not escalated | Watch alert, escalated | Per-show alert |
|---|---|---|---|---|
| Action slot | Dismiss form | **Retry now** form | **Retry now** form | "Check it" link |
| Panel dismiss row | — | ✓ | ✓ | — |
| Status line | — | "Retrying automatically every hour." | "We've flagged this for support — no action needed." | — |
| error_message code line | — | if present | if present | — |

**Dimensional invariants.** The action slot cell (`col-start-2 row-start-1`) is pinned by real-browser e2e gates (`tests/e2e/admin-banner-layout.spec.ts`: one-line centered idle/pending, col2 ≤ 55% width, action does not move on expand). The Retry button must satisfy the same gates: single `AccentButton` with `minWidthTap ringOffset="warning-bg"` (same atoms as `ResolveAlertButton.tsx:101-109`); the e2e spec gains a watch-alert variant asserting (a) slot geometry with the Retry form, (b) the panel dismiss row does not alter slot position. Jsdom is insufficient for these; assertions run in the existing Playwright spec.

**Transition inventory** (states: idle / pending(retrying) / escalated-idle / panel-open; compound with Dismiss confirm):

| Transition | Treatment |
|---|---|
| idle → pending (Retry submit) | label swap via `useFormStatus`, instant — no animation (matches Resolve pattern) |
| pending → banner gone (retry succeeded) | server revalidate re-render; instant removal (existing behavior for resolve) |
| pending → idle with bumped count (retry failed) | re-render; instant. Status line + count badge update |
| not-escalated → escalated (render-time derivation change) | full re-render between requests; instant — no animation |
| panel open/close | existing pure-CSS `details` toggle (`app/globals.css` sibling rule) — unchanged |
| Compound: panel-dismiss two-tap confirm active while Retry pending | both forms disabled independently via their own `useFormStatus`; no shared state. Test asserts confirm-row Cancel still works while retry is pending |
| Compound: expand panel while Retry pending | action slot must not move (existing e2e compound test `admin-banner-layout.spec.ts:264` extended to watch variant) |

### 3.5 Copy rewrite (§12.4 three-way lockstep)

All four x1-compared fields change (`tests/cross-cutting/codes.test.ts:73-87` compares `dougFacing`/`crewFacing`/`followUp`/`helpfulContext`); `title`/`longExplanation` are catalog-only edits (rendered on `/help/errors`, `app/help/errors/page.tsx:87,95`).

| Field | New copy |
|---|---|
| `dougFacing` | `"Instant updates are paused. Shows still sync automatically every few minutes."` |
| `crewFacing` | `null` (unchanged) |
| `followUp` | `"Auto-retry hourly; admin Retry now; Eric if escalated"` |
| `helpfulContext` | `"We couldn't set up the live connection to Google Drive that makes sheet edits show up instantly. Your shows still sync on the normal schedule, so nothing is lost — edits just take a few minutes to appear. We retry the connection automatically every hour, and you can use Retry now to try immediately. If it keeps failing, we'll flag it for support."` |
| `title` | `"Live updates paused"` |
| `longExplanation` | `"We couldn't set up the live connection to Google Drive that makes sheet edits show up instantly. Shows still sync on the normal schedule; edits just take a few minutes to appear. The connection is retried automatically every hour, and an admin can retry immediately from the dashboard or Settings. If it keeps failing, it's flagged for support automatically."` |

Lockstep (one commit): (a) master spec §12.4 row at `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2808` (dougFacing + followUp cells; "Where it surfaces" cell extended to mention the reconcile producer) **and** long-context map entry at `:3098` (helpfulContext); (b) `pnpm gen:spec-codes` regen; (c) `catalog.ts:246-258`. Never prettier the master spec. No new code is minted (no 4-gate §12.4 new-code surface; `tests/cross-cutting/code-scenarios.ts` untouched). Banner-copy-verbatim test `tests/messages/catalog.test.ts:150` re-verified.

**Out of scope, filed to BACKLOG.md:** the same "cron" de-jargon sweep for `STAGED_PARSE_SUPERSEDED` (`catalog.ts:555,558`), `NO_FOLDER_CONFIGURED` (`:677,680`), `MISSING_PENDING_INGESTION_MODTIME` (`:1833,1836`), `SYNC_DELAYED_SEVERE` (`:1929-1936`) — entry `BL-COPY-CRON-SWEEP`. Also `BL-WATCH-RECONCILE-BACKOFF` (Approach B).

### 3.6 Admin retry action (server action + Settings panel)

New server action `retryWatchSubscriptionFormAction(formData: FormData): Promise<void>` in `app/admin/actions.ts` (established home for banner form actions; `"use server"` at `:24`; the ts-morph auth audit auto-discovers it and requires `requireAdmin()` before sinks — `lib/audit/authPrimitives.ts:720-726,774-785`; **no** `PROTECTED_ROUTES` row needed, unlike an `app/api/admin/**` route which would trip "unclassified" at `lib/audit/trustDomains.ts:228`).

Body:
1. `await requireAdmin()` (`app/admin/actions.ts:42` pattern).
2. `getActiveWatchedFolder()` — `no_folder_configured` or `infra_error` → log + return (banner/panel re-render unchanged; the reconcile treats no-folder as vacuous-healthy so a stale alert self-resolves within the hour; nothing sensible to retry).
3. `await subscribeToWatchedFolder(folder.folderId)`.
4. On `{ outcome: "active" }`: `resolveAdminAlert({ showId: null, code: "WATCH_CHANNEL_ORPHANED" })` — immediate banner clearance, same call the reconcile uses.
5. `revalidatePath("/admin", "layout")` and `revalidatePath("/admin/settings")`.

Feedback loop: success → banner disappears / Settings pill flips to positive on re-render. Failure → banner persists with bumped occurrence count and refreshed `error_message`; button returns to idle. No toast system exists; re-render is the feedback (matches Dismiss).

**Settings surface:** `components/admin/settings/DriveConnectionPanel.tsx` — add a `"Retry connection"` form (same server action) to the right-side button group (`:206-235`, sibling of "Open folder" + the `rerunSetupServerAction` form at `:220-234`), rendered **only** when `health.health === "warn" && reason ∈ {watch_inactive, watch_expired}` (`lib/admin/driveConnectionHealth.ts:59-64` maps those reasons to this alert's code). Not shown for `not_configured` (nothing to retry — "Re-run setup" is the correct affordance there, `DriveConnectionPanel.tsx:204`).

Supabase call boundaries (invariant 9): the action composes existing registered helpers (`getActiveWatchedFolder` — registered; `resolveAdminAlert` — service-role helper); any new direct read added at plan time gets an `infraRegistry` row in `tests/admin/_metaInfraContract.test.ts:168` or an inline `// not-subject-to-meta:` waiver.

### 3.7 Validation incident remediation (ops)

1. Set `DRIVE_WEBHOOK_BASE_URL=https://fxav-crew-pages-validation.vercel.app` on the validation Vercel project (Production) — equals `NEXT_PUBLIC_SITE_ORIGIN` per the M6 handoff (`docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M6-drive-sync.md:628`). **User confirmation required before applying (D4).** Redeploy from main (env changes need a fresh deployment; never `vercel redeploy` of a stale build — memory: rebuilds stale source).
2. After this feature deploys, the hourly reconcile self-heals the orphaned state (or the admin hits Retry now).
3. **Known residual risk:** Google Drive push endpoints require domain verification; the env throw fired before Drive was ever called, so the Drive-side outcome is unobserved. If the first real attempt fails with `webhookUrlUnauthorized` (or similar), the new `error_message` capture surfaces it verbatim in the banner panel and `app_events`, classified `drive_api` → escalates at `ESCALATION_THRESHOLD`. Domain verification is a one-time dev/GCP-console action, out of code scope.
4. `SENTRY_DSN` absent on validation (observed) — escalation email still fires; noting to user as optional ops.

## 4. Testing

TDD per task (invariant 1). Concrete failure modes each test class catches:

1. **`classifyWatchError` unit tests** — config/db/drive_api mapping incl. non-Error throws (string, undefined). Catches: mis-classified config error never escalating fast; total-function violation crashing the catch path.
2. **Reconcile unit tests** (deps-injected, mirroring existing watch.ts test doubles): healthy-noop; vacuous (no folder) resolves stale alert; unhealthy triggers exactly one subscribe; recovered path resolves alert; stale-pending sweep flips only old pending rows AND performs zero admin_alerts writes (fixture ages derived from `STALE_PENDING_MAX_AGE_MS`, not hardcoded dates); escalation fires when `occurrence_count` reaches `ESCALATION_THRESHOLD` with no prior escalation event, does NOT fire below it, does NOT re-fire when a prior `app_events` guard row exists even at higher counts (fixture counts derived from `ESCALATION_THRESHOLD` ± 1, not hardcoded); config-class escalates at count 1; folder-switch case (old folder's active channel does NOT satisfy the predicate). Catches: the `status='active'`-only filter class of bug recurring; double-escalation across cron restarts; count-skipping when manual retries interleave; reconcile fighting refresh.
3. **`refreshWatchSubscriptions` per-row isolation** — first folder's subscribe rejects, second folder still refreshed. Catches the current abort-the-loop behavior regressing back.
4. **Escalation helper tests** — email skipped (deliberate, not fault) when `configValid()` false; skipped when pref off; pref `infra_error` → recorded fault, no email, no fail-open; idempotency key = `baseKey("watch_escalation", alertId, recipient)`; Sentry capture wrapped (throwing Sentry never breaks the cron); **guard ordering** — guard insert precedes sends, guard-insert error → zero notifications + `"guard_write"` fault recorded, existing guard row → zero notifications and no duplicate guard row. Catches: fail-open on pref read; unkeyed duplicate emails; duplicate escalation when the guard write silently fails (the R1-finding-1 class).
5. **Server action tests** — requireAdmin gate (audit also enforces statically); no-folder early return; active → resolveAdminAlert called + revalidated; orphaned → no resolve call. Anti-tautology: assert against `resolveAdminAlert` spy args, not banner DOM.
6. **AlertBanner tests** — watch-code renders Retry form (and NOT the slot Dismiss form: cloned-tree negative assertion removing the panel first, since the panel now also contains a dismiss row — anti-tautology rule); escalated vs not status line derivation from `occurrence_count`/`error_class` fixtures; `error_message` line rendering + absence; other-global-code renders Dismiss slot unchanged; label literals updated to "Dismiss"/"Confirm dismiss".
7. **e2e layout** (`tests/e2e/admin-banner-layout.spec.ts` extension) — watch-alert variant: slot geometry with Retry form (one-line centered idle/pending, col2 ≤ 55%), slot does not move on expand, compound expand-while-retry-pending, panel dismiss row functional. Real browser only (jsdom cannot compute this layout).
8. **DriveConnectionPanel tests** — Retry form present for `watch_inactive`/`watch_expired`, absent for `not_configured`/positive/`sync_*` reasons; submits the shared action.
9. **Cron route test** — refresh-watch route runs refresh then reconcile; summary counts extended; exact HTTP contract per §3.2: 200 for `still_orphaned` (handled degradation must NOT page hourly), 200 for `vacuous`, 500 + `outcome: "infra_error"` for each fault class (`folder_read`, `guard_write`, refresh-row `DriveWatchInfraError`, pref-read `infra_error`), body shapes asserted. Catches: the silent-200-on-infra-fault class (R1 finding 2) and the inverse 5xx-on-handled-degradation paging bug.
10. **x1 parity** — `pnpm test:audit:x1-catalog-parity` green after the lockstep edit (`package.json:30`).
11. **Meta-tests untouched-but-verified** — `_metaAdminAlertCatalog` still passes (producer stays `lib/drive/watch.ts`); `_metaAdminAlertProducer` (no raw `.from("admin_alerts")` writes anywhere new); auth-chain audit picks up the new server action automatically.

**Meta-test inventory (writing-plans mandate, corrected per R1 finding 4):** this milestone EXTENDS `tests/sync/_metaInfraContract.test.ts` — the registry that owns the existing `lib/drive/watch.ts` lifecycle helpers and their `DriveWatchInfraError` contract — with rows for `reconcileWatchChannels` and `escalateWatchOrphaned`'s new call boundaries (folder read composes the already-registered `getActiveWatchedFolder`; new rows cover the alert-row read, the `app_events` guard read/write, and any direct read the plan adds). `tests/admin/_metaInfraContract.test.ts` is touched only if `AlertBanner`'s registered fetch contract pins its column list (the SELECT gains `occurrence_count`) — verified at plan time. CREATES no new registries; all other candidate registries N/A — no new tables, no new RPCs, no new §12.4 codes, no advisory locks (topology enumerated in §3.2: zero holders).

**UI quality gate (invariant 8, R1 finding 3):** the diff touches `components/admin/AlertBanner.tsx`, `components/admin/ResolveAlertButton.tsx` (rename), a new `RetryWatchButton`, and `components/admin/settings/DriveConnectionPanel.tsx` — all UI surfaces. `/impeccable critique` **and** `/impeccable audit` run on the affected diff with the canonical v3 preflight gates, **before** the whole-diff cross-model review. HIGH/CRITICAL findings are fixed or explicitly deferred via `DEFERRED.md`; findings + dispositions are recorded in the PR description (this feature has no milestone handoff doc; the PR body is the §12-equivalent record).

## 5. Out of scope

- Approach B (15-min dedicated reconcile cron + backoff state table) — `BL-WATCH-RECONCILE-BACKOFF`.
- "cron" jargon sweep across the four other catalog codes — `BL-COPY-CRON-SWEEP`.
- GCP domain verification for the webhook endpoint (dev/console ops, if surfaced by the new error capture).
- Per-show watch alerts (the alert is and remains global; `showId: null`, `watch.ts:179`).
- A general env-completeness deploy tripwire (the class behind the validation incident) — candidate for BACKLOG discussion, not this diff.

## 6. Watchpoints (reviewer preempts — do not relitigate)

- **Fail-open posture:** subscribe failures degrade to cron sync by design (spec §5.5 lineage; `subscribeToWatchedFolder` returns `orphaned` rather than throwing — `watch.ts:383-408`). This feature adds recovery, not fail-closed behavior.
- **Chrome vs catalog copy:** "Retry now"/"Retrying…"/status lines are UI chrome in the same class as "Resolve"/"Details"/"Hide"/"+N more →" (`AlertBanner.tsx:343-344`, `ResolveAlertButton.tsx:108-146` — none cataloged). Substantive explanation is cataloged (§3.5). Precedent cited; not a §12.4 violation.
- **Derived (not stored) escalation:** deliberate, because `upsert_admin_alert` replaces non-failedKeys context wholesale (`20260618000000...sql:55-69`). Storing an `escalated` flag would be erased by the next producer write.
- **No advisory locks:** enumerated in §3.2; adding one would create the M5-R20 nested-holder class this repo explicitly guards against.
- **Fired-once escalation via `app_events`:** the durable guard lives in append-only `app_events` (§3.2.5), NOT as a context flag — a context flag would be erased by the wholesale-replacement behavior of `upsert_admin_alert` (`20260618000000...sql:55-69`). The guard is a direct failure-visible insert (not best-effort `log.*`), written before sends; the fired-once guarantee is explicitly scoped to the 60-day `app_events` retention window, and re-escalation after 60 days of continuous breakage is intended behavior. An exact-equality count trigger was considered and rejected (multi-bump cycles skip it).
- **`tests/messages/codes.test.ts` does not exist** — x1 lives at `tests/cross-cutting/codes.test.ts` (AGENTS.md's citation is stale; verified in this worktree).
