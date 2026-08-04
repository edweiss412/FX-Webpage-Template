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
//   BEHAVIOR — every mode-crossing pair in the inventory plus all three compound
//             rows: single<->multi mount/unmount, the collapsed->expanded morph
//             AND its reverse via a second user toggle, (a) an in-place summaries
//             change while expanded, (b) the whole group clearing while expanded,
//             (c) a refresh landing while open, and the count dropping to exactly
//             1 while expanded (mode boundary wins over disclosure state, R7-L2).
//             The refresh-REMOUNT row is a full document load, which jsdom cannot
//             stage; the e2e spec pins it (tests/e2e/needs-attention-holds.spec.ts).
import { readFileSync } from "node:fs";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

const ISLAND_PATH = "components/admin/IdentityHoldDisclosure.tsx";
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
  const islandSrc = readFileSync(ISLAND_PATH, "utf8");
  const inboxSrc = readFileSync("components/admin/NeedsAttentionInbox.tsx", "utf8");

  it("no Framer Motion in either file: the only animation is CollapsePanel's height morph", () => {
    for (const src of [islandSrc, inboxSrc]) {
      expect(src).not.toContain("AnimatePresence");
      expect(src).not.toMatch(/\bmotion\./);
      expect(src).not.toMatch(/from\s+["']framer-motion["']/);
    }
  });

  it("exactly one CollapsePanel usage, LIVE-wired to open, with region={false} and a label", () => {
    // Comments stripped: every predicate here is comment-satisfiable otherwise.
    const src = stripCommentsForFile(islandSrc, ISLAND_PATH);
    const usages = src.match(/<CollapsePanel\b/g) ?? [];
    expect(usages).toHaveLength(1);
    const start = src.indexOf("<CollapsePanel");
    const props = src.slice(start, src.indexOf(">", start));
    // The LIVE wiring: `open={false}` would leave the toggle announcing
    // aria-expanded="true" while the panel stayed collapsed and out of the AT
    // tree, and nothing else in this file would notice.
    expect(props).toMatch(/\bopen=\{open\}/);
    expect(props).toContain("region={false}");
    expect(props).toMatch(/\blabel=\{/);
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

  it("multi-expanded → multi-collapsed by a SECOND user toggle (the reverse morph)", () => {
    // The inventory lists the user-toggle collapse as its own row. Expanding once
    // and never collapsing leaves that row unexercised, and a handler that only
    // ever sets open=true would pass every other case here.
    renderInbox([holdItem(["one", "two", "three"])]);
    const toggle = screen.getByTestId("identity-hold-toggle-sX");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // The panel stays MOUNTED through the collapse (height morph, not unmount)
    // and returns to inert.
    const panel = document.getElementById("identity-hold-panel-sX");
    if (!panel) throw new Error("panel unmounted on collapse - that is not the morph contract");
    expect(panel.hasAttribute("inert")).toBe(true);
  });

  it("the EXPANDED panel is NOT inert (open content must reach the AT tree)", () => {
    // The collapsed-inert assertion alone is satisfied by a panel that is ALWAYS
    // inert, which would hide the summaries from assistive tech in both states.
    renderInbox([holdItem(["one", "two"])]);
    const panelClosed = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(panelClosed.hasAttribute("inert")).toBe(true);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panelOpen = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(panelOpen.hasAttribute("inert")).toBe(false);
  });

  it("compound (b): the whole group clears while expanded — card unmounts, no exit animation", () => {
    const { rerender } = renderInbox([holdItem(["one", "two"])]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    expect(screen.getByTestId("identity-hold-toggle-sX").getAttribute("aria-expanded")).toBe(
      "true",
    );

    // An approve deletes every hold row for the show, so the next payload carries
    // no item for it at all.
    rerender(
      <NeedsAttentionInbox
        items={[]}
        totalCount={0}
        renderedCount={0}
        overflowCount={0}
        now={NOW}
      />,
    );
    expect(screen.queryByTestId("needs-attention-item-identity-hold-sX")).toBeNull();
    expect(document.getElementById("identity-hold-panel-sX")).toBeNull();
    expect(screen.queryByTestId("identity-hold-toggle-sX")).toBeNull();
  });

  it("compound (c): a toggle DURING a refresh keeps local open state and the refreshed payload", () => {
    // Local island state and the server payload update independently; the island
    // must not reset just because new children arrived.
    const { rerender } = renderInbox([holdItem(["one", "two", "three"])]);
    const toggle = screen.getByTestId("identity-hold-toggle-sX");
    fireEvent.click(toggle);
    rerender(
      <NeedsAttentionInbox
        items={[holdItem(["one", "refreshed", "three"])]}
        totalCount={1}
        renderedCount={1}
        overflowCount={0}
        now={NOW}
      />,
    );
    expect(screen.getByTestId("identity-hold-toggle-sX").getAttribute("aria-expanded")).toBe(
      "true",
    );
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(within(panel).getByText("refreshed")).toBeTruthy();
  });

  it("compound: count drops to exactly 1 while expanded — mode boundary unmounts the island (R7-L2)", () => {
    const { rerender } = renderInbox([holdItem(["one", "two"])]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    expect(screen.getByTestId("identity-hold-toggle-sX").getAttribute("aria-expanded")).toBe(
      "true",
    );

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
