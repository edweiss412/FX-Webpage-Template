import { NextResponse } from "next/server";
import { defaultReadDriveFileIdForStagedId, type LiveStagedRouteDeps } from "../apply/route";
import {
  discardStaged as defaultDiscardStaged,
  type DiscardVariant,
} from "@/lib/sync/discardStaged";
import { canonicalize } from "@/lib/email/canonicalize";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

type RouteContext = {
  params: Promise<{ stagedId: string }>;
};

type DiscardBody = {
  kind?: unknown;
};

export type LiveStagedDiscardRouteDeps = LiveStagedRouteDeps & {
  discardStaged?: typeof defaultDiscardStaged;
};

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

async function readBody(request: Request): Promise<DiscardBody> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as DiscardBody) : {};
  } catch {
    return {};
  }
}

function variantFrom(kind: unknown): DiscardVariant | null {
  if (kind === "try_again_next_sync") return "try_again";
  if (kind === "defer_until_modified" || kind === "permanent_ignore") return kind;
  return null;
}

export async function handleLiveStagedDiscard(
  request: Request,
  context: RouteContext,
  routeDeps: LiveStagedDiscardRouteDeps = {},
): Promise<Response> {
  const requireAdminIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  let admin: { email: string };
  try {
    admin = await requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { stagedId } = await context.params;
  const readDriveFileId = routeDeps.readDriveFileIdForStagedId ?? defaultReadDriveFileIdForStagedId;
  const driveFileId = await readDriveFileId(stagedId);
  if (!driveFileId) return errorResponse(404, "STALE_DISCARD_REJECTED");

  const body = await readBody(request);
  const variant = variantFrom(body.kind);
  if (!variant) return errorResponse(400, "INVALID_REVIEWER_ACTION");

  let result: Awaited<ReturnType<typeof defaultDiscardStaged>>;
  try {
    result = await (routeDeps.discardStaged ?? defaultDiscardStaged)(
      {
        sourceScope: "live",
        driveFileId,
        stagedId,
        discardedByEmail: admin.email,
        variant,
      },
      {},
    );
  } catch (error) {
    // Fail-open (explicit callsite wrap): log the infra fault, then rethrow so the route's
    // existing throw→500 behavior is byte-preserved. Forensic-only (inside a log span).
    try {
      await log.error("live staged discard threw", {
        source: "api.admin.show.staged.discard",
        code: "STAGE_DISCARD_FAILED",
        driveFileId,
        error,
      });
    } catch {
      /* best-effort */
    }
    throw error;
  }
  if ("skipped" in result) return errorResponse(409, "CONCURRENT_SYNC_SKIPPED");
  if (result.outcome === "discarded") {
    // POST-COMMIT durable outcome (#218): discardStaged owns its per-show lock/tx and has committed
    // when it resolves. REUSED code (STAGE_DISCARDED, already SANCTIONED). Fail-open at the callsite.
    const actorEmail = canonicalize(admin.email);
    try {
      await logAdminOutcome({
        code: "STAGE_DISCARDED",
        source: "api.admin.show.staged.discard",
        ...(actorEmail ? { actorEmail } : {}),
        driveFileId,
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ status: "discarded", variant });
  }
  return errorResponse(result.outcome === "not_found" ? 404 : 409, "STALE_DISCARD_REJECTED");
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleLiveStagedDiscard(request, context);
}
