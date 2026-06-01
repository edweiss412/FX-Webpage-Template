// @vitest-environment jsdom
//
// M12.2 Phase B1 Task 8.3 — DevToolsRow (DEV_PANEL_PRESENT === true case).
//
// Concrete failure mode pinned: keying off runtime
// `process.env.ADMIN_DEV_PANEL_ENABLED` instead of the build-time
// `DEV_PANEL_PRESENT` constant. Keying off runtime env would render a link to
// an absent /admin/dev 404 route in a prod build whose runtime env flips true
// (the M3 build-vs-runtime class). This file mocks the GENERATED constant to
// true; the row renders ONLY because the build-time constant is true. The
// false (default) case lives in DevToolsRow.absent.test.tsx, which deliberately
// does not mock — proving the committed-false constant renders nothing.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/__generated__/devPanelPresent", () => ({
  DEV_PANEL_PRESENT: true,
}));

import { DevToolsRow } from "@/components/admin/settings/DevToolsRow";

afterEach(cleanup);

describe("DevToolsRow — DEV_PANEL_PRESENT true", () => {
  it("renders 'Developer tools' row + [Open] → /admin/dev", () => {
    render(<DevToolsRow />);

    expect(screen.getByTestId("admin-dev-tools-row")).toBeInTheDocument();
    expect(screen.getByText("Developer tools")).toBeInTheDocument();
    const open = screen.getByTestId("admin-dev-tools-open");
    expect(open).toHaveAttribute("href", "/admin/dev");
    expect(open).toHaveTextContent("Open");
  });
});
