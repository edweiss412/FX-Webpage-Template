/**
 * tests/e2e/_wizardBlockerModalLiveEntry.tsx (spec 2026-07-17 §8 / plan Task 7)
 *
 * Browser ENTRY for the LIVE real-browser LAYOUT harness of the finalize blocker
 * modal. Mounts the EXPORTED <FinalizeStatusRegion> (the single-lever surface —
 * FinalizeBlockerModal is module-private and rendered through it) inside a REAL
 * <WizardFooter> center slot, driven by a hand-built stub `run` whose state a
 * page button flips `idle → cas_per_row`. A separate `fixed inset-0 z-50` node
 * (`review-standin`) replicates <Step3ReviewModal>'s stacking shell
 * (Step3ReviewModal.tsx:563) so the spec can prove the portaled modal paints
 * ABOVE an app-root z-50 dialog — bundling the full Step3ReviewModal (a heavy
 * ShowReviewSurface fixture) is disproportionate; the z-context behavior under
 * test is identical to the one-line shell.
 *
 * Never imported by a Playwright spec (Playwright's transform rewrites JSX);
 * wizard-blocker-modal.layout.spec.ts bundles it with a version-pinned esbuild
 * and serves it over node:http, exactly like the blocked-row-resolver harness.
 *
 * The cas_per_row rows render real <BlockedRowResolver>s (they import
 * next/navigation useRouter), so the tree is wrapped in an AppRouterContext
 * stub — same pattern as _step3ReviewModalHarness.tsx.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { FinalizeStatusRegion, type FinalizeRun } from "@/components/admin/FinalizeButton";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

// Enough rows to overflow 85vh unclamped, so the spec can prove the panel's
// max-h-[85vh] cap keeps it inside the viewport.
const MANY_ROWS = Array.from({ length: 30 }, (_, i) => ({
  drive_file_id: `d-${i}`,
  code: "SHOW_ARCHIVED_IMMUTABLE",
}));

function LiveHarness() {
  const [kind, setKind] = useState<"idle" | "cas_per_row">("idle");
  const run = {
    state: kind === "cas_per_row" ? { kind: "cas_per_row", rows: MANY_ROWS } : { kind: "idle" },
    dismiss: () => setKind("idle"),
    runLoop: async () => {},
    wizardSessionId: "wiz-e2e-1",
  } as unknown as FinalizeRun;

  return (
    <AppRouterContext.Provider value={stubRouter}>
      <div data-testid="harness-mount">
        <button data-testid="flip-to-blocker" type="button" onClick={() => setKind("cas_per_row")}>
          show blocker
        </button>
        {/* Stand-in for an open Step3ReviewModal (same fixed inset-0 z-50 shell).
            Rendered ONLY once the blocker is showing — it models the review modal
            being open UNDERNEATH when the blocker fires (spec §7a); before the flip
            it must not cover the trigger. */}
        {kind === "cas_per_row" ? (
          <div data-testid="review-standin" className="fixed inset-0 z-50" />
        ) : null}
        <WizardFooter primary={<span data-testid="footer-primary" />} center={<FinalizeStatusRegion run={run} />} />
      </div>
    </AppRouterContext.Provider>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<LiveHarness />);
