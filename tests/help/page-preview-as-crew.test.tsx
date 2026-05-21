// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(
  join(process.cwd(), "app/help/admin/preview-as-crew/page.mdx"),
  "utf8",
);

describe("/help/admin/preview-as-crew (E.9)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing for RefAnchor / Callout / etc.)", async () => {
    const Mod = await import("@/app/help/admin/preview-as-crew/page.mdx");
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
    const Mod = await import("@/app/help/admin/preview-as-crew/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Preview as crew");
  });

  it("has the canonical H1 in source", () => {
    expect(src).toMatch(/^# Preview as crew\b/m);
  });

  it('has a plain <h2 id="impersonation-banner"> (kebab non-catalog anchor → plain <h2>, NOT <RefAnchor>; D.5 regex restricts RefAnchor to catalog-code shape)', () => {
    expect(src).toMatch(/<h2[^>]*id=["']impersonation-banner["']/);
    expect(src).not.toMatch(
      /<RefAnchor[^>]*id=["']impersonation-banner["']/,
    );
  });

  it.skip('renders a <Screenshot name="preview-as-crew-banner"> placeholder (Phase F populates WebP)', () => {
    expect(src).toMatch(/<Screenshot\s+name=["']preview-as-crew-banner["']/);
  });
  // skip rationale: <ScreenshotPlaceholder> revert per DEFERRED.md M11-E-D5; re-enable when Phase F.10/F.11 lands.

  it.skip("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });
  // skip rationale: <ScreenshotPlaceholder> revert per DEFERRED.md M11-E-D5; re-enable when Phase F.10/F.11 lands.

  it('has an H2 "What to verify" section (verification checklist)', () => {
    expect(src).toMatch(/^## What to verify\b/m);
  });

  it('has an H2 "Why some fields are hidden" section (role-based filtering reassurance)', () => {
    expect(src).toMatch(/^## Why some fields are hidden\b/m);
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body prose (AGENTS.md §1.5 — RefAnchor id attribute is structural and exempt)", () => {
    const prose = src.replace(/<RefAnchor\s+id=["'][^"']+["'][^>]*>/g, "");
    expect(prose).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });
});
