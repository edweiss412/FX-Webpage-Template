// @vitest-environment jsdom
/**
 * The registrar's two telemetry codes (spec 6), proved through the real
 * client-error route rather than a clientLog spy: the route refuses any source
 * outside its ALLOWED_SOURCES with a 400 (app/api/observe/client-error/route.ts),
 * so a spy would pass on a source the server throws away.
 *
 * Global fetch is stubbed to capture the POST the transport sends
 * (lib/observe/clientErrorTransport.ts), the captured body is replayed as a
 * same-origin Request, built as tests/observe/clientErrorRoute.test.ts builds
 * one, through handleClientError, and `@/lib/log` is mocked the way that suite
 * mocks it, so the assertion is on what the route logs.
 *
 * - A rejected `register` logs CREW_OFFLINE_SW_REGISTER_FAILED (spec 4.7.7).
 * - A `save-failed` broadcast from the worker logs CREW_OFFLINE_SAVE_FAILED.
 *
 * Neither code reaches the UI (invariant 5): the registrar renders nothing.
 *
 * Failure modes caught: a source the route refuses (`client.offline` gives a
 * 400; the mutant is recorded in the commit); a level other than warn; a
 * missing or misspelled code; a log on a broadcast that is not `save-failed`;
 * and a code rendered into the page.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("@/lib/log", () => ({
  log: { error: h.logError, warn: h.logWarn, info: vi.fn(), debug: vi.fn() },
}));

import {
  handleClientError,
  __resetClientErrorStateForTests,
} from "@/app/api/observe/client-error/route";
import {
  SavedCopyRegistrar,
  __resetSavedCopyRegistrarForTests,
  type SavedCopyRegistrarProps,
} from "@/components/offline/SavedCopyRegistrar";
import { __resetClientTransportDedupForTests } from "@/lib/observe/clientErrorTransport";

const PATH = "/show/demo-show/abc123";
const PROPS: SavedCopyRegistrarProps = {
  renderedAt: "2026-10-27T06:03:26.123Z",
  disabled: false,
  hasAgenda: false,
};

type Captured = { url: string; init: RequestInit };
let captured: Captured[];

function installServiceWorker(register: () => Promise<unknown>) {
  const container = Object.assign(new EventTarget(), {
    controller: null,
    register: vi.fn(register),
    getRegistrations: vi.fn(() => Promise.resolve([])),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    get: () => container,
  });
  return container;
}

/** The captured POST, as the same-origin request a browser would send. */
function replay({ init }: Captured): Request {
  return new Request("https://x/api/observe/client-error", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: init.body as string,
  });
}

async function settle(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetSavedCopyRegistrarForTests();
  __resetClientTransportDedupForTests();
  __resetClientErrorStateForTests();
  h.logError.mockReset();
  h.logWarn.mockReset();
  window.history.replaceState(null, "", PATH);
  captured = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      captured.push({ url, init });
      return Promise.resolve(new Response(null, { status: 202 }));
    }),
  );
  Object.defineProperty(window.navigator, "storage", {
    configurable: true,
    value: { persist: vi.fn(() => Promise.resolve(true)) },
  });
  // clientLog writes the console too; keep the test output clean.
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Reflect.deleteProperty(window.navigator, "storage");
});

describe("registrar telemetry through the client-error route (spec 6)", () => {
  test("a failed registration logs CREW_OFFLINE_SW_REGISTER_FAILED as a crew warning", async () => {
    installServiceWorker(() =>
      Promise.reject(new DOMException("The script resource is behind a redirect", "SecurityError")),
    );

    const { container } = render(<SavedCopyRegistrar {...PROPS} />);
    await settle();

    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe("/api/observe/client-error");
    const response = await handleClientError(replay(captured[0]!));
    expect(response.status).toBe(202);
    expect(h.logWarn).toHaveBeenCalledTimes(1);
    expect(h.logWarn.mock.calls[0]![1]).toMatchObject({
      source: "client.crew",
      code: "CREW_OFFLINE_SW_REGISTER_FAILED",
      // The browser's reason rides in the bounded detail field.
      detail: "SecurityError: The script resource is behind a redirect",
    });
    expect(h.logError).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    // Invariant 5: the code never reaches the page.
    expect(container.innerHTML).toBe("");
    expect(document.body.textContent).not.toContain("CREW_OFFLINE");
  });

  test("a save-failed broadcast logs CREW_OFFLINE_SAVE_FAILED; other broadcasts log nothing", async () => {
    const worker = installServiceWorker(() => Promise.resolve({ scope: "/" }));

    const { container } = render(<SavedCopyRegistrar {...PROPS} />);
    await settle();
    // A registration that succeeds sends nothing.
    expect(captured).toEqual([]);

    act(() => {
      worker.dispatchEvent(
        new MessageEvent("message", { data: { type: "fresh-ready", url: PATH } }),
      );
      worker.dispatchEvent(
        new MessageEvent("message", { data: { type: "purged", showId: "show-1" } }),
      );
    });
    expect(captured).toEqual([]);

    act(() => {
      worker.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "save-failed", url: PATH, reason: "quota" },
        }),
      );
    });
    expect(captured).toHaveLength(1);
    const response = await handleClientError(replay(captured[0]!));
    expect(response.status).toBe(202);
    expect(h.logWarn).toHaveBeenCalledTimes(1);
    expect(h.logWarn.mock.calls[0]![1]).toMatchObject({
      source: "client.crew",
      code: "CREW_OFFLINE_SAVE_FAILED",
      detail: "quota",
    });
    expect(h.logError).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
    expect(document.body.textContent).not.toContain("CREW_OFFLINE");
  });
});
