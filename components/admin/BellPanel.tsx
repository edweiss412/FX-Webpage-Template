"use client";
/**
 * components/admin/BellPanel.tsx (bell notification center Task 13, spec §7.2/§7.3)
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
 * Scope note (Task 13 = shell + sections + states): rows are static snapshot
 * renderings. Per-row read gesture, inline resolve/Retry actions, action-link
 * chips, and the developer config footer land in the follow-up interaction task.
 *
 * Copy (invariant 5 — no raw codes in the DOM): titles/messages come from the
 * catalog via `messageFor`/`isMessageCode`; the error state renders
 * `ALERT_BELL_FEED_FAILED` dougFacing. An uncataloged row code falls back to a
 * generic title (never the raw code string).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { getRequiredDougFacing, isMessageCode, messageFor } from "@/lib/messages/lookup";
import { describeAlert } from "@/lib/adminAlerts/describeAlert";
import { raisedAtSuffix } from "@/lib/time/raisedAt";
import type { BellEntry, BellFeedResult } from "@/lib/admin/bellFeed";

const FEED_ENDPOINT = "/api/admin/alerts/bell/feed";
const OPEN_ENDPOINT = "/api/admin/alerts/bell/open";

// The wire shape the feed route returns (kind stripped — feed/route.ts).
type BellFeedBody = Omit<Extract<BellFeedResult, { kind: "ok" }>, "kind">;

type PanelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; feed: BellFeedBody };

// Generic, non-code fallback title for a row whose code is uncataloged or has
// no catalog `title` (invariant 5: never surface the raw code).
const FALLBACK_TITLE = "Notification";

function rowCopy(code: string): { title: string; message: string | null } {
  const entry = isMessageCode(code) ? messageFor(code) : null;
  return { title: entry?.title ?? FALLBACK_TITLE, message: entry?.dougFacing ?? null };
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

function ActiveRow({ entry, now }: { entry: BellEntry; now: Date }) {
  const { title, message } = rowCopy(entry.code);
  return (
    <div
      data-testid={`bell-entry-${entry.alertId}`}
      className="flex gap-3 border-b border-border py-3 last:border-b-0"
    >
      {/* Fixed size-2 dot slot: always occupies space (§14 no-layout-shift
          invariant); the dot fades between unread/read via opacity. */}
      <span aria-hidden="true" className="mt-1.5 inline-flex size-2 shrink-0">
        <span
          data-testid={`bell-unread-dot-${entry.alertId}`}
          className={`size-2 rounded-full bg-accent motion-safe:transition-opacity motion-safe:duration-fast ${
            entry.unread ? "opacity-100" : "opacity-0"
          }`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-medium text-text-strong">{title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <OccurrenceChip occurrences={entry.occurrences} />
            <span className="text-xs tabular-nums text-text-subtle">
              {raisedAtSuffix(entry.activityAt, now)}
            </span>
          </div>
        </div>
        {message ? <p className="mt-0.5 text-sm text-text-subtle">{message}</p> : null}
        <IdentityLine entry={entry} />
      </div>
    </div>
  );
}

function HistoryRow({ entry, now }: { entry: BellEntry; now: Date }) {
  const { title } = rowCopy(entry.code);
  const resolved = entry.resolvedAt ? `Resolved ${raisedAtSuffix(entry.resolvedAt, now)}` : null;
  return (
    <div
      data-testid={`bell-entry-${entry.alertId}`}
      className="flex flex-col border-b border-border py-3 last:border-b-0"
    >
      <p className="min-w-0 font-medium">{title}</p>
      {resolved ? <p className="mt-0.5 text-xs tabular-nums">{resolved}</p> : null}
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
  // Which snapshot we have already stamped via /bell/open — prevents a duplicate
  // open POST for the same seenThrough across re-renders (spec §7.2 "exactly once").
  const openedForRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    let res: Response;
    try {
      res = await fetch(FEED_ENDPOINT, { cache: "no-store" });
    } catch {
      setState({ status: "error" });
      return;
    }
    if (!res.ok) {
      setState({ status: "error" });
      return;
    }
    let body: BellFeedBody;
    try {
      body = (await res.json()) as BellFeedBody;
    } catch {
      setState({ status: "error" });
      return;
    }
    setState({ status: "ready", feed: body });

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
  }, [onOpened]);

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
        <p className="text-sm text-text">{getRequiredDougFacing("ALERT_BELL_FEED_FAILED")}</p>
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
              {active.map((entry) => (
                <ActiveRow key={entry.alertId} entry={entry} now={now} />
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
                ? `Showing the first ${feed.feedCap} — older items are in telemetry`
                : `Showing the first ${feed.feedCap} — older items age out of this list.`}
            </p>
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
        <div className="max-h-[70vh] overflow-y-auto bg-surface px-4 pb-5 sm:max-h-[480px] sm:px-6">
          {body}
        </div>
      </div>
    </div>
  );
}
