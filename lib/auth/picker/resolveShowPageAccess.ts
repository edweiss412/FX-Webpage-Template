import { createHmac } from "node:crypto";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import { decodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { resolvePickerSelection, type ResolvePickerSelectionResult } from "@/lib/auth/picker/resolvePickerSelection";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ResolveShowPageAccessResult =
  | { kind: "archived" }
  | { kind: "admin"; showId: string }
  | { kind: "needs_picker_bootstrap"; intentToken: string }
  | { kind: "resolved"; showId: string; crewMemberId: string; source: "cookie" | "admin" }
  | { kind: "unpublished" }
  | { kind: "no_auth"; showId: string; reason: "first_contact" | "google_mismatch" }
  | { kind: "epoch_stale"; showId: string; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: "removed_from_roster"; showId: string; expectedEpoch: number; expectedCrewMemberId: string }
  | {
      kind: "identity_invalidated";
      showId: string;
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: "claimed_after_pick" | "session_mismatch";
    }
  | { kind: "show_unavailable" }
  | { kind: "infra_error"; code: "PICKER_RESOLVER_LOOKUP_FAILED" };

type ShowRow = {
  id: string;
  published: boolean;
  archived: boolean;
};

type CrewClaimRow = {
  claimed_via_oauth_at: string | null;
};

const COOKIE_NAME = "__Host-fxav_picker";
const INFRA_ERROR = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" } as const;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signIntentToken(input: { slug: string; shareToken: string; exp: number }, key: string): string {
  const payload = base64url(JSON.stringify(input));
  const sig = createHmac("sha256", Buffer.from(key, "hex")).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function pickerCookieFromRequest(req: Request): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;

  for (const part of raw.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      return valueParts.join("=");
    }
  }
  return undefined;
}

function toPageResult(
  showId: string,
  result: ResolvePickerSelectionResult,
): ResolveShowPageAccessResult {
  switch (result.kind) {
    case "resolved":
      return { kind: "resolved", showId, crewMemberId: result.crewMemberId, source: "cookie" };
    case "no_selection":
      return { kind: "no_auth", showId, reason: "first_contact" };
    case "epoch_stale":
      return {
        kind: "epoch_stale",
        showId,
        expectedEpoch: result.expectedEpoch,
        expectedCrewMemberId: result.expectedCrewMemberId,
      };
    case "removed_from_roster":
      return {
        kind: "removed_from_roster",
        showId,
        expectedEpoch: result.expectedEpoch,
        expectedCrewMemberId: result.expectedCrewMemberId,
      };
    case "identity_invalidated":
      return {
        kind: "identity_invalidated",
        showId,
        expectedEpoch: result.expectedEpoch,
        expectedCrewMemberId: result.expectedCrewMemberId,
        reason: result.reason,
      };
    case "show_unavailable":
      return { kind: "show_unavailable" };
    case "infra_error":
      return INFRA_ERROR;
  }
}

async function readShowRow(
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>,
  showId: string,
): Promise<ShowRow | "infra_error" | null> {
  try {
    const { data, error } = (await serviceRole
      .from("shows")
      .select("id,published,archived")
      .eq("id", showId)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };
    if (error) return "infra_error";
    return data;
  } catch {
    return "infra_error";
  }
}

async function readCrewClaimRow(
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>,
  crewMemberId: string,
): Promise<CrewClaimRow | "infra_error" | null> {
  try {
    const { data, error } = (await serviceRole
      .from("crew_members")
      .select("claimed_via_oauth_at")
      .eq("id", crewMemberId)
      .maybeSingle()) as { data: CrewClaimRow | null; error: unknown };
    if (error) return "infra_error";
    return data;
  } catch {
    return "infra_error";
  }
}

export async function resolveShowPageAccess(_input: {
  slug: string;
  shareToken: string;
  req: Request;
}): Promise<ResolveShowPageAccessResult> {
  const { slug, shareToken, req } = _input;
  let serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    serviceRole = createSupabaseServiceRoleClient();
  } catch {
    return INFRA_ERROR;
  }

  let showId: string | null = null;
  try {
    const { data, error } = await serviceRole.rpc("resolve_show_by_slug_and_token", {
      p_slug: slug,
      p_share_token: shareToken,
    });
    if (error) return INFRA_ERROR;
    showId = typeof data === "string" ? data : null;
  } catch {
    return INFRA_ERROR;
  }
  if (!showId) return { kind: "show_unavailable" };

  const showRow = await readShowRow(serviceRole, showId);
  if (showRow === "infra_error") return INFRA_ERROR;
  if (!showRow) return { kind: "show_unavailable" };
  if (showRow.archived) return { kind: "archived" };

  const admin = await isAdminSession(req);
  if (admin.ok) return { kind: "admin", showId };
  if (admin.reason === "infra_error") return INFRA_ERROR;

  if (!showRow.published) return { kind: "unpublished" };

  const cookie = pickerCookieFromRequest(req);
  const google = await validateGoogleSession(req, { showId });
  if (google.kind === "terminal_failure") return INFRA_ERROR;
  if (google.kind === "continue" && google.code === "GOOGLE_NO_CREW_MATCH") {
    return { kind: "no_auth", showId, reason: "google_mismatch" };
  }
  if (google.kind === "success") {
    let key: string;
    try {
      key = pickerCookieSigningKey();
    } catch {
      return INFRA_ERROR;
    }
    const env = decodePickerCookie(cookie, key);
    const entry = env?.selections[showId];
    if (!entry || entry.id !== google.viewer.crewMemberId) {
      return {
        kind: "needs_picker_bootstrap",
        intentToken: signIntentToken({ slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 }, key),
      };
    }

    const crewClaimRow = await readCrewClaimRow(serviceRole, google.viewer.crewMemberId);
    if (crewClaimRow === "infra_error") return INFRA_ERROR;
    if (!crewClaimRow?.claimed_via_oauth_at) {
      return {
        kind: "needs_picker_bootstrap",
        intentToken: signIntentToken({ slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 }, key),
      };
    }
    const claimEpochMillis = Math.floor(new Date(crewClaimRow.claimed_via_oauth_at).getTime());
    if (entry.t <= claimEpochMillis) {
      return {
        kind: "needs_picker_bootstrap",
        intentToken: signIntentToken({ slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 }, key),
      };
    }
  }

  const pickerResult = await resolvePickerSelection({ showId, cookie });
  return toPageResult(showId, pickerResult);
}
