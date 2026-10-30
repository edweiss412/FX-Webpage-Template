"use client";

/**
 * components/offline/SavedCopyBar.tsx
 *
 * The pinned bar that tells a crew member they are looking at a saved copy
 * (spec 4.7.2). It renders `deriveBarView` (lib/offline/barState.ts) and
 * nothing else: the state, the tone, the icon and every word of the copy come
 * from there.
 *
 * It hydrates in exactly the state the server rendered, which is always
 * `hidden`. The server never sees the `fxav-served` meta (the worker injects it
 * into the stored HTML, spec 4.7.1) and cannot know the phone's connection or
 * clock, so the first client render reads none of them: the meta and the clock
 * are read in a mount effect (lib/offline/client/servedCopy.ts), and again on
 * each age tick, and the connection through `useOnlineStatus`,
 * whose hydrating snapshot is online. The saved state therefore appears on the
 * first commit after hydration, and until then the worker's injected CSS notice
 * is what the person sees.
 *
 * Once the bar has its readings it sets `data-fxav-bar="mounted"` on `<html>`,
 * which hides that CSS notice, and from then on the bar owns the notice. The
 * attribute is set in a layout effect after the commit that has the readings,
 * so the notice goes in the same frame the bar arrives. It is never removed: a
 * later render in this document is server content, and must not bring the
 * saved-copy notice back.
 *
 * The live region (role status, polite) is always mounted, server render
 * included, and the visible bar renders inside it. A region inserted together
 * with its text is not announced, so the region has to exist before the first
 * state change fills it. While the bar is hidden the region is empty: it
 * carries only layout classes (no padding, border or background), so it paints
 * nothing and has no height.
 *
 * The region, not the bar, is the crew shell's flex child, so it carries the
 * spec's Dimensional Invariants (4.7.2): `self-stretch` and `flex-none` against
 * the shell, and `sticky top-0` with `z-raised` against the viewport. The band
 * is the lowest one that lifts the bar above section content, whose positioned
 * elements carry no z-index. It cannot be higher: the header's avatar menu is
 * `z-dropdown` and comes earlier in tree order, so a tie would paint the bar
 * over the open menu. The icon is `flex-none` so a wrapping copy cannot shrink
 * it. tests/e2e/crew-offline-layout.spec.ts measures each of these.
 *
 * On a copy served `offline`, `slow` or `server-error` the bar asks the worker
 * to probe the page (spec 4.7.3) on the `online` event, on a `fresh-ready`
 * broadcast for this path, and every 30 seconds while `navigator.onLine` is
 * true, one probe at a time. A `saved` reply shows `updating`, writes a session
 * flag and reloads; `purged` reloads at once; `ended` shows `ended`; any other
 * reply changes nothing. The page the reload brings consumes the flag once and
 * shows `updated` for 4 seconds. An RSC refresh makes the mode `live`, which
 * ends the recovery: `updating` goes, and a probe still out is ignored.
 *
 * On any saved copy the bar also puts the section on screen into the URL's `s`
 * (spec 4.7.4): the copy is stored without its query, so it opens on its own
 * section whatever `?s=` says. The section is read from CrewSections' wrapper
 * in the DOM, so no file under components/crew changes. A URL whose `s`
 * already names that section is not rewritten.
 *
 * `slug` and `shareToken` are accepted for the bar's links (spec 4.7.2).
 */
import { Check, Clock, RefreshCw, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

import { deriveBarView, type BarMode, type BarView } from "@/lib/offline/barState";
import { postToWorker, serviceWorkerContainer } from "@/lib/offline/client/messaging";
import { useOnlineStatus } from "@/lib/offline/client/online";
import { reloadPage } from "@/lib/offline/client/reload";
import { readServedCopy, type ServedCopyReading } from "@/lib/offline/client/servedCopy";
import { cn } from "@/lib/ui/cn";

export type SavedCopyBarProps = {
  /** CrewShell's render time, ISO 8601 UTC. */
  renderedAt: string;
  /** The show's last sync found the sheet unavailable (`isSheetUnavailable`). */
  sheetUnavailable: boolean;
  /** For the bar's links (spec 4.7.2). */
  slug: string;
  shareToken: string | undefined;
};

/** How often the age in the copy is re-evaluated (spec 4.7.2). */
const AGE_TICK_MS = 60_000;

/** How often a saved copy probes while the phone reports a connection (spec 4.7.3). */
const PROBE_INTERVAL_MS = 30_000;

/**
 * How long the page waits for a probe's reply. The worker fetches the page
 * under NAV_BUDGET_MS (8 s) and may then ask the status route under
 * STATUS_TIMEOUT_MS (5 s) before it commits, so a page that gave up sooner
 * would read a slow `saved` as nothing. Under PROBE_INTERVAL_MS, so a reply
 * that never comes frees the next tick. A literal because DESIGN.md §5.5 lists
 * it and the timing scanner resolves only numeric-literal constants;
 * savedCopyBarRecovery.test.tsx pins both bounds.
 */
const PROBE_TIMEOUT_MS = 20_000;

/** How long `updated` shows after a recovery reload (spec 4.7.2). */
const JUST_UPDATED_MS = 4_000;

const MOUNTED_ATTRIBUTE = "data-fxav-bar";

/** The session flag a recovery leaves for the page its reload brings (spec 4.7.3). */
const UPDATED_FLAG = "fxav-bar-updated";

/** The serve modes a probe can recover from; `ended` is final and `live` needs none. */
const PROBE_MODES: ReadonlySet<BarMode> = new Set(["offline", "slow", "server-error"]);

/** What a probe's reply has done to this page: nothing yet, a reload under way, or ended. */
type Recovery = "idle" | "updating" | "ended";

const ICONS: Record<NonNullable<BarView["icon"]>, LucideIcon> = {
  "signal-off": WifiOff,
  clock: Clock,
  alert: TriangleAlert,
  sync: RefreshCw,
  check: Check,
};

function isFreshReadyFor(data: unknown, path: string): boolean {
  if (typeof data !== "object" || data === null) return false;
  const message = data as { type?: unknown; url?: unknown };
  return message.type === "fresh-ready" && message.url === path;
}

/**
 * Session storage throws where site data is blocked (a SecurityError on
 * access). Every touch is guarded, so a store that throws loses the flag and
 * nothing else.
 */
function writeUpdatedFlag(): void {
  try {
    window.sessionStorage.setItem(UPDATED_FLAG, "1");
  } catch {
    // The reload still brings the fresh page; it just will not say so.
  }
}

/** Reads and removes the flag, so one recovery shows `updated` once. */
function takeUpdatedFlag(): boolean {
  try {
    if (window.sessionStorage.getItem(UPDATED_FLAG) === null) return false;
    window.sessionStorage.removeItem(UPDATED_FLAG);
    return true;
  } catch {
    return false;
  }
}

/**
 * Puts the section CrewSections rendered into the URL's `s`, keeping every
 * other parameter (spec 4.7.4). The state is `null`, as CrewSections' own
 * pushState passes, so Next's patched history copies its router state in and
 * keeps useSearchParams in step. The page sits in the route's loading.tsx
 * Suspense boundary, which React hydrates in a later commit than the app
 * router's, so that patch is in place by the time this runs.
 */
function showRenderedSectionInUrl(): void {
  const section = document
    .querySelector('[data-testid="crew-shell-sections"]')
    ?.getAttribute("data-active-section");
  if (section === undefined || section === null || section === "") return;
  const url = new URL(window.location.href);
  // Each replaceState through Next's patched history dispatches an
  // ACTION_RESTORE, so a URL that already names the section is left alone.
  if (url.searchParams.get("s") === section) return;
  url.searchParams.set("s", section);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function SavedCopyBar({ renderedAt, sheetUnavailable }: SavedCopyBarProps) {
  const online = useOnlineStatus();
  // The render time this bar mounted with. A different one later means an RSC
  // refresh brought server content, so the page is live (spec 4.7.2).
  const [mountRenderedAt] = useState(renderedAt);
  const [reading, setReading] = useState<ServedCopyReading | null>(null);
  const [recovery, setRecovery] = useState<Recovery>("idle");
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    const first = readServedCopy();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render: neither the server render nor the hydrating one may read the meta or the clock, so the commit after hydration IS the mechanism (the ShowRowActions.tsx:247 waiver shape). It runs once per mount and cannot cascade.
    setReading(first);
    // Session storage is client-only too, so the flag is read here, once; a
    // StrictMode second run finds it already taken and leaves the state alone.
    if (takeUpdatedFlag()) setJustUpdated(true);
    if (first.mode !== "live") showRenderedSectionInUrl();
    const tick = window.setInterval(() => {
      setReading(readServedCopy());
    }, AGE_TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!justUpdated) return;
    const timer = window.setTimeout(() => setJustUpdated(false), JUST_UPDATED_MS);
    return () => window.clearTimeout(timer);
  }, [justUpdated]);

  const hasReading = reading !== null;
  useLayoutEffect(() => {
    if (hasReading) document.documentElement.setAttribute(MOUNTED_ATTRIBUTE, "mounted");
  }, [hasReading]);

  let mode: BarMode | null = null;
  if (reading !== null) {
    if (renderedAt !== mountRenderedAt) mode = "live";
    else if (recovery === "ended") mode = "ended";
    else mode = reading.mode;
  }
  const probing = mode !== null && PROBE_MODES.has(mode) && recovery === "idle";

  useEffect(() => {
    if (!probing) return;
    // Set on cleanup: an RSC refresh made the page live, a reply started a
    // reload or showed `ended`, or the bar unmounted. A reply still out is then
    // no longer this page's to act on.
    let cancelled = false;
    let inFlight = false;
    let timer: number | undefined;

    const probe = (): void => {
      if (inFlight) return;
      inFlight = true;
      const reply = postToWorker(
        { type: "probe", url: window.location.pathname },
        { timeoutMs: PROBE_TIMEOUT_MS },
      );
      void Promise.resolve(reply).then(({ outcome }) => {
        inFlight = false;
        if (cancelled) return;
        if (outcome === "saved") {
          setRecovery("updating");
          writeUpdatedFlag();
          reloadPage();
        } else if (outcome === "purged") {
          reloadPage();
        } else if (outcome === "ended") {
          setRecovery("ended");
        }
        // Anything else (failed, kept, skipped, a timeout, no worker) leaves
        // the saved copy on screen as it is.
      });
    };
    const followConnection = (): void => {
      window.clearInterval(timer);
      timer = navigator.onLine ? window.setInterval(probe, PROBE_INTERVAL_MS) : undefined;
    };
    const onOnline = (): void => {
      followConnection();
      probe();
    };
    const onMessage = (event: MessageEvent): void => {
      if (isFreshReadyFor(event.data, window.location.pathname)) probe();
    };

    const container = serviceWorkerContainer();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", followConnection);
    container?.addEventListener("message", onMessage);
    followConnection();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", followConnection);
      container?.removeEventListener("message", onMessage);
    };
  }, [probing]);

  let view: BarView | null = null;
  if (reading !== null && mode !== null) {
    view = deriveBarView({
      ...reading,
      mode,
      online,
      savedAt: mode === "live" ? renderedAt : reading.savedAt,
      sheetUnavailable,
      // An RSC refresh during a reload makes the page live, and live content
      // is the latest there is: the bar stops saying it is loading.
      updating: recovery === "updating" && mode !== "live",
      justUpdated,
    });
  }
  // `hidden` is the one state with no icon, and it shows nothing.
  const Icon = view === null || view.icon === null ? null : ICONS[view.icon];

  return (
    <div
      data-testid="saved-copy-bar-region"
      role="status"
      aria-live="polite"
      className="sticky top-0 z-raised flex-none self-stretch"
    >
      {view !== null && Icon !== null && (
        <div
          data-testid="saved-copy-bar"
          data-state={view.state}
          className={cn("flex items-start gap-2 px-4 py-2 text-sm", view.tone)}
        >
          <Icon
            aria-hidden="true"
            data-testid="saved-copy-bar-icon"
            className={cn(
              "mt-0.5 size-4 flex-none",
              view.icon === "sync" && "animate-spin motion-reduce:animate-none",
            )}
          />
          <p data-testid="saved-copy-bar-content">
            {view.lead !== null && (
              <>
                <strong className="font-semibold">{view.lead}</strong>{" "}
              </>
            )}
            {view.body}
          </p>
        </div>
      )}
    </div>
  );
}
