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

/**
 * The two grid minima are DERIVED values, and until this test they were derived
 * in the spec and unpinned in the suite. Spec §3.2 chooses 22rem over 20rem
 * because 20rem switches at a 656px container where the measure falls to 27.6ch,
 * under AC-1's 28ch floor, and over 22.25rem because at exactly 356px the track
 * equals the minimum and any subpixel difference flips the grid to one column.
 * Spec §3.2a derives 18rem from the jump list's own measured 286px items, with a
 * 32px `gap-x-8` rather than the cards' 16px, so it cannot borrow the cards'.
 *
 * The browser suite now samples the switch each rejected value would use, which
 * catches the behaviour. This catches the VALUE, so a change to it is a visible
 * edit to a pinned constant rather than a silent drift the sampling has to
 * rediscover.
 */
describe("every layout constant the spec names is pinned to its authored site", () => {
  const errorsSrc = readFileSync(join(process.cwd(), "app/help/errors/page.tsx"), "utf8");
  const globalsSrc = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  /**
   * THE CLASS, not the three instances. Every one of these numbers is chosen by a
   * derivation in the spec, and a guard that accepts a FAMILY of values cannot
   * enforce a criterion that names ONE of them. Diff review found that shape twice
   * from opposite directions: the 22rem minimum had no pin at all, and the measure
   * had a pin that matched any integer `ch`, so `70ch` to `69ch` passed every guard
   * in the repo while moving every capped child on every help page.
   *
   * A staged violation that DELETES a value cannot catch a value that is merely
   * WRONG, which is why removal-only violations left both gaps open.
   */
  it("the measure is exactly 70ch, the value AC-2 preserves", () => {
    // AC-2: every /help/* page other than the tour and the errors page renders at
    // the same widths as before. The cap moved; it was not resized.
    expect(globalsSrc).toMatch(/--help-measure:\s*70ch\b/);
    expect(globalsSrc, "the registered length must stay a <length>").toMatch(
      /@property --help-measure\s*\{[^}]*syntax:\s*"<length>"/,
    );
  });

  it("the tour card grids carry the 22rem minimum, guarded by min(...,100%)", () => {
    const track = "grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]";
    const count = src.split(track).length - 1;
    premise("the tour authors auto-fit card grids", count, 0);
    // All three groups, not just the two that existed before the Settings card.
    expect(count, `tour grids carrying ${track}`).toBe(3);
    expect(src, "no bare rem minimum may survive: it overflows a 288px container").not.toMatch(
      /minmax\(\s*2[0-9](?:\.[0-9]+)?rem\s*,/,
    );
  });

  it("the errors jump list carries its own 18rem minimum, not the cards'", () => {
    expect(errorsSrc).toContain("grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))]");
    // Two 22rem tracks need 736px and this nav is NOT bled, so it stays under the
    // 704.4px cap: borrowing the cards' minimum would have made it permanently
    // single-column with AC-1b and AC-1c both still passing.
    expect(errorsSrc, "the jump list must not borrow the cards' minimum").not.toContain(
      "minmax(min(22rem,100%),1fr)",
    );
  });
});

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
