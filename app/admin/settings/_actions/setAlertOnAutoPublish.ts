/**
 * app/admin/settings/_actions/setAlertOnAutoPublish.ts (M12.13 §4.5, R26)
 *
 * Admin-gated write of the "Email me when a show publishes itself" toggle.
 * Mirrors setAlertOnSyncProblems.ts VERBATIM (only the column + result-type
 * name change). requireAdmin() FIRST (defense-in-depth at the Server Action
 * boundary) → UPDATE the `app_settings` singleton (`id='default'`). The
 * AUTHORITATIVE gate is the table's `admin_only` RLS — we write through the
 * SESSION-bound client so RLS evaluates `is_admin()` on the caller; a non-admin
 * update matches zero rows.
 *
 * Supabase call-boundary discipline (invariant 9): the UPDATE destructures
 * `{ data, error }`; a returned `error` OR an RLS-denied zero-row update both
 * surface as `{ ok: false }` (the UI keeps its prior visual state + prompts a
 * refresh — never a silent false "saved"). requireAdmin() throwing AdminInfraError
 * propagates to the cataloged 500 boundary (not swallowed). On success →
 * revalidatePath so the page re-reads the new value.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetAlertOnAutoPublishResult = { ok: true } | { ok: false };

export async function setAlertOnAutoPublish(next: boolean): Promise<SetAlertOnAutoPublishResult> {
  // Defense-in-depth gate. AdminInfraError propagates to the catalog 500 boundary
  // (invariant 9 — infra faults are never swallowed into a benign action result);
  // a non-admin identity throws here before any write.
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  // not-subject-to-meta: server-action WRITE, not a sync-pipeline read boundary.
  // { data, error } + zero-row RLS-denied both → { ok: false }; the app_settings
  // admin_only RLS is the authoritative gate (mirrors setAlertOnSyncProblems.ts).
  const { data, error } = await supabase
    .from("app_settings")
    .update({ alert_on_auto_publish: next })
    .eq("id", "default")
    .select("id");

  if (error) {
    return { ok: false };
  }
  if (!data || data.length === 0) {
    return { ok: false };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
