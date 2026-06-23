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
import { buildShowReturnUrl } from "@/lib/crew/buildShowReturnUrl";

// not-subject-to-revalidate (nav-perf tag-caching Task 9): clearing the identity only deletes the
// picker COOKIE — it writes NO database rows at all, let alone getShowForViewer DATA. Nothing to
// revalidate; the LIVE viewerVersionToken handles any per-viewer freshness.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
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
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  return clearIdentityCore(input);
}

export async function clearIdentityAndSkip(formData: FormData): Promise<ClearIdentityResult> {
  const input = parseFormData(formData);
  if (!input) return { ok: false, code: "PICKER_INVALID_INPUT" };
  const result = await clearIdentityCore(input);
  if (!result.ok) return result;
  redirect(buildShowReturnUrl(input.slug, input.shareToken, { s: input.s, gate: "skip" }));
}

export async function clearIdentityCore(input: ClearIdentityInput): Promise<ClearIdentityResult> {
  try {
    return await clearIdentityCoreImpl(input);
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}

async function clearIdentityCoreImpl(input: ClearIdentityInput): Promise<ClearIdentityResult> {
  if (
    !SLUG_RE.test(input.slug) ||
    !TOKEN_RE.test(input.shareToken) ||
    !UUID_RE.test(input.showId)
  ) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }

  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const env = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  if (!env) {
    revalidatePath(`/show/${input.slug}/${input.shareToken}`);
    return { ok: true };
  }

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
  return { ok: true };
}
