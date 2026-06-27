/**
 * lib/agenda/agendaLabel.ts — "AGENDA LINK - RFI" → "RFI" display label.
 *
 * Returns the suffix after the "AGENDA[ LINK]" prefix (e.g. "RFI", "PCF"), or `null` when
 * there is no distinguishing suffix ("AGENDA", "AGENDA LINK") — a single unlabeled agenda
 * needs no per-doc badge.
 */
export function agendaDisplayLabel(rawLabel: string): string | null {
  const m = rawLabel.trim().match(/^AGENDA(?:\s+LINK)?\s*-?\s*(.*)$/i);
  if (!m) return null;
  const rest = (m[1] ?? "").trim();
  return rest.length ? rest : null;
}
