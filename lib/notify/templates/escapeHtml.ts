const MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes `& < > " '` for safe interpolation into email HTML bodies. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => MAP[c]!);
}

/**
 * Runs on the INTERPOLATED PLAIN-TEXT/SOURCE copy BEFORE HTML rendering (§8, AC-B3.9b):
 * an unresolved catalog placeholder (e.g. `<sheet-name>`) must never reach an email body.
 * Operates on plain text, so a literal `<word>` token IS treated as an unresolved
 * placeholder — email copy never legitimately contains angle-bracket tags pre-render.
 */
const PLACEHOLDER = /<[a-zA-Z][a-zA-Z0-9_-]*>/;
export function assertNoUnresolvedPlaceholder(plainText: string): void {
  const m = plainText.match(PLACEHOLDER);
  if (m) throw new Error(`unresolved catalog placeholder in email copy: ${m[0]}`);
}
