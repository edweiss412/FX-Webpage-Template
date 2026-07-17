/**
 * tests/e2e/_blockedRowResolverLiveEntry.tsx (Task 12 — transition audit)
 *
 * Browser ENTRY for the LIVE interaction/transition harness: mounts the REAL
 * <BlockedRowResolver> (components/admin/BlockedRowResolver.tsx) with
 * react-dom/client so the idle -> armed -> pending -> resolved sequence runs
 * against real component JS in a real browser, per the project's documented
 * live-interaction harness pattern (memory/reference_step3_modal_realbrowser
 * _harnesses, Pattern 2).
 *
 * This file is NEVER imported by a Playwright spec (Playwright's babel
 * transform rewrites JSX in every spec-imported .tsx into component-testing
 * payloads that react-dom/server cannot render). Instead
 * blocked-row-resolver-transitions.spec.ts bundles it in beforeAll with a
 * version-pinned `pnpm dlx esbuild@0.28.0 --bundle --format=iife
 * --jsx=automatic` and serves the bundle over node:http.
 *
 * Window hooks (kept minimal + deterministic):
 *   - window.fetch is stubbed for ONLY the resolve-blocker route: it returns
 *     a promise the harness holds open until the spec calls
 *     `window.__releaseResolve()`, so the spec can observe the "pending"
 *     state (aria-busy, "Unarchiving…" label) before the fetch settles —
 *     the real fetch never resolves on its own inside this dev-server-less
 *     harness.
 *   - window.__resolvedFired flips true when onResolved fires; the harness
 *     App ALSO unmounts <BlockedRowResolver> and renders a
 *     `host-resolved-marker` in its place (mirrors how the real host panels
 *     remove a row once run.runLoop()/handleClick() re-fetches and the row
 *     drops out of cas_per_row) — both are asserted so "resolved" is
 *     observable two ways, matching the modal harness's __modalClosed idiom.
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BlockedRowResolver } from "@/components/admin/BlockedRowResolver";

declare global {
  interface Window {
    __resolvedFired?: boolean;
    __releaseResolve?: () => void;
  }
}

const RESOLVE_ROUTE = "/api/admin/onboarding/resolve-blocker";
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? "");
  if (url === RESOLVE_ROUTE) {
    return new Promise<Response>((resolve) => {
      window.__releaseResolve = () => {
        resolve(
          new Response(JSON.stringify({ ok: true, status: "resolved" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      };
    });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

function LiveHarness() {
  const [resolved, setResolved] = useState(false);
  return (
    <div data-testid="harness-mount">
      {resolved ? (
        <p data-testid="host-resolved-marker">Resolved. Row removed from the list.</p>
      ) : (
        <BlockedRowResolver
          driveFileId="drive-e2e-1"
          wizardSessionId="wiz-e2e-1"
          code="SHOW_ARCHIVED_IMMUTABLE"
          displayName="E2E Test Show"
          onResolved={() => {
            // Deliberate test-harness window hook (mirrors __modalClosed):
            // the Playwright spec reads window.__resolvedFired to distinguish
            // "onResolved fired" from "the resolver merely left the DOM".
            window.__resolvedFired = true;
            setResolved(true);
          }}
        />
      )}
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(<LiveHarness />);
