// @vitest-environment jsdom
/**
 * tests/components/crew/search/missLogging.test.tsx (crew show search, Task 18)
 *
 * Searches that find nothing go to Eric's telemetry (spec §7.1): a query of 2
 * or more characters with zero hits is sent 2000 ms after the last keystroke, or
 * at once when search ends with it; each normalized query at most once per page
 * load; never for a query with hits, never with missLogging off; a failed send
 * changes nothing on the page.
 *
 * The 2000 ms window and the request shape are typed here from the spec.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CrewSearchField } from "@/components/crew/search/CrewSearchField";
import { CrewSearchProvider, useCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import { prepareIndex, searchIndex } from "@/lib/search/match";
import { premiseHolds } from "../../../_shared/premise";
import { FIXTURE_INDEX } from "../../../search/_fixtureIndex";

const SLUG = "spring-gala-2026-04-17";
const MISS_URL = `/api/show/${SLUG}/search-miss`;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Probe() {
  const { phase } = useCrewSearch();
  return <output data-testid="phase">{phase}</output>;
}

function renderSearch(missLogging = true) {
  render(
    <CrewSearchProvider
      index={FIXTURE_INDEX}
      slug={SLUG}
      showId="show-1"
      cardReport={null}
      missLogging={missLogging}
    >
      <CrewSearchField />
      <Probe />
    </CrewSearchProvider>,
  );
}

const input = () => screen.getByRole("searchbox", { name: "Search this show" });
function type(query: string) {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value: query } });
}
const hits = (query: string) => searchIndex(prepareIndex(FIXTURE_INDEX), query).total;

function expectOneMiss(query: string) {
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(fetchSpy).toHaveBeenCalledWith(MISS_URL, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

describe("missed-search logging (spec §7.1)", () => {
  it("sends one POST 2000 ms after the last keystroke of a zero-hit query", () => {
    premiseHolds("qzxv finds nothing", hits("qzxv") === 0);
    renderSearch();
    type("qzxv");
    act(() => vi.advanceTimersByTime(1999));
    expect(fetchSpy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expectOneMiss("qzxv");
  });

  it("restarts the wait on every keystroke and sends only the query typing stopped on", () => {
    premiseHolds("qz and qzx find nothing", hits("qz") === 0 && hits("qzx") === 0);
    renderSearch();
    type("qz");
    act(() => vi.advanceTimersByTime(1500));
    type("qzx");
    act(() => vi.advanceTimersByTime(1999));
    expect(fetchSpy).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expectOneMiss("qzx");
  });

  it("sends at once when search ends with a zero-hit query", () => {
    renderSearch();
    type("qzxv");
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectOneMiss("qzxv");
    act(() => vi.advanceTimersByTime(5000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never sends the same normalized query twice in one page load", () => {
    renderSearch();
    type("qzxv");
    act(() => vi.advanceTimersByTime(2000));
    type("QZXV ");
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    type("qzxv");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectOneMiss("qzxv");
  });

  it("never sends a query with hits, or one under 2 characters", () => {
    premiseHolds("wifi finds something", hits("wifi") > 0);
    renderSearch();
    type("wifi");
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    type("q");
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never sends with missLogging off", () => {
    renderSearch(false);
    type("qzxv");
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("swallows a rejected send with no change on the page", async () => {
    // A rejection nobody handles is reported by Node as an unhandledRejection
    // after the microtask checkpoint, so listen for it across a real macrotask.
    // The stub is a plain function: a vi.fn() attaches its own handlers to the
    // promises it returns (to record settled results), which would hide a
    // missing catch.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const sends: unknown[] = [];
    vi.stubGlobal("fetch", (...args: unknown[]) => {
      sends.push(args);
      return Promise.reject(new TypeError("Failed to fetch"));
    });
    try {
      renderSearch();
      type("qzxv");
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(sends).toHaveLength(1);
      expect(unhandled).toEqual([]);
      expect(screen.getByTestId("phase")).toHaveTextContent("nomatch");
      expect(input()).toHaveValue("qzxv");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("swallows a send that throws before it starts", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new TypeError("fetch is not available");
      }),
    );
    renderSearch();
    type("qzxv");
    expect(() => act(() => vi.advanceTimersByTime(2000))).not.toThrow();
    expect(screen.getByTestId("phase")).toHaveTextContent("nomatch");
  });
});
