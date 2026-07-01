# Durable outcome telemetry for admin mutations + `info`+`code` outcome convention — design

**Status:** design (autonomous-ship; user spec/plan review gates waived — Codex adversarial-review + real CI enforced)
**Date:** 2026-07-01
**Origin:** the observability coverage audit that closed the console.* → lib/log arc (#208). Audit headline: `error=81 / warn=15 / info=5 / debug=0` — logging is failure-centric. Admin mutations log only their unexpected-500 catch; `info`-without-`code` is console-only (never persists), so there is **no durable audit trail of admin mutations and no positive-path telemetry**.

## 1. Problem & goal

**Goal:** give the app durable, queryable telemetry for admin state-changing actions and a small set of high-value decision points, plus a reusable convention so future logs are durable-by-construction.

Two coupled deliverables:

1. **The `info`+`code` durable-outcome convention**, codified as a thin helper (`logAdminOutcome`) so the mandatory `code` (the thing that flips an `info` from console-only to persisted) cannot be forgotten.
2. **Instrument the identified gaps** from the audit: the 6 admin mutations (audit trail), the advisory-lock skip, the agenda decision branches, the `applyStaged` typed-error path, and the geocoding warn quality issue.

## 2. Background: the persist gate + the `code` namespace (why this works)

- `lib/log/logger.ts` `shouldPersist(level, code, persist)`: **error + warn ALWAYS persist** to `app_events`; **info persists ONLY with a non-null `code`** (or explicit `persist: true`); debug never persists (`logger.ts:22-26`).
- `app_events` columns written by `lib/log/persist.ts:12-24`: `level, source, message, code, request_id, show_id, drive_file_id, actor_hash, context`.
- **The `code` on a log is a free-form forensic namespace, NOT §12.4-gated.** `lib/messages/__internal__/stripLogEmissionCalls.ts` strips every `log.<level>( … )` span before BOTH the §12.4 parity scanner (`tests/cross-cutting/codes.test.ts:38`) and the internal-code-enum generator (`scripts/extract-internal-code-enums.ts:45`) run, precisely so `log.*({ code })` is never mistaken for a user-facing / admin_alerts producer (its docstring says so verbatim). **Consequence:** the outcome codes introduced here need NO §12.4 catalog entry and NO internal-code-enum registration — provided each is a **literal** `code:` in a recognized `log.<level>(...)` call (never computed/aliased), exactly as `withCronRunSummary.ts:50` already relies on.
- Reserved log fields (`logger.ts:8-17`): `source, code, showId, driveFileId, requestId, actorHash, error, persist`. Everything else spreads into `app_events.context`.
- Correlation fall-through (`logger.ts:44-47`): `requestId`/`showId` fall through to the ALS request context; **`actorHash` does NOT** — it is only ever `fields.actorHash ?? null`. So actor attribution must be passed explicitly per call. (We do not change this fall-through; see §9 Alternatives.)
- `actor_hash` already round-trips to the Phase-2 observability timeline: `lib/admin/loadAppEvents.ts:25` reads `actor_hash` → so an outcome log with `actorHash` shows up in `/admin/observability` attributed to the admin.

## 3. The convention + helper

New module **`lib/log/logAdminOutcome.ts`**:

```ts
import { log } from "@/lib/log";
import { hashForLog } from "@/lib/email/hashForLog";

// A DURABLE admin-action outcome. The `code` is what makes it persist to
// app_events (shouldPersist: info persists only with a code). Free-form
// forensic namespace — NOT §12.4 (stripLogEmissionCalls excludes log emissions).
export interface AdminOutcome {
  code: string; // SHOUTY_SNAKE_CASE literal, from ADMIN_OUTCOME_CODES
  source: string; // e.g. "api.admin.onboarding.staged.apply"
  actorEmail?: string; // ALREADY canonical (requireAdminIdentity returns canonicalize()'d email)
  driveFileId?: string;
  wizardSessionId?: string;
  showId?: string;
  result?: string; // sub-outcome, e.g. "reapplied" | "all_batches_complete"
  extra?: Record<string, unknown>; // additional context (spreads into app_events.context)
}

export async function logAdminOutcome(o: AdminOutcome): Promise<void> {
  await log.info(o.code, {
    code: o.code,
    source: o.source,
    ...(o.actorEmail ? { actorHash: hashForLog(o.actorEmail) } : {}),
    ...(o.driveFileId ? { driveFileId: o.driveFileId } : {}),
    ...(o.showId ? { showId: o.showId } : {}),
    ...(o.wizardSessionId ? { wizardSessionId: o.wizardSessionId } : {}),
    ...(o.result ? { result: o.result } : {}),
    ...(o.extra ?? {}),
  });
}
```

**Design decisions (guard conditions):**
- **`message === code`.** The outcome log's message IS the code string (a stable, low-cardinality event name). Detail lives in `result`/`extra`, never interpolated into the message.
- **`await`ed, not fire-and-forget.** The caller `await`s `logAdminOutcome` at the mutation's terminal success (after the mutating tx commits) so the audit record is durably written before the HTTP response returns. Admin mutations are not latency-critical; durability is the point. Placement: AFTER the advisory-lock tx commits (never inside the lock) and BEFORE the `return NextResponse.json(...)`.
- **`actorEmail` is already canonical.** `requireAdminIdentity` returns `{ email }` where `email = canonicalize(claims.email)` (`lib/auth/requireAdmin.ts:207,270`). So `hashForLog(actorEmail)` is correct with no re-canonicalization (invariant 3 preserved — canonicalization already happened at the auth boundary; we do not re-normalize).
- **`actorEmail` optional / absent → no `actorHash`.** If a call site has no bound admin email (e.g. a cron path), `actorHash` is simply omitted (never a bogus hash of `""`).
- **`hashForLog` boot gate.** `hashForLog` throws at module load if `HASH_FOR_LOG_PEPPER` < 32 chars (`hashForLog.ts:8-14`). Already satisfied in prod + tests (`tests/setup.ts` seeds it). No new env requirement.

New constants module **`lib/log/adminOutcomeCodes.ts`** — the sanctioned outcome-code set, exported as consts so impl + meta-test share one source of truth:

```ts
export const ADMIN_OUTCOME_CODES = {
  STAGE_APPLIED: "STAGE_APPLIED",
  STAGE_APPROVED: "STAGE_APPROVED",
  STAGE_UNAPPROVED: "STAGE_UNAPPROVED",
  STAGE_DISCARDED: "STAGE_DISCARDED",
  SHOW_FINALIZED: "SHOW_FINALIZED",
} as const;
```

(These are literals; when referenced as `code: ADMIN_OUTCOME_CODES.STAGE_APPLIED` the value is a computed member access, which `stripLogEmissionCalls` still strips because the WHOLE `log.info(...)` span is removed — the code literal lives inside the stripped span. Verified: `stripLogEmissionCalls` removes the entire balanced-paren call, not just string literals.)

## 4. Surface-by-surface instrumentation

### 4.1 The 6 admin mutations (audit trail)

For each, add `await logAdminOutcome({...})` at the terminal SUCCESS return(s), after the tx commits, before the response. The 409-superseded outcomes are NOT logged here — they already surface via the `WIZARD_SESSION_SUPERSEDED_RACE` admin_alert (`apply/route.ts:213`, `discard/route.ts:155`) and the cataloged 409.

| Route (`app/api/admin/onboarding/...`) | success site (current line) | code | result | actor source |
|---|---|---|---|---|
| `staged/[wizardSessionId]/[driveFileId]/apply/route.ts` | 172 (`reapplied`), 179 (`restaged_inline`) | `STAGE_APPLIED` | `"reapplied"` / `"restaged_inline"` | `admin.email` (bound at :127/157) |
| `staged/.../approve/route.ts` | 248 | `STAGE_APPROVED` | — | `adminEmail` (bound at :200) |
| `staged/.../unapprove/route.ts` | 143 | `STAGE_UNAPPROVED` | — | **capture** — currently `await deps.requireAdminIdentity()` at :125 does not bind email; change to `const { email } = await deps.requireAdminIdentity()` |
| `staged/.../discard/route.ts` | 165 | `STAGE_DISCARDED` | — | **capture** — same, bind email at :104 |
| `onboarding/finalize/route.ts` | 682, 1101, 1117 (+ any other terminal 200) | `SHOW_FINALIZED` | the `status` value (`batch_complete` / `all_batches_complete` / `in_progress`) | `admin.email` (bound at :1047) |
| `onboarding/finalize-cas/route.ts` | 795 (`return NextResponse.json(result)`) | `SHOW_FINALIZED` | `"final_cas"` | admin (bound at :769/819) |

**Guard conditions:**
- **apply**: the two success returns (172/179) are distinct sub-outcomes — each gets its own `logAdminOutcome` with the matching `result`. The `409 SHOW_BUSY_RETRY` (171) and `409 SUPERSEDED` (218) are NOT success — not logged here.
- **finalize** is multi-return + streaming (NDJSON per #210). Log at each terminal 200 return inside the handler (the streaming path funnels its final JSON through the same returns). `driveFileId` is not always in scope for finalize (session-level, not file-level) → omit `driveFileId`, include `wizardSessionId` + `result: status`.
- **finalize-cas**: the single terminal `return NextResponse.json(result)` (:795). `result.watched_folder_id` etc. is in scope; include `wizardSessionId`.
- **Behavior invariant:** each change ONLY adds an `await logAdminOutcome(...)` immediately before an existing `return` — no control-flow, response-shape, or status change. The advisory lock is already released (tx committed) at every one of these return points (they are post-`withPostgresSyncPipelineLock`).

### 4.2 Advisory-lock skip (durability)

`lib/sync/runScheduledCronSync.ts:2798` currently: `await log.info("missing-show sync skipped on lock contention", {...})` — info-without-code → console-only. Add `code: "MISSING_SHOW_SYNC_LOCK_SKIPPED"` so the contention-skip decision persists. No other change (message + existing fields kept). This is a cron path (no admin actor) — `logAdminOutcome` is not used; the `code` is added to the existing `log.info` directly.

### 4.3 Agenda decision branches

`app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` — add durable logs (`log.warn`/`log.info` with a `code`) at the currently-unlogged TERMINAL decision outcomes (NOT the high-frequency queue polls, to avoid flooding):
- `409 stale` (:115) → `log.warn("agenda extract stale revision", { code: "AGENDA_EXTRACT_STALE", source: "api.admin.agenda.extract", driveFileId, wizardSessionId })`.
- session `missing` / `superseded` (:264/269) → `log.warn(..., { code: "AGENDA_EXTRACT_SESSION_GONE", result: "missing"|"superseded", ... })`.
- `500 ADMIN_SESSION_LOOKUP_FAILED` (:202) → already carries a code but as a Response literal, not a log; add a `log.error(..., { code: "ADMIN_SESSION_LOOKUP_FAILED", source, error })` before the return.

**Excluded (noise):** the admit-queue outcomes `in_progress` / `queued` (:213/214/227) fire on every poll — NOT logged durably (would flood app_events). If any diagnostic is wanted they stay console-only (no code). Stated explicitly so the reviewer does not relitigate.

### 4.4 `applyStaged` typed-error path

`lib/sync/applyStaged.ts` returns `{ outcome: "infra_error", code: SYNC_INFRA_ERROR }` at 9 sites (1040, 1047, 1184, 1234, 1428, 1442, 1501, 1519, 1618). Today the EXPECTED failure path is silent while the rare unexpected throw is logged. Fix at the PRODUCE sites where a caught error is (or can be) bound: change `catch { return infra_error }` → `catch (error) { log.error("applyStaged infra fault", { code: SYNC_INFRA_ERROR, source: "sync.applyStaged", error }); return { outcome: "infra_error", code: SYNC_INFRA_ERROR }; }`.
- `code: SYNC_INFRA_ERROR` in a `log.error` is stripped by `stripLogEmissionCalls`, so it does NOT double-register the §12.4 code (it already lives in `catalog.ts` as a user-facing producer). The log's code intentionally MIRRORS the user-facing code (same forensic identity).
- Sites that already rethrow or bind the error keep their behavior; only the `infra_error`-returning catches gain the log. Return values are byte-identical (no behavior change).
- **Class-sweep:** the meta-test (§6) walks `applyStaged.ts` and asserts every `return { outcome: "infra_error"` is preceded by a `log.` within its catch (so a future 10th site can't silently skip).

### 4.5 Geocoding warn quality

`lib/geocoding/cache.ts` (43,54,60,78,95,100): 6 identical `log.warn("geocode cache infra fault", { source: "geocoding/cache" })` — indistinguishable, no error, no key. Enrich each with (a) the caught `error` (bind the catch), (b) an `op` field naming the failing operation (`read`/`write`/`parse`), and (c) the cache key where in scope. Keep `warn` (persists — a cache fault IS worth durable record) but make each distinguishable. No dedup needed (these are per-request cache faults, not a tight loop).

## 5. Codes summary (single source of truth)

| code | level | source | where |
|---|---|---|---|
| `STAGE_APPLIED` / `STAGE_APPROVED` / `STAGE_UNAPPROVED` / `STAGE_DISCARDED` / `SHOW_FINALIZED` | info | `api.admin.onboarding.*` | §4.1 (via `logAdminOutcome`) |
| `MISSING_SHOW_SYNC_LOCK_SKIPPED` | info | `sync.runScheduledCronSync` | §4.2 |
| `AGENDA_EXTRACT_STALE` / `AGENDA_EXTRACT_SESSION_GONE` | warn | `api.admin.agenda.extract` | §4.3 |
| `ADMIN_SESSION_LOOKUP_FAILED` | error | `api.admin.agenda.extract` | §4.3 (mirrors existing §12.4 code) |
| `SYNC_INFRA_ERROR` | error | `sync.applyStaged` | §4.4 (mirrors existing §12.4 code) |
| `GEOCODE_CACHE_FAULT` | warn | `geocoding/cache` | §4.5 |

All are literals inside `log.<level>(...)` spans → excluded from §12.4 + internal-enum scanners by `stripLogEmissionCalls`. `ADMIN_OUTCOME_CODES` (info-level, §4.1) are the only ones referenced by the enforcement meta-test.

## 6. Enforcement meta-test

New **`tests/log/_metaAdminOutcomeContract.test.ts`** — a registry-walk pin (modeled on `tests/auth/_metaInfraContract.test.ts`):
- **Registry:** the 6 mutation routes (§4.1) as an explicit `AUDITABLE_MUTATIONS` array of `{ file, code }`.
- **Assertion 1:** each registry route's source imports `logAdminOutcome` AND contains a `logAdminOutcome(` call carrying its expected `ADMIN_OUTCOME_CODES.*` code. A new mutation route added to the registry with no outcome log fails the test.
- **Assertion 2:** `applyStaged.ts` — every `return { outcome: "infra_error"` line has a `log.` call within the preceding ~12 lines (its catch), pinning §4.4's class-sweep.
- **Assertion 3 (convention guard):** `ADMIN_OUTCOME_CODES` values are all SHOUTY_SNAKE_CASE and each appears in exactly one registry route (no orphan codes, no code reused across routes).
- New call sites EITHER add a registry row OR carry an inline `// not-subject-to-admin-outcome: <reason>` (mirrors the `_metaInfraContract` opt-out convention).

## 7. Testing (TDD per surface)

- **`logAdminOutcome`** (`tests/log/logAdminOutcome.test.ts`): mock `@/lib/log`; assert `log.info` called with `code === message`, `actorHash === hashForLog(canonicalEmail)` for a given email, correlation fields present/absent per input, and that a missing `actorEmail` omits `actorHash` (no hash of `""`). Assert it `await`s (returns a promise that resolves after `log.info`).
- **Per-mutation** (extend each route's existing test, e.g. `tests/onboarding/finalize.test.ts`, the staged route tests): mock `@/lib/log`; drive the success path; assert `log.info` fired with the expected `code` + `actorHash` (derived from the fixture admin email via `hashForLog`, NOT hardcoded) + correlation. Assert the 409-superseded path does NOT emit an outcome log (only the alert). Concrete failure mode: a refactor dropping the outcome log, or logging on the superseded path.
- **applyStaged** (`tests/sync/applyStaged*.test.ts`): force each infra_error branch; assert `log.error` fired with `code: SYNC_INFRA_ERROR` + the caught error in the reserved `error` field. Assert the return value is unchanged (`{ outcome: "infra_error", code: SYNC_INFRA_ERROR }`).
- **agenda / geocoding / lock-skip**: assert the new durable logs fire with their codes on the relevant branch; assert the excluded queue-poll branches do NOT emit a coded log.
- **Meta-test**: negative control — a fixture string with a mutation-route shape lacking `logAdminOutcome` must fail Assertion 1; the AST/grep must not false-positive on a `// logAdminOutcome` comment.
- **Anti-tautology:** every `actorHash` assertion derives the expected value from `hashForLog(fixtureEmail)` at test time, never a hardcoded hex. Every code assertion references `ADMIN_OUTCOME_CODES.*`, not a string literal that could drift from the impl.

## 8. Plan-wide invariants honored

- **Invariant 5 (no raw codes in UI):** untouched — these codes are forensic `app_events` codes, never rendered. `stripLogEmissionCalls` keeps them out of the §12.4 producer scan (§2).
- **Invariant 2 (advisory lock single-holder):** no lock topology change — outcome logs are emitted AFTER the mutating tx commits, outside the lock. No new `pg_advisory*` call.
- **Invariant 9 (Supabase call-boundary / best-effort logging):** `logAdminOutcome` is best-effort. It is `await`ed for durability, BUT logging must never throw over the caller — the default sink's persist step is already try/catch-guarded (`logger.ts` persist guard, shipped #208). We do NOT wrap `logAdminOutcome` call sites in extra try/catch (the sink swallows); the meta-test `_metaAppEventsWriter` continues to pin persist.ts's swallow contract.
- **Invariant 3 (email canonicalization):** actor emails are already canonical at the `requireAdminIdentity` boundary; `logAdminOutcome` does not re-normalize.
- **TDD per task; commit per task; conventional commits.**

## 9. Alternatives considered (do-not-relitigate)

- **A `withAdminActionLog` wrapper (withCronRunSummary pattern).** Rejected for THIS retrofit: the onboarding staged/finalize routes do NOT establish a `runWithRequestContext` ALS (only cron/observe/report and the live `app/api/admin/staged/[fileId]/apply` do — verified), `buildRecord` does not fall `actorHash` through the ALS (`logger.ts:47`), and `finalize` now returns STREAMING (NDJSON) responses (#210) whose outcome cannot be derived from a `Response` object post-hoc. A wrapper would require ALS surgery + `actorHash` fall-through + stream-aware outcome extraction — a larger, riskier change than an explicit `await logAdminOutcome(...)` at each terminal return. The helper keeps each site simple and testable. (If a future refactor establishes ALS universally, migrating to a wrapper is a clean follow-up.)
- **Seeding `actorHash` into the ALS at `requireAdminIdentity`.** Rejected now for the same ALS-not-established reason; would auto-attribute ALL admin-request logs but requires per-route ALS wrapping + the `buildRecord` fall-through change. Noted as a future enhancement, not this PR.
- **Reconsidering the persist gate (persist info unconditionally).** Rejected — the gate is intentional (info without a code is dev-noise); the fix is to give durable outcomes a code, not to flood app_events with every info.

## 10. Out of scope (documented follow-ups, not dropped)

- Universal ALS + `actorHash` fall-through (the wrapper migration above).
- Auth-denial-path coverage (the coverage audit's `lib/auth` 39-catch pass never ran — session-limit); a separate audit follow-up.
- `requestId` seeding on admin routes (correlation) — depends on the ALS work.
- Report-generation start/outcome logging.

## 11. Success criteria

- Every §4.1 mutation success emits a durable, actor-attributed `app_events` row visible in `/admin/observability`.
- The advisory-lock skip, agenda terminal decisions, and `applyStaged` typed-error path are durable.
- Geocoding faults are distinguishable.
- The meta-test fails if a future mutation route (in the registry) omits its outcome log or an `applyStaged` infra_error return skips its log.
- Full unit suite green (only the 3 known env-only files), typecheck 0, lint 0, format clean, Codex whole-diff APPROVE, real CI green.
