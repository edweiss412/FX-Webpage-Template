const ROUTED_CODES = ["SHEET_UNAVAILABLE", "GOOGLE_NO_CREW_MATCH"] as const;

export function GoodCodeArray() {
  return <span>{ROUTED_CODES.length} routed codes</span>;
}
