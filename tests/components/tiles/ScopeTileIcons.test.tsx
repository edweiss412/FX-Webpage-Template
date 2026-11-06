// @vitest-environment jsdom
/**
 * tests/components/tiles/ScopeTileIcons.test.tsx
 *
 * Crew-redesign retarget (wp-20 step b, test 14 glyph row): the scope leading-icon
 * differentiation (Task 4.13.distill — Finding 8), ported off the deleted
 * AudioScopeTile / VideoScopeTile / LightingScopeTile and then off Gear's scope
 * cards onto the Rooms section's discipline rows (components/show-panels/RoomsBody.tsx,
 * PR C Task 7; spec line 309, "Distinct discipline icons stay").
 *
 * Pre-distill the three scope surfaces differed by one heading word and had
 * structurally identical bodies; the fix gives each discipline a distinct lucide
 * glyph, so each carries a visually distinct affordance.
 *
 * Contract pinned: when all three disciplines have non-sentinel room values, Rooms
 * renders one row each, each row carries an <svg> glyph, the glyph precedes the key
 * text, and the three glyphs are pairwise DISTINCT. We compare the <svg> markup
 * pairwise (robust to lucide version path-data bumps) rather than against hardcoded
 * path strings, and scope the comparison to each row's own subtree so a sibling row's
 * glyph can't satisfy the assertion (anti-tautology).
 */
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";

import { RoomsSection } from "@/components/crew/sections/RoomsSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "../crew/sections/_ledgerProp";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
// Admin viewer carries all flags, so every discipline is "owned" — but ordering
// is irrelevant to glyph distinctness, which is what this file pins.
const VIEWER = { kind: "admin" } as const;

/** Render Rooms with all three disciplines populated by one room. */
function renderAllScopes(): HTMLElement {
  return render(
    <RoomsSection
      {...ledgerProp()}
      data={makeShowForViewer({
        rooms: [
          {
            id: "r1",
            kind: "gs",
            name: "Main",
            audio: "L-Acoustics K1",
            video: "Christie 4K projector",
            lighting: "MAC Aura XB wash",
          },
        ],
      })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

/** A discipline row's own subtree, by its key. */
function scopeRow(container: HTMLElement, key: "Audio" | "Video" | "Lighting"): HTMLElement {
  const el = [...container.querySelectorAll<HTMLElement>('[data-testid="room-scope-key"]')].find(
    (k) => k.textContent === key,
  );
  expect(el, `the ${key} row should render`).toBeDefined();
  return el!.closest("li")!;
}

/** Extract the first <svg>...</svg> markup from an element subtree. */
function svgMarkup(el: HTMLElement): string {
  const svg = el.querySelector("svg");
  return svg ? svg.outerHTML : "";
}

describe("Rooms discipline row leading icons (Finding 8 — retargeted)", () => {
  test("each discipline row renders an <svg> glyph preceding its key", () => {
    const c = renderAllScopes();
    for (const key of ["Audio", "Video", "Lighting"] as const) {
      const html = scopeRow(c, key).innerHTML;
      expect(html).toMatch(/<svg/);
      // Glyph precedes the key text in source order.
      const svgIdx = html.indexOf("<svg");
      const keyIdx = html.indexOf(key);
      expect(svgIdx).toBeGreaterThanOrEqual(0);
      expect(keyIdx).toBeGreaterThan(svgIdx);
    }
  });

  test("the three discipline rows render visually distinct icons (pairwise)", () => {
    const c = renderAllScopes();
    const a = svgMarkup(scopeRow(c, "Audio"));
    const v = svgMarkup(scopeRow(c, "Video"));
    const l = svgMarkup(scopeRow(c, "Lighting"));
    expect(a).not.toBe("");
    expect(v).not.toBe("");
    expect(l).not.toBe("");
    expect(a).not.toBe(v);
    expect(v).not.toBe(l);
    expect(a).not.toBe(l);
  });
});
