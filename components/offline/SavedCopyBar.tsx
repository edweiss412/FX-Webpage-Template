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
 * When `updated`'s 4-second window ends, the bar fades out (spec 4.7.2
 * Transition Inventory): the same bar takes `opacity-0` with
 * `transition-opacity duration-normal`, and leaves on its own `transitionend`,
 * or after UPDATED_FADE_FALLBACK_MS if none comes. Under reduced motion it
 * leaves at once. The fade runs under the inputs the window ended with, kept
 * as a key, so any input change gives a different key, which cancels the fade
 * for good and renders the new state at once: inputs that flip back to the
 * same key do not resume it, and a window that ends under reduced motion
 * leaves no fade for the preference turning off to resume. Every other change
 * of state is instant, and no other element carries a transition or duration
 * class. The region never fades: only the visible bar leaves it.
 *
 * `SavedCopyBarView` paints one derived view: the region, the bar and the
 * fade's classes, with no state of its own. The inventory's pairs are pairs of
 * views, so its tests drive the view directly (preflight ruling D15), and
 * savedCopyBarTransitionAudit.test.ts declares a treatment for every
 * conditional in this file.
 *
 * `slug` and `shareToken` are accepted for the bar's links (spec 4.7.2).
 */
import { Check, Clock, RefreshCw, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";

import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import {
  deriveBarView,
  type BarInputs,
  type BarMode,
  type BarView,
  type BodyPart,
} from "@/lib/offline/barState";
import { postToWorker, serviceWorkerContainer } from "@/lib/offline/client/messaging";
import { useOnlineStatus } from "@/lib/offline/client/online";
import { reloadPage } from "@/lib/offline/client/reload";
import { useScrollPaddingTop } from "@/lib/offline/client/scrollPadding";
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

/**
 * How long the `updated` fade may run before the bar leaves without its
 * `transitionend`, which a transition that does not run (under a
 * `display: none` ancestor, say) never sends. The fade is on `duration-normal`,
 * 220 ms (app/globals.css), the token nearest the spec's 200 ms: a token
 * rather than a literal class, so the reduced-motion collapse that zeroes every
 * duration token reaches it. A literal here because DESIGN.md §5.5 lists it and
 * the timing scanner resolves only numeric-literal constants;
 * savedCopyBarTransitionAudit.test.ts pins it to the token.
 */
const UPDATED_FADE_FALLBACK_MS = 220;

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

/**
 * Each run of the body's copy, by kind. The relative age is `aria-hidden`: the
 * minute tick rewrites it inside the live region, and a polite status region
 * re-reads its whole text whenever that text changes, so without this the bar
 * would be announced again about once a minute for the first hour. The saved
 * time stays announced, so assistive tech still hears how old the copy is
 * (spec 4.7.2 Accessibility). Both figures are set in tabular figures
 * (DESIGN.md 2.4), so "9 min ago" turning into "10 min ago" does not shift the
 * line, or the bar's height near a wrap.
 */
const PART_ATTRIBUTES: Record<BodyPart["kind"], { className?: string; "aria-hidden"?: "true" }> = {
  text: {},
  time: { className: "tabular-nums" },
  age: { className: "tabular-nums", "aria-hidden": "true" },
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
  const reducedMotion = usePrefersReducedMotion();
  // The render time this bar mounted with. A different one later means an RSC
  // refresh brought server content, so the page is live (spec 4.7.2).
  const [mountRenderedAt] = useState(renderedAt);
  const [reading, setReading] = useState<ServedCopyReading | null>(null);
  const [recovery, setRecovery] = useState<Recovery>("idle");
  const [justUpdated, setJustUpdated] = useState(false);
  // The inputs the `updated` fade runs under, as a key; null when none runs.
  const [fadeUnder, setFadeUnder] = useState<string | null>(null);
  // The last committed inputs' key, which the 4-second timer hands the fade.
  const committedInputs = useRef<string | null>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);

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
    const timer = window.setTimeout(() => {
      setJustUpdated(false);
      setFadeUnder(committedInputs.current);
    }, JUST_UPDATED_MS);
    return () => window.clearTimeout(timer);
  }, [justUpdated]);

  useEffect(() => {
    if (fadeUnder === null) return;
    const timer = window.setTimeout(() => setFadeUnder(null), UPDATED_FADE_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [fadeUnder]);

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

  let inputs: Omit<BarInputs, "justUpdated"> | null = null;
  if (reading !== null && mode !== null) {
    inputs = {
      ...reading,
      mode,
      online,
      savedAt: mode === "live" ? renderedAt : reading.savedAt,
      sheetUnavailable,
      // An RSC refresh during a reload makes the page live, and live content
      // is the latest there is: the bar stops saying it is loading.
      updating: recovery === "updating" && mode !== "live",
    };
  }
  const inputsKey = inputs === null ? null : JSON.stringify(inputs);
  useLayoutEffect(() => {
    committedInputs.current = inputsKey;
  }, [inputsKey]);

  // A fade runs only under the inputs its window ended with, and only with no
  // reduced-motion preference (so not before the preference is known either).
  // Once that stops holding, the fade is over for good: it is cleared in the
  // render that sees it fail, so neither inputs flipping back to the same key
  // nor the preference turning off brings the faded frame back. Setting state
  // during render is React's "adjust state when a value changes" form: React
  // renders again before it commits, so the stale frame is never painted.
  const fadeRuns = fadeUnder !== null && fadeUnder === inputsKey && reducedMotion === false;
  if (fadeUnder !== null && !fadeRuns) setFadeUnder(null);

  let view: BarView | null = null;
  let fading = false;
  if (inputs !== null) {
    view = deriveBarView({ ...inputs, justUpdated });
    // The window ended under these very inputs. If it ended on `updated`, the
    // bar is going from `updated` to `hidden`, and it fades.
    if (fadeRuns) {
      const leaving = deriveBarView({ ...inputs, justUpdated: true });
      if (leaving.state === "updated") {
        view = leaving;
        fading = true;
      }
    }
  }

  // The bar is sticky, so while it shows the page's scroll padding reserves its
  // height: a control focused from the keyboard then scrolls out from under it.
  const barShown = view !== null && view.state !== "hidden";
  useScrollPaddingTop(regionRef, barShown);

  return (
    <SavedCopyBarView
      ref={regionRef}
      view={view}
      fading={fading}
      onFadeEnd={() => setFadeUnder(null)}
    />
  );
}

export type SavedCopyBarViewProps = {
  /** The derived view; `null` (no readings yet) and `hidden` show no bar. */
  view: BarView | null;
  /** The `updated` view is fading out: the bar takes the fade's classes. */
  fading: boolean;
  /** The bar's own `transitionend`, which ends the fade. */
  onFadeEnd: () => void;
  /** The live region, which the container measures for the page's scroll padding. */
  ref?: Ref<HTMLDivElement>;
};

/**
 * One derived view, painted: the always-mounted live region and, unless the
 * view is `hidden`, the bar inside it. No state and no effects, so a pair of
 * views is a pair of renders.
 */
export function SavedCopyBarView({ view, fading, onFadeEnd, ref }: SavedCopyBarViewProps) {
  // `hidden` is the one state with no icon, and it shows nothing.
  const Icon = view === null || view.icon === null ? null : ICONS[view.icon];

  return (
    <div
      ref={ref}
      data-testid="saved-copy-bar-region"
      role="status"
      aria-live="polite"
      className="sticky top-0 z-raised flex-none self-stretch"
    >
      {view !== null && Icon !== null && (
        <div
          data-testid="saved-copy-bar"
          data-state={view.state}
          className={cn(
            // The bottom edge is on the bar, never the region: the hidden
            // region must stay at zero height. It also survives forced colors,
            // where every tone fill flattens to Canvas.
            "flex items-start gap-2 border-b border-border px-4 py-2 text-sm",
            view.tone,
            fading && "opacity-0 transition-opacity duration-normal",
          )}
          onTransitionEnd={(event) => {
            // A transition inside the bar is not the fade.
            if (event.target === event.currentTarget) onFadeEnd();
          }}
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
            {view.parts.map((part, index) => (
              // The runs of one view never reorder: the index is their identity.
              <span key={index} {...PART_ATTRIBUTES[part.kind]}>
                {part.text}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  );
}
