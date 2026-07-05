// Single-file executable behavioral coverage for admin mutation surfaces
// (invariant #10, spec §4.2/§9/§10.5). All state is INLINE — no separate
// recorder module (spec R11 F2 — a cross-file in-memory recorder is
// unreliable under Vitest's per-file isolation/workers/sharding).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome"; // NOT re-exported from @/lib/log (verified live)
import type { LogRecord } from "@/lib/log";

// ── shared auth/Next mocks (Tasks 7-15) ─────────────────────────────────────
// Per plan Tasks 7-16: NEVER mock @/lib/log or @/lib/log/logAdminOutcome here —
// the sink-spy proof requires the REAL logger. Mock ONLY auth/data/Next deps.
const requireAdminMock = vi.fn(async (..._a: unknown[]) => undefined);
const requireAdminIdentityMock = vi.fn(async (..._a: unknown[]) => ({ email: "admin@example.com" }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: (...a: unknown[]) => requireAdminMock(...a),
  requireAdminIdentity: (...a: unknown[]) => requireAdminIdentityMock(...a),
}));

// `class` declarations aren't auto-hoisted the way `vi.fn()` initializers are
// (Vitest's hoist transform special-cases vi.fn() but not arbitrary class
// exprs) — wrap in vi.hoisted() so the factory below can reference it.
const { DeveloperInfraErrorDouble } = vi.hoisted(() => {
  class DeveloperInfraErrorDouble extends Error {}
  return { DeveloperInfraErrorDouble };
});
const requireDeveloperMock = vi.fn(async (..._a: unknown[]) => undefined);
const requireDeveloperIdentityMock = vi.fn(async (..._a: unknown[]) => ({ email: "dev@example.com" }));
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloper: (...a: unknown[]) => requireDeveloperMock(...a),
  requireDeveloperIdentity: (...a: unknown[]) => requireDeveloperIdentityMock(...a),
  DeveloperInfraError: DeveloperInfraErrorDouble,
}));

const revalidatePathMock = vi.fn((..._a: unknown[]) => undefined);
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => redirectMock(a[0] as string),
}));

// Generic Supabase chain double: every chain method (eq/is/select/update/…)
// returns the same node; the node is itself thenable, resolving to `result`
// regardless of chain length — the production call sites always terminate a
// single awaited expression, so this is safe for every shape used below.
function chainResult(result: unknown) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  for (const m of ["eq", "is", "not", "select", "update", "insert", "single"]) node[m] = self;
  node.maybeSingle = () => Promise.resolve(result);
  node.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return node;
}

function makeClient(opts: { from?: unknown; rpc?: unknown; getUser?: unknown }) {
  return {
    from: () => chainResult(opts.from),
    rpc: () => chainResult(opts.rpc),
    auth: { getUser: async () => opts.getUser },
  };
}

const serverClientImpl = { current: async (..._a: unknown[]): Promise<unknown> => makeClient({}) };
const serviceRoleClientImpl = { current: (..._a: unknown[]): unknown => makeClient({}) };
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...a: unknown[]) => serverClientImpl.current(...a),
  createSupabaseServiceRoleClient: (...a: unknown[]) => serviceRoleClientImpl.current(...a),
}));

import { setAutoPublish } from "@/app/admin/settings/_actions/setAutoPublish";
import { setAlertOnAutoPublish } from "@/app/admin/settings/_actions/setAlertOnAutoPublish";
import { setAlertOnSyncProblems } from "@/app/admin/settings/_actions/setAlertOnSyncProblems";
import { setDailyReviewDigest } from "@/app/admin/settings/_actions/setDailyReviewDigest";

// ── Task 8: validationReset ──────────────────────────────────────────────
const destructiveResetAllowedMock = vi.fn((..._a: unknown[]) => true);
vi.mock("@/lib/admin/validationDeployment", () => ({
  VALIDATION_PROJECT_REF: "vzakgrxqwcalbmagufjh",
  destructiveResetAllowed: (...a: unknown[]) => destructiveResetAllowedMock(...a),
}));

const buildFixturesMock = vi.fn((..._a: unknown[]) => [] as unknown[]);
vi.mock("@/lib/validation/fixtures", () => ({
  buildFixtures: (...a: unknown[]) => buildFixturesMock(...a),
  R_COMBOS: [],
  SW_COMBOS: [],
}));

const mintFixtureCombosMock = vi.fn(async (..._a: unknown[]) => ({ minted: 16 }));
const finalizeFixturesMock = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/validation/reseedFixtures", () => ({
  mintFixtureCombos: (...a: unknown[]) => mintFixtureCombosMock(...a),
  finalizeFixtures: (...a: unknown[]) => finalizeFixturesMock(...a),
}));

import {
  resetValidationDataAction,
  reseedValidationFixturesAction,
} from "@/app/admin/settings/_actions/validationReset";

// ── Task 9: admin-management ────────────────────────────────────────────────
const { AdminEmailsInfraErrorDouble } = vi.hoisted(() => {
  class AdminEmailsInfraErrorDouble extends Error {}
  return { AdminEmailsInfraErrorDouble };
});
const addAdminEmailMock = vi.fn(async (..._a: unknown[]) => ({ kind: "ok" as const }));
const revokeAdminEmailMock = vi.fn(async (..._a: unknown[]) => ({ kind: "ok" as const }));
const setAdminDeveloperMock = vi.fn(
  async (..._a: unknown[]) =>
    ({ kind: "ok" as const, email: "target@example.com", isDeveloper: true }) as unknown,
);
vi.mock("@/lib/data/adminEmails", () => ({
  addAdminEmail: (...a: unknown[]) => addAdminEmailMock(...a),
  revokeAdminEmail: (...a: unknown[]) => revokeAdminEmailMock(...a),
  setAdminDeveloper: (...a: unknown[]) => setAdminDeveloperMock(...a),
  AdminEmailsInfraError: AdminEmailsInfraErrorDouble,
}));

import { addAdminAction, revokeAdminAction } from "@/app/admin/settings/admins/actions";
import { setDeveloperAction } from "@/app/admin/settings/admins/developerActions";

// ── Task 10: admin/dev/actions ──────────────────────────────────────────────
const readFileMock = vi.fn(async (..._a: unknown[]) => "# fixture markdown\n");
const readdirMock = vi.fn(async (..._a: unknown[]) => [] as string[]);
vi.mock("node:fs/promises", () => ({
  readFile: (...a: unknown[]) => readFileMock(...a),
  readdir: (...a: unknown[]) => readdirMock(...a),
}));

const parseSheetMock = vi.fn((..._a: unknown[]) => ({
  hardErrors: [] as unknown[],
  openingReel: null,
  diagrams: { linkedFolderItems: [] as unknown[], embeddedImages: [] as unknown[] },
  warnings: [] as unknown[],
  raw_unrecognized: [] as unknown[],
}));
vi.mock("@/lib/parser", () => ({
  parseSheet: (...a: unknown[]) => parseSheetMock(...a),
}));

const enrichWithDrivePinsMock = vi.fn(async (..._a: unknown[]) => ({
  ...(_a[0] as Record<string, unknown>),
}));
vi.mock("@/lib/sync/enrichWithDrivePins", () => ({
  enrichWithDrivePins: (...a: unknown[]) => enrichWithDrivePinsMock(...a),
}));

vi.mock("@/lib/sync/mocks/mockDriveClient", () => ({
  mockDriveClient: {},
  MOCK_MARKER: "MOCK_MARKER_TEST",
}));

const runInvariantsMock = vi.fn((..._a: unknown[]) => ({ outcome: "pass" as const }));
vi.mock("@/lib/parser/invariants", () => ({
  runInvariants: (...a: unknown[]) => runInvariantsMock(...a),
}));

import { parseAndStage, resetDevSchema } from "@/app/admin/dev/actions";

// ── Task 11: onboarding serverActions ───────────────────────────────────────
const purgeAndRotateOnboardingSessionMock = vi.fn(
  async (..._a: unknown[]) => ({ rotated: true }) as unknown,
);
vi.mock("@/lib/onboarding/sessionLifecycle", () => ({
  purgeAndRotateOnboardingSession: (...a: unknown[]) => purgeAndRotateOnboardingSessionMock(...a),
}));

import { startOverServerAction, rerunSetupServerAction } from "@/lib/onboarding/serverActions";

// ── inline file-local recorder (single-file contract; no cross-file state) ──
const recorded = new Set<string>(); // "file::fn::code"
function recordAdminOutcomeBehavior(x: { file: string; fn: string; code: string }) {
  recorded.add(`${x.file}::${x.fn}::${x.code}`);
}

/** Drive a success path with a sink spy; return the codes observed. Captures codes even when
 * `run()` throws — required for `Promise<never>` redirect actions (Next's `redirect()` throws
 * a NEXT_REDIRECT error). The spy runs synchronously in the logger before the throw escapes. */
async function observeCodes(run: () => Promise<unknown>): Promise<string[]> {
  const codes: string[] = [];
  setLogSink((r: LogRecord) => {
    if (r.code) codes.push(r.code);
  });
  try {
    await run();
  } catch {
    /* redirect / expected throw — codes already captured */
  } finally {
    resetLogSink();
  }
  return codes;
}
afterEach(() => resetLogSink());

describe("behavioral scaffold smoke", () => {
  test("spy captures a code; recorder records; and codes survive a thrown (redirect-style) run", async () => {
    const codes = await observeCodes(() => logAdminOutcome({ code: "TEST_SMOKE", source: "t" }));
    expect(codes).toContain("TEST_SMOKE");
    recordAdminOutcomeBehavior({ file: "x", fn: "y", code: "TEST_SMOKE" });
    expect(recorded.has("x::y::TEST_SMOKE")).toBe(true);
    // redirect-style: emit then throw — the code must still be observed
    const thrown = await observeCodes(async () => {
      await logAdminOutcome({ code: "TEST_THROW", source: "t" });
      throw new Error("NEXT_REDIRECT");
    });
    expect(thrown).toContain("TEST_THROW");
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockImplementation(async () => undefined);
  requireAdminIdentityMock.mockImplementation(async () => ({ email: "admin@example.com" }));
  requireDeveloperMock.mockImplementation(async () => undefined);
  requireDeveloperIdentityMock.mockImplementation(async () => ({ email: "dev@example.com" }));
  serverClientImpl.current = async () => makeClient({});
  serviceRoleClientImpl.current = () => makeClient({});
  destructiveResetAllowedMock.mockImplementation(() => true);
  buildFixturesMock.mockImplementation(() => []);
  mintFixtureCombosMock.mockImplementation(async () => ({ minted: 16 }));
  finalizeFixturesMock.mockImplementation(async () => undefined);
  addAdminEmailMock.mockImplementation(async () => ({ kind: "ok" as const }));
  revokeAdminEmailMock.mockImplementation(async () => ({ kind: "ok" as const }));
  setAdminDeveloperMock.mockImplementation(
    async () => ({ kind: "ok" as const, email: "target@example.com", isDeveloper: true }) as unknown,
  );
  readFileMock.mockImplementation(async () => "# fixture markdown\n");
  readdirMock.mockImplementation(async () => []);
  parseSheetMock.mockImplementation(() => ({
    hardErrors: [],
    openingReel: null,
    diagrams: { linkedFolderItems: [], embeddedImages: [] },
    warnings: [],
    raw_unrecognized: [],
  }));
  enrichWithDrivePinsMock.mockImplementation(async (parsed: unknown) => ({
    ...(parsed as Record<string, unknown>),
  }));
  runInvariantsMock.mockImplementation(() => ({ outcome: "pass" as const }));
  purgeAndRotateOnboardingSessionMock.mockImplementation(async () => ({ rotated: true }));
});

// ── Task 7: settings toggles (spec §3.1 A, §5.2) ────────────────────────────
describe("Task 7 — app_settings toggle server actions observe changes", () => {
  test("setAutoPublish emits SETTING_AUTOPUBLISH_CHANGED on {ok:true}; nothing on {ok:false}", async () => {
    serverClientImpl.current = async () =>
      makeClient({ from: { data: [{ id: "default" }], error: null } });
    const codes = await observeCodes(() => setAutoPublish(true));
    expect(codes).toContain("SETTING_AUTOPUBLISH_CHANGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/_actions/setAutoPublish.ts",
      fn: "setAutoPublish",
      code: "SETTING_AUTOPUBLISH_CHANGED",
    });

    serverClientImpl.current = async () => makeClient({ from: { data: null, error: null } });
    const failCodes = await observeCodes(() => setAutoPublish(true));
    expect(failCodes).not.toContain("SETTING_AUTOPUBLISH_CHANGED");
  });

  test("setAlertOnAutoPublish emits SETTING_ALERT_ON_AUTOPUBLISH_CHANGED on {ok:true}; nothing on {ok:false}", async () => {
    serverClientImpl.current = async () =>
      makeClient({ from: { data: [{ id: "default" }], error: null } });
    const codes = await observeCodes(() => setAlertOnAutoPublish(true));
    expect(codes).toContain("SETTING_ALERT_ON_AUTOPUBLISH_CHANGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/_actions/setAlertOnAutoPublish.ts",
      fn: "setAlertOnAutoPublish",
      code: "SETTING_ALERT_ON_AUTOPUBLISH_CHANGED",
    });

    serverClientImpl.current = async () =>
      makeClient({ from: { data: null, error: { message: "boom" } } });
    const failCodes = await observeCodes(() => setAlertOnAutoPublish(true));
    expect(failCodes).not.toContain("SETTING_ALERT_ON_AUTOPUBLISH_CHANGED");
  });

  test("setAlertOnSyncProblems emits SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED on {ok:true}; nothing on {ok:false}", async () => {
    serverClientImpl.current = async () =>
      makeClient({ from: { data: [{ id: "default" }], error: null } });
    const codes = await observeCodes(() => setAlertOnSyncProblems(false));
    expect(codes).toContain("SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/_actions/setAlertOnSyncProblems.ts",
      fn: "setAlertOnSyncProblems",
      code: "SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED",
    });

    serverClientImpl.current = async () => makeClient({ from: { data: [], error: null } });
    const failCodes = await observeCodes(() => setAlertOnSyncProblems(false));
    expect(failCodes).not.toContain("SETTING_ALERT_ON_SYNC_PROBLEMS_CHANGED");
  });

  test("setDailyReviewDigest emits SETTING_DAILY_REVIEW_DIGEST_CHANGED on {ok:true}; nothing on {ok:false}", async () => {
    serverClientImpl.current = async () =>
      makeClient({ from: { data: [{ id: "default" }], error: null } });
    const codes = await observeCodes(() => setDailyReviewDigest(true));
    expect(codes).toContain("SETTING_DAILY_REVIEW_DIGEST_CHANGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/_actions/setDailyReviewDigest.ts",
      fn: "setDailyReviewDigest",
      code: "SETTING_DAILY_REVIEW_DIGEST_CHANGED",
    });

    serverClientImpl.current = async () => makeClient({ from: { data: null, error: null } });
    const failCodes = await observeCodes(() => setDailyReviewDigest(true));
    expect(failCodes).not.toContain("SETTING_DAILY_REVIEW_DIGEST_CHANGED");
  });
});

// ── Task 8: validationReset (spec §3.1 A, §5.2) ─────────────────────────────
describe("Task 8 — validationReset server actions observe changes", () => {
  test("resetValidationDataAction emits VALIDATION_RESET_RUN on {ok:true}; nothing on {ok:false}", async () => {
    serverClientImpl.current = async () => makeClient({ rpc: { data: null, error: null } });
    serviceRoleClientImpl.current = () =>
      makeClient({ rpc: { data: { clearedShows: 7 }, error: null } });
    const codes = await observeCodes(() => resetValidationDataAction());
    expect(codes).toContain("VALIDATION_RESET_RUN");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/_actions/validationReset.ts",
      fn: "resetValidationDataAction",
      code: "VALIDATION_RESET_RUN",
    });

    destructiveResetAllowedMock.mockImplementation(() => false);
    const failCodes = await observeCodes(() => resetValidationDataAction());
    expect(failCodes).not.toContain("VALIDATION_RESET_RUN");
  });

  test("reseedValidationFixturesAction emits VALIDATION_RESEED_RUN on {ok:true}; nothing on {ok:false}", async () => {
    serverClientImpl.current = async () => makeClient({ rpc: { data: null, error: null } });
    serviceRoleClientImpl.current = () => makeClient({});
    const codes = await observeCodes(() => reseedValidationFixturesAction());
    expect(codes).toContain("VALIDATION_RESEED_RUN");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/_actions/validationReset.ts",
      fn: "reseedValidationFixturesAction",
      code: "VALIDATION_RESEED_RUN",
    });

    mintFixtureCombosMock.mockImplementation(async () => {
      throw new Error("boom");
    });
    const failCodes = await observeCodes(() => reseedValidationFixturesAction());
    expect(failCodes).not.toContain("VALIDATION_RESEED_RUN");
  });
});

// ── Task 9: admin-management (spec §3.1 A, §5.2) ────────────────────────────
describe("Task 9 — admin grant/revoke + developer toggle observe changes", () => {
  test("addAdminAction emits ADMIN_GRANTED on kind:ok; nothing on invalid_email", async () => {
    const form = new FormData();
    form.set("email", "new-admin@example.com");
    const codes = await observeCodes(() => addAdminAction(null, form));
    expect(codes).toContain("ADMIN_GRANTED");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/admins/actions.ts",
      fn: "addAdminAction",
      code: "ADMIN_GRANTED",
    });

    const badForm = new FormData();
    const failCodes = await observeCodes(() => addAdminAction(null, badForm));
    expect(failCodes).not.toContain("ADMIN_GRANTED");
  });

  test("revokeAdminAction emits ADMIN_REVOKED on kind:ok; nothing on self-revoke refusal", async () => {
    const form = new FormData();
    form.set("email", "someone-else@example.com");
    const codes = await observeCodes(() => revokeAdminAction(null, form));
    expect(codes).toContain("ADMIN_REVOKED");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/admins/actions.ts",
      fn: "revokeAdminAction",
      code: "ADMIN_REVOKED",
    });

    const selfForm = new FormData();
    selfForm.set("email", "admin@example.com"); // matches requireAdminIdentityMock's actor
    revokeAdminEmailMock.mockClear();
    const failCodes = await observeCodes(() => revokeAdminAction(null, selfForm));
    expect(failCodes).not.toContain("ADMIN_REVOKED");
    // Self-revoke is refused BEFORE the data-layer call (M12.5 mutation-boundary
    // enforcement) — the RPC is never reached, so no ADMIN_REVOKED is possible.
    expect(revokeAdminEmailMock).not.toHaveBeenCalled();
  });

  test("setDeveloperAction emits ADMIN_DEVELOPER_SET on kind:ok; nothing on invalid_email", async () => {
    const form = new FormData();
    form.set("email", "target@example.com");
    form.set("is_developer", "true");
    const codes = await observeCodes(() => setDeveloperAction(null, form));
    expect(codes).toContain("ADMIN_DEVELOPER_SET");
    recordAdminOutcomeBehavior({
      file: "app/admin/settings/admins/developerActions.ts",
      fn: "setDeveloperAction",
      code: "ADMIN_DEVELOPER_SET",
    });

    const badForm = new FormData();
    const failCodes = await observeCodes(() => setDeveloperAction(null, badForm));
    expect(failCodes).not.toContain("ADMIN_DEVELOPER_SET");
  });
});

// ── Task 10: admin/dev/actions (spec §3.1 A, §5.2) ──────────────────────────
describe("Task 10 — dev parse-stage + schema reset observe changes", () => {
  test("parseAndStage emits DEV_PARSE_STAGED on success; nothing when the RPC errors", async () => {
    serviceRoleClientImpl.current = () =>
      makeClient({
        rpc: { data: { kind: "pending_sync", id: "ps-1", show_id: null }, error: null },
      });
    const codes = await observeCodes(() => parseAndStage("_temp-fixture.md"));
    expect(codes).toContain("DEV_PARSE_STAGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/dev/actions.ts",
      fn: "parseAndStage",
      code: "DEV_PARSE_STAGED",
    });

    serviceRoleClientImpl.current = () =>
      makeClient({ rpc: { data: null, error: { message: "boom" } } });
    const failCodes = await observeCodes(() => parseAndStage("_temp-fixture.md"));
    expect(failCodes).not.toContain("DEV_PARSE_STAGED");
  });

  test("resetDevSchema emits DEV_SCHEMA_RESET on success; nothing when the RPC errors", async () => {
    serviceRoleClientImpl.current = () => makeClient({ rpc: { data: null, error: null } });
    const codes = await observeCodes(() => resetDevSchema());
    expect(codes).toContain("DEV_SCHEMA_RESET");
    recordAdminOutcomeBehavior({
      file: "app/admin/dev/actions.ts",
      fn: "resetDevSchema",
      code: "DEV_SCHEMA_RESET",
    });

    serviceRoleClientImpl.current = () =>
      makeClient({ rpc: { data: null, error: { message: "boom" } } });
    const failCodes = await observeCodes(() => resetDevSchema());
    expect(failCodes).not.toContain("DEV_SCHEMA_RESET");
  });
});

// ── Task 11: onboarding serverActions (spec §3.1 A, §5.2) ───────────────────
// Both actions are Promise<never> (they redirect()) — the redirect-safe
// observeCodes helper's catch is what lets the emitted code be observed
// despite the thrown NEXT_REDIRECT-style error (Task 6 scaffold).
describe("Task 11 — onboarding start-over / rerun-setup observe changes", () => {
  test("startOverServerAction emits ONBOARDING_STARTED_OVER before the redirect throw; nothing if the purge throws", async () => {
    const codes = await observeCodes(() => startOverServerAction());
    expect(codes).toContain("ONBOARDING_STARTED_OVER");
    recordAdminOutcomeBehavior({
      file: "lib/onboarding/serverActions.ts",
      fn: "startOverServerAction",
      code: "ONBOARDING_STARTED_OVER",
    });

    purgeAndRotateOnboardingSessionMock.mockImplementation(async () => {
      throw new Error("purge infra fault");
    });
    const failCodes = await observeCodes(() => startOverServerAction());
    expect(failCodes).not.toContain("ONBOARDING_STARTED_OVER");
  });

  test("rerunSetupServerAction emits ONBOARDING_SETUP_RERUN before the redirect throw (both the normal and the finalize-pending-suppressed branch); nothing if the purge throws", async () => {
    const codes = await observeCodes(() => rerunSetupServerAction());
    expect(codes).toContain("ONBOARDING_SETUP_RERUN");
    recordAdminOutcomeBehavior({
      file: "lib/onboarding/serverActions.ts",
      fn: "rerunSetupServerAction",
      code: "ONBOARDING_SETUP_RERUN",
    });

    // Suppressed (finalize batches pending) branch: still redirects (to a
    // different URL) — the emit fires unconditionally once the purge resolves.
    purgeAndRotateOnboardingSessionMock.mockImplementation(async () => ({
      rotated: false,
      suppressed: "WIZARD_FINALIZE_BATCHES_PENDING",
    }));
    const suppressedCodes = await observeCodes(() => rerunSetupServerAction());
    expect(suppressedCodes).toContain("ONBOARDING_SETUP_RERUN");

    purgeAndRotateOnboardingSessionMock.mockImplementation(async () => {
      throw new Error("purge infra fault");
    });
    const failCodes = await observeCodes(() => rerunSetupServerAction());
    expect(failCodes).not.toContain("ONBOARDING_SETUP_RERUN");
  });
});
