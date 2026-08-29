/**
 * The loopback DSN a Playwright `webServer` hands its app server, and the only ambient value
 * allowed to replace it.
 *
 * `.env.local` points TEST_DATABASE_URL at the REMOTE validation pooler on purpose, and Next
 * loads `.env.local` INSIDE the server Playwright boots, so every webServer pins both DB names
 * to a local value. Resolving that pin from a bare `process.env.DATABASE_URL` reopened the same
 * hole one variable to the left: an ambient remote DATABASE_URL propagated straight through the
 * pin to the app server. So the ambient value is honoured ONLY when it is itself loopback,
 * which keeps the developer escape hatch (a custom local port) without keeping the hazard.
 */
export const LOOPBACK_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Loopback host names, compared case-insensitively and with IPv6 brackets stripped. */
function isLoopbackHost(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return bare === "127.0.0.1" || bare === "localhost" || bare === "::1";
}

/**
 * `process.env.DATABASE_URL` when it points at loopback, else the loopback default. An
 * unparseable value is treated as absent rather than trusted.
 */
export function localDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (!configured) return LOOPBACK_DSN;
  try {
    return isLoopbackHost(new URL(configured).hostname) ? configured : LOOPBACK_DSN;
  } catch {
    return LOOPBACK_DSN;
  }
}
