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
    expect(open).toHaveTextContent("Open");
  });

  it("renders the Attention gallery link beside Open — href, parity, wrapper, order", () => {
    render(<DevToolsRow isDeveloper={true} />);

    const open = screen.getByTestId("admin-dev-tools-open");
    const gallery = screen.getByTestId("admin-dev-tools-gallery");

    // href + label (spec §3; wrong href = 404 class)
    expect(gallery).toHaveAttribute("href", "/admin/dev/attention-gallery");
    expect(gallery).toHaveTextContent(/^Attention gallery$/);
    expect(open).toHaveAttribute("href", "/admin/dev");
    expect(open).toHaveTextContent(/^Open$/);

    // styling parity (spec §4, R1 F1): identical class attribute, and the
    // shared string keeps the tap-target + focus-ring classes so parity
    // cannot be satisfied by both links losing them together.
    expect(gallery.getAttribute("class")).toBe(open.getAttribute("class"));
    expect(open.getAttribute("class")).toContain("min-h-tap-min");
    expect(open.getAttribute("class")).toContain("focus-visible:ring-2");

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
    expect(
      open.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
