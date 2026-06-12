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
import { TriangleAlert } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchUnresolvedAlertCount } from "@/lib/admin/alertCount";
import { getRequiredDougFacing, isMessageCode, messageFor } from "@/lib/messages/lookup";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { resolveAdminAlertFormAction } from "@/app/admin/actions";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { raisedAtSuffix } from "@/lib/time/raisedAt";
import { nowDate } from "@/lib/time/now";
import { formatBoundedCount } from "@/lib/format/count";
import { firstSentence, stripEmphasis } from "@/lib/messages/collapsedSummary";

import { AlertBannerRouteBoundary } from "./AlertBannerRouteBoundary";
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
  // M12.2 B1 Task 1.3: every infra fault is now fail-VISIBLE — instead
  // of returning null (which would route a positive/degraded bell to an
  // empty surface), we set `detailFailed` and render the cataloged
  // degraded banner. Only the genuinely-empty queue stays invisible.
  let detailFailed = false;
  let supabase!: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    console.error(
      "[AlertBanner] supabase client construction threw:",
      err instanceof Error ? err.message : String(err),
    );
    detailFailed = true;
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
  let data: Array<Record<string, unknown>> | null = null;
  if (!detailFailed) {
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
        // network failure, mis-applied migration). Task 1.3: this is now
        // fail-VISIBLE — set detailFailed so the degraded banner renders
        // instead of silently hiding a broken read.
        console.error("[AlertBanner] admin_alerts SELECT failed:", result.error.message);
        detailFailed = true;
      } else {
        data = result.data as Array<Record<string, unknown>> | null;
      }
    } catch (err) {
      console.error(
        "[AlertBanner] admin_alerts SELECT threw:",
        err instanceof Error ? err.message : String(err),
      );
      detailFailed = true;
    }
  }

  // M12.2 B1 Task 1.3: every infra fault (construction throw, detail
  // returned-error, detail thrown) renders the cataloged degraded banner.
  // Because the NotifBell count and this banner are SEPARATE reads, a
  // positive/degraded bell must never route to an empty /admin#alerts.
  if (detailFailed) {
    const msg = getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"); // string; Task 0.7
    return (
      <section
        data-testid="admin-alert-banner-degraded"
        role="status"
        aria-live="polite"
        className="mb-section-gap flex min-w-0 items-center gap-3 rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
      >
        <TriangleAlert
          aria-hidden
          data-testid="admin-alert-degraded-icon"
          className="size-5 shrink-0"
        />
        <span className="min-w-0 flex-1">{msg}</span>
        {/* aria-label drops the decorative "→" from the accessible name
            without splitting the text run (flex containers drop the space
            between split items AND shift text-decoration paint — byte-level
            screenshot drift). */}
        <Link
          href="/admin#alerts"
          aria-label="View alerts"
          className="inline-flex min-h-tap-min shrink-0 items-center text-sm underline underline-offset-2"
        >
          View alerts →
        </Link>
      </section>
    );
  }
  if (!data || data.length === 0) {
    // No unresolved alerts. The banner is intentionally invisible in the
    // clean state — no chrome, no ARIA region, nothing.
    return null;
  }

  // M9 C4 / M5-D3: queue-depth chip. Task 1.3 replaces the inline
  // head:true count probe with the shared fetchUnresolvedAlertCount()
  // helper so the bell badge and this chip read from ONE source (no
  // drift). The chip renders only when (count - 1) >= 1, i.e., there are
  // alerts beyond the topmost shown. An infra_error from the helper
  // collapses moreCount to 0 (chip silently drops; the topmost alert
  // still renders) — the helper's own degraded state already feeds the
  // fail-visible bell.
  const countResult = await fetchUnresolvedAlertCount();
  const moreCount = countResult.kind === "ok" && countResult.count > 1 ? countResult.count - 1 : 0;
  // RECON-1 T3 (spec §3.1/§5): total unresolved drives the "N alerts" badge.
  // An infra-error count is treated as 1 (badge hidden, "+N more" hidden) —
  // mirrors the moreCount collapse-to-0 above; the top alert still renders.
  const total = countResult.kind === "ok" ? countResult.count : 1;

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

  // RECON-1 T3 (spec §3.3): the collapsed summary line renders the catalog
  // dougFacing STRING inline (NOT <ErrorExplainer>, which is a block + <p>
  // and would be invalid block-in-inline inside the truncate span and defeat
  // truncation). The panel below renders the full <ErrorExplainer>.
  //
  // GUARD (spec §5): alert.code is an UNCONSTRAINED DB string (admin_alerts.code
  // is not a MessageCode enum). messageFor() dereferences the catalog entry, so
  // an uncataloged code would throw and take down the PERSISTENT admin layout.
  // Mirror ErrorExplainer/HelpAffordance's unknown-code resilience: a
  // shared `isMessageCode` type guard (lib/messages/lookup.ts) NARROWS
  // string → MessageCode (a bare `in` / hasOwnProperty check does not narrow
  // on its own, and messageFor expects MessageCode), falling back to null/""
  // so the panel's <ErrorExplainer> (which also returns null for unknown
  // codes) stays consistent.
  const topMessage = isMessageCode(alert.code)
    ? messageFor(alert.code, (alert.context ?? undefined) as never)
    : null;
  // Admin-surface copy selection: dougFacing ONLY — NEVER fall back to
  // crewFacing. This mirrors the canonical renderer ErrorExplainer
  // (surface="admin" → entry.dougFacing, and null → render nothing;
  // ErrorExplainer.tsx:86,91). `admin_alerts.code` is unconstrained, so a
  // drifted/manual/version-skewed row could put a known code with null
  // dougFacing but populated crewFacing (e.g. GOOGLE_NO_CREW_MATCH,
  // ADMIN_SESSION_LOOKUP_FAILED) at the top of the queue. Falling back to
  // crewFacing would render wrong-audience (crew) guidance to Doug on the
  // PERSISTENT admin layout — a catalog surface-boundary violation. When
  // dougFacing is null the summary line is empty (the panel's <ErrorExplainer>
  // likewise renders null), so the banner degrades to icon + count + caret +
  // resolve — admin-safe, never crew copy.
  //
  // Collapsed one-liner = the FIRST COMPLETE SENTENCE of dougFacing, with the
  // catalog's Markdown emphasis markers stripped (the panel's <ErrorExplainer>
  // renders them styled; a raw string would show literal "*"/"_"). Taking the
  // first sentence (M12.3 item 3) avoids mid-word truncation: the `truncate`
  // span below remains a CSS safety net for pathologically long single
  // sentences, while the full message stays in the expanded <ErrorExplainer>
  // panel unchanged. `firstSentence` does not split decimals/version numbers
  // (the boundary requires whitespace/EOS after `.!?`); `stripEmphasis` removes
  // **bold**, *em*, and word-boundary _em_ while keeping the wrapped text.
  const collapsedText = stripEmphasis(firstSentence(topMessage?.dougFacing ?? ""));

  // RECON-1 T3 (review cleanup #2): the JSONB-context → MessageParams cast is
  // identical for ErrorExplainer + HelpAffordance — extract once so the two
  // cannot drift. messageFor only consumes primitive values; runtime
  // interpolation String()-coerces what it understands and leaves non-primitive
  // values unsubstituted (the placeholder remains, which the
  // _metaAdminAlertCatalog regression test flags if anyone adds an unsupported key).
  const contextParams = alert.context
    ? ({
        params: alert.context as unknown as Record<
          string,
          string | number | boolean | null | undefined
        >,
      } as const)
    : {};

  return (
    <AlertBannerRouteBoundary alertId={alert.id}>
      <section
        data-alert-id={alert.id}
        data-testid="admin-alert-banner"
        // role="status" + aria-live="polite" — SSR-rendered banner; not a
        // time-critical interruption that warrants role="alert". If future
        // versions inject the banner client-side via a real-time event,
        // reconsider role="alert". aria-atomic="true" (M9 C8 / M5-D6 #3):
        // when the banner re-announces on alert-row update, the screen
        // reader reads the whole region as one unit rather than diffing
        // word-by-word.
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="grid grid-cols-[minmax(0,1fr)_fit-content(55%)] items-start gap-x-3 rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text mb-section-gap"
      >
        {/* <details className="contents"> flattens the <summary> into the SECTION
            grid as the col-1/row-1 cell. The expanded PANEL is intentionally NOT a
            child of <details>: a grid item arriving through a display:contents box
            does not honor grid-column:1/-1 spanning in Chromium (the panel collapsed
            to column 1 — measured 214.7px instead of the full ~318px content width
            at 390px; F18 defect caught by the T7 real-browser audit). Instead the
            panel is a SECTION-level grid sibling (below) that spans col-span-full
            row-2 correctly, and its open/closed visibility is driven by the pure-CSS
            `details:not([open]) ~ panel` sibling rule in globals.css (no-JS
            reachable, no JS toggle). */}
        <details className="contents">
          {/* min-h-tap-min: the summary shares the action button's 44px tap-target
              height so the collapsed row has a STABLE shared height — required for the
              §7 0.5px vertical-center invariant (T7). items-center centers the icon/
              message/badge/caret within that 44px; the action cell (self-start, also
              ≥44px) starts at the same row-1 top, so all centers align (F-P32). */}
          <summary className="col-start-1 row-start-1 min-h-tap-min min-w-0 flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <TriangleAlert aria-hidden data-testid="admin-alert-icon" className="size-5 shrink-0" />
            {/* Collapsed line renders the catalog dougFacing STRING inline (NOT
                <ErrorExplainer>, which is a block + <p> and would be invalid
                block-in-inline inside this truncate span, defeating truncation).
                Still catalog-sourced (no raw codes). `collapsedText` derived above. */}
            <span data-testid="admin-alert-message" className="flex-1 min-w-0 truncate">
              {collapsedText}
            </span>
            {total > 1 && (
              // The VISIBLE badge is the bounded count ALONE ("99+") — no "alerts"
              // word. A bare numeral is ~22px, so at 390px confirm/pending (col-1
              // ~130px: icon 20 + badge ~22 + caret "Details" ~45 + gaps) it fits
              // WITHOUT overlapping the action column, letting the badge keep the
              // spec §7 literal `shrink-0` (F10 non-overlap holds at every width).
              // It also matches the queue chip's terse "+N more" voice and never
              // needs truncation. The EXACT count + context stays in the sr-only
              // span for assistive tech (§8 F14/F16).
              <span data-testid="admin-alert-badge" className="shrink-0">
                <span aria-hidden="true">{formatBoundedCount(total)}</span>
                <span className="sr-only">{total} unresolved alerts</span>
              </span>
            )}
            <span
              data-testid="admin-alert-caret"
              className="caret shrink-0 text-xs text-text-subtle"
            >
              {/* Visible LABEL swaps Details→Hide via CSS on details[open] (T5); the
                  arrow ⌄/⌃ is the .caret::after pseudo. Both spans are in the DOM; the
                  hidden one is display:none → removed from the accessibility tree, so
                  the summary's accessible name reads the correct one in each state. */}
              <span className="lbl-closed">Details</span>
              <span className="lbl-open">Hide</span>
            </span>
          </summary>
        </details>

        {/* PANEL — a SECTION-level grid sibling of <details> (NOT a child), placed
            col-span-full / row-2 so it spans the full banner content width. It must
            live OUTSIDE <details> because a grid item that reaches the grid through
            a display:contents box does not honor col-span-full in Chromium (it
            collapses to column 1 — the F18 defect). Open/closed visibility is driven
            by the pure-CSS `details:not([open]) ~ [data-testid="admin-alert-panel"]
            { display:none }` sibling rule in globals.css — no-JS reachable, and the
            general-sibling combinator matches because this panel follows <details>
            in source order. (The resolve <form> stays in the separate action cell,
            so the §3.3 / T4 contract — no form inside <details> — is unaffected.) */}
        <div
          data-testid="admin-alert-panel"
          className="col-span-full row-start-2 min-w-0 mt-3 border-t border-border pt-3"
        >
            {/* full (un-truncated) message — ErrorExplainer again, no truncation wrapper */}
            <ErrorExplainer code={alert.code} surface="admin" {...contextParams} />
            {/*
              Phase G.3: HelpAffordance hosts the §9.0.1 "What does this mean?"
              disclosure AND the §5.6 template-family `Learn more →` link.
            */}
            <HelpAffordance code={alert.code} {...contextParams} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-subtle">
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
                  className="inline-flex min-h-tap-min items-center px-3 py-2 underline-offset-2 hover:text-accent-on-bg hover:underline"
                >
                  +{formatBoundedCount(moreCount)} more →
                </Link>
              )}
            </div>
        </div>

        <div
          data-testid="admin-alert-action"
          className="col-start-2 row-start-1 self-start min-w-0 flex flex-wrap justify-end gap-2"
        >
          {isPerShowAlert ? (
            showSlug ? (
              <a
                href={`/admin/show/${encodeURIComponent(showSlug)}?alert_id=${encodeURIComponent(alert.id)}`}
                data-testid="admin-alert-show-link"
                className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
              >
                Check it
              </a>
            ) : null
          ) : (
            // M9 C4 / M5-D3 §5.4: two-tap inline confirm. ResolveAlertButton
            // is a small client island; the parent form owns the hidden id
            // input + Server Action so the resolve posture is preserved. The
            // form is the action slot — slot-integrity rule (spec §3.1/§3.2):
            // nothing may split the button from its form or drop the id.
            <form action={resolveAdminAlertFormAction}>
              <input type="hidden" name="id" value={alert.id} data-testid="admin-alert-id-input" />
              <ResolveAlertButton />
            </form>
          )}
        </div>
      </section>
    </AlertBannerRouteBoundary>
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
