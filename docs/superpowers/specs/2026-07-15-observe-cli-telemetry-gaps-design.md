# Observe CLI — Telemetry Read-Gap Fill (2026-07-15)

## 1. Goal

`pnpm observe` currently reads 4 surfaces (`app_events`, `admin_alerts`, cron health, `show_change_log`). Six telemetry-bearing tables the admin UI reads are unreachable from the CLI, forcing raw psql (discovered live: polling staged parse warnings mid-onboarding-wizard required hand-written SQL against `pending_syncs`). This spec adds six read-only commands and two ergonomics fixes.

Non-goals: no writes, no new tables/migrations, no UI changes, no new env-var names, no change to admin-UI filter parsing (`lib/admin/telemetryTypes.ts` `parseAppEventFilters` untouched).

## 2. New commands

All six follow the existing shape: one query module in `lib/observe/query/`, a formatter in `scripts/observe/format.ts`, an adapter branch in `scripts/observe.ts` `runObserve()` (`scripts/observe.ts:83`), flags parsed in `scripts/observe/args.ts` `parseObserveArgs()` (`scripts/observe/args.ts:40`). All accept `--json` and `--env local|validation|prod`; all DB commands pass through the `resolveTarget` guardrail (`scripts/observe/env.ts:11`). All list reads are bounded `.limit(clampLimit(limit, 100))` (clamp [1,500], `lib/observe/query/types.ts:11`) and ordered newest-first unless stated.

### 2.1 `staged` — pending_syncs (staged parses + warnings)

The headline gap: staged parse warnings mid-wizard.

- Table: `public.pending_syncs` (`supabase/migrations/20260501001000_internal_and_admin.sql:138`).
- SELECT (never the whole row — `parse_result` embeds the full parsed show payload including crew emails):
  `id, drive_file_id, parsed_at, staged_modified_time, source_kind, wizard_session_id, wizard_approved, warning_summary, last_finalize_failure_code, warnings:parse_result->warnings`
  The `warnings:parse_result->warnings` aliased jsonb projection keeps the rest of `parse_result` out of the wire response entirely.
- Flags:
  - `--session <uuid>` → `.eq("wizard_session_id", v)` (non-UUID dropped, same posture as `--show` in `scripts/observe/args.ts:82-83`)
  - `--file <driveFileId>` → `.eq("drive_file_id", v)` (capped via `cap()`, `scripts/observe/args.ts:27`)
  - `--warnings-only` → DB-side filter `.filter("parse_result->warnings", "neq", "[]")` applied BEFORE the row cap (a post-fetch filter could return `(no rows)` when the first page is all warning-free rows while matching rows sit beyond the limit — Codex R1 F2). Rows whose `parse_result` lacks a `warnings` key evaluate NULL ≠ `[]` → excluded, which is correct (no warnings). A non-array scalar passes the filter and renders count 0 via the §6 guard.
  - `--full` → print each warning through the single warning serializer (§5.1); default output prints `warning_summary` (already a human summary column) + warning count
  - `--since 1h|24h|7d|all` → `.gte("parsed_at", …)` via `sinceToHours` (`scripts/observe/args.ts:32`); default 24h
  - `--limit N`, `--reveal-email`, `--json`, `--env`
- Ordering: `parsed_at` desc.
- Default output row: `parsed_at  drive_file_id  source_kind  approved  warning_count  warning_summary(truncated)`.
- PII/redaction: `wizard_approved_by_email` is NOT selected by default; selected only when `--reveal-email` is passed (same PII carve-out + stderr warning as `alerts`, `scripts/observe.ts:110-112`). Each warning `message` and the `warning_summary` pass through `sanitizeIdentityString` (`lib/adminAlerts/sanitizeIdentityString.ts:50`) with `includePii` = `--reveal-email` — sheet-derived free text can contain names/emails. `code`/`severity`/`iso`/`field` are enum/date/identifier-shaped and pass through unsanitized (precedent: group-(A) resolution IDs are shape-validated, never sanitized — `lib/adminAlerts/projectIdentityContext.ts:7-11`, Codex F23: the token redactor corrupts identifier-shaped values).

### 2.2 `failures` — pending_ingestions (hard-fail queue)

- Table: `public.pending_ingestions` (`…001000_internal_and_admin.sql:185`).
- SELECT: `id, drive_file_id, drive_file_name, first_seen_at, last_attempt_at, attempt_count, last_error_code, last_error_message, last_warnings, wizard_session_id`.
- Flags: `--session <uuid>`, `--code <C>` (→ `.eq("last_error_code", v)`), `--since` (on `last_attempt_at`, default 24h), `--limit`, `--json`, `--env`.
- Ordering: `last_attempt_at` desc.
- Output row: `last_attempt_at  drive_file_id  attempt_count  last_error_code  drive_file_name(sanitized, truncated)`; `--json` adds `last_error_message` (sanitized) + `last_warnings` (array-guarded; each element through the §5.1 serializer).
- Redaction: `drive_file_name` and `last_error_message` are free text → `sanitizeIdentityString`. `last_error_code` is a code → raw.

### 2.3 `warnings` — shows_internal.parse_warnings (published shows)

Data-Quality parity for post-publish polling.

- Table: `public.shows_internal` (`…001000_internal_and_admin.sql:1`), FK `show_id → shows(id)` so the PostgREST embed works: SELECT `show_id, parse_warnings, shows(title, slug)` (embed pattern per `lib/observe/query/events.ts:17`).
- Flags: `--show <uuid>` (→ `.eq("show_id", v)`), `--limit`, `--json`, `--env`. No `--since` (shows_internal has no timestamp column).
- Ordering: none guaranteed by table; order by `show_id` for determinism. Warning-free rows are excluded DB-side and BEFORE the row cap: `.neq("parse_warnings", "[]")` (same false-empty-page rationale as §2.1 `--warnings-only`; NULL `parse_warnings` is excluded by `neq`, correct — no warnings).
- Output row: `show_title(slug)  warning_count`, then one line per warning: `severity  code  message` (fields via the §5.1 serializer).
- Redaction: warning `message` sanitized; `financials`/`raw_unrecognized` are NEVER selected.

### 2.4 `synclog` — sync_log (per-file sync history)

- Table: `public.sync_log` (`…001000_internal_and_admin.sql:221`). Column is `occurred_at` (NOT `created_at` — verified live).
- SELECT: `id, show_id, drive_file_id, status, message, parse_warnings, duration_ms, occurred_at`.
- Flags: `--show <uuid>` (→ `.eq("show_id", v)`), `--file <driveFileId>`, `--status <s>` (capped string, `.eq`), `--since` (on `occurred_at`, default 24h), `--limit`, `--json`, `--env`.
- Ordering: `occurred_at` desc.
- Output row: `occurred_at  drive_file_id  status  warning_count  duration_ms  message(sanitized, truncated)`.
- Guard: `parse_warnings` can be non-array jsonb (live validation data threw `cannot get array length of a scalar`). JS side: `Array.isArray(v) ? v.length : 0` for the count; `--json` emits the array mapped through the §5.1 serializer when it is an array, else `[]` (never the raw jsonb value).

### 2.5 `deferred` — deferred_ingestions

- Table: `public.deferred_ingestions` (`…001000_internal_and_admin.sql:250`).
- SELECT: `id, drive_file_id, wizard_session_id, deferred_kind, deferred_at, deferred_at_modified_time, reason` — plus `deferred_by_email` ONLY when `--reveal-email`.
- Flags: `--limit`, `--reveal-email`, `--json`, `--env`.
- Ordering: `deferred_at` desc.
- Output row: `deferred_at  drive_file_id  deferred_kind  reason(sanitized, truncated)`.
- Redaction: `deferred_by_email` is raw email (PII) → behind `--reveal-email` with the stderr warning; `reason` free text → sanitized.

### 2.6 `watch` — drive_watch_channels (Drive push health)

- Table: `public.drive_watch_channels` (`…001000_internal_and_admin.sql:284`).
- SELECT: `id, status, watched_folder_id, resource_id, expires_at, created_at, activated_at, superseded_at, stopped_at`.
- **`webhook_secret` is NEVER selected. This is a hard invariant** — it is a live shared secret; a structural test pins that the module's SELECT string does not contain `webhook_secret` and does not select `*`.
- Flags: `--limit` (default 100 clamp; channel count is small in practice), `--json`, `--env`. No other filters.
- Ordering: `created_at` desc.
- Output row: `status  id  watched_folder_id  expires_at  created_at`.
- Redaction: all selected columns are identifier/timestamp/enum-shaped → no sanitizer (identifier precedent above). No PII in selected columns.

### 2.7 Command × concern matrix

| Command | Table | Bounded read | UNBOUNDED_TABLES member | Free-text sanitized | PII gate (`--reveal-email`) | Secret excluded |
| --- | --- | --- | --- | --- | --- | --- |
| `staged` | pending_syncs | `.limit(clamp)` | YES → register | warning messages, warning_summary | wizard_approved_by_email | parse_result (full payload) never selected wholesale |
| `failures` | pending_ingestions | `.limit(clamp)` | YES → register | drive_file_name, last_error_message, last_warnings messages | — (no email column) | — |
| `warnings` | shows_internal | `.limit(clamp)` | NOT added (see §7 — heuristic false-positives on existing UI reads) | warning messages | — | financials, raw_unrecognized never selected |
| `synclog` | sync_log | `.limit(clamp)` | add to UNBOUNDED_TABLES | message, warning messages | — | — |
| `deferred` | deferred_ingestions | `.limit(clamp)` | add to UNBOUNDED_TABLES | reason | deferred_by_email | — |
| `watch` | drive_watch_channels | `.limit(clamp)` | add to UNBOUNDED_TABLES | — | — | webhook_secret NEVER selected (structural pin) |

## 3. Ergonomics fixes

### 3.1 `--env validation` auto-resolution

Today `--env validation` fails unless the caller manually exports `SUPABASE_URL`/`SUPABASE_SECRET_KEY`, even though `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` sit in the main checkout's `.env.local` (the observe entry never loads `.env.local`; local runs only work because `createSupabaseServiceRoleClient` falls back to `http://127.0.0.1:54321` + the demo key, `lib/supabase/server.ts:79-88`).

Design:

1. The CLI **entry path** (`isEntry` block, `scripts/observe.ts:154`) calls `loadValidationEnv()` (`scripts/lib/validation-env.ts:46`) before building deps. That helper already exists, reads `<cwd>/.env.local`, makes `VALIDATION_*` keys authoritative over inherited env, keeps inherited-wins for everything else, and is a no-op when the file is absent (CI). Reused, not reimplemented. `runObserve()` itself stays pure (tests inject `deps.env`).
2. `resolveTarget` gains validation auto-mapping: when `--env validation` and `ambient.VALIDATION_SUPABASE_URL` is set (non-loopback) and `ambient.VALIDATION_SUPABASE_SECRET_KEY` is set, resolve to those values. Return type gains the resolved pair: `{ kind: "ok"; envName; url?: string; key?: string }`; the entry assigns them to `process.env.SUPABASE_URL` / `process.env.SUPABASE_SECRET_KEY` before any query runs (`createSupabaseServiceRoleClient` reads `process.env` at call time, `lib/supabase/server.ts:79-80`).
3. Precedence for `--env validation`: `VALIDATION_*` pair (when both present) WINS over ambient `SUPABASE_URL` — same authoritative-source rationale as `loadValidationEnv` (a stale exported `SUPABASE_URL` must not beat the documented canonical source). When `VALIDATION_*` is absent/incomplete, current behavior is unchanged (require non-loopback ambient `SUPABASE_URL` + secret key, else the existing error strings).
4. `--env prod` behavior is byte-for-byte unchanged (no `PROD_*` vars exist; ambient-only). `--env local` unchanged: non-loopback ambient `SUPABASE_URL` still refused (`scripts/observe/env.ts:19-25`). No new env-var names introduced (AGENTS.md telemetry contract).

Guard conditions: `VALIDATION_SUPABASE_URL` set but loopback → treated as absent (falls through to ambient path). Only one of the pair set → falls through to ambient path (and the ambient path's existing error message fires if ambient is also unusable; error text extended to mention the `VALIDATION_*` option: `--env validation requires VALIDATION_SUPABASE_URL + VALIDATION_SUPABASE_SECRET_KEY in .env.local, or a non-local SUPABASE_URL`).

### 3.2 `--code` / `--source` comma lists

`--level` already splits on commas (`scripts/observe/args.ts:76-81`); `--code`/`--source` are single-value (`.eq`, `lib/observe/query/events.ts:62-63`). Fix:

- `parseObserveArgs` splits `--code`/`--source` on commas, trims, drops empties, caps each token via `cap()`. Single token → existing singular filter fields (`code`, `source`) so every existing call site and test is untouched. Multiple tokens → new plural fields.
- `AppEventFilters` (`lib/admin/telemetryTypes.ts`) gains optional `codes?: string[]` and `sources?: string[]`. `queryEvents` applies `.in("code", codes)` / `.in("source", sources)` when plural fields are present; singular fields keep `.eq`. Setting both singular and plural of the same dimension is impossible from the CLI parser (it emits one or the other); `queryEvents` treats plural as taking precedence if both ever appear.
- `parseAppEventFilters` (admin UI, same file) is NOT modified — the plural fields are optional, so the admin surface compiles and behaves identically.
- `alerts --code` keeps single-value semantics (its filter type is `AlertFilters`; comma-list there is out of scope).
- `staged`/`failures`/`synclog` new-command flags are single-value in v1 (YAGNI; the comma-list fix targets the `events`/`tail` surface where it bit in practice).

## 4. Architecture

```
lib/observe/query/
  staged.ts        queryStagedParses(filters) → { kind:"ok"; rows: StagedParseRow[] } | { kind:"infra_error"; message }
  failures.ts      queryIngestFailures(filters)
  warnings.ts      queryPublishedWarnings(filters)
  syncLog.ts       querySyncLog(filters)
  deferred.ts      queryDeferred(filters)
  watch.ts         queryWatchChannels(filters)
  types.ts         + new filter/row types (existing file)
  index.ts         + re-exports
scripts/observe/
  args.ts          + new commands, flags, comma-list split
  format.ts        + one formatter per command
  env.ts           + validation auto-map in resolveTarget
scripts/observe.ts + adapter branches, USAGE, loadValidationEnv() at entry
```

Every query module follows the `queryEvents` contract (`lib/observe/query/events.ts:56`): typed filter object in, discriminated `ok`/`infra_error` result out, `{ data, error }` destructured, returned-error vs thrown-error distinguished (invariant 9), `.select(…, { count: "exact" })` + `.limit()` bound, no `lib/log` import. `staged`, `deferred` accept `includePii` in their filter object (from `--reveal-email`) and — like `queryAlerts` (`lib/observe/query/alerts.ts:54`) — are the sole owners of their redaction.

Sanitizer import: `sanitizeIdentityString` lives in `lib/adminAlerts/` and imports nothing from `lib/log` (verified — `alerts.ts` already imports from that package inside the read core; the read-only meta-test passes today).

## 5. Redaction posture (consolidated)

Per the AGENTS.md telemetry contract: token-like substrings (hex/base64 ≥24 chars) ALWAYS redacted in sanitized fields regardless of flags; control/bidi/zero-width chars stripped; sanitized strings length-capped — all supplied by `sanitizeIdentityString` (`lib/adminAlerts/sanitizeIdentityString.ts:50`, TOKEN/EMAIL regexes at :34-35; the module is import-free — no `lib/log` exposure for the read core).

### 5.1 Warning serializer (single chokepoint)

`ParseWarning` carries free-text sibling fields beyond `message` — `rawSnippet?: string` (verbatim sheet text: can contain names, emails, phones, token-like values; `lib/parser/types.ts:20`), `blockRef.name` (sheet-derived block name), and `sourceCell` anchors. Sanitizing only `message` would leak these through every `--json` and `--full` path (Codex R1 F1).

One serializer, `serializeParseWarning(raw: unknown, opts: { includePii: boolean })` in `lib/observe/query/`, is the ONLY way a warning element reaches any output path (table, `--full`, `--json`, every command). It ALLOWLISTS:

- `severity` (enum-shaped, raw)
- `code` (code-shaped, raw)
- `message` → `sanitizeIdentityString`
- `iso` (date-shaped, raw), `field` (identifier-shaped, raw)

Everything else — `rawSnippet`, `blockRef`, `sourceCell`, unknown future fields — is DROPPED, never emitted (drop, not sanitize: anchors and snippets serve the admin UI deep-link feature, not CLI polling; dropping is the smaller surface). Non-object elements serialize to `{ severity: "", code: "", message: "" }`. This applies identically to `parse_result->warnings` (staged), `last_warnings` (failures), `shows_internal.parse_warnings` (warnings), and `sync_log.parse_warnings` (synclog) — all four are the same `ParseWarning` jsonb shape. Unit tests feed a warning whose `rawSnippet` contains an email + a 30-char token and assert neither substring appears anywhere in `--json` or `--full` output, with `--reveal-email` both on and off.

- Sanitize: free-text fields only (warning messages, `warning_summary`, `drive_file_name`, `last_error_message`, sync_log `message`, `reason`).
- Never sanitize: identifier/enum/timestamp-shaped columns (`drive_file_id`, `wizard_session_id`, codes, statuses, `watched_folder_id`, `resource_id`, ISO dates) — the token redactor corrupts long Drive IDs (44-char base64-alphabet), and these columns are non-PII identifiers already printed raw by existing commands (`events` prints `drive_file_id` raw today via `lib/observe/query/events.ts:17`).
- Email columns (`wizard_approved_by_email`, `deferred_by_email`): excluded from the SELECT by default; included only under `--reveal-email`, which also prints the existing PII stderr warning (`scripts/observe.ts:110-112`). Note this is deliberately STRONGER than the alerts posture (which selects context and redacts in-process): for plain email columns we can simply not fetch them.
- Secrets: `webhook_secret` never selected (structural pin); `parse_result` never selected wholesale (aliased `->warnings` projection only); `financials`, `raw_unrecognized`, `before_image`/`after_image` untouched (`queryChangeLog` posture unchanged).

## 6. Guard conditions

| Input | Behavior |
| --- | --- |
| `--session` / `--show` non-UUID | filter dropped (matches existing `--show` posture, `scripts/observe/args.ts:82-83`) |
| `--file` / `--status` / `--code` empty or >200 chars | dropped via `cap()` (`scripts/observe/args.ts:27-31`) |
| `--limit` NaN / <1 / >500 | `clampLimit` default 100, clamp [1,500] (`lib/observe/query/types.ts:11`) |
| `parse_warnings` / `last_warnings` / `parse_result->warnings` non-array jsonb (scalar/null/object) | count 0; `--full`/`--json` emit `[]`; never throws (live-verified failure mode) |
| warning element missing `message`/`code`/`severity`, or non-object element | §5.1 serializer emits empty strings for missing members; row still printed |
| `--warnings-only` / `warnings` DB-side non-empty filter with non-array scalar `parse_warnings` | row passes the `neq "[]"` filter, renders count 0 via the array guard |
| jsonb projection returns `null` (`parse_result` lacks `warnings` key) | treated as `[]` |
| 0 rows | `(no rows)` matching existing formatter behavior |
| `deferred_at_modified_time` / `resource_id` / `expires_at` null | printed as `-` in table output, `null` in `--json` |

## 7. Testing

- **Unit tests per query module** (`tests/observe/`): mocked builder chain; assert SELECT string (including that `staged` uses the aliased `->warnings` projection and that `watch`'s SELECT excludes `webhook_secret`), filter application, bound, `{data,error}` handling, non-array jsonb guards, sanitizer/serializer application to exactly the free-text fields (anti-tautology: feed a warning whose `message` AND `rawSnippet` contain a 30-char token + an email; assert the token never appears in any output regardless of `--reveal-email`; the email appears in `message` only with `--reveal-email`; nothing from `rawSnippet` ever appears — §5.1).
- **Structural**:
  - `tests/observe/_metaReadOnlyQueryCore.test.ts` is a recursive filesystem walk (`:12-20`) — auto-covers all six new modules, no edit needed (the `>= 5` floor still passes).
  - `tests/admin/_metaBoundedReads.test.ts` — add all six modules to `READ_MODULES` (`:30`); `pending_syncs`/`pending_ingestions` are already in `UNBOUNDED_TABLES` (`:51`); add `sync_log`, `deferred_ingestions`, `drive_watch_channels` to `UNBOUNDED_TABLES` (grep-verified: no currently registered module reads them). `shows_internal` is deliberately NOT added: two registered reads (`components/admin/Dashboard.tsx:352` — `.in("show_id", activeShowIds)`, parent-bounded by the active-show list; `app/admin/show/[slug]/page.tsx:335` — `.maybeSingle()`) are genuinely bounded but unrecognized by the meta-test's bound heuristic (`:81-84` accepts only `.limit`/`.range`/`count:'exact'`/`.in("drive_file_id"|"id")`), and patching them would touch UI files (invariant-8 gate) for zero behavior change. The new `warnings.ts` read carries `.limit(clampLimit(…))` regardless, enforced by its unit test.
  - New structural pin: `watch` module file must not contain `webhook_secret` in any SELECT and must not call `.select("*")` (simple lexical test in the module's unit test file, justified by the secret's blast radius).
- **Args tests**: comma-list split for `--code`/`--source` (single → singular field, multi → plural, empties dropped); new command flags; `--reveal-email` plumbing into staged/deferred filters.
- **Env tests** (`resolveTarget`): validation auto-map matrix — both `VALIDATION_*` set (non-loopback) → ok+mapped, wins over ambient; one missing → ambient fallback; both missing + ambient loopback → error mentioning `VALIDATION_*`; prod path unchanged; local path unchanged.
- **Meta-test inventory (declared per AGENTS.md writing-plans additions)**: EXTENDS `tests/admin/_metaBoundedReads.test.ts` (registry rows + UNBOUNDED_TABLES rows); RELIES ON `tests/observe/_metaReadOnlyQueryCore.test.ts` (auto-walk, no edit); CREATES the `webhook_secret`-exclusion lexical pin. Advisory-lock topology: N/A — zero `pg_advisory*` surfaces touched (read-only feature). Mutation-surface observability (invariant 10): N/A — zero new mutation surfaces.
- Manual verification: run `staged --session 8e5568a8-b3cd-4033-9840-18cba07a55c6 --env validation` against the live validation project (7 rows, 14 warnings total as of 2026-07-15).

## 8. Documentation lockstep

- `USAGE` string in `scripts/observe.ts:135` gains the six commands + new flags.
- AGENTS.md "Telemetry access (observe CLI)" command table updated in the same PR (it enumerates commands/flags and currently lists 6 commands; after this change 12).
- No §12.4 catalog changes (no new user-visible error codes; CLI infra errors are plain strings per existing `fail()` posture, `scripts/observe.ts:22`).

## 9. Out of scope

- Comma lists for `alerts --code` and for the six new commands' flags.
- `tail --follow` equivalents for the new surfaces.
- Reading `onboarding_scan_manifest`, `sync_audit`, `app_settings`, `reports` (no polling need identified; `sync_audit` and `reports` carry higher PII surface).
- Any write path, any migration, any admin-UI change.

## 10. Numeric/consistency sweep anchors

Single sources of truth referenced throughout: limit clamp **[1,500] default 100** (`clampLimit`); `--since` default **24h** (`sinceToHours`); new commands: **6**; ergonomics fixes: **2**; total observe commands after change: **12** (events, alerts, cron, changes, codes, tail + staged, failures, warnings, synclog, deferred, watch).
