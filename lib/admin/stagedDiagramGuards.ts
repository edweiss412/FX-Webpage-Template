import type { EmbeddedImageStub } from "@/lib/parser/types";

/**
 * Element-level guard for UNTRUSTED persisted JSONB diagram stubs (spec §B1).
 * A stub is addressable/renderable only if every field either consumer
 * (staged-diagram route, DiagramsBreakdown) dereferences has the right shape:
 * objectId/mimeType/sheetTab string-required; alt absent-or-string;
 * contentUrl absent/null/string. The shared export exists so the two
 * surfaces can never disagree on what "valid stub" means.
 */
export function isRenderableDiagramStub(x: unknown): x is EmbeddedImageStub {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.objectId !== "string") return false;
  if (typeof o.mimeType !== "string") return false;
  if (typeof o.sheetTab !== "string") return false;
  if (o.alt !== undefined && typeof o.alt !== "string") return false;
  if (o.contentUrl !== undefined && o.contentUrl !== null && typeof o.contentUrl !== "string") {
    return false;
  }
  if (o.mediaPartName !== undefined && typeof o.mediaPartName !== "string") return false;
  if (
    o.embeddedFingerprint !== undefined &&
    o.embeddedFingerprint !== null &&
    typeof o.embeddedFingerprint !== "string"
  ) {
    return false;
  }
  return true;
}

const TRUSTED_DIAGRAM_HOSTS = ["googleusercontent.com", "google.com"] as const;

/**
 * URL trust boundary (spec §B1, load-bearing): the snapshot fetch helper sends
 * the Drive BEARER TOKEN to whatever contentUrl says
 * (lib/sync/defaultSnapshotAssetsForApply.ts:60-66), and parse_result is
 * untrusted — so https-only + dot-boundary host suffix, never a bare
 * endsWith (suffix-spoofs like google.com.evil.net must fail).
 */
export function isTrustedDiagramContentUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase(); // canonicalize-exempt: URL host comparison, not email normalization.
  return TRUSTED_DIAGRAM_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

/** A stub the preview route can actually serve: a TRUSTED legacy per-entry URL
 *  (untrusted string contentUrls 404 at the route — the predicate must agree),
 *  or an XLSX-media entry addressable by fingerprint (fingerprint null =
 *  restage-only, lib/parser/types.ts:258-262 — not servable). */
export function hasStagedPreviewSource(stub: EmbeddedImageStub): boolean {
  // Mirrors the route's branch order: a string contentUrl is AUTHORITATIVE
  // (untrusted → not servable, even if a media pair coexists on a corrupt
  // stub); the media arm applies only when contentUrl is null/absent.
  if (typeof stub.contentUrl === "string") return isTrustedDiagramContentUrl(stub.contentUrl);
  return typeof stub.mediaPartName === "string" && typeof stub.embeddedFingerprint === "string";
}

/**
 * Folder-row href revalidation (spec §B3): parse + exact-host
 * drive.google.com + https/http only, http upgraded to https. Anything else
 * → no link. Lives here (not in components/) so the crew-surface source-
 * hygiene scan (tests/cross-cutting/noRawDriveHostsInCrewSurface.test.ts)
 * stays literal-free in components/ — admin UI consumes this via import.
 */
export function trustedDriveFolderHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname !== "drive.google.com") return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.protocol === "http:") url.protocol = "https:";
  return url.toString();
}
