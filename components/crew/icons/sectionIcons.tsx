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
 * Exported here: `DockIcon` (loading dock), `CarIcon` (parking/ground),
 * `WifiIcon` (crew Wi-Fi) — the three Venue fact-row mini-icons — and
 * `PlaneIcon` (flight legs / Travel section). Task 8.5 adds the seven sub-nav
 * section glyphs: `HomeIcon` (Today), `CalendarIcon` (Schedule), `MapPinIcon`
 * (Venue), `PlaneIcon` (Travel — reused), `UsersIcon` (Crew), `BoxIcon` (Gear),
 * `ReceiptIcon` (Budget). Additional glyphs can join as surfaces adopt them.
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

/**
 * Flight — the mock's plane silhouette (a closed filled glyph traced from
 * crew/components.jsx). Unlike the stroke glyphs above, this path is a solid
 * silhouette, so it fills with `currentColor` (the stroke is kept thin for a
 * crisp edge at small sizes).
 */
export function PlaneIcon({ className }: GlyphProps) {
  return (
    <svg
      {...baseProps}
      fill="currentColor"
      strokeWidth={0.75}
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15.5 14 12V6a2 2 0 0 0-4 0v6l-7 3.5V18l7-2v3l-2 1.5V22l3.5-1 3.5 1v-1.5L14 19v-3l7 2z" />
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

/** Today — a house roof + walls with a doorway (sub-nav: Today section). */
export function HomeIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M9.5 21v-6h5v6" />
    </svg>
  );
}

/** Schedule — a wall calendar (sub-nav: Schedule section). */
export function CalendarIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

/** Venue — a map pin (sub-nav: Venue section). */
export function MapPinIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  );
}

/** Crew — two people (sub-nav: Crew section). */
export function UsersIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7.5" r="3.2" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.86M15.5 4.36a3.2 3.2 0 0 1 0 6.28" />
    </svg>
  );
}

/** Gear — a shipping box / case (sub-nav: Gear section). */
export function BoxIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  );
}

/** Budget — a receipt with a torn zig-zag foot (sub-nav: Budget section). */
export function ReceiptIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M5 3h14v18l-2.3-1.4L14.4 21 12 19.6 9.6 21l-2.3-1.4L5 21zM8.5 8h7M8.5 12h7" />
    </svg>
  );
}
