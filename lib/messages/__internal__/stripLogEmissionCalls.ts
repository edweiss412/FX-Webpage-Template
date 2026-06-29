/**
 * Strip `log.<level>( … )` call expressions from TypeScript source text.
 *
 * The §12.4 catalog / internal-code-enum scanners detect "code producers" by
 * scanning app/ and lib/ for a quoted SHOUTY_SNAKE_CASE value assigned to a
 * `code` property. The structured logger (`lib/log`) also accepts a `code`
 * field, but `app_events.code` is a free-form forensic string that is NEVER
 * rendered to a user and is deliberately NOT §12.4-gated (logging-foundation
 * spec §13.7 / AGENTS.md invariant 5 is a UI-rendering contract). So a
 * `log.error(...)` emission carrying such a field MUST NOT be mistaken for a
 * user-facing / admin_alerts code producer.
 *
 * This helper removes every `log.error|warn|info|debug( … )` span — balanced
 * parens, with string / template-literal / comment awareness so a `(` `)` `{`
 * `}` inside a string or `${…}` never throws off the matcher — so the producer
 * scanners only see real producer literals. It is intentionally conservative:
 * if a call's parens are unbalanced (truncated source), it stops stripping and
 * returns the remainder verbatim rather than risk corrupting the scan.
 */
const LOG_CALL_RE = /\blog\.(?:error|warn|info|debug)\s*\(/g;

export function stripLogEmissionCalls(source: string): string {
  let out = "";
  let cursor = 0;
  LOG_CALL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LOG_CALL_RE.exec(source)) !== null) {
    const openParen = match.index + match[0].length - 1;
    const close = matchParen(source, openParen);
    if (close === -1) break; // unbalanced/truncated — keep the remainder verbatim
    out += source.slice(cursor, match.index);
    cursor = close + 1;
    LOG_CALL_RE.lastIndex = cursor;
  }
  out += source.slice(cursor);
  return out;
}

/** Index of the `)` that closes the `(` at `openIdx`, or -1 if unbalanced. */
function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") {
      i = skipQuoted(s, i, c);
      continue;
    }
    if (c === "`") {
      i = skipTemplate(s, i);
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      const nl = s.indexOf("\n", i);
      if (nl === -1) return -1;
      i = nl;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `i` at the opening quote; returns the index of the closing quote. */
function skipQuoted(s: string, i: number, quote: string): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === quote) return j;
    if (s[j] === "\n") return j - 1; // unterminated string — bail at line end
  }
  return s.length - 1;
}

/** `i` at the opening backtick; handles `${…}` nesting; returns closing-backtick index. */
function skipTemplate(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "`") return j;
    if (s[j] === "$" && s[j + 1] === "{") {
      let braceDepth = 1;
      j += 2;
      while (j < s.length && braceDepth > 0) {
        const cc = s[j];
        if (cc === "\\") {
          j += 2;
          continue;
        }
        if (cc === '"' || cc === "'") {
          j = skipQuoted(s, j, cc) + 1;
          continue;
        }
        if (cc === "`") {
          j = skipTemplate(s, j) + 1;
          continue;
        }
        if (cc === "{") braceDepth++;
        else if (cc === "}") {
          braceDepth--;
          if (braceDepth === 0) break;
        }
        j++;
      }
    }
  }
  return s.length - 1;
}
