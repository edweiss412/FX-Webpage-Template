const ROUTED_CODES = ["LINK_REVOKED_FLOOR", "LINK_EXPIRED"] as const;

export function GoodCodeArray() {
  return <span>{ROUTED_CODES.length} routed codes</span>;
}
