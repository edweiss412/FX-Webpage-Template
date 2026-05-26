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

  test("source-level audit rejects unclassified API route entries", () => {
    const findings = auditAuthSource(
      "app/api/example/route.ts",
      [
        "export async function GET() {",
        "  return Response.json({ ok: true });",
        "}",
      ].join("\n"),
    );

    expect(findings).toContain("app/api/example/route.ts is not classified in TRUST_DOMAINS");
  });
});
