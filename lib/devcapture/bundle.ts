/**
 * lib/devcapture/bundle.ts - telemetry assembly (§4), snapshot bounds (§4.3),
 * document-wide redaction ordering (§4.5), zip + filename + download (§6).
 * Client-only. No lib/log import (reading telemetry never writes it).
 */
import { zipSync } from "fflate";
import { redactTelemetry } from "@/lib/devcapture/redact";

export type TelemetryMeta = {
  capturedAt: string;
  commitSha: string | null;
  url: string;
  userAgent: string;
  viewport: { w: number; h: number; dpr: number };
  modalKind: "published" | "staged";
  showId: string | null;
  driveFileId: string | null;
  panelRect: { w: number; h: number };
};

const SNAPSHOT_CHAR_BOUND = 1_000_000; // §10

function normalizeSnapshot(snapshot: unknown): unknown {
  try {
    const s = JSON.stringify(snapshot, (_k, v: unknown) =>
      typeof v === "function" ? undefined : v,
    );
    if (s === undefined) return null;
    if (s.length > SNAPSHOT_CHAR_BOUND) return { kind: "too_large", chars: s.length };
    return JSON.parse(s) as unknown;
  } catch {
    return { kind: "unserializable", reason: "serialize_threw" };
  }
}

export function buildTelemetryDoc(input: {
  meta: TelemetryMeta;
  clientSnapshot: unknown;
  server: unknown;
}): unknown {
  return redactTelemetry({
    meta: input.meta,
    clientSnapshot: normalizeSnapshot(input.clientSnapshot),
    server: input.server,
  });
}

export function zipBundle(png: Uint8Array, telemetryJson: string): Uint8Array {
  return zipSync({
    "screenshot.png": [png, { level: 0 }],
    "telemetry.json": new TextEncoder().encode(telemetryJson),
  });
}

export function bundleFilename(seed: string, now: Date): string {
  const clean = seed.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64) || "show";
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}-${p(
    now.getHours(),
    2,
  )}${p(now.getMinutes(), 2)}${p(now.getSeconds(), 2)}`;
  return `dev-capture-${clean}-${stamp}.zip`;
}

export function downloadBlob(
  bytes: Uint8Array,
  filename: string,
  shouldClick?: () => boolean,
): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  try {
    if (shouldClick?.() === false) return; // owner unmounted between create and click (§6)
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
