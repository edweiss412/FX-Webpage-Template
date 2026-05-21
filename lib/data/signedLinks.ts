/**
 * Typed wrappers over the M9.5 signed-link admin RPCs.
 *
 * This module follows the M9 C9 adminEmails data-layer pattern:
 * Supabase call boundaries destructure `{ data, error }`, returned
 * and thrown faults become SignedLinksInfraError, and each RPC has an
 * explicit status whitelist.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function revokeAllLinks(opts: {
  showId: string;
  crewName: string;
}): Promise<RevokeAllLinksOutcome> {
  return wrapInfra("revokeAllLinks", async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("revoke_all_links_rpc", {
      p_show_id: opts.showId,
      p_crew_name: opts.crewName,
    });
    if (error) {
      throw new SignedLinksInfraError(`revokeAllLinks.rpc: ${error.message}`);
    }
    return translateRevokeResult(data);
  });
}

type RpcEnvelope = {
  status?: unknown;
  row?: unknown;
};

function translateRevokeResult(data: unknown): RevokeAllLinksOutcome {
  const env = readEnvelope("revokeAllLinks", data);

  switch (env.status) {
    case "ok":
      return { kind: "ok", row: readRowSnapshot("revokeAllLinks", env.row) };
    case "no_live_link":
      return { kind: "no_live_link" };
    case "show_not_found":
      return { kind: "show_not_found" };
    case "crew_member_not_found":
      return { kind: "crew_member_not_found" };
    default:
      throw new SignedLinksInfraError(
        `revokeAllLinks: unknown status from RPC: ${env.status}`,
      );
  }
}

function readEnvelope(label: string, data: unknown): { status: string; row?: unknown } {
  if (!data || typeof data !== "object") {
    throw new SignedLinksInfraError(
      `${label}: malformed RPC payload: ${JSON.stringify(data)}`,
    );
  }
  const env = data as RpcEnvelope;
  if (typeof env.status !== "string") {
    throw new SignedLinksInfraError(
      `${label}: malformed RPC status: ${JSON.stringify(env.status)}`,
    );
  }
  return { status: env.status, row: env.row };
}

function readRowSnapshot(label: string, row: unknown): CrewAuthRowSnapshot {
  if (!row || typeof row !== "object") {
    throw new SignedLinksInfraError(`${label}: ok status missing row payload`);
  }
  const candidate = row as Partial<Record<keyof CrewAuthRowSnapshot, unknown>>;
  if (
    typeof candidate.current_token_version !== "number" ||
    typeof candidate.max_issued_version !== "number" ||
    typeof candidate.revoked_below_version !== "number"
  ) {
    throw new SignedLinksInfraError(`${label}: malformed row payload`);
  }
  return {
    current_token_version: candidate.current_token_version,
    max_issued_version: candidate.max_issued_version,
    revoked_below_version: candidate.revoked_below_version,
  };
}

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
