# Telemetry Access Layer (read-only CLI + read-core) — Design

**Date:** 2026-07-03
**Slug:** `telemetry-access-layer`
**Status:** Design (autonomous-ship pipeline)
**Scope:** Non-UI (`lib/`, `scripts/`, `tests/`, docs). No DB migration. No mutations. Read-only.

---

## 1. Problem & goal

The project already emits rich telemetry into Postgres — the `app_events` structured
log, `admin_alerts`, cron-run summaries, and the `show_change_log` audit trail — but the
**only** way to read it is the admin web UI at `/admin/observability`
(`app/admin/observability/page.tsx`, being renamed to `/telemetry` in a parallel session).
Devs at a terminal, in-repo coding agents (Claude Code / Codex), and future remote agents
have no sanctioned programmatic path; today they hand-roll raw SQL and re-derive the
`app_events` schema each session.

**Goal:** a single canonical, read-only telemetry access layer that any dev or agent can
tap reliably. Two properties define "reliably":

1. **Stable interface** — one schema-aware module is the only thing that knows the tables;
   adapters (the CLI now, MCP/API later) never drift when a column moves.
2. **Discoverability** — agents use the sanctioned path (documented in a skill + AGENTS.md)
   instead of reinventing raw SQL.

This is **Approach 1** of the brainstorm: build the read-core + CLI + doc-layer now; defer
the remote MCP/authed-API surface (consumer "C", arbitrary/remote sessions) to a follow-up
that wraps the same core.

### Non-goals (explicit, to preempt scope relitigation)

- **No mutations.** No acknowledge/resolve/re-sync. Read-only v1. (If actions are ever
  added they flow through existing RPCs, not this layer.)
- **No MCP server / no authed API route.** Deferred (consumer C). Filed conceptually for a
  follow-up; not in this spec.
- **No DB migration, no schema change, no new table/column/RPC.** This layer only reads
  existing tables.
- **No UI.** Nothing under `app/` (except nothing — no route added), `components/`,
  `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. Invariant 8 (impeccable
  dual-gate) is therefore **N/A**.

---

## 2. Architecture

Three layers; thin adapters over one core.

```
lib/observe/query/                 ← canonical read-core (the asset; single schema-aware surface)
  events.ts        queryEvents(filters)  — fresh no-log read over app_events; reuses PURE parseAppEventFilters
  alerts.ts        queryAlerts(filters)  — NEW list read over admin_alerts
  cronHealth.ts    getCronHealth()       — fresh no-log read over app_events per CRON_JOBS
  changeLog.ts     queryChangeLog(filters) — NEW list read over show_change_log
  types.ts         shared filter + result types (import pure types from observabilityTypes)
  index.ts         public surface — the ONLY sanctioned read entry point

scripts/observe.ts                 ← CLI adapter (pnpm observe …); arg-parse → core → format
  scripts/observe/args.ts          parseObserveArgs (pure; unit-testable, no DB/exit)
  scripts/observe/format.ts        table + json/ndjson renderers (pure)
  scripts/observe/env.ts           resolveTarget(env, argv) — --env guardrail (pure)

AGENTS.md  (new "Telemetry access" section) ← TRACKED source of truth (Claude + Codex)
.claude/skills/observe/SKILL.md    ← per-machine convenience, UNtracked (.claude/ is gitignored)
```

### 2.1 Boundary decisions

- **`lib/observe/query/` is the single schema-aware module.** The CLI, and any future
  MCP/API, import only from `lib/observe/query` (via `index.ts`). The existing admin UI keeps
  importing its own `lib/admin/*` loaders unchanged — we do **not** move those files (avoids
  collision with the parallel `/observability`→`/telemetry` rename).
- **The read-core issues its OWN fresh reads; it does NOT delegate to the logging loaders
  (Codex R2 HIGH).** `loadAppEvents`/`loadCronHealth` call `log.error` on a read fault
  (`lib/admin/loadAppEvents.ts:52,70`; `lib/admin/loadCronHealth.ts:52,63`), and that logger
  **persists an `app_events` row** (`lib/log/logger.ts` → `lib/log/persist.ts:14`). If the
  read-core re-exported them, `pnpm observe events` could **write** telemetry on an infra
  fault — violating read-only, and the `lib/observe/query/**` meta-test would give false
  assurance. So `queryEvents`/`getCronHealth` are **fresh, non-logging** implementations that
  reuse only the **pure, no-DB, no-log** pieces: `parseAppEventFilters`, `escapeIlike`,
  `PAGE_SIZE`, the `AppEvent*` types (`lib/admin/observabilityTypes.ts`), and the
  `CRON_JOBS`/`CRON_RUN_SUMMARY`/`CronJobSpec` spec + `CronHealthRow` type
  (`@/lib/cron/runSummary`, `observabilityTypes.ts`). On fault they return `infra_error`
  **without emitting any log/DB write.** This also makes the read-core fully independent of the
  `lib/admin` loaders (rename-insulated except for the pure type imports, a one-line fix).
- **The CLI holds zero schema knowledge** — only arg-parse, target selection, and output
  formatting. A schema change touches exactly one file in the read-core.
- **Read-only is now a HARD structural guarantee** — every read-core function issues only
  `.select(...)` and never calls the logger; the §7 meta-test asserts `lib/observe/query/**`
  contains no `.insert(`/`.update(`/`.delete(`/`.upsert(`/`.rpc(` **and** no import of
  `lib/log` (so no transitive write can re-enter).

### 2.2 Reuse map (what is existing vs new)

| Read-core fn | Backed by | New code? |
|---|---|---|
| `queryEvents` | fresh `.select` over `app_events`, reusing PURE `parseAppEventFilters`/`escapeIlike`/`PAGE_SIZE`/types (`lib/admin/observabilityTypes.ts:57,73`). Mirrors `loadAppEvents`' query (`lib/admin/loadAppEvents.ts:33`) but **without** its logging | **NEW** (no-log reimpl; see §2.1 Codex R2) |
| `getCronHealth` | fresh `.select` over `app_events` per `CRON_JOBS`/`CRON_RUN_SUMMARY` (`@/lib/cron/runSummary`), reusing `CronHealthRow` type. Mirrors `loadCronHealth` (`lib/admin/loadCronHealth.ts:35`) but **without** its logging | **NEW** (no-log reimpl) |
| `queryAlerts` | `admin_alerts` table (`supabase/migrations/20260501001000_internal_and_admin.sql:268`) | **NEW** — no list loader exists today (only head-count `fetchUnresolvedAlertCount`, `lib/admin/alertCount.ts`) |
| `queryChangeLog` | `show_change_log` table (`supabase/migrations/20260608000001_show_change_log.sql:7`) | **NEW** — `readShowChangeFeed` requires a showId, merges `sync_holds`, throws `SyncInfraError`; wrong contract for the CLI (optional show, no holds, union return) |

---

## 3. Read-core API (`lib/observe/query`)

All read functions return the project's established discriminated union
(matches `loadAppEvents`/`loadCronHealth`, `lib/admin/observabilityTypes.ts:30`):

```ts
type Ok<T>   = { kind: "ok" } & T;
type Infra   = { kind: "infra_error"; message: string };
```

Every function distinguishes returned-`{error}` from thrown per invariant 9, and is
registered in `tests/admin/_metaInfraContract.test.ts`.

### 3.1 `queryEvents(filters: AppEventFilters): Promise<QueryEventsResult>`

Fresh, non-logging read over `app_events` (§2.1). Reuses the pure `AppEventFilters`
(`lib/admin/observabilityTypes.ts:20-29`): `levels?, source?, code?, showId?, requestId?,
sinceHours?: 1|24|168|null, q?, cursor?`. Applies filters exactly as `loadAppEvents`
(`.in("level")`, `.eq`, `.gte("occurred_at")`, `.ilike("message", escapeIlike(q))`, keyset
`.or` cursor) and the same order (`occurred_at desc, id desc`) and `PAGE_SIZE = 100 + 1`
probe. Returns `{ kind:"ok"; events: AppEventRow[]; hasMore; nextCursor }` or `infra_error`.
`AppEventRow` (`:4-18`): `id, occurredAt, level, source, message, code|null, requestId|null,
showId|null, driveFileId|null, actorHash|null, context, showTitle|null, showSlug|null`.
`AppEventCursor = { occurredAt: string; id: string }` (`:19`).

**Single call returns ≤ `PAGE_SIZE = 100`** rows plus `hasMore`/`nextCursor`; there is no
per-call limit knob (mirrors the loader). `queryAlerts`/`queryChangeLog` (new code) take a
direct `.limit(n)`; only `events`/`tail` paginate.

**CLI pagination contract (Codex R1-a / R2 finding 2) — `collectEvents(base, limit)`:**
a pure helper the CLI uses to satisfy `--limit`. Preconditions: `1 ≤ limit ≤ 500`.

```
acc = []; cursor = base.cursor ?? null; pages = 0
loop:
  pages += 1
  r = await queryEvents({ ...base, cursor })
  if r.kind === "infra_error": return r            # surface fault, stop (exit 1 non-tail)
  acc.push(...r.events)
  # STOP conditions (any):
  if acc.length >= limit: return ok(acc.slice(0, limit))     # (a) reached limit
  if !r.hasMore: return ok(acc)                              # (b) drained
  if r.nextCursor == null: return ok(acc)                    # (c) no cursor → stop
  if r.events.length === 0: return ok(acc)                   # (e) empty page → stop
  if cursor != null && sameCursor(r.nextCursor, cursor): return ok(acc)  # (d) cursor did NOT advance past the one we just used → stop before re-requesting
  if pages >= 6: return ok(acc)                              # (f) hard page cap (500/100 + 1 safety)
  cursor = r.nextCursor                                      # advance
```

`sameCursor(a,b)` compares `(occurredAt,id)` tuples. Condition (d) compares `r.nextCursor`
against **`cursor` — the cursor used for THIS request** (Codex R3 HIGH — comparing against a
prior-prior cursor would let one repeated page slip through before detection). So a page that
returns the same cursor it was requested with stops the loop **before** any re-request, and
(c)–(f) together guarantee termination even if a loader regression or a stub returns
`hasMore:true` with a missing/repeated cursor or an empty page — the loop can never spin or
duplicate past the cap. Result is truncated to exactly `limit`.

### 3.2 `getCronHealth(): Promise<QueryCronHealthResult>`

Fresh, non-logging reimpl of `loadCronHealth` (no params). For each `CRON_JOBS` entry, reads
the latest `app_events` row where `code = CRON_RUN_SUMMARY` and `source = 'cron.'+jobName`
(`.order("occurred_at", desc).limit(1)`), then derives `outcome`/`counts` from
`context.outcome`/`context.counts` — identical logic to `loadCronHealth.ts:16-48` **minus the
`log.error` on fault** (which is what forced the fresh reimpl, §2.1). Returns
`{ kind:"ok"; jobs: CronHealthRow[] }` or `infra_error`. `CronHealthRow`
(`observabilityTypes.ts:35-45`): `jobName, label, description, cadence, staleAfterMs,
lastRunAt: string|null, outcome: CronRunOutcomeRead|null, level: AppEventLevel|null,
counts: Record<string,number>|null`.

### 3.3 `queryAlerts(filters: AlertFilters): Promise<QueryAlertsResult>` — NEW

`AlertFilters = { openOnly?: boolean; code?: string; limit?: number }`.
Query: `.from("admin_alerts").select("id, show_id, code, raised_at, last_seen_at,
occurrence_count, resolved_at, resolved_by, shows(title, slug)").order("raised_at",
{ ascending:false }).limit(limit)`. `openOnly` → `.is("resolved_at", null)`; `code` →
`.eq("code", code)`. Returns `{ kind:"ok"; alerts: AlertRow[] }` or `infra_error`.
There is **no** status enum — open = `resolved_at IS NULL`
(`supabase/migrations/20260501001000_internal_and_admin.sql:279`).

**`context` is deliberately NOT selected (Codex R1 HIGH).** Unlike `app_events.context`
(written post-`sanitizeContext`, email-redacted), `admin_alerts.context` is NOT guaranteed
redacted — existing producers store report/crew snippets there. Selecting it would widen the
`--env prod` surface to raw PII. v1 surfaces only the operational signal (code / show /
occurrence / raised / resolved). If a future consumer needs alert context, it is added
deliberately with its own redaction pass — not in this read-only layer.

### 3.4 `queryChangeLog(filters: ChangeLogFilters): Promise<QueryChangeLogResult>` — NEW

`ChangeLogFilters = { showId?: string; sinceHours?: number|null; limit?: number }`.
Query: `.from("show_change_log").select("id, show_id, drive_file_id, occurred_at, source,
change_kind, entity_ref, summary, status").order("occurred_at",{ ascending:false })
.limit(limit)`. `showId` → `.eq("show_id", showId)` (only if UUID-valid);
`sinceHours` (non-null) → `.gte("occurred_at", <now - hours>)`. Returns
`{ kind:"ok"; changes: ChangeRow[] }` or `infra_error`. Column set per
`supabase/migrations/20260608000001_show_change_log.sql:7-34`.

### 3.5 Guard conditions (per-input, mandatory checklist)

| Input | null / empty / invalid → behavior |
|---|---|
| `queryAlerts.limit` | `undefined` → default `100`; `<=0` or `NaN` → clamped to `1`; `>500` → clamped to `500` |
| `queryAlerts.code` | empty/whitespace → treated as absent (no `.eq`) |
| `queryChangeLog.showId` | non-UUID (fails a module-private `UUID_RE` in the read-core, same pattern as `lib/admin/observabilityTypes.ts:50` — that one is NOT exported, so we define our own; do not add an export to the shared file mid-rename) → treated as absent (no `.eq`), **not** an error |
| `queryChangeLog.sinceHours` | `undefined` → default `24`; `null` → no bound; `<=0`/`NaN` → default `24` |
| `queryChangeLog.limit` | same clamp as alerts (default 100, 1..500) |
| any query, empty result | `{ kind:"ok"; <rows>: [] }` — empty is success, never `infra_error` |
| returned `{ error }` | `{ kind:"infra_error"; message }` (distinct message per fn) |
| thrown | caught → `{ kind:"infra_error"; message }` (distinct message) |

---

## 4. CLI (`scripts/observe.ts`, `pnpm observe`)

Invocation pattern matches repo convention: `"observe": "tsx scripts/observe.ts"`
(package.json; no existing `observe`/`telemetry` script — confirmed absent). Arg-parsing via
Node builtin `parseArgs` from `node:util` (repo convention — no external CLI lib). Output via
`console.log`/`console.error`; `process.exit(0)` ok / `process.exit(1)` fault. Direct-run
guard (`import.meta.url === pathToFileURL(process.argv[1]).href`) so tests import
`parseObserveArgs`/formatters/`resolveTarget` without connecting or exiting.

### 4.1 Commands

```
pnpm observe events   [--show <uuid>] [--level info,warn,error] [--code <CODE>]
                      [--source <s>] [--request <id>] [--q <text>] [--since 1h|24h|7d|all]
                      [--limit <n>] [--json] [--env local|validation|prod]
pnpm observe alerts   [--open] [--code <CODE>] [--limit <n>] [--json] [--env …]
pnpm observe cron     [--json] [--env …]
pnpm observe changes  [--show <uuid>] [--since 1h|24h|7d|all] [--limit <n>] [--json] [--env …]
pnpm observe codes    [<CODE>]                      # OFFLINE — no DB, no --env
pnpm observe tail     [--follow] [--interval <s>] [<events filters…>] [--json] [--env …]
pnpm observe help | --help | (no args)              # usage
```

### 4.2 Flag → filter mapping

- `--level a,b` → CSV split, kept only if in `["info","warn","error"]` (mirrors
  `parseAppEventFilters`); invalid tokens dropped silently.
- `--since` → `1h`→1, `24h`→24, `7d`→168, `all`→null, else→24 (mirrors `since` parse at
  `observabilityTypes.ts:96-101`).
- `--show` → validated against the read-core's UUID guard; invalid → treated as absent (consistent with core
  guard). `--code`/`--source`/`--request`/`--q` → trimmed, dropped if empty or >200 chars
  (mirrors `capped()`).
- `--limit` → parsed int; clamp 1..500; default 100. For `events`/`tail` it caps the total
  rows the CLI accumulates across its keyset-pagination loop (§3.1); for `alerts`/`changes` it
  maps directly to the read-core `.limit(n)`. Invalid/NaN → default 100.
- `--open` (alerts) → `openOnly:true`; absent → all alerts.
- Unknown flags → usage error to stderr, exit 1.

### 4.3 Output

- **Default (human table):** aligned columns, truncated. `events`/`tail`:
  `occurredAt · level · code · source · message`. `alerts`: `raised_at · code · show ·
  occ · resolved?`. `cron`: `job · outcome · lastRunAt · stale?`. `changes`:
  `occurred_at · status · change_kind · show · summary`. Empty result → a single
  `(no rows)` line, exit 0.
- **`--json`:** raw rows as a JSON array (one `JSON.stringify` of `result.<rows>`), for
  agents. `infra_error` → JSON `{ "error": "<message>" }` on stderr, exit 1.
- **`tail --json`:** NDJSON — one JSON object per line as rows arrive (stream-friendly).

### 4.4 `observe codes` (offline discoverability)

Resolves a §12.4 code → its catalog copy **offline**, no DB. Reads `MESSAGE_CATALOG`
(`lib/messages/catalog.ts:13`, object keyed by code) via `messageFor`/`isMessageCode`
(`lib/messages/lookup.ts:91,95`).

- `observe codes <CODE>`: if `isMessageCode(CODE)` → print `title`, `severity`, `dougFacing`,
  `crewFacing`, `helpfulContext`, `helpHref`. If **not** a catalog code (e.g. a forensic /
  admin-log-only code, which are §12.4-scanner-exempt and legitimately absent from
  `MESSAGE_CATALOG`) → print `Code "<CODE>" is not in the message catalog (may be a forensic
  log-only code).` and exit 0 (not an error — absence is expected for forensic codes).
- `observe codes` (no arg): list all catalog code keys (from `MESSAGE_CATALOG`) with `title`,
  one per line.

### 4.5 `observe tail` (live poll)

Polls `queryEvents` on `--interval` seconds (default 5, clamp 1..60). `--follow` loops until
SIGINT; without `--follow`, one poll then exit.

**Dedup / cursor (in-memory only):** track a high-water key `(occurredAt, id)` and a bounded
`Set` of recently-printed ids (cap 1000, FIFO-evicted). Each poll fetches the latest page via
`queryEvents` (DESC), reverses to chronological, and prints rows whose `id` is unseen and
whose `(occurredAt, id)` sorts after the high-water key; then advances high-water.

**First poll** establishes the baseline: prints the most recent `--limit` rows (default 20 for
tail), then only genuinely new rows thereafter.

**Invariant-4 preempt:** this cursor is process-local and ephemeral — never persisted, never
written to `shows.last_seen_modified_time` or any `lastPollAt`. It is a display de-dup, wholly
unrelated to the sync system's per-show cursor. No global sync cursor is introduced.

**Guards:** SIGINT → flush, exit 0. `infra_error` mid-loop → print the error to stderr, keep
polling (transient DB blips shouldn't kill a long tail); non-`--follow` single poll returns
exit 1 on infra_error.

---

## 5. Environment / target model (`--env` guardrail)

The read-core uses `createSupabaseServiceRoleClient` (`lib/supabase/server.ts:79`), which
reads `process.env.SUPABASE_URL` (default `http://127.0.0.1:54321`) and
`SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY`. No new env-var names are invented; `--env`
is a **guardrail assertion** over the ambient `SUPABASE_URL`, resolved by a pure
`resolveTarget(env, argv)` (unit-testable via injected env).

| `--env` (default `local`) | Assertion | On mismatch |
|---|---|---|
| `local` | resolved `SUPABASE_URL` is loopback (`127.0.0.1`/`localhost`) **or unset** | if ambient `SUPABASE_URL` is non-loopback → **refuse**, exit 1: "refusing non-local target; pass --env validation\|prod to confirm" |
| `validation` \| `prod` | resolved `SUPABASE_URL` is non-loopback **and** present, and a service key is set | if unset/loopback → exit 1: "--env <e> requires SUPABASE_URL (non-local) and SUPABASE_SECRET_KEY" |

This prevents an ambient prod `SUPABASE_URL` (e.g. left in a shell) from silently pointing the
CLI at prod: local is the default and actively refuses a non-local ambient URL unless the
operator names the environment. `observe codes` never touches the DB, so it ignores `--env`.

**Redaction note (per-source, Codex R1 HIGH):**
- `app_events.context` — written post-`sanitizeContext` (email-redacted, JSON-safe,
  `lib/log/persist.ts`); safe to surface even against prod.
- `admin_alerts.context` — NOT guaranteed redacted → **not selected** by `queryAlerts` (§3.3).
- `show_change_log` — `queryChangeLog` selects `summary`/`change_kind`/`entity_ref`/`status`
  but NOT `before_image`/`after_image` (which can hold raw row snapshots). `summary` is the
  same admin-facing text the existing `/admin` Changes feed already renders, so it introduces
  no exposure beyond the current UI.

No CLI output path surfaces an un-redacted raw context/image blob.

---

## 6. Doc layer

**The committed, durable, cross-CLI deliverable is the AGENTS.md section** — `.claude/` is
gitignored on this repo (Codex R1 HIGH), so a skill file there is per-machine only and is NOT
a tracked artifact. The knowledge therefore lives in the repo, and the skill is a thin
per-machine convenience pointing at it (same status as the existing `impeccable`/`superpowers`
skills on this repo).

- **`AGENTS.md` new "Telemetry access (observe CLI)" section** (TRACKED — source of truth):
  the command table (§4.1), flag→filter mapping, the `--env` guardrail (default local; prod
  needs `--env prod` + exported creds), the per-source redaction posture (§5), and the
  read-only guarantee. This is what both Claude and Codex read. **This is a committed artifact
  and part of the definition of done.**
- **`.claude/skills/observe/SKILL.md`** (per-machine, UNtracked — best-effort): frontmatter
  `name: observe`, `description` triggering on telemetry/log/debugging intent; body = the
  canonical recipes ("errors for a show in the last hour", "is cron healthy", "open alerts",
  "explain a code", "live error feed") that point at the `pnpm observe` commands and defer to
  the AGENTS.md section for the durable copy. Created for convenience; **its absence in a fresh
  checkout is expected and breaks nothing** — the CLI + AGENTS.md stand alone. Not gating CI,
  not a merge blocker.

---

## 7. Testing (TDD per invariant 1)

**Meta-test inventory (mandatory declaration):**

- **CREATE** `tests/observe/_metaReadOnlyQueryCore.test.ts` — walks every file under
  `lib/observe/query/**` and asserts none contains `.insert(`/`.update(`/`.delete(`/
  `.upsert(`/`.rpc(` **and** none imports `lib/log` / `persistAppEvent` (Codex R2 HIGH — the
  no-import clause blocks the transitive-write path that a re-export would have reintroduced).
  Pins read-only structurally.
- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — add registry rows for **all four**
  read-core fns (`queryEvents`, `getCronHealth`, `queryAlerts`, `queryChangeLog`). Because
  events/cron are now **fresh reimpls** (not re-exports, §2.1), they are new Supabase call
  sites and each needs its own row proving returned-`{error}` and thrown both map to
  `infra_error`.
- **EXTEND** `tests/admin/_metaBoundedReads.test.ts` — explicitly register the
  `lib/observe/query/**` modules and their tables: the `admin_alerts` (`queryAlerts`),
  `show_change_log` (`queryChangeLog`), and `app_events` (`queryEvents`/`getCronHealth`) reads
  each carry a bound (`.limit(...)` / cron's `.limit(1)`). The existing test only scans two
  admin modules + a different table set, so the new modules must be added to its walk (Codex R2
  advisory).
- **No new row** in `tests/log/_metaAppEventsWriter.test.ts` — that guard walks
  `["app","lib","scripts"]` asserting only `lib/log/persist.ts` **writes** `app_events`; the
  read-core adds no `.insert`, so it must simply continue to pass (a regression check).

**Unit tests (mock Supabase client):**

- `queryEvents` / `queryAlerts` / `queryChangeLog` / `getCronHealth`: filter application
  (levels/openOnly/code/showId/sinceHours → correct builder calls), the three states (ok rows /
  returned `{error}`→infra_error / thrown→infra_error), empty→ok-empty, limit clamp boundaries,
  non-UUID showId dropped. **Failure mode caught:** a filter silently not applied, or an infra
  fault masked as ok.
- **No-write-on-fault (Codex R2 HIGH):** with a mock client whose read returns `{error}` AND
  one that throws, assert `queryEvents`/`getCronHealth` return `infra_error` **and never invoke
  the logger / `persistAppEvent`** (spy on `lib/log`). **Failure mode caught:** a reimpl that
  reintroduces the transitive `app_events` write on a failed read (the whole reason for the
  fresh no-log reimpl).
- `parseObserveArgs`: each flag → correct filter object; `--level` token filtering;
  `--since` mapping incl. `all`→null; `--limit` clamp; unknown-flag → error. **Failure mode:**
  a flag that parses to the wrong filter (e.g. `--since 7d` not mapping to 168).
- `collectEvents(base, limit)` pagination (§3.1): (a) two-page stub (`hasMore:true`→`false`)
  accumulates up to `--limit`; (b) `hasMore:true` with a **repeated/non-advancing** cursor →
  stops (condition d), no infinite loop; (c) `hasMore:true` with **null** nextCursor → stops
  (c); (d) empty page → stops (e); (e) `limit`=500 across ≥6 stub pages → truncates at 500 and
  stops at the page cap (f); (f) mid-loop `infra_error` → returns infra_error, stops.
  **Failure mode caught:** `--limit > 100` truncating to one page (Codex R1-a), or an infinite/
  duplicating loop on a non-advancing cursor (Codex R2 finding 2).
- `resolveTarget`: local default; ambient non-loopback URL without `--env` → refuse;
  `--env prod` with loopback/unset → error; `--env prod` with valid non-loopback + key → ok.
  **Failure mode:** accidental prod target from ambient env.
- `format`: table truncation, empty→`(no rows)`, `--json` array shape, `tail` NDJSON
  one-object-per-line. **Failure mode:** malformed JSON that agents can't parse.
- `observe codes`: known code → catalog copy (assert against `MESSAGE_CATALOG[code]`
  directly, **not** the rendered string, per anti-tautology); unknown/forensic code →
  graceful "not in catalog" + exit 0. **Failure mode:** crash or false-error on a forensic
  code.

**DB-backed integration test (`tests/observe/queryCore.db.test.ts`, real local Supabase —
avoids mocks-only tautological pass):**

- Seed one `app_events` row (via `persistAppEventStrict`), one `admin_alerts` (via
  `upsert_admin_alert` RPC), one `show_change_log` (insert with a seeded show); then
  `queryEvents`/`queryAlerts`/`queryChangeLog` read them back with the right filters.
  Derives expected values from the seeded fixtures (never hardcoded). Gated the same way
  other `.db.test.ts` run (skips cleanly if local Supabase is down).

---

## 8. Flag lifecycle (storage | write | read | effect)

| Flag | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `--level` | argv | `parseObserveArgs` | `queryEvents` filter | `.in("level",…)` |
| `--show` | argv | `parseObserveArgs` (UUID-guard) | events/changes filter | `.eq("show_id",…)` |
| `--since` | argv | `parseObserveArgs` (→hours) | events/changes filter | `.gte("occurred_at",…)` |
| `--code` | argv | `parseObserveArgs` | events/alerts filter | `.eq("code",…)` |
| `--source` | argv | `parseObserveArgs` (capped 200) | events filter | `.eq("source",…)` |
| `--request` | argv | `parseObserveArgs` (capped 200) | events filter | `.eq("request_id",…)` |
| `--q` | argv | `parseObserveArgs` (capped 200) | events filter | `.ilike("message", %escapeIlike(q)%)` |
| `--open` | argv | `parseObserveArgs` | alerts filter | `.is("resolved_at",null)` |
| `--limit` | argv | `parseObserveArgs` (clamp 1..500) | events/tail → `collectEvents` loop; alerts/changes → `.limit(n)` | caps rows returned |
| `--json` | argv | `parseObserveArgs` | formatter | JSON/NDJSON vs table |
| `--follow`/`--interval` | argv | `parseObserveArgs` | tail loop | poll cadence / loop |
| `--env` | argv | `resolveTarget` | env selection | target guardrail |

No zombie flags — every flag has a write, a read, and an output effect.

---

## 9. Disagreement-loop preempts (for reviewer)

Cite these to avoid relitigation:

1. **Read-only, no migration** — §1 non-goals. No schema change; all four read-core fns issue
   only `.select` and never log/write. The read-only meta-test (§7, no-write + no-`lib/log`)
   pins it.
2. **`tail` cursor is ephemeral, not a global sync cursor** — §4.5. Process-local, never
   persisted; does not touch `shows.last_seen_modified_time`/`lastPollAt`. Invariant 4 intact.
3. **`queryChangeLog` is new, not `readShowChangeFeed`** — §2.2. The existing feed reader
   requires a showId, merges `sync_holds`, and throws `SyncInfraError`; the CLI needs an
   optional-show, no-holds, union-returning read. Different contract by design.
4. **Forensic codes legitimately absent from `MESSAGE_CATALOG`** — §4.4. `observe codes` on a
   forensic/admin-log-only code prints a benign "not in catalog" and exits 0; this is correct,
   not a bug (those codes are §12.4-scanner-exempt).
5. **We do not move `lib/admin/*` loaders** — §2.1. The read-core is a fresh reimpl that only
   imports the pure types from `observabilityTypes`, so it is independent of the parallel
   `/observability`→`/telemetry` rename; moving the loaders would collide.
6. **Non-UI** — §1. Invariant 8 impeccable dual-gate N/A; this is a Codex/Opus non-UI change.
7. **The skill under `.claude/` is intentionally untracked** — §6. `.claude/` is gitignored;
   the durable deliverable is the AGENTS.md section. Do not flag "skill not committed" — that
   is by design; the CLI + AGENTS.md are self-sufficient.
8. **`events --limit` is CLI-side pagination via `collectEvents`** — §3.1. A single read is
   capped at `PAGE_SIZE=100`; the CLI follows `nextCursor` with explicit termination
   conditions (c)–(f). The asymmetry with `alerts`/`changes` (direct `.limit`) is intended.
9. **`queryEvents`/`getCronHealth` are fresh no-log reimpls, NOT re-exports** — §2.1 (Codex
   R2). Re-exporting `loadAppEvents`/`loadCronHealth` would let a failed read transitively
   `.insert` an `app_events` row via `log.error`, breaking read-only. The read-core reissues
   the same selects without logging; the §7 meta-test bans both direct writes and `lib/log`
   imports in `lib/observe/query/**`. Do not "simplify" back to a re-export.

---

## 10. Success criteria

- `pnpm observe events --show <uuid> --level error --since 1h` prints the matching rows (table);
  `--json` prints a parseable array.
- `pnpm observe cron` shows per-job health; `pnpm observe alerts --open` lists unresolved alerts.
- `pnpm observe codes WATCH_CHANNEL_ORPHANED` prints its catalog copy offline; a forensic code
  degrades gracefully.
- `pnpm observe tail --follow --level error` streams new error events live.
- `pnpm observe events --limit 250` returns up to 250 rows via CLI-side cursor pagination
  (≤3 loader calls); `queryAlerts`/`queryChangeLog` honor `--limit` directly.
- `pnpm observe events` against an ambient prod `SUPABASE_URL` without `--env prod` refuses.
- `queryAlerts` never emits `admin_alerts.context`; `queryChangeLog` never emits
  `before_image`/`after_image`.
- The tracked **AGENTS.md "Telemetry access" section** documents the command table, `--env`
  guardrail, and read-only guarantee (the durable cross-CLI deliverable).
- All meta-tests (§7) pass; read-only guard blocks any future write in the core.
- Full `pnpm typecheck` + `pnpm test` + `pnpm format:check` green; real CI green.
