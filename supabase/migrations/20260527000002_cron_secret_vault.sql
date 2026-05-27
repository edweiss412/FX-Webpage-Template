-- M12.1 T2.2 — create vault entry for fxav_cron_secret.
-- The actual secret VALUE is populated per-environment (validation: Phase 0.A.4.5;
-- prod: M13 launch). This migration creates the named slot only; secret value
-- defaults to a placeholder that the runtime CRON_SECRET env-var check would
-- never match (forcing 401 if Vault isn't populated post-migration).
--
-- Schema: Supabase Vault's extension NAME is `supabase_vault` but its SQL
-- surface lives in the `vault` schema (R2 F4 fix; conf 0.95). Functions:
-- vault.create_secret(), vault.update_secret(). Tables/views: vault.secrets,
-- vault.decrypted_secrets.
--
-- Defensive bootstrap (R5 F12 fix): PostgreSQL's `CREATE EXTENSION ... WITH
-- SCHEMA schema_name` requires the schema to ALREADY EXIST (per PG docs at
-- https://www.postgresql.org/docs/current/sql-createextension.html — "The
-- named schema must already exist"). So a fresh environment without the
-- `vault` schema would fail at `create extension ... with schema vault`
-- before any function call could run. The two-statement form below creates
-- the schema first (idempotent via `if not exists`), then the extension
-- targeting that schema. On Supabase managed projects Vault is pre-installed
-- and both statements are no-ops; on any other PG environment they bootstrap
-- the prerequisites correctly.
-- See sub-amendment spec §2.3 (auth contract).

create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fxav_cron_secret') then
    perform vault.create_secret(
      new_secret := 'unset-populate-via-vault-ui-or-update',
      new_name := 'fxav_cron_secret',
      new_description := 'Bearer token for pg_net -> Vercel /api/cron/* routes. Populated post-migration per environment. M12.1 T2.2.'
    );
  end if;
end$$;
