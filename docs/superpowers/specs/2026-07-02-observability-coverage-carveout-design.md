# Observability Coverage Carve-Out — Design Spec

**Date:** 2026-07-02
**Branch/worktree:** `feat/observability-coverage-carveout` @ `/Users/ericweiss/fxav-observability-coverage` (off `origin/main` `082a7e4b`)
**Status:** Draft → self-review → Codex adversarial-review (autonomous-ship; user spec+plan review gates WAIVED per AGENTS.md).

---

## 0. Motivation (grounded in live data)

A log-coverage audit of the validation project's `public.app_events` (769 rows, 2026-06-30…2026-07-02) found the durable log stream is a liveness monitor, not an audit trail: **742/769 rows (96%) are the `CRON_RUN_SUMMARY` heartbeat, 0 rows have ever persisted at `error` level, and the only durable code is `CRON_RUN_SUMMARY`.**

The audit's single sharpest finding was verified live: a genuine `hard_fail:MI-3_NO_VALID_DATES` on Drive file `1Now2iJ_…` pegged every 5-minute `cron.sync` run to `outcome="partial"`/`warn` from 06-30 until it was manually deferred at 13:40 on 07-02 (heartbeat then went green, `failed:0 outcome=ok`). The heartbeat was **not lying** — it correctly reported a real, persistent parse failure. The defect is that **you cannot tell which sheet or why from `app_events`**: the durable summary carries only `{counts, outcome, durationMs}`; the failing `driveFileId` + `code` live only in the separate `sync_log` table (DB-only). This spec makes the durable record self-triageable and closes the highest-value coverage gaps that do **not** collide with in-flight feature work.

### Scope carve-out (why these surfaces and not others)

Two in-flight feature branches (spec/plan stage, no implementation code yet) will restructure surfaces that overlap other audit gaps, so those are **deferred to fold into those features**, not duplicated here:

- `worktree-watch-channel-health` → Drive webhook + watch-channel telemetry (audit gaps #2/#3). **Deferred.**
- `worktree-published-toggle` → publish/unpublish/archive/unarchive lifecycle (part of audit gap #5). **Deferred.**

**In scope (5 surfaces, zero overlap):**

| # | Surface | Kind |
|---|---|---|
| S1 | Cron summary per-failure breadcrumb (`summarizeSync` + `summarizeAssetRecovery`) | fix — make the heartbeat self-triageable |
| S2 | `enrichAgenda` `known_stale` cry-wolf split (getFile-catch) | fix — stop pinning warn on expected-gone |
| S3 | Admin-gate DENIAL logging (`requireAdmin`) | new — security-observability |
| S4 | Code-less durable rows get forensic codes (agenda extract + hotels parser) | new — categorizability + one positive-path |
| S5 | Live-show mutation outcome telemetry, NON-publish (5 admin routes) | new — the #218 (PR) continuation |

**Not in scope / correctly not logged (YAGNI):** Drive webhook, watch-channel (deferred above); publish/archive/unpublish (deferred above); `keepalive` heartbeat detail; admin-gate SUCCESS + realtime-token GRANTS (high-cardinality, low-signal — log denials, sample grants later); signed-out auth fall-throughs; per-link agenda `download`/`extracted` traces (stay `log.info` non-durable / demote to debug later); notify-cron "never fired" is an **operational** investigation (its `CRON_RUN_SUMMARY` heartbeat via `runCronRoute` at `app/api/cron/notify/route.ts:65` already exists — its absence from the 769 rows means the job never ran on validation, not missing instrumentation), not a code change.

**No DB migration.** `app_events` already has `code`, `drive_file_id`, `actor_hash`, and `context jsonb` (`supabase/migrations/20260629000002_app_events.sql:3-14`). The breadcrumb rides in `context` (jsonb); actorHash is an existing column. **No advisory-lock topology change** — every mutation route's lock lives inside the called lib function; this spec only adds post-commit telemetry, acquires no locks. **No UI surface** — every touched file is under `app/api/**` or `lib/**`; invariant-8 impeccable gate is N/A.

---

## 1. Plan-wide invariants honored

- **Invariant 3 (email canonicalization at every boundary):** `requireAdminIdentity()`/`resolveAdminIdentity` return an already-`canonicalize`d email (`lib/auth/requireAdmin.ts:207`); `readAdminEmail()` canonicalizes at `app/api/admin/staged/[fileId]/apply/route.ts:47`. Telemetry passes that canonical email to `hashForLog` / `logAdminOutcome.actorEmail` — **never re-canonicalizes, never hashes `""`.**
- **Invariant 5 (no raw error codes in user-visible UI):** every new `code` is a **forensic log code** emitted ONLY inside a `log.*(...)` or `logAdminOutcome(...)` span. None appears in any HTTP response body or user-facing surface. The §12.4 catalog is untouched (see §7).
- **Invariant 9 (Supabase call-boundary discipline):** this spec adds no new Supabase call sites. Existing `{ data, error }` destructuring is unchanged. Telemetry is fire-after-commit; a persist fault is swallowed by the log sink (`lib/log/logger.ts:74-79`) and never surfaces over the caller.
- **Invariant 2 (per-show advisory lock, single-holder):** unchanged — no lock is acquired or released by any change here.

---

## 2. Surface S1 — Cron summary per-failure breadcrumb

**Goal:** a `partial`/`infra` cron run names WHICH items failed and WHY, in the durable `app_events` row, without a `sync_log` join.

### 2.1 `summarizeSync` (`lib/cron/summarizeSync.ts`)

- **Type:** `CronRunSummary.detail?: Record<string, unknown>` (`lib/cron/runSummary.ts:10`) already accepts a `failures` key — **no `CronRunSummary` type change.**
- **Loop widening:** `lib/cron/summarizeSync.ts:24` `for (const { result: r } of result.processed)` → `for (const { driveFileId, result: r } of result.processed)`. `driveFileId` is on the **outer** processed element (`RunScheduledCronSyncResult.processed: Array<{ driveFileId: string; result: ProcessOneFileResult }>`, `lib/sync/runScheduledCronSync.ts:334-338`).
- **Breadcrumb element shape (sync):** `{ driveFileId: string; outcome: string; code?: string }`. `code` is read at runtime via `(r as { code?: string }).code` (the same cast style as `:31`); every FAILED-set variant carries a `code` (`lib/sync/runScheduledCronSync.ts:183-224`), so it's present for all breadcrumbed sync items, but the type keeps it optional for symmetry with the mirror (§2.2).
- **Which items:** exactly the items that increment `failed` — the FAILED-set arm AND the conservative `else failed++` (unknown outcomes) at `:35-36`. NOT `applied`/`stage`/SKIPPED-set/`ConcurrentSyncSkipped` (the latter is `continue`d at `:27-30` before `outcome` is read — it must never appear in `failures`).
- **Bound:** `const MAX_FAILURE_BREADCRUMBS = 25;` (module const). If `failures.length > 25`, keep the first 25 and set `detail.failuresTruncated = true`. `counts.failed` already carries the true total, so truncation loses no aggregate signal. (25 > realistic per-run processed count — currently 8 shows — so truncation is a safety cap, not an expected path.)
- **exactOptionalPropertyTypes merge:** the `failed > 0` branch (`:44-49`) currently returns `detail: { maintenanceFaults }` OR bare. **Merge `failures` into ONE detail object** — never emit a second `detail` key, never `detail: undefined` (comment at `:45`). Concretely, in the `failed > 0` branch build `const detail = { ...(result.maintenanceFaults ? { maintenanceFaults: result.maintenanceFaults } : {}), failures, ...(truncated ? { failuresTruncated: true } : {}) }` and return `{ outcome: "partial", counts, detail }`. Guard with `failures.length > 0` so a `heartbeatFault`-only partial (no per-item failures) still omits `failures` cleanly.

### 2.2 `summarizeAssetRecovery` (`lib/cron/summarizeAssetRecovery.ts`) — the mirror, with a KEY ASYMMETRY

- **Asymmetry (do NOT copy S1 verbatim):** the asset-recovery processed element is `Array<{ showId: string; result: AssetRecoveryResult }>` (`lib/sync/assetRecovery.ts:118`) — it exposes **`showId`, NOT `driveFileId`**. The mirror breadcrumb element is `{ showId: string; outcome: string; code?: string }`. **Do not invent a `driveFileId` here.**
- **`code` genuinely optional here:** asset-recovery `partial_failure` and `no_op` carry NO `code` (`lib/sync/assetRecovery.ts:105,115`); `revision_drift`/`drift_cooldown`/`bytes_exceeded`/`infra_error` do. So `(r as { code?: string }).code` may be `undefined` — omit the key when absent (`...(code ? { code } : {})`).
- **Which items:** `PARTIAL`-set ∪ `infra_error` ∪ unknown (the `failed++` arms at `lib/cron/summarizeAssetRecovery.ts:16-27`). Loop widening `{ result: r }` → `{ showId, result: r }`.
- **Net-new detail:** the mirror currently returns NO `detail` (`:28`). Adding one is net-new; guard `failures.length > 0` so `ok`-outcome runs stay `detail`-free (exactOptionalPropertyTypes: omit, not `undefined`).

### 2.3 Persistence (automatic, confirmed)

`lib/cron/withCronRunSummary.ts:40-48` spreads `detail: outcome.summary.detail` into the log `fields`, emitted via literal-dispatch `log.warn` (partial) / `log.error` (infra) — both ALWAYS persist. `detail.failures` therefore reaches `app_events.context`. **No new log call is added on this surface** — it's a pure-function change to the summarizers.

### 2.4 Scanner safety (S1)

The breadcrumb `code` is read from `r.code` at runtime (a variable/shorthand), **never written as a `code: "SHOUTY"` literal** in summarizer source, so `PRODUCER_RE` (`lib/messages/__internal__/codeProducers.ts:14`, matches literal `code: "..."`) does not fire. Double-exempt: `detail` reaches the log only through the stripped `log.*` span in `withCronRunSummary`. **Implementation rule: read `r.code`; never hardcode a code literal into the breadcrumb.**

---

## 3. Surface S2 — `enrichAgenda` `known_stale` cry-wolf split

**File:** `lib/sync/enrichAgenda.ts`. **Current defect:** a single unconditional `log.warn("getFile threw", { … verdict: status===404||status===400 ? "known_stale" : "unknown", error })` at `:160-167` fires for BOTH the definitively-gone (404/400, expected + already handled downstream via the `AGENDA_PDF_UNREADABLE` ParseWarning) AND the true infra `unknown` case — at warn level with a full stack trace and no code, re-emitted every run that touches the show. This is cry-wolf that poisons the warn tier.

**Change — split the one emission into the existing two verdict branches (`:168` / `:180`):**

- **404/400 branch** (`if (status === 404 || status === 400)`, `:168`): `log.info("agenda link gone", { source: "sync.enrichAgenda", fileId: link.fileId, ordinal: i, status, verdict: "known_stale", code: "AGENDA_GETFILE_GONE" })`. **DROP the `error` field** (no stack). `code` is MANDATORY — info persists ONLY with a non-null code (`lib/log/logger.ts:21-25`); without it the definitively-gone event becomes non-durable, defeating the goal.
- **else branch** (403/429/5xx/timeout/`null`, `:180`): `log.warn("getFile threw", { source: "sync.enrichAgenda", fileId: link.fileId, ordinal: i, status, verdict: "unknown", error, code: "AGENDA_GETFILE_FAULT" })`. **KEEP `error`** (transient faults want the stack; warn always persists). Add `code` for categorizability.
- **Hardcode `verdict` per branch** ("known_stale" / "unknown") — do not carry the `:165` ternary into either line.
- `driveErrorStatus` returns `number | null` (`lib/drive/fetch.ts:118-141`); a plain `Error` → `null` → falls to the else/warn branch. Reuse the already-computed `status` (`:159`); do not recompute.
- **No `showId`/`requestId` in scope** — `enrichAgenda`'s param is `spreadsheetId`, not a show id. Do NOT add a reserved `showId` field it can't populate.
- Other three `known_stale` sites (non-PDF `:202`, download infra_error `:255`, download unavailable `:269`) are structurally different (getFile SUCCEEDED there) and are **NOT touched.**

---

## 4. Surface S3 — Admin-gate DENIAL logging

**File:** `lib/auth/requireAdmin.ts`. **Current defect:** the authed-but-not-admin denial (`if (isAdmin !== true) { forbidden(); }`, `:265-267`) throws a 403 with no durable record — you cannot answer "who was refused admin, when, how often" from `app_events`.

**Change:**

- Insert immediately BEFORE `forbidden()` (which throws; anything after is unreachable): `await log.warn("admin access denied", { source: "auth/requireAdmin", code: "ADMIN_ACCESS_DENIED", actorHash: hashForLog(email) });` — **`source: "auth/requireAdmin"`** matches the file's existing log convention (`:167/:186/:200/:227/:243/:252`); do NOT invent a dotted `auth.requireAdmin`.
- `email` is already canonical and guaranteed non-empty at the denial point (`canonicalize` at `:207`, `if (!email) return await redirectToSignIn()` guard at `:208-213`). Pass it directly to `hashForLog(email)` — **no re-canonicalize, no `''` guard.**
- Add import: `import { hashForLog } from "@/lib/email/hashForLog";` (`hashForLog(canonicalEmail: string): string`, `lib/email/hashForLog.ts:16`). `log` is already imported (`:29`); `warn` needs no new import.
- `actorHash` is a reserved field (`lib/log/logger.ts:10-19`) → first-class `app_events.actor_hash` column (queryable). `code` inside `log.warn` is scanner-exempt; warn persists regardless, but the code makes the security event categorizable.
- **Do NOT route through `logAdminOutcome`** (it emits `log.info`; we want `warn`). Call `log.warn` directly.
- Denial lives inside `resolveAdminIdentity = cache(...)` (`:153`) → the warn fires **once per request** even when layout+page both gate (React cache dedup). Expected; not a double-log.
- **Distinguish from siblings:** the unauthed redirect paths (`:197/:212/:263 → redirectToSignIn`) must NOT emit `ADMIN_ACCESS_DENIED`; the infra paths (`AdminInfraError`, already `log.error code:"ADMIN_SESSION_LOOKUP_FAILED"`) are unchanged. Only the `:265` not-admin branch is the new site. The PIN test at `tests/auth/requireAdmin.test.ts:190-210` (`is_admin {data:null}` → forbidden) ALSO flows through `:265` and will emit the warn — its assertions may need the log mock too.

---

## 5. Surface S4 — Code-less durable rows get forensic codes

**Premise correction (verified — do NOT overclaim):** of the sites originally flagged, **only 4 are actually code-less**: `extractAgendaSchedule.ts:173`, `:543`, `:595`, and `hotels.ts:35`. `lib/data/adminEmails.ts:276` already carries `code:"ADMIN_EMAILS_INFRA"` and `lib/auth/isAdminSession.ts:35/49/64` already carry `code:"ADMIN_SESSION_LOOKUP_FAILED"` — **not code-less; excluded from this surface.** (Residual note: `ADMIN_EMAILS_INFRA` is scanner-exempt-but-uncataloged, which is allowed; no change.)

### 5.1 Reuse-vs-mint decisions (stated explicitly to preempt review)

| Site | Current | Decision | Code | Rationale |
|---|---|---|---|---|
| `extractAgendaSchedule.ts:173` `log.warn("too-many-pages")` | code-less warn | **mint** | `AGENDA_TOO_MANY_PAGES` | no semantic catalog sibling; 0 collisions |
| `extractAgendaSchedule.ts:543` `log.warn("low-confidence")` | code-less warn | **reuse** | `AGENDA_SCHEDULE_LOW_CONFIDENCE` (catalog `:1247`) | semantically identical to the existing user-facing code; ties forensic row to the user message. Reuse inside a stripped log span does NOT double-register. |
| `extractAgendaSchedule.ts:595` `log.error("pdfjs threw")` | code-less error | **mint** | `AGENDA_PDFJS_THREW` | a parser CRASH is forensically distinct from the user-facing `AGENDA_PDF_UNREADABLE`; keep them separate. 0 collisions. |
| `extractAgendaSchedule.ts:584` `log.info("high")` | code-less info (**non-durable**) | **mint** | `AGENDA_SCHEDULE_HIGH_CONFIDENCE` | deliberate durability addition — gives the one positive-path extract-outcome row (symmetric with LOW_CONFIDENCE); directly answers the audit's "0 positive-path telemetry." Cardinality is low (per agenda extract, not per cron tick). |
| `hotels.ts:35` `log.warn(msg, { source:"parser.hotels" })` | code-less warn | **mint** | `HOTELS_PARSE_WARNING` | message arg is a runtime var `msg`, so a constant `code` is the ONLY categorizable token. 0 collisions (no `HOTELS_*` code exists). |

Each change adds a `code:` property to the existing `fields` object of the existing `log.*` call. **The message arg is never changed.** `:595` keeps its reserved `error: err`. Every code is inside a `log.*` span → scanner-exempt (§7). `AGENDA_SCHEDULE_HIGH_CONFIDENCE` is the one behavior change (non-durable → durable), flagged here so it isn't mistaken for pure categorization.

---

## 6. Surface S5 — Live-show mutation outcome telemetry (NON-publish)

Wire `logAdminOutcome({ code })` post-commit into 5 admin mutation routes (the #218 PR continuation, excluding publish/archive/unpublish which are deferred to `published-toggle`). `logAdminOutcome(o: AdminOutcome)` (`lib/log/logAdminOutcome.ts:22`) emits `log.info(o.code, { …, actorHash: hashForLog(o.actorEmail), … })` — callers pass **`actorEmail` (canonical), not `actorHash`** (the fn derives the hash). MUST be `await`ed. `code` rides the call → scanner-exempt.

### 6.1 Route table (placement, actor source, ids)

| # | Route | Code | Placement | Actor email | ids |
|---|---|---|---|---|---|
| R1 | `app/api/admin/staged/[fileId]/apply/route.ts` | `SHOW_APPLIED` | **DIRECT** (lock inside `applyStaged`; `result` is post-commit in outer scope) — await emit ONLY on the `applied` branch (`:160-186`, the 202 pending-promote AND 200 returns) and the `wizard_applied` branch (`:187-195`). **NOT** on `discarded` (`:197-199` — a discard, not an apply), NOT on the `skipped`/error guards. | `readAdminEmail()` → `admin.email` (already captured `:134`) | `driveFileId=fileId` (`:104`); `applied` → `showId=result.showId` (`ApplyStagedResult.applied` has `showId:string`); `wizard_applied` → `wizardSessionId=result.wizardSessionId` (that variant has NO `showId` — omit it, do not fake) |
| R2 | `app/api/admin/show/staged/[stagedId]/apply/route.ts` | `SHOW_APPLIED` (shared, like `SHOW_FINALIZED` across finalize+cas) | **DIRECT** — before the sole success return (`:173-176`, already gated on `result.outcome === "applied"`) | `deps.requireAdminIdentity()` → `admin.email` (captured `:140`) | `driveFileId` from `readDriveFileIdForStagedId` (`:154`); `showId=result.showId` (`:174`) |
| R3 | `app/api/admin/sync/[slug]/route.ts` | `SHOW_SYNCED_MANUAL` | **DIRECT** but **GATED** — the `:86` `return NextResponse.json({ ok:true, result })` is reached by BOTH `applied` AND `stage` outcomes (`runManualSyncForShow` → `ProcessOneFileResult`; after the blocked/skipped/`code` guards, `applied` and `stage` remain). Emit ONLY when `result.outcome === "applied"` (the live show was actually synced); a `stage` outcome staged for review — do NOT emit (its eventual apply is logged by R1). | ⚠ currently `requireAdmin()` (void, `:57`) → **switch to `requireAdminIdentity()`** and capture email | `driveFileId=resolved.driveFileId` (`:68`); `showId=result.showId` (`applied` variant has `showId`) |
| R4 | `app/api/admin/pending-ingestions/[id]/retry/route.ts` | `PENDING_INGESTION_RETRIED` | **OUTCOME-REF** (success built inside `withRowTryLock` callback, pre-commit) — declare `let outcome: Omit<AdminOutcome,"code"> \| null = null` beside `appliedShowId` (`:337`). **GATE ON THE GENUINE APPLIED OUTCOME, NOT ON `appliedShowId`.** `appliedShowId` (`:374`) is intentionally broader — the `:370-372` comment states it also captures `parse_error`/`source_gone` recovery outcomes that carry a `showId` but map to `still_failed` (`manualSyncResponse:279-286`); gating telemetry on it would over-log. Assign `outcome` ONLY when `syncResult.outcome === "applied"` (manual-sync path, after `:376`) OR `stageResult.outcome === "applied"` (first-seen path, matching the existing `:397` gate). Emit `if (outcome) await logAdminOutcome({ code:"PENDING_INGESTION_RETRIED", ...outcome })` AFTER the lock resolves (after the skip guard `:400`, beside `revalidateShow` `:405`). | ⚠ currently `await deps.requireAdminIdentity()` **return discarded** (`:321`) → **capture** `const admin = …` | `driveFileId` (`:330`); `showId=syncResult.showId`/`stageResult.showId` (the `applied` variants carry it) |
| R5 | `app/api/admin/snapshot-rollback/[id]/repair/route.ts` | `SNAPSHOT_ROLLBACK_REPAIRED` | **DIRECT** — before `:55` `return NextResponse.json({ ok:true, result })` (repaired outcome) | ⚠ currently `requireAdmin()` (void, `:19`) → **switch to `requireAdminIdentity()`** (its thrown `AdminInfraError` still satisfies the `instanceof AdminInfraError` catch at `:21`) | `driveFileId=data.drive_file_id` (`:34-38`); **NO showId** — pass `snapshotRevisionId` via `extra`, omit `showId` (do not fake it) |

### 6.2 Mutation-boundary discipline

Emit ONLY on the committed-mutation path — a real live-show mutation, not a discard, no-op, stage-for-review, or guard/error return:

- **R1:** `applied` + `wizard_applied` only. NOT `discarded` (`:197`), NOT `skipped`/error.
- **R2:** the sole success return is already gated on `applied`.
- **R3:** `applied` only — NOT `stage` (staged, not synced), NOT blocked/skipped/`code` guards.
- **R4:** gate on `syncResult.outcome === "applied"` / `stageResult.outcome === "applied"` — NOT on `appliedShowId` presence (`appliedShowId` also captures `parse_error`/`source_gone` recovery outcomes that map to `still_failed`, `manualSyncResponse:279-286` — gating on it over-logs). R4's non-applied outcomes (`parsed_pending_review`/`deferred`/`still_failed`/`parsed`) must NOT emit `PENDING_INGESTION_RETRIED`, mirroring #218's "no log on idempotent re-poll" rule (`finalize/route.ts` leaves `outcome` null on no-op re-polls).
- **R5:** the `repaired` success return only (after the `not_found`/`not_stuck`/`promote_in_flight` guards).

### 6.3 `source` strings (mirror each route's EXISTING `log source:` convention — do not invent)

`api.admin.staged.apply` (R1, matches existing `:29/:40/:44`), **`api.admin.staged.apply` (R2 — matches the route's existing `source` at `:186`; do NOT invent `api.admin.show.staged.apply`)**, `api.admin.sync` (R3, matches existing `:28/:43/:48`), `api.admin.pending-ingestions.retry` (R4, new — route has no existing log source), `api.admin.snapshot-rollback.repair` (R5, new — route has no existing log source).

---

## 7. Scanner-safety design (the recurring §12.4 landmine)

The §12.4 producer scanner (`lib/messages/__internal__/codeProducers.ts`) runs `stripLogEmissionCalls(readFileSync(file))` (`:22`) BEFORE `matchAll(PRODUCER_RE)` (`:14`, matches literal `code: "SHOUTY_SNAKE"`). `stripLogEmissionCalls` (`:26`, `LOG_CALL_AT = /(?:log\.(?:error|warn|info|debug)|logAdminOutcome)\s*\(/y`) removes the entire `log.*(...)` and `logAdminOutcome(...)` spans. **Therefore every new code in this spec — placed exclusively inside such a span — is invisible to `PRODUCER_RE` and needs NO §12.4 catalog registration.**

**Hard rules (any violation leaks a code into the producer set → x1 `codes.test.ts` fails):**
1. Every code literal appears ONLY inside a `log.*(...)` / `logAdminOutcome(...)` call — never in a plain object literal, a `const fields = {...}` var passed to a log call, an HTTP response body, a thrown error's `code:` property, or a doc comment.
2. S1 breadcrumb reads `r.code` at runtime — no literal.
3. R4's outcome-ref is typed `Omit<AdminOutcome,"code">` and holds NO `code:` field — the literal rides only the `logAdminOutcome({ code:"…", ...ref })` emit call (the #218 `finalize.ts:1073/1249` pattern).
4. Verify `pnpm gen:internal-code-enums` is a **no-op** after the change (no code escaped into the enum generator).
5. Reused `AGENDA_SCHEDULE_LOW_CONFIDENCE` stays cataloged (it already is); placing it inside a log span does not double-register (`codeProducers.ts` skips `catalog.ts`).

### 7.1 Structural defense — extend `tests/log/_metaAdminOutcomeContract.test.ts`

- **S5 admin-outcome codes** → add `SHOW_APPLIED`, `SHOW_SYNCED_MANUAL`, `PENDING_INGESTION_RETRIED`, `SNAPSHOT_ROLLBACK_REPAIRED` to BOTH `SANCTIONED_CODES` (`:34`) and `AUDITABLE_MUTATIONS` (`:13`, 5 entries — R1+R2 share `SHOW_APPLIED`, legit dup precedent: two `SHOW_FINALIZED` rows). Assertion 1 (import specifier exactly `from "@/lib/log/logAdminOutcome"` + `logAdminOutcome(` call + quoted code), Assertion 3 (SHOUTY regex + "every sanctioned code used"), Assertion 4 (leak check) then cover them.
- **S2/S3/S4 plain-log forensic codes** → add `AGENDA_GETFILE_GONE`, `AGENDA_GETFILE_FAULT`, `AGENDA_TOO_MANY_PAGES`, `AGENDA_PDFJS_THREW`, `AGENDA_SCHEDULE_HIGH_CONFIDENCE`, `HOTELS_PARSE_WARNING`, `ADMIN_ACCESS_DENIED` to `NEW_FORENSIC_CODES` (`:47`) so Assertion 4 (`NEW_FORENSIC_CODES ∩ codeProducerLiterals() === ∅`) leak-guards them. (`AGENDA_SCHEDULE_LOW_CONFIDENCE` is REUSED/cataloged → NOT added to `NEW_FORENSIC_CODES`.) `NEW_FORENSIC_CODES` already mixes plain-log agenda codes (`AGENDA_EXTRACT_STALE`, `AGENDA_EXTRACT_SESSION_GONE`) with the spread `SANCTIONED_CODES`, so this is consistent with existing usage.

x1 `codes.test.ts` remains the global backstop (any leaked code without a catalog row fails it). The meta-test additions are the pre-emptive, CI-time class guard.

---

## 8. Flag / durability lifecycle table

| Code | Storage | Level | Write path | Durable? | Effect |
|---|---|---|---|---|---|
| (breadcrumb, no code) | `app_events.context.failures[]` | warn/error (via summary) | `summarizeSync`/`summarizeAssetRecovery` → `withCronRunSummary` | yes (warn/error always) | triage the failing show(s) from `app_events` alone |
| `AGENDA_GETFILE_GONE` | `app_events` | info | `enrichAgenda:168` | yes (info+code) | expected-gone recorded quietly, no stack |
| `AGENDA_GETFILE_FAULT` | `app_events` | warn | `enrichAgenda:180` | yes | transient getFile fault, categorizable, keeps stack |
| `ADMIN_ACCESS_DENIED` | `app_events` (+`actor_hash`) | warn | `requireAdmin:266` | yes | who/when/how-often admin refused |
| `AGENDA_TOO_MANY_PAGES` | `app_events` | warn | `extractAgendaSchedule:173` | yes | categorize page-cap bailout |
| `AGENDA_SCHEDULE_LOW_CONFIDENCE` (reused) | `app_events` | warn | `extractAgendaSchedule:543` | yes | categorize low-confidence extract |
| `AGENDA_PDFJS_THREW` | `app_events` | error | `extractAgendaSchedule:595` | yes | first-ever error-tier durable row on a real crash |
| `AGENDA_SCHEDULE_HIGH_CONFIDENCE` | `app_events` | info | `extractAgendaSchedule:584` | **now yes** (was ephemeral) | positive-path extract telemetry |
| `HOTELS_PARSE_WARNING` | `app_events` | warn | `hotels:35` | yes | categorize dynamic-message parser warns |
| `SHOW_APPLIED` | `app_events` (+`actor_hash`,`show_id`,`drive_file_id`) | info | R1,R2 | yes | durable actor-attributed live-show apply |
| `SHOW_SYNCED_MANUAL` | `app_events` | info | R3 | yes | durable actor-attributed manual re-sync |
| `PENDING_INGESTION_RETRIED` | `app_events` | info | R4 | yes | durable actor-attributed retry-apply |
| `SNAPSHOT_ROLLBACK_REPAIRED` | `app_events` | info | R5 | yes | durable actor-attributed recovery mutation |

No zombie flags: every code has a write path and a durable effect.

---

## 9. Disagreement-loop preempts (pre-load the reviewer)

Contracts a reviewer is likely to relitigate — resolved here with citations:

1. **Do NOT reclassify `source_gone`/`stale` out of the FAILED set.** The audit's synthesis first-draft recommended this; it is REJECTED. (a) The FAILED set is deliberately conservative — `lib/cron/summarizeSync.ts:14-17` comment: "a NEW/missed outcome surfaces as `partial`, never silently benign (§4.4 exhaustiveness)." (b) The live incident's standing failure was a genuine `hard_fail:MI-3_NO_VALID_DATES`, not `source_gone`/`stale` — reclassifying benign terminals would NOT have touched it and would risk hiding real failures. The breadcrumb (S1) is the correct fix: keep the conservative classification, make it triageable.
2. **`AGENDA_SCHEDULE_HIGH_CONFIDENCE` is an intentional durability addition, not scope creep.** It converts one currently-ephemeral success `log.info` into a durable positive-path row — the audit explicitly flagged "0 positive-path telemetry." Low cardinality (per extract).
3. **`SHOW_APPLIED` shared by R1+R2 is intentional**, mirroring `SHOW_FINALIZED` across finalize+finalize-cas (`_metaAdminOutcomeContract.test.ts:30-31`). Dup codes are allowed; `used` is a Set.
4. **`SNAPSHOT_ROLLBACK_REPAIRED` naming:** chosen for source-alignment (`api.admin.snapshot-rollback.repair`) over prefix-parity `PENDING_SNAPSHOT_ROLLBACK_REPAIRED`. Forensic codes are not cataloged, so catalog-prefix parity is not required. Naming choice, not correctness.
5. **New forensic codes need NO §12.4 registration** — confirmed by reading `stripLogEmissionCalls.ts:26` + `codeProducers.ts:22`, not assumed. See §7.
6. **Surface #7 premise partly corrected** — `adminEmails.ts`/`isAdminSession.ts` already carry codes; only 4 sites are code-less. Any claim otherwise is wrong.
7. **Breadcrumb shapes differ by summarizer** (`driveFileId` for sync, `showId` for asset-recovery) — intentional, forced by the processed-element types; not an inconsistency.
8. **R3/R4/R5 actor-identity migration** (`requireAdmin`→`requireAdminIdentity`, or capturing a discarded return) is required to obtain `actorEmail`; `requireAdminIdentity` throws the same `AdminInfraError` so existing `instanceof` catches stay valid.

---

## 10. Test plan (per-surface failure modes)

Every task is TDD: failing test → minimal impl → passing test → commit (invariant 1).

- **S1:** unit tests on `summarizeSync`/`summarizeAssetRecovery` — (a) a `hard_fail` item produces `detail.failures = [{ driveFileId, outcome:"hard_fail", code }]`; (b) `ConcurrentSyncSkipped` and SKIPPED-set items produce NO `failures` entry; (c) `ok` run omits `detail.failures` entirely (exactOptionalPropertyTypes); (d) >25 failures → 25 entries + `failuresTruncated:true` while `counts.failed` = true total; (e) asset-recovery mirror keys on `showId` and omits `code` for `partial_failure`. **Failure mode caught:** a `partial` run that names no failing item (the live incident's exact blind spot). Derive expected `driveFileId`/`code` from the fixture's processed array, never hardcode. Check/extend the scanner-safety test referenced at `runSummary.ts:1-3` if it asserts on emitted detail shape.
- **S2:** extend `tests/sync/enrichAgenda.test.ts:281-345` — spy on `log`: 404/400 → `log.info` called with `code:"AGENDA_GETFILE_GONE"` and NO `error` field; 403/429/503/`null` → `log.warn` called with `code:"AGENDA_GETFILE_FAULT"` and `error` present. Existing verdict assertions stay green (they assert `perLink[].verdict`, not the log — so the spy assertion is REQUIRED or a broken split ships green).
- **S3:** extend `tests/auth/requireAdmin.test.ts:160-172` (+ possibly `:190-210`) — add a hoisted `@/lib/log` mock; assert `log.warn` called with `code:"ADMIN_ACCESS_DENIED"` and `actorHash === hashForLog(canonicalize("Admin@FXAV.Test "))` (compute at test time from the seeded email `:52-55`; never hardcode the digest). Assert redirect/infra paths do NOT emit it.
- **S4:** extend `tests/agenda/extractAgendaSchedule*.test.ts` + `tests/parser/blocks/hotels.test.ts` — spy on `log`, assert each site emits its code. For `:584`, assert it now persists (info WITH code).
- **S5:** extend `tests/log/_metaAdminOutcomeContract.test.ts` (registry + SANCTIONED + NEW_FORENSIC) and add per-route tests asserting `logAdminOutcome` is called with the right `code`+`actorEmail`+ids ONLY on the committed path, and NOT on skip/guard/no-op paths (R4: not on non-applied outcomes). Derive expected ids from fixtures.
- **Global:** `pnpm gen:internal-code-enums` no-op; x1 `codes.test.ts` green (no leaked producer); full `pnpm typecheck` + targeted `pnpm test` green.

---

## 11. Numeric / self-consistency sweep

- **5** surfaces; **5** S5 routes; **4** S5 codes (R1+R2 share `SHOW_APPLIED`); **7** new plain-log forensic codes (S2×2 + S3×1 + S4×4); **1** reused catalog code (`AGENDA_SCHEDULE_LOW_CONFIDENCE`); **1** durability addition (`AGENDA_SCHEDULE_HIGH_CONFIDENCE`). Total NEW codes = **11**; total catalog changes = **0**.
- **0** DB migrations, **0** UI surfaces, **0** advisory-lock changes, **0** new Supabase call sites.
- `MAX_FAILURE_BREADCRUMBS = 25`.
- Meta-test edits: `SANCTIONED_CODES` +4, `AUDITABLE_MUTATIONS` +5 rows, `NEW_FORENSIC_CODES` +7.

---

## 12. Out of scope (deferred with a home)

- Drive webhook + watch-channel telemetry → fold into `worktree-watch-channel-health`.
- publish/archive/unpublish outcome telemetry → fold into `worktree-published-toggle`.
- Notify-cron "never fired on validation" → operational investigation (not a code change).
- Admin-gate SUCCESS / realtime-token GRANT sampling; per-link agenda trace demotion to debug → future observability pass.
