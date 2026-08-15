/**
 * components/admin/SheetIconLink.tsx — the ONE icon-only "open the source
 * sheet" affordance (spec 2026-07-26-sheet-icon-link-affordance-class).
 *
 * Idiom: a 20px visual box (`size-5`) whose 44×44 hit target comes from an
 * out-of-flow `::before` overlay — 12px above/below, 10px on the heading side,
 * 14px on the trailing side (10+20+14 = 12+20+12 = 44). The overlay is
 * invisible to `getBoundingClientRect()`; tap-target tests must hit-test or
 * expand the anchor rect by the resolved insets. The 20px box measured 8-29px
 * better on centring than the boxed `size-tap-min` form it replaces at the
 * section header, and the asymmetry (NOT the backlog's `-inset-x-2.5`, which
 * yields a 40px width) keeps the full 44px floor while the heading-side reach
 * never exceeds the row gap.
 *
 * CONSUMING-CONTEXT REQUIREMENTS (spec §5.1 — every call site MUST hold all):
 *   1. a 44px row floor containing the anchor (`min-h-tap-min` + row centring)
 *      — vertical containment for the 12px reaches;
 *   2. ≥10px to the nearest content box on the heading side (`gap-2.5`);
 *   3. ≥14px to the nearest content box on the trailing side, where one exists
 *      (e.g. `mr-0.5` + the modal shell's `gap-3` = 14px), or a trailing edge
 *      with no neighbouring box;
 *   4. the anchor vertically centred in the floor.
 * The rect-intersection e2e assertions pin these per site.
 * ZOOM BOUND (audit P3, accepted): the overlay reaches are rem-scaled while
 * --spacing-tap-min is px, so at ~200% text-only zoom the overlay outgrows the
 * floor and containment holds only near the default root size. px-pinning the
 * insets would break DESIGN.md §10's tokenized-scale discipline; recorded
 * rather than traded.
 *
 * Colour: `text-text` at rest — `text-text-subtle` is not a resting colour for
 * action targets outside DESIGN §1.1a's three carve-out families, and this link
 * claims none of them — lifting to `text-text-strong` plus the
 * backdrop-matched wash from BACKDROP_SKIN on hover AND on :active (impeccable
 * critique P1 + audit P2: the ~12/255-per-channel text lift alone is
 * perceptually null on a 16px stroke; the wash is the sibling icon-control
 * press idiom — ModalCloseButton, BellPanel, HelpSheet — and gives touch users
 * real press feedback where hover never fires).
 * NO transform in any state: :active sits outside the transition sweep
 * (BL-HEADER-PROBE-RESIDUAL-VACUITY item 2), so geometry must not move there.
 * The unit suite pins the whole class-token set by equality; adding ANY
 * utility here fails it deliberately — extend the test's literal first.
 *
 * Ring offsets are container-matched full literals (never computed — the
 * Tailwind JIT must see complete class names; DESIGN.md focus-ring row).
 */
import { ExternalLink } from "lucide-react";
import { stripNewTabSuffix } from "@/components/shared/NewTabHint";
import { cn } from "@/lib/ui/cn";

type SheetIconLinkProps = {
  /** Resolved sheet deep link. Call sites keep their null-gating: null never
   *  reaches this component — it is simply not rendered. */
  href: string;
  /** Show/section title for the accessible name. Trimmed here; whitespace-only
   *  yields the no-subject fallback phrasing (no dangling "for"). */
  subjectLabel: string;
  testId: string;
  /** Container-matched focus ring offset. */
  ringOffset: "bg" | "surface";
  /** Positional classes ONLY (order/margin). Never colour, size, or hit-area. */
  className?: string;
};

/** Backdrop-matched skin: the container-matched focus-ring offset PLUS the
 *  press/hover wash, one REAL neutral step away from that backdrop (audit P2:
 *  surface-sunken over bg-bg measures 1.03:1 in dark — invisible — so the bg
 *  site steps UP to surface instead; no `dark:` variant exists in this repo,
 *  so the wash is one token per backdrop, both themes). Full literals per
 *  branch — the Tailwind JIT must see complete class names. */
const BACKDROP_SKIN = {
  bg: "focus-visible:ring-offset-bg hover:bg-surface active:bg-surface",
  surface: "focus-visible:ring-offset-surface hover:bg-surface-sunken active:bg-surface-sunken",
} satisfies Record<SheetIconLinkProps["ringOffset"], string>;

const BASE_CLASSES = cn(
  "relative inline-grid size-5 shrink-0 place-items-center rounded-sm text-text transition-colors duration-fast before:absolute before:-inset-y-3 before:-left-2.5 before:-right-3.5 before:content-[''] hover:text-text-strong active:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2",
);

export function SheetIconLink({
  href,
  subjectLabel,
  testId,
  ringOffset,
  className,
}: SheetIconLinkProps) {
  const trimmed = stripNewTabSuffix(subjectLabel).trim();
  // The ternary lives INLINE in the attribute so the _metaNewTabAnnouncement
  // static census can SEE the announcement inside the aria-label expression —
  // hoisting it to a const made the anchor unverifiable to that guard.
  return (
    <a
      data-testid={testId}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={
        trimmed
          ? `Open the source sheet for ${trimmed} in Google Sheets (opens in a new tab)`
          : "Open the source sheet in Google Sheets (opens in a new tab)"
      }
      className={`${BASE_CLASSES} ${BACKDROP_SKIN[ringOffset]} ${className ?? ""}`.trim()}
    >
      <ExternalLink aria-hidden="true" className="size-4" />
    </a>
  );
}
