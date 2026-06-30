import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "@/lib/observe/reportClientError";

// The single guarded entry point every error boundary calls. Sentry + the app_events mirror are
// captured INDEPENDENTLY (each in its own try/catch) so one failing never blocks the other or
// re-crashes the boundary effect.
export function captureBoundaryError(error: unknown, area: "crew" | "admin" | "root"): void {
  try {
    Sentry.captureException(error);
  } catch {
    /* ignore */
  }
  try {
    const digest =
      error && typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : undefined;
    // Build the input WITHOUT a `digest: undefined` key (exactOptionalPropertyTypes).
    reportClientError(digest ? { error, area, digest } : { error, area });
  } catch {
    /* ignore */
  }
}
