/**
 * lib/data/diagrams.ts — resolves the live `current` diagrams sub-payload
 * from the raw `shows.diagrams` JSONB column (M7 Task 7.9 §6 watchpoint 13),
 * AND owns the shared diagram MIME allowlist consumed by both the
 * crew-page tile projection and the `/api/asset/diagram/...` proxy
 * route (Codex R13 P1 — unified eligibility check).
 *
 * The post-M7 JSONB shape is `{ current: PersistedDiagrams | null,
 * pending: ... }`. Older rows live as the inner `PersistedDiagrams`
 * directly. This helper accepts either and returns ONLY the live
 * `current` view. The `pending` slot is the cutover staging slot for
 * the post-commit promoter and is NEVER read by crew-facing surfaces
 * or the asset route — keeping the same gate in lib means the gallery
 * and the route can never drift on which sub-payload is authoritative.
 *
 * The MIME allowlist (`ALLOWED_DIAGRAM_MIMES` / `isAllowedDiagramMime`)
 * is the single source of truth for which raster types may render in
 * the crew gallery AND which the proxy is willing to serve. Without
 * unification, a persisted `image/svg+xml` entry could get
 * `available: true` in DiagramsTile (renders as `<img>`) but always
 * 410 at the proxy — broken image with no admin warning.
 */
import type { PersistedDiagrams } from "@/lib/parser/types";

/**
 * Inert raster image MIMEs eligible for the crew diagram gallery. SVG
 * and any non-raster image MIME are excluded — they render as
 * same-origin active content when loaded as a top-level document.
 */
export const ALLOWED_DIAGRAM_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function isAllowedDiagramMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return ALLOWED_DIAGRAM_MIMES.has(mime.toLowerCase());
}

type DiagramsWrapper = { current?: PersistedDiagrams | null; pending?: unknown };

function isPersistedDiagrams(value: unknown): value is PersistedDiagrams {
  return (
    typeof value === "object" &&
    value !== null &&
    "snapshot_revision_id" in value &&
    typeof (value as { snapshot_revision_id: unknown }).snapshot_revision_id === "string"
  );
}

export function resolveCurrentDiagrams(diagrams: unknown): PersistedDiagrams | null {
  if (!diagrams || typeof diagrams !== "object") return null;
  if (isPersistedDiagrams(diagrams)) return diagrams;
  const wrapper = diagrams as DiagramsWrapper;
  return isPersistedDiagrams(wrapper.current) ? wrapper.current : null;
}
