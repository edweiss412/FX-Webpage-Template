// M9 final-review R15: target `/admin` (now a real production-safe
// landing page at app/admin/page.tsx). R14 tried `/admin/dev` but
// that route is build-gated out of production via
// scripts/with-admin-dev-flag.mjs — same 404 in prod. The new
// `/admin` landing is always built and lists the available admin
// sub-pages.
import { ALLOWED_GATE_VALUES, BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";

export const DEFAULT_AUTH_NEXT_PATH = "/admin";

export type ValidateNextParamOutcome =
  | { ok: true; path: string }
  | { ok: false; path: typeof DEFAULT_AUTH_NEXT_PATH; code: "OAUTH_REDIRECT_INVALID" };

// R41 P-R12: crew next targets must be tokenized share-link URLs.
// Slug-only `/show/<slug>` and legacy `/show/<slug>/p` are rejected.
// /admin and /me remain valid OAuth return targets.
const ALLOWED_NEXT_RE = /^\/(show\/[a-z0-9-]+\/[0-9a-f]{64}|admin(\/.*)?|me(\/.*)?)$/;
// Task 12 (R4-HIGH-1): on a TOKENIZED crew route ONLY, the validator
// re-attaches the allow-listed `s` + `gate` query params (and nothing else)
// so a deep-linked sign-in `?next=/show/<slug>/<token>?s=venue` survives the
// OAuth round-trip. This is the single relaxation; every other path still
// returns the bare pathname (query stripped). The two allow-lists are the
// single source of truth in resolveActiveSection.ts.
const TOKENIZED_SHOW_RE = /^\/show\/[a-z0-9-]+\/[0-9a-f]{64}$/;
const ALLOWED_NEXT_SECTION_VALUES: ReadonlySet<string> = new Set<string>([
  ...BASE_SECTION_IDS,
  "budget",
]);
const ALLOWED_NEXT_GATE_VALUES: ReadonlySet<string> = new Set<string>(ALLOWED_GATE_VALUES);
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

  // Task 12 (R4-HIGH-1): on a tokenized crew route, re-attach ONLY the
  // allow-listed `s`/`gate` query params (drop everything else). All other
  // allowed paths (/admin, /me) keep the existing strip-the-query posture.
  if (TOKENIZED_SHOW_RE.test(path)) {
    const reattached: string[] = [];
    const s = parsed.searchParams.get("s");
    if (s !== null && ALLOWED_NEXT_SECTION_VALUES.has(s)) {
      reattached.push(`s=${s}`);
    }
    const gate = parsed.searchParams.get("gate");
    if (gate !== null && ALLOWED_NEXT_GATE_VALUES.has(gate)) {
      reattached.push(`gate=${gate}`);
    }
    if (reattached.length > 0) {
      return { ok: true, path: `${path}?${reattached.join("&")}` };
    }
  }

  return { ok: true, path };
}

export function validateNextParam(raw: unknown): string {
  return validateNextParamDetailed(raw).path;
}
