import { randomUUID as defaultRandomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import postgres from "postgres";
import {
  cleanupAbandonedFinalize as defaultCleanupAbandonedFinalize,
  CleanupRequiresStaleSessionError,
  type SessionLifecycleDeps,
} from "@/lib/onboarding/sessionLifecycle";
import { canonicalize } from "@/lib/email/canonicalize";

export type CleanupAbandonedFinalizeRouteTx = {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
};

export type CleanupAbandonedFinalizeRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: CleanupAbandonedFinalizeRouteTx) => Promise<R>) => Promise<R>;
  cleanupAbandonedFinalize?: (
    sessionId: string,
    deps?: SessionLifecycleDeps,
  ) => Promise<{ status: "cleaned" | "already_cleaned" }>;
  randomUUID?: () => string;
};

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

type CleanupSnapshot = {
  applied_manifest_count: number;
  shadow_count: number;
  unresolved_manifest_count: number;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("cleanup abandoned finalize route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const rows = (await rawTx.unsafe(sql, [...params])) as T[];
      return { rows, rowCount: rows.length };
    },
  } satisfies CleanupAbandonedFinalizeRouteTx;
}

async function defaultWithTx<R>(
  fn: (tx: CleanupAbandonedFinalizeRouteTx) => Promise<R>,
): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(
        postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }),
      ),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: CleanupAbandonedFinalizeRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
    cleanupAbandonedFinalize: deps.cleanupAbandonedFinalize ?? defaultCleanupAbandonedFinalize,
    randomUUID: deps.randomUUID ?? defaultRandomUUID,
  };
}

function errorResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

async function readCleanupSnapshot(
  tx: CleanupAbandonedFinalizeRouteTx,
  sessionId: string,
): Promise<CleanupSnapshot> {
  const { rows } = await tx.query<CleanupSnapshot>(
    `
      select
        (
          select count(*)::int
            from public.onboarding_scan_manifest
           where wizard_session_id = $1::uuid
             and status = 'applied'
        ) as applied_manifest_count,
        (
          select count(*)::int
            from public.shows_pending_changes
           where wizard_session_id = $1::uuid
        ) as shadow_count,
        (
          select count(*)::int
            from public.onboarding_scan_manifest
           where wizard_session_id = $1::uuid
             and status in ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')
        ) as unresolved_manifest_count
    `,
    [sessionId],
  );
  return rows[0] ?? { applied_manifest_count: 0, shadow_count: 0, unresolved_manifest_count: 0 };
}

async function insertAudit(input: {
  tx: CleanupAbandonedFinalizeRouteTx;
  sessionId: string;
  auditId: string;
  adminEmail: string;
  phase: "before" | "after";
  status: "started" | "cleaned" | "already_cleaned" | "refused";
  snapshot: CleanupSnapshot;
  reason?: string;
}): Promise<void> {
  await input.tx.query<{ id: string }>(
    `
      insert into public.sync_audit (
        show_id, drive_file_id, applied_by, staged_id, triggered_review_items,
        reviewer_choices, derived_side_effects, parse_result_summary,
        base_modified_time, staged_modified_time
      )
      values (
        null,
        'onboarding-cleanup:' || $1,
        $4,
        $5::uuid,
        -- ::text casts: $2/$3/$6 appear ONLY inside jsonb_build_object, so postgres cannot
        -- infer their types — real-DB execution fails with "could not determine data type of
        -- parameter" (same class as the sessionLifecycle sync_log insert; fake-tx suites never
        -- execute the SQL).
        jsonb_build_array(jsonb_build_object('phase', $2::text, 'status', $3::text)),
        '[]'::jsonb,
        jsonb_build_object('reason', $6::text),
        jsonb_build_object(
          'wizard_session_id', $1::uuid,
          'applied_manifest_count', $7::int,
          'shadow_count', $8::int,
          'unresolved_manifest_count', $9::int
        ),
        null,
        now()
      )
      returning id
    `,
    [
      input.sessionId,
      input.phase,
      input.status,
      canonicalize(input.adminEmail),
      input.auditId,
      input.reason ?? null,
      input.snapshot.applied_manifest_count,
      input.snapshot.shadow_count,
      input.snapshot.unresolved_manifest_count,
    ],
  );
}

export async function handleCleanupAbandonedFinalize(
  _request: Request,
  context: RouteContext,
  routeDeps: CleanupAbandonedFinalizeRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let admin: { email: string };
  try {
    admin = await deps.requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    }
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { sessionId } = await context.params;
  const before = await deps.withTx(async (tx) => {
    const snapshot = await readCleanupSnapshot(tx, sessionId);
    await insertAudit({
      tx,
      sessionId,
      auditId: deps.randomUUID(),
      adminEmail: admin.email,
      phase: "before",
      status: "started",
      snapshot,
    });
    return snapshot;
  });

  try {
    const result = await deps.cleanupAbandonedFinalize(sessionId, {
      requireAdminIdentity: async () => admin,
    });
    await deps.withTx(async (tx) => {
      const snapshot = await readCleanupSnapshot(tx, sessionId);
      await insertAudit({
        tx,
        sessionId,
        auditId: deps.randomUUID(),
        adminEmail: admin.email,
        phase: "after",
        status: result.status,
        snapshot,
      });
    });
    return NextResponse.json({ status: result.status });
  } catch (error) {
    if (error instanceof CleanupRequiresStaleSessionError) {
      await deps.withTx(async (tx) => {
        await insertAudit({
          tx,
          sessionId,
          auditId: deps.randomUUID(),
          adminEmail: admin.email,
          phase: "after",
          status: "refused",
          snapshot: before,
          reason: error.reason,
        });
      });
      return errorResponse(error.status, error.code, {
        reason: error.reason,
        context: error.context,
      });
    }
    throw error;
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleCleanupAbandonedFinalize(request, context);
}
