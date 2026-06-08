// @vitest-environment jsdom
// M12.5 — HoverHelp reachability + a11y contract (impeccable audit HIGH +
// adversarial-review finding). The bare CSS group-hover version was unreachable
// on touch and unannounced by screen readers; this pins the fixes:
//   - the trigger is a real <button> (tap/keyboard reachable), toggling on click;
//   - the popover body is programmatically associated via aria-describedby/id so
//     a screen reader announces the explainer (the body stays in the DOM);
//   - Escape closes; aria-expanded reflects state.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HoverHelp } from "@/components/admin/HoverHelp";

afterEach(cleanup);

describe("HoverHelp", () => {
  it("default '?' trigger is a button with aria-describedby pointing at the body id", () => {
    render(
      <HoverHelp label="Help: Active shows" testId="t">
        <p>Body copy here.</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("t-trigger");
    const body = screen.getByTestId("t-body");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-label", "Help: Active shows");
    // Programmatic association — the regression the audit + adversarial review
    // demanded: a broken impl that drops aria-describedby fails here.
    const describedBy = trigger.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(body.id).toBe(describedBy);
    expect(body).toHaveTextContent("Body copy here.");
    // 44px tap-target floor (DESIGN.md): the compact "?" keeps a 20px visual but
    // a transparent before:-inset-3 overlay extends the hit area to 44px.
    expect(trigger.className).toContain("before:-inset-3");
  });

  it("toggles aria-expanded on click (tap/keyboard reachable) and Escape closes", () => {
    render(
      <HoverHelp label="Help" testId="t">
        body
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("t-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  // Android-Chrome regression: a synthetic-mouse tap fires mouseenter THEN
  // click. If a JS onMouseEnter opened and onClick then toggled, the first tap
  // would net to CLOSED (double-tap-to-open bug). Desktop hover is now pure CSS,
  // so mouseenter changes NO state and the first click reliably opens.
  it("mouseEnter then click ends OPEN (no synthetic-tap net-closed regression)", () => {
    render(
      <HoverHelp label="Help" testId="t">
        body
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("t-trigger");
    const wrapper = trigger.parentElement!; // the group wrapper span
    fireEvent.mouseEnter(wrapper);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("custom trigger (e.g. a badge) is wrapped in a button that is aria-describedby-associated", () => {
    render(
      <HoverHelp
        label="What this status means"
        testId="t"
        trigger={<span data-testid="badge">Needs attention</span>}
      >
        <p>Reason-specific recovery copy.</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("t-trigger");
    const body = screen.getByTestId("t-body");
    expect(trigger.tagName).toBe("BUTTON");
    expect(screen.getByTestId("badge")).toBeInTheDocument();
    expect(trigger.getAttribute("aria-describedby")).toBe(body.id);
    expect(body).toHaveTextContent("Reason-specific recovery copy.");
    // 44px tap-target floor for the custom (badge) trigger button.
    expect(trigger.className).toContain("min-h-tap-min");
    expect(trigger.className).toContain("min-w-tap-min");
  });
});
