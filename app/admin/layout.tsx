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
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { DeveloperFlagProvider } from "@/components/admin/dev/DeveloperFlagContext";
import { AdminNav } from "@/components/admin/nav/AdminNav";
import { OnboardingTopBar } from "@/components/admin/nav/OnboardingTopBar";
import { PageTransition } from "@/components/layout/PageTransition";
import { readAppSettingsRow } from "@/lib/appSettings/readAppSettingsRow";
import { readFinalizeCheckpoint, isInfraError } from "@/app/admin/_finalizeCheckpoint";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { loadBellUnseenCount } from "@/lib/admin/bellFeed";
import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";
import { fetchHealthRollup, type HealthStatus } from "@/lib/admin/healthRollup";

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
  // developer-tier Task 15 (spec §6 row 8): resolve the developer visibility
  // flag in PARALLEL with the identity read so the AdminNav developer-only nav
  // filter costs no extra wall-time on the happy path. isCurrentUserDeveloper is
  // fail-to-false (never rejects), so a Promise.all rejection here is always the
  // identity read's AdminInfraError/redirect/forbidden — handled below unchanged.
  // alert-audience-split §5.1: resolve the app-health rollup in the SAME parallel
  // batch as the identity/developer reads so the escalating nav indicator costs no
  // extra wall-time on the happy path. fetchHealthRollup short-circuits to a single
  // cheap count in the common healthy state and NEVER rejects (returns
  // { kind:"infra_error" }), so a Promise.all rejection here is still always the
  // identity read's fault, handled below unchanged. Computed BEFORE the
  // `inOnboarding` branch so BOTH the full nav and the slim onboarding chrome can
  // render it — health codes no longer surface on the amber banner/bell/per-show,
  // so this indicator is the only place they escalate ("nothing goes dark").
  let identity: Awaited<ReturnType<typeof requireAdminIdentity>>;
  let viewerIsDeveloper = false;
  let healthRollup: HealthStatus = { kind: "infra_error" };
  try {
    [identity, viewerIsDeveloper, healthRollup] = await Promise.all([
      requireAdminIdentity({ layer: "layout" }),
      isCurrentUserDeveloper(),
      fetchHealthRollup(),
    ]);
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

  // nav-perf Phase 2 (E-lite): the two badge reads are independent — run them in
  // parallel so first /admin entry blocks on one wall-time, not two sequential
  // round-trips. bellCount comes from loadBellUnseenCount (bell notification
  // center §6.4 — the SAME pipeline the panel feed reads, so the badge and the
  // open panel can never disagree). It is computed BEFORE the onboarding branch
  // because the bell REPLACES the retired AlertBanner and now rides BOTH chromes
  // (§7.1/§8): the slim onboarding bar and the full nav. The "Needs attention"
  // tab badge seed (spec §4.2) maps infra_error → null → badge hidden
  // (fail-quiet, ratified D-4); it is only shown in the full nav, but reading it
  // here keeps the two independent reads on one parallel wall-time.
  const [bellCount, needsAttentionCount] = await Promise.all([
    loadBellUnseenCount(adminEmail, viewerIsDeveloper),
    loadNeedsAttentionCount(),
  ]);

  if (inOnboarding) {
    return (
      <div
        data-testid="admin-layout"
        // §S3C-2: stable hook the Step-3 review modal inerts while open (it
        // portals to <body>, so it can inert this shell without inerting itself).
        data-inert-root=""
        // No `pb-20`: the slim onboarding bar has no fixed mobile bottom tab
        // bar to clear, so the mobile-bottom-bar reservation is dropped.
        className="mx-auto max-w-[1600px] p-page-pad-mobile sm:p-page-pad-desktop"
      >
        <OnboardingTopBar
          email={adminEmail}
          healthRollup={healthRollup}
          isDeveloper={viewerIsDeveloper}
        />
        <DeveloperFlagProvider viewerIsDeveloper={viewerIsDeveloper}>
          <PageTransition>{children}</PageTransition>
        </DeveloperFlagProvider>
      </div>
    );
  }

  return (
    <div
      data-testid="admin-layout"
      // §S3C-2: stable hook the Step-3 review modal inerts while open (see the
      // onboarding-branch note above).
      data-inert-root=""
      // Bottom padding reserves space for the fixed mobile bottom tab bar so
      // the last content row is never occluded (spec §6). It MUST stay large
      // across the entire mobile band (< 720px) and only drop at >= 720px when
      // the bar is hidden. Splitting the padding per-edge (px/pt vs pb) keeps
      // the `sm:` (640px) desktop padding from clobbering `pb` in the 640-719px
      // band — a global-`sm:`-shorthand-resets-pb collapse the jsdom Phase-3
      // tests could not catch (Tailwind v4, no global `md`; DESIGN §7). The
      // bottom tab bar is ~58px tall; pb-20 (80px) clears it with margin.
      className="mx-auto max-w-[1600px] px-page-pad-mobile pt-page-pad-mobile pb-20 sm:px-page-pad-desktop sm:pt-page-pad-desktop min-[840px]:pb-page-pad-desktop"
    >
      <AdminNav
        email={adminEmail}
        bellCount={bellCount}
        initialBadgeCount={needsAttentionCount.kind === "ok" ? needsAttentionCount.count : null}
        viewerIsDeveloper={viewerIsDeveloper}
        healthRollup={healthRollup}
      />

      {/* bell notification center §8: the global AlertBanner is retired. Its
          role — surfacing unresolved admin alerts — now lives in the <NotifBell>
          panel in the nav above (both chromes), so there is no banner slot and
          no `<div id="alerts">` anchor anywhere in the admin tree. */}
      {/* M12.11: animate the page content on every /admin/* navigation. The nav
          above persists (it's outside the wrapper); only the content below
          transitions. loading.tsx skeletons render INSIDE this wrapper, so the
          skeleton fades in on click and the real content swaps in when ready. */}
      <DeveloperFlagProvider viewerIsDeveloper={viewerIsDeveloper}>
        <PageTransition>{children}</PageTransition>
      </DeveloperFlagProvider>
    </div>
  );
}
