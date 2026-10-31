/**
 * tests/lib/offline/viewerKey.test.ts
 *
 * The opaque viewer key a saved copy carries (spec §4.3 `data-viewer`). The key
 * is derived from the picker signing key under a fixed label (plan §1 item 1):
 * `subkey = HMAC-SHA256(pickerKey, "fxav-saved-copy-viewer-v1")`, then
 * `base64url(HMAC-SHA256(subkey, showId + ":" + crewMemberId))`.
 */
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { viewerKey } from "@/lib/offline/viewerKey";

vi.mock("@/lib/env/pickerCookieSigningKey", () => ({ pickerCookieSigningKey: vi.fn() }));

const KEY = "0123456789abcdef".repeat(4);
const LABEL = "fxav-saved-copy-viewer-v1";
const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOW_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CREW_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CREW_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.mocked(pickerCookieSigningKey).mockReset();
  vi.mocked(pickerCookieSigningKey).mockReturnValue(KEY);
});

describe("viewerKey", () => {
  test("is deterministic for one show and crew member", () => {
    expect(viewerKey(SHOW_ID, CREW_ID)).toBe(viewerKey(SHOW_ID, CREW_ID));
  });

  test("is base64url with no padding: 32 bytes are 43 characters", () => {
    const key = viewerKey(SHOW_ID, CREW_ID);
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("differs by show and by crew member", () => {
    const key = viewerKey(SHOW_ID, CREW_ID);
    expect(viewerKey(OTHER_SHOW_ID, CREW_ID)).not.toBe(key);
    expect(viewerKey(SHOW_ID, OTHER_CREW_ID)).not.toBe(key);
  });

  test("never contains the crew member id", () => {
    for (const crewId of [CREW_ID, OTHER_CREW_ID]) {
      const key = viewerKey(SHOW_ID, crewId);
      expect(key).not.toContain(crewId);
      expect(key).not.toContain(crewId.replaceAll("-", ""));
      expect(key).not.toContain(Buffer.from(crewId).toString("base64url"));
    }
  });

  test("is keyed by the labelled subkey, not by the picker key itself", () => {
    const message = `${SHOW_ID}:${CREW_ID}`;
    const plain = createHmac("sha256", Buffer.from(KEY, "hex")).update(message).digest("base64url");
    const subkey = createHmac("sha256", Buffer.from(KEY, "hex")).update(LABEL).digest();
    const labelled = createHmac("sha256", subkey).update(message).digest("base64url");

    expect(plain).not.toBe(labelled);
    expect(viewerKey(SHOW_ID, CREW_ID)).not.toBe(plain);
    expect(viewerKey(SHOW_ID, CREW_ID)).toBe(labelled);
  });

  test("changes with the picker key", () => {
    const key = viewerKey(SHOW_ID, CREW_ID);
    vi.mocked(pickerCookieSigningKey).mockReturnValue("f".repeat(64));
    expect(viewerKey(SHOW_ID, CREW_ID)).not.toBe(key);
  });

  test("returns null when the picker key is unavailable", () => {
    vi.mocked(pickerCookieSigningKey).mockImplementation(() => {
      throw new Error("PICKER_COOKIE_SIGNING_KEY is unset; server cannot mint picker cookies");
    });
    expect(viewerKey(SHOW_ID, CREW_ID)).toBeNull();
  });
});
