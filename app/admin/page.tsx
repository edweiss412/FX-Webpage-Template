/**
 * app/admin/page.tsx (M9 final-review R15)
 *
 * Production-safe `/admin` landing. Pre-R15 the route tree had no
 * `/admin` page, so every redirect/href that targeted `/admin`
 * landed on Next's 404. R14 retargeted them all to `/admin/dev`,
 * but R15 caught that `/admin/dev` is build-gated out of production
 * via `scripts/with-admin-dev-flag.mjs` — same 404 in prod.
 *
 * This page is intentionally minimal: a list of the available admin
 * surfaces. Doug lands here from sign-in / OAuth callback /
 * AlertBanner queue chip / error-boundary escape, then picks where
 * to go. The layout's <AlertBanner /> renders above this (per the
 * admin layout) so the `#alerts` anchor used by the AlertBanner
 * queue chip points to the top of the layout where alerts actually
 * surface.
 *
 * Server Component. requireAdmin() at the layout level still gates;
 * this page assumes the layout's gate has passed.
 */
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Admin · FXAV",
};

const ADMIN_DEV_PANEL_ENABLED = process.env.ADMIN_DEV_PANEL_ENABLED === "true";

type AdminLink = { href: string; label: string; description: string };

const ALWAYS_BUILT_LINKS: AdminLink[] = [
  {
    href: "/admin/settings/admins",
    label: "Administrators",
    description: "Add or revoke who can view and edit show data.",
  },
];

const DEV_LINKS: AdminLink[] = [
  {
    href: "/admin/dev",
    label: "Dev parse panel",
    description: "Upload a fixture and walk the full parse pipeline.",
  },
];

export default function AdminLandingPage() {
  const links: AdminLink[] = [
    ...ALWAYS_BUILT_LINKS,
    ...(ADMIN_DEV_PANEL_ENABLED ? DEV_LINKS : []),
  ];

  return (
    <main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
      {/* R17 fix: page-level H1 removed — layout already owns the
          "Admin" H1 (app/admin/layout.tsx:79). Page subtitle stays as
          a paragraph below the layout header. */}
      <p className="mb-section-gap text-sm text-text-subtle">
        Pick where to go. When there are active alerts, they appear in the banner above.
      </p>
      {/* R17 fix: was a <section aria-label="Admin sections"> which
          screen-reader rotor doesn't surface as a navigation landmark.
          <nav> is the canonical landmark for a list of internal
          destinations and the rotor will surface it under
          landmarks → navigation. */}
      <nav data-testid="admin-landing-sections" aria-label="Admin">
        {/* R16 fix: each card is the full Link (block, min-h-tap-min,
            focus ring on the card). Pre-fix the Link was inline text
            inside a padded card and only the text was clickable —
            sub-44px tap area on mobile. */}
        <ul className="flex flex-col gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                data-testid={`admin-landing-link-${link.href}`}
                className="group block min-h-tap-min rounded-md border border-border bg-surface p-tile-pad transition-colors duration-fast hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                <span className="block text-base font-medium text-accent-on-bg underline-offset-2 group-hover:underline">
                  {link.label}
                </span>
                <span className="mt-1 block text-sm text-text-subtle">{link.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
