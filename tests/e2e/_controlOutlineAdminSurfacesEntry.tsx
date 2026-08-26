/**
 * tests/e2e/_controlOutlineAdminSurfacesEntry.tsx
 *
 * Browser ENTRY for the three AC-13 surfaces that are CLIENT components living
 * outside the step-3 review tree: the BellPanel config row, the report
 * textarea, and the row-actions menu trigger in both of its arms.
 *
 * The fourth, the wizard step indicator's done pill, is NOT here and cannot be.
 * `components/admin/OnboardingWizard.tsx` is a SERVER component: its module
 * scope imports `createSupabaseServerClient`, which constructs an
 * `AsyncLocalStorage` on import, and this route empties node builtins so that
 * throws (probe: `TypeError: import_node_async_hooks.AsyncLocalStorage is not a
 * constructor`, the whole page dead at `#root` childElementCount 0). That is
 * not a harness gap to paper over: Next never ships that module to a client
 * bundle either, so a client-bundle route is the wrong vehicle for it by
 * construction. The pill is measured on its REAL route instead, at
 * `/admin?step=2`, in this entry's spec.
 *
 * Same route as its sibling `_controlOutlineContrastLiveEntry.tsx`, and for the
 * same reason: `_step3ReviewModalBundle.mjs` replaces every `"use server"`
 * module with a throwing stub BY CLASS and empties node builtins, so each of
 * these client components loses its server reach exactly the way Next drops it
 * from a client bundle. All four are exported prop-driven components, so none
 * of them needs a route, a session, or a database to render its border.
 *
 * Never imported by a spec: Playwright's transform rewrites JSX in every
 * spec-imported .tsx, which is what makes a separate entry file necessary.
 */
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";

import { BellPanel } from "../../components/admin/BellPanel";
import { ShowRowActions } from "../../components/admin/ShowRowActions";
import { ReportModal } from "../../components/shared/ReportModal";
import type { ActiveShowRow } from "../../lib/admin/showDisplay";

/**
 * The config row lives in `DevFooter`, which the panel renders only once its
 * feed load has RESOLVED and only for a developer viewer. The harness server
 * answers `/api/admin/alerts/bell/feed` with an empty-but-valid body for
 * exactly that reason; an entries array is not needed, the config row is not
 * derived from it.
 */
const showRow: ActiveShowRow = {
  id: "show-1",
  slug: "east-coast",
  title: "East Coast",
  showDateStart: "2026-06-01",
  showDateEnd: "2026-06-05",
  crewCount: 4,
  lastSyncedAt: "2026-06-03T10:00:00.000Z",
  lastSyncStatus: "ok",
  lastCheckedAt: "2026-06-03T10:05:00.000Z",
  published: true,
  isLive: false,
  finalizeOwned: false,
  archivedAt: null,
};

/**
 * The menu trigger is measured in BOTH arms, which is what AC-13 asks for, so
 * the harness renders two independent instances under labelled hosts and the
 * SPEC opens one of them with a real click. An earlier revision opened it from
 * a ref callback here; that fires during commit, before the effects the menu's
 * open state depends on have run, and the panel never opened. Two instances
 * rather than one toggled instance: a toggle measures one arm and then the
 * other at different moments, and a spec that mis-sequences the click would
 * read the same arm twice and pass.
 */
/**
 * ONE surface per page load, selected by `?surface=`. Not tidiness: both the
 * bell panel and the report modal are `fixed inset-0` dialogs whose backdrops
 * swallow every pointer event on the page, which is invisible to a
 * computed-style read but fatal to the row-actions case, the one case that has
 * to CLICK. Rendering them together cost two full runs to diagnose.
 */
const surface = new URLSearchParams(window.location.search).get("surface");

function Surfaces() {
  return (
    <div className="bg-bg flex flex-col gap-8 p-4">
      {surface === "bell" ? (
        <BellPanel viewerIsDeveloper onClose={() => {}} onOpened={() => {}} />
      ) : null}
      {surface === "rows" ? (
        <>
          <div data-testid="row-actions-closed-host">
            <ShowRowActions row={showRow} />
          </div>
          <div data-testid="row-actions-open-host">
            <ShowRowActions row={{ ...showRow, slug: "opened-arm", id: "opened-arm" }} />
          </div>
        </>
      ) : null}
      {surface === "report" ? (
        <ReportModal
          open
          onOpenChange={() => {}}
          surface="admin"
          surfaceId="control-outline-harness"
          showId="show-1"
        />
      ) : null}
    </div>
  );
}

/**
 * `ShowRowActions` calls `useRouter()`, which throws "invariant expected app
 * router to be mounted" outside the App Router and takes the whole page with
 * it. Same stub and same import path as `_step3ReviewModalHarness.tsx`, which
 * is the precedent in this directory; nothing here navigates, so every method
 * is a no-op.
 */
const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("admin-surfaces harness page is missing #root");
createRoot(rootEl).render(
  <AppRouterContext.Provider value={stubRouter}>
    <Surfaces />
  </AppRouterContext.Provider>,
);
