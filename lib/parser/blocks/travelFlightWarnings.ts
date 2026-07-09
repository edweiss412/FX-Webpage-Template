import type { ParseWarning } from "../types";

const travel = (index = 0) => ({ kind: "travel" as const, index });

export function travelFlightNameUnmatched(name: string): ParseWarning {
  return {
    severity: "warn",
    code: "TRAVEL_FLIGHT_NAME_UNMATCHED",
    message: `TRAVEL flight for "${name}" matched zero or multiple roster crew; not attached`,
    blockRef: travel(),
    rawSnippet: name,
  };
}

export function travelFlightUnparseable(name: string, rawCell: string): ParseWarning {
  return {
    severity: "warn",
    code: "TRAVEL_FLIGHT_UNPARSEABLE",
    message: `TRAVEL flight for "${name}" had no recognizable flight date; not attached`,
    blockRef: travel(),
    rawSnippet: rawCell,
  };
}

export function travelFlightAmbiguousTable(): ParseWarning {
  return {
    severity: "warn",
    code: "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
    message:
      "More than one TRAVEL flight table found; flights not attached (remove the duplicate/old one)",
    blockRef: travel(),
  };
}

// TRANSFORM_SITES (spec 2026-07-07-ambiguity-warnings-v1 §6) — value-producing
// transform sites in this file that rest on a JUDGMENT the parser could get wrong.
// None here — warning emission only; produces no field values.
export const TRANSFORM_SITES: ReadonlyArray<
  { site: string; code: string } | { site: string; exempt: string }
> = [];
