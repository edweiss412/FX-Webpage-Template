import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const leakedState = vi.hoisted(() => ({
  verifyFails: false,
  // R20 CRITICAL: removed lockFails. R19 F1 moved the per-show advisory
  // lock INSIDE revoke_leaked_link_atomic and R20 removed the JS-side
  // withShowAdvisoryLock wrapper from middleware (was deadlocking with
  // the in-RPC lock on a different connection). The "advisory lock"
  // failure mode no longer exists at the JS layer; equivalent failure
  // mode now is "RPC throws / returns error" — covered by rpcThrows
  // below + the existing authReadFails/revokedUpsertFails/authUpdateFails
  // returned-error paths.
  rpcThrows: false,
  authReadFails: false,
  revokedUpsertFails: false,
  authUpdateFails: false,
  authRow: {
    show_id: "11111111-1111-4111-8111-111111111111",
    crew_name: "Crew Tester",
    current_token_version: 3,
    max_issued_version: 3,
    revoked_below_version: 0,
  } as {
    show_id: string;
    crew_name: string;
    current_token_version: number;
    max_issued_version: number;
    revoked_below_version: number;
  } | null,
  alertUpserts: [] as unknown[],
  revokedRows: [] as unknown[],
  alertThrows: false,
  alertReturnsError: false,
  verifyInfraFails: false as boolean,
}));

vi.mock("@/lib/auth/jwt", () => ({
  // R16 #2: isJwtInfraError moved into lib/auth/jwt.ts so redeem-link
  // can use the same distinction the middleware does. The mock must
  // export it too — vi.mock fully shadows the real module, so omitting
  // it would leave middleware's import undefined and route every
  // verifyLinkJwt failure through the validation arm regardless of
  // mock state.
  isJwtInfraError: (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    return (
      error.message.includes("JWT_SIGNING_SECRET") ||
      error.message.includes("active signing key") ||
      error.message.includes("Failed to read")
    );
  },
  verifyLinkJwt: async () => {
    if (leakedState.verifyInfraFails) {
      // R13 #3: simulate a JWT verifier configuration/infrastructure
      // failure (e.g. missing JWT_SIGNING_SECRET). The middleware's
      // catch must distinguish this from a validation failure and
      // return 503, not 410.
      throw new Error("JWT_SIGNING_SECRET must be set");
    }
    if (leakedState.verifyFails) {
      throw new Error("bad signature");
    }
    return {
      payload: {
        crewMemberKey: {
          showId: "11111111-1111-4111-8111-111111111111",
          name: "Crew Tester",
        },
        tokenVersion: 3,
      },
    };
  },
}));

function tableClient(table: string) {
  if (table === "crew_member_auth") {
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: leakedState.authReadFails ? null : leakedState.authRow,
              error: leakedState.authReadFails
                ? { message: "auth read failed" }
                : null,
            }),
          }),
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: async () => ({
            error: leakedState.authUpdateFails
              ? { message: "auth update failed" }
              : null,
          }),
        }),
      }),
    };
  }
  if (table === "revoked_links") {
    return {
      upsert: async (payload: unknown) => {
        if (!leakedState.revokedUpsertFails) {
          leakedState.revokedRows.push(payload);
        }
        return {
          error: leakedState.revokedUpsertFails
            ? { message: "revoked upsert failed" }
            : null,
        };
      },
    };
  }
  if (table === "admin_alerts") {
    return {
      upsert: async (payload: unknown) => {
        leakedState.alertUpserts.push(payload);
        if (leakedState.alertThrows) {
          throw new Error("alert failed");
        }
        if (leakedState.alertReturnsError) {
          // R22 F1 (round-22 §A HIGH): the upsert can return
          // { error: ... } without throwing. Pre-fix
          // upsertRevocationFailureAlert ignored that field, silently
          // dropping the operator alert.
          return { error: { message: "alert returned-error" } };
        }
        return { error: null };
      },
    };
  }
  throw new Error(`unexpected table ${table}`);
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: tableClient,
    rpc: async (name: string, params: Record<string, unknown>) => {
      if (name === "upsert_admin_alert") {
        leakedState.alertUpserts.push(params);
        if (leakedState.alertThrows) {
          throw new Error("alert failed");
        }
        if (leakedState.alertReturnsError) {
          return { data: null, error: { message: "alert returned-error" } };
        }
        return { data: "alert-id", error: null };
      }
      expect(name).toBe("revoke_leaked_link_atomic");
      if (leakedState.rpcThrows) {
        // R20 CRITICAL replacement for the removed lockFails path:
        // simulate the RPC layer itself blowing up (network, abort,
        // etc.) — the equivalent failure mode now that the advisory
        // lock lives inside the SECURITY DEFINER function.
        throw new Error("rpc threw");
      }
      if (leakedState.authReadFails) {
        return { data: null, error: { message: "auth read failed" } };
      }
      if (leakedState.revokedUpsertFails) {
        return { data: null, error: { message: "revoked upsert failed" } };
      }
      if (leakedState.authUpdateFails) {
        return { data: null, error: { message: "auth update failed" } };
      }
      if (!leakedState.authRow) {
        return { data: { branch: "no_op" }, error: null };
      }
      const tokenVersion = Number(params.p_token_version);
      if (tokenVersion <= leakedState.authRow.current_token_version) {
        leakedState.revokedRows.push({
          show_id: params.p_show_id,
          crew_name: params.p_crew_name,
          token_version: tokenVersion,
          revoked_reason: "leaked_query_token",
        });
      }
      return { data: { branch: "ok" }, error: null };
    },
  }),
}));

const { middleware } = await import("../../middleware");

function leakedRequest(): NextRequest {
  return new NextRequest("https://crew.fxav.test/show/test-show?t=signed-jwt");
}

/**
 * R13 #2 (round-12): leaked-link middleware now returns HTML to
 * browsers instead of JSON. The test helper inspects the rendered
 * body for catalog-derived copy + the absence of raw error codes,
 * since the no-raw-error-codes invariant forbids raw `{ code: ... }`
 * payloads on document-load paths.
 */
async function expectHtml(response: Response): Promise<string> {
  expect(response.headers.get("content-type")).toMatch(/text\/html/);
  return response.text();
}

describe("middleware leaked-link revocation", () => {
  beforeEach(() => {
    leakedState.verifyFails = false;
    leakedState.verifyInfraFails = false;
    leakedState.rpcThrows = false;
    leakedState.authReadFails = false;
    leakedState.revokedUpsertFails = false;
    leakedState.authUpdateFails = false;
    leakedState.alertThrows = false;
    leakedState.alertReturnsError = false;
    leakedState.authRow = {
      show_id: "11111111-1111-4111-8111-111111111111",
      crew_name: "Crew Tester",
      current_token_version: 3,
      max_issued_version: 3,
      revoked_below_version: 0,
    };
    leakedState.alertUpserts = [];
    leakedState.revokedRows = [];
  });

  test.each([
    ["RPC infra throw", () => (leakedState.rpcThrows = true)],
    ["crew auth read", () => (leakedState.authReadFails = true)],
    ["revoked link upsert", () => (leakedState.revokedUpsertFails = true)],
    ["crew auth update", () => (leakedState.authUpdateFails = true)],
  ])(
    "%s failure returns ADMIN_SESSION_LOOKUP_FAILED instead of false leaked-link success",
    async (_name, setup) => {
      setup();

      const response = await middleware(leakedRequest());

      expect(response.status).toBe(503);
      const html = await expectHtml(response);
      expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
      expect(html).toContain("Sign-in temporarily unavailable");
      expect(leakedState.alertUpserts).toHaveLength(1);
    },
  );

  test("alert persistence failure does not mask leaked-link revocation failure", async () => {
    leakedState.authUpdateFails = true;
    leakedState.alertThrows = true;

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(503);
    const html = await expectHtml(response);
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(html).toContain("Sign-in temporarily unavailable");
    expect(leakedState.alertUpserts).toHaveLength(1);
  });

  test("R22 F1: alert upsert returned-error (not thrown) still surfaces as 503 + logged failure", async () => {
    // Codex round-22 §A HIGH: pre-fix upsertRevocationFailureAlert
    // awaited the upsert but ignored its `{ error }` field. Supabase's
    // returned-error shape (vs throw) silently dropped the alert,
    // leaving Doug with no signal that a leaked credential might still
    // be usable. Now the helper throws on returned error too — the
    // outer try/catch logs 'leaked-link revocation alert failed' and
    // the user gets the cataloged 503 instead of a fall-through 200.
    leakedState.authUpdateFails = true;
    leakedState.alertReturnsError = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(503);
    const html = await expectHtml(response);
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(html).toContain("Sign-in temporarily unavailable");
    expect(leakedState.alertUpserts).toHaveLength(1);
    // Outer catch logs the alert failure path.
    const calls = errorSpy.mock.calls.flat().filter((v): v is string => typeof v === "string");
    expect(calls.some((c) => c.includes("leaked-link revocation alert failed"))).toBe(true);

    errorSpy.mockRestore();
  });

  test("JWT verification failure still returns LEAKED_LINK_DETECTED", async () => {
    leakedState.verifyFails = true;

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(410);
    const html = await expectHtml(response);
    expect(html).not.toContain("LEAKED_LINK_DETECTED");
    expect(html).toContain("This link has been revoked");
    expect(leakedState.alertUpserts).toEqual([]);
  });

  test("successful leaked-link revocation returns LEAKED_LINK_DETECTED", async () => {
    const response = await middleware(leakedRequest());

    expect(response.status).toBe(410);
    const html = await expectHtml(response);
    expect(html).not.toContain("LEAKED_LINK_DETECTED");
    expect(html).toContain("This link has been revoked");
    expect(leakedState.alertUpserts).toEqual([
      expect.objectContaining({
        p_code: "LEAKED_LINK_DETECTED",
        p_show_id: "11111111-1111-4111-8111-111111111111",
      }),
    ]);
  });

  test("update failure after revoked-link insert does not leave partial revoked row", async () => {
    leakedState.authUpdateFails = true;

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(503);
    const html = await expectHtml(response);
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(html).toContain("Sign-in temporarily unavailable");
    expect(leakedState.revokedRows).toEqual([]);
  });

  test("already-revoked leaked link remains idempotent LEAKED_LINK_DETECTED", async () => {
    leakedState.authRow = {
      show_id: "11111111-1111-4111-8111-111111111111",
      crew_name: "Crew Tester",
      current_token_version: 4,
      max_issued_version: 4,
      revoked_below_version: 4,
    };

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(410);
    const html = await expectHtml(response);
    expect(html).not.toContain("LEAKED_LINK_DETECTED");
    expect(html).toContain("This link has been revoked");
  });

  test("R13 #3: JWT verifier infrastructure failure surfaces as 503, not 410", async () => {
    // Round-12 §A MEDIUM: pre-fix, every verifyLinkJwt() throw was
    // converted into "successful revocation" 410. If the verifier
    // threw because of missing JWT_SIGNING_SECRET (config) — not
    // because of a malformed/expired/forged token — the middleware
    // would still tell the user the link was revoked AND skip the
    // revocation writes. Operators saw no signal that the verifier
    // was broken.
    //
    // Post-fix: isJwtInfraError narrows the catch. Validation
    // failures still return 410 (same response shape; the
    // existing "invalid JWT verification" test already covers
    // that). Infra failures now return 503 +
    // leakedLinkRevocationFailureResponse() so operators see the
    // configuration fault.
    leakedState.verifyInfraFails = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await middleware(leakedRequest());

    expect(response.status).toBe(503);
    const html = await expectHtml(response);
    expect(html).not.toContain("LEAKED_LINK_DETECTED");
    expect(html).not.toContain("ADMIN_SESSION_LOOKUP_FAILED");
    expect(html).toContain("Sign-in temporarily unavailable");
    // No revocation writes occurred — the verifier infra failure
    // means we couldn't decide anything.
    expect(leakedState.revokedRows).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test("R20 CRITICAL: middleware MUST NOT wrap revoke RPC in withShowAdvisoryLock (deadlock guard)", async () => {
    // Codex round-20 CRITICAL: pre-fix middleware wrapped
    // revokeLeakedLinkAtomic in withShowAdvisoryLock("block") on
    // connection A while the RPC re-acquired the same lock on
    // connection B — connection B blocked waiting for A; A blocked
    // awaiting B's RPC response → deadlock → leaked links never
    // revoked, defeating watchpoints #11/#12 entirely. Codex's
    // recommendation: 'Add a regression test that detects the RPC is
    // invoked without an already-held advisory lock on a separate
    // connection.'
    //
    // Structural guard: the leaked-link middleware module must NOT
    // import withShowAdvisoryLock at all. The deadlock is impossible
    // if there's no JS-side wrapper. (lib/db/advisoryLock.ts itself
    // remains exported for callers that own a single DB connection
    // and do NOT also call a Supabase RPC that acquires the same key
    // — but the leaked-link path violates that constraint.)
    const fs = await import("node:fs/promises");
    const middlewareSrc = await fs.readFile(
      new URL("../../middleware.ts", import.meta.url),
      "utf-8",
    );
    // Strip line/block comments before matching so the explanatory
    // comment in the file (which mentions withShowAdvisoryLock as
    // historical context for the deadlock) doesn't trip the guard.
    const stripped = middlewareSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    // No import of the wrapper.
    expect(stripped).not.toMatch(/from\s+["']@\/lib\/db\/advisoryLock["']/);
    // No call site for withShowAdvisoryLock outside comments.
    expect(stripped).not.toMatch(/\bwithShowAdvisoryLock\s*\(/);
  });
});
