// @vitest-environment jsdom
/**
 * tests/components/tiles/OpeningReelVideo.test.tsx — Codex R25 P1.
 *
 * Pins AC-7.21 placeholder-on-drift contract: when `/api/asset/reel/<show>`
 * returns 410 (or any media-loading error), the inline <video> swaps to
 * a placeholder element. Without this swap, browsers render their
 * native broken-media chrome instead of the AC-7.21 placeholder.
 *
 * Initial-render contract:
 *   - <video> renders with the correct asset src and onError handler.
 *   - The placeholder element is NOT present.
 *
 * Error-swap contract:
 *   - Firing a media `error` event on the <video> swaps to the
 *     placeholder element and removes the <video> from the DOM.
 *   - Placeholder carries the `opening-reel-placeholder` testid so
 *     downstream tests can assert the swap occurred.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { OpeningReelVideo } from "@/components/tiles/OpeningReelVideo";

const SHOW_ID = "77777777-7777-4777-8777-777777777777";

afterEach(() => cleanup());

describe("OpeningReelVideo — drift placeholder", () => {
  test("initial render: <video> with /api/asset/reel/<show> src + onError handler", () => {
    render(<OpeningReelVideo showId={SHOW_ID} />);
    const video = screen.getByTestId("opening-reel-video") as HTMLVideoElement;
    expect(video.tagName).toBe("VIDEO");
    expect(video.getAttribute("src")).toBe(`/api/asset/reel/${SHOW_ID}`);
    // Placeholder MUST NOT render before the media error fires.
    expect(screen.queryByTestId("opening-reel-placeholder")).toBeNull();
  });

  test("Codex R25 P1: media error swaps <video> → placeholder element", () => {
    render(<OpeningReelVideo showId={SHOW_ID} />);
    const video = screen.getByTestId("opening-reel-video");
    fireEvent.error(video);
    // Placeholder MUST render after the error.
    const placeholder = screen.getByTestId("opening-reel-placeholder");
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toMatch(/can.+t be played/i);
    // <video> MUST be removed (so browser doesn't show broken chrome).
    expect(screen.queryByTestId("opening-reel-video")).toBeNull();
  });

  test("placeholder preserves 16:9 aspect ratio so tile layout doesn't reflow", () => {
    render(<OpeningReelVideo showId={SHOW_ID} />);
    const video = screen.getByTestId("opening-reel-video");
    fireEvent.error(video);
    const placeholder = screen.getByTestId("opening-reel-placeholder");
    // The aspect-video utility class is the contract that keeps the
    // tile's vertical rhythm stable across error transitions.
    expect(placeholder.className).toContain("aspect-video");
  });
});
