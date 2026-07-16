"use client";

import { type ReactElement, useEffect, useState } from "react";
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
}): ReactElement | null {
  // SSR/first-render is "light" to match the server; the applied theme was
  // stamped on <html> by the NO_FOUC_SCRIPT before hydration, so this reads it
  // once post-mount (mirrors ThemeToggle.tsx:104's post-hydration read).
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(readTheme());
  }, []);
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
      <span
        aria-hidden="true"
        className="absolute top-2.5 left-2.5 rounded-sm bg-surface/85 px-1.5 py-0.5 font-mono text-[10px] text-text-subtle"
      >
        map
      </span>
      {/* (2) real map overlay — hides itself on error, instantly. §8 declares
          no fade on image load or on the error swap; an opacity animation would
          be inert here since nothing tweens. Plain <img>, not next/image: the
          src is our same-origin proxy (key-safe) and we need the native onError
          to reveal the stripe fallback — next/image would obscure that path. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- proxy PNG stream; native onError drives the fallback */}
      <img
        data-testid="venue-map-img"
        src={src}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
        onLoad={(e) => {
          // A theme-driven src change re-fetches; if a prior src errored (hidden)
          // and the new one loads, un-hide so a good map is never left invisible.
          e.currentTarget.style.visibility = "visible";
        }}
        className="absolute inset-0 size-full object-cover"
      />
      {/* (3) Directions visual — only for a real URL. Decorative span (the
          ANCHOR is the whole tile, testid venue-map-tile, and is the 44px
          target); this span carries venue-directions so tests can assert its
          presence/absence follows mapHref. */}
      {mapHref ? (
        <span
          data-testid="venue-directions"
          className="absolute inset-x-2.5 bottom-2.5 inline-flex min-h-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface text-xs font-semibold text-text"
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
      aria-label="Open the venue in Google Maps (opens in a new tab)"
      className={`${common} focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none focus-visible:ring-inset`}
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
