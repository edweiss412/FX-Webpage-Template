"use client";

/**
 * components/admin/dev/GalleryWriteGuard.tsx
 * (spec 2026-07-20-attention-scenario-gallery §4.4)
 *
 * Blocks every mutating network call originating from the gallery page.
 *
 * ── Why this exists, and why the submit guard was not enough ─────────────────
 * §4.4 asserted that "every server action in this subtree posts through a form
 * submit, so one capture-phase preventDefault neutralizes all of them". That is
 * FALSE for the control that actually ships. `AttentionBanner` renders
 * `PerShowAlertResolveButton`, whose resolve control is `type="button"` with an
 * onClick that calls `fetch(POST /api/admin/show/<slug>/alerts/<id>/resolve)`
 * directly (components/admin/PerShowAlertResolveButton.tsx:59-66). No submit
 * event is ever dispatched, so the submit-capture guard does not see it, and a
 * click would run authorization, the route handler, the Supabase call, the
 * error path, and telemetry against a show slug that does not exist.
 *
 * ── Why guard the network rather than the controls ───────────────────────────
 * Blocking specific buttons means maintaining an allowlist of UI shapes, and the
 * whole point of a gallery is that it renders real components that change. A
 * guard at the network boundary is TOTAL: it holds for a control added next
 * month, for an imperative fetch, and for any shape nobody anticipated. That is
 * the property the submit-capture guard was chosen for and did not actually
 * have.
 *
 * Reads are left alone: the surface legitimately fetches to render.
 *
 * A blocked attempt is recorded on `<html data-gallery-blocked-write>` so a
 * reviewer who clicks a control and sees nothing happen can find out why, and
 * so a real-browser test can assert containment on the live page.
 */
import type { GalleryFetchScript } from "@/lib/dev/galleryActionScripts";
import { useEffect } from "react";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const fromInit = init?.method;
  if (typeof fromInit === "string") return fromInit.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

export function GalleryWriteGuard({
  scripts,
}: {
  /** Scenario-scripted responses (spec 2026-07-23 §3.2); absent = 403 everything mutating. */
  scripts?: readonly GalleryFetchScript[];
} = {}) {
  useEffect(() => {
    const original = window.fetch;
    // Per-mount call counters keyed by script - sequencing for partial bulk-ignore.
    const counters = new Map<string, number>();
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = methodOf(input, init);
      if (SAFE_METHODS.has(method)) return original(input, init);
      const url = urlOf(input);
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const script = scripts?.find((sc) => sc.method === method && sc.pathPattern.test(path));
      if (script) {
        const n = counters.get(script.key) ?? 0;
        counters.set(script.key, n + 1);
        // Same discoverability contract as the blocked-write marker below.
        document.documentElement.setAttribute("data-gallery-scripted-write", `${method} ${path}`);
        const r = script.respond(n);
        if (r === "hang") return new Promise<Response>(() => {});
        return new Response(JSON.stringify(r.body), {
          status: r.status,
          headers: { "content-type": "application/json" },
        });
      }
      // Recorded on the element rather than in the console: the project bans
      // console statements in shipped components, and a data attribute is also
      // assertable from a real-browser test, which a console line is not.
      document.documentElement.setAttribute(
        "data-gallery-blocked-write",
        `${method} ${url.replace(/^https?:\/\/[^/]+/, "")}`,
      );
      // Shaped like a refusal the caller can render, not a thrown network
      // error: the card's own error path is itself a state worth seeing.
      return new Response(JSON.stringify({ ok: false, code: "GALLERY_DISPLAY_ONLY" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    };
    return () => {
      window.fetch = original;
    };
  }, [scripts]);

  return null;
}
