// Client-safe. NO server imports. Best-effort mirror of boundary crashes to /api/observe/client-error.
// Delegates the dedup+cap+keepalive POST to the shared transport so reportClientError and clientLog
// share one wire path (and one dedup set).
import {
  clientErrorTransport,
  __resetClientTransportDedupForTests,
} from "@/lib/observe/clientErrorTransport";
import { describeClientValue } from "@/lib/observe/describeClientValue";

type Area = "crew" | "admin" | "root" | "tile";

/**
 * The `Error` arm is byte-identical to what it always sent: message and stack, no
 * detail. That path is the overwhelming majority and its `stack` already carries
 * 8000 characters of structure, so there is nothing to gain and bytes to lose.
 *
 * The non-`Error` arm is the repair. `String(e)` collapsed every plain object to
 * the literal "[object Object]" — and because a non-`Error` has no stack, the
 * dedup key at lib/observe/clientErrorTransport.ts reduced to
 * `source|level|[object Object]|`, so the FIRST such crash reached the wire and
 * every one after it was silently dropped. The projection gives each value a
 * legible message and a discriminating detail; the transport puts detail in the
 * key. Both halves are needed: the rejection listener sends a fixed message, which
 * no projection can make discriminating.
 */
function toWire(e: unknown): { message: string; stack?: string | undefined; detail?: string } {
  if (e instanceof Error) return { message: e.message || "(no message)", stack: e.stack };
  const { message, detail } = describeClientValue(e);
  return { message, ...(detail ? { detail } : {}) };
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
  const { message, stack, detail } = toWire(input.error);
  clientErrorTransport({
    source: `client.${input.area}`,
    level: "error",
    message,
    ...(stack ? { stack } : {}),
    ...(detail ? { detail } : {}),
    ...(input.componentStack ? { componentStack: input.componentStack } : {}),
    ...(input.digest ? { digest: input.digest } : {}),
    ...(input.tileId ? { tileId: input.tileId } : {}),
  });
}
