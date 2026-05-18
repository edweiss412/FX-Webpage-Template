/**
 * app/admin/page.tsx (M10 §B Task 10.1 §B / Phase 1)
 *
 * Phase 1 of the wizard-mode `/admin` routing. Calls the §A Pin-1
 * helper `purgeAndRotateIfStale` (which may rotate the wizard session
 * if `pending_wizard_session_at` is past 24h with no in-flight finalize
 * checkpoint, OR may suppress the auto-rotate when a multi-batch
 * finalize is pending), then dispatches on the post-mutation settings:
 *
 *   1. result.suppressed === 'WIZARD_FINALIZE_BATCHES_PENDING' OR
 *      ?show_finalize=true                            -> FinalizeReentry
 *      stub (Phase 1 placeholder; Phase 2 splits into
 *      FinalizeInProgress / ReadyToPublish / StaleReadyToPublish).
 *   2. settings.watched_folder_id IS NULL OR
 *      settings.pending_wizard_session_id IS NOT NULL -> OnboardingWizard.
 *   3. Otherwise                                       -> Dashboard stub
 *      (Phase 3 ships the real Dashboard, panels, alerts banner).
 *
 * Fresh-settings invariant (spec §9.0): we pass `result.settings` into
 * the dispatcher, never a pre-call capture from app_settings. The
 * helper returns the post-mutation row read inside the same SQL
 * transaction as the rotate/purge, so the dispatch decision reflects
 * authoritative state regardless of whether the rotate fired.
 *
 * Admin gate: requireAdmin() runs at the layout level (M5 §B Task 5.9);
 * we re-call here defensively so a direct-render path that bypassed
 * the layout (future routing change) still gates correctly.
 *
 * No build-gated routes are reachable from this page (memory
 * `feedback_build_gated_routes_never_fallback_target`): the Phase 1
 * placeholders link to `/admin/settings` and to the wizard URL itself
 * (`/admin`), both of which exist in every production build.
 */
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { purgeAndRotateIfStale } from "@/lib/onboarding/sessionLifecycle";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · FXAV" };

type AdminPageProps = {
  searchParams: Promise<{ step?: string; show_finalize?: string }>;
};

function DashboardPhase1Placeholder() {
  return (
    <main
      data-testid="admin-dashboard-placeholder"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">
          Setup is complete
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          Your Drive folder is connected and the live sync is running.
          Dashboard is coming in the next phase.
        </p>
      </header>
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad">
        <h3 className="text-lg font-semibold text-text-strong">
          What you can do today
        </h3>
        <ul className="flex flex-col gap-2 text-base text-text">
          <li>
            <Link
              href="/admin/settings"
              data-testid="admin-dashboard-placeholder-settings-link"
              className="text-accent-on-bg underline-offset-2 hover:underline"
            >
              Open settings
            </Link>
            <span className="text-text-subtle">
              {" "}
              to re-run setup or manage administrators.
            </span>
          </li>
        </ul>
      </div>
    </main>
  );
}

function FinalizeReentryPhase1Placeholder() {
  return (
    <main
      data-testid="admin-finalize-reentry-placeholder"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">
          A setup is in progress
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          The previous setup wizard was paused while it was publishing
          sheets to the live folder. The full resume-and-publish surface is
          coming in the next phase. For now, please wait or contact the
          developer.
        </p>
      </header>
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad">
        <p className="max-w-prose text-sm text-text-subtle">
          You can still open the settings page to manage administrators.
        </p>
        <Link
          href="/admin/settings"
          data-testid="admin-finalize-reentry-placeholder-settings-link"
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-base font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open settings
        </Link>
      </div>
    </main>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdmin();

  const result = await purgeAndRotateIfStale();
  const settings = result.settings;
  const sp = await searchParams;

  // Precedence 1: finalize re-entry / suppressed auto-rotate.
  //
  // `result.suppressed` is the authoritative server signal — purgeAndRotateIfStale
  // emits it inside the SQL transaction when a wizard_finalize_checkpoints row
  // with batches_completed > 0 exists for the current pending session.
  //
  // The `?show_finalize=true` URL hint is set by rerunSetupServerAction's
  // suppression branch (which uses a checkpoint-existence predicate, NOT a
  // staleness predicate, so it can fire even when purgeAndRotateIfStale here
  // does not). To preserve that signal WITHOUT letting a hand-edited URL force
  // a false finalize state on a truly fresh or settled admin, the hint is
  // accepted only when there is actually a pending wizard session
  // (pending_wizard_session_id non-null) — otherwise it is ignored and the
  // page falls through to the wizard or dashboard branch. Phase 2 will replace
  // this URL-hint shim with a direct wizard_finalize_checkpoints query.
  const suppressed =
    "suppressed" in result &&
    result.suppressed === "WIZARD_FINALIZE_BATCHES_PENDING";
  const finalizeHint =
    sp.show_finalize === "true" && settings.pending_wizard_session_id !== null;
  if (suppressed || finalizeHint) {
    return <FinalizeReentryPhase1Placeholder />;
  }

  // Precedence 2: wizard mode (first-visit OR re-run-setup mid-flight).
  if (
    settings.watched_folder_id === null ||
    settings.pending_wizard_session_id !== null
  ) {
    return (
      <OnboardingWizard
        settings={settings}
        searchParams={sp.step !== undefined ? { step: sp.step } : {}}
      />
    );
  }

  // Precedence 3: settled — Phase 1 dashboard stub.
  return <DashboardPhase1Placeholder />;
}
