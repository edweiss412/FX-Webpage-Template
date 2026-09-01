/**
 * tests/e2e/_step3FinalizeProgressLiveEntry.tsx
 *
 * Live harness for the two finalize progress renderers, mounted from the REAL
 * component tree and painted with the REAL compiled app/globals.css. It exists
 * because the three things this arc must establish are all things jsdom cannot
 * answer: what colour a native <progress> track computes to, whether a
 * prefers-reduced-motion rule survives its engine's selector parser, and how
 * tall the sticky footer is at 375px.
 *
 * Both renderers are driven the way tests/components/admin/finalizeTransitionAudit.test.tsx
 * drives them — a controllable NDJSON stream over the finalize routes — so the
 * running state here is reached through the component's own reducer rather than
 * by fabricating props it would never receive.
 */
import { createRoot } from "react-dom/client";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";
import { controllableNdjson } from "../components/admin/_finalizeStreamHarness";

declare global {
  interface Window {
    /** Push a batch-phase count. Emits `listed` once, then a `row` per call. */
    __setCounts?: (done: number, total: number, name?: string) => void;
    /** Finish the batch stream and enter the CAS phase. */
    __enterCas?: (phase?: "applying" | "publishing" | "subscribing") => void;
    /** True once both renderers have mounted their running panels. */
    __running?: boolean;
  }
}

const WSID = "00000000-1111-4222-8333-444444444444";
const FINALIZE = "/api/admin/onboarding/finalize";
const FINALIZE_CAS = "/api/admin/onboarding/finalize-cas";

function row(driveFileId: string): Step3Row {
  return {
    driveFileId,
    driveFileName: `${driveFileId}.gsheet`,
    status: "applied",
    parseResult: { show: { title: driveFileId } } as unknown as ParseResult,
  };
}

// One stream per route. The batch stream stays open until __enterCas closes it,
// which is what holds the surface in the batch phase for the geometry samples.
const batch = controllableNdjson();
const cas = controllableNdjson();
let listed = false;

const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? "");
  if (url === FINALIZE) return Promise.resolve(batch.response);
  if (url === FINALIZE_CAS) return Promise.resolve(cas.response);
  return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

window.__setCounts = (done, total, name = "East Coast") => {
  if (!listed) {
    batch.push({ type: "listed", total });
    listed = true;
  }
  batch.push({ type: "row", done, total, name, driveFileId: "f1" });
};

window.__enterCas = (phase) => {
  // The terminal body is WRAPPED, exactly as the route emits it and as the jsdom suites
  // push it: `{ type: "result", body }`. An earlier draft pushed the body raw, which the
  // reducer ignored, so the run never left the batch phase and the CAS element never
  // appeared. Nothing caught that until a test actually asked for the CAS phase.
  batch.push({
    type: "result",
    body: {
      status: "all_batches_complete",
      wizard_session_id: WSID,
      remaining_count: 0,
      unresolved_manifest_count: 0,
      per_row: [],
    },
  });
  batch.close();
  if (phase) cas.push({ type: "phase", phase });
};

/**
 * ONE renderer per page load, selected by `?r=panel` or `?r=compact`.
 *
 * Not a convenience. Both renderers emit `data-testid="wizard-finalize-progressbar"`
 * (components/admin/FinalizeButton.tsx:983, components/admin/wizard/Step3ReviewWithFinalize.tsx:270),
 * so mounting both would put two elements with one testid on a page and every
 * locator for it would be ambiguous. They would also both POST the finalize
 * route, and a ReadableStream is read once, so the second mount would consume a
 * spent response and never reach the running state at all. A fresh navigation
 * per renderer gives each one its own streams and an unambiguous DOM.
 */
function Harness() {
  const which = new URLSearchParams(window.location.search).get("r");
  if (which === "compact") {
    return (
      <div className="bg-bg" data-testid="harness-compact">
        <Step3ReviewWithFinalize
          wizardSessionId={WSID}
          rows={[row("a")]}
          finishable
          initialPublishCount={1}
          initialUncheckedCleanCount={0}
        />
      </div>
    );
  }
  if (which === "panel") {
    return (
      <div className="bg-bg" data-testid="harness-panel">
        <FinalizeButton wizardSessionId={WSID} publishCount={2} />
      </div>
    );
  }
  throw new Error(`live harness needs ?r=panel or ?r=compact, got ${JSON.stringify(which)}`);
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<Harness />);
