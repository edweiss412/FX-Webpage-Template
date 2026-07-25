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
import { isValidClearIdentityInput } from "@/lib/auth/picker/validateClearIdentityInput";
import { isSupabaseAuthCookieName } from "@/lib/auth/supabaseAuthCookieNames";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";
import { log } from "@/lib/log";

// not-subject-to-revalidate (nav-perf tag-caching Task 9): clearing the identity only deletes the
// picker COOKIE — it writes NO database rows at all, let alone getShowForViewer DATA. Nothing to
// revalidate; the LIVE viewerVersionToken handles any per-viewer freshness.

const MAX_AGE_SEC = 7_776_000;

export type ClearIdentityInput = {
  slug: string;
  shareToken: string;
  showId: string;
  // Task 12 (R4-HIGH-1): the active section deep-link, preserved through the
  // clearIdentityAndSkip → ?gate=skip redirect. Validated against the
  // allow-list inside buildShowReturnUrl; a bogus value is dropped, never
  // propagated.
  s?: string | undefined;
};

type ClearIdentityResult = { ok: true } | { ok: false; code: string };

function parseFormData(formData: FormData): ClearIdentityInput | null {
  const slug = formData.get("slug");
  const shareToken = formData.get("shareToken");
  const showId = formData.get("showId");
  if (typeof slug !== "string" || typeof shareToken !== "string" || typeof showId !== "string") {
    return null;
  }
  const s = formData.get("s");
  return { slug, shareToken, showId, ...(typeof s === "string" ? { s } : {}) };
}

export async function clearIdentity(formData: FormData): Promise<ClearIdentityResult> {
  // no-telemetry: FormData-parse wrapper; PICKER_IDENTITY_CLEARED emit fires in clearIdentityCoreImpl
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  return clearIdentityCore(input);
}

/**
 * Mode B "Continue as guest".
 *
 * Clearing the picker entry alone cannot work: `google_mismatch` is decided
 * before the picker cookie is ever consulted (lib/auth/picker/
 * resolveShowPageAccess.ts), so the gate would simply re-render. Signing the
 * browser out is what makes the chain resolve to `first_contact`, which the
 * existing `?gate=skip` guard already honors — so page.tsx is untouched.
 *
 * Order is load-bearing: the picker entry goes FIRST. If sign-out then fails,
 * the person sees Mode B again and the tap is retryable, with no stale identity
 * reachable. The reverse order would leave a live foreign session beside a stale
 * picker identity, and the next request would render the show body as that
 * person — exactly what the mismatch gate exists to prevent.
 */
export async function clearIdentityAndSkip(formData: FormData): Promise<ClearIdentityResult> {
  // no-telemetry: FormData-parse + skip redirect; PICKER_IDENTITY_CLEARED emit fires in
  // clearIdentityCoreImpl, and the AUTH_SIGNOUT_FAILED emit below covers this function's
  // own failure branch.
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Validate before anything destructive, not inside the core: a malformed direct
  // submission must not sign the person out and only then report the error.
  if (!isValidClearIdentityInput(input)) return { ok: false, code: "PICKER_INVALID_INPUT" };

  const result = await clearIdentityCore(input);
  if (!result.ok) return result;

  const signedOut = await signOutThisDevice(input.showId);
  if (!signedOut.ok) return signedOut;

  redirect(buildShowReturnUrl(input.slug, input.shareToken, { s: input.s, gate: "skip" }));
}

/**
 * Ends the Supabase session on THIS browser only.
 *
 * `scope: "local"` is not decoration: the library default is `{ scope: 'global' }`,
 * which revokes the user's refresh tokens on every device they own. A guest
 * tapping a button on a shared iPad must not sign a colleague out of their phone.
 * The app-wide /auth/sign-out route keeps the global default deliberately.
 */
async function signOutThisDevice(showId: string): Promise<ClearIdentityResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    // Belt and braces, mirroring the sign-out route: signOut's SSR adapter
    // attempts its own cookie deletion and swallows write failures, so clear any
    // residual shard explicitly. Never touches the picker envelope.
    const cookieStore = await cookies();
    for (const cookie of cookieStore.getAll()) {
      if (!isSupabaseAuthCookieName(cookie.name)) continue;
      cookieStore.set(cookie.name, "", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 0,
      });
    }
    return { ok: true };
  } catch (error) {
    // Deliberately NO redirect on this path: redirecting would loop the person
    // back to the Mode B gate with state half-applied. Returning lets the gate
    // re-render, which is itself the retry affordance.
    log.error("guest sign-out failed", {
      source: "auth.picker.clearIdentityAndSkip",
      code: "AUTH_SIGNOUT_FAILED",
      showId,
      error,
    });
    // The forensic code rides the telemetry emit above, where the §12.4 producer
    // scan strips it (lib/messages/__internal__/stripLogEmissionCalls.ts). The
    // RETURNED code has to be a catalogued one: a `code:` literal in a returned
    // object reads as a user-facing §12.4 producer, and AUTH_SIGNOUT_FAILED is
    // deliberately forensic-only, with no catalog row and no crew copy.
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}

export async function clearIdentityCore(input: ClearIdentityInput): Promise<ClearIdentityResult> {
  // no-telemetry: try/catch wrapper; PICKER_IDENTITY_CLEARED emit fires at the mutation boundary in clearIdentityCoreImpl
  try {
    return await clearIdentityCoreImpl(input);
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}

async function clearIdentityCoreImpl(input: ClearIdentityInput): Promise<ClearIdentityResult> {
  // Same predicate the guest action runs up front, so the two cannot drift.
  if (!isValidClearIdentityInput(input)) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }

  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const env = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  if (!env) {
    revalidatePath(`/show/${input.slug}/${input.shareToken}`);
    return { ok: true };
  }

  const existed = env.selections[input.showId] !== undefined;
  delete env.selections[input.showId];
  if (Object.keys(env.selections).length === 0) {
    cookieStore.set(COOKIE_NAME, "", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
    });
  } else {
    cookieStore.set(COOKIE_NAME, encodePickerCookie(env, key), {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: MAX_AGE_SEC,
    });
  }

  revalidatePath(`/show/${input.slug}/${input.shareToken}`);
  if (existed) {
    log.info("picker identity cleared", {
      source: "auth.picker.clearIdentity",
      code: "PICKER_IDENTITY_CLEARED",
      showId: input.showId,
    });
  }
  return { ok: true };
}
