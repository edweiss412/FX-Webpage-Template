import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BANNER_EXCLUDED_CODES } from "@/lib/messages/adminSurface";

export type AlertCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };

export async function fetchUnresolvedAlertCount(): Promise<AlertCountResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }
  try {
    let q = supabase
      .from("admin_alerts")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null);
    if (BANNER_EXCLUDED_CODES.length > 0) {
      q = q.not("code", "in", `(${BANNER_EXCLUDED_CODES.map((c) => `"${c}"`).join(",")})`);
    }
    const { data: _countData, count, error } = await q; // invariant 9: destructure { data, error }, not bare
    void _countData;
    if (error) return { kind: "infra_error" };
    // A null/undefined count with NO error is an integrity failure, NOT a clean zero — rendering it as
    // count:0 would hide a broken count path behind the no-badge state. Only a real number is "ok".
    if (typeof count !== "number") return { kind: "infra_error" };
    return { kind: "ok", count };
  } catch {
    return { kind: "infra_error" };
  }
}
