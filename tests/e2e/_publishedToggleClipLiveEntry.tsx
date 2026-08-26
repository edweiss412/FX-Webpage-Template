/**
 * tests/e2e/_publishedToggleClipLiveEntry.tsx
 * (spec 2026-08-25-review-modal-strip-dock §3.6; supersedes the fit-hook replica
 * built for 2026-08-01-admin-popover-overlay-cluster §4.3)
 *
 * Browser ENTRY for the LIVE PublishedToggle clip harness: mounts the REAL
 * <PublishedToggle variant="inline"> inside a REPLICA panel that supplies the
 * two things the migrated banner now needs from its surroundings — a
 * `PopoverHostContext` host to portal into, and a strip-shaped trigger to
 * measure against. Real compiled Tailwind, real layout; jsdom computes none, so
 * the placement obligations exist only here.
 *
 * Why a dedicated entry rather than the shared modal harness: that harness
 * hardcodes `setPublished: NOOP_OK` (_publishedReviewModalHarness.tsx), so no
 * refusal banner can ever appear through it. `setPublished` here resolves a
 * REFUSAL (`FINALIZE_OWNED_SHOW`, a member of KNOWN_REFUSAL_CODES), which is
 * what renders the banner with catalog copy rather than the generic retry
 * string.
 *
 * WHAT CHANGED, and why the old panel could not be kept. The banner used to be
 * a CSS-anchored child: `absolute inset-x-0 top-full` resolved against the
 * nearest positioned ancestor, so a bare `relative` wrapper was a sufficient
 * fixture. It is now placed by `placeWithinVisibleViewport` against a TRIGGER
 * RECT and portaled into a HOST, and neither exists in a panel that only has a
 * positioned ancestor. A fixture that keeps the old shape measures a trigger
 * that does not exist in production and would pass while the migration was
 * broken — which is why §3.6 rebuilds it rather than adjusting it.
 *
 * GEOMETRY IS SUPPLIED BY THE CALLER, not chosen here. `?panel=` and `?spacer=`
 * set the panel height and the spacer above the strip; the spec drives all four
 * branches of `computePopoverPlacement` by DERIVING these from the banner's own
 * measured natural height, so no number in this file encodes an expectation. An
 * earlier version of this harness chose ~80px of room and said so in its own
 * docblock; a fixture built to sit above the floor cannot be evidence about
 * where the floor is, and the honest fix is to let the measurement pick.
 *
 * WHAT THIS PANEL STILL CANNOT TELL YOU. It establishes BRANCH BEHAVIOUR — that
 * the module picks a side, caps when it must, and hands back what the component
 * writes. It says nothing about reachability on the real surface. Real-surface
 * anchor room is measured separately, against the real modal panel, in
 * popover-clip-fit.spec.ts.
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
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
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

/** Positive integer from the query string, or the default. Guards NaN so a
 *  malformed URL fails as a visibly wrong panel rather than as `height: NaNpx`,
 *  which renders as `auto` and would quietly make every branch assertion vacuous. */
function pxParam(name: string, fallback: number): number {
  const raw = new URLSearchParams(window.location.search).get(name);
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function App() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const panelH = pxParam("panel", 220);
  const spacerH = pxParam("spacer", 110);

  useEffect(() => {
    window.__hydrated = true;
  }, []);

  return (
    // The host is a REF, not an element: PopoverHostContext is typed
    // Context<RefObject<HTMLElement | null> | null> (components/admin/HoverHelp.tsx:77).
    <PopoverHostContext.Provider value={panelRef}>
      <div
        ref={panelRef}
        data-testid="toggle-clip-panel"
        className="relative w-[390px] overflow-clip rounded-md border border-border bg-bg"
        style={{ height: `${panelH}px` }}
      >
        {/* Positions the strip within the panel, which is what selects the
            placement branch. The value is computed by the spec from the
            banner's measured height, never chosen here. */}
        <div data-testid="toggle-clip-spacer" style={{ height: `${spacerH}px` }} />
        {/* A strip-SHAPED trigger. In production the banner anchors to the
            StatusStrip root, so a replica that anchors to anything else is
            measuring a trigger the real surface does not have. */}
        <div
          ref={stripRef}
          data-testid="show-status-strip"
          className="flex w-full flex-wrap items-center px-4"
        >
          <PublishedToggle
            slug="clip-harness"
            published={false}
            finalizeOwned={false}
            variant="inline"
            anchorRef={stripRef}
            setPublished={async () => ({ ok: false, code: "FINALIZE_OWNED_SHOW" }) as const}
          />
        </div>
      </div>
    </PopoverHostContext.Provider>
  );
}

const rootEl = document.getElementById("root");
if (rootEl)
  createRoot(rootEl).render(
    <AppRouterContext.Provider value={routerStub}>
      <App />
    </AppRouterContext.Provider>,
  );
