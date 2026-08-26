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
import {
  isSameOriginServerAction,
  rejectCrossOriginPicker,
} from "@/lib/auth/sameOriginServerAction";
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

export type ClearIdentityResult = { ok: true } | { ok: false; code: string };

/**
 * The same-origin refusal for all three exported actions is the DESIGNATED
 * `rejectCrossOriginPicker` export (origin-sweep spec §3.4/§3.6), not a
 * module-local helper.
 *
 * The migration is not cosmetic. A per-file local is a body the structural walk
 * would have to analyse, and that analysis does not terminate: spec review round
 * 3 edited exactly this function to `await cookies()` and `.set(...)` and it
 * still satisfied every clause of the accept-set, because the predicate models
 * write builders, `.rpc(` and `logAdminOutcome` and nothing else. Resolving the
 * refusal BY NAME against four exports of one reviewed module is what closes
 * that, so this file keeps no local.
 *
 * The emit is preserved byte-for-byte — `PICKER_ORIGIN_REJECTED`, source
 * `auth.picker.sameOriginGate`, the per-endpoint `action` string — which is why
 * tests/auth/picker/clearIdentity.test.ts passes UNMODIFIED across the change.
 * If it had needed an edit, the migration changed behaviour and would be wrong.
 *
 * EVERY exported function in a module-level `"use server"` file is an
 * independently addressable endpoint — a forged POST reaches it whether or not
 * the app wires it to a form — so the gate goes on all three, not only the
 * form-wired ones. Gating `clearIdentity` alone would leave `clearIdentityCore`
 * as an ungated deletion endpoint. `action` is what makes each wrapper's own
 * guard load-bearing: deleting one makes it fall through to the core's, which
 * emits a different `action`, so the per-endpoint tests catch it.
 */

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
  // no-telemetry: FormData-parse wrapper; PICKER_IDENTITY_CLEARED emit fires in
  // clearIdentityCoreImpl, and the AUTH_SIGNOUT_FAILED emit in signOutThisDevice covers
  // this function's own sign-out failure branch.
  // Refuse BEFORE any validation or mutation, mirroring the sign-out route's
  // "refuse before any teardown" ordering.
  if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("clearIdentity");
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Validate before anything destructive, as the guest action does.
  if (!isValidClearIdentityInput(input)) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Sign out FIRST on this path, the reverse of clearIdentityAndSkip. The core
  // schedules revalidatePath; a re-render with the session still live and the
  // entry gone is needs_picker_bootstrap, which re-mints the same identity and
  // hides the failure (BL-SWITCH-PERSON-GOOGLE-LOOPBACK). Failing here
  // re-renders nothing: the menu shows the failure copy and the person is still
  // who they were. Safe because a rendered avatar menu belongs to the session's
  // own person or to a cookie-only viewer with no session; the foreign-session
  // case Mode B orders around cannot reach this menu.
  const signedOut = await signOutThisDevice(input.showId, "clearIdentity");
  if (!signedOut.ok) return signedOut;
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
 * the person sees a gate again and the tap is retryable, with no stale identity
 * reachable — Mode B while the session survives, or the first-contact welcome if
 * revocation landed and only the cookie sweep failed. The reverse order would
 * leave a live foreign session beside a stale picker identity, and the next request would render the show body as that
 * person — exactly what the mismatch gate exists to prevent.
 */
export async function clearIdentityAndSkip(formData: FormData): Promise<ClearIdentityResult> {
  // no-telemetry: FormData-parse + skip redirect; PICKER_IDENTITY_CLEARED emit fires in
  // clearIdentityCoreImpl, and the AUTH_SIGNOUT_FAILED emit below covers this function's
  // own failure branch.
  if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("clearIdentityAndSkip");
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  // Validate before anything destructive, not inside the core: a malformed direct
  // submission must not sign the person out and only then report the error.
  if (!isValidClearIdentityInput(input)) return { ok: false, code: "PICKER_INVALID_INPUT" };

  const result = await clearIdentityCore(input);
  if (!result.ok) return result;

  const signedOut = await signOutThisDevice(input.showId, "clearIdentityAndSkip");
  if (!signedOut.ok) return signedOut;

  redirect(buildShowReturnUrl(input.slug, input.shareToken, { s: input.s, gate: "skip" }));
}

type ClearAction = "clearIdentity" | "clearIdentityAndSkip";

/**
 * Ends the Supabase session on THIS browser only.
 *
 * `scope: "local"` is not decoration: the library default is `{ scope: 'global' }`,
 * which revokes the user's refresh tokens on every device they own. A guest
 * tapping a button on a shared iPad must not sign a colleague out of their phone.
 * The app-wide /auth/sign-out route keeps the global default deliberately.
 *
 * Both exported clear actions call this, in opposite orders for stated reasons:
 * clearIdentityAndSkip clears the entry first (its docblock), clearIdentity signs
 * out first (its body comment). `action` names the caller in the forensic emit.
 */
async function signOutThisDevice(
  showId: string,
  action: ClearAction,
): Promise<ClearIdentityResult> {
  // Each boundary is caught SEPARATELY and reported with its own `stage`.
  // Invariant 9 wants faults discriminable, and these three are not the same
  // event: a constructor throw means nothing was revoked, a signOut fault means
  // the session is probably still live, and a sweep failure means the session IS
  // already revoked and only a residual cookie remains. Collapsing them into one
  // catch — the first version — logged three materially different residual states
  // under one indistinguishable message.
  const fail = (stage: string, error: unknown): ClearIdentityResult => {
    // Deliberately NO redirect on any of these: redirecting would send the person
    // onward with state half-applied. Returning re-renders a gate, which is
    // itself the retry affordance — Mode B while the session survives, or the
    // first-contact welcome once revocation landed (see the `sweep` stage).
    log.error("picker sign-out failed", {
      source: `auth.picker.${action}`,
      code: "AUTH_SIGNOUT_FAILED",
      stage,
      showId,
      error,
    });
    // The forensic code rides the telemetry emit above, where the §12.4 producer
    // scan strips it (lib/messages/__internal__/stripLogEmissionCalls.ts). The
    // RETURNED code has to be a catalogued one: a `code:` literal in a returned
    // object reads as a user-facing §12.4 producer, and AUTH_SIGNOUT_FAILED is
    // deliberately forensic-only, with no catalog row and no crew copy.
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  };

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    // Nothing revoked: the env is misconfigured. Next render is still Mode B.
    return fail("client_construction", error);
  }

  // Returned error and thrown fault are DISTINCT stages. Invariant 9 requires the
  // two paths be distinguishable, and `if (error) throw error` collapsed them into
  // one telemetry shape — a gateway rejecting the revocation and the client
  // blowing up mid-call are different operational events.
  let returnedError: unknown;
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    returnedError = error;
  } catch (error) {
    // Revocation did not land: the foreign session survives, so the next render is
    // Mode B again. The picker entry is already gone, so nothing is exposed.
    return fail("sign_out_threw", error);
  }
  if (returnedError) return fail("sign_out_returned_error", returnedError);

  try {
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
  } catch (error) {
    // Revocation ALREADY LANDED here — only the belt-and-braces sweep failed. So
    // unlike the two stages above, the next render is not necessarily Mode B: if
    // the SSR adapter's own deletion succeeded, or once the access token expires,
    // the chain resolves to first-contact and the welcome gate's CTA reaches the
    // picker. Spec §4.3's matrix records both branches.
    return fail("residual_cookie_sweep", error);
  }

  return { ok: true };
}

export async function clearIdentityCore(input: ClearIdentityInput): Promise<ClearIdentityResult> {
  // no-telemetry: try/catch wrapper; PICKER_IDENTITY_CLEARED emit fires at the mutation boundary in clearIdentityCoreImpl
  if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("clearIdentityCore");
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
