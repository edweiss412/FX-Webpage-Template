import { NextResponse } from "next/server";

import { AdminInfraError, requireAdmin } from "@/lib/auth/requireAdmin";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateLinkSession } from "@/lib/auth/validateLinkSession";
import { submitReport, type ReportAuthContext, type RequestBody } from "@/lib/reports/submit";

function errorJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

async function readRequestBody(req: Request): Promise<RequestBody | null> {
  try {
    const body = (await req.json()) as Partial<RequestBody>;
    if (typeof body.show_id !== "string" || body.show_id.length === 0) return null;
    return body as RequestBody;
  } catch {
    return null;
  }
}

async function authenticateReportRequest(
  req: Request,
  body: RequestBody,
): Promise<
  | { ok: true; auth: ReportAuthContext }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const linkResult = await validateLinkSession(req, { showId: body.show_id });
  if (linkResult.kind === "success") {
    return {
      ok: true,
      auth: {
        kind: "crew",
        source: "link",
        showId: linkResult.viewer.showId,
        crewMemberId: linkResult.viewer.crewMemberId,
      },
    };
  }
  if (linkResult.kind === "terminal_failure") {
    return { ok: false, status: linkResult.status, body: { ok: false, code: linkResult.code } };
  }

  const googleResult = await validateGoogleSession(req, { showId: body.show_id });
  if (googleResult.kind === "success") {
    return {
      ok: true,
      auth: {
        kind: "crew",
        source: "google",
        showId: googleResult.viewer.showId,
        crewMemberId: googleResult.viewer.crewMemberId,
        email: googleResult.viewer.email,
      },
    };
  }
  if (googleResult.kind === "terminal_failure") {
    return { ok: false, status: googleResult.status, body: { ok: false, code: googleResult.code } };
  }

  try {
    await requireAdmin();
    return { ok: true, auth: { kind: "admin" } };
  } catch (error) {
    if (error instanceof AdminInfraError) {
      return { ok: false, status: 500, body: { ok: false, code: error.code } };
    }
    return { ok: false, status: 401, body: { ok: false } };
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await readRequestBody(req);
  if (!body) return errorJson(400, { ok: false });

  const auth = await authenticateReportRequest(req, body);
  if (!auth.ok) return errorJson(auth.status, auth.body);

  const result = await submitReport(auth.auth, body);
  return errorJson(result.status, result.body);
}
