/**
 * tests/config/step3StagedRedirect.test.ts (Step-3 consolidation, spec §4.6)
 *
 * Structural pin: the standalone /admin/onboarding/staged/[session]/[file]
 * recovery page was folded into the unified Step-3 review surface. Its URL now
 * 307s (permanent:false — reversible) to /admin at the CONFIG layer, so old /
 * bookmarked / re_apply_url links land on the session's home instead of a 404.
 */
import { describe, expect, test } from "vitest";

import nextConfig from "@/next.config";

describe("step-3 consolidation §4.6 — config-layer staged-URL redirect", () => {
  test("307s /admin/onboarding/staged/:wizardSessionId/:driveFileId to /admin", async () => {
    expect(typeof nextConfig.redirects).toBe("function");
    const redirects = await nextConfig.redirects!();
    const entry = redirects.find((r) => r.source.includes("/admin/onboarding/staged/"));
    expect(entry).toBeTruthy();
    expect(entry!.destination).toBe("/admin");
    expect(entry!.permanent).toBe(false);
  });
});
