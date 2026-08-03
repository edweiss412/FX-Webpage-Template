/**
 * tests/e2e/_publishedToggleClipLiveEntry.tsx
 * (spec 2026-08-01-admin-popover-overlay-cluster §4.3, §9 obligation 3)
 *
 * Browser ENTRY for the LIVE PublishedToggle clip harness: mounts the REAL
 * <PublishedToggle variant="inline"> inside a REPLICA clip panel — a
 * fixed-height `overflow-clip` div — so the anchored refusal banner is measured
 * against a real clip edge under real compiled Tailwind. jsdom computes no
 * layout, so the containment and scroll obligations exist only here.
 *
 * Why a dedicated entry rather than the shared modal harness: that harness
 * hardcodes `setPublished: NOOP_OK` (_publishedReviewModalHarness.tsx), so no
 * refusal banner can ever appear through it.
 *
 * `setPublished` resolves a REFUSAL (`FINALIZE_OWNED_SHOW`), which is what
 * renders the anchored banner. The spacer above the toggle is deliberate
 * geometry: it pushes the banner's top far enough down the 220px panel that the
 * room available to the fit is ~80px — comfortably above MIN_FITTED_HEIGHT (48,
 * lib/layout/fitWithinClip.ts) so the case stays inside the ratified regime,
 * and comfortably below the banner's natural content height so the overflow
 * obligation is exercised rather than hoped for.
 *
 * Router: PublishedToggle calls useRouter and HelpAffordance calls usePathname,
 * so the tree is wrapped in AppRouterContext.Provider with a no-op stub
 * (pattern: _bulkIgnoreEyebrowLiveEntry.tsx; the requirement is documented at
 * _statusStripToggleHarness.tsx). `window.__hydrated` flips true only after the
 * first mount commit — the spec gates on it, never on networkidle.
 *
 * NEVER imported by a Playwright spec (its transform rewrites JSX); the spec
 * bundles this out-of-process with pinned esbuild and serves it.
 */
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PublishedToggle } from "@/components/admin/PublishedToggle";

const routerStub = {
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
  back: () => {},
  forward: () => {},
} as unknown as AppRouterInstance;

declare global {
  interface Window {
    __hydrated?: boolean;
  }
}

function App() {
  useEffect(() => {
    window.__hydrated = true;
  }, []);
  return (
    <div
      data-testid="toggle-clip-panel"
      className="relative h-[220px] w-[390px] overflow-clip rounded-md border border-border bg-bg"
    >
      {/* Pushes the anchored banner down the panel so the fit has ~80px to work
          with — see the geometry rationale in the file header. */}
      <div className="h-[110px]" data-testid="toggle-clip-spacer" />
      <div className="relative px-4">
        <PublishedToggle
          slug="clip-harness"
          published={false}
          finalizeOwned={false}
          variant="inline"
          setPublished={async () => ({ ok: false, code: "FINALIZE_OWNED_SHOW" }) as const}
        />
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (rootEl)
  createRoot(rootEl).render(
    <AppRouterContext.Provider value={routerStub}>
      <App />
    </AppRouterContext.Provider>,
  );
