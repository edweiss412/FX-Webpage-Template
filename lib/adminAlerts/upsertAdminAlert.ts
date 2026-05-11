import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AdminAlertCode =
  | "AMBIGUOUS_EMAIL_BINDING"
  | "ASSET_RECOVERY_BYTES_EXCEEDED"
  | "LEAKED_LINK_REVOCATION_FAILED"
  | "LEAKED_LINK_DETECTED"
  | "EMBEDDED_RECOVERY_REQUIRES_RESTAGE"
  | "LIVE_ROW_CONFLICT"
  | "ROLE_FLAGS_NOTICE"
  | "SHEET_UNAVAILABLE"
  | "PENDING_SNAPSHOT_PROMOTE_STUCK"
  | "PENDING_SNAPSHOT_ROLLBACK_STUCK"
  | "PENDING_SNAPSHOT_DELETE_STUCK"
  | "OPENING_REEL_PERMISSION_DENIED"
  | "OPENING_REEL_NOT_VIDEO"
  | "REEL_DRIFTED"
  | "LINKED_ASSET_DRIFTED"
  | "WATCH_CHANNEL_ORPHANED"
  | "WEBHOOK_TOKEN_INVALID";

export type UpsertAdminAlertInput = {
  showId: string | null;
  code: AdminAlertCode;
  context: Record<string, unknown>;
};

export async function upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("upsert_admin_alert", {
    p_show_id: input.showId,
    p_code: input.code,
    p_context: input.context,
  });

  if (error) {
    throw new Error(`admin alert upsert failed: ${error.message ?? String(error)}`);
  }

  return typeof data === "string" ? data : null;
}
