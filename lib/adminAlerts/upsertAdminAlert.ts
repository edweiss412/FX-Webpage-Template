import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AdminAlertCode =
  | "AMBIGUOUS_EMAIL_BINDING"
  | "LEAKED_LINK_REVOCATION_FAILED"
  | "LEAKED_LINK_DETECTED"
  | "EMBEDDED_RECOVERY_REQUIRES_RESTAGE";

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
