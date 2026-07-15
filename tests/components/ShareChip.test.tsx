// @vitest-environment jsdom
/**
 * tests/components/ShareChip.test.tsx
 *
 * Header share chip (surface A) consumes ShareTokenProvider: visible only when
 * eligible + token present; path/title/copy derive from the context token and
 * update instantly on applyRotated.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ShareTokenProvider, useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import { ShareChip } from "@/app/admin/show/[slug]/ShareChip";

function Rotator() {
  const { applyRotated } = useShareToken();
  return <button onClick={() => applyRotated("NEWTOK", 9)}>rot</button>;
}

function wrap(isEligible: boolean, initialToken: string | null, initialEpoch = 5) {
  return render(
    <ShareTokenProvider initialToken={initialToken} initialEpoch={initialEpoch}>
      <ShareChip slug="2024-05-x" isEligible={isEligible} />
      <Rotator />
    </ShareTokenProvider>,
  );
}

afterEach(cleanup);

describe("ShareChip", () => {
  test("shows the chip with the token path when eligible + token present", () => {
    wrap(true, "TOK");
    const chip = screen.getByTestId("admin-show-share-chip");
    expect(chip.textContent).toContain("/show/2024-05-x/TOK");
    expect(chip.getAttribute("title")).toContain("/show/2024-05-x/TOK");
  });

  test("hidden when ineligible", () => {
    wrap(false, "TOK");
    expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
  });

  test("hidden when token is null", () => {
    wrap(true, null);
    expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
  });

  test("updates the shown path instantly on applyRotated", () => {
    wrap(true, "TOK");
    fireEvent.click(screen.getByText("rot"));
    expect(screen.getByTestId("admin-show-share-chip").textContent).toContain(
      "/show/2024-05-x/NEWTOK",
    );
  });
});
