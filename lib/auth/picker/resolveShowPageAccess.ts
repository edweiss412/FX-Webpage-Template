import { createHmac } from "node:crypto";
import { isAdminSession } from "@/lib/auth/isAdminSession";
import {
  INFRA_ERROR,
  infraError,
  resolveCrewIdentity,
  type CrewIdentityResult,
} from "@/lib/auth/picker/resolveCrewIdentity";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ResolveShowPageAccessResult =
  | { kind: "archived" }
  | { kind: "admin"; showId: string }
  | { kind: "needs_picker_bootstrap"; intentToken: string }
  | {
      kind: "resolved";
      showId: string;
      crewMemberId: string;
      source: "cookie" | "admin";
      pickerEpoch: number;
    }
  | { kind: "unpublished"; showId: string }
  | { kind: "no_auth"; showId: string; reason: "first_contact" | "google_mismatch" }
  | { kind: "epoch_stale"; showId: string; expectedEpoch: number; expectedCrewMemberId: string }
  | {
      kind: "removed_from_roster";
      showId: string;
      expectedEpoch: number;
      expectedCrewMemberId: string;
    }
  | {
      kind: "selection_reset";
      showId: string;
      expectedEpoch: number;
      expectedCrewMemberId: string;
    }
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
  picker_epoch: number;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signIntentToken(
  input: { slug: string; shareToken: string; exp: number },
  key: string,
): string {
  const payload = base64url(JSON.stringify(input));
  const sig = createHmac("sha256", Buffer.from(key, "hex")).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function toPageResult(
  showId: string,
  pickerEpoch: number,
  result: Exclude<CrewIdentityResult, { kind: "needs_picker_bootstrap" }>,
): ResolveShowPageAccessResult {
  switch (result.kind) {
    case "resolved":
      return {
        kind: "resolved",
        showId,
        crewMemberId: result.crewMemberId,
        source: "cookie",
        pickerEpoch,
      };
    case "no_auth":
      return { kind: "no_auth", showId, reason: result.reason };
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
    case "selection_reset":
      return {
        kind: "selection_reset",
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
      // resolveCrewIdentity already warned with the failing site; don't double-log.
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
      .select("id,published,archived,picker_epoch")
      .eq("id", showId)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };
    if (error) {
      infraError("show_read", error);
      return "infra_error";
    }
    return data;
  } catch (err) {
    infraError("show_read_threw", err);
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
  } catch (err) {
    return infraError("service_role_client", err);
  }

  let showId: string | null = null;
  try {
    const { data, error } = await serviceRole.rpc("resolve_show_by_slug_and_token", {
      p_slug: slug,
      p_share_token: shareToken,
    });
    if (error) return infraError("resolve_rpc", error);
    showId = typeof data === "string" ? data : null;
  } catch (err) {
    return infraError("resolve_rpc_threw", err);
  }
  if (!showId) return { kind: "show_unavailable" };

  const showRow = await readShowRow(serviceRole, showId);
  // Helper already warned with the underlying fault; don't double-log.
  if (showRow === "infra_error") return INFRA_ERROR;
  if (!showRow) return { kind: "show_unavailable" };
  if (showRow.archived) return { kind: "archived" };

  const admin = await isAdminSession(req);
  if (admin.ok) return { kind: "admin", showId };
  if (admin.reason === "infra_error") return infraError("admin_session");

  if (!showRow.published) return { kind: "unpublished", showId };

  const identity = await resolveCrewIdentity({
    showId,
    req,
    epochCheck: { kind: "current" },
    serviceRole,
  });
  if (identity.kind === "needs_picker_bootstrap") {
    let key: string;
    try {
      key = pickerCookieSigningKey();
    } catch (err) {
      return infraError("picker_cookie_key", err);
    }
    return {
      kind: "needs_picker_bootstrap",
      intentToken: signIntentToken(
        { slug, shareToken, exp: Math.floor(Date.now() / 1000) + 60 },
        key,
      ),
    };
  }
  return toPageResult(showId, showRow.picker_epoch, identity);
}
