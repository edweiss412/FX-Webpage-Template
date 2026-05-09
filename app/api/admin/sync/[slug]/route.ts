import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { FINALIZE_OWNED_SHOW, runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type ShowSlugRow = {
  drive_file_id: string;
};

function statusForManualSyncCode(code: string): number {
  return code === "SYNC_INFRA_ERROR" ? 500 : 409;
}

async function readDriveFileIdForSlug(slug: string): Promise<
  | { kind: "found"; driveFileId: string }
  | { kind: "not_found" }
  | { kind: "infra_error" }
> {
  let supabase: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    supabase = createSupabaseServiceRoleClient();
  } catch (error) {
    console.error("[/api/admin/sync/[slug]] service-role construction failed", error);
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
    console.error("[/api/admin/sync/[slug]] show lookup threw", cause);
    return { kind: "infra_error" };
  }

  if (error) {
    console.error("[/api/admin/sync/[slug]] show lookup failed", error.message);
    return { kind: "infra_error" };
  }
  if (!data) return { kind: "not_found" };
  return { kind: "found", driveFileId: data.drive_file_id };
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<Response> {
  await requireAdmin();
  const { slug } = await context.params;

  const resolved = await readDriveFileIdForSlug(slug);
  if (resolved.kind === "infra_error") {
    return NextResponse.json({ ok: false, error: "SYNC_INFRA_ERROR" }, { status: 500 });
  }
  if (resolved.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "PENDING_SYNC_NOT_FOUND" }, { status: 404 });
  }

  const result = await runManualSyncForShow(resolved.driveFileId, "manual");
  if ("outcome" in result && result.outcome === "blocked" && result.code === FINALIZE_OWNED_SHOW) {
    return NextResponse.json({ ok: false, error: FINALIZE_OWNED_SHOW }, { status: 409 });
  }
  if ("skipped" in result) {
    return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
  }
  if ("code" in result) {
    return NextResponse.json(
      { ok: false, error: result.code, result },
      { status: statusForManualSyncCode(result.code) },
    );
  }

  return NextResponse.json({ ok: true, result });
}
