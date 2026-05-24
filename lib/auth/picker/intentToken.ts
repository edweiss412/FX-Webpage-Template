import { createHmac, timingSafeEqual } from "node:crypto";

export type PickerIntentPayload = {
  slug: string;
  shareToken: string;
  exp: number;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function hmac(payload: string, signingKey: string): string {
  return createHmac("sha256", Buffer.from(signingKey, "hex")).update(payload).digest("base64url");
}

function isPayload(value: unknown): value is PickerIntentPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.slug === "string" &&
    SLUG_RE.test(candidate.slug) &&
    typeof candidate.shareToken === "string" &&
    TOKEN_RE.test(candidate.shareToken) &&
    Number.isInteger(candidate.exp)
  );
}

export function signPickerIntent(payload: PickerIntentPayload, signingKey: string): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body, signingKey)}`;
}

export function verifyPickerIntent(
  raw: string | null,
  signingKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): PickerIntentPayload | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = hmac(body, signingKey);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64url(body));
  } catch {
    return null;
  }

  if (!isPayload(parsed)) return null;
  if (parsed.exp < nowSeconds) return null;
  return parsed;
}
