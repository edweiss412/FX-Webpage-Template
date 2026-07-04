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
