import { NextResponse } from "next/server";

/**
 * lib/http/hostRelativeRedirect.ts
 *
 * Emits a redirect whose `Location` is host-relative, so the browser resolves
 * it against the address it actually used.
 *
 * Why this exists: `NextResponse.redirect(new URL(path, request.url))` resolves
 * `path` against `request.url` and emits an ABSOLUTE Location. `request.url`'s
 * host is whatever Next reports rather than what the client typed, so the
 * response could redirect to a different spelling of the same origin — and
 * because cookies are keyed by host, a browser that saved its auth cookie under
 * 127.0.0.1 does not send it to localhost. The next request looks
 * unauthenticated. A relative Location (legal per RFC 7231 §7.1.2) cannot flip
 * the host at all.
 */
export class InvalidRelativeRedirectPathError extends Error {}

// Exactly the set Next itself treats as a redirect — see REDIRECTS in
// next/dist/esm/server/web/spec-extension/response.js. A 300/304/399 carries a
// Location that browsers do not follow, so a helper named "redirect" must not
// mint one.
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function hostRelativeRedirect(path: string, status = 302): NextResponse {
  if (typeof path !== "string" || path.length === 0) {
    throw new InvalidRelativeRedirectPathError("path must be a non-empty string");
  }
  // Exactly one leading slash: `//host` is protocol-relative and would leave the
  // origin entirely, which is the open-redirect shape this guard exists to stop.
  if (path[0] !== "/" || path[1] === "/") {
    throw new InvalidRelativeRedirectPathError("path must start with exactly one slash");
  }
  if (path.includes("\\") || CONTROL_CHARS.test(path)) {
    throw new InvalidRelativeRedirectPathError("path carries an illegal character");
  }
  if (!REDIRECT_STATUSES.has(status)) {
    throw new InvalidRelativeRedirectPathError(`status is not a redirect: ${String(status)}`);
  }
  // The guard is a tripwire, not a fallback: every call site passes either a
  // string literal or validateNextParamDetailed output, so a throw here means a
  // validation regression upstream that a substituted destination would hide.
  return new NextResponse(null, { status, headers: { Location: path } });
}
