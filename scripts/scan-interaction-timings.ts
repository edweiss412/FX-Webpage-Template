/**
 * scripts/scan-interaction-timings.ts
 *
 * The DERIVED population behind `DESIGN.md` §5.5 (SHARELINK-CONSTANTS-INVENTORY-1,
 * M-wave 2 spec §2.6).
 *
 * §5.5 used to be a hand-written list, which is the one shape that cannot work:
 * a hand-authored sweep and a test generated from that sweep share the same
 * omissions, so the guard agrees with the document about a world neither of them
 * checked. This module reads the source instead, and
 * `tests/docs/_metaInteractionTimingInventory.test.ts` derives §5.5's expected
 * rows from what it returns.
 *
 * THREE recognized forms, from the AST rather than a grep, so a comment
 * mentioning a number is not a site:
 *
 *   1. `timer-literal`  — a numeric-literal delay to `setTimeout` / `setInterval`
 *                         (bare or `window.`-prefixed).
 *   2. `named-constant` — a numeric-initialized binding whose identifier ends in
 *                         ms / delay / duration / timeout / seconds, CASE-
 *                         INSENSITIVELY, in camelCase or SNAKE_CASE, whether or
 *                         not it is exported, and including default parameters.
 *                         Both halves are load-bearing: the seed cases
 *                         (`CLOSE_DELAY_MS`, `COPY_FEEDBACK_RESET_MS`,
 *                         `DEBOUNCE_MS`) are module-local, so an export-only form
 *                         cannot see its own seed list; and
 *                         `submitTimeoutMs = 30_000` is a camelCase default
 *                         parameter, which a SNAKE-only form misses.
 *   3. `motion-duration`— a numeric `duration:` property (motion / transition
 *                         props).
 *
 * TOTALITY, which is what stops a silent residual: every `setTimeout` /
 * `setInterval` delay ARGUMENT is walked, not only the ones that happen to be
 * literals. A delay that is neither a numeric literal (form 1) nor an identifier
 * resolving to a covered binding (form 2) is emitted as `unclassified` and fails
 * the inventory test until it is dispositioned — renamed into the pattern, or
 * given a reasons-required row in `UNCLASSIFIED_DISPOSITIONS`. Every timer delay
 * in the universe is therefore literal, resolved, or reported BY NAME. None
 * passes silently.
 *
 * DOCUMENTED LIMIT (threat-model fence: accidental authoring mistakes by an
 * ordinary contributor, not adversarial obfuscation). A delay assembled at
 * runtime — read off a config object, returned by a call, computed from
 * arithmetic — is reported as `unclassified` rather than resolved. That is the
 * conservative direction: the worst case is a surfaced name someone must
 * disposition, never a silently unlisted timing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

export type TimingKind = "timer-literal" | "named-constant" | "motion-duration" | "unclassified";

export type TimingSite = {
  /** Repo-relative path, POSIX separators. */
  readonly file: string;
  /** 1-based line. */
  readonly line: number;
  readonly kind: TimingKind;
  /** The binding identifier for a named constant; the unresolved expression text for `unclassified`; null otherwise. */
  readonly name: string | null;
  /** The numeric value where the source states one; null for `unclassified`. */
  readonly value: number | null;
};

/**
 * The scan universe. `app/**` + `components/**` is where interaction timing
 * lives; a timing outside it is infrastructure, not interaction.
 */
export const UNIVERSE_ROOTS = ["app", "components"] as const;

/**
 * Scope fence, in code with its reason rather than in prose, because a fence
 * written only in a document is one nobody can run.
 *
 * `app/api/**` is server route-handler code: it renders nothing and its numbers
 * are request budgets and revalidate windows, not interaction timing. The
 * exclusion is load-bearing rather than decorative — the inventory test plants
 * the API tree as a premise fixture and fails if it ever stops matching, so a
 * future restructure cannot quietly turn this into a no-op carve-out.
 */
export const EXCLUDED_PREFIXES = ["app/api/"] as const;

/**
 * `lib/**` is excluded wholesale for the same reason (drive / sync / agenda /
 * notify / geocoding budgets are infrastructure, not interaction), so anything
 * in it that IS interaction timing needs an explicit include with a reason.
 */
export const EXPLICIT_INCLUDES: readonly { readonly file: string; readonly reason: string }[] = [
  {
    file: "lib/admin/destructiveConfirm.ts",
    reason:
      "ARM_REVERT_MS is the armed-window countdown a person watches and races; it lives in lib/ " +
      "only because the state machine does, and it is consumed by components/admin/BlockedRowResolver.tsx.",
  },
];

/**
 * Reasons-required dispositions for `unclassified` delays. A row here is a
 * claim that the delay is knowable and fine; it is not a way to hide one.
 * Empty is the healthy state.
 */
export const UNCLASSIFIED_DISPOSITIONS: readonly {
  readonly file: string;
  readonly name: string;
  readonly reason: string;
}[] = [
  {
    file: "components/admin/announceLog.tsx",
    name: "ttlMs",
    reason:
      "The `useAnnounceLog({ ttlMs })` option, not a value of its own. Its ONLY supplied argument " +
      "in the repo is the exported ANNOUNCE_LOG_TTL_MS (components/admin/AdminAnnounceProvider.tsx:51), " +
      "which carries its own §5.5 row; the other consumer passes nothing, and undefined means " +
      "never prune (a cap-only channel).",
  },
  {
    file: "components/admin/review/ReviewModalShell.tsx",
    name: "fallbackMs + EXIT_FALLBACK_BUFFER_MS",
    reason:
      "A sum of two constants that are each already a §5.5 row: `fallbackMs` is " +
      "DURATION_NORMAL_FALLBACK_MS or DURATION_FAST_FALLBACK_MS (ReviewModalShell.tsx:374) and the " +
      "buffer is EXIT_FALLBACK_BUFFER_MS. Listing the sum would duplicate both rows and invent a " +
      "constant no one can edit.",
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    name: "ms",
    reason:
      "`agendaSleep(parseRetryAfterMs(res.headers.get('Retry-After')), …)`. When the header arrives " +
      "and parses, the delay is the SERVER's and there is no design timing to pin — changing it is a " +
      "protocol decision, not a motion one. When it does not, the value is AGENDA_RETRY_FALLBACK_MS, " +
      "which is ours and carries its own inventory row. The first version of this reason claimed the " +
      "server dictated BOTH paths and so suppressed a timing this project chooses (whole-diff review, " +
      "brief C).",
  },
  {
    file: "components/realtime/ShowRealtimeBridge.tsx",
    name: "delay",
    reason:
      "A step of the realtime channel-renewal backoff schedule (250 / 500 / 1000 / 2000 / 5000 ms, " +
      "ShowRealtimeBridge.tsx:240) — connection retry infrastructure, the same class as the lib/** " +
      "budgets this scanner fences out, and not something a person perceives as interaction timing.",
  },
];

/** Identifier suffixes that mark a number as a timing, case-insensitively. */
const TIMING_NAME = /(?:ms|delay|duration|timeout|seconds)$/i;

const SCANNED_EXTENSIONS = [".ts", ".tsx"] as const;

function posix(p: string): string {
  return p.split(sep).join("/");
}

/** Every scannable file under the universe roots, plus the explicit includes. */
export function universeFiles(repoRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(abs);
        continue;
      }
      if (!SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      const rel = posix(relative(repoRoot, abs));
      if (EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
      out.push(rel);
    }
  };
  for (const root of UNIVERSE_ROOTS) {
    const abs = join(repoRoot, root);
    try {
      if (statSync(abs).isDirectory()) walk(abs);
    } catch {
      // A missing root is a repo-shape change, not a scan result: the inventory
      // test's premise catches it by asserting the population is non-empty.
    }
  }
  for (const include of EXPLICIT_INCLUDES) out.push(include.file);
  return out;
}

/** Numeric value of a literal, tolerating a unary minus and `1_000` separators. */
function numericValue(expr: ts.Expression): number | null {
  let node: ts.Expression = expr;
  let sign = 1;
  if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.MinusToken) sign = -1;
    else if (node.operator !== ts.SyntaxKind.PlusToken) return null;
    node = node.operand;
  }
  if (ts.isParenthesizedExpression(node)) return numericValue(node.expression);
  if (!ts.isNumericLiteral(node)) return null;
  const parsed = Number(node.text.replace(/_/g, ""));
  return Number.isFinite(parsed) ? sign * parsed : null;
}

function isTimerCall(expr: ts.CallExpression): boolean {
  const callee = expr.expression;
  if (ts.isIdentifier(callee)) return callee.text === "setTimeout" || callee.text === "setInterval";
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)) {
    const object = callee.expression;
    const objectIsGlobal =
      ts.isIdentifier(object) && (object.text === "window" || object.text === "globalThis");
    return (
      objectIsGlobal && (callee.name.text === "setTimeout" || callee.name.text === "setInterval")
    );
  }
  return false;
}

/**
 * Scan one source file. `filePath` is the repo-relative path that lands in the
 * returned sites, so callers do not have to re-derive it.
 */
export function scanTimingSites(source: string, filePath: string): TimingSite[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: TimingSite[] = [];
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const pushNamed = (name: ts.BindingName, initializer: ts.Expression | undefined): void => {
    if (!initializer || !ts.isIdentifier(name)) return;
    if (!TIMING_NAME.test(name.text)) return;
    const value = numericValue(initializer);
    if (value === null) return;
    sites.push({
      file: filePath,
      line: lineOf(name),
      kind: "named-constant",
      name: name.text,
      value,
    });
  };

  const visit = (node: ts.Node): void => {
    // Form 2a: const / let bindings at any depth.
    if (ts.isVariableDeclaration(node)) pushNamed(node.name, node.initializer);
    // Form 2b: default parameters (`submitTimeoutMs = 30_000`) in BOTH shapes —
    // a positional parameter, and a destructured props member, which is a
    // BindingElement rather than a Parameter. The spec's own seed case for this
    // form (ReportModal's `submitTimeoutMs`) is the destructured one, so a
    // Parameter-only reading misses the example it was written for.
    if (ts.isParameter(node)) pushNamed(node.name, node.initializer);
    if (ts.isBindingElement(node)) pushNamed(node.name, node.initializer);
    // Form 2c: numeric class properties with a timing name.
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      pushNamed(node.name, node.initializer);
    }

    // Form 3: motion / transition `duration:` properties.
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "duration"
    ) {
      const value = numericValue(node.initializer);
      if (value !== null) {
        sites.push({
          file: filePath,
          line: lineOf(node),
          kind: "motion-duration",
          name: null,
          value,
        });
      }
    }

    // Form 1 + the totality rule: EVERY timer delay argument, classified or named.
    if (ts.isCallExpression(node) && isTimerCall(node)) {
      const delay = node.arguments[1];
      if (delay !== undefined) {
        const value = numericValue(delay);
        if (value !== null) {
          sites.push({
            file: filePath,
            line: lineOf(node),
            kind: "timer-literal",
            name: null,
            value,
          });
        } else if (ts.isIdentifier(delay) && TIMING_NAME.test(delay.text)) {
          // Resolution happens across the whole universe in `scanRepo`; the
          // per-file pass records the reference and lets the caller decide.
          sites.push({
            file: filePath,
            line: lineOf(node),
            kind: "unclassified",
            name: delay.text,
            value: null,
          });
        } else {
          sites.push({
            file: filePath,
            line: lineOf(node),
            kind: "unclassified",
            name: delay.getText(sf).replace(/\s+/g, " ").slice(0, 60),
            value: null,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

export type ScanResult = {
  /** Every recognized timing, sorted by file then line. */
  readonly sites: readonly TimingSite[];
  /** Delay arguments that resolved to no covered binding, minus dispositioned rows. */
  readonly unclassified: readonly TimingSite[];
  readonly filesScanned: number;
};

/**
 * Scan the whole universe and resolve timer-delay identifiers against the named
 * constants the same scan found. An identifier that names a covered binding is
 * NOT a residual — it is the binding's own row, referenced.
 */
export function scanRepo(repoRoot: string): ScanResult {
  const files = universeFiles(repoRoot);
  const raw: TimingSite[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    raw.push(...scanTimingSites(source, file));
  }
  const coveredNames = new Set(
    raw.filter((s) => s.kind === "named-constant").map((s) => s.name as string),
  );
  const dispositioned = new Set(UNCLASSIFIED_DISPOSITIONS.map((row) => `${row.file}::${row.name}`));
  const resolved = raw.filter(
    (s) => !(s.kind === "unclassified" && s.name !== null && coveredNames.has(s.name)),
  );
  const sites = [...resolved].sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  const unclassified = sites.filter(
    (s) => s.kind === "unclassified" && !dispositioned.has(`${s.file}::${s.name}`),
  );
  return { sites, unclassified, filesScanned: files.length };
}

/** The inventory rows §5.5 must carry: one per distinct (file, name-or-value) timing. */
export function inventoryRows(
  result: ScanResult,
): { file: string; label: string; value: number }[] {
  const rows: { file: string; label: string; value: number }[] = [];
  const seen = new Set<string>();
  for (const site of result.sites) {
    if (site.kind === "unclassified" || site.value === null) continue;
    const label =
      site.name ?? `${site.kind === "motion-duration" ? "duration" : "timer"}(${site.value})`;
    const key = `${site.file}::${label}::${site.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ file: site.file, label, value: site.value });
  }
  return rows;
}
