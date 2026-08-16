// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { readFileSync } from "node:fs";
import { predicate as isRenderable } from "@/lib/messages/catalogDocsValidator";
import { premise } from "@/tests/_shared/premise";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/help/errors/page.tsx"), "utf8");

// r3 fix per E-r2 finding 4: page renders entries that ALSO have all three
// M11 fields populated. Use the same predicate the page itself uses (mirrors
// `isRenderable()` in app/help/errors/page.tsx). Without this alignment, the
// test would dereference null `entry.title` or fail for the wrong reason when
// the live biconditional finds a Doug-facing entry without title.
// Cast through MessageCatalogEntry[] mirrors app/help/errors/page.tsx; without
// it, TS narrows each literal to a const-asserted shape that may lack the
// optional `severity` field. The same pattern is established in
// tests/help/page-parse-warnings.test.tsx; the cast keeps this test honest
// against the contract type rather than the per-literal narrowing.
const renderableCodes = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[]).filter(
  (e) =>
    e.severity !== "info" &&
    e.dougFacing !== null &&
    e.title !== null &&
    e.longExplanation !== null &&
    e.helpHref !== null,
);

describe("/help/errors (E.13)", () => {
  it("renders without throwing through the real MDX pipeline (r3 per E-r2 finding 2)", async () => {
    const Mod = await import("@/app/help/errors/page");
    const Page = Mod.default;
    expect(() => render(<Page />)).not.toThrow();
  });

  it("imports MESSAGE_CATALOG", () => {
    expect(src).toMatch(/MESSAGE_CATALOG/);
  });

  // The page itself stays a server component. The CTA is a separate client
  // island (app/help/errors/_components/HelpReportCta.tsx), the same shape
  // RefAnchor already uses.
  it("iterates entries server-side (no useEffect / useState client patterns)", () => {
    expect(src).not.toContain("useState");
    expect(src).not.toContain('"use client"');
  });

  // AC-11.11 r12 (2026-08-09 spec §2.5) retires the r11 mailto stopgap: the
  // trailing CTA is the §13.1 surface-5 report button. Both layers are pinned —
  // the source scan catches a mailto left behind in a comment or an unrendered
  // branch, the rendered assertion catches the button going missing.
  it("trailing CTA mounts HelpReportCta and no mailto survives in the source", () => {
    expect(src).toMatch(/HelpReportCta/);
    expect(src).not.toMatch(/mailto:/i);
    expect(src).not.toMatch(/tell Eric/i);
    expect(src).not.toMatch(/Learn more/i); // the destination page never self-links
  });

  it("renders the report CTA button exactly once", async () => {
    const Page = (await import("@/app/help/errors/page")).default;
    const { getAllByRole, container } = render(<Page />);
    const ctas = getAllByRole("button", { name: "Report a recurring error" });
    expect(ctas.length).toBe(1);
    expect(container.querySelectorAll('a[href^="mailto:"]').length).toBe(0);
  });

  it("rendered output contains every renderable code as an anchor id", async () => {
    const Page = (await import("@/app/help/errors/page")).default;
    const html = renderToStaticMarkup(<Page />);
    // React's renderToStaticMarkup escapes apostrophes/quotes/&/</> in text
    // content (e.g., "didn't" -> "didn&#x27;t"). Decode the small set of
    // entities the renderer emits before comparing against the catalog
    // title (which is the raw author-written string).
    const decoded = html
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    for (const entry of renderableCodes) {
      expect(html).toContain(`id="${entry.code}"`);
      expect(decoded).toContain(entry.title!);
    }
  });
});

/**
 * BL-HELP-REFANCHOR-A11Y-PASS finding 3 — the skip path past the catalog.
 * Spec: docs/superpowers/specs/2026-08-15-help-refanchor-a11y.md §2.3, §3.5.
 *
 * Keyboard-only users otherwise traverse every per-code copy-link before
 * reaching the report button at the page foot. Each case below states the
 * failure mode it catches, and each fails on the pre-arc tree because the page
 * renders no skip anchor and no `id="report"` element.
 */
describe("/help/errors skip path to the report CTA", () => {
  const SKIP_TEXT = "Skip to the report button";
  const CTA_NAME = "Report a recurring error";

  /** Everything a keyboard user would land on, in DOM order. Mirrors the
   *  natively-tabbable set the page actually contributes; the page renders no
   *  form controls, so anchors, buttons and explicit `tabindex` cover it. */
  function tabbables(container: HTMLElement): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  async function renderPage() {
    const Page = (await import("@/app/help/errors/page")).default;
    return render(<Page />);
  }

  function skipLink(container: HTMLElement): HTMLAnchorElement {
    const link = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === SKIP_TEXT,
    );
    if (!link) throw new Error(`no anchor whose visible text is "${SKIP_TEXT}"`);
    return link;
  }

  it("has more than one renderable entry, so the many-stop problem is reachable", () => {
    // Premise, derived from the PAGE'S OWN input: the shared predicate the
    // page imports, not the adjacent `severity !== "info"` subset this file
    // uses elsewhere (which counts 217 where the page renders 219). Below two
    // entries the ordering assertions prove nothing.
    premise(
      "renderable catalog entries make the many-stop problem reachable",
      (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[]).filter(isRenderable).length,
      1,
    );
  });

  it("renders a skip anchor whose VISIBLE TEXT names the report button", async () => {
    // Catches: no anchor at all (the shipped tree); a first-position link
    // pointing somewhere else; and an aria-label-only implementation, which
    // passes an accessible-name query while sighted keyboard users see a
    // blank focused box.
    const { container } = await renderPage();

    const skip = skipLink(container);
    expect(skip.textContent?.trim()).toBe(SKIP_TEXT);
    expect(skip.getAttribute("href")).toBe("#report");
  });

  it("puts the skip anchor FIRST among everything the page contributes", async () => {
    // Catches: a skip link parked after the jump-list nav. The nav contributes
    // eight family anchors, so "before the first copy-link" would pass while
    // stranding keyboard users behind the nav.
    const { container } = await renderPage();

    const all = tabbables(container);
    premise("the page contributes focusable elements to order", all.length, 1);
    expect(all[0]).toBe(skipLink(container));
  });

  it("leaves the copy-links in the tab order", async () => {
    // Catches: an implementation that "solves" the many stops by pulling the
    // controls out of the tab order — the remedy this arc is ratified against
    // (spec §1.1 item 1). A negative tabindex is the cheap way to do it.
    const { container } = await renderPage();

    const copyLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[aria-label]"))
      .filter((a) => a.getAttribute("aria-label")?.startsWith("Copy link to "))
      .slice(0, 1);
    premise("at least one copy-link renders", copyLinks.length, 0);
    expect(copyLinks[0]!.hasAttribute("tabindex")).toBe(false);
  });

  it("targets a focusable wrapper whose FIRST tabbable descendant is the report button", async () => {
    // Catches: a fragment target that cannot receive focus (the
    // Safari/VoiceOver caveat the layout documents on <main id="main">), and a
    // wrapper so wide that the post-jump Tab lands on an entry anchor instead
    // of the button.
    const { container } = await renderPage();

    const target = container.querySelector<HTMLElement>("#report");
    expect(target).not.toBeNull();
    expect(target!.getAttribute("tabindex")).toBe("-1");

    const inside = tabbables(target!);
    premise("the wrapper contains something tabbable", inside.length, 0);
    expect(inside[0]!.tagName).toBe("BUTTON");
    expect(inside[0]!.textContent?.trim()).toBe(CTA_NAME);
  });

  it("keeps the wrapper off the jump-list nav and every catalog heading", async () => {
    // Catches: the over-wide wrapper the assertion above bounds — one spanning
    // nav + entries + Callout satisfies bare containment.
    const { container } = await renderPage();

    const target = container.querySelector<HTMLElement>("#report")!;
    expect(target.querySelector("nav")).toBeNull();
    expect(target.querySelector("h2, h3")).toBeNull();
  });

  it("keeps the skip anchor visually hidden until focused, at the tap floor", async () => {
    // Catches: a permanently sr-only anchor, or a focused one below the 44px
    // tap floor — both pass every identity/ordering/structure assertion while
    // sighted keyboard users lose the visible focus target. Class-list
    // assertion because jsdom computes no layout; same shape as
    // tests/help/skip-link.test.tsx on the layout skip link, plus the
    // tap-floor token that test does not pin.
    const { container } = await renderPage();

    // classList, not a substring check: `sr-only` is a proper substring of
    // `focus:not-sr-only`, so `toContain("sr-only")` passes on an element that
    // carries only the focus variant. Probed — a mutant dropping the base
    // `sr-only` token survived the substring form.
    const tokens = skipLink(container).classList;
    expect(tokens.contains("sr-only")).toBe(true);
    expect(tokens.contains("focus:not-sr-only")).toBe(true);
    expect(tokens.contains("focus:min-h-tap-min")).toBe(true);
  });
});
