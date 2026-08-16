/**
 * tests/docs/agentsHeavyPhaseRule.test.ts — pins the AGENTS.md heavy-phase rule.
 *
 * Spec: docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md §4.6
 * (the shapes) and §5 (the bullet's required elements). Codex sessions read
 * AGENTS.md and never read the spec, so this bullet IS the durable cross-CLI
 * contract; a silently-dropped clause is a rule nobody is following.
 *
 * The member list is NOT maintained by hand. `specWrapShapes()` scans every
 * backticked code span out of spec §4.6, and `CLASSIFIED` must account for every
 * one of them — so a shape ADDED to the spec turns this guard red until somebody
 * puts it on a side. That is the derived cover; an enumeration alone re-opens the
 * moment the spec grows, which is exactly how the first version of this guard
 * accepted a document missing the direct `playwright test` shape.
 *
 * The check is a pure function over text, which is what makes the operator table
 * at the bottom executable rather than a probe someone ran once. Every operator
 * must produce at least one violation; a new operator belongs there as a row,
 * not in a review round.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { remark } from "remark";
import { describe, expect, it } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";

const ROOT = process.cwd();
const AGENTS_PATH = join(ROOT, "AGENTS.md");
const SPEC_PATH = join(ROOT, "docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md");
const PINNED_PATH = join(ROOT, "tests/docs/fixtures/agents-heavy-phase-rule.md");
const PINNED_HEADING_PATH = join(
  ROOT,
  "tests/docs/fixtures/agents-heavy-phase-section-heading.md",
);

const RULE_OPENER = "- **Heavy local phases run under the machine-wide slot semaphore.**";
/** Marker TEXT, without delimiters — the parser drops those either spelling. */
const MUST_MARKER_TEXT = "MUST wrap";
const MUST_NOT_MARKER_TEXT = "MUST NOT wrap";
const TAIL_MARKER = "Wrap the OUTERMOST command only";

/** A backticked code span, so `pnpm test` never matches `pnpm test:e2e:ui`. */
function codeSpan(literal: string): RegExp {
  return new RegExp("`" + literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`");
}

/** Every backticked span in spec §4.6, in document order, deduplicated. */
export function specWrapShapes(spec: string): string[] {
  const start = spec.indexOf("### 4.6 What must be wrapped");
  if (start === -1) throw new Error("spec §4.6 not found — the guard's scanner has no source");
  const end = spec.indexOf("\n## 5.", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  const found: string[] = [];
  for (const [, span] of section.matchAll(/`([^`\n]+)`/g)) {
    if (span && !found.includes(span)) found.push(span);
  }
  return found;
}

type Side =
  | { side: "must"; as?: string }
  | { side: "must-not"; as?: string }
  /**
   * `pinnedBy` is REQUIRED, and asserted. Three consecutive review rounds landed
   * on the same shape: an ignore row whose prose `why` claimed the span was
   * "pinned by its own clause" while the clause in question pinned something
   * weaker, so the span was in fact unpinned and the completeness test could not
   * tell — an ignore row IS an accounted-for span. Making the claim executable is
   * what closes that class: a row cannot assert coverage it does not have,
   * because asserting it IS the coverage.
   */
  | { side: "ignore"; why: string; pinnedBy: RegExp };

/**
 * Every spec §4.6 span, classified. `as` gives the literal the BULLET spells it
 * with when that differs from the spec's spelling. An `ignore` row states why the
 * span is not an invocation-shape member — those reasons are the part a reviewer
 * should argue with, which is why each carries one.
 */
const CLASSIFIED: Array<[string, Side]> = [
  [
    "pnpm heavy -- <cmd>",
    {
      side: "ignore",
      why: "the entry point itself; the bullet spells it `pnpm heavy <cmd>`",
      pinnedBy: /`pnpm heavy <cmd>`/,
    },
  ],
  ["pnpm test", { side: "must" }],
  ["pnpm test:fast", { side: "must" }],
  ["vitest run", { side: "must" }],
  [
    "pnpm exec vitest run",
    {
      side: "ignore",
      why: "a spelling of `vitest run`; the bullet states that shape once",
      pinnedBy: /`vitest run`/,
    },
  ],
  // The spec writes the glob; the bullet spells the base alias and then covers
  // the rest with "and its scoped-config aliases". Classifying the glob `ignore`
  // (the first repair's mistake) left NOTHING requiring the base shape, so the
  // whole non-interactive umbrella could be deleted with the guard still green.
  ["pnpm test:e2e*", { side: "must", as: "pnpm test:e2e" }],
  ["playwright test", { side: "must" }],
  ["pnpm screenshot:gallery", { side: "must" }],
  ["pnpm screenshot:help", { side: "must" }],
  ["playwright.screenshots.config.ts:128", { side: "must" }],
  ["pnpm build", { side: "must" }],
  ["next build", { side: "must" }],
  ["scripts/with-admin-dev-flag.mjs", { side: "must" }],
  // The spec states these two inside its MUST paragraph only to send them to the
  // MUST-NOT class ("are long-lived servers and belong to the MUST-NOT class
  // below"), so a scanner that trusted paragraph position would misfile them.
  ["next start", { side: "must-not" }],
  ["next dev", { side: "must-not" }],
  ["pnpm mutation:guards", { side: "must" }],
  ["--project mutation", { side: "must" }],
  [
    "rg -n -U 'execFileSync\\(\"pnpm\",\\s*\\[\"build\"\\]|execFileSync\\(\"pnpm\",\\s*\\[\"test:e2e'",
    { side: "must" },
  ],
  [
    "tests/",
    {
      side: "ignore",
      why: "a path argument of the sweep command",
      pinnedBy: /over `tests\/` \+ `scripts\/`/,
    },
  ],
  [
    "scripts/",
    {
      side: "ignore",
      why: "a path argument of the sweep command",
      pinnedBy: /over `tests\/` \+ `scripts\/`/,
    },
  ],
  // The ENV GATE is the load-bearing part: without RUN_BUILD_ARTIFACT_GATE_TEST=1
  // the suite is `describe.skipIf(!RUN)` and is an ordinary scoped vitest run
  // that must NOT be wrapped. A file:line citation cannot carry that condition,
  // which is what made the earlier `ignore` row wrong rather than merely loose.
  [
    "RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts",
    { side: "must" },
  ],
  ["tests/admin/build-artifact-gate.test.ts:73", { side: "must" }],
  // Same shape as the build-artifact-gate member above: what an agent has to
  // recognize is the INVOCATION, and its heaviness is conditional on the MODE.
  // A file:line citation can support the claim but cannot BE the shape.
  ["node scripts/share-link-flash-adversary-matrix.mjs", { side: "must" }],
  ["scripts/share-link-flash-adversary-matrix.mjs:1014", { side: "must" }],
  [
    "--quick",
    {
      side: "ignore",
      why: "the transitive member's UNWRAPPED mode, stated inside the MUST-side clause that names it",
      pinnedBy: /`--quick` spawns none and stays unwrapped/,
    },
  ],
  ["--ui", { side: "must-not" }],
  ["pnpm test:e2e:ui", { side: "must-not" }],
  ["--debug", { side: "must-not" }],
  ["PWDEBUG", { side: "must-not" }],
  ["format:check", { side: "must-not", as: "pnpm format:check" }],
  [
    '"heavy": "python3 scripts/with-heavy-slot.py --"',
    {
      side: "ignore",
      why: "the package.json script body, not an invocation shape; the bullet names the wrapper it runs",
      pinnedBy: /`python3 scripts\/with-heavy-slot\.py -- <cmd>`/,
    },
  ],
  [
    "pnpm heavy pnpm test",
    {
      side: "ignore",
      why: "an example invocation of the entry point, whose accepting form is pinned above",
      pinnedBy: /`pnpm heavy <cmd>`/,
    },
  ],
];

/**
 * Members the BULLET must carry that spec §4.6 states in prose rather than as a
 * code span. The completeness assertion runs spec -> registry, so extra rows
 * here are allowed; each still gets both side checks.
 */
const EXTRA_MEMBERS: Array<[string, "must" | "must-not"]> = [
  // Spec §4.6 predates the browser-mutant mode, so this member exists only in
  // the bullet. It is a MUST by the transitive shape rule: `pnpm mutation:browser`
  // spawns a real Playwright child per mutant
  // (tests/mutation/browser/runner.ts childCommand).
  ["pnpm mutation:browser", "must"],
  ["pnpm typecheck", "must-not"],
  ["pnpm exec eslint .", "must-not"],
];

/** Semantics that a token-presence check reads as intact while they are gone. */
const MUST_CLAUSES: Array<[string, RegExp]> = [
  ["entry point, stated as the form that accepts a command", /`pnpm heavy <cmd>`/],
  ["wrapper path", /scripts\/with-heavy-slot\.py/],
  ["classification is by shape, not alias", /Classification is by INVOCATION SHAPE/],
  ["full-suite vitest shape", /not scoped to an explicit file list/],
  ["scoped-config playwright aliases", /scoped-config aliases/],
  ["the playwright qualifier: only NON-interactive runs are wrapped", /Any non-interactive playwright run/],
  [
    "the direct playwright shape carries its qualifier",
    /`playwright test` without an interactive flag/,
  ],
  ["mutation shard-batch rule", /one slot per concurrently-running shard batch/],
  ["worktree-local build lock, cited where it is established", /`ROOT = process\.cwd\(\)`/],
  ["build-lock citation: the ROOT definition", /with-admin-dev-flag\.mjs:42/],
  ["build-lock citation: the lock path under that root", /with-admin-dev-flag\.mjs:97-98/],
  ["transitive shape rule", /TRANSITIVELY launches/],
  ["transitive member: build-artifact-gate", /tests\/admin\/build-artifact-gate\.test\.ts:73/],
  [
    "transitive member: share-link-flash matrix",
    /scripts\/share-link-flash-adversary-matrix\.mjs:1014/,
  ],
  ["the --quick exception stays unwrapped", /`--quick` spawns none and stays unwrapped/],
  ["the sweep is the derived cover, to be rerun", /rerun it when authoring changes to either tree/],
];

const MUST_NOT_CLAUSES: Array<[string, RegExp]> = [
  ["scoped-vitest exclusion", /Scoped vitest runs with an explicit file list/],
  ["spec/plan authoring exclusion", /spec\/plan authoring/],
  ["codex dispatch exclusion", /codex dispatches/],
  ["CI-polling exclusion", /CI polling/],
  ["git/gh exclusion", /git\/gh operations/],
  ["pre-warmed dev servers start outside", /pre-warmed dev servers/],
  ["long-lived servers start OUTSIDE, not inside", /Long-lived servers start OUTSIDE the wrapper/],
  ["why interactive runs are excluded", /unbounded-lived/],
];

const TAIL_CLAUSES: Array<[string, RegExp]> = [
  ["outermost-wrap rule", /OUTERMOST command only/],
  ["an inner wrap passes through rather than deadlocking", /passes through with a surfaced notice/],
  [
    "the priority convention's CONDITION, not just the variable",
    /Closeout and CI-stage runs set `FX_HEAVY_PRIORITY=1`/,
  ],
  ["priority is bias, not a queue position", /bias toward the nearest merge rather than a queue/],
  ["never-set FX_HEAVY_SLOT_DIR rule", /NEVER set `FX_HEAVY_SLOT_DIR`/],
  ["slot-dir divergence is undetectable", /undetectable by design/],
  [
    "capacity changes go through --recreate ONLY",
    /`python3 scripts\/with-heavy-slot\.py --recreate --slots <N>` ONLY/,
  ],
  ["spec citation", /docs\/superpowers\/specs\/2026-08-10-heavy-phase-semaphore-design\.md/],
  ["guard citation", /tests\/docs\/agentsHeavyPhaseRule\.test\.ts/],
];

/**
 * Polarity, asserted as an AXIS rather than as a list of phrasings.
 *
 * Round 4's mutant deleted three characters — the `non-` in "non-interactive" —
 * putting interactive Playwright on the MUST side in direct contradiction with
 * the MUST-NOT side, while every registered code span survived untouched. Token
 * presence cannot see that, and a longer clause list would not survive the next
 * rewording, because the words move. What does not move is the axis: on the MUST
 * side every mention of interactivity is NEGATED, and on the MUST-NOT side at
 * least one is not. Assert that, and any future wording that flips the sense
 * fails whatever sentence it is flipped in.
 */
export function polarityProblems(mustRegion: string, mustNotRegion: string): string[] {
  const problems: string[] = [];
  const negated = (text: string, at: number): boolean => {
    const before = text.slice(Math.max(0, at - 12), at);
    return /non-$/.test(before) || /without an $/.test(before);
  };

  for (const match of mustRegion.matchAll(/interactive/gi)) {
    const at = match.index ?? 0;
    if (!negated(mustRegion, at)) {
      problems.push(
        "the MUST side mentions interactivity WITHOUT negating it " +
          `(...${mustRegion.slice(Math.max(0, at - 40), at + 20).replace(/\s+/g, " ")}...); ` +
          "interactive runs belong to the MUST-NOT class",
      );
    }
  }

  const unNegated = [...mustNotRegion.matchAll(/interactive/gi)].some(
    (match) => !negated(mustNotRegion, match.index ?? 0),
  );
  if (!unNegated) {
    problems.push("the MUST-NOT side no longer excludes INTERACTIVE runs in the positive sense");
  }
  return problems;
}

/**
 * Whitespace-insensitive, word-exact: markdown may reflow, meaning may not. A
 * trailing horizontal rule is dropped too — it belongs to the SECTION, not the
 * bullet, and it leaves the extraction the moment another bullet is appended
 * after this one, which would fire the pin on an edit that never touched it.
 */
function normalize(text: string): string {
  return text
    .replace(/\s*-{3,}\s*$/, "")
    // ASCII whitespace ONLY. Reflowing markdown inserts spaces, tabs, and
    // newlines; it never inserts U+00A0. Collapsing all of `\s` let a
    // rich-text paste turn `pnpm test` into `pnpm\u00a0test` — a command that
    // does not exist (`zsh: command not found: pnpm test`) — and read as
    // identical to every check including the pin. That applied to all 25
    // space-bearing code spans in the rule at once.
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

/**
 * Named separately from the pin, because "somewhere in 4 kB a byte moved" is a
 * useless failure message for a defect whose whole nature is being invisible.
 */
const EXOTIC_SPACE =
  /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000\u2028\u2029\ufeff]/;

function exoticSpaceProblems(rule: string): string[] {
  const at = rule.search(EXOTIC_SPACE);
  if (at === -1) return [];
  const code = rule.codePointAt(at) ?? 0;
  return [
    `the rule contains a non-ASCII space (U+${code.toString(16).toUpperCase().padStart(4, "0")}) ` +
      `near "${rule.slice(Math.max(0, at - 30), at + 20).replace(/\s+/g, " ")}". ` +
      "Inside a code span it silently breaks the command it documents; it is almost " +
      "always a rich-text paste.",
  ];
}

/**
 * The close for the INVERSION class, and the reason the patterns above are now
 * diagnostics rather than the guarantee.
 *
 * Rounds 4 and 5 both inverted declarative sentences — "non-interactive" to
 * "interactive", "stay unwrapped" to "stay wrapped", "bounds nothing across
 * worktrees" to "bounds across worktrees" — leaving every registered token in
 * place. Round 5's seven mutants make the shape plain: the invertible set is
 * every declarative clause in the paragraph, so closing it by adding patterns is
 * an enumeration over English that does not terminate. Round 4 already showed
 * what that costs, since the sweep that claimed to cover the axis covered one
 * word of it.
 *
 * A pin terminates instead. Any edit to the normative text fails, inversions
 * included, and the cost is one deliberate fixture update when the contract
 * genuinely changes — which is the correct ceremony for a cross-CLI contract
 * other harnesses rely on. The structural checks stay because they name WHAT
 * broke, and because the pin cannot see the one thing they can: a shape added to
 * spec §4.6 that the bullet never picked up.
 */
/**
 * The code spans, pinned AS PARSED.
 *
 * Round 11 made classified MEMBERS immune to a blank line ending their span, but
 * `pinnedBy` and the clause patterns still read normalized text, so the same
 * mutation survived on the entry point, the direct wrapper invocation, and the
 * recreate command — every span a clause references rather than a member. Rather
 * than convert each pattern, the whole class closes once: the sequence of parsed
 * `inlineCode` values must equal the fixture's. Any span that stops being a span,
 * or changes value, fails here regardless of which check happens to name it.
 */
export function spanPinProblems(item: MdNode, pinnedRule: string): string[] {
  const live = codeSpans(item).map((span) => normalize(span.value));
  const pinnedItem = remark().parse(pinnedRule) as unknown as MdNode;
  const pinned = codeSpans(pinnedItem).map((span) => normalize(span.value));
  if (live.length === pinned.length && live.every((value, i) => value === pinned[i])) return [];
  const firstDiff = pinned.findIndex((value, i) => live[i] !== value);
  const expected = firstDiff === -1 ? "(fewer spans than pinned)" : pinned[firstDiff];
  const got = firstDiff === -1 ? "(none)" : (live[firstDiff] ?? "(missing)");
  return [
    `the rule's code spans differ from the pinned fixture: expected \`${expected}\` ` +
      `but parsed \`${got}\` at position ${firstDiff === -1 ? live.length : firstDiff}. ` +
      "A span that stops parsing as one — a blank line inside it is enough — leaves " +
      "the words in place while the command it documents ceases to exist.",
  ];
}

/**
 * The list marker is CommonMark syntax, not content: `-`, `*`, and `+` all
 * produce the same `listItem`. The pin compares raw source, so without this the
 * glyph was in the comparison and swapping it turned an unrelated formatting
 * edit red.
 */
function stripListMarker(text: string): string {
  return text.replace(/^\s*[-*+]\s+/, "");
}

/**
 * ONE canonical rendering of the rule, derived from the parse tree.
 *
 * Round 16 split this into two representations — content for the pin, raw for the
 * pattern checks — and round 17 found a false positive in each half of the split:
 * `` `` pnpm heavy <cmd> `` `` is the same `inlineCode` value with a different
 * delimiter spelling, which the raw-form patterns rejected; and an
 * `<!-- editorial note -->` is an `html` node whose value `plainText` happily
 * concatenated into the content pin. The split was the defect, not the tuning.
 *
 * So: one form, emitted from the AST. Delimiters come out canonical (a code span
 * is always single-backticked, whatever it was written as), `html` and `code`
 * nodes contribute nothing because comments and code blocks are not the contract,
 * and every check — the pin, the clause patterns, `pinnedBy`, the polarity axis —
 * reads the same string. There is no longer a wrong form to pick.
 */
function canonicalText(node: MdNode): string {
  let out = "";
  const walk = (n: MdNode): void => {
    if (n.type === "html" || n.type === "code") return;
    if (n.type === "inlineCode") {
      out += "`" + (n.value ?? "") + "`";
      return;
    }
    if (typeof n.value === "string") {
      out += n.value;
      return;
    }
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return normalize(out);
}

function contentOf(markdown: string): string {
  return canonicalText(remark().parse(markdown) as unknown as MdNode);
}

export function pinProblems(rule: string, pinned: string): string[] {
  // Compare CONTENT, not source bytes. Fifteen rounds priced the alternative:
  // every byte a raw pin compares that is markdown SYNTAX rather than content is
  // a false positive waiting for somebody's reformat — the list marker (R15),
  // `**` versus `__` (R16), and whatever spelling comes next. Letting the parser
  // strip delimiters closes that seam once instead of one glyph per round.
  //
  // Nothing is lost by it, because what the delimiters carried is asserted
  // separately and more precisely: code spans are pinned AS PARSED, the four
  // `strong` markers are asserted as `strong` nodes below, and location is
  // pinned by heading text and depth.
  if (contentOf(stripListMarker(rule)) === contentOf(stripListMarker(pinned))) return [];

  return [
    "the rule's text differs from tests/docs/fixtures/agents-heavy-phase-rule.md. " +
      "This bullet is a cross-CLI contract: Codex sessions read it and never read the " +
      "spec, so an edit that inverts a qualifier reads as intact to every pattern " +
      "check. If the change is intentional, re-read spec §4.6 and §5, then update the " +
      "fixture in the SAME commit.",
  ];
}

/**
 * Block structure comes from a real markdown parser, not from a regex over
 * syntax.
 *
 * Rounds 6, 7, and 8 all found the same thing from different angles: a boundary
 * regex that recognizes "selected block openers" is wrong for every opener it
 * has not been taught, and each omission turns somebody else's unrelated edit
 * red. The enumeration those rounds were walking into is CommonMark's block
 * grammar — `*`/`+`/`1.`/`1)` items, the three thematic-break spellings and their
 * spaced variants, ATX and Setext headings, paragraphs, fenced and indented code,
 * blockquotes, footnote definitions, HTML blocks. That does not belong in a test,
 * and `remark` is already a direct dependency (package.json), so the grammar is
 * available for free.
 *
 * With the AST, sibling blocks are outside the rule BY CONSTRUCTION rather than
 * by a pattern that has to anticipate them, a commented-out rule is an `html`
 * node and simply is not a list item, and a Setext heading is the same `heading`
 * node an ATX one is.
 */
type MdNode = {
  type: string;
  depth?: number;
  value?: string;
  children?: MdNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

function plainText(node: MdNode): string {
  let out = "";
  const walk = (n: MdNode): void => {
    if (typeof n.value === "string") out += n.value;
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return out;
}

type Span = { value: string; at: number };

/**
 * Real `inlineCode` nodes, not backtick-delimited substrings of prose.
 *
 * Round 8 moved BLOCK structure to the AST and left INLINE structure to a regex
 * over normalized text, and round 11 walked straight into the gap: a blank line
 * inside a code span ends it (CommonMark does not carry inline code across one),
 * shattering `` `pnpm test` `` into malformed fragments like `", "` — while
 * `normalize()` collapsed the blank line and handed every check back a tidy
 * `` `pnpm test` `` that no longer exists in the document. The parser is the only
 * thing that knows what a code span IS.
 */
function codeSpans(node: MdNode, out: Span[] = []): Span[] {
  if (node.type === "inlineCode" && typeof node.value === "string") {
    out.push({ value: node.value, at: node.position?.start.offset ?? 0 });
  }
  for (const child of node.children ?? []) codeSpans(child, out);
  return out;
}

function containsType(node: MdNode, type: string): boolean {
  if (node.type === type) return true;
  return (node.children ?? []).some((child) => containsType(child, type));
}

const OPENER_TEXT = "Heavy local phases run under the machine-wide slot semaphore.";

type Located =
  | { source: string; item: MdNode; at: number; heading: string; depth: number }
  | { problem: string };

/** Locate the rule's list item through the markdown AST. */
export function locateRule(agents: string): Located {
  const tree = remark().parse(agents) as unknown as MdNode;
  const blocks = tree.children ?? [];

  // EVERY heading whose text matches, not the first. Taking the first made an
  // unrelated "## Cross-cutting discipline background" inserted above the real
  // section report the rule missing while it sat untouched one section down.
  // "cross-cutting" is the TIER, and the tier is what spec §5 makes load-bearing;
  // whether the heading calls it discipline, rules, or notes is an organizational
  // choice that has nothing to do with this rule. Requiring the full phrase turned
  // a heading rename into a failure here.
  const headings = blocks.filter(
    (node) => node.type === "heading" && /cross-cutting/i.test(plainText(node)),
  );
  if (headings.length === 0) return { problem: "AGENTS.md has no cross-cutting-discipline section" };

  for (const heading of headings) {
    const headingEnd = heading.position?.end.offset ?? 0;
    const after = blocks.filter((node) => (node.position?.start.offset ?? 0) > headingEnd);
    // The FIRST heading of ANY depth ends the section's DIRECT content. Stopping
    // only at a same-or-shallower heading left a child subsection inside the
    // region, so inserting `### Retired guidance (non-normative)` above the
    // untouched bullet moved it into explicitly non-normative prose while the
    // guard stayed green. Spec §5 requires the rule to be a direct bullet of the
    // cross-cutting section, and "direct" is the part that was not enforced.
    const next = after.find((node) => node.type === "heading");
    const nextAt = next?.position?.start.offset ?? Number.POSITIVE_INFINITY;
    const section = after.filter((node) => (node.position?.start.offset ?? 0) < nextAt);

    for (const list of section.filter((node) => node.type === "list")) {
      for (const item of list.children ?? []) {
        // Normalized, because a reflowed bold opener carries a newline inside its
        // own text and a raw startsWith would fail to find a rule right there.
        if (!normalize(plainText(item)).startsWith(OPENER_TEXT)) continue;
        const from = item.position?.start.offset;
        const to = item.position?.end.offset;
        if (from === undefined || to === undefined) {
          return { problem: "the heavy-phase rule item has no source position" };
        }
        return {
          source: agents.slice(from, to),
          item,
          at: from,
          heading: plainText(heading),
          depth: heading.depth ?? 0,
        };
      }
    }
  }
  return { problem: "the heavy-phase rule bullet is absent from the cross-cutting section" };
}

export function extractRule(agents: string): string | null {
  const located = locateRule(agents);
  return "source" in located ? located.source : null;
}

/** Returns one string per violation; empty means the rule is intact. */
export function checkHeavyPhaseRule(agents: string): string[] {
  const problems: string[] = [];

  // Locating is the AST's job: the rule must be a list item inside the
  // cross-cutting-discipline section, which is what "lives at that tier" means.
  const located = locateRule(agents);
  if ("problem" in located) return [located.problem];
  const raw = located.source;

  /*
   * The heading is pinned, exactly like the rule body, and the reasoning is a
   * RATIFIED REVERSAL worth stating where it lives.
   *
   * Round 10 found that requiring the literal phrase "cross-cutting discipline"
   * failed an ordinary rename to "Cross-cutting rules", and that finding was
   * accepted: the repair loosened the match to the `cross-cutting` TIER. Round 13
   * then renamed the heading to "Retired cross-cutting guidance (non-normative)"
   * — still the tier, byte-identical rule beneath it, and now explicitly
   * non-normative with the guard green.
   *
   * Both findings are correct, and together they say a pattern cannot decide this:
   * distinguishing a harmless rename from a disclaiming one is semantics, and the
   * only pattern-shaped alternative is a vocabulary of disclaimer words
   * ("retired", "deprecated", "historical", …) that is open by construction and
   * would re-open on the next synonym.
   *
   * So the heading gets the same treatment the rule body already has: pinned, and
   * changed deliberately. A rename to "Cross-cutting rules" now fails — not
   * because it is wrong, but because moving a cross-CLI contract is a decision
   * that costs one fixture line to record. Fenced in BOTH directions: do not
   * re-loosen this to a tier match, and do not propose a disclaimer word list.
   */
  const pinnedHeadingRaw = readFileSync(PINNED_HEADING_PATH, "utf8");
  const pinnedDepth = (/^#+/.exec(pinnedHeadingRaw)?.[0] ?? "").length;
  const pinnedHeading = pinnedHeadingRaw.replace(/^#+\s*/, "");
  // Depth is location, not formatting: demoting the H2 to an H3 nests this
  // cross-CLI contract inside whatever section precedes it — in the live file,
  // "Codex-specific notes" — while every word of it stays identical.
  if (located.depth !== pinnedDepth) {
    problems.push(
      `the rule's section is at heading depth ${located.depth} but the pinned ` +
        `heading is depth ${pinnedDepth}; demoting it nests this contract inside ` +
        "the preceding section",
    );
  }
  if (normalize(located.heading) !== normalize(pinnedHeading)) {
    problems.push(
      `the rule's section heading is "${normalize(located.heading)}" but the pinned ` +
        `heading is "${normalize(pinnedHeading)}". The heading states WHERE this ` +
        "cross-CLI contract lives and whether it is normative, so a change to it is " +
        "deliberate: update tests/docs/fixtures/agents-heavy-phase-section-heading.md " +
        "in the SAME commit.",
    );
  }

  // An indented block inside the item is prose that stopped rendering as prose:
  // four extra spaces on a continuation paragraph turns the whole MUST-NOT
  // contract into an indented code block, which normalize() cannot see because
  // it erases exactly the indentation that carried the meaning.
  if (containsType(located.item, "code")) {
    problems.push(
      "the rule contains a code block — an over-indented continuation paragraph " +
        "stops rendering as normative prose while its words survive verbatim",
    );
  }

  // Everything below reads the NORMALIZED rule. `normalize()` declares whitespace
  // irrelevant, and a check that still requires a literal space contradicts it —
  // a reflowed line then passes the pin and fails a clause pattern, which is a
  // red on an edit that changed no words.
  // Regions are located in the rule's CONTENT for the same reason the pin is:
  // `**MUST wrap**` and `__MUST wrap__` are the same block to every reader and
  // to the parser. ("MUST wrap" is not a substring of "MUST NOT wrap", so the
  // two markers stay distinct without their delimiters.)
  const rule = canonicalText(located.item);
  const mustAt = rule.indexOf(MUST_MARKER_TEXT);
  const mustNotAt = rule.indexOf(MUST_NOT_MARKER_TEXT);
  const tailAt = rule.indexOf(TAIL_MARKER);
  // The same three boundaries in RAW offsets, so a parsed code span can be
  // placed in a region. Whitespace-tolerant, because the raw text may be
  // reflowed anywhere a space appears.
  const rawAt = (pattern: RegExp): number => raw.search(pattern);
  const rawMustAt = rawAt(/(?:\*\*|__)MUST\s+wrap(?:\*\*|__)/);
  const rawMustNotAt = rawAt(/(?:\*\*|__)MUST\s+NOT\s+wrap(?:\*\*|__)/);
  const rawTailAt = rawAt(/Wrap\s+the\s+OUTERMOST\s+command\s+only/);
  if (mustAt === -1) problems.push(`the rule has no ${MUST_MARKER_TEXT} block`);
  if (mustNotAt === -1) problems.push(`the rule has no ${MUST_NOT_MARKER_TEXT} block`);
  if (tailAt === -1) problems.push(`the rule has no "${TAIL_MARKER}" tail`);
  if (problems.length > 0) return problems;
  if (!(mustAt < mustNotAt && mustNotAt < tailAt)) {
    return ["the rule's MUST / MUST NOT / tail blocks are out of order"];
  }

  // Every region is a slice of the ONE canonical rendering.
  const mustRegion = rule.slice(mustAt, mustNotAt);
  const mustNotRegion = rule.slice(mustNotAt, tailAt);
  const tailRegion = rule.slice(tailAt);
  const headRegion = rule.slice(0, mustNotAt);

  const members: Array<[string, "must" | "must-not"]> = [
    ...CLASSIFIED.flatMap(([span, entry]): Array<[string, "must" | "must-not"]> =>
      entry.side === "ignore" ? [] : [[entry.as ?? span, entry.side]],
    ),
    ...EXTRA_MEMBERS,
  ];

  const spans = codeSpans(located.item).map((span) => ({
    value: normalize(span.value),
    at: span.at - located.at,
  }));
  const inRegion = (span: { at: number }, from: number, to: number): boolean =>
    from !== -1 && span.at >= from && (to === -1 || span.at < to);

  for (const [literal, side] of members) {
    const wanted = normalize(literal);
    const here = side === "must" ? [rawMustAt, rawMustNotAt] : [rawMustNotAt, rawTailAt];
    const there = side === "must" ? [rawMustNotAt, rawTailAt] : [rawMustAt, rawMustNotAt];
    const matching = spans.filter((span) => span.value === wanted);
    if (!matching.some((span) => inRegion(span, here[0]!, here[1]!))) {
      problems.push(`${side.toUpperCase()} member missing: \`${literal}\``);
    }
    // The absence half is what catches a member MOVED across the boundary,
    // which a presence-only check reads as still-present.
    if (matching.some((span) => inRegion(span, there[0]!, there[1]!))) {
      problems.push(`${side.toUpperCase()} member \`${literal}\` appears on the wrong side`);
    }
  }

  // Every ignore row's claim, executed. A span excused because "something else
  // pins it" is only excused while that something else is actually there.
  for (const [span, entry] of CLASSIFIED) {
    if (entry.side !== "ignore") continue;
    if (!entry.pinnedBy.test(rule)) {
      problems.push(
        `ignored span \`${span}\` claims coverage that is absent (${entry.why}); ` +
          `expected ${String(entry.pinnedBy)}`,
      );
    }
  }

  for (const [label, pattern] of MUST_CLAUSES) {
    if (!pattern.test(headRegion)) problems.push(`missing clause: ${label}`);
  }
  for (const [label, pattern] of MUST_NOT_CLAUSES) {
    if (!pattern.test(mustNotRegion)) problems.push(`missing clause: ${label}`);
  }
  for (const [label, pattern] of TAIL_CLAUSES) {
    if (!pattern.test(tailRegion)) problems.push(`missing clause: ${label}`);
  }
  /*
   * Raw HTML inside the rule.
   *
   * `canonicalText` drops `html` nodes because a comment is not the contract —
   * and that is exactly what let a `<details><summary>Retired guidance
   * (non-normative)</summary>` wrapper collapse every MUST, MUST-NOT, and tail
   * clause into a disclaimed panel while contributing nothing to the text the pin
   * compares.
   *
   * The split is structural rather than a tag vocabulary: an HTML COMMENT renders
   * as nothing and cannot contain, hide, or relabel anything, so it stays
   * allowed; any other raw HTML is markup that can, so it is rejected. There is
   * no list of dangerous tags to keep current, because the property being tested
   * is "is this a comment", and that is decidable.
   */
  const markup = (function collectHtml(node: MdNode, out: string[] = []): string[] {
    if (node.type === "html" && typeof node.value === "string") {
      const value = node.value.trim();
      if (!/^<!--[\s\S]*-->$/.test(value)) out.push(value);
    }
    for (const child of node.children ?? []) collectHtml(child, out);
    return out;
  })(located.item);
  if (markup.length > 0) {
    problems.push(
      `the rule contains raw HTML (${markup[0]!.slice(0, 60)}). Markup can wrap the ` +
        "contract in a collapsed or disclaimed container while contributing nothing " +
        "to its text; only HTML comments, which render as nothing, are allowed here.",
    );
  }

  // The delimiters are free; the EMPHASIS is not. Dropping the bold entirely
  // would flatten the rule's two-block structure for every human reader, and the
  // content pin above cannot see it, so it is asserted as parse-tree structure.
  const strongTexts = new Set(
    (function collect(node: MdNode, out: string[] = []): string[] {
      if (node.type === "strong") out.push(normalize(plainText(node)));
      for (const child of node.children ?? []) collect(child, out);
      return out;
    })(located.item),
  );
  for (const marker of [MUST_MARKER_TEXT, MUST_NOT_MARKER_TEXT]) {
    if (!strongTexts.has(marker)) {
      problems.push(`"${marker}" is no longer emphasized — the rule's block structure is flat`);
    }
  }

  problems.push(...exoticSpaceProblems(raw));
  problems.push(...polarityProblems(mustRegion, mustNotRegion));
  const pinnedRule = readFileSync(PINNED_PATH, "utf8");
  problems.push(...pinProblems(raw, pinnedRule));
  problems.push(...spanPinProblems(located.item, pinnedRule));
  return problems;
}

const LIVE = readFileSync(AGENTS_PATH, "utf8");
/** Re-exported for the comment-out operator, which needs the literal opener. */
const RULE_OPENER_FOR_TESTS = RULE_OPENER;
const SPEC = readFileSync(SPEC_PATH, "utf8");

describe("AGENTS.md heavy-phase rule", () => {
  it("carries every load-bearing element of spec §4.6 and §5", () => {
    expect(checkHeavyPhaseRule(LIVE)).toEqual([]);
  });

  it("classifies every wrap shape the spec names — the registry is derived, not enumerated", () => {
    const shapes = specWrapShapes(SPEC);
    premiseHolds(
      "the spec §4.6 scan found shapes to classify — an empty scan would make the " +
        "completeness assertion below hold trivially",
      shapes.length > 10,
    );
    const known = new Set(CLASSIFIED.map(([span]) => span));
    expect(shapes.filter((span) => !known.has(span))).toEqual([]);
    // And nothing classified that the spec no longer names, so the registry
    // cannot rot into a list of shapes the contract dropped.
    expect(CLASSIFIED.map(([span]) => span).filter((span) => !shapes.includes(span))).toEqual([]);
  });

  /**
   * Operator closure. Each row edits the LIVE document and must be rejected; a
   * row whose edit is a no-op is a premise failure, not a pass.
   *
   * Every operator edits WITHIN the rule. Editing the whole document would let a
   * replacement land on an unrelated occurrence elsewhere in AGENTS.md and leave
   * the rule untouched — a no-op the guard would rightly accept, reported as a
   * guard failure.
   *
   * Rows 5 onward are the mutants a cross-model review produced against the first
   * version of this guard, which accepted every one of them. They are rows rather
   * than prose so the regression is executable.
   */
  const withinRule = (text: string, edit: (rule: string) => string): string => {
    const rule = extractRule(text);
    return rule === null ? text : text.replace(rule, edit(rule));
  };
  const editRule =
    (find: string, replace: string) =>
    (text: string): string =>
      withinRule(text, (rule) => rule.replace(find, replace));

  const OPERATORS: Array<[string, (text: string) => string]> = [
    ["delete the whole bullet", (text) => withinRule(text, () => "")],
    // Heading edits are REJECTED, per the ratified reversal documented at the pin.
    [
      "wrap the normative clauses in a collapsed, disclaimed HTML panel",
      (text) =>
        withinRule(text, (rule) =>
          rule.replace(
            "\n\n  **MUST wrap**",
            "\n\n  <details><summary>Retired guidance (non-normative)</summary>\n\n  **MUST wrap**",
          ) + "\n\n  </details>",
        ),
    ],
    [
      "flatten the MUST/MUST-NOT blocks by dropping their emphasis",
      editRule("**MUST NOT wrap** — any INTERACTIVE", "MUST NOT wrap — any INTERACTIVE"),
    ],
    [
      "demote the section heading, nesting the rule in the preceding section",
      (text) =>
        text.replace(
          "## Cross-cutting discipline (from milestone retrospectives)",
          "### Cross-cutting discipline (from milestone retrospectives)",
        ),
    ],
    [
      "break the entry point's code span with a blank line",
      editRule("`pnpm heavy <cmd>`", "`pnpm\n\n  heavy <cmd>`"),
    ],
    [
      "break the direct wrapper invocation's code span",
      editRule(
        "`python3 scripts/with-heavy-slot.py -- <cmd>`",
        "`python3 scripts/with-heavy-slot.py --\n\n  <cmd>`",
      ),
    ],
    [
      "break the capacity command's code span",
      editRule(
        "`python3 scripts/with-heavy-slot.py --recreate --slots <N>`",
        "`python3 scripts/with-heavy-slot.py --recreate\n\n  --slots <N>`",
      ),
    ],
    [
      "rename the section heading within the same tier",
      (text) =>
        text.replace(
          "## Cross-cutting discipline (from milestone retrospectives)",
          "## Cross-cutting rules (from milestone retrospectives)",
        ),
    ],
    [
      "disclaim the whole section as non-normative",
      (text) =>
        text.replace(
          "## Cross-cutting discipline (from milestone retrospectives)",
          "## Retired cross-cutting guidance (non-normative)",
        ),
    ],
    [
      "nest the rule under a non-normative subsection",
      (text) =>
        text.replace(
          RULE_OPENER_FOR_TESTS,
          "### Retired guidance (non-normative)\n\n" + RULE_OPENER_FOR_TESTS,
        ),
    ],
    [
      "break a code span with a blank line, so the command stops being one",
      editRule("`pnpm test`", "`pnpm\r\n\r\n  test`"),
    ],
    [
      "smuggle a non-breaking space into a command",
      editRule("`pnpm test`", "`pnpm\u00a0test`"),
    ],
    [
      "over-indent a continuation paragraph into a code block",
      (text) =>
        text.replace(
          "\n  **MUST NOT wrap** — any INTERACTIVE playwright invocation",
          "\n      **MUST NOT wrap** — any INTERACTIVE playwright invocation",
        ),
    ],
    [
      "comment the whole rule out of the normative document",
      (text) =>
        text
          .replace(RULE_OPENER_FOR_TESTS, `<!--\n${RULE_OPENER_FOR_TESTS}`)
          .replace(
            "\n---\n\n## Cross-CLI orchestrator discipline",
            "\n---\n-->\n\n## Cross-CLI orchestrator discipline",
          ),
    ],
    ["delete one MUST shape", editRule("`pnpm mutation:guards`", "the harness")],
    ["delete one MUST-NOT shape", editRule("`PWDEBUG`", "a debug")],
    [
      "move a member across the MUST/MUST-NOT boundary",
      (text) =>
        withinRule(text, (rule) =>
          rule
            .replace(" (including the `pnpm test:e2e:ui` alias)", "")
            .replace("`pnpm mutation:guards`", "`pnpm mutation:guards`, `pnpm test:e2e:ui`"),
        ),
    ],
    [
      "delete the direct `playwright test` shape",
      editRule(", any `playwright test` without an interactive flag", ""),
    ],
    [
      "delete the non-interactive umbrella and the base `pnpm test:e2e` shape",
      editRule(
        "Any non-interactive playwright run: `pnpm test:e2e` and its scoped-config aliases, any `playwright test` without an interactive flag,",
        "Wrap the scoped-config aliases, any direct `playwright test` without an interactive flag,",
      ),
    ],
    [
      "delete the with-admin-dev-flag build path",
      editRule(", or a `next build` run through `scripts/with-admin-dev-flag.mjs`", ""),
    ],
    [
      "move `pnpm typecheck` from the MUST-NOT list into MUST",
      (text) =>
        withinRule(text, (rule) =>
          rule
            .replace("`pnpm typecheck`, ", "")
            .replace("`pnpm test:fast`", "`pnpm test:fast`, `pnpm typecheck`"),
        ),
    ],
    [
      "delete the derived sweep that covers the transitive class",
      (text) =>
        withinRule(text, (rule) =>
          rule.replace(/ The derived cover is the sweep `rg[^]*?trusting that member list\./, ""),
        ),
    ],
    [
      "weaken the recreate-only requirement to a suggestion",
      editRule(
        "go through `python3 scripts/with-heavy-slot.py --recreate --slots <N>` ONLY",
        "can use `python3 scripts/with-heavy-slot.py --recreate --slots <N>`",
      ),
    ],
    [
      "drop the closeout/CI-stage condition from the priority convention",
      editRule(
        "Closeout and CI-stage runs set `FX_HEAVY_PRIORITY=1`, a best-effort",
        "`FX_HEAVY_PRIORITY=1` is a best-effort",
      ),
    ],
    [
      "delete the shape-not-alias classification rule",
      editRule(" Classification is by INVOCATION SHAPE, never by alias.", ""),
    ],
    ["delete the shard-batch rule", editRule(", one slot per concurrently-running shard batch", "")],
    [
      "delete the `--quick` exception",
      editRule("; the mode is load-bearing — `--quick` spawns none and stays unwrapped, line 1215", ""),
    ],
    ["delete the pre-warmed dev server instruction", editRule(", and pre-warmed dev servers", "")],
    ["delete the spec/plan authoring exclusion", editRule(", and spec/plan authoring", "")],
    [
      "reduce a transitive member to its citation, dropping the invocation shape",
      editRule(
        "`node scripts/share-link-flash-adversary-matrix.mjs` in full mode",
        "`scripts/share-link-flash-adversary-matrix.mjs:1014` in full mode",
      ),
    ],
    // The round-3 class: an ignored span's cover deleted. One row per ignore
    // reason that names something deletable, not just the instance reported.
    ["drop <cmd> from the entry point", editRule("`pnpm heavy <cmd>`", "`pnpm heavy`")],
    [
      "drop the wrapper's direct-invocation form",
      editRule(" (equivalently `python3 scripts/with-heavy-slot.py -- <cmd>`)", ""),
    ],
    [
      "drop the sweep's path arguments",
      editRule(" over `tests/` + `scripts/`", ""),
    ],
    // The round-4 class: a qualifier whose deletion INVERTS a clause while every
    // registered token survives. These four are the interactivity and
    // server-placement axes specifically — round 5 showed the invertible set is
    // every declarative clause in the paragraph, which is why the verbatim pin,
    // not this table, is what closes the class. They stay because a named
    // violation is worth more than a diff when one of them is what broke.
    [
      "delete the `non-` that makes the playwright rule non-interactive",
      editRule("Any non-interactive playwright run", "Any interactive playwright run"),
    ],
    [
      "drop the interactive-flag qualifier from the direct playwright shape",
      editRule("`playwright test` without an interactive flag", "`playwright test`"),
    ],
    [
      "negate the MUST-NOT side's interactivity qualifier",
      editRule(
        "any INTERACTIVE playwright invocation",
        "any non-interactive playwright invocation",
      ),
    ],
    [
      "move long-lived servers INSIDE the wrapper",
      editRule(
        "Long-lived servers start OUTSIDE the wrapper",
        "Long-lived servers start inside the wrapper",
      ),
    ],
    // Round 5's seven inversions. Each is caught by the pin rather than by a
    // pattern, which is exactly the point of having one.
    ["invert the shape-not-alias rule", editRule("never by alias", "also by alias")],
    ["tell readers to wrap interactive runs", editRule("run them unwrapped", "run them wrapped")],
    ["invert the bulk exclusions", editRule("all stay unwrapped", "all stay wrapped")],
    [
      "claim the inner build lock bounds across worktrees",
      editRule("it bounds nothing across worktrees", "it bounds across worktrees"),
    ],
    [
      "make an inner wrap correct rather than merely harmless",
      editRule("so it is harmless, not correct", "so it is harmless, correct"),
    ],
    [
      "make the server the heavy phase instead of the suite",
      editRule(
        "the suite hitting them is the heavy phase, not the server",
        "the suite hitting them is not the heavy phase; the server is",
      ),
    ],
    [
      "claim two slot dirs share one semaphore",
      editRule(
        "two dirs are two independent semaphores",
        "two dirs share one semaphore",
      ),
    ],
  ];

  /**
   * The rejection half. A guard that reds on an edit a human would call fine is a
   * false positive, and a verbatim pin makes that failure mode cheap to hit: the
   * first version ended the extraction only at a BOLD bullet, so appending a
   * plainly-worded sibling swallowed it into the extraction and fired the pin
   * against a bullet nobody had touched.
   */
  const SIBLINGS: Array<[string, string]> = [
    ["a plainly-worded sibling bullet", "\n- A new valid cross-cutting rule.\n"],
    ["a bold sibling bullet", "\n- **A new valid rule.** With a body.\n"],
    ["an asterisk-marker sibling bullet", "\n* A new valid cross-cutting rule.\n"],
    ["a plus-marker sibling bullet", "\n+ A new valid cross-cutting rule.\n"],
    ["an ordered sibling item", "\n1. A new valid cross-cutting rule.\n"],
    ["an underscore thematic break", "\n___\n"],
    ["an asterisk thematic break", "\n***\n"],
    ["a spaced thematic break", "\n_ _ _\n"],
    // A blank line first: with only one newline a column-0 paragraph is a LAZY
    // CONTINUATION of the list item and genuinely is part of the rule, so a row
    // without the blank line would be asserting the wrong markdown.
    ["a plain neighbouring paragraph", "\n\nA neighbouring note with no effect on the rule.\n"],
    ["a blockquote", "\n\n> A neighbouring aside.\n"],
    ["a fenced code block", "\n\n```sh\necho neighbouring\n```\n"],
    ["an ordered item with a paren delimiter", "\n1) A new valid cross-cutting rule.\n"],
  ];

  it.each(SIBLINGS)("stays quiet when %s is appended after the rule", (_label, sibling) => {
    const rule = extractRule(LIVE);
    premiseHolds("the live rule was located", rule !== null);
    const withSibling = LIVE.replace(rule!, rule! + sibling);
    premiseHolds("the sibling was actually appended", withSibling !== LIVE);
    expect(checkHeavyPhaseRule(withSibling)).toEqual([]);
  });

  /**
   * Reflow and neighbourhood edits. `normalize()` declares whitespace
   * irrelevant, so every check must agree — a reflowed line that satisfies the
   * pin while failing a clause pattern is a red on an edit that changed no words.
   */
  const EQUIVALENT_EDITS: Array<[string, (text: string) => string]> = [
    [
      "the bold opener is reflowed across a line break",
      (text) =>
        text.replace(
          "- **Heavy local phases run under the machine-wide slot semaphore.**",
          "- **Heavy local phases run under the machine-wide slot\n  semaphore.**",
        ),
    ],
    [
      "body text is reflowed",
      (text) =>
        text.replace("Any non-interactive playwright run:", "Any non-interactive\n  playwright run:"),
    ],
    [
      "an unrelated section with a similar heading is inserted above this one",
      (text) =>
        text.replace(
          "## Cross-cutting discipline (from milestone retrospectives)",
          "## Cross-cutting discipline background\n\nA short background note.\n\n" +
            "## Cross-cutting discipline (from milestone retrospectives)",
        ),
    ],
    [
      "the section heading is written as a Setext heading",
      (text) =>
        text.replace(
          "## Cross-cutting discipline (from milestone retrospectives)",
          "Cross-cutting discipline (from milestone retrospectives)\n" + "-".repeat(58),
        ),
    ],
    [
      "a code span is written with double backticks and padding",
      (text) => text.replace("`pnpm heavy <cmd>`", "`` pnpm heavy <cmd> ``"),
    ],
    [
      "an editorial HTML comment is appended inside the rule",
      (text) =>
        text.replace(
          "guard: `tests/docs/agentsHeavyPhaseRule.test.ts`.",
          "guard: `tests/docs/agentsHeavyPhaseRule.test.ts`. <!-- editorial note -->",
        ),
    ],
    [
      "strong emphasis is written with underscores instead of asterisks",
      (text) =>
        text
          .replace("**MUST wrap**", "__MUST wrap__")
          .replace("**MUST NOT wrap**", "__MUST NOT wrap__"),
    ],
    [
      "the rule's own bullet marker is changed from - to *",
      (text) =>
        text.replace(
          "- **Heavy local phases run under the machine-wide slot semaphore.**",
          "* **Heavy local phases run under the machine-wide slot semaphore.**",
        ),
    ],
    [
      "a single line break is introduced inside a code span",
      (text) => text.replace("`pnpm test:fast`", "`pnpm\n  test:fast`"),
    ],
    [
      "the whole file uses CRLF line endings",
      (text) => text.replace(/\r?\n/g, "\r\n"),
    ],
  ];

  it.each(EQUIVALENT_EDITS)("stays quiet when %s", (_label, edit) => {
    const edited = edit(LIVE);
    premiseHolds("the edit actually changed the document", edited !== LIVE);
    expect(checkHeavyPhaseRule(edited)).toEqual([]);
  });

  it.each(OPERATORS)("rejects a mutant that would %s", (_label, mutate) => {
    const mutated = mutate(LIVE);
    premiseHolds("the operator actually changed the document", mutated !== LIVE);
    expect(checkHeavyPhaseRule(mutated).length).toBeGreaterThan(0);
  });
});
