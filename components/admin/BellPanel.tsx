"use client";
/**
 * components/admin/BellPanel.tsx (bell notification center Task 13 + Task 14,
 * spec §7.2/§7.3/§7.4)
 *
 * The bell notification panel: a clone of the `AppHealthPopover` dialog shell
 * (`components/admin/AppHealthPopover.tsx`) — `role="dialog" aria-modal`,
 * `useDialogFocus` trap + restore, Esc + scrim close, bottom-sheet on mobile
 * that becomes a centered/near-anchored popover on desktop. DESIGN.md's
 * anti-modal rule is satisfied the same way AppHealthPopover justifies it: a
 * transient, user-summoned, single-tap-dismissed dropdown-class overlay.
 *
 * On mount the panel fetches `/bell/feed`, renders, and THEN POSTs `/bell/open`
 * with the response's `seenThrough` (spec §7.2 snapshot safety — the watermark
 * advances only to the snapshot the viewer actually saw; the stamp is SERVER
 * truth, never client `Date.now()`). The open POST is fail-quiet and, once it
 * settles, calls `onOpened()` so the badge refetches to server truth. Order is
 * load-bearing: open must never fire before the feed resolves.
 *
 * Task 14 — the interaction layer on the active rows:
 *   - Resolve: a fetch POST to the EXISTING resolve routes (global
 *     `/api/admin/admin-alerts/[id]/resolve`; show-scoped
 *     `/api/admin/show/[slug]/alerts/[id]/resolve` when the entry carries a
 *     slug). The route's door order (403 HEALTH → 409 auto → 400 scope → 200)
 *     is unchanged; the panel refetches after the POST settles so a 409 (the
 *     code raced to auto) surfaces the auto note on the re-read snapshot.
 *   - Auto-resolving rows show `autoResolveNote` instead of a button; health
 *     rows show a "View in telemetry" deep link (the global route 403s health
 *     by design); `WATCH_CHANNEL_ORPHANED` carries the banner's Retry form.
 *   - Read gesture (spec §3.1/D3): the FIRST tap of a row's toggle POSTs
 *     `/bell/read` with the SERVER `activityAt` as `seenActivityAt` and clears
 *     the unread dot optimistically (opacity flip, fixed slot — no layout
 *     shift). A failed read POST leaves the dot cleared for the session
 *     (fail-quiet, §4). The toggle has no expand/collapse state of its own —
 *     it is a mark-read-only gesture (spec §4.1, Task 7 chevron rework).
 *   - Show-page chevron (spec §4.1): a row whose alert carries a slug renders
 *     a `ChevronRight` nav link to `/admin?show=<slug>` (the review modal), a DOM SIBLING of the
 *     toggle button (never nested inside it — nested-interactive a11y). Hidden
 *     exactly when `entry.slug` is null (global alerts, health rows) — those rows
 *     render an aria-hidden spacer of the same width instead, so the timestamp
 *     column stays aligned across chevron-present and chevron-absent rows.
 *   - Dev footer (`viewerIsDeveloper` only): the live window/cap plus an inline
 *     two-input edit that POSTs `/bell/config`; a 400 renders the response's
 *     bounds (no silent clamp), a success refetches the feed.
 *
 * Copy (invariant 5 — no raw codes in the DOM): titles/messages come from the
 * catalog via `messageFor`/`isMessageCode`; auto notes come from the feed's
 * catalog-derived `autoResolveNote`; button and
 * footer labels are UI chrome (uncataloged, like "Dismiss"/"Retry"). The error
 * state renders `ALERT_BELL_FEED_FAILED`. An uncataloged row code falls back to
 * a generic title (never the raw code string).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import {
  getRequiredDougFacing,
  isMessageCode,
  messageFor,
  plainCatalogText,
  type MessageParams,
} from "@/lib/messages/lookup";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import {
  BELL_BOLD_IDENTITY_TOKENS,
  parseChanges,
  roleChangeLines,
} from "@/lib/adminAlerts/deriveMessageParams";
import { INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import { raisedAtSuffix } from "@/lib/time/raisedAt";
import { retryWatchSubscriptionFormAction } from "@/app/admin/actions";
import { RetryWatchButton } from "@/components/admin/RetryWatchButton";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";
import { resolveActionLabels } from "@/lib/adminAlerts/resolveActionLabel";
import type { BellEntry, BellFeedResult } from "@/lib/admin/bellFeed";
import {
  GROUP_THRESHOLD,
  groupActiveBySeverity,
  rowTone,
  type RowTone,
} from "@/lib/admin/bellTriage";

const FEED_ENDPOINT = "/api/admin/alerts/bell/feed";
const OPEN_ENDPOINT = "/api/admin/alerts/bell/open";
const READ_ENDPOINT = "/api/admin/alerts/bell/read";
const CONFIG_ENDPOINT = "/api/admin/alerts/bell/config";

const WATCH_CODE = "WATCH_CHANNEL_ORPHANED";

// The wire shape the feed route returns (kind stripped — feed/route.ts).
type BellFeedBody = Omit<Extract<BellFeedResult, { kind: "ok" }>, "kind">;

// Config-route 400 bounds echo (config/route.ts returns `{ error, limits }`,
// where `limits` mirrors BELL_LIMITS — used to render the accepted range).
type BellConfigLimits = typeof BELL_LIMITS;

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; feed: BellFeedBody };

// Generic, non-code fallback title for a row whose code is uncataloged or has
// no catalog `title` (invariant 5: never surface the raw code).
const FALLBACK_TITLE = "Notification";

// Copy is returned as RAW catalog TEMPLATES (title + dougFacing/helpfulContext
// templates, params NOT applied here). Emphasis is parsed on the template and
// producer context is interpolated as OPAQUE TEXT at the render site via
// `renderCatalogEmphasis(template, params)` — the same order ErrorExplainer
// uses (Codex R2). Interpolating BEFORE emphasis parsing would let a context
// value like "East *draft*" be reinterpreted as markdown. `title` is never
// interpolated by messageFor, so it is unchanged either way.
function rowCopy(code: string): { title: string; message: string | null } {
  const entry = isMessageCode(code) ? messageFor(code) : null;
  return { title: entry?.title ?? FALLBACK_TITLE, message: entry?.dougFacing ?? null };
}

// Narrowing for the render sites: entry.context is a producer-supplied jsonb
// bag; renderCatalogEmphasis interpolates its scalars as opaque text.
function contextParams(context: Record<string, unknown> | null): MessageParams | undefined {
  return (context ?? undefined) as MessageParams | undefined;
}

// Severity tone (`rowTone`), the grouping threshold, tier order, and the
// grouping partition live in `lib/admin/bellTriage.ts` (pure, client-safe) so
// tests import them without BellPanel's "use server" chain (spec §1.7). Color
// REINFORCES; the icon shape + the row title carry the meaning, so the
// DESIGN.md §1 color-blind floor holds. `critical` is the only red, scoped to
// degraded-weight health rows (DESIGN.md §1.3; spec §1.6).
// Quiet-rail severity vocabulary (DESIGN.md §16): a thin left `rail` + an
// on-surface stroke `glyph` (no fill circle), both the same tone color. Glyph
// SHAPE is the color-blind-safe carrier — notice=TriangleAlert, critical=
// CircleAlert, info=Info — so the §1 floor holds without the rail (the rail is
// the §9 scoped side-stripe exception). `label` is the glyph's `title` tooltip.
const TONE: Record<RowTone, { rail: string; glyph: string; icon: LucideIcon; label: string }> = {
  critical: {
    rail: "bg-status-degraded",
    glyph: "text-status-degraded",
    icon: CircleAlert,
    label: "Critical",
  },
  notice: {
    rail: "bg-status-warn",
    glyph: "text-status-warn",
    icon: TriangleAlert,
    label: "Warning",
  },
  info: { rail: "bg-accent-on-bg", glyph: "text-accent-on-bg", icon: Info, label: "Notice" },
};

// The resolve route the entry posts to: show-scoped when the row carries a
// slug (per-show alerts never use the global route — matches PerShowAlertSection
// and the global route's own 400 scope door), global otherwise.
function resolveUrl(entry: BellEntry): string {
  return entry.slug
    ? `/api/admin/show/${entry.slug}/alerts/${entry.alertId}/resolve`
    : `/api/admin/admin-alerts/${entry.alertId}/resolve`;
}

// Occurrence repeat-chip (DESIGN.md §16, header right-group). Shown only when a
// code has fired more than once. A compact rotate glyph + tabular count with a
// hover/focus tooltip; the accessible name carries the full "Detected N times"
// so the count is never a bare unlabeled number to AT. `occurrences <= 1 → null`.
function OccurrenceChip({ occurrences, alertId }: { occurrences: number; alertId: string }) {
  if (typeof occurrences !== "number" || occurrences <= 1) return null;
  const label = `Detected ${occurrences} times`;
  return (
    // role="img" + aria-label: a non-interactive graphic that announces the full
    // "Detected N times" (so it nests validly inside the toggle button and the
    // count is never a bare number to AT). The tooltip is a mouse-hover nicety.
    <span
      data-testid={`bell-occurrence-${alertId}`}
      role="img"
      aria-label={label}
      className="group/occ relative inline-flex items-center gap-0.5 text-[11.5px] tabular-nums text-text-faint"
    >
      <RotateCcw aria-hidden="true" className="size-2.5 shrink-0" />
      <span aria-hidden="true">{occurrences}</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] font-medium text-text opacity-0 shadow-popover transition-opacity duration-fast group-hover/occ:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </span>
  );
}

// At-a-glance identity as ONE bordered token chip (DESIGN.md §16) instead of a
// plain text line. The resolver bakes any "+N more" overflow into the identity
// value string, so it stays inside the chip (re-parsing it out would be fragile).
function IdentityChip({ entry }: { entry: BellEntry }) {
  const text = entry.identity ? describeAlert(entry.identity, { includePii: true }) : null;
  if (!text) return null;
  return (
    <div className="mt-2.5">
      <span
        data-testid={`bell-identity-${entry.alertId}`}
        className="inline-flex max-w-full items-center rounded-md border border-border-strong bg-surface-sunken px-2 py-0.5 text-xs tabular-nums text-text wrap-break-word"
      >
        {text}
      </span>
    </div>
  );
}

// Leading text-link CTA (DESIGN.md §16): the action deep link / telemetry link.
// Accent-on-bg, hover underline; keeps the 44px tap floor for the venue phone.
const LINK_CTA =
  "inline-flex min-h-tap-min items-center gap-1 rounded-sm text-[13px] font-semibold text-accent-on-bg transition-colors duration-fast hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Trailing ghost Dismiss (DESIGN.md §16): quiet by default, lifts on hover.
// Ghost styling for the row's resolve control. Named for the ROLE, not a verb:
// the label itself is intent-driven (lib/adminAlerts/resolveActionLabel.ts) and
// reads "Confirm" or "Mark resolved" depending on the code.
const GHOST_RESOLVE =
  "inline-flex min-h-tap-min items-center rounded-sm px-2 text-[13px] text-text-faint transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60";
// Show-page nav chevron (spec §4.1): reuses LINK_CTA's accent color + focus-ring
// vocabulary, but sized as an icon-only affordance (`size-tap-min`, the same
// square-tap-target pattern the `bell-panel-close` button uses) rather than
// LINK_CTA's text-link padding.
// Show-page chevron: a 28px-wide gutter spanning the FULL row height, sitting
// after the row body so the header's timestamp and the action row's Dismiss end
// on one shared right edge (they previously ended 52px apart — the chevron was a
// conditional child of the header line only).
//
// 28px is the VISIBLE width; the tap target is not. `relative` + the transparent
// `before:-inset-x-2` overlay bleeds the hit area 8px each side to 44px without
// occupying any layout — the same technique HoverHelp's 20px "?" dot already uses
// (`before:-inset-3`). `inset-y-0` is load-bearing: `-inset-x-2` alone leaves
// top/bottom auto, which makes the overlay zero-height and the bleed a no-op.
// The bleed lands inside the row's own px-4 padding, so it
// never reaches into the text column. Vertically `self-stretch` makes the target
// the row's full height (60px+), well past the 44px floor.
const SHOW_PAGE_LINK =
  "relative inline-flex w-7 shrink-0 self-stretch items-center justify-center rounded-sm text-accent-on-bg transition-colors duration-fast before:absolute before:inset-y-0 before:-inset-x-2 before:content-[''] hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
// Chevron-less rows (global alerts, health rows, every history row) reserve the
// same 28px so the shared right edge holds. WIDTH ONLY — a square would floor a
// short row's height at 28px+ for nothing.
const SHOW_PAGE_SLOT = "w-7 shrink-0";
// Low-emphasis wayfinding link (impeccable critique P1 — alert-copy full-sweep):
// routes to the code's longform /help/errors education. Quiet by default
// (text-subtle, underline only on hover/focus) so it never competes with
// LINK_CTA's accent weight or the row's real actions; keeps the 44px tap floor.
const HELP_LINK =
  "inline-flex min-h-tap-min items-center rounded-sm text-[13px] text-text-subtle underline-offset-2 transition-colors duration-fast hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function ActionCell({ entry, onRefetch }: { entry: BellEntry; onRefetch: () => void }) {
  const [resolving, setResolving] = useState(false);
  const isWatch = entry.code === WATCH_CODE;

  const onResolve = useCallback(async () => {
    if (resolving) return; // guard against double-fire (no form action here)
    setResolving(true);
    try {
      await fetch(resolveUrl(entry), { method: "POST" });
    } catch {
      // Network fault: keep the row; the viewer can retry. Reset the button.
      setResolving(false);
      return;
    }
    // Refetch after the POST settles regardless of status: a 200 shows the row
    // resolved, a 409 (raced to auto) surfaces the auto note, a 404 drops it.
    // Reset the button too — on a transient 5xx the row survives the refetch
    // and must not stay stuck at "Dismissing…".
    setResolving(false);
    onRefetch();
  }, [entry, onRefetch, resolving]);

  // Layout (DESIGN.md §16): the primary link/affordance LEADS on the left, a
  // spacer, then the trailing ghost Dismiss on the right. Health rows keep the
  // telemetry-link-only contract (the global resolve route 403s health), so they
  // have no Dismiss; auto-resolving rows show their note; watch keeps Retry.
  return (
    <div
      data-testid={`bell-action-cell-${entry.alertId}`}
      className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1"
    >
      {entry.isHealth ? (
        <a
          href="/admin/dev/telemetry#health"
          data-testid={`bell-telemetry-${entry.alertId}`}
          className={LINK_CTA}
        >
          View in telemetry <span aria-hidden="true">↗</span>
        </a>
      ) : entry.actions.length > 0 ? (
        entry.actions.map((action, i) => (
          <a
            key={action.href}
            href={action.href}
            data-testid={`bell-action-${entry.alertId}-${i}`}
            {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={LINK_CTA}
          >
            {action.label}
            {action.external ? <span aria-hidden="true"> ↗</span> : null}
          </a>
        ))
      ) : null}
      {/* Carry-over from the retired AlertBanner: the watch alert's single-tap
          Retry form (idempotent — no two-tap confirm). Pending state derives
          from useFormStatus inside RetryWatchButton, so the button re-enables
          when the Server Action returns even on a no-revalidate failure path. */}
      {!entry.isHealth && isWatch ? (
        <form action={retryWatchSubscriptionFormAction}>
          <RetryWatchButton ringOffset="surface" />
        </form>
      ) : null}
      {/* Learn-more moved to the message block (WI-2) — it renders inline after
          the message text there, not in this action cell. */}
      <span className="flex-1" />
      {entry.isHealth ? null : entry.isAutoResolving ? (
        <p
          data-testid={`bell-auto-note-${entry.alertId}`}
          className="wrap-break-word text-sm text-text-subtle"
        >
          {entry.autoResolveNote}
        </p>
      ) : (
        <button
          type="button"
          data-testid={`bell-resolve-${entry.alertId}`}
          onClick={() => void onResolve()}
          disabled={resolving}
          aria-busy={resolving}
          className={GHOST_RESOLVE}
        >
          {resolving
            ? resolveActionLabels(entry.code).pending
            : resolveActionLabels(entry.code).idle}
        </button>
      )}
    </div>
  );
}

// Message-text renderer (WI-3 + WI-4). ROLE_FLAGS_NOTICE with ≥2 structured
// changes renders a real <ul> of body-weight items (illegal inside the removed
// <button>, legal here as a header sibling): split the template on the literal
// `<role-changes>` token, bold the identity prefix/suffix (WI-3), and render the
// structured lines from roleChangeLines. Every other case (single/zero change,
// a future template without the token, or a non-ROLE_FLAGS code) falls back to
// the ordinary identity-bold render — never crash on a template shape change.
function renderMessageBody(
  entry: BellEntry,
  message: string,
  params: MessageParams | undefined,
): ReactNode {
  if (entry.code === "ROLE_FLAGS_NOTICE" && message.includes("<role-changes>")) {
    const changes = parseChanges(entry.context);
    if (changes.length >= 2) {
      const [prefix = "", suffix = ""] = message.split("<role-changes>");
      const lines = roleChangeLines(changes);
      return (
        <>
          {renderCatalogEmphasis(prefix, params, BELL_BOLD_IDENTITY_TOKENS)}
          {lines.header}
          <ul className="mt-1 list-disc pl-5 text-sm text-text-subtle">
            {lines.items.map((it, i) => (
              <li key={i} className="wrap-break-word">
                {it}
              </li>
            ))}
          </ul>
          {lines.overflow ? (
            // text-subtle (not text-faint): the overflow lands on unread
            // `bg-stale-tint` rows where text-faint is only 2.86:1 (below its
            // own 3:1 floor + WCAG 1.4.3 AA). text-subtle is 5.77:1 there and
            // matches the <ul> items' weight above (impeccable audit P2).
            <p className="mt-1 text-xs text-text-subtle">{lines.overflow}</p>
          ) : null}
          {renderCatalogEmphasis(suffix, params, BELL_BOLD_IDENTITY_TOKENS)}
        </>
      );
    }
  }
  return <>{renderCatalogEmphasis(message, params, BELL_BOLD_IDENTITY_TOKENS)}</>;
}

function ActiveRow({
  entry,
  now,
  readCleared,
  onMarkRead,
  onRefetch,
}: {
  entry: BellEntry;
  now: Date;
  readCleared: boolean;
  onMarkRead: () => void;
  onRefetch: () => void;
}) {
  const { title, message } = rowCopy(entry.code);
  // helpHref (WI-2): the catalog's longform education link, moved from ActionCell
  // into the message block below so it renders inline after the message text (and
  // survives a suppressed message — orphan guard). null when uncataloged/unset.
  const helpHref = isMessageCode(entry.code) ? messageFor(entry.code).helpHref : null;
  // Params source (spec 2026-07-17 §4.1/§4.2): the merged, identity-derived
  // messageParams the feed carries; contextParams(entry.context) is the
  // legacy raw-jsonb fallback for entries the field is absent on.
  const params =
    Object.keys(entry.messageParams ?? {}).length > 0
      ? entry.messageParams
      : contextParams(entry.context);
  // Spec 2026-07-17 §4.3/§4.5: render the message only when the template fully
  // interpolates; a leftover <placeholder> (defense-in-depth — derived params
  // always resolve) drops the message line and keeps the identity chip.
  const UNRESOLVED = /<[a-zA-Z_][a-zA-Z0-9_-]*>/;
  const messageResolved = message !== null && !UNRESOLVED.test(plainCatalogText(message, params));
  const suppressChip = INLINE_IDENTITY_CODES.has(entry.code) && messageResolved;
  // Dot shows only while genuinely unread AND not yet optimistically cleared
  // this session (a failed read POST does not un-clear it — spec §4 fail-quiet).
  const dotVisible = entry.unread && !readCleared;
  const tone = rowTone(entry);
  const ToneIcon = TONE[tone].icon;
  return (
    <div
      data-testid={`bell-entry-${entry.alertId}`}
      data-unread={dotVisible ? "true" : "false"}
      className={`relative flex gap-3 px-4 py-3.5 transition-colors motion-safe:duration-fast ${
        dotVisible ? "bg-stale-tint" : "hover:bg-surface-sunken"
      }`}
    >
      {/* Severity rail (DESIGN.md §16 / §9 scoped side-stripe): a 3px tone-colored
          left rail inset from the row padding. Redundant with the glyph + title,
          never the sole severity carrier. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-3.5 left-0 w-[3px] rounded-full ${TONE[tone].rail}`}
      />
      {/* On-surface stroke severity glyph (18px fixed — DI-4). The unread pip
          rides its top-right corner (DI-5): a size-2 (8px) element whose opacity
          flips on read, so no layout shift and every existing dot assertion holds.
          Glyph SHAPE carries severity for the color-blind floor (DESIGN.md §16). */}
      <span aria-hidden="true" className="relative mt-px shrink-0">
        <span
          data-testid={`bell-sev-${entry.alertId}`}
          data-tone={tone}
          title={TONE[tone].label}
          className={`inline-flex ${TONE[tone].glyph}`}
        >
          <ToneIcon className="size-[18px]" />
        </span>
        <span className="absolute -right-1 -top-1 inline-flex size-2">
          <span
            data-testid={`bell-unread-dot-${entry.alertId}`}
            className={`size-2 rounded-full bg-accent-on-bg ring-2 ring-surface motion-safe:transition-opacity motion-safe:duration-fast ${
              dotVisible ? "opacity-100" : "opacity-0"
            }`}
          />
        </span>
      </span>
      <div className="min-w-0 flex-1">
        {/* Row header (WI-1): the title-only mark-read button LEADS (flex-1);
            the right-group (occurrence chip + timestamp) and the show-page
            chevron are DOM SIBLINGS to its right, never nested inside the button
            (a link nested inside a button is a nested-interactive a11y
            violation, and the message/`<ul>`/`<a>` below are illegal inside a
            <button> per the HTML content model). `items-start` keeps the
            right-group top-aligned with the title's first line; the meta group's
            `shrink-0` sits it flush against the chevron — or, on a chevron-less
            row, against the reserved slot that stands in for it, so both cases
            land on one right edge (DI-1/DI-2). */}
        <div data-testid={`bell-header-${entry.alertId}`} className="flex items-start gap-2">
          {/* min-h-tap-min: this is the primary per-row gesture (mark-read). A
              title-only row would otherwise render the affordance well under the
              44px floor PRODUCT.md mandates for a phone on the venue floor.
              flex-1 min-w-0 lets the title take the remaining width and
              wrap/truncate rather than push the right-group off-row. The message
              block, identity chip, and action row are SIBLINGS below the header,
              so they are outside the tap gesture (WI-1 ratified: clicking the
              message no longer marks read). */}
          <button
            type="button"
            data-testid={`bell-entry-toggle-${entry.alertId}`}
            onClick={onMarkRead}
            // Title-only visible content (message moved out per WI-1) left the
            // accessible name as just the title, with no cue that tapping marks
            // read (impeccable A11y P2). aria-label prepends the action and still
            // CONTAINS the visible title (WCAG 2.5.3 label-in-name). One-way
            // action, so aria-pressed is deliberately absent (not a toggle).
            aria-label={`Mark as read: ${title}`}
            className="flex min-h-tap-min min-w-0 flex-1 items-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {/* Title weight is CONSTANT across read/unread — a weight swap
                (semibold↔medium) changes glyph advance widths and can reflow a
                wrapping title by a full line on read (§14 no-layout-shift).
                Unread emphasis is carried by the pip + `bg-stale-tint` row
                background + the rail, never the title weight. */}
            <span className="min-w-0 wrap-break-word font-semibold text-text-strong">{title}</span>
          </button>
          {/* Header right-group (DESIGN.md §16, WI-1): occurrence repeat-chip,
              then the relative timestamp. Moved OUT of the button into the header
              flex row so its right edge sits flush against the chevron / row
              content right edge (the timestamp right-flush screenshot fix).
              `pt-0.5` optically aligns the micro-text with the title's cap line.
              OccurrenceChip renders unconditionally (own `occurrences<=1→null`
              guard) — it is NOT gated on suppressChip. */}
          <span
            data-testid={`bell-meta-${entry.alertId}`}
            className="flex shrink-0 items-center gap-2.5 pt-0.5"
          >
            <OccurrenceChip occurrences={entry.occurrences} alertId={entry.alertId} />
            <span
              data-testid={`bell-time-${entry.alertId}`}
              className="text-xs tabular-nums text-text-faint"
            >
              {raisedAtSuffix(entry.activityAt, now)}
            </span>
          </span>
        </div>
        {/* Message block (WI-1/WI-2): a real sibling BELOW the header so the
            inline Learn-more <a> (and the WI-4 multi-change <ul>) are legal
            content. Renders when the message resolves OR helpHref exists — the
            block must survive a suppressed message when helpHref is present, so
            the Learn-more affordance is never orphan-dropped (WI-2 guard). */}
        {(message && messageResolved) || helpHref ? (
          <div
            data-testid={`bell-msg-${entry.alertId}`}
            className="mt-1 whitespace-pre-line wrap-break-word text-sm text-text-subtle"
          >
            {message && messageResolved ? renderMessageBody(entry, message, params) : null}
            {helpHref ? (
              <>
                {message && messageResolved ? " " : null}
                <a
                  href={helpHref}
                  data-testid={`bell-help-${entry.alertId}`}
                  className={HELP_LINK}
                  aria-label={`Learn more about ${rowCopy(entry.code).title}`}
                >
                  Learn more
                </a>
              </>
            ) : null}
          </div>
        ) : null}
        {suppressChip ? null : <IdentityChip entry={entry} />}
        <ActionCell entry={entry} onRefetch={onRefetch} />
      </div>
      {/* Show-page nav gutter (spec §4.1): a SLUG predicate, not an
          identity-map-kind predicate — e.g. BRANCH_PROTECTION_* codes carry
          repo-segment identity but upsert with null show → null slug → no
          chevron. Plain nav, no toggle behavior of its own, and a DOM SIBLING of
          the body (never nested inside the mark-read button). Vertically centered
          on the row it navigates, which reads as "this row goes somewhere" far
          better than a 16px glyph sharing the title's line did. */}
      {entry.slug !== null ? (
        <a
          href={`/admin?show=${encodeURIComponent(entry.slug)}`}
          data-testid={`bell-caret-${entry.alertId}`}
          aria-label="Open show page"
          // Permanent desktop cue for where the chevron goes. The removed WI-5
          // banner said this once; a native tooltip says it every time, for free,
          // and never goes stale. Touch has no hover — there the disclosure
          // chevron itself is the convention.
          title="Open show page"
          className={SHOW_PAGE_LINK}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </a>
      ) : (
        <span
          aria-hidden="true"
          data-testid={`bell-caret-slot-${entry.alertId}`}
          className={SHOW_PAGE_SLOT}
        />
      )}
    </div>
  );
}

function HistoryRow({ entry, now }: { entry: BellEntry; now: Date }) {
  const { title } = rowCopy(entry.code);
  const resolved = entry.resolvedAt ? `Resolved ${raisedAtSuffix(entry.resolvedAt, now)}` : null;
  return (
    <div
      data-testid={`bell-entry-${entry.alertId}`}
      // px-4 (not px-2.5) + the same 28px chevron gutter the active rows carry:
      // history sits in the SAME scroll container as the active list, so a history
      // timestamp on a different right edge reads as a bug, not as a quieter tier.
      // History rows never navigate (no chevron ever), so the reservation here is
      // purely the column.
      // gap-3 matches the ACTIVE row's body→gutter gap, so the resolved timestamp
      // lands on the same right edge as an active row's. gap-2.5 (the old value)
      // or gap-2 leaves it 2-4px off — close enough to look like a mistake.
      className="flex items-center gap-3 rounded-lg px-4 py-2 transition-colors motion-safe:duration-fast hover:bg-surface-sunken"
    >
      <CircleCheck aria-hidden="true" className="size-[15px] shrink-0 text-status-positive" />
      <span className="min-w-0 flex-1 wrap-break-word text-sm text-text-subtle">{title}</span>
      {resolved ? (
        <span
          data-testid={`bell-time-${entry.alertId}`}
          className="shrink-0 text-xs tabular-nums text-text-faint"
        >
          {resolved}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        data-testid={`bell-caret-slot-${entry.alertId}`}
        className={SHOW_PAGE_SLOT}
      />
    </div>
  );
}

function DevFooter({
  historyDays,
  feedCap,
  onSaved,
}: {
  historyDays: number;
  feedCap: number;
  onSaved: () => void;
}) {
  const [historyInput, setHistoryInput] = useState(String(historyDays));
  const [capInput, setCapInput] = useState(String(feedCap));
  const [saving, setSaving] = useState(false);
  const [boundsError, setBoundsError] = useState<BellConfigLimits | null>(null);

  const onSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setBoundsError(null);
    let res: Response;
    try {
      res = await fetch(CONFIG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historyDays: Number.parseInt(historyInput, 10),
          feedCap: Number.parseInt(capInput, 10),
        }),
      });
    } catch {
      setSaving(false);
      return;
    }
    if (res.status === 400) {
      // Field-level rejection: render the accepted bounds the route echoed back
      // (no silent clamp — the dev sees exactly what range is valid).
      try {
        const body = (await res.json()) as { limits?: BellConfigLimits };
        setBoundsError(body.limits ?? BELL_LIMITS);
      } catch {
        setBoundsError(BELL_LIMITS);
      }
      setSaving(false);
      return;
    }
    setSaving(false);
    if (res.ok) onSaved();
  }, [capInput, historyInput, saving, onSaved]);

  return (
    <div
      data-testid="bell-dev-footer"
      className="mt-4 border-t border-border pt-3 text-xs text-text-subtle"
    >
      <p className="tabular-nums">
        Window: {historyDays}d · Cap: {feedCap}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span>Window (days)</span>
          <input
            type="number"
            inputMode="numeric"
            data-testid="bell-config-history"
            value={historyInput}
            onChange={(e) => setHistoryInput(e.target.value)}
            className="min-h-tap-min w-20 rounded-sm border border-border-strong bg-surface px-2 py-1 tabular-nums text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>Feed cap</span>
          <input
            type="number"
            inputMode="numeric"
            data-testid="bell-config-cap"
            value={capInput}
            onChange={(e) => setCapInput(e.target.value)}
            className="min-h-tap-min w-20 rounded-sm border border-border-strong bg-surface px-2 py-1 tabular-nums text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
        </label>
        <button
          type="button"
          data-testid="bell-config-save"
          onClick={() => void onSave()}
          disabled={saving}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {boundsError ? (
        <p data-testid="bell-config-error" className="mt-2 wrap-break-word text-warning-text">
          Window must be {boundsError.historyDays.min}–{boundsError.historyDays.max} days; cap must
          be {boundsError.feedCap.min}–{boundsError.feedCap.max}.
        </p>
      ) : null}
    </div>
  );
}

export function BellPanel({
  viewerIsDeveloper,
  onClose,
  onOpened,
  pingSignal,
}: {
  viewerIsDeveloper: boolean;
  onClose: () => void;
  onOpened: () => void;
  // Monotonic realtime-ping counter from useBellBadge (spec §5.4). Each advance
  // is a `changed` push while the panel is OPEN → refetch the feed in place.
  // Optional so direct-render harnesses (and the closed-panel case) can omit it.
  pingSignal?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(containerRef, closeRef);

  const [state, setState] = useState<PanelState>({ status: "loading" });
  // BELL-3: text for the persistent sr-only live region. Empty at mount (nothing
  // announced yet); the initial load stamps the active count, a refetch stamps a
  // completion note, and any failed load stamps a plain-language failure. Plain
  // UI chrome (like "Loading notifications…"), never a raw code (invariant 5).
  const [liveMessage, setLiveMessage] = useState("");
  // Which snapshot we have already stamped via /bell/open — prevents a duplicate
  // open POST for the same seenThrough across re-renders (spec §7.2 "exactly once").
  const openedForRef = useRef<string | null>(null);
  // Monotonic load token: overlapping loads (mount + realtime ping, or ping +
  // ping) race, so a slow earlier response can resolve AFTER a newer one. Each
  // load claims a seq at start and bails before every post-await mutation once a
  // newer load has superseded it — a stale snapshot never reaches setState (and
  // so never reaches the inline open-stamp below, which is gated on this path).
  // Unmount also bumps this (cleanup effect below): a load in flight when the
  // viewer closes the panel is INVALIDATED, so a late response never setStates a
  // dead component AND never POSTs /bell/open for a snapshot the viewer closed
  // before seeing (spec §7.2 — the watermark advances only to what was seen).
  const loadSeqRef = useRef(0);

  // Optimistic read-clear state. Persists across refetches (session-scoped Set)
  // so a resolve refetch never un-clears a dot and the read POST fires at most
  // once per row (first tap only).
  const [readClearedIds, setReadClearedIds] = useState<Set<string>>(() => new Set());
  const readFiredRef = useRef<Set<string>>(new Set());

  // `isRefetch` distinguishes the mount/Retry load (announce the count) from a
  // post-Resolve/Save refetch (announce completion) — BELL-3.
  const load = useCallback(
    async (isRefetch = false) => {
      // Claim this load's sequence number. `setState({loading})` is pre-await, so
      // a newer load simply overwrites it — but every POST-await mutation below
      // is guarded on `seq === loadSeqRef.current` so a superseded (stale) load
      // never clobbers the newer snapshot's state, announce, or open-stamp.
      const seq = ++loadSeqRef.current;
      setState({ status: "loading" });
      let res: Response;
      try {
        res = await fetch(FEED_ENDPOINT, { cache: "no-store" });
      } catch {
        if (seq !== loadSeqRef.current) return;
        setState({ status: "error" });
        setLiveMessage("Notifications didn't load");
        return;
      }
      if (seq !== loadSeqRef.current) return;
      if (!res.ok) {
        setState({ status: "error" });
        setLiveMessage("Notifications didn't load");
        return;
      }
      let body: BellFeedBody;
      try {
        body = (await res.json()) as BellFeedBody;
      } catch {
        if (seq !== loadSeqRef.current) return;
        setState({ status: "error" });
        setLiveMessage("Notifications didn't load");
        return;
      }
      if (seq !== loadSeqRef.current) return;
      setState({ status: "ready", feed: body });

      // BELL-3 announce: a refetch reports completion; the first load reports the
      // active count (or the empty state), so a screen reader hears the snapshot.
      if (isRefetch) {
        setLiveMessage("Notifications updated");
      } else if (body.entries.length === 0) {
        setLiveMessage("No notifications");
      } else {
        const activeCount = body.entries.filter((e) => e.state === "active").length;
        setLiveMessage(
          activeCount === 0
            ? "No active notifications"
            : activeCount === 1
              ? "1 active notification"
              : `${activeCount} active notifications`,
        );
      }

      // Snapshot-safe open: stamp the watermark to exactly the snapshot the viewer
      // saw, THEN refetch the badge. Fail-quiet — a failed open never breaks the
      // rendered panel; the badge simply keeps its last-known value.
      if (openedForRef.current !== body.seenThrough) {
        openedForRef.current = body.seenThrough;
        try {
          await fetch(OPEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seenThrough: body.seenThrough }),
          });
        } catch {
          // fail-quiet (spec §7.2)
        }
        onOpened();
      }
    },
    [onOpened],
  );

  // Fires the `/bell/read` POST once with the SERVER activityAt and clears the
  // unread marker optimistically. Shared by the row toggle's onClick (spec
  // §3.1/D3, Task 7: the toggle is mark-read-only, no expand/collapse state)
  // and mark-all-read (no per-row navigation side effect either way — no
  // panel-jump / state clobber). Fail-quiet (spec §4): a failed POST leaves the
  // marker cleared for the session; the readFiredRef guard keeps it at exactly
  // once per row.
  const markRead = useCallback((entry: BellEntry) => {
    if (readFiredRef.current.has(entry.alertId)) return;
    readFiredRef.current.add(entry.alertId);
    setReadClearedIds((prev) => new Set(prev).add(entry.alertId));
    void (async () => {
      try {
        await fetch(READ_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: entry.alertId, seenActivityAt: entry.activityAt }),
        });
      } catch {
        // fail-quiet: the dot stays cleared this session (spec §4)
      }
    })();
  }, []);

  // Mount-once load + unmount invalidation (R4 Finding 1). didLoadRef keeps the
  // load (and its exactly-once open POST) from double-firing within a live
  // mount. The cleanup bumps loadSeqRef so an in-flight load is INVALIDATED at
  // teardown — its `seq !== loadSeqRef.current` guard bails before any
  // post-await mutation, so a late response never setStates the unmounted panel
  // and never POSTs /bell/open for a snapshot the viewer closed before seeing
  // (spec §7.2). Resetting didLoadRef in the cleanup lets React's dev-only
  // StrictMode remount (teardown → re-run) re-fire the load after its first
  // pass was invalidated; a genuine close unmounts the whole panel, so the next
  // open is a fresh instance regardless.
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (!didLoadRef.current) {
      didLoadRef.current = true;
      void load();
    }
    return () => {
      loadSeqRef.current += 1;
      didLoadRef.current = false;
    };
  }, [load]);

  // Ping refetch (spec §5.4 — "refetch the feed too, if the panel is open").
  // A realtime `changed` while the panel is open advances `pingSignal`; we
  // refetch the feed in place via the SAME path the resolve/save settle uses
  // (`load(true)` → BELL-3 "Notifications updated" announce, session-scoped
  // read-cleared Set preserved, openedForRef guard suppresses a duplicate
  // /bell/open for an already-stamped snapshot). Ref-compare skips the initial
  // mount value so only a genuine post-mount push triggers a refetch — the
  // effect must not double-fire alongside the mount-once load above.
  const lastPingRef = useRef(pingSignal);
  useEffect(() => {
    if (pingSignal === lastPingRef.current) return;
    lastPingRef.current = pingSignal;
    void load(true);
  }, [pingSignal, load]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const now = new Date();

  let body: React.ReactNode;
  if (state.status === "loading") {
    body = (
      <p data-testid="bell-loading" className="py-8 text-center text-sm text-text-subtle">
        Loading notifications…
      </p>
    );
  } else if (state.status === "error") {
    body = (
      <div data-testid="bell-error" className="rounded-md bg-surface-sunken px-4 py-8 text-center">
        <p className="text-sm text-text">
          {renderCatalogEmphasis(getRequiredDougFacing("ALERT_BELL_FEED_FAILED"))}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Retry
        </button>
      </div>
    );
  } else {
    const { feed } = state;
    const active = feed.entries.filter((e) => e.state === "active");
    const history = feed.entries.filter((e) => e.state === "history");
    if (feed.entries.length === 0) {
      body = (
        <div
          data-testid="bell-empty"
          className="rounded-xl bg-surface-sunken px-4 py-9 text-center"
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-2.5 inline-flex size-11 items-center justify-center rounded-full bg-surface text-status-positive shadow-(--shadow-tile)"
          >
            <Check className="size-[22px]" />
          </span>
          <p className="text-sm font-semibold text-text">You&rsquo;re all caught up.</p>
          <p className="mt-1 text-xs text-text-faint">
            No active alerts. History window: {feed.historyDays} days
          </p>
        </div>
      );
    } else {
      body = (
        <>
          {active.length > 0 ? (
            // Full-bleed (-mx negates the scroll container's px-2/px-2.5) so the
            // severity rail hugs the card edge and the inter-row dividers span the
            // full width — DESIGN.md §16.
            <section
              data-testid="bell-section-active"
              aria-label="Active notifications"
              className="-mx-2 sm:-mx-2.5"
            >
              {/* BELL-2: visible count eyebrow. textContent carries "Active" + the
                  count for a11y/tests (DESIGN.md §16 eyebrow, "Active · N"). */}
              <h3
                data-testid="bell-section-active-heading"
                className="px-4 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wider text-text-faint tabular-nums"
              >
                Active · {active.length}
              </h3>
              {active.length >= GROUP_THRESHOLD && feed.activeTruncated === false
                ? // Grouped mode (spec §1.2/§1.3): static severity dividers, one
                  // per non-empty tier in Critical→Warning→Notice order. Fail-closed
                  // (§1.1 R5): strict `=== false`, so a missing/non-boolean
                  // activeTruncated renders flat. Suppressed on an active-truncated
                  // feed (§1.1 R3/R4): a recency-capped active window cannot honor
                  // severity-completeness, so the flat list + truncation row is the
                  // honest signal. activityAt-DESC order is preserved within tiers.
                  groupActiveBySeverity(active).map((group) => (
                    <div key={group.tone}>
                      {/* Subordinate to the section's uppercase "Active · N"
                          eyebrow: sentence-case, non-tracked, text-subtle (AA on
                          surface) so two stacked uppercase-tracked label tiers
                          don't read as competing eyebrows (impeccable critique
                          P2). 12px matches the shipped eyebrow size. `label`
                          from TONE: critical→"Critical", notice→"Warning",
                          info→"Notice" (display vocab; see TONE map). */}
                      <h4
                        data-testid={`bell-section-active-tier-${group.tone}`}
                        className="px-4 pb-1 pt-2 text-xs font-semibold text-text-subtle tabular-nums"
                      >
                        {TONE[group.tone].label} · {group.rows.length}
                      </h4>
                      {group.rows.map((entry, j) => (
                        <div key={entry.alertId}>
                          {j > 0 ? (
                            <div aria-hidden="true" className="mx-4 h-px bg-border" />
                          ) : null}
                          <ActiveRow
                            entry={entry}
                            now={now}
                            readCleared={readClearedIds.has(entry.alertId)}
                            onMarkRead={() => markRead(entry)}
                            onRefetch={() => void load(true)}
                          />
                        </div>
                      ))}
                    </div>
                  ))
                : // Flat mode (unchanged from today): single activity-ordered list.
                  active.map((entry, i) => (
                    <div key={entry.alertId}>
                      {i > 0 ? <div aria-hidden="true" className="mx-4 h-px bg-border" /> : null}
                      <ActiveRow
                        entry={entry}
                        now={now}
                        readCleared={readClearedIds.has(entry.alertId)}
                        onMarkRead={() => markRead(entry)}
                        onRefetch={() => void load(true)}
                      />
                    </div>
                  ))}
            </section>
          ) : null}
          {history.length > 0 ? (
            <section
              data-testid="bell-section-history"
              aria-label="History"
              // Full-bleed on the SAME `-mx` as the active section: the scroll
              // container's px-2/px-2.5 would otherwise inset this band by 8/10px,
              // putting its timestamps on a different column than the active
              // rows' and its divider on a shorter line. Both bands now share one
              // content box, so one right edge serves the whole panel.
              className="-mx-2 mt-3 border-t border-border pt-3 text-text-subtle sm:-mx-2.5"
            >
              <h3 className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-text-faint">
                Earlier · last {feed.historyDays} days
              </h3>
              {history.map((entry) => (
                <HistoryRow key={entry.alertId} entry={entry} now={now} />
              ))}
            </section>
          ) : null}
          {feed.truncated ? (
            <p
              data-testid="bell-truncation-row"
              className="mt-3 border-t border-border pt-3 text-xs text-text-subtle"
            >
              {viewerIsDeveloper
                ? `Showing the first ${feed.feedCap}. Older items are in telemetry.`
                : `Showing the first ${feed.feedCap}. Older items age out of this list.`}
            </p>
          ) : null}
          {viewerIsDeveloper ? (
            <>
              {/* D9: activity-log link — dev-only, because the telemetry page is
                  the only real activity surface (no user-facing activity log
                  exists for Doug; a dead link would violate PRODUCT principle 5). */}
              <a
                href="/admin/dev/telemetry"
                data-testid="bell-activity-log"
                className="mt-3 flex min-h-tap-min items-center justify-center gap-1.5 rounded-lg border-t border-border pt-3 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                View activity log
                <ArrowRight aria-hidden="true" className="size-[15px]" />
              </a>
              <DevFooter
                historyDays={feed.historyDays}
                feedCap={feed.feedCap}
                onSaved={() => void load(true)}
              />
            </>
          ) : null}
        </>
      );
    }
  }

  // Mark-all-read (spec D3): visible ONLY when there are unread active rows AND
  // the feed is not truncated (a truncated feed hides unread rows the client
  // cannot reach, so "mark all" would lie — R3/R4). Clears each via the decoupled
  // markRead (no navigation side effect — R7); the button hides the instant the last
  // marker clears (activeUnread recomputes empty → showMarkAll false).
  const readyFeed = state.status === "ready" ? state.feed : null;
  const activeUnread = readyFeed
    ? readyFeed.entries.filter(
        (e) => e.state === "active" && e.unread && !readClearedIds.has(e.alertId),
      )
    : [];
  const showMarkAll = activeUnread.length > 0 && !(readyFeed?.truncated ?? false);
  const onMarkAllRead = () => activeUnread.forEach((entry) => markRead(entry));

  return (
    <>
      {/* Full-screen click-catcher: a dark scrim on mobile (bottom-sheet), fully
          transparent on desktop (the anchored dropdown blocks outside clicks but
          does not dim the page). This is a NON-INTERACTIVE, aria-hidden scrim —
          a MOUSE-only dismiss convenience — deliberately NOT a focusable control
          and NOT part of the a11y tree: with the dialog's `aria-modal="true"`, a
          focusable "Dismiss" button living OUTSIDE the dialog subtree would
          contradict the "outside content is unavailable" contract and get
          flagged as focusable-outside-modal. Keyboard and AT users dismiss via
          Esc (the keydown handler) and the in-dialog Close button; the scrim is
          purely a click-outside affordance for pointer users. */}
      <div
        aria-hidden="true"
        data-testid="bell-panel-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay-scrim motion-safe:animate-[step3-details-scrim-in_var(--duration-normal)_ease-out] sm:animate-none sm:bg-transparent"
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bell-panel-heading"
        data-testid="bell-panel"
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[420px] rounded-t-lg bg-surface text-text shadow-popover motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)] motion-reduce:animate-none sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+10px)] sm:mx-0 sm:w-[420px] sm:rounded-lg sm:border sm:border-border sm:origin-top-right sm:motion-safe:animate-[bell-pop-in_var(--duration-normal)_var(--ease-out-quart)]"
      >
        {/* Desktop caret pointing up at the bell (DI-9); hidden on mobile. */}
        <span
          aria-hidden="true"
          className="absolute right-3 top-[-6px] hidden size-3 rotate-45 rounded-tl-[3px] border-l border-t border-border bg-surface sm:block"
        />
        {/* BELL-3: persistent sr-only polite live region, present in EVERY panel
            state from mount (loading | error | ready | empty) so it holds one
            stable tree position across state transitions — the announce text
            swaps INTO a pre-existing region, so screen readers that skip
            insert-time announcements on a freshly mounted node still fire (the
            PCR-1 pattern). A real sr-only element (NOT display:contents, whose
            live-region role can be dropped from the a11y tree in Safari/VoiceOver)
            that is out of layout flow, so it adds no gap. */}
        <div data-testid="bell-live-region" role="status" aria-live="polite" className="sr-only">
          {liveMessage}
        </div>
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 rounded-pill bg-border sm:hidden"
        />
        <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-4 sm:px-5 sm:pt-4">
          <h2 id="bell-panel-heading" className="text-[17px] font-semibold text-text-strong">
            Notifications
          </h2>
          <div className="flex items-center gap-1">
            {showMarkAll ? (
              <button
                type="button"
                data-testid="bell-mark-all-read"
                onClick={onMarkAllRead}
                className="inline-flex min-h-tap-min items-center rounded-sm px-2 text-[13px] font-medium text-accent-on-bg transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Mark all read
              </button>
            ) : null}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-testid="bell-panel-close"
              className="-mr-1 inline-flex size-tap-min items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
        </div>
        <div className="max-h-panel-max-mobile overflow-y-auto bg-surface px-2 pb-3 sm:max-h-panel-max sm:px-2.5">
          {body}
        </div>
      </div>
    </>
  );
}
