/**
 * postToWorker (lib/offline/client/messaging.ts): the page side of the
 * page-to-worker protocol (spec 4.3, 4.6, 4.7.3). Each post carries one
 * MessagePort, the worker replies on it, and the page gives up after a bound.
 * With no worker the answer is synchronous (preflight ruling D5), so a caller
 * such as AvatarMenu's bracket stays synchronous when nothing can hold a copy.
 *
 * Runs in Node, whose MessageChannel is a real one: the reply below crosses an
 * actual port pair, not a stand-in.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  postToWorker,
  serviceWorkerContainer,
  type PostResult,
} from "@/lib/offline/client/messaging";
import type { PageMessage } from "@/lib/offline/protocol";

const MESSAGE: PageMessage = { type: "probe", url: "/show/demo-show/abc123" };
const TIMEOUT_MS = 500;

type Post = { message: unknown; transfer: readonly unknown[] };

/**
 * A worker that records each post and answers on the transferred port with
 * `reply`. With no `reply` it never answers.
 */
function fakeWorker(...reply: [unknown?]) {
  const posts: Post[] = [];
  const worker = {
    postMessage(message: unknown, transfer: readonly unknown[]) {
      posts.push({ message, transfer });
      const port = transfer[0];
      if (reply.length > 0 && port instanceof MessagePort) port.postMessage(reply[0]);
    },
  };
  return { worker: worker as unknown as ServiceWorker, posts };
}

function stubNavigator(value: unknown): void {
  vi.stubGlobal("navigator", value);
}

const SECURITY_ERROR_NAVIGATOR = {
  get serviceWorker(): never {
    // Firefox with cookies blocked throws on the property read itself.
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("postToWorker with no worker (ruling D5)", () => {
  test.each([
    ["no navigator", undefined],
    ["no serviceWorker on navigator", {}],
    ["a container with no controller", { serviceWorker: { controller: null } }],
    ["a serviceWorker read that throws", SECURITY_ERROR_NAVIGATOR],
  ])("answers no-worker synchronously with %s", (_label, navigatorValue) => {
    stubNavigator(navigatorValue);
    const result = postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS });
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toStrictEqual({ outcome: "no-worker" });
  });
});

describe("postToWorker with a worker", () => {
  test("posts the message with one port to the controller and resolves with its reply", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { worker, posts } = fakeWorker({ outcome: "saved" });
    stubNavigator({ serviceWorker: { controller: worker } });

    const pending = postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS });

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).resolves.toStrictEqual({ outcome: "saved" });
    expect(posts).toHaveLength(1);
    expect(posts[0]?.message).toStrictEqual(MESSAGE);
    expect(posts[0]?.transfer).toHaveLength(1);
    expect(posts[0]?.transfer[0]).toBeInstanceOf(MessagePort);
    // The reply cleared the timeout, so no timer outlives the post.
    expect(vi.getTimerCount()).toBe(0);
  });

  test("posts to the worker it is given, even when no worker controls the page", async () => {
    const given = fakeWorker({ outcome: "ack" });
    const controller = fakeWorker({ outcome: "kept" });
    stubNavigator({ serviceWorker: { controller: null } });

    await expect(
      postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS, worker: given.worker }),
    ).resolves.toStrictEqual({ outcome: "ack" });
    expect(given.posts).toHaveLength(1);

    stubNavigator({ serviceWorker: { controller: controller.worker } });
    await expect(
      postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS, worker: given.worker }),
    ).resolves.toStrictEqual({ outcome: "ack" });
    expect(given.posts).toHaveLength(2);
    expect(controller.posts).toHaveLength(0);
  });

  test.each(["ack", "saved", "purged", "ended", "failed", "skipped", "kept"])(
    "passes the protocol reply %s through as it came",
    async (outcome) => {
      const { worker } = fakeWorker({ outcome });
      await expect(postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS, worker })).resolves.toStrictEqual(
        { outcome },
      );
    },
  );

  test.each([
    ["an outcome the protocol does not have", { outcome: "deleted" }],
    ["a non-string outcome", { outcome: 3 }],
    ["a bare string", "ended"],
    ["null", null],
    ["an object with no outcome", {}],
  ])("reads %s as failed", async (_label, reply) => {
    const { worker } = fakeWorker(reply);
    await expect(postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS, worker })).resolves.toStrictEqual({
      outcome: "failed",
    });
  });

  test.each([
    ["a redundant worker", "InvalidStateError"],
    ["an uncloneable message", "DataCloneError"],
  ])(
    "resolves failed, leaving no timer behind, when the post throws for %s",
    async (_label, name) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const postMessage = vi.fn(() => {
        throw new DOMException("The post failed.", name);
      });
      const worker = { postMessage } as unknown as ServiceWorker;

      await expect(postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS, worker })).resolves.toStrictEqual(
        { outcome: "failed" },
      );
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test("resolves timeout at the given bound when the worker never replies, and not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { worker, posts } = fakeWorker();
    let result: PostResult | undefined;
    void Promise.resolve(postToWorker(MESSAGE, { timeoutMs: TIMEOUT_MS, worker })).then((value) => {
      result = value;
    });

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(posts).toHaveLength(1);
    expect(result).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(result).toStrictEqual({ outcome: "timeout" });
  });
});

describe("serviceWorkerContainer", () => {
  test("is the page's container when there is one, and null when reading it fails", () => {
    const container = { controller: null };
    stubNavigator({ serviceWorker: container });
    expect(serviceWorkerContainer()).toBe(container);

    stubNavigator(SECURITY_ERROR_NAVIGATOR);
    expect(serviceWorkerContainer()).toBeNull();

    stubNavigator({});
    expect(serviceWorkerContainer()).toBeNull();
  });
});
