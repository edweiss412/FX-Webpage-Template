// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(
  join(process.cwd(), "app/help/tour/page.mdx"),
  "utf8",
);

const ADMIN_REFERENCE_URLS = [
  "/help/admin/dashboard",
  "/help/admin/review-queues",
  "/help/admin/parse-warnings",
  "/help/admin/per-show-panel",
  "/help/admin/preview-as-crew",
  "/help/admin/sharing-links",
  "/help/admin/onboarding-wizard",
];

describe("/help/tour (E.12)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing)", async () => {
    const Mod = await import("@/app/help/tour/page.mdx");
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
    const Mod = await import("@/app/help/tour/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Tour");
  });

  it("has the canonical H1 in source", () => {
    expect(src).toMatch(/^# Tour\b/m);
  });

  it.each(ADMIN_REFERENCE_URLS)(
    "links to %s (tour-link consistency per §6 watchpoint #7 — every surface section points to its detail page)",
    (url) => {
      expect(src).toContain(url);
    },
  );

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body prose (AGENTS.md §1.5)", () => {
    const prose = src.replace(/<RefAnchor\s+id=["'][^"']+["'][^>]*>/g, "");
    expect(prose).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });
});
