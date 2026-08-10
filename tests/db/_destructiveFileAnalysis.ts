/**
 * tests/db/_destructiveFileAnalysis.ts (Task 5b, 2026-08-09)
 *
 * `CALLS_LOCAL_GUARD` in the destructive-target guard matches a CALL WHOSE NAME LOOKS
 * RIGHT. That is three holes wide, and each one lets a file wipe or prune the
 * validation project while the meta-test stays green:
 *
 *   (a) binding — the guard runs on a different string than the one connected.
 *       `assertLocalDbUrl("postgresql://localhost:.../")` next to
 *       `postgres(process.env.TEST_DATABASE_URL)` satisfies a name match.
 *   (b) ordering — the guard runs AFTER the connection is opened.
 *   (c) provenance — the name resolves to a local same-named function, not the
 *       imported guard.
 *
 * This module is the analysis, extracted so it can be driven by fixture strings.
 * Asserting only that the two real files pass proves nothing: both are already
 * correct, so an analyzer returning `ok` unconditionally satisfies every positive.
 *
 * The FILE PATH is a parameter, not a convenience. Closure (c) resolves the callee to
 * the guard module, and both live positives spell the import RELATIVELY
 * (`./_localDbUrl`). Resolving that from source text alone forces a choice between
 * accepting the bare relative spelling from anywhere — which is the provenance hole —
 * and demanding the absolute alias, which rejects both live positives.
 *
 * Threat model: ordinary authoring mistakes by a contributor. Adversarial obfuscation
 * (computed member access, aliased re-export chains, eval) is out of scope and files
 * to documented limits.
 */
import { dirname, resolve } from "node:path";
import { stripComments } from "@/tests/_shared/stripCommentsAndStrings";

export type DestructiveFileVerdict = { ok: true } | { ok: false; reason: string };

/** The guard module every destructive file must actually call into. */
const GUARD_MODULE_ABS = "tests/db/_localDbUrl";

const GUARD_NAMES = ["assertLocalDbUrl", "assertSafeDestructiveTarget"] as const;

/** `import { assertLocalDbUrl } from "<spec>";` — captures names and the specifier. */
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/** `postgres(<arg>` — the connection open. */
const CONNECT_RE = /\bpostgres\s*\(\s*([A-Za-z_$][\w$]*|[^)]*?)\s*[),]/;
const CONNECT_RE_G = /\bpostgres\s*\(\s*([A-Za-z_$][\w$]*|[^)]*?)\s*[),]/g;

/** `const <id> = <guard>(` — the guard's return bound to a name. */
function guardBindingName(source: string): string | null {
  for (const name of GUARD_NAMES) {
    const m = source.match(
      new RegExp(String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*${name}\s*\(`),
    );
    if (m) return m[1]!;
    // `<id> = guard(<id>)` — reassignment, not a declaration. Still a binding.
    const r = source.match(new RegExp(String.raw`\b([A-Za-z_$][\w$]*)\s*=\s*${name}\s*\(`));
    if (r) return r[1]!;
  }
  return null;
}

/**
 * Resolve whether the guard NAME in this file refers to the real guard module.
 *
 * Accepts a relative specifier by resolving it against the file's own directory,
 * which is exactly what the runtime does and what the two live positives rely on.
 */
function importsRealGuard(filePath: string, source: string): boolean {
  IMPORT_RE.lastIndex = 0;
  for (let m = IMPORT_RE.exec(source); m; m = IMPORT_RE.exec(source)) {
    const names = m[1]!.split(",").map((n) =>
      n
        .trim()
        .split(/\s+as\s+/)[0]!
        .trim(),
    );
    if (!names.some((n) => (GUARD_NAMES as readonly string[]).includes(n))) continue;
    const spec = m[2]!;
    const resolved = spec.startsWith(".")
      ? resolve(dirname(filePath), spec).replace(process.cwd() + "/", "")
      : spec.replace(/^@\//, "");
    if (resolved === GUARD_MODULE_ABS) return true;
  }
  return false;
}

/** A local declaration that SHADOWS the guard name. */
function declaresLocalShadow(source: string): boolean {
  return GUARD_NAMES.some((name) =>
    new RegExp(String.raw`\b(?:const|let|var|function)\s+${name}\b`).test(source),
  );
}

export function analyseDestructiveFile(
  filePath: string,
  rawSource: string,
): DestructiveFileVerdict {
  // Every check below runs on COMMENT-STRIPPED source. A guard that exists only inside a
  // comment is not a guard; whole-diff r1 finding 2 demonstrated `commented_guard` passing.
  const source = stripComments(rawSource);

  const called = GUARD_NAMES.some((n) => new RegExp(String.raw`\b${n}\s*\(`).test(source));
  if (!called) return { ok: false, reason: "no loopback guard is called" };

  // (c) provenance. Checked FIRST, because a shadowed name makes every other check
  // meaningless — the "guard" being ordered and bound correctly is a no-op function.
  if (declaresLocalShadow(source)) {
    return {
      ok: false,
      reason: "the guard name resolves to a local declaration, not the imported guard",
    };
  }
  if (!importsRealGuard(filePath, source)) {
    return { ok: false, reason: `the guard name is not imported from ${GUARD_MODULE_ABS}` };
  }

  // EVERY connection, not just the first. whole-diff r1 finding 2 demonstrated
  // `second_unguarded_client`: a correctly guarded client followed by an unguarded one
  // that executes the prune. Checking `match` (first only) blessed the file.
  const connects = [...source.matchAll(CONNECT_RE_G)];
  if (connects.length === 0) return { ok: false, reason: "no postgres(...) connection found" };
  for (const c of connects) {
    const verdict = checkOneConnection(source, c[1]!.trim(), c.index!);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

function checkOneConnection(
  source: string,
  connectArg: string,
  connectIdx: number,
): DestructiveFileVerdict {
  // The inline form `postgres(assertLocalDbUrl(...))` satisfies (a) and (b) by
  // construction: the connected value IS the guard's return, evaluated before the
  // call it feeds.
  if (GUARD_NAMES.some((n) => connectArg.startsWith(n))) return { ok: true };

  // (a) binding. The connected identifier must be the one the guard call assigns.
  const bound = guardBindingName(source);
  if (!bound) {
    return {
      ok: false,
      reason: "the guard's return value is discarded, so it cannot be the connected value",
    };
  }
  if (connectArg !== bound) {
    return {
      ok: false,
      reason: `postgres() receives \`${connectArg}\`, not the guard's return \`${bound}\``,
    };
  }

  // (b) ordering. The ASSIGNMENT that produces the connected binding must precede the
  // connection. A `let` reassigned after `postgres(...)` keeps binding equality while
  // opening the connection unguarded.
  const assignIdx = GUARD_NAMES.map((n) =>
    source.search(new RegExp(String.raw`\b${bound}\s*=\s*${n}\s*\(`)),
  ).filter((i) => i >= 0);
  if (assignIdx.length === 0 || Math.min(...assignIdx) > connectIdx) {
    return { ok: false, reason: "the guard call runs after the connection is opened" };
  }

  // A guarded binding that is REASSIGNED before the connection is no longer guarded.
  // whole-diff r1 finding 2 demonstrated `reassigned_after_guard`: `url` guarded, then
  // overwritten with TEST_DATABASE_URL, then connected. Binding equality and ordering
  // both still held; the VALUE did not.
  const rebind = new RegExp(String.raw`\b${bound}\s*=\s*(?!${GUARD_NAMES.join("|")})`, "g");
  for (const m of source.matchAll(rebind)) {
    // Skip the declaration itself (`const url = guard(...)` is matched by assignIdx).
    if (/\b(?:const|let|var)\s*$/.test(source.slice(Math.max(0, m.index! - 12), m.index!)))
      continue;
    if (m.index! < connectIdx) {
      return {
        ok: false,
        reason: `\`${bound}\` is reassigned from a non-guard expression before the connection`,
      };
    }
  }

  return { ok: true };
}
