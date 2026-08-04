"use client";
// global-error REPLACES the root layout (Next 16) and does NOT inherit its globals.css — without
// this import every Tailwind utility + DESIGN @theme token no-ops and the fallback ships unstyled
// (collapsed tap target, no focus ring). Tailwind v4 emits tokens+utilities from this entrypoint.
import "./globals.css";
// Same reason as the globals.css import above: this root REPLACES app/layout.tsx,
// so anything that root sets up is absent here. The stylesheet defines
// --font-inter on :root, which is what --font-sans consumes; without this import
// the crash screen is the one tree still rendering the system font, precisely the
// divergence BL-HEADER-FONT-FALLBACK-WRAP was filed against.
import { FontPreload } from "@/components/FontPreload";

import "./fonts.css";
import { useEffect } from "react";
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
import { getRequiredCrewFacing } from "@/lib/messages/lookup";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, "root");
  }, [error]);
  return (
    // `lang` matches app/layout.tsx:58. This root replaces that one, so without
    // it the crash screen ships with no declared language (WCAG 3.1.1, Level A).
    // `className` matches app/layout.tsx's root: this root REPLACES that one,
    // so anything it sets is absent here. `antialiased` was left off when the
    // generated font class was removed, which rendered the crash screen
    // unsmoothed while every other tree stayed smoothed -- the same
    // second-root omission BL-HEADER-FONT-FALLBACK-WRAP was filed against.
    <html lang="en" className="antialiased">
      <head>
        <FontPreload />
      </head>
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-base text-text">{getRequiredCrewFacing("PAGE_RENDER_FAILED")}</p>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-tap-min items-center rounded-pill bg-accent px-4 text-accent-text"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
