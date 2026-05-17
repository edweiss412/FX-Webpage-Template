// M9 final-review R15: target `/admin` (now a real production-safe
// landing page at app/admin/page.tsx). R14 tried `/admin/dev` but
// that route is build-gated out of production via
// scripts/with-admin-dev-flag.mjs — same 404 in prod. The new
// `/admin` landing is always built and lists the available admin
// sub-pages.
export const DEFAULT_AUTH_NEXT_PATH = "/admin";

export type ValidateNextParamOutcome =
  | { ok: true; path: string }
  | { ok: false; path: typeof DEFAULT_AUTH_NEXT_PATH; code: "OAUTH_REDIRECT_INVALID" };

// /admin restored to the allowlist after R15 created the landing
// page. /me retains its optional-sub-path form because `/me` IS a
// real route (`app/me/page.tsx`).
const ALLOWED_NEXT_RE = /^\/(show\/[a-z0-9-]+|admin(\/.*)?|me(\/.*)?)$/;
const BOOTSTRAP_SURFACE_RE = /^\/show\/[a-z0-9-]+\/p$/;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

function configuredOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function validateNextParamDetailed(raw: unknown): ValidateNextParamOutcome {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" };
  }

  const value = raw.trim();
  if (CONTROL_CHAR_RE.test(raw) || value.includes("\\") || /%2e%2e/i.test(value)) {
    return { ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" };
  }

  const origin = configuredOrigin();
  let parsed: URL;
  try {
    parsed = new URL(value, origin);
  } catch {
    return { ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" };
  }

  if (parsed.origin !== origin) {
    return { ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" };
  }

  const path = parsed.pathname;
  if (BOOTSTRAP_SURFACE_RE.test(path) || !ALLOWED_NEXT_RE.test(path)) {
    return { ok: false, path: DEFAULT_AUTH_NEXT_PATH, code: "OAUTH_REDIRECT_INVALID" };
  }

  return { ok: true, path };
}

export function validateNextParam(raw: unknown): string {
  return validateNextParamDetailed(raw).path;
}
