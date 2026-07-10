import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type SetFieldOverrideParams = {
  p_drive_file_id: string;
  p_op: "upsert" | "revert" | "repoint" | "discard";
  p_domain: "show" | "crew" | "hotel";
  p_field: string;
  p_match_key: string;
  p_new_match_key: string | null;
  p_override_value: unknown;
  p_actor: string;
  p_expected_version: number | null;
  p_expected_current_value: unknown;
  p_current_ordinal: number | null;
  p_expected_live_hotel_name: string | null;
};
type Deps = { createClient?: typeof createSupabaseServiceRoleClient };
export type SetFieldOverrideResult = { ok: true; value: unknown } | { ok: false; code: string };

export async function setFieldOverride(
  params: SetFieldOverrideParams,
  deps?: Deps,
): Promise<SetFieldOverrideResult> {
  const client = (deps?.createClient ?? createSupabaseServiceRoleClient)();
  // not-subject-to-meta: lib/overrides is not an auth-domain surface (_metaInfraContract roots are
  // lib/auth,app/auth,app/api/auth,app/api/show); this call-site still honors invariant 9 explicitly.
  const { data, error } = await client.rpc("set_field_override", params);
  // R3b-6: a helper-raised stale target surfaces as Postgres SQLSTATE 40001 (PostgREST puts it on
  // error.code) — map it to the stale-review contract, NOT infra; every OTHER error is a genuine fault.
  if (error)
    return {
      ok: false,
      code: error.code === "40001" ? "OVERRIDE_STALE_REVIEW" : "SYNC_INFRA_ERROR",
    };
  const d = data as { ok?: boolean; code?: string; value?: unknown } | null;
  if (d && d.ok === false) return { ok: false, code: d.code ?? "SYNC_INFRA_ERROR" };
  if (d && d.ok === true) return { ok: true, value: d.value };
  return { ok: false, code: "SYNC_INFRA_ERROR" };
}
