// Client-safe. NO server imports. Best-effort mirror of boundary crashes to /api/observe/client-error.
// Delegates the dedup+cap+keepalive POST to the shared transport so reportClientError and clientLog
// share one wire path (and one dedup set).
import {
  clientErrorTransport,
  __resetClientTransportDedupForTests,
} from "@/lib/observe/clientErrorTransport";

type Area = "crew" | "admin" | "root" | "tile";

function toError(e: unknown): { message: string; stack?: string | undefined } {
  if (e instanceof Error) return { message: e.message || "(no message)", stack: e.stack };
  return { message: String(e) || "(no message)" };
}

export function __resetReportDedupForTests(): void {
  __resetClientTransportDedupForTests();
}

export function reportClientError(input: {
  error: unknown;
  area: Area;
  componentStack?: string;
  digest?: string;
  tileId?: string;
}): void {
  const { message, stack } = toError(input.error);
  clientErrorTransport({
    source: `client.${input.area}`,
    level: "error",
    message,
    ...(stack ? { stack } : {}),
    ...(input.componentStack ? { componentStack: input.componentStack } : {}),
    ...(input.digest ? { digest: input.digest } : {}),
    ...(input.tileId ? { tileId: input.tileId } : {}),
  });
}
