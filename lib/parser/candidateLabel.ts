// The render-side reader for `ParseWarning.candidate`, shared by both operator surfaces
// (spec docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md §5).
//
// Takes `unknown` deliberately. `candidate` is jsonb-persisted on
// `shows_internal.parse_warnings` and `pending_syncs.parse_result` (lib/parser/types.ts:113-125),
// so a warning read back is whatever was written; the declared `string` is a claim, not a check.
// This is the same rule the shipped `usable` helper applies to `blockRef.name`, `rawSnippet`, and
// `blockRef.field` on the per-show surface (components/admin/PerShowActionableWarnings.tsx:204).
//
// ACCEPT-SET, keyed on type rather than spelling: a string with at least one non-whitespace
// character, rendered trimmed. Everything else renders nothing, absent key included, because
// absence is what discriminates a legacy row from a near-miss (lib/parser/warnings.ts:427 omits
// the KEY rather than setting it undefined).
export function candidateLabel(warning: { candidate?: unknown }): string | null {
  const v = warning.candidate;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
