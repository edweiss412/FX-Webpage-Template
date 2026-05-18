import { randomUUID as defaultRandomUUID } from "node:crypto";
import postgres from "postgres";

export type AppSettingsRow = {
  id: "default";
  watched_folder_id: string | null;
  watched_folder_name: string | null;
  watched_folder_set_by_email: string | null;
  watched_folder_set_at: string | null;
  active_signing_key_id: string;
  pending_folder_id: string | null;
  pending_folder_name: string | null;
  pending_folder_set_by_email: string | null;
  pending_folder_set_at: string | null;
  pending_wizard_session_id: string | null;
  pending_wizard_session_at: string | null;
  updated_at: string;
};

export type OnboardingSessionTx = {
  query<T>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

export type OnboardingRotateResult = {
  settings: AppSettingsRow;
  rotated: true;
};

export type PurgeAndRotateIfStaleResult =
  | { settings: AppSettingsRow; rotated: true }
  | {
      settings: AppSettingsRow;
      rotated: false;
      suppressed?: "WIZARD_FINALIZE_BATCHES_PENDING";
    };

export type CleanupAbandonedFinalizeResult = {
  status: "cleaned" | "already_cleaned";
  settings?: AppSettingsRow;
};

export class OnboardingSessionInfraError extends Error {
  readonly code = "ONBOARDING_SESSION_INFRA";

  constructor(message: string) {
    super(message);
    this.name = "OnboardingSessionInfraError";
  }
}

export class CleanupRequiresStaleSessionError extends Error {
  readonly code = "CLEANUP_REQUIRES_STALE_SESSION";
  readonly status = 409;

  constructor(
    readonly reason: "session_too_fresh" | "finalize_active_within_last_hour",
    readonly context: Record<string, unknown>,
  ) {
    super(`Cleanup requires a stale onboarding session: ${reason}`);
    this.name = "CleanupRequiresStaleSessionError";
  }
}

export type SessionLifecycleDeps = {
  randomUUID?: () => string;
  withTx?: <R>(fn: (tx: OnboardingSessionTx) => Promise<R>) => Promise<R>;
  requireAdminIdentity?: () => Promise<{ email: string }>;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("onboarding session lifecycle requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies OnboardingSessionTx;
}

async function defaultWithTx<R>(fn: (tx: OnboardingSessionTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })),
    )) as R;
  } catch (error) {
    if (error instanceof CleanupRequiresStaleSessionError) throw error;
    throw new OnboardingSessionInfraError(
      `onboarding session transaction failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: SessionLifecycleDeps) {
  return {
    randomUUID: deps.randomUUID ?? defaultRandomUUID,
    withTx: deps.withTx ?? defaultWithTx,
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
  };
}

const APP_SETTINGS_COLUMNS = `
  id,
  watched_folder_id,
  watched_folder_name,
  watched_folder_set_by_email,
  watched_folder_set_at,
  active_signing_key_id,
  pending_folder_id,
  pending_folder_name,
  pending_folder_set_by_email,
  pending_folder_set_at,
  pending_wizard_session_id,
  pending_wizard_session_at,
  updated_at
`;

async function purgeWizardRows(tx: OnboardingSessionTx): Promise<void> {
  await tx.query(`delete from public.pending_syncs where wizard_session_id is not null`);
  await tx.query(`delete from public.pending_ingestions where wizard_session_id is not null`);
  await tx.query(`delete from public.onboarding_scan_manifest`);
}

export async function purgeAndRotateOnboardingSession(
  deps: SessionLifecycleDeps = {},
): Promise<OnboardingRotateResult> {
  const runtime = depsWithDefaults(deps);
  return await runtime.withTx(async (tx) => {
    const newSessionId = runtime.randomUUID();
    const { rows } = await tx.query<AppSettingsRow>(
      `
        update public.app_settings
           set pending_wizard_session_id = $1::uuid,
               pending_wizard_session_at = now(),
               updated_at = now()
         where id = 'default'
         returning ${APP_SETTINGS_COLUMNS}
      `,
      [newSessionId],
    );
    const settings = rows[0];
    if (!settings) {
      throw new OnboardingSessionInfraError("app_settings default row was not found");
    }

    await purgeWizardRows(tx);
    return { settings, rotated: true };
  });
}

export async function purgeAndRotateIfStale(
  deps: SessionLifecycleDeps = {},
): Promise<PurgeAndRotateIfStaleResult> {
  const runtime = depsWithDefaults(deps);
  return await runtime.withTx(async (tx) => {
    const newSessionId = runtime.randomUUID();
    const rotated = await tx.query<AppSettingsRow>(
      `
        update public.app_settings
           set pending_wizard_session_id = $1::uuid,
               pending_wizard_session_at = now(),
               updated_at = now()
         where id = 'default'
           and pending_wizard_session_at is not null
           and pending_wizard_session_at < now() - interval '24 hours'
           and not exists (
             select 1
               from public.wizard_finalize_checkpoints c
              where c.wizard_session_id = app_settings.pending_wizard_session_id
                and c.batches_completed > 0
           )
         returning ${APP_SETTINGS_COLUMNS}
      `,
      [newSessionId],
    );

    if (rotated.rows[0]) {
      await purgeWizardRows(tx);
      return { settings: rotated.rows[0], rotated: true };
    }

    const { rows } = await tx.query<AppSettingsRow>(
      `select ${APP_SETTINGS_COLUMNS} from public.app_settings where id = 'default'`,
    );
    const settings = rows[0];
    if (!settings) {
      throw new OnboardingSessionInfraError("app_settings default row was not found");
    }

    const suppressed = await tx.query<{ one: number }>(
      `
        select 1 as one
          from public.app_settings a
          join public.wizard_finalize_checkpoints c
            on c.wizard_session_id = a.pending_wizard_session_id
         where a.id = 'default'
           and a.pending_wizard_session_at is not null
           and a.pending_wizard_session_at < now() - interval '24 hours'
           and c.batches_completed > 0
         limit 1
      `,
    );

    if (suppressed.rowCount > 0) {
      await tx.query(
        `
          insert into public.sync_log (status, message, parse_warnings)
          values (
            $1,
            'onboarding auto-rotate suppressed because finalize batches are pending',
            jsonb_build_array(jsonb_build_object('wizard_session_id', $2::uuid, 'code', $1))
          )
        `,
        ["WIZARD_FINALIZE_BATCHES_PENDING", settings.pending_wizard_session_id],
      );
      return { settings, rotated: false, suppressed: "WIZARD_FINALIZE_BATCHES_PENDING" };
    }

    return { settings, rotated: false };
  });
}

export async function cleanupAbandonedFinalize(
  sessionId: string,
  deps: SessionLifecycleDeps = {},
): Promise<CleanupAbandonedFinalizeResult> {
  const runtime = depsWithDefaults(deps);
  const admin = await runtime.requireAdminIdentity();

  return await runtime.withTx(async (tx) => {
    await tx.query(`select pg_advisory_xact_lock(hashtext('finalize:' || $1))`, [sessionId]);

    const staleSession = await tx.query<AppSettingsRow>(
      `
        select ${APP_SETTINGS_COLUMNS}
          from public.app_settings
         where id = 'default'
           and pending_wizard_session_id = $1::uuid
           and pending_wizard_session_at < now() - interval '24 hours'
         for update
      `,
      [sessionId],
    );

    if (staleSession.rowCount === 0) {
      const owner = await tx.query<AppSettingsRow>(
        `select ${APP_SETTINGS_COLUMNS} from public.app_settings where id = 'default'`,
      );
      if (owner.rows[0]?.pending_wizard_session_id !== sessionId) {
        return { status: "already_cleaned" };
      }
      throw new CleanupRequiresStaleSessionError("session_too_fresh", {
        wizard_session_id: sessionId,
        pending_wizard_session_at: owner.rows[0]?.pending_wizard_session_at ?? null,
      });
    }

    const recentFinalize = await tx.query<{ id: string }>(
      `
        select id
          from public.wizard_finalize_checkpoints
         where wizard_session_id = $1::uuid
           and status = 'in_progress'
           and last_processed_at is not null
           and last_processed_at > now() - interval '1 hour'
         for update
      `,
      [sessionId],
    );
    if (recentFinalize.rowCount > 0) {
      throw new CleanupRequiresStaleSessionError("finalize_active_within_last_hour", {
        wizard_session_id: sessionId,
      });
    }

    await tx.query(`delete from public.shows_pending_changes where wizard_session_id = $1::uuid`, [
      sessionId,
    ]);
    await tx.query(
      `
        delete from public.shows
         where published = false
           and drive_file_id in (
             select drive_file_id
               from public.onboarding_scan_manifest
              where wizard_session_id = $1::uuid
                and status = 'applied'
           )
      `,
      [sessionId],
    );
    await tx.query(
      `delete from public.wizard_finalize_checkpoints where wizard_session_id = $1::uuid`,
      [sessionId],
    );
    await tx.query(
      `
        insert into public.sync_log (status, message, parse_warnings)
        values (
          'cleanup_abandoned_finalize',
          'abandoned onboarding finalize cleaned up by an admin',
          jsonb_build_array(jsonb_build_object('wizard_session_id', $1::uuid, 'admin_email', $2))
        )
      `,
      [sessionId, admin.email],
    );

    const newSessionId = runtime.randomUUID();
    const { rows } = await tx.query<AppSettingsRow>(
      `
        update public.app_settings
           set pending_wizard_session_id = $1::uuid,
               pending_wizard_session_at = now(),
               updated_at = now()
         where id = 'default'
         returning ${APP_SETTINGS_COLUMNS}
      `,
      [newSessionId],
    );
    const settings = rows[0];
    if (!settings) {
      throw new OnboardingSessionInfraError("app_settings default row was not found");
    }

    await purgeWizardRows(tx);
    return { status: "cleaned", settings };
  });
}
