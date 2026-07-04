// @vitest-environment jsdom
/**
 * tests/components/admin/ignoredSheetsDisclosure.test.tsx
 *
 * The collapsed-by-default ignored-sheets disclosure that replaced the former
 * standalone /admin/ignored-sheets page. Concerns:
 *   1. Collapsed by default — the disclosed panel (server-rendered list slot) is
 *      NOT mounted until the operator expands it; the toggle reports
 *      aria-expanded="false".
 *   2. Click/tap the header toggle → expands, panel + children mount,
 *      aria-expanded flips to "true"; toggling again collapses it.
 *   3. The count chip renders the passed count; the `help` affordance renders as
 *      a SIBLING of the toggle (not nested inside the <button>).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { IgnoredSheetsDisclosure } from "@/components/admin/IgnoredSheetsDisclosure";

afterEach(() => cleanup());

function renderDisclosure(count = 2) {
  return render(
    <IgnoredSheetsDisclosure count={count} help={<span data-testid="help-slot">?</span>}>
      <ul data-testid="ignored-sheets-list">
        <li>East Coast.gsheet</li>
      </ul>
    </IgnoredSheetsDisclosure>,
  );
}

describe("IgnoredSheetsDisclosure", () => {
  it("is collapsed by default: panel + children not mounted, aria-expanded=false", () => {
    renderDisclosure();
    const toggle = screen.getByTestId("ignored-sheets-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("ignored-sheets-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ignored-sheets-list")).not.toBeInTheDocument();
  });

  it("renders the count chip and the help affordance as a sibling of the toggle", () => {
    renderDisclosure(3);
    expect(screen.getByTestId("ignored-sheets-count-chip")).toHaveTextContent("3");
    const help = screen.getByTestId("help-slot");
    // help must NOT be nested inside the toggle button (no interactive nesting).
    expect(screen.getByTestId("ignored-sheets-toggle")).not.toContainElement(help);
  });

  it("exposes a real heading wrapping the toggle button (valid content model, WAI accordion)", () => {
    renderDisclosure();
    // The heading role must survive (an <h3> may not nest INSIDE a <button>); the
    // heading wraps the button instead, so heading-navigation still finds it.
    const heading = screen.getByRole("heading", { name: /Ignored sheets/ });
    expect(heading).toContainElement(screen.getByTestId("ignored-sheets-toggle"));
  });

  it("expands on click to mount the panel + children, then collapses on a second click", () => {
    renderDisclosure();
    const toggle = screen.getByTestId("ignored-sheets-toggle");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("ignored-sheets-panel")).toBeInTheDocument();
    expect(screen.getByTestId("ignored-sheets-list")).toBeInTheDocument();
    // aria-controls points at the disclosed panel.
    expect(toggle).toHaveAttribute("aria-controls", "ignored-sheets-panel");
    expect(screen.getByTestId("ignored-sheets-panel")).toHaveAttribute(
      "id",
      "ignored-sheets-panel",
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("ignored-sheets-panel")).not.toBeInTheDocument();
  });
});
