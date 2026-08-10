// @vitest-environment jsdom
/**
 * STRUCTURAL DEFENSE for the vector that took four whole-diff rounds.
 *
 * R1 found an outcome that could land on a closed menu. R2 found four more
 * dismissal paths that could do it. R3 found that a background refresh does not
 * remount the row, so eligibility could change under an open menu. R4 found
 * that the eligibility gate added in R3 could itself swallow an outcome. Same
 * vector, four rounds, one instance repaired each time — which the project's
 * own rule says is the point to stop patching instances and close the class.
 *
 * The class: EVERY region this component can render is either
 *   - ACTIONABLE (it can start or complete a mutation), and must therefore be
 *     gated on the row still accepting that mutation; or
 *   - a READ-ONLY OUTCOME (it only tells the admin what happened), and must
 *     therefore render unconditionally, because gating it is how an answer goes
 *     silent.
 * A region that is actionable AND ungated lets a user act on a row that has
 * moved on. A region that is read-only AND gated is the silent-outcome defect.
 *
 * This suite drives the component into each region and asserts which side of
 * that line it falls on, so a NEW region cannot join the component without a
 * deliberate answer to the question.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
const archiveActionMock = vi.fn();
vi.mock("@/app/admin/show/[slug]/_actions/archive", () => ({
  archiveShowAction: (slug: string) => archiveActionMock(slug),
}));

import { ShowRowActions } from "@/components/admin/ShowRowActions";
import type { ActiveShowRow } from "@/lib/admin/showDisplay";
import { premise, premiseHolds } from "../../../_shared/premise";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  refreshMock.mockReset();
  fetchMock.mockReset();
  archiveActionMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

const q = (t: string) => document.body.querySelector<HTMLElement>(`[data-testid="${t}"]`);
const SLUG = "cls";
const base: ActiveShowRow = {
  id: "id-cls",
  slug: SLUG,
  title: "Class Show",
  showDateStart: null,
  showDateEnd: null,
  crewCount: 1,
  crew: [{ id: "c1", name: "Ada Lovelace" }],
  lastSyncedAt: null,
  lastSyncStatus: null,
  lastCheckedAt: null,
  published: true,
  isLive: false,
  finalizeOwned: false,
  archivedAt: null,
};
const jsonResponse = (payload: unknown) => ({ json: async () => payload }) as unknown as Response;
const HELD = {
  ok: true,
  result: { outcome: "shrink_held", detail: "crew drops", heldModifiedTime: "t" },
};

/** Every region, how to reach it, and which side of the line it is on. */
const REGIONS = [
  {
    name: "Preview-as submenu",
    testid: `row-action-preview-menu-${SLUG}`,
    kind: "actionable",
    reach: async () => {
      fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
      fireEvent.click(q(`row-action-preview-${SLUG}`)!);
    },
  },
  {
    name: "Archive confirm",
    testid: `row-actions-archive-confirm-${SLUG}`,
    kind: "actionable",
    reach: async () => {
      fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
      fireEvent.click(q(`row-action-archive-${SLUG}`)!);
    },
  },
  {
    name: "shrink_held decision",
    testid: `row-actions-shrink-confirm-${SLUG}`,
    kind: "actionable",
    reach: async () => {
      fetchMock.mockResolvedValue(jsonResponse(HELD));
      fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
      fireEvent.click(q(`row-action-resync-${SLUG}`)!);
      await waitFor(() => expect(q(`row-actions-shrink-confirm-${SLUG}`)).not.toBeNull());
    },
  },
  {
    name: "sync failure alert",
    testid: `row-actions-error-${SLUG}`,
    kind: "outcome",
    reach: async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "SHOW_BUSY_RETRY" }));
      fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
      fireEvent.click(q(`row-action-resync-${SLUG}`)!);
      await waitFor(() => expect(q(`row-actions-error-${SLUG}`)).not.toBeNull());
    },
  },
  {
    name: "archive failure alert",
    testid: `row-actions-archive-error-${SLUG}`,
    kind: "outcome",
    reach: async () => {
      archiveActionMock.mockResolvedValue({ ok: false, code: "infra_error" });
      fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
      fireEvent.click(q(`row-action-archive-${SLUG}`)!);
      fireEvent.click(q(`row-actions-archive-go-${SLUG}`)!);
      await waitFor(() => expect(q(`row-actions-archive-error-${SLUG}`)).not.toBeNull());
    },
  },
] as const;

describe("every renderable region is actionable-and-gated or read-only-and-visible", () => {
  test.each(REGIONS.map((r) => [r.name, r]))("%s", async (_name, region) => {
    const { rerender } = render(<ShowRowActions row={base} />);
    await region.reach();
    // PREMISE (own inputs): the region must be on screen before the flip, or
    // its state afterwards says nothing about gating.
    premiseHolds(`${region.name} is reachable on an eligible row`, q(region.testid) !== null);

    // The row stops accepting mutations, on the SAME component instance — what
    // a background `router.refresh()` actually does.
    rerender(<ShowRowActions row={{ ...base, published: false }} />);

    if (region.kind === "actionable") {
      expect(
        q(region.testid),
        `${region.name} can start or complete a mutation, so an ineligible row must not render it`,
      ).toBeNull();
    } else {
      expect(
        q(region.testid),
        `${region.name} only reports what happened; hiding it is how an answer goes silent`,
      ).not.toBeNull();
    }
  });

  test("an answer that arrives AFTER eligibility is lost is signalled, never dropped", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        release = res;
      }),
    );
    const { rerender } = render(<ShowRowActions row={base} />);
    fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
    fireEvent.click(q(`row-action-resync-${SLUG}`)!);
    await waitFor(() => expect(q(`row-action-resync-${SLUG}`)!.textContent).toContain("Syncing…"));

    // Eligibility is lost while the request is still in flight.
    rerender(<ShowRowActions row={{ ...base, published: false }} />);
    release(jsonResponse({ ok: false, error: "SHOW_BUSY_RETRY" }));

    // The gated error region cannot render on this row — so something else has
    // to speak, or the admin fired an action and heard nothing.
    const stale = await waitFor(() => {
      const el = q(`row-actions-stale-${SLUG}`);
      expect(el).not.toBeNull();
      return el!;
    });
    expect(stale.getAttribute("role")).toBe("alert");
    premise("the stale notice actually says something", (stale.textContent ?? "").length, 0);
    expect(q(`row-actions-error-${SLUG}`)).toBeNull();
  });

  test("a mutation CLOSES every actionable surface, including one that navigates away", async () => {
    // `busy` disables the parent items, but the submenu is its own surface and
    // its links NAVIGATE. A submenu left open beside a running request lets the
    // admin leave the page that is about to receive the answer — the same
    // silent-outcome defect reached by a different door.
    let release: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((res) => {
        release = res;
      }),
    );
    render(<ShowRowActions row={base} />);
    fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
    fireEvent.click(q(`row-action-preview-${SLUG}`)!);
    premiseHolds(
      "the submenu is open before the mutation starts",
      q(`row-action-preview-menu-${SLUG}`) !== null,
    );

    fireEvent.click(q(`row-action-resync-${SLUG}`)!);
    await waitFor(() => expect(q(`row-action-resync-${SLUG}`)!.textContent).toContain("Syncing…"));
    expect(q(`row-action-preview-menu-${SLUG}`)).toBeNull();

    release(jsonResponse({ ok: false, error: "SHOW_BUSY_RETRY" }));
    await waitFor(() => expect(q(`row-actions-error-${SLUG}`)).not.toBeNull());
  });

  test("losing eligibility under an open menu does not strand focus on a removed node", async () => {
    const { rerender } = render(<ShowRowActions row={base} />);
    fireEvent.click(q(`row-actions-trigger-${SLUG}`)!);
    fireEvent.click(q(`row-action-archive-${SLUG}`)!);
    const cancel = q(`row-actions-archive-cancel-${SLUG}`)!;
    premiseHolds("focus starts inside the confirm", document.activeElement === cancel);

    rerender(<ShowRowActions row={{ ...base, published: false }} />);

    // The menu stays open (a refresh does not remount it), so the open-focus
    // effect never re-runs — focus has to be moved deliberately.
    expect(document.activeElement).not.toBe(document.body);
    expect(q(`row-actions-menu-${SLUG}`)!.contains(document.activeElement)).toBe(true);
  });
});
