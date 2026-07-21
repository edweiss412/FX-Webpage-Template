// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { CrewUnderRowStack } from "@/components/admin/wizard/step3ReviewSections";
import type { ReactNode } from "react";

// Task 5 (plan §5.3). The merged under-row stack caps at 2 visible nodes; the rest
// live behind an in-place native <details> "N more". items-stretch + w-full satisfy
// §8's dimensional invariants. The container renders only when there is >=1 node.

afterEach(cleanup);

const node = (id: string): ReactNode => <div key={id} data-testid={id} />;

describe("CrewUnderRowStack — cap + disclosure", () => {
  test("<=2 nodes: all visible, no disclosure", () => {
    render(<CrewUnderRowStack nodes={[node("a"), node("b")]} ckey="eric weiss" />);
    const stack = screen.getByTestId("crew-warn-stack-eric weiss");
    expect(within(stack).getByTestId("a")).toBeTruthy();
    expect(within(stack).getByTestId("b")).toBeTruthy();
    expect(screen.queryByTestId("crew-warn-more-eric weiss")).toBeNull();
    // §8: dimensional classes present.
    expect(stack.className).toContain("items-stretch");
    expect(stack.className).toContain("w-full");
  });

  test(">2 nodes: 2 visible + 'N more' disclosure holding the rest", () => {
    render(
      <CrewUnderRowStack nodes={[node("a"), node("b"), node("c"), node("d")]} ckey="eric weiss" />,
    );
    const more = screen.getByTestId("crew-warn-more-eric weiss");
    expect(more.textContent).toContain("2 more");
    // c and d live inside the disclosure; a and b are outside it.
    expect(within(more).getByTestId("c")).toBeTruthy();
    expect(within(more).getByTestId("d")).toBeTruthy();
    expect(within(more).queryByTestId("a")).toBeNull();
    expect(within(more).queryByTestId("b")).toBeNull();
  });

  test("exactly 3 nodes → '1 more'", () => {
    render(<CrewUnderRowStack nodes={[node("a"), node("b"), node("c")]} ckey="k" />);
    expect(screen.getByTestId("crew-warn-more-k").textContent).toContain("1 more");
  });

  test("the disclosure handle meets the 44px tap floor (impeccable audit P1)", () => {
    render(<CrewUnderRowStack nodes={[node("a"), node("b"), node("c")]} ckey="k" />);
    const summary = screen.getByTestId("crew-warn-more-k").querySelector("summary");
    // DESIGN.md --spacing-tap-min: every accordion handle ≥44px for the phone context.
    expect(summary!.className).toContain("min-h-tap-min");
  });
});
