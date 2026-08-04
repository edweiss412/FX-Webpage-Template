/** @vitest-environment jsdom */
// Transition-audit task for the identity_hold card (spec §7 Transition
// Inventory). Two tiers:
//
//   SOURCE  — pins the treatment choices the DOM cannot show: no Framer Motion
//             anywhere (the height morph is CollapsePanel's grid transition),
//             exactly one CollapsePanel usage, the repeated-landmark opt-out,
//             the required label prop (DOM-invisible under region={false}, so
//             source is the only pinnable tier — plan-R1 F12), and the island
//             root carrying NO gap utility (CollapsePanel.tsx:22-25 spacing
//             contract, spec R6-K3).
//   BEHAVIOR — exercises every mode-crossing pair and the compound rows: mode
//             elements mount/unmount without throwing, an in-place summaries
//             change while expanded updates the panel, and a count drop to
//             exactly 1 while expanded unmounts the island (mode boundary wins
//             over disclosure state, spec R7-L2).
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

const NOW = new Date("2026-08-03T13:00:00Z");
type HoldItem = Extract<NeedsAttentionItem, { variant: "identity_hold" }>;
function holdItem(summaries: string[]): HoldItem {
  return {
    variant: "identity_hold",
    key: "hold-show:sX",
    showId: "sX",
    slug: "spring-gala",
    title: "Spring Gala",
    summaries,
    copy: summaries.length === 1 ? summaries[0]! : `${summaries.length} held changes waiting`,
    activityAt: "2026-08-03T12:00:00+00:00",
  };
}
function renderInbox(items: NeedsAttentionItem[]) {
  return render(
    <NeedsAttentionInbox
      items={items}
      totalCount={items.length}
      renderedCount={items.length}
      overflowCount={0}
      now={NOW}
    />,
  );
}

describe("identity_hold transition audit — source tier", () => {
  const islandSrc = readFileSync("components/admin/IdentityHoldDisclosure.tsx", "utf8");
  const inboxSrc = readFileSync("components/admin/NeedsAttentionInbox.tsx", "utf8");

  it("no Framer Motion in either file: the only animation is CollapsePanel's height morph", () => {
    for (const src of [islandSrc, inboxSrc]) {
      expect(src).not.toContain("AnimatePresence");
      expect(src).not.toMatch(/\bmotion\./);
      expect(src).not.toMatch(/from\s+["']framer-motion["']/);
    }
  });

  it("exactly one CollapsePanel usage, with region={false} and a label", () => {
    const usages = islandSrc.match(/<CollapsePanel\b/g) ?? [];
    expect(usages).toHaveLength(1);
    expect(islandSrc).toContain("region={false}");
    expect(islandSrc).toContain("label={");
    // The inbox itself never mounts a panel: the disclosure lives only in the island.
    expect(inboxSrc).not.toContain("<CollapsePanel");
  });

  it("focus-ring offset matches the CARD surface, not the page background (DESIGN.md §15)", () => {
    // The island renders inside a bg-surface card, so ring-offset-surface. The
    // IgnoredSheetsDisclosure precedent this component is modeled on uses
    // ring-offset-bg because it sits on the page background — copying that
    // token draws a 2px page-colored gap on top of the card, visibly wrong in
    // dark mode. The card's own footer link already offsets to surface.
    expect(islandSrc).toContain("focus-visible:ring-offset-surface");
    expect(islandSrc).not.toContain("focus-visible:ring-offset-bg");
  });

  it("island root carries no gap utility (collapsed track would keep a parent gap visible)", () => {
    // The root element is the first JSX tag of the returned tree.
    const rootMatch = islandSrc.match(/<div className="([^"]*)"/);
    if (!rootMatch) throw new Error("island root className not found");
    expect(rootMatch[1]).not.toMatch(/\bgap-/);
  });
});

describe("identity_hold transition audit — behavioral tier", () => {
  it("single → multi-collapsed and multi-collapsed → single: mode elements mount/unmount", () => {
    const { rerender } = renderInbox([holdItem(["only one"])]);
    expect(screen.queryByTestId("identity-hold-toggle-sX")).toBeNull();

    const remount = (items: NeedsAttentionItem[]) =>
      rerender(
        <NeedsAttentionInbox
          items={items}
          totalCount={items.length}
          renderedCount={items.length}
          overflowCount={0}
          now={NOW}
        />,
      );

    remount([holdItem(["a", "b"])]);
    const toggle = screen.getByTestId("identity-hold-toggle-sX");
    expect(toggle.getAttribute("aria-expanded")).toBe("false"); // mounts collapsed

    remount([holdItem(["only one"])]);
    expect(screen.queryByTestId("identity-hold-toggle-sX")).toBeNull();
    expect(document.getElementById("identity-hold-panel-sX")).toBeNull();
  });

  it("compound (a): summaries change in place while expanded, count stays above 1", () => {
    const { rerender } = renderInbox([holdItem(["one", "two", "three"])]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(within(panel).getByText("two")).toBeTruthy();

    const next = [holdItem(["one", "converted", "three"])];
    rerender(
      <NeedsAttentionInbox
        items={next}
        totalCount={1}
        renderedCount={1}
        overflowCount={0}
        now={NOW}
      />,
    );
    const panelAfter = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(within(panelAfter).getByText("converted")).toBeTruthy();
    expect(within(panelAfter).queryByText("two")).toBeNull();
  });

  it("compound: count drops to exactly 1 while expanded — mode boundary unmounts the island (R7-L2)", () => {
    const { rerender } = renderInbox([holdItem(["one", "two"])]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    expect(screen.getByTestId("identity-hold-toggle-sX").getAttribute("aria-expanded")).toBe("true");

    const next = [holdItem(["only"])];
    rerender(
      <NeedsAttentionInbox
        items={next}
        totalCount={1}
        renderedCount={1}
        overflowCount={0}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId("identity-hold-toggle-sX")).toBeNull();
    expect(document.getElementById("identity-hold-panel-sX")).toBeNull();
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("only")).toBeTruthy();
  });
});
