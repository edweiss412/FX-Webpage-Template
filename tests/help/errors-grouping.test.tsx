// @vitest-environment jsdom
/**
 * tests/help/errors-grouping.test.tsx (audit Chunk 4 — errors-index restructure)
 *
 * The /help/errors page was regrouped from a flat alphabetical list into
 * code-family sections with a jump-list + a single CTA. These guards pin the
 * load-bearing invariants of that restructure:
 *  - COMPLETENESS: every renderable catalog code lands in exactly one named
 *    family (the "Other" fallback stays empty), so growth can't silently drop a
 *    code into an unlabeled bucket.
 *  - ANCHOR PRESERVATION: the page still renders a `#<code>` heading for EVERY
 *    renderable code — these are the `helpHref` deep-link targets that
 *    messageFor(code) "learn more" links resolve to.
 *  - SINGLE CTA: the "tell Eric" mailto renders exactly once (was once-per-entry).
 *  - GROUPING: one h2 per non-empty family + a jump-list entry pointing at it.
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import ErrorsPage from "@/app/help/errors/page";
import { familyFor, codePrefix } from "@/app/help/errors/_families";

function renderableCodes(): string[] {
  return (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
    .filter(
      (e) =>
        e.severity !== "info" &&
        e.dougFacing !== null &&
        e.title !== null &&
        e.longExplanation !== null &&
        e.helpHref !== null,
    )
    .map((e) => e.code);
}

describe("Chunk 4 — /help/errors family grouping", () => {
  it("every renderable code lands in a named family (Other fallback is empty)", () => {
    const codes = renderableCodes();
    expect(codes.length).toBeGreaterThan(50); // sanity: the catalog is large
    const orphans = codes.filter((c) => familyFor(c).id === "other-errors");
    expect(orphans, `unmapped code prefixes: ${orphans.map(codePrefix).join(", ")}`).toEqual([]);
  });

  it("renders a #<code> heading for EVERY renderable code (helpHref deep-link targets)", () => {
    const { container } = render(<ErrorsPage />);
    const codes = renderableCodes();
    for (const code of codes) {
      expect(container.querySelector(`[id="${code}"]`), `missing anchor #${code}`).not.toBeNull();
    }
    // No extra/dropped per-code headings: h3[id] count === renderable count.
    expect(container.querySelectorAll("h3[id]").length).toBe(codes.length);
  });

  it("renders the 'tell Eric' CTA exactly once (not once per entry)", () => {
    const { container } = render(<ErrorsPage />);
    const mailtos = container.querySelectorAll('a[href^="mailto:edweiss412@gmail.com"]');
    expect(mailtos.length).toBe(1);
    expect(mailtos[0]?.textContent).toContain("tell Eric");
  });

  it("renders an h2 group heading + a jump-list link for each non-empty family", () => {
    const { container } = render(<ErrorsPage />);
    const h2s = Array.from(container.querySelectorAll("h2[id]"));
    const h2Ids = h2s.map((h) => h.id);
    expect(h2Ids.length).toBeGreaterThanOrEqual(5);
    // The outline no longer skips: an h2 layer exists between h1 and the h3s (DEFERRED.md D7).
    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    // Direct-child styling contract: each family h2 must be a SIBLING of h1 (a
    // direct child of the layout's `.help-prose` div), NOT wrapped in a
    // <section>/<div>. A wrapper breaks `.help-prose > h2` and renders the family
    // headings at body size — the exact bug fixed by using Fragments. (Codex r2.)
    for (const h2 of h2s) {
      expect(
        h2.parentElement,
        `family h2 #${h2.id} must be a sibling of h1 (no section/div wrapper)`,
      ).toBe(h1?.parentElement);
    }
    // Every group heading has a matching jump-list link, and vice versa.
    const jump = container.querySelector('nav[aria-label="Jump to an error category"]');
    expect(jump).not.toBeNull();
    const jumpTargets = Array.from(jump!.querySelectorAll('a[href^="#"]')).map((a) =>
      (a.getAttribute("href") ?? "").slice(1),
    );
    expect(jumpTargets.sort()).toEqual([...h2Ids].sort());
  });
});
