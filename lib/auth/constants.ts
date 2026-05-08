export const SESSION_COOKIE_NAME = "__Host-fxav_session";
export const BOOTSTRAP_COOKIE_NAME = "__Host-fxav_bootstrap_v";

export const SESSION_COOKIE_MAX_AGE_SEC = 12 * 60 * 60;
export const SESSION_IDLE_TIMEOUT_SEC = 15 * 60;
export const BOOTSTRAP_NONCE_MAX_AGE_SEC = 30;
export const BOOTSTRAP_COOKIE_ENTRY_LIMIT = 5;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type AuthFailureCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_ABSOLUTE_TIMEOUT"
  | "SESSION_IDLE_TIMEOUT"
  | "LINK_SESSION_KEY_ROTATED"
  | "LINK_NO_CREW_MATCH"
  | "LINK_VERSION_MISMATCH"
  | "LINK_REVOKED_FLOOR"
  | "LINK_REVOKED_SURGICAL"
  | "GOOGLE_NO_CREW_MATCH"
  | "AMBIGUOUS_EMAIL_BINDING"
  | "ADMIN_SESSION_LOOKUP_FAILED";

export type AuthFailure = {
  status: 401 | 403 | 410 | 500;
  code: AuthFailureCode;
};
