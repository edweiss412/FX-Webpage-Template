import { NextResponse } from "next/server";
import postgres from "postgres";
import { canonicalize } from "@/lib/email/canonicalize";

export type AdminAlertGlobalResolveTx = {
  queryOne<T>(sql: string, params: unknown[]): Promise<T | null>;
};

export type AdminAlertGlobalResolveDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withTx?: <R>(fn: (tx: AdminAlertGlobalResolveTx) => Promise<R>) => Promise<R>;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AlertRow = {
  id: string;
  show_id: string | null;
  slug: string | null;
  resolved_at: string | null;
};

function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("admin alert resolve route requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

function postgresTxAdapter(rawTx: { unsafe(sql: string, params?: unknown[]): Promise<unknown[]> }) {
  return {
    async queryOne<T>(sql: string, params: unknown[]) {
      const rows = (await rawTx.unsafe(sql, params)) as T[];
      return rows[0] ?? null;
    },
  } satisfies AdminAlertGlobalResolveTx;
}

async function defaultWithTx<R>(fn: (tx: AdminAlertGlobalResolveTx) => Promise<R>): Promise<R> {
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

function depsWithDefaults(deps: AdminAlertGlobalResolveDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withTx: deps.withTx ?? defaultWithTx,
  };
}

function errorResponse(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

export async function handleAdminAlertGlobalResolve(
  _request: Request,
  context: RouteContext,
  routeDeps: AdminAlertGlobalResolveDeps = {},
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

  const { id } = await context.params;
  return await deps.withTx(async (tx) => {
    const row = await tx.queryOne<AlertRow>(
      `
        select a.id, a.show_id, s.slug, a.resolved_at
          from public.admin_alerts a
          left join public.shows s on s.id = a.show_id
         where a.id = $1::uuid
         for update
      `,
      [id],
    );
    if (!row) return errorResponse(404, "ADMIN_ALERT_NOT_FOUND");
    if (row.show_id !== null) {
      return errorResponse(400, "ALERT_REQUIRES_SHOW_SCOPED_RESOLVE", {
        id,
        show_id: row.show_id,
        ...(row.slug ? { redirect_to: `/api/admin/show/${row.slug}/alerts/${id}/resolve` } : {}),
      });
    }
    if (row.resolved_at) {
      return NextResponse.json({ status: "resolved", id, resolved_at: row.resolved_at });
    }
    const updated = await tx.queryOne<AlertRow>(
      `
        update public.admin_alerts
           set resolved_at = now(),
               resolved_by = $2
         where id = $1::uuid
           and show_id is null
        returning id, show_id, null::text as slug, resolved_at
      `,
      [id, canonicalize(admin.email)],
    );
    if (!updated) return errorResponse(404, "ADMIN_ALERT_NOT_FOUND");
    return NextResponse.json({ status: "resolved", id, resolved_at: updated.resolved_at });
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleAdminAlertGlobalResolve(request, context);
}
