/**
 * components/crew/icons/sectionIcons.tsx — minimal stroke-glyph SVG set.
 *
 * The project has no shared icon library (Task 5 confirmed), so the crew
 * surfaces declare their own thin, currentColor stroke glyphs traced from the
 * mock's `crew/components.jsx` paths. Each is a 24×24 stroke icon that inherits
 * its size + color from the parent (the FactRows `.mini` square sets
 * `[&_svg]:size-[15px]` and `text-text-subtle`), so the glyph component takes
 * only an optional `className` passthrough and no color/size of its own.
 *
 * Exported here: `DockIcon` (loading dock), `CarIcon` (parking/ground), and
 * `WifiIcon` (crew Wi-Fi) — the three Venue fact-row mini-icons. Additional
 * glyphs (nav/section icons) can join this file as those surfaces adopt them.
 */
import type { SVGProps } from "react";

type GlyphProps = Pick<SVGProps<SVGSVGElement>, "className">;

/** Shared attributes for every stroke glyph: inherit color, thin even stroke. */
const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Loading dock — a warehouse silhouette with a roll-up door. */
export function DockIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5" />
    </svg>
  );
}

/** Parking / ground transport — a simple car. */
export function CarIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M5 13l1.5-5A2 2 0 0 1 8.4 6.6h7.2A2 2 0 0 1 17.5 8L19 13M4 13h16v4H4zM7 17v2M17 17v2" />
      <circle cx="7.5" cy="15" r="0.6" />
      <circle cx="16.5" cy="15" r="0.6" />
    </svg>
  );
}

/** Crew Wi-Fi — nested signal arcs over a dot. */
export function WifiIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M2 8.8a16 16 0 0 1 20 0M5 12.2a11 11 0 0 1 14 0M8 15.6a6 6 0 0 1 8 0" />
      <circle cx="12" cy="19" r="0.8" />
    </svg>
  );
}
