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
 * the window ends; the agenda code fetched for a show without an agenda,
 * without a controlling worker, offline, more than once, or from a worker URL
 * other than the one AgendaPdfViewer assigns to pdf.js; react-pdf imported by
 * the registrar itself; and anything at all, or a throw, where the browser has
 * no service worker container.
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
    expect(fetchMock.mock.calls).toEqual([[agenda.WORKER_SRC]]);

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
    expect(fetchMock.mock.calls).toEqual([[agenda.WORKER_SRC]]);
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
    expect(fetchMock.mock.calls).toEqual([[agenda.WORKER_SRC]]);
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
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const { pdfjs } = await import("react-pdf");
      const assigned = pdfjs.GlobalWorkerOptions.workerSrc;
      // Premise: the real viewer module loaded and replaced react-pdf's default
      // with the bundled worker file.
      expect(assigned).not.toBe(agenda.REACT_PDF_DEFAULT);
      expect(assigned).toMatch(/\/pdfjs-dist\/build\/pdf\.worker\.min\.mjs$/);
      expect(fetchMock.mock.calls).toEqual([[assigned]]);
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
      expect(fetchMock.mock.calls).toEqual([[agenda.WORKER_SRC]]);
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
