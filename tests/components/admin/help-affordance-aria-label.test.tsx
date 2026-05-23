// @vitest-environment jsdom
//
// I.2 finding 2 regression: HelpAffordance's "Learn more →" link MUST emit an
// aria-label derived from messageFor(code).title, NOT from the code itself.
// Prior implementation built `aria-label="Learn more about ${code.toLowerCase()
// .replace(/_/g, " ")}"` which leaked structural identifiers ("mi-1 version
// detection failed") into the screen-reader accessibility tree, violating
// AGENTS.md §1.5 (no raw error codes in user-visible UI — aria-label is
// user-visible to SR users).
//
// The catalog title for MI-1_VERSION_DETECTION_FAILED is "Unrecognized show
// template". The aria-label should reference THAT, not the code.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { messageFor } from "@/lib/messages/lookup";
import { testidForErrorCode } from "@/app/help/_affordanceMatrix";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
}));

afterEach(() => cleanup());

describe("HelpAffordance aria-label uses catalog title, not code-derived strings (I.2 F2)", () => {
  test("MI-* class code emits aria-label from messageFor().title", () => {
    const code = "MI-1_VERSION_DETECTION_FAILED";
    const entry = messageFor(code);
    expect(entry.title).toBe("Unrecognized show template");

    render(<HelpAffordance code={code} />);

    const link = screen.getByTestId(testidForErrorCode(code));
    const ariaLabel = link.getAttribute("aria-label");
    expect(ariaLabel).toBe("Learn more: Unrecognized show template");

    // Hard pin: the code-derived form MUST NOT appear anywhere in the
    // accessibility tree. Catches reintroduction of code.toLowerCase()
    // .replace patterns. Lowercase, kebab-from-snake, and the original
    // SCREAMING_SNAKE all guarded.
    expect(ariaLabel).not.toMatch(/mi-1 version detection failed/i);
    expect(ariaLabel).not.toMatch(/MI-1_VERSION_DETECTION_FAILED/);
    expect(ariaLabel).not.toMatch(/version_detection_failed/i);
  });

  test("SCREAMING_SNAKE catalog code emits aria-label from catalog title", () => {
    const code = "PARSE_ERROR_LAST_GOOD";
    const entry = messageFor(code);
    expect(entry.title).not.toBeNull();
    expect(entry.title?.length).toBeGreaterThan(0);

    render(<HelpAffordance code={code} />);

    const link = screen.getByTestId(testidForErrorCode(code));
    const ariaLabel = link.getAttribute("aria-label");
    expect(ariaLabel).toBe(`Learn more: ${entry.title}`);

    expect(ariaLabel).not.toMatch(/parse error last good/i);
    expect(ariaLabel).not.toMatch(/PARSE_ERROR_LAST_GOOD/);
  });
});
