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
