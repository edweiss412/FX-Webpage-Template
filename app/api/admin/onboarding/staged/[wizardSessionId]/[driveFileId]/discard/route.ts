import { NextResponse } from "next/server";
import {
  discardStaged_unlocked as defaultDiscardStagedUnlocked,
  type DiscardStagedDeps,
  type DiscardStagedResult,
  type DiscardVariant,
} from "@/lib/sync/discardStaged";
import {
  type WizardStagedRouteDeps,
  type WizardStagedRouteTx,
} from "../apply/route";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

export type WizardDiscardRouteDeps = Omit<WizardStagedRouteDeps, "applyStagedUnlocked"> & {
  discardStagedUnlocked?: (
    tx: WizardStagedRouteTx,
    args: Parameters<typeof defaultDiscardStagedUnlocked>[1],
    deps?: DiscardStagedDeps,
  ) => Promise<DiscardStagedResult>;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type DiscardBody = {
  stagedId?: unknown;
  kind?: unknown;
};

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: WizardStagedRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking wizard staged route returned skipped lock");
  }
  return result;
}

function depsWithDefaults(deps: WizardDiscardRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    discardStagedUnlocked:
      deps.discardStagedUnlocked ??
      (defaultDiscardStagedUnlocked as unknown as NonNullable<
        WizardDiscardRouteDeps["discardStagedUnlocked"]
      >),
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

async function readBody(request: Request): Promise<DiscardBody> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as DiscardBody) : {};
  } catch {
    return {};
  }
}

function variantForKind(kind: unknown): DiscardVariant | null {
  if (kind === "try_again_next_sync") return "try_again";
  if (kind === "defer_until_modified" || kind === "permanent_ignore") return kind;
  return null;
}

function statusForDiscardResult(result: DiscardStagedResult): { status: number; code: string } {
  if (result.outcome === "not_found" || result.outcome === "stale") {
    return { status: 409, code: "STALE_DISCARD_REJECTED" };
  }
  if ("code" in result) return { status: 409, code: result.code };
  return { status: 409, code: "STALE_DISCARD_REJECTED" };
}

export async function handleWizardStagedDiscard(
  request: Request,
  context: RouteContext,
  routeDeps: WizardDiscardRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { wizardSessionId, driveFileId } = await context.params;
  const body = await readBody(request);
  if (typeof body.stagedId !== "string") return errorResponse(400, "INVALID_REVIEWER_ACTION");
  const variant = variantForKind(body.kind);
  if (!variant) return errorResponse(400, "INVALID_REVIEWER_ACTION");

  const result = await deps.withRowTx(driveFileId, (tx) =>
    deps.discardStagedUnlocked(
      tx,
      {
        sourceScope: "wizard",
        wizardSessionId,
        driveFileId,
        stagedId: body.stagedId as string,
        variant,
      },
      {},
    ),
  );
  if (result.outcome === "discarded") {
    return NextResponse.json({
      status: "discarded",
      wizard_session_id: wizardSessionId,
      drive_file_id: driveFileId,
      variant,
    });
  }
  const mapped = statusForDiscardResult(result);
  return errorResponse(mapped.status, mapped.code);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardStagedDiscard(request, context);
}
