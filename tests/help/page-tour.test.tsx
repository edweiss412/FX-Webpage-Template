// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MDXProvider } from "@mdx-js/react";
import { useMDXComponents } from "@/mdx-components";
import { NAV } from "@/app/help/_nav";
import { premise } from "@/tests/_shared/premise";

const src = readFileSync(join(process.cwd(), "app/help/tour/page.mdx"), "utf8");

/**
 * Card coverage is DERIVED from NAV, never restated here.
 *
 * The hardcoded seven-URL list this replaces enumerated exactly the cards that
 * existed, so it passed while /help/admin/settings — an admin-surface entry in
 * NAV since before this test was written — had no card at all. That is the same
 * defect tests/e2e/help-pages.spec.ts already repaired for its own route table.
 *
 * Read from the RENDERED DOM and only from anchors the page MARKS as cards.
 * Rendered-not-source defeats a regex matching a route named in a sentence;
 * data-tour-card defeats a prose LINK, which renders as an anchor too. Ordinary
 * Markdown links to admin routes appear on 8 of the 14 help pages, so that is
 * routine authoring rather than a hypothetical.
 */
const adminSurfaceSlugs = () =>
  NAV.filter((e) => e.group === "admin-surface")
    .map((e) => e.slug)
    .sort();

/**
 * Card hrefs from a rendered container. The MDX render itself stays INLINE in each
 * test, matching the two tests above and below: `useMDXComponents` is a hook by
 * name, so calling it from a named non-component helper trips
 * react-hooks/rules-of-hooks. Extracting only the query keeps the duplication to
 * the three lines this file already repeats.
 */
const cardHrefs = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLAnchorElement>("a[data-tour-card][href]")).map(
    (a) => a.getAttribute("href") ?? "",
  );

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

  it("cards cover every admin-surface slug in NAV, both directions, by name", async () => {
    const Mod = await import("@/app/help/tour/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const carded = cardHrefs(container);

    // Without this the equality passes vacuously the moment data-tour-card is
    // absent or renamed — the defect this guard replaced, inverted.
    premise("the tour page renders at least one card anchor", carded.length, 0);

    expect([...new Set(carded)].sort()).toEqual(adminSurfaceSlugs());
  });

  it("renders as many cards as there are admin surfaces", async () => {
    const Mod = await import("@/app/help/tour/page.mdx");
    const Page = Mod.default;
    const components = useMDXComponents({});
    const { container } = render(
      <MDXProvider components={components}>
        <Page />
      </MDXProvider>,
    );
    const carded = cardHrefs(container);
    premise("the tour page renders at least one card anchor", carded.length, 0);

    // NOT a restatement of the set equality above: sets deduplicate, so eight
    // correct hrefs plus a duplicated ninth card satisfy that assertion while
    // the page's "every admin screen" claim is false. Cardinality is the only
    // thing that catches it.
    expect(carded.length).toBe(adminSurfaceSlugs().length);
  });

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

  it("does NOT describe review queues as row-level (E.6 reality: queues hold sheets / staged-versions, not rows — Codex R2 finding)", () => {
    expect(src).not.toMatch(/the row lands in a review queue/i);
  });

  it("does NOT promise clear/ignore controls for parse warnings (E.7 reality: warnings clear on next clean sync, no UI control — Codex R2 finding)", () => {
    expect(src).not.toMatch(/clear a warning|ignore (?:it|a warning)/i);
  });
});
