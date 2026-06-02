import {
  type AdminAlertCode,
} from "@/lib/adminAlerts/upsertAdminAlert";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ResolveAdminAlertInput = {
  showId: string | null;
  code: AdminAlertCode;
};

export async function resolveAdminAlert(
  input: ResolveAdminAlertInput,
  client?: Client,
): Promise<void> {
  const supabase = client ?? createSupabaseServiceRoleClient();
  let query = supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("code", input.code)
    .is("resolved_at", null);

  query = input.showId === null ? query.is("show_id", null) : query.eq("show_id", input.showId);

  const { error } = await query.select("id");

  if (error) {
    throw new Error(`admin alert resolve failed: ${error.message ?? String(error)}`);
  }
}
