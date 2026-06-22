/**
 * tests/e2e/helpers/seedPickerCookie.ts (M11.5-PLAYWRIGHT-HELPERS)
 *
 * Writes a `__Host-fxav_picker` cookie onto a Playwright BrowserContext so a
 * test can stage a KNOWN picker selection (fresh, stale-epoch, or
 * mismatched-identity) before navigating. The server reads + re-signs this
 * exact envelope (lib/auth/picker/cookieEnvelope.ts), so the helper signs with
 * the SAME PICKER_COOKIE_SIGNING_KEY the server uses (process.env). If the key
 * is absent / malformed the helper throws — a cookie signed with the wrong key
 * decodes to null server-side (decodePickerCookie HMAC mismatch) and the test
 * would silently observe "no_selection" instead of the staged state.
 *
 * Cookie attributes mirror the canonical server writer
 * (lib/auth/picker/selectIdentity.ts:136-142): httpOnly, secure, sameSite=Lax.
 * We pass `url` (NOT `domain`+`path`) — Playwright derives the path from the
 * url and REJECTS passing both `url` and `path` ("Cookie should have either url
 * or path"). The url's path is `/`, which is what the `__Host-` prefix requires.
 * Chromium treats http://127.0.0.1 as a secure context (localhost exemption) so
 * the secure cookie still rides on plain-http e2e requests.
 */
import type { BrowserContext } from "@playwright/test";
import {
  COOKIE_NAME,
  encodePickerCookie,
  type PickerEnvelope,
} from "@/lib/auth/picker/cookieEnvelope";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";

export type PickerCookieSelection = {
  showId: string;
  /** crew_members.id the cookie remembers for this show. */
  crewMemberId: string;
  /** picker_epoch the pick was made under (resolver compares entry.e === show.picker_epoch). */
  epoch: number;
  /** observed-at millis. Defaults to now(); set BEFORE a claim timestamp to trigger claimed_after_pick. */
  pickedAtMillis?: number;
};

export type SeedPickerCookieOptions = {
  /**
   * Cookie host. Must match the host the test navigates to (the picker chain
   * reads the cookie off the request). Defaults to 127.0.0.1 (the mobile-safari
   * project baseURL). Playwright requires url OR domain+path on addCookies.
   */
  url?: string;
};

/**
 * Build a signed `__Host-fxav_picker` value from one or more selections. The
 * exported encode primitive is the same one the server mints with, so a
 * round-trip through decodePickerCookie validates.
 */
export function buildPickerCookieValue(selections: PickerCookieSelection[]): string {
  const key = pickerCookieSigningKey();
  const envelope: PickerEnvelope = { v: 1, selections: {} };
  for (const sel of selections) {
    envelope.selections[sel.showId] = {
      id: sel.crewMemberId,
      e: sel.epoch,
      t: sel.pickedAtMillis ?? Date.now(),
    };
  }
  return encodePickerCookie(envelope, key);
}

export async function seedPickerCookie(
  context: BrowserContext,
  selections: PickerCookieSelection[],
  options: SeedPickerCookieOptions = {},
): Promise<void> {
  const url = options.url ?? "http://127.0.0.1:3000";
  const value = buildPickerCookieValue(selections);
  await context.addCookies([
    {
      name: COOKIE_NAME,
      value,
      url,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}
