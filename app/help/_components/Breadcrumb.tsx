"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_GROUP_TITLES } from "../_nav";

export function Breadcrumb() {
  const pathname = usePathname();
  const entry = NAV.find((e) => e.slug === pathname);

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-text-subtle mb-4">
      <ol className="flex items-center gap-2">
        <li>
          <Link
            href="/help"
            className="inline-flex min-h-tap-min items-center px-2 -mx-2 text-text hover:text-text-strong"
          >
            Help
          </Link>
        </li>
        {entry && (
          <>
            <li aria-hidden="true">/</li>
            <li>{NAV_GROUP_TITLES[entry.group]}</li>
            <li aria-hidden="true">/</li>
            <li className="text-text-strong" aria-current="page">{entry.title}</li>
          </>
        )}
      </ol>
    </nav>
  );
}
