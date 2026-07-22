/**
 * tests/e2e/_hoverHelpGeometryLiveEntry.tsx
 *
 * Browser ENTRY for the LIVE hoverhelp-geometry harness
 * (spec 2026-07-22-hoverhelp-smart-position §6 T3/T5/T6/T7/T8): mounts the
 * REAL <HoverHelp> (and a real compact-card shape for the overlap kill-shot)
 * against compiled Tailwind CSS, one fixture per `?case=` value, so the
 * collision/flip/shrink/clamp/tracking claims are measured in a real engine.
 *
 * NEVER imported by a Playwright spec (the babel transform rewrites
 * spec-imported .tsx); hoverhelp-geometry.spec.ts bundles this out-of-process
 * with the version-pinned esbuild, mirroring _compactAlertCardLiveEntry.
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HoverHelp, PopoverHostContext } from "@/components/admin/HoverHelp";

declare global {
  interface Window {
    __growPopoverContent: () => void;
    __widenPane: () => void;
  }
}

const LONG_COPY =
  "This popover explains the alert in plain language so the operator can act without leaving the page. ".repeat(
    30,
  );

/** Viewport-safe x so no fixture forces horizontal document scroll. */
function safeX(preferred: number): number {
  return Math.min(preferred, Math.max(8, window.innerWidth - 80));
}

function harnessCase(): string {
  const c = new URLSearchParams(window.location.search).get("case");
  return c && c.length > 0 ? c : "top";
}

/** Fixed-position wrapper so each case pins its trigger deterministically. */
function At({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: React.ReactNode;
}) {
  return <div style={{ position: "absolute", left: x, top: y }}>{children}</div>;
}

function ShortHelp({
  testId,
  align = "right",
  placement,
}: {
  testId: string;
  align?: "left" | "right";
  placement?: "top" | "bottom";
}) {
  return (
    <HoverHelp
      label={`Help: ${testId}`}
      testId={testId}
      align={align}
      {...(placement ? { placement } : {})}
    >
      <p>Short body copy for {testId}.</p>
    </HoverHelp>
  );
}

function GrowCase() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    window.__growPopoverContent = () => setGrown(true);
  }, []);
  return (
    <At x={safeX(400)} y={300}>
      <HoverHelp label="Help: grow" testId="grow-help">
        <div>
          <p>Starts small (below every cap).</p>
          {grown ? <div style={{ height: 400 }} data-testid="grown-block" /> : null}
        </div>
      </HoverHelp>
    </At>
  );
}

function NarrowPaneCase() {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    window.__widenPane = () => setWide(true);
  }, []);
  return (
    <div
      ref={paneRef}
      data-testid="narrow-pane"
      style={{ position: "absolute", left: 20, top: 120, width: wide ? 420 : 160, height: 300, overflowY: "auto", border: "1px solid #999" }}
    >
      <PopoverHostContext.Provider value={paneRef}>
        <div style={{ height: 40 }} />
        <ShortHelp testId="np-help" align="left" />
        <div style={{ height: 600 }} />
      </PopoverHostContext.Provider>
    </div>
  );
}

function PaneCase() {
  const paneRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={paneRef}
      data-testid="pane"
      style={{ position: "absolute", left: 40, top: 120, width: 420, height: 300, overflowY: "auto", border: "1px solid #999" }}
    >
      <PopoverHostContext.Provider value={paneRef}>
        <div style={{ height: 90 }} />
        <div data-testid="pane-card">
          <ShortHelp testId="pane-help" />
        </div>
        <div style={{ height: 900 }} />
      </PopoverHostContext.Provider>
    </div>
  );
}

/** Real compact-card shape (classes mirrored from CompactAlertCard) for T5. */
function OverlapCard() {
  return (
    <At x={40} y={Math.max(0, window.innerHeight - 150)}>
      <div
        data-testid="overlap-card"
        className="flex w-80 flex-col rounded-sm border border-border bg-warning-bg text-warning-text"
      >
        <div className="flex gap-2.5 p-3 pb-2.5">
          <div className="wrap-break-word min-w-0 flex-1 text-sm font-semibold text-text-strong">
            Pull sheet override content changed
          </div>
          <div className="shrink-0">
            {/* Content tall enough that it CANNOT fit in the ~90px below the
                trigger - the flip must engage (spec T5 "positioned so the
                flip engages"); a short body would legally sit on the band. */}
            <HoverHelp label="Help: overlap" testId="overlap-help" align="right">
              <p>{LONG_COPY.slice(0, 600)}</p>
            </HoverHelp>
          </div>
        </div>
        <div
          data-testid="guidance-band"
          className="border-t border-dashed border-warning-text/25 px-3 py-1.5 text-xs"
        >
          Re-open the sheet and confirm the override still matches before publishing.
        </div>
      </div>
    </At>
  );
}

function CaseView() {
  const c = harnessCase();
  const vh = window.innerHeight;
  switch (c) {
    case "top":
      return (
        <At x={safeX(400)} y={80}>
          <ShortHelp testId="top-help" />
        </At>
      );
    case "bottom":
      return (
        <At x={safeX(400)} y={vh - 60}>
          <ShortHelp testId="bottom-help" />
        </At>
      );
    case "center-tall":
      return (
        <At x={safeX(400)} y={Math.round(vh / 2)}>
          <HoverHelp label="Help: tall" testId="tall-help">
            <div style={{ height: 1200 }}>very tall content</div>
          </HoverHelp>
        </At>
      );
    case "overflow":
      return (
        <At x={safeX(400)} y={Math.round(vh / 2)}>
          <HoverHelp label="Help: overflow" testId="overflow-help">
            <p>{LONG_COPY}</p>
          </HoverHelp>
        </At>
      );
    case "capped-fit":
      // Content whose UNCAPPED height exceeds spaceBelow but whose CAPPED
      // border-box fits it: trigger near the top gives ~vh-100 below; the
      // class cap min(60vh,24rem) is well under that, while raw content
      // (1200px) exceeds it. Preconditions asserted in the spec.
      return (
        <At x={safeX(400)} y={72}>
          <HoverHelp label="Help: capped" testId="capped-help">
            <div style={{ height: 1200 }}>overflow content</div>
          </HoverHelp>
        </At>
      );
    case "preferred-top":
      return (
        <>
          <At x={safeX(400)} y={Math.round(vh / 2)}>
            <ShortHelp testId="pref-mid" placement="top" />
          </At>
          <At x={safeX(600)} y={40}>
            <ShortHelp testId="pref-pinned" placement="top" />
          </At>
        </>
      );
    case "edges":
      return (
        <>
          <At x={10} y={200}>
            <ShortHelp testId="edge-right-align" align="right" />
          </At>
          <At x={window.innerWidth - 40} y={320}>
            <ShortHelp testId="edge-left-align" align="left" />
          </At>
        </>
      );
    case "scrolly":
      return (
        <div style={{ height: 3000 }}>
          <At x={safeX(400)} y={1500}>
            <ShortHelp testId="scrolly-help" />
          </At>
        </div>
      );
    case "pane":
      return <PaneCase />;
    case "narrowpane":
      return <NarrowPaneCase />;
    case "grow":
      return <GrowCase />;
    case "learnmore":
      return (
        <At x={safeX(400)} y={200}>
          <HoverHelp label="Help: linked" testId="lm-help" learnMore={{ href: "/help/admin" }}>
            <p>Body with a learn-more link.</p>
          </HoverHelp>
        </At>
      );
    case "overlap":
      return <OverlapCard />;
    default:
      throw new Error(`unknown case: ${c}`);
  }
}

function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div>
      <CaseView />
      {ready ? <div data-testid="harness-ready" /> : null}
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("no #root");
createRoot(rootEl).render(<App />);
