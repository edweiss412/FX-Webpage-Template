// Single-file executable behavioral coverage for admin mutation surfaces
// (invariant #10, spec §4.2/§9/§10.5). All state is INLINE — no separate
// recorder module (spec R11 F2 — a cross-file in-memory recorder is
// unreliable under Vitest's per-file isolation/workers/sharding).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
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
// `class` declarations aren't auto-hoisted the way `vi.fn()` initializers are
// (Vitest's hoist transform special-cases vi.fn() but not arbitrary class
// exprs) — wrap in vi.hoisted() so the factory below can reference it. Real
// export (not a bare stub): Task 10's bell routes do `err instanceof
// AdminInfraError` on the requireAdminIdentity() catch path, so the mock must
// provide a class, not leave the import undefined.
const { AdminInfraErrorDouble } = vi.hoisted(() => {
  class AdminInfraErrorDouble extends Error {
    readonly code = "ADMIN_SESSION_LOOKUP_FAILED";
  }
  return { AdminInfraErrorDouble };
});
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: (...a: unknown[]) => requireAdminMock(...a),
  requireAdminIdentity: (...a: unknown[]) => requireAdminIdentityMock(...a),
  AdminInfraError: AdminInfraErrorDouble,
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
const isCurrentUserDeveloperMock = vi.fn(async (..._a: unknown[]) => false);
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloper: (...a: unknown[]) => requireDeveloperMock(...a),
  requireDeveloperIdentity: (...a: unknown[]) => requireDeveloperIdentityMock(...a),
  isCurrentUserDeveloper: (...a: unknown[]) => isCurrentUserDeveloperMock(...a),
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
  for (const m of ["eq", "is", "not", "select", "update", "insert", "single", "limit"])
    node[m] = self;
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

// ── Task 10 (bell notification center): open/read routes ───────────────────
import { POST as bellOpenPOST } from "@/app/api/admin/alerts/bell/open/route";
import { POST as bellReadPOST } from "@/app/api/admin/alerts/bell/read/route";
import { POST as bellConfigPOST } from "@/app/api/admin/alerts/bell/config/route";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";

// ── Task 8 (pull-sheet-on-archived-tab override): accept/revoke route ──────
import { handlePullSheetOverride } from "@/app/api/admin/onboarding/pull-sheet-override/route";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

// ── Flow-4 Task 4: dashboard auto-applied strip accept/undo server actions ──
// Mock the guarded helpers so the behavioral proof flips ok/fail cleanly; mock
// showCacheTag so undo's revalidateShow is a no-op (next/cache above stubs only
// revalidatePath, not revalidateTag).
const acknowledgeChangesMock = vi.fn(async (..._a: unknown[]) => ({ ok: true, count: 1 }) as unknown);
const undoChangeMock = vi.fn(async (..._a: unknown[]) => ({ ok: true, showId: "show-1" }) as unknown);
vi.mock("@/lib/sync/holds/acknowledgeChanges", () => ({
  acknowledgeChanges: (...a: unknown[]) => acknowledgeChangesMock(...a),
}));
vi.mock("@/lib/sync/holds/undoChange", () => ({
  undoChange: (...a: unknown[]) => undoChangeMock(...a),
}));
vi.mock("@/lib/data/showCacheTag", () => ({
  revalidateShow: vi.fn(),
}));
import {
  acceptChangeAction,
  acceptAllAction,
  undoFromDashboardAction,
} from "@/app/admin/_actions/autoApplied";
const AUTO_APPLIED_FILE = "app/admin/_actions/autoApplied.ts";

// ── inline file-local recorder (single-file contract; no cross-file state) ──
const recorded = new Set<string>(); // "file::fn::code"
function recordAdminOutcomeBehavior(x: { file: string; fn: string; code: string }) {
  recorded.add(`${x.file}::${x.fn}::${x.code}`);
}

/** Drive a path with a sink spy; return the codes observed, SWALLOWING any throw.
 * Use ONLY for negative / failure-branch assertions (the `failCodes` cases), which
 * legitimately reject — and several of which throw on the failure path (a redirect
 * action whose purge faults, an RPC helper that raises). A swallowed throw is fine
 * there because the assertion is "code is ABSENT"; a hidden throw cannot manufacture
 * a code. NEVER use this for a success/record path — see `observeSuccessCodes`. */
async function observeCodes(run: () => Promise<unknown>): Promise<string[]> {
  const codes: string[] = [];
  setLogSink((r: LogRecord) => {
    if (r.code) codes.push(r.code);
  });
  try {
    await run();
  } catch {
    /* failure-branch throw — codes already captured; absence is what we assert */
  } finally {
    resetLogSink();
  }
  return codes;
}

/** Drive a SUCCESS path and PROVE the action actually reached its committed-success
 * branch before we certify it (companion whole-diff R2 HIGH). `observeCodes` swallows
 * every throw, so an action that emits its code and then throws an UNEXPECTED error
 * would be falsely recorded as committed-success. This helper closes that: the ONLY
 * sanctioned throw is a `NEXT_REDIRECT` from a `{redirect:true}` action, thrown AFTER
 * the post-commit emit (Next's `redirect()` throws; the mocked `redirect` throws
 * `Error("NEXT_REDIRECT:<url>")`). Any other throw — or a `{redirect:true}` action
 * that returns without redirecting — fails the test RED instead of recording a false
 * proof. Combined with each surface's paired negative `failCodes` case (code ABSENT on
 * the failure branch), an observed code now provably means the committed-success
 * branch executed. */
async function observeSuccessCodes(
  run: () => Promise<unknown>,
  opts: { redirect?: boolean } = {},
): Promise<string[]> {
  const codes: string[] = [];
  setLogSink((r: LogRecord) => {
    if (r.code) codes.push(r.code);
  });
  let thrown: unknown;
  let didThrow = false;
  try {
    await run();
  } catch (err) {
    didThrow = true;
    thrown = err;
  } finally {
    resetLogSink();
  }
  const isRedirect =
    didThrow && thrown instanceof Error && thrown.message.startsWith("NEXT_REDIRECT");
  if (opts.redirect) {
    if (!didThrow) {
      throw new Error(
        "observeSuccessCodes({redirect:true}): expected a NEXT_REDIRECT throw on the success branch, but the action returned without redirecting",
      );
    }
    if (!isRedirect) throw thrown; // an unexpected non-redirect throw must not certify success
  } else if (didThrow) {
    throw thrown; // a non-redirect success path must not throw — do not certify success
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

  // Companion whole-diff R2 HIGH — observeSuccessCodes must not certify a success
  // that actually failed. These prove the hardening has teeth (non-tautology): the
  // 24 success/record sites above all route through observeSuccessCodes, so a
  // surface that emits then throws, or a redirect wrapper that never redirects,
  // fails RED instead of being recorded as committed-success.
  test("observeSuccessCodes RETHROWS a non-redirect throw even after a code was emitted (emit-then-throw ≠ success)", async () => {
    await expect(
      observeSuccessCodes(async () => {
        await logAdminOutcome({ code: "TEST_EMIT_THEN_THROW", source: "t" });
        throw new Error("mutation failed AFTER the emit");
      }),
    ).rejects.toThrow("mutation failed AFTER the emit");
  });

  test("observeSuccessCodes({redirect:true}) FAILS when the action returns without redirecting", async () => {
    await expect(
      observeSuccessCodes(async () => "returned normally, never redirected", { redirect: true }),
    ).rejects.toThrow(/expected a NEXT_REDIRECT throw/);
  });

  test("observeSuccessCodes({redirect:true}) RETHROWS a non-redirect throw (a redirect wrapper that faults is not a success)", async () => {
    await expect(
      observeSuccessCodes(
        async () => {
          await logAdminOutcome({ code: "TEST_REDIRECT_FAULT", source: "t" });
          throw new Error("purge infra fault"); // NOT a NEXT_REDIRECT
        },
        { redirect: true },
      ),
    ).rejects.toThrow("purge infra fault");
  });

  test("observeSuccessCodes({redirect:true}) RETURNS observed codes when a NEXT_REDIRECT is thrown after the emit", async () => {
    const codes = await observeSuccessCodes(
      async () => {
        await logAdminOutcome({ code: "TEST_REDIRECT_OK", source: "t" });
        throw new Error("NEXT_REDIRECT:/admin");
      },
      { redirect: true },
    );
    expect(codes).toContain("TEST_REDIRECT_OK");
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
    const codes = await observeSuccessCodes(() => setAutoPublish(true));
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
    const codes = await observeSuccessCodes(() => setAlertOnAutoPublish(true));
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
    const codes = await observeSuccessCodes(() => setAlertOnSyncProblems(false));
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
    const codes = await observeSuccessCodes(() => setDailyReviewDigest(true));
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
    const codes = await observeSuccessCodes(() => resetValidationDataAction());
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
    const codes = await observeSuccessCodes(() => reseedValidationFixturesAction());
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
    const codes = await observeSuccessCodes(() => addAdminAction(null, form));
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
    const codes = await observeSuccessCodes(() => revokeAdminAction(null, form));
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
    const codes = await observeSuccessCodes(() => setDeveloperAction(null, form));
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
    const codes = await observeSuccessCodes(() => parseAndStage("_temp-fixture.md"));
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
    const codes = await observeSuccessCodes(() => resetDevSchema());
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
    const codes = await observeSuccessCodes(() => parseAndStageFormAction(fd), { redirect: true });
    expect(codes).toContain("DEV_PARSE_STAGED");
    recordAdminOutcomeBehavior({
      file: "app/admin/dev/actions.ts",
      fn: "parseAndStageFormAction",
      code: "DEV_PARSE_STAGED",
    });
  });

  test("resetDevSchemaFormAction transitively emits DEV_SCHEMA_RESET then redirects", async () => {
    serviceRoleClientImpl.current = () => makeClient({ rpc: { data: null, error: null } });
    const codes = await observeSuccessCodes(() => resetDevSchemaFormAction(), { redirect: true });
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
    const codes = await observeSuccessCodes(() => startOverServerAction(), { redirect: true });
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
    const codes = await observeSuccessCodes(() => rerunSetupServerAction(), { redirect: true });
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
    const suppressedCodes = await observeSuccessCodes(() => rerunSetupServerAction(), {
      redirect: true,
    });
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
  test("resolveAdminAlertFormAction emits (reuse) ADMIN_ALERT_RESOLVED on a single-row committed UPDATE; nothing on a missing id or a zero-row UPDATE", async () => {
    // `from` feeds BOTH the guard code-lookup (.maybeSingle → a non-health row, since
    // the array's `.code` is undefined) AND the UPDATE (.select("id") → row evidence).
    // One returned row is the ONLY committed success (Codex whole-diff R1 HIGH guard).
    serverClientImpl.current = async () =>
      makeClient({
        getUser: { data: { user: { email: "admin@example.com" } }, error: null },
        from: { data: [{ id: "11111111-1111-1111-1111-111111111111" }], error: null },
      });
    const form = new FormData();
    form.set("id", "11111111-1111-1111-1111-111111111111");
    const codes = await observeSuccessCodes(() => resolveAdminAlertFormAction(form));
    expect(codes).toContain("ADMIN_ALERT_RESOLVED");
    recordAdminOutcomeBehavior({
      file: "app/admin/actions.ts",
      fn: "resolveAdminAlertFormAction",
      code: "ADMIN_ALERT_RESOLVED",
    });

    // Missing id — the action's early return, no getUser/UPDATE reached.
    const failCodes = await observeCodes(() => resolveAdminAlertFormAction(new FormData()));
    expect(failCodes).not.toContain("ADMIN_ALERT_RESOLVED");

    // Zero-row UPDATE (already-resolved / show-scoped / unknown id): no error, no
    // committed resolve → NO emit (Codex whole-diff R1 HIGH).
    serverClientImpl.current = async () =>
      makeClient({
        getUser: { data: { user: { email: "admin@example.com" } }, error: null },
        from: { data: [], error: null },
      });
    const zeroRowCodes = await observeCodes(() => resolveAdminAlertFormAction(form));
    expect(zeroRowCodes).not.toContain("ADMIN_ALERT_RESOLVED");
  });

  test("retryWatchSubscriptionFormAction emits WATCH_SUBSCRIPTION_RETRIED on successful renewal; nothing on the no-folder skip", async () => {
    const codes = await observeSuccessCodes(() => retryWatchSubscriptionFormAction(new FormData()));
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
    const codes = await observeSuccessCodes(() => resolveHealthAlertFormAction(fd));
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
    const codes = await observeSuccessCodes(() => resetPickerEpoch({ showId: SHOW_ID }));
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
    const codes = await observeSuccessCodes(() => rotateShareToken({ showId: SHOW_ID }));
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
    const codes = await observeSuccessCodes(() =>
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
    const codes = await observeSuccessCodes(() =>
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
    const codes = await observeSuccessCodes(() =>
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

// ── Task 10 (bell notification center): open/read routes observe success only ──
const BELL_OPEN_ROUTE = "app/api/admin/alerts/bell/open/route.ts";
const BELL_READ_ROUTE = "app/api/admin/alerts/bell/read/route.ts";
const BELL_ALERT_ID = "11111111-2222-4333-8444-555555555555";

function bellOpenReq(seenThrough: string): NextRequest {
  return new NextRequest("https://x.test/api/admin/alerts/bell/open", {
    method: "POST",
    body: JSON.stringify({ seenThrough }),
  });
}
function bellReadReq(alertId: string, seenActivityAt: string): NextRequest {
  return new NextRequest("https://x.test/api/admin/alerts/bell/read", {
    method: "POST",
    body: JSON.stringify({ alertId, seenActivityAt }),
  });
}

describe("Task 10 — bell open/read routes observe success only", () => {
  test("open route emits BELL_OPENED on a committed mark; nothing on an rpc error", async () => {
    serviceRoleClientImpl.current = () => makeClient({ rpc: { data: null, error: null } });
    const codes = await observeSuccessCodes(() =>
      bellOpenPOST(bellOpenReq(new Date().toISOString())),
    );
    expect(codes).toContain("BELL_OPENED");
    recordAdminOutcomeBehavior({ file: BELL_OPEN_ROUTE, fn: "POST", code: "BELL_OPENED" });

    serviceRoleClientImpl.current = () =>
      makeClient({ rpc: { data: null, error: { message: "boom" } } });
    const failCodes = await observeCodes(() => bellOpenPOST(bellOpenReq(new Date().toISOString())));
    expect(failCodes).not.toContain("BELL_OPENED");
  });

  test("read route emits BELL_READ_MARKED on a committed mark; nothing on an rpc error", async () => {
    serviceRoleClientImpl.current = () =>
      makeClient({
        from: { data: [{ id: BELL_ALERT_ID, code: "SOME_CODE" }], error: null },
        rpc: { data: null, error: null },
      });
    const codes = await observeSuccessCodes(() =>
      bellReadPOST(bellReadReq(BELL_ALERT_ID, new Date().toISOString())),
    );
    expect(codes).toContain("BELL_READ_MARKED");
    recordAdminOutcomeBehavior({ file: BELL_READ_ROUTE, fn: "POST", code: "BELL_READ_MARKED" });

    serviceRoleClientImpl.current = () =>
      makeClient({
        from: { data: [{ id: BELL_ALERT_ID, code: "SOME_CODE" }], error: null },
        rpc: { data: null, error: { message: "boom" } },
      });
    const failCodes = await observeCodes(() =>
      bellReadPOST(bellReadReq(BELL_ALERT_ID, new Date().toISOString())),
    );
    expect(failCodes).not.toContain("BELL_READ_MARKED");
  });
});

// ── Task 11 (bell notification center): developer-gated config route ───────
const BELL_CONFIG_ROUTE = "app/api/admin/alerts/bell/config/route.ts";

function bellConfigReq(historyDays: number, feedCap: number): NextRequest {
  return new NextRequest("https://x.test/api/admin/alerts/bell/config", {
    method: "POST",
    body: JSON.stringify({ historyDays, feedCap }),
  });
}

describe("Task 11 — bell config route observes success only", () => {
  test("config route emits BELL_CONFIG_UPDATED on a committed update; nothing on an update error", async () => {
    const historyDays = BELL_LIMITS.historyDays.default;
    const feedCap = BELL_LIMITS.feedCap.default;
    serviceRoleClientImpl.current = () =>
      makeClient({ from: { data: [{ id: "default" }], error: null } });
    const codes = await observeSuccessCodes(() =>
      bellConfigPOST(bellConfigReq(historyDays, feedCap)),
    );
    expect(codes).toContain("BELL_CONFIG_UPDATED");
    recordAdminOutcomeBehavior({
      file: BELL_CONFIG_ROUTE,
      fn: "POST",
      code: "BELL_CONFIG_UPDATED",
    });

    serviceRoleClientImpl.current = () =>
      makeClient({ from: { data: null, error: { message: "boom" } } });
    const failCodes = await observeCodes(() => bellConfigPOST(bellConfigReq(historyDays, feedCap)));
    expect(failCodes).not.toContain("BELL_CONFIG_UPDATED");
  });
});

// ── Task 8 (pull-sheet override): accept/revoke route observes success only ──
const PULL_SHEET_OVERRIDE_ROUTE = "app/api/admin/onboarding/pull-sheet-override/route.ts";
const PSO_DRIVE = "pso-drive";
const PSO_SESSION = "22222222-2222-4222-8222-222222222222";
const PSO_TAB = "OLD PULL SHEET";

function psoReq(body: unknown): Request {
  return new Request("https://x.test/api/admin/onboarding/pull-sheet-override", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function psoTab(fingerprint: string): ArchivedPullSheetTab {
  return {
    tabName: PSO_TAB,
    headerPreviews: ["preview"],
    fingerprint,
    included: false,
    contentChangedSinceAccept: false,
  };
}

const psoRpcOk = async (_p: unknown) => ({ data: { override: {} }, error: null });
const psoRpcErr = async (_p: unknown) => ({ data: null, error: { message: "boom" } });
const psoRescanOk = async () => ({ status: "updated" as const });

describe("Task 8 — pull-sheet override route observes SET/CLEARED success only", () => {
  test("accept emits PULL_SHEET_OVERRIDE_SET on committed RPC; nothing on an rpc error", async () => {
    const acceptBody = {
      driveFileId: PSO_DRIVE,
      wizardSessionId: PSO_SESSION,
      tabName: PSO_TAB,
      expectedFingerprint: "ee",
      expectedOverrideSnapshot: null,
    };
    const codes = await observeSuccessCodes(() =>
      handlePullSheetOverride(psoReq(acceptBody), {
        detectArchivedTabs: async () => [psoTab("ee")],
        setPullSheetOverrideRpc: psoRpcOk as never,
        rescanWizardSheet: psoRescanOk as never,
      }),
    );
    expect(codes).toContain("PULL_SHEET_OVERRIDE_SET");
    recordAdminOutcomeBehavior({
      file: PULL_SHEET_OVERRIDE_ROUTE,
      fn: "POST",
      code: "PULL_SHEET_OVERRIDE_SET",
    });

    const failCodes = await observeCodes(() =>
      handlePullSheetOverride(psoReq(acceptBody), {
        detectArchivedTabs: async () => [psoTab("ee")],
        setPullSheetOverrideRpc: psoRpcErr as never,
        rescanWizardSheet: psoRescanOk as never,
      }),
    );
    expect(failCodes).not.toContain("PULL_SHEET_OVERRIDE_SET");
  });

  test("revoke emits PULL_SHEET_OVERRIDE_CLEARED on committed RPC; nothing on an rpc error", async () => {
    const revokeBody = {
      driveFileId: PSO_DRIVE,
      wizardSessionId: PSO_SESSION,
      tabName: null,
      expectedOverrideSnapshot: { tabName: PSO_TAB, fingerprint: "ff" },
    };
    const codes = await observeSuccessCodes(() =>
      handlePullSheetOverride(psoReq(revokeBody), {
        setPullSheetOverrideRpc: psoRpcOk as never,
        rescanWizardSheet: psoRescanOk as never,
      }),
    );
    expect(codes).toContain("PULL_SHEET_OVERRIDE_CLEARED");
    recordAdminOutcomeBehavior({
      file: PULL_SHEET_OVERRIDE_ROUTE,
      fn: "POST",
      code: "PULL_SHEET_OVERRIDE_CLEARED",
    });

    const failCodes = await observeCodes(() =>
      handlePullSheetOverride(psoReq(revokeBody), {
        setPullSheetOverrideRpc: psoRpcErr as never,
        rescanWizardSheet: psoRescanOk as never,
      }),
    );
    expect(failCodes).not.toContain("PULL_SHEET_OVERRIDE_CLEARED");
  });

  test("re-scan FAILS after RPC commit => PULL_SHEET_OVERRIDE_SET STILL emitted (partial-success audit, plan-R8-1)", async () => {
    const acceptBody = {
      driveFileId: PSO_DRIVE,
      wizardSessionId: PSO_SESSION,
      tabName: PSO_TAB,
      expectedFingerprint: "ee",
      expectedOverrideSnapshot: null,
    };
    // observeSuccessCodes RETHROWS a non-redirect throw — so the fact it returns codes
    // ALSO proves the route did NOT propagate the re-scan failure past the committed audit.
    const codes = await observeSuccessCodes(() =>
      handlePullSheetOverride(psoReq(acceptBody), {
        detectArchivedTabs: async () => [psoTab("ee")],
        setPullSheetOverrideRpc: psoRpcOk as never,
        rescanWizardSheet: (async () => {
          throw new Error("rescan timeout");
        }) as never,
      }),
    );
    expect(codes).toContain("PULL_SHEET_OVERRIDE_SET");
  });
});

// ── Flow-4 Task 4: dashboard accept/undo actions observe success only ────────
describe("Flow-4 Task 4 — dashboard accept/undo server actions observe changes", () => {
  const SHOW = "11111111-1111-1111-1111-111111111111";

  test("acceptChangeAction emits CHANGES_ACKNOWLEDGED on {ok:true}; nothing on a missing showId early-return", async () => {
    acknowledgeChangesMock.mockImplementation(async () => ({ ok: true, count: 1 }));
    const fd = new FormData();
    fd.set("showId", SHOW);
    fd.set("changeLogId", "cl-1");
    const codes = await observeSuccessCodes(() => acceptChangeAction(null, fd));
    expect(codes).toContain("CHANGES_ACKNOWLEDGED");
    recordAdminOutcomeBehavior({
      file: AUTO_APPLIED_FILE,
      fn: "acceptChangeAction",
      code: "CHANGES_ACKNOWLEDGED",
    });

    // Missing showId → typed refusal BEFORE the helper; no emit.
    const noShow = new FormData();
    noShow.set("changeLogId", "cl-1");
    const failCodes = await observeCodes(() => acceptChangeAction(null, noShow));
    expect(failCodes).not.toContain("CHANGES_ACKNOWLEDGED");
  });

  test("acceptAllAction emits CHANGES_ACKNOWLEDGED on {ok:true}; nothing on a helper failure", async () => {
    acknowledgeChangesMock.mockImplementation(async () => ({ ok: true, count: 3 }));
    const fd = new FormData();
    fd.set("showId", SHOW);
    fd.set("ids", "a,b,c");
    const codes = await observeSuccessCodes(() => acceptAllAction(null, fd));
    expect(codes).toContain("CHANGES_ACKNOWLEDGED");
    recordAdminOutcomeBehavior({
      file: AUTO_APPLIED_FILE,
      fn: "acceptAllAction",
      code: "CHANGES_ACKNOWLEDGED",
    });

    acknowledgeChangesMock.mockImplementation(async () => ({ ok: false, code: "SYNC_INFRA_ERROR" }));
    const failCodes = await observeCodes(() => acceptAllAction(null, fd));
    expect(failCodes).not.toContain("CHANGES_ACKNOWLEDGED");
  });

  test("undoFromDashboardAction emits CHANGE_UNDONE on {ok:true}; nothing on a helper refusal", async () => {
    undoChangeMock.mockImplementation(async () => ({ ok: true, showId: "show-1" }));
    const fd = new FormData();
    fd.set("changeLogId", "cl-9");
    const codes = await observeSuccessCodes(() => undoFromDashboardAction(null, fd));
    expect(codes).toContain("CHANGE_UNDONE");
    recordAdminOutcomeBehavior({
      file: AUTO_APPLIED_FILE,
      fn: "undoFromDashboardAction",
      code: "CHANGE_UNDONE",
    });

    undoChangeMock.mockImplementation(async () => ({ ok: false, code: "CHANGE_ALREADY_UNDONE" }));
    const failCodes = await observeCodes(() => undoFromDashboardAction(null, fd));
    expect(failCodes).not.toContain("CHANGE_UNDONE");
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
