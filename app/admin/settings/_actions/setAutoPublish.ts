/**
 * app/admin/settings/_actions/setAutoPublish.ts (M12.2 Phase B2 Task 8.1 — spec §4, §5.1, AC-B2.14)
 *
 * Admin-gated write of the auto-publish-clean-first-seen toggle. requireAdmin()
 * FIRST (defense-in-depth at the Server Action boundary) → UPDATE the
 * `app_settings` singleton (`id='default'`). The AUTHORITATIVE gate is the
 * table's `admin_only` RLS (rls_policies.sql:131-137) — this table is NOT
 * RPC/grant-locked (§5.1); we write through the SESSION-bound client so RLS
 * evaluates `is_admin()` on the caller. A non-admin's update would match zero
 * rows under RLS even if requireAdmin() were somehow bypassed (the real-DB
 * RLS test, tests/db/auto-publish-toggle-rls.test.ts, pins this).
 *
 * Supabase call-boundary discipline (invariant 9): the UPDATE destructures
 * `{ data, error }`; a returned `error` (or a row-miss → no rows updated, e.g.
 * RLS denied) surfaces as `{ ok: false }` (the UI keeps the prior visual state
 * and prompts a refresh — it does NOT silently report success). requireAdmin()
 * throwing AdminInfraError propagates to the cataloged 500 boundary (NOT
 * swallowed into a benign result). Registered in the auth/sync infra meta-test
 * (§8) — see the inline not-subject-to-meta justification below.
 *
 * On success → revalidatePath so the page re-reads the new value and the toggle
 * reflects it.
 */
"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SetAutoPublishResult = { ok: true } | { ok: false };

export async function setAutoPublish(next: boolean): Promise<SetAutoPublishResult> {
  // Defense-in-depth gate. AdminInfraError propagates to the catalog 500
  // boundary (invariant 9 — infra faults are never swallowed into a benign
  // action result); a non-admin identity throws here before any write.
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  // not-subject-to-meta: this is a server-action WRITE, not a sync-pipeline read
  // boundary. It destructures { data, error } per invariant 9; a returned error
  // OR an RLS-denied zero-row update both resolve to { ok: false } (the UI keeps
  // its prior state + prompts refresh). The authoritative write gate is the
  // app_settings admin_only RLS (§5.1), pinned by the real-DB RLS test.
  const { data, error } = await supabase
    .from("app_settings")
    .update({ auto_publish_clean_first_seen: next })
    .eq("id", "default")
    .select("id");

  if (error) {
    return { ok: false };
  }
  // A zero-row result means the singleton was not updated (RLS denied or the
  // row is missing) — treat as a non-success so the UI never claims a flip that
  // didn't land.
  if (!data || data.length === 0) {
    return { ok: false };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
