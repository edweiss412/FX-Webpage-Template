// @vitest-environment jsdom
/**
 * tests/components/IdentityChip.test.tsx (M11.5 §B Task C4)
 *
 * The per-page header affordance that confirms the picker-resolved identity
 * ("Alice · Audio A1") and lets the user fall back to the picker via a
 * "Not you?" form bound to the `clearIdentity` Server Action.
 *
 * RETARGETED 2026-08-09 onto `<AvatarMenu>` (UI spec §2.3). `IdentityChip` is now
 * a Server Component seam that declares the action and renders the menu, so it
 * cannot be rendered by jsdom; the CONTRACTS below are unchanged and now live
 * one level in, behind the trigger. Each is asserted against the menu's own DOM
 * rather than dropped — the identity is still confirmed, the form is still a
 * form, and the hidden route inputs are still the thing that makes the clear
 * land on the right show.
 *
 * The base `clearIdentity` action revalidates the page without
 * redirecting (per the P-R29 Fix-3 contract that splits base from the
 * atomic clearIdentityAndSkip). After cookie clear + revalidatePath,
 * the Server Component re-renders into <PickerInterstitial>.
 */
import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { AvatarMenu } from "@/components/auth/AvatarMenu";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";

afterEach(cleanup);

const baseProps = {
  name: "Alice Adams",
  role: "Audio A1",
  slug: "sample-show",
  shareToken: "a".repeat(64),
  showId: "11111111-1111-1111-1111-111111111111",
};

/**
 * The action the Server Component seam supplies. A FUNCTION, not a string: React
 * renders a `javascript:` action attribute for a function and a plain URL for a
 * string, and the assertion below reads that difference — so a refactor that
 * turned the person row into a link would fail rather than pass quietly.
 */
const clearAction = async (): Promise<ClearIdentityResult> => ({ ok: true as const });

function renderOpen(props: Partial<typeof baseProps> = {}) {
  const utils = render(<AvatarMenu {...baseProps} {...props} clearAction={clearAction} />);
  act(() => {
    fireEvent.click(utils.getByTestId("avatar-menu-trigger"));
  });
  return utils;
}

describe("<AvatarMenu> — the identity contracts carried over from <IdentityChip>", () => {
  test("renders name and role in the open menu's identity header", () => {
    const { getByTestId } = renderOpen();
    const header = getByTestId("avatar-menu-identity");
    expect(header.textContent).toContain(baseProps.name);
    expect(header.textContent).toContain(baseProps.role);
  });

  test("the identity is behind the trigger, and the trigger still NAMES it", () => {
    // The identity moved inside a menu, so it is no longer on screen at rest.
    // The accessible name is what keeps it announced, and this is the assertion
    // that would fail if the menu were made quieter by making it nameless.
    const { getByTestId, queryByTestId } = render(
      <AvatarMenu {...baseProps} clearAction={clearAction} />,
    );
    expect(queryByTestId("avatar-menu-identity")).toBeNull();
    expect(getByTestId("avatar-menu-trigger").getAttribute("aria-label")).toBe(
      "Alice Adams, Audio A1, account menu",
    );
  });

  test('renders a "Not you?" submit bound to a server action form', () => {
    const { getByTestId } = renderOpen();
    const btn = getByTestId("avatar-menu-switch-person");
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
    const { getByTestId } = renderOpen();
    const form = getByTestId("avatar-menu-switch-person").closest("form")!;
    const fieldOf = (n: string) =>
      (form.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)?.value;
    expect(fieldOf("slug")).toBe(baseProps.slug);
    expect(fieldOf("shareToken")).toBe(baseProps.shareToken);
    expect(fieldOf("showId")).toBe(baseProps.showId);
  });

  test("the recovery submits directly — no confirm step is interposed", () => {
    // Re-scoped, not dropped. The old assertion grepped the whole rendered HTML
    // for a click handler, which worked while this was a Server Component with
    // none. The menu is a client island and legitimately has handlers (open,
    // close, arrow keys), so grepping the container would now fail for a reason
    // that has nothing to do with the contract.
    //
    // The contract itself is unchanged and is about the PERSON ROW: recovery is
    // a submit, not a guarded two-step. Asserted on the row's own type and on
    // the absence of a confirm anywhere in the tree.
    const { getByTestId, container } = renderOpen();
    const row = getByTestId("avatar-menu-switch-person");
    expect(row.getAttribute("type")).toBe("submit");
    expect(row.closest("form")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/window\.confirm/);
  });
});
