"use client";
/**
 * components/admin/dev/DevCaptureControl.tsx - §2.4/§7 shared orchestration.
 * State machine idle -> busy -> idle|error; all transitions instant (§7.4).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { captureShowTelemetry, type CaptureTelemetryRequest } from "@/app/admin/_devCaptureAction";
import { captureElementPng } from "@/lib/devcapture/captureElement";
import {
  buildTelemetryDoc,
  bundleFilename,
  downloadBlob,
  zipBundle,
  type TelemetryMeta,
} from "@/lib/devcapture/bundle";

export type DevCaptureState = "idle" | "busy" | "error";
const ERROR_AUTO_CLEAR_MS = 6000; // §10

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0; // §7.3 non-finite normalization
}

/** §4.5 deterministic reason classification for a RESOLVED action result. */
function classifyResolved(
  r: unknown,
):
  | { kind: "ok"; [k: string]: unknown }
  | { kind: "unavailable"; reason: "bad_request" | "action_failed" } {
  if (r !== null && typeof r === "object" && "kind" in r) {
    const k = (r as { kind: unknown }).kind;
    if (k === "ok") return r as { kind: "ok" };
    if (k === "bad_request") return { kind: "unavailable", reason: "bad_request" };
  }
  return { kind: "unavailable", reason: "action_failed" }; // null/undefined/junk resolved shapes
}

export function useDevCapture(opts: {
  target: () => HTMLElement | null;
  request: CaptureTelemetryRequest;
  clientSnapshot: () => unknown;
  filenameSeed: string;
  preCapture?: () => Promise<void>;
}): { state: DevCaptureState; run: () => void; busyRef: RefObject<boolean> } {
  const [state, setState] = useState<DevCaptureState>("idle");
  const inFlight = useRef(false); // SYNCHRONOUS single-flight guard (state alone races two same-tick runs)
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true; // Strict Mode replays setup after cleanup; without this the ref stays false forever
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (timer.current !== null) {
      clearTimeout(timer.current); // error -> busy rerun: stale auto-clear must not fire mid-run
      timer.current = null;
    }
    setState("busy");
    void (async () => {
      await opts.preCapture?.(); // popover close + settle frames, INSIDE the busy lockout (spec §2.2 amendment #2)
      const el = opts.target();
      if (el === null) throw new Error("capture target unmounted");
      const rect = el.getBoundingClientRect();
      // Concurrent by construction: both promises created before either await.
      const [png, server] = await Promise.all([
        captureElementPng(el).then((b) => b.arrayBuffer()),
        captureShowTelemetry(opts.request).then(classifyResolved, () => ({
          kind: "unavailable" as const,
          reason: "network_error" as const,
        })),
      ]);
      const commitSha =
        server.kind === "ok" && typeof server["commitSha"] === "string"
          ? (server["commitSha"] as string)
          : null;
      const meta: TelemetryMeta = {
        capturedAt: new Date().toISOString(),
        commitSha,
        url: `${location.origin}${location.pathname}`,
        userAgent: navigator.userAgent,
        viewport: {
          w: finite(window.innerWidth),
          h: finite(window.innerHeight),
          dpr: finite(window.devicePixelRatio),
        },
        modalKind: opts.request.kind,
        showId: opts.request.kind === "published" ? opts.request.showId : null,
        driveFileId: opts.request.kind === "staged" ? opts.request.driveFileId : null,
        panelRect: { w: finite(rect.width), h: finite(rect.height) },
      };
      // clientSnapshot() may throw (§7.3): degrade, never fail the run.
      let snapshot: unknown;
      try {
        snapshot = opts.clientSnapshot();
      } catch {
        snapshot = { kind: "unserializable", reason: "serialize_threw" };
      }
      const doc = buildTelemetryDoc({ meta, clientSnapshot: snapshot, server });
      downloadBlob(
        zipBundle(new Uint8Array(png), JSON.stringify(doc)),
        bundleFilename(opts.filenameSeed, new Date()),
        () => mounted.current, // §6: unmount between URL creation and click
      );
      if (mounted.current) setState("idle");
    })()
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console -- spec §7.2: the full error object goes to the browser console; the UI shows fixed copy only
        console.error("dev capture failed", err);
        if (!mounted.current) return;
        setState("error");
        timer.current = setTimeout(() => {
          timer.current = null;
          if (mounted.current) setState("idle");
        }, ERROR_AUTO_CLEAR_MS);
      })
      .finally(() => {
        inFlight.current = false; // also clears busyRef (same ref) at settle
      });
  }, [opts]);

  return { state, run, busyRef: inFlight };
}
