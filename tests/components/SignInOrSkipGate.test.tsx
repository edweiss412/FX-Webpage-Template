// @vitest-environment jsdom
/**
 * tests/components/SignInOrSkipGate.test.tsx (M11.5 §B Task C5)
 *
 * Pins the two-mode contract per spec §7.1a + P-R27/P-R28/P-R29:
 *
 *   Mode A — reason: 'first_contact'
 *     Default empty-cookie / no-session welcome. Primary CTA navigates
 *     to ?gate=skip (re-runs auth chain into picker); secondary CTA
 *     starts /auth/sign-in.
 *
 *   Mode B — reason: 'google_mismatch'  (shared-device defense)
 *     Header "Signed in as someone else"; primary CTA links DIRECTLY
 *     to /api/auth/google/start?next= (P-R29 Fix-2 — bypasses the
 *     sign-in page that would short-circuit on the existing session);
 *     secondary CTA submits a form bound to clearIdentityAndSkip
 *     (P-R29 Fix-3 — atomic clear+redirect; NOT base clearIdentity).
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { SignInOrSkipGate } from "@/app/show/[slug]/[shareToken]/_SignInOrSkipGate";

afterEach(cleanup);

const SLUG = "sample-show";
const TOKEN = "a".repeat(64);
const TOKENIZED_URL = `/show/${SLUG}/${TOKEN}`;
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const ENCODED = encodeURIComponent(TOKENIZED_URL);

describe("<SignInOrSkipGate> — Mode A (first_contact)", () => {
  test("renders cataloged Mode-A prompt copy", () => {
    const { getByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="first_contact"
      />,
    );
    expect(getByTestId("sign-in-or-skip-gate").textContent).toContain(
      MESSAGE_CATALOG.SIGN_IN_OR_SKIP_PROMPT.crewFacing!,
    );
  });

  test("primary CTA navigates to the same URL with ?gate=skip", () => {
    const { getByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="first_contact"
      />,
    );
    const skip = getByTestId("sign-in-or-skip-gate-skip-cta") as HTMLAnchorElement;
    expect(skip.tagName).toBe("A");
    expect(skip.getAttribute("href")).toBe(`${TOKENIZED_URL}?gate=skip`);
  });

  test("secondary CTA links to /auth/sign-in with the tokenized URL as next", () => {
    const { getByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="first_contact"
      />,
    );
    const signIn = getByTestId(
      "sign-in-or-skip-gate-sign-in-cta",
    ) as HTMLAnchorElement;
    expect(signIn.getAttribute("href")).toBe(`/auth/sign-in?next=${ENCODED}`);
  });

  test("does NOT render the Mode-B mismatch header", () => {
    const { queryByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="first_contact"
      />,
    );
    expect(queryByTestId("sign-in-or-skip-gate-mismatch-header")).toBeNull();
  });
});

describe("<SignInOrSkipGate> — Mode B (google_mismatch)", () => {
  test("renders 'Signed in as someone else' header + cataloged mismatch copy", () => {
    const { getByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="google_mismatch"
      />,
    );
    expect(
      getByTestId("sign-in-or-skip-gate-mismatch-header"),
    ).not.toBeNull();
    expect(getByTestId("sign-in-or-skip-gate").textContent).toContain(
      MESSAGE_CATALOG.SIGN_IN_OR_SKIP_PROMPT_MISMATCH.crewFacing!,
    );
  });

  test("primary CTA links DIRECTLY to /api/auth/google/start (P-R29 Fix-2; NOT /auth/sign-in)", () => {
    const { getByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="google_mismatch"
      />,
    );
    const signIn = getByTestId(
      "sign-in-or-skip-gate-sign-in-cta",
    ) as HTMLAnchorElement;
    expect(signIn.getAttribute("href")).toBe(
      `/api/auth/google/start?next=${ENCODED}`,
    );
    // Negative-regression: must NOT route through /auth/sign-in (that
    // page short-circuits when already signed in, exactly the Mode-B
    // state — would loop the user).
    expect(signIn.getAttribute("href")).not.toMatch(/\/auth\/sign-in/);
  });

  test("Continue-as-guest CTA submits a form bound to clearIdentityAndSkip (P-R29 Fix-3 atomic)", () => {
    const { getByTestId } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="google_mismatch"
      />,
    );
    const guestBtn = getByTestId(
      "sign-in-or-skip-gate-continue-as-guest-cta",
    ) as HTMLButtonElement;
    expect(guestBtn.tagName).toBe("BUTTON");
    expect(guestBtn.getAttribute("type")).toBe("submit");
    const form = guestBtn.closest("form")!;
    // Server-action-bound (atomic clearIdentityAndSkip per P-R29 Fix-3) →
    // React 19 emits the javascript: safety prefix.
    expect(form.getAttribute("action") ?? "").toMatch(/^javascript:/);
    const fieldOf = (n: string) =>
      (form.querySelector(`input[name="${n}"]`) as HTMLInputElement | null)
        ?.value;
    expect(fieldOf("slug")).toBe(SLUG);
    expect(fieldOf("shareToken")).toBe(TOKEN);
    expect(fieldOf("showId")).toBe(SHOW_ID);
  });

  test("Mode B is opaque to the cookie's identity data (no name leakage)", () => {
    // Spec §7.1a + P-R28: Mode B never reads or renders the cookie's
    // crew-row data. The render must not contain a fixture name string
    // even when the test setup seeds a picker cookie elsewhere — we
    // simulate by inspecting the rendered HTML.
    const { container } = render(
      <SignInOrSkipGate
        slug={SLUG}
        shareToken={TOKEN}
        showId={SHOW_ID}
        reason="google_mismatch"
      />,
    );
    expect(container.innerHTML).not.toContain("Alice");
    expect(container.innerHTML).not.toContain("Bob");
  });
});
