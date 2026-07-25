// @vitest-environment jsdom
//
// M12.2 Phase B1 Task 8.3 + developer-tier Task 14 — DevToolsRow
// (DEV_PANEL_PRESENT === true case).
//
// Concrete failure mode pinned: keying off runtime
// `process.env.ADMIN_DEV_PANEL_ENABLED` instead of the build-time
// `DEV_PANEL_PRESENT` constant. Keying off runtime env would render a link to
// an absent /admin/dev 404 route in a prod build whose runtime env flips true
// (the M3 build-vs-runtime class). This file mocks the GENERATED constant to
// true; the row renders ONLY because the build-time constant is true AND the
// runtime `isDeveloper` gate is true.
//
// developer-tier Task 14 (spec §6 row 4): the row is now ALSO gated on the
// runtime `isDeveloper` prop — a normal admin (isDeveloper=false) never sees the
// Developer-tools entrypoint even in a dev-flag build. The false (build-time)
// case lives in DevToolsRow.absent.test.tsx.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/__generated__/devPanelPresent", () => ({
  DEV_PANEL_PRESENT: true,
}));

import { DevToolsRow } from "@/components/admin/settings/DevToolsRow";

afterEach(cleanup);

describe("DevToolsRow — DEV_PANEL_PRESENT true", () => {
  it("isDeveloper={true} → renders 'Developer tools' row + [Open] → /admin/dev", () => {
    render(<DevToolsRow isDeveloper={true} />);

    expect(screen.getByTestId("admin-dev-tools-row")).toBeInTheDocument();
    expect(screen.getByText("Developer tools")).toBeInTheDocument();
    const open = screen.getByTestId("admin-dev-tools-open");
    expect(open).toHaveAttribute("href", "/admin/dev");
    // Accessible name, not raw textContent: the visible label is `Open` but the
    // link carries a hidden qualifier (spec 2026-07-24 §4). Asserted in full by
    // T1/T1b/T2 below.
    expect(open).toHaveAccessibleName("Open developer tools");
  });

  it("renders the Attention gallery link beside Open — href, parity, wrapper, order", () => {
    render(<DevToolsRow isDeveloper={true} />);

    const open = screen.getByTestId("admin-dev-tools-open");
    const gallery = screen.getByTestId("admin-dev-tools-gallery");

    // href + label (spec §3; wrong href = 404 class)
    expect(gallery).toHaveAttribute("href", "/admin/dev/attention-gallery");
    expect(gallery).toHaveTextContent(/^Attention gallery$/);
    expect(open).toHaveAttribute("href", "/admin/dev");

    // T1 (2026-07-24 spec §9) - accessible-name boundary. Exact match, never a
    // substring: the failure this catches is `Opendeveloper tools`, produced
    // when the separating space lives INSIDE the sr-only span, because the
    // accessible-name algorithm trims each text node before concatenating.
    // Measured against dom-accessibility-api 0.5.16, spec §3.1(c).
    expect(open).toHaveAccessibleName("Open developer tools");

    // T1b - the name comes from a HIDDEN TEXT NODE, not from aria-label. T1
    // alone is satisfied by <Link aria-label="Open developer tools">Open</Link>,
    // which has the right name, no hidden qualifier, and violates spec §4's
    // no-aria-label decision - so the ratified mechanism could regress while
    // T1 and T2 both stayed green.
    expect(open).not.toHaveAttribute("aria-label");
    expect(open).not.toHaveAttribute("aria-labelledby");
    const hidden = Array.from(open.querySelectorAll(".sr-only"));
    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.textContent).toBe("developer tools");

    // T2 - the visible label is still exactly `Open` (spec §1.1: the rejected
    // option was a visible rename). Clone-and-strip, because the live node's
    // textContent now legitimately contains the hidden suffix, so T1 alone
    // would pass a visibly-renamed button.
    const visibleOnly = open.cloneNode(true) as HTMLElement;
    visibleOnly.querySelectorAll(".sr-only").forEach((n) => n.remove());
    expect(visibleOnly.textContent?.trim()).toBe("Open");

    // styling parity (spec §4, R1 F1): identical class attribute, and the
    // shared string keeps the tap-target + focus-ring classes so parity
    // cannot be satisfied by both links losing them together.
    expect(gallery.getAttribute("class")).toBe(open.getAttribute("class"));

    // T4 (2026-07-24 spec §9) - token membership, never substring. A
    // `classString.toContain("duration-fast")` passes on `duration-fastest`,
    // `focus-visible:ring-2` passes on `focus-visible:ring-20`, and
    // `transition-colors` passes on `transition-colors-extra`, so the required
    // utility could be absent entirely while the assertion stayed green.
    const openTokens = Array.from(open.classList);
    for (const token of [
      "min-h-tap-min",
      "focus-visible:ring-2",
      "transition-colors",
      "duration-fast",
    ]) {
      expect(openTokens).toContain(token);
    }

    // T5 - no BARE focus ring offset. DESIGN.md:40 requires any offset to carry
    // a container-matched `ring-offset-<backdrop>`; a bare numeric offset is a
    // dark-mode white-gap defect. Both halves are scoped to the focus-visible
    // variant: an unscoped predicate would pass on an unrelated
    // `hover:ring-offset-bg` and fail on a lone `hover:ring-offset-2`. Vacuous
    // today by construction - this is the pin that keeps the app-wide bare-offset
    // sweep (BL-FOCUS-RING-CONTRAST) from being pre-empted here by a future
    // "parity" pass copying the DriveConnectionPanel siblings.
    const focusOffsets = openTokens.filter((t) => t.startsWith("focus-visible:ring-offset-"));
    const hasNumericFocusOffset = focusOffsets.some((t) => /-\d+$/.test(t));
    const hasNamedFocusOffset = focusOffsets.some((t) => /-[a-z][a-z-]*$/.test(t));
    expect(hasNumericFocusOffset && !hasNamedFocusOffset).toBe(false);

    // action-group wrapper (spec §4, R2 F1): same direct parent, NOT the row
    // root (root already has flex-wrap — a root-level check would be vacuous),
    // with all four wrapper classes.
    const parent = open.parentElement;
    expect(parent).not.toBeNull();
    expect(gallery.parentElement).toBe(parent);
    expect(parent).not.toBe(screen.getByTestId("admin-dev-tools-row"));
    const tokens = Array.from(parent!.classList);
    for (const cls of ["flex", "flex-wrap", "items-center", "gap-2"]) {
      expect(tokens).toContain(cls);
    }

    // DOM order (spec §4, R1 F2): Open precedes Attention gallery.
    expect(open.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("row description names the gallery, sourced from the description element", () => {
    render(<DevToolsRow isDeveloper={true} />);

    // T6 (2026-07-24 spec §9) - scoped to the row's HEADING BLOCK, not the row
    // root: the root also contains a link whose visible text is "Attention
    // gallery", so an unscoped getByText(/attention gallery/i) would pass even
    // with the OLD description still in place.
    const row = screen.getByTestId("admin-dev-tools-row");
    const heading = screen.getByText("Developer tools");
    const description = heading.parentElement?.querySelector("p");
    expect(description).not.toBeNull();
    expect(description!.textContent).toBe(
      "Fixture tester, parse diagnostics, and the attention gallery. Hidden from normal use.",
    );

    // Anti-tautology self-check: the element asserted above is not the sibling
    // link that independently renders the same phrase.
    expect(row.querySelector('[data-testid="admin-dev-tools-gallery"]')).not.toBe(description);
  });

  it("isDeveloper={false} → renders nothing (normal admin never sees dev tools)", () => {
    const { container } = render(<DevToolsRow isDeveloper={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("admin-dev-tools-row")).toBeNull();
    expect(screen.queryByTestId("admin-dev-tools-gallery")).toBeNull();
  });

  it("isDeveloper absent → treated as false (safe default) → renders nothing", () => {
    const { container } = render(<DevToolsRow />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("admin-dev-tools-row")).toBeNull();
  });
});

describe("attention gallery destination heading", () => {
  it("h1 text equals the link label that reaches it", () => {
    // T7 (2026-07-24 spec §9) - a SOURCE scan, because the page is an async
    // Server Component whose first line is requireDeveloper(): rendering it in
    // jsdom would mean mocking the whole auth chain to assert one string.
    //
    // Whitespace-tolerant, and it compares the CAPTURED heading text rather
    // than searching the file, so prettier reflowing the heading cannot break
    // it and a comment mentioning the phrase cannot satisfy it. No blanket
    // not.toContain("Attention modal gallery"): asserting the captured text
    // already excludes the old value from the only place that matters, and the
    // blanket form would fail on a comment narrating the rename.
    //
    // Path resolves from process.cwd(), the repo root under vitest - the same
    // convention tests/cross-cutting/vitest-projects-partition.test.ts uses.
    // (import.meta.url is NOT a file: URL under vitest's transform, so
    // readFileSync(new URL(..., import.meta.url)) throws "The URL must be of
    // scheme file" - a false red that hides the real assertion.) Residual
    // limitation: takes the FIRST <h1>; the page has exactly one.
    const pageSource = readFileSync(
      join(process.cwd(), "app/admin/dev/attention-gallery/page.tsx"),
      "utf8",
    );
    const h1 = /<h1[^>]*>\s*([^<]*?)\s*<\/h1>/.exec(pageSource);
    expect(h1, "no <h1> found in the gallery page source").not.toBeNull();
    expect(h1![1]).toBe("Attention gallery");
  });
});
