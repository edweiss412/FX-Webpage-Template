/**
 * tests/e2e/_directiveFormActionLiveEntry.tsx (PR-C / C4 — guard case f)
 *
 * Browser ENTRY proving the shared "use server" resolver's stub is LOUD when the
 * REAL app boundary invokes it. It imports the actual server action
 * setUseRawDecisionAction (a "use server" module) and wires it as a React form
 * action; the directive plugin replaces that module with a throwing stub, so
 * submitting the form invokes the stub and throws the plugin's message rather
 * than silently no-op'ing or shipping the server body.
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX in
 * spec-imported .tsx). directive-form-action.spec.ts bundles this out of process
 * via bundleLiveEntry and serves it over node:http, mirroring
 * _packListRescanLiveEntry.
 *
 * Uncaught errors and rejections are mirrored into a #captured-error node OUTSIDE
 * the React tree (so React never reconciles it away): React 19 surfaces an
 * action throw via reportError (a window "error" event) and/or console.error, so
 * the spec asserts on pageerror, console, AND this box — whichever channel the
 * runtime uses, the message is observed.
 */
import { createRoot } from "react-dom/client";
import { setUseRawDecisionAction } from "@/app/admin/show/[slug]/_actions/useRaw";

const errBox = document.createElement("pre");
errBox.setAttribute("data-testid", "captured-error");
document.body.appendChild(errBox);

function record(message: string): void {
  errBox.textContent = `${errBox.textContent ?? ""}\n${message}`.trim();
}
window.addEventListener("error", (e) => record(e.message || String(e.error)));
window.addEventListener("unhandledrejection", (e) =>
  record(String((e as PromiseRejectionEvent).reason)),
);

// Thin form-action adapter: setUseRawDecisionAction takes (showId, warningRef,
// useRaw), not FormData, so it cannot be a form action directly. The adapter
// invokes the REAL imported symbol — which the directive plugin has replaced with
// its throwing stub, so these args are never read at runtime; they are kept
// type-correct so the real action's signature is exercised at the type level too.
async function submitUseRaw(): Promise<void> {
  await setUseRawDecisionAction(
    "show-1",
    { code: "warning_stale", blockRef: { kind: "row" }, observedContentHash: "hash" },
    true,
  );
}

function LiveHarness() {
  return (
    <div data-testid="harness-mount">
      <form action={submitUseRaw}>
        <button type="submit" data-testid="submit">
          go
        </button>
      </form>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<LiveHarness />);
