// @vitest-environment jsdom
/**
 * <SavedCopyBar> coming back online (spec 4.7.3) and the section in the URL
 * (spec 4.7.4), plus the compound transitions of the 4.7.2 Transition
 * Inventory that involve a probe or the `updating` state. Task 27 reuses the
 * compound cases here by reference (preflight ruling D18).
 *
 * On a saved copy served `offline`, `slow` or `server-error`, the bar asks the
 * worker to probe the page's path on the `online` event, on a `fresh-ready`
 * broadcast for this path, and every 30 seconds while `navigator.onLine` is
 * true, never two at once. A `saved` reply shows `updating`, sets a session
 * flag and reloads; `purged` reloads at once; `ended` shows `ended`; anything
 * else changes nothing. The next page consumes the flag once and shows
 * `updated` for 4 seconds.
 *
 * The transport is mocked (postToWorker, pinned in
 * tests/lib/offline/clientMessaging.test.ts) so each reply is under the test's
 * control, and reloadPage is mocked because jsdom's location.reload cannot be
 * spied (preflight ruling D6). The service worker container is a plain
 * EventTarget, so a broadcast is a dispatched MessageEvent.
 *
 * Copy is literal here, never imported from the module under test; `{time}`
 * is read through formatSavedTime, as in savedCopyBar.test.tsx. The session
 * flag's key is not assumed either: the round-trip case reads back whatever
 * the saved outcome wrote.
 *
 * Every absence assertion sits in a case that also shows the presence it is
 * the absence of (preflight ruling D17).
 *
 * Failure modes caught: a probe in the wrong mode or never fired by one of its
 * three triggers; two probes at once; a timer that keeps probing without a
 * connection; a `fresh-ready` for another page or another message type
 * starting a probe; an outcome mapped to the wrong action, or the reload
 * before the flag is written; the flag consumed twice, or its 4-second window
 * killed by StrictMode's second effect run; a probe that keeps running after
 * the recovery ends; an RSC refresh that leaves `updating` on screen or lets
 * an in-flight probe reload the page; the age tick knocking `updating` back to
 * a saved state; and the URL rewritten on a live page, from a missing or empty
 * attribute, or with the other parameters dropped.
 */
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

vi.mock("@/lib/offline/client/reload", () => ({ reloadPage: vi.fn() }));
vi.mock("@/lib/offline/client/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/client/messaging")>()),
  postToWorker: vi.fn(),
}));

import { SavedCopyBar, type SavedCopyBarProps } from "@/components/offline/SavedCopyBar";
import { postToWorker, type PostResult } from "@/lib/offline/client/messaging";
import { reloadPage } from "@/lib/offline/client/reload";
import { formatSavedTime } from "@/lib/offline/format";
import { NAV_BUDGET_MS, STATUS_TIMEOUT_MS } from "@/lib/offline/navigation";
import { premiseHolds } from "@/tests/_shared/premise";

const post = vi.mocked(postToWorker);
const reload = vi.mocked(reloadPage);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** Spec 4.7.3: the probe cadence while the phone reports a connection. */
const PROBE_EVERY_MS = 30_000;
/** Spec 4.7.2: how long `updated` shows after a recovery reload. */
const UPDATED_FOR_MS = 4_000;

const NOW_MS = Date.parse("2026-10-27T12:00:00.000Z");
const RENDERED_AT = "2026-10-27T11:59:00.000Z";
/** The render time an RSC refresh brings: server content, so the page is live. */
const REFRESHED_AT = "2026-10-27T12:00:30.000Z";
/** A saved copy 30 minutes old. */
const FRESH_SAVED_AT = "2026-10-27T11:30:00.000Z";

const PATH = "/show/demo-show/abc123";
const OTHER_PATH = "/show/other-show/def456";

const SAVED_TEXT = (savedAt: string, ago: string) =>
  `No signal. Showing your saved copy from ${at(savedAt)} (${ago}).`;
const UPDATING_TEXT = "Signal's back. Loading the latest version.";
const UPDATED_TEXT = "Updated. You're on the latest version.";

/** Every reply that is not `saved`, `purged` or `ended`: none of them changes anything. */
const NO_CHANGE_REPLIES = [
  "failed",
  "kept",
  "skipped",
  "ack",
  "timeout",
  "no-worker",
] as const satisfies ReadonlyArray<PostResult["outcome"]>;

function at(iso: string): string {
  const time = formatSavedTime(iso, Date.now());
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

function setServedMeta(content: string | null, savedAt?: string): void {
  for (const meta of document.head.querySelectorAll('meta[name="fxav-served"]')) meta.remove();
  if (content === null) return;
  const meta = document.createElement("meta");
  meta.setAttribute("name", "fxav-served");
  meta.setAttribute("content", content);
  if (savedAt !== undefined) meta.setAttribute("data-saved-at", savedAt);
  document.head.appendChild(meta);
}

/** CrewSections' wrapper (components/crew/CrewSections.tsx:260), as the bar finds it in the DOM. */
function mountSectionsWrapper(activeSection: string | null): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-testid", "crew-shell-sections");
  if (activeSection !== null) wrapper.setAttribute("data-active-section", activeSection);
  document.body.appendChild(wrapper);
  return wrapper;
}

let onLine: MockInstance<() => boolean>;
let container: EventTarget;

function installServiceWorker(): EventTarget {
  const target = Object.assign(new EventTarget(), { controller: {} });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    get: () => target,
  });
  return target;
}

/** Fires a window event and lets any probe it started run to its reply. */
async function fire(type: "online" | "offline"): Promise<void> {
  onLine.mockReturnValue(type === "online");
  await act(async () => {
    window.dispatchEvent(new Event(type));
  });
}

async function broadcast(data: unknown): Promise<void> {
  await act(async () => {
    container.dispatchEvent(new MessageEvent("message", { data }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/** Holds the next probe's reply until the returned function gives it. */
function holdNextReply(): (result: PostResult) => Promise<void> {
  let give: (result: PostResult) => void = () => {
    throw new Error("the held probe was never posted");
  };
  post.mockImplementationOnce(
    () =>
      new Promise<PostResult>((resolve) => {
        give = resolve;
      }),
  );
  return async (result) => {
    await act(async () => {
      give(result);
    });
  };
}

function renderBar(overrides: Partial<SavedCopyBarProps> = {}) {
  return render(<SavedCopyBar {...props(overrides)} />);
}

/** The visible bar's state, or `hidden` when only the empty region is mounted. */
function barState(): string {
  const bars = screen.queryAllByTestId("saved-copy-bar");
  expect(bars.length).toBeLessThanOrEqual(1);
  return bars[0]?.getAttribute("data-state") ?? "hidden";
}

function barText(): string {
  return screen.queryByTestId("saved-copy-bar-content")?.textContent ?? "";
}

/** Every probe posted so far, as the messages the bar sent. */
function probes(): unknown[] {
  return post.mock.calls.map(([message]) => message);
}

function sessionEntries(): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key !== null) entries.push([key, window.sessionStorage.getItem(key) ?? ""]);
  }
  return entries;
}

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW_MS,
    toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"],
  });
  onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  container = installServiceWorker();
  post.mockReset();
  post.mockResolvedValue({ outcome: "failed" });
  reload.mockReset();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", `${PATH}?s=today&gate=skip`);
  setServedMeta(null);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  window.sessionStorage.clear();
  setServedMeta(null);
  for (const wrapper of document.querySelectorAll('[data-testid="crew-shell-sections"]')) {
    wrapper.remove();
  }
});

describe("SavedCopyBar recovery: when the bar probes", () => {
  test("only a copy served offline, slow or server-error probes, on any of the three triggers", async () => {
    const modes: Array<[meta: string | null, probes: boolean]> = [
      ["offline", true],
      ["slow", true],
      ["server-error", true],
      // An unknown meta value reads as offline (spec 4.7.1).
      ["bogus", true],
      [null, false],
      ["ended", false],
    ];
    for (const [meta, expected] of modes) {
      setServedMeta(meta, FRESH_SAVED_AT);
      post.mockClear();
      const { unmount } = renderBar();

      await fire("online");
      const afterOnline = post.mock.calls.length;
      await broadcast({ type: "fresh-ready", url: PATH });
      const afterFreshReady = post.mock.calls.length;
      await advance(PROBE_EVERY_MS);
      const afterTimer = post.mock.calls.length;

      expect([afterOnline, afterFreshReady, afterTimer], `meta ${String(meta)}`).toEqual(
        expected ? [1, 2, 3] : [0, 0, 0],
      );
      unmount();
    }
  });

  test("the probe names this page's path, without the query, and waits past the worker's own budgets", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();

    await fire("online");

    expect(probes()).toEqual([{ type: "probe", url: PATH }]);
    // The worker's probe fetches the page under NAV_BUDGET_MS and may then ask
    // the status route under STATUS_TIMEOUT_MS; a page that gave up sooner would
    // read a slow `saved` as nothing. It stays under the 30-second cadence so a
    // reply that never comes frees the next tick.
    const timeoutMs = post.mock.calls[0]?.[1].timeoutMs ?? 0;
    expect(timeoutMs).toBeGreaterThan(NAV_BUDGET_MS + STATUS_TIMEOUT_MS);
    expect(timeoutMs).toBeLessThan(PROBE_EVERY_MS);
  });

  test("a fresh-ready for this page's path probes; one for another path, or another message, does not", async () => {
    setServedMeta("slow", FRESH_SAVED_AT);
    renderBar();

    await broadcast({ type: "fresh-ready", url: OTHER_PATH });
    await broadcast({ type: "fresh-ready", url: `${PATH}?s=today` });
    await broadcast({ type: "save-failed", url: PATH, reason: "quota" });
    await broadcast({ type: "purged", showId: "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b" });
    await broadcast(null);
    expect(post).not.toHaveBeenCalled();

    await broadcast({ type: "fresh-ready", url: PATH });
    expect(probes()).toEqual([{ type: "probe", url: PATH }]);
  });

  test("every 30 seconds while navigator.onLine is true", async () => {
    setServedMeta("server-error", FRESH_SAVED_AT);
    renderBar();

    await advance(PROBE_EVERY_MS - 1);
    expect(post).toHaveBeenCalledTimes(0);
    await advance(1);
    expect(post).toHaveBeenCalledTimes(1);
    await advance(PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("the 30-second timer stops when navigator.onLine turns false, and the online event restarts it", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    await advance(PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(1);

    await fire("offline");
    await advance(3 * PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(1);

    // The online event probes at once and starts the timer again.
    await fire("online");
    expect(post).toHaveBeenCalledTimes(2);
    await advance(PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(3);
  });

  test("a bar that mounts with no connection starts no timer until the online event", async () => {
    onLine.mockReturnValue(false);
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();

    await advance(3 * PROBE_EVERY_MS);
    expect(post).not.toHaveBeenCalled();

    await fire("online");
    expect(post).toHaveBeenCalledTimes(1);
    await advance(PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("a second online event during a probe does not start a second probe, nor does anything else", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    const answer = holdNextReply();

    await fire("online");
    await fire("online");
    await broadcast({ type: "fresh-ready", url: PATH });
    await advance(PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(1);

    // Once the reply is in, the next trigger probes again.
    await answer({ outcome: "failed" });
    await fire("online");
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe("SavedCopyBar recovery: what each reply does", () => {
  test("saved shows updating, writes the session flag, then reloads, and probes no more", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    expect(barState()).toBe("saved-fresh");
    let flagAtReload: Array<[string, string]> | null = null;
    reload.mockImplementation(() => {
      flagAtReload = sessionEntries();
    });
    post.mockResolvedValueOnce({ outcome: "saved" });

    await fire("online");

    expect(barState()).toBe("updating");
    expect(barText()).toBe(UPDATING_TEXT);
    expect(reload).toHaveBeenCalledTimes(1);
    // The flag is written before the reload, so the next page can read it.
    expect(flagAtReload).toHaveLength(1);
    expect(sessionEntries()).toHaveLength(1);

    await fire("online");
    await broadcast({ type: "fresh-ready", url: PATH });
    await advance(2 * PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("purged reloads at once and leaves the bar and the session as they were", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    const before = barText();
    premiseHolds(
      "the saved copy shows its time and age",
      before === SAVED_TEXT(FRESH_SAVED_AT, "30 min ago"),
    );
    post.mockResolvedValueOnce({ outcome: "purged" });

    await fire("online");

    expect(reload).toHaveBeenCalledTimes(1);
    expect(barState()).toBe("saved-fresh");
    expect(barText()).toBe(before);
    expect(sessionEntries()).toEqual([]);
  });

  test("ended shows ended without reloading, and probes no more", async () => {
    setServedMeta("slow", FRESH_SAVED_AT);
    renderBar();
    post.mockResolvedValueOnce({ outcome: "ended" });

    await fire("online");

    expect(barState()).toBe("ended");
    expect(barText()).toBe(
      `This show has ended. You're seeing the last version, from ${at(FRESH_SAVED_AT)}.`,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(sessionEntries()).toEqual([]);

    await fire("online");
    await advance(2 * PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test.each(NO_CHANGE_REPLIES)(
    "%s changes nothing, and the next trigger probes again",
    async (outcome) => {
      setServedMeta("offline", FRESH_SAVED_AT);
      renderBar();
      const before = barText();
      post.mockResolvedValueOnce({ outcome } as PostResult);

      await fire("online");

      expect(post).toHaveBeenCalledTimes(1);
      expect(barState()).toBe("saved-fresh");
      expect(barText()).toBe(before);
      expect(reload).not.toHaveBeenCalled();
      expect(sessionEntries()).toEqual([]);

      // The same bar still recovers on a later saved reply.
      post.mockResolvedValueOnce({ outcome: "saved" });
      await fire("online");
      expect(barState()).toBe("updating");
      expect(reload).toHaveBeenCalledTimes(1);
    },
  );
});

describe("SavedCopyBar recovery: the session flag", () => {
  /** Runs a saved recovery and returns what it left in the session for the next page. */
  async function recoverAndReload(): Promise<Array<[string, string]>> {
    setServedMeta("offline", FRESH_SAVED_AT);
    const { unmount } = renderBar();
    post.mockResolvedValueOnce({ outcome: "saved" });
    await fire("online");
    premiseHolds("the recovery reloaded", reload.mock.calls.length === 1);
    const left = sessionEntries();
    premiseHolds("the recovery left exactly one session entry", left.length === 1);
    unmount();
    // The reload brings the fresh page, which is live: no meta.
    setServedMeta(null);
    return left;
  }

  test("the next page consumes the flag once: updated for 4 seconds, then hidden, and never again", async () => {
    await recoverAndReload();

    const { unmount } = renderBar();
    expect(barState()).toBe("updated");
    expect(barText()).toBe(UPDATED_TEXT);
    expect(sessionEntries()).toEqual([]);

    await advance(UPDATED_FOR_MS - 1);
    expect(barState()).toBe("updated");
    await advance(1);
    expect(barState()).toBe("hidden");
    unmount();

    // A later mount in the same session finds no flag.
    renderBar();
    expect(barState()).toBe("hidden");
  });

  test("StrictMode's second effect run neither loses the flag nor cuts the 4 seconds short", async () => {
    await recoverAndReload();

    render(
      <StrictMode>
        <SavedCopyBar {...props()} />
      </StrictMode>,
    );
    expect(barState()).toBe("updated");
    expect(sessionEntries()).toEqual([]);

    await advance(UPDATED_FOR_MS - 1);
    expect(barState()).toBe("updated");
    await advance(1);
    expect(barState()).toBe("hidden");
  });

  test("a session store that throws on read still lets the bar show its saved copy", () => {
    // Blocked site data throws a SecurityError on access. Uncaught in the mount
    // effect it would reach the error boundary and take the page down with it.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();

    expect(barState()).toBe("saved-fresh");
    expect(barText()).toBe(SAVED_TEXT(FRESH_SAVED_AT, "30 min ago"));
  });

  test("a session store that throws on write still shows updating and reloads", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    post.mockResolvedValueOnce({ outcome: "saved" });

    await fire("online");

    expect(barState()).toBe("updating");
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("SavedCopyBar recovery: compound transitions (spec 4.7.2)", () => {
  test("the age tick crossing 6 hours during updating keeps updating", async () => {
    // 30 seconds short of 6 hours at mount; the first age tick (60 s) crosses it.
    const savedAt = new Date(NOW_MS - 6 * HOUR_MS + 30_000).toISOString();

    // Without a recovery the same tick moves the copy to saved-old.
    setServedMeta("offline", savedAt);
    const control = renderBar();
    expect(barState()).toBe("saved-fresh");
    await advance(MINUTE_MS);
    premiseHolds("the tick crosses the 6-hour line", barState() === "saved-old");
    control.unmount();

    vi.setSystemTime(NOW_MS);
    renderBar();
    post.mockResolvedValueOnce({ outcome: "saved" });
    await fire("online");
    expect(barState()).toBe("updating");

    await advance(MINUTE_MS);
    expect(barState()).toBe("updating");
    expect(barText()).toBe(UPDATING_TEXT);
  });

  test("an RSC refresh during updating cancels the recovery and renders the live page", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    const { rerender } = renderBar();
    post.mockResolvedValueOnce({ outcome: "saved" });
    await fire("online");
    expect(barState()).toBe("updating");

    rerender(<SavedCopyBar {...props({ renderedAt: REFRESHED_AT })} />);

    // Live, online, sheet fine.
    expect(barState()).toBe("hidden");
    await fire("online");
    await advance(2 * PROBE_EVERY_MS);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test("an RSC refresh while a probe is out drops its reply: no updating, no flag, no reload", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    const { rerender } = renderBar();
    const answer = holdNextReply();
    await fire("online");
    expect(post).toHaveBeenCalledTimes(1);

    rerender(<SavedCopyBar {...props({ renderedAt: REFRESHED_AT })} />);
    await answer({ outcome: "saved" });

    expect(barState()).toBe("hidden");
    expect(reload).not.toHaveBeenCalled();
    expect(sessionEntries()).toEqual([]);
  });

  test("an RSC refresh after ended renders the live page", async () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    const { rerender } = renderBar();
    post.mockResolvedValueOnce({ outcome: "ended" });
    await fire("online");
    expect(barState()).toBe("ended");

    rerender(<SavedCopyBar {...props({ renderedAt: REFRESHED_AT })} />);
    expect(barState()).toBe("hidden");
  });
});

describe("SavedCopyBar: the section in the URL (spec 4.7.4)", () => {
  test.each(["offline", "slow", "server-error", "ended"])(
    "a copy served %s puts the rendered section in s and keeps the other parameters",
    (mode) => {
      setServedMeta(mode, FRESH_SAVED_AT);
      mountSectionsWrapper("schedule");
      const replace = vi.spyOn(window.history, "replaceState");

      renderBar();

      // `null` state, as CrewSections' own pushState passes: Next's patched
      // history copies its router state in and syncs useSearchParams; a state
      // carrying Next's own marker would bypass that sync.
      expect(replace.mock.calls).toEqual([[null, "", `${PATH}?s=schedule&gate=skip`]]);
      expect(window.location.pathname + window.location.search).toBe(
        `${PATH}?s=schedule&gate=skip`,
      );
    },
  );

  test("a URL with no s gains one", () => {
    window.history.replaceState(null, "", PATH);
    setServedMeta("offline", FRESH_SAVED_AT);
    mountSectionsWrapper("crew");
    const replace = vi.spyOn(window.history, "replaceState");

    renderBar();

    expect(replace.mock.calls).toEqual([[null, "", `${PATH}?s=crew`]]);
  });

  test("a live page leaves the URL alone", () => {
    mountSectionsWrapper("schedule");
    const replace = vi.spyOn(window.history, "replaceState");

    const live = renderBar();
    expect(replace).not.toHaveBeenCalled();
    live.unmount();

    // The same page served as a saved copy rewrites it.
    setServedMeta("offline", FRESH_SAVED_AT);
    renderBar();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  test("no attribute, an empty one, or no wrapper leaves the URL alone", () => {
    setServedMeta("offline", FRESH_SAVED_AT);
    const replace = vi.spyOn(window.history, "replaceState");

    const noWrapper = renderBar();
    noWrapper.unmount();
    const wrapper = mountSectionsWrapper(null);
    const noAttribute = renderBar();
    noAttribute.unmount();
    wrapper.setAttribute("data-active-section", "");
    const empty = renderBar();
    empty.unmount();
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?s=today&gate=skip");

    wrapper.setAttribute("data-active-section", "gear");
    renderBar();
    expect(replace.mock.calls).toEqual([[null, "", `${PATH}?s=gear&gate=skip`]]);
  });
});
