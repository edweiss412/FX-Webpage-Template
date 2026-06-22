import { decodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type ResolvePickerSelectionResult =
  | { kind: "resolved"; crewMemberId: string }
  | { kind: "no_selection" }
  | { kind: "epoch_stale"; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: "removed_from_roster"; expectedEpoch: number; expectedCrewMemberId: string }
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
};

type CrewEmailRow = {
  email: string | null;
};

const INFRA_ERROR = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" } as const;

export async function resolvePickerSelection(input: {
  showId: string;
  cookie: string | undefined;
}): Promise<ResolvePickerSelectionResult> {
  let key: string;
  try {
    key = pickerCookieSigningKey();
  } catch {
    return INFRA_ERROR;
  }

  const env = decodePickerCookie(input.cookie, key);
  if (!env) return { kind: "no_selection" };

  const entry = env.selections[input.showId];
  if (!entry) return { kind: "no_selection" };

  let serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>;
  try {
    serviceRole = createSupabaseServiceRoleClient();
  } catch {
    return INFRA_ERROR;
  }

  let sessionEmail: string | null = null;
  try {
    const authClient = await createSupabaseServerClient();
    const { data, error } = await authClient.rpc("auth_email_canonical");
    if (error) return INFRA_ERROR;
    sessionEmail = typeof data === "string" ? data : null;
  } catch {
    return INFRA_ERROR;
  }

  let showRow: ShowRow | null = null;
  try {
    const { data, error } = (await serviceRole
      .from("shows")
      .select("picker_epoch, published, archived")
      .eq("id", input.showId)
      .maybeSingle()) as { data: ShowRow | null; error: unknown };
    if (error) return INFRA_ERROR;
    showRow = data;
  } catch {
    return INFRA_ERROR;
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
      .select("id, claimed_via_oauth_at")
      .eq("id", entry.id)
      .eq("show_id", input.showId)
      .maybeSingle()) as { data: CrewRow | null; error: unknown };
    if (error) return INFRA_ERROR;
    crewRow = data;
  } catch {
    return INFRA_ERROR;
  }

  if (!crewRow) {
    return { kind: "removed_from_roster", expectedEpoch: entry.e, expectedCrewMemberId: entry.id };
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
      if (error) return INFRA_ERROR;
      rowEmail = typeof data?.email === "string" ? data.email : null;
    } catch {
      return INFRA_ERROR;
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
