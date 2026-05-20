// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(join(process.cwd(), "app/help/page.mdx"), "utf8");

describe("/help landing page (E.1)", () => {
  it("renders without throwing through the real MDX pipeline (r3 per E-r2 finding 2)", async () => {
    // Production wires MDX components via `useMDXComponents` in
    // `mdx-components.tsx` (Next.js auto-injection). In the Vitest pipeline
    // we replicate that wiring by wrapping the page in `MDXProvider` with
    // the same component map. Without this, Callout / Step / etc. compile
    // to `undefined` and `render()` throws — that throw is a Vitest-pipeline
    // artifact, not a real runtime error.
    const Mod = await import("@/app/help/page");
    const Page = Mod.default;
    const components = useMDXComponents({});
    expect(() =>
      render(
        <MDXProvider components={components}>
          <Page />
        </MDXProvider>,
      ),
    ).not.toThrow();
  });

  it("has the canonical H1", () => {
    expect(src).toMatch(/^# What this app does for you\b/m);
  });

  it("contains at least one Callout", () => {
    expect(src).toMatch(/<Callout/);
  });

  it("links to all three adoption-track pages", () => {
    expect(src).toContain("/help/getting-started");
    expect(src).toContain("/help/daily-rhythm");
    expect(src).toContain("/help/whats-different");
  });

  it("links to the tour", () => {
    expect(src).toContain("/help/tour");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
});
