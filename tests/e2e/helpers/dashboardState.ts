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

/**
 * The INVERSE: put `app_settings` into the first-visit fresh state so `/admin`
 * renders `OnboardingWizard` rather than the dashboard. Returns a restore
 * function that writes the captured prior values back (call in afterAll).
 *
 * Needed because `pnpm db:seed` sets `watched_folder_id` (`supabase/seed.ts`
 * `appSettingsSeedSql`), and `app/admin/page.tsx` precedence 2 mounts the wizard
 * only when that column is NULL — so on a seeded stack the wizard's step-indicator
 * connector is simply ABSENT, for a local run and for the workflow run alike. A
 * dimension spec that navigated to `/admin` and measured would be measuring
 * nothing.
 *
 * Nulls all ten fields the settle direction manages, so precedence 1 (a pending
 * wizard session) cannot win either — with a session present `/admin` takes the
 * finalize/checkpoint branch, which is a different surface without the connector.
 *
 * Single-worker suite, so capture/restore is safe: no concurrent writer.
 */
export async function enterWizardAdminState(): Promise<() => Promise<void>> {
  // not-subject-to-meta: e2e test scaffolding — a returned error is converted to an
  // immediate throw that aborts the spec, so there is no infra-vs-benign ambiguity left to
  // type; the thrown message carries the query context and the db:seed remedy.
  const { data, error } = await admin
    .from("app_settings")
    .select(FIELDS.join(", "))
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(`enterWizardAdminState read failed: ${error.message}`);
  const prior = (data ?? null) as Record<string, unknown> | null;
  if (prior === null) {
    throw new Error(
      "enterWizardAdminState: no app_settings row (run `pnpm db:seed` first) — with no row to " +
        "restore, this helper would leave the shared local DB in a state it did not create.",
    );
  }
  // A prior state where EVERY managed field is already null is the signature of a previous
  // run that was hard-aborted between the update and its `afterAll` restore. Capturing it
  // and "restoring" it later would make the strand permanent and self-perpetuating, so it
  // is refused loudly with the remedy instead.
  if (FIELDS.every((field) => prior[field] === null)) {
    throw new Error(
      "enterWizardAdminState: app_settings already has ALL ten managed fields null. That is " +
        "the fingerprint of a previous run that died between the update and its restore, not " +
        "a state this helper may capture — restoring it later would make the strand permanent. " +
        "Re-seed first: `pnpm db:seed`.",
    );
  }

  // not-subject-to-meta: e2e test scaffolding — see the waiver on the read above.
  const { error: upErr } = await admin
    .from("app_settings")
    .update(Object.fromEntries(FIELDS.map((field) => [field, null])))
    .eq("id", "default");
  if (upErr) throw new Error(`enterWizardAdminState update failed: ${upErr.message}`);

  return async () => {
    // not-subject-to-meta: e2e test scaffolding — see the waiver on the read above.
    const { error: restoreErr } = await admin
      .from("app_settings")
      .update(prior)
      .eq("id", "default");
    if (restoreErr) throw new Error(`enterWizardAdminState restore failed: ${restoreErr.message}`);
  };
}
