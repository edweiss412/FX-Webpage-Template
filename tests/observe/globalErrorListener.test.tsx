// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const clientLogMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observe/clientLog", () => ({ clientLog: clientLogMock }));

import { GlobalErrorListener } from "@/components/observe/GlobalErrorListener";
import { describeClientValue } from "@/lib/observe/describeClientValue";

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
    // The detail gains the projection's runtime type tag, which is what separates
    // a rejection with the string "0" from one with the number 0. Derived from the
    // projection so the two cannot drift apart into a hardcoded expectation.
    expect(clientLogMock).toHaveBeenCalledWith(
      "error",
      "client.root",
      "unhandled promise rejection",
      undefined,
      "CLIENT_UNHANDLED_REJECTION",
      describeClientValue(reason).detail,
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
    // Still derived from the fixture, so the cap assertion fails if DETAIL_CAP
    // moves. The tag occupies the first characters, so fewer of the reason survive.
    expect(detail).toBe(describeClientValue(reason).detail.slice(0, 300));
  });

  test("a plain-object rejection reason persists its OWN fields, not [object Object]", () => {
    render(<GlobalErrorListener />);
    const reason = { code: "PGRST301", message: "planted" };
    dispatchRejection(reason);
    const call = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_UNHANDLED_REJECTION");
    expect(call).toBeDefined();
    const detail = call![5] as string;
    expect(detail).not.toBe("[object Object]");
    expect(detail).toContain(reason.code);
    expect(detail).toContain(reason.message);
  });

  test("null and undefined reasons still yield an empty detail (limit 9)", () => {
    // Preserved deliberately: routing them through the projection would send the
    // strings "null" and "undefined", which reads worse in app_events than an
    // empty field and changes behaviour the row does not ask about.
    render(<GlobalErrorListener />);
    dispatchRejection(null);
    const call = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_UNHANDLED_REJECTION");
    expect(call![5]).toBe("");
  });

  test("a non-Error window throw persists event.error's fields beside file:line", () => {
    // The third dark site, which the row named neither of. The handler never read
    // event.error at all, so a plain object thrown at the window lost its fields
    // entirely — not collapsed to "[object Object]" like the other two paths,
    // simply absent.
    render(<GlobalErrorListener />);
    const thrown = { code: "E_CHUNK", message: "load failed" };
    const evt = new ErrorEvent("error", {
      message: "boom",
      filename: "https://x.test/chunk.js",
      lineno: 42,
    });
    Object.defineProperty(evt, "error", { value: thrown, configurable: true });
    window.dispatchEvent(evt);
    const call = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_WINDOW_ERROR");
    expect(call).toBeDefined();
    const detail = call![5] as string;
    expect(detail).toContain("https://x.test/chunk.js:42");
    expect(detail).toContain(thrown.code);
    expect(detail).toContain(thrown.message);
  });

  test("an Error window throw keeps today's exact file:line detail", () => {
    render(<GlobalErrorListener />);
    const evt = new ErrorEvent("error", {
      message: "boom",
      filename: "https://x.test/a.js",
      lineno: 7,
    });
    Object.defineProperty(evt, "error", { value: new Error("boom"), configurable: true });
    window.dispatchEvent(evt);
    const call = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_WINDOW_ERROR");
    expect(call![5]).toBe("https://x.test/a.js:7");
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
    window.dispatchEvent(
      new ErrorEvent("error", { message: "single", filename: "f.js", lineno: 1 }),
    );
    expect(clientLogMock).toHaveBeenCalledTimes(1);
  });
});
