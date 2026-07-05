// Single-file executable behavioral coverage for admin mutation surfaces
// (invariant #10, spec §4.2/§9/§10.5). All state is INLINE — no separate
// recorder module (spec R11 F2 — a cross-file in-memory recorder is
// unreliable under Vitest's per-file isolation/workers/sharding).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome"; // NOT re-exported from @/lib/log (verified live)
import type { LogRecord } from "@/lib/log";
import { collectSurfaceUnits } from "./mutationSurface/enumerate";
import { AUDITABLE_MUTATIONS } from "./_auditableMutations";
import { ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER } from "./mutationSurface/exemptions";

// ── shared auth/Next mocks (Tasks 7-15) ─────────────────────────────────────
// Per plan Tasks 7-16: NEVER mock @/lib/log or @/lib/log/logAdminOutcome here —
// the sink-spy proof requires the REAL logger. Mock ONLY auth/data/Next deps.
const requireAdminMock = vi.fn(async (..._a: unknown[]) => undefined);
const requireAdminIdentityMock = vi.fn(async (..._a: unknown[]) => ({
  email: "admin@example.com",
}));
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
const requireDeveloperIdentityMock = vi.fn(async (..._a: unknown[]) => ({
  email: "dev@example.com",
}));
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

import {
  parseAndStage,
  resetDevSchema,
  parseAndStageFormAction,
  resetDevSchemaFormAction,
} from "@/app/admin/dev/actions";

// ── Task 11: onboarding serverActions ───────────────────────────────────────
const purgeAndRotateOnboardingSessionMock = vi.fn(
  async (..._a: unknown[]) => ({ rotated: true }) as unknown,
);
vi.mock("@/lib/onboarding/sessionLifecycle", () => ({
  purgeAndRotateOnboardingSession: (...a: unknown[]) => purgeAndRotateOnboardingSessionMock(...a),
}));

import { startOverServerAction, rerunSetupServerAction } from "@/lib/onboarding/serverActions";

// ── Task 12: app/admin/actions ──────────────────────────────────────────────
const getActiveWatchedFolderMock = vi.fn(
  async (..._a: unknown[]) => ({ folderId: "folder-1" }) as unknown,
);
vi.mock("@/lib/appSettings/getWatchedFolderId", () => ({
  getActiveWatchedFolder: (...a: unknown[]) => getActiveWatchedFolderMock(...a),
}));

const subscribeToWatchedFolderMock = vi.fn(
  async (..._a: unknown[]) => ({ outcome: "active" as const, channelId: "chan-1" }) as unknown,
);
vi.mock("@/lib/drive/watch", () => ({
  subscribeToWatchedFolder: (...a: unknown[]) => subscribeToWatchedFolderMock(...a),
}));

const resolveAdminAlertMock = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/adminAlerts/resolveAdminAlert", () => ({
  resolveAdminAlert: (...a: unknown[]) => resolveAdminAlertMock(...a),
}));

const { WatchRetryInfraErrorDouble } = vi.hoisted(() => {
  class WatchRetryInfraErrorDouble extends Error {
    constructor(stage: string) {
      super(`watch retry infra error: ${stage}`);
    }
  }
  return { WatchRetryInfraErrorDouble };
});
vi.mock("@/lib/admin/watchRetryError", () => ({
  WatchRetryInfraError: WatchRetryInfraErrorDouble,
}));

import {
  resolveAdminAlertFormAction,
  resolveHealthAlertFormAction,
  retryWatchSubscriptionFormAction,
} from "@/app/admin/actions";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";

// ── Task 13: admin picker mutations ─────────────────────────────────────────
// resetPickerEpoch calls upsertAdminAlert (observational) — mock so the behavioral
// test does not drive that side-channel's real writer.
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn(async () => null),
}));
import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";
import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";
import { resetCrewMemberSelection } from "@/lib/auth/picker/resetCrewMemberSelection";

// ── Task 14: admin routes (manifest/ignore, reap-stale-sessions) ────────────
import { handleWizardManifestIgnore } from "@/app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route";
import { handleReapStaleSessions } from "@/app/api/admin/onboarding/reap-stale-sessions/route";

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
    async () =>
      ({ kind: "ok" as const, email: "target@example.com", isDeveloper: true }) as unknown,
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
  getActiveWatchedFolderMock.mockImplementation(async () => ({ folderId: "folder-1" }));
  subscribeToWatchedFolderMock.mockImplementation(async () => ({
    outcome: "active" as const,
    channelId: "chan-1",
  }));
  resolveAdminAlertMock.mockImplementation(async () => undefined);
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
    selfForm.set("email", "dev@example.com"); // matches the developer-gate actor (self-revoke refusal)
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

  // The two form-action wrappers are their own admin surfaces (the <form action=…>
  // POST entry points). They delegate to the registered core, so driving the WRAPPER
  // transitively fires the same code — the behavioral proof is on the wrapper itself
  // (redirect()-throwing, so observeCodes catches the NEXT_REDIRECT after the emit).
  test("parseAndStageFormAction transitively emits DEV_PARSE_STAGED then redirects", async () => {
    serviceRoleClientImpl.current = () =>
      makeClient({
        rpc: { data: { kind: "pending_sync", id: "ps-1", show_id: null }, error: null },
      });
    const fd = new FormData();
    fd.set("fixture", "_temp-fixture.md");
    const codes = await observeCodes(() => parseAndStageFormAction(fd));
    expect(codes).toContain("DEV_PARSE_STAGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/dev/actions.ts",
      fn: "parseAndStageFormAction",
      code: "DEV_PARSE_STAGED",
    });
  });

  test("resetDevSchemaFormAction transitively emits DEV_SCHEMA_RESET then redirects", async () => {
    serviceRoleClientImpl.current = () => makeClient({ rpc: { data: null, error: null } });
    const codes = await observeCodes(() => resetDevSchemaFormAction());
    expect(codes).toContain("DEV_SCHEMA_RESET");
    recordAdminOutcomeBehavior({
      file: "app/admin/dev/actions.ts",
      fn: "resetDevSchemaFormAction",
      code: "DEV_SCHEMA_RESET",
    });
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

// ── Task 12: app/admin/actions (spec §3.1 A, §5.2) ──────────────────────────
describe("Task 12 — alert-resolve + watch-retry observe success only", () => {
  test("resolveAdminAlertFormAction emits (reuse) ADMIN_ALERT_RESOLVED on the committed UPDATE; nothing on a missing id", async () => {
    serverClientImpl.current = async () =>
      makeClient({
        getUser: { data: { user: { email: "admin@example.com" } }, error: null },
        from: { error: null },
      });
    const form = new FormData();
    form.set("id", "11111111-1111-1111-1111-111111111111");
    const codes = await observeCodes(() => resolveAdminAlertFormAction(form));
    expect(codes).toContain("ADMIN_ALERT_RESOLVED");
    recordAdminOutcomeBehavior({
      file: "app/admin/actions.ts",
      fn: "resolveAdminAlertFormAction",
      code: "ADMIN_ALERT_RESOLVED",
    });

    // Missing id — the action's early return, no getUser/UPDATE reached.
    const failCodes = await observeCodes(() => resolveAdminAlertFormAction(new FormData()));
    expect(failCodes).not.toContain("ADMIN_ALERT_RESOLVED");
  });

  test("retryWatchSubscriptionFormAction emits WATCH_SUBSCRIPTION_RETRIED on successful renewal; nothing on the no-folder skip", async () => {
    const codes = await observeCodes(() => retryWatchSubscriptionFormAction(new FormData()));
    expect(codes).toContain("WATCH_SUBSCRIPTION_RETRIED");
    recordAdminOutcomeBehavior({
      file: "app/admin/actions.ts",
      fn: "retryWatchSubscriptionFormAction",
      code: "WATCH_SUBSCRIPTION_RETRIED",
    });

    getActiveWatchedFolderMock.mockImplementation(async () => ({ kind: "no_folder_configured" }));
    const failCodes = await observeCodes(() => retryWatchSubscriptionFormAction(new FormData()));
    expect(failCodes).not.toContain("WATCH_SUBSCRIPTION_RETRIED");
  });
});

// ── Reconciliation: resolveHealthAlertFormAction (developer-gated health-alert resolve;
// landed on main after this branch's base). Two sequential supabase calls with different
// shapes (code lookup via .maybeSingle(); UPDATE returning row evidence via .select("id")),
// so it needs a bespoke client double rather than the generic makeClient. ──────────────────
const HEALTH_ALERT_ID = "33333333-3333-4333-8333-333333333333";
function healthAlertClient(opts: { code: string; updatedRows: unknown[] }) {
  return async () => {
    const node: Record<string, unknown> = {};
    const self = () => node;
    for (const m of ["select", "eq", "is", "update"]) node[m] = self;
    // First call ends in .maybeSingle() → the alert's code + show_id row.
    node.maybeSingle = async () => ({ data: { code: opts.code, show_id: null }, error: null });
    // Second call ends in .select("id") → awaited node resolves to the UPDATE evidence.
    node.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve({ data: opts.updatedRows, error: null }).then(res, rej);
    return { from: () => node };
  };
}

describe("Reconciliation — resolveHealthAlertFormAction observes ADMIN_ALERT_RESOLVED on a committed health resolve", () => {
  test("HEALTH_CODES row + single UPDATE row → emits; a non-health (doug) code emits nothing", async () => {
    const fd = new FormData();
    fd.set("id", HEALTH_ALERT_ID);
    serverClientImpl.current = healthAlertClient({
      code: HEALTH_CODES[0]!,
      updatedRows: [{ id: HEALTH_ALERT_ID }],
    });
    const codes = await observeCodes(() => resolveHealthAlertFormAction(fd));
    expect(codes).toContain("ADMIN_ALERT_RESOLVED");
    recordAdminOutcomeBehavior({
      file: "app/admin/actions.ts",
      fn: "resolveHealthAlertFormAction",
      code: "ADMIN_ALERT_RESOLVED",
    });

    // Non-health code (a `doug`-audience alert) → defense-in-depth refusal, no emit.
    serverClientImpl.current = healthAlertClient({
      code: "SHOW_FIRST_PUBLISHED",
      updatedRows: [{ id: HEALTH_ALERT_ID }],
    });
    const failCodes = await observeCodes(() => resolveHealthAlertFormAction(fd));
    expect(failCodes).not.toContain("ADMIN_ALERT_RESOLVED");
  });
});

// ── Task 13: admin picker mutations (spec §3.1 A, §9 — emit post-RPC, outside lock) ──
const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const CREW_ID = "22222222-2222-2222-2222-222222222222";

describe("Task 13 — picker epoch/share-token/selection resets observe success only", () => {
  test("resetPickerEpoch emits PICKER_EPOCH_RESET_BY_ADMIN on {ok:true}; nothing when the RPC returns a non-number", async () => {
    serverClientImpl.current = async () => makeClient({ rpc: { data: 7, error: null } });
    const codes = await observeCodes(() => resetPickerEpoch({ showId: SHOW_ID }));
    expect(codes).toContain("PICKER_EPOCH_RESET_BY_ADMIN");
    recordAdminOutcomeBehavior({
      file: "lib/auth/picker/resetPickerEpoch.ts",
      fn: "resetPickerEpoch",
      code: "PICKER_EPOCH_RESET_BY_ADMIN",
    });

    // Failure: RPC returned error → {ok:false}, no emit.
    serverClientImpl.current = async () =>
      makeClient({ rpc: { data: null, error: { message: "db down" } } });
    const failCodes = await observeCodes(() => resetPickerEpoch({ showId: SHOW_ID }));
    expect(failCodes).not.toContain("PICKER_EPOCH_RESET_BY_ADMIN");
  });

  test("rotateShareToken emits SHARE_TOKEN_ROTATED_BY_ADMIN (epoch only, never the token) on {ok:true}; nothing on RPC error", async () => {
    serverClientImpl.current = async () =>
      makeClient({ rpc: { data: { new_share_token: "c".repeat(64), new_epoch: 4 }, error: null } });
    const codes = await observeCodes(() => rotateShareToken({ showId: SHOW_ID }));
    expect(codes).toContain("SHARE_TOKEN_ROTATED_BY_ADMIN");
    recordAdminOutcomeBehavior({
      file: "lib/auth/picker/rotateShareToken.ts",
      fn: "rotateShareToken",
      code: "SHARE_TOKEN_ROTATED_BY_ADMIN",
    });

    // Failure: RPC returned error → {ok:false}, no emit.
    serverClientImpl.current = async () =>
      makeClient({ rpc: { data: null, error: { message: "db down" } } });
    const failCodes = await observeCodes(() => rotateShareToken({ showId: SHOW_ID }));
    expect(failCodes).not.toContain("SHARE_TOKEN_ROTATED_BY_ADMIN");
  });

  test("resetCrewMemberSelection emits PICKER_SELECTION_RESET_BY_ADMIN on {ok:true}; nothing on a not-found (NULL) result", async () => {
    serverClientImpl.current = async () =>
      makeClient({ rpc: { data: "2026-07-05T00:00:00.000Z", error: null } });
    const codes = await observeCodes(() =>
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    );
    expect(codes).toContain("PICKER_SELECTION_RESET_BY_ADMIN");
    recordAdminOutcomeBehavior({
      file: "lib/auth/picker/resetCrewMemberSelection.ts",
      fn: "resetCrewMemberSelection",
      code: "PICKER_SELECTION_RESET_BY_ADMIN",
    });

    // Failure: RPC returned NULL (crew member not found) → {ok:false}, no emit.
    serverClientImpl.current = async () => makeClient({ rpc: { data: null, error: null } });
    const failCodes = await observeCodes(() =>
      resetCrewMemberSelection({ showId: SHOW_ID, crewMemberId: CREW_ID }),
    );
    expect(failCodes).not.toContain("PICKER_SELECTION_RESET_BY_ADMIN");
  });
});

// ── Task 14: admin routes (surface key = {file, fn:"POST"}) ──────────────────
const MANIFEST_ROUTE =
  "app/api/admin/onboarding/manifest/[wizardSessionId]/[driveFileId]/ignore/route.ts";
const REAP_ROUTE = "app/api/admin/onboarding/reap-stale-sessions/route.ts";
const WSID = "11111111-2222-4333-8444-555555555555";
const DFID = "drive-file-t14";

// Transparent injected withRowTx: runs the callback against a query stub, no real lock.
function manifestWithRowTx(status: string, transitionOk: boolean) {
  return async <R>(
    _driveFileId: string,
    fn: (tx: { queryOne<T>(sql: string, params: unknown[]): Promise<T> }) => Promise<R> | R,
  ): Promise<R> => {
    const tx = {
      async queryOne<T>(sql: string): Promise<T> {
        if (/from public\.onboarding_scan_manifest/i.test(sql) && /for update/i.test(sql)) {
          return { name: "Sheet.gsheet", status } as T;
        }
        if (/insert into public\.deferred_ingestions/i.test(sql)) return { upserted: true } as T;
        if (/update public\.onboarding_scan_manifest/i.test(sql))
          return (transitionOk ? { updated: true } : null) as T;
        return null as T;
      },
    };
    return await fn(tx);
  };
}

function manifestCtx() {
  return { params: Promise.resolve({ wizardSessionId: WSID, driveFileId: DFID }) };
}
function manifestReq() {
  return new Request(`https://x.test/api/admin/onboarding/manifest/${WSID}/${DFID}/ignore`, {
    method: "POST",
  });
}

describe("Task 14 — manifest-ignore + reap-stale-sessions routes observe success only", () => {
  test("manifest/ignore route emits MANIFEST_SHEET_IGNORED on the committed transition; nothing on a status-gate refusal", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deps: any = {
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      withRowTx: manifestWithRowTx("live_row_conflict", true),
    };
    const codes = await observeCodes(() =>
      handleWizardManifestIgnore(manifestReq(), manifestCtx(), deps),
    );
    expect(codes).toContain("MANIFEST_SHEET_IGNORED");
    recordAdminOutcomeBehavior({
      file: MANIFEST_ROUTE,
      fn: "POST",
      code: "MANIFEST_SHEET_IGNORED",
    });

    // Status-gate refusal (non-ignorable status) → 409 Response, no mutation, no emit.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refuseDeps: any = {
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
      withRowTx: manifestWithRowTx("staged", true),
    };
    const failCodes = await observeCodes(() =>
      handleWizardManifestIgnore(manifestReq(), manifestCtx(), refuseDeps),
    );
    expect(failCodes).not.toContain("MANIFEST_SHEET_IGNORED");
  });

  test("reap route emits STALE_SESSIONS_REAPED on a successful reap; nothing when the reap throws", async () => {
    const codes = await observeCodes(() =>
      handleReapStaleSessions(new Request("https://x.test/reap", { method: "POST" }), {
        requireAdminIdentity: async () => ({ email: "dev@example.com" }),
        reapStaleOnboardingSessions: async () => ({
          sessions: [{ wizardSessionId: "a", outcome: "reaped_full" as const }],
        }),
      }),
    );
    expect(codes).toContain("STALE_SESSIONS_REAPED");
    recordAdminOutcomeBehavior({ file: REAP_ROUTE, fn: "POST", code: "STALE_SESSIONS_REAPED" });

    // Reap throws (infra fault) → 500, no emit.
    const failCodes = await observeCodes(() =>
      handleReapStaleSessions(new Request("https://x.test/reap", { method: "POST" }), {
        requireAdminIdentity: async () => ({ email: "dev@example.com" }),
        reapStaleOnboardingSessions: async () => {
          throw new Error("reap infra down");
        },
      }),
    );
    expect(failCodes).not.toContain("STALE_SESSIONS_REAPED");
  });
});

// ── Task 18: executable behavioral-coverage assertion (spec §4.2 / §9 / §10.5) ──
// Runs LAST: every recording test above has populated the file-local `recorded` set
// within this one module scope (spec R11 F2 — no cross-file recorder). This is the
// teeth of the admin contract: a registered admin surface that is NOT grandfathered
// MUST have driven its success branch and been observed emitting its code.
describe("Task 18 — admin behavioral coverage (every registered non-grandfather admin mutation is proven)", () => {
  const adminUnits = collectSurfaceUnits(["app", "lib", "components"]).filter((u) => u.admin);
  const adminKeys = new Set(adminUnits.map((u) => `${u.file}::${u.fn}`));
  const grandfather = new Set(ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.map((g) => `${g.file}::${g.fn}`));

  test("the grandfather baseline is exactly the frozen 30 and each entry is still a live admin surface", () => {
    expect(ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.length).toBe(30);
    // No stale entries — a grandfather row must still resolve to a live admin surface
    // (fails if a route/action was deleted or renamed out from under the baseline).
    const stale = ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.filter(
      (g) => !adminKeys.has(`${g.file}::${g.fn}`),
    );
    expect(
      stale,
      `stale grandfather entries:\n${stale.map((g) => `${g.file}::${g.fn}`).join("\n")}`,
    ).toEqual([]);
  });

  test("every registered admin mutation NOT in the grandfather baseline has an observed behavioral record", () => {
    // Registry rows scoped to ADMIN surfaces only (the one non-admin registry row —
    // the emailed-link unpublish ROUTE — passes the discovery floor via its emit and
    // is not subject to the admin behavioral contract).
    const missing = AUDITABLE_MUTATIONS.filter((r) => adminKeys.has(`${r.file}::${r.fn}`))
      .filter((r) => !grandfather.has(`${r.file}::${r.fn}`))
      .filter((r) => !recorded.has(`${r.file}::${r.fn}::${r.code}`));
    expect(
      missing,
      `unproven admin mutations (registered but no observed success emit in this file):\n${missing
        .map((r) => `${r.file}::${r.fn}::${r.code}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
