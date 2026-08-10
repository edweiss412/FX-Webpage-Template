import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

const VARIANTS = {
  note: {
    bg: cn("bg-info-bg"),
    border: cn("border-border"),
    text: cn("text-text-strong"),
    role: "note" as const,
    icon: "ℹ",
    iconTestid: "callout-icon-note",
  },
  warning: {
    bg: cn("bg-warning-bg"),
    border: cn("border-warning-text"),
    text: cn("text-warning-text"),
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
    // Was bg-stale-tint — that token's name describes the Today hero's
    // stale-data semantic: `components/crew/RightNowHero.tsx` applies the
    // `bg-stale-tint` surface class whenever its `data-stale` attribute is
    // true. Reusing
    // it for a positive callout leaked domain language; bg-info-bg shares the
    // same warm-cream neutral and the orange `border-accent` carries the tip
    // identity. (Impeccable critique minor finding — Task I.1.)
    bg: cn("bg-info-bg"),
    border: cn("border-accent"),
    text: cn("text-text-strong"),
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
