// @vitest-environment jsdom
/**
 * tests/components/auth/avatarMenuReportFlush.test.tsx
 *
 * "Not you? Switch person" waits up to 3 seconds for queued reports before it
 * submits (crew offline spec 2026-10-26 §5.1, §8), so a report goes out under the
 * name that wrote it rather than being refused after the switch. With nothing
 * held the clear still starts inside the tap (ruling D5,
 * tests/components/auth/avatarMenuSavedCopy.test.tsx).
 */
import "@testing-library/jest-dom/vitest";
import { IDBFactory } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AvatarMenu } from "@/components/auth/AvatarMenu";
import { PENDING_TIMEOUT_MS } from "@/components/shared/pendingTimeout";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";
import { markerAttributes } from "@/lib/offline/marker";
import { enqueueReport } from "@/lib/reports/offlineQueue";
import { createReportSender, reportSender } from "@/lib/reports/offlineSender";
import { premise } from "@/tests/_shared/premise";

const ROUTE = {
  slug: "east-coast",
  shareToken: "t".repeat(64),
  showId: "11111111-1111-1111-1111-111111111111",
};

/** The bound, as a literal: a case reading the component's constant could not tell it from any other. */
const FLUSH_WAIT_MS = 3_000;

let events: string[] = [];

function heldAction() {
  const action = vi.fn(async (_formData: FormData): Promise<ClearIdentityResult> => {
    events.push("clear");
    return new Promise<ClearIdentityResult>(() => undefined);
  });
  return action;
}

function installWorker(): void {
  const controller = {
    postMessage(message: unknown, transfer: readonly unknown[]) {
      events.push(`post:${(message as { type?: string }).type ?? "?"}`);
      (transfer[0] as MessagePort).postMessage({ outcome: "ack" });
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { controller },
  });
}

function openAndTap(action: ReturnType<typeof heldAction>): void {
  render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);
  act(() => {
    fireEvent.click(screen.getByTestId("avatar-menu-trigger"));
  });
  act(() => {
    fireEvent.click(screen.getByTestId("avatar-menu-switch-person"));
  });
}

beforeEach(() => {
  events = [];
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {
  cleanup();
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the flush before a name switch", () => {
  test("a flush in progress holds back the purge and the clear, which then run in order", async () => {
    let release: () => void = () => undefined;
    const flush = vi
      .spyOn(reportSender, "flush")
      .mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    installWorker();
    const action = heldAction();
    openAndTap(action);

    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);

    release();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
    expect(events.slice(0, 2)).toEqual(["post:purge-show", "clear"]);
  });

  test("nothing held: the clear starts inside the tap", () => {
    vi.spyOn(reportSender, "flush").mockReturnValue(null);
    const action = heldAction();
    openAndTap(action);
    expect(action).toHaveBeenCalledTimes(1);
  });

  test("the bound is 3 seconds", () => {
    const flush = vi.spyOn(reportSender, "flush").mockReturnValue(null);
    openAndTap(heldAction());
    expect(flush).toHaveBeenCalledWith(FLUSH_WAIT_MS);
  });

  test("offline the row does nothing, so nothing flushes", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const flush = vi.spyOn(reportSender, "flush").mockReturnValue(null);
    const action = heldAction();
    openAndTap(action);
    expect(flush).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  test("a switch drops the leaving person's report drafts, and only theirs", () => {
    vi.spyOn(reportSender, "flush").mockReturnValue(null);
    const marker = document.createElement("template");
    for (const [name, value] of Object.entries(
      markerAttributes({
        disposition: "save",
        showId: ROUTE.showId,
        renderedAt: "2026-11-07T12:00:00.000Z",
        epoch: 1,
        viewer: "viewer-a",
        assets: [],
      }),
    )) {
      marker.setAttribute(name, value);
    }
    document.body.appendChild(marker);
    const row = (writer: string | null) =>
      JSON.stringify({ idempotencyKey: "k", draft: "d", status: "composing", writer });
    sessionStorage.setItem("fxav-report-attempt-footer-crew-east-coast", row("viewer-a"));
    sessionStorage.setItem("fxav-report-attempt-card-x", row("viewer-a"));
    sessionStorage.setItem("fxav-report-attempt-footer-crew-other", row("viewer-c"));
    sessionStorage.setItem("unrelated", "keep me");

    openAndTap(heldAction());

    expect(sessionStorage.getItem("fxav-report-attempt-footer-crew-east-coast")).toBeNull();
    expect(sessionStorage.getItem("fxav-report-attempt-card-x")).toBeNull();
    expect(sessionStorage.getItem("fxav-report-attempt-footer-crew-other")).not.toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep me");
    marker.remove();
    sessionStorage.clear();
  });

  test("storage that refuses access never stops the switch", () => {
    vi.spyOn(reportSender, "flush").mockReturnValue(null);
    const marker = document.createElement("template");
    for (const [name, value] of Object.entries(
      markerAttributes({
        disposition: "save",
        showId: ROUTE.showId,
        renderedAt: "2026-11-07T12:00:00.000Z",
        epoch: 1,
        viewer: "viewer-a",
        assets: [],
      }),
    )) {
      marker.setAttribute(name, value);
    }
    document.body.appendChild(marker);
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const action = heldAction();
    openAndTap(action);
    expect(action).toHaveBeenCalledTimes(1);
    marker.remove();
  });

  test("with no author on the page, a switch drops nothing", () => {
    vi.spyOn(reportSender, "flush").mockReturnValue(null);
    sessionStorage.setItem(
      "fxav-report-attempt-footer-crew-east-coast",
      JSON.stringify({ idempotencyKey: "k", draft: "d", status: "composing", writer: null }),
    );
    openAndTap(heldAction());
    expect(sessionStorage.getItem("fxav-report-attempt-footer-crew-east-coast")).not.toBeNull();
    sessionStorage.clear();
  });

  test("a real sender stuck on a dead POST lets the clear go at 3000 ms and not before", async () => {
    await enqueueReport({
      id: "00000000-0000-4000-8000-000000000001",
      showId: ROUTE.showId,
      slug: null,
      surface: "crew",
      surfaceId: "footer-crew",
      context: {},
      message: "held",
      writtenAt: "2026-11-07T12:00:00.000Z",
      pageRenderedAt: null,
      writer: "viewer-a",
      status: "queued",
      errorCode: null,
    });
    premise("the wait ends before the switch watchdog", PENDING_TIMEOUT_MS, FLUSH_WAIT_MS);
    let posts = 0;
    const sender = createReportSender({
      fetchImpl: (() => {
        posts += 1;
        return new Promise<Response>(() => undefined);
      }) as typeof fetch,
    });
    sender.noteQueued(1);
    vi.spyOn(reportSender, "flush").mockImplementation((ms) => sender.flush(ms));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const action = heldAction();
    openAndTap(action);
    await vi.waitFor(() => expect(posts).toBe(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FLUSH_WAIT_MS - 1000);
    });
    expect(action).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
