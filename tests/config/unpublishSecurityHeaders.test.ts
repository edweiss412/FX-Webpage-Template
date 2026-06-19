/**
 * tests/config/unpublishSecurityHeaders.test.ts (M12.13 secret-hygiene)
 *
 * Structural pin: the unpublish confirm route is reached at a URL carrying a
 * single-use bearer token (`?token=…&r=…`). The CONFIG layer
 * (next.config.ts `headers()`) must set `Referrer-Policy: no-referrer` +
 * `Cache-Control: no-store` on that route AND its consume API so the raw token
 * never leaks into the `Referer` header (→ app/proxy/access logs) and the
 * token-bearing response stays out of shared/browser caches.
 *
 * Scope must be PRECISE: the confirm page `/show/:slug/unpublish` and the
 * consume API `/api/show/:slug/unpublish` are covered; the crew page
 * `/show/:slug/:shareToken` is NOT (it keeps its normal headers).
 *
 * Catches: the header block being dropped, weakened (referrer leaks, response
 * cached), or broadened to swallow the crew route.
 */
import { describe, expect, test } from "vitest";

import nextConfig from "@/next.config";

const NO_LEAK = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cache-Control", value: "no-store" },
];

describe("M12.13 secret-hygiene — config-layer no-leak headers on the unpublish route", () => {
  test("headers() sets no-referrer + no-store on the confirm page and consume API", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const headers = await nextConfig.headers!();

    for (const source of ["/show/:slug/unpublish", "/api/show/:slug/unpublish"]) {
      const entry = headers.find((h) => h.source === source);
      expect(entry, `expected a headers() entry for ${source}`).toBeDefined();
      expect(entry!.headers).toEqual(expect.arrayContaining(NO_LEAK));
    }
  });

  test("does NOT cover the crew page /show/:slug/:shareToken", async () => {
    const headers = await nextConfig.headers!();
    // No entry may match the crew route — neither an exact :shareToken source
    // nor a broadened /show/:slug/* wildcard.
    for (const h of headers) {
      expect(h.source).not.toBe("/show/:slug/:shareToken");
      expect(h.source).not.toMatch(/^\/show\/:slug(\/:\w+\*?|\/\(.*\)|\/\*)?$/);
    }
  });
});
