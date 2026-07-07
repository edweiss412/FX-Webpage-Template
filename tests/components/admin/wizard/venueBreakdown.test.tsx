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
    const dock = container.querySelector('[data-testid="venue-dock"]') as HTMLElement;
    expect(within(dock).getByText(/Rear alley off Taylor St/)).toBeTruthy();
  });

  test("loadingDock absent → no dock footer", () => {
    const { container } = render(
      <VenueBreakdown dfid={DFID} venue={venue({ loadingDock: null })} />,
    );
    expect(container.querySelector('[data-testid="venue-dock"]')).toBeNull();
  });

  test("name+address both empty → map region collapses (parent owns), no map tile mounted", () => {
    const { container } = render(
      <VenueBreakdown
        dfid={DFID}
        venue={venue({ name: "", address: "", googleLink: "https://m.co" })}
      />,
    );
    expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
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
