// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/flaggedZeroCountHeader.test.tsx
 * (unread-callout-dedup spec §3, Fix B — integration)
 *
 * The published modal must NOT render a self-contradicting "(0)" count chip on a
 * section header that is also flagged "Needs a look". Drives the REAL
 * `PublishedReviewModal`; the pure decision function is covered separately in
 * tests/components/admin/wizard/sectionCountChip.test.ts.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  installModalDomStubs,
  renderPublishedModal,
  type RawRow,
} from "./__fixtures__/publishedModalHarness";

// One UNKNOWN_FIELD warn routed to the `rooms` section (KIND_TO_SECTION), which
// has ZERO room rows in the fixture → the rooms header is flagged with count 0.
const RAW_ROWS: readonly RawRow[] = [{ block: "rooms", key: "Suite 5", value: "King bed" }];

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PublishedReviewModal - flagged zero-count header (section 3 Fix B)", () => {
  it("a counted section flagged with zero body rows shows the flag, never a contradicting count chip", () => {
    renderPublishedModal(RAW_ROWS);
    const rooms = document.querySelector<HTMLElement>('[data-testid$="review-section-rooms"]')!;
    expect(rooms).not.toBeNull();

    // Independently establish the section is a COUNTED section with ZERO body
    // rows: no room-row headers render (so the true count is 0, not drifted to 1).
    expect(rooms.querySelector('[data-testid*="-room-0-header"]')).toBeNull();

    // It IS flagged (otherwise the suppression would be vacuous)...
    expect(within(rooms).getByText("Needs a look")).toBeInTheDocument();

    // ...and NO parenthetical count chip of ANY digit renders in the header —
    // catches both the contradicting "(0)" and a fixture drift to "(1)".
    const countChip = within(rooms).queryByText(/^\(\d+\)$/);
    expect(countChip).toBeNull();
  });
});
