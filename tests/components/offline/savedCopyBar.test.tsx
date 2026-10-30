// @vitest-environment jsdom
/**
 * <SavedCopyBar> (spec 4.7.1, 4.7.2): the pinned bar that tells a crew member
 * they are looking at a saved copy.
 *
 * The bar hydrates as `hidden`, the only state the server can render: the
 * server never sees the `fxav-served` meta the worker injects, and cannot know
 * the phone's connection. The meta, the clock and `navigator.onLine` are read
 * after hydration, so the saved state appears on the next commit, and until
 * then the injected CSS notice is what the person sees. The two hydration
 * cases at the bottom pin that: a first render that read either would log a
 * hydration mismatch there.
 *
 * Copy is literal here, never imported from the module under test. The one
 * exception is `{time}`, the zone-dependent part, read through `formatSavedTime`
 * (pinned by tests/lib/offline/format.test.ts) because the bar formats in the
 * phone's own zone.
 *
 * `deriveBarView` is wrapped rather than replaced: every case runs the real
 * derivation, and the `updating` and `updated` cases override one input
 * (`updating`, `justUpdated`) that only later tasks wire up.
 *
 * Failure modes caught: a state with the wrong copy, tone, icon or lead; a lead
 * outside `<strong>`; copy present but hidden from assistive technology (inside
 * an `aria-hidden` subtree), so the live region announces nothing useful; an
 * icon that is not hidden; a bar that is not a polite live region; `hidden`
 * rendering an element, or skipping the mounted attribute; an unknown meta
 * read as anything but `offline`; an age that never re-evaluates or does so on
 * the wrong cadence; and a first client render that reads the meta, the clock
 * or `navigator.onLine`.
 */
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, isInaccessible, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

vi.mock("@/lib/offline/barState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/barState")>();
  return { ...actual, deriveBarView: vi.fn(actual.deriveBarView) };
});

import { SavedCopyBar, type SavedCopyBarProps } from "@/components/offline/SavedCopyBar";
import { BAR_STATES, deriveBarView, type BarState } from "@/lib/offline/barState";
import { useOnlineStatus } from "@/lib/offline/client/online";
import { formatSavedTime } from "@/lib/offline/format";
import { premiseHolds } from "@/tests/_shared/premise";

const actualBarState =
  await vi.importActual<typeof import("@/lib/offline/barState")>("@/lib/offline/barState");
const derive = vi.mocked(deriveBarView);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The phone's clock in every case. */
const NOW_MS = Date.parse("2026-10-27T12:00:00.000Z");
/** CrewShell's render time on a live page: one minute before now. */
const RENDERED_AT = "2026-10-27T11:59:00.000Z";
/** A saved copy 30 minutes old (fresh) and 7 hours old (old). */
const FRESH_SAVED_AT = "2026-10-27T11:30:00.000Z";
const OLD_SAVED_AT = "2026-10-27T05:00:00.000Z";

const MOUNTED_ATTRIBUTE = "data-fxav-bar";
const SHEET_LEAD = "Doug's sheet for this show isn't available in Google Drive anymore.";

/** `{time}` as the bar shows it in this runtime's zone. */
function at(iso: string): string {
  const time = formatSavedTime(iso, NOW_MS);
  if (time === null) throw new Error(`fixture time ${iso} does not format`);
  return time;
}

function props(overrides: Partial<SavedCopyBarProps> = {}): SavedCopyBarProps {
  return {
    renderedAt: RENDERED_AT,
    sheetUnavailable: false,
    slug: "demo-show",
    shareToken: "abc123",
    ...overrides,
  };
}

/** Puts the worker's meta in the head, or removes it (`null`). */
function setServedMeta(content: string | null, savedAt?: string): void {
  for (const meta of document.head.querySelectorAll('meta[name="fxav-served"]')) meta.remove();
  if (content === null) return;
  const meta = document.createElement("meta");
  meta.setAttribute("name", "fxav-served");
  meta.setAttribute("content", content);
  if (savedAt !== undefined) meta.setAttribute("data-saved-at", savedAt);
  document.head.appendChild(meta);
}

let onLine: MockInstance<() => boolean>;

/** Moves the connection and fires the event the browser would. */
function goOnline(value: boolean): void {
  onLine.mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

function renderBar(overrides: Partial<SavedCopyBarProps> = {}) {
  return render(<SavedCopyBar {...props(overrides)} />);
}

function bar(): HTMLElement {
  const bars = screen.getAllByTestId("saved-copy-bar");
  expect(bars).toHaveLength(1);
  return bars[0]!;
}

function contentText(): string {
  return screen.getByTestId("saved-copy-bar-content").textContent ?? "";
}

/**
 * The text a screen reader can reach inside `region`: every text node outside
 * an inaccessible subtree, by Testing Library's own definition of inaccessible
 * (aria-hidden, display none, visibility hidden). A live region announces this,
 * not its raw textContent.
 */
function announcedText(region: HTMLElement): string {
  const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
  let text = "";
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent !== null && !isInaccessible(parent)) text += node.textContent ?? "";
  }
  return text;
}

/** The icon's animation classes, prefixed variants included. */
function animationClasses(icon: Element): string[] {
  return (icon.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((name) => /(^|:)animate-/.test(name));
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW_MS, toFake: ["Date"] });
  onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  document.documentElement.removeAttribute(MOUNTED_ATTRIBUTE);
  setServedMeta(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  derive.mockImplementation(actualBarState.deriveBarView);
  setServedMeta(null);
  document.documentElement.removeAttribute(MOUNTED_ATTRIBUTE);
});

type StateCase = {
  /** Sets the meta, the connection and any input override; returns the bar's props. */
  arrange: () => Partial<SavedCopyBarProps>;
  tone: readonly string[];
  /** lucide's own class for the icon the state names. */
  icon: string;
  lead: string | null;
  text: string;
};

/** Forces one input only later tasks wire up, through the real derivation. */
function overrideInput(input: "updating" | "justUpdated"): void {
  derive.mockImplementation((inputs, timeZone) =>
    actualBarState.deriveBarView({ ...inputs, [input]: true }, timeZone),
  );
}

const STATE_CASES = {
  "saved-fresh": {
    arrange: () => {
      setServedMeta("offline", FRESH_SAVED_AT);
      return {};
    },
    tone: ["bg-info-bg"],
    icon: "lucide-wifi-off",
    lead: "No signal.",
    text: `No signal. Showing your saved copy from ${at(FRESH_SAVED_AT)} (30 min ago).`,
  },
  "saved-old": {
    arrange: () => {
      setServedMeta("slow", OLD_SAVED_AT);
      return {};
    },
    tone: ["bg-stale-tint"],
    icon: "lucide-clock",
    lead: "Slow connection.",
    text:
      `Slow connection. Your saved copy is from ${at(OLD_SAVED_AT)} (7 hr ago). ` +
      "Things may have changed since then.",
  },
  ended: {
    arrange: () => {
      setServedMeta("ended", FRESH_SAVED_AT);
      return {};
    },
    tone: ["bg-stale-tint"],
    icon: "lucide-clock",
    lead: "This show has ended.",
    text: `This show has ended. You're seeing the last version, from ${at(FRESH_SAVED_AT)}.`,
  },
  "sheet-gone": {
    arrange: () => ({ sheetUnavailable: true }),
    tone: ["bg-warning-bg", "text-warning-text"],
    icon: "lucide-triangle-alert",
    lead: SHEET_LEAD,
    text:
      `${SHEET_LEAD} You're seeing the last version we have. ` +
      "Check with Doug before relying on it.",
  },
  "sheet-gone-saved": {
    arrange: () => {
      setServedMeta("server-error", FRESH_SAVED_AT);
      return { sheetUnavailable: true };
    },
    tone: ["bg-warning-bg", "text-warning-text"],
    icon: "lucide-triangle-alert",
    lead: SHEET_LEAD,
    text:
      `${SHEET_LEAD} This is the last version we have, from ${at(FRESH_SAVED_AT)}. ` +
      "Check with Doug before relying on it.",
  },
  updating: {
    arrange: () => {
      overrideInput("updating");
      return {};
    },
    tone: ["bg-info-bg"],
    icon: "lucide-refresh-cw",
    lead: "Signal's back.",
    text: "Signal's back. Loading the latest version.",
  },
  updated: {
    arrange: () => {
      overrideInput("justUpdated");
      return {};
    },
    tone: ["bg-surface", "text-status-positive-text"],
    icon: "lucide-check",
    lead: null,
    text: "Updated. You're on the latest version.",
  },
} satisfies Record<Exclude<BarState, "hidden">, StateCase>;

describe("SavedCopyBar: one case per visible state", () => {
  test("the cases cover every state the bar can show", () => {
    expect(Object.keys(STATE_CASES).sort()).toEqual(
      BAR_STATES.filter((state) => state !== "hidden").sort(),
    );
  });

  test.each(Object.entries(STATE_CASES))("%s", (state, testCase) => {
    renderBar(testCase.arrange());

    const region = bar();
    expect(region.getAttribute("data-state")).toBe(state);
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    const classes = (region.getAttribute("class") ?? "").split(/\s+/);
    for (const tone of testCase.tone) expect(classes).toContain(tone);

    const icon = screen.getByTestId("saved-copy-bar-icon");
    expect(region.contains(icon)).toBe(true);
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(isInaccessible(icon)).toBe(true);
    expect(icon.getAttribute("class") ?? "").toContain(testCase.icon);

    expect(contentText()).toBe(testCase.text);
    expect(announcedText(region)).toBe(testCase.text);
    const strong = screen.getByTestId("saved-copy-bar-content").querySelectorAll("strong");
    if (testCase.lead === null) {
      expect(strong).toHaveLength(0);
    } else {
      expect(strong).toHaveLength(1);
      expect(strong[0]!.textContent).toBe(testCase.lead);
    }

    expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
  });

  test("only the updating icon animates: it spins, and holds still under reduced motion", () => {
    for (const [state, testCase] of Object.entries(STATE_CASES)) {
      const { unmount } = renderBar(testCase.arrange());
      const expected = state === "updating" ? ["animate-spin", "motion-reduce:animate-none"] : [];
      expect(animationClasses(screen.getByTestId("saved-copy-bar-icon")), state).toEqual(expected);
      unmount();
      derive.mockImplementation(actualBarState.deriveBarView);
      setServedMeta(null);
    }
  });
});

describe("SavedCopyBar: inputs", () => {
  test("hidden renders no element, and still marks html as mounted", () => {
    renderBar();

    expect(screen.queryByTestId("saved-copy-bar")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
  });

  test("a document without the meta is live", () => {
    // Without the meta the same online, sheet-fine page is `hidden`; with any
    // saved-copy meta it would show a bar.
    renderBar();
    expect(screen.queryByTestId("saved-copy-bar")).toBeNull();
    expect(derive).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "live", savedAt: RENDERED_AT }),
    );
  });

  test("an unknown meta content reads as offline", () => {
    setServedMeta("bogus", FRESH_SAVED_AT);
    renderBar();

    expect(bar().getAttribute("data-state")).toBe("saved-fresh");
    expect(contentText()).toBe(
      `No signal. Showing your saved copy from ${at(FRESH_SAVED_AT)} (30 min ago).`,
    );
  });

  test("the server-error lead comes from the meta", () => {
    setServedMeta("server-error", FRESH_SAVED_AT);
    renderBar();

    expect(contentText()).toBe(
      `Couldn't load the latest version. Showing your saved copy from ${at(FRESH_SAVED_AT)} (30 min ago).`,
    );
  });

  test("a saved copy whose meta has no save time drops the time and reads as old", () => {
    setServedMeta("offline");
    renderBar();

    expect(bar().getAttribute("data-state")).toBe("saved-old");
    expect(contentText()).toBe("No signal. Showing your saved copy.");
  });

  test("a live page with no connection shows the No signal. lead, aged from its render time", () => {
    onLine.mockReturnValue(false);
    renderBar();

    expect(bar().getAttribute("data-state")).toBe("saved-fresh");
    expect(screen.getByTestId("saved-copy-bar-content").querySelector("strong")?.textContent).toBe(
      "No signal.",
    );
    expect(contentText()).toBe(
      `No signal. Showing your saved copy from ${at(RENDERED_AT)} (1 min ago).`,
    );
  });

  test("tracks the connection through the online and offline events", () => {
    renderBar();
    expect(screen.queryByTestId("saved-copy-bar")).toBeNull();

    goOnline(false);
    expect(bar().getAttribute("data-state")).toBe("saved-fresh");

    goOnline(true);
    expect(screen.queryByTestId("saved-copy-bar")).toBeNull();
  });

  test("a new renderedAt after mount means server content, so the mode becomes live", () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    const { rerender } = renderBar();
    expect(bar().getAttribute("data-state")).toBe("saved-fresh");

    rerender(<SavedCopyBar {...props({ renderedAt: "2026-10-27T12:00:00.000Z" })} />);
    expect(screen.queryByTestId("saved-copy-bar")).toBeNull();
  });

  test("the 60-second tick moves saved-fresh to saved-old across the 6-hour line", () => {
    vi.useFakeTimers({ now: NOW_MS, toFake: ["Date", "setInterval", "clearInterval"] });
    // 30 seconds short of 6 hours at mount; the line is crossed 30 seconds in,
    // and the bar only notices at the first tick.
    const savedAt = new Date(NOW_MS - 6 * HOUR_MS + 30_000).toISOString();
    setServedMeta("offline", savedAt);
    renderBar();
    expect(bar().getAttribute("data-state")).toBe("saved-fresh");
    expect(contentText()).toContain("(5 hr ago)");

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS - 1);
    });
    expect(bar().getAttribute("data-state")).toBe("saved-fresh");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bar().getAttribute("data-state")).toBe("saved-old");
    expect(contentText()).toBe(
      `No signal. Your saved copy is from ${at(savedAt)} (6 hr ago). Things may have changed since then.`,
    );
  });

  test("navigator.serviceWorker absent changes nothing about rendering", () => {
    premiseHolds(
      "jsdom offers no service worker container, so the first render below runs without one",
      (window.navigator as { serviceWorker?: unknown }).serviceWorker === undefined,
    );
    const arrangements: Array<() => void> = [
      () => setServedMeta("offline", FRESH_SAVED_AT),
      () => onLine.mockReturnValue(false),
    ];
    for (const arrange of arrangements) {
      arrange();
      const without = renderBar();
      const markupWithout = bar().outerHTML;
      without.unmount();

      Object.defineProperty(window.navigator, "serviceWorker", {
        configurable: true,
        value: new EventTarget(),
      });
      const withWorker = renderBar();
      expect(bar().outerHTML).toBe(markupWithout);
      withWorker.unmount();

      delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
      setServedMeta(null);
      onLine.mockReturnValue(true);
    }
  });
});

/** Server-renders `element`, then hydrates that markup, collecting every error React reports. */
async function serverRenderThenHydrate(
  element: ReactElement,
  beforeHydrate: (markup: string) => void,
): Promise<{
  container: HTMLElement;
  consoleError: MockInstance;
  recovered: unknown[];
  root: Root;
}> {
  const markup = renderToString(element);
  beforeHydrate(markup);
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.appendChild(container);

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const recovered: unknown[] = [];
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => {
        recovered.push(error);
      },
    });
  });
  if (root === undefined) throw new Error("hydrateRoot returned nothing");
  return { container, consoleError, recovered, root };
}

describe("SavedCopyBar: hydration", () => {
  test("hydrates as the hidden server render, then shows the saved copy after effects flush", async () => {
    const { container, consoleError, recovered, root } = await serverRenderThenHydrate(
      <SavedCopyBar {...props()} />,
      (markup) => {
        premiseHolds("the server markup holds no bar element", !markup.includes("saved-copy-bar"));
        premiseHolds(
          "html is not marked before hydration",
          !document.documentElement.hasAttribute(MOUNTED_ATTRIBUTE),
        );
        // What the worker injects (Task 8 always writes data-saved-at).
        setServedMeta("offline", FRESH_SAVED_AT);
      },
    );
    try {
      expect(recovered).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();

      const region = container.querySelector<HTMLElement>('[data-testid="saved-copy-bar"]');
      expect(region?.getAttribute("data-state")).toBe("saved-fresh");
      expect(region?.querySelector("strong")?.textContent).toBe("No signal.");
      expect(region?.textContent).toContain("(30 min ago)");
      expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  test("useOnlineStatus hydrates online, then reads the real connection", async () => {
    function OnlineProbe() {
      return <span data-testid="online-probe">{useOnlineStatus() ? "on" : "off"}</span>;
    }

    const { container, consoleError, recovered, root } = await serverRenderThenHydrate(
      <OnlineProbe />,
      (markup) => {
        premiseHolds("the server render reads online", markup.includes(">on<"));
        onLine.mockReturnValue(false);
      },
    );
    try {
      expect(recovered).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="online-probe"]')?.textContent).toBe("off");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
