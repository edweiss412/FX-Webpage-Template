"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  decodePickerCookie,
  encodePickerCookie,
} from "@/lib/auth/picker/cookieEnvelope";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const MAX_AGE_SEC = 7_776_000;

export type CleanupStaleEntryInput = {
  slug: string;
  shareToken: string;
  showId: string;
  expectedEpoch: number;
  expectedCrewMemberId: string;
};

type CleanupStaleEntryResult =
  | { ok: true; action: "cleaned" | "noop" }
  | { ok: false; code: string };

export async function cleanupStaleEntry(formData: FormData): Promise<CleanupStaleEntryResult> {
  const slug = formData.get("slug");
  const shareToken = formData.get("shareToken");
  const showId = formData.get("showId");
  const expectedEpochRaw = formData.get("expectedEpoch");
  const expectedCrewMemberId = formData.get("expectedCrewMemberId");
  if (
    typeof slug !== "string" ||
    typeof shareToken !== "string" ||
    typeof showId !== "string" ||
    typeof expectedEpochRaw !== "string" ||
    typeof expectedCrewMemberId !== "string"
  ) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }
  const expectedEpoch = Number.parseInt(expectedEpochRaw, 10);
  if (!Number.isInteger(expectedEpoch) || expectedEpoch < 0) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }
  return cleanupStaleEntryCore({ slug, shareToken, showId, expectedEpoch, expectedCrewMemberId });
}

export async function cleanupStaleEntryCore(
  input: CleanupStaleEntryInput,
): Promise<CleanupStaleEntryResult> {
  try {
    return await cleanupStaleEntryCoreImpl(input);
  } catch {
    return { ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" };
  }
}

async function cleanupStaleEntryCoreImpl(
  input: CleanupStaleEntryInput,
): Promise<CleanupStaleEntryResult> {
  if (
    !SLUG_RE.test(input.slug) ||
    !TOKEN_RE.test(input.shareToken) ||
    !UUID_RE.test(input.showId) ||
    !UUID_RE.test(input.expectedCrewMemberId) ||
    !Number.isInteger(input.expectedEpoch) ||
    input.expectedEpoch < 0
  ) {
    return { ok: false, code: "PICKER_INVALID_INPUT" };
  }

  const key = pickerCookieSigningKey();
  const cookieStore = await cookies();
  const env = decodePickerCookie(cookieStore.get(COOKIE_NAME)?.value, key);
  if (!env) return { ok: true, action: "noop" };

  const entry = env.selections[input.showId];
  if (!entry) return { ok: true, action: "noop" };
  if (entry.e !== input.expectedEpoch || entry.id !== input.expectedCrewMemberId) {
    return { ok: true, action: "noop" };
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

  try {
    const { upsertAdminAlert } = await import("@/lib/adminAlerts/upsertAdminAlert");
    await upsertAdminAlert({
      showId: input.showId,
      code: "PICKER_SELECTION_RACE" as never,
      context: {
        show_id: input.showId,
        stale_epoch: input.expectedEpoch,
        stale_crew_member_id: input.expectedCrewMemberId,
      },
    });
  } catch {
    // Best-effort observational alert; cleanup itself has already succeeded.
  }

  return { ok: true, action: "cleaned" };
}
