import type { AgendaEntry, RunOfShow } from "@/lib/parser/types";

/**
 * §14 clean-rollback converter. Maps the new ScheduleDay value shape back to
 * the LEGACY `Record<iso, AgendaEntry[]>` that the CURRENT (pre-fix) decoder
 * accepts (`lib/data/decodeRunOfShow.ts:56-72` requires an ARRAY day value;
 * a ScheduleDay OBJECT day is corrupt-skipped). Run this (or simply re-run the
 * OLD sync, which regenerates legacy arrays) before a deliberate rollback to
 * clear corrupt/tileError signals.
 *
 * LOSSY by design: `showStart` and `window` have no representation in the old
 * shape and are dropped. A bare-window day (entries:[]) downgrades to `[]`
 * (the window cannot be carried); the old code falls back to room anchors for
 * that day, which is exactly pre-fix behavior.
 */
export function downgradeRunOfShow(map: RunOfShow): Record<string, AgendaEntry[]> {
  const out: Record<string, AgendaEntry[]> = {};
  for (const [iso, day] of Object.entries(map)) {
    out[iso] = day.entries.map((e) => ({ ...e }));
  }
  return out;
}
