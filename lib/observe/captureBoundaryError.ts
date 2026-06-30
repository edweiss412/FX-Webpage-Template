import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "@/lib/observe/reportClientError";

// The single guarded entry point every error boundary calls. Sentry + the app_events mirror are
// captured INDEPENDENTLY (each in its own try/catch) so one failing never blocks the other or
// re-crashes the boundary effect.
export function captureBoundaryError(
  error: unknown,
  area: "crew" | "admin" | "root" | "tile",
  extra?: { componentStack?: string; tileId?: string },
): void {
  try {
    Sentry.captureException(error, extra?.tileId ? { tags: { tileId: extra.tileId } } : undefined);
  } catch {
    /* ignore */
  }
  try {
    const digest =
      error && typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : undefined;
    // Build the input WITHOUT undefined-valued optional keys (exactOptionalPropertyTypes).
    reportClientError({
      error,
      area,
      ...(digest ? { digest } : {}),
      ...(extra?.componentStack ? { componentStack: extra.componentStack } : {}),
      ...(extra?.tileId ? { tileId: extra.tileId } : {}),
    });
  } catch {
    /* ignore */
  }
}
