// @vitest-environment jsdom
// Transition audit for the ShowsTable Status pills (spec 2026-06-30-admin-shows-
// status-column §7). The Status column introduces NO animation: StatePill is a
// static bordered pill with a static dot; the inline↔column swap is a pure CSS
// visibility toggle of two static DOM nodes. This audit pins that.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";

afterEach(cleanup);
const now = new Date("2026-06-03T12:00:00.000Z");
const base = (over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow => ({
  id: over.slug,
  title: `T ${over.slug}`,
  showDateStart: "2026-06-01",
  showDateEnd: "2026-06-05",
  crewCount: 3,
  lastSyncedAt: "2026-06-03T10:00:00.000Z",
  lastSyncStatus: "ok",
  published: true,
  isLive: false,
  finalizeOwned: false,
  archivedAt: null,
  ...over,
});

describe("ShowsTable status pills — transition audit (§7: no animation introduced)", () => {
  // DOM-SCOPED animation ban: assert every status pill AND its inner dot carries no
  // animate-*/transition-*/motion-* class. Scoped to the pills (NOT the whole file) so it
  // does NOT false-fail on the pre-existing sort-header `transition-colors`, while still
  // catching a `transition-opacity`/`animate-*` accidentally added to a pill.
  it("every status pill + dot has no animation/transition class (all 4 states × both places)", () => {
    render(
      <ShowsTable
        rows={[
          base({ slug: "pu", published: true, isLive: false }),
          base({ slug: "lv", published: true, isLive: true }),
          base({ slug: "pg", published: false, finalizeOwned: true }),
          base({ slug: "hl", published: false, finalizeOwned: false }),
        ]}
        now={now}
        activeCount={4}
        overflowCount={0}
      />,
    );
    const testids = [
      "shows-published-pill-pu",
      "shows-statuscol-published-pu",
      "shows-live-pill-lv",
      "shows-statuscol-live-lv",
      "shows-publishing-pg",
      "shows-statuscol-publishing-pg",
      "shows-held-pill-hl",
      "shows-statuscol-held-hl",
    ];
    for (const id of testids) {
      const pill = screen.getByTestId(id);
      for (const el of [pill, ...Array.from(pill.querySelectorAll("*"))] as HTMLElement[]) {
        expect(el.className, `${id}: pill/dot carries an animation class`).not.toMatch(
          /\banimate-|\btransition-|\bmotion-/,
        );
      }
    }
  });

  it("source has no heavyweight animation primitive for the pills (no AnimatePresence/framer-motion/animate-ping)", () => {
    const src = readFileSync("components/admin/ShowsTable.tsx", "utf8");
    expect(src).not.toMatch(/AnimatePresence|framer-motion/);
    // the Live pill is a static dot (§3/§7); the pulsing animate-ping belongs ONLY to
    // StatusIndicator (the Sync cell), never to this file.
    expect(src).not.toMatch(/animate-ping/);
  });

  it("inline↔column is a pure CSS toggle: both pills exist as static nodes, no JS conditional mount", () => {
    render(
      <ShowsTable
        rows={[base({ slug: "p", published: true })]}
        now={now}
        activeCount={1}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-published-pill-p")).toBeInTheDocument();
    expect(screen.getByTestId("shows-statuscol-published-p")).toBeInTheDocument();
  });

  it("compound: a published row and a held row each render their own instant state (no shared animation state)", () => {
    render(
      <ShowsTable
        rows={[
          base({ slug: "a", published: true }),
          base({ slug: "b", published: false, finalizeOwned: false }),
        ]}
        now={now}
        activeCount={2}
        overflowCount={0}
      />,
    );
    expect(screen.getByTestId("shows-statuscol-published-a")).toBeInTheDocument();
    expect(screen.getByTestId("shows-statuscol-held-b").textContent).toBe("Held");
  });
});
