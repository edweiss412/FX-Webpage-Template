import type { ReactNode } from "react";

const VARIANTS = {
  note: {
    bg: "bg-info-bg",
    border: "border-border",
    text: "text-text-strong",
    role: "note" as const,
    icon: "ℹ",
    iconTestid: "callout-icon-note",
  },
  warning: {
    bg: "bg-warning-bg",
    border: "border-warning-text",
    text: "text-warning-text",
    role: "alert" as const,
    icon: "⚠",
    iconTestid: "callout-icon-warning",
  },
  tip: {
    bg: "bg-stale-tint",
    border: "border-accent",
    text: "text-accent-text",
    role: "note" as const,
    icon: "✓",
    iconTestid: "callout-icon-tip",
  },
} as const;

export function Callout({
  type,
  children,
}: {
  type: keyof typeof VARIANTS;
  children: ReactNode;
}) {
  // Defensive: unknown type → default to "note" per spec §6.3.
  const v = VARIANTS[type] ?? VARIANTS.note;
  return (
    <div
      role={v.role}
      className={`my-4 flex gap-3 rounded-md border-l-4 px-4 py-3 ${v.bg} ${v.border} ${v.text}`}
    >
      <span data-testid={v.iconTestid} className="font-bold shrink-0">
        {v.icon}
      </span>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
