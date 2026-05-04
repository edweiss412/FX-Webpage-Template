/**
 * components/admin/AlertBanner.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Server Component. Renders the topmost unresolved row from
 * `public.admin_alerts` (spec §4.6) using <ErrorExplainer surface="admin"
 * helpfulContext />, with a click-through "Resolve" form bound to
 * `resolveAdminAlertFormAction`.
 *
 * Mounted by `app/admin/layout.tsx` so every admin route gets the banner.
 * The layout calls `requireAdmin()` first; the banner's RLS-gated SELECT
 * is admin-only on the database side too (defense-in-depth).
 *
 * Visual contract (DESIGN.md §1):
 *   - bg-warning-bg / text-warning-text — admin-actionable "amber" tone
 *   - border + rounded-md (per --radius-md = 12px)
 *   - p-tile-pad (20px) padding, mb-section-gap (32px) below
 *   - "Resolve" button: accent fill, 44×44 minimum tap target
 *
 * Spec §12.4 + invariant 5: every line of human-visible copy is rendered
 * via the catalog (through ErrorExplainer); no raw codes leak into the
 * DOM. The hidden alert-id input is NOT a code — it's the row UUID.
 *
 * If no unresolved alerts exist, the banner returns null (no chrome).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { resolveAdminAlertFormAction } from "@/app/admin/actions";

type AlertRow = {
  id: string;
  code: string;
  raised_at: string;
};

export async function AlertBanner() {
  const supabase = await createSupabaseServerClient();

  // RLS-gated SELECT. The admin_only policy on admin_alerts requires
  // public.is_admin() to return true; the layout's requireAdmin() has
  // already gated the request, so this should always succeed for admins
  // and reject (zero rows) otherwise.
  const { data, error } = await supabase
    .from("admin_alerts")
    .select("id, code, raised_at")
    .is("resolved_at", null)
    .order("raised_at", { ascending: false })
    .limit(1);

  if (error) {
    // I3 fix: distinguish DB error from empty result. Empty (no unresolved
    // alerts) is the steady-state — banner stays invisible. An error means
    // the banner system itself is broken (RLS denial after admin gate,
    // network failure, mis-applied migration); log so an operator tailing
    // server logs has a signal even though the visible behavior is the same.
    console.error("[AlertBanner] admin_alerts SELECT failed:", error.message);
    return null;
  }
  if (!data || data.length === 0) {
    // No unresolved alerts. The banner is intentionally invisible in the
    // clean state — no chrome, no ARIA region, nothing.
    return null;
  }

  const alert = data[0] as AlertRow;

  return (
    <section
      data-testid="admin-alert-banner"
      data-alert-id={alert.id}
      // role="status" + aria-live="polite" — SSR-rendered banner; not a
      // time-critical interruption that warrants role="alert". If future
      // versions inject the banner client-side via a real-time event,
      // reconsider role="alert".
      role="status"
      aria-live="polite"
      className="mb-section-gap rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
    >
      <ErrorExplainer code={alert.code} surface="admin" helpfulContext />

      {/*
        Resolve form — POSTs to the Server Action which UPDATEs
        resolved_at/resolved_by under RLS. The hidden `id` input pins the
        row; the action ignores submissions without an id.
      */}
      <form
        action={resolveAdminAlertFormAction}
        className="mt-4"
      >
        <input
          type="hidden"
          name="id"
          value={alert.id}
          data-testid="admin-alert-id-input"
        />
        <button
          type="submit"
          data-testid="admin-alert-resolve-button"
          className="min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          Resolve
        </button>
      </form>
    </section>
  );
}
