/**
 * lib/planFences/index.ts — the plan-fence read-core.
 *
 * Spec: docs/superpowers/specs/2026-08-06-arc-b-review-infra.md §2.1. Pure by
 * contract: no filesystem, no process, no network — the CLI adapter and the
 * meta-test are the only things that touch disk, and a purity meta-test pins it.
 */
import { EM_DASH_CLASS, emDashMatches } from "@/lib/specLint/emDash";
import { fenceCoverage, waiverTarget } from "@/lib/specLint/waiverCoverage";
import { extractFences, type Fence } from "./extract";
import { KNOWN_API } from "./registry";
import {
  isRuleName,
  type Finding,
  type PlanFenceReport,
  type RuleName,
  type WaiverError,
} from "./types";

export { RULE_NAMES, isRuleName } from "./types";
export type { Finding, PlanFenceReport, RuleName } from "./types";
export { KNOWN_API } from "./registry";

/**
 * The gate's OWN waiver token. Rule-scoped on purpose (spec §2.1 R1 F2): the
 * spec-lint `ignore` token has whole-region semantics — it removes every
 * suppressible failure in a covered fence — which is precisely what a five-rule
 * gate must not inherit. Waiving "the em-dash here is quoted output" must not
 * also switch off the unchecked-index rule for the same block.
 */
const PLAN_FENCES_WAIVER = /^<!-- plan-fences: ignore ([A-Z_]*) — (.*?)\s*-->$/;
/** spec-lint's token, honored for FENCE_EM_DASH only (the dual-honor contract). */
// SUPPRESSING form: `ignore` only. The dual-honor contract names that token and
// no other; `not-ui` says something about a document's audience, not about a
// fence's contents, and treating it as a suppressor let an em-dash violation
// pass every gate (diff review R1 finding 3).
const SPEC_LINT_WAIVER = /^<!-- spec-lint: ignore — (.*?)\s*-->$/;
// RECOGNIZED form, for targeting and attribution to skip over. Wider on purpose:
// a `not-ui` line is still a waiver line, so it must not be mistaken for the
// prose that attributes a fence.
const SPEC_LINT_ANY = /^<!-- spec-lint: (?:ignore|not-ui) — (.*?)\s*-->$/;

/** Both waiver shapes, for attribution and targeting to skip over. */
function isWaiverShaped(line: string): boolean {
  return PLAN_FENCES_WAIVER.test(line.trim()) || SPEC_LINT_ANY.test(line.trim());
}

/**
 * Attribution: which source file a fence appends to.
 *
 * Pinned accept-set (spec §2.1 R1 F4): scan upward from the opener, skipping
 * blank and waiver lines, at most 6 lines; the FIRST non-blank prose line
 * decides, and it is ACCEPTED only if it carries EXACTLY ONE backticked
 * source-path token. Zero or several means UNATTRIBUTED — still checked by every
 * per-fence rule, exempt only from the cross-fence DUPLICATE_IMPORT.
 *
 * The four extensions are the SOURCE ones. The probe also admitted css/sql/yml/
 * yaml/json, which would attribute a fence to a stylesheet; a planted case pins
 * this side of that divergence.
 */
const PATH_TOKEN = /`([^`]*\.(?:ts|tsx|mjs|js))`/g;

function attributionOf(lines: string[], openLine: number): string | null {
  // The bound counts EVERY line examined, not just prose. Counting prose only
  // let the scan cross arbitrarily many blanks and waivers, so two fences eight
  // blank lines below the same prose were both attributed to it and produced a
  // DUPLICATE_IMPORT the settled accept-set does not admit (R1 finding 8).
  let scanned = 0;
  for (let l = openLine - 1; l >= 1 && scanned < 6; l--) {
    scanned += 1;
    const raw = lines[l - 1] ?? "";
    if (raw.trim() === "" || isWaiverShaped(raw)) continue;
    PATH_TOKEN.lastIndex = 0;
    const tokens = [...raw.matchAll(PATH_TOKEN)].map((m) => m[1]!);
    return tokens.length === 1 ? tokens[0]! : null;
  }
  return null;
}

/** Import bindings a fence introduces: named, default, namespace; aliases resolved. */
function importedBindings(body: string[]): Set<string> {
  const out = new Set<string>();
  const src = body.join("\n");
  const IMPORT = /^[ \t]*import\s+(?:type\s+)?([^'"]*?)\s*from\s*['"][^'"]+['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = IMPORT.exec(src)) !== null) {
    const clause = m[1]!;
    const braced = /\{([^}]*)\}/.exec(clause);
    if (braced) {
      for (const part of braced[1]!.split(",")) {
        const bit = part.trim();
        if (!bit) continue;
        // `a as b` binds b; `a` binds a.
        const alias = /\bas\s+([A-Za-z_$][\w$]*)/.exec(bit);
        out.add(alias ? alias[1]! : (/^(?:type\s+)?([A-Za-z_$][\w$]*)/.exec(bit)?.[1] ?? bit));
      }
    }
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) out.add(ns[1]!);
    const dflt = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.replace(/\{[^}]*\}/, ""));
    if (dflt) out.add(dflt[1]!);
  }
  return out;
}

/**
 * Blank out comments and string/template literals before the identifier scan.
 *
 * Without this, a comment mentioning `expect` or a string containing "expect"
 * fires the rule on correct code — and a rule that is wrong on correct plans is
 * one that gets switched off (R1 finding 7). Replacing rather than deleting
 * keeps every offset intact for anything measured against the same text.
 */
function maskNonCode(src: string): string {
  return (
    src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
      // Template literals: mask the LITERAL TEXT but keep `${...}` interpolations
      // live — they are executable code, and blanking them hid real uses
      // (R2 finding 5).
      .replace(/`(?:\\.|[^`\\])*`/g, (lit) =>
        lit.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}|[^]/g, (piece) =>
          piece.startsWith("${") ? piece : " ",
        ),
      )
      .replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length))
      .replace(/'(?:\\.|[^'\\])*'/g, (m) => " ".repeat(m.length))
  );
}

/**
 * Everything the fence binds locally: declarations, destructured names, function
 * parameters, and method definitions. Recognizing only `const`/`let`/`var`/
 * `function`/`class` treated a destructured or parameter binding as a free use
 * and fired the rule on correct code (R1 finding 7).
 */
function declaredBindings(body: string[]): Set<string> {
  const out = new Set<string>();
  const src = maskNonCode(body.join("\n"));
  const DECL = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  // Destructuring: every identifier inside a binding pattern, aliases resolved.
  const DESTRUCTURE = /\b(?:const|let|var)\s*(\{[^}]*\}|\[[^\]]*\])/g;
  // Parameters: the head of any arrow or function parameter list.
  const PARAMS =
    /(?:function\s*[A-Za-z_$\w]*\s*|\bcatch\s*)\(([^)]*)\)|\(([^)]*)\)\s*=>|\b([A-Za-z_$][\w$]*)\s*=>/g;
  // In a PARAMETER list `x: Foo` binds x and mentions the type; in a
  // DESTRUCTURING pattern `{ a: b }` binds b and mentions the key. Reading both
  // the same way bound the type and left the parameter free (R2 finding 5).
  const patternNames = (chunk: string): void => {
    for (const m of chunk.matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/g)) {
      out.add(m[2] ?? m[1]!);
    }
  };
  const paramNames = (chunk: string): void => {
    for (const part of chunk.split(",")) {
      const m = /^\s*(?:\.\.\.)?\s*(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/.exec(part);
      if (!m) continue;
      if (m[3]) out.add(m[3]);
      else patternNames(m[1] ?? m[2] ?? "");
    }
  };
  // A method DEFINITION is followed by a body brace; a call is not. That single
  // character separates `expect(x) {` from `expect(x);`, so definitions can bind
  // without binding calls — which is what made the earlier blanket exclusion
  // necessary (R2 finding 5).
  // Modifiers (`public`, `private`, `protected`, `readonly`, `override`,
  // `abstract`) precede the name in a class body, and a method's OWN parameters
  // are bindings too — missing either made correct code false-fire
  // (R3 finding 5).
  const METHOD_DEF =
    /(?:^|[\n;{,])\s*(?:(?:public|private|protected|readonly|override|abstract|async|static|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?::\s*[^{;]+)?\{/g;
  let m: RegExpExecArray | null;
  while ((m = DECL.exec(src)) !== null) out.add(m[1]!);
  while ((m = METHOD_DEF.exec(src)) !== null) {
    out.add(m[1]!);
    paramNames(m[2] ?? "");
  }
  while ((m = DESTRUCTURE.exec(src)) !== null) patternNames(m[1]!);
  while ((m = PARAMS.exec(src)) !== null) paramNames(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

const HAS_IMPORT = /^[ \t]*import\s/m;
/** identifier[int].member, with neither `!` nor `?.` — the spec's pinned pattern. */
const UNCHECKED_INDEX = /([A-Za-z_$][\w$]*)\[(\d+)\](?![!?])\.([A-Za-z_$][\w$]*)/g;
const MANGLED_TOKENS: [RegExp, string][] = [
  [/\\`/g, "\\`"],
  [/\\\$\{/g, "\\${"],
];

function tally(
  list: { rule: RuleName; instance: string }[],
  fence: Fence,
  fenceKey: string,
  path: string,
): Finding[] {
  const counts = new Map<string, { rule: RuleName; instance: string; n: number }>();
  for (const { rule, instance } of list) {
    const key = `${rule}::${instance}`;
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { rule, instance, n: 1 });
  }
  return [...counts.values()].map((c) => ({
    path,
    fenceLine: fence.openLine,
    fenceKey,
    rule: c.rule,
    instance: c.instance,
    count: c.n,
  }));
}

export function analyzePlan(path: string, text: string): PlanFenceReport {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const { fences, unplaced } = extractFences(path, text);
  const delimiters = new Set<number>();
  for (const f of fences) {
    delimiters.add(f.openLine);
    delimiters.add(f.closeLine);
  }

  const eligible = fences.filter((f) => f.eligible);

  // Identical fences within one file share an identity ON PURPOSE, and the gate
  // compares SUMMED counts. A positional ordinal was tried and reverted: it is
  // order-DEPENDENT, so inserting a waived copy BEFORE a frozen fence renamed
  // the historical one and produced an offender AND a stale row for a document
  // nobody had touched (R2 finding 6 fixed one way, R3 finding 6 the other).
  // Summing keeps the duplicate visible — a copy doubles the total — without
  // making identity depend on where in the file it sits.
  const keyOf = (f: Fence): string => f.key;

  const attribution = new Map<Fence, string | null>();
  for (const f of eligible) attribution.set(f, attributionOf(lines, f.openLine));

  const raw: Finding[] = [];

  // ── per-fence rules ────────────────────────────────────────────────────────
  for (const fence of eligible) {
    const src = fence.body.join("\n");
    const per: { rule: RuleName; instance: string }[] = [];

    if (HAS_IMPORT.test(src)) {
      const bound = new Set([...importedBindings(fence.body), ...declaredBindings(fence.body)]);
      // Scan USES, not the import statements themselves. `import { readFileSync
      // as rfs }` binds `rfs` and mentions `readFileSync` — reading that mention
      // as a use makes every aliased import flag its own source name, which is a
      // false positive on correct code and the fastest way to get a gate turned
      // off rather than fixed.
      const uses = maskNonCode(fence.body.filter((l) => !/^[ \t]*import\s/.test(l)).join("\n"));
      // A FREE identifier only. `re.test(x)`, `parts.join("/")` and
      // `Promise.resolve()` are property reads whose names merely collide with
      // the registry, and `{ test: 1 }` is a property key. Counting those made
      // `test`/`resolve`/`join` the top hits over the real corpus (360/96/89)
      // — noise on correct plans, which is how a gate gets switched off rather
      // than fixed. The lookbehind rejects a preceding `.` or `?.`; the
      // lookahead rejects a `:` that makes it a key.
      const WORD = /(?<![.\w$])([A-Za-z_$][\w$]*)\b(?!\s*:)/g;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = WORD.exec(uses)) !== null) {
        const name = m[1]!;
        if (!KNOWN_API.has(name) || bound.has(name) || seen.has(name)) continue;
        seen.add(name);
        per.push({ rule: "UNIMPORTED_IDENTIFIER", instance: name });
      }
    }

    for (const [re, token] of MANGLED_TOKENS) {
      re.lastIndex = 0;
      while (re.exec(src) !== null) per.push({ rule: "MANGLED_TEMPLATE", instance: token });
    }

    UNCHECKED_INDEX.lastIndex = 0;
    let ix: RegExpExecArray | null;
    while ((ix = UNCHECKED_INDEX.exec(src)) !== null) {
      per.push({ rule: "UNCHECKED_INDEX", instance: ix[0]! });
    }

    // Identity is the ORDINAL within the fence (spec §2.1): two em-dashes in one
    // fence are two frozen defects, and repairing one must not pardon the other.
    EM_DASH_CLASS.lastIndex = 0;
    emDashMatches(src).forEach((_hit, i) => {
      per.push({ rule: "FENCE_EM_DASH", instance: String(i + 1) });
    });

    raw.push(...tally(per, fence, keyOf(fence), path));
  }

  // ── cross-fence rule ───────────────────────────────────────────────────────
  const byTarget = new Map<string, { fence: Fence; bindings: Set<string> }[]>();
  for (const fence of eligible) {
    const target = attribution.get(fence) ?? null;
    if (target === null) continue; // UNATTRIBUTED: exempt from this rule only
    const list = byTarget.get(target) ?? [];
    list.push({ fence, bindings: importedBindings(fence.body) });
    byTarget.set(target, list);
  }
  for (const group of byTarget.values()) {
    const seenIn = new Map<string, Fence>();
    for (const { fence, bindings } of group) {
      for (const b of bindings) {
        const first = seenIn.get(b);
        if (first === undefined) {
          seenIn.set(b, fence);
          continue;
        }
        raw.push({
          path,
          fenceLine: fence.openLine,
          fenceKey: keyOf(fence),
          rule: "DUPLICATE_IMPORT",
          instance: b,
          count: 1,
        });
      }
    }
  }

  // Merge by identity across the file, so N identical fences contribute one row
  // whose count is their sum.
  const merged = new Map<string, Finding>();
  for (const f of raw) {
    const id = `${f.path}|${f.fenceKey}|${f.rule}|${f.instance}`;
    const prev = merged.get(id);
    if (prev) prev.count += f.count;
    else merged.set(id, { ...f });
  }
  const rawMerged = [...merged.values()];

  // ── waivers ────────────────────────────────────────────────────────────────
  const waiverErrors: WaiverError[] = [];
  const findings: Finding[] = [];
  const waived: Finding[] = [];

  type Parsed = {
    line: number;
    rule: RuleName | null;
    reason: string;
    specLint: boolean;
    inert?: boolean;
  };
  const parsed: Parsed[] = [];
  lines.forEach((raw2, i) => {
    const t = raw2.trim();
    const own = PLAN_FENCES_WAIVER.exec(t);
    if (own) {
      const name = own[1]!;
      const reason = own[2]!;
      if (!isRuleName(name)) {
        waiverErrors.push({
          path,
          line: i + 1,
          code: "waiver_unknown_rule",
          message: `unknown rule \`${name}\`: the five shapes are a closed set`,
        });
        parsed.push({ line: i + 1, rule: null, reason, specLint: false });
        return;
      }
      if (reason.trim() === "") {
        waiverErrors.push({
          path,
          line: i + 1,
          code: "waiver_missing_reason",
          message: "waiver has no reason",
        });
        parsed.push({ line: i + 1, rule: null, reason: "", specLint: false });
        return;
      }
      parsed.push({ line: i + 1, rule: name, reason, specLint: false });
      return;
    }
    if (SPEC_LINT_WAIVER.test(t)) {
      parsed.push({ line: i + 1, rule: null, reason: "", specLint: true });
      return;
    }
    // RECOGNIZED but non-suppressing (`not-ui`). It must still be in the set
    // `waiverTarget` skips, or an `ignore` stacked above one targets the
    // `not-ui` line instead of the fence and silently waives nothing
    // (R2 finding 3).
    if (SPEC_LINT_ANY.test(t)) {
      parsed.push({ line: i + 1, rule: null, reason: "", specLint: false, inert: true });
    }
  });

  const waiverLines = new Set(parsed.map((w) => w.line));
  const coverageFor = (line: number): Set<number> => {
    const target = waiverTarget(lines, (l) => waiverLines.has(l), line);
    return target === null
      ? new Set<number>()
      : fenceCoverage(lines, (l) => delimiters.has(l), target);
  };

  const consumed = new Set<Parsed>();
  for (const f of rawMerged) {
    let hit: Parsed | undefined;
    for (const w of parsed) {
      if (w.rule === null && !w.specLint) continue;
      // spec-lint's region token covers FENCE_EM_DASH only — the dual-honor
      // contract. It must not reach the four code rules, whose findings it was
      // never written about.
      if (w.specLint && f.rule !== "FENCE_EM_DASH") continue;
      if (!w.specLint && w.rule !== f.rule) continue;
      if (!coverageFor(w.line).has(f.fenceLine)) continue;
      hit = w;
      break;
    }
    if (hit) {
      consumed.add(hit);
      // A spec-lint waiver is the doc linter's; suppressing here is the dual-honor
      // contract, not this gate's waiver, so it is not reported as one of ours.
      if (!hit.specLint) waived.push({ ...f, waivedReason: hit.reason });
      continue;
    }
    findings.push(f);
  }

  for (const w of parsed) {
    if (w.specLint || w.inert || w.rule === null || consumed.has(w)) continue;
    waiverErrors.push({
      path,
      line: w.line,
      code: "waiver_suppressed_nothing",
      message: `waiver for ${w.rule} suppressed nothing`,
    });
  }

  return {
    path,
    findings,
    waived,
    waiverErrors,
    unplaced,
    fences: fences.length,
    eligibleFences: eligible.length,
    attributedFences: [...attribution.values()].filter((v) => v !== null).length,
  };
}
