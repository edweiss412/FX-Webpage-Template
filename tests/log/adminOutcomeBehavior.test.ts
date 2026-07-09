// Single-file executable behavioral coverage for admin mutation surfaces
// (invariant #10, spec §4.2/§9/§10.5). All state is INLINE — no separate
// recorder module (spec R11 F2 — a cross-file in-memory recorder is
// unreliable under Vitest's per-file isolation/workers/sharding).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
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
const acknowledgeChangesMock = vi.fn(
  async (..._a: unknown[]) => ({ ok: true, count: 1 }) as unknown,
);
const undoChangeMock = vi.fn(
  async (..._a: unknown[]) => ({ ok: true, showId: "show-1" }) as unknown,
);
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

// ── Batch 1: grandfathered per-show server-action deps (spec §3.2) ──────────
// The 6 actions delegate to a mockable lifecycle caller / hold-gate helper; each
// emits its code via the REAL logAdminOutcome on the committed-success branch, so
// we mock ONLY the delegate (never @/lib/log — file rule at top). Show resolution
// runs against the shared swappable `serverClientImpl` (resolveShowBySlug/ById).
// undoChange + showCacheTag.revalidateShow are already mocked above for the
// dashboard auto-applied actions; feed.undoChangeAction reuses undoChangeMock.
const archiveShowMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as unknown);
const unarchiveShowMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as unknown);
const publishShowMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as unknown);
const unpublishShowMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as unknown);
vi.mock("@/lib/showLifecycle/archiveShow", () => ({
  archiveShow: (...a: unknown[]) => archiveShowMock(...a),
}));
vi.mock("@/lib/showLifecycle/unarchiveShow", () => ({
  unarchiveShow: (...a: unknown[]) => unarchiveShowMock(...a),
}));
vi.mock("@/lib/showLifecycle/publishShow", () => ({
  publishShow: (...a: unknown[]) => publishShowMock(...a),
}));
vi.mock("@/lib/showLifecycle/unpublishShow", () => ({
  unpublishShow: (...a: unknown[]) => unpublishShowMock(...a),
}));

const approveMi11HoldMock = vi.fn(
  async (..._a: unknown[]) => ({ ok: true, showId: "show-77" }) as unknown,
);
const rejectMi11HoldMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as unknown);
vi.mock("@/lib/sync/holds/mi11GateActions", () => ({
  approveMi11Hold: (...a: unknown[]) => approveMi11HoldMock(...a),
  rejectMi11Hold: (...a: unknown[]) => rejectMi11HoldMock(...a),
}));

// ── Batch 1: grandfathered per-show server actions (spec §3.1) ──────────────
import { archiveShowAction } from "@/app/admin/show/[slug]/_actions/archive";
import { unarchiveShowAction } from "@/app/admin/show/[slug]/_actions/unarchive";
import { setShowPublishedAction } from "@/app/admin/show/[slug]/_actions/setPublished";
import {
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
} from "@/app/admin/show/[slug]/_actions/feed";

// ── Batch 2: 16 clean DI-seam admin route POST handlers (spec §3.1) ─────────
// Driven by direct `routeDeps` injection (mutation dep / faked-tx) — NO module
// vi.mock is added (spec §3.2 / §6). Names collide across data-quality vs
// ignored-sheets un-ignore, so alias on import.
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import { handleWizardStagedUnapprove } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route";
import { handleWizardStagedDiscard } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route";
import { handleLiveStagedApply } from "@/app/api/admin/show/staged/[stagedId]/apply/route";
import { handleLiveStagedDiscard } from "@/app/api/admin/show/staged/[stagedId]/discard/route";
import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { handleLivePendingIngestionDiscard } from "@/app/api/admin/pending-ingestions/[id]/discard/route";
import { handleIgnore as handleDataQualityIgnore } from "@/app/api/admin/show/[slug]/data-quality/ignore/route";
import { handleUnignore as handleDataQualityUnignore } from "@/app/api/admin/show/[slug]/data-quality/unignore/route";
import { handleAdminAlertGlobalResolve } from "@/app/api/admin/admin-alerts/[id]/resolve/route";
import { handleAdminAlertShowResolve } from "@/app/api/admin/show/[slug]/alerts/[id]/resolve/route";
import {
  handleWizardPendingIngestionRetry,
  handleWizardPendingIngestionAction,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { handleRescanSheet } from "@/app/api/admin/onboarding/rescan-sheet/route";
import { handleCleanupAbandonedFinalize } from "@/app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route";
import { handleOnboardingScan } from "@/app/api/admin/onboarding/scan/route";
import { handleUnignore as handleIgnoredSheetUnignore } from "@/app/api/admin/ignored-sheets/[driveFileId]/unignore/route";

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

// ── Batch 2 shared infra (OUTSIDE the sentinel block — may call observers) ──
// A NON-swallowing failure observer: unlike `observeCodes`, it captures any throw
// in `thrown` and the handler return in `result` instead of hiding it, so the
// paired-proof helper can prove the failure was the INTENDED refusal (exact
// status, no escaped infra throw) — spec §3.3 steps 5-6 / plan Substep A.
async function observeFailure(
  run: () => Promise<unknown>,
): Promise<{ codes: string[]; thrown: unknown; result: unknown }> {
  const codes: string[] = [];
  setLogSink((r: LogRecord) => {
    if (r.code) codes.push(r.code);
  });
  let thrown: unknown;
  let result: unknown;
  try {
    result = await run();
  } catch (err) {
    thrown = err;
  } finally {
    resetLogSink();
  }
  return { codes, thrown, result };
}

/** The SOLE recording path for every Batch-2 row (spec §3.3). Proves BOTH drives
 * are real AND the failure is the intended refusal, not a swallowed infra error:
 * success emits the code (post-commit ⇒ committed branch ran); failure has the
 * code ABSENT, reached the injected refusal seam (`mark.hit`), let no throw escape
 * the handler, and returned the EXACT intended refusal status. Only then records. */
async function proveAdminOutcomeBehavior(args: {
  file: string;
  fn: string;
  code: string;
  success: () => Promise<unknown>;
  failure: (mark: { hit: boolean }) => Promise<unknown>;
  failureExpect: { status: number; code?: string };
}): Promise<void> {
  const { file, fn, code, success, failure, failureExpect } = args;
  const key = `${file}::${fn}::${code}`;
  const ok = await observeSuccessCodes(success);
  expect(ok, `success drive for ${key} did not emit ${code}`).toContain(code);

  const mark = { hit: false };
  const { codes, thrown, result } = await observeFailure(() => failure(mark));
  expect(codes, `failure drive for ${key} still emitted the success code`).not.toContain(code);
  expect(mark.hit, `failure drive for ${key} never reached the injected refusal seam`).toBe(true);
  expect(thrown, `failure drive for ${key} let a throw escape the handler`).toBeUndefined();
  expect(result, `failure drive for ${key} did not return a Response`).toBeInstanceOf(Response);
  expect((result as Response).status, `failure drive for ${key} returned the wrong status`).toBe(
    failureExpect.status,
  );
  if (failureExpect.code) {
    expect(codes, `failure drive for ${key} missing the intended refusal telemetry`).toContain(
      failureExpect.code,
    );
  }

  recordAdminOutcomeBehavior({ file, fn, code });
}

/** A minimal in-memory transaction double for the withTx/withRowTx/withRowTryLock
 * seams. Defaults resolve nothing; per-route committed/refusal shapes are supplied
 * via `overrides` (typically a `queryOne`/`query`/`deleteLiveDeferral` override).
 * Scoped to Batch 2; touches no existing test. */
function fakeTx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    queryOne: async () => null,
    run: async () => undefined,
    holdPort: () => ({ unsafe: async () => [] as unknown[] }),
    ...overrides,
  };
}

/** Read a streaming NDJSON response body to EOF so an emit inside
 * `ReadableStream.start()` (route #18) actually runs. Mirrors the local
 * `readNdjson` drain in tests/onboarding/scanRoute.test.ts:143. */
async function drainNdjson(res: Response): Promise<void> {
  await res.text();
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
  // Batch 1 per-show action delegates (success defaults; failure set per-test):
  archiveShowMock.mockImplementation(async () => ({ ok: true }));
  unarchiveShowMock.mockImplementation(async () => ({ ok: true }));
  publishShowMock.mockImplementation(async () => ({ ok: true }));
  unpublishShowMock.mockImplementation(async () => ({ ok: true }));
  approveMi11HoldMock.mockImplementation(async () => ({ ok: true, showId: "show-77" }));
  rejectMi11HoldMock.mockImplementation(async () => ({ ok: true }));
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

    acknowledgeChangesMock.mockImplementation(async () => ({
      ok: false,
      code: "SYNC_INFRA_ERROR",
    }));
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

// ── Batch 1: grandfathered per-show server actions graduate to inline proof ──
// BL-ADMIN-OUTCOME-BEHAVIOR (spec §3): each of the 6 actions was in
// ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER (now removed). Each drives its committed-success
// branch through observeSuccessCodes (records ONLY after observing the real emit) and
// is paired with a refusal case proving the emit is committed-success-gated. archive/
// unarchive/setPublished resolve the show via the shared swappable serverClientImpl
// (resolveShowBySlug / resolveShowById in _actions/shared.ts).
const FOUND_SHOW = { id: "show-b1", drive_file_id: "drive-b1" };
function resolvedShowClient() {
  return async () => makeClient({ from: { data: FOUND_SHOW, error: null } });
}

describe("Batch 1 — grandfathered per-show server actions observe success only", () => {
  test("archiveShowAction emits SHOW_ARCHIVED on committed success; nothing when archiveShow refuses", async () => {
    serverClientImpl.current = resolvedShowClient();
    const codes = await observeSuccessCodes(() => archiveShowAction("slug-b1"));
    expect(codes).toContain("SHOW_ARCHIVED");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/archive.ts",
      fn: "archiveShowAction",
      code: "SHOW_ARCHIVED",
    });

    archiveShowMock.mockImplementation(async () => ({ ok: false, code: "ARCHIVE_BLOCKED" }));
    const failCodes = await observeCodes(() => archiveShowAction("slug-b1"));
    expect(failCodes).not.toContain("SHOW_ARCHIVED");
  });

  test("unarchiveShowAction emits SHOW_UNARCHIVED_BY_ADMIN on committed success; nothing when the RPC refuses", async () => {
    serverClientImpl.current = resolvedShowClient();
    const codes = await observeSuccessCodes(() => unarchiveShowAction("show-b1"));
    expect(codes).toContain("SHOW_UNARCHIVED_BY_ADMIN");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/unarchive.ts",
      fn: "unarchiveShowAction",
      code: "SHOW_UNARCHIVED_BY_ADMIN",
    });

    unarchiveShowMock.mockImplementation(async () => ({ ok: false }));
    const failCodes = await observeCodes(() => unarchiveShowAction("show-b1"));
    expect(failCodes).not.toContain("SHOW_UNARCHIVED_BY_ADMIN");
  });

  test("setShowPublishedAction emits SHOW_PUBLISHED (next=true) and SHOW_UNPUBLISHED_BY_ADMIN (next=false); nothing on refusal", async () => {
    serverClientImpl.current = resolvedShowClient();
    const pubCodes = await observeSuccessCodes(() => setShowPublishedAction("slug-b1", true));
    expect(pubCodes).toContain("SHOW_PUBLISHED");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/setPublished.ts",
      fn: "setShowPublishedAction",
      code: "SHOW_PUBLISHED",
    });

    const unpubCodes = await observeSuccessCodes(() => setShowPublishedAction("slug-b1", false));
    expect(unpubCodes).toContain("SHOW_UNPUBLISHED_BY_ADMIN");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/setPublished.ts",
      fn: "setShowPublishedAction",
      code: "SHOW_UNPUBLISHED_BY_ADMIN",
    });

    unpublishShowMock.mockImplementation(async () => ({ ok: false, code: "FINALIZE_OWNED_SHOW" }));
    const failCodes = await observeCodes(() => setShowPublishedAction("slug-b1", false));
    expect(failCodes).not.toContain("SHOW_UNPUBLISHED_BY_ADMIN");
  });

  test("mi11ApproveAction emits MI11_HOLD_APPROVED on {ok:true}; nothing on refusal", async () => {
    const fd = new FormData();
    fd.set("holdId", "hold-b1");
    const codes = await observeSuccessCodes(() => mi11ApproveAction(null, fd));
    expect(codes).toContain("MI11_HOLD_APPROVED");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/feed.ts",
      fn: "mi11ApproveAction",
      code: "MI11_HOLD_APPROVED",
    });

    approveMi11HoldMock.mockImplementation(async () => ({
      ok: false,
      code: "IDENTITY_WOULD_COLLIDE",
    }));
    const failCodes = await observeCodes(() => mi11ApproveAction(null, fd));
    expect(failCodes).not.toContain("MI11_HOLD_APPROVED");
  });

  test("mi11RejectAction emits MI11_HOLD_REJECTED on {ok:true}; nothing on refusal", async () => {
    const fd = new FormData();
    fd.set("holdId", "hold-b1");
    const codes = await observeSuccessCodes(() => mi11RejectAction(null, fd));
    expect(codes).toContain("MI11_HOLD_REJECTED");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/feed.ts",
      fn: "mi11RejectAction",
      code: "MI11_HOLD_REJECTED",
    });

    rejectMi11HoldMock.mockImplementation(async () => ({ ok: false, code: "MI11_HOLD_GONE" }));
    const failCodes = await observeCodes(() => mi11RejectAction(null, fd));
    expect(failCodes).not.toContain("MI11_HOLD_REJECTED");
  });

  test("undoChangeAction emits CHANGE_UNDONE on {ok:true}; nothing on refusal", async () => {
    // undoChangeMock is shared with the dashboard auto-applied undo test (which runs
    // earlier and leaves it at failure) and is NOT reset in beforeEach — set success here.
    undoChangeMock.mockImplementation(async () => ({ ok: true, showId: "show-9" }));
    const fd = new FormData();
    fd.set("changeLogId", "cl-b1");
    const codes = await observeSuccessCodes(() => undoChangeAction(null, fd));
    expect(codes).toContain("CHANGE_UNDONE");
    recordAdminOutcomeBehavior({
      file: "app/admin/show/[slug]/_actions/feed.ts",
      fn: "undoChangeAction",
      code: "CHANGE_UNDONE",
    });

    undoChangeMock.mockImplementation(async () => ({ ok: false, code: "CHANGE_ALREADY_UNDONE" }));
    const failCodes = await observeCodes(() => undoChangeAction(null, fd));
    expect(failCodes).not.toContain("CHANGE_UNDONE");
  });
});

// ── Batch 2: 16 clean DI-seam admin route POSTs graduate to inline proof ────
// Each row calls ONLY `proveAdminOutcomeBehavior` (structural guard below). Every
// DB/Drive/lock seam is injected per spec §3.5 so no default Postgres/advisory/
// Drive impl is reached; the env-poison below makes any missed seam throw.
describe("Batch 2 — clean DI-seam admin route POSTs observe success only", () => {
  const W1 = "11111111-1111-4111-8111-111111111111";
  const STAGED = "22222222-2222-4222-8222-222222222222";
  const A1 = "44444444-4444-4444-8444-444444444444";
  const PID = "33333333-3333-4333-8333-333333333333";
  const DFID = "df-batch2-unignore";
  const admin = async () => ({ email: "admin@example.com" });

  // Deterministic DB/Drive/client-free enforcement (spec §3.5) — poison all THREE
  // default-infra channels for the duration of this block. Any un-injected
  // postgres()/Drive/Supabase-client default then throws (ECONNREFUSED /
  // missing-cred / thrown stub) → RED on both drives.
  const POISON_ENV: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of ["TEST_DATABASE_URL", "DATABASE_URL"]) {
      POISON_ENV[k] = process.env[k];
      process.env[k] = "postgresql://poison:poison@127.0.0.1:1/none"; // port 1 = unreachable
    }
    POISON_ENV.GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; // Drive defaults throw
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(POISON_ENV)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  // Runs AFTER the file-level beforeEach (which re-benigns the clients) → wins.
  beforeEach(() => {
    serverClientImpl.current = () => {
      throw new Error("Batch-2: Supabase client must be injected via routeDeps, not defaulted");
    };
    serviceRoleClientImpl.current = () => {
      throw new Error("Batch-2: service-role client must be injected, not defaulted");
    };
  });

  // >>> BATCH-2 PROOF BLOCK START
  test("#1 wizard staged apply emits STAGE_APPLIED", async () => {
    const file = "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts";
    const ctx = { params: Promise.resolve({ wizardSessionId: W1, driveFileId: "file-1" }) };
    const request = () =>
      new Request("https://x/apply", {
        method: "POST",
        body: JSON.stringify({ stagedId: STAGED, reviewerChoicesVersion: 1, reviewerChoices: [] }),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "STAGE_APPLIED",
      success: () =>
        handleWizardStagedApply(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) => fn(fakeTx() as never),
          applyStaged: async () => ({
            outcome: "wizard_applied",
            wizardSessionId: W1,
            stagedId: STAGED,
          }),
          upsertAdminAlert: async () => null,
        }),
      failure: (mark) =>
        handleWizardStagedApply(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) => fn(fakeTx() as never),
          applyStaged: async () => {
            mark.hit = true;
            return { outcome: "superseded", code: "STAGED_PARSE_SUPERSEDED" };
          },
          upsertAdminAlert: async () => null,
        }),
      failureExpect: { status: 409 },
    });
  });

  test("#3 wizard staged unapprove emits STAGE_UNAPPROVED", async () => {
    const file =
      "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/unapprove/route.ts";
    const ctx = { params: Promise.resolve({ wizardSessionId: W1, driveFileId: "file-1" }) };
    const request = () => new Request("https://x/unapprove", { method: "POST" });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "STAGE_UNAPPROVED",
      success: () =>
        handleWizardStagedUnapprove(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) =>
            fn(fakeTx({ queryOne: async () => ({ unapproved: true }) }) as never),
        }),
      failure: (mark) =>
        handleWizardStagedUnapprove(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) =>
            fn(
              fakeTx({
                queryOne: async () => {
                  mark.hit = true;
                  return null;
                },
              }) as never,
            ),
        }),
      failureExpect: { status: 409 },
    });
  });

  test("#4 wizard staged discard emits STAGE_DISCARDED", async () => {
    const file = "app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts";
    const ctx = { params: Promise.resolve({ wizardSessionId: W1, driveFileId: "file-1" }) };
    const request = () =>
      new Request("https://x/discard", {
        method: "POST",
        body: JSON.stringify({ stagedId: STAGED, kind: "try_again_next_sync" }),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "STAGE_DISCARDED",
      success: () =>
        handleWizardStagedDiscard(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) => fn(fakeTx() as never),
          discardStagedUnlocked: async () => ({ outcome: "discarded", variant: "try_again" }),
        }),
      failure: (mark) =>
        handleWizardStagedDiscard(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) => fn(fakeTx() as never),
          discardStagedUnlocked: async () => {
            mark.hit = true;
            return { outcome: "not_found", code: "PENDING_SYNC_NOT_FOUND" };
          },
        }),
      failureExpect: { status: 409 }, // wizard not_found → 409 STALE_DISCARD_REJECTED
    });
  });

  test("#7 live-staged apply emits SHOW_APPLIED", async () => {
    const file = "app/api/admin/show/staged/[stagedId]/apply/route.ts";
    const ctx = { params: Promise.resolve({ stagedId: STAGED }) };
    const stagedTx = () =>
      fakeTx({
        queryOne: async (sql: string) => {
          const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
          if (s.includes("pg_locks")) return { held: true };
          if (s.startsWith("select drive_file_id")) return { drive_file_id: "file-1" };
          if (s.startsWith("select slug")) return { slug: "first-seen-show" };
          return null;
        },
      });
    const request = () =>
      new Request("https://x/apply", {
        method: "POST",
        body: JSON.stringify({ reviewer_choices: [] }),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "SHOW_APPLIED",
      success: () =>
        handleLiveStagedApply(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) => fn(stagedTx() as never),
          readDriveFileIdForStagedId: async () => "file-1",
          readShowSlug: async () => "first-seen-show",
          applyStaged: async () => ({
            outcome: "applied",
            showId: "show-1",
            syncAuditId: null,
            derivedSideEffects: { revokeFloorForNames: [] },
          }),
        }),
      failure: (mark) =>
        handleLiveStagedApply(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) => fn(stagedTx() as never),
          readDriveFileIdForStagedId: async () => "file-1",
          readShowSlug: async () => "first-seen-show",
          applyStaged: async () => {
            mark.hit = true;
            return { outcome: "superseded", code: "STAGED_PARSE_SUPERSEDED" };
          },
        }),
      failureExpect: { status: 409 },
    });
  });

  test("#8 live pending-ingestion retry emits PENDING_INGESTION_RETRIED", async () => {
    const file = "app/api/admin/pending-ingestions/[id]/retry/route.ts";
    const ctx = { params: Promise.resolve({ id: PID }) };
    const lockTx = () =>
      fakeTx({
        queryOne: async (sql: string) => {
          const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
          if (s.includes("pg_locks")) return { held: true };
          if (s.startsWith("select id, drive_file_id"))
            return {
              id: PID,
              drive_file_id: "file-1",
              wizard_session_id: null,
              last_seen_modified_time: "2026-05-08T12:00:00.000Z",
            };
          if (s.startsWith("select exists")) return { exists: true };
          if (s.startsWith("select archived")) return { archived: false };
          if (s.startsWith("select watched_folder_id")) return { watched_folder_id: "folder-1" };
          if (s.startsWith("select slug")) return { slug: "show-slug" };
          return null;
        },
      });
    const baseDeps = () => ({
      requireAdminIdentity: admin,
      readDriveFileIdForPendingIngestion: async () => "file-1",
      withRowTryLock: async (_id: string, fn: (tx: never) => unknown) => fn(lockTx() as never),
      readFinalizeOwnershipGuardUnlocked: async () => false,
      fetchDriveFileMetadata: async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      }),
    });
    const request = () =>
      new Request("https://x/retry", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "PENDING_INGESTION_RETRIED",
      success: () =>
        handleLivePendingIngestionRetry(request(), ctx, {
          ...baseDeps(),
          runManualSyncForShowUnlocked: async () => ({
            outcome: "applied",
            showId: "show-1",
            parseWarnings: [],
          }),
        } as never),
      failure: (mark) =>
        handleLivePendingIngestionRetry(request(), ctx, {
          ...baseDeps(),
          runManualSyncForShowUnlocked: async () => {
            mark.hit = true;
            return { outcome: "hard_fail", code: "PARSE_ERROR" };
          },
        } as never),
      failureExpect: { status: 200 }, // still_failed JSON, no telemetry code
    });
  });

  test("#9 data-quality ignore emits WARNING_IGNORED", async () => {
    const file = "app/api/admin/show/[slug]/data-quality/ignore/route.ts";
    const ctx = { params: Promise.resolve({ slug: "rpas" }) };
    const request = () =>
      new Request("https://x/ignore", {
        method: "POST",
        body: JSON.stringify({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "WARNING_IGNORED",
      success: () =>
        handleDataQualityIgnore(request(), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  if (/from public\.shows/.test(sql)) return { id: "sid" };
                  if (/insert into public\.ignored_warnings/.test(sql))
                    return { fingerprint: "fp" };
                  return null;
                },
              }) as never,
            ),
        }),
      failure: (mark) =>
        handleDataQualityIgnore(request(), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  if (/from public\.shows/.test(sql)) return { id: "sid" };
                  if (/insert into public\.ignored_warnings/.test(sql)) {
                    mark.hit = true;
                    return null; // ON CONFLICT no-op → not mutated → no emit
                  }
                  return null;
                },
              }) as never,
            ),
        }),
      failureExpect: { status: 200 },
    });
  });

  test("#10 data-quality unignore emits WARNING_UNIGNORED", async () => {
    const file = "app/api/admin/show/[slug]/data-quality/unignore/route.ts";
    const ctx = { params: Promise.resolve({ slug: "rpas" }) };
    const request = () =>
      new Request("https://x/unignore", {
        method: "POST",
        body: JSON.stringify({ code: "UNKNOWN_FIELD", rawSnippet: "Storage | x" }),
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "WARNING_UNIGNORED",
      success: () =>
        handleDataQualityUnignore(request(), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  if (/from public\.shows/.test(sql)) return { id: "sid" };
                  if (/delete from public\.ignored_warnings/.test(sql))
                    return { fingerprint: "fp" };
                  return null;
                },
              }) as never,
            ),
        }),
      failure: (mark) =>
        handleDataQualityUnignore(request(), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  if (/from public\.shows/.test(sql)) return { id: "sid" };
                  if (/delete from public\.ignored_warnings/.test(sql)) {
                    mark.hit = true;
                    return null; // 0 rows → not mutated → no emit
                  }
                  return null;
                },
              }) as never,
            ),
        }),
      failureExpect: { status: 200 },
    });
  });

  test("#11 admin-alerts global resolve emits ADMIN_ALERT_RESOLVED", async () => {
    const file = "app/api/admin/admin-alerts/[id]/resolve/route.ts";
    const ctx = { params: Promise.resolve({ id: A1 }) };
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "ADMIN_ALERT_RESOLVED",
      success: () => {
        let row: {
          id: string;
          show_id: string | null;
          slug: string | null;
          resolved_at: string | null;
        } | null = { id: A1, show_id: null, slug: null, resolved_at: null };
        return handleAdminAlertGlobalResolve(new Request("https://x"), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  const s = sql.replace(/\s+/g, " ").trim();
                  if (s.startsWith("select")) return row;
                  if (s.startsWith("update public.admin_alerts")) {
                    if (!row || row.show_id !== null) return null;
                    row = { ...row, resolved_at: "DB_NOW" };
                    return row;
                  }
                  return null;
                },
              }) as never,
            ),
        });
      },
      failure: (mark) =>
        handleAdminAlertGlobalResolve(new Request("https://x"), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  if (sql.replace(/\s+/g, " ").trim().startsWith("select")) {
                    mark.hit = true;
                    return null; // alert not found → 404, never commits
                  }
                  return null;
                },
              }) as never,
            ),
        }),
      failureExpect: { status: 404 },
    });
  });

  test("#12 show-scoped alert resolve emits ADMIN_ALERT_RESOLVED", async () => {
    const file = "app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts";
    const ctx = { params: Promise.resolve({ slug: "test-show", id: A1 }) };
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "ADMIN_ALERT_RESOLVED",
      success: () => {
        let alert: {
          id: string;
          show_id: string;
          resolved_at: string | null;
          code: string;
        } | null = { id: A1, show_id: "show-1", resolved_at: null, code: "LIVE_ROW_CONFLICT" };
        const show = { id: "show-1", slug: "test-show" };
        return handleAdminAlertShowResolve(new Request("https://x"), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string, params: unknown[]) => {
                  const s = sql.replace(/\s+/g, " ").trim();
                  if (s.startsWith("select id, slug")) return show;
                  if (s.startsWith("select id, show_id")) {
                    if (!alert || alert.id !== params[0]) return null;
                    if (alert.show_id !== params[1]) return null;
                    return alert;
                  }
                  if (s.startsWith("update public.admin_alerts")) {
                    if (!alert || alert.show_id !== params[1]) return null;
                    alert = { ...alert, resolved_at: "DB_NOW" };
                    return alert;
                  }
                  return null;
                },
              }) as never,
            ),
        });
      },
      failure: (mark) =>
        handleAdminAlertShowResolve(new Request("https://x"), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  const s = sql.replace(/\s+/g, " ").trim();
                  if (s.startsWith("select id, slug")) return { id: "show-1", slug: "test-show" };
                  if (s.startsWith("select id, show_id")) {
                    mark.hit = true;
                    return null; // cross-show / not found → 404, never commits
                  }
                  return null;
                },
              }) as never,
            ),
        }),
      failureExpect: { status: 404 },
    });
  });

  test("#13 live pending-ingestion discard emits PENDING_INGESTION_DISCARDED", async () => {
    const file = "app/api/admin/pending-ingestions/[id]/discard/route.ts";
    const ctx = { params: Promise.resolve({ id: "pi-1" }) };
    const request = () =>
      new Request("https://x/discard", {
        method: "POST",
        body: JSON.stringify({ kind: "permanent_ignore" }),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "PENDING_INGESTION_DISCARDED",
      success: () =>
        handleLivePendingIngestionDiscard(request(), ctx, {
          requireAdminIdentity: admin,
          readDriveFileIdForPendingIngestion: async () => "df-1",
          withRowTryLock: async (_id: string, fn: (tx: never) => unknown) =>
            fn(
              fakeTx({
                queryOne: async (sql: string) => {
                  if (/from public\.pending_ingestions/.test(sql) && /for update/.test(sql))
                    return {
                      id: "pi-1",
                      drive_file_id: "df-1",
                      wizard_session_id: null,
                      last_seen_modified_time: "2026-05-08T12:00:00.000Z",
                      drive_file_name: "Sheet.xlsx",
                    };
                  return { upserted: true };
                },
              }) as never,
            ),
        } as never),
      failure: (mark) =>
        handleLivePendingIngestionDiscard(request(), ctx, {
          requireAdminIdentity: admin,
          readDriveFileIdForPendingIngestion: async () => "df-1",
          withRowTryLock: async () => {
            mark.hit = true;
            return { skipped: "CONCURRENT_SYNC_SKIPPED" };
          },
        } as never),
      failureExpect: { status: 409 },
    });
  });

  test("#14 wizard pending-ingestion retry/defer/ignore emit RETRIED + DEFERRED + IGNORED", async () => {
    const file = "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts";
    const ctx = () => ({ params: Promise.resolve({ id: PID }) });
    const retryDeps = () => ({
      requireAdminIdentity: admin,
      withRowTx: async (_id: string, fn: (tx: never) => unknown) => fn(fakeTx() as never),
      readDriveFileIdForPendingIngestion: async () => "file-1",
      readWizardSessionForPendingIngestion: async () => W1,
      upsertAdminAlert: async () => "alert-id",
      readCurrentWizardSessionId: async () => W1,
    });
    // The committed defer/ignore tx: locked row present + manifest/deferral/delete
    // all affect a row so `committedAction` is set and the emit fires post-commit.
    const committingTx = () =>
      fakeTx({
        queryOne: async (sql: string) => {
          const s = sql.replace(/\s+/g, " ").trim();
          if (/pg_locks/i.test(s)) return { held: true };
          if (s.startsWith("select drive_file_id"))
            return {
              id: PID,
              drive_file_id: "file-1",
              wizard_session_id: W1,
              discovered_during_folder_id: "folder-1",
              last_seen_modified_time: "2026-05-08T12:00:00.000Z",
              drive_file_name: "Sheet One.gsheet",
            };
          if (s.startsWith("select pending_wizard_session_id"))
            return { pending_wizard_session_id: W1, pending_folder_id: "folder-1" };
          if (s.startsWith("update public.onboarding_scan_manifest")) return { updated: true };
          if (s.startsWith("insert into public.deferred_ingestions")) return { upserted: true };
          if (s.startsWith("delete from public.pending_ingestions")) return { deleted: true };
          return null;
        },
      });
    // MANDATED pre-mutation 404 refusal: the pre-tx guard passes (real id), but the
    // in-tx locked-row read returns null → requireCurrentWizardRow 404, BEFORE any
    // mutation and WITHOUT reaching the rollback alert deps (spec §3.3).
    const notFoundTx = (mark: { hit: boolean }) =>
      fakeTx({
        queryOne: async (sql: string) => {
          const s = sql.replace(/\s+/g, " ").trim();
          if (/pg_locks/i.test(s)) return { held: true };
          if (s.startsWith("select drive_file_id")) {
            mark.hit = true;
            return null;
          }
          if (s.startsWith("select pending_wizard_session_id"))
            return { pending_wizard_session_id: W1, pending_folder_id: "folder-1" };
          return null;
        },
      });

    // RETRIED leg
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "PENDING_INGESTION_RETRIED",
      success: () =>
        handleWizardPendingIngestionRetry(
          new Request("https://x/retry", { method: "POST" }),
          ctx(),
          {
            ...retryDeps(),
            retrySingleFile: async () => ({ outcome: "retried", status: "staged" }),
          } as never,
        ),
      failure: (mark) =>
        handleWizardPendingIngestionRetry(
          new Request("https://x/retry", { method: "POST" }),
          ctx(),
          {
            ...retryDeps(),
            retrySingleFile: async () => {
              mark.hit = true;
              return { outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" };
            },
          } as never,
        ),
      failureExpect: { status: 409 },
    });

    // DEFERRED leg (via the shared action handler)
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "PENDING_INGESTION_DEFERRED",
      success: () =>
        handleWizardPendingIngestionAction(
          ctx(),
          {
            ...retryDeps(),
            withRowTx: async (_id: string, fn: (tx: never) => unknown) =>
              fn(committingTx() as never),
            retrySingleFile: async () => ({ outcome: "retried", status: "staged" }),
          } as never,
          "defer_until_modified",
        ),
      failure: (mark) =>
        handleWizardPendingIngestionAction(
          ctx(),
          {
            ...retryDeps(),
            readDriveFileIdForPendingIngestion: async () => "file-1",
            withRowTx: async (_id: string, fn: (tx: never) => unknown) =>
              fn(notFoundTx(mark) as never),
            retrySingleFile: async () => ({ outcome: "retried", status: "staged" }),
          } as never,
          "defer_until_modified",
        ),
      // 404 PENDING_INGESTION_NOT_FOUND — a response-body code, not a log-sink code,
      // so no `failureExpect.code` is asserted (see report / spec deviation).
      failureExpect: { status: 404 },
    });

    // IGNORED leg
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "PENDING_INGESTION_IGNORED",
      success: () =>
        handleWizardPendingIngestionAction(
          ctx(),
          {
            ...retryDeps(),
            withRowTx: async (_id: string, fn: (tx: never) => unknown) =>
              fn(committingTx() as never),
            retrySingleFile: async () => ({ outcome: "retried", status: "staged" }),
          } as never,
          "permanent_ignore",
        ),
      failure: (mark) =>
        handleWizardPendingIngestionAction(
          ctx(),
          {
            ...retryDeps(),
            readDriveFileIdForPendingIngestion: async () => "file-1",
            withRowTx: async (_id: string, fn: (tx: never) => unknown) =>
              fn(notFoundTx(mark) as never),
            retrySingleFile: async () => ({ outcome: "retried", status: "staged" }),
          } as never,
          "permanent_ignore",
        ),
      failureExpect: { status: 404 },
    });
  });

  test("#15 rescan-sheet emits SHEET_RESCANNED", async () => {
    const file = "app/api/admin/onboarding/rescan-sheet/route.ts";
    const request = () =>
      new Request("https://x/rescan", {
        method: "POST",
        body: JSON.stringify({ driveFileId: "df-1", wizardSessionId: W1 }),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "SHEET_RESCANNED",
      success: () =>
        handleRescanSheet(request(), {
          rescanWizardSheet: (async () => ({
            status: "updated",
            needsReview: false,
            changed: true,
          })) as never,
        }),
      failure: (mark) =>
        handleRescanSheet(request(), {
          rescanWizardSheet: (async () => {
            mark.hit = true;
            return { status: "busy", code: "RESCAN_BUSY" };
          }) as never,
        }),
      failureExpect: { status: 200 },
    });
  });

  test("#16 cleanup-abandoned-finalize emits FINALIZE_CLEANUP_DONE", async () => {
    const file = "app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts";
    const ctx = { params: Promise.resolve({ sessionId: W1 }) };
    const cleanupTx = () =>
      fakeTx({
        query: async (sql: string) => {
          if (/insert into public\.sync_audit/.test(sql))
            return { rows: [{ id: "audit-1" }], rowCount: 1 };
          return {
            rows: [{ applied_manifest_count: 0, shadow_count: 0, unresolved_manifest_count: 0 }],
            rowCount: 1,
          };
        },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "FINALIZE_CLEANUP_DONE",
      success: () =>
        handleCleanupAbandonedFinalize(new Request("https://x"), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn: (tx: never) => unknown) => fn(cleanupTx() as never),
          cleanupAbandonedFinalize: async () => ({ status: "cleaned" }),
          randomUUID: () => STAGED,
        } as never),
      failure: (mark) =>
        handleCleanupAbandonedFinalize(new Request("https://x"), ctx, {
          requireAdminIdentity: admin,
          withTx: async (fn: (tx: never) => unknown) => fn(cleanupTx() as never),
          cleanupAbandonedFinalize: async () => {
            mark.hit = true;
            return { status: "already_cleaned" };
          },
          randomUUID: () => STAGED,
        } as never),
      failureExpect: { status: 200 },
    });
  });

  test("#17 live-staged discard emits STAGE_DISCARDED", async () => {
    const file = "app/api/admin/show/staged/[stagedId]/discard/route.ts";
    const ctx = { params: Promise.resolve({ stagedId: STAGED }) };
    const request = () =>
      new Request("https://x/discard", {
        method: "POST",
        body: JSON.stringify({ kind: "defer_until_modified" }),
        headers: { "content-type": "application/json" },
      });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "STAGE_DISCARDED",
      success: () =>
        handleLiveStagedDiscard(request(), ctx, {
          requireAdminIdentity: admin,
          readDriveFileIdForStagedId: async () => "file-1",
          readShowSlug: async () => "first-seen-show",
          discardStaged: async () => ({ outcome: "discarded", variant: "defer_until_modified" }),
        }),
      failure: (mark) =>
        handleLiveStagedDiscard(request(), ctx, {
          requireAdminIdentity: admin,
          readDriveFileIdForStagedId: async () => "file-1",
          readShowSlug: async () => "first-seen-show",
          discardStaged: async () => {
            mark.hit = true;
            return { outcome: "not_found", code: "PENDING_SYNC_NOT_FOUND" };
          },
        }),
      failureExpect: { status: 404 }, // live not_found → 404 STALE_DISCARD_REJECTED
    });
  });

  test("#18 onboarding scan (streaming) emits ONBOARDING_SCAN_COMPLETED", async () => {
    const file = "app/api/admin/onboarding/scan/route.ts";
    const request = () =>
      new Request("https://x/scan", {
        method: "POST",
        body: JSON.stringify({ folderUrl: "https://drive.google.com/drive/folders/folder-1" }),
        headers: { "content-type": "application/json" },
      });
    const scanTx = () => fakeTx({ query: async () => ({ rows: [] as unknown[], rowCount: 0 }) });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "ONBOARDING_SCAN_COMPLETED",
      success: async () => {
        const res = await handleOnboardingScan(request(), {
          requireAdminIdentity: admin,
          randomUUID: () => W1,
          verifyFolder: async () => ({
            ok: true,
            folderId: "folder-1",
            folderName: "FXAV Onboarding",
          }),
          withTx: async (fn: (tx: never) => unknown) => fn(scanTx() as never),
          runOnboardingScan: async () => ({ outcome: "completed", processed: [] }),
        } as never);
        await drainNdjson(res); // run the stream so start()'s emit fires
        return res;
      },
      failure: async (mark) => {
        const res = await handleOnboardingScan(request(), {
          requireAdminIdentity: admin,
          randomUUID: () => W1,
          verifyFolder: async () => ({
            ok: true,
            folderId: "folder-1",
            folderName: "FXAV Onboarding",
          }),
          withTx: async (fn: (tx: never) => unknown) => fn(scanTx() as never),
          runOnboardingScan: async () => {
            mark.hit = true;
            return {
              outcome: "superseded",
              code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
              processed: [],
            };
          },
        } as never);
        await drainNdjson(res); // drain so the absence is real, not trivially true
        return res;
      },
      failureExpect: { status: 200 }, // stream Response is always 200
    });
  });

  test("#20 ignored-sheets unignore emits IGNORED_SHEET_UNIGNORED", async () => {
    const file = "app/api/admin/ignored-sheets/[driveFileId]/unignore/route.ts";
    const ctx = { params: Promise.resolve({ driveFileId: DFID }) };
    const request = () => new Request("https://x/unignore", { method: "POST" });
    await proveAdminOutcomeBehavior({
      file,
      fn: "POST",
      code: "IGNORED_SHEET_UNIGNORED",
      success: () =>
        handleIgnoredSheetUnignore(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async (_id, fn) =>
            fn(fakeTx({ deleteLiveDeferral: async () => undefined }) as never),
        }),
      failure: (mark) =>
        handleIgnoredSheetUnignore(request(), ctx, {
          requireAdminIdentity: admin,
          withRowTx: async () => {
            mark.hit = true;
            throw new Error("boom"); // only non-emit path is the caught-throw → 500
          },
        }),
      // The handler CATCHES internally (no escaped throw), logs the sink code, and
      // returns 500 SYNC_INFRA_ERROR — the intended refusal telemetry discriminates it.
      failureExpect: { status: 500, code: "IGNORED_SHEET_UNIGNORE_FAILED" },
    });
  });
  // <<< BATCH-2 PROOF BLOCK END
});

// Structural guard (spec §3.3 / plan Substep A, Codex plan-R3): the Batch-2 proof
// block records ONLY through the paired-proof helper. Reading this file's own
// source and slicing between the sentinels makes "record directly / skip the
// failure drive" a CI failure, not a convention. The helper + observers live
// OUTSIDE the sentinels (shared infra) so they may call each other freely.
describe("Batch 2 — structural guard (paired-proof helper is the sole recording path)", () => {
  test("no direct observe*/record calls appear inside the Batch-2 proof block", () => {
    const src = readFileSync(new URL(import.meta.url), "utf8");
    const start = src.indexOf("// >>> BATCH-2 PROOF BLOCK START");
    const end = src.indexOf("// <<< BATCH-2 PROOF BLOCK END");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = src.slice(start, end);
    expect(slice).not.toMatch(/\brecordAdminOutcomeBehavior\s*\(/);
    expect(slice).not.toMatch(/\bobserveSuccessCodes\s*\(/);
    expect(slice).not.toMatch(/\bobserveCodes\s*\(/);
    expect(slice).not.toMatch(/\bobserveFailure\s*\(/);
    // Sanity: the block DOES route through the paired-proof helper.
    expect(slice).toMatch(/\bproveAdminOutcomeBehavior\s*\(/);
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

  test("the grandfather baseline matches the frozen pin (8 after Batch 2) and each entry is still a live admin surface", () => {
    expect(ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER.length).toBe(8);
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
