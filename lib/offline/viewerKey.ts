/**
 * The opaque viewer key a saved copy carries (spec §4.3 `data-viewer`): it names
 * the crew member a copy was saved for without exposing the crew id, and the
 * status route (§4.5) and the offline report queue (§5.1) compare it to the key
 * of the identity the server resolves now.
 *
 * Keyed by the picker signing key under a fixed label (plan §1 item 1), so the
 * two uses of that key never produce the same MAC:
 * `subkey = HMAC-SHA256(pickerKey, "fxav-saved-copy-viewer-v1")`, then
 * `viewer = base64url(HMAC-SHA256(subkey, showId + ":" + crewMemberId))`.
 *
 * Server-only: never import this from the worker or a client component.
 */
import { createHmac } from "node:crypto";
import { pickerCookieSigningKey } from "@/lib/env/pickerCookieSigningKey";

const VIEWER_KEY_LABEL = "fxav-saved-copy-viewer-v1";

/** HMAC-SHA256 over `${showId}:${crewMemberId}`, base64url; null when the key is unavailable. */
export function viewerKey(showId: string, crewMemberId: string): string | null {
  let pickerKey: string;
  try {
    pickerKey = pickerCookieSigningKey();
  } catch {
    return null;
  }
  const subkey = createHmac("sha256", Buffer.from(pickerKey, "hex"))
    .update(VIEWER_KEY_LABEL)
    .digest();
  return createHmac("sha256", subkey).update(`${showId}:${crewMemberId}`).digest("base64url");
}
