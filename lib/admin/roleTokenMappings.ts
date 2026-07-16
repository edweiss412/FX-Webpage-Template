/**
 * lib/admin/roleTokenMappings.ts
 *
 * Read side for the settings "Roles you've added" page (spec 2026-07-15 §8.2).
 * Lists every `role_token_mappings` row through the service-role client
 * (the table is REVOKEd from anon/authenticated, §3), sanitizes each row through
 * the single normalize boundary (`normalizeRoleTokenMappings` — corrupt rows
 * dropped, never thrown), and returns a typed result. A returned/thrown infra
 * fault surfaces as `{ kind: "infra_error" }` (invariant 9) so the page can render
 * an explicit load-failure state and NEVER a masked empty state.
 *
 * not-subject-to-meta: `lib/admin` is outside the AUTH_DOMAIN_ROOTS the
 * `_metaInfraContract` walker owns (["lib/auth","app/auth","app/api/auth","app/api/show"]);
 * the `{ data, error }` boundary + typed-fault mapping below satisfies invariant 9
 * directly and is exercised by the settings-page render tests.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { normalizeRoleTokenMappings, type RoleTokenMapping } from "@/lib/sync/roleMappingOverlay";

export type RoleMappingListResult =
  | { kind: "ok"; rows: RoleTokenMapping[] }
  | { kind: "infra_error" };

export async function listRoleTokenMappings(): Promise<RoleMappingListResult> {
  let svc: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    svc = createSupabaseServiceRoleClient();
  } catch {
    return { kind: "infra_error" };
  }

  try {
    const { data, error } = await svc
      .from("role_token_mappings")
      .select("token, grants, decided_by, decided_at")
      .order("decided_at", { ascending: false });
    if (error) return { kind: "infra_error" };
    return { kind: "ok", rows: normalizeRoleTokenMappings(data ?? []) };
  } catch {
    return { kind: "infra_error" };
  }
}
