/**
 * components/crew/DressCodeLines.tsx — dress code value with phase hierarchy.
 * Shared by the crew Today dress card and the admin step-3 review row.
 *
 * A `Phase: attire` value (lib/crew/dressCodeLines.ts) renders as a <dl>: the
 * phase in the eyebrow label voice (KeyValue dt, DESIGN §2.6, but text-subtle
 * rather than text-faint because crew read it to pick their outfit), the attire
 * in body text. Anything else renders as one paragraph with its line breaks.
 *
 * Layout follows the CONTAINER, not the viewport: the admin row nests this
 * inside an 8rem label grid, so the same phone width leaves ~190px there and
 * ~340px in the crew card. Below 20rem the phase stacks over its attire; at
 * 20rem and up the phases share one label column (capped at 40% so a long
 * phase wraps instead of starving the attire) and the attire values align,
 * which lets a reader compare phases line by line.
 *
 * Dimensional invariants (Tailwind v4 has NO default `align-items: stretch`):
 *   - each phase group spans both dl tracks (`col-span-2`) and inherits them
 *     through `grid-cols-subgrid`, so every attire starts at the same x. The
 *     group sets ROW gap only: a subgrid with its own column gap shrinks each
 *     item's track contribution by half the gap difference, which sized the
 *     label column 11px under "SET/STRIKE" and ran it into the attire.
 *   - `items-baseline` lines up the xs label with the sm attire's first line.
 *   - `wrap-break-word` on dt and dd keeps an unbreakable token from forcing
 *     horizontal overflow at 320px.
 */
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";

export function DressCodeLines({ value }: { value: string }) {
  const lines = parseDressCodeLines(value);
  if (lines === null) {
    return <p className="whitespace-pre-line wrap-break-word text-sm/relaxed text-text">{value}</p>;
  }
  return (
    <div className="@container">
      <dl className="grid gap-y-3 @xs:grid-cols-[fit-content(40%)_minmax(0,1fr)] @xs:gap-x-6 @xs:gap-y-2">
        {lines.map(({ phase, attire }, idx) => (
          <div
            key={idx}
            className="grid gap-y-0.5 @xs:col-span-2 @xs:grid-cols-subgrid @xs:items-baseline"
          >
            <dt className="wrap-break-word text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
              {phase}
            </dt>
            <dd className="wrap-break-word text-sm/relaxed text-text">{attire}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
