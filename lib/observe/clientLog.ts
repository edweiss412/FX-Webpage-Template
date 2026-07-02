import { clientErrorTransport } from "@/lib/observe/clientErrorTransport";

// ALWAYS console (browser dev keeps the full structured context). warn/error ALSO mirror to
// app_events (level-gated, spec §0.4); info/debug are console-only. context is NEVER mirrored.
export function clientLog(
  level: "warn" | "error" | "info" | "debug",
  source: string,
  message: string,
  context?: unknown,
  code?: string,
  detail?: string,
): void {
  // This file IS the sanctioned console wrapper — exempt from no-console in eslint.config.mjs.
  if (context === undefined) console[level](message);
  else console[level](message, context);
  if (level === "warn" || level === "error") {
    // Forward ONLY code/detail to the mirror (categorization + bounded forensics); `context`
    // is console-only and NEVER mirrored.
    clientErrorTransport({
      source,
      level,
      message,
      ...(code !== undefined ? { code } : {}),
      ...(detail !== undefined ? { detail } : {}),
    });
  }
}
