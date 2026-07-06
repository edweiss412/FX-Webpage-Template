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
 *   - Read gesture (spec §3.1/D3): the FIRST expand of a row POSTs `/bell/read`
 *     with the SERVER `activityAt` as `seenActivityAt` and clears the unread
 *     dot optimistically (opacity flip, fixed slot — no layout shift). A failed
 *     read POST leaves the dot cleared for the session (fail-quiet, §4).
 *   - Dev footer (`viewerIsDeveloper` only): the live window/cap plus an inline
 *     two-input edit that POSTs `/bell/config`; a 400 renders the response's
 *     bounds (no silent clamp), a success refetches the feed.
 *
 * Copy (invariant 5 — no raw codes in the DOM): titles/messages/helpful context
 * come from the catalog via `messageFor`/`lookupHelpfulContext`/`isMessageCode`;
 * auto notes come from the feed's catalog-derived `autoResolveNote`; button and
 * footer labels are UI chrome (uncataloged, like "Dismiss"/"Retry"). The error
 * state renders `ALERT_BELL_FEED_FAILED`. An uncataloged row code falls back to
 * a generic title (never the raw code string).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import {
  getRequiredDougFacing,
  isMessageCode,
  lookupHelpfulContext,
  messageFor,
} from "@/lib/messages/lookup";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import { raisedAtSuffix } from "@/lib/time/raisedAt";
import { retryWatchSubscriptionFormAction } from "@/app/admin/actions";
import { RetryWatchButton } from "@/components/admin/RetryWatchButton";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";
import type { BellEntry, BellFeedResult } from "@/lib/admin/bellFeed";

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

// Producer context is interpolated into the catalog template exactly as the
// retired AlertBanner did (`messageFor(code, (context ?? undefined) as never)`)
// so codes whose copy carries `<placeholder>` markers render the real value,
// not raw template text. A null/absent context yields the untouched entry.
function rowCopy(
  code: string,
  context: Record<string, unknown> | null,
): { title: string; message: string | null } {
  const entry = isMessageCode(code) ? messageFor(code, (context ?? undefined) as never) : null;
  return { title: entry?.title ?? FALLBACK_TITLE, message: entry?.dougFacing ?? null };
}

function rowHelpfulContext(code: string, context: Record<string, unknown> | null): string | null {
  return isMessageCode(code) ? lookupHelpfulContext(code, (context ?? undefined) as never) : null;
}

// The resolve route the entry posts to: show-scoped when the row carries a
// slug (per-show alerts never use the global route — matches PerShowAlertSection
// and the global route's own 400 scope door), global otherwise.
function resolveUrl(entry: BellEntry): string {
  return entry.slug
    ? `/api/admin/show/${entry.slug}/alerts/${entry.alertId}/resolve`
    : `/api/admin/admin-alerts/${entry.alertId}/resolve`;
}

function OccurrenceChip({ occurrences }: { occurrences: number }) {
  if (typeof occurrences !== "number" || occurrences <= 1) return null;
  return (
    <span className="rounded-sm bg-surface-sunken px-1 text-xs tabular-nums text-text-subtle">
      ×{occurrences}
    </span>
  );
}

function IdentityLine({ entry }: { entry: BellEntry }) {
  const text = entry.identity ? describeAlert(entry.identity, { includePii: true }) : null;
  if (!text) return null;
  return <p className="mt-0.5 wrap-break-word text-sm text-text-subtle">{text}</p>;
}

// Shared chrome for the non-form action buttons/links (Resolve, telemetry link,
// action chip) — mirrors the banner's action-link affordance.
const ACTION_CHROME =
  "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60";

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
    // and must not stay stuck at "Resolving…".
    setResolving(false);
    onRefetch();
  }, [entry, onRefetch, resolving]);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {entry.isHealth ? (
        <a
          href="/admin/dev/telemetry#health"
          data-testid={`bell-telemetry-${entry.alertId}`}
          className={ACTION_CHROME}
        >
          View in telemetry
        </a>
      ) : entry.isAutoResolving ? (
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
          className={ACTION_CHROME}
        >
          {resolving ? "Resolving…" : "Resolve"}
        </button>
      )}
      {/* Carry-over from the retired AlertBanner: the watch alert's single-tap
          Retry form (idempotent — no two-tap confirm). Pending state derives
          from useFormStatus inside RetryWatchButton, so the button re-enables
          when the Server Action returns even on a no-revalidate failure path. */}
      {!entry.isHealth && isWatch ? (
        <form action={retryWatchSubscriptionFormAction}>
          <RetryWatchButton ringOffset="surface" />
        </form>
      ) : null}
      {entry.action ? (
        <a
          href={entry.action.href}
          data-testid={`bell-action-${entry.alertId}`}
          {...(entry.action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={ACTION_CHROME}
        >
          {entry.action.label}
          {entry.action.external ? <span aria-hidden="true"> ↗</span> : null}
        </a>
      ) : null}
    </div>
  );
}

function ActiveRow({
  entry,
  now,
  expanded,
  readCleared,
  onToggle,
  onRefetch,
}: {
  entry: BellEntry;
  now: Date;
  expanded: boolean;
  readCleared: boolean;
  onToggle: () => void;
  onRefetch: () => void;
}) {
  const { title, message } = rowCopy(entry.code, entry.context);
  const helpful = rowHelpfulContext(entry.code, entry.context);
  // Dot shows only while genuinely unread AND not yet optimistically cleared
  // this session (a failed read POST does not un-clear it — spec §4 fail-quiet).
  const dotVisible = entry.unread && !readCleared;
  return (
    <div
      data-testid={`bell-entry-${entry.alertId}`}
      className="border-b border-border py-3 last:border-b-0"
    >
      <button
        type="button"
        data-testid={`bell-entry-toggle-${entry.alertId}`}
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {/* Fixed size-2 dot slot: always occupies space (§14 no-layout-shift
            invariant); the dot fades between unread/read via opacity. */}
        <span aria-hidden="true" className="mt-1.5 inline-flex size-2 shrink-0">
          <span
            data-testid={`bell-unread-dot-${entry.alertId}`}
            className={`size-2 rounded-full bg-accent motion-safe:transition-opacity motion-safe:duration-fast ${
              dotVisible ? "opacity-100" : "opacity-0"
            }`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`min-w-0 wrap-break-word text-text-strong ${
                dotVisible ? "font-semibold" : "font-medium"
              }`}
            >
              {title}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <OccurrenceChip occurrences={entry.occurrences} />
              <span className="text-xs tabular-nums text-text-subtle">
                {raisedAtSuffix(entry.activityAt, now)}
              </span>
              {/* BELL-1: disclosure caret, shown ONLY when the code carries
                  helpfulContext (a context-less row expands to nothing beyond the
                  dot clear, so a caret there would be a lie). The full-row toggle
                  stays tappable on EVERY row (spec D3) — the caret is a visual
                  affordance, not a gate. aria-hidden: the button already carries
                  aria-expanded. Rotate is transform-only (no reflow), so the §14
                  no-layout-shift invariant holds. */}
              {helpful ? (
                <ChevronRight
                  aria-hidden="true"
                  data-testid={`bell-caret-${entry.alertId}`}
                  className={`size-4 shrink-0 text-text-subtle motion-safe:transition-transform motion-safe:duration-fast ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
              ) : null}
            </div>
          </div>
          {message ? (
            <p className="mt-0.5 wrap-break-word text-sm text-text-subtle">
              {renderEmphasis(message)}
            </p>
          ) : null}
          <IdentityLine entry={entry} />
        </div>
      </button>
      {/* helpfulContext disclosure, mirroring the banner's ErrorExplainer block.
          Rendered only when expanded AND the catalog carries helpful context. */}
      {expanded && helpful ? (
        <p
          data-testid={`bell-context-${entry.alertId}`}
          className="mt-2 ml-5 wrap-break-word text-sm text-text-subtle"
        >
          {renderEmphasis(helpful)}
        </p>
      ) : null}
      <div className="ml-5">
        <ActionCell entry={entry} onRefetch={onRefetch} />
      </div>
    </div>
  );
}

function HistoryRow({ entry, now }: { entry: BellEntry; now: Date }) {
  const { title } = rowCopy(entry.code, entry.context);
  const resolved = entry.resolvedAt ? `Resolved ${raisedAtSuffix(entry.resolvedAt, now)}` : null;
  return (
    <div
      data-testid={`bell-entry-${entry.alertId}`}
      className="flex flex-col border-b border-border py-3 last:border-b-0"
    >
      <p className="min-w-0 wrap-break-word font-medium">{title}</p>
      {resolved ? <p className="mt-0.5 text-xs tabular-nums">{resolved}</p> : null}
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
}: {
  viewerIsDeveloper: boolean;
  onClose: () => void;
  onOpened: () => void;
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

  // Per-row expand state and optimistic read-clear state. Both persist across
  // refetches (session-scoped Sets) so a resolve refetch never un-clears a dot
  // and the read POST fires at most once per row (first expand only).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [readClearedIds, setReadClearedIds] = useState<Set<string>>(() => new Set());
  const readFiredRef = useRef<Set<string>>(new Set());

  // `isRefetch` distinguishes the mount/Retry load (announce the count) from a
  // post-Resolve/Save refetch (announce completion) — BELL-3.
  const load = useCallback(
    async (isRefetch = false) => {
      setState({ status: "loading" });
      let res: Response;
      try {
        res = await fetch(FEED_ENDPOINT, { cache: "no-store" });
      } catch {
        setState({ status: "error" });
        setLiveMessage("Notifications didn't load");
        return;
      }
      if (!res.ok) {
        setState({ status: "error" });
        setLiveMessage("Notifications didn't load");
        return;
      }
      let body: BellFeedBody;
      try {
        body = (await res.json()) as BellFeedBody;
      } catch {
        setState({ status: "error" });
        setLiveMessage("Notifications didn't load");
        return;
      }
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

  // First expand of a row: fire the read POST once with the SERVER activityAt,
  // and clear the dot optimistically. A failed POST leaves the dot cleared
  // (fail-quiet, spec §4) — the ref guard keeps it at exactly once.
  const handleToggle = useCallback((entry: BellEntry) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.alertId)) next.delete(entry.alertId);
      else next.add(entry.alertId);
      return next;
    });
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

  // Mount-once load. The ref guard keeps the open POST at exactly once even if
  // React remounts the effect (StrictMode) or `load`'s identity changes.
  const didLoadRef = useRef(false);
  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void load();
  }, [load]);

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
          {renderEmphasis(getRequiredDougFacing("ALERT_BELL_FEED_FAILED"))}
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
          className="rounded-md bg-surface-sunken px-4 py-8 text-center"
        >
          <p className="text-sm font-medium text-text">You&rsquo;re all caught up.</p>
          <p className="mt-1 text-xs text-text-subtle">History window: {feed.historyDays} days</p>
        </div>
      );
    } else {
      body = (
        <>
          {active.length > 0 ? (
            <section data-testid="bell-section-active" aria-label="Active notifications">
              {/* BELL-2: visible count heading mirroring the history heading
                  style (the active section is un-dimmed — only the eyebrow label
                  uses text-text-subtle). Severity/show grouping stays deferred. */}
              <h3
                data-testid="bell-section-active-heading"
                className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle"
              >
                Active ({active.length})
              </h3>
              {active.map((entry) => (
                <ActiveRow
                  key={entry.alertId}
                  entry={entry}
                  now={now}
                  expanded={expandedIds.has(entry.alertId)}
                  readCleared={readClearedIds.has(entry.alertId)}
                  onToggle={() => handleToggle(entry)}
                  onRefetch={() => void load(true)}
                />
              ))}
            </section>
          ) : null}
          {history.length > 0 ? (
            <section
              data-testid="bell-section-history"
              aria-label="History"
              className="mt-4 text-text-subtle"
            >
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-subtle">
                History (last {feed.historyDays} days)
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
            <DevFooter
              historyDays={feed.historyDays}
              feedCap={feed.feedCap}
              onSaved={() => void load(true)}
            />
          ) : null}
        </>
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bell-panel-heading"
      data-testid="bell-panel"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Dismiss"
        data-testid="bell-panel-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-text-strong/40 motion-safe:transition-opacity motion-safe:duration-fast"
      />
      <div
        ref={containerRef}
        className="relative w-full max-w-[420px] rounded-t-md bg-surface text-text shadow-tile sm:rounded-md motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)] motion-reduce:animate-none"
      >
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
        <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
          <h2 id="bell-panel-heading" className="text-lg font-semibold text-text-strong">
            Notifications
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="bell-panel-close"
            className="-mr-2 inline-flex size-tap-min items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="max-h-panel-max-mobile overflow-y-auto bg-surface px-4 pb-5 sm:max-h-panel-max sm:px-6">
          {body}
        </div>
      </div>
    </div>
  );
}
