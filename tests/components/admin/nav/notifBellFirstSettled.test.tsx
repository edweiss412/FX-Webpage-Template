// @vitest-environment jsdom
/**
 * Task 2 of the nav badge arrival announcement (spec §3.2, §3.3, §3.6).
 *
 * NotifBell gains ONE optional prop, `onBellState`, reporting
 * `{settled, announceable}` on every change of that tuple, and derives its own
 * `aria-label` from `bellAccessibleName` instead of spelling the ternary inline.
 *
 * This is a NEW suite rather than an addition to tests/components/notifBell.test.tsx,
 * because that file mocks `useBellBadge` (at :25) and a mocked hook cannot
 * exercise the settle predicate. Here the REAL hook runs, with `fetch` stubbed
 * so only the seam under test moves.
 *
 * Reporting is CONTINUOUS; announcing is once. Those are different latches, and
 * conflating them is how a frozen report goes stale (spec §3.2). The
 * once-per-mount property belongs to the announce effect and is Task 3's.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotifBell } from "@/components/admin/nav/NotifBell";
import { bellAccessibleName } from "@/components/admin/nav/navArrivalAnnounce";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";
import { premiseHolds } from "@/tests/_shared/premise";
import type { BellCountResult } from "@/lib/admin/bellFeed";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({ removeChannel: vi.fn() }),
}));
vi.mock("@/lib/realtime/subscribeToBell", () => ({ subscribeToBell: vi.fn() }));

// The panel is not the subject. It is stubbed to a marker that fires
// `onCountStale` on mount, standing in for the real panel's call after its first
// feed load, which NotifBell wires to the hook's `refetch`.
vi.mock("@/components/admin/BellPanel", () => ({
  BellPanel: ({ onCountStale }: { onCountStale: () => void }) => {
    onCountStale();
    return <div data-testid="bell-panel-stub" />;
  },
}));

const COUNT_ENDPOINT = "/api/admin/alerts/bell/count";
const fetchSpy = vi.fn();

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Report = { settled: boolean; announceable: number | null };

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  // Default: a fetch that never settles, so nothing moves unless a case says so.
  fetchSpy.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NotifBell onBellState reporting", () => {
  it("reports the pending tuple on mount, then the settled count", async () => {
    const seed = deferred<BellCountResult>();
    const reports: Report[] = [];
    render(
      <NotifBell
        countPromise={seed.promise}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    expect(reports).toEqual([{ settled: false, announceable: null }]);

    await act(async () => {
      seed.resolve({ kind: "ok", count: 4 });
      await seed.promise;
    });

    // Premise: the seed actually landed and the badge shows it. Without this a
    // case where nothing ever arrived would pass by never reporting again.
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));
    // Throws on failure; it is not an expect() subject.
    premiseHolds("the seed resolved and the badge shows 4", reports.length > 1);

    expect(reports).toEqual([
      { settled: false, announceable: null },
      { settled: true, announceable: 4 },
    ]);
  });

  it("reports settled with a null value when the read fails", async () => {
    const seed = deferred<BellCountResult>();
    const reports: Report[] = [];
    render(
      <NotifBell
        countPromise={seed.promise}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    await act(async () => {
      seed.resolve({ kind: "infra_error" });
      await seed.promise;
    });

    // The VALUE repeats while `settled` flips. A suite comparing only the
    // announceable half would see no change here and miss the latch entirely,
    // which is why the assertion is on the whole tuple.
    await waitFor(() => expect(reports).toHaveLength(2));
    expect(reports).toEqual([
      { settled: false, announceable: null },
      { settled: true, announceable: null },
    ]);
  });

  it("reports settled once when nothing will ever arrive", () => {
    const reports: Report[] = [];
    render(<NotifBell onBellState={(r: Report) => reports.push(r)} viewerIsDeveloper={false} />);

    // No initialCount and no countPromise: the half is settled from the first
    // render, so there is no unsettled tuple to report.
    expect(reports).toEqual([{ settled: true, announceable: null }]);
  });

  it("reports settled once when the count arrives synchronously", () => {
    const reports: Report[] = [];
    render(
      <NotifBell
        initialCount={{ kind: "ok", count: 2 }}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    expect(reports).toEqual([{ settled: true, announceable: 2 }]);
  });

  it("reports AGAIN when a later refetch moves the count", async () => {
    const seed = deferred<BellCountResult>();
    const reports: Report[] = [];
    const { rerender } = render(
      <NotifBell
        countPromise={seed.promise}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    await act(async () => {
      seed.resolve({ kind: "ok", count: 4 });
      await seed.promise;
    });
    await waitFor(() => expect(reports).toHaveLength(2));

    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 7 })) : new Promise(() => {}),
    );
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <NotifBell
          countPromise={seed.promise}
          onBellState={(r: Report) => reports.push(r)}
          viewerIsDeveloper={false}
        />,
      );
    });

    // A once-only report is the round-1 defect exactly: the parent would hold a
    // frozen pair and announce a count the badge has moved off.
    await waitFor(() => expect(reports).toHaveLength(3));
    expect(reports[2]).toEqual({ settled: true, announceable: 7 });
  });

  it("reports null while degraded, then the count when degraded clears", async () => {
    const seed = deferred<BellCountResult>();
    const reports: Report[] = [];
    const { rerender } = render(
      <NotifBell
        countPromise={seed.promise}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    await act(async () => {
      seed.resolve({ kind: "infra_error" });
      await seed.promise;
    });
    await waitFor(() => expect(reports).toHaveLength(2));

    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 5 })) : new Promise(() => {}),
    );
    mockPathname = "/admin/shows";
    await act(async () => {
      rerender(
        <NotifBell
          countPromise={seed.promise}
          onBellState={(r: Report) => reports.push(r)}
          viewerIsDeveloper={false}
        />,
      );
    });

    // A degraded LATCH would silence this forever.
    await waitFor(() => expect(reports).toHaveLength(3));
    expect(reports[2]).toEqual({ settled: true, announceable: 5 });
  });

  it("reports the FULL sequence across a panel refetch, with no zero step in between", async () => {
    // This is the panel-refetch route, not the demoted-seed one: the seed
    // resolves before the panel opens, so it cannot also demote. The
    // demoted-seed route needs the seed still in flight at the moment of
    // opening, and lives in the integration suite where the distinction is
    // observable.
    //
    // The plan's row is a SEQUENCE: the parent reads the last pair, but a report
    // that skips a state is a report that can go stale. Defect caught: the open
    // gesture zeroing the badge, which shows up here as a {true,null} report
    // between the 4 and the 2.
    const seed = deferred<BellCountResult>();
    const reports: Report[] = [];
    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? Promise.resolve(okResponse({ count: 2 })) : new Promise(() => {}),
    );
    render(
      <NotifBell
        countPromise={seed.promise}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    await act(async () => {
      seed.resolve({ kind: "ok", count: 4 });
      await seed.promise;
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("4"));

    // Opening fires onCountStale={refetch}, which commits 2. The count goes
    // straight from 4 to 2: opening the panel reads no row, so nothing zeroes it.
    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    await waitFor(() => expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("2"));

    expect(reports).toEqual([
      { settled: false, announceable: null },
      { settled: true, announceable: 4 },
      { settled: true, announceable: 2 },
    ]);
  });

  it("a server count prop after the panel opens still shows as-is: no zero, no demotion", async () => {
    // Defect caught: an open gesture that zeroes the badge, or one that leaves
    // later props demoted to fetch triggers. The panel's refetch is held
    // pending (the beforeEach default), so the only way the badge can read 5 is
    // the prop committing.
    const { rerender } = render(
      <NotifBell initialCount={{ kind: "ok", count: 3 }} viewerIsDeveloper={false} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    premiseHolds(
      "the panel's count refetch was issued",
      fetchSpy.mock.calls.some((call) => call[0] === COUNT_ENDPOINT),
    );
    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("3");

    rerender(<NotifBell initialCount={{ kind: "ok", count: 5 }} viewerIsDeveloper={false} />);
    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("5");
  });

  it("opening while pending does not settle the bell; a refetch landing 0 reports the SELECTOR output, never the raw zero", async () => {
    // Defect caught: an open gesture that commits a client-side 0 settles the
    // bell before any server count arrives, so the parent could announce a
    // number nobody read. Opening must leave the pending tuple alone.
    const seed = deferred<BellCountResult>();
    const refetched = deferred<unknown>();
    fetchSpy.mockImplementation((url: string) =>
      url === COUNT_ENDPOINT ? refetched.promise : new Promise(() => {}),
    );
    const reports: Report[] = [];
    render(
      <NotifBell
        countPromise={seed.promise}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    premiseHolds("the panel stub mounted", screen.queryByTestId("bell-panel-stub") !== null);
    expect(reports).toEqual([{ settled: false, announceable: null }]);

    // The server count is 0, and bellAnnounceableCount(0, false) is null.
    // Reporting the raw count here would announce "0 unread notifications".
    await act(async () => {
      refetched.resolve(okResponse({ count: 0 }));
      await refetched.promise;
    });
    await waitFor(() => expect(reports).toHaveLength(2));
    expect(reports[1]).toEqual({ settled: true, announceable: null });
  });
});

describe("NotifBell aria-label is defined on bellAccessibleName", () => {
  it("matches the selector at a count above the display cap", async () => {
    render(<NotifBell initialCount={{ kind: "ok", count: 12 }} viewerIsDeveloper={false} />);
    const bell = screen.getByTestId("admin-notif-bell");
    // Compared by CALLING the selector, not by a literal, so the label and the
    // announced sentence cannot drift apart in either direction.
    expect(bell).toHaveAttribute("aria-label", bellAccessibleName(12, false));
    expect(bell.getAttribute("aria-label")).not.toContain("9+");
  });

  it("matches the selector at zero", () => {
    render(<NotifBell initialCount={{ kind: "ok", count: 0 }} viewerIsDeveloper={false} />);
    expect(screen.getByTestId("admin-notif-bell")).toHaveAttribute(
      "aria-label",
      bellAccessibleName(0, false),
    );
  });

  it("reports null for a RETAINED count under degraded, not the retained number", async () => {
    // The plan's row is {count: 4, degraded: true}: the hook keeps its last-known
    // count and marks degraded. An earlier version rendered only
    // {kind:"infra_error"}, whose retained count is null, so it could not tell
    // "returns null under degraded" from "there was no count anyway". This state
    // is pinned reachable at badgeSeedInterleavings.test.tsx:525-536.
    const reports: Report[] = [];
    const { rerender } = render(
      <NotifBell
        initialCount={{ kind: "ok", count: 4 }}
        onBellState={(r: Report) => reports.push(r)}
        viewerIsDeveloper={false}
      />,
    );
    premiseHolds("the bell committed a real count first", reports.at(-1)?.announceable === 4);

    // An infra_error PROP marks degraded and leaves `count` untouched.
    await act(async () => {
      rerender(
        <NotifBell
          initialCount={{ kind: "infra_error" }}
          onBellState={(r: Report) => reports.push(r)}
          viewerIsDeveloper={false}
        />,
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("admin-notif-bell-degraded")).toBeInTheDocument(),
    );

    // The count is still 4 in the hook; it is simply not DISPLAYED, so it is not
    // announceable. Reporting 4 here would speak a number no control shows.
    expect(reports.at(-1)).toEqual({ settled: true, announceable: null });
  });

  it("keeps the degraded branch's own name, which the selector must NOT own", () => {
    render(<NotifBell initialCount={{ kind: "infra_error" }} viewerIsDeveloper={false} />);
    // spec §3.3 excludes the degraded branch: it renders a different control.
    expect(screen.getByTestId("admin-notif-bell-degraded")).toHaveAttribute(
      "aria-label",
      getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"),
    );
  });

  it("SOURCE: the label is the selector's caller, not a second implementation", () => {
    // The refactor is BEHAVIOUR-PRESERVING: the inline ternary returns exactly
    // what the selector returns, so no behavioural assertion can force it. The
    // property is structural, so it is asserted in the source. Comments are
    // stripped first: this file's own prose names the old literal.
    const path = "components/admin/nav/NotifBell.tsx";
    const src = stripCommentsForFile(readFileSync(join(process.cwd(), path), "utf8"), path);

    // Not merely "the identifier appears somewhere": the whole-diff review
    // showed that a rebuilt label using concatenation could keep an unrelated
    // reference elsewhere and pass. The assertion is on the aria-label
    // EXPRESSION itself.
    expect(src).toContain("bellAccessibleName");
    const labels = [...src.matchAll(/aria-label=\{([^}]*)\}/g)].map((m) => m[1]!.trim());
    premiseHolds("NotifBell renders at least two aria-label expressions", labels.length >= 2);

    const selectorLabels = labels.filter((expr) => expr.includes("bellAccessibleName("));
    expect(
      selectorLabels,
      "exactly one aria-label (the non-degraded branch) must be the selector's caller",
    ).toHaveLength(1);

    // The degraded branch keeps its own Doug-facing name and must NOT be the
    // selector's caller, so the count is not the whole story either way.
    const degradedLabels = labels.filter((expr) => expr.includes("ADMIN_ALERT_COUNT_FAILED"));
    expect(degradedLabels).toHaveLength(1);

    // And no second implementation of the name survives anywhere in the file.
    expect(src).not.toContain("Notifications: ${");
    expect(src).not.toMatch(/"Notifications: "|'Notifications: '/);
  });
});

describe("NotifBell without the prop", () => {
  it("renders and behaves exactly as before (AC-9)", async () => {
    // The four existing call sites pass no onBellState. A required prop, or a
    // report attempted against an absent callback, would break all of them.
    expect(() =>
      render(<NotifBell initialCount={{ kind: "ok", count: 3 }} viewerIsDeveloper={false} />),
    ).not.toThrow();

    expect(screen.getByTestId("admin-notif-badge")).toHaveTextContent("3");
    expect(screen.getByTestId("admin-notif-bell")).toHaveAttribute(
      "aria-label",
      "Notifications: 3 unread",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("admin-notif-bell"));
    });
    expect(screen.getByTestId("bell-panel-stub")).toBeInTheDocument();
  });
});
