import { log } from "@/lib/log";
import { decodePickerCookie } from "@/lib/auth/picker/cookieEnvelope";
import {
  resolvePickerSelection,
  type ResolvePickerSelectionResult,
} from "@/lib/auth/picker/resolvePickerSelection";
import { validateGoogleSession } from "@/lib/auth/validateGoogleSession";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * The identity half of the crew page's access resolution: everything
 * `resolveShowPageAccess` checks after its archived, admin and unpublished
 * gates (the Google session, its match to the picker selection, the claim
 * and reset markers, then `resolvePickerSelection`). The page and the
 * saved-copy status route both call this one function, so the route can
 * never resolve identity differently from the page (spec §4.5).
 */

/** How the picker entry's epoch is checked (spec section 4.5). */
export type EpochCheck = { kind: "current" } | { kind: "saved"; epoch: number };

export type CrewIdentityResult =
  | { kind: "resolved"; crewMemberId: string }
  | { kind: "needs_picker_bootstrap" }
  | { kind: "no_auth"; reason: "first_contact" | "google_mismatch" }
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

/** Every outcome kind, in one place, so the parity table can prove it covers them all. */
export const CREW_IDENTITY_OUTCOMES = [
  "resolved",
  "needs_picker_bootstrap",
  "no_auth",
  "epoch_stale",
  "removed_from_roster",
  "selection_reset",
  "identity_invalidated",
  "show_unavailable",
  "infra_error",
] as const satisfies readonly CrewIdentityResult["kind"][];

type MissingKinds = Exclude<CrewIdentityResult["kind"], (typeof CREW_IDENTITY_OUTCOMES)[number]>;
const _exhaustive: MissingKinds extends never ? true : never = true;
void _exhaustive;

type CrewClaimRow = {
  claimed_via_oauth_at: string | null;
  selections_reset_at: string | null;
};

const COOKIE_NAME = "__Host-fxav_picker";
export const INFRA_ERROR = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" } as const;

/**
 * Fail-closed observability: the typed infra_error result is the contract
 * (invariant 9), but returning it SILENTLY left production blind — CI
 * measured a 30% fail-closed rate on the crew URL immediately after a
 * publish round-trip with zero server-side signal naming the failing
 * boundary (BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE). Every
 * infra_error return now warns with a `site` discriminator so the failing
 * upstream call is named in telemetry. Never throws; never alters the
 * returned result. `resolveShowPageAccess` imports this one helper rather
 * than keeping its own, so the page and the saved-copy status route name a
 * fault with the same `source` and `site` values.
 */
export function infraError(
  site: string,
  detail?: unknown,
): { kind: "infra_error"; code: "PICKER_RESOLVER_LOOKUP_FAILED" } {
  void log.warn("show page access resolver failed closed:", {
    source: "auth.picker.resolveShowPageAccess",
    code: "PICKER_RESOLVER_LOOKUP_FAILED",
    site,
    ...(detail === undefined ? {} : { error: detail }),
  });
  return INFRA_ERROR;
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

async function readCrewClaimRow(
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>,
  crewMemberId: string,
): Promise<CrewClaimRow | "infra_error" | null> {
  try {
    const { data, error } = (await serviceRole
      .from("crew_members")
      .select("claimed_via_oauth_at, selections_reset_at")
      .eq("id", crewMemberId)
      .maybeSingle()) as { data: CrewClaimRow | null; error: unknown };
    if (error) {
      infraError("crew_claim_read", error);
      return "infra_error";
    }
    return data;
  } catch (err) {
    infraError("crew_claim_read_threw", err);
    return "infra_error";
  }
}

function fromPickerResult(result: ResolvePickerSelectionResult): CrewIdentityResult {
  switch (result.kind) {
    case "no_selection":
      return { kind: "no_auth", reason: "first_contact" };
    case "infra_error":
      return infraError("picker_selection");
    case "resolved":
    case "epoch_stale":
    case "removed_from_roster":
    case "selection_reset":
    case "identity_invalidated":
    case "show_unavailable":
      return result;
  }
}

export async function resolveCrewIdentity(input: {
  showId: string;
  req: Request;
  epochCheck: EpochCheck;
  /** The caller's client, so this module constructs none (invariant 9 registry). */
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>;
}): Promise<CrewIdentityResult> {
  const { showId, req, epochCheck, serviceRole } = input;

  const cookie = pickerCookieFromRequest(req);
  const google = await validateGoogleSession(req, { showId });
  if (google.kind === "terminal_failure") return infraError("google_session");
  if (google.kind === "continue" && google.code === "GOOGLE_NO_CREW_MATCH") {
    return { kind: "no_auth", reason: "google_mismatch" };
  }
  if (google.kind === "success") {
    let key: string;
    try {
      key = pickerCookieSigningKey();
    } catch (err) {
      return infraError("picker_cookie_key", err);
    }
    const env = decodePickerCookie(cookie, key);
    const entry = env?.selections[showId];
    if (!entry || entry.id !== google.viewer.crewMemberId) {
      return { kind: "needs_picker_bootstrap" };
    }

    const crewClaimRow = await readCrewClaimRow(serviceRole, google.viewer.crewMemberId);
    // Helper already warned with the underlying fault; don't double-log.
    if (crewClaimRow === "infra_error") return INFRA_ERROR;
    if (!crewClaimRow?.claimed_via_oauth_at) {
      return { kind: "needs_picker_bootstrap" };
    }
    const claimEpochMillis = Math.floor(new Date(crewClaimRow.claimed_via_oauth_at).getTime());
    if (entry.t <= claimEpochMillis) {
      return { kind: "needs_picker_bootstrap" };
    }
    // Per-member admin reset (companion surface — mirrors the claim check above). A claimed member
    // whose pick predates the reset re-bootstraps (re-confirms the same identity). NaN fails open.
    if (crewClaimRow.selections_reset_at !== null) {
      const resetAtMillis = Math.floor(new Date(crewClaimRow.selections_reset_at).getTime());
      if (entry.t <= resetAtMillis) {
        return { kind: "needs_picker_bootstrap" };
      }
    }
  }

  const pickerResult = await resolvePickerSelection({ showId, cookie, epochCheck });
  return fromPickerResult(pickerResult);
}
