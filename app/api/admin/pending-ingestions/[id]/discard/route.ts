import { NextResponse } from "next/server";
import {
  type LivePendingIngestionRouteDeps,
  type LivePendingIngestionRouteTx,
  livePendingIngestionDepsWithDefaults,
  readLockedPendingIngestion,
} from "../retry/route";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type DiscardBody = {
  kind?: unknown;
};

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

async function readBody(request: Request): Promise<DiscardBody> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as DiscardBody) : {};
  } catch {
    return {};
  }
}

async function upsertLiveDeferral(
  tx: LivePendingIngestionRouteTx,
  row: {
    drive_file_id: string;
    last_seen_modified_time: string | null;
  },
  kind: "defer_until_modified" | "permanent_ignore",
  adminEmail: string,
): Promise<Response | null> {
  if (kind === "defer_until_modified" && !row.last_seen_modified_time) {
    return errorResponse(500, "MISSING_PENDING_INGESTION_MODTIME");
  }
  await tx.queryOne<{ upserted: boolean } | null>(
    `
      insert into public.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_at_modified_time,
        deferred_by_email, reason, wizard_session_id
      )
      values ($1, $2, $3::timestamptz, $4, $5, null)
      on conflict (drive_file_id) where wizard_session_id is null
      do update set
        deferred_kind = excluded.deferred_kind,
        deferred_at_modified_time = excluded.deferred_at_modified_time,
        deferred_by_email = excluded.deferred_by_email,
        reason = excluded.reason,
        deferred_at = now()
      returning true as upserted
    `,
    [
      row.drive_file_id,
      kind,
      kind === "defer_until_modified" ? row.last_seen_modified_time : null,
      adminEmail,
      `pending_ingestion:${kind}`,
    ],
  );
  return null;
}

async function deletePendingIngestion(tx: LivePendingIngestionRouteTx, id: string): Promise<void> {
  await tx.queryOne<{ deleted: boolean } | null>(
    `delete from public.pending_ingestions where id = $1::uuid returning true as deleted`,
    [id],
  );
}

function kindFrom(value: unknown): "defer_until_modified" | "permanent_ignore" | null {
  if (value === "defer_until_modified" || value === "permanent_ignore") return value;
  return null;
}

export async function handleLivePendingIngestionDiscard(
  request: Request,
  context: RouteContext,
  routeDeps: LivePendingIngestionRouteDeps = {},
): Promise<Response> {
  const deps = livePendingIngestionDepsWithDefaults(routeDeps);
  let admin: { email: string };
  try {
    admin = await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const body = await readBody(request);
  const kind = kindFrom(body.kind);
  if (!kind) return errorResponse(400, "INVALID_REVIEWER_ACTION");

  const { id } = await context.params;
  const driveFileId = await deps.readDriveFileIdForPendingIngestion(id);
  if (!driveFileId) return errorResponse(409, "PENDING_INGESTION_TRANSITIONED");

  const result = await deps.withRowTryLock(driveFileId, async (tx) => {
    const row = await readLockedPendingIngestion(tx, id);
    if (!row) return errorResponse(409, "PENDING_INGESTION_TRANSITIONED");
    if (row.wizard_session_id !== null) return errorResponse(409, "LIVE_ROW_REQUIRED");
    if (row.drive_file_id !== driveFileId) {
      return errorResponse(500, "LOCK_OWNERSHIP_ASSERTION_FAILED");
    }
    const deferralError = await upsertLiveDeferral(tx, row, kind, admin.email);
    if (deferralError) return deferralError;
    await deletePendingIngestion(tx, id);
    return NextResponse.json({ status: "discarded", kind });
  });
  if ("skipped" in result) return errorResponse(409, "CONCURRENT_SYNC_SKIPPED");
  return result;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleLivePendingIngestionDiscard(request, context);
}
