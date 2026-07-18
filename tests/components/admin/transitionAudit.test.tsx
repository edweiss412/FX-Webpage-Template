// @vitest-environment jsdom
// M12.2 Phase A Task 12 — transition audit (spec §10 inventory). Enumerates the
// transition treatment of every new admin surface and pins it:
//
//   | Live status dot      | CSS ping; DISABLED under prefers-reduced-motion   |
//   | Synced dot heartbeat | subtle CSS pulse on positive+pulse (sync surfaces); slower/smaller than the live ping; DISABLED under prefers-reduced-motion |
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

// No-motion admin surfaces: no client motion library, no AnimatePresence, no
// mount/route-enter animation. Most are server-rendered; the M12.13 undo
// islands (PublishedToggle, PerShowAlertSection) are client components
// but are deliberately motion-free — pinned here so future framer drift on
// them surfaces as a clean test failure (spec §9 / T12 reviewer note).
const SERVER_RENDERED = [
  "components/admin/StatStrip.tsx",
  "components/admin/ShowsTable.tsx",
  "components/admin/NeedsAttentionInbox.tsx",
  "components/admin/StatusIndicator.tsx",
  "components/admin/Dashboard.tsx",
  "app/admin/show/[slug]/page.tsx",
  "components/admin/PublishedToggle.tsx",
  "components/admin/PerShowAlertSection.tsx",
  // admin-show-modal Task 7: the published review modal surface. All three are
  // client components but deliberately motion-free in SOURCE — the modal's
  // entrance/exit animation lives in app/globals.css keyframes hooked via
  // data-review-modal-scrim/-panel attributes (pinned by the shell's own
  // transition suite), never framer/AnimatePresence or mount-animation classes.
  "components/admin/showpage/PublishedReviewModal.tsx",
  "components/admin/review/ReviewModalShell.tsx",
  "components/admin/showpage/ShowReviewModalSkeleton.tsx",
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

  it("positive+pulse renders the subtle heartbeat halo, disabled under prefers-reduced-motion", () => {
    // Sanctioned second animation (SYNC-PULSE-1): a slower/smaller heartbeat behind the
    // synced dot on the sync surfaces. Distinct from the live ping (never animate-ping) and
    // motion-reduce gated, same as the ping.
    render(<StatusIndicator status="positive" label="Synced" pulse />);
    const halo = screen.getByTestId("status-pulse-positive");
    expect(halo.className).toMatch(/animate-\[sync-heartbeat_/);
    expect(halo.className).not.toMatch(/animate-ping/); // it is NOT the live ping
    expect(halo.className).toMatch(/motion-reduce:hidden/);
  });

  it("the heartbeat pulse does not fire without the pulse flag (positive dot stays static)", () => {
    render(<StatusIndicator status="positive" label="Synced" />);
    expect(screen.queryByTestId("status-pulse-positive")).toBeNull();
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
      // No prototype route-enter/stagger mount animations. The only sanctioned motion on
      // these surfaces is the live-dot ping (`animate-ping`) and the synced-dot heartbeat
      // (`animate-[sync-heartbeat_…]`, SYNC-PULSE-1) — both inside StatusIndicator, both
      // status-dot micro-signals, not mount/route-enter transitions. Any OTHER arbitrary
      // `animate-[…]` (a route-enter, a stagger, a framer refugee) still fails here.
      const animateMatches = (s.match(/animate-\[[^\]]*\]|route-enter|stagger/g) ?? []).filter(
        (m) => !m.startsWith("animate-[sync-heartbeat"),
      );
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
