// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

// Stub the client islands so PerShowCrewSection's tests exercise the
// section's STATE MACHINE in isolation. The real islands DO exist
// (Tasks 4.2 + 4.3); the mocks keep these tests deterministic and
// fast. The mock surface (label + disabled) matches the production
// island's API exactly.
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

const liveRow: CrewRowForLinkPanel = {
  id: "row-1",
  name: "Alice",
  role: "LEAD",
  authMissing: false,
  current_token_version: 2,
  max_issued_version: 2,
  revoked_below_version: 0,
};
const noLiveLinkRow: CrewRowForLinkPanel = {
  id: "row-2",
  name: "Bob",
  role: "A1",
  authMissing: false,
  current_token_version: 1,
  max_issued_version: 1,
  revoked_below_version: 1,
};
const authMissingRow: CrewRowForLinkPanel = {
  id: "row-4",
  name: "Dave",
  role: null,
  authMissing: true,
  current_token_version: 0,
  max_issued_version: 0,
  revoked_below_version: 0,
};

describe("PerShowCrewSection", () => {
  test("renders one row per crew member with name", () => {
    render(<PerShowCrewSection showId="show-uuid" crew={[liveRow, noLiveLinkRow]} />);
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  test("live row (current > revoked, max > 1): Issue button shows 'Issue new link', Revoke enabled", () => {
    render(<PerShowCrewSection showId="show-uuid" crew={[liveRow]} />);
    const issueBtns = screen.getAllByTestId("stub-issue-button");
    expect(issueBtns).toHaveLength(1);
    expect(issueBtns[0]?.textContent?.trim()).toBe("Issue new link");
    const revokeBtn = screen.getByTestId("stub-revoke-button") as HTMLButtonElement;
    expect(revokeBtn.disabled).toBe(false);
  });

  test("fresh row (max_issued_version === 1 AND no-live-link): Issue label is 'Issue first link'", () => {
    const freshNoLink: CrewRowForLinkPanel = {
      id: "row-fresh",
      name: "Carol",
      role: "LD",
      authMissing: false,
      current_token_version: 1,
      max_issued_version: 1,
      revoked_below_version: 1,
    };
    render(<PerShowCrewSection showId="show-uuid" crew={[freshNoLink]} />);
    expect(screen.getByTestId("stub-issue-button").textContent?.trim()).toBe(
      "Issue first link",
    );
  });

  test("no-live-link row: Revoke button disabled + visible no-live-link hint", () => {
    render(<PerShowCrewSection showId="show-uuid" crew={[noLiveLinkRow]} />);
    const revokeBtn = screen.getByTestId("stub-revoke-button") as HTMLButtonElement;
    expect(revokeBtn.disabled).toBe(true);
    expect(
      screen.getByTestId("per-show-crew-no-live-link-hint"),
    ).toBeTruthy();
  });

  test("empty crew list renders empty-state copy (no rows)", () => {
    render(<PerShowCrewSection showId="show-uuid" crew={[]} />);
    expect(screen.getByTestId("per-show-crew-empty")).toBeTruthy();
    expect(screen.queryByTestId("per-show-crew-row")).toBeNull();
  });

  test("crewLookupFailed=true renders distinct warning branch + role=alert; empty-state does NOT render", () => {
    render(
      <PerShowCrewSection
        showId="show-uuid"
        crew={[]}
        crewLookupFailed
      />,
    );
    const alert = screen.getByTestId("per-show-crew-lookup-failed");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent?.toLowerCase()).toMatch(/temporarily unavailable/);
    expect(screen.queryByTestId("per-show-crew-empty")).toBeNull();
  });

  test("crewLookupFailed=true takes precedence over crew rows (defensive)", () => {
    render(
      <PerShowCrewSection
        showId="show-uuid"
        crew={[liveRow]}
        crewLookupFailed
      />,
    );
    expect(screen.getByTestId("per-show-crew-lookup-failed")).toBeTruthy();
    expect(screen.queryByText("Alice")).toBeNull();
  });

  test("auth-missing row: affordances HIDDEN (impeccable critique M-4 fix); diagnostic copy visible; action layer remains authoritative gate", () => {
    render(<PerShowCrewSection showId="show-uuid" crew={[authMissingRow]} />);
    expect(
      screen.getByTestId("per-show-crew-auth-missing-hint"),
    ).toBeTruthy();
    // Impeccable critique M-4: two greyed-out accent buttons in the
    // authMissing branch were noise — the hint already explains. The
    // affordance pair is now omitted from the render entirely. The
    // Server Action layer remains the authoritative gate (any forged
    // submit hits the crew_member_not_found data-layer branch).
    expect(screen.queryByTestId("stub-issue-button")).toBeNull();
    expect(screen.queryByTestId("stub-revoke-button")).toBeNull();
    expect(
      screen
        .getByTestId("per-show-crew-auth-missing-hint")
        .textContent?.toLowerCase(),
    ).toMatch(/auth row missing/);
  });

  test("auth-missing row uses data-auth-missing=true marker on the row", () => {
    render(<PerShowCrewSection showId="show-uuid" crew={[authMissingRow]} />);
    const rows = screen.getAllByTestId("per-show-crew-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-auth-missing")).toBe("true");
  });

  test("normal row carries data-auth-missing=false + data-no-live-link reflecting state", () => {
    render(
      <PerShowCrewSection
        showId="show-uuid"
        crew={[liveRow, noLiveLinkRow]}
      />,
    );
    const rows = screen.getAllByTestId("per-show-crew-row");
    expect(rows).toHaveLength(2);
    const liveLi = rows.find(
      (li) => li.getAttribute("data-crew-name") === "Alice",
    );
    const noLiveLi = rows.find(
      (li) => li.getAttribute("data-crew-name") === "Bob",
    );
    expect(liveLi?.getAttribute("data-no-live-link")).toBe("false");
    expect(noLiveLi?.getAttribute("data-no-live-link")).toBe("true");
    expect(liveLi?.getAttribute("data-auth-missing")).toBe("false");
  });

  test("role text renders only when role is non-null", () => {
    const noRole: CrewRowForLinkPanel = { ...liveRow, id: "no-role", name: "Eve", role: null };
    render(<PerShowCrewSection showId="show-uuid" crew={[liveRow, noRole]} />);
    const liveRowEl = screen
      .getAllByTestId("per-show-crew-row")
      .find((li) => li.getAttribute("data-crew-name") === "Alice")!;
    expect(within(liveRowEl).getByText("LEAD")).toBeTruthy();
    const noRoleRowEl = screen
      .getAllByTestId("per-show-crew-row")
      .find((li) => li.getAttribute("data-crew-name") === "Eve")!;
    expect(within(noRoleRowEl).queryByText("LEAD")).toBeNull();
  });
});
