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
 * state change fills it. While the bar is hidden the region is empty and
 * carries no class, so it paints nothing and has no height.
 *
 * `slug` and `shareToken` are accepted for the bar's links (spec 4.7.2). The
 * layout classes behind the spec's Dimensional Invariants (sticky placement,
 * stretch, the icon's flex-none) are not here yet; they land with their
 * real-browser assertions.
 */
import { Check, Clock, RefreshCw, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

import { deriveBarView, type BarView } from "@/lib/offline/barState";
import { useOnlineStatus } from "@/lib/offline/client/online";
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

const MOUNTED_ATTRIBUTE = "data-fxav-bar";

const ICONS: Record<NonNullable<BarView["icon"]>, LucideIcon> = {
  "signal-off": WifiOff,
  clock: Clock,
  alert: TriangleAlert,
  sync: RefreshCw,
  check: Check,
};

export function SavedCopyBar({ renderedAt, sheetUnavailable }: SavedCopyBarProps) {
  const online = useOnlineStatus();
  // The render time this bar mounted with. A different one later means an RSC
  // refresh brought server content, so the page is live (spec 4.7.2).
  const [mountRenderedAt] = useState(renderedAt);
  const [reading, setReading] = useState<ServedCopyReading | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load-bearing second render: neither the server render nor the hydrating one may read the meta or the clock, so the commit after hydration IS the mechanism (the ShowRowActions.tsx:247 waiver shape). It runs once per mount and cannot cascade.
    setReading(readServedCopy());
    const tick = window.setInterval(() => {
      setReading(readServedCopy());
    }, AGE_TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  const hasReading = reading !== null;
  useLayoutEffect(() => {
    if (hasReading) document.documentElement.setAttribute(MOUNTED_ATTRIBUTE, "mounted");
  }, [hasReading]);

  let view: BarView | null = null;
  if (reading !== null) {
    const mode = renderedAt === mountRenderedAt ? reading.mode : "live";
    view = deriveBarView({
      ...reading,
      mode,
      online,
      savedAt: mode === "live" ? renderedAt : reading.savedAt,
      sheetUnavailable,
      updating: false,
      justUpdated: false,
    });
  }
  // `hidden` is the one state with no icon, and it shows nothing.
  const Icon = view === null || view.icon === null ? null : ICONS[view.icon];

  return (
    <div data-testid="saved-copy-bar-region" role="status" aria-live="polite">
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
              "mt-0.5 size-4",
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
