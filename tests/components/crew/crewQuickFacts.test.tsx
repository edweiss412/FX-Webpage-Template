// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
/**
 * tests/components/crew/crewQuickFacts.test.tsx — the home's quick facts block
 * (crew page redesign spec §4.5, §7 copy-toast row, §9.3, §9.4; plan Task 11).
 *
 * Facts are built by the real selector from the shared fixtures, never typed, so
 * a case cannot pass on a literal the component happens to also contain. The
 * copy strings ARE typed: they are the spec's own (§9.1 "Copied", §9.3 failure
 * copy, §9.4 accessible names), and a drift from the spec must fail here.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CrewQuickFacts } from "@/components/crew/CrewQuickFacts";
import {
  DEFAULT_QUICK_FACT_ORDER,
  selectQuickFacts,
  type QuickFact,
  type QuickFactId,
  type QuickFactViewer,
} from "@/lib/crew/quickFacts";
import { COPY_FAILED_TOAST_MS, COPY_FEEDBACK_RESET_MS } from "@/lib/ui/copyFeedback";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const CREW: QuickFactViewer = {
  personal: true,
  datesSuppressed: false,
  transportVisible: true,
  tonightIso: "2026-11-03",
};

/** A show where every fact resolves for a crew viewer (the Task 2 suite's fixture shape). */
function fullShow(internet = "SSID: Hyatt_Meeting code: FITS2025") {
  return makeShowForViewer({
    show: {
      venue: {
        name: "Grand Hall",
        address: "1 Plaza Way",
        loadingDock: "Dock B off Elm St",
        googleLink: "https://maps.example.com/grand-hall",
      },
      event_details: { internet, dress_code: "Show blacks" },
    },
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Hotel One",
        hotel_address: null,
        names: [],
        confirmation_no: "CONF-77",
        check_in: "2026-11-02",
        check_out: "2026-11-04",
        notes: null,
      },
    ],
    contacts: [
      {
        kind: "venue",
        name: "Pat Venue",
        email: "pat@venue.example",
        phone: "(555) 010-2020",
        notes: null,
      },
    ],
    transportation: { parking: "Garage level 2" } as never,
  });
}

/** The facts the server would build, for the ids asked, in that order. */
function facts(ids: readonly QuickFactId[], show = fullShow()): QuickFact[] {
  return ids.flatMap((id) => selectQuickFacts([id], show, CREW));
}

function matchMedia(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

const tiles = () => screen.getAllByTestId("crew-quick-fact");
const region = () => screen.getByTestId("crew-quick-facts-status");
const toast = () => screen.getByTestId("crew-quick-facts-toast");

beforeEach(() => {
  matchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  stubClipboard(undefined);
});

describe("quick facts: layout (spec §4.5, §8 invariant 3)", () => {
  it("quick facts: zero facts render nothing, heading included", () => {
    const { container } = render(<CrewQuickFacts facts={[]} />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByText("Quick facts")).toBeNull();
  });

  it("quick facts: the block is headed Quick facts over a 2-column grid of h-full tiles", () => {
    render(<CrewQuickFacts facts={facts(DEFAULT_QUICK_FACT_ORDER.slice(0, 4))} />);
    const block = screen.getByTestId("crew-quick-facts");
    expect(within(block).getByRole("heading", { name: "Quick facts" })).toBeInTheDocument();
    const grid = screen.getByTestId("crew-quick-facts-grid");
    expect(grid).toHaveClass("grid", "grid-cols-2", "items-stretch");
    for (const tile of tiles()) expect(tile).toHaveClass("h-full");
  });

  it("quick facts: one tile spans both columns", () => {
    render(<CrewQuickFacts facts={facts(["dock"])} />);
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]).toHaveClass("col-span-2");
  });

  it("quick facts: three tiles, the third spans both columns", () => {
    render(<CrewQuickFacts facts={facts(["wifi", "hotel", "dock"])} />);
    const spans = tiles().map((t) => t.classList.contains("col-span-2"));
    expect(spans).toEqual([false, false, true]);
  });

  it("quick facts: two and four tiles fill the grid with no span", () => {
    for (const ids of [
      ["wifi", "hotel"],
      ["wifi", "hotel", "dock", "contact"],
    ] as const) {
      render(<CrewQuickFacts facts={facts(ids)} />);
      expect(tiles().map((t) => t.classList.contains("col-span-2"))).toEqual(ids.map(() => false));
      cleanup();
    }
  });

  it("quick facts: where a half tile cannot hold three actions, Who to call and its row partner span (UI-gate re-run P3-3 / N3)", () => {
    const NARROW = "@max-quick-pair/facts:col-span-2";
    const narrow = () => tiles().map((t) => t.classList.contains(NARROW));
    // The contact has a phone and an email: call, text and email.
    // PREMISE: all three links resolve, so the tile needs the wider row.
    expect(facts(["contact"])[0]!.actions.map((a) => a.kind)).toEqual(["call", "text", "email"]);
    const cases: Array<[readonly QuickFactId[], boolean[]]> = [
      // Four: the dock would sit alone beside a spanning contact, so it spans too.
      [
        ["wifi", "hotel", "dock", "contact"],
        [false, false, true, true],
      ],
      // Contact first: Wi-Fi and the hotel pair under it, and the dock, left
      // alone at the end, spans.
      [
        ["contact", "wifi", "hotel", "dock"],
        [true, false, false, true],
      ],
      // Two: both span.
      [
        ["wifi", "contact"],
        [true, true],
      ],
      // No contact: nothing changes.
      [
        ["wifi", "hotel", "dock", "parking"],
        [false, false, false, false],
      ],
    ];
    for (const [ids, want] of cases) {
      render(<CrewQuickFacts facts={facts(ids)} />);
      expect(narrow(), ids.join(",")).toEqual(want);
      expect(screen.getByTestId("crew-quick-facts-grid").parentElement).toHaveClass(
        "@container/facts",
      );
      cleanup();
    }
    // Three tiles: the third spans at every width already, so no narrow class
    // is needed on it; the first two pair, and a contact among them takes its
    // partner along.
    render(<CrewQuickFacts facts={facts(["contact", "wifi", "dock"])} />);
    expect(narrow()).toEqual([true, true, false]);
    expect(tiles()[2]).toHaveClass("col-span-2");
    cleanup();
    // Two actions fit a half tile: no span.
    const [twoLinks] = facts(["contact"]);
    const callText = { ...twoLinks!, actions: twoLinks!.actions.filter((a) => a.kind !== "email") };
    render(<CrewQuickFacts facts={[...facts(["wifi"]), callText, ...facts(["hotel", "dock"])]} />);
    expect(narrow()).toEqual([false, false, false, false]);
  });

  it("quick facts: tiles render in the facts' order with each fact's label", () => {
    const built = facts(["wifi", "contact", "parking", "dressCode"]);
    render(<CrewQuickFacts facts={built} />);
    expect(tiles().map((t) => t.getAttribute("data-fact"))).toEqual(built.map((f) => f.id));
    expect(tiles().map((t) => within(t).getByTestId("crew-quick-fact-label").textContent)).toEqual(
      built.map((f) => f.label),
    );
    // Spec §9.1 / §9.2: "Wi-Fi" and "Dress code" are the visible words.
    expect(built.map((f) => f.label)).toEqual(["Wi-Fi", "Who to call", "Parking", "Dress code"]);
  });

  it("quick facts: every value line clamps to 3 lines and stays selectable", () => {
    const built = facts(["wifi", "hotel", "dock", "address"]);
    render(<CrewQuickFacts facts={built} />);
    const values = screen.getAllByTestId("crew-quick-fact-value");
    expect(values.map((v) => v.textContent)).toEqual(
      built.flatMap((f) => f.lines.map((l) => l.text)),
    );
    for (const value of values) expect(value).toHaveClass("line-clamp-3", "select-text");
  });

  it("quick facts: a labeled line shows its label, so a bare code never sits alone", () => {
    const built = facts(["wifi", "hotel"]);
    render(<CrewQuickFacts facts={built} />);
    const labeled = built.flatMap((f) => f.lines.filter((l) => l.label !== undefined));
    expect(labeled.map((l) => l.label)).toEqual(["Network", "Password", "Confirmation"]);
    for (const line of labeled) {
      const value = screen
        .getAllByTestId("crew-quick-fact-value")
        .find((v) => v.textContent === line.text)!;
      expect(value.closest("[data-line]")).toHaveTextContent(line.label!);
    }
  });
});

describe("quick facts: actions (spec §4.5, §9.4)", () => {
  it("quick facts: copy buttons carry the spec's names and copy the action value", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const split = facts(["wifi", "hotel"]);
    const raw = facts(["wifi"], fullShow("Ask the front desk for the code"));
    render(<CrewQuickFacts facts={[...split, ...raw]} />);
    const expected = [...split, ...raw].flatMap((f) =>
      f.actions.flatMap((a) => (a.kind === "copy" ? [a] : [])),
    );
    expect(expected.map((a) => a.label)).toEqual([
      "Copy Wi-Fi password",
      "Copy hotel confirmation number",
      "Copy Wi-Fi details",
    ]);
    for (const action of expected) {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: action.label }));
      });
      expect(writeText).toHaveBeenLastCalledWith(action.value);
    }
  });

  it("quick facts: Who to call carries Call and Text links named for the contact", () => {
    const [contact] = facts(["contact"]);
    render(<CrewQuickFacts facts={[contact!]} />);
    const name = contact!.lines[0]!.text;
    const hrefs = Object.fromEntries(
      contact!.actions.flatMap((a) => ("href" in a ? [[a.kind, a.href]] : [])),
    );
    expect(screen.getByRole("link", { name: `Call ${name}` })).toHaveAttribute("href", hrefs.call);
    expect(screen.getByRole("link", { name: `Text ${name}` })).toHaveAttribute("href", hrefs.text);
    expect(screen.getByRole("link", { name: `Email ${name}` })).toHaveAttribute(
      "href",
      hrefs.email,
    );
  });

  it("quick facts: a contact fact with no action shows the name alone", () => {
    // `selectPrimaryContact` prefers an actionable contact, so a fact with no
    // action is the selector's "neither" branch (spec §4.5): render the name and
    // no link, never a dead `tel:`.
    const [contact] = facts(["contact"]);
    render(<CrewQuickFacts facts={[{ ...contact!, actions: [] }]} />);
    expect(screen.getByTestId("crew-quick-fact")).toHaveTextContent(contact!.lines[0]!.text);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("quick facts: the Venue tile's Directions link opens the map URL in a new tab", () => {
    const [address] = facts(["address"]);
    render(<CrewQuickFacts facts={[address!]} />);
    const link = screen.getByRole("link", { name: /Directions/ });
    const directions = address!.actions.find((a) => a.kind === "directions")!;
    expect(link).toHaveAttribute("href", "href" in directions ? directions.href : "");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("opens in a new tab");
  });
});

describe("quick facts: the copy toast (spec §4.5, §7, §9.1, §9.3)", () => {
  it("quick facts: a copy that succeeds shows Copied in a polite live region for 2 seconds, then fades out", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    const [wifi] = facts(["wifi"]);
    render(<CrewQuickFacts facts={[wifi!]} />);
    expect(region()).toHaveAttribute("role", "status");
    expect(region()).toHaveAttribute("aria-live", "polite");
    expect(region().textContent).toBe("");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(toast()).toHaveTextContent("Copied");
    expect(toast()).toHaveAttribute("data-state", "shown");

    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 1));
    expect(toast()).toHaveAttribute("data-state", "shown");
    act(() => vi.advanceTimersByTime(1));
    // The hold is over: the toast fades out, its text still in place.
    expect(toast()).toHaveAttribute("data-state", "leaving");
    expect(toast()).toHaveTextContent("Copied");
    // The fade's end clears the text, so the next "Copied" is a change the
    // region announces.
    fireEvent.animationEnd(toast());
    expect(region().textContent).toBe("");
  });

  it("quick facts: the live region stays mounted while only its text changes", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    render(<CrewQuickFacts facts={facts(["wifi", "hotel"])} />);
    const before = region();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(region()).toBe(before);
    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS));
    fireEvent.animationEnd(toast());
    expect(region()).toBe(before);
    stubClipboard(() => Promise.reject(new Error("denied")));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy hotel confirmation number" }));
    });
    expect(region()).toBe(before);
    expect(region()).toHaveTextContent("Couldn't copy. Press and hold the text to copy it.");
  });

  it("quick facts: a rejected clipboard write shows the failure toast, and the value stays selectable", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    const [hotel] = facts(["hotel"]);
    render(<CrewQuickFacts facts={[hotel!]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy hotel confirmation number" }));
    });
    expect(toast()).toHaveTextContent("Couldn't copy. Press and hold the text to copy it.");
    const copied = hotel!.actions.find((a) => a.kind === "copy")!;
    const value = screen
      .getAllByTestId("crew-quick-fact-value")
      .find((v) => v.textContent === ("value" in copied ? copied.value : ""))!;
    expect(value).toHaveClass("select-text");
    // The instruction outlasts a confirmation's 2 s.
    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS));
    expect(toast()).toHaveAttribute("data-state", "shown");
    act(() => vi.advanceTimersByTime(COPY_FAILED_TOAST_MS - COPY_FEEDBACK_RESET_MS));
    expect(toast()).toHaveAttribute("data-state", "leaving");
  });

  it("quick facts: no clipboard API shows the failure toast", async () => {
    stubClipboard(undefined);
    render(<CrewQuickFacts facts={facts(["wifi"])} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(toast()).toHaveTextContent("Couldn't copy. Press and hold the text to copy it.");
  });

  it("quick facts: a second copy while the toast shows replaces its text and restarts the hold", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    render(<CrewQuickFacts facts={facts(["wifi", "hotel"])} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS - 500));
    stubClipboard(() => Promise.reject(new Error("denied")));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy hotel confirmation number" }));
    });
    expect(toast()).toHaveTextContent("Couldn't copy. Press and hold the text to copy it.");
    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS));
    expect(toast()).toHaveAttribute("data-state", "shown");
  });

  it("quick facts: the toast enters with the fade-and-rise keyframe and leaves with the fade, both motion-safe", async () => {
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    render(<CrewQuickFacts facts={facts(["wifi"])} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(toast().className).toContain(
      "motion-safe:animate-[crew-toast-in_var(--duration-fast)_var(--ease-out-quart)]",
    );
    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS));
    expect(toast().className).toContain(
      "motion-safe:animate-[crew-toast-out_var(--duration-fast)_var(--ease-out-quart)_forwards]",
    );
  });

  it("quick facts: under reduced motion the toast hides at once when the hold ends", async () => {
    matchMedia(true);
    vi.useFakeTimers();
    stubClipboard(() => Promise.resolve());
    render(<CrewQuickFacts facts={facts(["wifi"])} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Wi-Fi password" }));
    });
    expect(toast()).toHaveAttribute("data-state", "shown");
    act(() => vi.advanceTimersByTime(COPY_FEEDBACK_RESET_MS));
    // No fade runs, so nothing waits for an animationend that never fires.
    expect(toast()).toHaveAttribute("data-state", "idle");
    expect(region().textContent).toBe("");
  });
});
