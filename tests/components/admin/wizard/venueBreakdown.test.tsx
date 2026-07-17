// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { VenueBreakdown } from "@/components/admin/wizard/step3ReviewSections";
import type { ShowRow } from "@/lib/parser/types";

const DFID = "drive-abc-123";
function venue(over: Partial<NonNullable<ShowRow["venue"]>> = {}): ShowRow["venue"] {
  return {
    name: "The Masonic Auditorium",
    address: "1111 California St",
    city: "San Francisco, CA 94108",
    loadingDock: "Rear alley off Taylor St, 2 bays, 9ft clearance",
    googleLink: "https://maps.google.com/?q=masonic",
    ...over,
  };
}
afterEach(cleanup);

describe("VenueBreakdown", () => {
  test("null venue → empty copy, no map, no dock", () => {
    const { container, getByText } = render(<VenueBreakdown dfid={DFID} venue={null} />);
    getByText("No venue details parsed.");
    expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-dock"]')).toBeNull();
  });

  test("full venue → name/address/city, map region, dock footer", () => {
    const { container } = render(<VenueBreakdown dfid={DFID} venue={venue()} />);
    const body = container.querySelector('[data-testid="venue-body"]') as HTMLElement;
    expect(within(body).getByText("The Masonic Auditorium")).toBeTruthy();
    expect(within(body).getByText(/1111 California St/)).toBeTruthy();
    expect(within(body).getByText(/San Francisco, CA 94108/)).toBeTruthy();
    expect(container.querySelector('[data-testid="venue-map-region"]')).not.toBeNull();
    // VCR-2 regression: a valid query still yields the <img> after effects flush.
    expect(container.querySelector('[data-testid="venue-map-img"]')).not.toBeNull();
    const dock = container.querySelector('[data-testid="venue-dock"]') as HTMLElement;
    expect(within(dock).getByText(/Rear alley off Taylor St/)).toBeTruthy();
  });

  test("loadingDock absent → no dock footer", () => {
    const { container } = render(
      <VenueBreakdown dfid={DFID} venue={venue({ loadingDock: null })} />,
    );
    expect(container.querySelector('[data-testid="venue-dock"]')).toBeNull();
  });

  test("VCR-3: link-only venue (valid googleLink) → region MOUNTS with Directions, no <img>, count (1), no empty copy", () => {
    const { container, getByText } = render(
      <VenueBreakdown
        dfid={DFID}
        venue={venue({
          name: "",
          address: "",
          city: "",
          loadingDock: null,
          googleLink: "https://maps.google.com/?q=x",
        })}
      />,
    );
    expect(container.querySelector('[data-testid="venue-map-region"]')).not.toBeNull();
    const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
    expect(tile.tagName).toBe("A");
    expect(container.querySelector('[data-testid="venue-directions"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-map-img"]')).toBeNull();
    getByText("(1)"); // count = 1 (googleLink), asserted against the rendered heading
    expect(container.textContent).not.toContain("No venue details parsed.");
  });

  test("accepted degenerate: non-parseable googleLink only → region collapses, no tile, count (1), no empty copy", () => {
    const { container, getByText } = render(
      <VenueBreakdown
        dfid={DFID}
        venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: "TBD" })}
      />,
    );
    expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
    getByText("(1)"); // "TBD" is counted by contentRows → count 1, so no empty state
    expect(container.textContent).not.toContain("No venue details parsed.");
  });

  test("true empty: all five fields empty → count (0), empty copy, no region", () => {
    const { container, getByText } = render(
      <VenueBreakdown
        dfid={DFID}
        venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: null })}
      />,
    );
    getByText("(0)");
    getByText("No venue details parsed.");
    expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
  });

  test("notes never render in the venue card", () => {
    const v = { ...venue(), notes: "SECRET NOTE STRING" } as NonNullable<ShowRow["venue"]>;
    const { container } = render(<VenueBreakdown dfid={DFID} venue={v} />);
    expect(container.textContent).not.toContain("SECRET NOTE STRING");
  });

  test("non-URL googleLink → map region present but no Directions anchor", () => {
    const { container } = render(
      <VenueBreakdown dfid={DFID} venue={venue({ googleLink: "TBD" })} />,
    );
    expect(container.querySelector('[data-testid="venue-map-region"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-directions"]')).toBeNull();
  });
});
