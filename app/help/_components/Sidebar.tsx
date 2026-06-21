"use client";
import { useState, useId } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV, NAV_GROUP_TITLES, type NavGroup } from "../_nav";

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navListId = useId();
  const grouped: Record<NavGroup, (typeof NAV)[number][]> = {
    "get-started": [],
    "admin-surface": [],
    reference: [],
  };
  for (const entry of NAV) grouped[entry.group].push(entry);

  return (
    <nav aria-label="Help navigation" className="md:w-60 md:shrink-0 md:pr-6">
      {/*
        Button-controlled disclosure (Codex R2): no <details>/<summary>.
        - On mobile (<768px): <button aria-expanded aria-controls> toggles
          the sibling <div id={navListId}> via React state.
        - On desktop (md+): button is `md:hidden`; the nav list is forced
          visible via `md:block`. Desktop AT users see no disclosure widget
          at all — matches AC-11.3 / §6.1 "normal sidebar that collapses to
          a disclosure ONLY under 768 px."
      */}
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls={navListId}
        onClick={() => setMobileOpen((v) => !v)}
        className="md:hidden cursor-pointer min-h-tap-min text-base font-semibold py-2 w-full text-left mb-4 text-text"
      >
        Browse help pages
      </button>
      <div id={navListId} className={`${mobileOpen ? "block" : "hidden"} md:block`}>
        <NavList grouped={grouped} pathname={pathname} />
      </div>
    </nav>
  );
}

function NavList({
  grouped,
  pathname,
}: {
  grouped: Record<NavGroup, (typeof NAV)[number][]>;
  pathname: string;
}) {
  return (
    <ul className="space-y-section-gap">
      {(Object.keys(grouped) as NavGroup[]).map((g) => (
        <li key={g}>
          <h3 className="text-xs uppercase tracking-wider text-text-subtle mb-2">
            {NAV_GROUP_TITLES[g]}
          </h3>
          <ul className="space-y-1">
            {grouped[g].map((entry) => {
              const isCurrent = entry.slug === pathname;
              return (
                <li key={entry.slug}>
                  <Link
                    href={entry.slug}
                    aria-current={isCurrent ? "page" : undefined}
                    // r2 (round-1 finding 3): use live @theme tokens.
                    // Verified at plan-write time via
                    // grep -E "^\s*--color-(accent|surface)" app/globals.css:
                    // available: surface, surface-raised, surface-sunken,
                    // accent, accent-hover, accent-text, accent-on-bg.
                    // No "accent-soft" or "surface-2" exist; use
                    // surface-raised for hover + accent-text + accent
                    // background for current.
                    className={
                      isCurrent
                        ? "block min-h-tap-min py-1 px-2 -mx-2 rounded bg-surface-raised text-text-strong font-semibold"
                        : "block min-h-tap-min py-1 px-2 -mx-2 rounded text-text hover:bg-surface-raised"
                    }
                  >
                    {entry.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
