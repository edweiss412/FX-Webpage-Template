// @vitest-environment jsdom
// parse-data-quality-warnings — Task 14: transition audit for the data-gap
// surfaces.
//
// This feature introduces four NEW conditional renders, every one of which
// reflects a STATIC parse-state fact (how many fields/sections/blocks dropped
// while reading the sheet). None is a user-driven mode toggle, none is animated,
// and none should ever be — the value is fixed at parse time and only changes on
// the next sync (a full server re-render). So the correct transition treatment
// for all four is INSTANT: a plain early-return / ternary / `&&` that mounts or
// unmounts the element with no AnimatePresence, no framer-motion, no
// exit/initial/animate props.
//
// Transition inventory (every NEW conditional this feature adds):
//
//   | Surface                         | Conditional                          | Treatment |
//   | ------------------------------- | ------------------------------------ | --------- |
//   | Data-gaps chip (ShowsTable)     | early-return null when total===0     | INSTANT   |
//   | Step-3 per-class detail         | `dataGapDetails.length > 0 ? … : null` | INSTANT |
//   | Per-show "Data quality" panel   | `failed ? … : messages.length>0 ? … : null` | INSTANT |
//   | First-published alert sub-line  | `dataGapsDigest ? … : null`          | INSTANT   |
//
// Compound transitions: each surface lives in a different component, reads a
// different data source, and shares no client state with the others (all four
// are server-rendered or render-pure given props) → there is no compound
// state-A-changes-while-B-mid-animation hazard. Nothing here animates, so there
// is nothing to interrupt.
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShowsTable } from "@/components/admin/ShowsTable";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import type { DataGapsSummary } from "@/lib/parser/dataGaps";

afterEach(cleanup);

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

// Every component file that renders one of the four data-gap surfaces. If any
// of them grows a framer-motion import or an AnimatePresence wrapper, the
// blanket grep below fails — catching the failure mode "someone wrapped a
// static parse-state element in a motion transition."
const DATA_GAP_SOURCE_FILES = [
  "components/admin/ShowsTable.tsx",
  "components/admin/wizard/Step3SheetCard.tsx",
  "components/admin/PerShowAlertSection.tsx",
  "app/admin/show/[slug]/page.tsx",
] as const;

const now = new Date("2026-06-03T12:00:00.000Z");

function gaps(total: number): DataGapsSummary {
  return {
    total,
    classes: {
      FIELD_UNREADABLE: total,
      UNKNOWN_SECTION_HEADER: 0,
      BLOCK_DISAPPEARED: 0,
    },
  };
}

function row(over: Partial<ActiveShowRow> & { slug: string }): ActiveShowRow {
  return {
    id: over.slug,
    title: `Title ${over.slug}`,
    showDateStart: "2026-06-01",
    showDateEnd: "2026-06-05",
    crewCount: 4,
    lastSyncedAt: "2026-06-03T10:00:00.000Z",
    lastSyncStatus: "ok",
    published: true,
    isLive: false,
    finalizeOwned: false,
    archivedAt: null,
    ...over,
  };
}

describe("data-gap surfaces — transition audit (instant, static parse-state)", () => {
  // Failure mode: a future edit imports framer-motion / motion/react or wraps a
  // data-gap element in <AnimatePresence> — turning a static parse fact into an
  // animated transition that flickers on every server re-render.
  it("no data-gap component imports a client motion library or AnimatePresence", () => {
    for (const rel of DATA_GAP_SOURCE_FILES) {
      const s = src(rel);
      expect(s, `${rel} must not import a client motion library`).not.toMatch(
        /framer-motion|motion\/react/,
      );
      expect(s, `${rel} must not use AnimatePresence`).not.toMatch(/AnimatePresence/);
      expect(s, `${rel} must not pass motion exit/initial/animate props`).not.toMatch(
        /\b(?:exit|initial|animate)\s*=\s*\{/,
      );
    }
  });

  // Failure mode: the chip stops being a plain early-return (e.g. it becomes a
  // conditional CSS class on an always-mounted element, or an AnimatePresence
  // child) — which would keep a stale chip in the DOM or animate its removal.
  it("the data-gaps chip is gated by a plain early-return null (ShowsTable)", () => {
    const s = src("components/admin/ShowsTable.tsx");
    // The chip component bails before rendering any element when there is no gap.
    expect(s).toMatch(/if \(!dataGaps \|\| dataGaps\.total === 0\) return null;/);
    // …and is rendered as a bare conditional sibling, not wrapped in a motion/
    // presence container.
    expect(s).toMatch(/<DataGapsChip slug=\{row\.slug\} dataGaps=\{row\.dataGaps\} \/>/);
  });

  // Failure mode: the Step-3 detail, per-show panel, or alert sub-line gets
  // wrapped so it lingers/animates instead of disappearing the instant its
  // count hits zero. Pin each as a plain ternary-to-null.
  it("Step-3 detail, per-show panel, and alert sub-line are plain ternary-to-null", () => {
    const step3 = src("components/admin/wizard/Step3SheetCard.tsx");
    // The summary warning row (per-class data-gap chips) is a plain ternary-to-null:
    // present iff there's a data gap, gone otherwise — instant, no AnimatePresence/
    // motion wrapper.
    expect(step3).toMatch(/\{dataGapDetails\.length > 0 \? \(/);
    // Per-show panel: failed → calm notice; else (data-gap messages OR operator-
    // actionable warnings) → section; else null. Still a plain ternary-to-null
    // (instant present/absent, no AnimatePresence) — the condition is now compound
    // because the panel also hosts the operator-actionable deep-link subsection.
    const page = src("app/admin/show/[slug]/page.tsx");
    expect(page).toMatch(/\{dataQuality\.failed \? \(/);
    expect(page).toMatch(
      /: dataQuality\.messages\.length > 0 \|\| actionableItems\.length > 0 \? \(/,
    );
    expect(src("components/admin/PerShowAlertSection.tsx")).toMatch(/\{dataGapsDigest \? \(/);
  });

  // Render-level proof the chip mounts/unmounts INSTANTLY: present iff total>0,
  // gone otherwise, and the rendered element carries no transition/animation
  // style and no framer presence attributes (which AnimatePresence would add to
  // keep an exiting child mounted). Failure mode: an animated removal would
  // leave the chip (or a wrapper with opacity/transform style) in the DOM after
  // the count drops to zero.
  it("chip is present iff total>0 and renders with no animation wrapper", () => {
    const rowAction = (r: ActiveShowRow) => (
      <button data-testid={`publish-${r.slug}`}>Publish</button>
    );

    const { rerender } = render(
      <ShowsTable
        rows={[row({ slug: "g", dataGaps: gaps(2) })]}
        now={now}
        activeCount={1}
        overflowCount={0}
        rowAction={rowAction}
      />,
    );
    const chip = screen.getByTestId("shows-data-gaps-chip-g");
    expect(chip).toBeInTheDocument();
    // Static element: no inline transition/animation, no framer presence marker.
    expect(chip.getAttribute("style") ?? "").not.toMatch(/transition|animation|opacity|transform/);
    expect(chip.tagName).toBe("SPAN");
    for (const a of Array.from(chip.attributes)) {
      expect(a.name, "no framer data-* presence attribute").not.toMatch(/^data-(framer|motion)/);
    }

    // total===0 → the chip unmounts entirely (no lingering animated exit).
    rerender(
      <ShowsTable
        rows={[row({ slug: "g", dataGaps: gaps(0) })]}
        now={now}
        activeCount={1}
        overflowCount={0}
        rowAction={rowAction}
      />,
    );
    expect(screen.queryByTestId("shows-data-gaps-chip-g")).not.toBeInTheDocument();
    // The action sibling is unaffected by the chip's absence.
    expect(screen.getByTestId("publish-g")).toBeInTheDocument();
  });
});
