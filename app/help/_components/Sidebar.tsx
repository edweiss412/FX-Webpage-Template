"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { NAV, NAV_GROUP_TITLES, type NavGroup } from "../_nav";

export function Sidebar() {
  const pathname = usePathname();
  const grouped: Record<NavGroup, typeof NAV[number][]> = {
    "get-started": [],
    "admin-surface": [],
    reference: [],
  };
  for (const entry of NAV) grouped[entry.group].push(entry);

  return (
    <nav aria-label="Help navigation" className="md:w-60 md:shrink-0 md:pr-6">
      {/*
        Single <details> wrapping the nav list.
        - On mobile (<768px): closed by default; <summary> provides tap-to-expand.
        - On desktop (md+): CSS forces open via `md:block` on the inner content
          and hides the <summary>. The <details> acts as a plain wrapper.
        This keeps a single copy of NavList in the DOM so tests see no duplicates.
        spec §6.1 mobile-collapse requirement.
      */}
      <details className="group">
        <summary className="cursor-pointer min-h-tap-min text-base font-semibold py-2 md:hidden">
          Browse help pages
        </summary>
        {/* On mobile: only visible when <details> is open (default browser behaviour).
            On desktop: always visible via `md:block` override. */}
        <div className="hidden group-open:block md:block">
          <NavList grouped={grouped} pathname={pathname} />
        </div>
      </details>
    </nav>
  );
}

function NavList({
  grouped,
  pathname,
}: {
  grouped: Record<NavGroup, typeof NAV[number][]>;
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
                        ? "block min-h-tap-min py-1 px-2 -mx-2 rounded bg-accent text-accent-text font-semibold"
                        : "block min-h-tap-min py-1 px-2 -mx-2 rounded text-text-subtle hover:bg-surface-raised"
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
