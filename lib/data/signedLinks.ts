/**
 * Typed wrappers over the M9.5 signed-link admin RPCs.
 *
 * This module follows the M9 C9 adminEmails data-layer pattern:
 * Supabase call boundaries destructure `{ data, error }`, returned
 * and thrown faults become SignedLinksInfraError, and each RPC has an
 * explicit status whitelist.
 */

export class SignedLinksInfraError extends Error {
  readonly code = "SIGNED_LINKS_INFRA";

  constructor(message: string) {
    super(message);
    this.name = "SignedLinksInfraError";
  }
}

export type CrewAuthRowSnapshot = {
  current_token_version: number;
  max_issued_version: number;
  revoked_below_version: number;
};

export type IssueLinkOutcome =
  | { kind: "ok"; row: CrewAuthRowSnapshot }
  | { kind: "show_not_found" }
  | { kind: "crew_member_not_found" };

export type RevokeAllLinksOutcome =
  | { kind: "ok"; row: CrewAuthRowSnapshot }
  | { kind: "no_live_link" }
  | { kind: "show_not_found" }
  | { kind: "crew_member_not_found" };

async function wrapInfra<T>(label: string, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof SignedLinksInfraError) throw err;
    throw new SignedLinksInfraError(
      `${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

void wrapInfra;
