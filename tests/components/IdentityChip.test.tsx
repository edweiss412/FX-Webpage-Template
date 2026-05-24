// @vitest-environment jsdom
/**
 * tests/components/IdentityChip.test.tsx (M11.5 §B Task C4)
 *
 * <IdentityChip> is the per-page header affordance that confirms the
 * picker-resolved identity ("Alice · Audio A1") and lets the user fall
 * back to the picker via a "Not you?" form bound to the `clearIdentity`
 * Server Action.
 *
 * The base `clearIdentity` action revalidates the page without
 * redirecting (per the P-R29 Fix-3 contract that splits base from the
 * atomic clearIdentityAndSkip). After cookie clear + revalidatePath,
 * the Server Component re-renders into <PickerInterstitial>.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { IdentityChip } from "@/components/auth/IdentityChip";

afterEach(cleanup);

const baseProps = {
  name: "Alice Adams",
  role: "Audio A1",
  slug: "sample-show",
  shareToken: "a".repeat(64),
  showId: "11111111-1111-1111-1111-111111111111",
};

describe("<IdentityChip>", () => {
  test("renders name and role", () => {
    const { getByTestId } = render(<IdentityChip {...baseProps} />);
    const chip = getByTestId("identity-chip");
    expect(chip.textContent).toContain(baseProps.name);
    expect(chip.textContent).toContain(baseProps.role);
  });

  test('renders a "Not you?" button bound to a server action form', () => {
    const { getByTestId } = render(<IdentityChip {...baseProps} />);
    const btn = getByTestId("identity-chip-not-you");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("submit");
    const form = btn.closest("form")!;
    // Server-action-bound forms render with a javascript: safety prefix
    // (React 19 no-JS fallback). Non-string action -> javascript: prefix.
    // String actions (e.g. /auth/sign-in URLs in PickerInterstitial)
    // would render a plain URL here.
    expect(form.getAttribute("action") ?? "").toMatch(/^javascript:/);
  });

  test("hidden inputs carry slug, shareToken, and showId for clearIdentity", () => {
    const { getByTestId } = render(<IdentityChip {...baseProps} />);
    const form = getByTestId("identity-chip-not-you").closest("form")!;
    const fieldOf = (n: string) =>
      (form.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)
        ?.value;
    expect(fieldOf("slug")).toBe(baseProps.slug);
    expect(fieldOf("shareToken")).toBe(baseProps.shareToken);
    expect(fieldOf("showId")).toBe(baseProps.showId);
  });

  test("the affordance never shows a confirm dialog (no JS click handler)", () => {
    // The IdentityChip is a Server Component; there must be no inline
    // onClick / confirm prompts. Verify by snapshot-grep on the rendered
    // HTML — defense against a future refactor that adds a confirm step
    // the spec forbids (the recovery is supposed to be a single tap).
    const { container } = render(<IdentityChip {...baseProps} />);
    expect(container.innerHTML).not.toMatch(/onclick|onClick|window\.confirm/);
  });
});
