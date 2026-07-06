import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";

// Bell tier exclusion sets (spec §6.3). Passed INTO get_bell_feed_rows as
// p_excluded_codes so exclusion happens BEFORE the SQL caps (spec §6.1) —
// no SQL copy of the code lists to drift. Inbox-routed codes stay out of
// EVERY tier's bell (the needs-attention inbox owns them).
export function bellExcludedCodes(viewerIsDeveloper: boolean): string[] {
  return viewerIsDeveloper
    ? [...INBOX_ROUTED_CODES]
    : [...new Set([...HEALTH_CODES, ...INBOX_ROUTED_CODES])];
}
