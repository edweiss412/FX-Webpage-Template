/**
 * HYDRATED harness for the section-header reconciliation probe
 * (tests/e2e/section-header-reconcile.layout.spec.ts).
 *
 * WHY THIS EXISTS ALONGSIDE `_sectionHeaderCellHarness.tsx`, which already
 * renders the same component. That one serves SERVER-RENDERED markup: the spec
 * shells out to `tsx`, gets a string of HTML back, and its "toggle" is a
 * `style.display` mutation on already-final markup — the limit its own spec
 * records at tests/e2e/section-header-layout.layout.spec.ts:1176-1185. No React
 * ever runs, so nothing there can observe a RECONCILIATION: a prop changing
 * under a stable key, React updating the existing DOM nodes in place.
 *
 * That gap is not academic. The failure it lets through is a JS-driven height
 * animation — no CSS transition, no remount, a `requestAnimationFrame` loop
 * writing `style.height` — which is invisible to a static harness (no JS), to
 * the computed-style transition scan (there IS no transition property), and to
 * an endpoint-only measurement (the tween settles on the correct height). This
 * harness mounts the real component with `createRoot` so that class is reachable
 * at all, and ships the mutant itself so the spec's oracle is proven to reject
 * it rather than assumed to.
 *
 * THE PROP FLIP IS UNDER A STABLE KEY, deliberately. Remounting would replace
 * the DOM node and prove nothing about reconciliation — the spec asserts node
 * IDENTITY across the flip precisely to catch a harness that quietly remounts.
 *
 * `?mutant=js-height` turns on the defect. The spec runs the same assertions
 * against both modes: RED under the mutant, GREEN without it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleAlert } from "lucide-react";

import {
  BreakdownSection,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";

const HARNESS_DFID = "drive-harness-section-reconcile";

/** The 240px row the layout spec calls the narrowest reachable: a 320px
 *  viewport's 280px pane minus 20px tile-pad each side. The flip is measured
 *  HERE because that is where the pill and the count actually change the
 *  header's height — at a comfortable width the heading row absorbs both and the
 *  premise row below fails, loudly, which is how this width was chosen. */
const NARROWEST_ROW_PX = 240;

/**
 * The two prop states the flip moves between.
 *
 * Chosen so the HEADER's own height is what changes: `flagged` adds the amber
 * pill to the heading row, which is the §5.2 chrome the existing Part 2 asserts.
 * The count moves with it so the flip exercises both counted-ness and pill
 * presence in one reconcile, matching how the real surface transitions when a
 * section acquires warnings.
 */
const STATES: Record<"before" | "after", { flagged: boolean; count: number | null }> = {
  before: { flagged: false, count: null },
  after: { flagged: true, count: 128 },
};

function chromeFor(flagged: boolean): Step3SectionChrome {
  return {
    Icon: CircleAlert,
    label: "Sheet warnings",
    flagged,
    headingLevel: 3,
    dfid: HARNESS_DFID,
    sectionId: "warnings",
  } as Step3SectionChrome;
}

/**
 * The mutant: animate the header's height from JS on every prop change.
 *
 * Attaches NO CSS transition — that is the point. It tweens `style.height` over
 * ~150ms with `requestAnimationFrame` and lands exactly on the target, so an
 * endpoint-only assertion sees the right number and a computed-style transition
 * scan sees nothing to complain about. Only an oracle that samples DURING the
 * reconcile can tell the difference.
 *
 * `useLayoutEffect`, not `useEffect`: the tween must start from the PRE-update
 * height, before the browser paints the new one, or the first sampled frame is
 * already the target and the mutant would be invisible for a reason that has
 * nothing to do with the oracle.
 */
function useJsHeightTween(ref: React.RefObject<HTMLDivElement | null>, dep: unknown, on: boolean) {
  const previous = useRef<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const target = node.getBoundingClientRect().height;
    const from = previous.current;
    previous.current = target;
    if (!on || from === null || Math.abs(from - target) < 0.5) return;

    const DURATION_MS = 150;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      node.style.height = `${from + (target - from) * t}px`;
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        node.style.removeProperty("height");
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ref, dep, on]);
}

function LiveHarness({ mutant }: { mutant: boolean }) {
  const [phase, setPhase] = useState<"before" | "after">("before");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const state = STATES[phase];

  useJsHeightTween(boxRef, phase, mutant);

  useEffect(() => {
    document.documentElement.setAttribute("data-harness-hydrated", "true");
  }, []);

  return (
    <div className="p-4">
      {/* The flip control. A BUTTON rather than an exposed function so the spec
          drives it the way a user would, through a real event. */}
      <button
        type="button"
        data-testid="reconcile-flip"
        className="mb-4 min-h-tap-min rounded border px-3 py-2 text-xs"
        onClick={() => setPhase((p) => (p === "before" ? "after" : "before"))}
      >
        Flip section state
      </button>

      <div data-testid="reconcile-row" style={{ width: NARROWEST_ROW_PX }}>
        {/* STABLE KEY. React reconciles the existing subtree rather than
            replacing it, which is the whole point of this harness. */}
        <div key="section-under-proof" ref={boxRef} data-testid="reconcile-box">
          <Step3SectionChromeContext.Provider value={chromeFor(state.flagged)}>
            <BreakdownSection testId="reconcile-section" label="Sheet warnings" count={state.count}>
              <div />
            </BreakdownSection>
          </Step3SectionChromeContext.Provider>
        </div>
      </div>
    </div>
  );
}

const el = document.getElementById("root");
if (el) {
  const mutant = new URLSearchParams(window.location.search).get("mutant") === "js-height";
  createRoot(el).render(<LiveHarness mutant={mutant} />);
}
