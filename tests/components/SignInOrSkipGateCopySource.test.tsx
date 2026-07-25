// @vitest-environment jsdom
/**
 * tests/components/SignInOrSkipGateCopySource.test.tsx
 *
 * Proves the Mode B prompt is SOURCED from the catalog, which the sibling
 * suite's literal-plus-equality pair cannot: a component hardcoding the exact
 * same sentence satisfies both of those assertions. Here `messageFor` is mocked
 * to return a sentinel, so the only way the sentinel reaches the DOM is if the
 * component actually calls the lookup.
 */
import { describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const SENTINEL = "SENTINEL_MISMATCH_PROMPT_d41d8cd9";

vi.mock("@/lib/messages/lookup", () => ({
  messageFor: (code: string) => ({
    code,
    dougFacing: null,
    crewFacing: code === "SIGN_IN_OR_SKIP_PROMPT_MISMATCH" ? SENTINEL : `other:${code}`,
    followUp: null,
    helpfulContext: null,
  }),
}));

const SLUG = "sample-show";
const TOKEN = "a".repeat(64);
const SHOW_ID = "11111111-1111-1111-1111-111111111111";

describe("<SignInOrSkipGate> Mode B copy sourcing", () => {
  test("renders whatever the catalog lookup returns, not a hardcoded string", async () => {
    const { SignInOrSkipGate } = await import("@/app/show/[slug]/[shareToken]/_SignInOrSkipGate");
    const { getByTestId } = render(
      <SignInOrSkipGate slug={SLUG} shareToken={TOKEN} showId={SHOW_ID} reason="google_mismatch" />,
    );
    // A component that inlined the real sentence would fail here.
    expect(getByTestId("sign-in-or-skip-gate").textContent).toContain(SENTINEL);
  });
});
