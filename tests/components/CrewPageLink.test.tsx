// @vitest-environment jsdom
/**
 * tests/components/CrewPageLink.test.tsx
 *
 * "Open crew page" link (surface B) consumes ShareTokenProvider: visible only when
 * eligible + token present; href derives from the context token and updates on
 * applyRotated.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ShareTokenProvider, useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";
import { CrewPageLink } from "@/app/admin/show/[slug]/CrewPageLink";

function Rotator() {
  const { applyRotated } = useShareToken();
  return <button onClick={() => applyRotated("NEWTOK", 9)}>rot</button>;
}

function wrap(isEligible: boolean, initialToken: string | null, initialEpoch = 5) {
  return render(
    <ShareTokenProvider initialToken={initialToken} initialEpoch={initialEpoch}>
      <CrewPageLink slug="2024-05-x" isEligible={isEligible} />
      <Rotator />
    </ShareTokenProvider>,
  );
}

afterEach(cleanup);

describe("CrewPageLink", () => {
  test("renders an anchor with the token href when eligible + token present", () => {
    wrap(true, "TOK");
    const link = screen.getByTestId("admin-show-open-crew");
    expect(link.getAttribute("href")).toContain("/show/2024-05-x/TOK");
    expect(link.getAttribute("aria-label")).toBe("Open crew page");
  });

  test("hidden when ineligible", () => {
    wrap(false, "TOK");
    expect(screen.queryByTestId("admin-show-open-crew")).toBeNull();
  });

  test("hidden when token is null", () => {
    wrap(true, null);
    expect(screen.queryByTestId("admin-show-open-crew")).toBeNull();
  });

  test("updates href instantly on applyRotated", () => {
    wrap(true, "TOK");
    fireEvent.click(screen.getByText("rot"));
    expect(screen.getByTestId("admin-show-open-crew").getAttribute("href")).toContain(
      "/show/2024-05-x/NEWTOK",
    );
  });
});
