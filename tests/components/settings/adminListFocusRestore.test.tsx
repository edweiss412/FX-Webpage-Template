// @vitest-environment jsdom
/**
 * AC-3 — the container-level restore, and the one branch jsdom CAN decide.
 *
 * The row cannot own this: a successful revoke revalidates, the RSC payload
 * replaces the section, and a heading the row focused is swapped out from under
 * it. Three browser runs proved that; the row's own jsdom suite stayed green
 * through all three, because nothing revalidates in jsdom. What jsdom CAN do is
 * drive this component's actual predicate directly — re-render with the focused
 * row gone — which is why the trigger lives here and the end-to-end proof lives
 * in tests/e2e/confirm-focus-probe.spec.ts.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AdminListFocusRestore } from "@/components/admin/settings/AdminListFocusRestore";

function mount(emails: string[]) {
  const heading = document.createElement("h2");
  heading.id = "admin-settings-admins-heading";
  heading.tabIndex = -1;
  const scrolls: unknown[] = [];
  heading.scrollIntoView = (arg?: unknown) => {
    scrolls.push(arg);
  };
  document.body.appendChild(heading);

  const row = document.createElement("div");
  row.setAttribute("data-row-email", "peer@example.com");
  const button = document.createElement("button");
  button.setAttribute("data-testid", "row-button");
  row.appendChild(button);
  document.body.appendChild(row);

  const view = render(<AdminListFocusRestore activeEmails={emails} />);
  return {
    heading,
    button,
    scrolls,
    view,
    cleanup: () => [heading, row].forEach((n) => n.remove()),
  };
}

describe("AdminListFocusRestore", () => {
  it("focuses the heading when the list loses the row that held focus", () => {
    const { heading, button, scrolls, view, cleanup } = mount([
      "actor@example.com",
      "peer@example.com",
    ]);
    try {
      button.focus();
      expect(button).toHaveFocus();
      view.rerender(<AdminListFocusRestore activeEmails={["actor@example.com"]} />);
      expect(heading).toHaveFocus();
      expect(scrolls, "nearest-only, not the browser default heuristic").toEqual([
        { block: "nearest" },
      ]);
    } finally {
      cleanup();
    }
  });

  it("does NOT move focus when a row nobody was in goes away", () => {
    const { heading, button, view, cleanup } = mount(["actor@example.com", "peer@example.com"]);
    try {
      button.focus();
      // Focus leaves the row before the change: the operator moved on.
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      outside.focus();
      view.rerender(<AdminListFocusRestore activeEmails={["peer@example.com"]} />);
      expect(outside).toHaveFocus();
      expect(heading).not.toHaveFocus();
      outside.remove();
    } finally {
      cleanup();
    }
  });

  it("does NOT move focus when the list merely re-orders", () => {
    const { heading, button, view, cleanup } = mount(["actor@example.com", "peer@example.com"]);
    try {
      button.focus();
      view.rerender(
        <AdminListFocusRestore activeEmails={["peer@example.com", "actor@example.com"]} />,
      );
      expect(button).toHaveFocus();
      expect(heading).not.toHaveFocus();
    } finally {
      cleanup();
    }
  });

  it("renders nothing", () => {
    const { view, cleanup } = mount(["actor@example.com"]);
    try {
      expect(view.container).toBeEmptyDOMElement();
    } finally {
      cleanup();
    }
  });
});
