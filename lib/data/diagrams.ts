/**
 * lib/data/diagrams.ts — resolves the live `current` diagrams sub-payload
 * from the raw `shows.diagrams` JSONB column (M7 Task 7.9 §6 watchpoint 13).
 *
 * The post-M7 shape is `{ current: PersistedDiagrams | null, pending: ... }`.
 * Older rows (and the parser-produced shape during M0–M6) live as the inner
 * `PersistedDiagrams` directly. This helper accepts either and returns ONLY
 * the live `current` view. The `pending` slot is the cutover staging slot
 * for the post-commit promoter and is NEVER read by crew-facing surfaces or
 * the asset route — keeping the same gate in lib means the gallery and the
 * `/api/asset/diagram/...` route can never drift on which sub-payload is
 * authoritative.
 */
import type { PersistedDiagrams } from "@/lib/parser/types";

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
