// Silent resolve helpers for the ONBOARDING_SHEET_UNREADABLE admin alert
// (hybrid lifecycle — spec 2026-07-16). Structurally mirrors
// lib/notify/detect/recoveryResolution.ts: direct `postgres` tagged-template
// client (NOT a Supabase client), an optional injected `sql` for tests, owns
// the connection only when it created it, and returns a typed
// `{kind:"ok";resolved}|{kind:"infra_error"}` union — it NEVER throws.
//
// SILENT by contract (invariant 9 + plan): this module imports NO `lib/log`.
// The only durable emit for auto-resolve is a `log.info` carrying the forensic
// code ONBOARDING_ALERT_AUTO_RESOLVED at the CALLERS (scan route / cron
// epilogue), never here. Not subject to tests/auth/_metaInfraContract.test.ts
// (same class as recoveryResolution — direct postgres, no Supabase boundary).
import postgres from "postgres";

export type ResolveSql = {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  end?: (options?: { timeout?: number }) => Promise<void>;
};

export type ResolveResult = { kind: "ok"; resolved: boolean } | { kind: "infra_error" };

export type HealInput = {
  activeFolderId: string;
  /** drive_file_id -> Drive `modifiedTime` for every file currently listed in the folder. */
  listedFiles: ReadonlyMap<string, string>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding-alert resolution requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function connect(): ResolveSql {
  return postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false }) as ResolveSql;
}

/**
 * Clean-scan observer path (spec §3.4): a completed scan with ZERO hard-failed
 * files means the condition is healed, so resolve the one open global
 * ONBOARDING_SHEET_UNREADABLE row unconditionally.
 */
export async function resolveOpenUnreadableAlertUnconditionally(
  sql?: ResolveSql,
): Promise<ResolveResult> {
  const db = sql ?? connect();
  const owns = !sql;
  try {
    const rows = await db<{ id: string }>`
      update public.admin_alerts
         set resolved_at = now()
       where code = 'ONBOARDING_SHEET_UNREADABLE'
         and show_id is null
         and resolved_at is null
      returning id`;
    return { kind: "ok", resolved: rows.length > 0 };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (owns) await db.end?.({ timeout: 5 });
  }
}

/**
 * Cron-epilogue observer path (spec §3.4): resolve the open alert only if EVERY
 * previously-failed sheet has healed (removed from the folder, registered as a
 * show, or re-staged at the current Drive revision), and the setup wizard is
 * not mid-run. The wizard-owned skip is read HERE (not passed by the caller) so
 * no call site can bypass it. The final UPDATE is CAS-guarded on `last_seen_at`
 * so an intervening re-emit (which bumps `last_seen_at`) cancels the resolve.
 */
export async function resolveUnreadableAlertIfHealed(
  input: HealInput,
  sql?: ResolveSql,
): Promise<ResolveResult> {
  const db = sql ?? connect();
  const owns = !sql;
  try {
    // (a) Fetch the open row FIRST — no open row => no further queries (§3.4a).
    // `last_seen_at::text` preserves Postgres microsecond precision for the CAS
    // below (a Date round-trip truncates to millisecond and would never match).
    const open = await db<{ id: string; context: Record<string, unknown>; last_seen_at: string }>`
      select id, context, last_seen_at::text as last_seen_at
        from public.admin_alerts
       where code = 'ONBOARDING_SHEET_UNREADABLE'
         and show_id is null
         and resolved_at is null
       limit 1`;
    if (open.length === 0) return { kind: "ok", resolved: false };

    // (b) Wizard-owned skip — helper self-reads (§3.4b); no caller can bypass.
    const settings = await db<{ pending_wizard_session_id: string | null }>`
      select pending_wizard_session_id from public.app_settings limit 1`;
    if ((settings[0]?.pending_wizard_session_id ?? null) !== null) {
      return { kind: "ok", resolved: false };
    }

    const row = open[0]!;
    const ctx = row.context ?? {};
    const ids = Array.isArray(ctx.failed_drive_file_ids)
      ? (ctx.failed_drive_file_ids as string[])
      : null;
    // Folder mismatch / malformed folder_id => the alert is stale => resolve.
    const folderMismatch =
      typeof ctx.folder_id !== "string" || ctx.folder_id !== input.activeFolderId;
    let shouldResolve = folderMismatch;
    if (!shouldResolve) {
      if (!ids || ids.length === 0) return { kind: "ok", resolved: false }; // keep open
      const healed = await Promise.all(ids.map((id) => isIdHealed(db, id, input.listedFiles)));
      shouldResolve = healed.every(Boolean);
    }
    if (!shouldResolve) return { kind: "ok", resolved: false };

    // CAS on last_seen_at via TEXT comparison (both sides text): binding the
    // observed value back as `::timestamptz` truncates to millisecond (the
    // postgres driver coerces the string to a JS Date first), which would never
    // match the stored microsecond value. Read + update run on the same
    // connection/session, so `::text` is stable; an intervening re-emit bumps
    // last_seen_at and its text form, correctly cancelling the resolve.
    const updated = await db<{ id: string }>`
      update public.admin_alerts
         set resolved_at = now()
       where id = ${row.id}::uuid
         and resolved_at is null
         and last_seen_at::text = ${row.last_seen_at}
      returning id`;
    return { kind: "ok", resolved: updated.length > 0 };
  } catch {
    return { kind: "infra_error" };
  } finally {
    if (owns) await db.end?.({ timeout: 5 });
  }
}

async function isIdHealed(
  db: ResolveSql,
  id: string,
  listed: ReadonlyMap<string, string>,
): Promise<boolean> {
  const listedModifiedTime = listed.get(id);
  if (listedModifiedTime === undefined) return true; // removed from folder => can't fail
  const registered = await db<{ one: number }>`
    select 1 as one from public.shows where drive_file_id = ${id} limit 1`;
  if (registered.length > 0) return true; // per-show cron path owns a registered file
  const staged = await db<{ one: number }>`
    select 1 as one
      from public.pending_syncs
     where drive_file_id = ${id}
       and wizard_session_id is null
       and staged_modified_time = ${listedModifiedTime}::timestamptz
     limit 1`;
  return staged.length > 0; // current-revision staged (revision-match, R1-1)
}
