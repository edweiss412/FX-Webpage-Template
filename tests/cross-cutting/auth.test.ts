import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { auditM5AuthFile } from "@/lib/audit/authChain";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("X.3 M5 auth-chain semantic audit", () => {
  test("real M5 crew page passes protected-sink dominance checks", () => {
    expect(auditM5AuthFile("app/show/[slug]/page.tsx", read("app/show/[slug]/page.tsx"))).toEqual(
      [],
    );
  });

  test("rejects a crew page that reads protected show data before resolving auth", () => {
    const findings = auditM5AuthFile(
      "app/show/[slug]/page.tsx",
      `
        export default async function ShowPage() {
          const data = await getShowForViewer(showId, viewer);
          const result = await resolveViewer(req, showId, true);
          return data;
        }
        async function resolveViewer() {
          await isAdminSession(req);
          await validateLinkSession(req, { showId });
          await validateGoogleSession(req, { showId });
          await tryRequireAdmin();
        }
      `,
    );

    expect(findings).toContain(
      "app/show/[slug]/page.tsx: getShowForViewer must be dominated by resolveViewer",
    );
  });

  test("real /me page uses identity validator before listing shows", () => {
    expect(auditM5AuthFile("app/me/page.tsx", read("app/me/page.tsx"))).toEqual([]);
  });

  test("rejects /me routes that import the show-bound Google validator", () => {
    const findings = auditM5AuthFile(
      "app/me/page.tsx",
      `
        import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
        export default async function MePage() {
          const result = await validateGoogleSession(req, { showId });
          return result;
        }
      `,
    );

    expect(findings).toContain(
      "app/me/page.tsx: /me must use validateGoogleIdentity, not validateGoogleSession",
    );
  });

  test("bootstrap shell remains public-bootstrap", () => {
    expect(
      auditM5AuthFile("app/show/[slug]/p/page.tsx", read("app/show/[slug]/p/page.tsx")),
    ).toEqual([]);
  });

  test("rejects bootstrap shell imports of protected auth/data readers", () => {
    const findings = auditM5AuthFile(
      "app/show/[slug]/p/page.tsx",
      `
        import { validateLinkSession } from "@/lib/auth/validateLinkSession";
        export default function BootstrapPage() { return null; }
      `,
    );

    expect(findings).toContain(
      "app/show/[slug]/p/page.tsx: public bootstrap shell must not import validateLinkSession",
    );
  });
});
