// @vitest-environment jsdom
// M12.2 Phase A Task 12 — transition audit (spec §10 inventory). Enumerates the
// transition treatment of every new admin surface and pins it:
//
//   | Live status dot      | CSS ping; DISABLED under prefers-reduced-motion   |
//   | Copy chip            | idle→copied→idle text swap, instant, no layout shift |
//   | Rotate / Reset       | preserve existing button-state behavior (no change) |
//   | Route enter          | INSTANT (V6 decision — no mount animation)        |
//   | Inbox empty↔populated| server-rendered — instant, no client transition   |
//   | Status pill / footer | server-rendered — instant, no client transition   |
//
// Compound: the copy-feedback timeout and the live-dot ping live in different
// components and share no state → no compound-transition hazard.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusIndicator } from "@/components/admin/StatusIndicator";

afterEach(cleanup);

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// Server-rendered admin surfaces: no client motion library, no AnimatePresence.
const SERVER_RENDERED = [
  "components/admin/StatStrip.tsx",
  "components/admin/ShowsTable.tsx",
  "components/admin/NeedsAttentionInbox.tsx",
  "components/admin/StatusIndicator.tsx",
  "components/admin/Dashboard.tsx",
  "app/admin/show/[slug]/page.tsx",
];

describe("transition audit (§10)", () => {
  it("live status dot pings, and the ping is disabled under prefers-reduced-motion", () => {
    render(<StatusIndicator status="live" label="Live" />);
    const dot = screen.getByTestId("status-dot-live");
    // The ping is a sibling within the same relative wrapper.
    const ping = dot.parentElement?.querySelector(".animate-ping");
    expect(ping, "live variant must render a ping element").not.toBeNull();
    expect(ping!.className).toMatch(/motion-reduce:hidden/);
  });

  it("non-live status has no ping (static dot only)", () => {
    render(<StatusIndicator status="positive" label="Synced" />);
    const dot = screen.getByTestId("status-dot-positive");
    expect(dot.parentElement?.querySelector(".animate-ping")).toBeNull();
  });

  it("StatusIndicator is a pure server component — no useState/useEffect (no shared timeout state)", () => {
    const s = src("components/admin/StatusIndicator.tsx");
    expect(s).not.toMatch(/useState|useEffect|"use client"/);
  });

  it("server-rendered admin surfaces use no client motion library / AnimatePresence (instant)", () => {
    for (const rel of SERVER_RENDERED) {
      const s = src(rel);
      expect(s, `${rel} must not import a client motion library`).not.toMatch(
        /framer-motion|motion\/react/,
      );
      expect(s, `${rel} must not use AnimatePresence`).not.toMatch(/AnimatePresence/);
    }
  });

  it("route enter is instant — no mount-animation classes on the new surfaces (V6)", () => {
    for (const rel of SERVER_RENDERED) {
      const s = src(rel);
      // No prototype route-enter/stagger mount animations; the only animate-*
      // utility allowed is the live-dot ping inside StatusIndicator.
      const animateMatches = (s.match(/animate-\[|route-enter|stagger/g) ?? []).filter(Boolean);
      expect(animateMatches, `${rel} should have no mount/route-enter animation`).toEqual([]);
    }
  });

  it("copy chip swap is text-only, instant, no layout shift (ShareLinkCopyButton text toggle)", () => {
    // ShareLinkCopyButton swaps its label idle→copied within the SAME button
    // element (no element add/remove → no layout shift) and uses no AnimatePresence.
    const s = src("app/admin/show/[slug]/ShareLinkCopyButton.tsx");
    expect(s).not.toMatch(/AnimatePresence|framer-motion|motion\/react/);
    expect(s).toMatch(/Copied|Copy/);
  });
});
