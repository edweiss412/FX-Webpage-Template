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
    // Was role="alert" — overreach for static MDX content per ARIA Authoring
    // Practices (alert is for dynamic time-sensitive messages; forces SR to
    // interrupt reading order on every render). "note" matches the other two
    // variants and matches how the warning callout is actually used in /help.
    // (Impeccable audit P1-B — Task I.1.)
    role: "note" as const,
    icon: "⚠",
    iconTestid: "callout-icon-warning",
  },
  tip: {
    // Was bg-stale-tint — that token's name describes the RightNowCard
    // stale-data semantic (components/right-now/RightNowCard.tsx:520). Reusing
    // it for a positive callout leaked domain language; bg-info-bg shares the
    // same warm-cream neutral and the orange `border-accent` carries the tip
    // identity. (Impeccable critique minor finding — Task I.1.)
    bg: "bg-info-bg",
    border: "border-accent",
    text: "text-text-strong",
    role: "note" as const,
    icon: "✓",
    iconTestid: "callout-icon-tip",
  },
} as const;

export function Callout({ type, children }: { type: keyof typeof VARIANTS; children: ReactNode }) {
  // Defensive: unknown type → default to "note" per spec §6.3.
  const v = VARIANTS[type] ?? VARIANTS.note;
  return (
    <div
      role={v.role}
      className={`my-4 flex gap-3 rounded-md border px-4 py-3 ${v.bg} ${v.border} ${v.text}`}
    >
      <span data-testid={v.iconTestid} className="font-bold shrink-0">
        {v.icon}
      </span>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
