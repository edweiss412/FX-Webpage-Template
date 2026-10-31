"use client";
import { useEffect } from "react";
import { SavedCopyMarker } from "@/components/offline/SavedCopyMarker";
import { captureBoundaryError } from "@/lib/observe/captureBoundaryError";
import { getRequiredCrewFacing } from "@/lib/messages/lookup";

export default function CrewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureBoundaryError(error, "crew");
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      {/* Spec 4.3: hold, naming no show; a render that threw says nothing about the
          saved copy. A literal, since this client boundary cannot import the
          server-only marker helpers. An inert <template> that takes no place in the column. */}
      <SavedCopyMarker marker={{ disposition: "hold", showId: null }} />
      <p className="text-base text-text">{getRequiredCrewFacing("PAGE_RENDER_FAILED")}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="inline-flex min-h-tap-min items-center rounded-pill bg-accent px-4 text-accent-text"
      >
        Try again
      </button>
    </main>
  );
}
