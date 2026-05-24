import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { auditM5AuthFile } from "@/lib/audit/authChain";
import { ADMIN_TABLES } from "@/lib/audit/admin-tables.generated";
import {
  auditAuthSource,
  auditProjectAuthChains,
  findDynamicFromCalls,
  fingerprintCallSite,
  getEnclosingSymbol,
  type DynamicFromAllowEntry,
} from "@/lib/audit/authPrimitives";
import {
  CREW_SESSION_CHAINS,
  PROTECTED_ROUTES,
  classifyTrustDomain,
} from "@/lib/audit/trustDomains";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const fixtureRoot = "tests/cross-cutting/fixtures/auth-x3";

function fixture(name: string): { path: string; source: string } {
  const path = join(fixtureRoot, name);
  return { path, source: read(path) };
}

function expectAuthPass(name: string): void {
  const file = fixture(name);
  expect(auditAuthSource(file.path, file.source)).toEqual([]);
}

function expectAuthFail(name: string, expected: string | RegExp): void {
  const file = fixture(name);
  const findings = auditAuthSource(file.path, file.source);
  expect(findings.join("\n")).toMatch(expected);
}

function firstDynamicFrom(path: string, source: string) {
  const call = findDynamicFromCalls(path, source)[0];
  if (!call) throw new Error(`fixture ${path} must contain a dynamic .from(...) call`);
  return call;
}

function dynamicFromAllowEntry(path: string, source: string): DynamicFromAllowEntry {
  const call = firstDynamicFrom(path, source);
  return {
    file: path,
    enclosing_symbol: getEnclosingSymbol(call),
    fingerprint: fingerprintCallSite(call),
    reason: "fixture-reviewed static table resolver",
  };
}

describe("X.3 M5 auth-chain semantic audit", () => {
  test("real M5 crew page passes protected-sink dominance checks", () => {
    expect(
      auditM5AuthFile(
        "app/show/[slug]/[shareToken]/page.tsx",
        read("app/show/[slug]/[shareToken]/page.tsx"),
      ),
    ).toEqual([]);
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

describe("X.3 trust-domain semantic audit", () => {
  test("admin-only table manifest is generated from spec §4.3", () => {
    expect(ADMIN_TABLES).toEqual([
      "shows_internal",
      "sync_log",
      "reports",
      "pending_syncs",
      "pending_ingestions",
      "crew_member_auth",
      "revoked_links",
      "link_sessions",
      "bootstrap_nonces",
      "app_settings",
      "deferred_ingestions",
      "admin_alerts",
      "sync_audit",
      "drive_watch_channels",
      "report_rate_limits",
      "onboarding_scan_manifest",
      "pending_snapshot_uploads",
      "revision_race_cooldowns",
      "wizard_finalize_checkpoints",
      "shows_pending_changes",
      "recovery_drift_cooldowns",
    ]);
  });

  test("trust-domain classifier covers live protected routes explicitly", () => {
    const live = auditProjectAuthChains({ mode: "classification-only" });
    expect(live).toEqual([]);
    expect(PROTECTED_ROUTES.map((route) => route.path)).toContain("app/api/report/route.ts");
    expect(PROTECTED_ROUTES.map((route) => route.path)).toContain(
      "app/show/[slug]/[shareToken]/page.tsx",
    );
    expect(classifyTrustDomain("app/api/admin/onboarding/finalize/route.ts")).toBe("admin");
    expect(classifyTrustDomain("app/api/drive/webhook/route.ts")).toBe("public-webhook");
    expect(classifyTrustDomain("app/api/cron/sync/route.ts")).toBe("cron-internal");
    expect(classifyTrustDomain("app/show/[slug]/components/InlineAction.tsx")).toBe("non-route");
  });

  test("B1/B2/B3/B4 terminal-success branches accept only discriminated paths", () => {
    expect(CREW_SESSION_CHAINS.anyOf).toEqual([
      ["requireAdmin"],
      ["validateLinkSession"],
      ["validateLinkSession", "validateGoogleSession"],
      ["validateLinkSession", "validateGoogleSession", "requireAdmin"],
    ]);
    expectAuthPass("good-b1-admin-precedence.tsx");
    expectAuthPass("good-admin-precedence-no-link.fixture");
    expectAuthPass("good-b2-link-wins.tsx");
    expectAuthPass("good-b3-google-wins.tsx");
    expectAuthPass("good-b4-google-then-admin.tsx");
    expectAuthPass("good-stale-linear-tuple.tsx");
  });

  test("M10 R3 link-before-admin precedence regression fails", () => {
    expectAuthFail("bad-link-before-admin-precedence.fixture", /admin precedence/);
  });

  test("validator misuse and protected sink ordering failures are rejected", () => {
    expectAuthFail("bad-import-only.tsx", /missing validator/);
    expectAuthFail("bad-access-before-validate.tsx", /sink before terminal validator/);
    expectAuthFail("bad-skip-link.tsx", /requireAdmin.*isAdminSession/);
    expectAuthFail("bad-google-before-link.tsx", /wrong validator order/);
    expectAuthFail("bad-sink-before-terminal.tsx", /sink before terminal validator/);
  });

  test("banned auth primitives use AST literal exact match, not substring matching", () => {
    expectAuthFail("bad-direct-link-sessions.ts", /Banned auth primitive string 'link_sessions'/);
    expectAuthFail("bad-bootstrap-nonces-direct-access.tsx", /bootstrap_nonces/);
    expectAuthFail("bad-banned-template-cookie.ts", /__Host-fxav_session/);
    expectAuthPass("good-substring-literal-not-banned.tsx");
  });

  test("/me routes must use cross-show identity validation", () => {
    expectAuthFail("bad-me-route-uses-validateGoogleSession.tsx", /validateGoogleIdentity/);
    expectAuthPass("good-me-route-uses-validateGoogleIdentity.tsx");
  });

  test("outcome discriminator audit rejects ignored and fallthrough validators", () => {
    expectAuthFail("bad-ignored-continue.tsx", /discarded|kind discriminator/);
    expectAuthFail("bad-ignored-continue-bound.tsx", /kind discriminator/);
    expectAuthFail("bad-fallthrough-no-continue-check.tsx", /continue/);
  });

  test("server actions are discovered by AST before path-based skips", () => {
    expectAuthFail("bad-inline-action-in-component.tsx", /server-action.*missing validator/);
    expectAuthFail("bad-module-use-server-non-actions-file.ts", /server-action.*missing validator/);
    expectAuthPass("good-inline-action-with-validation.tsx");
  });

  test("all App Router entry kinds are audited", () => {
    expectAuthFail("bad-generate-metadata-touches-shows-internal.tsx", /generate-metadata/);
    expectAuthFail("bad-generate-viewport-touches-protected-table.tsx", /generate-viewport/);
    expectAuthFail("bad-loading-touches-protected-table.tsx", /loading/);
    expectAuthFail("bad-error-touches-protected-table.tsx", /error/);
    expectAuthFail("bad-not-found-touches-protected-table.tsx", /not-found/);
    expectAuthFail("bad-head-tsx-touches-protected-table.tsx", /head/);
    expectAuthFail("bad-template-touches-protected-table.tsx", /template/);
    expectAuthPass("good-generate-metadata-via-validator.tsx");
  });

  test("imported helpers are inlined into the protected-sink audit", () => {
    expectAuthFail("bad-imported-helper.tsx", /imported helper|sink before terminal validator/);
  });

  test("auth-library fixtures may touch low-level primitives", () => {
    expectAuthPass("good-allowlisted.ts");
    expectAuthPass("good-redeem-link-via-auth-lib.tsx");
    expectAuthPass("good-bootstrap-shell-mint.tsx");
  });

  test("dynamic .from calls are sink-protected unless the exact semantic identity is allowlisted", () => {
    expectAuthFail("bad-dynamic-from-bypass.tsx", /dynamic \.from/);
    expectAuthFail("bad-template-from-bypass.tsx", /dynamic \.from/);
    expectAuthPass("good-from-string-literal.tsx");

    const unchanged = fixture("good-allowlisted-call-site-unchanged.fixture");
    const allowEntry = dynamicFromAllowEntry(unchanged.path, unchanged.source);
    expect(auditAuthSource(unchanged.path, unchanged.source, { dynamicFromAllowlist: [allowEntry] })).toEqual(
      [],
    );

    const formatted = fixture("good-allowlisted-call-site-after-formatter.fixture");
    const formattedAllowEntry = dynamicFromAllowEntry(formatted.path, formatted.source);
    expect(
      auditAuthSource(formatted.path, formatted.source, { dynamicFromAllowlist: [formattedAllowEntry] }),
    ).toEqual([]);

    const changed = fixture("bad-allowlisted-argument-changed.fixture");
    expect(
      auditAuthSource(changed.path, changed.source, { dynamicFromAllowlist: [allowEntry] }).join("\n"),
    ).toMatch(/dynamic \.from/);

    expect(
      auditAuthSource(fixture("bad-second-dynamic-from-in-allowlisted-file.fixture").path,
        fixture("bad-second-dynamic-from-in-allowlisted-file.fixture").source,
        { dynamicFromAllowlist: [allowEntry] }).join("\n"),
    ).toMatch(/dynamic \.from/);
  });

  test("dynamic .from ambiguity requires occurrence indexes", () => {
    const bad = fixture("bad-ambiguous-from-without-occurrence-index.fixture");
    const ambiguousEntry: DynamicFromAllowEntry = {
      file: bad.path,
      enclosing_symbol: getEnclosingSymbol(firstDynamicFrom(bad.path, bad.source)),
      fingerprint: fingerprintCallSite(firstDynamicFrom(bad.path, bad.source)),
      reason: "fixture intentionally ambiguous",
    };
    expect(auditAuthSource(bad.path, bad.source, { dynamicFromAllowlist: [ambiguousEntry] }).join("\n")).toMatch(
      /DYNAMIC_FROM_AMBIGUOUS_ALLOWLIST/,
    );

    const good = fixture("good-ambiguous-from-with-explicit-occurrence-index.fixture");
    const goodCalls = findDynamicFromCalls(good.path, good.source);
    const entries = goodCalls.map((call, occurrenceIndex): DynamicFromAllowEntry => ({
      file: good.path,
      enclosing_symbol: getEnclosingSymbol(call),
      fingerprint: fingerprintCallSite(call),
      occurrence_index: occurrenceIndex,
      reason: "fixture disambiguates duplicate resolver calls",
    }));
    expect(auditAuthSource(good.path, good.source, { dynamicFromAllowlist: entries })).toEqual([]);
  });

  test("fingerprintCallSite is stable across formatter-only changes", () => {
    const files = ["fingerprint-stability/singleq.ts", "fingerprint-stability/doubleq.ts", "fingerprint-stability/tabs4.ts"].map(
      fixture,
    );
    const fingerprints = files.map((file) => fingerprintCallSite(firstDynamicFrom(file.path, file.source)));
    expect(new Set(fingerprints).size).toBe(1);
  });

  test("wrapped inline route handler enclosing symbols are stable and disambiguated", () => {
    const named = fixture("wrapped-route-handler-named-arg.fixture");
    const namedSymbols = findDynamicFromCalls(named.path, named.source).map(getEnclosingSymbol);
    expect(namedSymbols).toEqual([
      `${named.path}::GET->withAdmin[0]`,
      `${named.path}::POST->withAdmin[0]`,
    ]);

    const nested = fixture("wrapped-route-handler-nested-wrappers.fixture");
    const nestedSymbols = findDynamicFromCalls(nested.path, nested.source).map(getEnclosingSymbol);
    expect(nestedSymbols).toEqual([
      `${nested.path}::POST->withAdmin[0]->withRateLimit[0]`,
      `${nested.path}::PUT->withRateLimit[0]->withAdmin[0]`,
      `${nested.path}::PATCH->withRateLimit[1]`,
    ]);

    const anonymous = fixture("wrapped-route-handler-anonymous-deep.fixture");
    expect(findDynamicFromCalls(anonymous.path, anonymous.source).map(getEnclosingSymbol)).toEqual([
      `${anonymous.path}::<module>->mountRoute[1]->withAdmin[0].body[0]`,
      `${anonymous.path}::<module>->mountRoute[1]->withAdmin[0].body[1]`,
    ]);

    const formatted = fixture("wrapped-route-handler-named-arg-formatted.fixture");
    expect(findDynamicFromCalls(formatted.path, formatted.source).map(getEnclosingSymbol)).toEqual([
      `${formatted.path}::GET->withAdmin[0]`,
      `${formatted.path}::POST->withAdmin[0]`,
    ]);
  });

  test("live project X.3 audit has no current findings", () => {
    expect(auditProjectAuthChains()).toEqual([]);
  });
});
