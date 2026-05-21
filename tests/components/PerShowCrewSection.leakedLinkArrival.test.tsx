// @vitest-environment jsdom
/**
 * tests/components/PerShowCrewSection.leakedLinkArrival.test.tsx (M9.5)
 *
 * Spec §7.2 Branch A (leaked-link middleware) sets:
 *   revoked_below_version = current_token_version
 * leaving the row in the "no-live-link, has been live before" state
 * (max_issued_version ≥ 2 if the row was live at the moment of leak).
 *
 * Spec §7.2 Branch C (future-version leak) lifts max_issued_version
 * to jwt.tokenVersion + 1 AND advances revoked_below_version to
 * current_token_version, leaving the row in no-live-link state with
 * max_issued_version ≥ 2.
 *
 * In BOTH cases the row is in no-live-link state AND
 * max_issued_version > 1, so the M9.5 PerShowCrewSection MUST label
 * the affordance "Issue new link" — NOT "Issue first link"
 * (which is reserved for max_issued_version === 1 per spec line 1100).
 *
 * This test pins that label semantics against the leaked-link arrival
 * shape — if the middleware path drifts to leaving the row in a
 * different state, the test surfaces the divergence with the spec.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/app/admin/show/[slug]/IssueLinkButton", () => ({
  IssueLinkButton: ({
    isFresh,
    disabled,
  }: {
    isFresh: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="stub-issue-button"
      disabled={disabled}
    >
      {isFresh ? "Issue first link" : "Issue new link"}
    </button>
  ),
}));
vi.mock("@/app/admin/show/[slug]/RevokeAllLinksButton", () => ({
  RevokeAllLinksButton: ({ disabled }: { disabled: boolean }) => (
    <button
      type="button"
      data-testid="stub-revoke-button"
      disabled={disabled}
    >
      Revoke all links
    </button>
  ),
}));

import { PerShowCrewSection } from "@/components/admin/PerShowCrewSection";
import { type CrewRowForLinkPanel } from "@/lib/data/loadShowCrewWithAuth";

afterEach(() => cleanup());

describe("M9.5 — leaked-link middleware UI-render arrival", () => {
  test("Branch A (current == revoked, both >= 2): renders no-live-link + Revoke disabled + 'Issue new link' label", () => {
    // Spec §7.2 Branch A: leaked ?t= with tokenVersion === current_token_version
    // sets revoked_below_version = current_token_version. After this,
    // max_issued_version is unchanged so the row is "no live link, has
    // been live before" (max_issued_version >= 2 → Issue NEW, not first).
    const branchARow: CrewRowForLinkPanel = {
      id: "row-leaked",
      name: "Leaked Alice",
      role: null,
      authMissing: false,
      current_token_version: 2,
      max_issued_version: 2,
      revoked_below_version: 2,
    };
    render(<PerShowCrewSection showId="show-uuid" crew={[branchARow]} />);

    // no-live-link hint visible
    expect(
      screen.getByTestId("per-show-crew-no-live-link-hint"),
    ).toBeTruthy();
    // Revoke disabled
    expect(
      (screen.getByTestId("stub-revoke-button") as HTMLButtonElement).disabled,
    ).toBe(true);
    // Label is "Issue new link" — NOT "Issue first link"
    expect(
      screen.getByTestId("stub-issue-button").textContent?.trim(),
    ).toBe("Issue new link");
    // Defensive: row carries data-no-live-link=true
    const li = screen.getByTestId("per-show-crew-row");
    expect(li.getAttribute("data-no-live-link")).toBe("true");
  });

  test("Branch C (future-version leak, max lifted >= 2): renders no-live-link + 'Issue new link' label", () => {
    // Spec §7.2 Branch C: future-version leak lifts max_issued_version
    // to the future version. Row is in no-live-link state but max ≥ 2.
    const branchCRow: CrewRowForLinkPanel = {
      id: "row-future",
      name: "Future Bob",
      role: null,
      authMissing: false,
      current_token_version: 5,
      max_issued_version: 5,
      revoked_below_version: 5,
    };
    render(<PerShowCrewSection showId="show-uuid" crew={[branchCRow]} />);

    expect(
      screen.getByTestId("per-show-crew-no-live-link-hint"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("stub-issue-button").textContent?.trim(),
    ).toBe("Issue new link");
    expect(
      screen.queryByText(/^issue first link$/i),
    ).toBeNull();
  });

  test("Distinguish: a TRULY-fresh row (max=1 + no-live-link) still gets 'Issue first link' — confirming the label distinction is load-bearing", () => {
    const freshRow: CrewRowForLinkPanel = {
      id: "row-fresh",
      name: "Fresh Carol",
      role: null,
      authMissing: false,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 1,
    };
    render(<PerShowCrewSection showId="show-uuid" crew={[freshRow]} />);
    expect(
      screen.getByTestId("stub-issue-button").textContent?.trim(),
    ).toBe("Issue first link");
  });
});
