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
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { resolveAdminAlertFormAction } from "@/app/admin/actions";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { raisedAtSuffix } from "@/lib/time/raisedAt";
import { nowDate } from "@/lib/time/now";

import { ResolveAlertButton } from "./ResolveAlertButton";

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
  // AGENTS.md §1.9 + Codex R6 R2 class-sweep: wrap client construction
  // AND every awaited query-builder variable in try/catch. The banner
  // is mounted by app/admin/layout.tsx, so a thrown Supabase fault
  // here would take down the entire admin shell. Mirror the existing
  // returned-`.error` posture: log + return null (the banner is
  // intentionally invisible in any failure mode; the steady-state
  // "no unresolved alerts" path also returns null).
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    console.error(
      "[AlertBanner] supabase client construction threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }

  // RLS-gated SELECT. The admin_only policy on admin_alerts requires
  // public.is_admin() to return true; the layout's requireAdmin() has
  // already gated the request, so this should always succeed for admins
  // and reject (zero rows) otherwise.
  // Build the SELECT in two stages so the info-severity exclusion is only
  // appended when there is something to exclude. PostgREST `.not('code',
  // 'in', '(...)')` requires a non-empty value list; appending an empty
  // `()` clause throws on the server.
  //
  // Codex R3 fix: builder construction (.from(...).select(...).is(...))
  // is INSIDE the try block — `.from()` can throw synchronously (the
  // §1.9 meta-test models this exact case), and a sync throw outside
  // the try would have crashed the admin layout despite the await
  // being wrapped.
  let data: Array<Record<string, unknown>> | null;
  try {
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
    const result = await query.order("raised_at", { ascending: false }).limit(1);
    if (result.error) {
      // I3 fix: distinguish DB error from empty result. Empty (no unresolved
      // alerts) is the steady-state — banner stays invisible. An error means
      // the banner system itself is broken (RLS denial after admin gate,
      // network failure, mis-applied migration); log so an operator tailing
      // server logs has a signal even though the visible behavior is the same.
      console.error("[AlertBanner] admin_alerts SELECT failed:", result.error.message);
      return null;
    }
    data = result.data as Array<Record<string, unknown>> | null;
  } catch (err) {
    console.error(
      "[AlertBanner] admin_alerts SELECT threw:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
  if (!data || data.length === 0) {
    // No unresolved alerts. The banner is intentionally invisible in the
    // clean state — no chrome, no ARIA region, nothing.
    return null;
  }

  // M9 C4 / M5-D3: queue-depth probe. Build the SAME filter chain
  // (resolved_at IS NULL + info-severity exclusion) and request the
  // exact count via head:true so no row payload comes back. The chip
  // renders only when (count - 1) >= 1, i.e., there are alerts beyond
  // the topmost shown.
  //
  // Codex R3 fix: countQuery construction is INSIDE the try block (see
  // the SELECT block above for the same rationale — `.from()` is a
  // synchronous throw site that the §1.9 meta-test exercises).
  let queueDepth: number | null = null;
  try {
    let countQuery = supabase
      .from("admin_alerts")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null);
    if (INFO_SEVERITY_CODES.length > 0) {
      countQuery = countQuery.not(
        "code",
        "in",
        `(${INFO_SEVERITY_CODES.map((code) => `"${code}"`).join(",")})`,
      );
    }
    // C4 R2 fix: invariant 9 (Supabase call-boundary discipline) requires
    // every call destructure `{ data, error }`. head:true makes the data
    // payload null but the binding shape stays uniform across the codebase.
    const { data: _countData, count, error: countError } = await countQuery;
    void _countData;
    if (countError) {
      // Non-fatal: the banner still renders the topmost alert without
      // the count chip. Log so an operator sees the partial degradation.
      console.error("[AlertBanner] admin_alerts COUNT failed:", countError.message);
    } else {
      queueDepth = count ?? null;
    }
  } catch (err) {
    // Non-fatal mirror of the .error branch above — chip silently drops.
    console.error(
      "[AlertBanner] admin_alerts COUNT threw:",
      err instanceof Error ? err.message : String(err),
    );
  }
  const moreCount = typeof queueDepth === "number" && queueDepth > 1 ? queueDepth - 1 : 0;

  // M11 Phase C (C.2 extension): request-scoped wall-clock instant for
  // the relative-time suffix. Hoisted here (after early returns) so the
  // banner only pays the time-utility cost when it will actually render.
  const now = await nowDate();
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

      {/*
        M9 C4 / M5-D3 §5.2 + §5.3: raised_at relative time on the left
        + queue-depth `+N more ▸` chip on the right. The chip renders
        only when there are alerts queued behind the topmost shown.
      */}
      <div
        data-testid="admin-alert-meta-row"
        className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-subtle"
      >
        <p data-testid="admin-alert-raised-at" className="tabular-nums">
          Raised{" "}
          <time dateTime={alert.raised_at} title={absoluteRaisedAt(alert.raised_at)}>
            {raisedAtSuffix(alert.raised_at, now)}
          </time>
        </p>
        {moreCount > 0 && (
          <Link
            data-testid="admin-alert-queue-chip"
            href="/admin#alerts"
            aria-label={`View ${moreCount} more unresolved alerts`}
            className="inline-flex min-h-tap-min items-center px-3 py-2 text-xs text-text-subtle underline-offset-2 hover:text-accent-on-bg hover:underline"
          >
            +{moreCount} more ▸
          </Link>
        )}
      </div>

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
        // M9 C4 / M5-D3 §5.4: two-tap inline confirm. ResolveAlertButton
        // is a small client island that handles idle → confirm →
        // resolving state transitions; the parent form still owns the
        // hidden id input + Server Action so the existing resolve
        // posture (bound to resolveAdminAlertFormAction) is preserved.
        <form action={resolveAdminAlertFormAction} className="mt-4">
          <input type="hidden" name="id" value={alert.id} data-testid="admin-alert-id-input" />
          <ResolveAlertButton />
        </form>
      )}
    </section>
  );
}

/**
 * Format a raised_at ISO timestamp for the <time title> tooltip per
 * brief §5.2: human-readable absolute. UTC for cross-server stability.
 */
function absoluteRaisedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
