/** @vitest-environment jsdom */
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import type { NeedsAttentionItem } from "@/lib/admin/needsAttention";

const NOW = new Date("2026-08-03T13:00:00Z");
type HoldItem = Extract<NeedsAttentionItem, { variant: "identity_hold" }>;
function holdItem(over: Partial<HoldItem> = {}): HoldItem {
  return {
    variant: "identity_hold",
    key: "hold-show:sX",
    showId: "sX",
    slug: "spring-gala",
    title: "Spring Gala",
    summaries: ["Jane Doe's email is changing"],
    copy: "Jane Doe's email is changing",
    activityAt: "2026-08-03T12:00:00+00:00",
    ...over,
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

describe("identity_hold card", () => {
  it("single hold: summary + link with truthy-title aria, NO toggle", () => {
    renderInbox([holdItem()]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("Jane Doe's email is changing")).toBeTruthy();
    const link = within(card).getByTestId("needs-attention-link-identity-hold-sX");
    expect(link.getAttribute("href")).toBe("/admin?show=spring-gala");
    expect(link.getAttribute("aria-label")).toBe(
      "Review held change for Spring Gala (spring-gala)",
    );
    expect(link.textContent).toContain("Review"); // visible text (plan-R8 V2)
    expect(link.className).toContain("min-h-tap-min"); // shared reviewLinkClass (NeedsAttentionInbox.tsx:27-28)
    expect(within(card).queryByTestId("identity-hold-toggle-sX")).toBeNull();
  });

  it("null title: slug renders on the visible line; slug-only aria fork", () => {
    renderInbox([holdItem({ title: null })]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(card).getByText("spring-gala")).toBeTruthy();
    expect(
      within(card).getByTestId("needs-attention-link-identity-hold-sX").getAttribute("aria-label"),
    ).toBe("Review held change for spring-gala");
  });

  it("multi hold: tabular count copy, aria toggle, no-region panel, footer link in BOTH states", () => {
    const summaries = ["s one", "s two", "s three"];
    renderInbox([holdItem({ summaries, copy: "3 held changes waiting" })]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    const countLine = within(card).getByText("3 held changes waiting");
    expect(countLine.className).toContain("tabular-nums"); // spec R5-J2
    const linkCollapsed = within(card).getByTestId("needs-attention-link-identity-hold-sX"); // BEFORE expansion
    expect(linkCollapsed.getAttribute("aria-label")).toBe(
      "Review held changes for Spring Gala (spring-gala)",
    );
    expect(linkCollapsed.textContent).toContain("Review"); // visible text, not aria-only (plan-R8 V2)
    expect(linkCollapsed.className).toContain("min-h-tap-min"); // shared reviewLinkClass tap floor (NeedsAttentionInbox.tsx:27-28)
    // The panel is ALWAYS mounted (CollapsePanel height-morph), which is what
    // makes aria-controls resolve while collapsed. Assert that unconditionally:
    // the previous `if (panelPre)` guard silently vanished on an implementation
    // that mounted the panel only after expansion, leaving aria-controls
    // dangling AND skipping the containment check below.
    const panelPre = document.getElementById("identity-hold-panel-sX");
    if (!panelPre) throw new Error("panel must be mounted while collapsed (aria-controls target)");
    expect(panelPre.hasAttribute("inert")).toBe(true); // collapsed subtree leaves tab order + AT tree
    // The footer link must live OUTSIDE that inert subtree, or it is unreachable
    // exactly while collapsed.
    expect(panelPre.contains(linkCollapsed)).toBe(false);
    const toggle = within(card).getByTestId("identity-hold-toggle-sX");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("identity-hold-panel-sX");
    expect(toggle.getAttribute("aria-label")).toBe(
      "Show details for 3 held changes for Spring Gala (spring-gala)",
    );
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById("identity-hold-panel-sX");
    if (!panel) throw new Error("panel missing");
    expect(panel.getAttribute("role")).not.toBe("region"); // repeated-landmark opt-out (spec H3)
    for (const s of summaries) expect(within(panel as HTMLElement).getByText(s)).toBeTruthy();
    expect(within(card).getByTestId("needs-attention-link-identity-hold-sX")).toBeTruthy(); // AFTER expansion
  });

  it("caps panel at 10 lines: first ten ALL present, tail derived, eleventh absent", () => {
    const summaries = Array.from({ length: 13 }, (_, i) => `summary ${i}`);
    renderInbox([holdItem({ summaries, copy: "13 held changes waiting" })]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    for (let i = 0; i < 10; i++) expect(within(panel).getByText(`summary ${i}`)).toBeTruthy(); // plan-R1 F12
    expect(within(panel).queryByText("summary 10")).toBeNull();
    const more = within(panel).getByText(`and ${summaries.length - 10} more`);
    expect(more.className).toContain("tabular-nums"); // spec R5-J2
  });

  it("EXACTLY ten summaries: all ten render and no tail line appears (cap boundary)", () => {
    // The off-by-one that a 13-summary case cannot catch: at exactly the cap the
    // list is complete and "and 0 more" must NOT render.
    const summaries = Array.from({ length: 10 }, (_, i) => `boundary ${i}`);
    renderInbox([holdItem({ summaries, copy: "10 held changes waiting" })]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    for (const s of summaries) expect(within(panel).getByText(s)).toBeTruthy();
    expect(within(panel).queryByText(/and \d+ more/)).toBeNull();
  });

  it("null title: the toggle and the expanded Hide-details name both fall back to the slug", () => {
    renderInbox([holdItem({ title: null, summaries: ["a", "b"], copy: "2 held changes waiting" })]);
    const toggle = screen.getByTestId("identity-hold-toggle-sX");
    expect(toggle.getAttribute("aria-label")).toBe(
      "Show details for 2 held changes for spring-gala",
    );
    fireEvent.click(toggle);
    // The verb flips with state, so the collapsed name alone does not pin it.
    expect(toggle.getAttribute("aria-label")).toBe(
      "Hide details for 2 held changes for spring-gala",
    );
    expect(toggle.textContent).toContain("Hide details");
  });

  it("empty-string title: the FOOTER link name also falls back to the slug", () => {
    renderInbox([holdItem({ title: "", summaries: ["a", "b"], copy: "2 held changes waiting" })]);
    expect(
      screen.getByTestId("needs-attention-link-identity-hold-sX").getAttribute("aria-label"),
    ).toBe("Review held changes for spring-gala");
  });

  it("a long summary renders in full AND carries the wrap guard, in both modes", () => {
    // A hold summary embeds raw email addresses, and a 64-character local-part is
    // ONE unbreakable token: measured at 512px against a ~316px card interior at
    // the 390px viewport, it forces horizontal scroll. jsdom computes no layout,
    // so the assertable proxy is the wrap utility on the element that renders the
    // string — asserting only that the text survives cannot see the overflow.
    const long = `Jane Doe's email is changing from ${"a".repeat(64)}@old.com to ${"b".repeat(64)}@new.com`;

    renderInbox([holdItem({ summaries: [long], copy: long })]);
    const card = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(card.textContent).toContain(long);
    expect(within(card).getByText(long).className).toContain("wrap-break-word");
    cleanup();

    // Same guard on the disclosed lines, which is a different render path.
    renderInbox([holdItem({ summaries: [long, "second"], copy: "2 held changes waiting" })]);
    fireEvent.click(screen.getByTestId("identity-hold-toggle-sX"));
    const panel = document.getElementById("identity-hold-panel-sX") as HTMLElement;
    expect(within(panel).getByText(long).className).toContain("wrap-break-word");
  });

  it("visible card header reads Held change / Held changes with the count fork", () => {
    // The help-label crosswalk can stay green through the disclosure's separate
    // "Held changes for …" label, so a regression in the CARD HEADER fork would
    // otherwise go unnoticed. Scoped to the card, and the singular case asserts
    // the plural is absent so one cannot satisfy the other.
    renderInbox([holdItem()]);
    const singleCard = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(singleCard).getByText("Held change")).toBeTruthy();
    expect(within(singleCard).queryByText("Held changes")).toBeNull();
    cleanup();

    renderInbox([holdItem({ summaries: ["a", "b"], copy: "2 held changes waiting" })]);
    const multiCard = screen.getByTestId("needs-attention-item-identity-hold-sX");
    expect(within(multiCard).getByText("Held changes")).toBeTruthy();
  });

  it("empty-string title: accessible names still carry slug via the truthy fork", () => {
    renderInbox([holdItem({ title: "", summaries: ["a", "b"], copy: "2 held changes waiting" })]);
    expect(screen.getByTestId("identity-hold-toggle-sX").getAttribute("aria-label")).toBe(
      "Show details for 2 held changes for spring-gala",
    );
  });
});
