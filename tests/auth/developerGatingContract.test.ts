/**
 * tests/auth/developerGatingContract.test.ts (developer-tier §6.1 structural defense)
 *
 * THE PROBLEM (Codex spec R5): auth-chain-audit's route classification skips
 * `non-route` files (lib/audit/authPrimitives.ts:813-823), so the developer-gated
 * *server actions* — the dev panel actions, the validation reset/reseed actions,
 * and the new setDeveloperAction toggle — get NO coverage from the x3 route audit.
 * A future edit could drop a `requireDeveloper()` gate on one of those actions,
 * or add a new ungated action to a registered file, and every route-level gate
 * would still be green. This is the exact "find the next peer instance by hand"
 * vector that structural-defense calibration says to close at CI time.
 *
 * THE META-DISCIPLINE: a single self-contained registry (`DEVELOPER_GATED_SURFACES`,
 * one row per §6 surface) drives four enforcements:
 *
 *   1. Server-action gate coverage (AST, ts-morph). For each developer-gated
 *      server-action file, every exported async server action MUST be gated by
 *      the registry's gate, PER its declared posture:
 *        - boundary-500: `await requireDeveloper*()` is the FIRST statement of
 *          the body, OUTSIDE any try (so the throw reaches the 500 boundary);
 *        - inline-typed-exception: `await requireDeveloper()` is the FIRST
 *          statement INSIDE the top-level try, with nothing (esp. no env read /
 *          Supabase-client construction) before it (so DeveloperInfraError is
 *          caught and returned as a cataloged typed inline error — §6.1 R4 fix).
 *      Set-equality: discovered exported server actions == registry action rows.
 *   2. Developer-gate assertion (Part B §3.1): admins/actions.ts's addAdminAction +
 *      revokeAdminAction are requireDeveloperIdentity-gated (NOT admin, NOT
 *      ungated) — admin-roster management is now developer-only (this milestone
 *      supersedes the developer-tier's "any admin can revoke any admin" §5.5 risk).
 *   3. Route/page coverage: the dev page + 2 harnesses + telemetry page +
 *      reap route are in PROTECTED_ROUTES with a chain starting requireDeveloper.
 *   4. Mutation-RPC SQL guard (Codex spec R9+R10): set_admin_developer_rpc's
 *      actor authorization is a table-backed `exists(... from public.admin_emails
 *      ... and ae.is_developer)` check (≥2×: fast-reject + post-lock) and NEVER
 *      calls `public.is_developer()` (whose JWT arm must never authorize a
 *      membership mutation).
 *
 * These assertions are anti-tautological: each fails against a real regression —
 * a removed/moved gate (1), a reverted developer gate (2), a dropped route row (3),
 * or an `exists`-check → `public.is_developer()` swap in the RPC (4).
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { Node, Project, type Block, type SourceFile, type Statement } from "ts-morph";

import { PROTECTED_ROUTES } from "@/lib/audit/trustDomains";

type ConsumerKind = "server-action-file" | "route";
type Posture = "boundary-500" | "inline-typed-exception" | "route-500-json";
type Gate = "requireDeveloper" | "requireDeveloperIdentity";

type DeveloperGatedSurface = {
  id: string;
  file: string;
  consumerKind: ConsumerKind;
  gate: Gate;
  declaredPosture: Posture;
  /** Exported server actions expected in the file (server-action-file only). */
  actions?: readonly string[];
};

// One row per developer surface in the spec §6 gating matrix.
const DEVELOPER_GATED_SURFACES: readonly DeveloperGatedSurface[] = [
  {
    id: "dev-actions",
    file: "app/admin/dev/actions.ts",
    consumerKind: "server-action-file",
    gate: "requireDeveloper",
    declaredPosture: "boundary-500",
    actions: [
      "parseAndStage",
      "parseAndStageFormAction",
      "getStagedResult",
      "resetDevSchema",
      "resetDevSchemaFormAction",
      "listFixtures",
      // Attention scenario materialize (spec 2026-07-20-attention-scenario-gallery).
      // All four gate with requireDeveloper as their first line, including the two
      // form wrappers: each is its own POST entry point and must not rely on the
      // delegate's gate to establish who the caller is.
      "applyAttentionScenario",
      "applyAttentionScenarioFormAction",
      "clearAttentionScenario",
      "clearAttentionScenarioFormAction",
    ],
  },
  {
    id: "developer-toggle-action",
    file: "app/admin/settings/admins/developerActions.ts",
    consumerKind: "server-action-file",
    gate: "requireDeveloperIdentity",
    declaredPosture: "boundary-500",
    actions: ["setDeveloperAction"],
  },
  {
    id: "validation-reset",
    file: "app/admin/settings/_actions/validationReset.ts",
    consumerKind: "server-action-file",
    gate: "requireDeveloper",
    declaredPosture: "inline-typed-exception",
    actions: ["resetValidationDataAction", "reseedValidationFixturesAction"],
  },
  {
    id: "dev-page",
    file: "app/admin/dev/page.tsx",
    consumerKind: "route",
    gate: "requireDeveloper",
    declaredPosture: "boundary-500",
  },
  {
    id: "source-link-dim",
    file: "app/admin/dev/source-link-dim/page.tsx",
    consumerKind: "route",
    gate: "requireDeveloper",
    declaredPosture: "boundary-500",
  },
  {
    id: "telemetry-dim",
    file: "app/admin/dev/telemetry-dim/page.tsx",
    consumerKind: "route",
    gate: "requireDeveloper",
    declaredPosture: "boundary-500",
  },
  {
    id: "telemetry-page",
    file: "app/admin/dev/telemetry/page.tsx",
    consumerKind: "route",
    gate: "requireDeveloperIdentity",
    declaredPosture: "boundary-500",
  },
  {
    id: "reap-stale-sessions",
    file: "app/api/admin/onboarding/reap-stale-sessions/route.ts",
    consumerKind: "route",
    gate: "requireDeveloperIdentity",
    declaredPosture: "route-500-json",
  },
];

const DEVELOPER_GATED_ACTION_FILE = "app/admin/settings/admins/actions.ts";
const DEVELOPER_GATED_ACTIONS = ["addAdminAction", "revokeAdminAction"] as const;
const DEVELOPER_GATE = "requireDeveloperIdentity";

const DEVELOPER_TIER_MIGRATION =
  "supabase/migrations/20260703230100_admin_emails_developer_tier.sql";

// Part B (2026-07-04 §3.2): re-created upsert/revoke RPCs with a table-backed
// developer actor check (pre-lock fast-reject + post-lock TOCTOU re-check).
const ADMIN_MGMT_DEVELOPER_MIGRATION =
  "supabase/migrations/20260704000000_admin_mgmt_requires_developer.sql";

function loadSourceFile(path: string): SourceFile {
  return new Project({ useInMemoryFileSystem: true }).createSourceFile(
    path,
    readFileSync(path, "utf8"),
  );
}

function hasFileLevelUseServer(sf: SourceFile): boolean {
  const first = sf.getStatements()[0];
  return (
    !!first &&
    Node.isExpressionStatement(first) &&
    /^["']use server["']$/.test(first.getExpression().getText())
  );
}

/**
 * If `stmt` is an `await <callee>(...)` statement (either a bare expression
 * statement OR a `const x = await <callee>(...)` declaration), return the
 * callee identifier name; otherwise null. This is the load-bearing gate
 * detector: a moved/removed gate, or any non-gate first statement, yields a
 * name that fails the `.toBe(gate)` assertion.
 */
/** A gate and its identity-returning variant, which enforce identically. */
function acceptableGates(gate: string): string[] {
  return [gate, `${gate}Identity`];
}

function awaitCalleeNameOf(stmt: Statement | undefined): string | null {
  if (!stmt) return null;
  let expr: Node | undefined;
  if (Node.isExpressionStatement(stmt)) {
    expr = stmt.getExpression();
  } else if (Node.isVariableStatement(stmt)) {
    expr = stmt.getDeclarationList().getDeclarations()[0]?.getInitializer();
  }
  if (!expr || !Node.isAwaitExpression(expr)) return null;
  const awaited = expr.getExpression();
  if (!Node.isCallExpression(awaited)) return null;
  const callee = awaited.getExpression();
  return Node.isIdentifier(callee) ? callee.getText() : null;
}

/** Every exported async function/arrow — under file-level "use server", these are the server actions. */
function getExportedAsyncActionNames(sf: SourceFile): string[] {
  const names: string[] = [];
  for (const fn of sf.getFunctions()) {
    if (fn.isExported() && fn.isAsync()) {
      const name = fn.getName();
      if (name) names.push(name);
    }
  }
  for (const vs of sf.getVariableStatements()) {
    if (!vs.isExported()) continue;
    for (const decl of vs.getDeclarations()) {
      const init = decl.getInitializer();
      if (
        init &&
        (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) &&
        init.isAsync()
      ) {
        names.push(decl.getName());
      }
    }
  }
  return names.sort();
}

function getActionBody(sf: SourceFile, name: string): Block | undefined {
  const fn = sf.getFunction(name);
  if (fn) {
    const body = fn.getBody();
    return body && Node.isBlock(body) ? body : undefined;
  }
  const init = sf.getVariableDeclaration(name)?.getInitializer();
  if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
    const body = init.getBody();
    return Node.isBlock(body) ? body : undefined;
  }
  return undefined;
}

/** Isolate the `$$ ... $$` body of one plpgsql function by name from a migration. */
function extractRpcBody(
  migrationSource: string,
  fnName: string,
  migrationPath: string = DEVELOPER_TIER_MIGRATION,
): string {
  const sigIdx = migrationSource.indexOf(`function public.${fnName}`);
  expect(sigIdx, `${fnName} must be defined in ${migrationPath}`).toBeGreaterThan(-1);
  const afterSig = migrationSource.slice(sigIdx);
  const bodyOpen = afterSig.indexOf("$$");
  const bodyClose = afterSig.indexOf("$$", bodyOpen + 2);
  expect(bodyOpen, `${fnName} must be dollar-quoted`).toBeGreaterThan(-1);
  expect(bodyClose, `${fnName} body must terminate`).toBeGreaterThan(bodyOpen);
  return afterSig.slice(bodyOpen + 2, bodyClose);
}

describe("developerGatingContract (structural defense — developer-tier §6.1)", () => {
  const serverActionSurfaces = DEVELOPER_GATED_SURFACES.filter(
    (s) => s.consumerKind === "server-action-file",
  );
  const routeSurfaces = DEVELOPER_GATED_SURFACES.filter((s) => s.consumerKind === "route");

  describe("enforcement 1: developer-gated server-action gate coverage (AST)", () => {
    test.each(serverActionSurfaces)(
      "$file — file-level use server + posture-correct gate + set-equality",
      (surface) => {
        const sf = loadSourceFile(surface.file);
        expect(
          hasFileLevelUseServer(sf),
          `${surface.file} must be a file-level "use server" module (every exported async fn is then a server action)`,
        ).toBe(true);

        // Set-equality: the discovered exported server actions == the registry rows.
        // Adding a new action to the file without registering it fails here.
        const discovered = getExportedAsyncActionNames(sf);
        const registered = [...(surface.actions ?? [])].sort();
        expect(
          discovered,
          `${surface.file}: discovered exported server actions must equal the registry's action rows`,
        ).toEqual(registered);

        for (const name of registered) {
          const body = getActionBody(sf, name);
          expect(
            body,
            `${surface.file}#${name}: server action must have a block body`,
          ).toBeDefined();
          const statements = body!.getStatements();

          if (surface.declaredPosture === "boundary-500") {
            const first = statements[0];
            // The identity-returning variant satisfies the same posture: it is
            // the SAME function with its return value kept - requireDeveloper is
            // literally `await resolveDeveloperIdentity()` with the result
            // discarded (lib/auth/requireDeveloper.ts:220-249), so it throws
            // identically and the throw still reaches the 500 boundary. The
            // header comment already documents the gate as `requireDeveloper*()`;
            // this assertion was stricter than its own spec, which blocked an
            // action that needs the actor email for post-commit telemetry.
            expect(
              acceptableGates(surface.gate),
              `${surface.file}#${name}: boundary-500 requires "await ${surface.gate}()" (or its Identity variant) as the FIRST statement, OUTSIDE any try (got ${first?.getKindName() ?? "none"}, callee ${awaitCalleeNameOf(first) ?? "none"})`,
            ).toContain(awaitCalleeNameOf(first));
          } else if (surface.declaredPosture === "inline-typed-exception") {
            const first = statements[0];
            if (!first || !Node.isTryStatement(first)) {
              expect.fail(
                `${surface.file}#${name}: inline-typed-exception requires the top-level try as the first statement (got ${first?.getKindName() ?? "none"})`,
              );
            }
            const firstInTry = first.getTryBlock().getStatements()[0];
            expect(
              awaitCalleeNameOf(firstInTry),
              `${surface.file}#${name}: inline-typed-exception requires "await ${surface.gate}()" as the FIRST statement INSIDE the top-level try, before any env read / Supabase-client construction (got ${firstInTry?.getKindName() ?? "none"})`,
            ).toBe(surface.gate);
          } else {
            expect.fail(
              `${surface.file}#${name}: a server-action file must declare boundary-500 or inline-typed-exception (got ${surface.declaredPosture})`,
            );
          }
        }
      },
    );
  });

  describe("enforcement 2: admins/actions.ts is developer-gated (Part B §3.1)", () => {
    test("addAdminAction + revokeAdminAction are requireDeveloperIdentity-gated (not admin, not ungated)", () => {
      const sf = loadSourceFile(DEVELOPER_GATED_ACTION_FILE);
      expect(hasFileLevelUseServer(sf)).toBe(true);

      const discovered = getExportedAsyncActionNames(sf);
      expect(
        discovered,
        `${DEVELOPER_GATED_ACTION_FILE}: exported server actions must equal the developer-gated pair`,
      ).toEqual([...DEVELOPER_GATED_ACTIONS].sort());

      for (const name of DEVELOPER_GATED_ACTIONS) {
        const body = getActionBody(sf, name);
        expect(
          body,
          `${DEVELOPER_GATED_ACTION_FILE}#${name}: must have a block body`,
        ).toBeDefined();
        const first = body!.getStatements()[0];
        const gate = awaitCalleeNameOf(first);
        expect(
          gate,
          `${DEVELOPER_GATED_ACTION_FILE}#${name}: must stay ${DEVELOPER_GATE}-gated (a revert to requireAdminIdentity or an ungated first statement fails here); got ${gate ?? first?.getKindName() ?? "none"}`,
        ).toBe(DEVELOPER_GATE);
      }
    });
  });

  describe("enforcement 3: developer routes/pages gate on requireDeveloper in PROTECTED_ROUTES", () => {
    const byPath = new Map(PROTECTED_ROUTES.map((route) => [route.path, route]));

    test.each(routeSurfaces)(
      "$file — present with a chain starting requireDeveloper",
      (surface) => {
        const route = byPath.get(surface.file);
        expect(route, `${surface.file} must be registered in PROTECTED_ROUTES`).toBeDefined();
        const chain = route!.chain;
        expect(
          Array.isArray(chain),
          `${surface.file}: chain must be an ordered ValidPath, got "${String(chain)}"`,
        ).toBe(true);
        expect(
          (chain as readonly string[])[0],
          `${surface.file}: chain must start with requireDeveloper (revert to requireAdmin?)`,
        ).toBe("requireDeveloper");
      },
    );
  });

  describe("enforcement 4: set_admin_developer_rpc authorization is table-backed (Codex spec R9+R10)", () => {
    test("actor check is a table-backed exists(...ae.is_developer) ≥2× and never calls public.is_developer()", () => {
      const migration = readFileSync(DEVELOPER_TIER_MIGRATION, "utf8");
      const body = extractRpcBody(migration, "set_admin_developer_rpc");

      // (a) table-backed actor check appears twice (fast-reject + post-lock).
      const actorCheckRe =
        /exists\s*\(\s*select\s+1\s+from\s+public\.admin_emails\s+ae\b[\s\S]*?\bae\.is_developer\b/gi;
      const actorChecks = body.match(actorCheckRe) ?? [];
      expect(
        actorChecks.length,
        "set_admin_developer_rpc must table-back its actor check (exists ... from public.admin_emails ae ... and ae.is_developer) at BOTH the fast-reject and the post-lock re-check",
      ).toBeGreaterThanOrEqual(2);

      // (b) the JWT-armed public.is_developer() must NEVER authorize the mutation.
      expect(
        body,
        "set_admin_developer_rpc must NOT call public.is_developer() — its JWT arm cannot authorize a membership mutation (§3.5 / §11)",
      ).not.toMatch(/public\.is_developer\s*\(/i);
    });

    // Part B (2026-07-04 §3.2): the re-created upsert_admin_email_rpc +
    // revoke_admin_email_rpc must table-back their actor authorization exactly like
    // set_admin_developer_rpc — a ≥2× table-backed exists(...ae.is_developer) check
    // (pre-lock fast-reject + post-lock TOCTOU re-check), NO JWT-armed
    // public.is_developer(), and NO trace of the OLD public.is_admin() gate. Each
    // assertion fails against a real regression: dropping the post-lock re-check
    // (count → 1), swapping the exists() for public.is_developer() (JWT-arm bypass),
    // or reverting to the is_admin() gate.
    test.each(["upsert_admin_email_rpc", "revoke_admin_email_rpc"])(
      "%s actor check is a table-backed exists(...ae.is_developer) ≥2× with no public.is_developer()/public.is_admin()",
      (fnName) => {
        const migration = readFileSync(ADMIN_MGMT_DEVELOPER_MIGRATION, "utf8");
        const body = extractRpcBody(migration, fnName, ADMIN_MGMT_DEVELOPER_MIGRATION);

        // (a) table-backed actor check appears ≥2× (pre-lock fast-reject + post-lock re-check).
        const actorCheckRe =
          /exists\s*\(\s*select\s+1\s+from\s+public\.admin_emails\s+ae\b[\s\S]*?\bae\.is_developer\b/gi;
        const actorChecks = body.match(actorCheckRe) ?? [];
        expect(
          actorChecks.length,
          `${fnName} must table-back its actor check (exists ... from public.admin_emails ae ... and ae.is_developer) at BOTH the pre-lock fast-reject and the post-lock re-check`,
        ).toBeGreaterThanOrEqual(2);

        // (b) the JWT-armed public.is_developer() must NEVER authorize the mutation.
        expect(
          body,
          `${fnName} must NOT call public.is_developer() — its JWT arm cannot authorize a membership mutation (§3.2)`,
        ).not.toMatch(/public\.is_developer\s*\(/i);

        // (c) the OLD is_admin() actor gate must be fully gone from the body.
        expect(
          body,
          `${fnName} must NOT use the old public.is_admin() actor gate — Part B replaced it with the table-backed developer check`,
        ).not.toMatch(/public\.is_admin\s*\(/i);
      },
    );
  });
});
