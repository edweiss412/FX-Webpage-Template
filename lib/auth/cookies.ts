import {
  SESSION_COOKIE_MAX_AGE_SEC,
  SESSION_COOKIE_NAME,
  UUID_RE,
} from "@/lib/auth/constants";

export { SESSION_COOKIE_MAX_AGE_SEC, SESSION_COOKIE_NAME };

export type SessionCookieEnvelope = {
  token: string;
  show_id: string;
};

export function setSessionCookie(
  value: string,
  opts: { maxAgeSec: number },
): string {
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAgeSec}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function encodeSessionCookieValue(input: SessionCookieEnvelope): string {
  if (!UUID_RE.test(input.token) || !UUID_RE.test(input.show_id)) {
    throw new Error("session cookie token and show_id must be UUIDs");
  }
  return encodeURIComponent(
    JSON.stringify({ v: 1, token: input.token, show_id: input.show_id }),
  );
}

export function decodeSessionCookieValue(
  raw: string | undefined,
): SessionCookieEnvelope | null {
  if (raw === undefined || raw.length === 0 || raw.length > 1024) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const envelope = parsed as Record<string, unknown>;
  const keys = Object.keys(envelope).sort();
  if (keys.join(",") !== "show_id,token,v") {
    return null;
  }
  if (envelope.v !== 1) {
    return null;
  }
  if (
    typeof envelope.token !== "string" ||
    typeof envelope.show_id !== "string" ||
    !UUID_RE.test(envelope.token) ||
    !UUID_RE.test(envelope.show_id)
  ) {
    return null;
  }

  return { token: envelope.token, show_id: envelope.show_id };
}
