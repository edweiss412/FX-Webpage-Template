// @vitest-environment jsdom
/**
 * tests/components/admin/dev/scenarioBlock.test.tsx
 *
 * The gallery's per-scenario block (spec 2026-07-20-attention-scenario-gallery
 * §4.0, §4.1, §4.4): capture-phase submit interception, live menu state, group
 * isolation, the warnings tri-state, the readout, and the max-width guard.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ScenarioBlock } from "@/components/admin/dev/ScenarioBlock";
import type { ScenarioBlockProps } from "@/components/admin/dev/ScenarioBlock";
import type { AttentionItem } from "@/lib/admin/attentionItems";

function baseProps(over: Partial<ScenarioBlockProps> = {}): ScenarioBlockProps {
  return {
    scenarioId: "t2-single",
    label: "Exactly one item",
    items: [],
    groups: [],
    holdItems: [],
    readout: [{ label: "code", value: "SYNC_STALLED" }],
    warnings: null,
    degraded: false,
    maxWidthPx: null,
    ...over,
  };
}

function alertItem(over: Partial<Extract<AttentionItem, { kind: "alert" }>> = {}): AttentionItem {
  return {
    id: "alert:1",
    kind: "alert",
    tone: "notice",
    sectionId: "overview",
    crewKey: null,
    actionable: true,
    menuTitle: "Sync stalled",
    menuSubtitle: "dana@example.test",
    alert: {
      alertId: "1",
      code: "SYNC_STALLED",
      template: null,
      params: {},
      action: null,
      helpHref: null,
      raisedAt: "2026-07-01T12:00:00.000Z",
      occurrenceCount: 1,
      autoClearNote: null,
      failedKeys: null,
      dataGaps: null,
      errorCode: null,
    },
    ...over,
  };
}

function holdItem(id: string): AttentionItem {
  return {
    id,
    kind: "hold",
    tone: "critical",
    sectionId: "changes",
    crewKey: null,
    actionable: true,
    menuTitle: "Pick what happens",
    menuSubtitle: null,
  };
}

afterEach(cleanup);

describe("ScenarioBlock", () => {
  test("a form submit inside the block never fires its action", () => {
    const action = vi.fn();
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "overview",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [
                <form key="f" action={action}>
                  <button type="submit">Resolve</button>
                </form>,
              ],
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(action).not.toHaveBeenCalled();
  });

  test("the menu renders the supplied items, and the pill toggles it", () => {
    render(<ScenarioBlock {...baseProps({ items: [alertItem()] })} />);
    // Open by default (spec §4.0), so the item is visible without a click.
    expect(screen.getByText("Sync stalled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /attention/i }));
    expect(screen.queryByText("Sync stalled")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /attention/i }));
    expect(screen.getByText("Sync stalled")).toBeInTheDocument();
  });

  test("activating an item records it in the navigation readout", () => {
    render(<ScenarioBlock {...baseProps({ items: [holdItem("alert:42")] })} />);
    expect(screen.queryByTestId("navigated")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Pick what happens"));
    expect(screen.getByTestId("navigated").textContent ?? "").toContain("alert:42");
  });

  test("the pill shows the item count, and the degraded label when degraded", () => {
    const { rerender } = render(<ScenarioBlock {...baseProps({ items: [], degraded: false })} />);
    expect(screen.getByRole("button", { name: /attention \(0\)/i })).toBeInTheDocument();
    rerender(<ScenarioBlock {...baseProps({ items: [alertItem()], degraded: false })} />);
    expect(screen.getByRole("button", { name: /attention \(1\)/i })).toBeInTheDocument();
    rerender(<ScenarioBlock {...baseProps({ degraded: true })} />);
    expect(screen.getByRole("button", { name: /degraded/i })).toBeInTheDocument();
  });

  test("renders one labelled group per section with its nodes", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "overview",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [<p key="a">card-a</p>],
            },
            {
              sectionId: "rooms",
              placement: "anchor",
              anchorOrCrewKey: "diagrams",
              nodes: [<p key="b">card-b</p>],
            },
          ],
        })}
      />,
    );
    const overview = screen.getByTestId("group-overview-sectionTop");
    expect(within(overview).getByText("card-a")).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "overview" })).toBeInTheDocument();
    const rooms = screen.getByTestId("group-rooms-anchor-diagrams");
    expect(within(rooms).getByText("card-b")).toBeInTheDocument();
    expect(within(rooms).getByRole("heading", { name: "rooms / diagrams" })).toBeInTheDocument();
  });

  test("two groups in the same section and placement get DISTINCT testids", () => {
    // A section top plus the composed notes group both land in one section with
    // placement sectionTop; duplicate testids would make getByTestId throw.
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "warnings",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [<p key="a">card-a</p>],
            },
            {
              sectionId: "warnings",
              placement: "sectionTop",
              anchorOrCrewKey: "notes",
              nodes: [<p key="b">note-b</p>],
            },
          ],
        })}
      />,
    );
    expect(
      within(screen.getByTestId("group-warnings-sectionTop")).getByText("card-a"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("group-warnings-sectionTop-notes")).getByText("note-b"),
    ).toBeInTheDocument();
  });

  test("holds render in their own group and NOT inside a section group", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "overview",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [<p key="a">card-a</p>],
            },
          ],
          holdItems: [holdItem("hold:1")],
        })}
      />,
    );
    const holds = screen.getByTestId("hold-group");
    expect(within(holds).getByText("Pick what happens")).toBeInTheDocument();
    // Isolation: the section group exists and must NOT contain the hold.
    const overview = screen.getByTestId("group-overview-sectionTop");
    expect(within(overview).queryByText("Pick what happens")).not.toBeInTheDocument();
    // And the hold appears exactly once in the whole tree (holdItems are NOT
    // passed to the menu, so a stray duplicate render would be caught here).
    expect(screen.getAllByText("Pick what happens")).toHaveLength(1);
  });

  test("warnings null renders no warning surface at all", () => {
    render(<ScenarioBlock {...baseProps({ warnings: null })} />);
    expect(screen.queryByTestId("warnings-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("warnings-muted")).not.toBeInTheDocument();
  });

  test("an EMPTY warnings array still renders both skins, each with no cards", () => {
    // §3.4 tri-state: [] is "controls warnings, and there are none" — visibly
    // distinct from null ("does not control warnings"), which renders nothing.
    render(<ScenarioBlock {...baseProps({ warnings: [] })} />);
    const active = screen.getByTestId("warnings-warning");
    expect(active).toBeInTheDocument();
    expect(screen.getByTestId("warnings-muted")).toBeInTheDocument();
    expect(within(active).queryAllByTestId("per-show-actionable-item")).toHaveLength(0);
  });

  test("warnings present renders BOTH skins, each carrying the warning content", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          warnings: [
            {
              severity: "warn",
              code: "BLOCK_DISAPPEARED",
              message: "Synthetic warning for gallery review.",
            },
          ],
        })}
      />,
    );
    const active = screen.getByTestId("warnings-warning");
    const muted = screen.getByTestId("warnings-muted");
    // Not just that the wrappers exist: each must actually render the card.
    const activeTitle = within(active).getByTestId("per-show-actionable-title");
    const mutedTitle = within(muted).getByTestId("per-show-actionable-title");
    // Assert the CONTRACT, not the current catalog copy: the title is non-empty,
    // identical across skins, and never the bare code (invariant 5). Pinning the
    // literal message would break the day BLOCK_DISAPPEARED gains a catalog title.
    expect((activeTitle.textContent ?? "").trim().length).toBeGreaterThan(0);
    expect(activeTitle.textContent).toEqual(mutedTitle.textContent);
    expect(activeTitle.textContent).not.toContain("BLOCK_DISAPPEARED");
    // The two skins must differ; identical markup means one tone was not applied.
    expect(active.innerHTML).not.toEqual(muted.innerHTML);
  });

  test("the readout renders EVERY row, not just the first", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          readout: [
            { label: "sectionId", value: "rooms" },
            { label: "anchor", value: "diagrams" },
            { label: "actionable", value: "true" },
          ],
        })}
      />,
    );
    const dl = screen.getByTestId("readout");
    const pairs: Array<[string, string]> = [
      ["sectionId", "rooms"],
      ["anchor", "diagrams"],
      ["actionable", "true"],
    ];
    for (const [label, value] of pairs) {
      expect(within(dl).getByText(label)).toBeInTheDocument();
      expect(within(dl).getByText(value)).toBeInTheDocument();
    }
    // Three supplied rows plus the route row the block appends itself.
    expect(within(dl).getAllByRole("term")).toHaveLength(4);
  });

  test("the readout always prints the usePathname value, per the fidelity caveat", () => {
    // AttentionBanner route-gates its Learn-more link on usePathname, which
    // differs under the gallery. Printing it makes that divergence visible
    // instead of leaving a card quietly wrong about one prop.
    render(<ScenarioBlock {...baseProps()} />);
    expect(
      within(screen.getByTestId("readout")).getByText("route (usePathname)"),
    ).toBeInTheDocument();
  });

  test("maxWidthPx applies only for a positive finite number", () => {
    const { rerender } = render(<ScenarioBlock {...baseProps({ maxWidthPx: null })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("");
    rerender(<ScenarioBlock {...baseProps({ maxWidthPx: 390 })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("390px");
    // The page normalizes this value, but the component must not emit "NaNpx" or
    // "-1px" if it ever receives one; absence is the documented fallback.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      rerender(<ScenarioBlock {...baseProps({ maxWidthPx: bad })} />);
      expect(screen.getByTestId("block-root").style.maxWidth, String(bad)).toBe("");
    }
  });
});
