// @vitest-environment jsdom
/**
 * <SavedCopyRegistrar> (spec 4.7.7, 4.7.3, 4.8, 4.10): once the page is idle it
 * registers /sw.js, or with the kill switch on unregisters every registration
 * instead; it asks for persistent storage once per page load; on a live page
 * that a worker controls it posts `ensure-saved` for the page and its render
 * time, again on each new render time, at most once per 10 seconds; and when
 * the show has an agenda it loads the agenda viewer code and the pdf.js worker
 * the viewer configures, so both pass through the worker.
 *
 * The transport is mocked (postToWorker, pinned in
 * tests/lib/offline/clientMessaging.test.ts). The service worker container is
 * a plain EventTarget with spied `register` and `getRegistrations`, so a new
 * controller is a property change plus a dispatched `controllerchange`. jsdom
 * has no requestIdleCallback, which is WebKit's case: the registrar waits for
 * `load` and then a timer. The case that stubs requestIdleCallback covers the
 * other engines.
 *
 * The agenda viewer and its worker URL module (components/agenda/pdfWorkerSrc.ts)
 * are mocked, and the mocked react-pdf holds the relative `pdf.worker.mjs` that
 * react-pdf's own index assigns as it loads. In the production build the
 * registrar's own `import("react-pdf")` loaded a second copy of that index,
 * which reset pdf.js's worker URL to that relative path for the whole page, the
 * agenda viewer included (fix-task-25 D2). A registrar that reads the URL from
 * react-pdf therefore fetches `pdf.worker.mjs` here. The last two agenda cases
 * run the real viewer and the real URL module.
 *
 * The telemetry codes are pinned through the real client-error route in
 * savedCopyRegistrarTelemetry.test.tsx.
 *
 * Every absence assertion sits in a case that also shows the presence it is
 * the absence of (preflight ruling D17).
 *
 * Failure modes caught: registration options other than the spec's; work
 * before the page is idle, or the idle wait ignored on either engine path;
 * `persist` asked more than once per page load (per mount, per render time,
 * per StrictMode run); the kill switch registering, or leaving a registration
 * in place; `ensure-saved` on a saved copy, before any worker controls the
 * page, with the query string, twice for one render time, or more often than
 * once per 10 seconds; a throttled render time dropped instead of sent when
 * the window ends; a queued render time sent after the kill switch turned on;
 * the agenda code fetched for a show without an agenda, without a controlling
 * worker, offline, more than once after it succeeded, or from a worker URL
 * other than the one AgendaPdfViewer assigns to pdf.js; a prefetch that could
 * not run or failed (a rejected import, a non-ok worker fetch, a body that
 * fails or stalls past its deadline) never tried again when the phone comes
 * back online; react-pdf imported by the registrar
 * itself; and anything at all, or a throw, where the browser has no service
 * worker container.
 */
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const agenda = vi.hoisted(() => {
  const WORKER_SRC = "/_next/static/media/pdf.worker.min.0f1e2d3c.mjs";
  /** What react-pdf's index assigns to pdf.js's worker URL as it loads. */
  const REACT_PDF_DEFAULT = "pdf.worker.mjs";
  return {
    WORKER_SRC,
    REACT_PDF_DEFAULT,
    reactPdf: () => ({
      pdfjs: { GlobalWorkerOptions: { workerSrc: REACT_PDF_DEFAULT } },
      Document: () => null,
      Page: () => null,
    }),
    viewer: () => ({ AgendaPdfViewer: () => null }),
    workerSrc: () => ({ PDF_WORKER_SRC: WORKER_SRC }),
  };
});

vi.mock("@/lib/offline/client/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/client/messaging")>()),
  postToWorker: vi.fn(),
}));
vi.mock("react-pdf", () => agenda.reactPdf());
vi.mock("@/components/agenda/AgendaPdfViewer", () => agenda.viewer());
vi.mock("@/components/agenda/pdfWorkerSrc", () => agenda.workerSrc());

/**
 * A fresh module graph with the file's agenda mocks, for after a case that
 * replaced them, loaded once here: a later case's dynamic import then resolves
 * the mocks from a warm graph, as it would had no case replaced them, and its
 * `settle()` is not spent loading them.
 */
async function restoreAgendaMocks(): Promise<void> {
  vi.resetModules();
  vi.doUnmock("@/components/agenda/loadAgendaPdfViewer");
  vi.doMock("react-pdf", () => agenda.reactPdf());
  vi.doMock("@/components/agenda/AgendaPdfViewer", () => agenda.viewer());
  vi.doMock("@/components/agenda/pdfWorkerSrc", () => agenda.workerSrc());
  await import("@/components/agenda/AgendaPdfViewer");
  await import("@/components/agenda/pdfWorkerSrc");
}

import {
  SavedCopyRegistrar,
  __resetSavedCopyRegistrarForTests,
  type SavedCopyRegistrarProps,
} from "@/components/offline/SavedCopyRegistrar";
import { postToWorker } from "@/lib/offline/client/messaging";
import { premiseHolds } from "@/tests/_shared/premise";

const post = vi.mocked(postToWorker);

const PATH = "/show/demo-show/abc123";
const FIRST = "2026-10-27T06:03:26.123Z";
const SECOND = "2026-10-27T06:04:01.000Z";
const THIRD = "2026-10-27T06:04:30.000Z";
const FOURTH = "2026-10-27T06:05:12.000Z";

const BASE: SavedCopyRegistrarProps = { renderedAt: FIRST, disabled: false, hasAgenda: false };

function ensureSaved(renderedAt: string) {
  return { type: "ensure-saved", url: PATH, renderedAt };
}

/** The messages the registrar posted, in order. */
function posted(): unknown[] {
  return post.mock.calls.map(([message]) => message);
}

/** One prefetch of the pdf.js worker file: its URL, and a signal its deadline aborts. */
function workerFetch(url: string = agenda.WORKER_SRC): unknown[] {
  return [url, { signal: expect.any(AbortSignal) }];
}

/** A body that sends some bytes, then fails, as a dropped connection does. */
function failingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("// pdf.js worker, part"));
      controller.error(new TypeError("network connection was lost"));
    },
  });
}

/** A body that sends some bytes and then nothing more, never ending. */
function stalledBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("// pdf.js worker, part"));
    },
  });
}

type Installed = {
  container: EventTarget & { controller: ServiceWorker | null };
  register: ReturnType<typeof vi.fn>;
  getRegistrations: ReturnType<typeof vi.fn>;
  unregisters: ReturnType<typeof vi.fn>[];
};

/**
 * A service worker container. `controlled` decides whether a worker already
 * controls the page; `takeControl` is a worker activating and claiming it.
 */
function installServiceWorker({ controlled }: { controlled: boolean }): Installed {
  const unregisters = [vi.fn(() => Promise.resolve(true)), vi.fn(() => Promise.resolve(true))];
  const register = vi.fn(() => Promise.resolve({ scope: "/" }));
  const getRegistrations = vi.fn(() =>
    Promise.resolve(unregisters.map((unregister) => ({ unregister }))),
  );
  const container = Object.assign(new EventTarget(), {
    controller: controlled ? ({ scriptURL: "/sw.js" } as unknown as ServiceWorker) : null,
    register,
    getRegistrations,
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    get: () => container,
  });
  return { container, register, getRegistrations, unregisters };
}

function takeControl(container: Installed["container"]): void {
  act(() => {
    container.controller = { scriptURL: "/sw.js" } as unknown as ServiceWorker;
    container.dispatchEvent(new Event("controllerchange"));
  });
}

function installStorage() {
  const persist = vi.fn(() => Promise.resolve(true));
  Object.defineProperty(window.navigator, "storage", {
    configurable: true,
    value: { persist },
  });
  return persist;
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}

/** The worker's injected meta (spec 4.7.1): this document is a saved copy. */
function serveAsSavedCopy(): void {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "fxav-served");
  meta.setAttribute("content", "offline");
  meta.setAttribute("data-saved-at", FIRST);
  document.head.append(meta);
}

/** Lets the idle timer and any promise chains behind it run (real timers). */
async function settle(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetSavedCopyRegistrarForTests();
  // The query must not reach the message: the worker keys copies by path.
  window.history.replaceState(null, "", `${PATH}?s=venue`);
  post.mockResolvedValue({ outcome: "saved" });
  fetchMock = vi.fn(() => Promise.resolve(new Response("")));
  vi.stubGlobal("fetch", fetchMock);
  setOnline(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  post.mockReset();
  document.head.querySelector('meta[name="fxav-served"]')?.remove();
  for (const key of ["serviceWorker", "storage", "onLine"] as const) {
    Reflect.deleteProperty(window.navigator, key);
  }
  Reflect.deleteProperty(window, "requestIdleCallback");
  Reflect.deleteProperty(window, "cancelIdleCallback");
  Reflect.deleteProperty(document, "readyState");
});

describe("registration (spec 4.7.7)", () => {
  test("registers /sw.js with scope / and updateViaCache none, once the page is idle", async () => {
    const { register } = installServiceWorker({ controlled: false });
    installStorage();

    const { container } = render(<SavedCopyRegistrar {...BASE} />);
    // Nothing happens in the commit itself: the work waits for idle.
    expect(register).not.toHaveBeenCalled();
    // Invariant 5: the registrar renders nothing, so no code can reach the UI.
    expect(container.innerHTML).toBe("");

    await settle();
    expect(register.mock.calls).toEqual([["/sw.js", { scope: "/", updateViaCache: "none" }]]);
  });

  test("waits for requestIdleCallback where the browser has it, and cancels it on unmount", async () => {
    const { register } = installServiceWorker({ controlled: false });
    installStorage();
    const idle: IdleRequestCallback[] = [];
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => idle.push(callback));
    const cancelIdleCallback = vi.fn();
    Object.assign(window, { requestIdleCallback, cancelIdleCallback });

    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();

    act(() => idle[0]!({ didTimeout: false, timeRemaining: () => 50 }));
    await settle();
    expect(register).toHaveBeenCalledTimes(1);

    // A second mount unmounted before idle cancels its callback and never registers.
    cleanup();
    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    expect(requestIdleCallback).toHaveBeenCalledTimes(2);
    cleanup();
    expect(cancelIdleCallback).toHaveBeenCalledWith(2);
    expect(register).toHaveBeenCalledTimes(1);
  });

  test("without requestIdleCallback (WebKit) it waits for load, then a timer", async () => {
    const { register } = installServiceWorker({ controlled: false });
    installStorage();
    Object.defineProperty(document, "readyState", { configurable: true, value: "loading" });

    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    expect(register).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    // The load handler only schedules: registration is a separate task.
    expect(register).not.toHaveBeenCalled();
    await settle();
    expect(register).toHaveBeenCalledTimes(1);
  });

  test("an unmount before the page is idle registers nothing and asks for nothing", async () => {
    const { register } = installServiceWorker({ controlled: false });
    const persist = installStorage();

    const { unmount } = render(<SavedCopyRegistrar {...BASE} />);
    unmount();
    await settle();
    expect(register).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();

    // The same mount left alone does both.
    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    expect(register).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test("persist is asked exactly once per page load, across render times, re-renders and remounts", async () => {
    installServiceWorker({ controlled: true });
    const persist = installStorage();

    const { rerender, unmount } = render(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} />
      </StrictMode>,
    );
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);

    for (const renderedAt of [SECOND, THIRD, FOURTH]) {
      rerender(
        <StrictMode>
          <SavedCopyRegistrar {...BASE} renderedAt={renderedAt} />
        </StrictMode>,
      );
      await settle();
    }
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={FOURTH} hasAgenda />
      </StrictMode>,
    );
    await settle();
    // A soft navigation to another show remounts the registrar in the same page load.
    unmount();
    render(<SavedCopyRegistrar {...BASE} />);
    await settle();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  test("a rejected persist or a browser without StorageManager still registers, and nothing surfaces", async () => {
    const { register } = installServiceWorker({ controlled: false });
    const persist = installStorage();
    persist.mockImplementation(() => Promise.reject(new Error("denied")));

    const rejections: unknown[] = [];
    const record = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", record);
    try {
      render(<SavedCopyRegistrar {...BASE} />);
      await settle();
      expect(persist).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledTimes(1);

      cleanup();
      __resetSavedCopyRegistrarForTests();
      Reflect.deleteProperty(window.navigator, "storage");
      render(<SavedCopyRegistrar {...BASE} />);
      await settle();
      expect(register).toHaveBeenCalledTimes(2);
    } finally {
      process.off("unhandledRejection", record);
    }
    expect(rejections).toEqual([]);
  });
});

describe("kill switch (spec 4.10)", () => {
  test("disabled unregisters every registration and never registers, asks or posts", async () => {
    const { register, getRegistrations, unregisters } = installServiceWorker({ controlled: true });
    const persist = installStorage();

    render(<SavedCopyRegistrar {...BASE} disabled hasAgenda />);
    // The unregistering waits for idle too.
    expect(getRegistrations).not.toHaveBeenCalled();
    await settle();

    expect(getRegistrations).toHaveBeenCalledTimes(1);
    for (const unregister of unregisters) expect(unregister).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("the same page with the switch off registers and saves", async () => {
    const { register, getRegistrations } = installServiceWorker({ controlled: true });
    installStorage();

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();

    expect(register).toHaveBeenCalledTimes(1);
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(posted()).toEqual([ensureSaved(FIRST)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Codex R1 C2: a render time queued inside the throttle window must not go
  // out once the switch has turned the registrar off.
  test("turning the switch on drops a queued ensure-saved; turning it off again sends the current render time", () => {
    vi.useFakeTimers();
    installServiceWorker({ controlled: true });
    installStorage();

    const { rerender } = render(<SavedCopyRegistrar {...BASE} />);
    expect(posted()).toEqual([ensureSaved(FIRST)]);
    // SECOND arrives inside the window and waits for it to end.
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} />);
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} disabled />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(posted()).toEqual([ensureSaved(FIRST)]);

    // The switch back off: the dropped render time is the page's, and it is sent.
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} />);
    expect(posted()).toEqual([ensureSaved(FIRST), ensureSaved(SECOND)]);
  });
});

describe("ensure-saved (spec 4.7.3)", () => {
  test("posts once a worker controls the page, with the path and the render time", async () => {
    const { container } = installServiceWorker({ controlled: false });
    installStorage();

    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    // No worker controls the page yet, so there is nothing to post to.
    expect(post).not.toHaveBeenCalled();

    takeControl(container);
    expect(posted()).toEqual([ensureSaved(FIRST)]);
    const [, options] = post.mock.calls[0]!;
    expect(options.timeoutMs).toBeGreaterThan(0);
  });

  test("a page that a worker already controls posts at mount, before idle", () => {
    installServiceWorker({ controlled: true });
    installStorage();

    render(<SavedCopyRegistrar {...BASE} />);
    expect(posted()).toEqual([ensureSaved(FIRST)]);
  });

  test("a saved copy posts nothing at the render time it was served with, and once per new render time after an RSC refresh, still throttled", async () => {
    vi.useFakeTimers();
    const { register } = installServiceWorker({ controlled: true });
    installStorage();
    serveAsSavedCopy();

    const { rerender } = render(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} />
      </StrictMode>,
    );
    // Async, so the microtask that calls register runs too.
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    // The registrar ran (it registered); the saved copy itself posts nothing.
    expect(register).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();

    // An RSC refresh brings server content with a new render time. The meta
    // stays in the document, but the page is live now, as the bar reads it
    // (spec 4.7.2), so the copy is saved again.
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={SECOND} />
      </StrictMode>,
    );
    expect(posted()).toEqual([ensureSaved(SECOND)]);

    // Still throttled: a render time inside the window waits for it to end.
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={THIRD} />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(9_999));
    expect(posted()).toEqual([ensureSaved(SECOND)]);
    act(() => vi.advanceTimersByTime(1));
    expect(posted()).toEqual([ensureSaved(SECOND), ensureSaved(THIRD)]);
  });

  test("an empty render time is not sent", () => {
    vi.useFakeTimers();
    installServiceWorker({ controlled: true });
    installStorage();

    const { rerender } = render(<SavedCopyRegistrar {...BASE} renderedAt="" />);
    act(() => vi.advanceTimersByTime(30_000));
    expect(post).not.toHaveBeenCalled();

    // The same page with a render time posts it at once: the empty one opened no window.
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={FIRST} />);
    expect(posted()).toEqual([ensureSaved(FIRST)]);
  });

  test("one ensure-saved per render time, at most once per 10 seconds", () => {
    vi.useFakeTimers();
    installServiceWorker({ controlled: true });
    installStorage();

    const { rerender } = render(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} />
      </StrictMode>,
    );
    // StrictMode runs the effect twice; one render time is one message.
    expect(posted()).toEqual([ensureSaved(FIRST)]);

    // A new render time inside the window waits for the window to end.
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={SECOND} />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(9_999));
    expect(posted()).toEqual([ensureSaved(FIRST)]);
    act(() => vi.advanceTimersByTime(1));
    expect(posted()).toEqual([ensureSaved(FIRST), ensureSaved(SECOND)]);

    // That send opened a new window: two more render times inside it become one
    // message, carrying the later, when it ends.
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={THIRD} />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(4_000));
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={FOURTH} />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(5_999));
    expect(posted()).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(posted()).toEqual([ensureSaved(FIRST), ensureSaved(SECOND), ensureSaved(FOURTH)]);

    // A re-render with the same render time posts nothing, even long after.
    act(() => vi.advanceTimersByTime(60_000));
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={FOURTH} hasAgenda={false} />
      </StrictMode>,
    );
    act(() => vi.advanceTimersByTime(60_000));
    expect(posted()).toHaveLength(3);

    // Past the window, a new render time posts at once.
    rerender(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} renderedAt={FIRST} />
      </StrictMode>,
    );
    expect(posted()).toEqual([
      ensureSaved(FIRST),
      ensureSaved(SECOND),
      ensureSaved(FOURTH),
      ensureSaved(FIRST),
    ]);
  });

  test("StrictMode's second run and a worker taking over do not repeat a render time", () => {
    vi.useFakeTimers();
    const { container } = installServiceWorker({ controlled: true });
    installStorage();

    render(
      <StrictMode>
        <SavedCopyRegistrar {...BASE} />
      </StrictMode>,
    );
    expect(posted()).toEqual([ensureSaved(FIRST)]);
    // Past the window, StrictMode's second effect run has sent nothing more.
    act(() => vi.advanceTimersByTime(30_000));
    expect(posted()).toEqual([ensureSaved(FIRST)]);

    // Control lost and taken again re-runs the effect with the same render time.
    act(() => {
      container.controller = null;
      container.dispatchEvent(new Event("controllerchange"));
    });
    takeControl(container);
    act(() => vi.advanceTimersByTime(30_000));
    expect(posted()).toEqual([ensureSaved(FIRST)]);
  });

  test("an unmount inside the window drops the waiting render time", () => {
    vi.useFakeTimers();
    installServiceWorker({ controlled: true });
    installStorage();

    const { rerender, unmount } = render(<SavedCopyRegistrar {...BASE} />);
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} />);
    unmount();
    act(() => vi.advanceTimersByTime(20_000));
    expect(posted()).toEqual([ensureSaved(FIRST)]);
  });
});

describe("agenda viewer code (spec 4.8)", () => {
  test("loads the viewer and fetches its pdf.js worker only when the show has an agenda", async () => {
    installServiceWorker({ controlled: true });
    installStorage();

    const { rerender } = render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    // The registrar ran (it posted); a show without an agenda fetches nothing.
    expect(posted()).toEqual([ensureSaved(FIRST)]);
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);

    // Once per page load: new render times and a remount fetch it again never.
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} hasAgenda />);
    await settle();
    cleanup();
    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("waits for a controlling worker, so the files pass through it", async () => {
    const { container } = installServiceWorker({ controlled: false });
    installStorage();

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    takeControl(container);
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);
  });

  test("waits for idle, and fetches nothing while the phone is offline", async () => {
    installServiceWorker({ controlled: true });
    installStorage();
    setOnline(false);

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    // The same page online fetches it, after idle rather than in the commit.
    cleanup();
    setOnline(true);
    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    expect(fetchMock).not.toHaveBeenCalled();
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);
  });

  // Codex R1 C1: one mounted registrar, never remounted. At most once per page
  // load holds for a prefetch that succeeded; one that never ran or failed is
  // tried again when the phone comes back online.
  test("offline at idle, the same mounted registrar prefetches on the online event", async () => {
    installServiceWorker({ controlled: true });
    installStorage();
    setOnline(false);

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);

    // Done: a later online event fetches nothing more.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a 404 from the pdf.js worker fetch is not done: the next online event fetches it again", async () => {
    installServiceWorker({ controlled: true });
    installStorage();
    fetchMock.mockResolvedValueOnce(new Response("missing", { status: 404 }));

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch(), workerFetch()]);

    // The second answered 200: done, so a later online event fetches nothing.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Codex R2 C1: the worker stores the file as its body passes through, so 200
  // headers are not success. Only a body read to its end is done.
  test("a 200 whose body fails mid-stream is not done: offline, then online, fetches it again", async () => {
    installServiceWorker({ controlled: true });
    installStorage();
    fetchMock.mockResolvedValueOnce(new Response(failingBody(), { status: 200 }));

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(fetchMock.mock.calls).toEqual([workerFetch(), workerFetch()]);

    // That body arrived whole: done, so a later online event fetches nothing.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a body still arriving 60 seconds after the fetch is a failure: the fetch is aborted, and the next online event fetches again", async () => {
    // Warm the mocked modules first, so the prefetch's own imports settle under fake timers.
    await import("@/components/agenda/loadAgendaPdfViewer");
    await import("@/components/agenda/AgendaPdfViewer");
    await import("@/components/agenda/pdfWorkerSrc");
    vi.useFakeTimers();
    installServiceWorker({ controlled: true });
    installStorage();
    let sentAt = Number.NaN;
    fetchMock.mockImplementationOnce(() => {
      sentAt = Date.now();
      return Promise.resolve(new Response(stalledBody(), { status: 200 }));
    });
    const runTimers = async (ms: number): Promise<void> => {
      for (let round = 0; round < 5; round += 1) {
        await act(() => vi.advanceTimersByTimeAsync(round === 0 ? ms : 0));
      }
    };
    const online = async (): Promise<void> => {
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await runTimers(0);
    };

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await runTimers(0);
    expect(fetchMock.mock.calls).toEqual([workerFetch()]);
    premiseHolds("the fetch time was recorded", Number.isFinite(sentAt));
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal;

    await runTimers(sentAt + 59_999 - Date.now());
    await online();
    // Still out: one prefetch at a time.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(false);

    await runTimers(1);
    expect(signal?.aborted).toBe(true);
    await online();
    expect(fetchMock.mock.calls).toEqual([workerFetch(), workerFetch()]);
  });

  test("a rejected viewer import is tried again on the next online event", async () => {
    vi.resetModules();
    const loads = { loader: 0 };
    vi.doMock("@/components/agenda/loadAgendaPdfViewer", () => ({
      loadAgendaPdfViewer: () => {
        loads.loader += 1;
        return loads.loader === 1
          ? Promise.reject(new TypeError("Failed to fetch dynamically imported module"))
          : import("@/components/agenda/AgendaPdfViewer");
      },
    }));
    vi.doMock("react-pdf", () => agenda.reactPdf());
    vi.doMock("@/components/agenda/AgendaPdfViewer", () => agenda.viewer());
    vi.doMock("@/components/agenda/pdfWorkerSrc", () => agenda.workerSrc());
    try {
      const fresh = await import("@/components/offline/SavedCopyRegistrar");
      installServiceWorker({ controlled: true });
      installStorage();

      render(<fresh.SavedCopyRegistrar {...BASE} hasAgenda />);
      await vi.waitFor(() => expect(loads.loader).toBe(1));
      await settle();
      expect(fetchMock).not.toHaveBeenCalled();

      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock.mock.calls).toEqual([workerFetch()]);
      expect(loads.loader).toBe(2);
    } finally {
      await restoreAgendaMocks();
    }
  });

  test("fetches exactly the worker URL the real AgendaPdfViewer assigns to pdf.js", async () => {
    // The real viewer and the real URL module, in a fresh module graph. react-pdf
    // stays mocked (jsdom cannot run pdf.js), holding the default its index assigns.
    vi.resetModules();
    vi.doMock("react-pdf", () => agenda.reactPdf());
    vi.doUnmock("@/components/agenda/AgendaPdfViewer");
    vi.doUnmock("@/components/agenda/pdfWorkerSrc");
    try {
      const fresh = await import("@/components/offline/SavedCopyRegistrar");
      installServiceWorker({ controlled: true });
      installStorage();

      render(<fresh.SavedCopyRegistrar {...BASE} hasAgenda />);
      // The first import of the real viewer module after a cold start can take
      // over a second (CI always starts cold), past vi.waitFor's 1 s default.
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 10_000 });
      const { pdfjs } = await import("react-pdf");
      const assigned = pdfjs.GlobalWorkerOptions.workerSrc;
      // Premise: the real viewer module loaded and replaced react-pdf's default
      // with the bundled worker file.
      expect(assigned).not.toBe(agenda.REACT_PDF_DEFAULT);
      expect(assigned).toMatch(/\/pdfjs-dist\/build\/pdf\.worker\.min\.mjs$/);
      expect(fetchMock.mock.calls).toEqual([workerFetch(assigned)]);
    } finally {
      await restoreAgendaMocks();
    }
  });

  test("loads the viewer through the agenda sheet's own loader, so it warms the chunks the sheet asks for", async () => {
    // Turbopack gives every import() site its own small loader chunk. Only the
    // loader AgendaEmbed uses (components/agenda/loadAgendaPdfViewer.ts) names the
    // chunk the sheet loads, so a registrar with an import() of its own leaves
    // that chunk out of the worker's cache and the sheet fails offline.
    vi.resetModules();
    const loads = { loader: 0 };
    vi.doMock("@/components/agenda/loadAgendaPdfViewer", () => ({
      loadAgendaPdfViewer: () => {
        loads.loader += 1;
        return import("@/components/agenda/AgendaPdfViewer");
      },
    }));
    vi.doMock("react-pdf", () => agenda.reactPdf());
    vi.doMock("@/components/agenda/AgendaPdfViewer", () => agenda.viewer());
    vi.doMock("@/components/agenda/pdfWorkerSrc", () => agenda.workerSrc());
    try {
      const fresh = await import("@/components/offline/SavedCopyRegistrar");
      installServiceWorker({ controlled: true });
      installStorage();

      render(<fresh.SavedCopyRegistrar {...BASE} hasAgenda />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock.mock.calls).toEqual([workerFetch()]);
      expect(loads.loader).toBe(1);
    } finally {
      await restoreAgendaMocks();
    }
  });

  test("loads the viewer's code but never react-pdf itself, whose production chunk resets the worker URL", async () => {
    // A fresh module graph whose react-pdf and viewer mocks count their loads,
    // so no earlier case can have loaded either already.
    vi.resetModules();
    const loads = { reactPdf: 0, viewer: 0 };
    vi.doMock("react-pdf", () => {
      loads.reactPdf += 1;
      return agenda.reactPdf();
    });
    vi.doMock("@/components/agenda/AgendaPdfViewer", () => {
      loads.viewer += 1;
      return agenda.viewer();
    });
    vi.doMock("@/components/agenda/pdfWorkerSrc", () => agenda.workerSrc());
    try {
      const fresh = await import("@/components/offline/SavedCopyRegistrar");
      installServiceWorker({ controlled: true });
      installStorage();

      render(<fresh.SavedCopyRegistrar {...BASE} hasAgenda />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      // The prefetch ran to its end, on the viewer's URL, with the viewer's code
      // loaded (so its chunks pass through the worker too)...
      expect(fetchMock.mock.calls).toEqual([workerFetch()]);
      expect(loads.viewer).toBe(1);
      // ...and never loaded react-pdf.
      expect(loads.reactPdf).toBe(0);
      // Premise: in this graph the counter does see a load.
      await import("react-pdf");
      expect(loads.reactPdf).toBe(1);
    } finally {
      await restoreAgendaMocks();
    }
  });
});

// Codex R3 C, then the coordinator's follow-up: code a page loaded before any
// worker controlled it (the agenda opened while the first visit's worker was
// installing, any lazily loaded component) never passed through the worker,
// and importing it again fetches nothing. On every controlled crew page, agenda
// or not, the registrar fetches each same-origin /_next/static/ file the page
// has loaded, once, through the worker that now controls it.
describe("static files loaded before control (spec 4.8)", () => {
  /** Resource timing entries for `urls`, as the browser lists what the page loaded. */
  function stubLoadedResources(urls: readonly string[]): void {
    const entries = urls.map(
      (name) => ({ name, entryType: "resource" }) as unknown as PerformanceEntry,
    );
    vi.spyOn(performance, "getEntriesByType").mockImplementation((type: string) =>
      type === "resource" ? entries : [],
    );
  }

  /** Files the page loads from elsewhere, or that are not the build's static files: left alone. */
  function notStatic(origin: string): string[] {
    return [
      "https://cdn.example.com/_next/static/chunks/lightbox.55ee.js",
      `${origin}/api/asset/diagram/demo/rev-1/stage.png`,
      `${origin}/fonts/inter-var.woff2`,
      `${origin}/show/demo-show/abc123`,
    ];
  }

  /** A lazily loaded component's files, loaded before control, on a show with no agenda. */
  function lazyComponentLoadedBeforeControl() {
    const origin = window.location.origin;
    const chunk = `${origin}/_next/static/chunks/lightbox.55ee.js`;
    const stylesheet = `${origin}/_next/static/chunks/lightbox.66ff.css`;
    const versioned = `${origin}/_next/static/chunks/app.44dd.js?dpl=abc`;
    stubLoadedResources([
      chunk,
      stylesheet,
      // The same file twice, and once with a fragment: one fetch.
      chunk,
      `${chunk}#again`,
      versioned,
      ...notStatic(origin),
    ]);
    return [chunk, stylesheet, versioned];
  }

  /** One fetch of a loaded file through the worker, under the prefetch's deadline. */
  function loadedFetch(url: string): unknown[] {
    return [url, { signal: expect.any(AbortSignal) }];
  }

  test("on a show with no agenda, the files the page loaded before a worker controlled it are fetched through the worker once it does, once per page load", async () => {
    const { container } = installServiceWorker({ controlled: false });
    installStorage();
    const files = lazyComponentLoadedBeforeControl();

    const { rerender } = render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    // Nothing yet: no worker would store them.
    expect(fetchMock).not.toHaveBeenCalled();

    takeControl(container);
    await settle();
    expect(fetchMock.mock.calls).toEqual(files.map(loadedFetch));

    // Done once each arrived whole: an online event, a new render time and a
    // remount fetch nothing more in this page load.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} />);
    await settle();
    cleanup();
    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(files.length);
  });

  test("with the kill switch on, nothing is fetched; the same page with it off fetches the files", async () => {
    installServiceWorker({ controlled: true });
    installStorage();
    const files = lazyComponentLoadedBeforeControl();

    render(<SavedCopyRegistrar {...BASE} disabled />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    render(<SavedCopyRegistrar {...BASE} />);
    await settle();
    expect(fetchMock.mock.calls).toEqual(files.map(loadedFetch));
  });

  test("on a show with an agenda, the viewer's files loaded before control are fetched beside the pdf.js worker", async () => {
    const { container } = installServiceWorker({ controlled: false });
    installStorage();
    const origin = window.location.origin;
    const loader = `${origin}/_next/static/chunks/agenda-loader.11aa.js`;
    const viewer = `${origin}/_next/static/chunks/agenda-viewer.22bb.js`;
    const stylesheet = `${origin}/_next/static/chunks/agenda-viewer.33cc.css`;
    // The agenda opened before control, so pdf.js loaded its worker file too:
    // the re-store fetches it as a file the page loaded, and the agenda prefetch
    // by the URL the viewer assigns. The second answer is a worker cache hit.
    const pdfWorker = `${origin}${agenda.WORKER_SRC}`;
    stubLoadedResources([loader, viewer, stylesheet, viewer, pdfWorker, ...notStatic(origin)]);

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    takeControl(container);
    await settle();
    const urls = fetchMock.mock.calls.map(([url]) => String(url)).sort();
    expect(urls).toEqual([agenda.WORKER_SRC, loader, viewer, stylesheet, pdfWorker].sort());
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(
      true,
    );
  });

  test.each([
    ["answers 404", () => new Response("missing", { status: 404 })],
    ["has a body that fails mid-stream", () => new Response(failingBody(), { status: 200 })],
  ] as const)(
    "the re-store is not done while a file the page loaded %s: the next online event fetches them all again",
    async (_label, failing) => {
      installServiceWorker({ controlled: true });
      installStorage();
      const files = lazyComponentLoadedBeforeControl();
      const stylesheet = files[1];
      let stylesheetFetches = 0;
      fetchMock.mockImplementation((url: string) => {
        if (url !== stylesheet) return Promise.resolve(new Response(""));
        stylesheetFetches += 1;
        return Promise.resolve(stylesheetFetches === 1 ? failing() : new Response(""));
      });
      const all = files.map(loadedFetch);

      render(<SavedCopyRegistrar {...BASE} />);
      await settle();
      expect(fetchMock.mock.calls).toEqual(all);

      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await settle();
      expect(fetchMock.mock.calls).toEqual([...all, ...all]);

      // All arrived whole the second time: done.
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      await settle();
      expect(fetchMock).toHaveBeenCalledTimes(2 * files.length);
    },
  );
});

describe("no service worker container", () => {
  test("does nothing and throws nothing", async () => {
    const persist = installStorage();
    expect("serviceWorker" in window.navigator).toBe(false);

    const rejections: unknown[] = [];
    const record = (reason: unknown) => {
      rejections.push(reason);
    };
    process.on("unhandledRejection", record);
    try {
      const { rerender } = render(<SavedCopyRegistrar {...BASE} hasAgenda />);
      await settle();
      rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} hasAgenda />);
      await settle();
      rerender(<SavedCopyRegistrar {...BASE} renderedAt={SECOND} disabled />);
      await settle();
    } finally {
      process.off("unhandledRejection", record);
    }

    expect(persist).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rejections).toEqual([]);

    // The same page with a container does all three.
    cleanup();
    installServiceWorker({ controlled: true });
    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a container whose read throws (Firefox with cookies blocked) is no container", async () => {
    const persist = installStorage();
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      get: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });

    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(persist).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    // The same page once the container reads cleanly does all three.
    cleanup();
    installServiceWorker({ controlled: true });
    render(<SavedCopyRegistrar {...BASE} hasAgenda />);
    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
