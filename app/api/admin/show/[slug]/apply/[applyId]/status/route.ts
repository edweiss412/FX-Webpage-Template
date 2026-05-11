import { NextResponse, type NextRequest } from "next/server";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { AdminInfraError, requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const STUCK_AFTER_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ slug: string; applyId: string }>;
};

type ShowRow = {
  id: string;
  diagrams: unknown;
};

type LedgerRow = {
  id: string;
  show_id: string;
  snapshot_revision_id: string;
  promoted_at: string | null;
  promote_started_at: string | null;
  claim_token: string | null;
};

function revision(diagrams: unknown, key: "current" | "pending"): string | null {
  if (!diagrams || typeof diagrams !== "object") return null;
  const payload = (diagrams as Record<string, unknown>)[key];
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const value = key === "current" ? record.snapshot_revision_id : record.revision_id;
  return typeof value === "string" ? value : null;
}

function statusFor(row: LedgerRow, show: ShowRow): Record<string, unknown> {
  const base = {
    snapshot_revision_id: row.snapshot_revision_id,
    ledger_row_id: row.id,
  };

  if (row.promoted_at && revision(show.diagrams, "current") === row.snapshot_revision_id) {
    return { status: "promoted", ...base };
  }

  if (row.promote_started_at && !row.promoted_at) {
    const started = new Date(row.promote_started_at).getTime();
    if (Number.isFinite(started) && Date.now() - started > STUCK_AFTER_MS) {
      return {
        status: "stuck_admin_repair_required",
        ...base,
        diagnostics: { promote_started_at: row.promote_started_at },
      };
    }
    return { status: "pending", ...base };
  }

  if (
    !row.promoted_at &&
    !row.claim_token &&
    revision(show.diagrams, "pending") !== row.snapshot_revision_id
  ) {
    return { status: "rolled_back", ...base };
  }

  return { status: "pending", ...base };
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminInfraError) {
      return NextResponse.json({ error: "ADMIN_SESSION_LOOKUP_FAILED" }, { status: 500 });
    }
    return NextResponse.json({ error: "ADMIN_FORBIDDEN" }, { status: 403 });
  }

  const { slug, applyId } = await context.params;
  if (!UUID_RE.test(applyId)) {
    return NextResponse.json({ error: "APPLY_STATUS_NOT_FOUND" }, { status: 404 });
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: show, error: showError } = (await supabase
      .from("shows")
      .select("id,diagrams")
      .eq("slug", slug)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };

    if (showError || !show) {
      return NextResponse.json({ error: "APPLY_STATUS_NOT_FOUND" }, { status: 404 });
    }

    const { data: ledger, error: ledgerError } = (await supabase
      .from("pending_snapshot_uploads")
      .select("id,show_id,snapshot_revision_id,promoted_at,promote_started_at,claim_token")
      .eq("snapshot_revision_id", applyId)
      .eq("show_id", show.id)
      .maybeSingle()) as { data: LedgerRow | null; error: unknown };

    if (ledgerError || !ledger || ledger.show_id !== show.id) {
      return NextResponse.json({ error: "APPLY_STATUS_NOT_FOUND" }, { status: 404 });
    }

    const status = statusFor(ledger, show);
    if (status.status === "stuck_admin_repair_required") {
      await upsertAdminAlert({
        showId: show.id,
        code: "PENDING_SNAPSHOT_PROMOTE_STUCK",
        context: {
          snapshot_revision_id: ledger.snapshot_revision_id,
          ledger_row_id: ledger.id,
          promote_started_at: ledger.promote_started_at,
        },
      });
    }
    if (status.status === "rolled_back") {
      await upsertAdminAlert({
        showId: show.id,
        code: "PENDING_SNAPSHOT_ROLLBACK_STUCK",
        context: {
          snapshot_revision_id: ledger.snapshot_revision_id,
          ledger_row_id: ledger.id,
        },
      });
    }

    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ error: "SYNC_INFRA_ERROR" }, { status: 500 });
  }
}
