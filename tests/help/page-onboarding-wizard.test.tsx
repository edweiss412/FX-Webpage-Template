// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(
  join(process.cwd(), "app/help/admin/onboarding-wizard/page.mdx"),
  "utf8",
);

describe("/help/admin/onboarding-wizard (E.11)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing for Step / Callout / etc.)", async () => {
    const Mod = await import("@/app/help/admin/onboarding-wizard/page.mdx");
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
    const Mod = await import("@/app/help/admin/onboarding-wizard/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Onboarding wizard");
  });

  it("has the canonical H1 in source", () => {
    expect(src).toMatch(/^# Onboarding wizard\b/m);
  });

  it("has the §5.6-matrix step-1 anchor as plain <h2 id='service-account'> (kebab-case is non-catalog; reserve RefAnchor for catalog codes only — D.5 regex)", () => {
    expect(src).toMatch(/id=["']service-account["']/);
  });

  it("has the §5.6-matrix step-2 anchor as plain <h2 id='step-2'> (kebab-case non-catalog)", () => {
    expect(src).toMatch(/id=["']step-2["']/);
  });

  it("has the §5.6-matrix step-3 anchor as plain <h2 id='step-3'> (kebab-case non-catalog)", () => {
    expect(src).toMatch(/id=["']step-3["']/);
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
