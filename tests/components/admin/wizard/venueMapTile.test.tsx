// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { VenueMapTile } from "@/components/admin/wizard/VenueMapTile";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
});

describe("VenueMapTile", () => {
  test("VCR-3/VCR-4: empty query + valid mapHref → stripe + Directions anchor + glyph, NO <img>, NO `map` label", () => {
    const { container } = render(<VenueMapTile query="" mapHref="https://m.co" />);
    const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
    expect(tile.tagName).toBe("A");
    expect(tile.getAttribute("href")).toBe("https://m.co");
    expect(container.querySelector('[data-testid="venue-map-fallback"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-directions"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-map-img"]')).toBeNull(); // nothing to geocode
    // VCR-4: the terminal degraded tile shows a deliberate glyph empty-state,
    // NOT the transient `map` corner label (which would read as "map loading").
    const glyph = container.querySelector('[data-testid="venue-map-no-preview"]');
    expect(glyph).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-map-label"]')).toBeNull();
    // Caption asserted on the glyph's OWN subtree (anti-tautology — not the tile).
    expect(glyph!.textContent).toContain("no preview");
  });

  test("VCR-4: standard tile (query + mapHref) → `map` corner label, NO glyph, has <img>", () => {
    const { container } = render(
      <VenueMapTile query="The Masonic, SF" mapHref="https://maps.google.com/?q=x" />,
    );
    const label = container.querySelector('[data-testid="venue-map-label"]');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain("map");
    expect(container.querySelector('[data-testid="venue-map-no-preview"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-map-img"]')).not.toBeNull();
  });

  test("VCR-4: div branch (query, no mapHref) → `map` corner label, no glyph, no directions", () => {
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    expect(container.querySelector('[data-testid="venue-map-label"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="venue-map-no-preview"]')).toBeNull();
    expect(container.querySelector('[data-testid="venue-directions"]')).toBeNull();
  });

  test("guard: empty query + null mapHref → renders nothing", () => {
    const { container } = render(<VenueMapTile query="" mapHref={null} />);
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

  test("VCR-2 SSR: server markup paints the stripe base but NO <img> / proxy URL (no first-paint fetch)", () => {
    // renderToStaticMarkup never runs effects, so theme stays null → no <img>.
    // Load-bearing proof the light→dark double-fetch is gone at the source: the
    // browser's first paint requests no map image in any theme.
    const html = renderToStaticMarkup(<VenueMapTile query="X" mapHref={null} />);
    expect(html).toContain('data-testid="venue-map-fallback"'); // stripe base painted
    expect(html).not.toContain('data-testid="venue-map-img"'); // no <img> at first paint
    expect(html).not.toContain("/api/admin/venue-map"); // no proxy URL fetched
  });

  test("VCR-2 post-hydration: exactly one <img>, correct theme; dark never preceded by a light src", () => {
    document.documentElement.dataset.theme = "dark";
    const { container } = render(<VenueMapTile query="X" mapHref={null} />);
    const imgs = container.querySelectorAll('[data-testid="venue-map-img"]');
    expect(imgs.length).toBe(1);
    expect((imgs[0] as HTMLImageElement).getAttribute("src")).toContain("theme=dark");
    expect((imgs[0] as HTMLImageElement).getAttribute("src")).not.toContain("theme=light");
  });
});
