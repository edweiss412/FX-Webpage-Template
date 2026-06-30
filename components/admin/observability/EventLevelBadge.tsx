// components/admin/observability/EventLevelBadge.tsx
import type { AppEventLevel } from "@/lib/admin/observabilityTypes";

const BADGE: Record<AppEventLevel, { label: string; className: string }> = {
  info: { label: "Info", className: "bg-surface-sunken text-text-subtle" },
  warn: { label: "Warn", className: "bg-warning-bg text-warning-text" },
  error: { label: "Error", className: "bg-warning-bg text-warning-text font-semibold" },
};

export function EventLevelBadge({ level }: { level: AppEventLevel }) {
  const b = BADGE[level] ?? BADGE.info; // defensive fallback (never crashes)
  return (
    <span
      data-testid={`event-level-${level}`}
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs ${b.className}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {b.label}
    </span>
  );
}
