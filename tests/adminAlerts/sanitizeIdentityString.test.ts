import { describe, it, expect } from "vitest";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
describe("sanitizeIdentityString", () => {
  it("strips control/bidi/zero-width chars", () => {
    expect(sanitizeIdentityString("a‮b​c\nd", { includePii: true })).toBe("abc d");
  });
  it("redacts token substrings always, even with includePii", () => {
    const t = "x".repeat(40);
    expect(sanitizeIdentityString(`file ${t}`, { includePii: true })).toBe("file [redacted-token]");
  });
  it("redacts email only when !includePii", () => {
    expect(sanitizeIdentityString("bob jane@x.com", { includePii: false })).toBe(
      "bob [redacted-email]",
    );
    expect(sanitizeIdentityString("bob jane@x.com", { includePii: true })).toBe("bob jane@x.com");
  });
  it("redacts a boundary-straddling token BEFORE capping (no leaked prefix)", () => {
    // Filler is DOT (outside the token class [A-Za-z0-9+/_-]) so it does NOT
    // merge with the token — the 40-char "a" token is an isolated run that
    // straddles the 120 cap. Under a broken cap-FIRST impl, slice(0,120) leaves
    // only ~10 "a"s (<24 → NOT redacted) and no "[redacted-token]" marker, so
    // the toContain assertion FAILS. This makes the test actually distinguish
    // redact-before-cap from cap-before-redact (Codex F22 / anti-tautology).
    // 100 dots: the 40-char token spans chars 100..140 (straddles the 120 cap
    // in the ORIGINAL string); after redact-first the result is 100 dots +
    // "[redacted-token]" = 116 chars (≤120, marker survives). Under cap-FIRST
    // the slice keeps 100 dots + 20 "a"s → the 20-a run fails not.toMatch(/a{20,}/)
    // AND no marker → toContain fails. So this input distinguishes the two orders.
    const s = ".".repeat(100) + "a".repeat(40);
    const out = sanitizeIdentityString(s, { includePii: true });
    expect(out).not.toMatch(/a{20,}/); // no live token prefix survived
    expect(out).toContain("[redacted-token]");
    expect(out.length).toBeLessThanOrEqual(121); // 120 + ellipsis
  });
  it("does not redact a 23-char run, redacts a 24-char run", () => {
    expect(sanitizeIdentityString("a".repeat(23), { includePii: true })).toBe("a".repeat(23));
    expect(sanitizeIdentityString("a".repeat(24), { includePii: true })).toBe("[redacted-token]");
  });
});
