import { NextResponse } from "next/server";

import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { fetchCurrentSheetXlsxBytes } from "@/lib/drive/fetch";
import {
  synthesizeMarkdownFromXlsx,
  type ArchivedPullSheetTab,
} from "@/lib/drive/exportSheetToMarkdown";
import {
  setPublishedPullSheetOverrideRpc as realSetRpc,
  type SetPublishedPullSheetOverrideParams,
} from "@/lib/admin/setPublishedPullSheetOverrideRpc";
import {
  runManualSyncForShow as realRunManualSyncForShow,
  FINALIZE_OWNED_SHOW,
} from "@/lib/sync/runManualSyncForShow";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/show/pull-sheet-override — accept or revoke an archived-tab pull-sheet
 * override on a PUBLISHED show (spec 2026-07-23; invariants 2/3/5/9/10). Distinct from the
 * onboarding route: no wizard session, scan-at-click fingerprint (no reviewed-fingerprint CAS),
 * structural jsonb CAS, and a chained manual sync so the gear lands promptly.
 *
 *  - The RPC (`set_published_pull_sheet_override`) is the SOLE `show:` advisory-lock holder;
 *    this JS route never locks (invariant 2).
 *  - Actor email from `requireAdminIdentity()` only (canonical) — RPC actor + audit actor
 *    (invariant 3).
 *  - Audit fires AFTER RPC commit, BEFORE the chained sync (invariant 10): a failing sync can
 *    never suppress the SET/CLEARED record. Audit-sink failure never changes the response.
 *  - Every non-200 path is a discriminable typed status; no raw code/status token reaches copy
 *    (invariant 5 is enforced client-side; the wire status is a machine token).
 */
// not-subject-to-meta: auth-helper registry scope (tests/auth/_metaInfraContract.test.ts:69-78)
// does not cover API routes; this route's typed-result tests assert every §3.4 row (precedent:
// app/api/admin/onboarding/pull-sheet-override/route.ts carries no registry row either).
const ROUTE_SOURCE = "api.admin.show.pull-sheet-override";

export type PublishedPullSheetOverrideRouteDeps = {
  detectArchivedTabs?: (driveFileId: string) => Promise<ArchivedPullSheetTab[]>;
  setRpc?: typeof realSetRpc;
  runManualSyncForShow?: typeof realRunManualSyncForShow;
  requireAdminIdentity?: typeof requireAdminIdentity;
};

async function defaultDetectArchivedTabs(driveFileId: string): Promise<ArchivedPullSheetTab[]> {
  const bytes = await fetchCurrentSheetXlsxBytes(driveFileId);
  return synthesizeMarkdownFromXlsx(bytes).archivedPullSheetTabs;
}

type Wire = { tabName: string | null; fingerprint: string | null } | null;

type ParsedBody =
  | { kind: "accept"; driveFileId: string; tabName: string; expectedOverrideSnapshot: Wire }
  | { kind: "revoke"; driveFileId: string; expectedOverrideSnapshot: Wire };

/** A non-empty, non-whitespace string. */
function isNonBlank(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

/** Wire snapshot: null, or exactly { tabName: string|null, fingerprint: string|null }. */
function coerceWire(raw: unknown): { ok: true; value: Wire } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const keys = Object.keys(raw as object);
  if (keys.length !== 2 || !keys.includes("tabName") || !keys.includes("fingerprint")) {
    return { ok: false };
  }
  const t = (raw as { tabName: unknown }).tabName;
  const f = (raw as { fingerprint: unknown }).fingerprint;
  const okField = (v: unknown) => v === null || typeof v === "string";
  if (!okField(t) || !okField(f)) return { ok: false };
  return { ok: true, value: { tabName: t as string | null, fingerprint: f as string | null } };
}

function parseBody(raw: unknown): ParsedBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const b = raw as Record<string, unknown>;
  if (!isNonBlank(b.driveFileId)) return null;
  const driveFileId = b.driveFileId;
  const wire = coerceWire(b.expectedOverrideSnapshot);
  if (!wire.ok) return null;
  // tabName key is REQUIRED. null = revoke; a non-blank string = accept; anything else = 400.
  if (!("tabName" in b)) return null;
  if (b.tabName === null) {
    return { kind: "revoke", driveFileId, expectedOverrideSnapshot: wire.value };
  }
  if (!isNonBlank(b.tabName)) return null;
  return { kind: "accept", driveFileId, tabName: b.tabName, expectedOverrideSnapshot: wire.value };
}

function statusBody(status: string, code: number): Response {
  return NextResponse.json({ ok: false, status }, { status: code });
}

function rpcErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null) {
    const c = (error as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return null;
}

type SyncClassification = { ok: boolean; kind: string };

/** TOTAL classifier over runManualSyncForShow's result space (spec §3.4). */
function classifySync(result: unknown): SyncClassification {
  if (typeof result === "object" && result !== null) {
    if ("skipped" in result) return { ok: false, kind: "concurrent_skip" };
    const outcome = (result as { outcome?: unknown }).outcome;
    if (outcome === "applied") return { ok: true, kind: "applied" };
    if (outcome === "blocked") {
      const code = (result as { code?: unknown }).code;
      return { ok: false, kind: code === FINALIZE_OWNED_SHOW ? "finalize_owned" : "archived_immutable" };
    }
    if (typeof outcome === "string") return { ok: false, kind: outcome };
  }
  return { ok: false, kind: "unknown" };
}

export async function handlePublishedPullSheetOverride(
  rawBody: unknown,
  deps: PublishedPullSheetOverrideRouteDeps = {},
): Promise<Response> {
  const identify = deps.requireAdminIdentity ?? requireAdminIdentity;
  const detect = deps.detectArchivedTabs ?? defaultDetectArchivedTabs;
  const setRpc = deps.setRpc ?? realSetRpc;
  const runSync = deps.runManualSyncForShow ?? realRunManualSyncForShow;

  const identity = await identify(); // throws → framework 401/403; not our concern here
  const actorEmail = identity.email;

  const body = parseBody(rawBody);
  if (!body) return statusBody("bad_request", 400);

  // Accept: scan the sheet for the tab's current fingerprint (scan-at-click).
  let params: SetPublishedPullSheetOverrideParams;
  let code: string;
  if (body.kind === "accept") {
    let tabs: ArchivedPullSheetTab[];
    try {
      tabs = await detect(body.driveFileId);
    } catch (err) {
      log.warn("published pull-sheet override: scan failed", {
        code: "PULL_SHEET_OVERRIDE_SCAN_FAILED",
        source: ROUTE_SOURCE,
        detail: err instanceof Error ? err.message : "scan error",
      });
      return statusBody("sync_infra", 502);
    }
    const tab = tabs.find((t) => t.tabName === body.tabName); // EXACT identity, no trim
    if (!tab) return statusBody("no_pull_sheet_region", 422);
    params = {
      p_drive_file_id: body.driveFileId,
      p_tab_name: tab.tabName,
      p_fingerprint: tab.fingerprint,
      p_accepted_by: actorEmail,
      p_expected_override_snapshot: body.expectedOverrideSnapshot,
    };
    code = "PULL_SHEET_OVERRIDE_SET";
  } else {
    params = {
      p_drive_file_id: body.driveFileId,
      p_tab_name: null,
      p_fingerprint: null,
      p_accepted_by: actorEmail,
      p_expected_override_snapshot: body.expectedOverrideSnapshot,
    };
    code = "PULL_SHEET_OVERRIDE_CLEARED";
  }

  // The RPC is the sole advisory-lock holder; this route never locks (invariant 2).
  let rpcResult: { data: unknown; error: unknown };
  try {
    rpcResult = await setRpc(params);
  } catch {
    return statusBody("sync_infra", 502); // transport/thrown
  }
  if (rpcResult.error) {
    const c = rpcErrorCode(rpcResult.error);
    if (c === "40001") return statusBody("stale_review", 409);
    if (c === "55000" || c === "P0002") return statusBody("lifecycle_conflict", 409);
    return statusBody("sync_infra", 502);
  }
  if (rpcResult.data === null || rpcResult.data === undefined) {
    return statusBody("sync_infra", 502); // unexpected null payload
  }

  // Audit AFTER commit, BEFORE the chained sync (invariant 10). Sink failure is swallowed by
  // logAdminOutcome and never affects the response.
  await logAdminOutcome({
    code,
    source: ROUTE_SOURCE,
    actorEmail,
    driveFileId: body.driveFileId,
    extra: {
      // fingerprint PREFIX only — never sheet contents, never the full fingerprint.
      ...(body.kind === "accept" ? { fingerprintPrefix: params.p_fingerprint?.slice(0, 12) } : {}),
    },
  });

  // Chain the sync so the gear lands (or leaves) promptly. Sequential — never nested in the RPC
  // tx; the sync path takes its own lock.
  let sync: SyncClassification;
  try {
    sync = classifySync(await runSync(body.driveFileId, "manual"));
  } catch {
    sync = { ok: false, kind: "threw" };
  }

  const status = body.kind === "accept" ? "override_set" : "override_cleared";
  return NextResponse.json({ ok: true, status, sync }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return statusBody("bad_request", 400);
  }
  return handlePublishedPullSheetOverride(raw);
}
