/**
 * components/crew/DressCodeLines.tsx — dress code value with phase hierarchy.
 * Shared by the crew Today dress card and the admin step-3 review row.
 *
 * A `Phase: attire` value (lib/crew/dressCodeLines.ts) renders as a <dl>: the
 * phase in semibold text-strong, the attire in regular body text at the same
 * size, so weight alone separates key from value. The phase deliberately does
 * NOT use the eyebrow voice: SectionCard's title is already
 * `text-xs uppercase tracking-eyebrow text-text-subtle`, and an eyebrow phase
 * read as a second card title. text-strong also puts the label crew scan for
 * (which outfit is mine today?) above the 7:1 sunlight bar; text-subtle was
 * 6.8:1. Anything else renders as one paragraph with its line breaks.
 *
 * Layout follows the CONTAINER, not the viewport: the admin row nests this
 * inside an 8rem label grid, so a 390px phone leaves 188px there and 316px in
 * the crew card (measured), and a 430px phone leaves 356px. Below 24rem the
 * phase stacks over its attire, so every phone stacks; at 24rem and up (tablet
 * crew card, desktop admin row) the phases share one label column (capped at
 * 40% so a long phase wraps instead of starving the attire) and the attire
 * values align, which lets a reader compare phases line by line. A 20rem
 * switch split phones down the middle and squeezed 402/430px attire to three
 * lines beside an empty label column.
 *
 * Dimensional invariants (Tailwind v4 has NO default `align-items: stretch`):
 *   - each phase group spans both dl tracks (`col-span-2`) and inherits them
 *     through `grid-cols-subgrid`, so every attire starts at the same x. The
 *     group sets ROW gap only: a subgrid with its own column gap shrinks each
 *     item's track contribution by half the gap difference, which sized the
 *     label column 11px under "Set/Strike" and ran it into the attire.
 *   - `items-baseline` lines up the label with the attire's first line (the
 *     attire's relaxed leading would otherwise drop it below the label).
 *   - stacked mode sets `grid-cols-1` (minmax(0,1fr)) on the dl AND each group.
 *     An implicit `auto` track sizes to min-content, which `wrap-break-word`
 *     does not lower, so one unbreakable token (a pasted URL) widened the
 *     track to 470px at a 320px viewport. With the track capped,
 *     `wrap-break-word` on dt and dd breaks it.
 */
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";

export function DressCodeLines({
  value,
  searchTargets,
}: {
  value: string;
  /**
   * Search target ids from the crew Today card: one per phase line, or one for
   * the paragraph. Absent (the admin step-3 row) renders no search markers.
   */
  searchTargets?: readonly (string | undefined)[];
}) {
  const lines = parseDressCodeLines(value);
  if (lines === null) {
    return (
      <p
        data-search-target={searchTargets?.[0]}
        className="whitespace-pre-line wrap-break-word text-sm/relaxed text-text"
      >
        {value}
      </p>
    );
  }
  return (
    <div className="@container">
      <dl className="grid grid-cols-1 gap-y-3 @sm:grid-cols-[fit-content(40%)_minmax(0,1fr)] @sm:gap-x-6 @sm:gap-y-2">
        {lines.map(({ phase, attire }, idx) => (
          <div
            key={idx}
            data-search-target={searchTargets?.[idx]}
            className="grid grid-cols-1 gap-y-1 @sm:col-span-2 @sm:grid-cols-subgrid @sm:items-baseline"
          >
            <dt className="wrap-break-word text-sm font-semibold text-text-strong">{phase}</dt>
            <dd className="wrap-break-word text-sm/relaxed text-text">{attire}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
