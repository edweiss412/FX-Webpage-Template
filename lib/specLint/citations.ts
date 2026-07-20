export type SpanClass =
  | { kind: "prose" }
  | { kind: "malformed"; reason: string }
  | { kind: "citation"; path: string; bare: boolean; start?: number; end?: number }; // start absent = path-only

const PATH_SAFE = /^[A-Za-z0-9_.,()[\]:/\\-]+$/;
const DRIVE_SHAPE = /^[A-Za-z]:[/\\]/;
const LINE_COORDS = /^([1-9][0-9]*)(?:-([1-9][0-9]*))?$/;
const BARE_EXT_ALLOWLIST =
  /^[^/:]+\.(ts|tsx|js|jsx|mjs|cjs|mdx|md|sql|sh|css|json|yml|yaml|toml|html)$/;

/** Spec §4 path rule: no leading `/`, no backslash, no `.`/`..` segment (split on `/`). */
function pathRuleOk(p: string): boolean {
  if (p === "" || p.startsWith("/") || p.includes("\\")) return false;
  return p.split("/").every((seg) => seg !== "." && seg !== "..");
}

function dottedFinalSegment(s: string): boolean {
  const segs = s.split(/[/\\]/);
  const last = segs[segs.length - 1] ?? "";
  return last.includes(".") && last !== "." && last !== "..";
}

export function classifySpan(content: string): SpanClass {
  if (/\s/.test(content) || content.includes("`")) return { kind: "prose" };
  if (/[*{$]/.test(content)) return { kind: "prose" };

  // Backslash / drive branch (ordered before the colon and path-only forms).
  if (content.includes("\\") || DRIVE_SHAPE.test(content)) {
    const pathSafe = PATH_SAFE.test(content);
    const intent = content.includes(":") || dottedFinalSegment(content);
    if (pathSafe && intent) return { kind: "malformed", reason: "windows-style path" };
    return { kind: "prose" };
  }

  const colonIdx = content.indexOf(":");
  if (colonIdx >= 0) {
    const prefix = content.slice(0, colonIdx);
    const suffix = content.slice(colonIdx + 1);
    const prefixQualifies =
      ((prefix.includes(".") || prefix.includes("/")) && !/^\d+$/.test(prefix)) ||
      prefix === "" ||
      /^[A-Za-z]$/.test(prefix);
    if (!prefixQualifies) return { kind: "prose" };
    if (prefix === "") return { kind: "malformed", reason: "empty path" };
    if (/^[A-Za-z]$/.test(prefix)) return { kind: "malformed", reason: "drive-relative path" };
    const coords = LINE_COORDS.exec(suffix);
    if (!coords) return { kind: "malformed", reason: "invalid line coordinates" };
    if (!pathRuleOk(prefix)) return { kind: "malformed", reason: "illegal path" };
    const start = Number(coords[1]);
    const bare = !prefix.includes("/");
    if (coords[2] !== undefined) {
      return { kind: "citation", path: prefix, bare, start, end: Number(coords[2]) };
    }
    return { kind: "citation", path: prefix, bare, start };
  }

  // path-only, slashed
  if (content.includes("/")) {
    if (!dottedFinalSegment(content)) return { kind: "prose" };
    if (!pathRuleOk(content)) return { kind: "malformed", reason: "illegal path" };
    return { kind: "citation", path: content, bare: false };
  }

  // path-only, bare
  if (BARE_EXT_ALLOWLIST.test(content)) {
    return { kind: "citation", path: content, bare: true };
  }
  return { kind: "prose" };
}
