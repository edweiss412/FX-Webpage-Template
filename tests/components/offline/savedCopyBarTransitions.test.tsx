// @vitest-environment jsdom
/**
 * tests/components/offline/savedCopyBarTransitions.test.tsx
 *
 * The behavioural half of the saved-copy bar's Transition Inventory (spec
 * 4.7.2). The structural half, one declared treatment per conditional in the
 * component, is savedCopyBarTransitionAudit.test.ts.
 *
 * The bar is a pure function of its inputs, so any input change can move it
 * between any two states. The 28 unordered pairs are generated from
 * BAR_STATES, not listed, and each runs in both directions through
 * SavedCopyBarView, the bar's stateless render of one derived view (preflight
 * ruling D15). Several pairs cannot be reached in one container instance:
 * `updating` to `updated` crosses a reload, and `ended` comes only from the
 * mount-time meta or a probe. What the inventory constrains is what the bar
 * paints for a pair of views, which the view alone decides. Every direction is
 * instant except one: `updated` to `hidden` when the 4-second window ends
 * fades on duration-normal.
 *
 * The fade's timing, its reduced-motion collapse and its cancellation run on
 * the container, SavedCopyBar, through a real recovery: a `saved` probe reply
 * writes the session flag and the next mount shows `updated` (the flag's key
 * is not assumed, as in savedCopyBarRecovery.test.tsx). The fade's length is
 * read from the duration-normal token in app/globals.css rather than written
 * here, so the test follows the token the fade runs on.
 *
 * The inventory's other three compound transitions (the age tick crossing 6
 * hours during `updating`, a second `online` event during a probe, an RSC
 * refresh during `updating`) are savedCopyBarRecovery.test.tsx's, reused by
 * reference (preflight ruling D18); the last case here pins that they are
 * still there.
 *
 * Every absence assertion sits in a case that also shows the presence it is
 * the absence of (preflight ruling D17): each instant pair first proves its
 * motion-class detector sees the fade's classes, and each fade cancellation
 * first shows the faded frame it cancels.
 *
 * Failure modes caught: a pair that animates, or lands in a later commit than
 * the change that caused it; the live region replaced or given a transition
 * class; `updated` leaving at once when its window ends, fading on a literal
 * duration or the wrong token, fading early, or never leaving; a bar replaced
 * by a new node at the fade, which would have nothing to fade from; a fade
 * that ignores the bar's own `transitionend`, or ends on one bubbling from
 * inside it; a fade under reduced motion, or one left armed by a window that
 * ended under reduced motion; an input change during the fade that leaves the
 * faded frame on screen, or renders the new state with the fade's classes; a
 * cancelled fade that a flip back to its own inputs brings back; `updated`
 * coming back after its window ended; a window that ends under another state
 * fading that state; and a compound case the D18 reference names no longer
 * existing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
  type MockInstance,
} from "vitest";

vi.mock("@/lib/offline/client/reload", () => ({ reloadPage: vi.fn() }));
vi.mock("@/lib/offline/client/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/client/messaging")>()),
  postToWorker: vi.fn(),
}));

import {
  SavedCopyBar,
  SavedCopyBarView,
  type SavedCopyBarProps,
} from "@/components/offline/SavedCopyBar";
import {
  BAR_STATES,
  deriveBarView,
  type BarInputs,
  type BarState,
  type BarView,
} from "@/lib/offline/barState";
import { postToWorker } from "@/lib/offline/client/messaging";
import { reloadPage } from "@/lib/offline/client/reload";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const post = vi.mocked(postToWorker);
const reload = vi.mocked(reloadPage);

const REPO_ROOT = process.cwd();

/** DESIGN.md 5.1's duration-normal, the token the fade runs on, read from its definition. */
const FADE_MS = (() => {
  const css = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  const match = /--duration-normal:\s*(\d+)ms;/.exec(css);
  if (match === null) throw new Error("app/globals.css defines no --duration-normal");
  return Number(match[1]);
})();

/** Spec 4.7.2: how long `updated` shows after a recovery reload. */
const UPDATED_FOR_MS = 4_000;

/** The classes the fade adds to the bar, sorted. */
const FADE_CLASSES = ["duration-normal", "opacity-0", "transition-opacity"];

const NOW_MS = Date.parse("2026-10-27T12:00:00.000Z");
const RENDERED_AT = "2026-10-27T11:59:00.000Z";
/** The render time an RSC refresh brings: server content, so the page is live. */
const REFRESHED_AT = "2026-10-27T12:00:30.000Z";
const FRESH_SAVED_AT = "2026-10-27T11:30:00.000Z";
const OLD_SAVED_AT = "2026-10-27T05:00:00.000Z";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

// ── The views, one per state, from the real derivation ──────────────────────

const LIVE_INPUTS: BarInputs = {
  mode: "live",
  online: true,
  savedAt: RENDERED_AT,
  nowMs: NOW_MS,
  sheetUnavailable: false,
  updating: false,
  justUpdated: false,
};

/** Inputs that derive each state. A Record, so a new state fails to compile until it has one. */
const INPUTS_FOR: Record<BarState, BarInputs> = {
  hidden: LIVE_INPUTS,
  "saved-fresh": { ...LIVE_INPUTS, mode: "offline", savedAt: FRESH_SAVED_AT },
  "saved-old": { ...LIVE_INPUTS, mode: "slow", savedAt: OLD_SAVED_AT },
  ended: { ...LIVE_INPUTS, mode: "ended", savedAt: FRESH_SAVED_AT },
  "sheet-gone": { ...LIVE_INPUTS, sheetUnavailable: true },
  "sheet-gone-saved": {
    ...LIVE_INPUTS,
    mode: "server-error",
    savedAt: FRESH_SAVED_AT,
    sheetUnavailable: true,
  },
  updating: { ...LIVE_INPUTS, mode: "offline", savedAt: FRESH_SAVED_AT, updating: true },
  updated: { ...LIVE_INPUTS, justUpdated: true },
};

const VIEWS = Object.fromEntries(
  BAR_STATES.map((state) => [state, deriveBarView(INPUTS_FOR[state])]),
) as Record<BarState, BarView>;

/** Every unordered pair of states, from the union. */
const PAIRS: ReadonlyArray<readonly [BarState, BarState]> = BAR_STATES.flatMap((a, index) =>
  BAR_STATES.slice(index + 1).map((b) => [a, b] as const),
);

/** Both directions of every pair. */
const DIRECTIONS = PAIRS.flatMap(([a, b]) => [
  [a, b],
  [b, a],
]) as Array<[BarState, BarState]>;

/** The one direction the inventory fades. */
function fades(from: BarState, to: BarState): boolean {
  return from === "updated" && to === "hidden";
}

// ── Reading the DOM ─────────────────────────────────────────────────────────

/** The always-mounted live region the bar renders inside. */
function region(): HTMLElement {
  const regions = screen.getAllByTestId("saved-copy-bar-region");
  expect(regions).toHaveLength(1);
  return regions[0]!;
}

function visibleBar(): HTMLElement | null {
  const bars = screen.queryAllByTestId("saved-copy-bar");
  expect(bars.length).toBeLessThanOrEqual(1);
  return bars[0] ?? null;
}

/** The state the bar paints, or `hidden` when only the empty region is mounted. */
function shownState(): string {
  return visibleBar()?.getAttribute("data-state") ?? "hidden";
}

function classesOf(element: Element): string[] {
  return (element.getAttribute("class") ?? "").split(/\s+/).filter((name) => name !== "");
}

/**
 * A transition, duration or opacity-0 class, prefixed variants included. The
 * icon's `animate-spin` is the `updating` spinner, an animation inside one
 * state that the inventory does not govern.
 */
function isMotionClass(name: string): boolean {
  return /(^|:)(transition|duration)(-|$)/.test(name) || /(^|:)opacity-0$/.test(name);
}

/** Every motion class on `root` and inside it, sorted. */
function motionClasses(root: Element): string[] {
  return [root, ...root.querySelectorAll("*")].flatMap(classesOf).filter(isMotionClass).sort();
}

/** The motion classes on the region's own element, which must never have any. */
function regionMotionClasses(live: Element): string[] {
  return classesOf(live).filter(isMotionClass);
}

const noop = (): void => undefined;

function viewElement(view: BarView, fading = false, onFadeEnd: () => void = noop) {
  return <SavedCopyBarView view={view} fading={fading} onFadeEnd={onFadeEnd} />;
}

// ── The container's recovery, for the cases that need a real `updated` ──────

let onLine: MockInstance<() => boolean>;
let reduceMotion = false;
/** What the bar's reduced-motion hook subscribed to, so a test can change the preference. */
const motionListeners = new Set<() => void>();
let originalMatchMedia: typeof window.matchMedia;

/** Changes the reduced-motion preference and tells the subscribers, as the browser would. */
async function setReduceMotion(value: boolean): Promise<void> {
  reduceMotion = value;
  await act(async () => {
    for (const listener of motionListeners) listener();
  });
}

function setServedMeta(content: string | null, savedAt?: string): void {
  for (const meta of document.head.querySelectorAll('meta[name="fxav-served"]')) meta.remove();
  if (content === null) return;
  const meta = document.createElement("meta");
  meta.setAttribute("name", "fxav-served");
  meta.setAttribute("content", content);
  if (savedAt !== undefined) meta.setAttribute("data-saved-at", savedAt);
  document.head.appendChild(meta);
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

function renderBar(overrides: Partial<SavedCopyBarProps> = {}) {
  return render(<SavedCopyBar {...props(overrides)} />);
}

async function fire(type: "online" | "offline"): Promise<void> {
  onLine.mockReturnValue(type === "online");
  await act(async () => {
    window.dispatchEvent(new Event(type));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Runs a saved recovery on a saved copy and unmounts it, leaving the session
 * flag for the next mount: the page the reload brings, which is live.
 */
async function recoverThenReload(): Promise<void> {
  setServedMeta("offline", FRESH_SAVED_AT);
  const { unmount } = renderBar();
  const reloadsBefore = reload.mock.calls.length;
  post.mockResolvedValueOnce({ outcome: "saved" });
  await fire("online");
  premiseHolds("the recovery reloaded", reload.mock.calls.length === reloadsBefore + 1);
  premiseHolds("the recovery left a session entry", window.sessionStorage.length === 1);
  unmount();
  setServedMeta(null);
}

/** Mounts the page a recovery reload brings, and checks it shows `updated` at rest. */
async function arriveUpdated(): Promise<ReturnType<typeof renderBar>> {
  await recoverThenReload();
  const result = renderBar();
  premiseHolds("the reloaded page shows updated", shownState() === "updated");
  premiseHolds("updated at rest carries no motion class", motionClasses(region()).length === 0);
  return result;
}

beforeAll(() => {
  originalMatchMedia = window.matchMedia;
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query === REDUCE_QUERY && reduceMotion,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => motionListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        motionListeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW_MS,
    toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
  });
  onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  reduceMotion = false;
  motionListeners.clear();
  post.mockReset();
  post.mockResolvedValue({ outcome: "failed" });
  reload.mockReset();
  window.sessionStorage.clear();
  setServedMeta(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  setServedMeta(null);
});

// ── The 28 pairs ────────────────────────────────────────────────────────────

describe("SavedCopyBar transitions: the 28 pairs (spec 4.7.2)", () => {
  test("the pairs are generated from the union, and each fixture derives its own state", () => {
    const n = BAR_STATES.length;
    expect(PAIRS).toHaveLength((n * (n - 1)) / 2);
    // The spec's count: a new state fails here until the inventory names it.
    expect(PAIRS).toHaveLength(28);
    expect(new Set(PAIRS.map(([a, b]) => `${a}|${b}`)).size).toBe(PAIRS.length);
    expect(DIRECTIONS.filter(([from, to]) => fades(from, to))).toEqual([["updated", "hidden"]]);
    for (const state of BAR_STATES) expect(VIEWS[state].state, state).toBe(state);
  });

  test.each(DIRECTIONS.filter(([from, to]) => !fades(from, to)))(
    "%s to %s is instant",
    (from, to) => {
      // Positive control: the detector below sees the fade's classes.
      const control = render(viewElement(VIEWS.updated, true));
      premiseHolds(
        "the motion-class detector sees the fade",
        motionClasses(region()).join(" ") === FADE_CLASSES.join(" "),
      );
      control.unmount();

      const { rerender } = render(viewElement(VIEWS[from]));
      const live = region();
      premiseHolds(`the ${from} view paints ${from}`, shownState() === from);

      rerender(viewElement(VIEWS[to]));

      // The new state is on screen in the commit that brought it, with nothing
      // moving, and the region is the node it was.
      expect(region()).toBe(live);
      expect(shownState()).toBe(to);
      expect(motionClasses(live)).toEqual([]);
    },
  );

  test("updated to hidden fades: the same bar takes the fade classes, then leaves the region", () => {
    const { rerender } = render(viewElement(VIEWS.updated));
    const live = region();
    const bar = visibleBar();
    expect(bar).not.toBeNull();
    expect(motionClasses(live)).toEqual([]);

    rerender(viewElement(VIEWS.updated, true));
    // The same node: a bar remounted for the fade would have nothing to fade from.
    expect(visibleBar()).toBe(bar);
    expect(shownState()).toBe("updated");
    // On the bar alone: not on the region, not inside the bar.
    expect(motionClasses(live)).toEqual(FADE_CLASSES);
    expect(classesOf(bar!).filter(isMotionClass).sort()).toEqual(FADE_CLASSES);
    expect(regionMotionClasses(live)).toEqual([]);

    rerender(viewElement(VIEWS.hidden));
    expect(region()).toBe(live);
    expect(live.childNodes).toHaveLength(0);
  });

  test("the bar's own transitionend ends the fade; one bubbling from inside the bar does not", () => {
    const onFadeEnd = vi.fn();
    render(viewElement(VIEWS.updated, true, onFadeEnd));

    fireEvent.transitionEnd(screen.getByTestId("saved-copy-bar-icon"));
    expect(onFadeEnd).not.toHaveBeenCalled();

    fireEvent.transitionEnd(screen.getByTestId("saved-copy-bar"));
    expect(onFadeEnd).toHaveBeenCalledTimes(1);
  });
});

// ── The fade on the container ───────────────────────────────────────────────

describe("SavedCopyBar transitions: the updated fade", () => {
  test("when the 4-second window ends, updated fades on duration-normal and leaves at the token's length", async () => {
    // The token, not the spec's approximate 200 ms: a literal would bypass the
    // reduced-motion collapse that zeroes every duration token.
    premise("duration-normal parses to a real duration", FADE_MS, 0);
    await arriveUpdated();
    const live = region();
    const bar = visibleBar();

    await advance(UPDATED_FOR_MS - 1);
    expect(shownState()).toBe("updated");
    expect(motionClasses(live)).toEqual([]);

    await advance(1);
    // The faded frame: the same bar, still `updated`, with the fade's classes
    // and nothing else moving.
    expect(visibleBar()).toBe(bar);
    expect(shownState()).toBe("updated");
    expect(motionClasses(live)).toEqual(FADE_CLASSES);
    expect(classesOf(bar!).filter(isMotionClass).sort()).toEqual(FADE_CLASSES);
    expect(regionMotionClasses(live)).toEqual([]);

    await advance(FADE_MS - 1);
    expect(visibleBar()).toBe(bar);

    await advance(1);
    // Only the bar leaves: the region is the node it was, empty.
    expect(visibleBar()).toBeNull();
    expect(region()).toBe(live);
    expect(live.childNodes).toHaveLength(0);
  });

  test("the bar's transitionend ends the fade before the fallback; one from the icon does not", async () => {
    await arriveUpdated();
    const live = region();
    await advance(UPDATED_FOR_MS);
    premiseHolds("the bar is fading", motionClasses(live).join(" ") === FADE_CLASSES.join(" "));

    fireEvent.transitionEnd(screen.getByTestId("saved-copy-bar-icon"));
    expect(shownState()).toBe("updated");

    fireEvent.transitionEnd(screen.getByTestId("saved-copy-bar"));
    expect(visibleBar()).toBeNull();
    expect(region()).toBe(live);
    expect(live.childNodes).toHaveLength(0);
  });

  test("under reduced motion the window's end removes the bar at once; without it the same end fades", async () => {
    // Positive control: with no preference the same arrival has a faded frame.
    const control = await arriveUpdated();
    await advance(UPDATED_FOR_MS);
    expect(shownState()).toBe("updated");
    expect(motionClasses(region())).toEqual(FADE_CLASSES);
    control.unmount();

    reduceMotion = true;
    await arriveUpdated();
    const live = region();

    await advance(UPDATED_FOR_MS - 1);
    expect(shownState()).toBe("updated");

    await advance(1);
    expect(visibleBar()).toBeNull();
    expect(region()).toBe(live);
    expect(live.childNodes).toHaveLength(0);
  });

  test("a window that ends under another state fades nothing, and updated does not come back", async () => {
    // Positive control: the same window ending on `updated` does fade.
    const control = await arriveUpdated();
    await advance(UPDATED_FOR_MS);
    expect(motionClasses(region())).toEqual(FADE_CLASSES);
    control.unmount();

    await arriveUpdated();
    const live = region();
    await advance(UPDATED_FOR_MS / 2);
    await fire("offline");
    premiseHolds("offline outranks updated", shownState() === "saved-fresh");

    await advance(UPDATED_FOR_MS / 2);
    expect(shownState()).toBe("saved-fresh");
    expect(motionClasses(live)).toEqual([]);

    await advance(FADE_MS);
    await fire("online");
    expect(visibleBar()).toBeNull();
    expect(region()).toBe(live);
  });
});

// ── Compound transitions ────────────────────────────────────────────────────

type FadeInterruption = {
  name: string;
  interrupt: (rerender: ReturnType<typeof renderBar>["rerender"]) => Promise<void>;
  /** The state the new inputs give, painted at once. */
  then: string;
};

const INTERRUPTIONS: FadeInterruption[] = [
  {
    name: "the phone going offline",
    interrupt: () => fire("offline"),
    then: "saved-fresh",
  },
  {
    name: "an RSC refresh finding the sheet gone",
    interrupt: async (rerender) => {
      rerender(<SavedCopyBar {...props({ renderedAt: REFRESHED_AT, sheetUnavailable: true })} />);
    },
    then: "sheet-gone",
  },
  {
    // The new inputs still give `hidden`, so only the cancellation itself
    // removes the faded frame before the fallback would.
    name: "an RSC refresh with the sheet fine",
    interrupt: async (rerender) => {
      rerender(<SavedCopyBar {...props({ renderedAt: REFRESHED_AT })} />);
    },
    then: "hidden",
  },
];

describe("SavedCopyBar transitions: compound transitions (spec 4.7.2)", () => {
  test.each(INTERRUPTIONS)(
    "$name during the updated fade cancels it and paints $then at once",
    async ({ interrupt, then }) => {
      const { rerender } = await arriveUpdated();
      const live = region();
      await advance(UPDATED_FOR_MS);
      // The faded frame the interruption cancels.
      expect(shownState()).toBe("updated");
      expect(motionClasses(live)).toEqual(FADE_CLASSES);

      await interrupt(rerender);

      expect(shownState()).toBe(then);
      expect(motionClasses(live)).toEqual([]);
      expect(region()).toBe(live);

      // The window is over, so nothing brings `updated` back.
      await advance(FADE_MS);
      expect(shownState()).toBe(then);
    },
  );

  test("a cancelled fade stays cancelled when the inputs flip back inside its window", async () => {
    // Back online inside the fade's own length, the inputs are byte-for-byte
    // the ones the fade began under; only a cancellation that was recorded,
    // rather than inferred from the inputs differing, keeps the frame away.
    const flipAfter = Math.floor(FADE_MS / 4);
    premise("the flip lands inside the fade's window", flipAfter, 0);
    await arriveUpdated();
    const live = region();
    await advance(UPDATED_FOR_MS);
    // The faded frame the flip cancels.
    expect(shownState()).toBe("updated");
    expect(motionClasses(live)).toEqual(FADE_CLASSES);

    await fire("offline");
    expect(shownState()).toBe("saved-fresh");
    expect(motionClasses(live)).toEqual([]);

    await advance(flipAfter);
    await fire("online");
    expect(visibleBar()).toBeNull();
    expect(motionClasses(live)).toEqual([]);
    expect(region()).toBe(live);

    await advance(FADE_MS);
    expect(visibleBar()).toBeNull();
  });

  test("a window that ends under reduced motion leaves no fade for a later change to resume", async () => {
    // Positive control: with no preference the same arrival has a faded frame.
    const control = await arriveUpdated();
    await advance(UPDATED_FOR_MS);
    expect(motionClasses(region())).toEqual(FADE_CLASSES);
    control.unmount();

    reduceMotion = true;
    await arriveUpdated();
    const live = region();
    await advance(UPDATED_FOR_MS);
    premiseHolds("under reduced motion the window's end removes the bar", visibleBar() === null);

    // The preference turns off inside what would have been the fade's window.
    await setReduceMotion(false);
    expect(visibleBar()).toBeNull();
    expect(motionClasses(live)).toEqual([]);

    // Nor does a flip of the inputs away and back find a fade to resume.
    await fire("offline");
    premiseHolds("offline paints a saved state", shownState() === "saved-fresh");
    await fire("online");
    expect(visibleBar()).toBeNull();
    expect(motionClasses(live)).toEqual([]);
  });

  test("the other three compound transitions are savedCopyBarRecovery.test.tsx's (ruling D18)", () => {
    const source = readFileSync(
      join(REPO_ROOT, "tests", "components", "offline", "savedCopyBarRecovery.test.tsx"),
      "utf8",
    );
    for (const title of [
      "the age tick crossing 6 hours during updating keeps updating",
      "a second online event during a probe does not start a second probe, nor does anything else",
      "an RSC refresh during updating cancels the recovery and renders the live page",
    ]) {
      expect(source, title).toContain(`test("${title}"`);
    }
  });
});
