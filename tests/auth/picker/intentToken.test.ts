import { createHmac } from "node:crypto";
import { describe, expect, test } from "vitest";

import {
  signPickerIntent,
  verifyPickerIntent,
  type PickerIntentPayload,
} from "@/lib/auth/picker/intentToken";

const SIGNING_KEY = "0".repeat(64);
const SHARE_TOKEN = "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345";
const NOW = 1_750_000_000; // fixed "now" in epoch seconds; tests pass it explicitly

function payload(exp: number): PickerIntentPayload {
  return { slug: "sample-show", shareToken: SHARE_TOKEN, exp };
}

/**
 * Sign an arbitrary (possibly malformed) payload object with the real HMAC so
 * verification reaches the isPayload() shape gate rather than failing on the
 * signature. This is how a non-number exp is reachable: signPickerIntent's
 * type only constrains compile-time callers, not the wire format.
 */
function signRaw(raw: unknown): string {
  const body = Buffer.from(JSON.stringify(raw)).toString("base64url");
  const sig = createHmac("sha256", Buffer.from(SIGNING_KEY, "hex"))
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

describe("verifyPickerIntent expiry boundary", () => {
  test("PIN: exp === nowSeconds is still VALID (comparison is `exp < now`, so the token lives through its exp second inclusive)", () => {
    // Contract (lib/auth/picker/intentToken.ts): rejection is
    // `parsed.exp < nowSeconds` — strictly-less-than. A token whose exp
    // equals the current second verifies. Spec is silent on the boundary;
    // this pins current behavior.
    const token = signPickerIntent(payload(NOW), SIGNING_KEY);
    expect(verifyPickerIntent(token, SIGNING_KEY, NOW)).toEqual(payload(NOW));
  });

  test("exp one second in the past is rejected", () => {
    const token = signPickerIntent(payload(NOW - 1), SIGNING_KEY);
    expect(verifyPickerIntent(token, SIGNING_KEY, NOW)).toBeNull();
  });

  test("negative exp is rejected (integer, so it passes the shape gate and fails the expiry check)", () => {
    const token = signPickerIntent(payload(-1), SIGNING_KEY);
    expect(verifyPickerIntent(token, SIGNING_KEY, NOW)).toBeNull();
  });

  test("non-number exp on a correctly signed body is rejected by the payload shape gate", () => {
    const stringExp = signRaw({
      slug: "sample-show",
      shareToken: SHARE_TOKEN,
      exp: String(NOW + 60),
    });
    expect(verifyPickerIntent(stringExp, SIGNING_KEY, NOW)).toBeNull();
  });

  test("non-integer numeric exp is rejected (Number.isInteger gate)", () => {
    const floatExp = signRaw({ slug: "sample-show", shareToken: SHARE_TOKEN, exp: NOW + 60.5 });
    expect(verifyPickerIntent(floatExp, SIGNING_KEY, NOW)).toBeNull();

    const nanExp = signRaw({ slug: "sample-show", shareToken: SHARE_TOKEN, exp: null });
    expect(verifyPickerIntent(nanExp, SIGNING_KEY, NOW)).toBeNull();
  });

  test("control: a future exp verifies (guards against the suite passing because everything rejects)", () => {
    const token = signPickerIntent(payload(NOW + 60), SIGNING_KEY);
    expect(verifyPickerIntent(token, SIGNING_KEY, NOW)).toEqual(payload(NOW + 60));
  });
});
