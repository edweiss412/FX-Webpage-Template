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

  it('has a plain <h2 id="changes-feed"> (kebab non-catalog anchor → plain <h2>, NOT <RefAnchor>; D.5 regex restricts RefAnchor to catalog-code shape)', () => {
    expect(src).toMatch(/<h2[^>]*id=["']changes-feed["']/);
    // negative: must NOT use RefAnchor for this id
    expect(src).not.toMatch(/<RefAnchor[^>]*id=["']changes-feed["']/);
    // the retired "staged-review card on the panel" model must not creep back
    expect(src).not.toMatch(/staged-review card appears at the top/i);
  });

  it('has a plain <h2 id="sync-health"> (kebab non-catalog anchor → plain <h2>, NOT <RefAnchor>)', () => {
    expect(src).toMatch(/<h2[^>]*id=["']sync-health["']/);
    expect(src).not.toMatch(/<RefAnchor[^>]*id=["']sync-health["']/);
  });

  it("links to /help/admin/review-queues#first-seen (the brand-new-sheet review is the inbox, not the panel)", () => {
    expect(src).toContain("/help/admin/review-queues#first-seen");
  });

  it("links to /help/admin/parse-warnings (Sheet warnings sub-section pointer)", () => {
    expect(src).toContain("/help/admin/parse-warnings");
  });

  it("does NOT reference <ScreenshotPlaceholder> (v1 ships real screenshots — Phase H.4 lint enforces)", () => {
    expect(src).not.toContain("<ScreenshotPlaceholder");
  });

  it("does not describe the retired status-strip copy-link (the share hub absorbed it)", () => {
    // The share-hub consolidation removed the strip's standalone copy-link
    // (docs/superpowers/specs/2026-07-20-share-hub-design.md §8). Copy now lives
    // only inside the hub popover, so any "copy-link" on this page is stale.
    expect(src).not.toMatch(/copy-link/i);
  });

  it("names the Share link button in the strip inventory and in the Re-sync placement", () => {
    expect(src).toMatch(/\*\*Status strip\.\*\*[^\n]*\*\*Share link\*\* button/);
    expect(src).toMatch(
      /\*\*Re-sync\*\* button sits in the status strip, between the sync line and the \*\*Share link\*\* button/,
    );
  });

  it("puts archiving in the Share link panel, not the Overview section", () => {
    // The share-hub consolidation moved the archive lifecycle control into the
    // hub popover's Show section (components/admin/showpage/ShareHub.tsx). The
    // dashboard help page already documented the new location; this page still
    // claimed a row in the Overview section, sending Doug to the wrong half of
    // the panel. Caught by the invariant-8 critique gate.
    expect(src).not.toMatch(/archiving is a row in the Overview section/i);
    expect(src).toMatch(/archiving lives in the \*\*Share link\*\* panel, under \*\*Show\*\*/);
  });

  it("names all three lifecycle labels of the share-hub trigger", () => {
    // ShareHub relabels its primary: "Share link" when published, "Share link ·
    // paused" when not, "Show actions" when archived. Naming only the first
    // leaves the button unrecognizable in two of its three states.
    expect(src).toContain("**Share link · paused**");
    expect(src).toContain("**Show actions**");
  });

  it("describes the archived state as recoverable, not as a dead end", () => {
    // The trigger persists when archived and the panel holds Unarchive, which
    // lives nowhere else. Saying an archived show has "no share controls at
    // all" hides the only route back.
    expect(src).not.toMatch(/show no share controls at all/i);
    expect(src).toContain("**Unarchive**");
  });

  it("names the kebab as a button rather than leaving a bare glyph", () => {
    // A screen reader reads a lone ⋮ as "vertical ellipsis" while the control
    // announces "More show actions", so the help text and the control never
    // meet. Every ⋮ in this page must carry a noun.
    for (const match of src.matchAll(/\*\*⋮\*\*(.{0,12})/g)) {
      expect(match[1] ?? "", `bare ⋮ glyph at "${match[0]}"`).toMatch(/^\s*(button|menu)/);
    }
    expect(src).toMatch(/\*\*⋮\*\* button next to it opens the same panel/);
  });

  it("contains no em-dashes (DESIGN.md §9 absolute ban)", () => {
    expect(src).not.toMatch(/—/);
  });

  it("contains no raw catalog error codes in body prose (AGENTS.md §1.5 — RefAnchor id attribute is structural and exempt)", () => {
    const prose = src.replace(/<RefAnchor\s+id=["'][^"']+["'][^>]*>/g, "");
    expect(prose).not.toMatch(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/);
  });
});
