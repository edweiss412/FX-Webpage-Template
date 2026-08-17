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
 *   3. `motion-duration`— a numeric PROPERTY whose key is `duration` (motion /
 *                         transition props) or carries any other timing name by
 *                         the same suffix rule as form 2. The widening past the
 *                         literal `duration` key exists because an options
 *                         object at a call site is the other place a person
 *                         writes a timing: `useAnnounceLog({ ttlMs: 17000 })` is
 *                         a real interaction timing, and hardcoding the option
 *                         is easier than declaring a constant for it, which is
 *                         exactly the accidental shape this guard targets. The
 *                         row is labelled by the key as written.
 *
 * TOTALITY IS PER-FORM, and the boundary is worth stating because the two
 * halves differ. For TIMER DELAYS every `setTimeout` / `setInterval` delay
 * ARGUMENT is walked, not only the ones that happen to be literals. An
 * identifier delay resolves against the DECLARATION IT BINDS TO — the
 * TypeScript checker's own answer, over a program built from the universe
 * files — and never against its spelling, so a LOCAL binding that happens to
 * share a covered constant's name is a different binding and is REPORTED. Two
 * distinct bindings that share a name never resolve to each other; that is what
 * closed `BL-TIMING-SCAN-NAME-VS-BINDING`. A delay that is neither a numeric
 * literal (form 1) nor an identifier resolving to a covered DECLARATION (form
 * 2) is emitted as `unclassified` and fails the inventory test until it is
 * dispositioned — renamed into the pattern, or given a reasons-required row in
 * `UNCLASSIFIED_DISPOSITIONS`. Every timer delay in the universe is therefore
 * literal, resolved against its binding, or reported BY NAME. None passes
 * silently.
 *
 * The same resolution serves timing-named PROPERTY VALUES: there is exactly one
 * resolution step in this module and both positions flow through it. Every
 * uncertainty — no symbol, an unresolvable alias, a declaration outside the
 * program, a declaration that produced no covered row — defaults to REPORTING.
 * Documented limits, with their probes, live in the 2026-08-16 binding-
 * resolution spec §4: a covered constant reached through a re-export module
 * OUTSIDE the universe reports rather than resolving, and this arc resolves
 * REFERENCES rather than evaluating expressions.
 *
 * DOCUMENTED LIMIT (threat-model fence: accidental authoring mistakes by an
 * ordinary contributor, not adversarial obfuscation). A DELAY assembled at
 * runtime — read off a config object, returned by a call, computed from
 * arithmetic — is reported as `unclassified` rather than resolved.
 *
 * PROPERTIES ARE TOTAL, on the same contract as delays: a timing-named property
 * whose value is not a numeric literal is reported `unclassified` and NAMED,
 * never dropped. The accept-set is keyed on NODE KINDS rather than one position
 * — PropertyAssignment, ShorthandPropertyAssignment, and JsxAttribute (an
 * expression container, or a string that does not parse as a number) — because
 * enumerating positions is what let the shorthand `{ duration }` at
 * components/crew/CrewSectionTransition.tsx stay invisible past two reviews.
 * That closed BL-TIMING-SCAN-PROPERTY-TOTALITY; the six live sites it surfaced
 * carry UNCLASSIFIED_DISPOSITIONS rows below.
 *
 * The KEY PREDICATE on these non-literal paths is `isBoundaryTimingKey`, which
 * is narrower than the `TIMING_NAME` suffix the numeric paths keep, and the
 * asymmetry is deliberate: see that function for the measurement (48 candidates
 * versus 8). A COMPUTED
 * key (`{ ["ttlMs"]: 17000 }`, `class C { ["ttlMs"] = 17000 }`) is likewise not
 * a site: the key is an expression, and writing one to declare a fixed timing
 * is not a spelling an ordinary contributor reaches for — unlike the quoted key
 * and the JSX prop, which are, and which forms 2d / 3b cover. That is the
 * conservative direction: the worst case is a surfaced name someone must
 * disposition, never a silently unlisted timing.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

export type TimingKind = "timer-literal" | "named-constant" | "motion-duration" | "unclassified";

/**
 * A key `TIMING_NAME` accepted and `isBoundaryTimingKey` turned away — the
 * population where the two halves of one property DISAGREE.
 *
 * The drop is intended (`items`, `rooms`, `searchParams` end in `ms` and are
 * not timings), but a drop nobody can see is how `timeoutMilliseconds` sat in
 * the gap between a numeric path that inventories it and a non-literal path
 * that dropped it. Recording the population lets a test pin it, so a real
 * timing landing there is a failing assertion rather than a silence.
 *
 * Only the paths with an OUTER `TIMING_NAME` gate report here. The shorthand
 * form has no outer gate — its only gate IS the boundary predicate — so
 * recording its rejects would mean recording every shorthand property in the
 * universe, which is not a disagreement, just a scan.
 */
export type BoundaryReject = {
  readonly file: string;
  readonly line: number;
  readonly propertyKey: string;
};

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
  /** For a timing-named PROPERTY, the key as written — so an inventory row reads
   *  `ttlMs(17000)` rather than being filed under a key it does not have.
   *  `duration` for the motion form, which keeps every existing row byte-identical. */
  readonly propertyKey?: string;
  /** Absolute start offset of the REFERENCE identifier, on the paths where the
   *  value IS a bare identifier. `scanRepo` resolves it against its binding;
   *  a site without one is never resolved, only reported. Absent — not
   *  `undefined` — on every other path (`exactOptionalPropertyTypes`). */
  readonly refPos?: number;
  /** Absolute start offset of the DECLARATION NAME node, on every
   *  `named-constant` site. The covered set is keyed `${file}:${declPos}`, an
   *  identity a LINE does not provide: `const CLOSE_DELAY_MS = 220, other =
   *  readConfig();` declares two bindings on one line, and a line key would
   *  lend the constant's coverage to `other` (probe P10). */
  readonly declPos?: number;
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
  {
    file: "lib/ui/copyFeedback.ts",
    reason:
      "COPY_FEEDBACK_RESET_MS is how long a copy confirmation stays on screen — interaction " +
      "timing a person watches, not an infrastructure budget. It lives in lib/ precisely BECAUSE " +
      "it is shared: its consumers are app/admin/show/[slug]/ShareLinkCopyButton.tsx and " +
      "components/crew/primitives/CopyFactValue.tsx, in two different trees, so neither can own " +
      "it. Without this include the delay resolves to nothing scanned and both call sites report " +
      "`unclassified` — the constant would be less visible in §5.5 than the bare literal it replaced.",
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
  // ── The property-totality census (BL-TIMING-SCAN-PROPERTY-TOTALITY) ──────
  // Six live sites that were invisible while properties were literal-only. Each
  // resolves to a value already represented among its named-constant peers; the
  // values live here rather than in DESIGN.md §5.5, which cannot represent them
  // — an unclassified site carries `value: null` and `inventoryRows` skips it.
  {
    file: "components/admin/telemetry/EventRow.tsx",
    name: "reduce ? 0 : 0.22",
    reason:
      "The standard reduced-motion ternary: 0 when the user asks for reduced motion, otherwise " +
      "0.22 — the repo's standard motion duration, already a §5.5 row among its named-constant " +
      "peers. The ternary is the ACCESSIBILITY contract, so collapsing it to one literal would be " +
      "a regression, and naming a constant for `0` would not make either branch more visible.",
  },
  {
    file: "components/crew/RightNowHero.tsx",
    name: "prefersReducedMotion === true ? 0 : 0.22",
    reason:
      "The same reduced-motion ternary as EventRow.tsx, spelled with an explicit === comparison. " +
      "0 reduced, 0.22 otherwise — the standard motion duration.",
  },
  {
    file: "components/crew/CrewSectionTransition.tsx",
    name: "duration",
    reason:
      "The shorthand `{ duration }` form, which the scanner could not see at all until the " +
      "accept-set covered ShorthandPropertyAssignment — a sixth live timing that no census had " +
      "counted. The binding behind it is the same reduced-motion ternary as its two peers above: " +
      "0 reduced, 0.22 otherwise.",
  },
  {
    file: "components/diagrams/GalleryLightbox.tsx",
    name: "emblaDuration(prefersReducedMotion)",
    reason:
      "Embla's TWEEN-SPEED unit, not seconds and not milliseconds, so a §5.5 duration row would " +
      "misstate it by naming a number in the wrong unit. Resolves in-file to the committed live " +
      "value 22. Two occurrences share this row because the registry keys by (file, name) and both " +
      "call sites are the identical expression; the six-site liveness pin below asserts the COUNT, " +
      "so one of the two vanishing still fails.",
  },
  {
    file: "components/diagrams/GalleryLightbox.tsx",
    name: "motionDuration",
    reason:
      "An in-file binding holding 0.22, the standard motion duration that already carries a §5.5 " +
      "row. The indirection is local and one hop; a second row would duplicate the constant.",
  },
  {
    file: "components/admin/announceLog.tsx",
    name: "ttlMs",
    reason:
      "The `useAnnounceLog({ ttlMs })` option, not a value of its own. Every supplied argument in " +
      "the repo is the exported ANNOUNCE_LOG_TTL_MS — components/admin/AdminAnnounceProvider.tsx " +
      "and components/crew/primitives/CopyFactValue.tsx — which carries its own §5.5 row; " +
      "ShowReviewSurface passes nothing, and undefined means never prune (a cap-only channel). " +
      "This reason names the consumers rather than resting on there being one, because the first " +
      "version said AdminAnnounceProvider was the ONLY one and a second consumer made it false " +
      "within the arc that added it (whole-diff review, finding 3). What keeps the claim honest is " +
      "not this prose: a hardcoded `ttlMs: 17000` at any call site is now a form-3 site with its " +
      "own inventory row, so the mutant that motivated this fails the inventory test.",
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

/** The timing words both key predicates are built from. ONE definition. */
const TIMING_WORDS = ["ms", "delay", "duration", "timeout", "seconds"] as const;

/**
 * Time UNITS, spelled out. A named, closed, sub-second family.
 *
 * `timeoutMilliseconds` carries its timing word INSIDE the final word, so the
 * segment rule below sees the segment `milliseconds` and nothing shorter. The
 * numeric path already inventories that key (`TIMING_NAME` matches the bare
 * `seconds` suffix), so without the family the two halves of one property
 * disagree and the non-literal half drops it in silence — the totality break
 * this predicate exists to close (whole-diff R1 #4).
 *
 * `min` and `sec` are deliberately absent: they are `minimum` and `section` at
 * least as often as they are time, and this predicate's whole job is to not
 * flood. SINGULAR unit spellings are absent for a different reason — they are
 * unreachable: this predicate is only ever consulted for a key `TIMING_NAME`
 * has already accepted, and `oneMillisecond` does not end in `seconds`. Both
 * halves of that property agree on dropping it, so totality holds; listing it
 * here would be an accept-set entry no input can reach.
 */
const TIME_UNITS = ["milliseconds", "microseconds", "nanoseconds"] as const;

/** A key's camel / snake / digit segments, lowercased. `retry_ttlMs` → retry, ttl, ms.
 *
 *  MATCHED rather than split-and-filtered: a split has to discard the empty
 *  strings that separators produce, and that discard is a second decision with
 *  its own boundary (`deadline_ms_` and `deadline_ms_x` both turn on it). A
 *  match yields only non-empty segments by construction, so there is no
 *  boundary to get wrong — the mutation gate found both of the discarded
 *  branch's mutants unpinned, and this deletes the branch instead of arguing
 *  about it. */
function keySegments(key: string): string[] {
  return (key.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? []).map((s) => s.toLowerCase());
}

/**
 * The key predicate for the NON-LITERAL property paths — deliberately NARROWER
 * than `TIMING_NAME`, which stays untouched on every numeric path.
 *
 * A key qualifies when its FINAL SEGMENT is a timing word or a time unit:
 * `ttlMs`, `deadline_ms`, `fooTimeout`, `timeoutMilliseconds`. Reading segments
 * rather than doing suffix arithmetic is what makes the rule one derivation
 * instead of a growing list of boundary cases — the arithmetic form both missed
 * the unit family and had to special-case the leading underscore.
 *
 * The bare suffix `TIMING_NAME` uses cannot be reused here: measured on the
 * live universe it matches 48 non-literal candidates, because ordinary plurals
 * end in `ms` (`items`, `rooms`, `searchParams`, `diagrams`, `problems`), which
 * would bury the 8 real ones. The asymmetry is intentional and load-bearing: on
 * NUMERIC values a sloppy match is fail-open and visible as a bogus inventory
 * row; on non-literals it is fail-flood, and a flooded report is not read.
 */
function isBoundaryTimingKey(key: string): boolean {
  const segments = keySegments(key);
  const last = segments[segments.length - 1];
  if (last === undefined) return false;
  return TIMING_WORDS.some((word) => last === word) || TIME_UNITS.some((unit) => last === unit);
}

/** The delay contract's own rendering, reused verbatim so an unclassified
 * property reads like an unclassified delay. */
const collapsed = (node: ts.Node, sf: ts.SourceFile): string =>
  node.getText(sf).replace(/\s+/g, " ").slice(0, 60);

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
export function scanTimingSites(
  source: string,
  filePath: string,
  rejected?: BoundaryReject[],
): TimingSite[] {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: TimingSite[] = [];
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  /** A key the OUTER gate accepted and the boundary predicate turned away. The
   *  drop is the intended behaviour; recording it is what keeps the set of
   *  dropped keys a pinned population rather than a silent one. */
  const reject = (key: string, node: ts.Node): void => {
    rejected?.push({ file: filePath, line: lineOf(node), propertyKey: key });
  };

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
      declPos: name.getStart(sf),
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

    // Form 2d: a class property whose name is a STRING LITERAL. `pushNamed`
    // takes a BindingName and so reads identifiers only; `class C { "ttlMs" =
    // 17000 }` is the same declaration written with quotes.
    if (
      ts.isPropertyDeclaration(node) &&
      ts.isStringLiteral(node.name) &&
      TIMING_NAME.test(node.name.text)
    ) {
      const init = node.initializer;
      const value = init === undefined ? null : numericValue(init);
      if (value !== null) {
        sites.push({
          file: filePath,
          line: lineOf(node),
          kind: "named-constant",
          name: node.name.text,
          value,
          // From the NAME node, never the property node: the two starts
          // coincide on a bare property and diverge the moment it carries a
          // modifier or decorator (probe P13), and the resolver reads
          // `getNameOfDeclaration`, which returns this string literal.
          declPos: node.name.getStart(sf),
        });
      }
    }

    // Form 3b: a JSX attribute with a numeric-literal timing value —
    // `<Thing ttlMs={17000} />`. A prop is where a call-site option ends up
    // when the consumer is a component, and it is at least as ordinary a
    // spelling as the options object below.
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && TIMING_NAME.test(node.name.text)) {
      const init = node.initializer;
      const expr = init !== undefined && ts.isJsxExpression(init) ? init.expression : undefined;
      const value = expr === undefined ? null : numericValue(expr);
      if (value !== null) {
        sites.push({
          file: filePath,
          line: lineOf(node),
          kind: "motion-duration",
          name: null,
          value,
          propertyKey: node.name.text,
        });
      } else if (!isBoundaryTimingKey(node.name.text)) {
        reject(node.name.text, node);
      } else {
        // Totality: a prop whose value is not a literal is NAMED, not dropped.
        // Both spellings the universe can hold — an expression container and a
        // string that does not parse as a number.
        const valueNode = expr ?? (init !== undefined && ts.isStringLiteral(init) ? init : null);
        if (valueNode !== null) {
          sites.push({
            file: filePath,
            line: lineOf(node),
            kind: "unclassified",
            name: ts.isStringLiteral(valueNode) ? valueNode.text : collapsed(valueNode, sf),
            value: null,
            propertyKey: node.name.text,
            // Built without the key rather than with `refPos: undefined`:
            // `exactOptionalPropertyTypes` rejects the explicit undefined.
            ...(ts.isIdentifier(valueNode) ? { refPos: valueNode.getStart(sf) } : {}),
          });
        }
      }
    }

    // Form 3: motion / transition `duration:` properties, and any OTHER numeric
    // property whose key carries a timing name.
    //
    // The widening past the literal `duration` key is the same rule form 2
    // already applies to bindings, applied to the one other syntactic position
    // a person writes a timing in: an options object at a call site. Without it
    // `useAnnounceLog({ ttlMs: 17000 })` is a real interaction timing that no
    // §5.5 row names, which a reviewer demonstrated with exactly that mutant —
    // and it is the accidental shape this guard's threat model targets, since
    // hardcoding the option is easier than declaring a constant for it.
    // The key is read from an identifier OR a string literal: `{ "ttlMs": 17000 }`
    // is ordinary formatting rather than obfuscation, and an identifier-only
    // reading left it silently uninventoried while the identical unquoted key
    // was caught (whole-diff review round 2).
    const propertyKey =
      ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
        ? node.name.text
        : null;
    if (
      ts.isPropertyAssignment(node) &&
      propertyKey !== null &&
      (propertyKey === "duration" || TIMING_NAME.test(propertyKey))
    ) {
      const value = numericValue(node.initializer);
      if (value !== null) {
        sites.push({
          file: filePath,
          line: lineOf(node),
          kind: "motion-duration",
          name: null,
          value,
          propertyKey,
        });
      } else if (isBoundaryTimingKey(propertyKey)) {
        sites.push({
          file: filePath,
          line: lineOf(node),
          kind: "unclassified",
          name: collapsed(node.initializer, sf),
          value: null,
          propertyKey,
          ...(ts.isIdentifier(node.initializer) ? { refPos: node.initializer.getStart(sf) } : {}),
        });
      } else {
        reject(propertyKey, node);
      }
    }

    // Form 3c: `{ duration }` — the shorthand IS a timing property whose value
    // is the identifier of the same name, and it is how one of the live sites
    // was written (`CrewSectionTransition.tsx`), invisible until now.
    if (
      ts.isShorthandPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      isBoundaryTimingKey(node.name.text)
    ) {
      sites.push({
        file: filePath,
        line: lineOf(node),
        kind: "unclassified",
        name: node.name.text,
        value: null,
        propertyKey: node.name.text,
        // The shorthand's value IS its name, so the reference offset is the
        // name node's. The resolver reaches the VALUE binding through
        // `getShorthandAssignmentValueSymbol`; `getSymbolAtLocation` here
        // returns the property's own symbol and would never match a covered
        // key (probe P12).
        refPos: node.name.getStart(sf),
      });
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
        } else if (ts.isIdentifier(delay)) {
          // Resolution happens across the whole universe in `scanRepo`; the
          // per-file pass records the reference and lets the caller decide.
          //
          // The `TIMING_NAME` gate this branch used to carry is GONE: a bare
          // identifier delay is resolved against its BINDING, so its spelling
          // decides nothing. Live effect zero — the three bare-identifier
          // delays that do not match the pattern (`ttlMs`, `ms`, `delay`)
          // resolve to non-covered bindings and stay `unclassified` with
          // byte-identical `name` text (probe P7).
          sites.push({
            file: filePath,
            line: lineOf(node),
            kind: "unclassified",
            name: delay.text,
            value: null,
            refPos: delay.getStart(sf),
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

/**
 * The module-alias mapping the resolver pins, exported so a structural test can
 * assert it still matches `tsconfig.json`. Pinned in CODE rather than read from
 * the tsconfig so a synthetic-root scan — the temp-tree tests, and any caller
 * passing a root with no tsconfig — resolves identically to a repo scan.
 */
export const RESOLVER_PATH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "@/*": ["./*"],
};

/**
 * Map a reference identifier to the declaration keys its binding produces.
 *
 * Takes the `(file, text)` pairs `scanRepo` ALREADY READ rather than a path
 * list, and serves them through a `ts.CompilerHost`, so the resolver never
 * touches the filesystem. Two consequences the design rests on: `refPos`
 * offsets are guaranteed to index the same text the sites were computed from,
 * and the existing unreadable-file case keeps behaving exactly as before —
 * a file `scanRepo` could not read simply is not in the pairs.
 *
 * `noResolve` keeps the program at the universe roots instead of the 3121
 * source files that following imports into `node_modules` pulls in: 211 ms
 * against 6.3-8.0 s (probes P3/P4). Its cost is stated as a documented limit —
 * a covered constant reached through a re-export module OUTSIDE the universe
 * reports rather than resolving.
 *
 * Returns the keys of EVERY declaration of the resolved symbol; an empty array
 * means "not resolved", which reports. Every uncertainty defaults to reporting;
 * nothing degrades back to name matching.
 */
type BindingResolver = (file: string, pos: number, name: string) => readonly string[];

/**
 * One memoized resolver per distinct scan input.
 *
 * The suites call `scanRepo(REPO_ROOT)` seven times in one process, and the
 * mutation harness pays that per mutant. Building the program once per call
 * measured +93.5% on the scoped gate against a +25% budget (AC-10(b)); the same
 * work memoized is paid once. Keyed on the exact `(file list, contents)` the
 * scan just read, which is correct BY CONSTRUCTION because that key IS the
 * resolver's entire input — a changed byte anywhere yields a different key and
 * a fresh program. Deliberately not a weaker resolver: the budget is met by not
 * repeating identical work, never by resolving less.
 *
 * One entry, not a growing map: consecutive calls in a process are
 * overwhelmingly the same tree, and an unbounded cache of TypeScript programs
 * is a memory leak in a long-lived process.
 */
let resolverMemo: { key: string; resolve: BindingResolver } | undefined;

function sourcesKey(
  repoRoot: string,
  sources: readonly { readonly file: string; readonly text: string }[],
): string {
  const hash = createHash("sha1").update(repoRoot).update("\0");
  for (const { file, text } of sources) {
    // The LENGTH is in the key as well as the text, so no concatenation of
    // adjacent files can collide with a different split of the same bytes.
    hash
      .update(file)
      .update("\0")
      .update(String(text.length))
      .update("\0")
      .update(text)
      .update("\0");
  }
  return hash.digest("hex");
}

function createBindingResolver(
  repoRoot: string,
  sources: readonly { readonly file: string; readonly text: string }[],
): BindingResolver {
  const key = sourcesKey(repoRoot, sources);
  if (resolverMemo !== undefined && resolverMemo.key === key) return resolverMemo.resolve;
  const resolve = buildBindingResolver(repoRoot, sources);
  resolverMemo = { key, resolve };
  return resolve;
}

function buildBindingResolver(
  repoRoot: string,
  sources: readonly { readonly file: string; readonly text: string }[],
): BindingResolver {
  const rootPosix = posix(repoRoot).replace(/\/$/, "");
  const absOf = (file: string): string => `${rootPosix}/${file}`;
  const canonical = (fileName: string): string => posix(fileName);

  const texts = new Map<string, string>();
  for (const { file, text } of sources) texts.set(absOf(file), text);

  const parsed = new Map<string, ts.SourceFile>();
  const sourceFileFor = (fileName: string): ts.SourceFile | undefined => {
    const key = canonical(fileName);
    const cached = parsed.get(key);
    if (cached !== undefined) return cached;
    const text = texts.get(key);
    if (text === undefined) return undefined;
    const sf = ts.createSourceFile(key, text, ts.ScriptTarget.Latest, true);
    parsed.set(key, sf);
    return sf;
  };

  const host: ts.CompilerHost = {
    getSourceFile: (fileName) => sourceFileFor(fileName),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => {},
    getCurrentDirectory: () => rootPosix,
    getDirectories: () => [],
    getCanonicalFileName: canonical,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => texts.has(canonical(fileName)),
    readFile: (fileName) => texts.get(canonical(fileName)),
  };

  const program = ts.createProgram({
    rootNames: [...texts.keys()],
    options: {
      noEmit: true,
      noResolve: true,
      noLib: true,
      types: [],
      allowJs: false,
      target: ts.ScriptTarget.Latest,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: rootPosix,
      paths: RESOLVER_PATH_ALIASES as Record<string, string[]>,
    },
    host,
  });
  const checker = program.getTypeChecker();

  const toRepoRelative = (absPath: string): string => {
    const normalized = canonical(absPath);
    return normalized.startsWith(`${rootPosix}/`)
      ? normalized.slice(rootPosix.length + 1)
      : normalized;
  };

  return (file, pos, name) => {
    const sf = program.getSourceFile(absOf(file));
    if (sf === undefined) return [];

    let found: ts.Identifier | undefined;
    const walk = (n: ts.Node): void => {
      if (found !== undefined) return;
      if (pos < n.getStart(sf) || pos >= n.getEnd()) return;
      if (ts.isIdentifier(n) && n.getStart(sf) === pos) {
        found = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    // An anchor that is not an identifier of the site's own name is not
    // trusted: a mis-anchored token is the one path that could resolve a
    // DIFFERENT binding, so it reports instead.
    if (found === undefined || found.text !== name) return [];

    const parent = found.parent as ts.Node | undefined;
    let symbol =
      parent !== undefined && ts.isShorthandPropertyAssignment(parent) && parent.name === found
        ? checker.getShorthandAssignmentValueSymbol(parent)
        : checker.getSymbolAtLocation(found);
    if (symbol === undefined) return [];
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      try {
        symbol = checker.getAliasedSymbol(symbol);
      } catch {
        // A non-alias throw leaves the original symbol.
      }
    }
    const declarations = symbol.declarations;
    if (declarations === undefined) return [];
    return declarations.map((decl) => {
      const declSf = decl.getSourceFile();
      const nameNode: ts.Node = ts.getNameOfDeclaration(decl) ?? decl;
      return `${toRepoRelative(declSf.fileName)}:${nameNode.getStart(declSf)}`;
    });
  };
}

export type ScanResult = {
  /** Every recognized timing, sorted by file then line. */
  readonly sites: readonly TimingSite[];
  /** Delay arguments that resolved to no covered binding, minus dispositioned rows. */
  readonly unclassified: readonly TimingSite[];
  /** Keys the outer gate accepted and the boundary predicate dropped (see `BoundaryReject`). */
  readonly boundaryRejected: readonly BoundaryReject[];
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
  const sources: { file: string; text: string }[] = [];
  const boundaryRejected: BoundaryReject[] = [];
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    sources.push({ file, text: source });
    raw.push(...scanTimingSites(source, file, boundaryRejected));
  }
  // Keyed by declaration IDENTITY — the name node's start offset — never by
  // line, which two bindings declared on one line share (probe P10).
  const coveredDeclarations = new Set(
    raw
      .filter((s) => s.kind === "named-constant" && s.declPos !== undefined)
      .map((s) => `${s.file}:${s.declPos as number}`),
  );
  const resolveBinding = createBindingResolver(repoRoot, sources);
  const dispositioned = new Set(UNCLASSIFIED_DISPOSITIONS.map((row) => `${row.file}::${row.name}`));
  const resolved = raw.filter((s) => {
    if (s.kind !== "unclassified" || s.refPos === undefined || s.name === null) return true;
    // SOME declaration of the resolved symbol, never `declarations[0]`:
    // a declaration MERGE yields one symbol with several declarations of the
    // same binding, and the stricter rule would report a covered constant
    // (probe P8). Shadowing yields two distinct SYMBOLS, so this cannot
    // smuggle a shadow in.
    return !resolveBinding(s.file, s.refPos, s.name).some((key) => coveredDeclarations.has(key));
  });
  const sites = [...resolved].sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
  );
  const unclassified = sites.filter(
    (s) => s.kind === "unclassified" && !dispositioned.has(`${s.file}::${s.name}`),
  );
  return { sites, unclassified, boundaryRejected, filesScanned: files.length };
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
      site.name ??
      `${site.propertyKey ?? (site.kind === "motion-duration" ? "duration" : "timer")}(${site.value})`;
    const key = `${site.file}::${label}::${site.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ file: site.file, label, value: site.value });
  }
  return rows;
}
