import { createHmac, timingSafeEqual } from "node:crypto";

import { BOOTSTRAP_COOKIE_ENTRY_LIMIT } from "@/lib/auth/constants";

export type BootstrapCookieEntry = {
  nonce_hash: string;
  show_id: string;
  issued_at: string;
  signing_key_id: string;
};

type BootstrapCookieEnvelope = {
  v: 1;
  entries: BootstrapCookieEntry[];
  sig: string;
};

function bootstrapCookieSecret(): string {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret) {
    throw new Error("JWT_SIGNING_SECRET must be set");
  }
  return secret;
}

export function assertBootstrapCookieSigningConfigured(): void {
  void bootstrapCookieSecret();
}

function signingPayload(entries: BootstrapCookieEntry[]): string {
  return `fxav-bootstrap-cookie:v1:${JSON.stringify(entries)}`;
}

function signatureFor(entries: BootstrapCookieEntry[]): string {
  return createHmac("sha256", bootstrapCookieSecret())
    .update(signingPayload(entries))
    .digest("base64url");
}

function isEntry(value: unknown): value is BootstrapCookieEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.nonce_hash === "string" &&
    typeof entry.show_id === "string" &&
    typeof entry.issued_at === "string" &&
    typeof entry.signing_key_id === "string" &&
    Object.keys(entry).every((key) =>
      ["nonce_hash", "show_id", "issued_at", "signing_key_id"].includes(key),
    )
  );
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function encodeBootstrapCookieEntries(
  entries: BootstrapCookieEntry[],
): string {
  const capped = entries.filter(isEntry).slice(-BOOTSTRAP_COOKIE_ENTRY_LIMIT);
  const envelope: BootstrapCookieEnvelope = {
    v: 1,
    entries: capped,
    sig: signatureFor(capped),
  };
  return JSON.stringify(envelope);
}

export function decodeBootstrapCookieEntries(
  raw: string | undefined,
): BootstrapCookieEntry[] {
  if (!raw) return [];

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [];
  }
  const envelope = parsed as Partial<BootstrapCookieEnvelope>;
  if (
    envelope.v !== 1 ||
    !Array.isArray(envelope.entries) ||
    typeof envelope.sig !== "string" ||
    !Object.keys(envelope).every((key) => ["v", "entries", "sig"].includes(key))
  ) {
    return [];
  }

  if (
    envelope.entries.length > BOOTSTRAP_COOKIE_ENTRY_LIMIT ||
    !envelope.entries.every(isEntry)
  ) {
    return [];
  }

  const expected = signatureFor(envelope.entries);
  if (!timingSafeEqualString(envelope.sig, expected)) {
    return [];
  }

  return envelope.entries;
}
