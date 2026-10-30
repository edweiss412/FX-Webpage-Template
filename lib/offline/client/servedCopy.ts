/**
 * lib/offline/client/servedCopy.ts
 *
 * What a page reads, after hydration, to know whether it is a saved copy
 * (spec 4.7.1): the `<meta name="fxav-served">` the worker injects into a
 * stored document, plus the clock the copy's age is measured against.
 *
 * Browser-only, and never called during a render: the server never sees the
 * meta and cannot know the phone's clock, so a render that read either would
 * not match its server HTML. Callers read it in an effect.
 */
import type { BarInputs } from "@/lib/offline/barState";
import type { ServeMode } from "@/lib/offline/navigation";

export type ServedCopyReading = Pick<BarInputs, "mode" | "savedAt" | "nowMs">;

// A record, not a list, so a new ServeMode member fails to compile until it is added here.
const SERVE_MODES: Record<ServeMode, true> = {
  offline: true,
  slow: true,
  "server-error": true,
  ended: true,
};

function isServeMode(value: string | null): value is ServeMode {
  return value !== null && Object.hasOwn(SERVE_MODES, value);
}

/**
 * The serve mode, the save time and the clock. A document without the meta is
 * a live page; an unknown `content` reads as `offline`; a missing
 * `data-saved-at` is an unknown save time.
 */
export function readServedCopy(): ServedCopyReading {
  const meta = document.querySelector('meta[name="fxav-served"]');
  const nowMs = Date.now();
  if (meta === null) return { mode: "live", savedAt: null, nowMs };
  const content = meta.getAttribute("content");
  return {
    mode: isServeMode(content) ? content : "offline",
    savedAt: meta.getAttribute("data-saved-at"),
    nowMs,
  };
}
