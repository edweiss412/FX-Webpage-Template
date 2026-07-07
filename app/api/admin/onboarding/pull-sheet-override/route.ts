import { NextResponse } from "next/server";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { fetchCurrentSheetXlsxBytes } from "@/lib/drive/fetch";
import {
  synthesizeMarkdownFromXlsx,
  type ArchivedPullSheetTab,
} from "@/lib/drive/exportSheetToMarkdown";
import { rescanWizardSheet as realRescanWizardSheet } from "@/lib/onboarding/rescanWizardSheet";
import {
  setPullSheetOverrideRpc as realSetPullSheetOverrideRpc,
  type SetPullSheetOverrideParams,
} from "@/lib/onboarding/setPullSheetOverrideRpc";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";

/**
 * POST /api/admin/onboarding/pull-sheet-override — accept or revoke an archived
 * ("OLD …") tab pull-sheet override (spec §5.4, invariants 2/9/10).
 *
 * Body:
 *   accept: { driveFileId, wizardSessionId, tabName, expectedFingerprint, expectedOverrideSnapshot }
 *   revoke: { driveFileId, wizardSessionId, tabName: null, expectedOverrideSnapshot }
 *
 * Correctness contract (each point closed an adversarial-review finding):
 *  - Fresh SERVER-side detect of the tab's current fingerprint (re-fetch bytes +
 *    synthesizeMarkdownFromXlsx). Accept is compare-and-set on that: when the
 *    server fingerprint differs from the reviewed `expectedFingerprint`, we FIRST
 *    trigger the standard re-scan (so the refreshed archivedPullSheetTabs with the
 *    NEW fingerprint is re-persisted — no stale-preview dead-loop, plan-R5-1), THEN
 *    return `409 { status: "stale_review" }` (code-less: an uncataloged lookup key
 *    throws, plan-R1-3). The RPC is NOT called.
 *  - The RPC (`set_pull_sheet_override`) is the SOLE `show:` advisory-lock holder —
 *    this JS route never takes the lock (invariant 2). A `40001` from the RPC (row-
 *    state CAS mismatch) funnels to the SAME 409 refresh path.
 *  - Audit BEFORE re-scan (plan-R8-1): on RPC commit, post-commit + outside any lock
 *    tx, `logAdminOutcome` fires the SET/CLEARED code immediately. The subsequent
 *    re-scan is wrapped so its failure is logged separately but never throws past the
 *    already-emitted success audit (a committed mutation is never dark — invariant 10).
 */
const ROUTE_SOURCE = "api.admin.onboarding.pull-sheet-override";

// Permissive UUID shape (matches rescan-sheet/route.ts). A non-empty but malformed
// wizardSessionId must 400 here, not infra-500 at the RPC's `::uuid` cast.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PullSheetOverrideRouteDeps = {
  /** Fresh server-side archived-tab detect (default: real Drive fetch + synthesize). */
  detectArchivedTabs?: (driveFileId: string) => Promise<ArchivedPullSheetTab[]>;
  /** The RPC caller seam (default: real service-role `set_pull_sheet_override`). */
  setPullSheetOverrideRpc?: typeof realSetPullSheetOverrideRpc;
  /** The re-scan trigger (default: real orchestration core). */
  rescanWizardSheet?: typeof realRescanWizardSheet;
};

/** Default fresh detect: re-fetch the CURRENT xlsx bytes and re-synthesize (no include). */
async function defaultDetectArchivedTabs(driveFileId: string): Promise<ArchivedPullSheetTab[]> {
  const bytes = await fetchCurrentSheetXlsxBytes(driveFileId);
  return synthesizeMarkdownFromXlsx(bytes).archivedPullSheetTabs;
}

/** A serialization_failure (40001) raised/returned by the RPC → row-state CAS mismatch. */
function isSerializationFailure(x: unknown): boolean {
  return typeof x === "object" && x !== null && (x as { code?: unknown }).code === "40001";
}

function staleReview(): Response {
  // Structured, code-less status body (NO `code` property — an uncataloged lookup
  // key resolves to null/throws, plan-R1-3). The client re-fetches the Step-3 preview.
  return NextResponse.json({ status: "stale_review" }, { status: 409 });
}

function staleReviewRefreshFailed(): Response {
  // Accept-mismatch path only: the re-persist re-scan FAILED, so the stale preview was NOT
  // refreshed. A plain 409 stale_review tells the client "refreshed, retry" and it would
  // dead-loop on the same stale fingerprint (whole-diff review R1). A distinct non-409 status
  // routes the client to its error branch instead of the auto-refresh path. Code-less body.
  return NextResponse.json({ status: "stale_review_refresh_failed" }, { status: 503 });
}

type ParsedBody =
  | {
      kind: "accept";
      driveFileId: string;
      wizardSessionId: string;
      tabName: string;
      expectedFingerprint: string;
      expectedOverrideSnapshot: OverrideSnapshot;
    }
  | {
      kind: "revoke";
      driveFileId: string;
      wizardSessionId: string;
      expectedOverrideSnapshot: OverrideSnapshot;
    };

function badRequest(): Response {
  return NextResponse.json(
    {
      ok: false,
      error: "Request must include driveFileId, wizardSessionId, and tabName (or tabName: null).",
    },
    { status: 400 },
  );
}

function coerceSnapshot(raw: unknown): OverrideSnapshot {
  if (raw === null || raw === undefined) return null;
  if (
    typeof raw === "object" &&
    typeof (raw as { tabName?: unknown }).tabName === "string" &&
    typeof (raw as { fingerprint?: unknown }).fingerprint === "string"
  ) {
    const r = raw as { tabName: string; fingerprint: string };
    return { tabName: r.tabName, fingerprint: r.fingerprint };
  }
  return null;
}

function parseBody(body: unknown): ParsedBody | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const driveFileId = b.driveFileId;
  const wizardSessionId = b.wizardSessionId;
  if (
    typeof driveFileId !== "string" ||
    driveFileId.length === 0 ||
    typeof wizardSessionId !== "string" ||
    !UUID_RE.test(wizardSessionId)
  ) {
    return null;
  }
  const expectedOverrideSnapshot = coerceSnapshot(b.expectedOverrideSnapshot);
  // Revoke: tabName is explicitly null.
  if (b.tabName === null) {
    return { kind: "revoke", driveFileId, wizardSessionId, expectedOverrideSnapshot };
  }
  // Accept: tabName + expectedFingerprint are non-empty strings.
  if (
    typeof b.tabName === "string" &&
    b.tabName.length > 0 &&
    typeof b.expectedFingerprint === "string" &&
    b.expectedFingerprint.length > 0
  ) {
    return {
      kind: "accept",
      driveFileId,
      wizardSessionId,
      tabName: b.tabName,
      expectedFingerprint: b.expectedFingerprint,
      expectedOverrideSnapshot,
    };
  }
  return null;
}

export async function handlePullSheetOverride(
  req: Request,
  deps?: PullSheetOverrideRouteDeps,
): Promise<Response> {
  // 1. Admin gate FIRST — resolves the actor email required by logAdminOutcome.
  const { email } = await requireAdminIdentity();

  // 2. Parse + validate body (plain 400, NOT a §12.4 code — invariant 5).
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = parseBody(raw);
  if (!parsed) return badRequest();

  const detect = deps?.detectArchivedTabs ?? defaultDetectArchivedTabs;
  const setRpc = deps?.setPullSheetOverrideRpc ?? realSetPullSheetOverrideRpc;
  const rescan = deps?.rescanWizardSheet ?? realRescanWizardSheet;

  const { driveFileId, wizardSessionId, expectedOverrideSnapshot } = parsed;

  let params: SetPullSheetOverrideParams;

  if (parsed.kind === "accept") {
    // 3. Fresh server-side detect — the fingerprint written is the server-computed one.
    const tabs = await detect(driveFileId);
    const tab = tabs.find((t) => t.tabName === parsed.tabName);
    if (!tab) {
      // No pull-sheet region server-side for the named tab (renamed/deleted/emptied).
      // Typed, code-less guard; the RPC is NOT called (no override written).
      return NextResponse.json({ status: "no_pull_sheet_region" }, { status: 422 });
    }
    const serverFingerprint = tab.fingerprint;
    if (serverFingerprint !== parsed.expectedFingerprint) {
      // CAS mismatch on reviewed content. REFRESH the persisted preview FIRST (re-scan
      // re-detects + re-persists the NEW fingerprint — the RPC is untouched), THEN 409.
      // Without the refresh the client re-fetches the SAME stale envelope and dead-loops,
      // so if the re-scan FAILED, surface a distinct error instead of the retry-implying 409.
      const refreshed = await triggerRescan(rescan, driveFileId, wizardSessionId);
      return refreshed ? staleReview() : staleReviewRefreshFailed();
    }
    params = {
      p_drive_file_id: driveFileId,
      p_wizard_session_id: wizardSessionId,
      p_tab_name: parsed.tabName,
      p_fingerprint: serverFingerprint,
      p_accepted_by: email,
      p_expected_override_snapshot: expectedOverrideSnapshot,
    };
  } else {
    params = {
      p_drive_file_id: driveFileId,
      p_wizard_session_id: wizardSessionId,
      p_tab_name: null,
      p_fingerprint: null,
      p_accepted_by: email,
      p_expected_override_snapshot: expectedOverrideSnapshot,
    };
  }

  // 4. Call the RPC (service-role client; RPC is the sole show: lock holder).
  let rpcResult: { data: unknown; error: unknown };
  try {
    rpcResult = await setRpc(params);
  } catch (err) {
    if (isSerializationFailure(err)) return staleReview();
    await safeLog("set_pull_sheet_override rpc threw", driveFileId, wizardSessionId, err);
    throw err;
  }
  const { error } = rpcResult;
  if (error) {
    if (isSerializationFailure(error)) return staleReview();
    await safeLog("set_pull_sheet_override rpc failed", driveFileId, wizardSessionId, error);
    throw new Error("set_pull_sheet_override RPC returned an error");
  }

  const isAccept = parsed.kind === "accept";

  // 5. Audit BEFORE re-scan (plan-R8-1): the RPC has committed; the mutation is durable.
  // If the audit were gated on the re-scan, a re-scan failure would leave a committed
  // override mutation unaudited (a dark admin surface — invariant 10). Post-commit,
  // outside any lock tx. No secret logged (the tab name is not a secret).
  await logAdminOutcome({
    code: isAccept ? "PULL_SHEET_OVERRIDE_SET" : "PULL_SHEET_OVERRIDE_CLEARED",
    source: ROUTE_SOURCE,
    actorEmail: email,
    driveFileId,
    wizardSessionId,
    result: isAccept ? "accepted" : "revoked",
  });

  // 6. ONLY AFTER the audit: trigger the re-scan so 5.3 re-runs with the new override.
  // Wrapped so a re-scan failure is logged separately but does NOT throw past the
  // already-emitted success audit — the response still reports success (the override
  // IS set; the preview refreshes on the next scan/reload).
  await triggerRescan(rescan, driveFileId, wizardSessionId);

  return NextResponse.json({
    ok: true,
    status: isAccept ? "override_set" : "override_cleared",
  });
}

/**
 * Re-run the wizard re-scan so the persisted archivedPullSheetTabs preview refreshes.
 * Returns `true` on success, `false` if the re-scan threw (logged forensically). Callers
 * that rely on the refresh having HAPPENED (the accept-mismatch path, which must re-persist
 * the NEW fingerprint before telling the client to retry) MUST branch on the return; the
 * post-commit success path ignores it (the override is already durable — the preview
 * refreshes on the next scan/reload regardless).
 */
async function triggerRescan(
  rescan: typeof realRescanWizardSheet,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    await rescan(driveFileId, wizardSessionId);
    return true;
  } catch (err) {
    try {
      await log.error("pull-sheet override re-scan failed", {
        source: ROUTE_SOURCE,
        code: "PULL_SHEET_OVERRIDE_RESCAN_FAILED",
        driveFileId,
        wizardSessionId,
        error: err,
      });
    } catch {
      /* best-effort forensic */
    }
    return false;
  }
}

async function safeLog(
  message: string,
  driveFileId: string,
  wizardSessionId: string,
  error: unknown,
): Promise<void> {
  try {
    await log.error(message, {
      source: ROUTE_SOURCE,
      code: "PULL_SHEET_OVERRIDE_RPC_FAILED",
      driveFileId,
      wizardSessionId,
      error,
    });
  } catch {
    /* best-effort forensic */
  }
}

export function POST(req: Request): Promise<Response> {
  return handlePullSheetOverride(req);
}
