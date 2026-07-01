import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import type { ConcurrentSyncSkipped } from "@/lib/sync/lockedShowTx";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock, type SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

// Task C2 (spec §6.2): un-ignore deletes the LIVE permanent_ignore deferral for a
// drive file so it re-surfaces on the next scan. Admin-gated; runs under the
// per-show advisory lock as a SINGLE JS-side holder (withPostgresSyncPipelineLock,
// mirroring the live discard route — no nested holder, invariant 2). Idempotent:
// deleting an absent row is a no-op success. Server route only — never a client
// `.from('deferred_ingestions').delete()` (PostgREST DML lockdown, the table is
// registered in tests/db/postgrest-dml-lockdown.test.ts).

type UnignoreRouteTx = LockedShowTx<SyncPipelineTx>;

export type UnignoreRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withRowTx?: <R>(driveFileId: string, fn: (tx: UnignoreRouteTx) => Promise<R> | R) => Promise<R>;
};

type RouteContext = {
  params: Promise<{ driveFileId: string }>;
};

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: UnignoreRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock<R>(driveFileId, (tx) => fn(tx), {
    tryOnly: false,
  });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking un-ignore route returned skipped lock");
  }
  return result as R;
}

function depsWithDefaults(deps: UnignoreRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function handleUnignore(
  _request: Request,
  context: RouteContext,
  routeDeps: UnignoreRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code as string);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  // Wrap the locked mutation so no infra fault leaks a body-less 500 (call-boundary
  // discipline, invariant 9). The deleteLiveDeferral primitive is idempotent.
  try {
    const { driveFileId } = await context.params;
    await deps.withRowTx(driveFileId, async (tx) => {
      // deleteLiveDeferral is Partial on SyncPipelineTx but always present on the
      // concrete PostgresPipelineTx (runScheduledCronSync.ts) — guard for the type.
      if (!tx.deleteLiveDeferral) {
        throw new Error("un-ignore: locked tx is missing deleteLiveDeferral");
      }
      await tx.deleteLiveDeferral(driveFileId);
    });
    return NextResponse.json({ status: "unignored" });
  } catch (error) {
    log.error("un-ignore: unexpected failure", {
      source: "api.admin.ignoredSheets.unignore",
      error,
    });
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleUnignore(request, context);
}
