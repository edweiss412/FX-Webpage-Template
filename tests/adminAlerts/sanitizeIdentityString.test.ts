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
    const s = "y".repeat(110) + "a".repeat(40); // 40-char hex token crosses the 120 cap
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
