// @vitest-environment jsdom
/**
 * tests/components/admin/HelpSheet.test.tsx
 *
 * <HelpSheet> — the wizard step-header "?" affordance. A drop-in for
 * <HelpTooltip> (same label / children / testId API) that, instead of an
 * in-flow <details> disclosure, opens a responsive modal SHEET: a bottom sheet
 * on mobile and a right-anchored SIDE sheet on desktop. The sheet PORTALS to
 * <body> so it overlays correctly even inside the wizard's transformed
 * <PageTransition> subtree (the same stacking-context trap that confines the
 * footer). Focus is trapped (useDialogFocus), Escape + backdrop + close button
 * dismiss, and focus returns to the trigger on close.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HelpSheet } from "@/components/admin/HelpSheet";

afterEach(() => cleanup());

function renderSheet() {
  return render(
    <HelpSheet label="Help: Verify your folder" testId="help-affordance--wizard-step2--tooltip">
      <p>Paste the folder URL.</p>
      <p>
        <a href="/help/admin/onboarding-wizard#step-2">Learn more →</a>
      </p>
    </HelpSheet>,
  );
}

describe("HelpSheet", () => {
  test("renders a '?' trigger that advertises a dialog; the sheet is closed initially", () => {
    renderSheet();
    const trigger = screen.getByTestId("help-affordance--wizard-step2--tooltip-trigger");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe("Help: Verify your folder");
    expect(screen.queryByTestId("help-affordance--wizard-step2--tooltip-body")).toBeNull();
  });

  test("clicking the trigger opens a modal sheet portaled to <body> with the content", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("help-affordance--wizard-step2--tooltip-trigger"));
    const sheet = screen.getByTestId("help-affordance--wizard-step2--tooltip-body");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    // Portaled OUT of the trigger's container, to document.body.
    expect(sheet.closest("body")).toBe(document.body);
    // Content (incl. the walker's Learn-more link) lives inside the sheet.
    const link = within(sheet).getByText(/Learn more/);
    expect(link.getAttribute("href")).toBe("/help/admin/onboarding-wizard#step-2");
    // Desktop side-sheet + mobile bottom-sheet classes both present.
    expect(sheet.className).toContain("bottom-0");
    expect(sheet.className).toContain("sm:right-0");
    // aria-expanded reflects the open state.
    expect(
      screen
        .getByTestId("help-affordance--wizard-step2--tooltip-trigger")
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("Escape, the close button, and the backdrop all dismiss the sheet", () => {
    renderSheet();
    const triggerId = "help-affordance--wizard-step2--tooltip-trigger";
    const bodyId = "help-affordance--wizard-step2--tooltip-body";

    // Close via the close button.
    fireEvent.click(screen.getByTestId(triggerId));
    fireEvent.click(screen.getByTestId("help-affordance--wizard-step2--tooltip-close"));
    expect(screen.queryByTestId(bodyId)).toBeNull();

    // Close via Escape.
    fireEvent.click(screen.getByTestId(triggerId));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId(bodyId)).toBeNull();

    // Close via backdrop click.
    fireEvent.click(screen.getByTestId(triggerId));
    fireEvent.click(screen.getByTestId("help-affordance--wizard-step2--tooltip-backdrop"));
    expect(screen.queryByTestId(bodyId)).toBeNull();
  });

  test("focus moves into the sheet on open and returns to the trigger on close", () => {
    renderSheet();
    const trigger = screen.getByTestId("help-affordance--wizard-step2--tooltip-trigger");
    trigger.focus();
    fireEvent.click(trigger);
    // useDialogFocus lands focus on the close button (first control in the sheet).
    expect(document.activeElement).toBe(
      screen.getByTestId("help-affordance--wizard-step2--tooltip-close"),
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });
});
