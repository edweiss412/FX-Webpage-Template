# Closeout — sync_log show attribution

Companion to `2026-08-09-sync-log-show-attribution.md`. Records the two steps whose
evidence lives outside the repo: the validation-project apply, and the invariant-8 UI
gate.

## Validation apply

`supabase db push` is blocked on the persistent validation project (Phase-0 history
divergence), so the migration is applied surgically.

| | |
| --- | --- |
| **Migration** | `supabase/migrations/20260809000000_sync_log_show_attribution.sql` |
| **Applied** | 2026-08-10, project `vzakgrxqwcalbmagufjh` |
| **Target proof** | `pg_control_system().system_identifier` = `7642734024280108049`, read BEFORE any DDL, matching `VALIDATION_SYSTEM_IDENTIFIER` (`tests/db/_validationTargetIdentity.ts:17`) |
| **psql exit** | `0`, run with `-v ON_ERROR_STOP=1` |
| **Statements** | `CREATE INDEX` ×2, `DO` (dev guard, no-op — validation has no `dev` schema), `CREATE FUNCTION`, `REVOKE`, `GRANT`, `DO` (cron schedule) |
| **Schema reload** | `notify pgrst, 'reload schema';` → `NOTIFY` |

**Why the identity check and not a hostname.** A pooler hostname identifies neither the
project nor the cluster — another Supabase project can sit behind the same regional
pooler, and its database is also called `postgres`, so neither the host nor
`current_database()` discriminates. `tests/db/_validationTargetIdentity.ts` exists
because a libpq DSN's authority is not its effective target: `?host=` / `hostaddr=` /
duplicate keyword fields override it. The identity fact is the connected cluster's
`system_identifier`, and it is checked **before** `psql -f`, because the parity run
happens after the DDL has already landed and so cannot prevent a wrong-project apply.

**Objects confirmed present on validation after the apply:** 2 indexes, 1 function, 1
cron row.

**Parity gate:** `pnpm vitest run tests/db/validation-schema-parity.test.ts` with
`TEST_DATABASE_URL` exported to the validation DSN — 8 passed. Exported once for the
whole task rather than inlined per command: an inline `VAR=… pnpm …` assignment reaches
only that child process, so the separate `psql` apply would have received an empty
string and fallen back to the local socket, which is exactly how an apply could target
the wrong database while the parity run reported the right one.
