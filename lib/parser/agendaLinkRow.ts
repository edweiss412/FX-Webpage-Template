/** Canonical agenda-link row selector — shared by parseAgendaLinks AND getAgendaChips
 *  so their ordered sequences align 1:1 (spec §4.5.1/§4.5.3). Mirrors the label/value
 *  test that was inline in parseAgendaLinks (lib/parser/index.ts). */
const LABEL_RE = /^(AGENDA LINK.*|AGENDA)$/i;
export function isAgendaLinkRow(label: string, value: string): boolean {
  return LABEL_RE.test(label.trim()) && value.trim().length > 0;
}
