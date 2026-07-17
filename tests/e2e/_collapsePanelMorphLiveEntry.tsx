/**
 * tests/e2e/_collapsePanelMorphLiveEntry.tsx (Task 8 — CollapsePanel height morph)
 *
 * Browser ENTRY for the LIVE real-CSS harness: mounts the REAL <CollapsePanel>
 * (components/admin/CollapsePanel.tsx) with react-dom/client + a toggle button
 * so the grid-template-rows 0fr<->1fr morph runs against the real component JS
 * and the real compiled Tailwind CSS in a real browser. This verifies the one
 * thing jsdom cannot: that the `overflow-hidden` region grid-item's rendered
 * getBoundingClientRect().height is 0 when closed and >0 when open (jsdom
 * computes no layout).
 *
 * NEVER imported by a Playwright spec (Playwright's babel transform rewrites JSX
 * in every spec-imported .tsx into component-testing payloads react-dom cannot
 * render). collapse-panel-morph.spec.ts bundles this out-of-process with a
 * version-pinned esbuild and serves it, mirroring _blockedRowResolverLiveEntry.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CollapsePanel } from "@/components/admin/CollapsePanel";

function LiveHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="harness-mount" className="p-tile-pad">
      <button
        type="button"
        data-testid="morph-toggle"
        aria-expanded={open}
        aria-controls="morph-probe"
        onClick={() => setOpen((v) => !v)}
        className="min-h-tap-min rounded-sm border border-border px-4"
      >
        Toggle
      </button>
      <CollapsePanel open={open} id="morph-probe" label="Morph probe">
        {/* Real, non-trivial height so open state is unambiguously > 0. */}
        <div className="flex flex-col gap-2 p-tile-pad text-sm text-text-strong">
          <p>Line one of disclosed content.</p>
          <p>Line two of disclosed content.</p>
          <p>Line three of disclosed content.</p>
        </div>
      </CollapsePanel>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<LiveHarness />);
