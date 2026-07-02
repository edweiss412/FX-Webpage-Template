// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const clientLogMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observe/clientLog", () => ({ clientLog: clientLogMock }));

import { GlobalErrorListener } from "@/components/observe/GlobalErrorListener";

function dispatchRejection(reason: unknown): void {
  const evt = new Event("unhandledrejection") as PromiseRejectionEvent;
  Object.defineProperty(evt, "reason", { value: reason, configurable: true });
  window.dispatchEvent(evt);
}

beforeEach(() => {
  clientLogMock.mockClear();
});
afterEach(() => {
  cleanup();
});

describe("GlobalErrorListener", () => {
  test("mount registers a window error listener → CLIENT_WINDOW_ERROR with bounded detail", () => {
    render(<GlobalErrorListener />);
    const message = "boom happened";
    const filename = "https://x.test/chunk.js";
    const lineno = 42;
    window.dispatchEvent(new ErrorEvent("error", { message, filename, lineno }));
    // detail derived from the dispatched event, not hardcoded.
    expect(clientLogMock).toHaveBeenCalledWith(
      "error",
      "client.root",
      message,
      undefined,
      "CLIENT_WINDOW_ERROR",
      `${filename}:${lineno}`,
    );
  });

  test("mount registers an unhandledrejection listener → CLIENT_UNHANDLED_REJECTION", () => {
    render(<GlobalErrorListener />);
    const reason = "promise blew up";
    dispatchRejection(reason);
    expect(clientLogMock).toHaveBeenCalledWith(
      "error",
      "client.root",
      "unhandled promise rejection",
      undefined,
      "CLIENT_UNHANDLED_REJECTION",
      reason,
    );
  });

  test("detail is capped (~300)", () => {
    render(<GlobalErrorListener />);
    const reason = "x".repeat(500);
    dispatchRejection(reason);
    const call = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_UNHANDLED_REJECTION");
    expect(call).toBeDefined();
    const detail = call![5] as string;
    expect(detail.length).toBeLessThanOrEqual(300);
    expect(detail).toBe(reason.slice(0, 300));
  });

  test("unmount removes the listeners (dispatch after unmount does not log)", () => {
    const { unmount } = render(<GlobalErrorListener />);
    unmount();
    window.dispatchEvent(new ErrorEvent("error", { message: "after-unmount" }));
    dispatchRejection("after-unmount");
    expect(clientLogMock).not.toHaveBeenCalled();
  });

  test("double-mount (StrictMode) registers once → one global error logs once", () => {
    render(
      <>
        <GlobalErrorListener />
        <GlobalErrorListener />
      </>,
    );
    window.dispatchEvent(new ErrorEvent("error", { message: "single", filename: "f.js", lineno: 1 }));
    expect(clientLogMock).toHaveBeenCalledTimes(1);
  });
});
