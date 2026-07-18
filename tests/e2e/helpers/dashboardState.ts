/**
 * tests/e2e/helpers/dashboardState.ts (admin-show-modal Task 12)
 *
 * Settle the admin dashboard for specs that exercise `/admin?show=<slug>`:
 * the review modal mounts ONLY on the settled DashboardWithHeader branch
 * (app/admin/page.tsx — wizard-mode ignores `?show`, spec §3). The shared
 * local DB's `app_settings` row may be in the fresh/wizard state
 * (`watched_folder_id` NULL or a pending wizard session), so callers settle
 * it in beforeAll and restore the prior state in afterAll.
 *
 * Pattern from tests/e2e/deep-link-walker.spec.ts `setDashboardAdminState()`,
 * plus capture/restore so sibling specs that depend on the prior state are
 * not polluted (single-worker suite — no concurrent writers).
 *
 * AGENTS invariant 9: every call destructures { data, error } and throws with
 * context — a silent failed update would strand the dashboard in wizard mode
 * and fail every modal spec with an opaque "modal not visible".
 */
import { admin } from "./supabaseAdmin";

const FIELDS = [
  "watched_folder_id",
  "watched_folder_name",
  "watched_folder_set_by_email",
  "watched_folder_set_at",
  "pending_folder_id",
  "pending_folder_name",
  "pending_folder_set_by_email",
  "pending_folder_set_at",
  "pending_wizard_session_id",
  "pending_wizard_session_at",
] as const;

/** Put app_settings into the settled post-onboarding state; returns a restore
 *  function that writes the captured prior values back (call in afterAll). */
export async function settleDashboardAdminState(): Promise<() => Promise<void>> {
  const { data, error } = await admin
    .from("app_settings")
    .select(FIELDS.join(", "))
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`settleDashboardAdminState read failed: ${error.message}`);
  const prior = (data ?? null) as Record<string, unknown> | null;

  const { error: upErr } = await admin
    .from("app_settings")
    .update({
      watched_folder_id: "seed-fixture-folder",
      watched_folder_name: "Seed fixture folder",
      watched_folder_set_by_email: "seed-mode@fxav.local",
      watched_folder_set_at: "2026-01-01T12:00:00.000Z",
      pending_folder_id: null,
      pending_folder_name: null,
      pending_folder_set_by_email: null,
      pending_folder_set_at: null,
      pending_wizard_session_id: null,
      pending_wizard_session_at: null,
    })
    .eq("id", "default");
  if (upErr) throw new Error(`settleDashboardAdminState update failed: ${upErr.message}`);

  return async () => {
    if (prior === null) return; // no row existed; nothing to restore
    const { error: restoreErr } = await admin
      .from("app_settings")
      .update(prior)
      .eq("id", "default");
    if (restoreErr)
      throw new Error(`settleDashboardAdminState restore failed: ${restoreErr.message}`);
  };
}
