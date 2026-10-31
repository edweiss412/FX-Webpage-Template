// @vitest-environment jsdom
/**
 * <SavedCopyBar> (spec 4.7.1, 4.7.2): the pinned bar that tells a crew member
 * they are looking at a saved copy.
 *
 * The bar hydrates as `hidden`, the only state the server can render: the
 * server never sees the `fxav-served` meta the worker injects, and cannot know
 * the phone's connection. The meta, the clock and `navigator.onLine` are read
 * after hydration, so the saved state appears on the next commit, and until
 * then the injected CSS notice is what the person sees. The hydration cases
 * at the bottom pin that: a first render that read the meta or the connection
 * would log a hydration mismatch there.
 *
 * The live region (`saved-copy-bar-region`, role status, polite) is always
 * mounted, empty and unpainted while the bar is hidden, and the visible bar
 * renders inside it. A region inserted together with its text is not
 * announced (tests/components/_metaLiveRegionMounting.test.ts), so the cases
 * below pin that the region exists before the text arrives and is the same
 * node afterwards.
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
 * icon that is not hidden; a bar outside a polite live region; a live region
 * born populated instead of mounted empty and filled; `hidden` painting
 * anything, or skipping the mounted attribute; an unknown meta
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
// The owner's copy table, 2026-10-30 (spec 4.7.2).
const SHEET_LEAD = "Doug's sheet is gone.";
const SHEET_GONE = "Doug's sheet for this show isn't available in Google Drive anymore.";
const SHEET_DETAIL = `${SHEET_GONE} You're seeing the last version we have. Check with Doug before relying on it.`;
const SHEET_SAVED_DETAIL = `${SHEET_GONE} This is the last version we have, from ${at(FRESH_SAVED_AT)}. Check with Doug before relying on it.`;

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

/** The always-mounted live region the bar renders inside. */
function region(): HTMLElement {
  const regions = screen.getAllByTestId("saved-copy-bar-region");
  expect(regions).toHaveLength(1);
  return regions[0]!;
}

/**
 * The region's classes, sorted: layout only (the spec 4.7.2 Dimensional
 * Invariants, measured in a real browser by tests/e2e/crew-offline-layout.spec.ts),
 * so an empty region paints nothing. Compared as a sorted set wherever they are
 * checked, because nothing enforces class order.
 */
const REGION_LAYOUT_CLASSES = ["flex-none", "self-stretch", "sticky", "top-0", "z-raised"].sort();

/**
 * The server render is the empty live region and nothing else: one `div` with
 * the region's test id, role, politeness and layout classes, and no children.
 * Compared as a tag, attributes and a sorted class list, never as a string, so
 * the class order (which no tool enforces) is not pinned.
 */
function expectEmptyRegionMarkup(markup: string): void {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const nodes = [...template.content.childNodes];
  expect(nodes).toHaveLength(1);
  const element = nodes[0] as Element;
  expect(element.tagName).toBe("DIV");
  expect(
    Object.fromEntries(
      [...element.attributes]
        .filter((attribute) => attribute.name !== "class")
        .map((attribute) => [attribute.name, attribute.value]),
    ),
  ).toEqual({ "data-testid": "saved-copy-bar-region", role: "status", "aria-live": "polite" });
  expect([...element.classList].sort()).toEqual(REGION_LAYOUT_CLASSES);
  expect(element.childNodes).toHaveLength(0);
}

function contentText(): string {
  return screen.getByTestId("saved-copy-bar-content").textContent ?? "";
}

function classesOf(element: Element): string[] {
  return (element.getAttribute("class") ?? "").split(/\s+/);
}

/** Viewport bottoms of the region and the detail, in px; jsdom lays nothing out. */
type Layout = { regionBottom: number; detailBottom: number };
/** Under a 60 px header: a 40 px pinned line, then its 40 px detail. */
const AT_REST: Layout = { regionBottom: 100, detailBottom: 140 };
/** Scrolled 80 px: the region pinned at the top, half the detail still below it. */
const PARTLY_UNDER: Layout = { regionBottom: 40, detailBottom: 60 };
/** Scrolled 140 px: the region pinned, the detail entirely under it. */
const UNDER: Layout = { regionBottom: 40, detailBottom: 0 };

/** Gives the region and the detail the rects `layout` names. */
function layOut({ regionBottom, detailBottom }: Layout): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const testId = this.getAttribute("data-testid");
    const bottom =
      testId === "saved-copy-bar-region"
        ? regionBottom
        : testId === "saved-copy-bar-detail"
          ? detailBottom
          : 0;
    const height = bottom === 0 ? 0 : 40;
    return {
      x: 0,
      y: bottom - height,
      top: bottom - height,
      bottom,
      left: 0,
      right: 390,
      width: 390,
      height,
      toJSON: () => ({}),
    };
  });
}

/** Lays the page out as `layout` says, then fires the scroll that brought it there. */
function placeDetail(layout: Layout): void {
  layOut(layout);
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
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
  /** The pinned line's bold run. */
  lead: string | null;
  /** The pinned line as it shows: the bold lead, then the plain run. */
  text: string;
  /** The in-flow sentence under the pinned line, or null when the state has none. */
  detail: string | null;
  /**
   * What the live region announces: the pinned line without the relative age
   * (visual only, spec 4.7.2 Accessibility), then the detail, once.
   */
  announced: string;
  /** The text of each pinned run set in tabular figures, in order. */
  figures: readonly string[];
  /** The same, in the in-flow detail. */
  detailFigures: readonly string[];
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
    lead: `Saved ${at(FRESH_SAVED_AT)}, 30 min ago.`,
    text: `Saved ${at(FRESH_SAVED_AT)}, 30 min ago. No signal.`,
    detail: "Showing your saved copy.",
    announced: `Saved ${at(FRESH_SAVED_AT)}. No signal. Showing your saved copy.`,
    figures: [at(FRESH_SAVED_AT), ", 30 min ago"],
    detailFigures: [],
  },
  "saved-old": {
    arrange: () => {
      setServedMeta("slow", OLD_SAVED_AT);
      return {};
    },
    tone: ["bg-stale-tint"],
    icon: "lucide-clock",
    lead: `Saved ${at(OLD_SAVED_AT)}, 7 hr ago.`,
    text: `Saved ${at(OLD_SAVED_AT)}, 7 hr ago. Slow connection.`,
    detail: "Things may have changed since then.",
    announced: `Saved ${at(OLD_SAVED_AT)}. Slow connection. Things may have changed since then.`,
    figures: [at(OLD_SAVED_AT), ", 7 hr ago"],
    detailFigures: [],
  },
  ended: {
    arrange: () => {
      setServedMeta("ended", FRESH_SAVED_AT);
      return {};
    },
    tone: ["bg-stale-tint"],
    icon: "lucide-clock",
    lead: "This show has ended.",
    text: "This show has ended.",
    detail: `You're seeing the last version, from ${at(FRESH_SAVED_AT)}.`,
    announced: `This show has ended. You're seeing the last version, from ${at(FRESH_SAVED_AT)}.`,
    figures: [],
    detailFigures: [at(FRESH_SAVED_AT)],
  },
  "sheet-gone": {
    arrange: () => ({ sheetUnavailable: true }),
    tone: ["bg-warning-bg", "text-warning-text"],
    icon: "lucide-triangle-alert",
    lead: SHEET_LEAD,
    text: `${SHEET_LEAD} Check with Doug.`,
    detail: SHEET_DETAIL,
    announced: `${SHEET_LEAD} Check with Doug. ${SHEET_DETAIL}`,
    figures: [],
    detailFigures: [],
  },
  "sheet-gone-saved": {
    arrange: () => {
      setServedMeta("server-error", FRESH_SAVED_AT);
      return { sheetUnavailable: true };
    },
    tone: ["bg-warning-bg", "text-warning-text"],
    icon: "lucide-triangle-alert",
    lead: SHEET_LEAD,
    text: `${SHEET_LEAD} Check with Doug.`,
    detail: SHEET_SAVED_DETAIL,
    announced: `${SHEET_LEAD} Check with Doug. ${SHEET_SAVED_DETAIL}`,
    figures: [],
    detailFigures: [at(FRESH_SAVED_AT)],
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
    detail: null,
    announced: "Signal's back. Loading the latest version.",
    figures: [],
    detailFigures: [],
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
    detail: null,
    announced: "Updated. You're on the latest version.",
    figures: [],
    detailFigures: [],
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

    const live = region();
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    // The one live region on the page is the region, and the bar sits in it.
    expect(screen.getAllByRole("status")).toEqual([live]);
    const visible = bar();
    expect(live.contains(visible)).toBe(true);
    expect(visible.getAttribute("data-state")).toBe(state);
    const classes = (visible.getAttribute("class") ?? "").split(/\s+/);
    for (const tone of testCase.tone) expect(classes).toContain(tone);

    const icon = screen.getByTestId("saved-copy-bar-icon");
    expect(visible.contains(icon)).toBe(true);
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(isInaccessible(icon)).toBe(true);
    expect(icon.getAttribute("class") ?? "").toContain(testCase.icon);

    expect(contentText()).toBe(testCase.text);
    // The region says the whole meaning once: the pinned line, then the detail.
    expect(announcedText(live)).toBe(testCase.announced);
    const strong = screen.getByTestId("saved-copy-bar-content").querySelectorAll("strong");
    if (testCase.lead === null) {
      expect(strong).toHaveLength(0);
    } else {
      expect(strong).toHaveLength(1);
      expect(strong[0]!.textContent).toBe(testCase.lead);
    }

    expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
  });

  test.each(Object.entries(STATE_CASES))(
    "%s: one bottom edge, the bar's, or the detail's while a detail shows below the pinned line",
    (_state, testCase) => {
      renderBar(testCase.arrange());
      placeDetail(AT_REST);
      const classes = classesOf(bar());
      // The bar always has its border, so its height never changes with the edge.
      expect(classes).toContain("border-b");
      if (testCase.detail === null) {
        expect(classes).toContain("border-border");
        expect(classes).not.toContain("border-transparent");
      } else {
        // Before scrolling, the detail draws the edge (UI gate re-check E4), so
        // no line splits the pinned line from its own detail.
        expect(classes).toContain("border-transparent");
        expect(classes).not.toContain("border-border");
        expect(classesOf(screen.getByTestId("saved-copy-bar-detail"))).toContain("border-border");
      }
      // The region keeps its layout-only set, so it still has no height while hidden.
      expect([...region().classList].sort()).toEqual(REGION_LAYOUT_CLASSES);
    },
  );

  test("once the detail has scrolled under the pinned line, the bar draws the edge, and gives it back when the detail returns", () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    const edgeOnBar = (): boolean => classesOf(bar()).includes("border-border");
    premiseHolds(
      "saved-fresh has a detail",
      screen.queryByTestId("saved-copy-bar-detail") !== null,
    );

    placeDetail(AT_REST);
    expect(edgeOnBar()).toBe(false);
    // Part of the detail still shows below the pinned line, with its own edge.
    placeDetail(PARTLY_UNDER);
    expect(edgeOnBar()).toBe(false);
    placeDetail(UNDER);
    expect(edgeOnBar()).toBe(true);
    expect(classesOf(bar())).not.toContain("border-transparent");
    placeDetail(AT_REST);
    expect(edgeOnBar()).toBe(false);
  });

  test("a page that opens already scrolled past the detail draws the edge on the bar without a scroll event", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    layOut(UNDER);
    renderBar();
    await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    expect(classesOf(bar())).toContain("border-border");
  });

  test.each(Object.entries(STATE_CASES))(
    "%s: the detail shows once in the page flow, after the region, and is hidden from assistive tech",
    (_state, testCase) => {
      renderBar(testCase.arrange());
      const live = region();
      const shown = screen.queryAllByTestId("saved-copy-bar-detail");
      if (testCase.detail === null) {
        expect(shown).toEqual([]);
        return;
      }
      expect(shown).toHaveLength(1);
      const detail = shown[0]!;
      // A sibling right after the region, never inside it: it scrolls away
      // while the region stays pinned.
      expect(live.contains(detail)).toBe(false);
      expect(live.nextElementSibling).toBe(detail);
      expect(detail.textContent).toBe(testCase.detail);
      // Browsing does not read it a second time: the region already said it.
      expect(detail.getAttribute("aria-hidden")).toBe("true");
      expect(isInaccessible(detail)).toBe(true);
      const classes = (detail.getAttribute("class") ?? "").split(/\s+/);
      for (const tone of testCase.tone) expect(classes).toContain(tone);
      expect(classes).toContain("border-b");
      expect(classes).toContain("border-border");
      for (const pinned of ["sticky", "fixed", "absolute", "relative"]) {
        expect(classes, `the detail is in normal flow, not ${pinned}`).not.toContain(pinned);
      }
      expect(classes).toContain("self-stretch");
      expect(classes).toContain("flex-none");
      // The region carries the same sentence for assistive tech, out of sight.
      const spoken = [...live.querySelectorAll(".sr-only")].map((el) => el.textContent?.trim());
      expect(spoken).toEqual([testCase.detail]);
    },
  );

  test.each(Object.entries(STATE_CASES))(
    "%s: every figure in the copy is set in tabular figures, and nothing else is",
    (_state, testCase) => {
      renderBar(testCase.arrange());
      const content = screen.getByTestId("saved-copy-bar-content");
      const detail = screen.queryByTestId("saved-copy-bar-detail");
      for (const [element, expected] of [
        [content, testCase.figures],
        [detail, testCase.detailFigures],
      ] as const) {
        if (element === null) {
          expect(expected).toEqual([]);
          continue;
        }
        const figures = [...element.querySelectorAll(".tabular-nums")].map((el) => el.textContent);
        expect(figures).toEqual(expected);
        // No digit outside them: the time and age are the only figures the copy holds.
        const prose = element.cloneNode(true) as HTMLElement;
        for (const figure of prose.querySelectorAll(".tabular-nums")) figure.remove();
        expect(prose.textContent ?? "").not.toMatch(/\d/);
      }
    },
  );

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
  test("hidden keeps the live region mounted, empty and unpainted, and still marks html as mounted", () => {
    renderBar();

    const live = region();
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    // Empty and unpainted: no child and no text, no style, and no class beyond
    // the layout set (spec 4.7.2 Dimensional Invariants) that could carry a
    // tone, padding or border, so it has no height and shows nothing. The real
    // browser measures the height: tests/e2e/crew-offline-layout.spec.ts case 1.
    expect(live.childNodes).toHaveLength(0);
    expect(live.textContent).toBe("");
    expect([...live.classList].sort()).toEqual(REGION_LAYOUT_CLASSES);
    expect(live.hasAttribute("style")).toBe(false);
    expect(screen.queryByTestId("saved-copy-bar")).toBeNull();
    expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
  });

  test("the live region is mounted before the text arrives, and the same node holds it", () => {
    renderBar();
    const live = region();
    expect(live.childNodes).toHaveLength(0);

    goOnline(false);
    expect(region()).toBe(live);
    expect(live.contains(bar())).toBe(true);
    expect(announcedText(live)).toBe(
      `Saved ${at(RENDERED_AT)}. No signal. Showing your saved copy.`,
    );

    goOnline(true);
    expect(region()).toBe(live);
    expect(live.childNodes).toHaveLength(0);
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
    expect(contentText()).toBe(`Saved ${at(FRESH_SAVED_AT)}, 30 min ago. No signal.`);
  });

  test("the server-error lead comes from the meta", () => {
    setServedMeta("server-error", FRESH_SAVED_AT);
    renderBar();

    expect(contentText()).toBe(
      `Saved ${at(FRESH_SAVED_AT)}, 30 min ago. Couldn't load the latest version.`,
    );
  });

  test("a saved copy whose meta has no save time drops the time and reads as old", () => {
    setServedMeta("offline");
    renderBar();

    expect(bar().getAttribute("data-state")).toBe("saved-old");
    // No time to lead with, so the cause leads, and there is no detail.
    expect(contentText()).toBe("No signal. Showing your saved copy.");
    expect(screen.getByTestId("saved-copy-bar-content").querySelector("strong")?.textContent).toBe(
      "No signal.",
    );
    expect(screen.queryByTestId("saved-copy-bar-detail")).toBeNull();
  });

  test("a live page with no connection shows the No signal. lead, aged from its render time", () => {
    onLine.mockReturnValue(false);
    renderBar();

    expect(bar().getAttribute("data-state")).toBe("saved-fresh");
    expect(screen.getByTestId("saved-copy-bar-content").querySelector("strong")?.textContent).toBe(
      `Saved ${at(RENDERED_AT)}, 1 min ago.`,
    );
    expect(contentText()).toBe(`Saved ${at(RENDERED_AT)}, 1 min ago. No signal.`);
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
    expect(contentText()).toContain(", 5 hr ago.");

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS - 1);
    });
    expect(bar().getAttribute("data-state")).toBe("saved-fresh");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(bar().getAttribute("data-state")).toBe("saved-old");
    expect(contentText()).toBe(`Saved ${at(savedAt)}, 6 hr ago. No signal.`);
    expect(screen.getByTestId("saved-copy-bar-detail").textContent).toBe(
      "Things may have changed since then.",
    );
  });

  test("the minute tick moves the visible age and leaves the announced text alone", () => {
    vi.useFakeTimers({ now: NOW_MS, toFake: ["Date", "setInterval", "clearInterval"] });
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    const live = region();
    const visibleBefore = contentText();
    const announcedBefore = announcedText(live);
    expect(visibleBefore).toBe(`Saved ${at(FRESH_SAVED_AT)}, 30 min ago. No signal.`);
    expect(announcedBefore).toBe(
      `Saved ${at(FRESH_SAVED_AT)}. No signal. Showing your saved copy.`,
    );

    act(() => {
      vi.advanceTimersByTime(MINUTE_MS);
    });
    // The tick re-rendered the bar: the age a sighted reader sees moved on.
    expect(contentText()).toBe(`Saved ${at(FRESH_SAVED_AT)}, 31 min ago. No signal.`);
    // The same node, and not one character of what it announces changed, so a
    // polite region has nothing to read again.
    expect(region()).toBe(live);
    expect(announcedText(live)).toBe(announcedBefore);
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
      premiseHolds("the arrangement shows a bar", screen.queryByTestId("saved-copy-bar") !== null);
      const markupWithout = region().outerHTML;
      without.unmount();

      Object.defineProperty(window.navigator, "serviceWorker", {
        configurable: true,
        value: new EventTarget(),
      });
      const withWorker = renderBar();
      expect(region().outerHTML).toBe(markupWithout);
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
  beforeHydrate: (markup: string, container: HTMLElement) => void,
): Promise<{
  container: HTMLElement;
  consoleError: MockInstance;
  recovered: unknown[];
  root: Root;
}> {
  const markup = renderToString(element);
  const container = document.createElement("div");
  container.innerHTML = markup;
  document.body.appendChild(container);
  beforeHydrate(markup, container);

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
    let serverRegion: Element | null = null;
    const { container, consoleError, recovered, root } = await serverRenderThenHydrate(
      <SavedCopyBar {...props()} />,
      (markup, filled) => {
        // The server renders the empty live region, so the first client render
        // must produce exactly that.
        expectEmptyRegionMarkup(markup);
        serverRegion = filled.querySelector('[data-testid="saved-copy-bar-region"]');
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

      // Hydration adopted the server's region rather than replacing it.
      const live = container.querySelector('[data-testid="saved-copy-bar-region"]');
      expect(live).not.toBeNull();
      expect(live).toBe(serverRegion);
      const visible = live?.querySelector('[data-testid="saved-copy-bar"]');
      expect(visible?.getAttribute("data-state")).toBe("saved-fresh");
      expect(visible?.querySelector("strong")?.textContent).toBe(
        `Saved ${at(FRESH_SAVED_AT)}, 30 min ago.`,
      );
      expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  test("a live page offline at hydration hydrates hidden, then shows the No signal. lead", async () => {
    const { container, consoleError, recovered, root } = await serverRenderThenHydrate(
      <SavedCopyBar {...props()} />,
      (markup) => {
        premiseHolds(
          "no fxav-served meta, so this is a live page",
          document.head.querySelector('meta[name="fxav-served"]') === null,
        );
        // Rendered while online: the empty region the server always sends.
        expectEmptyRegionMarkup(markup);
        // The phone is offline by the time the page hydrates.
        onLine.mockReturnValue(false);
      },
    );
    try {
      expect(recovered).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();

      const visible = container.querySelector('[data-testid="saved-copy-bar"]');
      expect(visible?.getAttribute("data-state")).toBe("saved-fresh");
      expect(visible?.querySelector("strong")?.textContent).toBe(
        `Saved ${at(RENDERED_AT)}, 1 min ago.`,
      );
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  // UI gate re-check E1: the server knows `sheet-gone` from the prop alone, so it
  // renders it, and nothing shifts the page when the bar would have arrived.
  test("a live page whose sheet is gone server-renders sheet-gone, and hydrates it unchanged", async () => {
    let serverRegion: Element | null = null;
    let serverDetail: Element | null = null;
    const { container, consoleError, recovered, root } = await serverRenderThenHydrate(
      <SavedCopyBar {...props({ sheetUnavailable: true })} />,
      (_markup, filled) => {
        premiseHolds(
          "no fxav-served meta, so this is a live page",
          document.head.querySelector('meta[name="fxav-served"]') === null,
        );
        serverRegion = filled.querySelector('[data-testid="saved-copy-bar-region"]');
        serverDetail = filled.querySelector('[data-testid="saved-copy-bar-detail"]');
        const serverBar = serverRegion?.querySelector('[data-testid="saved-copy-bar"]');
        expect(serverBar?.getAttribute("data-state")).toBe("sheet-gone");
        expect(serverBar?.querySelector("strong")?.textContent).toBe(SHEET_LEAD);
        expect(serverDetail?.textContent).toBe(SHEET_DETAIL);
        premiseHolds(
          "html is not marked before hydration",
          !document.documentElement.hasAttribute(MOUNTED_ATTRIBUTE),
        );
      },
    );
    try {
      expect(recovered).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      // Hydration adopted the server's nodes, and the readings changed nothing.
      const live = container.querySelector('[data-testid="saved-copy-bar-region"]');
      expect(live).toBe(serverRegion);
      expect(container.querySelector('[data-testid="saved-copy-bar-detail"]')).toBe(serverDetail);
      expect(
        live?.querySelector('[data-testid="saved-copy-bar"]')?.getAttribute("data-state"),
      ).toBe("sheet-gone");
      expect(container.querySelector('[data-testid="saved-copy-bar-detail"]')?.textContent).toBe(
        SHEET_DETAIL,
      );
      expect(document.documentElement.getAttribute(MOUNTED_ATTRIBUTE)).toBe("mounted");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  test("a saved copy whose sheet is gone server-renders sheet-gone, then moves to sheet-gone-saved", async () => {
    const { container, consoleError, recovered, root } = await serverRenderThenHydrate(
      <SavedCopyBar {...props({ sheetUnavailable: true })} />,
      (_markup, filled) => {
        expect(
          filled.querySelector('[data-testid="saved-copy-bar"]')?.getAttribute("data-state"),
        ).toBe("sheet-gone");
        // The worker served this markup as a saved copy.
        setServedMeta("offline", FRESH_SAVED_AT);
      },
    );
    try {
      expect(recovered).toEqual([]);
      expect(consoleError).not.toHaveBeenCalled();
      const visible = container.querySelector('[data-testid="saved-copy-bar"]');
      expect(visible?.getAttribute("data-state")).toBe("sheet-gone-saved");
      // The pinned line is the same; the detail now names the saved time.
      expect(visible?.querySelector("strong")?.textContent).toBe(SHEET_LEAD);
      expect(container.querySelector('[data-testid="saved-copy-bar-detail"]')?.textContent).toBe(
        SHEET_SAVED_DETAIL,
      );
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
