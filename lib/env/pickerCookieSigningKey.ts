const KEY_RE = /^[0-9a-f]{64}$/;

let cached: string | null = null;

export function pickerCookieSigningKey(): string {
  if (cached) return cached;
  const raw = process.env.PICKER_COOKIE_SIGNING_KEY;
  if (!raw) {
    throw new Error("PICKER_COOKIE_SIGNING_KEY is unset; server cannot mint picker cookies");
  }
  if (!KEY_RE.test(raw)) {
    throw new Error("PICKER_COOKIE_SIGNING_KEY must be 64 hex chars (32 bytes)");
  }
  cached = raw;
  return raw;
}
