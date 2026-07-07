// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { VenueMapTile } from "@/components/admin/wizard/VenueMapTile";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("VenueMapTile", () => {
  test("empty query → renders nothing (parent owns collapse)", () => {
    const { container } = render(<VenueMapTile query="" mapHref="https://m.co" />);
    expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
  });

  test("query + mapHref → tile IS the anchor (href/target) + img proxy src + Directions visual", () => {
    const { container } = render(
      <VenueMapTile query="The Masonic, SF" mapHref="https://maps.google.com/?q=x" />,
    );
    const img = container.querySelector('[data-testid="venue-map-img"]') as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("/api/admin/venue-map?q=");
    expect(img.getAttribute("src")).toContain("theme=light");
    // The whole tile is the anchor (the 44px target) — href/target live on it.
    const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("https://maps.google.com/?q=x");
    expect(tile.getAttribute("target")).toBe("_blank");
    expect(tile.getAttribute("rel")).toContain("noopener");
    // The Directions visual span is present (decorative; no href of its own).
    const dir = container.querySelector('[data-testid="venue-directions"]') as HTMLElement;
    expect(dir).not.toBeNull();
    expect(dir.tagName).toBe("SPAN");
  });

  test("no mapHref → tile is a non-anchor div, no Directions visual (no dead link)", () => {
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLElement;
    expect(tile.tagName).toBe("DIV");
    expect(container.querySelector('[data-testid="venue-directions"]')).toBeNull();
    // stripe base + img still present
    expect(container.querySelector('[data-testid="venue-map-img"]')).not.toBeNull();
  });

  test("img onError hides the img, revealing the always-present stripe base", () => {
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const img = container.querySelector('[data-testid="venue-map-img"]') as HTMLImageElement;
    const stripe = container.querySelector('[data-testid="venue-map-fallback"]') as HTMLElement;
    expect(stripe).not.toBeNull(); // base layer always painted
    fireEvent.error(img);
    expect(img.style.visibility).toBe("hidden");
  });

  test("dark theme after hydration → src carries theme=dark", () => {
    document.documentElement.dataset.theme = "dark";
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const img = container.querySelector('[data-testid="venue-map-img"]') as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("theme=dark");
  });
});
