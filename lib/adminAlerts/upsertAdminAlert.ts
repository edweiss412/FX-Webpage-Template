import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AdminAlertCode =
  | "AMBIGUOUS_EMAIL_BINDING"
  | "ASSET_RECOVERY_BYTES_EXCEEDED"
  | "ASSET_RECOVERY_REVISION_DRIFT"
  | "ASSET_RECOVERY_DRIFT_COOLDOWN"
  | "EMBEDDED_RECOVERY_REQUIRES_RESTAGE"
  | "LIVE_ROW_CONFLICT"
  | "ROLE_FLAGS_NOTICE"
  | "DRIVE_FETCH_FAILED"
  | "PARSE_ERROR_LAST_GOOD"
  | "SHEET_UNAVAILABLE"
  | "SYNC_STALLED"
  | "EMAIL_DELIVERY_FAILED"
  | "EMAIL_NOT_CONFIGURED"
  | "SHOW_FIRST_PUBLISHED"
  | "SHOW_UNPUBLISHED"
  | "PENDING_SNAPSHOT_PROMOTE_STUCK"
  | "PENDING_SNAPSHOT_ROLLBACK_STUCK"
  | "PENDING_SNAPSHOT_DELETE_STUCK"
  | "OPENING_REEL_PERMISSION_DENIED"
  | "OPENING_REEL_NOT_VIDEO"
  | "REEL_DRIFTED"
  | "EMBEDDED_ASSET_DRIFTED"
  | "TILE_SERVER_RENDER_FAILED"
  | "WATCH_CHANNEL_ORPHANED"
  | "WEBHOOK_TOKEN_INVALID"
  | "OAUTH_IDENTITY_CLAIMED"
  | "PICKER_BOOTSTRAP_RPC_FAILED"
  | "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED"
  | "CALLBACK_CLAIM_THREW"
  | "PICKER_SELECTION_RACE"
  | "PICKER_EPOCH_RESET";

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
