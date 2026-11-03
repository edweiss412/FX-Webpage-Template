/**
 * lib/crew/contactHrefs.ts — the crew page's contact links: call, text and
 * email, each refused for a value that cannot be dialled or mailed.
 *
 * Moved out of components/crew/sections/crewRows.ts (which re-exports them) so
 * the client-reachable "All sections" peek can apply the Contacts section's
 * row rule without importing the roster body (PR B invariant-8 gate, row 9 and
 * row 13's peer).
 *
 * Pure and server-safe.
 */
import { digitsOnly } from "@/lib/format/phone";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/** The crew's call link: a `tel:` of the digits, none when the phone has none (phase 1 §4.16). */
export function crewTelHref(phone: string): string | null {
  const digits = digitsOnly(phone);
  return digits.length > 0 ? `tel:${digits}` : null;
}

/** The crew's text link, under the same digits gate as the call link (plan decision 8). */
export function crewSmsHref(phone: string): string | null {
  const digits = digitsOnly(phone);
  return digits.length > 0 ? `sms:${digits}` : null;
}

/** The crew's email link: none for a sentinel or a blank address. */
export function crewMailtoHref(email: string): string | null {
  return shouldHideGenericOptional(email) ? null : `mailto:${email}`;
}
