/**
 * app/admin/settings/_actions/setDailyReviewDigest.ts (M12.2 Phase B3 Task 6.1 — spec §7.1, AC-B3.10)
 *
 * Admin-gated write of the "Daily review digest" notification toggle. Mirrors
 * setAutoPublish.ts VERBATIM (only the column + result-type name change).
 * requireAdmin() FIRST → UPDATE the `app_settings` singleton (`id='default'`)
 * through the SESSION-bound client so the table's `admin_only` RLS evaluates
 * `is_admin()` on the caller (a non-admin update matches zero rows).
 *
 * Supabase call-boundary discipline (invariant 9): `{ data, error }`; a returned
 * `error` OR an RLS-denied zero-row update both surface as `{ ok: false }` (the
 * UI keeps its prior state + prompts a refresh — never a silent false "saved").
 * requireAdmin() throwing AdminInfraError propagates to the cataloged 500 boundary.
 * On success → revalidatePath so the page re-reads the new value.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetDailyReviewDigestResult = { ok: true } | { ok: false };

export async function setDailyReviewDigest(
  next: boolean,
): Promise<SetDailyReviewDigestResult> {
  // Defense-in-depth gate. AdminInfraError propagates to the catalog 500 boundary
  // (invariant 9); a non-admin identity throws here before any write.
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  // not-subject-to-meta: server-action WRITE, not a sync-pipeline read boundary.
  // { data, error } + zero-row RLS-denied both → { ok: false }; the app_settings
  // admin_only RLS is the authoritative gate (mirrors setAutoPublish.ts).
  const { data, error } = await supabase
    .from("app_settings")
    .update({ daily_review_digest: next })
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
