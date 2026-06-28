import type { ParseWarning } from "../types";

export function agendaGridMalformed(index: number): ParseWarning {
  return {
    severity: "warn",
    code: "AGENDA_GRID_MALFORMED",
    message: "AGENDA grid token-header not locatable",
    blockRef: { kind: "agenda", index },
  };
}
export function agendaBlockUnresolved(index: number): ParseWarning {
  return {
    severity: "warn",
    code: "AGENDA_BLOCK_UNRESOLVED",
    message: "AGENDA block date/day-name could not be resolved",
    blockRef: { kind: "agenda", index },
  };
}
export function agendaDayAmbiguous(index: number): ParseWarning {
  return {
    severity: "warn",
    code: "AGENDA_DAY_AMBIGUOUS",
    message: "AGENDA day-name matches multiple show days; block skipped",
    blockRef: { kind: "agenda", index },
  };
}
export function agendaDayTruncated(index: number): ParseWarning {
  return {
    severity: "warn",
    code: "AGENDA_DAY_TRUNCATED",
    message: "AGENDA day hit a storage cap; entries/fields truncated",
    blockRef: { kind: "agenda", index },
  };
}
/** Emitted by the §02 SYNC write path (not the parser) when a previously-stored day is now read-empty. Defined here so its code: literal lives in lib/parser for the internal-code-enums extractor. */
export function agendaDayEmptied(index: number, iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "AGENDA_DAY_EMPTIED",
    message: `AGENDA day ${iso} previously stored is now read-empty; not stored (anchors)`,
    blockRef: { kind: "agenda", index },
  };
}
/**
 * Emitted by §04 parseScheduleTimes when a SHOW DAY TIME cell is non-empty AND
 * non-sentinel yet yields zero usable fields (no showStart, no window, no
 * entries) — the end-only/unknown-start case ("GS: ... - 6:00 PM") and the
 * no-clock-contentful case ("General Session TBD"). Defined here so its code:
 * literal lives in lib/parser for the internal-code-enums extractor (matches
 * agendaDayEmptied's rationale).
 */
export function scheduleTimeUnparsed(index: number, iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_TIME_UNPARSED",
    message: `SHOW DAY ${iso} TIME cell has content but yielded no usable schedule time; falling back to anchors`,
    blockRef: { kind: "dates", index, iso },
  };
}
export function strikeDateOffSchedule(iso: string): ParseWarning {
  return {
    severity: "warn",
    code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
    message: `A room strike date (${iso}) is not one of the show's scheduled days; it shows in the admin review but not on crew schedules until corrected`,
    blockRef: { kind: "rooms", iso },
  };
}
