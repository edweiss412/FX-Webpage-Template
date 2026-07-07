"use client";

import { useEffect, useState } from "react";
import { Navigation } from "lucide-react";

/** Read the pre-hydration-stamped theme (app/layout.tsx NO_FOUC_SCRIPT →
 * document.documentElement.dataset.theme; same read as ThemeToggle.tsx:69). */
function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The admin venue card's map tile. Three stacked layers in one region:
 *  (1) an always-painted token-driven stripe base (revealed if the map fails);
 *  (2) the <img> proxy overlay (hides itself on error — no swap state);
 *  (3) the Directions affordance (only when mapHref is a real URL).
 * The parent (VenueBreakdown) owns region collapse and never mounts this with
 * an empty query; the empty-query guard here is defensive. */
export function VenueMapTile({
  query,
  mapHref,
}: {
  query: string;
  mapHref: string | null;
}): JSX.Element | null {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => setTheme(readTheme()), []);
  if (!query) return null;

  const src = `/api/admin/venue-map?q=${encodeURIComponent(query)}&theme=${theme}`;

  const inner = (
    <>
      {/* (1) stripe base — always painted. Inline style for the gradient (no
          arbitrary-class → avoids the better-tailwindcss canonical-class lint);
          colors still come from tokens. */}
      <span
        data-testid="venue-map-fallback"
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--color-surface-sunken) 0 10px, var(--color-surface) 10px 20px)",
        }}
      />
      <span className="absolute top-2.5 left-2.5 rounded-sm bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
        map
      </span>
      {/* (2) real map overlay — hides itself on error, instantly. §8 declares
          no fade on image load or on the error swap; an opacity animation would
          be inert here since nothing tweens. */}
      <img
        data-testid="venue-map-img"
        src={src}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* (3) Directions visual — only for a real URL. Decorative span (the
          ANCHOR is the whole tile, testid venue-map-tile, and is the 44px
          target); this span carries venue-directions so tests can assert its
          presence/absence follows mapHref. */}
      {mapHref ? (
        <span
          data-testid="venue-directions"
          className="absolute right-2.5 bottom-2.5 left-2.5 inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface text-xs font-semibold text-text"
        >
          <Navigation aria-hidden="true" className="size-3.5" />
          Directions
        </span>
      ) : null}
    </>
  );

  const common = "relative block h-full min-h-tile-min-h w-full overflow-hidden";
  return mapHref ? (
    <a
      data-testid="venue-map-tile"
      href={mapHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open directions to the venue"
      className={common}
    >
      {/* anchor wraps the button visual; the inner Directions span is decorative */}
      {inner}
    </a>
  ) : (
    <div data-testid="venue-map-tile" className={common}>
      {inner}
    </div>
  );
}
