/**
 * components/admin/AlertBanner.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Server Component. Renders the topmost unresolved row from
 * `public.admin_alerts` (spec §4.6) using <ErrorExplainer surface="admin"
 * helpfulContext />. Global alerts get a click-through "Resolve" form bound
 * to `resolveAdminAlertFormAction`; per-show alerts link to the show-scoped
 * alert route so the operator views show context before resolving.
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
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";

type AlertRow = {
  id: string;
  code: string;
  raised_at: string;
  show_id: string | null;
  /** admin_alerts.context — jsonb payload supplied by the producer. */
  context: Record<string, unknown> | null;
  shows: { slug: string } | Array<{ slug: string }> | null;
};

// Codes whose catalog entry is `severity: 'info'` are operator notices
// (Amendment 8 / ROLE_FLAGS_NOTICE is the canonical example) — they are
// recorded for visibility but must not raise the primary admin banner.
// The dedicated alert-feed surface that shows them is M9/M10 territory.
// Computed at module load from MESSAGE_CATALOG so adding a new info-severity
// entry to the catalog automatically extends the exclusion list.
// Cast widens each literal-typed entry (the catalog uses
// `as const satisfies Record<string, MessageCatalogEntry>`) so the
// optional `severity` field is visible to the filter.
const INFO_SEVERITY_CODES: string[] = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
  .filter((entry) => entry.severity === "info")
  .map((entry) => entry.code);

export async function AlertBanner() {
  const supabase = await createSupabaseServerClient();

  // RLS-gated SELECT. The admin_only policy on admin_alerts requires
  // public.is_admin() to return true; the layout's requireAdmin() has
  // already gated the request, so this should always succeed for admins
  // and reject (zero rows) otherwise.
  // Build the SELECT in two stages so the info-severity exclusion is only
  // appended when there is something to exclude. PostgREST `.not('code',
  // 'in', '(...)')` requires a non-empty value list; appending an empty
  // `()` clause throws on the server.
  let query = supabase
    .from("admin_alerts")
    .select("id, code, raised_at, show_id, context, shows(slug)")
    .is("resolved_at", null);
  if (INFO_SEVERITY_CODES.length > 0) {
    query = query.not(
      "code",
      "in",
      `(${INFO_SEVERITY_CODES.map((code) => `"${code}"`).join(",")})`,
    );
  }
  const { data, error } = await query.order("raised_at", { ascending: false }).limit(1);

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
  const show = Array.isArray(alert.shows) ? alert.shows[0] : alert.shows;
  const showSlug = show?.slug ?? null;
  const isPerShowAlert = alert.show_id !== null;
  if (isPerShowAlert && !showSlug) {
    console.error("[AlertBanner] per-show alert missing show slug:", alert.id);
  }

  return (
    <section
      data-testid="admin-alert-banner"
      data-alert-id={alert.id}
      // role="status" + aria-live="polite" — SSR-rendered banner; not a
      // time-critical interruption that warrants role="alert". If future
      // versions inject the banner client-side via a real-time event,
      // reconsider role="alert". aria-atomic="true" (M9 C8 / M5-D6 #3):
      // when the banner re-announces on alert-row update, the screen
      // reader reads the whole region (header + body + helpful-context)
      // as one unit rather than diffing word-by-word.
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mb-section-gap rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
    >
      <ErrorExplainer
        code={alert.code}
        surface="admin"
        helpfulContext
        {...(alert.context
          ? {
              // Type-narrow: messageFor only consumes primitive values; cast
              // the JSONB row through to MessageParams. Runtime interpolation
              // String()-coerces values it understands and leaves non-primitive
              // values unsubstituted (the placeholder remains, which the
              // _metaAdminAlertCatalog regression test will flag the next time
              // anyone adds an unsupported key).
              params: alert.context as unknown as Record<
                string,
                string | number | boolean | null | undefined
              >,
            }
          : {})}
      />

      {isPerShowAlert ? (
        showSlug ? (
          <a
            href={`/admin/show/${encodeURIComponent(showSlug)}?alert_id=${encodeURIComponent(alert.id)}`}
            data-testid="admin-alert-show-link"
            className="mt-4 inline-flex min-h-tap-min min-w-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
          >
            View show
          </a>
        ) : null
      ) : (
        <form action={resolveAdminAlertFormAction} className="mt-4">
          <input type="hidden" name="id" value={alert.id} data-testid="admin-alert-id-input" />
          <button
            type="submit"
            data-testid="admin-alert-resolve-button"
            className="min-h-tap-min min-w-tap-min rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            Resolve
          </button>
        </form>
      )}
    </section>
  );
}
