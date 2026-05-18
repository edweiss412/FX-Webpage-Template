import { NextResponse } from "next/server";
import postgres from "postgres";

export type AdminAlertShowResolveTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T | null>;
};

export type AdminAlertShowResolveDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: AdminAlertShowResolveTx) => Promise<R>) => Promise<R>;
};

type RouteContext = {
  params: Promise<{ slug: string; id: string }>;
};

type ShowRow = {
  id: string;
  slug: string;
};

type AlertRow = {
  id: string;
  show_id: string;
  resolved_at: string | null;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("show-scoped alert resolve route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      const rows = (await rawTx.unsafe(sql, params)) as T[];
      return rows[0] ?? null;
    },
  } satisfies AdminAlertShowResolveTx;
}

async function defaultWithTx<R>(fn: (tx: AdminAlertShowResolveTx) => Promise<R>): Promise<R> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return (await sql.begin(async (rawTx) =>
      fn(postgresTxAdapter(rawTx as { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> })),
    )) as R;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

function depsWithDefaults(deps: AdminAlertShowResolveDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function handleAdminAlertShowResolve(
  _request: Request,
  context: RouteContext,
  routeDeps: AdminAlertShowResolveDeps = {},
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

  const { slug, id } = await context.params;
  return await deps.withTx(async (tx) => {
    const show = await tx.queryOne<ShowRow>(
      `select id, slug from public.shows where slug = $1 limit 1`,
      [slug],
    );
    if (!show) return errorResponse(404, "ADMIN_ALERT_NOT_FOUND");

    const row = await tx.queryOne<AlertRow>(
      `
        select id, show_id, resolved_at
          from public.admin_alerts
         where id = $1::uuid
           and show_id = $2::uuid
         for update
      `,
      [id, show.id],
    );
    if (!row) return errorResponse(404, "ADMIN_ALERT_NOT_FOUND");
    if (row.resolved_at) {
      return NextResponse.json({ status: "resolved", id, resolved_at: row.resolved_at });
    }

    const updated = await tx.queryOne<AlertRow>(
      `
        update public.admin_alerts
           set resolved_at = now(),
               resolved_by = $3
         where id = $1::uuid
           and show_id = $2::uuid
           and resolved_at is null
        returning id, show_id, resolved_at
      `,
      [id, show.id, admin.email],
    );
    if (!updated) return errorResponse(404, "ADMIN_ALERT_NOT_FOUND");
    return NextResponse.json({ status: "resolved", id, resolved_at: updated.resolved_at });
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleAdminAlertShowResolve(request, context);
}
