/**
 * tests/e2e/_packListRescanLiveEntry.tsx (PSAT-1 Task 6)
 *
 * Browser ENTRY for the LIVE real-browser assertion of the S5 archived-tab
 * re-scan recovery state. Mounts the REAL <PackListBreakdown> (from
 * components/admin/wizard/step3ReviewSections.tsx) in the S5 accept-stale case
 * (durable override set + preview tab present-but-not-included → the two
 * snapshots diverge) with react-dom/client, wrapped in AppRouterContext so the
 * nested RescanSheetButton's `useRouter()` resolves.
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX in every
 * spec-imported .tsx into component-testing payloads react-dom cannot render).
 * packlist-rescan-recovery.spec.ts bundles this out-of-process with a
 * version-pinned esbuild and serves it over node:http, mirroring
 * _collapsePanelMorphLiveEntry / _step3ReviewModalLiveEntry.
 *
 * No Tailwind compile: the S5 assertions are DOM text / focus / no-raw-code /
 * no-em-dash checks that do not depend on real CSS.
 */
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PackListBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ArchivedPullSheetTab } from "@/lib/parser/types";

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

const DFID = "drive-1";
const WSID = "00000000-1111-4222-8333-444444444444";

// S5 accept-stale: durable override pins {OLD A, fp1}; the preview tab is present
// but NOT included → previewSnapshot is null → the snapshots diverge → S5 renders.
const staleTab: ArchivedPullSheetTab = {
  tabName: "OLD A",
  headerPreviews: ["RIA - CHICAGO"],
  fingerprint: "fp1",
  included: false,
  contentChangedSinceAccept: false,
};

function LiveHarness() {
  return (
    <div data-testid="harness-mount">
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[staleTab]}
        pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
      />
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(
  <AppRouterContext.Provider value={stubRouter}>
    <LiveHarness />
  </AppRouterContext.Provider>,
);
