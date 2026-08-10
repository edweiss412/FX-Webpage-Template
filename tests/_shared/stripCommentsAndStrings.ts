/**
 * tests/_shared/stripCommentsAndStrings.ts
 *
 * Source-text guards that grep raw text cannot tell CODE from PROSE, and the whole-diff
 * review found that failing in both directions at once:
 *
 *   - **Comments read as code.** Every repair pin in this arc (`manualSyncInstallsSink`,
 *     `onboardingScanSyncLogAttribution`, the destructive-target analyzer) stayed green
 *     after the live code was replaced with a commented-out copy of itself. A pin that
 *     cannot fail when its subject is commented out pins nothing.
 *   - **Strings read as comments.** A naive `//`-stripper eats the rest of the line from
 *     inside `"https://example.com"`, which silently removed a real
 *     `sql.unsafe("select public.prune_sync_log()")` from destructive discovery — the
 *     guard un-discovered a genuinely unsafe file.
 *
 * One scanner, used by both, so the two directions cannot drift apart.
 *
 * Threat model: ordinary authoring mistakes by a contributor. This is a character
 * scanner, not a parser — it handles line comments, block comments, the three string
 * quote forms, escapes, and template literals with `${}` interpolation. Deliberately
 * out of scope, and documented rather than guessed at: regex literals containing quote
 * or slash characters, and nested template interpolation beyond one level. Adversarial
 * obfuscation is out of scope by the same fence.
 */

/** Replace comment bodies with spaces, preserving offsets and line structure. */
export function stripComments(source: string): string {
  return scan(source, { blankComments: true, blankStrings: false });
}

/**
 * Comments AND string bodies blanked. Use when a pattern could otherwise match text
 * that merely MENTIONS the thing (a URL, a doc snippet, an expected-SQL literal in an
 * assertion) rather than executing it.
 */
export function stripCommentsAndStrings(source: string): string {
  return scan(source, { blankComments: true, blankStrings: true });
}

function scan(source: string, opts: { blankComments: boolean; blankStrings: boolean }): string {
  const out: string[] = [];
  let i = 0;
  const n = source.length;

  /** Push a run verbatim, or blanked to spaces with newlines kept so line numbers hold. */
  const push = (text: string, blank: boolean): void => {
    out.push(blank ? text.replace(/[^\n]/g, " ") : text);
  };

  while (i < n) {
    const two = source.slice(i, i + 2);

    if (two === "//") {
      let j = i;
      while (j < n && source[j] !== "\n") j += 1;
      push(source.slice(i, j), opts.blankComments);
      i = j;
      continue;
    }

    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      push(source.slice(i, j), opts.blankComments);
      i = j;
      continue;
    }

    const ch = source[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      const j = endOfString(source, i, ch);
      // The delimiters stay so a blanked string is still recognizable as a string
      // literal (`""`), not as absent syntax.
      out.push(ch);
      push(source.slice(i + 1, j - 1), opts.blankStrings);
      if (j - 1 > i) out.push(source[j - 1] === ch ? ch : "");
      i = j;
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return out.join("");
}

/** Index just past the closing quote. Handles escapes and one level of `${}`. */
function endOfString(source: string, start: number, quote: string): number {
  let i = start + 1;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote === "`" && ch === "$" && source[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") depth -= 1;
        i += 1;
      }
      continue;
    }
    // An unterminated single/double quote ends at the newline, as it does in the
    // language. Without this a stray apostrophe in prose would swallow the file.
    if (quote !== "`" && ch === "\n") return i;
    i += 1;
  }
  return n;
}
