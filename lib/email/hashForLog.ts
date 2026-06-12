import { createHash, createHmac } from "node:crypto";

// Single validated process.env read site (spec §4.3 R23/R24): every consumer of
// the pepper — hashForLog and hmacWithHashForLogPepper — goes through this
// module-private constant. No other module reads HASH_FOR_LOG_PEPPER.
const PEPPER = process.env.HASH_FOR_LOG_PEPPER ?? "";

if (PEPPER.length < 32) {
  throw new Error(
    "HASH_FOR_LOG_PEPPER env var must be set to a 32+ character value. " +
      "This is required for R41 admin_alerts PII-hash contract. See " +
      "lib/email/hashForLog.ts and AGENTS.md invariant 9 + spec §8.4.",
  );
}

export function hashForLog(canonicalEmail: string): string {
  return createHash("sha256").update(PEPPER).update(canonicalEmail).digest("hex");
}

/**
 * Server-only HMAC-SHA256 keyed by the validated module-private pepper
 * (M12.13 spec §4.3 R24). The module-load gate above makes a missing/short
 * pepper fail-closed at boot; callers (e.g. lib/sync/unpublishBinding.ts)
 * must use this seam rather than reading process.env themselves.
 */
export function hmacWithHashForLogPepper(input: string): string {
  return createHmac("sha256", PEPPER).update(input).digest("hex");
}
