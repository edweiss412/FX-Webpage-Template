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
    // The value leads; file:line trails. See the long-filename case below.
    expect(detail.indexOf(thrown.code)).toBeLessThan(detail.indexOf("chunk.js"));
  });

  test("a long filename cannot truncate away the thrown value", () => {
    // Both parts share one 300-char budget and a filename can eat all of it on its
    // own (data:/blob:/webpack eval sourceURLs routinely do). The value leads, so
    // the truncation costs file:line rather than the thing this handler exists to
    // capture. With the old ordering this assertion fails.
    render(<GlobalErrorListener />);
    const thrown = { code: "E_CHUNK", message: "load failed" };
    const evt = new ErrorEvent("error", {
      message: "boom",
      filename: `https://x.test/${"a".repeat(400)}.js`,
      lineno: 42,
    });
    Object.defineProperty(evt, "error", { value: thrown, configurable: true });
    window.dispatchEvent(evt);
    const detail = clientLogMock.mock.calls.find(
      (c) => c[4] === "CLIENT_WINDOW_ERROR",
    )![5] as string;
    expect(detail.length).toBeLessThanOrEqual(300);
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

  test("both handlers scrub the share token BEFORE capping the detail", () => {
    // Same defect as clientErrorTransport's, one layer earlier: `filename` on a
    // crew page IS a URL carrying the token, and slicing first cuts it into a
    // fragment nothing downstream can match. Eight characters is deliberately
    // below the transport's prefix floor, so this passes only when the scrub
    // runs first rather than because a later pass cleaned up.
    const SECRET = "zzq9-secret-0123456789abcdef";
    const spy = vi
      .spyOn(globalThis, "location", "get")
      .mockReturnValue(new URL(`https://x.test/show/gala/${SECRET}`) as unknown as Location);
    try {
      render(<GlobalErrorListener />);
      const DETAIL_CAP = 300;
      const SURVIVING = 8;

      /**
       * Pad so the token lands EXACTLY astride the cap, leaving `SURVIVING`
       * characters behind a cut.
       *
       * Solved rather than hardcoded, because each handler adds its own prefix to
       * the detail (the window one interpolates the message and appends
       * `:lineno`; the rejection one runs a string through the projection, which
       * adds a type tag). Guessing the offset produced a padding whose token fell
       * entirely PAST the cap, so nothing of it could leak and the assertion held
       * under a mutant that had reintroduced the bug. `project` reproduces the
       * handler's own composition, so the fixture tracks it.
       */
      const padFor = (project: (padded: string) => string): string => {
        let pad = DETAIL_CAP;
        for (let i = 0; i < 8; i++) {
          const at = project("p".repeat(pad)).indexOf(SECRET);
          if (at < 0) throw new Error("the projection dropped the token");
          const delta = DETAIL_CAP - SURVIVING - at;
          if (delta === 0) return "p".repeat(pad);
          pad += delta;
        }
        throw new Error("padding did not converge");
      };

      const winPad = padFor((p) => `boom ${p}${SECRET}:1`);
      window.dispatchEvent(
        new ErrorEvent("error", { message: "boom", filename: `${winPad}${SECRET}`, lineno: 1 }),
      );
      const winCall = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_WINDOW_ERROR");
      expect(String(winCall![5]), "window").not.toContain(SECRET.slice(0, SURVIVING));

      clientLogMock.mockClear();
      const rejPad = padFor((p) => describeClientValue(`${p}${SECRET}`).detail);
      dispatchRejection(`${rejPad}${SECRET}`);
      const rejCall = clientLogMock.mock.calls.find((c) => c[4] === "CLIENT_UNHANDLED_REJECTION");
      expect(String(rejCall![5]), "rejection").not.toContain(SECRET.slice(0, SURVIVING));
    } finally {
      spy.mockRestore();
    }
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
