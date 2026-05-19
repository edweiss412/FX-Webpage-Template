export function GoodSwitchCase({ code }: { code: string }) {
  switch (code) {
    case "LINK_REVOKED_FLOOR":
      return <span>Link issue</span>;
    default:
      return <span>Other issue</span>;
  }
}
