// M12.2 Phase A Task 10 (spec §6 / R28) — canonical site-origin resolver.
//
// Standalone (no server-only deps) so a CLIENT component can import it without
// pulling loadShowShareToken / the server Supabase client into the client
// bundle. Its only consumer today is components/admin/showpage/ShareHub.tsx;
// the original pair (server CurrentShareLinkPanel + client
// RotateShareTokenButton) is gone with the share-hub consolidation, but the
// no-server-deps constraint is exactly why the hub can still use it.
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
