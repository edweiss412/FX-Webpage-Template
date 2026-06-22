// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(join(process.cwd(), "app/help/whats-different/page.mdx"), "utf8");

describe("/help/whats-different (E.4)", () => {
  it("renders without throwing through the real MDX pipeline (r3 per E-r2 finding 2)", async () => {
    // Production wires MDX components via `useMDXComponents` in
    // `mdx-components.tsx` (Next.js auto-injection). In the Vitest pipeline
    // we replicate that wiring by wrapping the page in `MDXProvider` with
    // the same component map. Without this, Callout / Step / TipFromSheets
    // compile to `undefined` and `render()` throws (verified during E.1 fix
    // pass 2026-05-20). The wrapper is load-bearing for the Vitest pipeline;
    // it is not needed in production where Next.js auto-injects the same map.
    const Mod = await import("@/app/help/whats-different/page.mdx");
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

  it("renders the canonical H1 into the DOM (catches MDX compiler/component-map regression where source has H1 but rendered output drops it)", async () => {
    const Mod = await import("@/app/help/whats-different/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("What's different from Sheets");
  });

  it("has the canonical H1", () => {
    expect(src).toMatch(/^# What's different from Sheets\b/m);
  });

  it("uses Step components for new habits", () => {
    expect(src).toMatch(/<Step n=/);
  });

  it("includes three Step items for the three new habits", () => {
    const matches = src.match(/<Step n=/g) ?? [];
    expect(matches.length).toBe(3);
  });

  it("has the three required H2 sections", () => {
    expect(src).toMatch(/^## Same as before\b/m);
    expect(src).toMatch(/^## Now automated\b/m);
    expect(src).toMatch(/^## New habits\b/m);
  });

  it("links to review-queues for the deepest new habit", () => {
    expect(src).toContain("/help/admin/review-queues");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
});
