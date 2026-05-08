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

  test("real redeem-link route passes mutation-lock coverage checks", () => {
    expect(
      auditM5AuthFile(
        "app/api/auth/redeem-link/route.ts",
        read("app/api/auth/redeem-link/route.ts"),
      ),
    ).toEqual([]);
  });

  test("rejects redeem-link routes that wrap Supabase mutations in a sidecar JS advisory lock", () => {
    const findings = auditM5AuthFile(
      "app/api/auth/redeem-link/route.ts",
      `
        import { withShowAdvisoryLock } from "@/lib/db/advisoryLock";
        export async function POST(request) {
          return withShowAdvisoryLock(showId, "try", async () => {
            await supabase.from("bootstrap_nonces").update({ consumed_at: now });
            await supabase.rpc("mint_link_session_if_active_kid_matches", {});
          });
        }
      `,
    );

    expect(findings).toContain(
      "app/api/auth/redeem-link/route.ts: redeem-link mutations must be inside lock-taking RPCs, not sidecar withShowAdvisoryLock callbacks",
    );
  });

  test("real OAuth routes pass callback/sign-in/sign-out checks", () => {
    expect(auditM5AuthFile("app/auth/sign-in/page.tsx", read("app/auth/sign-in/page.tsx"))).toEqual(
      [],
    );
    expect(
      auditM5AuthFile("app/auth/callback/route.ts", read("app/auth/callback/route.ts")),
    ).toEqual([]);
    expect(
      auditM5AuthFile("app/auth/sign-out/route.ts", read("app/auth/sign-out/route.ts")),
    ).toEqual([]);
  });

  test("rejects callback routes that redirect before validating next", () => {
    const findings = auditM5AuthFile(
      "app/auth/callback/route.ts",
      `
        export async function GET(request) {
          return NextResponse.redirect(new URL(request.nextUrl.searchParams.get("next"), request.url));
        }
      `,
    );

    expect(findings).toContain(
      "app/auth/callback/route.ts: callback must validate next before redirecting",
    );
  });

  test("rejects sign-out routes that allow GET or omit clearSessionCookie on POST", () => {
    const findings = auditM5AuthFile(
      "app/auth/sign-out/route.ts",
      `
        export async function GET() { return Response.redirect("/auth/sign-in"); }
        export async function POST() { return Response.redirect("/auth/sign-in"); }
      `,
    );

    expect(findings).toContain("app/auth/sign-out/route.ts: GET must return 405");
    expect(findings).toContain(
      "app/auth/sign-out/route.ts: POST must clear the FXAV session with clearSessionCookie",
    );
  });
});
