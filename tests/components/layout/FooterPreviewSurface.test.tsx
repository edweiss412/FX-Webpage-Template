// @vitest-environment jsdom
/**
 * tests/components/layout/FooterPreviewSurface.test.tsx
 * (M10 §B Task 10.8 / Phase 3 / Cluster I-5 / Codex R5 disposition)
 *
 * Pins the footer report-button override contract. Without the
 * override, an admin scrolling to the page footer on
 * /admin/show/[slug]/preview/[crewId] and tapping the still-visible
 * "Something looks wrong?" affordance would file a crew-surface report
 * with no preview context — the same failure class the R4 banner fix
 * addressed, leaked through the second report entry point on the same
 * surface.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

const SHOW_ID = "00000000-0000-0000-0000-000000000001";
const SLUG = "rpas-central-2026";
const CREW_ID = "00000000-0000-0000-0000-0000000000aa";

const fetchMock = vi.fn();
let uuidCounter = 0;
const uuids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    status: 201,
    ok: true,
    json: async () => ({ ok: true, status: "created" }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  uuidCounter = 0;
  Object.defineProperty(globalThis, "crypto", {
    value: {
      ...globalThis.crypto,
      randomUUID: () => uuids[uuidCounter++] ?? "99999999-9999-4999-8999-999999999999",
    },
    configurable: true,
  });
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Footer report-button override (admin preview surface)", () => {
  test("admin_preview override: report-button is surface=admin, preview-scoped surfaceId, carries crewPreview autocapture", async () => {
    render(
      <Footer
        showId={SHOW_ID}
        showSlug={SLUG}
        reportSurfaceOverride="admin"
        reportSurfaceIdOverride={`admin-preview-footer-${SLUG}-${CREW_ID}`}
        reportAutocapture={{
          crewPreview: {
            crewMemberId: CREW_ID,
            name: "Eric Weiss",
            role: "A1",
          },
        }}
      />,
    );
    const trigger = screen.getByTestId("report-button-trigger");
    expect(trigger.getAttribute("data-surface")).toBe("admin");

    fireEvent.click(trigger);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "A1 sees redacted financials, should not" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      surface?: string;
      crewPreview?: { crewMemberId?: string; name?: string; role?: string };
    };
    expect(body.surface).toBe("admin");
    expect(body.crewPreview).toEqual({
      crewMemberId: CREW_ID,
      name: "Eric Weiss",
      role: "A1",
    });
  });

  test("default (no override) preserves the crew-surface contract", async () => {
    render(<Footer showId={SHOW_ID} showSlug={SLUG} />);
    const trigger = screen.getByTestId("report-button-trigger");
    expect(trigger.getAttribute("data-surface")).toBe("crew");

    fireEvent.click(trigger);
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "stale tile" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await new Promise((r) => setTimeout(r, 10));

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as { surface?: string; crewPreview?: unknown };
    expect(body.surface).toBe("crew");
    expect(body.crewPreview).toBeUndefined();
  });
});
