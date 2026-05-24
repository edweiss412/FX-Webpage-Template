// @vitest-environment jsdom
/**
 * tests/components/PerShowCrewSection.test.tsx (M11.5 §B Task F1)
 *
 * Pins the simplified post-pivot contract: heading + roster name/role
 * rendering, empty-state, and crewLookupFailed warning. The M9.5
 * IssueLink / RevokeAllLinks affordances are GONE per F1 — they were
 * replaced by the section-level Reset + Rotate buttons on the admin
 * page (Tasks F2 + F3 + F4). The leakedLinkArrival regression suite
 * is removed alongside this rewrite — every contract it pinned is
 * an M9.5 behavior the picker pivot deletes.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import {
  PerShowCrewSection,
  type CrewRowForLinkPanel,
} from "@/components/admin/PerShowCrewSection";

afterEach(cleanup);

// Minimal CrewRowForLinkPanel fixture — M9.5 link-state fields kept
// as sentinels so the type still matches even though the component
// no longer reads them. §A's G0d cleanup will narrow the type after
// loadShowCrewWithAuth is deleted.
function makeRow(overrides: Partial<CrewRowForLinkPanel> = {}): CrewRowForLinkPanel {
  return {
    id: overrides.id ?? "row-id",
    name: overrides.name ?? "Alice Adams",
    role: overrides.role ?? "Audio A1",
    current_token_version: overrides.current_token_version ?? 0,
    max_issued_version: overrides.max_issued_version ?? 0,
    revoked_below_version: overrides.revoked_below_version ?? 0,
    authMissing: overrides.authMissing ?? false,
    ...overrides,
  };
}

describe("PerShowCrewSection (post-F1: picker pivot)", () => {
  test("renders one row per crew member with name + role", () => {
    const crew = [
      makeRow({ id: "a", name: "Alice Adams", role: "Audio A1" }),
      makeRow({ id: "b", name: "Bob Burns", role: "Video V2" }),
    ];
    render(<PerShowCrewSection showId="show-1" crew={crew} />);
    const rows = screen.getAllByTestId("per-show-crew-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Alice Adams");
    expect(rows[0]?.textContent).toContain("Audio A1");
    expect(rows[1]?.textContent).toContain("Bob Burns");
    expect(rows[1]?.textContent).toContain("Video V2");
  });

  test("role omitted when null", () => {
    render(
      <PerShowCrewSection
        showId="show-1"
        crew={[makeRow({ role: null })]}
      />,
    );
    const row = screen.getByTestId("per-show-crew-row");
    expect(row.textContent).toContain("Alice Adams");
    expect(row.textContent).not.toContain("Audio A1");
  });

  test("empty roster renders empty-state copy", () => {
    render(<PerShowCrewSection showId="show-1" crew={[]} />);
    expect(screen.getByTestId("per-show-crew-empty")).not.toBeNull();
    expect(screen.queryAllByTestId("per-show-crew-row")).toHaveLength(0);
  });

  test("crewLookupFailed=true renders warning branch with role=alert and SUPPRESSES rows + empty-state", () => {
    render(
      <PerShowCrewSection
        showId="show-1"
        crew={[makeRow()]}
        crewLookupFailed
      />,
    );
    const warning = screen.getByTestId("per-show-crew-lookup-failed");
    expect(warning.getAttribute("role")).toBe("alert");
    expect(screen.queryAllByTestId("per-show-crew-row")).toHaveLength(0);
    expect(screen.queryByTestId("per-show-crew-empty")).toBeNull();
  });

  test("the F1 simplification removed IssueLink / RevokeAllLinks (regression catch)", () => {
    // Structural: after F1, the rendered DOM must NOT contain the
    // legacy button affordances. This guards against an accidental
    // re-import / re-mount during the §A G-series cleanup.
    const { container } = render(
      <PerShowCrewSection showId="show-1" crew={[makeRow()]} />,
    );
    expect(container.innerHTML).not.toContain("Issue ");
    expect(container.innerHTML).not.toContain("Revoke");
  });
});
