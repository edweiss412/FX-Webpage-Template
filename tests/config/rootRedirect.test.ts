/**
 * tests/config/rootRedirect.test.ts (root-collapse spec §7.1)
 *
 * Structural pin: the root "/" redirect lives at the CONFIG layer
 * (next.config.ts `redirects()`), not in a page component — config
 * redirects emit a true first-hop 307 with a `Location` header
 * (root-collapse spec §4.1 / C-1), unlike `redirect()` inside a
 * Server Component (meta-tag in a 200 response).
 *
 * Catches: the redirect entry being dropped, retargeted, or flipped
 * to permanent (308) while the front-door shape is still young.
 */
import { describe, expect, test } from "vitest";

import nextConfig from "@/next.config";

describe("root-collapse §4.1 — config-layer root redirect", () => {
  test('redirects() includes { source: "/", destination: "/auth/sign-in?next=/admin", permanent: false }', async () => {
    expect(typeof nextConfig.redirects).toBe("function");
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: "/",
        destination: "/auth/sign-in?next=/admin",
        permanent: false,
      }),
    );
  });
});
