"use client";

/**
 * components/crew/SectionChipLink.tsx — an in-body shortcut chip that navigates
 * to another crew sub-nav section.
 *
 * The mock renders a `.chip` action in some card headers (e.g. the Today "Run of
 * show" card's "Agenda" chip). In this app the full multi-day run-of-show lives
 * in the Schedule section, so the chip is a real navigation affordance, not a
 * decorative/dead control: it is a `next/link` to `?s=<section>` built through
 * the SAME `buildSectionHref` the sub-nav uses, so it carries only `s` + an
 * allow-listed `gate` and drops every other param (R13-MEDIUM-1 discipline).
 *
 * Client island (the chip reads the live pathname + query). Decorative icon is
 * `aria-hidden`; the label is the accessible name. Meets the 44px tap floor
 * (`min-h-tap-min`, DESIGN.md §3).
 *
 * `prefetch={false}` is NON-NEGOTIABLE (the "phantom prefetch alert" hazard,
 * tests/components/crew/noPrefetchAlert.test.tsx): this is a next/link anchor to
 * a `?s=` crew-section URL, and the crew route's render runs `CrewShell`, whose
 * projection-fetch `upsertAdminAlert` side-effect would fire on a speculative
 * prefetch render. The crew route being dynamic already blocks that, but the
 * chip opts out of prefetch as belt-and-suspenders so no section-URL anchor is
 * ever auto-prefetched. The meta-test pins this.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { buildSectionHref } from "@/lib/crew/sectionHref";
import type { SectionId } from "@/lib/crew/resolveActiveSection";

type SectionChipLinkProps = {
  /** Destination sub-nav section. */
  section: SectionId;
  /** Optional leading glyph (decorative → aria-hidden via the icon component). */
  icon?: ReactNode;
  /** Visible label = the accessible name. */
  children: ReactNode;
};

export function SectionChipLink({ section, icon, children }: SectionChipLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Link
      href={buildSectionHref(pathname, searchParams, section)}
      prefetch={false}
      data-testid="section-chip-link"
      data-section={section}
      className={[
        "inline-flex min-h-tap-min shrink-0 items-center gap-2 rounded-pill",
        "border border-border bg-surface px-3.5 text-xs font-semibold text-text",
        "transition-colors duration-fast hover:border-border-strong",
        "hover:bg-surface-sunken hover:text-accent-on-bg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "[&_svg]:size-4 [&_svg]:text-text-subtle hover:[&_svg]:text-accent-on-bg",
      ].join(" ")}
    >
      {icon}
      {children}
    </Link>
  );
}
