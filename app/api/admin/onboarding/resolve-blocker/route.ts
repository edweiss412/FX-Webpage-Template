import { NextResponse } from "next/server";
import postgres from "postgres";

import { requireAdminIdentity as realRequireAdminIdentity } from "@/lib/auth/requireAdmin";
import { SHOW_ARCHIVED_IMMUTABLE, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import {
  prepareOnboardingFiles as defaultPrepareOnboardingFiles,
  scanOnboardingPreparedFiles as defaultScanOnboardingPreparedFiles,
} from "@/lib/sync/runOnboardingScan";
import { applyRescanDecisionUnderLock } from "@/lib/onboarding/applyRescanDecisionUnderLock";
import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { deferPostResponse } from "@/lib/async/deferPostResponse";

/**
 * POST /api/admin/onboarding/resolve-blocker.
 *
 * Task 7 makes `action: "unarchive"` real and exports the live `POST` handler
 * (Codex plan-R1 F2). `resolveRebuild` is STILL the Task 6 SAFE non-throwing
 * `not_currently_blocked` placeholder until Task 8 — it never throws and never
 * mutates, so the now-live surface can never 500 on a `rebuild` request.
 *
 * Two-phase structure for `action: "rebuild"` (spec §3.2): a PRE-LOCK phase (advisory
 * session read + advisory cap read + Drive fetch + prepareOnboardingFiles) runs with NO
 * advisory lock held — never hold `pg_advisory_xact_lock` + an open tx across a
 * multi-second Drive round-trip (mirrors `rescanWizardSheet.ts`'s pre-lock Drive read).
 * The LOCKED phase re-checks session state FOR UPDATE, looks up the show, takes the single
 * per-show advisory lock, then dispatches. `action: "unarchive"` has no Drive step and
 * skips the pre-lock phase entirely.
 *
 * The route opens the privileged `postgres.js` connection directly (mirroring
 * `finalize-cas/route.ts`), NOT a `withTx` seam — so its DB-touching tests are honestly
 * DB-integration tests (TEST_DATABASE_URL against local 127.0.0.1:54322); only the pure
 * body/`wrong_action` guards run without a DB.
 */

const REBUILDABLE_CODES = new Set(["STAGED_REVIEW_ITEMS_CORRUPT", "STAGED_PARSE_RESULT_CORRUPT"]);

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("resolve-blocker route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export type ResolveBlockerRouteDeps = {
  // Injectable seams: auth (all tests), the pre-lock Drive parse, and — CRITICALLY — the
  // REAL core's OWN `scanOnboardingPreparedFiles` seam (NOT the whole applyRescanDecisionUnderLock).
  // Injecting the scan layer forces each RescanDecisionOutcome while the REAL core runs its
  // real shadow-delete + onShadowDeleted co-location — injecting the whole apply function would
  // make the seven-outcome/cap proof tautological (Codex plan-R2 F3).
  requireAdminIdentity?: () => Promise<{ email: string }>;
  prepareOnboardingFiles?: typeof defaultPrepareOnboardingFiles;
  scanOnboardingPreparedFiles?: typeof defaultScanOnboardingPreparedFiles;
};

type ResolveBlockerResponse =
  | { ok: true; status: "resolved" }
  | { ok: false; status: "escalated"; code: string }
  | { ok: false; status: "needs_attention" | "busy"; code: string }
  | {
      ok: false;
      status:
        | "superseded"
        | "no_active_session"
        | "not_found"
        | "not_currently_blocked"
        | "bad_request"
        | "wrong_action";
    };

type Body = { wizardSessionId?: unknown; driveFileId?: unknown; code?: unknown; action?: unknown };

// Minimal structural shape shared by a raw postgres.js Sql/TransactionSql — matches the
// finalize-cas `postgresTxAdapter` seam shape (route.ts:118) without importing postgres.js's
// generic TransactionSql type.
type RawTx = { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> };

// Adapts the raw postgres.js RawTx (`.unsafe`) to the `{ queryOne }` shape
// `readShowArchived_unlocked` expects (mirrors lib/sync/lockedShowTx.ts's private
// `postgresTxAdapter` — not exported there, so this route keeps its own copy).
function queryOneTxAdapter(tx: RawTx): { queryOne<T>(sql: string, params: unknown[]): Promise<T> } {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      const rows = await tx.unsafe(sql, params);
      return rows[0] as T;
    },
  };
}

// Task 7 — real `_unarchive_show_apply` dispatch under the already-held advisory lock
// (spec §3.2 "action: unarchive", steps 3-6).
async function resolveUnarchive(
  tx: RawTx,
  { wizardSessionId, driveFileId, showId, admin }: {
    wizardSessionId: string;
    driveFileId: string;
    showId: string;
    admin: { email: string };
  },
): Promise<Response> {
  // Step 3a — authorization scoping (Codex R2 F2 + R3 F1): re-derive session
  // membership under the held lock. Absent → not_currently_blocked, no mutation.
  const manifestRows = (await tx.unsafe(
    `select 1 from public.onboarding_scan_manifest where wizard_session_id = $1::uuid and drive_file_id = $2`,
    [wizardSessionId, driveFileId],
  )) as unknown[];
  if (manifestRows.length === 0) {
    return NextResponse.json({ ok: false, status: "not_currently_blocked" } satisfies ResolveBlockerResponse);
  }
  // Step 3b — re-derive the current blocking condition (the exact predicate
  // finalize-cas uses). Not archived → not_currently_blocked, no mutation.
  const archived = await readShowArchived_unlocked(queryOneTxAdapter(tx), driveFileId);
  if (!archived) {
    return NextResponse.json({ ok: false, status: "not_currently_blocked" } satisfies ResolveBlockerResponse);
  }
  // Step 4 — the single source of the archived->held transition (owner SQL,
  // NOT the is_admin()-gated unarchive_show — the route's owner postgres.js
  // connection has no JWT for is_admin() to read; see spec §3.2).
  const applyRows = (await tx.unsafe(`select public._unarchive_show_apply($1) as transitioned`, [
    showId,
  ])) as Array<{ transitioned: boolean }>;
  const transitioned = applyRows[0]?.transitioned ?? false;
  // Step 6 — post-commit forensic breadcrumb (invariant 10): scheduled via the
  // canonical post-response scheduler, outside the advisory-lock txn. The task
  // body catches ALL rejections; deferPostResponse itself is never awaited.
  deferPostResponse(async () => {
    await logAdminOutcome({
      code: "ONBOARDING_BLOCKER_UNARCHIVED",
      source: "api.admin.onboarding.resolveBlocker",
      actorEmail: admin.email,
      driveFileId,
      wizardSessionId,
      showId,
      result: transitioned ? "unarchived" : "noop",
    }).catch(() => {});
  });
  // Step 5 — either boolean maps to the same success response (idempotent no-op
  // is still a resolve from the wizard UI's perspective).
  return NextResponse.json({ ok: true, status: "resolved" } satisfies ResolveBlockerResponse);
}

// Task 6 SAFE PLACEHOLDER — never throws, never mutates. Task 8 replaces this body with the
// real cap-gated rebuild dispatch (scanOnboardingPreparedFiles → applyRescanDecisionUnderLock)
// under the already-held advisory lock, and adds the `POST` export.
async function resolveRebuild(
  _tx: RawTx,
  _ctx: {
    wizardSessionId: string;
    driveFileId: string;
    code: string;
    admin: { email: string };
    prepared: Awaited<ReturnType<typeof defaultPrepareOnboardingFiles>>[number] | undefined;
    pendingFolderId: string;
    deps?: ResolveBlockerRouteDeps | undefined;
  },
): Promise<Response> {
  return NextResponse.json({ ok: false, status: "not_currently_blocked" } satisfies ResolveBlockerResponse);
}

export async function handleResolveBlocker(req: Request, deps?: ResolveBlockerRouteDeps): Promise<Response> {
  const requireAdminIdentity = deps?.requireAdminIdentity ?? realRequireAdminIdentity;
  const admin = await requireAdminIdentity();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, status: "bad_request" });
  }
  const { wizardSessionId, driveFileId, code, action } = body;
  if (
    typeof wizardSessionId !== "string" ||
    wizardSessionId.length === 0 ||
    typeof driveFileId !== "string" ||
    driveFileId.length === 0 ||
    typeof code !== "string" ||
    code.length === 0 ||
    (action !== "unarchive" && action !== "rebuild")
  ) {
    return NextResponse.json({ ok: false, status: "bad_request" });
  }
  if (action === "unarchive" && code !== SHOW_ARCHIVED_IMMUTABLE) {
    return NextResponse.json({ ok: false, status: "wrong_action" });
  }
  if (action === "rebuild" && !REBUILDABLE_CODES.has(code)) {
    return NextResponse.json({ ok: false, status: "wrong_action" });
  }

  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    // ── PRE-LOCK PHASE (spec §3.2: "Drive-fetch + prepareOnboardingFiles … pre-lock,
    // side-effect-free"). For rebuild ONLY: an advisory session read + the slow Drive
    // fetch + parse happen with NO advisory lock held (mirrors rescanWizardSheet.ts's
    // pre-lock Drive read — NEVER hold pg_advisory_xact_lock + an open txn across a
    // multi-second network round-trip). The authoritative session/authz re-checks run
    // again UNDER the lock below. Unarchive has no Drive step → skips this phase.
    let prepared: Awaited<ReturnType<typeof defaultPrepareOnboardingFiles>>[number] | undefined;
    let preFolderId: string | undefined;
    if (action === "rebuild") {
      const pre = await sql.begin(async (t) => {
        const rows = (await t.unsafe(
          `select pending_wizard_session_id, pending_folder_id from public.app_settings where id = 'default'`,
        )) as Array<{ pending_wizard_session_id: string | null; pending_folder_id: string | null }>;
        const sid = rows[0]?.pending_wizard_session_id ?? null;
        if (sid === null) return { early: { ok: false, status: "no_active_session" } as const };
        if (sid !== wizardSessionId) return { early: { ok: false, status: "superseded" } as const };
        // Advisory pre-restage cap read: if already exhausted, escalate WITHOUT the wasted Drive
        // fetch. The AUTHORITATIVE race-safe cap gate still runs under the lock in resolveRebuild.
        const capRows = (await t.unsafe(
          `select attempts from public.onboarding_rebuild_attempts where wizard_session_id = $1::uuid and drive_file_id = $2`,
          [wizardSessionId, driveFileId],
        )) as Array<{ attempts: number }>;
        if ((capRows[0]?.attempts ?? 0) >= 1) return { early: { ok: false, status: "escalated", code } as const };
        return { folderId: rows[0]?.pending_folder_id ?? null };
      });
      if ("early" in pre) return NextResponse.json(pre.early);
      preFolderId = pre.folderId ?? undefined;
      if (!preFolderId) return NextResponse.json({ ok: false, status: "no_active_session" });
      // Drive fetch + parse — NO lock held (side-effect-free reads). Fail-closed on a
      // Drive error, and enforce the folder-scope guard (a sheet moved out of the pending
      // folder → not this session's gear), mirroring finalize inline (`finalize/route.ts:800`).
      let metadata;
      try {
        metadata = await fetchDriveFileMetadata(driveFileId);
      } catch {
        return NextResponse.json({ ok: false, status: "needs_attention", code: "DRIVE_FETCH_FAILED" });
      }
      if (!metadata.parents.includes(preFolderId)) {
        return NextResponse.json({ ok: false, status: "needs_attention", code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" });
      }
      const preparedFiles = await (deps?.prepareOnboardingFiles ?? defaultPrepareOnboardingFiles)(preFolderId, {
        listFolder: async () => [metadata],
      });
      prepared = preparedFiles[0];
    }

    // ── LOCKED PHASE — authoritative session re-check (FOR UPDATE) + show lookup + the
    // single per-show advisory lock + the mutation. `prepared` (rebuild) was computed
    // pre-lock above and is passed in; the core is called lock-free under THIS lock.
    return await sql.begin(async (rawTx) => {
      const sessRows = (await rawTx.unsafe(
        `select pending_wizard_session_id from public.app_settings where id = 'default' for update`,
      )) as Array<{ pending_wizard_session_id: string | null }>;
      if (sessRows[0] === undefined || sessRows[0].pending_wizard_session_id === null) {
        return NextResponse.json({ ok: false, status: "no_active_session" });
      }
      if (sessRows[0].pending_wizard_session_id !== wizardSessionId) {
        return NextResponse.json({ ok: false, status: "superseded" });
      }
      const showRows = (await rawTx.unsafe(`select id from public.shows where drive_file_id = $1`, [
        driveFileId,
      ])) as Array<{ id: string }>;
      if (showRows.length === 0) {
        return NextResponse.json({ ok: false, status: "not_found" });
      }
      await rawTx.unsafe(`select pg_advisory_xact_lock(hashtext('show:' || $1))`, [driveFileId]);
      if (action === "unarchive") {
        return await resolveUnarchive(rawTx, { wizardSessionId, driveFileId, showId: showRows[0]!.id, admin });
      }
      return await resolveRebuild(rawTx, {
        wizardSessionId,
        driveFileId,
        code,
        admin,
        prepared,
        pendingFolderId: preFolderId!,
        deps,
      });
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Live route entrypoint (Codex plan-R1 F2 — deferred from Task 6, landed here in Task 7):
// `action: "unarchive"` is real; `action: "rebuild"` is still the Task 6 SAFE
// non-throwing `not_currently_blocked` placeholder until Task 8, so this export can
// never 500 on either action.
export const POST = (req: Request): Promise<Response> => handleResolveBlocker(req);

// Referenced only to keep the Task 8 import surface stable across this commit — not
// called yet (resolveRebuild's placeholder body never reaches them). Prevents an
// unused-import lint pass from being the thing that forces a diff in Task 8.
void applyRescanDecisionUnderLock;
void parseShadowPayloadForApply;
void defaultScanOnboardingPreparedFiles;
