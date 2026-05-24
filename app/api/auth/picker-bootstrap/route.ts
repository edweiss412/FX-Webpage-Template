import { NextResponse } from "next/server";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import {
  COOKIE_NAME,
  decodePickerCookie,
  encodePickerCookie,
  type PickerEnvelope,
} from "@/lib/auth/picker/cookieEnvelope";
import { verifyPickerIntent } from "@/lib/auth/picker/intentToken";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { validateNextParamDetailed } from "@/lib/auth/validateNextParam";
import { hashForLog } from "@/lib/email/hashForLog";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { messageFor, type MessageCode } from "@/lib/messages/lookup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const ROUTE = "/api/auth/picker-bootstrap";
const MAX_AGE_SEC = 7_776_000;
const SHOW_NEXT_RE = /^\/show\/([a-z0-9-]+)\/([0-9a-f]{64})$/;

type ClaimResult = {
  mint_safe_t_millis?: unknown;
  shows?: unknown;
};

type ClaimShowRow = {
  show_id: string;
  crew_member_id: string;
  picker_epoch: number;
};

function htmlResponse(code: MessageCode, status: number): Response {
  const entry = messageFor(code);
  const body = entry.crewFacing ?? entry.dougFacing ?? "Please try again.";
  return new NextResponse(
    [
      "<!doctype html>",
      '<html lang="en">',
      "<head><meta charset=\"utf-8\"><title>Sign-in unavailable</title></head>",
      "<body>",
      "<h1>Sign-in unavailable</h1>",
      `<p>${body}</p>`,
      "</body>",
      "</html>",
    ].join(""),
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function parseNextPath(path: string): { slug: string; shareToken: string } | null {
  const match = SHOW_NEXT_RE.exec(path);
  if (!match) return null;
  return { slug: match[1]!, shareToken: match[2]! };
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "unknown")
    : "unknown";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message ?? "unknown")
    : "unknown";
}

async function emitResolveShowFailure(input: {
  slug: string;
  error: unknown;
}): Promise<void> {
  try {
    await upsertAdminAlert({
      showId: null,
      code: "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
      context: {
        stage: "resolve_show",
        slug: input.slug,
        rpc_error_code: errorCode(input.error),
        rpc_error_message: errorMessage(input.error),
        route: ROUTE,
      },
    });
  } catch {
    console.error("[picker-bootstrap] resolve-show alert emission failed", {
      slug: input.slug,
      rpcErrorCode: errorCode(input.error),
    });
  }
}

async function emitClaimFailure(input: { canonicalEmail: string; error: unknown }): Promise<void> {
  try {
    await upsertAdminAlert({
      showId: null,
      code: "PICKER_BOOTSTRAP_RPC_FAILED",
      context: {
        attempted_email_hash: hashForLog(input.canonicalEmail),
        rpc_error_code: errorCode(input.error),
        rpc_error_message: errorMessage(input.error),
        route: ROUTE,
      },
    });
  } catch (alertErr) {
    console.error("[picker-bootstrap] claim alert emission failed", {
      emailHash: hashForLog(input.canonicalEmail),
      rpcErrorCode: errorCode(input.error),
      alertError:
        alertErr instanceof Error
          ? { name: alertErr.name, message: alertErr.message }
          : String(alertErr),
    });
  }
}

function isClaimShowRow(value: unknown): value is ClaimShowRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.show_id === "string" &&
    typeof row.crew_member_id === "string" &&
    typeof row.picker_epoch === "number"
  );
}

function findClaimShow(result: ClaimResult, showId: string): ClaimShowRow | null {
  if (!Array.isArray(result.shows)) return null;
  return result.shows.find((row): row is ClaimShowRow => isClaimShowRow(row) && row.show_id === showId) ?? null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const nextOutcome = validateNextParamDetailed(url.searchParams.get("next"));
  if (!nextOutcome.ok) return htmlResponse("OAUTH_REDIRECT_INVALID", 403);

  const parsedNext = parseNextPath(nextOutcome.path);
  if (!parsedNext) return htmlResponse("OAUTH_REDIRECT_INVALID", 403);

  let signingKey: string;
  try {
    signingKey = pickerCookieSigningKey();
  } catch {
    return htmlResponse("PICKER_BOOTSTRAP_RPC_FAILED", 502);
  }

  const intent = verifyPickerIntent(url.searchParams.get("t"), signingKey);
  if (
    !intent ||
    intent.slug !== parsedNext.slug ||
    intent.shareToken !== parsedNext.shareToken
  ) {
    return htmlResponse("OAUTH_REDIRECT_INVALID", 403);
  }

  const serviceRole = createSupabaseServiceRoleClient();
  let targetShowId: string | null = null;
  try {
    const { data, error } = await serviceRole.rpc("resolve_show_by_slug_and_token", {
      p_slug: parsedNext.slug,
      p_share_token: parsedNext.shareToken,
    });
    if (error) {
      await emitResolveShowFailure({ slug: parsedNext.slug, error });
      return htmlResponse("PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED", 502);
    }
    targetShowId = typeof data === "string" ? data : null;
  } catch (error) {
    await emitResolveShowFailure({ slug: parsedNext.slug, error });
    return htmlResponse("PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED", 502);
  }
  if (!targetShowId) return htmlResponse("PICKER_INVALID_SHARE_TOKEN", 403);

  const google = await validateGoogleSession(request, { showId: targetShowId });
  if (google.kind === "terminal_failure") {
    return htmlResponse(google.code, google.status);
  }
  if (google.kind === "continue") {
    return NextResponse.redirect(new URL(nextOutcome.path, request.url), { status: 302 });
  }

  let claimResult: ClaimResult | null = null;
  try {
    const { data, error } = await serviceRole.rpc("claim_oauth_identity", {
      p_email: google.viewer.email,
    });
    if (error) {
      await emitClaimFailure({ canonicalEmail: google.viewer.email, error });
      return htmlResponse("PICKER_BOOTSTRAP_RPC_FAILED", 502);
    }
    claimResult = data as ClaimResult | null;
  } catch (error) {
    await emitClaimFailure({ canonicalEmail: google.viewer.email, error });
    return htmlResponse("PICKER_BOOTSTRAP_RPC_FAILED", 502);
  }

  const response = NextResponse.redirect(new URL(nextOutcome.path, request.url), { status: 302 });
  const claimShow = claimResult ? findClaimShow(claimResult, targetShowId) : null;
  if (claimResult && claimShow && Number.isSafeInteger(claimResult.mint_safe_t_millis)) {
    const current = decodePickerCookie(request.headers.get("cookie")?.match(/(?:^|;\s*)__Host-fxav_picker=([^;]+)/)?.[1], signingKey);
    const env: PickerEnvelope = current ?? { v: 1, selections: {} };
    env.selections[targetShowId] = {
      id: claimShow.crew_member_id,
      e: claimShow.picker_epoch,
      t: claimResult.mint_safe_t_millis as number,
    };
    response.cookies.set(COOKIE_NAME, encodePickerCookie(env, signingKey), {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: MAX_AGE_SEC,
    });
  }

  return response;
}
