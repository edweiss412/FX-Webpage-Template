// Glob -> anchored RegExp, used by the vitest-projects partition meta-test to
// evaluate files against the projects' REAL include/exclude arrays.
//
// Sentinel-based on purpose: a naive sequential replace re-processes regex it
// has already emitted, which turns the default excludes' terminal `/**`
// (`**/node_modules/**`) into a pattern that cannot match nested descendants.
// Marking the three glob tokens BEFORE escaping, then expanding the markers
// afterwards, keeps each token's expansion out of every later replace.
//
// picomatch is not importable from the workspace root (nested, non-hoisted
// transitive dep with no @types), so this stays dependency-free. Covered by
// tests/cross-cutting/serialAudit.test.ts against every glob shape the vitest
// config actually contains.
const DEEP_SUFFIX = "\0DEEPSUF\0";
const DEEP = "\0DEEP\0";
const STAR = "\0STAR\0";

export function globToRegExp(glob: string): RegExp {
  const marked = glob
    .replace(/\/\*\*$/, DEEP_SUFFIX)
    .replace(/\*\*\//g, DEEP)
    .replace(/\*/g, STAR);
  const escaped = marked.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\\\{([^}]*)\\\}/g, (_m, alts: string) => `(?:${alts.split(",").join("|")})`)
    .split(DEEP_SUFFIX)
    .join("(?:/.*)?")
    .split(DEEP)
    .join("(?:.*/)?")
    .split(STAR)
    .join("[^/]*");
  return new RegExp(`^${body}$`);
}
