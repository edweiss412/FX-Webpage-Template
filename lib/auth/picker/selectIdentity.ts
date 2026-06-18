"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  decodePickerCookie,
  encodePickerCookie,
} from "@/lib/auth/picker/cookieEnvelope";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const MAX_AGE_SEC = 7_776_000;

export type SelectIdentityInput = {
  slug: string;
  shareToken: string;
  crewMemberId: string;
};

export type SelectIdentityResult = { ok: true } | { ok: false; code: string };

type SelectIdentityRpcRow = {
  out_show_id: string | null;
  out_picker_epoch: number | null;
  out_observed_at_millis: number | null;
  out_rejection_code: string | null;
};

export async function selectIdentity(formData: FormData): Promise<SelectIdentityResult> {
  const slug = formData.get("slug");
  const shareToken = formData.get("shareToken");
  const crewMemberId = formData.get("crewMemberId");
  if (typeof slug !== "string" || typeof shareToken !== "string" || typeof crewMemberId !== "string") {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }
  // Task 12 (R4-HIGH-1): preserve the active-section deep-link through the
  // claimed-row → sign-in recovery redirect. buildShowReturnUrl drops any
  // non-allow-listed `s`; validateNextParamDetailed then carries the safe
  // `s` back through the OAuth round-trip.
  const sRaw = formData.get("s");
  const s = typeof sRaw === "string" ? sRaw : undefined;

  const result = await selectIdentityCore({ slug, shareToken, crewMemberId });
  if (!result.ok && result.code === "PICKER_IDENTITY_CLAIMED") {
    console.warn(
      JSON.stringify({
        event: "picker.identity_claimed",
        tamper: true,
        slug,
        crewMemberId,
        reason: "hand_crafted_post_bypassed_deactivated_row",
      }),
    );
    redirect(
      `/auth/sign-in?next=${encodeURIComponent(buildShowReturnUrl(slug, shareToken, { s }))}`,
    );
  }
  return result;
}

export async function selectIdentityCore(input: SelectIdentityInput): Promise<SelectIdentityResult> {
  try {
    return await selectIdentityCoreImpl(input);
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}

async function selectIdentityCoreImpl(input: SelectIdentityInput): Promise<SelectIdentityResult> {
  if (!input || typeof input !== "object") return { ok: false, code: "PICKER_INVALID_INPUT" };
  if (typeof input.slug !== "string" || !SLUG_RE.test(input.slug)) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }
  if (typeof input.shareToken !== "string" || !TOKEN_RE.test(input.shareToken)) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }
  if (typeof input.crewMemberId !== "string" || !UUID_RE.test(input.crewMemberId)) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }

  let data: SelectIdentityRpcRow | null = null;
  let error: unknown = null;
  try {
    const supabase = createSupabaseServiceRoleClient();
    const response = await supabase
      .rpc("select_identity_atomic", {
        p_slug: input.slug,
        p_share_token: input.shareToken,
        p_crew_member_id: input.crewMemberId,
      })
      .single();
    data = response.data as SelectIdentityRpcRow | null;
    error = response.error;
  } catch (cause) {
    error = cause;
  }

  if (error || !data) return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  if (data.out_rejection_code) return { ok: false, code: data.out_rejection_code };
  if (
    !data.out_show_id ||
    !Number.isInteger(data.out_picker_epoch) ||
    !Number.isSafeInteger(data.out_observed_at_millis)
  ) {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
  const showId = data.out_show_id;
  const pickerEpoch = data.out_picker_epoch;
  const observedAtMillis = data.out_observed_at_millis;
  if (pickerEpoch === null || observedAtMillis === null) {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }

  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const existing = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  const envelope = existing ?? { v: 1 as const, selections: {} };
  envelope.selections[showId] = {
    id: input.crewMemberId,
    e: pickerEpoch,
    t: observedAtMillis,
  };

  cookieStore.set(COOKIE_NAME, encodePickerCookie(envelope, key), {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: MAX_AGE_SEC,
  });
  revalidatePath(`/show/${input.slug}/${input.shareToken}`);
  return { ok: true };
}
