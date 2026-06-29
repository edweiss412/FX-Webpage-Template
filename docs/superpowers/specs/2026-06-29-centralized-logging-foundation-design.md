# Spec: Centralized logging foundation (Phase 1 of observability)

> Status: design ratified in brainstorming 2026-06-29 (autonomous-ship approved).
> This is **Phase 1 of 4** of a hybrid observability arc. Phases 2–4 (operator
> timeline UI + cron run-summary; Sentry client-error capture; alerting +
> `console.*` migration) are **out of scope** here and tracked in §3.

## 1. Problem

The app has **no centralized application logger** and no durable, queryable record
of most server-side faults. A logging-surface audit (2026-06-29) against
`origin/main` found:

- **No `lib/log`/`lib/logger` module, no `createLogger`, no `pino`/`winston`/etc.**
  All logging is **93 raw `console.*` call sites** (68 `console.error`, 18
  `console.warn`, 6 `console.log`, 1 `console.info`; `app/`=47, `components/`=26,
  `scripts/`=18, `lib/`=2) with ad-hoc `[bracket-tag]` prefixes, no levels, no
  shared format, no `no-console` lint rule (`eslint.config.mjs` has zero
  `no-console`). These land only in **ephemeral Vercel function logs** —
  unstructured, non-queryable, no retention.
- **The one error-serializer is trapped and unexported:** `errorLogValue()` at
  `app/auth/callback/route.ts:77-81` (`error instanceof Error ? {name,message,stack}
  : String(error)`), used only by that file's 3 call sites. Everyone else
  hand-rolls `error.message` / `String(error)`.
- **The richest server signals are produced silently.** Typed infra producers
  detect, type, then never log: `AdminInfraError` (`lib/auth/requireAdmin.ts:79-86`,
  code `ADMIN_SESSION_LOOKUP_FAILED`, production throw sites L165,180,190,213,225,230);
  `isAdminSession` → `{ok:false, reason:'infra_error'}` (`lib/auth/isAdminSession.ts:34,44,55`);
  `AdminEmailsInfraError` (`lib/data/adminEmails.ts:29-36`, code `ADMIN_EMAILS_INFRA`);
  `validateGoogleIdentity`/`validateGoogleSession` `{kind:'terminal_failure', status, code}`.
  `tests/auth/_metaInfraContract.test.ts` pins their **typed shape** but asserts
  **nothing about emission** — and none of the five producers calls `console`/a
  logger at all.
- **Specific silent boundaries:** onboarding-scan throw → `{ok:false, code:null}`
  on the NDJSON stream with no log (`app/api/admin/onboarding/scan/route.ts:265-266`);
  `readCrewRoleFlags` bare `catch{}` → `ADMIN_SESSION_LOOKUP_FAILED`
  (`app/api/report/route.ts:78-84`); four geocode-cache `catch{}` → `infra_error`
  (`lib/geocoding/cache.ts:41-43,54-56,71-73,89-91`); cron `missingShows`
  `CONCURRENT_SYNC_SKIPPED` branch writes no `sync_log` row
  (`lib/sync/runScheduledCronSync.ts:2785-2795`).
- **No correlation/request/trace IDs anywhere.** Zero `AsyncLocalStorage`, zero
  `x-vercel-id` reads, zero `runtime='edge'` (everything is Node serverless). A
  `console.error`, its `admin_alerts` row, and its `sync_log` row cannot be tied to
  one request or to each other.
- Existing durable DB sinks are narrow and mostly unread: `sync_log`
  (`…/20260501001000_internal_and_admin.sql:221-230`, append-only, **zero app
  readers**, dead `duration_ms` column), `sync_audit` (`:204-219`, applies only),
  `admin_alerts` (`:268-278`, a **deduplicated open-problems set** — the partial
  unique index `admin_alerts_one_unresolved_idx` (`:279-280`) coalesces repeats —
  not an event log). `@sentry/nextjs@^10.51.0` is a **zombie dependency**
  (`package.json:54`): never imported, no `instrumentation.ts`, no
  `withSentryConfig` (`next.config.ts:84` → `export default withMDX(nextConfig)`).

### 1.1 Why a foundation phase

"Both, equally" (durable + alerting) via a hybrid sink is too large for one cycle.
Phase 1 lays the **substrate** every later phase taps: one TS chokepoint, one
durable queryable table, and request correlation. Without it, Sentry wiring,
the operator UI, and alerting each re-invent emission and correlation.

## 2. Goal

Ship a single logging chokepoint and a durable, queryable server-event store:

1. **`lib/log`** — `log.error/warn/info/debug(message, fields)` with levels, a
   shared `serializeError`, structured context, and a persistence threshold. Every
   call writes to **console** (Vercel logs unchanged) and **selectively persists**
   to a new `app_events` table.
2. **`app_events`** — append-only, DML-locked-down (service-role writes only),
   bounded by a retention prune, PII-safe.
3. **Correlation IDs** — an `AsyncLocalStorage` request context seeded at an
   enumerated set of API/cron route handlers; the logger auto-attaches
   `request_id` (and `show_id` when set), so `console`, `app_events`,
   `admin_alerts`, and `sync_log` rows from one request finally share an id.
4. **Emit the silent producers** — tap the enumerated silent fault boundaries so
   server faults become durable, and **extend `_metaInfraContract` to require
   emission** so the gap cannot silently return.

Success = a server fault (auth infra error, onboarding-scan throw, geocode-cache
fault, cron lock contention) produces a structured `app_events` row carrying its
`request_id`, queryable via SQL, with PII hashed — and a meta-test fails if a
registered infra producer stops emitting.

## 3. Non-goals / out of scope (later phases)

- **Sentry / client-error capture** (Phase 3): no `instrumentation.ts`, no
  `withSentryConfig`, no error boundaries, no browser handlers. `@sentry/nextjs`
  stays unwired.
- **Operator timeline UI** (Phase 2): no admin page reads `app_events`; reads are
  SQL/service-role only in Phase 1. (This is why the table is `revoke all`, not
  admin-SELECT-RLS — see §5.2.)
- **Per-run cron run-summary row** (Phase 2).
- **`console.*` migration + `no-console` lint rule** (Phase 4): the 93 existing
  sites are **not** migrated here; this avoids a 93-site churn in the foundation
  PR. `lib/log` is additive; new code should use it, but enforcement lands later.
- **Populating `sync_log.duration_ms`** (the dead column) — untouched.
- **RSC correlation** — ALS is seeded only at API/cron **route handlers** (one
  async invocation per request). RSC log calls get `request_id = null` (graceful);
  reliable RSC correlation waits for a later phase (Next renders segments in
  separate async scopes, so layout-seeded ALS is unreliable).
- **Retrofitting correlation into all routes** — only the enumerated set in §5.4.

## 4. Architecture overview

```
                       ┌──────────────────────────────────────────┐
  call site ─ log.* ──▶│  lib/log  (the single chokepoint)         │
                       │  • serializeError(unknown) → {name,msg,…}  │
                       │  • merge AsyncLocalStorage requestId/showId│
                       │  • build LogRecord                         │
                       │  • console[method]  (ALWAYS, synchronous)  │
                       │  • persist?  →  app_events  (threshold)    │
                       └───────────────┬──────────────────────────┘
                                       │ persist (error|warn|coded-info)
                                       ▼
            service-role insert  →  public.app_events  (revoke all; RLS on)
                                       ▲
   route handler ─ runWithRequestContext({requestId}, handler) ─ seeds ALS
```

- The chokepoint is **TS** (`lib/log`); the DB write is a **locked-down
  service-role insert** (`geocode_cache` precedent: `revoke all` + service-role
  only — `…/20260627000001_geocode_cache.sql:45`). No new RPC: service-role already
  bypasses RLS, so an RPC adds a param-list surface with no security gain.
- Console emission is **synchronous and unconditional** (so Vercel logs capture
  everything regardless of DB outcome). DB persistence is **awaited but
  best-effort**: a failed insert degrades to `console.error` and returns — it
  **never throws over the caller's real error** (invariant 9).
- Persistence is **awaited**, not fire-and-forget, because a synchronous RSC /
  serverless function may return before a detached write flushes (memory:
  synchronous-rsc-after-durability). The `log.*` functions are `async`; callers in
  async contexts `await` them.

## 5. Design

### 5.1 The `lib/log` module

Files: `lib/log/serializeError.ts`, `lib/log/requestContext.ts`,
`lib/log/types.ts`, `lib/log/persist.ts`, `lib/log/logger.ts`, `lib/log/index.ts`.

```ts
// types.ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  /** REQUIRED. Emitting surface, e.g. "auth/requireAdmin", "cron/sync". */
  source: string;
  /** Optional free-form event code (NOT §12.4-gated — never rendered to a user). */
  code?: string;
  showId?: string | null;
  driveFileId?: string | null;
  /** Usually auto-filled from ALS; explicit override allowed. */
  requestId?: string | null;
  /** PII-safe: an ALREADY-hashed actor (hashForLog). Logger never accepts raw email. */
  actorHash?: string | null;
  /** Serialized via serializeError into context.error. */
  error?: unknown;
  /** Force-persist an info line that has no code. */
  persist?: boolean;
  /** Any additional structured context. MUST NOT contain raw emails (see §5.7). */
  [key: string]: unknown;
}

export interface LogRecord {
  level: LogLevel;
  message: string;
  source: string;
  code: string | null;
  requestId: string | null;
  showId: string | null;
  driveFileId: string | null;
  actorHash: string | null;
  context: Record<string, unknown>; // reserved keys stripped; error serialized in
}
```

```ts
// serializeError.ts — promoted + generalized from app/auth/callback/route.ts:77-81
export function serializeError(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : String(error);
}
```

**Logger behaviour** (`logger.ts`):

- `log.error/warn/info/debug(message: string, fields: LogFields): Promise<void>`.
- Builds a `LogRecord`: merges `getRequestContext()` (ALS) for `requestId`/`showId`
  when not explicitly passed; strips reserved keys from `...context`; if
  `fields.error` present, sets `context.error = serializeError(fields.error)`.
- **Console (always, synchronous, first):**
  `console[consoleMethodFor(level)]("[" + source + "] " + message, compact(record))`
  where `consoleMethodFor` maps debug→`debug`, info→`info`, warn→`warn`,
  error→`error`, and `compact` omits null/undefined fields.
- **Persistence threshold (decision):** persist to `app_events` iff
  `level === "error" || level === "warn" || (level === "info" && (code != null || persist === true))`.
  `debug` **never** persists. (Rationale: bound DB volume to meaningful events;
  Vercel logs still see everything; debug is dev/console-only.)
- **Sink seam for tests:** the logger writes through a module-level `Sink =
  (record: LogRecord) => void | Promise<void>`. Default sink = console + threshold
  DB persist. `setLogSink(sink)` / `resetLogSink()` let tests capture emitted
  records deterministically (used by the emission meta-test §5.6 and unit tests).
- The logger **never throws**: console is sync; the persist call is wrapped (§5.2).

### 5.2 `app_events` table + lockdown + persist sink

New migration `supabase/migrations/20260629000002_app_events.sql` (next lexical
slot after `20260629000001_agenda_extract_leases.sql`; renumber if `origin/main`
advances before merge). Idempotent forms throughout (apply-twice safe).

```sql
create table if not exists public.app_events (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  level         text not null check (level in ('info','warn','error')),
  source        text not null,
  message       text not null,
  code          text,
  request_id    text,
  show_id       uuid references public.shows(id) on delete set null,
  drive_file_id text,
  actor_hash    text,
  context       jsonb not null default '{}'::jsonb
);

create index if not exists app_events_occurred_at_idx on public.app_events (occurred_at desc);
create index if not exists app_events_request_id_idx  on public.app_events (request_id) where request_id is not null;
create index if not exists app_events_show_id_idx      on public.app_events (show_id, occurred_at desc);
create index if not exists app_events_level_idx        on public.app_events (level, occurred_at desc);
create index if not exists app_events_code_idx         on public.app_events (code, occurred_at desc) where code is not null;

-- Lockdown (AGENTS.md cross-cutting #1 / BL-ADMIN-POSTGREST-DML-LOCKDOWN), geocode_cache pattern:
revoke all on table public.app_events from public, anon, authenticated;
grant all privileges on table public.app_events to service_role;
alter table public.app_events enable row level security; -- no policy; service_role bypasses RLS
```

- **`level` CHECK** is `('info','warn','error')` only — `debug` never persists, so
  it is intentionally not an accepted value. Inline CHECK, no later ALTER, no
  transitional window (brand-new table).
- **`show_id … on delete set null`** (NOT `cascade` like `sync_log`/`admin_alerts`):
  a log must survive show deletion. `drive_file_id`/`context` retain forensic
  identity if the FK nulls.
- **No PostgREST access** (`revoke all`): Phase 2's admin UI reads via a
  service-role server component (admin-gated at the route), exactly like other
  admin data — not via PostgREST+RLS. This mirrors `geocode_cache` and keeps the
  posture maximally locked.
- **Register in `tests/db/postgrest-dml-lockdown.test.ts` `RPC_GATED_TABLES`**
  (`:135`), mirroring the `geocode_cache` row (`:403-411`): `closed_at` cites the
  exact `revoke all` line in the new migration; `selectAnon`/`selectAuthenticated`
  blocked; `postBody`/`rowFilter` per the harness. Layer-4 orphan reconciliation
  (`:715-818`) forces the registry row + REVOKE in the same commit.

**Persist sink** (`lib/log/persist.ts`):

```ts
export async function persistAppEvent(record: LogRecord): Promise<void> {
  try {
    const supabase = createSupabaseServiceRoleClient(); // lib/supabase/server.ts:79-93
    const { error } = await supabase.from("app_events").insert({
      level: record.level, source: record.source, message: record.message,
      code: record.code, request_id: record.requestId, show_id: record.showId,
      drive_file_id: record.driveFileId, actor_hash: record.actorHash,
      context: record.context,
    });
    if (error) {
      console.error("[log/persist] app_events write failed", { error: serializeError(error) });
    }
  } catch (e) {
    console.error("[log/persist] app_events write threw", { error: serializeError(e) });
  }
}
```

- Destructures `{ error }` (invariant 9); both returned-error and thrown paths
  degrade to console; **never rethrows**.
- **Single-writer guard:** a structural test asserts the only production
  `.from("app_events")` write site is `lib/log/persist.ts` (mirrors the
  no-inline-email-normalization guard), so the TS chokepoint stays the sole writer.

### 5.3 Retention / prune (bounds growth from day one)

In the same migration (SQL-body pg_cron, modeled on the bootstrap-nonces cleanup
cron `…/20260504000001_bootstrap_nonces_signing_key.sql:36`, not the `net.http_get`
jobs):

```sql
create or replace function public.prune_app_events(retain interval default interval '60 days')
  returns integer language sql security definer set search_path = public, pg_temp
as $$
  with deleted as (delete from public.app_events where occurred_at < now() - retain returning 1)
  select count(*)::int from deleted;
$$;
revoke all on function public.prune_app_events(interval) from public, anon, authenticated;
grant execute on function public.prune_app_events(interval) to service_role;

-- idempotent self-scheduling (guarded unschedule so re-apply is safe):
do $$ begin
  perform cron.unschedule('fxav_cron_prune_app_events')
    where exists (select 1 from cron.job where jobname = 'fxav_cron_prune_app_events');
  perform cron.schedule('fxav_cron_prune_app_events', '17 4 * * *',
    $body$ select public.prune_app_events(); $body$);
end $$;
```

- 60-day default retention. The `fxav_cron_` prefix matches the idempotent
  unschedule loop in `…/20260527000003_schedule_cron_jobs.sql:72-74`; because
  migrations apply in sequence, a full re-apply ends with the prune job present
  (that loop re-creates only its own jobs, then this later migration re-creates
  the prune job). The guarded `do $$` block also makes this migration idempotent
  applied alone.

### 5.4 Correlation: `AsyncLocalStorage` request context

`lib/log/requestContext.ts`:

```ts
import { AsyncLocalStorage } from "node:async_hooks";
interface RequestContext { requestId: string | null; showId?: string | null; }
const als = new AsyncLocalStorage<RequestContext>();
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T { return als.run(ctx, fn); }
export function getRequestContext(): RequestContext | undefined { return als.getStore(); }
export function deriveRequestId(headers: Headers): string {
  return headers.get("x-vercel-id") ?? crypto.randomUUID();
}
export function setRequestShowId(showId: string): void { const s = als.getStore(); if (s) s.showId = showId; }
```

- Node runtime everywhere (verified: no `runtime='edge'`) → ALS is safe.
- **Seeded only at the enumerated set** of API/cron **route handlers**, wrapping
  the whole handler body in `runWithRequestContext({ requestId: deriveRequestId(req.headers) }, () => …)`.
  Every seeded handler is one from which a **Phase-1 log can actually emit** (a §5.5
  tap fires there, or it invokes a tapped auth producer) — so no handler is seeded
  without a consumer:
  - Cron: `app/api/cron/sync/route.ts` (the `CONCURRENT_SYNC_SKIPPED` tap +
    geocode-cache taps fire inside `runScheduledCronSync`).
  - APIs: `app/api/admin/onboarding/scan/route.ts` (scan-throw + geocode taps),
    `app/api/report/route.ts` (`readCrewRoleFlags` tap),
    `app/api/admin/sync/[slug]/route.ts` and
    `app/api/admin/staged/[fileId]/apply/route.ts` (invoke `requireAdmin`),
    `app/api/auth/picker-bootstrap/route.ts` (invokes `validateGoogleSession`/`Identity`),
    `app/api/drive/webhook/route.ts` (geocode taps fire during per-show dispatch).
  - **Not seeded:** `cron/notify`, `cron/report-reaper` — no Phase-1 tap is
    reachable in them (their broader correlation waits for Phase 2's run-summary).
- The logger auto-attaches `requestId`/`showId` from ALS when not explicitly
  passed. **Outside the seeded set (incl. all RSC), `request_id` is `null`** —
  graceful, documented cap. `setRequestShowId` lets a handler enrich the context
  once it resolves a show (so downstream logs carry `show_id`).
- This is a **new pattern**; no `x-vercel-id`/ALS exists today.

### 5.5 Tapping the silent producers

Each tap is **additive**: it adds a `log.error`/`log.warn` at the detection point
and leaves the existing typed return/throw unchanged (invariant 9 preserved).

| Producer | Site | Emit |
| --- | --- | --- |
| `requireAdmin` `AdminInfraError` | `lib/auth/requireAdmin.ts` throws L165,180,190,213,225,230 | `log.error` `code:ADMIN_SESSION_LOOKUP_FAILED source:auth/requireAdmin` (before throw) |
| `isAdminSession` infra_error | `lib/auth/isAdminSession.ts:34,44,55` | `log.error` `code:ADMIN_SESSION_LOOKUP_FAILED source:auth/isAdminSession` |
| `validateGoogleIdentity` 500 | `lib/auth/validateGoogleIdentity.ts:50-54,78-82` | `log.error source:auth/validateGoogleIdentity` |
| `validateGoogleSession` 500 arms | `lib/auth/validateGoogleSession.ts:68-72,87-91,103-107` | `log.error source:auth/validateGoogleSession` (500 arms only; 403 = expected auth signal, not logged) |
| `adminEmails` infra | `lib/data/adminEmails.ts` throw sites | `log.error` `code:ADMIN_EMAILS_INFRA source:data/adminEmails` |
| onboarding-scan throw | `app/api/admin/onboarding/scan/route.ts:265-266` | `log.error source:admin/onboarding/scan` in the catch |
| `readCrewRoleFlags` catch | `app/api/report/route.ts:78-84` | `log.error code:ADMIN_SESSION_LOOKUP_FAILED source:api/report` |
| geocode-cache catches | `lib/geocoding/cache.ts:41-43,54-56,71-73,89-91` | `log.warn source:geocoding/cache` (best-effort; warn, not error) |
| cron `CONCURRENT_SYNC_SKIPPED` (missingShows) | `lib/sync/runScheduledCronSync.ts:2785-2795` | `log.info code:CONCURRENT_SYNC_SKIPPED source:cron/sync persist:true` (coded-info → persisted; makes hot-show backpressure queryable) |

- The five auth producers (rows 1–5) are the ones the **emission meta-test**
  (§5.6) pins. `validateGoogleSession`'s 403 arms are deliberately not logged
  (expected auth outcome, not infra) — preempts a reviewer flagging "missing
  emission" on the 403 path.

### 5.6 Emission meta-test (the structural defense)

Extend `tests/auth/_metaInfraContract.test.ts` (CREATES emission machinery; the
file currently asserts typed shape only). Reuse its hoisted `infraMock`
(`:62-93`). Add, per registered producer, an assertion that triggering the infra
fault **also emits a structured log** with the expected `level`/`code`:

- Install a capturing sink via `setLogSink` in `beforeEach`; `resetLogSink` in
  `afterEach`.
- For `isAdminSession`, `validateGoogleIdentity`, `validateGoogleSession` (500),
  `requireAdmin`/`requireAdminIdentity`, `adminEmails`: after the existing
  typed-shape assertion, assert the captured sink received `≥1` record with
  `level==='error'` and the producer's expected `code`/`source`.
- A registry-style list `INFRA_EMISSION_PRODUCERS` makes adding a future producer
  without an emission assertion fail (orphan check), mirroring the existing
  `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` orphan-walker (`:290-325`).

> Scope note for the reviewer: the "no test asserts emission today" claim is scoped
> to these meta-contract auth producers. Two unrelated tests already assert
> `console.error` (`tests/admin/resolveAlert.test.ts:251`,
> `tests/cross-cutting/verify-branch-protection.test.ts:288,316`) — neither is one
> of these producers.

### 5.7 PII contract

- The logger **never accepts a raw email**. PII enters only as `actorHash`, which
  callers compute via `hashForLog(canonicalEmail)` / `hmacWithHashForLogPepper`
  (`lib/email/hashForLog.ts:16-18,26-28`; module fails closed at boot if
  `HASH_FOR_LOG_PEPPER` < 32 chars, `:6,8-14`). Callers canonicalize first
  (hashForLog does not normalize).
- A **structural PII test** greps `lib/log` call sites and `persist.ts` to assert
  no `email`/`canonicalEmail`/raw-address field is passed/inserted (only
  `actorHash`). `lib/log` itself does **not** import `hashForLog` (no coupling;
  hashing is the caller's job), so `lib/log` adds no new boot-time pepper
  dependency.

## 6. Guard conditions (every input)

| Input | null/empty/odd | Behaviour |
| --- | --- | --- |
| `message` | empty string | logged as empty; never throws |
| `fields.source` | missing | TypeScript-required; tests assert presence |
| `fields.error` | `undefined` | no `context.error` key added |
| `fields.error` | non-Error (string/number/object) | `serializeError` → `String(error)` |
| `fields.showId`/`driveFileId` | null/undefined | column NULL; omitted from console compact |
| `requestId` (explicit) | null | falls back to ALS; if ALS absent → NULL |
| ALS store | absent (RSC / unseeded route) | `request_id = NULL`, log still emits |
| `level` | `debug` | console only, never persisted |
| `level` | `info` without `code`/`persist` | console only, not persisted |
| persist insert | DB error or throw | console-degrade, returns; caller's error path unaffected |
| `context` | contains a function/circular | `JSON`-incompatible values are dropped/stringified by supabase-js; tested |
| show deletion | FK row removed | `app_events.show_id` set NULL (event retained) |
| `HASH_FOR_LOG_PEPPER` | unset/<32 | unchanged existing boot-fail (logger does not add a new dependency) |

## 7. Numeric sweep

- console.* sites today: **93** (68 error / 18 warn / 6 log / 1 info). Phase 1
  migrates **0** of them (Phase 4 scope).
- Persistence threshold levels that persist: **error, warn**, plus **coded/forced
  info**. Non-persisting: **debug**, **bare info**.
- `level` CHECK accepts exactly **3** values: `info`, `warn`, `error`.
- Indexes on `app_events`: **5**.
- ALS-seeded entry points: **7** route handlers (1 cron + 6 API). `cron/notify`
  and `cron/report-reaper` deliberately excluded (no Phase-1 emitter).
- Silent producers tapped: **9** rows (§5.5); emission-meta-pinned: **5**.
- Retention default: **60** days. Prune cron: **1** (`fxav_cron_prune_app_events`, `17 4 * * *`).
- New migration number: **20260629000002** (renumber if main advances).
- Out-of-scope phases: **3** (UI+cron-summary; Sentry; alerting+console-migration).

## 8. Flag / column lifecycle table

| Column/flag | Storage | Write path | Read path (Phase 1) | Effect |
| --- | --- | --- | --- | --- |
| `app_events.level` | table | `persist.ts` insert | SQL | gates banner/severity later |
| `app_events.code` | table | `persist.ts` | SQL | forensic grouping; **not UI-rendered** → not §12.4-gated |
| `app_events.request_id` | table | `persist.ts` from ALS | SQL | cross-surface correlation |
| `app_events.show_id` | table | `persist.ts` | SQL | per-show timeline (Phase 2) |
| `app_events.actor_hash` | table | `persist.ts` | SQL | PII-safe actor attribution |
| `app_events.context` | table | `persist.ts` | SQL | structured detail |
| `fields.persist` | TS only | logger threshold | n/a | force-persist a code-less info line |
| `prune_app_events()` | function | pg_cron daily | n/a | bounds growth (60d) |

No zombie columns introduced (every column has a write path and a Phase-1 SQL read
path). `sync_log.duration_ms` remains a pre-existing zombie — explicitly untouched.

## 9. Test plan (TDD per task)

Each task: failing test → minimal impl → passing test → commit
(`feat(log):`/`test(log):`/`feat(db):` scopes).

1. **`serializeError`** — unit: Error → `{name,message,stack}`; non-Error →
   `String`; `undefined`/null handled. Failure caught: hand-rolled serializers
   diverge.
2. **`requestContext` ALS** — unit: `runWithRequestContext` makes
   `getRequestContext()` visible inside sync + async + `Promise.all`; absent store
   → `undefined`; `deriveRequestId` prefers `x-vercel-id` else a UUID;
   `setRequestShowId` mutates the active store only.
3. **logger core + threshold** — unit (capturing sink): console method per level;
   reserved keys stripped into columns; `error` serialized into `context.error`;
   persist iff error/warn/coded-info/forced-info; debug+bare-info never persist;
   ALS `requestId`/`showId` auto-merged; explicit overrides win. Derive expected
   persistence from a level×code×persist matrix, not hardcoded.
4. **persist sink** — unit (mock service-role client): inserts mapped columns;
   `{error}` returned → console-degrade, no throw; thrown → caught, no throw.
   Failure caught: a persist error masking the caller's error.
5. **migration `app_events`** — apply locally; assert table/columns/indexes/CHECK
   exist; `revoke all` present; RLS enabled; `prune_app_events` deletes only rows
   older than `retain`; cron job registered. Regen `pnpm gen:schema-manifest`,
   commit manifest, apply to validation surgically.
6. **postgrest-dml-lockdown registry** — add `app_events` row; Layers 1–4 pass
   (anon/authenticated POST/PATCH/DELETE → 403/401 PG 42501; orphan reconciliation
   green). Failure caught: table-direct writes bypassing the chokepoint.
7. **single-writer guard** — structural: only `lib/log/persist.ts` does
   `.from("app_events")` insert in production source.
8. **PII guard** — structural: no `lib/log` call/insert passes a raw email field.
9. **tap producers** (one test per row in §5.5) — trigger each fault via its
   existing fault-injection path; assert the typed result/throw is unchanged AND a
   record with the expected `level`/`code`/`source` is emitted (capturing sink).
10. **emission meta-test** — extend `_metaInfraContract.test.ts`: each registered
    auth producer emits on fault; `INFRA_EMISSION_PRODUCERS` orphan check fails if
    a producer lacks an emission assertion. Negative-regression: deleting a tap
    makes the meta-test fail.
11. **correlation end-to-end** — for one seeded route (`api/report`): a request
    with a known `x-vercel-id` produces an `app_events` row whose `request_id`
    equals it; an unseeded context yields `request_id = null`.

## 10. Meta-test inventory

- **EXTENDS** `tests/auth/_metaInfraContract.test.ts` — adds emission assertions +
  `INFRA_EMISSION_PRODUCERS` orphan check (§5.6).
- **EXTENDS** `tests/db/postgrest-dml-lockdown.test.ts` — registers `app_events` in
  `RPC_GATED_TABLES` (§5.2).
- **CREATES** `tests/log/_metaAppEventsWriter.test.ts` — single-writer + PII guard
  (§5.2, §5.7).
- **No** `admin_alerts` catalog / sentinel / advisory-lock meta-test applies (no
  new admin-alert code, no tile, no new lock holder).

## 11. Advisory-lock holder topology

Phase 1 **adds no advisory-lock holders.** The tapped sites (`requireAdmin`,
`runScheduledCronSync` `missingShows` branch, onboarding scan) emit a log; the
persist insert is a **lock-free** service-role write on `app_events` (a table in no
existing lock's mutation set) and does **not** acquire any `pg_advisory*` lock, so
the single-holder rule (invariant 2) is untouched. The cron tap emits **outside**
the `show:`-locked transaction (the `missingShows` skip branch already returned
before any lock was held — `lockedShowTx.ts:77-79`). `tests/auth/advisoryLockRpcDeadlock.test.ts`
is unaffected and unchanged.

## 12. Files touched

**New:** `lib/log/{serializeError,requestContext,types,persist,logger,index}.ts`;
`supabase/migrations/20260629000002_app_events.sql`;
`tests/log/*` (serializeError, requestContext, logger, persist, correlation,
_metaAppEventsWriter); `supabase/__generated__/schema-manifest.json` (regen).

**Edited (taps + ALS seeding):** `lib/auth/requireAdmin.ts`,
`lib/auth/isAdminSession.ts`, `lib/auth/validateGoogleIdentity.ts`,
`lib/auth/validateGoogleSession.ts`, `lib/data/adminEmails.ts`,
`lib/geocoding/cache.ts`, `lib/sync/runScheduledCronSync.ts`,
`app/api/cron/sync/route.ts`,
`app/api/admin/onboarding/scan/route.ts`, `app/api/report/route.ts`,
`app/api/admin/sync/[slug]/route.ts`, `app/api/admin/staged/[fileId]/apply/route.ts`,
`app/api/auth/picker-bootstrap/route.ts`, `app/api/drive/webhook/route.ts`;
`app/auth/callback/route.ts` (replace local `errorLogValue` with
`serializeError`); `tests/auth/_metaInfraContract.test.ts`,
`tests/db/postgrest-dml-lockdown.test.ts`.

## 13. Resolved decisions

1. **Direct service-role insert, no `log_app_event` RPC** — `geocode_cache`
   precedent; service_role already bypasses RLS so an RPC adds surface with no
   security gain. Lockdown via `revoke all`.
2. **`revoke all` (no PostgREST), not admin-SELECT-RLS** — Phase 1 has no UI;
   Phase 2 reads via service-role server components. Maximally locked; mirrors
   `geocode_cache`; avoids RLS-select registry complexity.
3. **Persistence threshold** = error+warn+coded/forced-info; debug+bare-info
   console-only. Bounds DB volume; Vercel logs remain the firehose.
4. **ALS at route handlers only; RSC correlation deferred** — Next's
   parallel-segment render makes layout-seeded ALS unreliable; bounded set avoids
   that class.
5. **`show_id on delete set null`** — logs outlive shows.
6. **No `no-console` rule / no 93-site migration in Phase 1** — keeps the
   foundation PR reviewable; Phase 4 owns the migration + lint enforcement.
7. **`app_events.code` is free-form, not §12.4-gated** — it is never rendered to a
   user (invariant 5 is a UI-rendering contract); codes are forensic strings.

## 14. Watchpoints (reviewer preempts — do not relitigate)

- **`app_events.code` vs §12.4 catalog:** intentionally free-form; invariant 5
  governs UI rendering, and nothing in Phase 1 renders `app_events` to a user
  (no UI until Phase 2). Cited: §5.1, §13.7.
- **`revoke all` vs admin-SELECT:** intentional (no UI in Phase 1); not a missing
  RLS policy. Cited: §5.2, §13.2.
- **`validateGoogleSession` 403 arms unlogged:** intentional — 403 is an expected
  auth outcome, not infra. Cited: §5.5.
- **"No emission test today":** scoped to the five meta-contract auth producers;
  two unrelated `console.error` assertions exist and are not counterexamples.
  Cited: §5.6.
- **No advisory-lock change:** persist is lock-free; cron tap is outside the
  `show:` lock. Cited: §11.
- **Sentry stays unwired / `console.*` unmigrated:** Phase 3 / Phase 4 scope, not
  omissions. Cited: §3.
- **Migration number `20260629000002`:** renumber only if `origin/main` adds a
  same-day migration before merge; must sort last lexically.
