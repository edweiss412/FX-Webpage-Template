import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { canonicalize } from "@/lib/email/canonicalize";

export type RecipientsResult = { kind: "ok"; recipients: string[] } | { kind: "infra_error" };
type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

/**
 * Active admin notification recipients (§5.1, RD-4): every non-revoked
 * `admin_emails` row, canonicalized. Service-role read — NEVER `listAdminEmails`
 * (which is the admin-session surface). A returned/thrown DB fault surfaces as a
 * discriminable `{ kind: "infra_error" }` (invariant 9) — never a silent skip.
 */
export async function activeRecipients(client?: Client): Promise<RecipientsResult> {
  try {
    const supabase = client ?? createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("admin_emails")
      .select("email")
      .is("revoked_at", null);
    if (error) return { kind: "infra_error" };
    const recipients = (data ?? [])
      .map((r) => canonicalize((r as { email: string }).email))
      .filter((e): e is string => !!e);
    return { kind: "ok", recipients };
  } catch {
    return { kind: "infra_error" };
  }
}
