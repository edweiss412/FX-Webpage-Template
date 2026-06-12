// lib/sync/unpublishBinding.ts — M12.13 peppered, capability-scoped recipient
// binding for the emailed unpublish link (spec §4.3 R6/R7/R10, §5).
//
// All peppered crypto goes through the validated seam exported by
// lib/email/hashForLog.ts (R23/R24): this module never reads the env itself.
// The ONLY direct crypto here is mintIdFor's plain sha256 of the TOKEN (not
// the pepper) — a one-way mint identity safe to persist in email_deliveries.
import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalize } from "@/lib/email/canonicalize";
import { hmacWithHashForLogPepper } from "@/lib/email/hashForLog";

/** sha256(token) lowercase hex, first 16 chars — exact per mint (spec §4.1). */
export function mintIdFor(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * r = HMAC-SHA256(pepper, canonical email | show_id | mintId) hex prefix 16.
 * Single-capability credential: dies with the token (consume/expiry/re-mint)
 * and is scoped to one show + one recipient (R10). The join character `|`
 * appears in none of the three components (emails/uuids/hex), so the tuple
 * encoding is unambiguous.
 *
 * Throws if the email canonicalizes to null — callers pass recipient emails
 * from admin_emails (canonical by schema CHECK) or the delivery path's
 * already-canonicalized recipient; a null here is a programmer error
 * upstream, never a request-shaped condition.
 */
export function recipientBindingFor(email: string, showId: string, mintId: string): string {
  const canonical = canonicalize(email);
  if (canonical === null) {
    throw new Error(
      "recipientBindingFor: email canonicalized to null (empty/whitespace) — " +
        "programmer error upstream; admin_emails rows are canonical by schema CHECK.",
    );
  }
  return hmacWithHashForLogPepper(`${canonical}|${showId}|${mintId}`).slice(0, 16);
}

/** Constant-shape comparison of two binding strings (fixed 16-hex shape). */
function bindingEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * True iff some provided (unrevoked) admin row's binding for this show+mint
 * equals `r`. Callers supply rows from `admin_emails where revoked_at is null`
 * — revocation retracts the emailed capability by construction (spec §5).
 */
export function bindingMatchesActiveAdmin(
  rows: ReadonlyArray<{ email: string }>,
  r: string,
  showId: string,
  mintId: string,
): boolean {
  return rows.some((row) => bindingEquals(recipientBindingFor(row.email, showId, mintId), r));
}
