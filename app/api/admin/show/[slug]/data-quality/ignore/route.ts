import { NextResponse } from "next/server";
import postgres from "postgres";
import { canonicalize } from "@/lib/email/canonicalize";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

export type IgnoreTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T | null>;
  run(sql: string, params: unknown[]): Promise<void>;
};
export type IgnoreRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: IgnoreTx) => Promise<R>) => Promise<R>;
};
type RouteContext = { params: Promise<{ slug: string }> };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("data-quality ignore route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}
function txAdapter(rawTx: {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
}): IgnoreTx {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      return ((await rawTx.unsafe(sql, params)) as T[])[0] ?? null;
    },
    async run(sql: string, params: unknown[]) {
      await rawTx.unsafe(sql, params);
    },
  };
}
async function defaultWithTx<R>(fn: (tx: IgnoreTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(txAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}
function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function handleIgnore(
  request: Request,
  context: RouteContext,
  routeDeps: IgnoreRouteDeps = {},
): Promise<Response> {
  const requireAdminIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const withTx = routeDeps.withTx ?? defaultWithTx;
  let admin: { email: string };
  try {
    admin = await requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED")
      return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  let body: { code?: unknown; rawSnippet?: unknown };
  try {
    body = (await request.json()) as { code?: unknown; rawSnippet?: unknown };
  } catch {
    return errorResponse(400, "BAD_REQUEST");
  }
  if (
    typeof body?.code !== "string" ||
    body.code.trim().length === 0 ||
    typeof body?.rawSnippet !== "string"
  ) {
    return errorResponse(400, "BAD_REQUEST");
  }
  const fingerprint = warningFingerprint({ code: body.code, rawSnippet: body.rawSnippet });
  if (fingerprint === null) return errorResponse(400, "BAD_REQUEST");
  const { slug } = await context.params;
  const actorEmail = canonicalize(admin.email);
  let showId: string;
  let mutated = false;
  try {
    const result = await withTx(async (tx) => {
      const show = await tx.queryOne<{ id: string }>(
        `select id from public.shows where slug = $1 limit 1`,
        [slug],
      );
      if (!show) return { kind: "not_found" as const };
      // RETURNING distinguishes a real insert from an ON CONFLICT DO NOTHING no-op (e.g. a
      // duplicate ignore of the same fingerprint by another admin): the forensic outcome must
      // reflect an ACTUAL mutation, not a no-op request (whole-diff review P1).
      const inserted = await tx.queryOne<{ fingerprint: string }>(
        `insert into public.ignored_warnings (show_id, fingerprint, code, ignored_by)
         values ($1::uuid, $2, $3, $4)
         on conflict (show_id, fingerprint) do nothing
         returning fingerprint`,
        [show.id, fingerprint, body.code, actorEmail],
      );
      return { kind: "ignored" as const, showId: show.id, mutated: inserted !== null };
    });
    if (result.kind === "not_found") return errorResponse(404, "SHOW_NOT_FOUND");
    showId = result.showId;
    mutated = result.mutated;
  } catch (error) {
    // Forensic-only infra fault (reuses the existing DATA_QUALITY_INFRA_ERROR inside a stripped
    // log span; NOT a new §12.4 code). Fail-open at the callsite: a logger throw must not replace
    // the 500 the caller already gets.
    try {
      await log.error("data-quality ignore threw", {
        source: "api.admin.data-quality.ignore",
        code: "DATA_QUALITY_INFRA_ERROR",
        error,
      });
    } catch {
      /* best-effort */
    }
    return errorResponse(500, "DATA_QUALITY_INFRA_ERROR");
  }
  // DQIGNORE-4 — forensic audit trail (WHO ignored WHICH warning). POST-COMMIT, never inside
  // the tx; logAdminOutcome persists to app_events under a stripped span (forensic, NOT §12.4).
  // log.* never throws over the caller (invariant 9 / lib/log persist+logger guards), so a plain
  // await cannot turn an already-committed ignore into a 500. Logged ONLY on a real mutation —
  // an idempotent no-op still returns 200 to the caller but records no forensic event.
  if (mutated) {
    await logAdminOutcome({
      code: "WARNING_IGNORED",
      source: "api.admin.data-quality.ignore",
      ...(actorEmail ? { actorEmail } : {}),
      showId,
      extra: { warningCode: body.code, fingerprint },
    });
  }
  return NextResponse.json({ status: "ignored" });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleIgnore(request, context);
}
