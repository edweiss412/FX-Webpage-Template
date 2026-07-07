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
});
