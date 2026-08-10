# Telemetry access (observe CLI)

Extracted from `AGENTS.md` so it loads on demand instead of in every session. This file is canonical for its subject and carries the same authority as `AGENTS.md`; `AGENTS.md` links here. Applies to every agent harness working in this repo.

`pnpm observe <command> [flags]` is the read-only way to query telemetry without hand-rolling SQL. The schema-aware read-core lives in `lib/observe/query/**` (`queryEvents`, `getCronHealth`, `queryAlerts`, `queryChangeLog`, `queryStagedParses`, `queryIngestFailures`, `queryPublishedWarnings`, `querySyncLog`, `queryDeferred`, `queryWatchChannels`); `scripts/observe.ts` is the CLI adapter.

**Commands**

| Command    | Reads                  | Key flags                                                                                                                         |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `events`   | `app_events`           | `--show <uuid>` `--level info,warn,error` `--code C` `--source S` `--request R` `--q text` `--since 1h\|24h\|7d\|all` `--limit N` |
| `alerts`   | `admin_alerts`         | `--open` `--code C` `--limit N` `--reveal-email`                                                                                  |
| `cron`     | cron health            | (none)                                                                                                                            |
| `changes`  | `show_change_log`      | `--show <uuid>` `--since …` `--limit N`                                                                                           |
| `codes`    | message catalog        | `[CODE]` — offline, `--env` ignored                                                                                               |
| `tail`     | `app_events`           | `--follow` `--interval S` + all `events` filters                                                                                  |
| `staged`   | `pending_syncs`        | `--session <uuid>` `--file <driveId>` `--warnings-only` `--full` `--since 1h\|24h\|7d\|all` `--limit N` `--reveal-email`          |
| `failures` | `pending_ingestions`   | `--session <uuid>` `--code C` `--since 1h\|24h\|7d\|all` `--limit N` `--reveal-email`                                             |
| `warnings` | `shows_internal`       | `--show <uuid>` `--limit N` `--reveal-email`                                                                                      |
| `synclog`  | `sync_log`             | `--show <uuid>` `--file <driveId>` `--status S` `--since 1h\|24h\|7d\|all` `--limit N` `--reveal-email`                           |
| `deferred` | `deferred_ingestions`  | `--limit N` `--reveal-email`                                                                                                      |
| `watch`    | `drive_watch_channels` | `--limit N`                                                                                                                       |

All commands also accept `--json` and `--env local\|validation\|prod`. Flags map to filters like the admin UI's `parseAppEventFilters` (non-UUID `--show` and invalid `--level` tokens are dropped; `--since` default is 24h; `--limit` clamps to [1,500]).

**`--env` guardrail:** default target is `local`. A non-loopback ambient `SUPABASE_URL` is **refused** unless you pass `--env validation|prod` to confirm a remote target. `--env validation` resolves **exclusively** from a `VALIDATION_SUPABASE_URL` + `VALIDATION_SUPABASE_SECRET_KEY` + matching `VALIDATION_SUPABASE_PROJECT_REF` triple in `.env.local` (auto-loaded at CLI entry) — any missing or invalid member of that triple is a hard error, with no fallback to ambient `SUPABASE_URL`/`SUPABASE_SECRET_KEY`. Targeting an ambient remote directly requires `--env prod`, which requires a non-loopback `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`). No new env-var names are introduced.

**`synclog --show` attribution is resolved at the sink, not at read time.** `--show` filters `sync_log.show_id`, and each writer resolves that column from `drive_file_id` inside its own INSERT — `(select id from public.shows where drive_file_id = $1)`. Two consequences worth knowing before you read an empty result as health:

- A row written **before** its show existed carries `show_id IS NULL` permanently. Resolution happens once, at write time; it is not re-derived on read, and no backfill runs. Those rows are still reachable by `--file <driveId>`, which is the right query for a first-seen or failed-ingestion attempt.
- Rows written before 2026-08-09 all carry `show_id IS NULL`, because no writer populated the column — the probe that opened that work measured 5073 rows with `count(show_id) = 0`. `--file` reaches them; `--show` does not.

`duration_ms` is populated on the same terms: writers that own an attempt boundary record a wall-clock delta, and the writers listed in the sync-log attribution spec §3.3.1 (run-level emits, webhook direct-error classes) carry `NULL` because they describe no single attempt.

On the six new commands (`staged`/`failures`/`warnings`/`synclog`/`deferred`/`watch`), a present-but-invalid filter flag (e.g. a malformed `--session`/`--show` UUID, an out-of-catalog `--status`, or a `--since` token outside `1h|24h|7d|all`) is a CLI usage error (fail-closed), not a silently-dropped filter.

**Read-only, hard guarantee:** every file under `lib/observe/query/**` issues only `.select(...)` — no `.insert/.update/.delete/.upsert/.rpc`, and it never imports `lib/log` (reading telemetry must never write it). Pinned by `tests/observe/_metaReadOnlyQueryCore.test.ts`.

**Redaction posture:** `queryAlerts` DOES select `admin_alerts.context` (spec `2026-07-04-alert-at-a-glance-identity` §7) but never returns it raw — it is the sole owner of identity resolution: each row's context is passed through `projectIdentityContext` (allowlisted, scalar-only projection) then `resolveAlertIdentities`, and only a display-only `SerializedAlertIdentity` (`{ segments, global }` — no `resolution` group, no id-shaped keys, no raw context) reaches the caller/`--json`. Raw email is a deliberate PII carve-out gated by `includePii`: the web admin surface passes `true`; the CLI defaults `false` and reveals only via `--reveal-email`. Token-like substrings (hex/base64 ≥24 chars) are ALWAYS redacted regardless of the flag; control/bidi/zero-width chars are stripped and every string is length-capped. `queryChangeLog` never selects `before_image`/`after_image` (raw row snapshots). `app_events.context` IS surfaced (it is redaction-guaranteed at write time).
