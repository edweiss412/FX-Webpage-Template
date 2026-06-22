import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  COOKIE_NAME,
  MAX_COOKIE_VALUE_BYTES,
  decodePickerCookie,
  encodePickerCookie,
} from "@/lib/auth/picker/cookieEnvelope";

const TEST_KEY = "0".repeat(64);
const SHOW_A = "11111111-1111-1111-1111-111111111111";
const SHOW_B = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CREW_A = "22222222-2222-2222-2222-222222222222";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signTestEnvelope(payload: string, key: string): string {
  const sig = createHmac("sha256", Buffer.from(key, "hex")).update(payload).digest();
  return `${base64url(Buffer.from(payload))}.${base64url(sig)}`;
}

describe("cookieEnvelope", () => {
  test("round-trips a single entry through HMAC sign and verify", () => {
    const env = { v: 1 as const, selections: { [SHOW_A]: { id: CREW_A, e: 1, t: 1_000_000 } } };

    expect(decodePickerCookie(encodePickerCookie(env, TEST_KEY), TEST_KEY)).toEqual(env);
  });

  test("returns null on signature mismatch", () => {
    const env = { v: 1 as const, selections: { [SHOW_A]: { id: CREW_A, e: 1, t: 0 } } };
    const encoded = encodePickerCookie(env, TEST_KEY);

    expect(decodePickerCookie(encoded.replace(/^./, "Z"), TEST_KEY)).toBeNull();
  });

  test("returns null on malformed envelope fields", () => {
    const malformedPayloads = [
      `{"v":1,"selections":{"not-a-uuid":{"id":"${CREW_A}","e":1,"t":0}}}`,
      `{"v":1,"selections":{"${SHOW_A}":{"id":"not-uuid","e":1,"t":0}}}`,
      `{"v":1,"selections":{"${SHOW_A}":{"id":"${CREW_A}","e":-1,"t":0}}}`,
      `{"v":2,"selections":{}}`,
    ];

    for (const payload of malformedPayloads) {
      expect(decodePickerCookie(signTestEnvelope(payload, TEST_KEY), TEST_KEY)).toBeNull();
    }
  });

  test("MAX_COOKIE_VALUE_BYTES is 3800", () => {
    expect(MAX_COOKIE_VALUE_BYTES).toBe(3800);
  });

  test("LRU-evicts the lowest-t entry when over budget", () => {
    const selections: Record<string, { id: string; e: number; t: number }> = {};
    for (let i = 0; i < 40; i += 1) {
      const showId = `${i.toString(16).padStart(8, "0")}-1111-1111-1111-111111111111`;
      selections[showId] = { id: CREW_A, e: 1, t: 1_000_000 + i };
    }

    const encoded = encodePickerCookie({ v: 1, selections }, TEST_KEY);
    expect(`${COOKIE_NAME}=${encoded}`.length).toBeLessThanOrEqual(MAX_COOKIE_VALUE_BYTES);
    expect(
      decodePickerCookie(encoded, TEST_KEY)?.selections["00000000-1111-1111-1111-111111111111"],
    ).toBeUndefined();
  });

  test("accepts realistic Unix-ms timestamps through Number.MAX_SAFE_INTEGER", () => {
    for (const t of [1_737_028_800_123, Number.MAX_SAFE_INTEGER]) {
      const env = { v: 1 as const, selections: { [SHOW_A]: { id: CREW_A, e: 1, t } } };
      const decoded = decodePickerCookie(encodePickerCookie(env, TEST_KEY), TEST_KEY);

      expect(decoded?.selections[SHOW_A]?.t).toBe(t);
    }
  });

  test("rejects unsafe, negative, and fractional t values", () => {
    for (const t of [Number.MAX_SAFE_INTEGER + 1, -1, 1_737_028_800_123.5]) {
      const payload = JSON.stringify({ v: 1, selections: { [SHOW_A]: { id: CREW_A, e: 1, t } } });

      expect(decodePickerCookie(signTestEnvelope(payload, TEST_KEY), TEST_KEY)).toBeNull();
    }
  });

  test("does not mutate the caller envelope while evicting", () => {
    const env = {
      v: 1 as const,
      selections: { [SHOW_A]: { id: CREW_A, e: 1, t: 1 }, [SHOW_B]: { id: CREW_A, e: 1, t: 2 } },
    };

    encodePickerCookie(env, TEST_KEY);

    expect(Object.keys(env.selections).sort()).toEqual([SHOW_A, SHOW_B].sort());
  });
});

describe("pickerCookieSigningKey", () => {
  const original = process.env.PICKER_COOKIE_SIGNING_KEY;

  afterEach(() => {
    vi.resetModules();
    if (original === undefined) {
      process.env.PICKER_COOKIE_SIGNING_KEY = "0".repeat(64);
    } else {
      process.env.PICKER_COOKIE_SIGNING_KEY = original;
    }
  });

  test("returns a valid 64-char hex key", async () => {
    process.env.PICKER_COOKIE_SIGNING_KEY = "a".repeat(64);
    vi.resetModules();
    const { pickerCookieSigningKey } = await import("@/lib/env/pickerCookieSigningKey");

    expect(pickerCookieSigningKey()).toBe("a".repeat(64));
  });

  test("throws when missing or malformed", async () => {
    for (const value of [undefined, "short", "g".repeat(64)]) {
      if (value === undefined) {
        delete process.env.PICKER_COOKIE_SIGNING_KEY;
      } else {
        process.env.PICKER_COOKIE_SIGNING_KEY = value;
      }
      vi.resetModules();
      const { pickerCookieSigningKey } = await import("@/lib/env/pickerCookieSigningKey");

      expect(() => pickerCookieSigningKey()).toThrow(/PICKER_COOKIE_SIGNING_KEY/);
    }
  });
});
