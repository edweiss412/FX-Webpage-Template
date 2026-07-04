import { describe, expect, test } from "vitest";

import { auditAuthSource, auditProjectAuthChains } from "@/lib/audit/authPrimitives";
import { PROTECTED_ROUTES, classifyTrustDomain } from "@/lib/audit/trustDomains";

describe("X.3 trust-domain auth-chain audit", () => {
  test("live project routes are classified and protected access is ordered", () => {
    expect(auditProjectAuthChains()).toEqual([]);
  });

  test("protected route registry covers post-pivot picker and API surfaces", () => {
    expect(auditProjectAuthChains({ mode: "classification-only" })).toEqual([]);
    expect(PROTECTED_ROUTES.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "app/api/auth/picker-bootstrap/route.ts",
        "app/api/show/[slug]/version/route.ts",
        "app/api/report/route.ts",
        "app/show/[slug]/[shareToken]/page.tsx",
      ]),
    );
    expect(classifyTrustDomain("app/api/auth/picker-bootstrap/route.ts")).toBe("auth-library");
    expect(classifyTrustDomain("app/api/show/[slug]/version/route.ts")).toBe("auth-library");
  });

  test("developer-tier surfaces gate on requireDeveloper (regression pin)", () => {
    // Durable per-route pin (developer-tier §10.2): if a future edit accidentally
    // reverts one of these gates to requireAdmin, drops the row, or turns the
    // chain into an auth-library/public exception, this fails with a
    // developer-specific message — not just the generic auditProjectAuthChains()
    // toEqual([]). Survives even if someone edits the recognizer.
    const DEVELOPER_ROUTES = [
      "app/admin/dev/page.tsx",
      "app/admin/dev/source-link-dim/page.tsx",
      "app/admin/dev/observability-dim/page.tsx",
      "app/admin/observability/page.tsx",
      "app/api/admin/onboarding/reap-stale-sessions/route.ts",
    ] as const;

    const byPath = new Map(PROTECTED_ROUTES.map((route) => [route.path, route]));
    for (const path of DEVELOPER_ROUTES) {
      const route = byPath.get(path);
      expect(route, `${path} must be registered in PROTECTED_ROUTES`).toBeDefined();
      const chain = route!.chain;
      expect(
        Array.isArray(chain),
        `${path} must have an ordered requireDeveloper chain, not "${String(chain)}"`,
      ).toBe(true);
      expect(
        (chain as readonly string[])[0],
        `${path} must gate on requireDeveloper (accidental revert to requireAdmin?)`,
      ).toBe("requireDeveloper");
    }
  });

  test("source-level audit rejects unclassified API route entries", () => {
    const findings = auditAuthSource(
      "app/api/example/route.ts",
      ["export async function GET() {", "  return Response.json({ ok: true });", "}"].join("\n"),
    );

    expect(findings).toContain("app/api/example/route.ts is not classified in TRUST_DOMAINS");
  });
});
