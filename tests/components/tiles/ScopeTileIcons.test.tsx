/**
 * Unit tests for the scope-tile leading-icon differentiation
 * (Task 4.13.distill — Finding 8 close-out).
 *
 * Pre-distill, the three scope tiles (Audio / Video / Lighting) had
 * headings differing by one word and structurally identical bodies;
 * the critique flagged them as visually indistinguishable. The fix
 * routes a lucide-react glyph through the new Section `headingIcon`
 * slot so each tile carries a distinct affordance in the eyebrow.
 *
 * What we cover:
 *   - AudioScopeTile renders an SVG (the lucide-react icon mounts).
 *   - VideoScopeTile renders a different SVG path than AudioScopeTile.
 *   - LightingScopeTile renders a different SVG path than the other two.
 *   - The icon sits in source order BEFORE the heading text so it reads
 *     to the left.
 *
 * We verify by snapshotting only the heading region — extracting the
 * <header> from the rendered markup so the empty-state body's "Doug
 * hasn't filled this in yet" doesn't pollute the assertion (the
 * anti-tautology rule from AGENTS.md). Each tile's icon path-data is
 * its own private detail; we assert distinctness at the rendered-
 * markup level, not against any specific path string.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioScopeTile } from "@/components/tiles/AudioScopeTile";
import { LightingScopeTile } from "@/components/tiles/LightingScopeTile";
import { VideoScopeTile } from "@/components/tiles/VideoScopeTile";
import type { RoleFlag } from "@/lib/parser/types";

// All three scope tiles render only when the viewer carries the
// matching atomic flag. LEAD covers Audio + Video + Financials per
// scopeTiles.ts; L1 covers Lighting per the asymmetry documented in
// LightingScopeTile.tsx. Render with the union so all three mount.
const allScopesViewerFlags: RoleFlag[] = ["LEAD", "L1"];

/** Extract the rendered <header>...</header> region. */
function extractHeader(html: string): string {
  const m = html.match(/<header[\s\S]*?<\/header>/);
  return m ? m[0] : "";
}

describe("Scope-tile leading icons (Task 4.13.distill — Finding 8)", () => {
  test("AudioScopeTile heading region contains an SVG icon", () => {
    const html = renderToStaticMarkup(
      <AudioScopeTile rooms={[]} viewerFlags={allScopesViewerFlags} />,
    );
    const header = extractHeader(html);
    expect(header).toMatch(/<svg/);
    // Icon precedes heading text.
    const svgIdx = header.indexOf("<svg");
    const headIdx = header.indexOf("Audio");
    expect(svgIdx).toBeGreaterThanOrEqual(0);
    expect(headIdx).toBeGreaterThan(svgIdx);
  });

  test("VideoScopeTile heading region contains an SVG icon", () => {
    const html = renderToStaticMarkup(
      <VideoScopeTile rooms={[]} viewerFlags={allScopesViewerFlags} />,
    );
    const header = extractHeader(html);
    expect(header).toMatch(/<svg/);
    const svgIdx = header.indexOf("<svg");
    const headIdx = header.indexOf("Video");
    expect(svgIdx).toBeGreaterThanOrEqual(0);
    expect(headIdx).toBeGreaterThan(svgIdx);
  });

  test("LightingScopeTile heading region contains an SVG icon", () => {
    const html = renderToStaticMarkup(
      <LightingScopeTile rooms={[]} viewerFlags={allScopesViewerFlags} />,
    );
    const header = extractHeader(html);
    expect(header).toMatch(/<svg/);
    const svgIdx = header.indexOf("<svg");
    const headIdx = header.indexOf("Lighting");
    expect(svgIdx).toBeGreaterThanOrEqual(0);
    expect(headIdx).toBeGreaterThan(svgIdx);
  });

  test("the three scope tiles render visually distinct icons", () => {
    // The substantive Finding 8 contract: the three tiles MUST be
    // visually distinguishable. Compare the <svg>...</svg> body of
    // each tile's header — they MUST all differ pairwise. The
    // assertion is robust to lucide-react version bumps that change
    // path-data, since we compare bodies pairwise rather than against
    // hardcoded path strings.
    const audioHeader = extractHeader(
      renderToStaticMarkup(
        <AudioScopeTile rooms={[]} viewerFlags={allScopesViewerFlags} />,
      ),
    );
    const videoHeader = extractHeader(
      renderToStaticMarkup(
        <VideoScopeTile rooms={[]} viewerFlags={allScopesViewerFlags} />,
      ),
    );
    const lightingHeader = extractHeader(
      renderToStaticMarkup(
        <LightingScopeTile rooms={[]} viewerFlags={allScopesViewerFlags} />,
      ),
    );

    const extractSvg = (s: string): string => {
      const m = s.match(/<svg[\s\S]*?<\/svg>/);
      return m ? m[0] : "";
    };
    const a = extractSvg(audioHeader);
    const v = extractSvg(videoHeader);
    const l = extractSvg(lightingHeader);
    expect(a).not.toBe("");
    expect(v).not.toBe("");
    expect(l).not.toBe("");
    expect(a).not.toBe(v);
    expect(v).not.toBe(l);
    expect(a).not.toBe(l);
  });
});
