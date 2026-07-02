"use client";

import { useEffect } from "react";

import { clientLog } from "@/lib/observe/clientLog";

const DETAIL_CAP = 300;

// Module-level idempotence guard. Under React StrictMode (dev double-invoke)
// or an accidental double-mount, two instances can run their effect
// concurrently; only the first attaches the window listeners, so a single
// uncaught error yields a single telemetry record. The registering instance's
// cleanup resets the flag, so a fresh mount after full unmount re-registers.
let registered = false;

/**
 * Null-render client component (mounted once in the root layout's <body>) that
 * forwards uncaught window errors and unhandled promise rejections to
 * clientLog. clientLog persists warn/error to app_events, so these surface as
 * durable CLIENT_WINDOW_ERROR / CLIENT_UNHANDLED_REJECTION telemetry codes.
 */
export function GlobalErrorListener(): null {
  useEffect(() => {
    if (registered) return;
    registered = true;

    const onError = (event: ErrorEvent): void => {
      const detail = `${event.filename ?? ""}:${event.lineno ?? ""}`.slice(0, DETAIL_CAP);
      clientLog(
        "error",
        "client.root",
        event.message || "uncaught window error",
        undefined,
        "CLIENT_WINDOW_ERROR",
        detail,
      );
    };

    const onRejection = (event: PromiseRejectionEvent): void => {
      const reason = event.reason;
      const detail = String(reason instanceof Error ? reason.message : (reason ?? "")).slice(
        0,
        DETAIL_CAP,
      );
      clientLog(
        "error",
        "client.root",
        "unhandled promise rejection",
        undefined,
        "CLIENT_UNHANDLED_REJECTION",
        detail,
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      registered = false;
    };
  }, []);

  return null;
}
