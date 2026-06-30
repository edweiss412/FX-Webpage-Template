import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
describe("next.config Sentry wrap", () => {
  const src = readFileSync("next.config.ts", "utf8");
  test("withSentryConfig is the OUTER wrapper around withMDX(nextConfig)", () => {
    expect(src).toMatch(/withSentryConfig\(\s*withMDX\(nextConfig\)/);
  });
  test("source-map upload is gated on SENTRY_AUTH_TOKEN (undefined ⇒ skip, no fail)", () => {
    expect(src).toMatch(/authToken:\s*process\.env\.SENTRY_AUTH_TOKEN/);
  });
});
