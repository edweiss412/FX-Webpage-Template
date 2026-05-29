import { NextResponse } from "next/server";
import postgres from "postgres";
import {
  applyStaged as defaultApplyStaged,
  type ApplyStagedDeps,
  type ApplyStagedResult,
  type ReviewerChoice,
} from "@/lib/sync/applyStaged";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";

export type LiveStagedRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type LiveStagedRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  readDriveFileIdForStagedId?: (stagedId: string) => Promise<string | null>;
  readShowSlug?: (showId: string) => Promise<string | null>;
  applyStaged?: (
    args: Parameters<typeof defaultApplyStaged>[0],
    deps?: ApplyStagedDeps,
  ) => Promise<ApplyStagedResult | { skipped: "CONCURRENT_SYNC_SKIPPED" }>;
  withRowTx?: <R>(driveFileId: string, fn: (tx: LiveStagedRouteTx) => Promise<R> | R) => Promise<R>;
};

type RouteContext = {
  params: Promise<{ stagedId: string }>;
};

type ApplyBody = {
  reviewerChoices?: unknown;
  reviewer_choices?: unknown;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("live staged apply route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

export async function defaultReadDriveFileIdForStagedId(stagedId: string): Promise<string | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      `
        select drive_file_id
          from public.pending_syncs
         where staged_id = $1::uuid
           and wizard_session_id is null
         limit 1
      `,
      [stagedId],
    )) as Array<{ drive_file_id: string }>;
    return rows[0]?.drive_file_id ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultReadShowSlug(showId: string): Promise<string | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(`select slug from public.shows where id = $1::uuid limit 1`, [
      showId,
    ])) as Array<{ slug: string }>;
    return rows[0]?.slug ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: LiveStagedRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    readDriveFileIdForStagedId: deps.readDriveFileIdForStagedId ?? defaultReadDriveFileIdForStagedId,
    readShowSlug: deps.readShowSlug ?? defaultReadShowSlug,
    applyStaged: deps.applyStaged ?? defaultApplyStaged,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

async function readBody(request: Request): Promise<ApplyBody> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as ApplyBody) : {};
  } catch {
    return {};
  }
}

function isReviewerChoice(value: unknown): value is ReviewerChoice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { item_id?: unknown; action?: unknown; rename_value?: unknown };
  return (
    typeof candidate.item_id === "string" &&
    (candidate.action === "apply" ||
      candidate.action === "reject" ||
      candidate.action === "rename" ||
      candidate.action === "independent") &&
    (candidate.rename_value === undefined || typeof candidate.rename_value === "string")
  );
}

function statusFor(result: ApplyStagedResult | { skipped: "CONCURRENT_SYNC_SKIPPED" }) {
  if ("skipped" in result) return { status: 409, code: "CONCURRENT_SYNC_SKIPPED" };
  if (result.outcome === "superseded") {
    return { status: 409, code: result.code };
  }
  if (result.outcome === "not_found") {
    return { status: 404, code: "STALE_DISCARD_REJECTED" };
  }
  if (result.outcome === "invalid_request") {
    return { status: 400, code: result.code };
  }
  if ("code" in result) return { status: 409, code: result.code };
  return { status: 409, code: "STALE_DISCARD_REJECTED" };
}

export async function handleLiveStagedApply(
  request: Request,
  context: RouteContext,
  routeDeps: LiveStagedRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let admin: { email: string };
  try {
    admin = await deps.requireAdminIdentity();
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { stagedId } = await context.params;
  const driveFileId = await deps.readDriveFileIdForStagedId(stagedId);
  if (!driveFileId) return errorResponse(404, "STALE_DISCARD_REJECTED");

  const body = await readBody(request);
  const candidateChoices = body.reviewer_choices ?? body.reviewerChoices;
  const reviewerChoices = Array.isArray(candidateChoices) ? candidateChoices : [];
  if (!reviewerChoices.every(isReviewerChoice)) return errorResponse(400, "INVALID_REVIEWER_ACTION");

  try {
    const result = await deps.applyStaged(
      {
        sourceScope: "live",
        driveFileId,
        stagedId,
        reviewerChoices,
        appliedByEmail: admin.email,
      },
      {},
    );
    if (!("skipped" in result) && result.outcome === "applied") {
      const slug = await deps.readShowSlug(result.showId);
      return NextResponse.json({ slug });
    }
    const mapped = statusFor(result);
    return errorResponse(mapped.status, mapped.code);
  } catch (error) {
    // Never leak an empty 500: the Apply read mapper flags a corrupt parse_result
    // (→ STAGED_PARSE_RESULT_CORRUPT) for the common case, but ANY other unexpected
    // throw inside applyStaged (a deref of a corrupt-but-object field the coercer's
    // shape gate doesn't cover, or a DB fault) must still return a typed JSON body,
    // not a body-less 500 (Codex R5 structural backstop).
    console.error(
      `live staged apply: unexpected failure: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleLiveStagedApply(request, context);
}
