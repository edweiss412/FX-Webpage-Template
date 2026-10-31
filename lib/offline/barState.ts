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
 * One piece of a run of copy. `time` is the saved time and `age` the relative
 * age (its leading comma and space included), so the view can treat the two
 * figures apart from the prose: the age is visual only, since it changes every
 * minute and the bar is a live region (spec 4.7.2 Accessibility).
 */
export type BodyPart = { kind: "text" | "time" | "age"; text: string };

/** A run of copy: its text as it reads on screen, and the same text in parts. */
export type Copy = { text: string; parts: readonly BodyPart[] };

/**
 * What the bar says, in the owner's shape (spec 4.7.2, 2026-10-30): one short
 * pinned line, a bold `lead` and a plain `body`, and an optional `detail`, the
 * full sentence that shows once in the page flow under the pinned line.
 */
export type BarView = {
  state: BarState;
  tone: string | null;
  icon: "signal-off" | "clock" | "alert" | "sync" | "check" | null;
  /** The pinned line's bold run, or null. */
  lead: Copy | null;
  /** The pinned line's plain run after the lead, or null. */
  body: Copy | null;
  /** The in-flow sentence under the pinned line, or null when the state has none. */
  detail: Copy | null;
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

const SHEET_GONE_LEAD = "Doug's sheet is gone.";
const SHEET_GONE_BODY = "Check with Doug.";
const SHEET_GONE = "Doug's sheet for this show isn't available in Google Drive anymore.";
const CHECK_WITH_DOUG = "Check with Doug before relying on it.";

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

/** A run of copy from its pieces: a string is prose, and `text` is every piece joined. */
function copyOf(...pieces: ReadonlyArray<string | BodyPart>): Copy {
  const parts = pieces.map(
    (piece): BodyPart => (typeof piece === "string" ? { kind: "text", text: piece } : piece),
  );
  return { text: parts.map((part) => part.text).join(""), parts };
}

const timePart = (text: string): BodyPart => ({ kind: "time", text });
const agePart = (ago: string): BodyPart => ({ kind: "age", text: `, ${ago}` });

/** The bold lead of both saved states with a known time: "Saved {time}, {ago}." */
const savedLead = (saved: SavedCopyTime): Copy =>
  copyOf("Saved ", timePart(saved.time), agePart(saved.ago), ".");

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

const SHEET_GONE_PINNED = {
  tone: WARNING_TONE,
  icon: "alert",
  lead: copyOf(SHEET_GONE_LEAD),
  body: copyOf(SHEET_GONE_BODY),
} as const;

/** `sheet-gone`: a live page whose sheet is unavailable. It reads neither the clock nor a time. */
const SHEET_GONE_VIEW: BarView = {
  state: "sheet-gone",
  ...SHEET_GONE_PINNED,
  detail: copyOf(`${SHEET_GONE} You're seeing the last version we have. ${CHECK_WITH_DOUG}`),
};

/**
 * The view the server render and the hydrating render paint, before any reading
 * of the meta, the clock or the connection (spec 4.7.1, 4.7.2). Only the
 * `sheetUnavailable` prop is known then, and it is enough for one state: a live
 * page whose sheet is gone shows `sheet-gone` (UI gate re-check E1), so the bar
 * is in the page from the first paint instead of arriving after mount. A saved
 * copy of such a page moves to `sheet-gone-saved`, which pins the same line,
 * once the mount effect has its reading. Null otherwise: every other state needs
 * a reading the server cannot have.
 */
export function viewBeforeReadings(sheetUnavailable: boolean): BarView | null {
  return sheetUnavailable ? SHEET_GONE_VIEW : null;
}

export function deriveBarView(inputs: BarInputs, timeZone?: string): BarView {
  const { mode, online, savedAt, nowMs, sheetUnavailable, updating, justUpdated } = inputs;

  if (mode === "ended") {
    const saved = readSavedCopyTime(savedAt, nowMs, timeZone);
    return {
      state: "ended",
      tone: STALE_TONE,
      icon: "clock",
      lead: copyOf("This show has ended."),
      body: null,
      detail:
        saved === null
          ? copyOf("You're seeing the last version.")
          : copyOf("You're seeing the last version, from ", timePart(saved.time), "."),
    };
  }

  if (updating) {
    return {
      state: "updating",
      tone: INFO_TONE,
      icon: "sync",
      lead: copyOf("Signal's back."),
      body: copyOf("Loading the latest version."),
      detail: null,
    };
  }

  if (sheetUnavailable) {
    if (mode === "live") return SHEET_GONE_VIEW;
    const saved = readSavedCopyTime(savedAt, nowMs, timeZone);
    return {
      state: "sheet-gone-saved",
      ...SHEET_GONE_PINNED,
      detail:
        saved === null
          ? copyOf(`${SHEET_GONE} This is the last version we have. ${CHECK_WITH_DOUG}`)
          : copyOf(
              `${SHEET_GONE} This is the last version we have, from `,
              timePart(saved.time),
              `. ${CHECK_WITH_DOUG}`,
            ),
    };
  }

  if (mode !== "live" || !online) {
    const cause = copyOf(SAVED_LEADS[mode]);
    const saved = readSavedCopyTime(savedAt, nowMs, timeZone);
    // An unknown age reads as an old copy: nothing says it is recent. With no
    // time to lead with, the cause leads.
    if (saved === null) {
      return {
        state: "saved-old",
        tone: STALE_TONE,
        icon: "clock",
        lead: cause,
        body: copyOf("Showing your saved copy."),
        detail: null,
      };
    }
    if (saved.ageMs < OLD_COPY_MS) {
      return {
        state: "saved-fresh",
        tone: INFO_TONE,
        icon: "signal-off",
        lead: savedLead(saved),
        body: cause,
        detail: copyOf("Showing your saved copy."),
      };
    }
    return {
      state: "saved-old",
      tone: STALE_TONE,
      icon: "clock",
      lead: savedLead(saved),
      body: cause,
      detail: copyOf("Things may have changed since then."),
    };
  }

  if (justUpdated) {
    return {
      state: "updated",
      tone: POSITIVE_TONE,
      icon: "check",
      lead: null,
      body: copyOf("Updated. You're on the latest version."),
      detail: null,
    };
  }

  return { state: "hidden", tone: null, icon: null, lead: null, body: null, detail: null };
}
