/**
 * app/admin/layout.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Wraps every route under /admin/* (currently /admin/dev; future:
 * /admin/alerts, /admin/reports, etc.). Responsibility:
 *
 *   1. Calls requireAdmin() at the layout level. Next 16 App Router runs
 *      layouts before child pages, so the build-time + auth gates apply
 *      to every admin route — defense-in-depth on top of the per-page
 *      requireAdmin() call already inside /admin/dev/page.tsx (which
 *      stays for the same reason every Server Action also gates: a
 *      direct page-render path could otherwise bypass the layout in
 *      future routing changes).
 *
 * Visual chrome (DESIGN.md §1):
 *   - Centered max-width container, p-6 outer padding.
 *   - Header: "Admin" wordmark in font-semibold, mb-section-gap below.
 *
 * Server Component (no 'use client').
 */
import type { ReactNode } from "react";
import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import { OnboardingTopBar } from "@/components/admin/nav/OnboardingTopBar";
import { PageTransition } from "@/components/layout/PageTransition";
import { readAppSettingsRow } from "@/lib/appSettings/readAppSettingsRow";
import { readFinalizeCheckpoint, isInfraError } from "@/app/admin/_finalizeCheckpoint";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { fetchUnresolvedAlertCount } from "@/lib/admin/alertCount";
import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // FIRST LINE — gates every admin route (404 if build-time flag off, 403
  // if not admin). Per Next 16 App Router semantics, this runs before any
  // child page render, so the gate covers /admin/dev and any future
  // /admin/* additions automatically.
  //
  // R18 #2 (round-17 §A+§B HIGH): R17 #1 made requireAdmin throw
  // AdminInfraError on infra failure (was forbidden() for everything
  // pre-R17 — auth-deny and infra-fault collapsed). The layout used
  // to await requireAdmin without a catch + had no app/admin/error.tsx,
  // so AdminInfraError fell into Next's generic error path. Catch it
  // here and render a cataloged failure surface so admins see a real
  // 500-class error with retry guidance instead of an opaque framework
  // error. notFound() / forbidden() throws still propagate (those are
  // Next navigation control flow with NEXT_HTTP_ERROR_FALLBACK digest).
  // B1 Task 2.2: read identity here (was requireAdmin()). The explicit
  // `layer: "layout"` exempts the layout gate from Task 2.3's page-scoped
  // force header, so the route-render proof can let the layout succeed
  // while a page gate throws. Pages call the helpers with the default
  // `layer: "page"`. `identity.email` + the alert count are stored as
  // locals here; Phase 3 (Task 3.4) threads them into <AdminNav>.
  let identity: Awaited<ReturnType<typeof requireAdminIdentity>>;
  try {
    identity = await requireAdminIdentity({ layer: "layout" });
  } catch (err) {
    if (err instanceof AdminInfraError) {
      // Fixed generic ADMIN_ROUTE_LOAD_FAILED copy (Task 0.7). Replaces
      // the prior messageFor(err.code) → crewFacing fallback, which would
      // show ADMIN_SESSION_LOOKUP_FAILED's crew-facing copy (wrong
      // audience: its dougFacing is null) on the admin shell.
      // Resolve to copy in a local (not inline in JSX) so the no-raw-codes
      // scanner does not flag the code string inside a JSX expression.
      const infraMessage = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");
      return (
        <div
          data-testid="admin-layout-infra-error"
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-page-pad-mobile sm:p-page-pad-desktop text-center"
        >
          <h1 className="text-2xl font-semibold">Admin session unavailable</h1>
          <p className="mt-4 text-base text-text-subtle">{infraMessage}</p>
          <a
            href="/admin"
            className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
          >
            Try again
          </a>
        </div>
      );
    }
    throw err;
  }

  const adminEmail = identity.email;

  // Onboarding UX Polish Task 1: during first-run onboarding the setup wizard
  // owns the screen and the nav tabs point at destinations that do not
  // meaningfully exist yet, so suppress them and show a slim bar instead.
  //
  // The gate must match the /admin dispatcher's wizard-vs-dashboard decision
  // EXACTLY (app/admin/page.tsx): a minted wizard session renders a
  // wizard/finalize surface for a null / in_progress / all_batches_complete
  // checkpoint, but the dispatcher renders the DASHBOARD for the defensive
  // `final_cas_done` snapshot (Phase D clears the session id atomically, so a
  // non-null id + final_cas_done is an inconsistent snapshot) — so the full nav
  // MUST show there too; otherwise the dashboard renders behind a slim
  // onboarding bar with no navigation. No session + no folder = first-visit
  // fresh = onboarding. FAIL OPEN on ANY read fault (app_settings OR the
  // checkpoint): keep the full nav so a settled admin is never stranded.
  const appSettings = await readAppSettingsRow();
  let inOnboarding = false;
  if (appSettings.kind === "value") {
    const s = appSettings.settings;
    if (s.pending_wizard_session_id !== null) {
      const checkpoint = await readFinalizeCheckpoint(s.pending_wizard_session_id);
      inOnboarding =
        !isInfraError(checkpoint) &&
        (checkpoint === null || checkpoint.status !== "final_cas_done");
    } else {
      inOnboarding = s.watched_folder_id === null;
    }
  }

  if (inOnboarding) {
    return (
      <div
        data-testid="admin-layout"
        // No `pb-20`: the slim onboarding bar has no fixed mobile bottom tab
        // bar to clear, so the mobile-bottom-bar reservation is dropped.
        className="mx-auto max-w-[1600px] p-page-pad-mobile sm:p-page-pad-desktop"
      >
        <OnboardingTopBar email={adminEmail} />
        <PageTransition>{children}</PageTransition>
      </div>
    );
  }

  // nav-perf Phase 2 (E-lite): the two badge reads are independent — run them in
  // parallel so first /admin entry blocks on one wall-time, not two sequential
  // round-trips. alertCount is meta-pinned in lib/admin/alertCount.ts; the
  // "Needs attention" tab badge seed (spec §4.2) maps infra_error → null → badge
  // hidden (fail-quiet, ratified D-4).
  const [alertCount, needsAttentionCount] = await Promise.all([
    fetchUnresolvedAlertCount(),
    loadNeedsAttentionCount(),
  ]);

  return (
    <div
      data-testid="admin-layout"
      // Bottom padding reserves space for the fixed mobile bottom tab bar so
      // the last content row is never occluded (spec §6). It MUST stay large
      // across the entire mobile band (< 720px) and only drop at >= 720px when
      // the bar is hidden. Splitting the padding per-edge (px/pt vs pb) keeps
      // the `sm:` (640px) desktop padding from clobbering `pb` in the 640-719px
      // band — a global-`sm:`-shorthand-resets-pb collapse the jsdom Phase-3
      // tests could not catch (Tailwind v4, no global `md`; DESIGN §7). The
      // bottom tab bar is ~58px tall; pb-20 (80px) clears it with margin.
      className="mx-auto max-w-[1600px] px-page-pad-mobile pt-page-pad-mobile pb-20 sm:px-page-pad-desktop sm:pt-page-pad-desktop min-[720px]:pb-page-pad-desktop"
    >
      <AdminNav
        email={adminEmail}
        alertCount={alertCount}
        initialBadgeCount={needsAttentionCount.kind === "ok" ? needsAttentionCount.count : null}
      />

      {/* M12.3 items 1+2: the global AlertBanner is no longer mounted in the
          layout (it used to ride EVERY admin route, double-rendering on
          per-show which has its own "Alerts for this show" section). It now
          mounts ONLY on the dashboard, under the "Dashboard" header — see
          <DashboardWithHeader> in app/admin/page.tsx, which keeps the
          `<div id="alerts">` queue-chip scroll target for `/admin#alerts`. */}
      {/* M12.11: animate the page content on every /admin/* navigation. The nav
          above persists (it's outside the wrapper); only the content below
          transitions. loading.tsx skeletons render INSIDE this wrapper, so the
          skeleton fades in on click and the real content swaps in when ready. */}
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
