import { describe, expect, test } from "vitest";

import {
  hostRelativeRedirect,
  InvalidRelativeRedirectPathError,
} from "@/lib/http/hostRelativeRedirect";

describe("hostRelativeRedirect", () => {
  test("defaults to 302 and emits the path verbatim with no origin", () => {
    const res = hostRelativeRedirect("/admin");
    expect(res.status).toBe(302);
    // The whole point: a relative Location cannot flip the host, so the
    // browser resolves it against the address it actually used.
    expect(res.headers.get("location")).toBe("/admin");
  });

  test("honors each status Next itself treats as a redirect", () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(hostRelativeRedirect("/auth/sign-in", status).status).toBe(status);
    }
  });

  test("preserves a query string byte-for-byte", () => {
    const path = "/show/a/b?s=budget&gate=skip";
    expect(hostRelativeRedirect(path).headers.get("location")).toBe(path);
  });

  test("carries no body", async () => {
    const res = hostRelativeRedirect("/me");
    expect(await res.text()).toBe("");
    expect(res.headers.get("location")).toBe("/me");
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["no leading slash", "foo"],
    ["protocol-relative", "//evil.example"],
    ["absolute with scheme", "https://evil.example"],
    ["backslash", "/x\\y"],
    ["control character", "/x\ny"],
  ])("rejects %s", (_label, path) => {
    expect(() => hostRelativeRedirect(path as string)).toThrow(InvalidRelativeRedirectPathError);
  });

  test.each([
    ["null", null],
    ["NaN", Number.NaN],
    ["non-integer", 302.5],
    ["200", 200],
    ["300", 300],
    ["304", 304],
    ["399", 399],
    ["404", 404],
  ])("rejects status %s", (_label, status) => {
    expect(() => hostRelativeRedirect("/admin", status as number)).toThrow(
      InvalidRelativeRedirectPathError,
    );
  });
});
