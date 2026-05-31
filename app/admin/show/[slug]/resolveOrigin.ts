// M12.2 Phase A Task 10 (spec §6 / R28) — canonical site-origin resolver.
//
// Standalone (no server-only deps) so BOTH the server CurrentShareLinkPanel
// AND the client RotateShareTokenButton can import it without pulling
// loadShowShareToken / the server Supabase client into the client bundle.
// Reads NEXT_PUBLIC_SITE_ORIGIN (build-inlined, client-safe). The active
// rotate-success crew URL MUST use this — never window.location.origin, which
// would copy a wrong-origin crew URL when rotating from an admin/internal host.
export function resolveOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_ORIGIN;
  if (!raw) return "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}
