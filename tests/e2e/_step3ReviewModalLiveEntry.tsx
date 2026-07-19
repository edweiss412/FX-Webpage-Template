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
import { buildSectionData, harnessResolution, modalElement } from "./_step3ReviewModalHarness";

declare global {
  interface Window {
    __modalClosed?: boolean;
    __closeCount?: number;
    __closeAt?: number | null;
    __resolveAction?: (name: string, ok?: boolean) => void;
  }
}

/** §K14 fetch stub: intercepts ONLY the rescan route the footer's
 *  RescanSheetButton POSTs to (components/admin/RescanSheetButton.tsx:111) and
 *  answers the deterministic clean-success body so the overlay result renders
 *  with fixed copy ("Updated. Still ready to publish."). Every OTHER request
 *  passes through to the real fetch — in this dev-server-less harness that
 *  request fails loudly rather than being silently absorbed. */
const RESCAN_ROUTE = "/api/admin/onboarding/rescan-sheet";
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? "");
  if (url === RESCAN_ROUTE) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          status: "updated",
          needsReview: false,
          changed: true,
          demoted: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }
  return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

/** Deferred action promises, resolved by the spec via `window.__resolveAction`.
 *  MODAL-CLOSE-EXIT-ANIM-1 §7.5(g)/(h) need a resolution to land at a chosen
 *  moment relative to the exit window — a timer would race it, so the spec
 *  drives the timing explicitly. Opt-in via `?deferActions=1` so every existing
 *  test keeps the immediate-resolution behavior. */
const pendingActions = new Map<string, (ok: boolean) => void>();
function deferred(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    pendingActions.set(name, resolve);
  });
}

const params = new URLSearchParams(window.location.search);
const DEFER_ACTIONS = params.get("deferActions") === "1";
const WITH_RESOLUTION = params.get("resolution") === "1";

window.__resolveAction = (name: string, ok = true) => {
  pendingActions.get(name)?.(ok);
  pendingActions.delete(name);
};

function LiveHarness() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return modalElement(buildSectionData(), {
    onRequestSetChecked: DEFER_ACTIONS ? () => deferred("publish") : async () => true,
    ...(WITH_RESOLUTION
      ? {
          resolution: {
            ...harnessResolution(),
            ...(DEFER_ACTIONS
              ? {
                  onApplyResolve: () => deferred("apply"),
                  onIgnoreResolve: () => deferred("ignore"),
                }
              : {}),
          },
        }
      : {}),
    onClose: () => {
      // Deliberate test-harness window hooks. `__modalClosed` distinguishes
      // "onClose fired" from "modal merely left the DOM"; the COUNT and the
      // TIMESTAMP are what §7.5(g)/(h) actually assert on — "exactly once" and
      // "at-or-after the exit's transitionend" are both unexpressible with a
      // boolean.
      /* eslint-disable react-hooks/immutability, react-hooks/purity --
         test-harness window hooks; `performance.now()` here is an event-handler
         timestamp, not render-time state — the spec needs the ORDERING of close
         vs the exit's transitionend, which a count cannot express. */
      window.__modalClosed = true;
      window.__closeCount = (window.__closeCount ?? 0) + 1;
      window.__closeAt = performance.now();
      /* eslint-enable react-hooks/immutability, react-hooks/purity */
      setOpen(false);
    },
  });
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<LiveHarness />);
