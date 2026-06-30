"use client";
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
    <html>
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
