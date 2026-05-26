export function GoodSwitchCase({ code }: { code: string }) {
  switch (code) {
    case "SHEET_UNAVAILABLE":
      return <span>Link issue</span>;
    default:
      return <span>Other issue</span>;
  }
}
