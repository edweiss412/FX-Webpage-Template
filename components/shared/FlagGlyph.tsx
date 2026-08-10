/**
 * components/shared/FlagGlyph.tsx — the report affordance's one glyph.
 *
 * Extracted 2026-08-09 (crew-chrome arc) when the footer's report control became
 * symbol-only and needed the SAME mark the per-card trigger already uses. Two
 * copies of an SVG path is how two report affordances end up looking like two
 * different features; the product register's rule is one icon style across the
 * surface, so there is one definition.
 *
 * Thin-stroke, same family as SheetIcon. Size and color come from the CALLER —
 * the per-card trigger renders it recessive at ~14px, the footer at 16px inside
 * a bordered 44px target — so this component sets neither.
 */
export function FlagGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...(className === undefined ? {} : { className })}
    >
      <path d="M4 21V4M4 4h11l-2 4 2 4H4" />
    </svg>
  );
}
