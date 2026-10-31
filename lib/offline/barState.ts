/**
 * The state of the pinned saved-copy bar (spec 4.7.2), as a pure function of its
 * inputs: the bar component renders the `BarView` and nothing else.
 *
 * Pure and dependency-free apart from the two formatters: the clock and the time
 * zone are arguments, and no `.tsx` file compares against a raw status string
 * (`isSheetUnavailable` is the one place that does).
 */
import { formatAgo, formatSavedTime } from "@/lib/offline/format";

export type BarMode = "live" | "offline" | "slow" | "server-error" | "ended";

export type BarInputs = {
  mode: BarMode;
  online: boolean;
  /** renderedAt on a live page, the meta's data-saved-at on a saved copy. */
  savedAt: string | null;
  nowMs: number;
  sheetUnavailable: boolean;
  updating: boolean;
  justUpdated: boolean;
};

/** The runtime list of states, so a test can enumerate the union the type names. */
export const BAR_STATES = [
  "hidden",
  "saved-fresh",
  "saved-old",
  "ended",
  "sheet-gone",
  "sheet-gone-saved",
  "updating",
  "updated",
] as const;

export type BarState = (typeof BAR_STATES)[number];

/**
 * One run of the body's copy. `time` is the saved time and `age` the relative
 * age, parenthesis and leading space included, so the view can treat the two
 * figures apart from the prose: the age is visual only, since it changes every
 * minute and the bar is a live region (spec 4.7.2 Accessibility).
 */
export type BodyPart = { kind: "text" | "time" | "age"; text: string };

export type BarView = {
  state: BarState;
  tone: string | null;
  icon: "signal-off" | "clock" | "alert" | "sync" | "check" | null;
  lead: string | null;
  /** The body as it reads on screen: every part's text, in order. */
  body: string;
  parts: readonly BodyPart[];
};

export const OLD_COPY_MS = 6 * 60 * 60 * 1000;

/** The one place the raw `shows.last_sync_status` value is compared. */
export function isSheetUnavailable(lastSyncStatus: string | null | undefined): boolean {
  return lastSyncStatus === "sheet_unavailable";
}

const INFO_TONE = "bg-info-bg";
const STALE_TONE = "bg-stale-tint";
const WARNING_TONE = "bg-warning-bg text-warning-text";
const POSITIVE_TONE = "bg-surface text-status-positive-text";

const SHEET_GONE_LEAD = "Doug's sheet for this show isn't available in Google Drive anymore.";

/**
 * The lead of a saved state, by mode. A live page only reaches a saved state when
 * `online` is false, so its lead is the offline one.
 */
const SAVED_LEADS: Record<Exclude<BarMode, "ended">, string> = {
  offline: "No signal.",
  slow: "Slow connection.",
  "server-error": "Couldn't load the latest version.",
  live: "No signal.",
};

type SavedCopyTime = { time: string; ago: string; ageMs: number };

/** The body from its runs: a string is prose, and `body` is every run's text joined. */
function bodyOf(...runs: ReadonlyArray<string | BodyPart>): Pick<BarView, "body" | "parts"> {
  const parts = runs.map(
    (run): BodyPart => (typeof run === "string" ? { kind: "text", text: run } : run),
  );
  return { body: parts.map((part) => part.text).join(""), parts };
}

const timePart = (text: string): BodyPart => ({ kind: "time", text });
const agePart = (ago: string): BodyPart => ({ kind: "age", text: ` (${ago})` });

/** The saved time as the copy shows it, or null when the time or the clock is unusable. */
function readSavedCopyTime(
  savedAt: string | null,
  nowMs: number,
  timeZone: string | undefined,
): SavedCopyTime | null {
  if (savedAt === null) return null;
  const time = formatSavedTime(savedAt, nowMs, timeZone);
  const ago = formatAgo(savedAt, nowMs);
  if (time === null || ago === null) return null;
  return { time, ago, ageMs: nowMs - Date.parse(savedAt) };
}

export function deriveBarView(inputs: BarInputs, timeZone?: string): BarView {
  const { mode, online, savedAt, nowMs, sheetUnavailable, updating, justUpdated } = inputs;

  if (mode === "ended") {
    const saved = readSavedCopyTime(savedAt, nowMs, timeZone);
    return {
      state: "ended",
      tone: STALE_TONE,
      icon: "clock",
      lead: "This show has ended.",
      ...(saved === null
        ? bodyOf("You're seeing the last version.")
        : bodyOf("You're seeing the last version, from ", timePart(saved.time), ".")),
    };
  }

  if (updating) {
    return {
      state: "updating",
      tone: INFO_TONE,
      icon: "sync",
      lead: "Signal's back.",
      ...bodyOf("Loading the latest version."),
    };
  }

  if (sheetUnavailable) {
    if (mode === "live") {
      return {
        state: "sheet-gone",
        tone: WARNING_TONE,
        icon: "alert",
        lead: SHEET_GONE_LEAD,
        ...bodyOf("You're seeing the last version we have. Check with Doug before relying on it."),
      };
    }
    const saved = readSavedCopyTime(savedAt, nowMs, timeZone);
    return {
      state: "sheet-gone-saved",
      tone: WARNING_TONE,
      icon: "alert",
      lead: SHEET_GONE_LEAD,
      ...(saved === null
        ? bodyOf("This is the last version we have. Check with Doug before relying on it.")
        : bodyOf(
            "This is the last version we have, from ",
            timePart(saved.time),
            ". Check with Doug before relying on it.",
          )),
    };
  }

  if (mode !== "live" || !online) {
    const lead = SAVED_LEADS[mode];
    const saved = readSavedCopyTime(savedAt, nowMs, timeZone);
    // An unknown age reads as an old copy: nothing says it is recent.
    if (saved === null) {
      return {
        state: "saved-old",
        tone: STALE_TONE,
        icon: "clock",
        lead,
        ...bodyOf("Showing your saved copy."),
      };
    }
    if (saved.ageMs < OLD_COPY_MS) {
      return {
        state: "saved-fresh",
        tone: INFO_TONE,
        icon: "signal-off",
        lead,
        ...bodyOf("Showing your saved copy from ", timePart(saved.time), agePart(saved.ago), "."),
      };
    }
    return {
      state: "saved-old",
      tone: STALE_TONE,
      icon: "clock",
      lead,
      ...bodyOf(
        "Your saved copy is from ",
        timePart(saved.time),
        agePart(saved.ago),
        ". Things may have changed since then.",
      ),
    };
  }

  if (justUpdated) {
    return {
      state: "updated",
      tone: POSITIVE_TONE,
      icon: "check",
      lead: null,
      ...bodyOf("Updated. You're on the latest version."),
    };
  }

  return { state: "hidden", tone: null, icon: null, lead: null, ...bodyOf() };
}
