// @vitest-environment jsdom
/**
 * tests/components/SignInBrand.test.tsx (M9 C5 / M5-D4)
 *
 * Pins the sign-in brand contracts:
 *   - SignInButton: official Google G icon (sourced from Google's
 *     signin-assets.zip bundle, unmodified) appears left of the
 *     canonical "Sign in with Google" text.
 *   - Sign-in page: FXAV wordmark above the headline (sourced from
 *     fxav.net white-letter variant); aria-hidden because the
 *     headline carries the accessible name.
 *
 * The actual brand asset files live at:
 *   public/brand/fxav-wordmark.png  (sourced from fxav.net Wix CDN)
 *   public/brand/google-g.svg       (verbatim copy of
 *                                    web_light_rd_na.svg from Google's
 *                                    pre-approved signin-assets.zip)
 *
 * The sign-in page is an async Server Component that redirects + reads
 * Promise<searchParams>, so we assert the JSX shape via source-grep
 * (matching the C8 a11y-test pattern) rather than rendering through
 * jsdom. The SignInButton is a simple client component and renders
 * directly.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { SignInButton } from "@/app/auth/sign-in/SignInButton";

afterEach(() => cleanup());

describe("M9 C5 / M5-D4 — SignInButton renders Google's pre-approved Light-theme button asset", () => {
  test("button image src points at the canonical Google button SVG at native dimensions", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const buttonImage = getByTestId("sign-in-google-button-image");
    expect(button.contains(buttonImage)).toBe(true);
    expect(buttonImage.getAttribute("src")).toBe("/brand/google-signin-button.svg");
    // Native bundle size: 175×40 (Web → svg → light → web_light_rd_SI).
    // We do NOT resize — Google's brand guidelines require unmodified
    // rendering at native size.
    expect(buttonImage.getAttribute("width")).toBe("175");
    expect(buttonImage.getAttribute("height")).toBe("40");
  });

  test("button has accessible name 'Sign in with Google' (alt + aria-label)", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const buttonImage = getByTestId("sign-in-google-button-image");
    // The wrapping <button> carries an explicit aria-label so the
    // accessible name does not depend on the SVG's inline text.
    expect(button.getAttribute("aria-label")).toBe("Sign in with Google");
    // The image's alt is the same canonical phrasing — when AT
    // exposes the image directly, the result is identical.
    expect(buttonImage.getAttribute("alt")).toBe("Sign in with Google");
  });

  test("button does NOT add custom Google-button surface classes (R2 fix — SVG is the visual)", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const className = button.getAttribute("class") ?? "";
    // The SVG asset provides the white surface, dark text, gray
    // border, AND the G at its native bundle size. The wrapping
    // <button> must NOT re-render any of those (would double-apply).
    expect(className).not.toContain("bg-white");
    expect(className).not.toContain("text-[#1f1f1f]");
    expect(className).not.toContain("border-[#747775]");
    // Also negative-assert the original FXAV-accent variant (R0
    // BLOCKER from R1 review) — must NOT regress.
    expect(className).not.toContain("bg-accent");
    expect(className).not.toContain("text-accent-text");
  });

  test("focus ring uses Google Interaction Blue #1a73e8 for ≥3:1 contrast on white (R1 HIGH-2 fix)", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const className = button.getAttribute("class") ?? "";
    // Google's Interaction Blue (#1a73e8) — pinned hex, not project
    // token. Project default focus-ring (orange ~1.6:1) fails 3:1
    // WCAG focus-indicator contrast on white surfaces.
    expect(className).toContain("focus-visible:ring-[#1a73e8]");
  });
});

describe("M9 C5 / M5-D4 — Sign-in page sources the FXAV wordmark above the headline", () => {
  test("source: <img src='/brand/fxav-wordmark.png'> appears inside the <header> before the <h1>", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/auth/sign-in/page.tsx", "utf8");
    // The wordmark image element with the data-testid hook.
    expect(source).toContain('data-testid="sign-in-fxav-wordmark"');
    expect(source).toContain('src="/brand/fxav-wordmark.png"');
    // The wordmark MUST appear BEFORE the <h1> inside the source —
    // structural order = DOM order for static JSX.
    const wordmarkIdx = source.indexOf('data-testid="sign-in-fxav-wordmark"');
    const headlineIdx = source.indexOf('data-testid="sign-in-headline"');
    expect(wordmarkIdx).toBeGreaterThan(0);
    expect(headlineIdx).toBeGreaterThan(0);
    expect(wordmarkIdx).toBeLessThan(headlineIdx);
  });

  test("source: FXAV wordmark carries the brand alt text (R1 HIGH-1 fix — exposed to AT)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/auth/sign-in/page.tsx", "utf8");
    // Match the wordmark <img> opening tag and assert the accessible
    // brand label. The wordmark is the page's PRIMARY brand identity
    // (the headline only names the action "Sign in with Google");
    // it MUST be exposed to AT users via meaningful alt text.
    const wordmarkMatch = source.match(
      /<img[\s\S]*?data-testid="sign-in-fxav-wordmark"[\s\S]*?\/>/,
    );
    expect(wordmarkMatch).not.toBeNull();
    const tag = wordmarkMatch?.[0] ?? "";
    expect(tag).toContain('alt="FX Audio Visual"');
    // aria-hidden was REMOVED in R1 — the wordmark must not be
    // hidden from screen readers.
    expect(tag).not.toContain('aria-hidden="true"');
  });

  test("source: FXAV wordmark uses aspect-preserving sizing (R1 HIGH-2 fix)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/auth/sign-in/page.tsx", "utf8");
    const wordmarkMatch = source.match(
      /<img[\s\S]*?data-testid="sign-in-fxav-wordmark"[\s\S]*?\/>/,
    );
    expect(wordmarkMatch).not.toBeNull();
    const tag = wordmarkMatch?.[0] ?? "";
    // h-auto preserves the source PNG's 1554×1661 aspect ratio; the
    // prior size-24 class forced 96×96 square and distorted the
    // wordmark (R1 finding).
    expect(tag).toContain("h-auto");
    expect(tag).toContain("w-24");
    expect(tag).not.toMatch(/\bsize-24\b/);
  });
});

describe("M9 C5 / M5-D4 — Brand assets exist on disk", () => {
  test("public/brand/fxav-wordmark.png exists and is a PNG", async () => {
    const { readFileSync, statSync } = await import("node:fs");
    const path = "public/brand/fxav-wordmark.png";
    const stat = statSync(path);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(1024); // sanity: not an empty file
    // First 8 bytes are the PNG magic number.
    const head = readFileSync(path).subarray(0, 8);
    expect(head[0]).toBe(0x89);
    expect(head.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  test("public/brand/google-signin-button.svg exists and is the Google web_light_rd_SI variant", async () => {
    const { readFileSync, statSync } = await import("node:fs");
    const path = "public/brand/google-signin-button.svg";
    const stat = statSync(path);
    expect(stat.isFile()).toBe(true);
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/^<svg\b/);
    // Google bundle's web_light_rd_SI native size is 175×40.
    expect(content).toContain('width="175"');
    expect(content).toContain('height="40"');
    expect(content).toContain('viewBox="0 0 175 40"');
    // The canonical Google brand colors appear (Blue/Green/Yellow/Red).
    expect(content).toContain("#4285F4"); // Google Blue
    expect(content).toContain("#34A853"); // Google Green
    expect(content).toContain("#FBBC04"); // Google Yellow
    expect(content).toContain("#E94235"); // Google Red
  });
});
