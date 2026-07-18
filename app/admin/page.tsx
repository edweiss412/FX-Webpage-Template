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
 *        - 'in_progress'                          → unified Step-3 (checkpointStatus,
 *                                                    Resume footer)
 *        - 'all_batches_complete' (fresh or stale) → unified Step-3 (checkpointStatus,
 *                                                    Finish footer; stale → note + Cleanup)
 *        - 'final_cas_done'                       → Dashboard (defensive)
 *        - null (no checkpoint yet)                → <OnboardingWizard />
 *
 *      Step-3 consolidation (spec §4.5/§4.6): all non-terminal checkpoints render
 *      the SAME <OnboardingWizard> forced to step 3 — the three standalone
 *      interstitials (FinalizeInProgress / ReadyToPublish / StaleReadyToPublish)
 *      are retired.
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
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { purgeAndRotateIfStale } from "@/lib/onboarding/sessionLifecycle";
import { readAppSettingsRow } from "@/lib/appSettings/readAppSettingsRow";
import { OnboardingWizard } from "@/components/admin/OnboardingWizard";
import { Dashboard } from "@/components/admin/Dashboard";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import {
  readFinalizeCheckpoint,
  isCheckpointStale,
  isInfraError,
} from "@/app/admin/_finalizeCheckpoint";
import { readScanManifestCount } from "@/app/admin/_scanManifestCount";
import { nowDate } from "@/lib/time/now";
import { ShowReviewModal } from "@/app/admin/_showReviewModal";
import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";
import { firstParam } from "@/lib/admin/showModalParams";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · FXAV" };

type AdminPageProps = {
  searchParams: Promise<{
    step?: string;
    show_finalize?: string;
    bucket?: string;
    show?: string | string[];
    alert_id?: string | string[];
  }>;
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
          This is usually temporary. Refresh in a moment. If it keeps happening, contact the
          developer.
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
 *
 * bell notification center §8: the global AlertBanner (and its `<div id="alerts">`
 * queue-chip scroll target) is RETIRED. Unresolved admin alerts now surface in
 * the <NotifBell> panel in the nav, so the dashboard renders straight from the
 * page header into the stat cards with no banner slot.
 */
function DashboardWithHeader({
  bucket,
  folderName,
}: {
  bucket?: "active" | "archived";
  folderName?: string | null;
}) {
  return (
    <>
      <AdminPageHeader title="Dashboard" sub="Your live shows and anything that needs review." />
      {/* alert-audience-split §6.5 originally rendered an ambient AppHealthPanel
          strip here. It was retired: the nav AppHealthIndicator already escalates
          health-audience alerts ("nothing goes dark") and reveals the same rollup
          detail on click (developer deep-link / Doug popover), so the strip was a
          redundant second affordance. */}
      <Dashboard {...(bucket ? { bucket } : {})} folderName={folderName ?? null} />
    </>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  await requireAdmin();

  // nav-perf phase 1 (A2): purgeAndRotateIfStale opens a postgres.js transaction
  // on EVERY /admin render, but it is a no-op unless `pending_wizard_session_at`
  // is non-null (a stale wizard session pending rotation). The steady-state
  // dashboard always has it NULL, so gate the heavier tx behind a single
  // full-row read: if the cheap read confirms NULL, reuse those settings and
  // SKIP the tx; otherwise (a session IS pending, OR the cheap read itself hit
  // an infra fault) fall back to the original always-call behavior so a degraded
  // read can NEVER produce a false "settled" render against a stale session.
  let settings: Awaited<ReturnType<typeof purgeAndRotateIfStale>>["settings"];
  let preRead: Awaited<ReturnType<typeof readAppSettingsRow>>;
  try {
    preRead = await readAppSettingsRow();
  } catch {
    // readAppSettingsRow is contractually total, but treat any thrown fault as a
    // degraded read → fall back to the always-call behavior (no false settled).
    preRead = { kind: "infra_error" };
  }
  if (preRead.kind === "value" && preRead.settings.pending_wizard_session_at === null) {
    settings = preRead.settings;
  } else {
    const result = await purgeAndRotateIfStale();
    settings = result.settings;
  }
  const sp = await searchParams;
  // §3.1 — the dashboard show-list segment is a URL search-param threaded into
  // <Dashboard>. Only "archived" is meaningful; anything else (incl. absent)
  // defaults to the Active segment.
  const dashboardBucket: "active" | "archived" = sp.bucket === "archived" ? "archived" : "active";

  // admin-show-modal §4: `?show=<slug>` mounts the published review modal OVER
  // the settled dashboard (DashboardWithHeader branches ONLY — the wizard
  // surfaces below ignore it). §6.2 guard table via firstParam(): empty string
  // or absent → no modal; repeated param → first element wins. The dashboard
  // paints immediately; the loader streams behind the skeleton frame.
  const showSlug = firstParam(sp.show);
  const showReviewModal = showSlug ? (
    <Suspense fallback={<ShowReviewModalSkeleton />}>
      <ShowReviewModal slug={showSlug} alertId={firstParam(sp.alert_id)} />
    </Suspense>
  ) : null;

  // Precedence 1: wizard session minted — read the checkpoint to decide
  // which surface to render (finalize re-entry or wizard inline).
  if (settings.pending_wizard_session_id !== null) {
    const checkpoint = await readFinalizeCheckpoint(settings.pending_wizard_session_id);
    if (isInfraError(checkpoint)) {
      return <CheckpointInfraErrorPlaceholder />;
    }
    if (checkpoint !== null) {
      // Step-3 consolidation (spec §4.5/§4.6): the mid-finalize (in_progress) and
      // post-batch (all_batches_complete) checkpoints render the SAME unified
      // Step-3 review surface as pre-finalize — forced to step 3 — with a
      // checkpoint-aware footer (Resume / Finish + Cleanup) and badge-only rows.
      // This replaces the three standalone interstitials (FinalizeInProgress /
      // ReadyToPublish / StaleReadyToPublish). Staleness is computed here against
      // the request-scoped clock so screenshot-frozen-now requests are deterministic.
      if (checkpoint.status === "in_progress" || checkpoint.status === "all_batches_complete") {
        const isStale =
          checkpoint.status === "all_batches_complete" &&
          isCheckpointStale(checkpoint.last_processed_at, await nowDate());
        return (
          <OnboardingWizard
            settings={settings}
            searchParams={{ step: "3" }}
            hasReviewableScan={true}
            checkpointStatus={checkpoint.status}
            isStale={isStale}
          />
        );
      }
      if (checkpoint.status === "final_cas_done") {
        // Defensive — Phase D atomically clears pending_wizard_session_id,
        // so observing this state with a non-null session id means an
        // inconsistent snapshot. Render Dashboard explicitly per plan
        // §M10 Task 10.1 finding 2 dispatch logic rather than strand the
        // operator on a wizard surface.
        return (
          <>
            <DashboardWithHeader
              bucket={dashboardBucket}
              folderName={settings.watched_folder_name}
            />
            {showReviewModal}
          </>
        );
      }
    }
    // No checkpoint yet → wizard pre-finalize (steps 1/2/3, possibly mid-Apply).
    // The session id is non-null here but may carry an EMPTY manifest (Start Over
    // rotated, or a failed/0-sheet scan), so resolve the honest "scan produced
    // reviewable rows" signal that gates the wizard's forward/resume affordances.
    // A degraded read falls back to false (never advertise a stale resume).
    const manifestCount = await readScanManifestCount(settings.pending_wizard_session_id);
    const hasReviewableScan = manifestCount.kind === "value" && manifestCount.count > 0;
    return (
      <OnboardingWizard
        settings={settings}
        searchParams={sp.step !== undefined ? { step: sp.step } : {}}
        hasReviewableScan={hasReviewableScan}
      />
    );
  }

  // Precedence 2: first-visit fresh — no session minted, no folder either. With
  // no session there is no manifest, so a scan can never be "reviewable" here.
  if (settings.watched_folder_id === null) {
    return (
      <OnboardingWizard
        settings={settings}
        searchParams={sp.step !== undefined ? { step: sp.step } : {}}
        hasReviewableScan={false}
      />
    );
  }

  // Precedence 3: settled (post-onboarding steady state). Thread the watched
  // Drive folder name so the shows table is titled with it (matches the
  // defensive final_cas_done branch above) — the everyday dashboard render path.
  return (
    <>
      <DashboardWithHeader bucket={dashboardBucket} folderName={settings.watched_folder_name} />
      {showReviewModal}
    </>
  );
}
