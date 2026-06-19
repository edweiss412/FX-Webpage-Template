import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindingMatchesActiveAdmin,
  mintIdFor,
  recipientBindingFor,
} from "@/lib/sync/unpublishBinding";

describe("unpublish recipient binding (spec §4.3/§5)", () => {
  const showId = "00000000-0000-4000-8000-000000000001";
  const token = "tok-fixture-1";
  const mintId = mintIdFor(token);

  it("mintIdFor = sha256(token) hex prefix 16, token-distinct", () => {
    expect(mintId).toMatch(/^[0-9a-f]{16}$/);
    expect(mintIdFor("tok-fixture-2")).not.toBe(mintId);
  });

  it("recipientBindingFor is 16-hex, distinct per email/show/mint (capability-scoped)", () => {
    const r = recipientBindingFor("doug@example.com", showId, mintId);
    expect(r).toMatch(/^[0-9a-f]{16}$/);
    expect(recipientBindingFor("other@example.com", showId, mintId)).not.toBe(r);
    expect(
      recipientBindingFor("doug@example.com", "00000000-0000-4000-8000-000000000002", mintId),
    ).not.toBe(r);
    expect(recipientBindingFor("doug@example.com", showId, mintIdFor("tok-fixture-2"))).not.toBe(r);
  });

  it("canonicalizes the recipient email before binding (case/whitespace-insensitive)", () => {
    const r = recipientBindingFor("doug@example.com", showId, mintId);
    expect(recipientBindingFor("  Doug@Example.COM ", showId, mintId)).toBe(r);
  });

  it("throws loudly when the email canonicalizes to null (programmer error upstream)", () => {
    expect(() => recipientBindingFor("   ", showId, mintId)).toThrow(/canonical/i);
    expect(() => recipientBindingFor("", showId, mintId)).toThrow(/canonical/i);
  });

  it("bindingMatchesActiveAdmin: matches an unrevoked row; rejects other-show/prior-mint/unknown r", () => {
    const rows = [{ email: "doug@example.com" }, { email: "amy@example.com" }];
    const r = recipientBindingFor("amy@example.com", showId, mintId);
    expect(bindingMatchesActiveAdmin(rows, r, showId, mintId)).toBe(true);
    expect(bindingMatchesActiveAdmin(rows, r, showId, mintIdFor("tok-fixture-2"))).toBe(false);
    expect(bindingMatchesActiveAdmin(rows, "0123456789abcdef", showId, mintId)).toBe(false);
    expect(bindingMatchesActiveAdmin([], r, showId, mintId)).toBe(false);
  });

  it("structural: module uses the exported HMAC seam and never reads process.env", () => {
    const src = readFileSync(join(process.cwd(), "lib/sync/unpublishBinding.ts"), "utf8");
    expect(src).toContain("hmacWithHashForLogPepper");
    expect(src).not.toContain("process.env");
    // Crypto only via the seam, EXCEPT mintIdFor's plain sha256 of the TOKEN
    // (not the pepper): exactly one createHash call site, zero createHmac.
    // Concrete failure modes pinned: unkeyed binding hash (R7); pepper
    // re-read (R23); email-only scoping (R10 — covered by the tuple tests).
    expect(src.match(/createHash\(/g) ?? []).toHaveLength(1);
    expect(src).not.toMatch(/createHmac/);
  });
});
