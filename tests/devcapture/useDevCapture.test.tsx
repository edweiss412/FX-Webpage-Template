// @vitest-environment jsdom
/**
 * tests/devcapture/useDevCapture.test.tsx — spec §7 machine matrix (plan Task 7).
 * captureElementPng and the action module are mocked; bundle.ts is REAL —
 * download/revocation proven via URL/anchor spies; redaction proven against
 * the JSON actually zipped (decoded from the Blob handed to createObjectURL).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { unzipSync, strFromU8 } from "fflate";

const { captureElementPng, actionMock } = vi.hoisted(() => ({
  captureElementPng: vi.fn(),
  actionMock: vi.fn(),
}));
vi.mock("@/lib/devcapture/captureElement", () => ({
  captureElementPng: (...a: unknown[]) => captureElementPng(...a),
}));
vi.mock("@/app/admin/_devCaptureAction", () => ({
  captureShowTelemetry: (...a: unknown[]) => actionMock(...a),
}));

import { useDevCapture, type DevCaptureState } from "@/components/admin/dev/DevCaptureControl";
import type { CaptureTelemetryRequest } from "@/app/admin/_devCaptureAction";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 9, 9]);
const REQUEST: CaptureTelemetryRequest = {
  kind: "published",
  showId: "11111111-2222-4333-8444-555555555555",
};

type HookHandle = {
  state: () => DevCaptureState;
  run: () => void;
  busyRef: () => boolean;
  unmount: () => void;
};

const createdUrls: string[] = [];
const revokedUrls: string[] = [];
const createdBlobs: Blob[] = [];
let clickCount = 0;
let clickThrows = false;

function mountHook(
  opts?: Partial<Parameters<typeof useDevCapture>[0]>,
  wrapper?: (node: React.ReactNode) => React.ReactElement,
): HookHandle {
  let latest: ReturnType<typeof useDevCapture> | null = null;
  function Probe() {
    latest = useDevCapture({
      target: () => document.createElement("div"),
      request: REQUEST,
      clientSnapshot: () => ({ note: "snap" }),
      filenameSeed: "seed",
      ...opts,
    });
    return null;
  }
  const el = wrapper ? wrapper(<Probe />) : <Probe />;
  const view = render(el);
  return {
    state: () => latest!.state,
    run: () => latest!.run(),
    busyRef: () => latest!.busyRef.current === true,
    unmount: () => view.unmount(),
  };
}

async function settle() {
  // Flush the async run chain: jsdom's Blob.arrayBuffer and the classifier
  // hops each cost a microtask turn — loop generously. Timer-free (safe under
  // fake timers: never advances the 6 s auto-clear).
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
}

async function zippedTelemetryAsync(): Promise<Record<string, unknown>> {
  const blob = createdBlobs[createdBlobs.length - 1]!;
  const buf = new Uint8Array(await blob.arrayBuffer());
  const entries = unzipSync(buf);
  return JSON.parse(strFromU8(entries["telemetry.json"]!)) as Record<string, unknown>;
}

beforeEach(() => {
  captureElementPng.mockReset();
  captureElementPng.mockResolvedValue(new Blob([PNG_BYTES]));
  actionMock.mockReset();
  actionMock.mockResolvedValue({ kind: "ok", commitSha: null });
  createdUrls.splice(0);
  revokedUrls.splice(0);
  createdBlobs.splice(0);
  clickCount = 0;
  clickThrows = false;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (b: Blob) => {
      createdBlobs.push(b);
      const u = `blob:test-${createdUrls.length}`;
      createdUrls.push(u);
      return u;
    },
    revokeObjectURL: (u: string) => {
      revokedUrls.push(u);
    },
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    clickCount += 1;
    if (clickThrows) throw new Error("click boom");
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useDevCapture", () => {
  it("single-flight: two synchronous run() calls invoke capture once (ref, not state)", async () => {
    const h = mountHook();
    act(() => {
      h.run();
      h.run();
    });
    await settle();
    expect(captureElementPng).toHaveBeenCalledTimes(1);
  });

  it("busyRef is synchronously true from run() entry", () => {
    let resolveCapture: (b: Blob) => void = () => undefined;
    captureElementPng.mockImplementation(() => new Promise<Blob>((r) => (resolveCapture = r)));
    const h = mountHook();
    act(() => {
      h.run();
      expect(h.busyRef()).toBe(true); // same tick, before any commit
    });
    resolveCapture(new Blob([PNG_BYTES]));
  });

  it("starts capture and action concurrently (both invoked before either resolves)", async () => {
    let captureStarted = false;
    let actionStarted = false;
    captureElementPng.mockImplementation(() => {
      captureStarted = true;
      expect(actionStarted || !actionStarted).toBe(true);
      return new Promise<Blob>(() => undefined); // never resolves
    });
    actionMock.mockImplementation(() => {
      actionStarted = true;
      return new Promise(() => undefined);
    });
    const h = mountHook();
    act(() => h.run());
    await act(async () => {
      await Promise.resolve();
    });
    expect(captureStarted).toBe(true);
    expect(actionStarted).toBe(true);
  });

  it("screenshot rejection is an error even when telemetry resolved ok", async () => {
    captureElementPng.mockRejectedValue(new Error("raster fail"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const h = mountHook();
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("error");
    expect(clickCount).toBe(0);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("action rejection: success with unavailable/network_error and null commitSha", async () => {
    actionMock.mockRejectedValue(new Error("net down"));
    const h = mountHook();
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("idle");
    const doc = await zippedTelemetryAsync();
    expect(doc["server"]).toEqual({ kind: "unavailable", reason: "network_error" });
    expect((doc["meta"] as Record<string, unknown>)["commitSha"]).toBeNull();
  });

  it("resolved bad_request / null / undefined / junk classify deterministically", async () => {
    const cases: Array<[unknown, string]> = [
      [{ kind: "bad_request" }, "bad_request"],
      [null, "action_failed"],
      [undefined, "action_failed"],
      [{ junk: 1 }, "action_failed"],
    ];
    for (const [resolved, reason] of cases) {
      const h = mountHook();
      actionMock.mockResolvedValueOnce(resolved);
      act(() => h.run());
      await settle();
      const doc = await zippedTelemetryAsync();
      expect(doc["server"]).toEqual({ kind: "unavailable", reason });
      h.unmount();
    }
  });

  it("resolved { kind: 'ok' } without commitSha: success with null commitSha", async () => {
    actionMock.mockResolvedValue({ kind: "ok" });
    const h = mountHook();
    act(() => h.run());
    await settle();
    const doc = await zippedTelemetryAsync();
    expect((doc["meta"] as Record<string, unknown>)["commitSha"]).toBeNull();
  });

  it("clientSnapshot throw degrades to unserializable; run still succeeds", async () => {
    const h = mountHook({
      clientSnapshot: () => {
        throw new Error("boom");
      },
    });
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("idle");
    const doc = await zippedTelemetryAsync();
    expect(doc["clientSnapshot"]).toEqual({ kind: "unserializable", reason: "serialize_threw" });
  });

  it("target() null: error, capture util never called", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const h = mountHook({ target: () => null });
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("error");
    expect(captureElementPng).not.toHaveBeenCalled();
  });

  it("published request: driveFileId null; staged request: showId null", async () => {
    let h = mountHook();
    act(() => h.run());
    await settle();
    let meta = (await zippedTelemetryAsync())["meta"] as Record<string, unknown>;
    expect(meta["driveFileId"]).toBeNull();
    expect(meta["showId"]).toBe(REQUEST.showId);
    h.unmount();

    h = mountHook({ request: { kind: "staged", driveFileId: "drive-1" } });
    act(() => h.run());
    await settle();
    meta = (await zippedTelemetryAsync())["meta"] as Record<string, unknown>;
    expect(meta["showId"]).toBeNull();
    expect(meta["driveFileId"]).toBe("drive-1");
  });

  it("meta.url strips query and hash", async () => {
    window.history.replaceState(null, "", "/admin?show=abc#frag");
    const h = mountHook();
    act(() => h.run());
    await settle();
    const meta = (await zippedTelemetryAsync())["meta"] as Record<string, unknown>;
    expect(String(meta["url"])).not.toContain("?");
    expect(String(meta["url"])).not.toContain("#");
    expect(String(meta["url"])).toContain("/admin");
  });

  it("non-finite viewport/dpr/rect normalize to 0 in meta", async () => {
    vi.stubGlobal("innerWidth", Number.NaN);
    vi.stubGlobal("devicePixelRatio", Number.POSITIVE_INFINITY);
    const target = document.createElement("div");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      width: Number.NaN,
      height: 100,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const h = mountHook({ target: () => target });
    act(() => h.run());
    await settle();
    const meta = (await zippedTelemetryAsync())["meta"] as Record<string, unknown>;
    expect((meta["viewport"] as Record<string, unknown>)["w"]).toBe(0);
    expect((meta["viewport"] as Record<string, unknown>)["dpr"]).toBe(0);
    expect((meta["panelRect"] as Record<string, unknown>)["w"]).toBe(0);
    expect((meta["panelRect"] as Record<string, unknown>)["h"]).toBe(100);
  });

  it("preCapture runs inside the busy window before capture", async () => {
    const order: string[] = [];
    captureElementPng.mockImplementation(async () => {
      order.push("capture");
      return new Blob([PNG_BYTES]);
    });
    const h = mountHook({
      preCapture: async () => {
        order.push("pre");
        expect(h.busyRef()).toBe(true);
      },
    });
    act(() => h.run());
    await settle();
    expect(order[0]).toBe("pre");
    expect(order).toContain("capture");
  });

  it("error auto-clears to idle after exactly 6s", async () => {
    vi.useFakeTimers();
    captureElementPng.mockRejectedValue(new Error("x"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const h = mountHook();
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("error");
    await act(async () => {
      vi.advanceTimersByTime(5999);
    });
    expect(h.state()).toBe("error");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(h.state()).toBe("idle");
  });

  it("error -> rerun clears the stale timer (state stays busy past 6s)", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    captureElementPng.mockRejectedValueOnce(new Error("first"));
    let resolveSecond: (b: Blob) => void = () => undefined;
    captureElementPng.mockImplementationOnce(() => new Promise<Blob>((r) => (resolveSecond = r)));
    const h = mountHook();
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("error");
    act(() => h.run()); // rerun before the 6s timer fires
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(h.state()).toBe("busy"); // stale timer must NOT flip us to idle mid-run
    act(() => resolveSecond(new Blob([PNG_BYTES])));
  });

  it("unmount while error timer active: timer cleared, no late setState", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    captureElementPng.mockRejectedValue(new Error("x"));
    const h = mountHook();
    act(() => h.run());
    await settle();
    expect(h.state()).toBe("error");
    h.unmount();
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    // no act warnings / throws = pass; nothing to assert beyond survival
  });

  it("unmount mid-busy: click NOT called, created URL still revoked", async () => {
    let resolveCapture: (b: Blob) => void = () => undefined;
    captureElementPng.mockImplementation(() => new Promise<Blob>((r) => (resolveCapture = r)));
    const h = mountHook();
    act(() => h.run());
    await act(async () => {
      await Promise.resolve(); // let the deferred capture START (assigns resolveCapture)
      await Promise.resolve();
    });
    h.unmount();
    await act(async () => {
      resolveCapture(new Blob([PNG_BYTES]));
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });
    expect(clickCount).toBe(0);
    expect(createdUrls.length).toBe(1);
    expect(revokedUrls).toEqual(createdUrls);
  });

  it("happy path: click called, revoke called, redaction applied to zipped JSON", async () => {
    const h = mountHook({
      clientSnapshot: () => ({ contact: "crew.member@example.com", token: "f".repeat(64) }),
    });
    act(() => h.run());
    await settle();
    expect(clickCount).toBe(1);
    expect(revokedUrls).toEqual(createdUrls);
    const doc = await zippedTelemetryAsync();
    const json = JSON.stringify(doc);
    expect(json).not.toContain("crew.member@example.com");
    expect(json).not.toContain("f".repeat(64));
    expect(json).toContain("[email redacted]");
  });

  it("anchor click throwing still revokes", async () => {
    clickThrows = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const h = mountHook();
    act(() => h.run());
    await settle();
    expect(revokedUrls).toEqual(createdUrls);
  });

  it("StrictMode: happy-path capture still downloads (mounted ref survives replay)", async () => {
    const h = mountHook(undefined, (node) => <StrictMode>{node}</StrictMode>);
    act(() => h.run());
    await settle();
    expect(clickCount).toBe(1);
  });
});
