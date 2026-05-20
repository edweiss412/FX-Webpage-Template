// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";

const src = readFileSync(
  join(process.cwd(), "app/help/admin/review-queues/page.mdx"),
  "utf8",
);

describe("/help/admin/review-queues (E.6)", () => {
  it("renders without throwing through the real MDX pipeline (E.5 precedent — MDXProvider load-bearing for Screenshot / Callout / etc.)", async () => {
    const Mod = await import("@/app/help/admin/review-queues/page.mdx");
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
    const Mod = await import("@/app/help/admin/review-queues/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const h1 = within(container).getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Review queues");
  });

  it("has the canonical H1", () => {
    expect(src).toMatch(/^# Review queues\b/m);
  });

  it("has plain h2 section anchors matching §5.6 matrix fragments (D.5/r6 — kebab non-catalog anchors are plain h2, not RefAnchor)", () => {
    expect(src).toMatch(/<h2[^>]*id=["']first-seen["']/);
    expect(src).toMatch(/<h2[^>]*id=["']re-stage["']/);
  });

  it("does NOT use RefAnchor for these section anchors (catalog-code-only per D.5)", () => {
    expect(src).not.toMatch(/<RefAnchor\s+id=["']first-seen["']/);
    expect(src).not.toMatch(/<RefAnchor\s+id=["']re-stage["']/);
  });

  it("includes a Phase D warning Callout about Discard (content brief — irreversible-only-in-staged-sense warning)", () => {
    expect(src).toMatch(/<Callout\s+type=["']warning["']/);
  });

  it("includes the side-by-side Screenshot per content brief step 7", () => {
    expect(src).toMatch(
      /<Screenshot\s+name=["']review-queues-side-by-side["']/,
    );
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body copy (AGENTS.md §1.5)", () => {
    // Allow no SCREAMING_SNAKE_CASE multi-word tokens anywhere in the source.
    // Catalog codes like FIRST_SEEN_REVIEW / ONBOARDING_SCAN_REVIEW /
    // STAGED_PARSE_RESTAGED_INLINE / MISSING_REVIEWER_CHOICE / SYNC_INFRA_ERROR
    // must not leak into copy. Kebab-case section ids (first-seen, re-stage)
    // are exempt because they are lowercase.
    expect(src).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });
});
