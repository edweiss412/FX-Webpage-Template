import { type AdminAlertCode } from "@/lib/adminAlerts/upsertAdminAlert";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isInboxRouted } from "@/lib/messages/adminSurface";

// Inbox-routed codes (SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD) are auto-clear
// ONLY — they may be closed solely by the sync recovery loop
// (resolveStaleSyncProblemAlerts_unlocked / recoveryResolution), never through
// this manual-resolve helper (spec §4.8 layer). No production caller passes
// them; a fail-closed throw surfaces any future one loudly.
function assertNotInboxRouted(code: string): void {
  if (isInboxRouted(code)) {
    throw new Error(
      `admin alert code ${code} is auto-resolve-only; manual resolve via resolveAdminAlert is forbidden`,
    );
  }
}

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ResolveAdminAlertInput = {
  showId: string | null;
  code: AdminAlertCode;
};

export async function resolveAdminAlert(
  input: ResolveAdminAlertInput,
  client?: Client,
): Promise<void> {
  assertNotInboxRouted(input.code);
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

export type ResolveAdminAlertsInput = {
  showId: string | null;
  codes: readonly AdminAlertCode[];
};

export async function resolveAdminAlerts(
  input: ResolveAdminAlertsInput,
  client?: Client,
): Promise<void> {
  input.codes.forEach(assertNotInboxRouted);
  if (input.codes.length === 0) return; // empty .in() must never reach PostgREST (spec §4)
  const supabase = client ?? createSupabaseServiceRoleClient();
  let query = supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .in("code", [...input.codes])
    .is("resolved_at", null);
  query = input.showId === null ? query.is("show_id", null) : query.eq("show_id", input.showId);
  const { error } = await query.select("id"); // execution shape mirrors resolveAdminAlert.ts:24 (mocks are select-terminated)
  if (error) {
    throw new Error(`admin alert bulk resolve failed: ${error.message ?? String(error)}`);
  }
}
