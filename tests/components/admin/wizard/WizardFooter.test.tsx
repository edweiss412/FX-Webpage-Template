// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/WizardFooter.test.tsx
 *
 * Pins the presentational contract of <WizardFooter> — the shared,
 * full-width sticky footer used by every onboarding-wizard step. The
 * component owns layout + stickiness ONLY; each step supplies its own
 * back / center / primary controls. Contract:
 *   - it is a FIXED, full-viewport-width bar pinned to the bottom
 *     (`fixed inset-x-0 bottom-0`) so its background spans edge-to-edge;
 *   - its inner row is capped at the admin-shell width (max-w-[1600px])
 *     so the controls line up with the shell content edges;
 *   - `primary` always renders; `center` and `back` render only when given;
 *   - when `back` is omitted a hidden spacer keeps `primary` right-aligned.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";

afterEach(() => cleanup());

describe("WizardFooter", () => {
  test("renders the primary slot and is a full-width fixed bottom bar", () => {
    const { getByTestId } = render(<WizardFooter primary={<button>Continue</button>} />);
    const footer = getByTestId("wizard-footer");
    // Full-bleed background: fixed to the viewport, spanning both edges + bottom.
    expect(footer.className).toContain("fixed");
    expect(footer.className).toContain("inset-x-0");
    expect(footer.className).toContain("bottom-0");
    expect(footer.textContent).toContain("Continue");
  });

  test("inner row is capped at the admin-shell width so controls align to the shell edges", () => {
    const { getByTestId } = render(<WizardFooter primary={<button>Go</button>} />);
    const inner = getByTestId("wizard-footer-inner");
    expect(inner.className).toContain("max-w-[1600px]");
    expect(inner.className).toContain("mx-auto");
  });

  test("renders back and center slots when provided", () => {
    const { getByTestId, queryByTestId } = render(
      <WizardFooter
        back={<a data-testid="my-back">Back</a>}
        center={<span data-testid="my-center">3 of 4 selected</span>}
        primary={<button>Publish</button>}
      />,
    );
    expect(getByTestId("my-back")).toBeTruthy();
    expect(getByTestId("my-center").textContent).toContain("3 of 4 selected");
    expect(queryByTestId("wizard-footer-back-spacer")).toBeNull();
  });

  test("omits back → renders a hidden spacer so primary stays right-aligned", () => {
    const { getByTestId, queryByTestId } = render(
      <WizardFooter primary={<button>Continue</button>} />,
    );
    // No back link, but a spacer occupies its slot so the primary keeps its
    // right-edge position across steps.
    const spacer = getByTestId("wizard-footer-back-spacer");
    expect(spacer.getAttribute("aria-hidden")).toBe("true");
    expect(queryByTestId("my-back")).toBeNull();
  });
});
