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

describe("M9 C5 / M5-D4 — SignInButton carries the official Google G mark", () => {
  test("renders the Google G icon left of the canonical button text", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const icon = getByTestId("sign-in-google-g");
    // The icon is INSIDE the button (left of the text).
    expect(button.contains(icon)).toBe(true);
    // The src points at the canonical asset path. The file at this
    // path MUST be Google's unmodified web_light_rd_na.svg per the
    // commit body. Test asserts the path; the asset audit (a
    // future spec amendment) would verify byte-equivalence with
    // Google's bundle.
    expect(icon.getAttribute("src")).toBe("/brand/google-g.svg");
    expect(icon.getAttribute("alt")).toBe("");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    // Button text is verbatim per Google's brand guide allowed
    // phrasings ("Sign in with Google", "Sign up with Google",
    // "Continue with Google").
    expect(button.textContent).toContain("Sign in with Google");
  });

  test("icon precedes the text in DOM order (G appears left)", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const icon = getByTestId("sign-in-google-g");
    // First child of the button is the icon; the rest is text.
    expect(button.firstElementChild).toBe(icon);
  });

  test("button uses Google 'Light' theme (R1 BLOCKER fix — white background, dark text, gray border)", () => {
    const { getByTestId } = render(<SignInButton validatedNext="/show/abc" />);
    const button = getByTestId("sign-in-with-google");
    const className = button.getAttribute("class") ?? "";
    // White surface per Google's prescribed Light theme.
    expect(className).toContain("bg-white");
    // Dark text (#1f1f1f) per Google's spec — pinned as arbitrary
    // hex rather than a project token so brand-compliance survives
    // theme-token drift.
    expect(className).toContain("text-[#1f1f1f]");
    // 1px #747775 border per Google's spec.
    expect(className).toContain("border-[#747775]");
    // The previous FXAV-accent variant used `bg-accent`. Negative
    // assertion: that class MUST NOT appear on the button (it would
    // re-introduce the brand violation R1 BLOCKER flagged).
    expect(className).not.toContain("bg-accent");
    expect(className).not.toContain("text-accent-text");
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

  test("public/brand/google-g.svg exists and is an SVG (Google's web_light_rd_na variant)", async () => {
    const { readFileSync, statSync } = await import("node:fs");
    const path = "public/brand/google-g.svg";
    const stat = statSync(path);
    expect(stat.isFile()).toBe(true);
    const content = readFileSync(path, "utf8");
    expect(content).toMatch(/^<svg\b/);
    // The Google bundle's web_light_rd_na is 40x40 with viewBox 0 0 40 40.
    expect(content).toContain('viewBox="0 0 40 40"');
    // The canonical Google brand colors appear (Blue/Green/Yellow/Red).
    expect(content).toContain("#4285F4"); // Google Blue
    expect(content).toContain("#34A853"); // Google Green
    expect(content).toContain("#FBBC04"); // Google Yellow
    expect(content).toContain("#E94235"); // Google Red
  });
});
