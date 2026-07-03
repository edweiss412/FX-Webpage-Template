import { NextResponse, type NextRequest } from "next/server";
import { AdminInfraError, requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { repairSnapshotRollback } from "@/lib/sync/promoteSnapshot";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type LedgerRow = {
  drive_file_id: string;
  snapshot_revision_id: string;
};

export async function POST(_request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminInfraError) {
      return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ error: "ADMIN_FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "APPLY_STATUS_NOT_FOUND" }, { status: 404 });
  }

  try {
    const { email } = await requireAdminIdentity(); // cache-backed; auth already passed
    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = (await supabase
      .from("pending_snapshot_uploads")
      .select("drive_file_id,snapshot_revision_id")
      .eq("id", id)
      .maybeSingle()) as { data: LedgerRow | null; error: unknown };

    if (error) return NextResponse.json({ error: "SYNC_INFRA_ERROR" }, { status: 500 });
    if (!data) {
      return NextResponse.json({ error: "APPLY_STATUS_NOT_FOUND" }, { status: 404 });
    }

    const result = await repairSnapshotRollback(id);
    if (result.outcome === "not_found") {
      return NextResponse.json({ error: "APPLY_STATUS_NOT_FOUND" }, { status: 404 });
    }
    if (result.outcome === "not_stuck") {
      return NextResponse.json({ error: "PENDING_SNAPSHOT_NOT_STUCK" }, { status: 409 });
    }
    if (result.outcome === "promote_in_flight") {
      return NextResponse.json({ error: "PENDING_SNAPSHOT_PROMOTE_IN_FLIGHT" }, { status: 409 });
    }
    await logAdminOutcome({
      code: "SNAPSHOT_ROLLBACK_REPAIRED",
      source: "api.admin.snapshot-rollback.repair",
      actorEmail: email,
      driveFileId: data.drive_file_id,
      extra: { snapshotRevisionId: result.snapshotRevisionId },
    });
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ error: "SYNC_INFRA_ERROR" }, { status: 500 });
  }
}
