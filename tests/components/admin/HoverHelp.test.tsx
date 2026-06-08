// @vitest-environment jsdom
// M12.5 — HoverHelp reachability + a11y contract (impeccable audit HIGH +
// adversarial-review finding). The bare CSS group-hover version was unreachable
// on touch and unannounced by screen readers; this pins the fixes:
//   - the trigger is a real <button> (tap/keyboard reachable), toggling on click;
//   - the popover body is programmatically associated via aria-describedby/id so
//     a screen reader announces the explainer (the body stays in the DOM);
//   - Escape closes; aria-expanded reflects state.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  // Android-Chrome regression: a tap fires pointerenter(touch) THEN click. Hover
  // is pointer-type-gated to mouse, so the touch pointerenter is IGNORED and the
  // first click reliably opens (no open-then-toggle net-closed double-tap bug).
  it("touch tap opens — synthetic-mouse pointerenter (pointerType≠mouse) is ignored", () => {
    render(
      <HoverHelp label="Help" testId="t">
        body
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("t-trigger");
    const wrapper = trigger.parentElement!;
    fireEvent.pointerEnter(wrapper, { pointerType: "touch" });
    expect(trigger).toHaveAttribute("aria-expanded", "false"); // touch hover ignored
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true"); // first tap opens
  });

  // WCAG 1.4.13 Dismissible: when shown via MOUSE hover, Escape must close it
  // without moving the pointer (the bug R3 caught — CSS-only hover ignored Escape).
  it("mouse hover opens; Escape dismisses without moving the pointer (1.4.13 Dismissible)", () => {
    render(
      <HoverHelp label="Help" testId="t">
        body
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("t-trigger");
    const wrapper = trigger.parentElement!;
    fireEvent.pointerEnter(wrapper, { pointerType: "mouse" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  // WCAG 1.4.13 Hoverable: the pointer can move from the trigger onto the popover
  // body without it disappearing (the body shares the open/close timer).
  it("popover is hoverable — moving onto the body keeps it open, leaving closes it (1.4.13 Hoverable)", () => {
    vi.useFakeTimers();
    try {
      render(
        <HoverHelp label="Help" testId="t">
          body
        </HoverHelp>,
      );
      const trigger = screen.getByTestId("t-trigger");
      const wrapper = trigger.parentElement!;
      const body = screen.getByTestId("t-body");
      fireEvent.pointerEnter(wrapper, { pointerType: "mouse" }); // open
      fireEvent.pointerLeave(wrapper, { pointerType: "mouse" }); // schedule close
      fireEvent.pointerEnter(body); // moved onto the body → cancels the close
      act(() => vi.advanceTimersByTime(400));
      expect(trigger).toHaveAttribute("aria-expanded", "true"); // still open
      fireEvent.pointerLeave(body); // leaving the body schedules close
      act(() => vi.advanceTimersByTime(400));
      expect(trigger).toHaveAttribute("aria-expanded", "false"); // now closed
    } finally {
      vi.useRealTimers();
    }
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
