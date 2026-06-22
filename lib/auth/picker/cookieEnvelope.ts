import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_COOKIE_VALUE_BYTES = 3800;
export const COOKIE_NAME = "__Host-fxav_picker";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAFE_T_MILLIS = Number.MAX_SAFE_INTEGER;

export type PickerEntry = { id: string; e: number; t: number };
export type PickerEnvelope = { v: 1; selections: Record<string, PickerEntry> };

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Buffer {
  const padLength = value.length % 4 === 0 ? 0 : 4 - (value.length % 4);
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength), "base64");
}

function hmac(payload: string, signingKey: string): string {
  return base64url(createHmac("sha256", Buffer.from(signingKey, "hex")).update(payload).digest());
}

function isValidEntry(value: unknown): value is PickerEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || !UUID_RE.test(entry.id)) return false;
  if (!Number.isInteger(entry.e) || (entry.e as number) < 0) return false;
  if (
    !Number.isInteger(entry.t) ||
    (entry.t as number) < 0 ||
    (entry.t as number) > MAX_SAFE_T_MILLIS
  ) {
    return false;
  }
  return true;
}

function isValidEnvelope(value: unknown): value is PickerEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const env = value as Record<string, unknown>;
  if (env.v !== 1) return false;
  if (typeof env.selections !== "object" || env.selections === null) return false;
  for (const [showId, entry] of Object.entries(env.selections as Record<string, unknown>)) {
    if (!UUID_RE.test(showId)) return false;
    if (!isValidEntry(entry)) return false;
  }
  return true;
}

export function encodePickerCookie(env: PickerEnvelope, signingKey: string): string {
  const working: PickerEnvelope = {
    v: 1,
    selections: Object.fromEntries(
      Object.entries(env.selections).map(([showId, entry]) => [showId, { ...entry }]),
    ),
  };
  let payload = JSON.stringify(working);

  while (
    `${COOKIE_NAME}=${base64url(Buffer.from(payload))}.${hmac(payload, signingKey)}`.length >
    MAX_COOKIE_VALUE_BYTES
  ) {
    const oldest = Object.entries(working.selections).sort(([, a], [, b]) => a.t - b.t)[0];
    if (!oldest) break;
    delete working.selections[oldest[0]];
    payload = JSON.stringify(working);
  }

  return `${base64url(Buffer.from(payload))}.${hmac(payload, signingKey)}`;
}

export function decodePickerCookie(
  raw: string | undefined,
  signingKey: string,
): PickerEnvelope | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  let payload: string;
  try {
    payload = fromBase64url(parts[0]!).toString("utf8");
  } catch {
    return null;
  }

  const expected = hmac(payload, signingKey);
  const provided = parts[1]!;
  if (expected.length !== provided.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) return null;
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  return isValidEnvelope(parsed) ? parsed : null;
}
