import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

export type AlertCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };

// Mirror AlertBanner's exclusion: info-severity codes are notices, not banner-raising.
const INFO_SEVERITY_CODES: string[] = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
  .filter((entry) => entry.severity === "info")
  .map((entry) => entry.code);

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
    if (INFO_SEVERITY_CODES.length > 0) {
      q = q.not("code", "in", `(${INFO_SEVERITY_CODES.map((c) => `"${c}"`).join(",")})`);
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
