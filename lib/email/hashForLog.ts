import { createHash } from "node:crypto";

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
