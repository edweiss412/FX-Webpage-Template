// @vitest-environment jsdom
/**
 * tests/components/tiles/ScopeTileIcons.test.tsx
 *
 * Crew-redesign retarget (wp-20 step b, test 14 glyph row): the scope-tile
 * leading-icon differentiation (Task 4.13.distill — Finding 8), ported off the
 * deleted AudioScopeTile / VideoScopeTile / LightingScopeTile onto the
 * GearSection A/V/L scope cards (components/crew/sections/GearSection.tsx) that
 * now own the disciplines.
 *
 * Pre-distill the three scope surfaces differed by one heading word and had
 * structurally identical bodies; the fix routes a distinct lucide glyph
 * (Volume2 / Video / Lightbulb) into each card's SectionCard `icon` slot so each
 * discipline carries a visually distinct affordance.
 *
 * Contract pinned: when all three disciplines have non-sentinel room values,
 * GearSection renders one `[data-testid="gear-scope-{audio|video|lighting}"]`
 * card each, each card's header carries an <svg> glyph, the glyph precedes the
 * heading text, and the three glyphs are pairwise DISTINCT. We compare the
 * <svg> markup pairwise (robust to lucide version path-data bumps) rather than
 * against hardcoded path strings, and scope the comparison to each card's own
 * subtree so a sibling card's glyph can't satisfy the assertion (anti-tautology).
 */
import { describe, expect, test } from "vitest";
import { render } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";
// Admin viewer carries all flags, so every discipline is "owned" — but ordering
// is irrelevant to glyph distinctness, which is what this file pins.
const VIEWER = { kind: "admin" } as const;

/** Render GearSection with all three disciplines populated by one room. */
function renderAllScopes(): HTMLElement {
  return render(
    <GearSection
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

/** Extract a scope card's own subtree by discipline. */
function scopeCard(container: HTMLElement, id: "audio" | "video" | "lighting"): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-testid="gear-scope-${id}"]`);
  expect(el, `gear-scope-${id} card should render`).not.toBeNull();
  return el!;
}

/** Extract the first <svg>...</svg> markup from an element subtree. */
function svgMarkup(el: HTMLElement): string {
  const svg = el.querySelector("svg");
  return svg ? svg.outerHTML : "";
}

describe("Gear scope-card leading icons (Finding 8 — retargeted)", () => {
  test("each discipline card renders an <svg> glyph preceding its heading", () => {
    const c = renderAllScopes();
    for (const [id, heading] of [
      ["audio", "Audio"],
      ["video", "Video"],
      ["lighting", "Lighting"],
    ] as const) {
      const card = scopeCard(c, id);
      const html = card.innerHTML;
      expect(html).toMatch(/<svg/);
      // Glyph precedes the heading text in source order.
      const svgIdx = html.indexOf("<svg");
      const headIdx = html.indexOf(heading);
      expect(svgIdx).toBeGreaterThanOrEqual(0);
      expect(headIdx).toBeGreaterThan(svgIdx);
    }
  });

  test("the three scope cards render visually distinct icons (pairwise)", () => {
    const c = renderAllScopes();
    const a = svgMarkup(scopeCard(c, "audio"));
    const v = svgMarkup(scopeCard(c, "video"));
    const l = svgMarkup(scopeCard(c, "lighting"));
    expect(a).not.toBe("");
    expect(v).not.toBe("");
    expect(l).not.toBe("");
    expect(a).not.toBe(v);
    expect(v).not.toBe(l);
    expect(a).not.toBe(l);
  });
});
