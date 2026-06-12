// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MESSAGE_CATALOG,
  type MessageCatalogEntry,
} from "@/lib/messages/catalog";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.cwd(), "app/help/errors/page.tsx"),
  "utf8",
);

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
const renderableCodes = (
  Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[]
).filter(
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

  it("iterates entries server-side (no useEffect / useState client patterns)", () => {
    expect(src).not.toContain("useState");
    expect(src).not.toContain('"use client"');
  });

  it("trailing CTA is 'tell Eric' (NOT 'Learn more') per AC-11.11 r10", () => {
    expect(src).toMatch(/tell Eric/i);
    expect(src).not.toMatch(/Learn more/i); // the destination page never self-links
  });

  // M12.12 follow-up — the tell-Eric CTA's "→" is decorative; aria-hiding it
  // keeps it out of the accessible name. Failure mode caught: someone inlines
  // the arrow back into the accessible name. Visible copy (AC-11.11 r10
  // "tell Eric →") is unchanged.
  it("tell-Eric CTA arrow is aria-hidden — accessible name drops →, visible text keeps it", async () => {
    const Page = (await import("@/app/help/errors/page")).default;
    const { getAllByRole } = render(<Page />);
    const ctas = getAllByRole("link", { name: "If this keeps happening, tell Eric" });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) expect(cta.textContent).toContain("→");
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
