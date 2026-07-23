// tests/components/admin/review/warningsPanelStatusMount.test.tsx
// @vitest-environment jsdom
/** Announcer spec 2026-07-22 §2/§5.1: the published Parse-warnings panel's
 *  live region is an always-mounted sr-only `role="log"` container whose
 *  children are an APPEND-ONLY message log written only by `announce()` —
 *  never derived from props. MutationObserver assertions pin the mutation
 *  SEQUENCE (every mutation flushed inside act(), not just final state), so a
 *  derived-text, clear-then-write, or slot-clearing implementation cannot
 *  pass (spec R1 F8, R2 F6a, R2 F3). */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContext, useEffect } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { WarningAnnounceContext } from "@/components/admin/review/warningAnnounceContext";

afterEach(cleanup);

/** Captures the provider's announce so tests drive it like a producer would. */
let announceFn: ((message: string) => void) | null = null;
function AnnounceProbe() {
  const { announce } = useContext(WarningAnnounceContext);
  // Effect-scoped capture: assigning during render trips the react-hooks
  // no-reassign rule; RTL's render flushes effects, so announceFn is set
  // before any test drives it.
  useEffect(() => {
    announceFn = announce;
  });
  return null;
}

beforeEach(() => {
  announceFn = null;
});

type Counts = { listed?: number; here?: number; elsewhere?: number };

/** Published-surface props with the real extras renderer REPLACED by the
 *  probe (the probe must sit inside the provider subtree exactly where the
 *  ignore controls mount; producer wiring through the REAL extras is pinned
 *  separately in the Task 5 integration tests). */
function probeProps(counts: Counts) {
  const props = buildPublishedSurfaceProps(counts);
  return { ...props, renderSectionExtras: () => <AnnounceProbe /> };
}

function region(): HTMLElement {
  return screen.getByTestId("warnings-panel-status");
}

function children(): HTMLElement[] {
  return Array.from(region().children) as HTMLElement[];
}

type Recorded = { added: Node[]; removed: Node[]; charData: number };
function observeRegion(): { records: Recorded; drain: () => Recorded; disconnect: () => void } {
  const records: Recorded = { added: [], removed: [], charData: 0 };
  const ingest = (rs: MutationRecord[]) => {
    for (const r of rs) {
      records.added.push(...Array.from(r.addedNodes));
      records.removed.push(...Array.from(r.removedNodes));
      if (r.type === "characterData") records.charData += 1;
    }
  };
  const mo = new MutationObserver(ingest);
  mo.observe(region(), { childList: true, subtree: true, characterData: true });
  // Observer callbacks are microtask-async; takeRecords() drains pending
  // mutations SYNCHRONOUSLY so assertions immediately after act() see them.
  const drain = () => {
    ingest(mo.takeRecords());
    return records;
  };
  return {
    records,
    drain,
    disconnect: () => {
      ingest(mo.takeRecords());
      mo.disconnect();
    },
  };
}

describe("warnings panel announce log (announcer spec §2)", () => {
  it("mounts an empty role=log container; props changes never mutate it", () => {
    const { rerender } = render(<ShowReviewSurface {...probeProps({ listed: 0, here: 2 })} />);
    expect(region().getAttribute("role")).toBe("log");
    expect(children()).toHaveLength(0);
    const { records, disconnect } = observeRegion();
    // Background refresh shape: counts change, no announce (spec §2.2).
    rerender(<ShowReviewSurface {...probeProps({ listed: 3, here: 0, elsewhere: 1 })} />);
    disconnect();
    expect(children()).toHaveLength(0);
    expect(records.added).toHaveLength(0);
    expect(records.removed).toHaveLength(0);
    expect(records.charData).toBe(0);
  });

  it("announce appends one child in one commit; later prop changes leave it alone", () => {
    const { rerender } = render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    const { drain, disconnect } = observeRegion();
    act(() => announceFn!("Warning ignored."));
    expect(children()).toHaveLength(1);
    expect(children()[0]!.textContent).toBe("Warning ignored.");
    // Exactly one element addition (its text node arrives inside it), zero
    // removals, zero characterData mutations of existing nodes.
    const afterAnnounce = drain();
    expect(afterAnnounce.added.filter((n) => n.nodeType === 1)).toHaveLength(1);
    expect(afterAnnounce.removed).toHaveLength(0);
    expect(afterAnnounce.charData).toBe(0);
    rerender(<ShowReviewSurface {...probeProps({ listed: 0, elsewhere: 2 })} />);
    disconnect();
    expect(children()).toHaveLength(1);
    expect(children()[0]!.textContent).toBe("Warning ignored.");
  });

  it("identical successive messages are two ADDITIONS, never a text mutation (R1 F2, R2 F3)", () => {
    render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    const { records, disconnect } = observeRegion();
    act(() => announceFn!("Warning ignored."));
    act(() => announceFn!("Warning ignored."));
    disconnect();
    const texts = children().map((c) => c.textContent);
    expect(texts).toEqual(["Warning ignored.", "Warning ignored."]);
    expect(records.added.filter((n) => n.nodeType === 1)).toHaveLength(2);
    expect(records.removed).toHaveLength(0);
    expect(records.charData).toBe(0);
  });

  it("two announces batched into ONE act both land (R2 F1)", () => {
    render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    act(() => {
      announceFn!("2 ignored.");
      announceFn!("Warning restored.");
    });
    expect(children().map((c) => c.textContent)).toEqual(["2 ignored.", "Warning restored."]);
  });

  it("compound: announce + changed props in one act is a single addition (R2 F8)", () => {
    const { rerender } = render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    const { records, disconnect } = observeRegion();
    act(() => {
      announceFn!("Warning ignored.");
      rerender(<ShowReviewSurface {...probeProps({ listed: 0, here: 1 })} />);
    });
    disconnect();
    expect(children()).toHaveLength(1);
    expect(records.added.filter((n) => n.nodeType === 1)).toHaveLength(1);
    expect(records.removed).toHaveLength(0);
    expect(records.charData).toBe(0);
  });

  it("entry ids are DISTINCT even for identical texts; earlier nodes never remount (R3 F5, R4 F4)", () => {
    render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    act(() => announceFn!("Warning ignored."));
    act(() => announceFn!("Warning ignored."));
    const firstTwo = children();
    act(() => announceFn!("2 ignored."));
    act(() => announceFn!("Warning restored."));
    const all = children();
    expect(all.map((c) => c.textContent)).toEqual([
      "Warning ignored.",
      "Warning ignored.",
      "2 ignored.",
      "Warning restored.",
    ]);
    const ids = all.map((c) => c.getAttribute("data-announce-id"));
    expect(new Set(ids).size).toBe(4);
    // Reference stability: the first two nodes are the SAME DOM nodes.
    expect(all[0]).toBe(firstTwo[0]);
    expect(all[1]).toBe(firstTwo[1]);
  });

  it("cap 50: the 51st announce removes only the oldest, in the same commit (R4 F1)", () => {
    render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    // Each announce in its OWN act so all predecessors are committed DOM
    // nodes before the 51st (plan-review R1 F3).
    for (let i = 0; i < 50; i++) act(() => announceFn!(`msg ${i}`));
    expect(children()).toHaveLength(50);
    const firstId = children()[0]!.getAttribute("data-announce-id");
    const { records, disconnect } = observeRegion();
    act(() => announceFn!("msg 50"));
    disconnect();
    expect(children()).toHaveLength(50);
    expect(children().some((c) => c.getAttribute("data-announce-id") === firstId)).toBe(false);
    expect(children()[49]!.textContent).toBe("msg 50");
    expect(records.added.filter((n) => n.nodeType === 1)).toHaveLength(1);
    expect(records.removed.filter((n) => n.nodeType === 1)).toHaveLength(1);
  });

  it("empty and whitespace-only announces are no-ops (spec §2.5)", () => {
    render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    const { records, disconnect } = observeRegion();
    act(() => announceFn!(""));
    act(() => announceFn!("   "));
    disconnect();
    expect(children()).toHaveLength(0);
    expect(records.added).toHaveLength(0);
  });

  it("unmount discards the log; a remount starts empty (R4 F6b)", () => {
    const view = render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    act(() => announceFn!("Warning ignored."));
    expect(children()).toHaveLength(1);
    view.unmount();
    render(<ShowReviewSurface {...probeProps({ listed: 1 })} />);
    expect(children()).toHaveLength(0);
  });

  it("gate OFF (staged shape): container absent", () => {
    const staged = buildPublishedSurfaceProps({ listed: 1, gateOff: true });
    render(<ShowReviewSurface {...staged} />);
    expect(screen.queryByTestId("warnings-panel-status")).toBeNull();
  });

  describe("REAL composed-tree wiring (spec R4 F5): provider covers every producer", () => {
    const fetchMock = vi.fn<typeof fetch>();
    beforeEach(() => {
      fetchMock.mockReset();
      global.fetch = fetchMock as unknown as typeof fetch;
    });
    const ok = (status: string) =>
      ({ ok: true, json: async () => ({ status }) }) as unknown as Response;

    it("a real here-card Ignore announces through the real extras", async () => {
      fetchMock.mockResolvedValue(ok("ignored"));
      // REAL buildSectionWarningExtras renderer (the helper wires it), NOT the
      // probe override — a provider placed so a producer sits outside it fails
      // here and nowhere else.
      render(<ShowReviewSurface {...buildPublishedSurfaceProps({ here: 1 })} />);
      fireEvent.click(screen.getAllByRole("button", { name: /^ignore$/i })[0]!);
      await waitFor(() => expect(children()).toHaveLength(1));
      expect(children()[0]!.textContent).toBe("Warning ignored.");
    });

    it("a real bulk confirm announces the derived count clause", async () => {
      fetchMock.mockResolvedValue(ok("ignored"));
      const HERE = 2;
      render(<ShowReviewSurface {...buildPublishedSurfaceProps({ here: HERE })} />);
      const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
      fireEvent.click(chip);
      fireEvent.click(chip);
      await waitFor(() => expect(children()).toHaveLength(1));
      expect(children()[0]!.textContent).toBe(`${HERE} ignored.`);
    });
  });
});
