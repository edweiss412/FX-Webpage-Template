export function formatRelative(timestamp: Date | string, now: Date = new Date()): string {
  const t = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const diffMs = now.getTime() - t.getTime();
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} hr`;
  const days = Math.floor(diffMs / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"}`;
}
