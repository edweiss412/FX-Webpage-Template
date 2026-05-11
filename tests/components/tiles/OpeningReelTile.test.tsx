/**
 * tests/components/tiles/OpeningReelTile.test.tsx — M7 Task 7.9 / AC-7.3 /
 * AC-7.25. The four AC-7.25 cases verbatim, plus a sentinel-hiding case
 * and a negative-regression on the URL-strip render contract.
 *
 * AC-7.25 invariants pinned here:
 *   - Mixed-value cell + 4-pin tuple → text line `Opening reel: YES` AND
 *     inline <video> with `/api/asset/reel/...` src. DOM never contains
 *     `https://` or `drive.google.com`.
 *   - Pure-URL cell + 4-pin tuple → only the <video>; no text line.
 *   - Text-only cell ("MAYBE") + no pins → text line only; no <video>.
 *   - Drift case (cell has URL substring, pins all NULL) → URL-stripped
 *     text line only; no <video>; DOM never carries `https://` /
 *     `drive.google.com`.
 *
 * Driving strategy: `renderToStaticMarkup` (server render), same pattern
 * as `SentinelHidingClass.test.tsx`. No jsdom needed.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { OpeningReelTile } from "@/components/tiles/OpeningReelTile";

const SHOW_ID = "77777777-7777-4777-8777-777777777777";

function render(html: string): {
  containsVideo: boolean;
  videoSrc: string | null;
  textBody: string;
} {
  return {
    containsVideo: /<video\b/i.test(html),
    videoSrc: html.match(/src="(\/api\/asset\/reel\/[^"]+)"/)?.[1] ?? null,
    textBody: html,
  };
}

describe("OpeningReelTile", () => {
  test("AC-7.25 mixed-value cell + 4-pin tuple → stripped text + inline <video>", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile
        showId={SHOW_ID}
        eventDetails={{
          opening_reel: "YES - https://drive.google.com/file/d/abc123/view",
        }}
        hasVideo={true}
      />,
    );
    const r = render(html);
    expect(r.containsVideo).toBe(true);
    expect(r.videoSrc).toBe(`/api/asset/reel/${SHOW_ID}`);
    expect(html).toContain("YES");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("drive.google.com");
    expect(html).toContain('data-testid="opening-reel-tile"');
  });

  test("AC-7.25 pure-URL cell + 4-pin tuple → only <video>; no text line", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile
        showId={SHOW_ID}
        eventDetails={{
          opening_reel: "https://drive.google.com/file/d/abc123/view",
        }}
        hasVideo={true}
      />,
    );
    const r = render(html);
    expect(r.containsVideo).toBe(true);
    expect(r.videoSrc).toBe(`/api/asset/reel/${SHOW_ID}`);
    expect(html).not.toContain("https://");
    expect(html).not.toContain("drive.google.com");
    // The stripped residual is empty, so the text line element MUST NOT
    // render. Asserting the data-testid for the text row is absent is the
    // tightest scoping (anti-tautology — sibling fields could otherwise
    // satisfy this).
    expect(html).not.toContain('data-testid="opening-reel"');
  });

  test("AC-7.25 text-only cell + no pins → text line only; no <video>", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile
        showId={SHOW_ID}
        eventDetails={{ opening_reel: "MAYBE" }}
        hasVideo={false}
      />,
    );
    const r = render(html);
    expect(r.containsVideo).toBe(false);
    expect(r.videoSrc).toBeNull();
    expect(html).toContain("MAYBE");
    expect(html).toContain('data-testid="opening-reel"');
    expect(html).toContain('data-testid="opening-reel-tile"');
  });

  test("AC-7.25 drift case (URL substring + no pins) → URL-stripped text only", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile
        showId={SHOW_ID}
        eventDetails={{
          opening_reel: "YES - https://drive.google.com/file/d/abc123/view",
        }}
        hasVideo={false}
      />,
    );
    const r = render(html);
    expect(r.containsVideo).toBe(false);
    expect(r.videoSrc).toBeNull();
    expect(html).toContain("YES");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("drive.google.com");
  });

  test("sentinel cell ('TBD') AND no pins → tile returns null (whole-tile-missing)", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile
        showId={SHOW_ID}
        eventDetails={{ opening_reel: "TBD" }}
        hasVideo={false}
      />,
    );
    expect(html).toBe("");
  });

  test("absent opening_reel AND no pins → tile returns null", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile showId={SHOW_ID} eventDetails={{}} hasVideo={false} />,
    );
    expect(html).toBe("");
  });

  test("video src interpolates the bare show id with no `r=` or query suffix", () => {
    const html = renderToStaticMarkup(
      <OpeningReelTile
        showId={SHOW_ID}
        eventDetails={{ opening_reel: "https://drive.google.com/file/d/abc/view" }}
        hasVideo={true}
      />,
    );
    expect(html).toContain(`src="/api/asset/reel/${SHOW_ID}"`);
    expect(html).not.toMatch(/api\/asset\/reel\/r=/);
    expect(html).not.toMatch(/api\/asset\/reel\/\?/);
  });
});
