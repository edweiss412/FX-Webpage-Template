// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(join(process.cwd(), "app/help/admin/per-show-panel/page.mdx"), "utf8");

describe("/help/admin/per-show-panel (E.8)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing for RefAnchor / Callout / etc.)", async () => {
    const Mod = await import("@/app/help/admin/per-show-panel/page.mdx");
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
    const Mod = await import("@/app/help/admin/per-show-panel/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Per-show panel");
  });

  it("has the canonical H1 in source", () => {
    expect(src).toMatch(/^# Per-show panel\b/m);
  });

  it('has a plain <h2 id="staged-review-card"> (kebab non-catalog anchor → plain <h2>, NOT <RefAnchor>; D.5 regex restricts RefAnchor to catalog-code shape)', () => {
    expect(src).toMatch(/<h2[^>]*id=["']staged-review-card["']/);
    // negative: must NOT use RefAnchor for this id
    expect(src).not.toMatch(/<RefAnchor[^>]*id=["']staged-review-card["']/);
  });

  it('has a plain <h2 id="sync-health"> (kebab non-catalog anchor → plain <h2>, NOT <RefAnchor>)', () => {
    expect(src).toMatch(/<h2[^>]*id=["']sync-health["']/);
    expect(src).not.toMatch(/<RefAnchor[^>]*id=["']sync-health["']/);
  });

  it("links to /help/admin/review-queues#re-stage (staged-review card cross-link)", () => {
    expect(src).toContain("/help/admin/review-queues#re-stage");
  });

  it("links to /help/admin/parse-warnings (Parse warnings sub-section pointer)", () => {
    expect(src).toContain("/help/admin/parse-warnings");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body prose (AGENTS.md §1.5 — RefAnchor id attribute is structural and exempt)", () => {
    const prose = src.replace(/<RefAnchor\s+id=["'][^"']+["'][^>]*>/g, "");
    expect(prose).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });
});
