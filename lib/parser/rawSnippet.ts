// emitUnknownField writes rawSnippet as `${key} | ${value}` (lib/parser/warnings.ts).
// These pure helpers recover the label (before the FIRST " | ") and the value
// (everything after it, which may itself contain " | "). Used by the anchor
// dispatch (value → provenance match) and the UI (label → operator-visible row id).
const SEP = " | ";

export function labelFromRawSnippet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const i = raw.indexOf(SEP);
  if (i < 0) return null;
  const label = raw.slice(0, i).trim();
  return label.length > 0 ? label : null;
}

export function valueFromRawSnippet(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const i = raw.indexOf(SEP);
  if (i < 0) return null;
  return raw.slice(i + SEP.length);
}
