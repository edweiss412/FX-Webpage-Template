import { SignJWT, jwtVerify } from "jose";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const LINK_JWT_ISSUER = "fxav-crew-pages";
const DEFAULT_EXPIRY_SECONDS = 90 * 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type LinkJwtInput = {
  showId: string;
  name: string;
  tokenVersion: number;
  displayName?: string;
  expiresInSec?: number;
};

export type LinkJwtPayload = {
  iss: "fxav-crew-pages";
  sub: string;
  showId: string;
  crewMemberKey: {
    showId: string;
    name: string;
  };
  displayName: string;
  tokenVersion: number;
  iat: number;
  exp: number;
};

export type SignedLinkJwt = {
  token: string;
  signingKeyId: string;
};

export type VerifiedLinkJwt = {
  payload: LinkJwtPayload;
  verifiedKid: string;
};

function getSigningSecret(): Uint8Array {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret) {
    throw new Error("JWT_SIGNING_SECRET must be set");
  }
  return new TextEncoder().encode(secret);
}

async function getActiveSigningKeyId(): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("active_signing_key_id")
    .eq("id", "default")
    .single();

  if (error) {
    throw new Error("Failed to read active signing key id");
  }
  if (
    !data ||
    typeof data.active_signing_key_id !== "string" ||
    data.active_signing_key_id.length === 0
  ) {
    throw new Error("Active signing key id is not configured");
  }
  return data.active_signing_key_id;
}

function assertValidInput(input: LinkJwtInput): void {
  if (!UUID_RE.test(input.showId)) {
    throw new Error("showId must be a UUID");
  }
  if (input.name.trim().length === 0) {
    throw new Error("name must be non-empty");
  }
  if (!Number.isInteger(input.tokenVersion) || input.tokenVersion <= 0) {
    throw new Error("tokenVersion must be a positive integer");
  }
  if (input.expiresInSec !== undefined && !Number.isInteger(input.expiresInSec)) {
    throw new Error("expiresInSec must be an integer");
  }
}

function assertLinkJwtPayload(payload: unknown): asserts payload is LinkJwtPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Invalid signed-link JWT payload");
  }

  const p = payload as Partial<LinkJwtPayload>;
  if (p.iss !== LINK_JWT_ISSUER) {
    throw new Error("Invalid signed-link JWT issuer");
  }
  if (typeof p.showId !== "string" || !UUID_RE.test(p.showId)) {
    throw new Error("Invalid signed-link JWT showId");
  }
  if (
    typeof p.crewMemberKey !== "object" ||
    p.crewMemberKey === null ||
    Array.isArray(p.crewMemberKey) ||
    p.crewMemberKey.showId !== p.showId ||
    typeof p.crewMemberKey.name !== "string" ||
    p.crewMemberKey.name.trim().length === 0
  ) {
    throw new Error("Invalid signed-link JWT crewMemberKey");
  }
  if (p.sub !== `crew_member:${p.showId}:${p.crewMemberKey.name}`) {
    throw new Error("Invalid signed-link JWT subject");
  }
  const tokenVersion = p.tokenVersion;
  if (
    typeof p.displayName !== "string" ||
    tokenVersion === undefined ||
    !Number.isInteger(tokenVersion) ||
    tokenVersion <= 0 ||
    !Number.isInteger(p.iat) ||
    !Number.isInteger(p.exp)
  ) {
    throw new Error("Invalid signed-link JWT claims");
  }
}

export async function signLinkJwt(input: LinkJwtInput): Promise<SignedLinkJwt> {
  assertValidInput(input);

  const signingKeyId = await getActiveSigningKeyId();
  const now = Math.floor(Date.now() / 1000);
  const expiresInSec = input.expiresInSec ?? DEFAULT_EXPIRY_SECONDS;
  const displayName = input.displayName ?? input.name;
  const subject = `crew_member:${input.showId}:${input.name}`;

  const token = await new SignJWT({
    showId: input.showId,
    crewMemberKey: { showId: input.showId, name: input.name },
    displayName,
    tokenVersion: input.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256", kid: signingKeyId })
    .setIssuer(LINK_JWT_ISSUER)
    .setSubject(subject)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSec)
    .sign(getSigningSecret());

  return { token, signingKeyId };
}

export async function verifyLinkJwt(token: string): Promise<VerifiedLinkJwt> {
  const { payload, protectedHeader } = await jwtVerify(token, getSigningSecret(), {
    issuer: LINK_JWT_ISSUER,
  });
  const verifiedKid = protectedHeader.kid;
  if (typeof verifiedKid !== "string" || verifiedKid.length === 0) {
    throw new Error("Signed-link JWT is missing kid");
  }

  assertLinkJwtPayload(payload);
  return { payload, verifiedKid };
}

/**
 * Distinguish JWT validation failures (signature mismatch, expired token,
 * malformed claims — expected for leaked or tampered tokens) from JWT
 * verifier infrastructure/configuration failures (missing
 * `JWT_SIGNING_SECRET`, signing-key fetch failure, etc.).
 *
 * Validation failures should map to the existing auth-failure response
 * (e.g. middleware's `LEAKED_LINK_DETECTED` 410 or redeem-link's
 * `SESSION_NOT_FOUND` 401). Infra failures must NOT masquerade as
 * "successful revocation" or "invalid link" — operators need a 503/500
 * signal that the verifier itself is broken. R16 #2 extracts this
 * helper from middleware.ts (R13 #3) so redeem-link and any future
 * verifyLinkJwt caller can apply the same distinction consistently.
 */
export function isJwtInfraError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  return (
    msg.includes("JWT_SIGNING_SECRET") ||
    msg.includes("active signing key") ||
    msg.includes("Failed to read")
  );
}
