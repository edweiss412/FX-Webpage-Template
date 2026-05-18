/**
 * app/admin/settings/page.tsx (M10 §B Task 10.1 §B / Phase 1)
 *
 * Post-onboarding settings landing. Phase 1 ships ONE affordance —
 * "Re-run Setup" — wired to the §A `rerunSetupServerAction` (Pin-1
 * export). The full settings surface (folder rebind, watch-channel
 * status, signing-key rotation, etc.) lands in Phase 3.
 *
 * Per spec §9.0:
 *   "After onboarding succeeds the [pre-onboarding 'Start over']
 *    affordance disappears — restart goes through `/admin/settings`
 *    instead."
 *
 * `rerunSetupServerAction` (lib/onboarding/serverActions.ts):
 *   - admin-gates via requireAdminIdentity
 *   - rotates pending_wizard_session_id + purges stale wizard rows
 *     unless a multi-batch finalize is in flight, in which case the
 *     action redirects to /admin?show_finalize=true so the operator
 *     resumes the finalize first.
 *
 * The Administrators link below is preserved from the prior M9 admin
 * landing so /admin/settings/admins/ remains reachable now that this
 * page is the canonical settings surface.
 *
 * The layout gates admin access; we still re-call requireAdmin here
 * defensively, matching the pattern in app/admin/dev/page.tsx so a
 * direct-render path (future routing change) can never bypass it.
 */
import Link from "next/link";
import { rerunSetupServerAction } from "@/lib/onboarding/serverActions";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Admin · FXAV" };

export default async function AdminSettingsPage() {
  await requireAdmin();

  return (
    <main
      data-testid="admin-settings-page"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin settings
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">
          Settings
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          Manage who can administer the app and how its connection to your
          Drive folder is set up.
        </p>
      </header>

      <section
        data-testid="admin-settings-rerun-setup-section"
        aria-labelledby="admin-settings-rerun-setup-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h3
          id="admin-settings-rerun-setup-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Re-run setup
        </h3>
        <p className="max-w-prose text-sm text-text-subtle">
          Start the setup wizard again to change the Drive folder the app
          syncs from. The live folder keeps syncing while the new wizard
          runs; the swap happens only after you finish.
        </p>
        <form
          data-testid="admin-settings-rerun-setup-form"
          data-action="rerunSetupServerAction"
          action={rerunSetupServerAction}
          className="flex"
        >
          <button
            type="submit"
            data-testid="admin-settings-rerun-setup-button"
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Re-run setup
          </button>
        </form>
      </section>

      <section
        data-testid="admin-settings-admins-section"
        aria-labelledby="admin-settings-admins-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h3
          id="admin-settings-admins-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Administrators
        </h3>
        <p className="max-w-prose text-sm text-text-subtle">
          Add or revoke who can view and edit show data.
        </p>
        <Link
          data-testid="admin-settings-admins-link"
          href="/admin/settings/admins"
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-base font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Manage administrators
        </Link>
      </section>
    </main>
  );
}
