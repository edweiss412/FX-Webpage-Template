import { decodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { log } from "@/lib/log";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ResolvePickerSelectionResult =
  | { kind: "resolved"; crewMemberId: string }
  | { kind: "no_selection" }
  | { kind: "epoch_stale"; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: "removed_from_roster"; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: "selection_reset"; expectedEpoch: number; expectedCrewMemberId: string }
  | {
      kind: "identity_invalidated";
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: "claimed_after_pick" | "session_mismatch";
    }
  | { kind: "show_unavailable" }
  | { kind: "infra_error"; code: "PICKER_RESOLVER_LOOKUP_FAILED" };

type ShowRow = {
  picker_epoch: number;
  published: boolean;
  archived: boolean;
};

type CrewRow = {
  id: string;
  claimed_via_oauth_at: string | null;
  selections_reset_at: string | null;
};

type CrewEmailRow = {
  email: string | null;
};

const INFRA_ERROR = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" } as const;

/**
 * Fail-closed observability, mirroring resolveShowPageAccess's helper: the
 * typed infra_error result is the contract, but a silent return here hid a
 * missing PICKER_COOKIE_SIGNING_KEY in a CI workflow env for months — every
 * crew visit failed closed and nothing named the boundary
 * (BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE, run 30236837082: 40/40
 * fail-closed attempts, all attributed only one level up). Never throws;
 * never alters the returned result.
 */
function infraError(
  site: string,
  detail?: unknown,
): { kind: "infra_error"; code: "PICKER_RESOLVER_LOOKUP_FAILED" } {
  void log.warn("picker selection resolver failed closed:", {
    source: "auth.picker.resolvePickerSelection",
    code: "PICKER_RESOLVER_LOOKUP_FAILED",
    site,
    ...(detail === undefined ? {} : { error: detail }),
  });
  return INFRA_ERROR;
}

export async function resolvePickerSelection(input: {
  showId: string;
  cookie: string | undefined;
}): Promise<ResolvePickerSelectionResult> {
  let key: string;
  try {
    key = pickerCookieSigningKey();
  } catch (err) {
    return infraError("cookie_key", err);
  }

  const env = decodePickerCookie(input.cookie, key);
  if (!env) return { kind: "no_selection" };

  const entry = env.selections[input.showId];
  if (!entry) return { kind: "no_selection" };

  let serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    serviceRole = createSupabaseServiceRoleClient();
  } catch (err) {
    return infraError("service_role_client", err);
  }

  let sessionEmail: string | null = null;
  try {
    const authClient = await createSupabaseServerClient();
    const { data, error } = await authClient.rpc("auth_email_canonical");
    if (error) return infraError("auth_email", error);
    sessionEmail = typeof data === "string" ? data : null;
  } catch (err) {
    return infraError("auth_email_threw", err);
  }

  let showRow: ShowRow | null = null;
  try {
    const { data, error } = (await serviceRole
      .from("shows")
      .select("picker_epoch, published, archived")
      .eq("id", input.showId)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };
    if (error) return infraError("show_read", error);
    showRow = data;
  } catch (err) {
    return infraError("show_read_threw", err);
  }

  if (!showRow) return { kind: "no_selection" };
  if (showRow.archived || !showRow.published) return { kind: "show_unavailable" };
  if (entry.e !== showRow.picker_epoch) {
    return { kind: "epoch_stale", expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
  }

  let crewRow: CrewRow | null = null;
  try {
    const { data, error } = (await serviceRole
      .from("crew_members")
      .select("id, claimed_via_oauth_at, selections_reset_at")
      .eq("id", entry.id)
      .eq("show_id", input.showId)
      .maybeSingle()) as { data: CrewRow | null; error: unknown };
    if (error) return infraError("crew_read", error);
    crewRow = data;
  } catch (err) {
    return infraError("crew_read_threw", err);
  }

  if (!crewRow) {
    return { kind: "removed_from_roster", expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
  }

  // Per-member admin reset wins over the claimed-after-pick check below: an explicit admin reset
  // should force a re-pick even for a claimed identity. NaN (malformed marker) fails open:
  // `entry.t <= NaN` is false, so a corrupt value never triggers a spurious reset.
  if (crewRow.selections_reset_at !== null) {
    const resetAtMillis = Math.floor(new Date(crewRow.selections_reset_at).getTime());
    if (entry.t <= resetAtMillis) {
      return { kind: "selection_reset", expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
    }
  }

  if (crewRow.claimed_via_oauth_at !== null) {
    const claimEpochMillis = Math.floor(new Date(crewRow.claimed_via_oauth_at).getTime());
    if (entry.t <= claimEpochMillis) {
      return {
        kind: "identity_invalidated",
        expectedEpoch: entry.e,
        expectedCrewMemberId: entry.id,
        reason: "claimed_after_pick",
      };
    }
  }

  if (sessionEmail) {
    let rowEmail: string | null = null;
    try {
      const { data, error } = (await serviceRole
        .from("crew_members")
        .select("email")
        .eq("id", entry.id)
        .single()) as { data: CrewEmailRow | null; error: unknown };
      if (error) return infraError("crew_email_read", error);
      rowEmail = typeof data?.email === "string" ? data.email : null;
    } catch (err) {
      return infraError("crew_email_read_threw", err);
    }
    if (rowEmail !== sessionEmail) {
      return {
        kind: "identity_invalidated",
        expectedEpoch: entry.e,
        expectedCrewMemberId: entry.id,
        reason: "session_mismatch",
      };
    }
  }

  return { kind: "resolved", crewMemberId: entry.id };
}
