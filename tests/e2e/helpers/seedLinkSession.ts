/**
 * tests/e2e/helpers/seedLinkSession.ts (M5 §B Task 5.7 — auth-chain regression suite)
 *
 * Direct service-role INSERT into `link_sessions` plus an encoded session
 * envelope value the test harness can drop straight onto the Playwright
 * BrowserContext. Bypasses the full `/api/auth/redeem-link` ceremony — that
 * end-to-end flow is already covered by `tests/e2e/redeem-link.spec.ts`.
 *
 * Why bypass: Task 5.7's chain-consumer tests assert behavior of the
 * /show/[slug] page chain when various cookie states are present; they don't
 * need to re-verify redemption. Using the redemption endpoint here would
 * couple Task 5.7's tests to Task 5.4's bootstrap/nonce surface, making
 * unrelated regressions harder to localize.
 *
 * Pre-conditions the caller MUST satisfy before calling this helper:
 *   - The show row identified by `showId` exists.
 *   - The crew_members row identified by `crewMemberId` exists for that show.
 *   - `crew_member_auth` row exists for (showId, crew_name) when the caller
 *     wants the full validateLinkSession 12-step pass.
 *
 * The cookie value is deterministic (UUID-based opaque token), so retests
 * against the same fixture are stable.
 */
import { randomUUID } from "node:crypto";

import { encodeSessionCookieValue } from "@/lib/auth/cookies";
import { admin } from "./supabaseAdmin";

export type SeedLinkSessionInput = {
  showId: string;
  crewMemberId: string;
  /**
   * JWT token version this session pretends to have been minted from. Must
   * match `crew_member_auth.current_token_version` for the validator to pass
   * the version-mismatch step. Default: 1 (matches the redeem-link spec
   * fixture default).
   */
  jwtTokenVersion?: number;
  /**
   * Signing key id pinned at session-mint time. Must match
   * `app_settings.active_signing_key_id` for the validator to pass the
   * key-rotation step. Default: 'k1' (matches the redeem-link spec
   * fixture default).
   */
  signingKeyId?: string;
  /**
   * Absolute expiry. Must be strictly in the future or the validator
   * triggers SESSION_ABSOLUTE_TIMEOUT. Default: now + 12 hours.
   */
  expiresAt?: Date;
  /**
   * Last-active timestamp. Must be within SESSION_IDLE_TIMEOUT_SEC (15 min)
   * of now or the validator triggers SESSION_IDLE_TIMEOUT. Default: now.
   */
  lastActiveAt?: Date;
};

export type SeedLinkSessionOutput = {
  /** Opaque server-side session token (UUID). */
  token: string;
  /** URL-encoded JSON envelope ready to drop on a Playwright cookie. */
  cookieValue: string;
};

export async function seedLinkSession(input: SeedLinkSessionInput): Promise<SeedLinkSessionOutput> {
  const token = randomUUID();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 12 * 60 * 60 * 1000);
  const lastActiveAt = input.lastActiveAt ?? new Date();
  const jwtTokenVersion = input.jwtTokenVersion ?? 1;
  const signingKeyId = input.signingKeyId ?? "k1";

  const insert = await admin.from("link_sessions").insert({
    token,
    show_id: input.showId,
    crew_member_id: input.crewMemberId,
    jwt_token_version: jwtTokenVersion,
    signing_key_id: signingKeyId,
    expires_at: expiresAt.toISOString(),
    last_active_at: lastActiveAt.toISOString(),
  });
  if (insert.error) {
    throw new Error(`seedLinkSession insert failed: ${insert.error.message}`);
  }

  const cookieValue = encodeSessionCookieValue({
    token,
    show_id: input.showId,
  });

  return { token, cookieValue };
}
