/**
 * tests/e2e/_step3ReviewModalLiveEntry.tsx (Task 11)
 *
 * Browser ENTRY for the LIVE interaction harness: mounts the REAL
 * <Step3ReviewModal> tree (same fixture + AppRouterContext stub as Task 10's
 * static harness, via the shared `buildSectionData`/`modalElement` pieces)
 * with react-dom/client so drag, scroll-spy, and Tab traversal run against
 * real component JS in a real browser.
 *
 * This file is NEVER imported by a Playwright spec (its test transform
 * rewrites JSX in every spec-imported .tsx into component-testing payloads).
 * Instead the interactions spec bundles it in beforeAll with a version-pinned
 * `pnpm dlx esbuild@0.28.0 --bundle --format=iife --jsx=automatic` and serves
 * the bundle over node:http (see step3-review-modal.interactions.spec.ts).
 *
 * Window hooks (kept minimal + deterministic):
 *   - `window.__modalClosed` flips true when the modal's onClose fires; the
 *     harness App also unmounts the modal, so "closed" is ALSO directly
 *     observable as the dialog leaving the DOM (both are asserted).
 *   - onRequestSetChecked resolves true immediately (no publish-path test
 *     lives here; jsdom covers publish semantics in Step3ReviewModal.test.tsx).
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { buildSectionData, modalElement } from "./_step3ReviewModalHarness";

declare global {
  interface Window {
    __modalClosed?: boolean;
  }
}

function LiveHarness() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return modalElement(buildSectionData(), {
    onRequestSetChecked: async () => true,
    onClose: () => {
      // Deliberate test-harness window hook: the Playwright spec reads
      // window.__modalClosed to distinguish "onClose fired" from "modal
      // merely left the DOM".
      // eslint-disable-next-line react-hooks/immutability -- test-harness window hook
      window.__modalClosed = true;
      setOpen(false);
    },
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<LiveHarness />);
