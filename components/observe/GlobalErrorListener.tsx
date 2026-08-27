"use client";

import { useEffect } from "react";

import { clientLog } from "@/lib/observe/clientLog";
import { describeClientValue } from "@/lib/observe/describeClientValue";

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
      // event.error is where the DOM puts the thrown value, and this handler never
      // read it: a plain object thrown at the window lost its fields entirely —
      // not collapsed to "[object Object]" like the other two wire paths, simply
      // absent. An Error keeps today's exact bytes, because its own message is
      // already the clientLog message below.
      const where = `${event.filename ?? ""}:${event.lineno ?? ""}`;
      const from =
        event.error == null || event.error instanceof Error
          ? ""
          : describeClientValue(event.error).detail;
      // The thrown value goes FIRST. Both parts share one 300-char budget, and a
      // filename can consume all of it on its own — a `data:` or `blob:` URL, or a
      // webpack `eval` sourceURL, is routinely longer than the cap. With file:line
      // leading, exactly the new information this handler exists to capture is what
      // the slice drops. Leading with the value means the truncation costs the
      // cheaper half.
      const detail = (from ? `${from} ${where}` : where).slice(0, DETAIL_CAP);
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
      // An Error reason keeps `reason.message`. null and undefined keep the empty
      // string the `?? ""` produced — routing them through the projection would
      // send "null" and "undefined", which reads worse in app_events and changes
      // behaviour this arc's row does not ask about (spec §9 limit 9). Everything
      // else goes through the projection, which is what stops a plain object
      // persisting as "[object Object]".
      //
      // The message stays the fixed "unhandled promise rejection", so `detail` in
      // the dedup signature is the ONLY thing separating two rejections. That is
      // why lib/observe/clientErrorTransport.ts had to change too.
      const detail = (
        reason instanceof Error
          ? reason.message
          : reason == null
            ? ""
            : describeClientValue(reason).detail
      ).slice(0, DETAIL_CAP);
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
