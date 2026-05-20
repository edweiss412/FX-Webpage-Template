// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const src = readFileSync(
  join(process.cwd(), "app/help/admin/parse-warnings/page.mdx"),
  "utf8",
);

// r2 fix: catalog helpHref is `/help/errors#CODE` for ALL Doug-facing
// entries (per E-r1 finding 2). The parse-warnings page renders per-code
// <RefAnchor> sections for thematic reference, but the SOURCE OF TRUTH for
// which codes have a parse-warnings detail section is the catalog filtered
// by code-name pattern (WARN_ or PARSE_ prefix per the M9 parse-pipeline
// naming convention) AND Doug-facing.
const PARSE_CODE_PATTERN = /^(WARN_|PARSE_)/;
const warningCodes = Object.values(MESSAGE_CATALOG).filter(
  (e) =>
    e.severity !== "info" &&
    e.dougFacing !== null &&
    PARSE_CODE_PATTERN.test(e.code),
);

describe("/help/admin/parse-warnings (E.7)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing for RefAnchor / Callout / etc.)", async () => {
    const Mod = await import("@/app/help/admin/parse-warnings/page.mdx");
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
    const Mod = await import("@/app/help/admin/parse-warnings/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Parse warnings");
  });

  it("has the canonical H1 in source", () => {
    expect(src).toMatch(/^# Parse warnings\b/m);
  });

  it("filtered warningCodes set is non-empty (otherwise the per-code coverage loop below is a no-op)", () => {
    expect(warningCodes.length).toBeGreaterThan(0);
  });

  for (const entry of warningCodes) {
    it(`has a <RefAnchor id="${entry.code}"> section`, () => {
      expect(src).toMatch(
        new RegExp(`<RefAnchor\\s+id=["']${entry.code}["']`),
      );
    });
  }

  it("includes a footer <Callout type=\"note\"> directing Doug to Tell Eric", () => {
    expect(src).toMatch(/<Callout\s+type=["']note["']/);
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body prose (AGENTS.md §1.5 — RefAnchor id attribute is structural and exempt)", () => {
    // Strip RefAnchor opening tags (they carry the id attribute legitimately)
    // before scanning for SCREAMING_SNAKE_CASE tokens that would indicate raw
    // codes leaking into copy.
    const prose = src.replace(/<RefAnchor\s+id=["'][^"']+["'][^>]*>/g, "");
    expect(prose).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });
});
