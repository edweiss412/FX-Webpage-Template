import { NextResponse } from "next/server";

import { AdminInfraError, requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { resolvePickerSelection } from "@/lib/auth/picker/resolvePickerSelection";
import {
  ReportSubmitInfraError,
  submitReport,
  type ReportAuthContext,
  type RequestBody,
  type SubmitReportResult,
} from "@/lib/reports/submit";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReportRouteDeps = {
  resolvePickerSelection: typeof resolvePickerSelection;
  requireAdminIdentity: typeof requireAdminIdentity;
  submitReport: (auth: ReportAuthContext, body: RequestBody) => Promise<SubmitReportResult>;
  readCrewRoleFlags: typeof readCrewRoleFlags;
};

function errorJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

async function readRequestBody(req: Request): Promise<RequestBody | null> {
  try {
    const body = (await req.json()) as Partial<RequestBody>;
    if (!isUuidV4(body.idempotency_key) || !isUuidV4(body.show_id)) return null;
    return body as RequestBody;
  } catch {
    return null;
  }
}

function isInvalidUuidError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if ("code" in current && current.code === "22P02") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

async function readCrewRoleFlags(
  showId: string,
  crewMemberId: string,
): Promise<
  | { ok: true; roleFlags: string[] }
  | { ok: false; status: 500; body: { ok: false; code: "ADMIN_SESSION_LOOKUP_FAILED" } }
> {
  try {
    const service = createSupabaseServiceRoleClient();
    const { data, error } = (await service
      .from("crew_members")
      .select("role_flags")
      .eq("show_id", showId)
      .eq("id", crewMemberId)
      .maybeSingle()) as { data: { role_flags: unknown } | null; error: unknown };

    if (error || !data || !Array.isArray(data.role_flags)) {
      return {
        ok: false,
        status: 500,
        body: { ok: false, code: "ADMIN_SESSION_LOOKUP_FAILED" },
      };
    }

    return {
      ok: true,
      roleFlags: data.role_flags.filter((flag): flag is string => typeof flag === "string"),
    };
  } catch {
    void log.error("crew role flags read failed", {
      source: "api/report",
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    });
    return {
      ok: false,
      status: 500,
      body: { ok: false, code: "ADMIN_SESSION_LOOKUP_FAILED" },
    };
  }
}

function pickerCookieFromRequest(req: Request): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === "__Host-fxav_picker") return valueParts.join("=");
  }
  return undefined;
}

async function authenticateReportRequest(
  req: Request,
  body: RequestBody,
  deps: ReportRouteDeps,
): Promise<
  | { ok: true; auth: ReportAuthContext }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  if (body.surface === "admin") {
    try {
      const admin = await deps.requireAdminIdentity();
      return { ok: true, auth: { kind: "admin", email: admin.email } };
    } catch (error) {
      if (error instanceof AdminInfraError) {
        return { ok: false, status: 500, body: { ok: false, code: error.code } };
      }
      return { ok: false, status: 403, body: { ok: false } };
    }
  }

  const pickerResult = await deps.resolvePickerSelection({
    showId: body.show_id,
    cookie: pickerCookieFromRequest(req),
  });
  if (pickerResult.kind === "resolved") {
    const roleFlags = await deps.readCrewRoleFlags(body.show_id, pickerResult.crewMemberId);
    if (!roleFlags.ok) return roleFlags;
    return {
      ok: true,
      auth: {
        kind: "crew",
        source: "picker",
        showId: body.show_id,
        crewMemberId: pickerResult.crewMemberId,
        roleFlags: roleFlags.roleFlags,
      },
    };
  }
  if (pickerResult.kind === "identity_invalidated" || pickerResult.kind === "show_unavailable") {
    return {
      ok: false,
      status: 410,
      body: {
        ok: false,
        code:
          pickerResult.kind === "show_unavailable"
            ? "PICKER_SHOW_UNAVAILABLE"
            : "PICKER_IDENTITY_CLAIMED_AFTER_PICK_BANNER",
      },
    };
  }
  if (pickerResult.kind === "infra_error") {
    return { ok: false, status: 500, body: { ok: false, code: pickerResult.code } };
  }

  try {
    const admin = await deps.requireAdminIdentity();
    return { ok: true, auth: { kind: "admin", email: admin.email } };
  } catch (error) {
    if (error instanceof AdminInfraError) {
      return { ok: false, status: 500, body: { ok: false, code: error.code } };
    }
    return { ok: false, status: 401, body: { ok: false } };
  }
}

const defaultDeps: ReportRouteDeps = {
  resolvePickerSelection,
  requireAdminIdentity,
  submitReport,
  readCrewRoleFlags,
};

/**
 * Internal handler — accepts a `deps` injection slot for unit tests.
 * `POST` (the actual route export) delegates here with no deps so its
 * signature matches Next.js 16's strict `RouteHandlerConfig` shape
 * (request + context only). Exported so tests can inject without
 * fighting Next 16's route-handler validator.
 */
export async function handleReport(
  req: Request,
  deps: ReportRouteDeps = defaultDeps,
): Promise<Response> {
  const body = await readRequestBody(req);
  if (!body) return errorJson(400, { ok: false });

  const auth = await authenticateReportRequest(req, body, deps);
  if (!auth.ok) return errorJson(auth.status, auth.body);

  let result;
  try {
    result = await deps.submitReport(auth.auth, body);
  } catch (error) {
    if (isInvalidUuidError(error)) return errorJson(400, { ok: false });
    if (error instanceof ReportSubmitInfraError) {
      return errorJson(500, { ok: false, code: "REPORT_PIPELINE_FAILED" });
    }
    throw error;
  }
  return errorJson(result.status, result.body);
}

export async function POST(req: Request): Promise<Response> {
  return handleReport(req);
}
