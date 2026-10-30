// @vitest-environment jsdom
/**
 * <SavedCopyMarker> (spec 4.3 "The marker also speaks for client-side
 * renders", 4.6 purge triggers, 4.7.3): it renders the marker the worker reads
 * on a document load, and on mount posts the same disposition to the worker,
 * so an RSC refresh or a soft navigation informs the worker exactly as a
 * document load does. It also reloads its page when the worker announces that
 * the page's show was purged (plan section 1, items 5 and 6).
 *
 * The transport is lib/offline/client/messaging.ts, pinned in
 * tests/lib/offline/clientMessaging.test.ts; here postToWorker is mocked so
 * each reply is under the test's control. reloadPage is mocked because jsdom's
 * location.reload cannot be spied (preflight ruling D6).
 */
import { StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/offline/client/reload", () => ({ reloadPage: vi.fn() }));
vi.mock("@/lib/offline/client/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/client/messaging")>()),
  postToWorker: vi.fn(),
}));

import { SavedCopyMarker } from "@/components/offline/SavedCopyMarker";
import { postToWorker, type PostResult } from "@/lib/offline/client/messaging";
import { reloadPage } from "@/lib/offline/client/reload";
import { readMarker, type Marker } from "@/lib/offline/marker";
import { STATUS_TIMEOUT_MS } from "@/lib/offline/navigation";

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const OTHER_SHOW = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";
const VIEWER = "q3Xk-9_LmZpRt2VbYw0aGhJ4";
const PATH = "/show/demo-show/abc123";

const MARKERS = {
  save: {
    disposition: "save",
    showId: SHOW,
    renderedAt: "2026-10-27T06:03:26.123Z",
    epoch: 4,
    viewer: VIEWER,
    // Characters both renderers escape inside an attribute value.
    assets: ["/api/asset/diagram/abc?v=1&w=2", `/api/asset/diagram/a&quot;b'c"d<e>f&amp;g`],
  },
  keep: { disposition: "keep", showId: SHOW, viewer: VIEWER },
  hold: { disposition: "hold", showId: SHOW },
  // The route's not-found page: the only arm whose marker names no show (spec 4.3).
  check: { disposition: "check", showId: null },
  purge: { disposition: "purge", showId: SHOW },
} as const satisfies Record<Marker["disposition"], Marker>;

const post = vi.mocked(postToWorker);
const reload = vi.mocked(reloadPage);

/**
 * A container whose registration has an active worker but which controls
 * nothing, the state of a hard-reloaded page: the marker must still reach the
 * worker through `ready`, not `controller`.
 */
function installServiceWorker() {
  const active = { scriptURL: "/sw.js" } as unknown as ServiceWorker;
  const container = Object.assign(new EventTarget(), {
    controller: null,
    ready: Promise.resolve({ active }),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    get: () => container,
  });
  return { container, active };
}

function broadcast(container: EventTarget, data: unknown): void {
  act(() => {
    container.dispatchEvent(new MessageEvent("message", { data }));
  });
}

/** Lets the mount effect's ready, post and reply chain run to its end. */
async function settle(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  // The query must not reach the message: the worker keys copies by path.
  window.history.replaceState(null, "", `${PATH}?gate=skip`);
  post.mockResolvedValue({ outcome: "ack" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(window.navigator, "serviceWorker");
});

describe("the rendered marker", () => {
  test.each(Object.values(MARKERS))(
    "reads back as the $disposition marker it was given, server and client render alike",
    (marker) => {
      const server = renderToStaticMarkup(<SavedCopyMarker marker={marker} />);
      expect(readMarker(server)).toStrictEqual({ kind: "valid", marker });

      const { container } = render(<SavedCopyMarker marker={marker} />);
      expect(container.querySelectorAll("template#fxav-saved-copy")).toHaveLength(1);
      expect(readMarker(container.innerHTML)).toStrictEqual({ kind: "valid", marker });
    },
  );
});

describe("posting the disposition on mount", () => {
  test.each([SHOW, null])(
    "a purge marker naming show %s posts one purge with the page path, through the registration's worker",
    async (showId) => {
      const { active } = installServiceWorker();
      const marker: Marker = { disposition: "purge", showId };

      const { rerender } = render(<SavedCopyMarker marker={marker} />);
      await settle();
      // A refresh that renders the same marker again is not a new post.
      rerender(<SavedCopyMarker marker={{ ...marker }} />);
      await settle();

      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        { type: "marker", disposition: "purge", showId, url: PATH },
        expect.objectContaining({ worker: active }),
      );
    },
  );

  test("StrictMode's second effect run does not post a second purge", async () => {
    installServiceWorker();
    render(
      <StrictMode>
        <SavedCopyMarker marker={MARKERS.purge} />
      </StrictMode>,
    );
    await settle();

    expect(post).toHaveBeenCalledTimes(1);
  });

  test("a check marker posts a check of the page path and reloads when the answer is ended", async () => {
    const { active } = installServiceWorker();
    post.mockResolvedValue({ outcome: "ended" });

    render(<SavedCopyMarker marker={MARKERS.check} />);
    await settle();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      { type: "marker", disposition: "check", url: PATH },
      expect.objectContaining({ worker: active }),
    );
    // The worker's check waits up to STATUS_TIMEOUT_MS for the status route;
    // a page that gave up sooner would miss the ended answer.
    expect(post.mock.calls[0]?.[1].timeoutMs).toBeGreaterThan(STATUS_TIMEOUT_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test.each(["purged", "kept", "timeout"] as const)(
    "a check answered %s does not reload",
    async (outcome) => {
      installServiceWorker();
      post.mockResolvedValue({ outcome });

      render(<SavedCopyMarker marker={MARKERS.check} />);
      await settle();

      expect(post).toHaveBeenCalledTimes(1);
      expect(reload).not.toHaveBeenCalled();
    },
  );

  test("a check answered ended after the marker unmounted does not reload", async () => {
    installServiceWorker();
    let answer: (result: PostResult) => void = () => undefined;
    post.mockReturnValue(
      new Promise<PostResult>((resolve) => {
        answer = resolve;
      }),
    );

    const { unmount } = render(<SavedCopyMarker marker={MARKERS.check} />);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);

    unmount();
    answer({ outcome: "ended" });
    await settle();

    expect(reload).not.toHaveBeenCalled();
  });

  test.each(["keep", "hold", "save"] as const)(
    "a %s marker posts nothing, and a purge rendered in its place does",
    async (disposition) => {
      installServiceWorker();

      const { rerender } = render(<SavedCopyMarker marker={MARKERS[disposition]} />);
      await settle();
      expect(post).not.toHaveBeenCalled();

      rerender(<SavedCopyMarker marker={MARKERS.purge} />);
      await settle();
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith(
        { type: "marker", disposition: "purge", showId: SHOW, url: PATH },
        expect.anything(),
      );
    },
  );
});

describe("a purged broadcast", () => {
  test.each([MARKERS.save, MARKERS.keep, MARKERS.hold, MARKERS.purge])(
    "reloads a $disposition page only when it names the page's show",
    async (marker) => {
      const { container } = installServiceWorker();
      render(<SavedCopyMarker marker={marker} />);
      await settle();

      broadcast(container, { type: "purged", showId: OTHER_SHOW });
      broadcast(container, { type: "fresh-ready", url: PATH });
      expect(reload).not.toHaveBeenCalled();

      broadcast(container, { type: "purged", showId: SHOW });
      expect(reload).toHaveBeenCalledTimes(1);
    },
  );

  test("never reloads a page whose marker names no show", async () => {
    const { container } = installServiceWorker();
    render(<SavedCopyMarker marker={MARKERS.check} />);
    await settle();
    expect(post).toHaveBeenCalledTimes(1);

    broadcast(container, { type: "purged", showId: SHOW });
    broadcast(container, { type: "purged", showId: null });
    expect(reload).not.toHaveBeenCalled();
  });

  test("stops reloading once the marker unmounts", async () => {
    const { container } = installServiceWorker();
    const { unmount } = render(<SavedCopyMarker marker={MARKERS.save} />);
    await settle();

    broadcast(container, { type: "purged", showId: SHOW });
    expect(reload).toHaveBeenCalledTimes(1);

    unmount();
    broadcast(container, { type: "purged", showId: SHOW });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("without a usable navigator.serviceWorker", () => {
  test.each([
    [
      "absent",
      () => {
        expect("serviceWorker" in window.navigator).toBe(false);
      },
    ],
    [
      "throwing on read",
      () => {
        Object.defineProperty(window.navigator, "serviceWorker", {
          configurable: true,
          get: () => {
            throw new DOMException("The operation is insecure.", "SecurityError");
          },
        });
      },
    ],
  ])("renders the marker and does nothing else when it is %s", async (_label, arrange) => {
    arrange();

    const { container } = render(<SavedCopyMarker marker={MARKERS.purge} />);
    await settle();

    expect(readMarker(container.innerHTML)).toStrictEqual({
      kind: "valid",
      marker: MARKERS.purge,
    });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
