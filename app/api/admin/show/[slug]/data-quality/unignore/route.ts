import { NextResponse } from "next/server";
import postgres from "postgres";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

export type UnignoreTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T | null>;
  run(sql: string, params: unknown[]): Promise<void>;
};
export type UnignoreRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: UnignoreTx) => Promise<R>) => Promise<R>;
};
type RouteContext = { params: Promise<{ slug: string }> };

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("data-quality unignore route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}
function txAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }): UnignoreTx {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      return ((await rawTx.unsafe(sql, params)) as T[])[0] ?? null;
    },
    async run(sql: string, params: unknown[]) {
      await rawTx.unsafe(sql, params);
    },
  };
}
async function defaultWithTx<R>(fn: (tx: UnignoreTx) => Promise<R>): Promise<R> {
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

export async function handleUnignore(
  request: Request,
  context: RouteContext,
  routeDeps: UnignoreRouteDeps = {},
): Promise<Response> {
  const requireAdminIdentity = routeDeps.requireAdminIdentity ?? defaultRequireAdminIdentity;
  const withTx = routeDeps.withTx ?? defaultWithTx;
  try {
    await requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }
  let body: { code?: unknown; rawSnippet?: unknown };
  try {
    body = (await request.json()) as { code?: unknown; rawSnippet?: unknown };
  } catch {
    return errorResponse(400, "BAD_REQUEST");
  }
  if (typeof body?.code !== "string" || typeof body?.rawSnippet !== "string") {
    return errorResponse(400, "BAD_REQUEST");
  }
  const fingerprint = warningFingerprint({ code: body.code, rawSnippet: body.rawSnippet });
  if (fingerprint === null) return errorResponse(400, "BAD_REQUEST");
  const { slug } = await context.params;
  try {
    return await withTx(async (tx) => {
      const show = await tx.queryOne<{ id: string }>(
        `select id from public.shows where slug = $1 limit 1`,
        [slug],
      );
      if (!show) return errorResponse(404, "SHOW_NOT_FOUND");
      await tx.run(
        `delete from public.ignored_warnings where show_id = $1::uuid and fingerprint = $2`,
        [show.id, fingerprint],
      );
      return NextResponse.json({ status: "unignored" });
    });
  } catch {
    return errorResponse(500, "DATA_QUALITY_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleUnignore(request, context);
}
