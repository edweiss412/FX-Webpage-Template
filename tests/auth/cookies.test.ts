import { describe, expect, test } from "vitest";

import {
  clearSessionCookie,
  decodeSessionCookieValue,
  encodeSessionCookieValue,
  setSessionCookie,
} from "@/lib/auth/cookies";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const token = "11111111-1111-4111-8111-111111111111";
const show_id = "22222222-2222-4222-8222-222222222222";

describe("signed-link session cookie helpers", () => {
  test("encodes and decodes the strict v1 session envelope", () => {
    const encoded = encodeSessionCookieValue({ token, show_id });
    expect(encoded).toBe(encodeURIComponent(JSON.stringify({ v: 1, token, show_id })));
    expect(decodeSessionCookieValue(encoded)).toEqual({ token, show_id });
  });

  test("rejects malformed or future-version cookie envelopes", () => {
    expect(decodeSessionCookieValue(undefined)).toBeNull();
    expect(decodeSessionCookieValue("%xy")).toBeNull();
    expect(decodeSessionCookieValue(encodeURIComponent("not json"))).toBeNull();
    expect(
      decodeSessionCookieValue(encodeURIComponent(JSON.stringify({ v: 2, token, show_id }))),
    ).toBeNull();
    expect(
      decodeSessionCookieValue(
        encodeURIComponent(JSON.stringify({ v: 1, token, show_id, extra: true })),
      ),
    ).toBeNull();
  });

  test("sets and clears a single host-wide __Host cookie with full attributes", () => {
    const value = encodeSessionCookieValue({ token, show_id });
    expect(setSessionCookie(value, { maxAgeSec: 43200 })).toBe(
      `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=43200`,
    );
    expect(clearSessionCookie()).toBe(
      `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
  });
});
