// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3DetailsDialog.test.tsx
 *
 * Pins the overlay-chrome contract of <Step3DetailsDialog> — the responsive
 * disclosure (bottom SHEET on mobile / centered POPUP on desktop) that replaced
 * the Step-3 card's inline height-morph breakdown. The dialog is presentational:
 * it renders whatever breakdown `children` the card passes and owns only the
 * modal shell (scrim, focus-trapped panel, close affordances, scroll-lock).
 *
 * The card mounts it ONLY while open, so these tests render it directly (mounted
 * == open) and assert: the modal a11y contract, the three close paths (close
 * button / backdrop tap / Escape), the responsive shell + animation hooks, and
 * the body scroll-lock + its restoration on unmount.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Step3DetailsDialog } from "@/components/admin/wizard/Step3DetailsDialog";

const DFID = "drive-dlg-1";

afterEach(() => cleanup());

function renderDialog(onClose = vi.fn()) {
  const q = render(
    <Step3DetailsDialog dfid={DFID} title="Asset Mgmt Summit" onClose={onClose}>
      <p data-testid="dlg-child">breakdown body</p>
    </Step3DetailsDialog>,
  );
  return { q, onClose };
}

describe("Step3DetailsDialog — modal a11y contract", () => {
  test("is a labelled modal dialog whose label is the show title", () => {
    const { q } = renderDialog();
    const dialog = q.getByTestId(`wizard-step3-card-${DFID}-details-dialog`);
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = dialog.querySelector(`#${labelledBy}`);
    expect(heading?.textContent).toContain("Asset Mgmt Summit");
  });

  test("renders the passed breakdown children inside the scrollable body", () => {
    const { q } = renderDialog();
    const body = q.getByTestId(`wizard-step3-card-${DFID}-breakdown`);
    expect(body.contains(q.getByTestId("dlg-child"))).toBe(true);
    // The body is the overflow-scroll region (content scrolls, panel stays bounded).
    expect(body.className).toMatch(/overflow-y-auto/);
  });

  test("moves initial focus to the close button on open (useDialogFocus wiring)", () => {
    const { q } = renderDialog();
    // The dialog passes closeRef to useDialogFocus, so focus lands on the close
    // button — proving the focus-trap entry point is wired (a broken closeRef
    // would leave focus on <body>).
    expect(document.activeElement).toBe(q.getByTestId(`wizard-step3-card-${DFID}-details-close`));
  });

  test("the scrim is hidden from assistive tech (no duplicate 'Close' announcement)", () => {
    const { q } = renderDialog();
    const scrim = q.getByTestId(`wizard-step3-card-${DFID}-details-backdrop`);
    expect(scrim.getAttribute("aria-hidden")).toBe("true");
    expect(scrim.getAttribute("tabindex")).toBe("-1");
  });
});

describe("Step3DetailsDialog — close paths", () => {
  test("the close button calls onClose", () => {
    const { q, onClose } = renderDialog();
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-details-close`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("tapping the backdrop scrim calls onClose", () => {
    const { q, onClose } = renderDialog();
    fireEvent.click(q.getByTestId(`wizard-step3-card-${DFID}-details-backdrop`));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("pressing Escape calls onClose", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Step3DetailsDialog — responsive shell + animation hooks", () => {
  test("the shell is bottom-anchored on mobile and centered on desktop (sheet vs popup)", () => {
    const { q } = renderDialog();
    const dialog = q.getByTestId(`wizard-step3-card-${DFID}-details-dialog`);
    // items-end == sheet rises from the bottom edge; sm:items-center == centered popup.
    expect(dialog.className).toMatch(/\bitems-end\b/);
    expect(dialog.className).toMatch(/\bsm:items-center\b/);
    expect(dialog.className).toMatch(/\bfixed\b/);
  });

  test("the scrim and panel carry the CSS animation hooks (rise/pop/scrim live in globals.css, not JS)", () => {
    const { q } = renderDialog();
    expect(
      q
        .getByTestId(`wizard-step3-card-${DFID}-details-backdrop`)
        .hasAttribute("data-step3-details-scrim"),
    ).toBe(true);
    // The panel is the first child carrying the panel animation hook.
    const panel = q
      .getByTestId(`wizard-step3-card-${DFID}-details-dialog`)
      .querySelector("[data-step3-details-panel]");
    expect(panel).not.toBeNull();
  });
});

describe("Step3DetailsDialog — body scroll lock", () => {
  test("locks body scroll while open and restores the prior value on unmount", () => {
    document.body.style.overflow = "scroll";
    const { q } = renderDialog();
    expect(document.body.style.overflow).toBe("hidden");
    q.unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });
});
