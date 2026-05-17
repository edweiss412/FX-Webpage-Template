// @vitest-environment jsdom
/**
 * Pins the public contract of <SignInButton>: the UI must submit to the
 * server-owned OAuth start route so PKCE verifier cookies are written from a
 * Route Handler response, not by the browser Supabase client.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { SignInButton } from "@/app/auth/sign-in/SignInButton";

vi.mock("@/lib/supabase/browser", () => {
  throw new Error("SignInButton must not import the browser Supabase client");
});

describe("SignInButton", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders a submit button with accessible 'Sign in with Google' name", () => {
    // M9 C5 (commits 6be8a1d / 684c282) replaced the literal text node
    // with Google's official sign-in <img>; the accessible name moved
    // to the img's alt attribute (and the button's aria-label). The
    // contract this test pins is the ACCESSIBLE NAME, not raw
    // textContent — screen readers + automation key off the
    // accessible-name computation, not the DOM text.
    const { getByTestId, getByRole } = render(<SignInButton validatedNext="/admin" />);

    const button = getByTestId("sign-in-with-google") as HTMLButtonElement;
    expect(button.tagName.toLowerCase()).toBe("button");
    expect(button.type).toBe("submit");
    expect(button.disabled).toBe(false);
    // getByRole + name = the accessible-name contract. Trips if the
    // brand image's alt is dropped OR the button's aria-label is
    // removed without restoring a text fallback.
    expect(getByRole("button", { name: /sign in with google/i })).toBe(button);
  });

  test("submits to the server OAuth start route with validated next", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc-def-123" />);

    const form = getByTestId("sign-in-with-google-form") as HTMLFormElement;
    expect(form.method).toBe("get");
    expect(new URL(form.action).pathname).toBe("/api/auth/google/start");

    const nextInput = form.elements.namedItem("next") as HTMLInputElement | null;
    expect(nextInput).not.toBeNull();
    expect(nextInput!.type).toBe("hidden");
    expect(nextInput!.value).toBe("/show/abc-def-123");
  });
});
