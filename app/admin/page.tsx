/**
 * app/admin/page.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Wizard-mode `/admin` routing with the full Phase 2 dispatcher. Calls
 * the §A Pin-1 helper `purgeAndRotateIfStale` (which may rotate the
 * wizard session if `pending_wizard_session_at` is past 24h with no
 * in-flight finalize checkpoint, OR may suppress the auto-rotate when
 * a multi-batch finalize is pending), then dispatches on the
 * post-mutation settings + wizard_finalize_checkpoints status.
 *
 * Precedence (deterministic, top-down):
 *   1. settings.pending_wizard_session_id is NON-null →
 *      query wizard_finalize_checkpoints for that session and branch:
 *        - 'in_progress'                          → <FinalizeInProgress />
 *        - 'all_batches_complete' (fresh < 24h)   → <ReadyToPublish />
 *        - 'all_batches_complete' (stale ≥ 24h)   → <StaleReadyToPublish />
 *        - 'final_cas_done'                       → Dashboard (defensive)
 *        - null (no checkpoint yet)                → <OnboardingWizard />
 *   2. settings.watched_folder_id IS NULL         → <OnboardingWizard />
 *      (first-visit fresh; no session minted yet)
 *   3. otherwise                                  → Dashboard placeholder
 *
 * Fresh-settings invariant (spec §9.0): we pass `result.settings` into
 * the dispatcher, never a pre-call capture from app_settings.
 *
 * Render-time staleness check (Finding 3) is informational only. The
 * destructive CleanupAbandonedFinalize action is gated by the helper's
 * DB-clock CAS (Task 10.1 finding 1 helper guards 3 + 4); app-vs-DB
 * clock skew at the 24h boundary can flicker the rendered surface but
 * cannot authorize destructive action against a fresh checkpoint.
 *
 * No build-gated routes reachable from this page (memory
 * `feedback_build_gated_routes_never_fallback_target`).
 */
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { purgeAndRotateIfStale } from "@/lib/onboarding/sessionLifecycle";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { FinalizeInProgress } from "@/components/admin/FinalizeInProgress";
import { ReadyToPublish } from "@/components/admin/ReadyToPublish";
import { StaleReadyToPublish } from "@/components/admin/StaleReadyToPublish";
import { Dashboard } from "@/components/admin/Dashboard";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import {
  readFinalizeCheckpoint,
  isCheckpointStale,
  isInfraError,
} from "@/app/admin/_finalizeCheckpoint";
import { nowDate } from "@/lib/time/now";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · FXAV" };

type AdminPageProps = {
  searchParams: Promise<{ step?: string; show_finalize?: string; bucket?: string }>;
};

function CheckpointInfraErrorPlaceholder() {
  return (
    <main
      data-testid="admin-checkpoint-infra-error"
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
          We could not read your setup state.
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          The admin database query failed. Refresh in a moment. If this keeps
          happening, contact the developer.
        </p>
      </header>
    </main>
  );
}

/**
 * Task 4.1: the Dashboard surface's single title source is the shared
 * <AdminPageHeader>, rendered ABOVE <Dashboard/>. Dashboard.tsx no longer
 * renders its own <h2>Dashboard</h2> + sub line. Both Dashboard-dispatch
 * return sites (settled steady-state + the defensive final_cas_done branch)
 * route through this wrapper so the header is the one canonical heading.
 */
function DashboardWithHeader({ bucket }: { bucket?: "active" | "archived" }) {
  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        sub="Your live shows and anything that needs review."
      />
      <Dashboard {...(bucket ? { bucket } : {})} />
    </>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdmin();

  const result = await purgeAndRotateIfStale();
  const settings = result.settings;
  const sp = await searchParams;
  // §3.1 — the dashboard show-list segment is a URL search-param threaded into
  // <Dashboard>. Only "archived" is meaningful; anything else (incl. absent)
  // defaults to the Active segment.
  const dashboardBucket: "active" | "archived" =
    sp.bucket === "archived" ? "archived" : "active";

  // Precedence 1: wizard session minted — read the checkpoint to decide
  // which surface to render (finalize re-entry or wizard inline).
  if (settings.pending_wizard_session_id !== null) {
    const checkpoint = await readFinalizeCheckpoint(
      settings.pending_wizard_session_id,
    );
    if (isInfraError(checkpoint)) {
      return <CheckpointInfraErrorPlaceholder />;
    }
    if (checkpoint !== null) {
      if (checkpoint.status === "in_progress") {
        return (
          <FinalizeInProgress
            sessionId={settings.pending_wizard_session_id}
            batchesCompleted={checkpoint.batches_completed}
            {...(checkpoint.last_processed_at !== null
              ? { lastProcessedAt: checkpoint.last_processed_at }
              : {})}
          />
        );
      }
      if (checkpoint.status === "all_batches_complete") {
        // M11 Phase C (C.2 extension): render-side staleness decision
        // honors the request-scoped time utility so screenshot-frozen-now
        // requests produce deterministic surface choice.
        const now = await nowDate();
        if (isCheckpointStale(checkpoint.last_processed_at, now)) {
          return (
            <StaleReadyToPublish
              sessionId={settings.pending_wizard_session_id}
            />
          );
        }
        return (
          <ReadyToPublish sessionId={settings.pending_wizard_session_id} />
        );
      }
      if (checkpoint.status === "final_cas_done") {
        // Defensive — Phase D atomically clears pending_wizard_session_id,
        // so observing this state with a non-null session id means an
        // inconsistent snapshot. Render Dashboard explicitly per plan
        // §M10 Task 10.1 finding 2 dispatch logic rather than strand the
        // operator on a wizard surface.
        return <DashboardWithHeader bucket={dashboardBucket} />;
      }
    }
    // No checkpoint yet → wizard pre-finalize (steps 1/2/3, possibly mid-Apply).
    return (
      <OnboardingWizard
        settings={settings}
        searchParams={sp.step !== undefined ? { step: sp.step } : {}}
      />
    );
  }

  // Precedence 2: first-visit fresh — no session minted, no folder either.
  if (settings.watched_folder_id === null) {
    return (
      <OnboardingWizard
        settings={settings}
        searchParams={sp.step !== undefined ? { step: sp.step } : {}}
      />
    );
  }

  // Precedence 3: settled (post-onboarding steady state).
  return <DashboardWithHeader bucket={dashboardBucket} />;
}
