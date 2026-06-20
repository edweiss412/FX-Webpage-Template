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

/**
 * Clock — a dial with hands (mock `clock2`). Card-head glyph for the Today
 * "Run of show" + "Key times" cards.
 */
export function ClockIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Bed — a headboard + mattress with a pillow (mock `bed`). Today "Tonight" card. */
export function BedIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M3 7v12M3 12h18v7M21 19v-5a3 3 0 0 0-3-3H9v4" />
      <circle cx="7" cy="10.5" r="1.6" />
    </svg>
  );
}

/** Phone — a handset (mock `phone`). Today "Need something?" card. */
export function PhoneIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M5 3h3.5l1.5 5-2 1.5a13 13 0 0 0 6 6l1.5-2 5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" />
    </svg>
  );
}

/** Note — a page with text lines (mock `note`). Today "Show notes" card. */
export function NoteIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

/** Map — a folded map (mock `map`). Venue "Site diagrams" card. */
export function MapIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

/** Info — a circled "i" (mock `info`). Venue "Venue status" card. */
export function InfoIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

/** Monitor — a screen on a stand (mock `monitor`). Gear "Opening reel" card. */
export function MonitorIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** Building — a venue silhouette with windows. Venue "Facilities" card (no
 *  direct mock glyph; traced in the same thin-stroke family). */
export function BuildingIcon({ className }: GlyphProps) {
  return (
    <svg {...baseProps} className={className} aria-hidden="true">
      <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M3 21h18" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
    </svg>
  );
}
