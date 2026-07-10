// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
// Flow-1 §1.2: Step 1 gains a collapsed "Don't have a folder yet?" disclosure
// with a compact create → drop → share → continue walkthrough.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Step1Share } from "@/components/admin/wizard/Step1Share";

afterEach(() => cleanup());

describe("Step1Share — no-folder disclosure", () => {
  it("renders a collapsed 'Don't have a folder yet?' details with the 4-step walkthrough", () => {
    render(<Step1Share serviceAccountEmail="svc@example.iam.gserviceaccount.com" />);
    const details = screen.getByTestId("wizard-step1-no-folder");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(within(details).getByText(/don.t have a folder yet/i)).toBeInTheDocument();
    expect(within(details).getByText(/new .*folder/i)).toBeInTheDocument();
    expect(within(details).getByText(/drop your show sheet/i)).toBeInTheDocument();
    expect(within(details).getByText(/viewer access/i)).toBeInTheDocument();
  });

  it("nests the no-folder disclosure inside step 1, after its prompt row", () => {
    render(<Step1Share serviceAccountEmail="svc@example.iam.gserviceaccount.com" />);
    const details = screen.getByTestId("wizard-step1-no-folder");
    const step1Li = details.closest("li");
    expect(step1Li).not.toBeNull();
    const prompt = within(step1Li as HTMLElement).getByText(
      /find the folder where you keep your show sheets/i,
    );
    const promptRow = prompt.closest("div") as HTMLElement;
    // disclosure is a sibling AFTER the prompt row, not inside the horizontal row
    expect(promptRow.contains(details)).toBe(false);
    expect(
      promptRow.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("directs first-time users to the email BELOW, never above (placement fix)", () => {
    render(<Step1Share serviceAccountEmail="svc@example.iam.gserviceaccount.com" />);
    const text = screen.getByTestId("wizard-step1-no-folder").textContent ?? "";
    expect(text).toMatch(/the email below/i);
    expect(text).not.toMatch(/the email above/i);
  });
});
