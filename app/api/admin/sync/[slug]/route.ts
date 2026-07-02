import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { FINALIZE_OWNED_SHOW, runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import { deriveRequestId, log, runWithRequestContext } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type ShowSlugRow = {
  drive_file_id: string;
};

function statusForManualSyncCode(code: string): number {
  return code === "SYNC_INFRA_ERROR" ? 500 : 409;
}

async function readDriveFileIdForSlug(
  slug: string,
): Promise<
  { kind: "found"; driveFileId: string } | { kind: "not_found" } | { kind: "infra_error" }
> {
  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    log.error("service-role construction failed", { source: "api.admin.sync", error });
    return { kind: "infra_error" };
  }

  let data: ShowSlugRow | null;
  let error: { message: string } | null;
  try {
    const response = await supabase
      .from("shows")
      .select("drive_file_id")
      .eq("slug", slug)
      .maybeSingle();
    data = response.data as ShowSlugRow | null;
    error = response.error;
  } catch (cause) {
    log.error("show lookup threw", { source: "api.admin.sync", error: cause });
    return { kind: "infra_error" };
  }

  if (error) {
    log.error("show lookup failed", { source: "api.admin.sync", errorMessage: error.message });
    return { kind: "infra_error" };
  }
  if (!data) return { kind: "not_found" };
  return { kind: "found", driveFileId: data.drive_file_id };
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<Response> {
  return runWithRequestContext({ requestId: deriveRequestId(_request.headers) }, async () => {
    await requireAdmin();
    const { email } = await requireAdminIdentity();
    const { slug } = await context.params;

    const resolved = await readDriveFileIdForSlug(slug);
    if (resolved.kind === "infra_error") {
      return NextResponse.json({ ok: false, error: "SYNC_INFRA_ERROR" }, { status: 500 });
    }
    if (resolved.kind === "not_found") {
      return NextResponse.json({ ok: false, error: "PENDING_SYNC_NOT_FOUND" }, { status: 404 });
    }

    const result = await runManualSyncForShow(resolved.driveFileId, "manual");
    if (
      "outcome" in result &&
      result.outcome === "blocked" &&
      result.code === FINALIZE_OWNED_SHOW
    ) {
      return NextResponse.json({ ok: false, error: FINALIZE_OWNED_SHOW }, { status: 409 });
    }
    if ("skipped" in result) {
      return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
    }
    if ("code" in result) {
      return NextResponse.json(
        { ok: false, error: result.code },
        { status: statusForManualSyncCode(result.code) },
      );
    }

    if (result.outcome === "applied") {
      await logAdminOutcome({
        code: "SHOW_SYNCED_MANUAL",
        source: "api.admin.sync",
        actorEmail: email,
        driveFileId: resolved.driveFileId,
        showId: result.showId,
      });
    }
    return NextResponse.json({ ok: true, result });
  });
}
