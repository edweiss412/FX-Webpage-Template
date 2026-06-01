// @vitest-environment jsdom
//
// M12.2 Phase B1 Task 8.3 — DevToolsRow (DEV_PANEL_PRESENT === false case).
//
// No mock: this file imports the REAL generated constant, which is committed
// `false` (the fail-closed default; Task 8.1 pins that committed value). With
// the build-time constant false, DevToolsRow MUST render nothing — the row is
// gated by the artifact-time constant, not runtime env. A component that keyed
// off `process.env.ADMIN_DEV_PANEL_ENABLED` could render the row here if that
// runtime env were set, which is exactly the M3 build-vs-runtime bug this
// gate forbids.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DevToolsRow } from "@/components/admin/settings/DevToolsRow";
import { DEV_PANEL_PRESENT } from "@/lib/admin/__generated__/devPanelPresent";

afterEach(cleanup);

describe("DevToolsRow — DEV_PANEL_PRESENT false (committed default)", () => {
  it("renders nothing (null)", () => {
    // Guard: the real generated constant is the committed fail-closed default.
    expect(DEV_PANEL_PRESENT).toBe(false);

    const { container } = render(<DevToolsRow />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("admin-dev-tools-row")).toBeNull();
  });
});
