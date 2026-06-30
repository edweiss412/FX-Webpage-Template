import { clientErrorTransport } from "@/lib/observe/clientErrorTransport";

// ALWAYS console (browser dev keeps the full structured context). warn/error ALSO mirror to
// app_events (level-gated, spec §0.4); info/debug are console-only. context is NEVER mirrored.
export function clientLog(
  level: "warn" | "error" | "info" | "debug",
  source: string,
  message: string,
  context?: unknown,
): void {
  // eslint-disable-next-line no-console -- this file IS the sanctioned console wrapper
  if (context === undefined) console[level](message);
  // eslint-disable-next-line no-console
  else console[level](message, context);
  if (level === "warn" || level === "error") {
    clientErrorTransport({ source, level, message });
  }
}
