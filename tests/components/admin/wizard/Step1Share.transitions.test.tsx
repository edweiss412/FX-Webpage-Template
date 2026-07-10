// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Step1Share } from "@/components/admin/wizard/Step1Share";

const EMAIL = "svc@example.iam.gserviceaccount.com";
afterEach(() => cleanup());

describe("Step1Share — disclosure transitions & relocation", () => {
  it("both disclosures rotate a chevron on open and hide the native marker", () => {
    render(<Step1Share serviceAccountEmail={EMAIL} />);
    for (const testId of ["wizard-step1-no-folder", "wizard-step1-explainer"]) {
      const details = screen.getByTestId(testId);
      expect(details).toHaveClass("group");
      const summary = details.querySelector("summary");
      expect(summary).not.toBeNull();
      const sc = (summary as HTMLElement).className;
      expect(sc).toMatch(/list-none/);
      expect(sc).toMatch(/\[&::-webkit-details-marker\]:hidden/);
      expect(sc).toMatch(/min-h-tap-min/); // DESIGN.md:185 accordion-handle tap floor
      const chevron = (summary as HTMLElement).querySelector("svg");
      expect(chevron).not.toBeNull();
      const cc = (chevron as SVGElement).getAttribute("class") ?? "";
      expect(cc).toMatch(/transition-transform/);
      expect(cc).toMatch(/group-open:rotate-180/);
    }
  });

  it("places the explainer as a sibling directly below the email card, not inside it", () => {
    render(<Step1Share serviceAccountEmail={EMAIL} />);
    const card = screen.getByTestId("wizard-step1-email-card");
    const explainer = screen.getByTestId("wizard-step1-explainer");
    expect(card.contains(explainer)).toBe(false);
    expect(card.parentElement).toBe(explainer.parentElement);
    expect(card.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("explainer summary label uses an action-legal token, not text-subtle", () => {
    render(<Step1Share serviceAccountEmail={EMAIL} />);
    const sc = screen.getByTestId("wizard-step1-explainer-summary").className;
    expect(sc).toMatch(/\btext-text\b/); // action-legal (DESIGN.md:25)
    expect(sc).not.toMatch(/text-text-subtle/); // banned for action targets (DESIGN.md:27)
  });
});
