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
