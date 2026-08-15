// Structural guard: see tests/styles/_newTabScan.ts for the scanner itself.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

import { useMDXComponents } from "@/mdx-components";
import { describe, expect, it } from "vitest";

import {
  PHRASE,
  commentRanges,
  admitsCandidate,
  compileMdxToJsx,
  parse,
  scanSource,
  stripCommentsSafely,
  walkFiles,
  type Scan,
  LINE_TERMINATORS,
} from "@/tests/styles/_newTabScan";

/** The exemption marker, spelled once so these tests cannot drift from the scanner. */
const EXEMPTION_TEXT = "no-newtab-announcement:";

/** Attribute names whose CASING cannot matter at runtime, so a non-lowercase literal
 *  spelling one is a bug. Tag names are deliberately absent: JSX tag names are
 *  case-SENSITIVE. Shared by the guard below and its own behavioural pin. */
const CASE_INSENSITIVE_NAMES = new Set([
  "target",
  "rel",
  "href",
  "hidden",
  "aria-hidden",
  "aria-label",
  "aria-labelledby",
  "role",
  "classname",
  "class",
  "style",
  // R30: `title` is BOTH an attribute name and a tag name React 19 hoists out of an anchor. It
  // belongs here rather than in NOT_AN_ATTRIBUTE_NAME, because it IS a real attribute and the
  // anti-silencing check correctly refuses to let a real attribute be declared otherwise.
  "title",
  // Link-relevant attributes only. `type`, `title`, `alt`, `id` and `name` were
  // here briefly and removed on purpose: this scanner never compares them, so
  // they added no protection, while an exact literal "Title" or "Name" in a
  // message or fixture would have raised a false positive. The classification
  // assertion below keeps the set honest for the literals it CAN see; the actual
  // casing guarantee is the behavioural closed-list sweep, which does not depend
  // on this set at all (R19). Speculative entries are cost without benefit --
  // except where a name is plausible in a future hand-typed literal, which is why
  // `download`, `ping`, `referrerpolicy` and `class` stay.
  "referrerpolicy",
  "download",
  "ping",
  // Added at R21: hidesFromAccName now treats these as hiding, so a non-lowercase
  // literal spelling either one would be a live defect.
  "inert",
  "open",
  // R22: an unshown popover is not rendered, so this hides.
  "popover",
  // R24: read to detect <input type="hidden">, which is not rendered.
  "type",
  // R25: read to decide whether a self-closing element names anything.
  "alt",
  // R26 (measured): `value` contributes to the name, `title` does not.
  "value",
  "defaultvalue",
]);

/** Attributes that can affect an element's computed accessible name or its visibility, from an
 *  EXTERNAL authority rather than from this repo: HTML global attributes, `<a>` attributes, `role`,
 *  every ARIA state/property, and the two JSX aliases (`className`, `htmlFor`). Deliberately a
 *  closed list -- it is the one input to the casing sweep that does not depend on reading our own
 *  source, which is what makes the sweep immune to reading form.
 *
 *  RETRACTED at R21/R22, and the earlier wording is deleted rather than left standing: it is NOT
 *  true that an attribute outside this list cannot change an accessible name (RETRACTED) -- `data-*` is
 *  open-ended and a `[data-state="closed"]` CSS rule hides a subtree. What IS true, and all the
 *  sweep needs, is that HTML attribute NAMES are ASCII case-insensitive, so a spelling outside
 *  this list behaves identically either way and casing cannot be the defect. */
const NAME_AFFECTING_ATTRIBUTES: readonly string[] = [
  // HTML global attributes
  "accesskey",
  "autocapitalize",
  "autocorrect",
  "autofocus",
  "class",
  "contenteditable",
  "dir",
  "draggable",
  "enterkeyhint",
  "hidden",
  "id",
  "inert",
  "inputmode",
  "is",
  "itemid",
  "itemprop",
  "itemref",
  "itemscope",
  "itemtype",
  "lang",
  "nonce",
  "popover",
  "slot",
  "spellcheck",
  "style",
  "tabindex",
  "title",
  "translate",
  "writingsuggestions",
  // R21: <details> content is hidden when `open` is ABSENT -- the one attribute here
  // whose absence is the hiding condition.
  "open",
  // <a> attributes
  "href",
  "target",
  "download",
  "ping",
  "rel",
  "hreflang",
  "type",
  "referrerpolicy",
  // Name CONTRIBUTORS on elements that can sit inside an anchor. `alt` is the important one:
  // an `<img alt="...">` child contributes to the anchor's computed name, and this feature's
  // spec §1.1 already discusses the scanner's `alt` handling -- it was missing from the first
  // version of this list, which left a real name-affecting attribute outside the sweep.
  "alt",
  "placeholder",
  "value",
  "label",
  // role + ARIA states and properties
  "role",
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-braillelabel",
  "aria-brailleroledescription",
  "aria-busy",
  "aria-checked",
  "aria-colcount",
  "aria-colindex",
  "aria-colindextext",
  "aria-colspan",
  "aria-controls",
  "aria-current",
  "aria-describedby",
  "aria-description",
  "aria-details",
  "aria-disabled",
  "aria-errormessage",
  "aria-expanded",
  "aria-flowto",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-keyshortcuts",
  "aria-label",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-placeholder",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-roledescription",
  "aria-rowcount",
  "aria-rowindex",
  "aria-rowindextext",
  "aria-rowspan",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
  // JSX aliases for HTML attributes
  "className",
  "htmlFor",
];

/** Split on EVERY JavaScript line terminator, via the scanner's own constant.
 *  This is the FOURTH line-terminator defect in this PR and the first inside a guard written to
 *  stop drift: production split on LF/CRLF while its own synthetic self-test split on LF alone,
 *  so a CR-only, U+2028 or U+2029 file put an unrelated retraction and a stale claim on one
 *  "line" (review R25 HIGH 5). Sharing the constant is what stops the two diverging again. */
function splitLines(text: string): string[] {
  return text.split(new RegExp(LINE_TERMINATORS.source));
}

/** Every string literal in `src` whose SHAPE could be an HTML attribute name, from the AST
 *  and from every position. Deliberately position-BLIND: the sibling collector below asks
 *  "is this literal in a name-deciding position", which means enumerating positions, and R18
 *  showed that enumeration loses. Shape is decidable, so prose and messages fall out on the
 *  space/length test while every spelling of a name survives.
 *
 *  At module scope so it can be exercised on synthetic input; a guard that only ever runs on
 *  itself cannot be tested. */
export function nameShapedLiterals(src: string): string[] {
  const sf = ts.createSourceFile("__shape.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = new Set<string>();
  const walk = (n: ts.Node): void => {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      /^[A-Za-z][A-Za-z0-9-]{0,29}$/.test(n.text)
    ) {
      found.add(n.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return [...found].sort();
}

/** Name-shaped literals in the scanner that are NOT attribute names, each with the reason it
 *  needs no casing fixture. Everything not here must have one -- see the check below. */
const NOT_AN_ATTRIBUTE_NAME = new Map<string, string>([
  // JSX tag names are case-SENSITIVE, so folding them would be a bug, not coverage.
  ["a", "intrinsic tag name"],
  ["details", "intrinsic tag name (R21: closed <details> hides its content)"],
  // All intrinsic TAG names, from the two externally-defined sets in the scanner: content
  // never rendered, or not shown unless `open`. Tag names are case-SENSITIVE in JSX, so none
  // of these belongs in the case-insensitive attribute set.
  ["template", "intrinsic tag name (content never rendered)"],
  ["script", "intrinsic tag name (content never rendered)"],
  ["noscript", "intrinsic tag name (content never rendered)"],
  ["datalist", "intrinsic tag name (content never rendered)"],
  ["dialog", "intrinsic tag name (not shown unless open)"],
  ["img", "intrinsic tag name (R26b: one of the elements `alt` applies to)"],
  ["area", "intrinsic tag name (R26b: one of the elements `alt` applies to)"],
  // R29: added from the HTML Standard's hidden-elements list, all intrinsic TAG names.
  ["rp", "intrinsic tag name (display:none per the HTML hidden-elements rules)"],
  ["noembed", "intrinsic tag name (display:none per the HTML hidden-elements rules)"],
  ["noframes", "intrinsic tag name (display:none per the HTML hidden-elements rules)"],
  ["param", "intrinsic tag name (display:none per the HTML hidden-elements rules)"],
  ["Link", "component tag name"],
  ["NewTabHint", "component tag name"],
  // Internal classification verdicts returned by the shape rules.
  ["conditional", "shape verdict"],
  ["conditional-ok", "shape verdict"],
  ["gated", "shape verdict"],
  ["generic", "shape verdict"],
  ["group", "shape verdict"],
  ["literal", "shape verdict"],
  ["none", "shape verdict"],
  ["not-external", "shape verdict"],
  ["ok", "shape verdict"],
  ["phrase-only", "shape verdict"],
  ["static", "shape verdict"],
  ["unrecognized", "shape verdict"],
  ["unresolvable", "shape verdict"],
  ["first", "walk-up sentinel: nothing precedes this child"],
  // R31: the one tag name the SVG-title rule tests for. A `<title>` NAMES only as the direct child
  // of an `<svg>`; anything deeper names its nearest graphics container, not the anchor. The rule
  // narrowed from an ancestor walk to a direct-parent test, which is why `foreignObject` no longer
  // appears in the scanner -- the stale-exclusion check caught that within seconds of the edit.
  ["svg", "intrinsic tag name (an <svg> is named by its OWN direct-child <title>)"],
  // Attribute VALUES and unrelated identifiers, never compared as names.
  // `false` was here until R31 folded the four hiding attributes onto one value rule, which
  // removed the `stringOf(e) === "false"` comparison -- and the stale-exclusion check caught it
  // immediately, which is that check earning its place.
  ["true", 'attribute value (R31: `aria-hidden` hides only on the literal string "true")'],
  ["collapse", "CSS keyword (a hiding `visibility` value)"],
  ["invisible", "CSS class TOKEN, not an attribute (the class-list hiding set)"],
  // R35: numeric globals and the two members that can override string conversion. None is an
  // attribute name; all three are JS identifiers the value rules reason about.
  ["Infinity", 'JS numeric global (stringifies to numeric text, never "true")'],
  ["toString", "object member that can override string conversion"],
  ["valueOf", "object member that can override string conversion"],
  ["NaN", "JS global, one of the three falsy values that is not a plain literal (R32 HIGH 7)"],
  ["null", "how `${null}` STRINGIFIES inside a template -- a value, never a name (R33)"],
  ["false", "attribute value: staticStringValue renders the boolean literals as text"],
  ["presentation", "role value"],
  ["typescript", "module name"],
  ["undefined", "JS identifier name, not an attribute (R22: literal-expression evaluation)"],
]);

// ── Synthetic scanner self-tests (§6 requirement 7) ────────────────────────
// Without these the guard is unfalsifiable: the live tree exercises only
// literal targets and true-polarity spreads.
describe("scanner self-test: synthetic fixtures prove discovery and each branch", () => {
  // Every synthetic fixture is scanned WITH the real import, because R27 made the hint's
  // binding load-bearing: a file that merely spells `NewTabHint` gets no credit. Prepending it
  // here rather than in each fixture keeps the fixtures readable AND makes them faithful to a
  // real file. A fixture that needs the import absent says so by passing `bare: true`.
  const HINT_IMPORT = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
  const probe = (code: string, opts?: { bare?: boolean }): Scan => {
    const sc: Scan = { anchors: 0, violations: [] };
    const src = opts?.bare === true ? code : HINT_IMPORT + code;
    const sf = parse("/synthetic/probe.tsx", src);
    // A fixture that does not PARSE proves nothing, and one shipped: `0_0n` is a syntax error
    // (a numeric separator may not follow a leading zero), so its assertions passed vacuously.
    // Checked here rather than per-fixture, because the failure is invisible by construction --
    // the scan simply sees a malformed tree and returns whatever it returns.
    const parseErrors = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics;
    if (parseErrors !== undefined && parseErrors.length > 0) {
      const first = parseErrors[0]!;
      throw new Error(
        `fixture does not parse (${ts.flattenDiagnosticMessageText(first.messageText, " ")}): ${src}`,
      );
    }
    scanSource(sf, "/synthetic/probe.tsx", sc);
    return sc;
  };
  const ok = (code: string): void => {
    const sc = probe(code);
    expect(sc.anchors, "anchor should be discovered").toBeGreaterThan(0);
    expect(sc.violations, `expected no violation, got: ${JSON.stringify(sc.violations)}`).toEqual(
      [],
    );
  };
  const rejects = (code: string, match: RegExp): void => {
    const sc = probe(code);
    expect(sc.anchors, "anchor should be discovered").toBeGreaterThan(0);
    expect(sc.violations.length, "expected a violation").toBeGreaterThan(0);
    expect(sc.violations[0]!.reason).toMatch(match);
  };

  it("discovers a literal target and rejects a bare external link", () => {
    rejects(`const A = () => <a href="x" target="_blank">Go</a>;`, /does not announce/);
  });

  it("accepts a hint after a literal target", () => {
    ok(`const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;`);
  });

  it("accepts a destination-bearing aria-label", () => {
    ok(`const A = () => <a href="x" target="_blank" aria-label="Go (opens in a new tab)">Go</a>;`);
  });

  it("rejects a phrase-only label", () => {
    rejects(
      `const A = () => <a href="x" target="_blank" aria-label="opens in a new tab">Go</a>;`,
      /no destination/,
    );
  });

  it("rejects a punctuation-only remainder", () => {
    rejects(
      `const A = () => <a href="x" target="_blank" aria-label="(opens in a new tab)">Go</a>;`,
      /no destination/,
    );
  });

  it("rejects a hint with NO sibling space before it", () => {
    // Mutation-proven necessary: without this rule, deleting the space left the
    // whole suite green while the accessible name silently became
    // "Go(opens in a new tab)".
    rejects(
      `const A = () => <a href="x" target="_blank">Go<NewTabHint /></a>;`,
      /needs a real sibling space/,
    );
  });

  it("rejects the prettier-wrapped shape where JSX strips the whitespace", () => {
    // `Go\n    <NewTabHint />` has a trailing indent run in its text node, but
    // JSX removes any whitespace run containing a newline -- the rendered name
    // is "Go(opens in a new tab)". An earlier version of this rule accepted it,
    // because the raw text ends in spaces.
    rejects(
      `const A = () => (
  <a href="x" target="_blank">
    Go
    <NewTabHint />
  </a>
);`,
      /needs a real sibling space/,
    );
  });

  it('accepts {" "} even when a stripped newline sits between it and the hint', () => {
    // The live Group C shape: prettier puts {" "} and <NewTabHint /> on separate
    // lines, so the intervening text node is newline-only and JSX drops it.
    ok(
      `const A = ({e}) => (
  <a href="x" {...(e ? { target: "_blank" } : {})}>
    Go
    {e ? (
      <>
        {" "}
        <NewTabHint />
      </>
    ) : null}
  </a>
);`,
    );
  });

  it("accepts either spelling of the separator", () => {
    ok(`const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;`);
    ok(`const A = () => <a href="x" target="_blank">Go{" "}<NewTabHint /></a>;`);
    // A non-breaking space inside a preceding aria-hidden glyph span still
    // leaves a real separator before the hint (the Step2Verify shape).
    ok(
      `const A = () => <a href="x" target="_blank">Go<span aria-hidden="true">&nbsp;\u2192</span> <NewTabHint /></a>;`,
    );
  });

  it("rejects a hint hidden by aria-hidden", () => {
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span aria-hidden="true"><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
  });

  it("rejects a hint hidden by the native hidden attribute", () => {
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span hidden><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
  });

  it("rejects a hint hidden by a CSS class or inline style", () => {
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span className="hidden"><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
    // A non-literal style object is reported by the path-opacity rule instead: it
    // cannot be proven non-hiding, which is the same outcome by a stronger route.
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span style={{ display: "none" }}><NewTabHint /></span></a>;`,
      /cannot be proven non-hiding|hidden from the accessible name/,
    );
  });

  it('discovers target={"_blank"} in an expression container', () => {
    rejects(`const A = () => <a href="x" target={"_blank"}>Go</a>;`, /does not announce/);
  });

  it("treats a both-branch conditional target as static and accepts a static announcement", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : { target: "_blank" })}>Go <NewTabHint /></a>;`,
    );
  });

  it("requires matching polarity for a true-branch conditional target", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go <NewTabHint /></a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("requires NEGATED polarity for a false-branch conditional target", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? {} : { target: "_blank" })}>Go {!(e) ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" {...(e ? {} : { target: "_blank" })}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("accepts a conditional label when EVERY branch announces", () => {
    ok(
      `const A = ({t}) => <a href="x" target="_blank" aria-label={t ? \`Sheet for \${t} (opens in a new tab)\` : "Sheet (opens in a new tab)"}>Go</a>;`,
    );
  });

  it("rejects a conditional label whose phrase sits in only one branch", () => {
    rejects(
      `const A = ({t}) => <a href="x" target="_blank" aria-label={t ? \`Sheet for \${t} (opens in a new tab)\` : "Sheet"}>Go</a>;`,
      /must announce in that label|does not announce/,
    );
  });

  it("rejects a conditional label whose branch loses the destination", () => {
    rejects(
      `const A = ({t}) => <a href="x" target="_blank" aria-label={t ? \`Sheet for \${t} (opens in a new tab)\` : "(opens in a new tab)"}>Go</a>;`,
      /no destination/,
    );
  });

  it("rejects a static label announcement on a conditional-target anchor", () => {
    rejects(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})} aria-label="Go (opens in a new tab)">Go</a>;`,
      /static aria-label announcement on a conditional-target anchor/,
    );
  });

  it("discovers a conditional spread target and requires matching gating", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go <NewTabHint /></a>;`,
      /not gated/,
    );
  });

  it("resolves an identifier-backed spread object", () => {
    // An identifier spread is no longer an approved shape: it cannot be resolved
    // soundly (parameters, shadowing, imports), so it is reported as unrecognized.
    rejects(
      `const P = { target: "_blank" }; const A = () => <a href="x" {...P}>Go</a>;`,
      /unrecognized external-link shape/,
    );
  });

  it("fails closed on an unresolvable target expression", () => {
    rejects(
      `const A = ({t}) => <a href="x" target={t}>Go</a>;`,
      /unrecognized external-link shape/,
    );
  });

  it("covers <Link>, and reports ANY element carrying an explicit target", () => {
    rejects(`const A = () => <Link href="x" target="_blank">Go</Link>;`, /does not announce/);
    // DELIBERATE REVERSAL (R9 BLOCKING 1). This pin previously asserted that
    // `<Tabs target="_blank" />` is ignored, on the reasoning that a non-URL `target`
    // prop selects a tab rather than a window. R9 then showed the consequence:
    // requiring `href` alongside `target` skipped `<Foo target="_blank" {...spreadHref}>`
    // entirely -- admitted by the file net, zero anchors, no violation, and a real
    // `<a target="_blank">` at runtime named only "Go".
    //
    // R8 and R9 pull opposite ways here, so the tie goes to failing CLOSED: an
    // explicit `target` is now always classified. R9's census confirms no live
    // component carries `target` without `href`, so this costs nothing today, and a
    // genuine non-URL `target` prop costs exactly one exemption comment.
    rejects(`const A = () => <Tabs target="_blank" />;`, /does not announce|unrecognized/);
    // A spread-only non-link element is still NOT a candidate -- that is what keeps
    // every `<div {...props}>` in the tree from becoming a violation.
    const div = probe(`const A=({props})=><div {...props}>Go</div>;`);
    expect(div.anchors, "a spread-only non-link element must not become an anchor").toBe(0);
  });

  // ── Regression pins for the whole-diff review R1 bypasses ───────────────
  // Every case below PASSED the scanner before that review. They are grouped so
  // a future refactor that reopens one fails loudly with its origin.

  it("R1-1 fails closed on an unresolvable spread props object", () => {
    rejects(
      `const A = () => <a href="x" {...externalLinkProps}>Go</a>;`,
      /unrecognized external-link shape/,
    );
    // Under the allowlist, ANY identifier-bearing spread is unrecognized: resolving
    // it soundly is impossible (parameters, shadowing, imports), which is exactly
    // the class R1/R2/R3 kept finding new instances of.
    rejects(
      `const P = { target: "_blank" }; const A = ({e}) => <a href="x" {...(e ? P : {})}>Go</a>;`,
      /unrecognized external-link shape/,
    );
    rejects(
      `function f(){ const P = { target: "_blank" }; return <a href="x" {...P}>Go</a>; } function g(){ const P = {}; return null; }`,
      /unrecognized external-link shape/,
    );
  });

  it("R1-2 rejects a hint gated by a SUPERSET of the target predicate", () => {
    // external && ready is not external: with ready=false the tab opens silent.
    rejects(
      `const A = ({external,ready}) => <a href="x" {...(external ? { target: "_blank" } : {})}>Go {external && ready ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("R1-2 rejects an unconditional hint sitting beside a correctly gated one", () => {
    rejects(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>Go <NewTabHint />{e ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("R1-2 accepts equivalent predicate spellings", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? {} : { target: "_blank" })}>Go {!e ? <> <NewTabHint /></> : null}</a>;`,
    );
    ok(
      `const A = ({e}) => <a href="x" {...((e) ? { target: "_blank" } : {})}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
    );
  });

  it("R1-3 rejects a label that is only the phrase, twice", () => {
    rejects(
      `const A = () => <a href="x" target="_blank" aria-label="(opens in a new tab) (opens in a new tab)">Go</a>;`,
      /no destination/,
    );
  });

  it("R1-3 rejects a template whose only substitution is an empty string", () => {
    rejects(
      'const A = () => <a href="x" target="_blank" aria-label={`${""} (opens in a new tab)`}>Go</a>;',
      /no destination/,
    );
  });

  it("R1-3 accepts a conditional label announcing in exactly the external branch", () => {
    ok(
      `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})} aria-label={e ? "Go (opens in a new tab)" : "Go"}>Go</a>;`,
    );
  });

  it("R1-4 reads the VALUE of hidden attributes", () => {
    ok(
      `const A = () => <a href="x" target="_blank">Go <span hidden={false}><NewTabHint /></span></a>;`,
    );
    ok(
      `const A = () => <a href="x" target="_blank">Go <span aria-hidden={false}><NewTabHint /></span></a>;`,
    );
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span className="invisible"><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
    rejects(
      `const A = () => <a href="x" target="_blank" hidden>Go <NewTabHint /></a>;`,
      /hidden from the accessible name/,
    );
  });

  it("R1-5 ignores a fake exemption that is not a comment, and requires a reason", () => {
    rejects(
      `const A = () => <a href="x" target="_blank" data-note="no-newtab-announcement:">Go</a>;`,
      /does not announce/,
    );
    rejects(
      `// no-newtab-announcement:\nconst A = () => <a href="x" target="_blank">Go</a>;`,
      /does not announce/,
    );
  });

  it("rejects a conditionally rendered hint on an unconditionally external anchor", () => {
    rejects(
      `const A = ({e}) => <a href="x" target="_blank">Go {e ? <> <NewTabHint /></> : null}</a>;`,
      /conditionally rendered on an unconditionally external anchor/,
    );
  });

  // ── Self-certify pins (R2 substitute: Codex upstream was 503 / circuit-open) ──
  // These attack the surfaces the R2 brief asked the reviewer to probe. Kept as
  // permanent tests rather than throwaway probes, since each covers a shape the
  // scanner could plausibly regress into.

  it("SC conditional label must announce in the EXTERNAL branch, not the internal one", () => {
    // The nastiest shape the new `conditional-ok` verdict could have allowed:
    // a label that announces exactly when the link does NOT open a tab.
    rejects(
      `const A=({e})=><a href="x" {...(e ? { target: "_blank" } : {})} aria-label={e?"Go":"Go (opens in a new tab)"}>Go</a>;`,
      /must announce in that label|does not announce|no destination/,
    );
    rejects(
      `const A=({e})=><a href="x" {...(e ? {} : { target: "_blank" })} aria-label={e?"Go (opens in a new tab)":"Go"}>Go</a>;`,
      /must announce in that label|does not announce|no destination/,
    );
    ok(
      `const A=({e})=><a href="x" {...(e ? {} : { target: "_blank" })} aria-label={e?"Go":"Go (opens in a new tab)"}>Go</a>;`,
    );
  });

  it("SC paren peeling must not equate genuinely different predicates", () => {
    rejects(
      `const A=({a,b})=><a href="x" {...(a ? { target: "_blank" } : {})}>Go {(b)?<> <NewTabHint /></>:null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
    ok(
      `const A=({e})=><a href="x" {...((e) ? { target: "_blank" } : {})}>Go {e?<> <NewTabHint /></>:null}</a>;`,
    );
  });

  it("SC walk-up must not invent a separator that is not there", () => {
    rejects(
      `const A=()=><a href="x" target="_blank"><span>Go</span><span><NewTabHint /></span></a>;`,
      /needs a real sibling space/,
    );
    rejects(
      `const A=()=><a href="x" target="_blank">Go<b>!</b><NewTabHint /></a>;`,
      /needs a real sibling space/,
    );
    ok(`const A=()=><a href="x" target="_blank">Go <span><NewTabHint /></span></a>;`);
  });

  it("SC exemption must be a nearby real comment, not a string or a distant one", () => {
    rejects(
      `const A=()=><a href="x" target="_blank" title="// no-newtab-announcement: fake">Go</a>;`,
      /does not announce/,
    );
    const far = [
      "// no-newtab-announcement: real reason but far away",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      'const A = () => <a href="x" target="_blank">Go</a>;',
    ].join("\n");
    rejects(far, /does not announce/);
  });

  it("SC fails closed on every unresolvable target expression shape", () => {
    rejects(`const A=({p})=><a href="x" target={p.target}>Go</a>;`, /unrecognized/);
    rejects(`const A=()=><a href="x" target={pick()}>Go</a>;`, /unrecognized/);
    rejects(`const A=()=><a href="x" {...build()}>Go</a>;`, /unrecognized/);
  });

  // ── Regression pins for whole-diff review R2 ────────────────────────────
  it("R2-1 label predicate must be the TARGET's, not any flag", () => {
    rejects(
      `const A=({e,ready})=><a href="x" {...(e ? { target: "_blank" } : {})} aria-label={ready?"Go (opens in a new tab)":"Go"}>Go</a>;`,
      /must announce in that label|does not announce/,
    );
    // Valid inverted spelling: !e chooses the other branch, still correct.
    ok(
      `const A=({e})=><a href="x" {...(e ? { target: "_blank" } : {})} aria-label={!e?"Go":"Go (opens in a new tab)"}>Go</a>;`,
    );
  });

  it("R2-1 predicate normalization must not collapse whitespace inside strings", () => {
    rejects(
      `const A=({mode})=><a href="x" {...(mode === "x y" ? { target: "_blank" } : {})}>Go {mode === "xy" ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("R2-2 fails closed on every nested / shorthand / computed spread shape", () => {
    for (const code of [
      `const A=()=><a href="x" {...{...externalLinkProps}}>Go</a>;`,
      `const A=({target})=><a href="x" {...{target}}>Go</a>;`,
      `const A=()=><a href="x" {...{["target"]:"_blank"}}>Go</a>;`,
    ]) {
      const sc = probe(code);
      expect(sc.anchors, `must discover: ${code}`).toBeGreaterThan(0);
      expect(sc.violations.length, `must flag: ${code}`).toBeGreaterThan(0);
    }
  });

  it("R2-2 a later spread cannot mask an earlier explicit target", () => {
    // An explicit target next to ANY spread is unrecognized now, which closes the
    // ordering hole outright rather than trying to merge attribute sources.
    rejects(
      `const A=()=><a href="x" target="_blank" {...{ "aria-label": "Go" }}>Go <NewTabHint /></a>;`,
      /unrecognized external-link shape/,
    );
  });

  it("R2-3 a naming override cannot be rescued by a hint child", () => {
    rejects(
      `const A=()=><a href="x" target="_blank" aria-label="Go">Go <NewTabHint /></a>;`,
      /must announce in that label/,
    );
    rejects(
      `const A=()=><a href="x" target="_blank" aria-labelledby="t">Go <NewTabHint /></a>;`,
      /aria-labelledby outranks/,
    );
  });

  it("R31 aria-labelledby OUTRANKS an announcing aria-label, so both together is not proof", () => {
    // Measured: an anchor carrying both computes the referenced element's text and never announces
    // (pinned in tests/components/a11y/newTabAnnouncementBehavior.test.tsx). Before R31 the
    // announcing aria-label satisfied the guard while the labelledby silently decided the name.
    rejects(
      `const A=()=><a href="x" target="_blank" aria-label="Go (opens in a new tab)" aria-labelledby="n">Go</a>;`,
      /aria-labelledby outranks/,
    );
    // Order in source must not matter -- attribute order has no effect on name computation.
    rejects(
      `const A=()=><a href="x" target="_blank" aria-labelledby="n" aria-label="Go (opens in a new tab)">Go</a>;`,
      /aria-labelledby outranks/,
    );
    // aria-label ALONE, announcing, is still accepted: this rule must not swallow the valid shape.
    expect(
      probe(`const A=()=><a href="x" target="_blank" aria-label="Go (opens in a new tab)">Go</a>;`)
        .violations,
      "an announcing aria-label with no labelledby beside it is still valid",
    ).toEqual([]);
  });

  it("R2-3 rejects a substitution that can only ever be empty", () => {
    rejects(
      'const A=({e})=><a href="x" target="_blank" aria-label={`${e ? "" : ""} (opens in a new tab)`}>Go</a>;',
      /no destination/,
    );
  });

  it('R2-4 native hidden="false" is TRUTHY, and dynamic hiding fails closed', () => {
    rejects(
      `const A=()=><a href="x" target="_blank">Go <span hidden="false"><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
    rejects(
      `const A=({hide})=><a href="x" target="_blank">Go <span className={hide ? "hidden" : ""}><NewTabHint /></span></a>;`,
      /cannot be proven non-hiding|hidden from the accessible name/,
    );
  });

  it("R2-5 one exemption comment exempts exactly ONE anchor", () => {
    const code = [
      "// no-newtab-announcement: first anchor only",
      'const A = () => <a href="x" target="_blank">One</a>;',
      'const B = () => <a href="y" target="_blank">Two</a>;',
    ].join("\n");
    const sc = probe(code);
    expect(sc.anchors).toBe(2);
    expect(sc.violations.length, "the second anchor must still be flagged").toBe(1);
  });

  it("R2-7/R3-3 an unconditionally external anchor needs an UNCONDITIONAL hint", () => {
    // R2 asked for the exhaustive ternary to be accepted; R3 then defeated the
    // both-branches heuristic with `e ? ready && <Hint/> : <Hint/>`. Proving an
    // arbitrary chain exhaustive is undecidable, so the approved shape is simply an
    // unconditional hint -- and BOTH forms are now reported.
    rejects(
      `const A=({e})=><a href="x" target="_blank">Go {e ? <NewTabHint /> : <NewTabHint />}</a>;`,
      /render it unconditionally/,
    );
    rejects(
      `const A=({e,ready})=><a href="x" target="_blank">Go {e ? ready && <NewTabHint /> : <NewTabHint />}</a>;`,
      /render it unconditionally/,
    );
    ok(`const A=()=><a href="x" target="_blank">Go <NewTabHint /></a>;`);
  });

  // ── Regression pins for whole-diff review R4 ────────────────────────────
  it("R4-1 target keywords are ASCII case-insensitive, templates are undecidable", () => {
    rejects(`const A=()=><a href="x" target="_BLANK">Go</a>;`, /does not announce/);
    rejects(`const A=()=><a href="x" target="_Blank">Go</a>;`, /does not announce/);
    rejects('const A=({x})=><a href="x" target={`${x}`}>Go</a>;', /not a decidable literal/);
    rejects('const A=({s})=><a href="x" target={`_${s}`}>Go</a>;', /not a decidable literal/);
  });

  it("R4-2 approved spreads may carry only target and rel", () => {
    for (const props of [
      '{target:"_blank","aria-labelledby":"outside"}',
      '{target:"_blank","aria-hidden":"true"}',
      '{target:"_blank",className:"hidden"}',
      '{target:"_blank",style:"x"}',
    ]) {
      rejects(
        `const A=({e})=><a href="x" {...(e?${props}:{})}>Go {e?<> <NewTabHint /></>:null}</a>;`,
        /unrecognized external-link shape/,
      );
    }
  });

  it("R4-4 a hint must be a real child, not a prop, and not under a naming wrapper", () => {
    rejects(
      `const A=()=><a href="x" target="_blank">Go <Wrapper hint={<NewTabHint />} /></a>;`,
      /does not announce/,
    );
    rejects(
      `const A=()=><a href="x" target="_blank">Go <span role="img" aria-label="icon"><NewTabHint /></span></a>;`,
      /cannot be proven non-hiding/,
    );
    rejects(
      'const A=({h})=><a href="x" target="_blank">Go <span className={`${h ? "hidden" : ""}`}><NewTabHint /></span></a>;',
      /cannot be proven non-hiding/,
    );
  });

  it("R4-5 an unconstrained label substitution is not a destination, a guarded one is", () => {
    rejects(
      'const A=({label})=><a href="x" target="_blank" aria-label={`${label} (opens in a new tab)`}>Go</a>;',
      /no destination/,
    );
    ok(
      'const A=({alt})=><a href="x" target="_blank" aria-label={alt ? `${alt} (opens in a new tab)` : "Diagram (opens in a new tab)"}>Go</a>;',
    );
  });

  // ── R5 self-certify pins (R5 itself was lost to a Codex 503 outage) ──────
  it("R5 flags gated anchors whose hint is in the wrong place", () => {
    rejects(
      `const A=({e})=><a href="x" {...(e?{target:"_blank"}:{})}>Go {e?null:<> <NewTabHint /></>}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
    // A hint inside a map callback is not proof it renders for THIS anchor.
    rejects(
      `const A=({e,xs})=><a href="x" {...(e?{target:"_blank"}:{})}>Go {xs.map(()=><> <NewTabHint /></>)}</a>;`,
      /not gated|does not announce/,
    );
  });

  it("R5 flags a target attribute mixed with a spread, and _self in a gated branch", () => {
    rejects(
      `const A=({e})=><a href="x" target="_blank" rel="noopener" {...(e?{}:{})}>Go <NewTabHint /></a>;`,
      /unrecognized external-link shape/,
    );
    rejects(
      `const A=({e})=><a href="x" {...(e?{target:"_blank"}:{target:"_self"})}>Go</a>;`,
      /does not announce/,
    );
  });

  it("R5 does NOT reject correct shapes (false-positive guard)", () => {
    // With a fail-closed model, over-rejection is the live risk, so these are
    // pinned as explicitly as the rejections.
    // target="_self" is correctly NOT external, so it is not an anchor at all --
    // `ok()` cannot express that (it requires discovery), which is the distinction
    // worth pinning here.
    const selfTarget = probe(`const A=()=><a href="/local" target="_self">Go</a>;`);
    expect(selfTarget.anchors, "target=_self is not an external anchor").toBe(0);
    expect(selfTarget.violations).toEqual([]);
    ok(
      `const A=()=><a href="x" target="_blank">Go <span aria-hidden="true">↗</span> <NewTabHint /></a>;`,
    );
    ok(
      `const A=()=><a href="x" target="_blank">Go <span className="ml-1"><NewTabHint /></span></a>;`,
    );
    ok(
      `const A=({e})=><a href="x" {...(e?{}:{target:"_blank",rel:"noopener noreferrer"})}>Go{" "}{!e?<> <NewTabHint /></>:null}</a>;`,
    );
  });

  it("honors an inline exemption comment", () => {
    ok(
      `// no-newtab-announcement: intentionally silent for the probe\nconst A = () => <a href="x" target="_blank">Go</a>;`,
    );
  });

  it("does not flag a non-external link", () => {
    const sc = probe(`const A = () => <a href="/local">Go</a>;`);
    expect(sc.anchors).toBe(0);
    expect(sc.violations).toEqual([]);
  });
});

// ── Live tree ─────────────────────────────────────────────────────────────
describe("every external link in the live tree announces its new tab", () => {
  it("has no unannounced external anchors", () => {
    const files = [
      ...walkFiles(join(process.cwd(), "components"), /\.tsx$/),
      ...walkFiles(join(process.cwd(), "app"), /\.tsx$/),
      // The MDX components map lives at the REPO ROOT, outside both walked trees, so
      // an inline intrinsic override there (`a: (p) => <a {...p} target="_blank" />`)
      // would have been invisible to this pass -- and it is the one file that can make
      // EVERY help-page link external at once. Scanning it as ordinary TSX is
      // strictly better than the regex assertions that stood in for it.
      join(process.cwd(), "mdx-components.tsx"),
    ].map((abs) => abs.slice(process.cwd().length + 1));
    const sc: Scan = { anchors: 0, violations: [] };
    for (const rel of files) {
      const code = readFileSync(join(process.cwd(), rel), "utf8");
      // Case-INSENSITIVE, and it must also admit files whose target is an
      // expression or arrives via a spread. A `_blank` substring filter skipped
      // `target="_BLANK"`, `target={t}` and `<a {...props}>` entirely, so the
      // scanner never saw the very shapes it was taught to reject (review R5
      // BLOCKING 1) -- my own inconsistency with the case-insensitive isBlank.
      if (!admitsCandidate(code)) continue;
      scanSource(parse(rel, code), rel, sc);
    }
    // Anti-vacuity: the family exists, so a zero-anchor scan means the walker
    // or the glob broke rather than the tree being clean.
    expect(sc.anchors, "external anchors must be discovered").toBeGreaterThanOrEqual(20);
    expect(
      sc.violations.map((v) => `${v.file}:${v.line} ${v.reason}`),
      "unannounced external links",
    ).toEqual([]);
  }, 60_000);

  it("the announcement copy lives only in the expected files (spec §6.8 census)", () => {
    // File SET, not an occurrence count: every §5 empty-interpolation fallback
    // adds a second literal in the same label, so a magic number goes stale the
    // moment a fallback is added. Comments are stripped first, because a doc
    // comment mentioning the phrase would otherwise inflate the census -- the
    // exact failure mode that made an earlier count wrong.
    const files = [
      ...walkFiles(join(process.cwd(), "components"), /\.tsx$/),
      ...walkFiles(join(process.cwd(), "app"), /\.tsx$/),
      // The MDX components map lives at the REPO ROOT, outside both walked trees, so
      // an inline intrinsic override there (`a: (p) => <a {...p} target="_blank" />`)
      // would have been invisible to this pass -- and it is the one file that can make
      // EVERY help-page link external at once. Scanning it as ordinary TSX is
      // strictly better than the regex assertions that stood in for it.
      join(process.cwd(), "mdx-components.tsx"),
    ].map((abs) => abs.slice(process.cwd().length + 1));
    // Token-based stripping, NOT regex: a `const marker = "//"` in source makes a
    // regex swallow the rest of the line and hide a phrase-bearing label from
    // this census (review R2 MEDIUM 8).
    const carriers = files
      .filter((rel) =>
        stripCommentsSafely(readFileSync(join(process.cwd(), rel), "utf8")).includes(PHRASE),
      )
      .sort();
    expect(carriers).toEqual(
      [
        // The single definition.
        "components/shared/NewTabHint.tsx",
        // Group B label sites (§4). This spec's sole `app/` member was deleted upstream as an
        // orphan (`refactor(admin): delete the orphaned share chip and crew-page link`), arriving
        // in a mid-review merge; its announcement went with it. Deliberately NOT naming the
        // component here: that same upstream commit added a filesystem guard forbidding the
        // identifier anywhere under app/, components/ or tests/, and CI caught this comment
        // violating it. See spec §1.4 for the name and the census change.
        // The B/D modal-title anchors and the section-header corner link now
        // delegate to the ONE shared component (sheet-icon-link spec §3), so
        // the census rows for the two modal files collapse into it; the
        // sections file keeps its row for the agenda error-state text link.
        "components/admin/SheetIconLink.tsx",
        "components/admin/wizard/step3ReviewSections.tsx",
        "components/crew/primitives/SourceLink.tsx",
        // The two labels that already announced before this sweep (§2).
        "components/admin/wizard/Step3SheetCard.tsx",
        "components/admin/wizard/VenueMapTile.tsx",
      ].sort(),
    );
  }, 60_000);

  it("every .mdx compiles to JSX and its anchors announce", () => {
    const mdx = walkFiles(join(process.cwd(), "app"), /\.mdx$/).map((abs) =>
      abs.slice(process.cwd().length + 1),
    );
    expect(mdx.length, "mdx inventory should not be empty").toBeGreaterThan(0);
    const sc: Scan = { anchors: 0, violations: [] };
    const empty: string[] = [];
    for (const rel of mdx) {
      const jsx = compileMdxToJsx(readFileSync(join(process.cwd(), rel), "utf8"));
      // ANTI-VACUITY: if compilation ever returned nothing -- an upstream API change,
      // a silent failure -- scanSource would find no anchors and this test would pass
      // for the wrong reason, leaving MDX unguarded while green. Every real page
      // compiles to thousands of characters and dozens of JSX tags today.
      if ((jsx.match(/<[A-Za-z_]/g) ?? []).length < 5) empty.push(rel);
      scanSource(parse(rel, jsx), rel, sc);
    }
    expect(empty, "these .mdx files compiled to little or no JSX").toEqual([]);
    expect(sc.violations).toEqual([]);
  }, 60_000);

  // R6 BLOCKING 2: the .mdx rule only tested /_blank/i, so `target={dest}` and
  // `{...externalProps}` evaded it -- either can resolve to _blank at runtime, and
  // MDX never reaches scanSource. MDX gets NO target attribute and NO spread at
  // all; such a link belongs in a .tsx component the scanner can classify.
});

// ── MDX goes through the real compiler, so one suite covers every round ─────
// Rounds 6, 8, 9 and 10 each found a defect in hand-written MDX lexical rules --
// prose and autolinks matched, tags ended at an inner `>`, braces inside regex
// literals miscounted, fenced code read as live JSX, a trailing backslash ran past
// the tag. Four rounds on one vector is the signal to change the model, so MDX is
// compiled with @mdx-js/mdx (already a repo dependency) and the compiled JSX goes
// through the SAME scanner as TSX. Every historical case is pinned here against that
// one path.
// R11 BLOCKING 1: compiled MDX preserves component REFERENCES but not props injected
// through the runtime components map, so an `a` override there could make every help
// link external with nothing per-file to see. I had verified the file by hand; a
// verified assumption with no test is one edit away from being false.
// The class behind that blind spot: this guard walks `components/` and `app/`, so a
// .tsx ANYWHERE else is simply not scanned. mdx-components.tsx sat there unnoticed
// until R12's brief made me look, and it is the one file that could make every help
// link external at once. Rather than fix that instance alone, fail whenever a new .tsx
// appears outside the scanned set, so the next one forces a decision instead of being
// silently unscanned.
it("no .tsx file lives outside the scanned roots", () => {
  const scanned = new Set([
    "mdx-components.tsx",
    // A SPEC-TIME PROBE, not shipped surface: it exists to drive one React
    // ownership trace while its spec was being written, is never imported by
    // `app/` or `components/`, and renders no link of any kind. It sits under
    // docs/ because that is where its spec's evidence lives; the decision this
    // guard exists to force is therefore "not a live tree", recorded here
    // rather than by widening the roots to all of docs/.
    "docs/superpowers/specs/probes/2026-08-10-wifi-ownership-spike.test.tsx",
  ]);
  const roots = new Set(["components", "app", "tests", "node_modules"]);
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const rel = dir === "." ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (roots.has(rel)) continue;
        out.push(...walk(rel));
      } else if (entry.name.endsWith(".tsx") && !scanned.has(rel)) {
        out.push(rel);
      }
    }
    return out;
  };
  expect(
    walk("."),
    "add these to the live-tree scan roots, or to the scanned allowlist with a reason",
  ).toEqual([]);
});

it("the MDX components map declares no anchor override", () => {
  // R12 BLOCKING 2: three regexes over the source passed EVERY override shape --
  // shorthand `a`, `"a": External`, `["a"]: External`, an imported-map spread, a
  // helper-returned map, shorthand `Link`, and the existing `...components` input
  // spread. Parse it instead and inspect the returned object's keys.
  //
  // What this can and cannot prove, stated plainly: it proves this FILE declares no
  // `a`/`Link` key, in any of the shapes above. It cannot prove the map is
  // override-free at runtime, because `...components` lets the caller's argument
  // supply one -- so the companion assertion below pins that no caller passes a
  // `components` prop. Together those close the injection point; separately neither
  // does. An inline anchor in this file is caught by the live-tree scan, which now
  // includes it.
  const src = readFileSync(join(process.cwd(), "mdx-components.tsx"), "utf8");
  const sf = ts.createSourceFile(
    "mdx-components.tsx",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const ANCHORISH = new Set(["a", "link"]);
  const offenders: string[] = [];
  const nameOf = (prop: ts.ObjectLiteralElementLike): string | null => {
    if (ts.isShorthandPropertyAssignment(prop)) return prop.name.text;
    const n = prop.name;
    if (n === undefined) return null;
    if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
    if (ts.isComputedPropertyName(n)) {
      const e = n.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
      return "<computed>";
    }
    return null;
  };
  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      for (const prop of n.properties) {
        const name = nameOf(prop);
        if (name !== null && ANCHORISH.has(name.toLowerCase())) offenders.push(name);
        if (name === "<computed>") offenders.push("computed key (undecidable)");
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  expect(
    offenders,
    "an anchor override in the MDX components map would make every help link external with nothing per-file to inspect",
  ).toEqual([]);
});

it("the components map RETURNS no anchor override (runtime, not static)", () => {
  // Strictly stronger than parsing the file: this EVALUATES the map, so a
  // helper-returned map, an imported spread, or any indirection R12 listed is covered
  // by construction rather than by pattern. tests/help/mdx-components-registration.test.ts
  // already calls it this way; this asserts the complementary property.
  const map = useMDXComponents({}) as Record<string, unknown>;
  const offenders = Object.keys(map).filter(
    (k) => k.toLowerCase() === "a" || k.toLowerCase() === "link",
  );
  expect(
    offenders,
    "an anchor override here would make every help link external with nothing per-file to inspect",
  ).toEqual([]);
});

it("no caller passes a components prop that could inject an anchor override", () => {
  // The other half of the MDX injection path: `useMDXComponents` spreads its argument
  // and Next's compiled output resolves `...props.components` LAST, so a caller-supplied
  // override wins over the map's own entries.
  //
  // This was a regex over comment-stripped source, and R13 BLOCKING 2 showed three
  // misses (`{...{components:{a:External}}}`, `{...props}`,
  // `React.createElement(Article, {components:{...}})`), one truncation exposure via
  // stripCommentsSafely, and a FALSE positive on any file that imports MDX and passes an
  // unrelated `components` prop. Parsing removes all four at once: a JSX attribute named
  // `components` and an object-literal key named `components` are both decidable, and no
  // MDX heuristic is needed, so nothing unrelated is dragged in.
  //
  // Measured: zero occurrences in the tree today, which is why this can be an absolute
  // assertion rather than an allowlist. `{...props}` on an MDX component remains genuine
  // residue -- undecidable without resolving the caller's props -- and is recorded in
  // spec section 6.4 rather than papered over.
  const offenders: string[] = [];
  for (const root of ["app", "components"]) {
    for (const abs of walkFiles(join(process.cwd(), root), /\.tsx?$/)) {
      const src = readFileSync(abs, "utf8");
      const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const rel = abs.slice(process.cwd().length + 1);
      const visit = (n: ts.Node): void => {
        if (ts.isJsxAttribute(n) && n.name.getText() === "components") {
          offenders.push(`${rel} (jsx attribute)`);
        }
        // Identifier, string-literal, AND computed string-literal keys. A computed key
        // is exactly how `propNameLower` was evaded earlier, so the same shape is
        // covered here rather than waiting to be told (R14 question 2).
        // A getter, a class property, and a factory-built property all reach
        // props.components at runtime (review R14 BLOCKING 3), so any string literal
        // "components" in a production root is reported. The production roots contain
        // zero occurrences, so this stays absolute; the 29 safe occurrences R14 counted
        // are all under tests/, which is not scanned here.
        if (
          (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
          n.text === "components"
        ) {
          offenders.push(`${rel} (string literal "components")`);
        }
        if (
          (ts.isGetAccessorDeclaration(n) || ts.isPropertyDeclaration(n)) &&
          ts.isIdentifier(n.name) &&
          n.name.text === "components"
        ) {
          offenders.push(
            `${rel} (${ts.isGetAccessorDeclaration(n) ? "getter" : "class property"})`,
          );
        }
        if (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) {
          const nm = n.name;
          const key =
            ts.isIdentifier(nm) || ts.isStringLiteral(nm)
              ? nm.text
              : ts.isComputedPropertyName(nm) &&
                  (ts.isStringLiteral(nm.expression) ||
                    ts.isNoSubstitutionTemplateLiteral(nm.expression))
                ? nm.expression.text
                : null;
          if (key === "components") offenders.push(`${rel} (object key)`);
          // FAIL CLOSED on a computed key that is not a decidable literal. R15 built the
          // name three ways a static pass cannot evaluate -- a template with a
          // substitution, string concatenation, and Array.join -- each producing a real
          // props.components. Rather than chase evaluation, an undecidable computed key in
          // a production root is reported. The tree has zero, so this costs nothing.
          // Narrowed to keys that could actually BUILD this word: an unrelated
          // `{[flag]: …}` is legitimate and flagging it made the rule cry wolf on the live
          // tree (app/admin/settings/roles/RoleMappingRow.tsx).
          //
          // STATED LIMIT, not an oversight (R16 question 3): this fragment test IS evadable
          // -- `String.fromCharCode(...)`, an imported constant, or a computed lookup can
          // spell the key with no part of it in source. That is accepted deliberately,
          // because the threat model here is ACCIDENT, not an author who is deliberately
          // hiding an override: anyone willing to obfuscate a key can equally edit this
          // guard. The alternative, flagging every undecidable computed key, was tried and
          // reported a legitimate dynamic key, and a guard that cries wolf gets deleted.
          // If an override ever needs to be dynamic, the honest fix is an explicit
          // allowlist row here with a reason.
          if (
            key === null &&
            nm !== undefined &&
            ts.isComputedPropertyName(nm) &&
            /compo/i.test(nm.expression.getText())
          ) {
            offenders.push(
              `${rel} (undecidable computed key: ${nm.expression.getText().slice(0, 40)})`,
            );
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  expect(
    offenders,
    "a caller-supplied components map wins over the root hook, so scan the override's own file or exempt it here with a reason",
  ).toEqual([]);
});

describe("MDX is compiled and scanned, not lexed", () => {
  const scanMdx = (src: string): Scan => {
    const sc: Scan = { anchors: 0, violations: [] };
    scanSource(parse("/synthetic/doc.mdx", compileMdxToJsx(src)), "/synthetic/doc.mdx", sc);
    return sc;
  };
  const flags = (src: string): boolean => scanMdx(src).violations.length > 0;

  it("flags real external anchors, whatever supplies the target", () => {
    expect(flags('<a href="x" target="_blank">Go</a>')).toBe(true);
    expect(flags('<a href="x" target="_BLANK">Go</a>')).toBe(true);
    expect(flags('export const d = "_blank"\n\n<a href="x" target={d}>Go</a>')).toBe(true);
    // R10 finding 1: a regex literal in an earlier attribute used to break brace
    // counting, hiding the later target entirely.
    expect(
      flags('export const d = "_blank"\n\n<a href="x" data-x={/}>/.test("")} target={d}>Go</a>'),
    ).toBe(true);
    // R9: an inner `>` or `<` in an attribute value used to end the tag early.
    expect(flags('export const d = "_blank"\n\n<a href="x" title="1 > 0" target={d}>Go</a>')).toBe(
      true,
    );
    expect(flags('export const d = "_blank"\n\n<a href="x" data-x={1 < 2} target={d}>Go</a>')).toBe(
      true,
    );
  }, 60_000);

  // The compiled module is walked in full, not just the page's returned markup, so an
  // anchor reached indirectly is still classified. These are the shapes MDX makes
  // easy and a lexer would never have seen.
  it("classifies anchors reached indirectly through exports and components", () => {
    expect(flags('export const link = <a href="x" target="_blank">Go</a>\n\n{link}')).toBe(true);
    expect(flags('export function L(){ return <a href="x" target="_blank">Go</a> }\n\n<L />')).toBe(
      true,
    );
    // A custom component given a target: it can forward it to an anchor, so it is
    // classified on the strength of the attribute, not the tag name.
    expect(flags('export const dest="_blank"\n\n<MyLink href="x" target={dest}>Go</MyLink>')).toBe(
      true,
    );
    // Announced in an export is still fine.
    expect(
      flags(
        'export const link = <a href="x" target="_blank" aria-label="Sheet (opens in a new tab)">Go</a>\n\n{link}',
      ),
    ).toBe(false);
  });

  it("accepts an announced external anchor", () => {
    expect(
      flags('<a href="x" target="_blank" aria-label="Open the sheet (opens in a new tab)">Go</a>'),
    ).toBe(false);
  });

  it("does not flag prose, autolinks, fenced code, or escaped attributes", () => {
    // R8: prose and a query string containing `target=`.
    expect(flags("The target = 80% of the quarterly goal, and 5 > 4.")).toBe(false);
    expect(flags("Read https://example.com/search?target=crew for details.")).toBe(false);
    // R10 finding 4: a fenced example is documentation, not a live anchor.
    expect(flags('```tsx\n<a href="x" target="_blank">example</a>\n```\n\nprose')).toBe(false);
    expect(flags('Inline `<a target="_blank">x</a>` in a sentence.')).toBe(false);
    // R10 finding 5: a quoted attribute ending in a backslash used to swallow the
    // following prose, which then matched `target =`.
    expect(flags('<a href="/local" title="a\\\\">Go</a>\n\nThe target = 80% goal.')).toBe(false);
    // R10 finding 1 reverse: an unmatched brace inside a regex literal used to make
    // the scanner run past the tag into prose.
    expect(
      flags(
        'export const x = ""\n\n<a href="/local" data-x={/[{]/.test(x)}>Go</a>\n\nThe target = 80% goal.',
      ),
    ).toBe(false);
    // An ordinary internal markdown link.
    expect(flags("See [the docs](/help) for details.")).toBe(false);
  });
});

// ── R6 regression pins for the four previously-unpinned scanner changes ─────
// R6 BLOCKING 5: the R5 delta changed four scanner behaviors with no self-test,
// so the suite stayed green while `normPredicate` was fail-open across eleven
// operator families. Each change now has a pin that fails if it regresses.
describe("R6: scanner changes are pinned", () => {
  // Every synthetic fixture is scanned WITH the real import, because R27 made the hint's
  // binding load-bearing: a file that merely spells `NewTabHint` gets no credit. Prepending it
  // here rather than in each fixture keeps the fixtures readable AND makes them faithful to a
  // real file. A fixture that needs the import absent says so by passing `bare: true`.
  const HINT_IMPORT = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
  const probe = (code: string, opts?: { bare?: boolean }): Scan => {
    const sc: Scan = { anchors: 0, violations: [] };
    const src = opts?.bare === true ? code : HINT_IMPORT + code;
    const sf = parse("/synthetic/probe.tsx", src);
    // A fixture that does not PARSE proves nothing, and one shipped: `0_0n` is a syntax error
    // (a numeric separator may not follow a leading zero), so its assertions passed vacuously.
    // Checked here rather than per-fixture, because the failure is invisible by construction --
    // the scan simply sees a malformed tree and returns whatever it returns.
    const parseErrors = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics;
    if (parseErrors !== undefined && parseErrors.length > 0) {
      const first = parseErrors[0]!;
      throw new Error(
        `fixture does not parse (${ts.flattenDiagnosticMessageText(first.messageText, " ")}): ${src}`,
      );
    }
    scanSource(sf, "/synthetic/probe.tsx", sc);
    return sc;
  };
  /** Assert a fixture reports for the INTENDED reason. `not.toEqual([])` passes on ANY violation, so
   *  a fixture aimed at the style rule could be firing because the hint is missing entirely. Sampled
   *  eleven of these by hand and all were correct -- this keeps them that way. */
  const reports = (code: string, reason: RegExp, label: string): void => {
    const got = violations(code);
    expect(got.length, `${label}: expected a violation`).toBeGreaterThan(0);
    expect(
      got.some((r) => reason.test(r)),
      `${label}: reported for the wrong reason: ${JSON.stringify(got)}`,
    ).toBe(true);
  };

  const violations = (code: string): string[] => {
    const sc = probe(code);
    // An UNDISCOVERED anchor also yields `[]`, so every `expect(violations(...)).toEqual([])`
    // fixture would pass whether the rule accepted the markup or the scan never saw the anchor at
    // all. Same shape as the unparseable fixture: the pass carries no information. Asserted here so
    // no accept-fixture can be vacuous.
    if (sc.anchors === 0) {
      throw new Error(`fixture discovered NO anchor, so an empty result proves nothing: ${code}`);
    }
    return sc.violations.map((v) => v.reason);
  };

  // (1) Compound negation. `!(e && ready)` and `!e && ready` differ at
  // e=false,ready=false: the first is TRUE (tab opens), the second FALSE (no
  // hint). Textual normalization equated them. A compound predicate is no longer
  // an approved shape at all, so every one of R6's eleven families fails closed.
  it("compound predicates are unrecognized, not silently equated", () => {
    const families = [
      ["!(e && ready)", "!e && ready"],
      ["!e || ready", "!(e || ready)"],
      ["!(x === y)", "!x === y"],
      ["!(n > 0)", "!n > 0"],
      ["!(a & b)", "!a & b"],
      ["!(x ?? y)", "!(x) ?? y"],
      ["!(e ? p : q)", "!e ? p : q"],
    ];
    for (const [targetCond, hintCond] of families) {
      const code =
        `const A=({e,ready,x,y,n,a,b,p,q})=>` +
        `<a href="x" {...(${targetCond}?{target:"_blank"}:{})}>Go {${hintCond}?<> <NewTabHint /></>:null}</a>;`;
      expect(violations(code).join(" "), `must not accept ${targetCond} / ${hintCond}`).toMatch(
        /unrecognized|not gated/,
      );
    }
  });

  // (2) A simple member predicate on both sides is still ACCEPTED -- the fix must
  // not cost the four shipped gated anchors, which all gate on member expressions.
  it("simple member predicates on both sides still pass", () => {
    expect(
      violations(
        `const A=({action})=><a href="x" {...(action.isExternal?{target:"_blank",rel:"noreferrer"}:{})}>` +
          `{action.label} {action.isExternal?<> <NewTabHint /></>:null}</a>;`,
      ),
    ).toEqual([]);
  });

  // (3) Guarded substitution stays EXACT. R6 showed `!(label && ready)` guarding
  // `${!label && ready}` slipped through: at label="" the name is phrase-only.
  it("a guarded substitution must be the SAME expression as its guard", () => {
    expect(
      violations(
        'const A=({label,ready})=><a href="x" target="_blank" ' +
          'aria-label={!(label && ready) ? `${!label && ready} (opens in a new tab)` : "Diagram (opens in a new tab)"}>Go</a>;',
      ).join(" "),
    ).toMatch(/no destination|unrecognized/);
    // The shipped shape -- guard and substitution textually identical -- still passes.
    expect(
      violations(
        'const A=({title})=><a href="x" target="_blank" ' +
          'aria-label={title.trim() ? `${title.trim()} (opens in a new tab)` : "Diagram (opens in a new tab)"}>Go</a>;',
      ),
    ).toEqual([]);
  });

  // (4) The four roles R5 stopped treating as opaque naming wrappers.
  it("presentation/none/group/generic wrappers do not hide the hint", () => {
    for (const role of ["presentation", "none", "group", "generic"]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span role="${role}"><NewTabHint /></span></a>;`,
        ),
        `role=${role} should not be treated as opaque`,
      ).toEqual([]);
    }
    // A wrapper that really does rename its subtree is still rejected.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span role="img" aria-label="icon"><NewTabHint /></span></a>;',
      ).join(" "),
      // Rejected by the naming-wrapper/opacity rule: a wrapper carrying its own
      // aria-label renames the subtree, so the hint no longer reaches the name.
    ).toMatch(/does not announce|unrecognized|cannot be proven non-hiding/);
  });

  // The documented escape hatch MUST keep working, or the accepted limit in
  // DEFERRED.md item (c) is a dead end. A compound gate is rejected, but hoisting
  // it into a named boolean and gating both sides on that identifier passes.
  // Verified before writing the guidance, and pinned so it cannot break silently.
  it("the documented workaround for a compound gate passes", () => {
    expect(
      violations(
        `const A=({isExternal,ready})=>{const opensNewTab = isExternal && ready;
  return <a href="x" {...(opensNewTab?{target:"_blank",rel:"noreferrer"}:{})}>Go {opensNewTab?<> <NewTabHint /></>:null}</a>;};`,
      ),
    ).toEqual([]);
  });

  // (4b) DEFERRED.md NEWTAB-GUARD-UNDECIDABLE-2 item (b) is CLOSED by the same
  // change. That entry's own prescribed fix was "reject call expressions", and a
  // call is not an approved gating shape, so the effectful-predicate case R4
  // demonstrated (a deterministic `next()` true only once, opening a tab with no
  // announcement) is now REPORTED rather than silently accepted.
  it("an effectful gating predicate is reported, closing the R4 deferral", () => {
    expect(
      violations(
        `const A=({next})=><a href="x" {...(next()?{target:"_blank"}:{})}>Go {next()?<> <NewTabHint /></>:null}</a>;`,
      ).join(" "),
    ).toMatch(/not gated|unrecognized/);
  });

  // R7 BLOCKING 1: the old `canon` fell back to `getText().replace(/\s+/g,"")` for
  // unsupported subtrees, which erases token boundaries. Each pair below is TWO
  // DIFFERENT expressions that collided into one key, letting a guard "prove" a
  // different expression non-empty; R7 gave a witness for each where the
  // substitution returned "" and the name was the bare phrase.
  it("R7 distinct expressions never share an identity key", () => {
    const pairs: [string, string][] = [
      ["new F()", "newF()"],
      ["await x", "awaitx"],
      ["typeof x", "typeofx"],
      ["delete x.y", "deletex.y"],
      ["x as string", "xasstring"],
      ["get(/a b/)", "get(/ab/)"],
      ['get({x:"a b"})', 'get({x:"ab"})'],
      ["obj?.[key]", "obj[key]"],
      ["fn?.()", "fn()"],
      ["fn<T>()", "fn()"],
    ];
    for (const [guard, substituted] of pairs) {
      // Guard on one expression, substitute the OTHER. Must never be accepted.
      const code =
        `const A=({x,y,obj,key,fn,get,newF,awaitx,typeofx,deletex,xasstring})=>` +
        `<a href="x" target="_blank" aria-label={${guard} ? \`\${${substituted}} (opens in a new tab)\` : "D (opens in a new tab)"}>Go</a>;`;
      expect(violations(code).join(" "), `must not accept ${guard} / ${substituted}`).toMatch(
        /no destination|unrecognized|does not announce/,
      );
    }
  });

  // The shipped guarded-substitution shapes must still pass: identity is narrowed,
  // not abolished. `title.trim()` is a zero-arg call over a member expression.
  it("the shipped guarded-substitution labels still pass", () => {
    expect(
      violations(
        'const A=({title})=><a href="x" target="_blank" ' +
          'aria-label={title.trim() ? `${title.trim()} (opens in a new tab)` : "Diagram (opens in a new tab)"}>Go</a>;',
      ),
    ).toEqual([]);
    expect(
      violations(
        'const A=({alt})=><a href="x" target="_blank" ' +
          'aria-label={alt ? `${alt} (opens in a new tab)` : "Diagram (opens in a new tab)"}>Go</a>;',
      ),
    ).toEqual([]);
  });

  // R7 BLOCKING 2 and 3: both lexical nets were comment-blind, and the target
  // regex was case-sensitive even though HTML attribute names are not.
  // R13 HIGH 3, the root cause under several findings: stripCommentsSafely drove
  // ts.createScanner().scan() and rebuilt source from token text, which is NOT
  // parser-equivalent -- the scanner cannot know a `/` starts a regex without the
  // parser's rescan. A VALID regex containing comment bytes truncated the file, so every
  // consumer silently saw a fragment. These pin both directions.
  // Edge cases probed from R14's question 1, all against the parse-informed strip. The
  // question was where a comment start can sit inside something the parse does not report
  // as a literal; these are the shapes that mattered.
  // R14 BLOCKING 1 and 2, LOW 6: the comment finder is now ONE shared helper, and these
  // pin the two bugs its rewrite fixed plus the shebang case.
  // R15 question 1, probed before that round reported: commentRanges() is now the single
  // source for two consumers, so its edge cases matter more than any one caller's.
  // R15 question 3, probed before the round reported: which name-deciding regex uses does
  // the position-scoped rule still miss? Two did.
  it("R16 casing is BEHAVIOURALLY irrelevant for every attribute the guard reads", () => {
    // MODEL CHANGE, second attempt. My structural version asserted things about SOURCE
    // SHAPE -- no `.name.getText() === "Literal"`, no `const {name}` -- and R16 showed it
    // does not enforce its own claim: a raw read passed to a regex, `let {name}`, a
    // destructured PARAMETER, a comparison against a const, and an existential helper-body
    // check all slipped through. Source-shape rules recreate the unbounded enumeration the
    // deleted regex branch already lost twice.
    //
    // So assert the OBSERVABLE property instead: for every attribute this guard reads,
    // scanning a fixture with the name spelled in a different case must produce the SAME
    // verdict. No reading style can evade that, because it is measured at the output.
    const fixtures: [string, (n: string) => string][] = [
      ["target", (n) => `const A=()=><a href="x" ${n}="_blank">Go</a>;`],
      [
        "rel",
        (n) =>
          `const A=({e})=><a href="x" {...(e?{target:"_blank",${n}:"noreferrer"}:{})}>Go {e?<> <NewTabHint /></>:null}</a>;`,
      ],
      // Reaches candidacy THROUGH `href`: an unknown tag with a spread is admitted only by
      // the href+spread rule, so a case-sensitive `href` read drops the anchor entirely.
      // The old fixture carried a literal `target="_blank"`, which admits `<Foo>` before
      // `href` is ever consulted -- it returned the same violation under a case-sensitive
      // regression and proved nothing (R17 finding 1).
      ["href", (n) => `const A=()=><Foo ${n}="x" {...p}>Go</Foo>;`],
      [
        "aria-label",
        (n) =>
          `const A=()=><a href="x" target="_blank" ${n}="Open the sheet (opens in a new tab)">Go</a>;`,
      ],
      [
        "aria-hidden",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}="true"><NewTabHint /></span></a>;`,
      ],
      [
        "hidden",
        (n) => `const A=()=><a href="x" target="_blank">Go <span ${n}><NewTabHint /></span></a>;`,
      ],
      [
        "className",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}="hidden"><NewTabHint /></span></a>;`,
      ],
      [
        "role",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}="img" aria-label="icon"><NewTabHint /></span></a>;`,
      ],
      [
        "aria-labelledby",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}="outside"><NewTabHint /></span></a>;`,
      ],
      [
        "style",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}={{ display: "none" }}><NewTabHint /></span></a>;`,
      ],
    ];

    // COVERAGE IS NOW BEHAVIORAL AND READS NO SOURCE AT ALL. Four models have failed here:
    // regex over reading forms (R18), then literal shape (R19). Shape lost to three ordinary
    // reads -- a regex literal (`/^FetchPriority$/.test(name)`), an unquoted property key
    // (`{FetchPriority: true}[name]`), and reusing a spelling that was already excluded
    // (`name === "static"`, which I had recorded as a theoretical collision and which is in
    // fact a live evasion). Every one of those is a NORMAL way to write the read, not the
    // ratified concatenation limit.
    //
    // Any check that infers coverage FROM THE SOURCE has to enumerate something -- positions,
    // forms, or node kinds -- and the enumeration is what keeps losing. So stop inferring.
    // The set of attributes that can affect an accessible name is closed and externally
    // defined (HTML global + anchor attributes, ARIA states/properties, `role`, and the two
    // JSX aliases). For each, scanning the SAME fixture with the name in a different case must
    // produce the SAME verdict. No reading form can evade that, because the source is never
    // consulted. The narrower reason it is SOUND to stop at this list: HTML attribute names are
    // ASCII case-insensitive, so a name outside it behaves identically in either spelling and
    // casing cannot be the defect. (The stronger claim that no outside attribute can affect the
    // name is false -- see §6.4 on `data-*` -- and saying so here is what R22 asked for, because
    // the refuted wording had survived in three places at once.)
    for (const name of NAME_AFFECTING_ATTRIBUTES) {
      // `href` and `target` are in the base fixture already and have hand-built discriminating
      // fixtures above; adding a second copy only exercises the duplicate-fold path.
      if (name === "href" || name === "target") continue;
      // BOTH POLARITIES. An announcing-only base cannot observe a read that SUPPRESSES a
      // violation: the verdict is "" either way. The first version of this sweep had only
      // announcing fixtures and three case-sensitive-read mutations passed straight through
      // it. The violating base is the one that catches suppression; the announcing base
      // catches a read that manufactures a violation.
      // BOTH POLARITIES, SIX PLACEMENTS, AND SEVERAL VALUES.
      //
      // Polarity: an announcing-only base cannot observe a read that SUPPRESSES a violation --
      // the verdict is "" either way. Three R19 mutations passed straight through the first
      // version for exactly that reason.
      //
      // Depth: `hidesFromAccName` walks every ancestor up to the anchor
      // (`tests/styles/_newTabScan.ts:416`), so one wrapper level does not reach depth >= 2.
      // Stated honestly, the deep pair is NOT independently mutation-provable today, because
      // the walk IS uniform -- every mutation it catches, the one-level base also catches. It
      // guards a future non-uniform walk; recorded rather than implied.
      //
      // Values: R20 showed that pinning every fixture to `="v"` made the sweep vacuous for any
      // read gated on the VALUE. Its witness was a case-sensitive `class` read firing only when
      // the value contains `hidden` -- `"v"` never does, so `class` and `CLASS` agreed while
      // real markup diverged and a genuinely hidden announcement was accepted. So sweep the
      // values that reach the scanner's value-dependent branches, plus the bare boolean form.
      const VALUES = [
        '="v"',
        '="hidden"', // class / className token branch
        '="true"',
        '="false"', // the aria-hidden exemption branch
        '={{ display: "none" }}', // style object branch
        '="display:none"', // style string branch
        "", // bare boolean attribute, as `hidden` and `inert` are written
      ];
      for (const v of VALUES) {
        const bases: ((n: string) => string)[] = [
          (n) => `const A=()=><a href="x" target="_blank" ${n}${v}>Go</a>;`,
          (n) => `const A=()=><a href="x" target="_blank" ${n}${v}>Go <NewTabHint /></a>;`,
          (n) =>
            `const A=()=><a href="x" target="_blank">Go<span ${n}${v}><NewTabHint /></span></a>;`,
          (n) =>
            `const A=()=><a href="x" target="_blank">Go <span ${n}${v}><NewTabHint /></span></a>;`,
          (n) =>
            `const A=()=><a href="x" target="_blank">Go<span><span ${n}${v}><NewTabHint /></span></span></a>;`,
          (n) =>
            `const A=()=><a href="x" target="_blank">Go <span><span ${n}${v}><NewTabHint /></span></span></a>;`,
        ];
        for (const build of bases) {
          const base = violations(build(name)).join(" | ");
          for (const alt of [name.toUpperCase(), name[0]!.toUpperCase() + name.slice(1)]) {
            expect(
              violations(build(alt)).join(" | "),
              `"${alt}${v}" must be treated exactly like "${name}${v}"`,
            ).toBe(base);
          }
        }
      }
    }

    // Every hand-built fixture attribute must appear in the closed list, or the sweep silently
    // skips an attribute this guard demonstrably reads.
    const affectingSet = new Set(NAME_AFFECTING_ATTRIBUTES.map((n) => n.toLowerCase()));
    expect(
      fixtures.map(([n]) => n).filter((n) => !affectingSet.has(n.toLowerCase())),
      "every fixture attribute must appear in NAME_AFFECTING_ATTRIBUTES",
    ).toEqual([]);

    // The hand-built fixtures above stay: they prove the SPECIFIC behaviour each attribute
    // drives (a hidden hint, a naming override, a stripped separator), which a generic
    // same-verdict sweep cannot. The sweep proves coverage; the fixtures prove meaning.
    const spellings = (n: string): string[] => [n.toUpperCase(), n[0]!.toUpperCase() + n.slice(1)];
    // R38-era addition: `popover`, `inert`, `open`, `class` and `alt` had NO casing fixture, and
    // three of them are attributes whose rules were rewritten during this close-out (popover became
    // enumerated, open gained truthiness evaluation, inert joined the boolean group). All five behave
    // identically today -- measured before adding these -- so this is a regression guard, not a fix:
    // a case-sensitive read introduced into any of those rules would otherwise pass.
    fixtures.push(
      [
        "popover",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}="auto"><NewTabHint /></span></a>;`,
      ],
      [
        "inert",
        (n) => `const A=()=><a href="x" target="_blank">Go <span ${n}><NewTabHint /></span></a>;`,
      ],
      [
        "open",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <details ${n}><NewTabHint /></details></a>;`,
      ],
      [
        "class",
        (n) =>
          `const A=()=><a href="x" target="_blank">Go <span ${n}="hidden"><NewTabHint /></span></a>;`,
      ],
      [
        "alt",
        (n) => `const A=()=><a href="x" target="_blank"><img ${n}="Go" /> <NewTabHint /></a>;`,
      ],
    );
    for (const [name, build] of fixtures) {
      const base = violations(build(name)).join(" | ");
      for (const alt of spellings(name)) {
        expect(
          violations(build(alt)).join(" | "),
          `"${alt}" must be treated exactly like "${name}"`,
        ).toBe(base);
      }
    }

    // The DUPLICATE-fold path needs its own coverage: none of the fixtures above have two
    // attributes folding to one name, so removing that fold went undetected until a
    // mutation showed it. Every case pattern must be reported, in either order.
    for (const [first, second] of [
      ["target", "TARGET"],
      ["TARGET", "target"],
      ["Target", "tArGeT"],
    ]) {
      expect(
        violations(`const A=()=><a href="x" ${first}="_self" ${second}="_blank">Go</a>;`).join(" "),
        `duplicate ${first}/${second} must be reported`,
      ).toMatch(/case-folding|unrecognized/);
    }
  }, 60_000);

  it("R21 class, inert and a closed details all hide the hint", () => {
    const bad = [
      // React forwards a literal `class` to the DOM, so this really hides. The scanner
      // read only `className`, which made this a fail-open in the SHIPPED rule.
      'const A=()=><a href="x" target="_blank">Go <span class="hidden"><NewTabHint /></span></a>;',
      // `inert` removes the subtree from the accessibility tree (HTML Standard).
      'const A=()=><a href="x" target="_blank">Go <span inert><NewTabHint /></span></a>;',
      // A closed `<details>` hides its content, and ABSENCE of `open` is the condition --
      // the only hiding condition here that a presence-scanning loop cannot find.
      'const A=()=><a href="x" target="_blank">Go <details><NewTabHint /></details></a>;',
      'const A=()=><a href="x" target="_blank">Go <details open={false}><NewTabHint /></details></a>;',
    ];
    for (const src of bad) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    // The visible forms still pass, so the fix did not simply reject everything.
    const ok = [
      'const A=()=><a href="x" target="_blank">Go <span class="ml-1"><NewTabHint /></span></a>;',
      'const A=()=><a href="x" target="_blank">Go <span inert={false}><NewTabHint /></span></a>;',
      'const A=()=><a href="x" target="_blank">Go <details open><NewTabHint /></details></a>;',
    ];
    for (const src of ok) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  // THREE amendments in this PR left their superseded text standing (R20 found two §6.4
  // contracts at once; R22 found the same refuted claim alive in three places). "Supersedes"
  // in prose deletes nothing, and careful editing has now failed three times, so the claim
  // itself is pinned: it may appear ONLY where it is being retracted.
  it("a refuted claim appears only in a retraction", () => {
    // The RETRACTED claims themselves. This array matched itself on its first run, which is
    // the guard finding a real instance of its own rule -- the strings live here precisely
    // because they are RETRACTED, and the window check below sees this comment.
    const REFUTED = [
      // RETRACTED claims, pinned here so prose cannot quietly restate them
      "cannot change an accessible name", // RETRACTED
      "covers every name-producing accessor", // RETRACTED
      "is decided by literal SHAPE", // RETRACTED
    ];
    // An EXPLICIT marker, not a vocabulary guess. The first version matched words like
    // "narrowed" and "superseded", which is the same match-prose-as-text shape that failed
    // twice elsewhere in this PR: an unrelated sentence containing one of those words would
    // silently license a refuted claim sitting beside it. A retraction now has to say so.
    const RETRACTION = /RETRACTED/;
    // The HANDOFF was missing from this list, and the refuted claim was alive in it (review
    // R23 HIGH 5). A guard with a hand-written file list has the same defect as the prose it
    // polices: it drifts. Every artifact this PR writes prose into is listed, and the list is
    // asserted non-empty and existent below so a typo cannot silently shrink it.
    const files = [
      "tests/styles/_newTabScan.ts",
      "tests/styles/_metaNewTabAnnouncement.test.ts",
      "docs/superpowers/specs/2026-07-25-newtab-announcement-family.md",
      "docs/superpowers/handoffs/2026-07-25-newtab-announcement-handoff.md",
    ];
    for (const rel of files) {
      expect(existsSync(join(process.cwd(), rel)), `scanned file must exist: ${rel}`).toBe(true);
    }
    const offenders: string[] = [];
    for (const rel of files) {
      const lines = splitLines(readFileSync(join(process.cwd(), rel), "utf8"));
      lines.forEach((line, i) => {
        for (const claim of REFUTED) {
          if (!line.includes(claim)) continue;
          // SAME LINE, not a window. A window is position-only: R24 showed an unrelated
          // "RETRACTED: the moon-is-cheese claim" three lines away licensed a stale claim
          // sitting beside it. Binding the marker to the claim's own line is the only form
          // that cannot be satisfied by something else's retraction.
          if (!RETRACTION.test(line)) offenders.push(`${rel}:${i + 1} ${claim}`);
        }
      });
    }
    expect(
      offenders,
      "these lines state a claim this PR refuted, without retracting it -- delete them or mark the retraction",
    ).toEqual([]);

    // SELF-TEST on synthetic input, because a guard that only ever runs on files it already
    // passes cannot be shown to work. R24's witness: an unrelated retraction three lines away
    // licensed a stale claim under the old window rule.
    const scan = (text: string): number =>
      splitLines(text).filter((l) => REFUTED.some((c) => l.includes(c)) && !RETRACTION.test(l))
        .length;
    expect(
      scan("RETRACTED: the moon-is-cheese claim.\n\n\ncannot change an accessible name"),
      "an unrelated retraction must NOT license a stale claim",
    ).toBe(1);
    expect(
      scan("cannot change an accessible name -- RETRACTED, see §6.4"),
      "a same-line retraction must license it",
    ).toBe(0);
    expect(scan("an unrelated sentence"), "unrelated prose is not an offender").toBe(0);
    // EVERY line terminator, because production split on LF/CRLF while this helper split on LF
    // alone -- so a CR-only, U+2028 or U+2029 file put an unrelated retraction and a stale claim
    // on one "line" (review R25 HIGH 5). Fourth terminator defect in this PR, and the first
    // inside a guard written to stop drift.
    for (const sep of ["\n", "\r\n", "\r", "\u2028", "\u2029"]) {
      expect(
        scan(`RETRACTED: the moon-is-cheese claim.${sep}${sep}cannot change an accessible name`),
        `an unrelated retraction across ${JSON.stringify(sep)} must not license a stale claim`,
      ).toBe(1);
    }
  });

  it("R22 intrinsic hiding: template, popover, and a details that is not provably open", () => {
    // All three are INTRINSIC HTML semantics, not the selector-driven CSS limit §6.4 accepts.
    for (const src of [
      // An unshown popover is not rendered until invoked.
      'const A=()=><a href="x" target="_blank">Go <span popover="manual"><NewTabHint /></span></a>;',
      'const A=()=><a href="x" target="_blank">Go <span popover="auto"><NewTabHint /></span></a>;',
      // <template> content is never rendered, so it is not a destination either.
      'const A=()=><a href="x" target="_blank"><template>Go</template> <NewTabHint /></a>;',
      // React OMITS `open` for every falsy value, so each of these can render a CLOSED
      // details. Only a provably-true `open` counts; dynamic fails closed.
      'const A=()=><a href="x" target="_blank">Go <details open={0}><NewTabHint /></details></a>;',
      'const A=()=><a href="x" target="_blank">Go <details open={null}><NewTabHint /></details></a>;',
      'const A=()=><a href="x" target="_blank">Go <details open={undefined}><NewTabHint /></details></a>;',
      'const A=({o})=><a href="x" target="_blank">Go <details open={o}><NewTabHint /></details></a>;',
      // `open=""` was asserted ACCEPTED here until R23: React coerces a boolean DOM prop, so
      // an empty string is falsy and the attribute is omitted. The test encoded my belief,
      // not React's behaviour.
      'const A=()=><a href="x" target="_blank">Go <details open=""><NewTabHint /></details></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    for (const src of [
      'const A=()=><a href="x" target="_blank">Go <details open><NewTabHint /></details></a>;',
      'const A=()=><a href="x" target="_blank">Go <details open={true}><NewTabHint /></details></a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R27 spelling is not binding, and a naming attribute must apply", () => {
    // A file that defines its OWN `NewTabHint` gets no credit for it. `bare: true` keeps the
    // real import out so the local shadow is the only binding.
    expect(
      probe(
        'const NewTabHint = () => null;\nconst A=()=><a href="x" target="_blank">Go <NewTabHint /></a>;',
        { bare: true },
      ).violations,
      "a locally shadowed NewTabHint must not count as an announcement",
    ).not.toEqual([]);
    // MEASURED: an embedded CONTROL contributes its VALUE and not its own label, while a
    // non-control contributes its label. So `value` proves nothing off a control, and
    // `aria-label` proves nothing ON one.
    for (const src of [
      'const A=()=><a href="x" target="_blank"><data value="Go"></data> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><meter value="0.5"></meter> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><input type="text" aria-label="Go" /> <NewTabHint /></a>;',
      // Spreading a STRING yields one element per character, so an empty string yields none.
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span>{[...""]} <NewTabHint /></a>;',
      // React emits `style="display:none"` for a quoted key and for an uppercase value alike.
      'const A=()=><a href="x" target="_blank"><span style={{ "display": "none" }}>Go</span> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span style={{ display: "NONE" }}>Go</span> <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    // MOVED to must-report at R28, and the reason matters: the ACCNAME FACTS these measured are
    // unchanged -- an `<input value="Go">` really does contribute "Go", and `<span
    // aria-label="Go" />` really does too. What changed is that the guard stopped trying to
    // model per-role AccName behaviour after getting it wrong in both directions three rounds
    // running (`<input type="checkbox" value>` does NOT name; `<input type="checkbox"
    // aria-label>` DOES; `<button aria-label>` does not). It is now deliberately STRICTER than
    // AccName on nested-element attributes, which is a stated posture rather than a mistake.
    for (const src of [
      'const A=()=><a href="x" target="_blank"><input type="text" value="Go" /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-label="Go" /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><input type="checkbox" value="Go" /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><button aria-label="Go" /> <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report (stricter than AccName, by choice): ${src}`).not.toEqual(
        [],
      );
    }
    // Unambiguous destinations still pass: rendered TEXT, and `alt` on an image.
    for (const src of [
      'const A=()=><a href="x" target="_blank">Go <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><img alt="Go" /> <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R30 any boolean-producing expression, more scopes, comments in styles, hoisted title", () => {
    const IMP = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
    const hid = '<span aria-hidden="true">Go</span>';
    // R29 handled `!true`; R30 showed the operand does not have to be a literal. React renders
    // NEITHER boolean, so any always-boolean expression contributes nothing. The set is closed in
    // the grammar: `!x`, the eight comparisons, `instanceof`, `in`, `delete`.
    // R31 HIGH 7: the previous fixture list named four of the twelve forms, and a mutation that
    // deleted ONLY the `delete` branch left every one of them still reporting -- the set was
    // claimed closed in a comment and pinned in part. Every form the rule enumerates now has a
    // fixture, so deleting any single branch fails a test.
    for (const expr of [
      "{!label}",
      "{!!label}",
      "{n > 0}",
      "{n < 0}",
      "{n >= 0}",
      "{n <= 0}",
      "{n == 0}",
      "{n != 0}",
      "{n === 0}",
      "{n !== 0}",
      "{x instanceof Date}",
      '{"k" in obj}',
      "{delete obj.k}",
    ]) {
      expect(
        violations(
          `const A=({label,n,x,obj})=><a href="x" target="_blank">${hid} ${expr} <NewTabHint /></a>;`,
        ),
        `must report, always a boolean: ${expr}`,
      ).not.toEqual([]);
    }
    // `typeof` yields a STRING and therefore RENDERS -- the boundary of that rule.
    expect(
      violations(
        `const A=({x})=><a href="x" target="_blank">${hid} {typeof x} <NewTabHint /></a>;`,
      ),
      "typeof renders a string, so it IS a destination",
    ).toEqual([]);
    // More shadowing scopes: inside a named class EXPRESSION (where the name does bind), a
    // namespace block, a switch case block, and module scope.
    for (const [label, body] of [
      [
        "named class expression body",
        'const C = class NewTabHint { render(){ return <a href="x" target="_blank">Go <NewTabHint /></a>; } };',
      ],
      [
        "namespace block",
        'namespace N { const NewTabHint = () => null; export const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "switch case block",
        'function A(k){ switch(k){ case 1: { const NewTabHint = () => null; return <a href="x" target="_blank">Go <NewTabHint /></a>; } default: return null; } }',
      ],
      [
        "module-scope class declaration",
        'class NewTabHint {}\nconst A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;',
      ],
    ] as [string, string][]) {
      expect(
        probe(IMP + body, { bare: true }).violations,
        `must fail closed: ${label}`,
      ).not.toEqual([]);
    }
    // A named class expression does NOT bind its name outside its own body, so this is not a shadow.
    expect(
      probe(
        IMP +
          'const C = class NewTabHint {};\nconst A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;',
        { bare: true },
      ).violations,
      "a class expression's name does not leak into the enclosing scope",
    ).toEqual([]);
    // A COMMENT inside the style object defeated a raw-text match.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank"><span style={{ display: /* hidden */ "none" }}>Go</span> <NewTabHint /></a>;',
      ),
      "a comment inside the style object must not hide display:none from the matcher",
    ).not.toEqual([]);
    // React 19 HOISTS a nested <title> out of the anchor, so its text never reaches the name.
    expect(
      violations('const A=()=><a href="x" target="_blank"><title>Go</title> <NewTabHint /></a>;'),
      "a hoisted <title> contributes no destination",
    ).not.toEqual([]);
  });

  it("the fixture-parse guard actually fires (self-test)", () => {
    // `0_0n` really shipped as a fixture and passed vacuously. A guard nobody has watched fail is
    // decoration, so this asserts the exact spelling that fooled the suite is now rejected, plus a
    // plainly broken one -- and that a VALID fixture still scans.
    expect(() => probe('const A = () => <a href="x" target="_blank">{0_0n}</a>;')).toThrow(
      /fixture does not parse/,
    );
    expect(() => probe("const A = () => <a href=;")).toThrow(/fixture does not parse/);
    expect(() =>
      probe('const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;'),
    ).not.toThrow();
    // The second vacuity guard: an accept-fixture whose anchor was never DISCOVERED also yields an
    // empty result. A plain internal link is not a candidate, so it discovers nothing.
    expect(() => violations('const A = () => <a href="/local">Go</a>;')).toThrow(
      /discovered NO anchor/,
    );
    expect(() =>
      violations('const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;'),
    ).not.toThrow();
  });

  it("R32 selected operands, evaluated values, popover as an enumerated attribute", () => {
    const hid = '<span aria-hidden="true">Go</span>';
    // BLOCKING 4: `&&`, `||`, `??`, a comma and a literal-array SPREAD all SELECT an operand. Leaving
    // them opaque credited a destination the accessible name never contains. Each of these has no
    // destination once the aria-hidden element is discounted.
    for (const expr of [
      `{true && ${hid}}`,
      `{false || ${hid}}`,
      `{null ?? ${hid}}`,
      `{undefined ?? ${hid}}`,
      `{(0, ${hid})}`,
      `{[...[${hid}]]}`,
      `{[...[], ${hid}]}`,
      // Neither branch is picked by the test, but NEITHER carries a destination, so the test
      // cannot matter.
      `{flag ? ${hid} : null}`,
      `{flag ? ${hid} : ${hid}}`,
    ]) {
      reports(
        `const A=({flag})=><a href="x" target="_blank">${expr} <NewTabHint /></a>;`,
        /only visible content is the announcement/,
        `selected operand carries no destination: ${expr}`,
      );
    }
    // NESTED selection: nullishness has to compose too, or the `??` rule asks about the wrong
    // operand. `(false || null) ?? "true"` really evaluates to "true" and hides (review R35).
    for (const v of [
      '(false || null) ?? "true"',
      '(null ?? null) ?? "true"',
      '(true && null) ?? "true"',
      '(false || undefined) ?? "true"',
    ]) {
      reports(
        `const A=()=><a href="x" target="_blank">Go <span aria-hidden={${v}}><NewTabHint /></span></a>;`,
        /hidden from the accessible name/,
        `nested selection evaluates to "true": ${v}`,
      );
    }
    // ...and the same nesting evaluating to something else does NOT hide.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span aria-hidden={(false || null) ?? "false"}><NewTabHint /></span></a>;',
      ),
      'nested selection evaluating to "false" is visible',
    ).toEqual([]);
    // ...and the mirror cases still pass, so operand selection is not a blanket rejection.
    for (const expr of [
      "{true && <span>Go</span>}",
      "{false || <span>Go</span>}",
      `{false && ${hid}}`, // yields `false`, renders nothing -- but `Go` text below carries it
      '{[...[<span key="k">Go</span>]]}',
      "{flag ? <span>Go</span> : <span>Also Go</span>}",
    ]) {
      expect(
        violations(`const A=({flag})=><a href="x" target="_blank">Go ${expr} <NewTabHint /></a>;`),
        `must accept: ${expr}`,
      ).toEqual([]);
    }
    // BLOCKING 2: aria-hidden values are EVALUATED, so template substitutions count.
    for (const attr of [
      "aria-hidden={`${true}`}",
      'aria-hidden={`tr${"ue"}`}',
      "aria-hidden={`${'true'}`}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must report, this evaluates to "true": ${attr}`,
      ).not.toEqual([]);
    }
    // These two pin EVALUATION itself rather than the fail-closed default. A template containing
    // `${true}` reports either way -- by evaluating to "true", or by being undecidable -- so it
    // cannot tell the two apart. `${true}x` can: it is only accepted if the boolean was really
    // rendered into the string. A DYNAMIC substitution must still fail closed.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span aria-hidden={`${true}x`}><NewTabHint /></span></a>;',
      ),
      'must accept: `${true}x` evaluates to "truex", which does not hide',
    ).toEqual([]);
    expect(
      violations(
        'const A=({flag})=><a href="x" target="_blank">Go <span aria-hidden={`${flag}`}><NewTabHint /></span></a>;',
      ),
      "must report: a dynamic substitution leaves the value undecidable, so fail closed",
    ).not.toEqual([]);
    // ...and a template that evaluates to something else does NOT hide (the false-positive half).
    for (const attr of [
      "aria-hidden={`true${false}`}",
      "aria-hidden={`${false}`}",
      "aria-hidden={`no${'pe'}`}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, this does not evaluate to "true": ${attr}`,
      ).toEqual([]);
    }
    // BLOCKING 5: style VALUES are evaluated, not pattern-matched.
    for (const style of [
      '{{display: (0, "none")}}',
      '{{visibility: (0, "hidden")}}',
      '{{visibility: (0, "collapse")}}',
      '{{display: true ? "none" : "block"}}',
      '{{display: false ? "block" : "none"}}',
      '{{visibility: `hid${"den"}`}}',
      '{{display: "no" + "ne"}}',
      '{{["dis" + "play"]: "none"}}',
      '{{display: "NONE"}}',
      // CSS tolerates whitespace around the property name, and React passes the key through.
      '{{" display ": "none"}}',
      // A SHORTHAND makes only its OWN key unknown -- it cannot rescue an earlier hiding write on a
      // DIFFERENT key. Treating the whole object as opaque instead would accept these.
      '{{display: "none", visibility}}',
      '{{visibility: "hidden", display}}',
      // R33 BLOCKING 4: last write wins, and a spread is a write.
      '{{...(true ? {display: "none"} : {})}}',
      '{{display: "block", ...(true ? {display: "none"} : {})}}',
      '{{visibility: "visible", ...(true ? {visibility: "collapse"} : {})}}',
    ]) {
      reports(
        `const A=()=><a href="x" target="_blank"><span style=${style}>Go</span> <NewTabHint /></a>;`,
        /only visible content is the announcement/,
        `the destination is hidden: ${style}`,
      );
    }
    // A style object the scanner cannot read is OPAQUE and does not hide -- unchanged posture, and
    // previously unpinned, so a mutation making a spread or shorthand hide changed no test.
    for (const style of [
      "{{...hideStyles}}",
      '{{...hideStyles, display: "block"}}',
      // The case that distinguishes "skip the unreadable spread" from "the whole object is
      // unknown": an undecidable spread AFTER a hiding write could overwrite it, so the object is
      // opaque and the destination is assumed visible. Skipping the spread instead would report it.
      '{{display: "none", ...rest}}',
      '{{visibility: "hidden", ...rest}}',
      "{{display}}",
    ]) {
      expect(
        violations(
          `const A=({hideStyles,display,rest,visibility})=><a href="x" target="_blank"><span style=${style}>Go</span> <NewTabHint /></a>;`,
        ),
        `must accept, an unreadable style object is opaque: ${style}`,
      ).toEqual([]);
    }
    // ...and the near-misses stay accepted, including two the previous version got WRONG.
    for (const style of [
      // A React style key is a JavaScript property name, NOT a CSS one: React emits
      // `-d-i-s-p-l-a-y:NONE` for this, which styles nothing (measured). Folding the key's case
      // reported valid markup -- and an earlier fixture here asserted the false positive was
      // correct, so the fixture was wrong too (review R33 HIGH 8).
      '{{"DISPLAY": "NONE"}}',
      // A later write wins, so this is visible.
      '{{display: "none", ...(true ? {display: "block"} : {})}}',
      '{{backfaceVisibility: "hidden"}}',
      '{{display: "block"}}',
      '{{display: pick("none")}}',
      '{{visibility: "visible"}}',
    ]) {
      expect(
        violations(
          `const A=({pick})=><a href="x" target="_blank"><span style=${style}>Go</span> <NewTabHint /></a>;`,
        ),
        `must accept: ${style}`,
      ).toEqual([]);
    }
    // A CSS class list is TOKENS. `\b(hidden|invisible)\b` treated a hyphen as a boundary, so
    // `overflow-hidden` -- one of the most common utilities in this codebase -- reported a fully
    // visible announcement. None of these hide.
    for (const cls of [
      "overflow-hidden",
      "not-hidden",
      "peer-invisible",
      "flex overflow-hidden rounded",
      "overflow-x-hidden",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span className="${cls}"><NewTabHint /></span></a>;`,
        ),
        `must accept, no hiding TOKEN: ${cls}`,
      ).toEqual([]);
    }
    // ...and the ones that really do hide, including Tailwind VARIANT prefixes (conditional hiding
    // still fails closed) and a dynamic value.
    for (const cls of [
      '"hidden"',
      '"invisible"',
      '"flex hidden rounded"',
      '"md:hidden"',
      '"group-hover:invisible"',
      '{hide ? "hidden" : ""}',
    ]) {
      const attr = cls.startsWith("{") ? `className=${cls}` : `className=${cls}`;
      reports(
        `const A=({hide})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        /hidden from the accessible name|cannot be proven non-hiding/,
        `class list hides: ${cls}`,
      );
    }
    // A DYNAMIC class list on the DESTINATION side. The hint-path rule reports a non-literal
    // className independently, so a fixture on that side cannot tell whether `classNameHides`'s
    // dynamic fallback did anything -- this one can, because no other rule covers it.
    reports(
      'const A=({hide})=><a href="x" target="_blank"><span className={hide ? "hidden" : ""}>Go</span> <NewTabHint /></a>;',
      /only visible content is the announcement/,
      "a dynamic class list on the destination fails closed",
    );
    // ...and the hyphenated false positive must stay accepted on that side too.
    expect(
      violations(
        'const A=({flag})=><a href="x" target="_blank"><span className={flag ? "overflow-hidden" : ""}>Go</span> <NewTabHint /></a>;',
      ),
      "must accept: overflow-hidden is not a hiding token even when dynamic",
    ).toEqual([]);
    // R33 (found from the reviewer's probe trail, before its verdict): React DROPS any value that
    // provably produces a boolean or undefined, so these hide nothing and must not be reported.
    for (const attr of [
      "popover={void 0}",
      "popover={a === b}",
      "popover={!x}",
      "popover={cond ? true : false}",
      "popover={x instanceof Date}",
      // Both branches nullish, so the value is undefined either way and React omits the attribute.
      "popover={cond ? null : undefined}",
      "popover={cond ? void 0 : null}",
      "inert={void 0}",
      "hidden={void 0}",
      // Both branches nullish: undefined either way, so React omits it. This pins the shared
      // `isProvablyNullish` conditional arm -- the `popover` path cannot, because `reactOmitsValue`
      // has a conditional arm of its own and reaches the same verdict without it.
      "hidden={cond ? null : undefined}",
      "inert={cond ? void 0 : null}",
    ]) {
      expect(
        violations(
          `const A=({a,b,x,cond})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, React drops a boolean/undefined attribute value: ${attr}`,
      ).toEqual([]);
    }
    // `hidden`/`inert` are BOOLEAN attributes, where the two booleans differ: `hidden={true}` renders
    // `hidden=""` and hides. So an always-boolean expression is UNDECIDABLE there and must fail
    // closed -- the opposite of `popover`, where React drops either boolean. Same word, two rules.
    for (const attr of ["hidden={a === b}", "inert={!x}"]) {
      reports(
        `const A=({a,b,x})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        /hidden from the accessible name/,
        `a boolean attribute hides when the boolean is true: ${attr}`,
      );
    }
    // ...but a value that REACHES the DOM still hides, so the rule did not become a blanket accept.
    for (const attr of ['popover={cond ? "auto" : "manual"}', 'popover={`au${"to"}`}']) {
      expect(
        violations(
          `const A=({cond})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must report, this value reaches the DOM: ${attr}`,
      ).not.toEqual([]);
    }
    // R33 BLOCKING 2: operand selection needs DECIDABLE, not merely "literal". Each left operand
    // below is definitely truthy, so `&&` yields the right operand, which carries no destination.
    for (const left of [
      "-1",
      "1n",
      "0x1n",
      "/re/",
      "typeof x",
      "(() => 1)",
      "function f(){}",
      "class K{}",
      "new Date()",
      "<span>x</span>",
      "<></>",
      "`a${x}`",
    ]) {
      reports(
        `const A=({x})=><a href="x" target="_blank">{${left} && <span aria-hidden="true">Go</span>} <NewTabHint /></a>;`,
        /only visible content is the announcement/,
        `definitely-truthy left operand selects the right: ${left}`,
      );
    }
    // R33 BLOCKING 3: a zero BigInt in ANY radix is falsy, so `||` selects the right operand, and
    // React omits a boolean attribute set to it.
    // `0_0n` is NOT valid: a numeric separator may not follow a leading zero, so that spelling was a
    // parse error and its fixture passed vacuously. `0x0_0n` exercises the separator path for real.
    for (const zero of ["0n", "0x0n", "0b0n", "0o0n", "0x0_0n"]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">{${zero} || <span aria-hidden="true">Go</span>} <NewTabHint /></a>;`,
        ),
        `must report, a zero BigInt is falsy: ${zero}`,
      ).not.toEqual([]);
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span hidden={${zero}}><NewTabHint /></span></a>;`,
        ),
        `must accept, React omits a boolean attribute set to a zero BigInt: ${zero}`,
      ).toEqual([]);
    }
    // R33 BLOCKING 5: values that stringify to something harmless must not be reported. Each of
    // these emits an attribute that is not "true" (or no attribute at all), all measured.
    for (const attr of [
      "aria-hidden={`${null}`}",
      "aria-hidden={`${undefined}`}",
      "aria-hidden={`${NaN}`}",
      "aria-hidden={`${0n}`}",
      "aria-hidden={`${-0}`}",
      'aria-hidden={null && "true"}',
      'aria-hidden={NaN && "true"}',
      'aria-hidden={flag ? "false" : "false"}',
      'aria-hidden={null ?? "false"}',
    ]) {
      expect(
        violations(
          `const A=({flag})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, this value is not "true": ${attr}`,
      ).toEqual([]);
    }
    // ...and the fail-open twin: an undecidable TEST does not make the VALUE undecidable when both
    // branches agree.
    expect(
      violations(
        'const A=({flag})=><a href="x" target="_blank"><span style={{display: flag ? "none" : "none"}}>Go</span> <NewTabHint /></a>;',
      ),
      "must report: both branches hide, so the test cannot matter",
    ).not.toEqual([]);
    expect(
      violations(
        'const A=({flag})=><a href="x" target="_blank">Go <span aria-hidden={flag ? "true" : "true"}><NewTabHint /></span></a>;',
      ),
      'must report: both branches are "true"',
    ).not.toEqual([]);

    // `open` is a BOOLEAN DOM attribute: any TRUTHY value renders `open=""` and the details really is
    // open, so the announcement inside is visible. Accepting only the literal `true` reported each of
    // these -- the same value-classification shape as `popover`, checked when R33 started reading the
    // rule rather than after it reported.
    for (const attr of [
      "open",
      "open={true}",
      'open="open"',
      "open={1}",
      "open={!false}",
      "open={[]}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <details ${attr}><NewTabHint /></details></a>;`,
        ),
        `must accept, the details is provably open: ${attr}`,
      ).toEqual([]);
    }
    // ...and anything falsy or undecidable still fails closed, since a closed details hides the hint.
    for (const attr of [
      "open={0}",
      'open=""',
      "open={void 0}",
      "open={cond}",
      "open={false}",
      "",
    ]) {
      reports(
        `const A=({cond})=><a href="x" target="_blank">Go <details ${attr}><NewTabHint /></details></a>;`,
        /hidden from the accessible name/,
        `the details may be closed: ${attr || "(no open attribute)"}`,
      );
    }
    // A namespace body and a class static block are `var` scopes in BOTH directions: R32 stopped the
    // downward scan entering them, but a use site INSIDE one is shadowed by a `var` in a sibling
    // block within it, and nothing scanned that scope -- a fail-open hole in the previous fix.
    for (const [label, body] of [
      [
        "var in a block inside the same namespace",
        'namespace N { if (1) { var NewTabHint = () => null; } export const A = () => <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "var in a nested block inside the same static block",
        'class C { static { { var NewTabHint = () => null; } const el = <a href="x" target="_blank">Go <NewTabHint /></a>; } }',
      ],
    ] as [string, string][]) {
      expect(
        probe('import { NewTabHint } from "@/components/shared/NewTabHint";\n' + body, {
          bare: true,
        }).violations,
        `must fail closed, the var hoists to this scope: ${label}`,
      ).not.toEqual([]);
    }
    // HIGH 7: the three falsy values that are not plain literals. React omits the attribute.
    for (const attr of [
      "hidden={-0}",
      "hidden={NaN}",
      "hidden={0n}",
      "inert={-0}",
      "inert={NaN}",
      "inert={0n}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, React omits the attribute: ${attr}`,
      ).toEqual([]);
    }
  });

  it("R31 expression containers holding JSX, hoisted var shadows, paren styles, SVG title", () => {
    const IMP = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
    const hid = '<span aria-hidden="true">Go</span>';
    // BLOCKING 2: `{<span aria-hidden="true">Go</span>}` renders byte-identical HTML to the same
    // element as a direct child (measured), so an expression container holding JSX is not opaque.
    // Each of these has NO destination once the aria-hidden element is discounted.
    for (const expr of [
      `{${hid}}`,
      `{[${hid}]}`,
      `{[, ${hid}]}`,
      `{<>${hid}</>}`,
      `{true ? ${hid} : "Go"}`,
      `{false ? "Go" : ${hid}}`,
      `{(${hid})}`,
    ]) {
      expect(
        violations(`const A=()=><a href="x" target="_blank">${expr} <NewTabHint /></a>;`),
        `must report, no destination inside the container: ${expr}`,
      ).not.toEqual([]);
    }
    // ...and the same containers holding REAL content still pass, so the rule is not a blanket
    // rejection of expression containers.
    for (const expr of [
      "{<span>Go</span>}",
      '{[<span key="k">Go</span>]}',
      "{<>Go</>}",
      "{label}",
    ]) {
      expect(
        violations(`const A=({label})=><a href="x" target="_blank">${expr} <NewTabHint /></a>;`),
        `must accept, the container carries a destination: ${expr}`,
      ).toEqual([]);
    }
    // BLOCKING 3: `var` is FUNCTION-scoped, so a declaration inside a block shadows a use site
    // OUTSIDE that block -- unreachable for an ancestor-only walk.
    for (const [label, body] of [
      [
        "var in an if-block, used after it",
        'function A(cond){ if(cond){ var NewTabHint = () => null; } return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "var in a for-initializer",
        'function A(xs){ for (var NewTabHint of xs) {} return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "var in a module-level block",
        '{ var NewTabHint = () => null; }\nconst A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;',
      ],
    ] as [string, string][]) {
      expect(
        probe(IMP + body, { bare: true }).violations,
        `must fail closed: ${label}`,
      ).not.toEqual([]);
    }
    // Declarations that CANNOT reach the use site must not be reported. R32 HIGH 6: the first
    // version counted a block-level `function` declaration as a shadow, calling that "stricter than
    // the language" -- but these files are ES modules, so strict mode makes it block-scoped and it
    // never reaches a use site outside its block. Deliberate strictness is not a defence when it
    // rejects code an author would reasonably write.
    for (const [label, body] of [
      [
        "var in a nested function",
        'function A(){ function inner(){ var NewTabHint = () => null; return NewTabHint; } return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "block-level function declaration (block-scoped in a module)",
        'function A(cond){ if(cond){ function NewTabHint(){ return null; } } return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "block-level function declaration at module level",
        '{ function NewTabHint(){ return null; } }\nconst A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;',
      ],
      [
        "var inside a namespace body",
        'namespace N { var NewTabHint = () => null; }\nconst A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;',
      ],
      [
        "var inside a class static block",
        'class C { static { var NewTabHint = () => null; } }\nconst A = () => <a href="x" target="_blank">Go <NewTabHint /></a>;',
      ],
      // `let` and `const` are BLOCK-scoped, so a sibling block cannot shadow the use site. Only
      // `var` hoists to the function scope -- without this pair the hoist scan could treat every
      // block-scoped declaration as a shadow and nothing would fail.
      [
        "const in a sibling block",
        'function A(cond){ if(cond){ const NewTabHint = () => null; } return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "let in a sibling block",
        'function A(cond){ if(cond){ let NewTabHint = () => null; } return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
    ] as [string, string][]) {
      expect(
        probe(IMP + body, { bare: true }).violations,
        `must ACCEPT, the declaration cannot reach the use site: ${label}`,
      ).toEqual([]);
    }
    // BLOCKING 4: parentheses are transparent to the VALUE, and React emits display:none.
    for (const style of [
      '{{display: ("none")}}',
      '{{display: (("none"))}}',
      "{{display: (`none`)}}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank"><span style=${style}>Go</span> <NewTabHint /></a>;`,
        ),
        `must report, the destination is display:none: ${style}`,
      ).not.toEqual([]);
    }
    // Stripping parens must not MANUFACTURE a match: the value here is a call, not the keyword.
    expect(
      violations(
        'const A=({pick})=><a href="x" target="_blank"><span style={{display: pick("none")}}>Go</span> <NewTabHint /></a>;',
      ),
      'a call whose ARGUMENT is "none" is not display:none',
    ).toEqual([]);
    // HIGH 5: an SVG <title> stays in the tree and NAMES the graphic (measured "Go (opens in a new
    // tab)"), so it is a real destination -- reporting it was a false positive.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank"><svg><title>Go</title></svg> <NewTabHint /></a>;',
      ),
      "an SVG title is a destination",
    ).toEqual([]);
    // ...but ONLY as a DIRECT child of the <svg>. Per SVG-AAM an <svg> takes its name from its own
    // direct-child <title>; a deeper one names its nearest graphics container, not the anchor. An
    // "svg anywhere above me" test was a fail-OPEN hole here (all four measured).
    for (const [label, markup] of [
      ["g", "<svg><g><title>Go</title></g></svg>"],
      ["div", "<svg><div><title>Go</title></div></svg>"],
      ["p", "<svg><p><title>Go</title></p></svg>"],
      ["nested svg wrapper", "<svg><g><svg /></g><g><title>Go</title></g></svg>"],
    ] as [string, string][]) {
      expect(
        violations(`const A=()=><a href="x" target="_blank">${markup} <NewTabHint /></a>;`),
        `must report, a <title> under <${label}> names nothing`,
      ).not.toEqual([]);
    }
    // "Direct child" is a RUNTIME relationship: an expression container, a fragment and an array all
    // render the title as the svg's own child, and all NAME (measured). A literal parent-node test
    // reported each -- the false-positive twin of the ancestor walk it replaced.
    for (const [label, markup] of [
      ["expression container", "<svg>{<title>Go</title>}</svg>"],
      ["fragment", "<svg><><title>Go</title></></svg>"],
      ["array", '<svg>{[<title key="t">Go</title>]}</svg>'],
    ] as [string, string][]) {
      expect(
        violations(`const A=()=><a href="x" target="_blank">${markup} <NewTabHint /></a>;`),
        `must accept, the title still renders as the svg's own child: ${label}`,
      ).toEqual([]);
    }
    // ...and inside a <foreignObject> the content is HTML again and React hoists the title out of
    // the anchor entirely (also measured), so it names nothing either.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank"><svg><foreignObject><title>Go</title></foreignObject></svg> <NewTabHint /></a>;',
      ),
      "a title inside foreignObject is hoisted and names nothing",
    ).not.toEqual([]);
    // An aria-hidden <svg> hides its own title, so the destination is gone again.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank"><svg aria-hidden="true"><title>Go</title></svg> <NewTabHint /></a>;',
      ),
      "an aria-hidden svg hides its title",
    ).not.toEqual([]);
    // HIGH 6: React OMITS an attribute whose value is falsy, so its presence hides NOTHING. Each of
    // these renders a fully visible announcement (all measured) and must not be reported.
    for (const attr of [
      "hidden={undefined}",
      "hidden={null}",
      "hidden={false}",
      "hidden={0}",
      'hidden={""}',
      "popover={false}",
      "popover={undefined}",
      "popover={null}",
      // Bare `popover` IS `popover={true}`, and React omits a boolean from an enumerated attribute.
      "popover",
      "popover={true}",
      "inert={false}",
      "inert={undefined}",
      "aria-hidden={undefined}",
      "aria-hidden={null}",
      "aria-hidden={0}",
      "aria-hidden={false}",
      'aria-hidden="false"',
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, React omits the attribute or it does not hide: ${attr}`,
      ).toEqual([]);
    }
    // ...and the hiding spellings still hide, so the fix did not open a hole.
    for (const attr of [
      "hidden",
      "hidden={true}",
      'hidden="false"',
      'popover="auto"',
      // Enumerated, not boolean: every value React PRESERVES starts hidden, empty string included.
      'popover=""',
      "popover={0}",
      "popover={1}",
      'popover="bogus"',
      "inert",
      "aria-hidden",
      'aria-hidden="true"',
      "aria-hidden={true}",
      "aria-hidden={flag}",
      // Folded case and trimmed: STRICTER than the harness on purpose. dom-accessibility-api hides
      // only on the exact lowercase "true" (measured in the behaviour suite), but a browser may fold
      // an enumerated ARIA value, and an unannounced link costs more than a reported valid one.
      'aria-hidden="TRUE"',
      'aria-hidden="True"',
      'aria-hidden=" true "',
    ]) {
      reports(
        `const A=({flag})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        /hidden from the accessible name/,
        `the announcement is hidden: ${attr}`,
      );
    }
  });

  it("R29 loop and named-function shadows, literal booleans, and <rp>", () => {
    const IMP = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
    // Two more shadowing forms the scope walk missed. Both type-check cleanly.
    for (const [label, body] of [
      [
        "for-of binding",
        'function A({hints}){ for (const NewTabHint of hints) { return <a href="x" target="_blank">Go <NewTabHint /></a>; } return null; }',
      ],
      [
        "named function expression",
        'const A = function NewTabHint(){ return <a href="x" target="_blank">Go <NewTabHint /></a>; };',
      ],
    ] as [string, string][]) {
      expect(
        probe(IMP + body, { bare: true }).violations,
        `must fail closed: ${label}`,
      ).not.toEqual([]);
    }
    const hid = '<span aria-hidden="true">Go</span>';
    for (const src of [
      // `!true` is `false`, which renders nothing.
      `const A=()=><a href="x" target="_blank">${hid} {!true} <NewTabHint /></a>;`,
      // A LITERAL test picks the branch, so requiring both branches empty was too weak.
      `const A=()=><a href="x" target="_blank">${hid} {true ? null : "Dest"} <NewTabHint /></a>;`,
      // `<rp>` is display:none per the HTML Standard's hidden-elements rules, both as a label
      // and as a hint wrapper.
      'const A=()=><a href="x" target="_blank"><rp>Go</rp> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">Go <rp><NewTabHint /></rp></a>;',
      // SWEEP-FOUND, not review-found: a component NESTED inside the anchor is as untrusted as
      // the anchor being one. No test covered this until a mutation sweep showed the clause was
      // not load-bearing.
      'const A=()=><a href="x" target="_blank">Go <Wrapper><NewTabHint /></Wrapper></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    for (const src of [
      // The literal test picking the OTHER branch yields a real destination.
      `const A=()=><a href="x" target="_blank">${hid} {true ? "Dest" : null} <NewTabHint /></a>;`,
      // SWEEP-FOUND: a comma expression evaluates to its RIGHT operand, so a hint there DOES
      // render. Only the left-operand case was pinned, which left this clause unverified.
      'const A=()=><a href="x" target="_blank">Go {(null, <NewTabHint />)}</a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R28 the binding must hold AT THE USE SITE, not merely exist in the file", () => {
    const IMP = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
    // An import in the file proves nothing if an enclosing scope shadows it, and both of these
    // type-check cleanly. Every idiomatic shadowing form a React component would use:
    for (const [label, body] of [
      [
        "function-scope const",
        'function A(){ const NewTabHint = () => null; return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
      ],
      [
        "arrow-body const",
        'const A = () => { const NewTabHint = () => null; return <a href="x" target="_blank">Go <NewTabHint /></a>; };',
      ],
      [
        "destructured parameter",
        'const A = ({ NewTabHint }) => <a href="x" target="_blank">Go <NewTabHint /></a>;',
      ],
      [
        "destructured const",
        'const A = (p) => { const { NewTabHint } = p; return <a href="x" target="_blank">Go <NewTabHint /></a>; };',
      ],
    ] as [string, string][]) {
      expect(
        probe(IMP + body, { bare: true }).violations,
        `must fail closed: ${label}`,
      ).not.toEqual([]);
    }
    // An ALIASED destructure binds a different name, so it is not a shadow.
    expect(
      probe(
        IMP +
          'const A = ({ NewTabHint: other }) => <a href="x" target="_blank">Go <NewTabHint /></a>;',
        { bare: true },
      ).violations,
      "an aliased destructure binds `other`, not the hint",
    ).toEqual([]);
    // An unrelated local declaration is not a shadow.
    expect(
      probe(
        IMP + 'const A = ({ label }) => <a href="x" target="_blank">{label} <NewTabHint /></a>;',
        {
          bare: true,
        },
      ).violations,
      "an unrelated destructure is not a shadow",
    ).toEqual([]);
  });

  it('aria-hidden="false" is VISIBLE at the SCANNER level', () => {
    // Found by a systematic mutation sweep, not by a review round: removing the
    // `aria-hidden="false"` exemption changed no test in this file. The behavioural suite pins
    // what the HARNESS computes; this pins what the SCANNER decides, and those are different
    // assertions. The casing sweep could not catch it either -- both spellings shift together,
    // so same-verdict parity still holds.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span aria-hidden="false"><NewTabHint /></span></a>;',
      ),
      'aria-hidden="false" does not hide, so the hint still announces',
    ).toEqual([]);
    // A STRING "false" is ALSO visible for aria-hidden, which is where it differs from the
    // native boolean `hidden`. Measured: both compute "Go (opens in a new tab)". My first version
    // of this test asserted the opposite and the test caught me -- the fourth assertion of mine
    // this PR that encoded belief rather than behaviour.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span aria-hidden={"false"}><NewTabHint /></span></a>;',
      ),
      'aria-hidden={"false"} is a valid ARIA false, unlike the native boolean `hidden`',
    ).toEqual([]);
    // The truthy spellings DO hide, so the exemption must be narrow.
    for (const v of ['"true"', "{true}"]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span aria-hidden=${v}><NewTabHint /></span></a>;`,
        ),
        `aria-hidden=${v} must hide`,
      ).not.toEqual([]);
    }
  });

  it("R28 whitespace spread, template-literal styles, and a bounded visibility match", () => {
    const hid = '<span aria-hidden="true">Go</span>';
    for (const src of [
      // TRIMMED, matching the ordinary-string rule: `length === 0` let a whitespace-only spread
      // through while `{" "}` was correctly rejected -- one fact decided two ways.
      `const A=()=><a href="x" target="_blank">${hid}{[..." "]} <NewTabHint /></a>;`,
      // A template literal is not a quote, so `display: \`none\`` slipped past a quote-only strip.
      'const A=()=><a href="x" target="_blank"><span style={{ display: `none` }}>Go</span> <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    // And the mirror error: `visibility` matched INSIDE `backfaceVisibility`, manufacturing a
    // violation on a property that hides nothing.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank"><span style={{ backfaceVisibility: "hidden" }}>Go</span> <NewTabHint /></a>;',
      ),
      "backfaceVisibility must not be read as visibility",
    ).toEqual([]);
  });

  it("R28 a real next/link needs the duplicate fold too", () => {
    // next/link forwards BOTH spellings to an intrinsic anchor and React keeps the LAST, so the
    // announcement is silently dropped. The fold applies to a verified Link binding but NOT to
    // an arbitrary component, whose props really are case-sensitive JS keys.
    expect(
      probe(
        'import Link from "next/link";\nconst A=()=><Link href="x" target="_blank" aria-label="Go (opens in a new tab)" ARIA-LABEL="Go">Go</Link>;',
        { bare: true },
      )
        .violations.map((v) => v.reason)
        .join(" "),
      "a real Link with folded duplicates must be reported",
    ).toMatch(/case-folding/);
    expect(
      violations(
        'const A=()=><UI.Link href="x" target="_blank" Mode="a" mode="b">Go</UI.Link>;',
      ).join(" "),
      "an arbitrary component's props must NOT be folded",
    ).not.toMatch(/case-folding/);
  });

  it("R27 the import-binding check, at its edges", () => {
    const A = 'const A=()=><a href="x" target="_blank">Go <NewTabHint /></a>;';
    // Accepted: the direct named import, and a relative path ending in the module path.
    expect(
      probe('import { NewTabHint } from "@/components/shared/NewTabHint";\n' + A, { bare: true })
        .violations,
      "the direct named import is the approved shape",
    ).toEqual([]);
    expect(
      probe('import { NewTabHint } from "../shared/components/shared/NewTabHint";\n' + A, {
        bare: true,
      }).violations,
      "a relative path ending in the module path is the same module",
    ).toEqual([]);
    // ACCEPTED LIMIT, stated rather than discovered later: a NAMESPACE or ALIASED import of the
    // real component is reported. Both are legitimate code, and both fail CLOSED -- the tag
    // spelling no longer matches `NewTabHint`, so the hint is not recognised at all. No live
    // file uses either form; an author who wants one adds a reasoned exemption or uses the
    // direct named import.
    for (const [label, src] of [
      [
        "namespace import",
        'import * as S from "@/components/shared/NewTabHint";\nconst A=()=><a href="x" target="_blank">Go <S.NewTabHint /></a>;',
      ],
      [
        "aliased import",
        'import { NewTabHint as Hint } from "@/components/shared/NewTabHint";\nconst A=()=><a href="x" target="_blank">Go <Hint /></a>;',
      ],
      ["wrong module", 'import { NewTabHint } from "./elsewhere";\n' + A],
      ["no import at all", A],
    ] as [string, string][]) {
      expect(probe(src, { bare: true }).violations, `must fail closed: ${label}`).not.toEqual([]);
    }
  });

  it("R26 hint discovery is an ALLOWLIST of render positions", () => {
    const a = (e: string): string => `const A=()=><a href="x" target="_blank">Go ${e}</a>;`;
    // Positions that DISCARD the element. Listing these was unbounded -- R25 supplied three and
    // probing found six more -- so the walk now enumerates what RENDERS instead, and everything
    // absent from that list fails closed.
    for (const src of [
      a("{({ h: <NewTabHint /> })}"), // object-literal property
      a("{`${(<NewTabHint />)}`}"), // template substitution stringifies it
      a("{void <NewTabHint />}"),
      a("{typeof <NewTabHint />}"),
      a("{!<NewTabHint />}"),
      a("{(<NewTabHint />).props}"), // property access
      a("{drop(<NewTabHint />)}"), // call argument: the callee decides
      a("{(<NewTabHint />, null)}"), // comma yields the LAST operand
      // These four were never enumerated anywhere -- the allowlist rejects them BY
      // CONSTRUCTION, which is the property that makes it the right model rather than a
      // longer list. Each hands the element to a callee that decides whether to render it.
      a("{tag`${(<NewTabHint />)}`}"), // a tagged template's function decides
      a("{React.createElement(C, null, <NewTabHint />)}"), // a call argument
      a("{<C {...{ children: <NewTabHint /> }} />}"), // children via a spread attribute
      a("{({ get x() { return <NewTabHint />; } }).x}"), // a getter body
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    // Positions that DO render. If the allowlist ever loses one of these the guard starts
    // reporting correct code, which is the failure mode an allowlist risks.
    for (const src of [
      a("<NewTabHint />"),
      a("{(<NewTabHint />)}"),
      a("{[<NewTabHint />]}"), // arrays render every element
      a("{<><NewTabHint /></>}"),
      a("<span><NewTabHint /></span>"),
      a("{(<NewTabHint /> as JSX.Element)}"),
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R25 non-render positions: nullish, call argument, comma, and empty name attributes", () => {
    for (const src of [
      // `a ?? b` renders `b` only when `a` is nullish.
      'const A=({x})=><a href="x" target="_blank">Go {x ?? <NewTabHint />}</a>;',
      // A hint passed as a CALL ARGUMENT is the callee's to render, like a JSX attribute.
      'const A=()=><a href="x" target="_blank">Go {drop(<NewTabHint />)}</a>;',
      // A comma expression evaluates to its LAST operand.
      'const A=()=><a href="x" target="_blank">Go {(<NewTabHint />, null)}</a>;',
      // Statically-empty expression forms that fell through: spread of an empty array, an
      // array HOLE, and `void 0`.
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {[...[]]} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {[,]} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {void 0} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    for (const src of [
      // A component is opaque and a dynamic `alt` may name something, so both still pass.

      'const A=({t})=><a href="x" target="_blank"><img alt={t} /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><img alt="Go" /> <NewTabHint /></a>;',
      // MEASURED: an input's value DOES contribute, so omitting `value` was a false positive.
      // R26b's SYMMETRY point is now moot in the accept direction: since R28 neither the paired
      // nor the self-closing form counts, so they agree by being equally rejected. The symmetry
      // itself is pinned in the R28 block above, where both are must-report.
      // A spread inside an array IS a render position; the walker visited it without unwrapping.
      'const A=()=><a href="x" target="_blank">Go {[...[<NewTabHint />]]}</a>;',
      // A KNOWN link tag is trusted, because rendering its children is the contract that makes
      // it a link component. Without this split the posture would report every `<Link>` anchor.
      // The Link import is part of the fixture now: R27 made the BINDING load-bearing, so a
      // file that merely spells `Link` is not trusted to render its children.
      'import Link from "next/link";\nconst A=()=><Link href="x" target="_blank">Go <NewTabHint /></Link>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R24 a hint that may not render is not an announcement", () => {
    for (const src of [
      // `a || b` yields `a` when truthy, so this renders NO hint.
      'const A=()=><a href="x" target="_blank">Go {true || <NewTabHint />}</a>;',
      // A hint inside a callback is not proof one renders: the collection may be empty.
      'const A=({e,xs})=><a href="x" {...(e?{target:"_blank"}:{})}>Go {e && xs.map(() => <NewTabHint />)}</a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    for (const src of [
      'const A=()=><a href="x" target="_blank">Go <NewTabHint /></a>;',
      'const A=({e})=><a href="x" {...(e?{target:"_blank"}:{})}>Go {e && <NewTabHint />}</a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R24 a wrapper whose only content is the hint carries no destination", () => {
    for (const src of [
      'const A=()=><a href="x" target="_blank"><span> <NewTabHint /></span></a>;',
      'const A=()=><a href="x" target="_blank"><input type="hidden" value="Go" /> <NewTabHint /></a>;',
      // These were asserted ACCEPTED until R25, wrongly: a bare void element contributes no
      // accessible name at all, so the anchor computes to the phrase alone. `<img alt="">` is
      // the same shape -- an EMPTY alt is explicitly "no name", not "some name".
      'const A=()=><a href="x" target="_blank"><input type="text" /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><br /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><img alt="" /> <NewTabHint /></a>;',
      // MEASURED: a `title` attribute is only a name FALLBACK, so it contributes nothing when
      // the anchor has content. Treating it as a destination was a fail-open.
      'const A=()=><a href="x" target="_blank"><span title="Go" /> <NewTabHint /></a>;',
      // POSTURE CHANGED at R26b, deliberately. A component's children are a PROP it may
      // discard -- `<Drop>Go</Drop>` renders nothing when `Drop` returns null -- so trusting a
      // component to supply a destination is a fail-open, and these two cases were previously
      // pinned as must-ACCEPT. Failing closed is chosen because no live anchor takes its label
      // from a component (all 23 use literal text; components appear only as aria-hidden
      // icons), so the strictness costs nothing today and a legitimate future case takes one
      // reasoned exemption.
      'const A=()=><a href="x" target="_blank"><Label /> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><Drop>Go</Drop> <NewTabHint /></a>;',
      // The ANCHOR itself being an arbitrary component is the same fact one level up: it may
      // discard the children it was handed.
      'const A=()=><External target="_blank">Go <NewTabHint /></External>;',
      // `alt` only names the elements it applies to.
      'const A=()=><a href="x" target="_blank"><br alt="Go" /> <NewTabHint /></a>;',
      // A dangling `aria-labelledby` names nothing, and the target is unresolvable statically.
      'const A=()=><a href="x" target="_blank"><img aria-labelledby="missing" /> <NewTabHint /></a>;',
      // Attribute VALUES for `type` are case-insensitive in the DOM.
      'const A=()=><a href="x" target="_blank"><input type="HIDDEN" value="Go" /> <NewTabHint /></a>;',
      // Falsiness and renders-nothing are ORTHOGONAL: an object is truthy but renders nothing,
      // and an array renders the concatenation of its elements.
      'const A=()=><a href="x" target="_blank">{({}) && null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{[null]} <NewTabHint /></a>;',
      // `[] && null` distinguishes the array-truthy clause: an array is TRUTHY however empty,
      // so the result is `null` and nothing renders. Without that clause the left operand is
      // "unknown" and this is wrongly accepted -- a mutation showed no test could tell.
      'const A=()=><a href="x" target="_blank">{[] && null} <NewTabHint /></a>;',
      // `||` and `??` were missing entirely -- found by probing the OPERATOR SURFACE after R24
      // rather than by a review round, which is what acting on §6.4's own replace-don't-extend
      // trigger looks like.
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {false || null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {true || "D"} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {null ?? false} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    for (const src of [
      'const A=()=><a href="x" target="_blank"><span>Go</span> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span><b>Go</b></span> <NewTabHint /></a>;',

      // `[]` is TRUTHY, so this yields "Dest" -- the earlier rule manufactured a violation.
      'const A=()=><a href="x" target="_blank">{[] && "Dest"} <NewTabHint /></a>;',
      // `0` is falsy but RENDERS, so `0 && null` yields "0".
      'const A=()=><a href="x" target="_blank">{0 && null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{false || "Dest"} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{null ?? "Dest"} <NewTabHint /></a>;',
      // `??` tests NULLISH, not falsiness: `0 ?? "D"` yields 0, which renders.
      'const A=()=><a href="x" target="_blank">{0 ?? "D"} <NewTabHint /></a>;',
      'const A=({d})=><a href="x" target="_blank">{d || "Dest"} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R23 tag-based hiding covers both HTML categories, not a hand-grown list", () => {
    // Probing after R22 found five MORE fail-opens of the same shape, so the rule is stated
    // from the HTML Standard's categories instead of extended one finding at a time:
    // content-never-rendered, and not-shown-unless-open.
    const hintIn = (tag: string, attrs = ""): string =>
      `const A=()=><a href="x" target="_blank">Go <${tag}${attrs}><NewTabHint /></${tag}></a>;`;
    const labelIn = (tag: string): string =>
      `const A=()=><a href="x" target="_blank"><${tag}>Go</${tag}> <NewTabHint /></a>;`;
    // A hint inside a non-rendered or not-yet-open element is not announced.
    for (const src of [
      hintIn("dialog"),
      hintIn("template"),
      hintIn("script"),
      hintIn("noscript"),
    ]) {
      expect(violations(src), `must report hidden hint: ${src}`).not.toEqual([]);
    }
    // A label inside one contributes nothing, so the name is the phrase alone.
    for (const tag of ["script", "style", "noscript", "datalist", "template"]) {
      expect(violations(labelIn(tag)), `must report phrase-only label in <${tag}>`).not.toEqual([]);
    }
    // An open dialog shows its content.
    expect(violations(hintIn("dialog", " open")), "an open dialog must be accepted").toEqual([]);
    // And the `style` ATTRIBUTE is unaffected by `<style>` being a hiding TAG -- the two share
    // a spelling, which is what made the guard's own classification ambiguous until the
    // metadata tags were dropped.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span style="color:red"><NewTabHint /></span></a>;',
      ),
      "a literal non-hiding style attribute must be accepted",
    ).toEqual([]);
  });

  it("R22 an expression that provably renders nothing is not a destination", () => {
    // The separator itself was the witness: `{" "}` satisfies the space rule AND used to
    // satisfy the destination rule, so a hidden label plus a separator plus the hint passed.
    for (const src of [
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span>{" "}<NewTabHint /></a>;',
      'const A=({c})=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {c ? null : null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {false && "Dest"} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {true} <NewTabHint /></a>;',
      // An empty array renders nothing; a non-empty one may render anything.
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {[]} <NewTabHint /></a>;',
      // A BARE object literal child. Pinned because a mutation sweep showed the objectLiteral
      // branch of rendersNothing was never exercised: every earlier case had the object as the
      // LEFT operand of `&&`, which isLiteralTruthy handles instead. Note React actually THROWS
      // on an object child (R26b), so this verdict is about broken code, and reporting it is the
      // right answer either way.
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> {({})} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report: ${src}`).not.toEqual([]);
    }
    // A conditional or && whose branches CAN render text is still a destination -- the
    // predicate must prove emptiness, not assume it.
    for (const src of [
      'const A=({c})=><a href="x" target="_blank">{c ? "A" : "B"} <NewTabHint /></a>;',
      'const A=({c})=><a href="x" target="_blank">{c && "A"} <NewTabHint /></a>;',
      'const A=({c,l})=><a href="x" target="_blank">{c ? l : null} <NewTabHint /></a>;',
      // `{c && null}` was asserted REPORTED until R23. With a DYNAMIC left operand it is not
      // provably empty at all: `a && b` evaluates to `a` when `a` is falsy, and `0 && null`
      // renders the character "0". Emptiness must be proved, and here it cannot be.
      'const A=({c})=><a href="x" target="_blank">{c && null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{0 && null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{[<b key="1">Go</b>]} <NewTabHint /></a>;',
      // `{0}` renders the character "0", so it IS a destination.
      'const A=()=><a href="x" target="_blank">{0} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R21 a phrase-only accessible name is reported", () => {
    // The guard checked whether the HINT was visible, never whether the LABEL still was.
    // Both installed accessible-name implementations compute "(opens in a new tab)" alone
    // for these -- strictly worse than no announcement, since the link stops saying where
    // it goes. The aria-label path already had this rule; the content path did not.
    for (const src of [
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">Go</span> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span className="hidden">Go</span> <NewTabHint /></a>;',
      // An EMPTY expression contributes nothing to the name. Found by mutation: dropping the
      // `child.expression` check changed no test, which meant nothing covered this and the
      // clause could have rotted into a fail-open unnoticed.
      'const A=()=><a href="x" target="_blank">{/* icon later */} <NewTabHint /></a>;',
      // LITERAL expressions are not opaque, and treating them as such was a fail-open in the
      // first version of this rule: each of these computes to "(opens in a new tab)" alone.
      // Found by probing the rule after writing it.
      'const A=()=><a href="x" target="_blank">{" "}<NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{null} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{false} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{undefined} <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank">{""} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must report phrase-only: ${src}`).not.toEqual([]);
    }
    // Conservative in the direction that matters: an aria-hidden ICON beside a visible
    // label is the common real shape in this tree and must keep passing.
    for (const src of [
      'const A=()=><a href="x" target="_blank"><span>Go</span> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><span aria-hidden="true">B</span> Go <NewTabHint /></a>;',
      // An interpolated label is opaque, so it must be assumed to carry a destination
      // rather than manufacture a violation.
      'const A=({label})=><a href="x" target="_blank">{label} <NewTabHint /></a>;',
      // FALSE POSITIVES the first version of this rule produced, found by probing my own
      // fix rather than by review. It required literal TEXT, so a component child and an
      // image were both read as "no destination". A component renders text this scanner
      // cannot see, and an `<img alt>` contributes its alt to the computed name.

      'const A=()=><a href="x" target="_blank"><img alt="Go" /> <NewTabHint /></a>;',
      // Nested and fragment-wrapped labels must also survive.
      'const A=()=><a href="x" target="_blank"><span><b>Go</b></span> <NewTabHint /></a>;',
      'const A=()=><a href="x" target="_blank"><>Go</> <NewTabHint /></a>;',
      // A literal STRING with content is a destination, so evaluating literals must not
      // over-reject; only whitespace-or-nothing literals count as absent.
      'const A=()=><a href="x" target="_blank">{"Go"} <NewTabHint /></a>;',
    ]) {
      expect(violations(src), `must accept: ${src}`).toEqual([]);
    }
  });

  it("R18/R19 nameShapedLiterals sees literal-bearing forms, and provably not others", () => {
    // TITLE CORRECTED at R19. This used to claim the helper "is blind to reading FORM", which
    // R19 disproved: a regex literal and an unquoted property key carry no string literal at
    // all, so it cannot see them. That claim is why the coverage guarantee moved to the
    // behavioural closed-list sweep, which reads no source. What this helper still does
    // usefully -- catch an accidental camelCase literal -- is bounded, and the bound is now
    // asserted below rather than described.
    //
    // Forms it DOES see: every one that contains the literal. R18's witness is the `.includes`
    // case; the const-bound Set is how `rel` was hidden from the position-based collector.
    const forms = [
      'if (n === "alpha") return true;',
      'if (["alpha"].includes(n)) return true;',
      'const K = "alpha"; if (n === K) return true;',
      'const S = new Set(["alpha"]); if (S.has(n)) return true;',
      'switch (n) { case "alpha": return true; }',
      'const m = { "alpha": 1 }; if (m[n]) return true;',
      'const m = new Map([["alpha", 1]]); if (m.has(n)) return true;',
      'const o = { k: "alpha" }; if (n === o.k) return true;',
      'export type T = "alpha";',
      "const t = `alpha`;",
    ];
    for (const src of forms) {
      expect(nameShapedLiterals(src), `must see the name in: ${src}`).toContain("alpha");
    }
    // Prose, messages and multi-word text are not name-shaped, so the exclusion list stays
    // small enough to be read. This is the whole reason the filter is shape and not position.
    for (const src of [
      'const msg = "unrecognized external-link shape (spread)";',
      'const msg = "opens in a new tab";',
      "const re = /alpha/;",
      'const s = "a".repeat(40);',
    ]) {
      expect(
        nameShapedLiterals(src).filter((s) => s.includes(" ")),
        `prose must not be collected from: ${src}`,
      ).toEqual([]);
    }
    // Forms it does NOT see, pinned as expectations so the limit cannot be forgotten or
    // overstated. All three were R19 findings against the previous coverage model; they are
    // harmless here only because coverage no longer depends on this helper.
    for (const src of [
      'if (n === "al" + "pha") return true;', // assembled from fragments
      "if (/^alpha$/.test(n)) return true;", // regex literal: no string literal at all
      "const M = { alpha: true }; if (M[n]) return true;", // unquoted property key
      "if (n === String.fromCharCode(97) + 'lpha') return true;", // runtime-built
    ]) {
      expect(nameShapedLiterals(src), `must NOT be claimed as seen: ${src}`).not.toContain("alpha");
    }
  });

  it("R15 commentRanges distinguishes comments from division, regex and templates", () => {
    const noComment = [
      "const x = a / b / c;", // division chain, not a comment
      "const r=/ab/; const y = c / d;", // regex then division
      'const A = <div>{"<!-- x -->"}</div>;', // an HTML comment inside a string
      "const t = `a //b ${x} c`;", // `//` inside a template with a substitution
    ];
    for (const src of noComment) {
      expect(commentRanges(src), `must find no comment in: ${src}`).toEqual([]);
      expect(stripCommentsSafely(src), `must not alter: ${src}`).toBe(src);
    }
    const hasComment = [
      "const x = a/b; //note",
      "const a=1; //note\r\nconst K=1;", // CRLF
      'const K="Keep"; /* never closed', // unterminated block: must terminate, not hang
    ];
    for (const src of hasComment) {
      expect(commentRanges(src).length, `must find a comment in: ${src}`).toBeGreaterThan(0);
      expect(stripCommentsSafely(src).length, "length must be preserved").toBe(src.length);
    }
  });

  it("R14 comment ranges: all JS line terminators, and a shebang is not a comment", () => {
    // A `//` comment ends at ANY line terminator. Stopping at LF alone blanked the rest of
    // the file, so a later `target =` or spread became invisible to the candidate net.
    for (const sep of ["\n", "\r", "\u2028", "\u2029"]) {
      const src = `const A=({dest})=><a href="x" target //c${sep} ={dest}>Go</a>;`;
      expect(admitsCandidate(src), `must admit across separator ${JSON.stringify(sep)}`).toBe(true);
    }
    // SAME CLASS, two more sites (R17 finding 2 + its class-sweep). LF-only handling has now
    // produced three separate findings, so every per-line operation is pinned across all four
    // terminators, not just the one that was reported.
    const anchorX = 'const A=()=><a href="x" target="_blank">Go</a>;';
    for (const sep of ["\n", "\r", "\u2028", "\u2029"]) {
      const s = JSON.stringify(sep);
      // (a) jsdoc decoration stripping. Splitting on LF alone left a bare `*` on the
      // continuation line, which was then mistaken for a reason -- so an exemption with NO
      // reason was honored, which is the whole thing the reason requirement exists to stop.
      // TWO decorative lines, deliberately: with an LF-only split the whole body is ONE
      // line, the single leading-decoration strip eats only the first `*`, and the second
      // one survives as a "reason". A single decorative line is strip-equivalent under both
      // and proves nothing -- the first version of this pin made exactly that mistake.
      expect(
        violations(`/**${sep} * ${EXEMPTION_TEXT}${sep} *${sep} *${sep} */${sep}${anchorX}`).length,
        `decoration-only exemption must NOT be honored across ${s}`,
      ).toBe(1);
      // And a real reason still is, so the fix did not simply reject everything.
      expect(
        violations(`/**${sep} * ${EXEMPTION_TEXT} legacy icon${sep} */${sep}${anchorX}`),
        `a real reason must still be honored across ${s}`,
      ).toEqual([]);
      // (b) the JSX whitespace model, which is a fail-open in the SHIPPED rule rather than
      // in the guard: JSX strips a trailing whitespace run containing ANY line terminator,
      // so the hint has no separator and the computed name is "Go(opens in a new tab)".
      expect(
        violations(`const A=()=><a href="x" target="_blank">Go${sep}<NewTabHint /></a>;`).length,
        `a ${s}-only separator is stripped by JSX and must be reported`,
      ).toBe(1);
      // Control, and a correction worth keeping: `Go ${sep}` is NOT accepted either, because
      // JSX strips the WHOLE trailing whitespace run once it contains a terminator -- the
      // space does not survive. What prettier actually emits across a line break is the
      // explicit `{" "}` form, and that is what must be accepted.
      expect(
        violations(`const A=()=><a href="x" target="_blank">Go ${sep}<NewTabHint /></a>;`).length,
        `space+${s} is one stripped run, so it must still be reported`,
      ).toBe(1);
      expect(
        violations(`const A=()=><a href="x" target="_blank">Go{" "}${sep}<NewTabHint /></a>;`),
        `an explicit {" "} then ${s} must be accepted`,
      ).toEqual([]);
      // The whitespace-ONLY-text-node branch: a stripped run must be walked THROUGH, not
      // treated as a space. Reachable only when adjacent content precedes it -- after a
      // `{" "}` both readings accept, so that shape cannot discriminate.
      expect(
        violations(`const A=()=><a href="x" target="_blank"><b>Go</b>${sep}<NewTabHint /></a>;`)
          .length,
        `a stripped ${s} run after adjacent content is not a space`,
      ).toBe(1);
    }

    // The skip must stop at the shebang's LINE END, not consume the file. Found by a mutation
    // sweep: replacing the search with `from = src.length` passed every test, because the
    // fixture below has no comment AFTER the shebang line for over-consumption to swallow.
    const afterShebang = "#!/usr/bin/env node\nconst a = 1; //note\nconst K = 1;";
    expect(
      commentRanges(afterShebang).length,
      "a comment AFTER the shebang line must still be found",
    ).toBeGreaterThan(0);
    // Asserted as PROPERTIES rather than a hardcoded string: my first version miscounted the
    // blanked spaces, which is exactly the hardcoding the anti-tautology rule warns about.
    const strippedAfter = stripCommentsSafely(afterShebang);
    expect(strippedAfter.length, "length is preserved").toBe(afterShebang.length);
    expect(strippedAfter.startsWith("#!/usr/bin/env node"), "the shebang survives").toBe(true);
    expect(strippedAfter.includes("//note"), "the later comment is blanked").toBe(false);
    expect(strippedAfter.includes("const K = 1;"), "code after it survives").toBe(true);

    // A shebang is not a comment, and its content can contain `//` (a URL).
    const shebang = "#!/usr/bin/env -S https://x.test/tool\nconst x=1;";
    expect(stripCommentsSafely(shebang)).toBe(shebang);
    // One implementation, so the exemption parser and the stripper cannot diverge: the
    // exemption parser had its own scanner loop and stayed bypassable after the stripper
    // was fixed.
    const src = readFileSync(join(process.cwd(), "tests/styles/_newTabScan.ts"), "utf8");
    const rawScannerLoops = (stripCommentsSafely(src).match(/ts\.createScanner\(/g) ?? []).length;
    expect(rawScannerLoops, "no raw scanner loop may remain outside commentRanges").toBe(0);
  });

  // R14 BLOCKING 1: an exemption comment sharing a line with a regex containing comment
  // bytes used to mis-locate, letting an unannounced anchor pass.
  // R15 question 2: the exemption parser was rewritten to derive line numbers from the
  // shared commentRanges(), so every attribution behaviour it had is re-pinned here.
  // R16 question 2, probed before the round reported: can the delimiter strip empty a
  // LEGITIMATE reason? Four shapes say no, and four empty shapes still fail to exempt.
  // R16 question 1, probed before the round reported. Two results surprised me and BOTH
  // were my expectation being wrong rather than a defect, so the real behaviour is pinned
  // here to stop a later round reading either as a hole.
  // R17 question 1, probed before the round reported: the positional-ownership edges.
  // R16 BLOCKING 1's actual witness, which had only been checked in a throwaway probe:
  // two exemptions on one line, then a COMPLIANT and a BROKEN anchor. The stale second
  // exemption must not rescue the broken one. Mutation testing surfaced that this was
  // unpinned, which is a better reason to add it than remembering to.
  it("R16 a stale exemption never rescues a later anchor", () => {
    const src =
      `// ${EXEMPTION_TEXT} r1\n// ${EXEMPTION_TEXT} r2\n` +
      'const A=()=><a href="x" target="_blank">Ok <NewTabHint /></a>;\n' +
      'const B=()=><a href="y" target="_blank">BROKEN</a>;';
    expect(
      violations(src).length,
      "the broken anchor must still be reported",
    ).toBeGreaterThanOrEqual(1);
    // And a LEADING same-line comment still owns the anchor that follows it, which line
    // arithmetic could not express at all.
    expect(
      violations(`/* ${EXEMPTION_TEXT} reason */ const C=()=><a href="x" target="_blank">Go</a>;`),
    ).toEqual([]);
  });

  it("R17 positional ownership handles inside-attrs, after-last, coincident and nested", () => {
    // A comment INSIDE the anchor's attribute list is not BEFORE the anchor, so it cannot
    // own it. Ownership is by position, which makes this fall out rather than need a rule.
    expect(
      violations(
        `const A=()=>(\n  <a\n    href="x"\n    // ${EXEMPTION_TEXT} reason\n    target="_blank"\n  >Go</a>\n);`,
      ).length,
    ).toBe(1);
    // An exemption after the last candidate owns nothing and must not throw.
    expect(
      violations(`const A=()=><a href="x" target="_blank">Go</a>;\n// ${EXEMPTION_TEXT} reason`)
        .length,
    ).toBe(1);
    // Comment end immediately abutting the anchor start still owns it.
    expect(
      violations(`/* ${EXEMPTION_TEXT} reason */const A=()=><a href="x" target="_blank">Go</a>;`),
    ).toEqual([]);
    // Two nested candidates, one exemption: only the first is exempt.
    expect(
      violations(
        `// ${EXEMPTION_TEXT} reason\nconst A=()=><Foo href="p" target="_blank"><a href="x" target="_blank">Go</a></Foo>;`,
      ).length,
    ).toBe(1);
  });

  it("R16 exemption ordering: adjacency, element-start lines, and JSX-expression comments", () => {
    const anchor = 'const A=()=><a href="x" target="_blank">One</a>;';
    // A block comment that STARTS above and ENDS on the anchor's line still exempts.
    expect(violations(`/* ${EXEMPTION_TEXT} reason\n   more */ ${anchor}`)).toEqual([]);
    // Two exemptions and two anchors interleaved: each claims its own.
    expect(
      violations(
        `// ${EXEMPTION_TEXT} r1\n${anchor}\n// ${EXEMPTION_TEXT} r2\nconst B=()=><a href="y" target="_blank">Two</a>;`,
      ),
    ).toEqual([]);
    // ADJACENCY IS REQUIRED, by design since the rule was written: a comment two lines
    // above does not reach the anchor. This is deliberate, not a gap -- widening it would
    // let a distant comment silence something unrelated.
    expect(
      violations(`// ${EXEMPTION_TEXT} reason\nconst spacer = 1;\n${anchor}`).length,
      "a non-adjacent comment must not exempt",
    ).toBe(1);
    // An anchor's line is its ELEMENT START, so a comment directly above `<a` works even
    // when `target` sits several lines lower.
    expect(
      violations(
        `const D=()=>(\n  // ${EXEMPTION_TEXT} reason\n  <a\n    href="x"\n    target="_blank"\n  >Go</a>\n);`,
      ),
    ).toEqual([]);
    // A comment inside a JSX expression container is a comment: it exempts the anchor it
    // precedes. There is nothing special about the container.
    expect(
      violations(
        `const C=()=>(<div>\n  {/* ${EXEMPTION_TEXT} reason */}\n  <a href="x" target="_blank">Go</a>\n</div>);`,
      ),
    ).toEqual([]);
  });

  // R17 question 2, probed before the round reported: can the jsdoc decoration strip empty
  // a LEGITIMATE reason? Bulleted and asterisk-bearing reasons all survive.
  it("R17 bulleted and asterisk reasons survive the jsdoc strip", () => {
    const anchor = 'const A=()=><a href="x" target="_blank">Go</a>;';
    const exempts = [
      `/**\n * ${EXEMPTION_TEXT} because\n * - item one\n */`, // dash bullets
      `/**\n * ${EXEMPTION_TEXT}\n * * star bullet\n */`, // reason IS a star bullet
      `// ${EXEMPTION_TEXT} *emphasis*`, // asterisks in prose
      `/**\n * ${EXEMPTION_TEXT} *\n */`, // a lone asterisk as the reason
    ];
    for (const c of exempts) {
      expect(violations(`${c}\n${anchor}`), `must exempt: ${c}`).toEqual([]);
    }
    // Decoration only, across several lines, is still not a reason.
    expect(violations(`/**\n * ${EXEMPTION_TEXT}\n *\n *\n */\n${anchor}`).length).toBe(1);
  });

  it("R16 delimiter stripping keeps real reasons and rejects empty ones", () => {
    const anchor = 'const A=()=><a href="x" target="_blank">One</a>;';
    const exempts = [
      `/* ${EXEMPTION_TEXT} legacy icon * */`, // reason ends in an asterisk
      `/**\n * ${EXEMPTION_TEXT} legacy icon\n */`, // jsdoc continuation line
      `/* ${EXEMPTION_TEXT} a*b*c */`, // inner asterisks
      `// ${EXEMPTION_TEXT} reason   `, // trailing whitespace
    ];
    for (const c of exempts) {
      expect(violations(`${c}\n${anchor}`), `must exempt: ${c}`).toEqual([]);
    }
    const doesNot = [
      `/* ${EXEMPTION_TEXT} */`,
      `/**\n * ${EXEMPTION_TEXT}\n */`,
      `// ${EXEMPTION_TEXT}`,
      `/* ${EXEMPTION_TEXT}    */`,
    ];
    for (const c of doesNot) {
      expect(violations(`${c}\n${anchor}`).length, `must NOT exempt: ${c}`).toBe(1);
    }
  });

  it("R15 exemption attribution survives the shared-helper rewrite", () => {
    const anchor = 'const A=()=><a href="x" target="_blank">Go</a>;';
    // A single-line exemption above the anchor exempts it.
    expect(violations(`// ${EXEMPTION_TEXT} reason\n${anchor}`)).toEqual([]);
    // A MULTI-LINE block comment attributes to its END line, so it still reaches the
    // anchor below it.
    expect(violations(`/* ${EXEMPTION_TEXT} reason\n   spanning lines */\n${anchor}`)).toEqual([]);
    // An exemption sharing a line with code still applies to the next anchor.
    expect(violations(`const q=1; // ${EXEMPTION_TEXT} reason\n${anchor}`)).toEqual([]);
    // ONE comment exempts ONE anchor: the second must still be reported.
    expect(
      violations(
        `// ${EXEMPTION_TEXT} reason\n${anchor}\nconst B=()=><a href="y" target="_blank">Go</a>;`,
      ).length,
      "one exemption must not cover two anchors",
    ).toBe(1);
    // A reasonless exemption is not an exemption.
    expect(violations(`// ${EXEMPTION_TEXT}\n${anchor}`).length).toBe(1);
  });

  it("R14 an exemption cannot be forged from a string after a regex", () => {
    // The phrase sits in a STRING, not a comment. The old scanner mis-read the regex as a
    // block-comment start, swallowed the string into that "comment", found the marker
    // inside it, and granted an exemption no author wrote. A real comment exempting a
    // real anchor is intended behaviour and is covered by the exemption tests above.
    for (const rx of ["/[/*]/", "/a\\/*b/", "/\\/\\//", "/https?:\\/\\//"]) {
      const code =
        `const re=${rx}; const msg = "no-newtab-announcement: fake";\n` +
        'const A=()=><a href="x" target="_blank">Go</a>;';
      expect(violations(code).join(" "), `a string must not exempt, with ${rx}`).toMatch(
        /does not announce/,
      );
    }
  });

  it("R14 comment stripping handles every literal position and terminates on bad input", () => {
    // Comment-like bytes are PRESERVED inside a template with substitutions, a JSX
    // attribute string, a type-position string, and a URL in a string.
    for (const src of [
      "const t = `a ${x} /* not a comment */ b`;",
      'const A = <a title="/* not a comment */">x</a>;',
      'type T = "/* not a comment */";',
      'const u = "https://x.test/a";',
    ]) {
      const out = stripCommentsSafely(src);
      expect(out, `must preserve: ${src}`).toBe(src);
    }
    // A real comment inside a JSX expression container is still removed.
    expect(stripCommentsSafely("const A = <a>{/* gone */}x</a>;")).not.toContain("gone");
    // Unterminated comment and unterminated regex must terminate, not hang or throw, and
    // must not change the file length.
    for (const src of [
      'const a=1; /* never closed\nconst K="Keep";',
      'const re=/abc\nconst K="Keep";',
    ]) {
      const out = stripCommentsSafely(src);
      expect(out.length, `length preserved for: ${src}`).toBe(src.length);
    }
  });

  it("R13 comment stripping survives regex literals and preserves offsets", () => {
    const cases: [string, boolean][] = [
      ['const re=/[/*]/;\nconst K = "Target";', true],
      ['const re=/a\\/*b/;\nconst K = "Target";', true],
      ['const re=/\\/\\//;\nconst K = "Target";', true],
    ];
    for (const [src, mustKeep] of cases) {
      const out = stripCommentsSafely(src);
      expect(out.includes("Target"), `must not truncate: ${src}`).toBe(mustKeep);
      // Comments are blanked, never deleted, so byte offsets stay valid for callers that
      // report line numbers.
      expect(out.length, "length must be preserved").toBe(src.length);
    }
    // Real comments are still removed, including one that is the leading trivia of a
    // TOKEN inside JSX attributes -- a node-only trivia walk missed that shape.
    expect(stripCommentsSafely('const a=1; // hidden\nconst K="Keep";')).not.toContain("hidden");
    expect(stripCommentsSafely('const a=1; /* hidden */\nconst K="Keep";')).not.toContain("hidden");
    expect(admitsCandidate('const A=({p})=><a href="x" { /*c*/ ...p}>Go</a>;')).toBe(true);
  });

  it("R7 the lexical nets see through comments and attribute casing", () => {
    for (const code of [
      'const A=({dest})=><a href="x" target /*c*/ ={dest}>Go</a>;',
      'const A=({dest})=><a href="x" target //c\n ={dest}>Go</a>;',
      'const A=({props})=><a href="x" { /*c*/ ...props}>Go</a>;',
      'const A=({props})=><a href="x" { //c\n ...props}>Go</a>;',
      'const A=({dest})=><a href="x" TARGET={dest}>Go</a>;',
      'const A=({dest})=><a href="x" Target={dest}>Go</a>;',
    ]) {
      expect(admitsCandidate(code), `admitsCandidate must admit: ${code}`).toBe(true);
    }
  });

  // R8 BLOCKING 1: `admitsCandidate` was case-insensitive but `classifyShape`
  // compared the attribute name verbatim, so all 63 non-lowercase casings of
  // `target` were admitted and then skipped with zero anchors. React forwards them
  // and the browser normalizes, so each really opened a new tab named only "Go".
  it("R8 attribute names are matched case-insensitively", () => {
    for (const spelling of ["TARGET", "Target", "tArGeT"]) {
      expect(
        violations(`const A=()=><a href="x" ${spelling}="_blank">Go</a>;`).join(" "),
        `${spelling} must be classified`,
      ).toMatch(/does not announce/);
    }
    // The hiding attributes matter in the OTHER direction: an uppercase spelling
    // really hides, so missing it would ACCEPT a hint that never reaches the name.
    for (const spelling of ["ARIA-HIDDEN", "Aria-Hidden"]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span ${spelling}="true"><NewTabHint /></span></a>;`,
        ).join(" "),
        `${spelling} must still hide`,
      ).toMatch(/hidden from the accessible name/);
    }
  });

  // R8 BLOCKING 2: a member-expression tag is not in LINK_TAGS, so these were
  // admitted by the file net and then never classified. React renders both as a
  // real <a target="_blank">.
  it("R8 member-expression link tags are classified", () => {
    expect(
      violations(`const A=()=><Tags.External href="x" target="_blank">Go</Tags.External>;`).join(
        " ",
      ),
    ).toMatch(/does not announce/);
    expect(
      violations(`const A=({dest})=><UI.Link href="x" target={dest}>Go</UI.Link>;`).join(" "),
    ).toMatch(/does not announce|unrecognized/);
    // An href-bearing element whose target arrives through a SPREAD is classified
    // too. Requiring a literal `target` attribute left this silently unclassified:
    // zero anchors, no violation. Found by probing the residue the rule had recorded
    // as accepted, before R9 ran.
    expect(
      violations(
        `const A=({e})=><Foo.Bar href="x" {...(e?{target:"_blank"}:{})}>Go</Foo.Bar>;`,
      ).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    // R9 BLOCKING 1, the two cases my href-plus-spread rule still missed: an explicit
    // `target` whose `href` arrives by spread, and a link-shaped tag with both.
    expect(violations(`const A=({p})=><Foo target="_blank" {...p}>Go</Foo>;`).join(" ")).toMatch(
      /does not announce|unrecognized/,
    );
    expect(
      violations(`const A=({p})=><RouterLink href="x" {...p}>Go</RouterLink>;`).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    // A spread-only non-link element is still not a candidate.
    const div = probe(`const A=({props})=><div {...props}>Go</div>;`);
    expect(div.anchors, "a spread-only non-link element must not become an anchor").toBe(0);
  });

  // R8 MEDIUM 3: the MDX net matched `target =` anywhere, including prose and a
  // GFM autolink query string, neither of which compiles to a target attribute.

  // The near-miss that motivates this guard: `attrName` lowercases, so every
  // comparison literal must be lowercase too. One camelCase literal survived the
  // first sweep and silently reopened the dynamic-className hole.
  //
  // HISTORY, and a claim RETRACTED. R9 MEDIUM 3 showed the first version was far too
  // narrow -- it matched only variables literally named `n` or `nm`, missing
  // `attrName(a) === "Target"`, `names.has("Target")` and more -- and the repair was
  // described as covering "every name-producing accessor and all three set-membership
  // helpers". That claim is FALSE and is retracted here: R19 showed a regex literal and
  // an unquoted property key carry no string literal at all, so no source scan reaches
  // them, and accessor coverage was never the right frame.
  //
  // Stated plainly: this rule cannot be complete, and it is not the guarantee. Indirection
  // defeats it (`const K = "Target"; attrName(a) === K`), as do the four forms pinned in the
  // R18/R19 test above. It exists to catch the ACCIDENTAL case -- a camelCase literal typed
  // by hand during a sweep, which is exactly how this class recurred once. The property is
  // guaranteed by the behavioural closed-list sweep, which reads no source; this only makes
  // one kind of regression loud.
  it("R34 binding over spelling, compositional truthiness, per-hint ALL", () => {
    const IMP = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
    const hid = '<span aria-hidden="true">Go</span>';
    // BLOCKING 1: `undefined` and `NaN` were read by SPELLING -- the exact mistake R27 fixed for
    // `NewTabHint`. A local binding of either name makes the value unknown, so fail closed.
    for (const [label, body] of [
      [
        "parameter named undefined",
        'function A(undefined){ return <a href="x" target="_blank">Go <span aria-hidden={undefined}><NewTabHint /></span></a>; }',
      ],
      [
        "parameter named NaN",
        'function A(NaN){ return <a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>; }',
      ],
      [
        "local const undefined",
        'function A(){ const undefined = true; return <a href="x" target="_blank">Go <span inert={undefined}><NewTabHint /></span></a>; }',
      ],
      // An IMPORT binds the name too. `isShadowedAt` deliberately ignores imports -- for the hint,
      // the import IS the trusted binding -- so the global check has to ask separately (R35).
      // A FUNCTION-SCOPED enum or namespace binds the name too -- TypeScript emits a local `let`
      // holding a truthy object. These lived only in the module-level helper for a round, so the
      // function-scoped form failed open (review R37 probe trail); they now live in `declares`, which
      // is consulted at EVERY scope.
      [
        "function-scoped enum NaN",
        'function A(){ enum NaN { A } return <a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>; }',
      ],
      [
        "function-scoped namespace NaN",
        'function A(){ namespace NaN { export const x=1; } return <a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>; }',
      ],
      [
        "function-scoped enum undefined",
        'function A(){ enum undefined { A } return <a href="x" target="_blank">Go <span aria-hidden={undefined}><NewTabHint /></span></a>; }',
      ],
      [
        "default import named NaN",
        'import NaN from "x";\nconst A=()=><a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>;',
      ],
      [
        "aliased import named NaN",
        'import { v as NaN } from "x";\nconst A=()=><a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>;',
      ],
      [
        "namespace import named NaN",
        'import * as NaN from "x";\nconst A=()=><a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>;',
      ],
      [
        "default import named undefined",
        'import undefined from "x";\nconst A=()=><a href="x" target="_blank">Go <span aria-hidden={undefined}><NewTabHint /></span></a>;',
      ],
    ] as [string, string][]) {
      expect(
        probe(IMP + body, { bare: true }).violations,
        `must fail closed, the name is locally bound: ${label}`,
      ).not.toEqual([]);
    }
    // ...while the GENUINE global is still trusted, or the rule would reject every real use.
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>;',
      ),
      "the real global NaN is falsy, so React omits the attribute",
    ).toEqual([]);
    // BLOCKING 2: falsiness composes through selection, and three falsy spellings were missing.
    for (const expr of [
      "{void 0 || HID}",
      "{-0n || HID}",
      "{-NaN || HID}",
      '{`${""}` || HID}',
      "{(true ? 0 : 1) || HID}",
      "{(false && 1) || HID}",
      "{(null ?? 0) || HID}",
      // A conditional whose BRANCHES are both boolean renders nothing whatever the test does. This
      // pins `isAlwaysBoolean`'s conditional arm: the popover path cannot, because `reactOmitsValue`
      // has a conditional arm of its own and reaches the same verdict without it.
      "{flag ? a === b : !x}",
    ]) {
      reports(
        `const A=({flag,a,b,x})=><a href="x" target="_blank">${expr.replace("HID", hid)} <NewTabHint /></a>;`,
        /only visible content is the announcement/,
        `a falsy left operand selects the right: ${expr}`,
      );
    }
    // ...and the same forms as an attribute VALUE are omitted by React, so they must be accepted.
    for (const attr of [
      "hidden={-0n}",
      "hidden={-NaN}",
      'hidden={`${""}`}',
      "hidden={true ? 0 : 1}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, React omits a falsy boolean attribute: ${attr}`,
      ).toEqual([]);
    }
    // ...and a provably TRUTHY `open` really opens the details.
    for (const attr of [
      "open={true && 1}",
      "open={false || 1}",
      "open={null ?? 1}",
      "open={true ? 1 : 0}",
    ]) {
      expect(
        violations(
          `const A=()=><a href="x" target="_blank">Go <details ${attr}><NewTabHint /></details></a>;`,
        ),
        `must accept, the details is provably open: ${attr}`,
      ).toEqual([]);
    }
    // HIGH 3: a value whose TYPE cannot be the string "true" does not hide, and React omits an
    // enumerated attribute set to a composed boolean.
    for (const attr of [
      "aria-hidden={void 0}",
      "aria-hidden={flag ? null : undefined}",
      "aria-hidden={typeof x}",
      "aria-hidden={/re/}",
      "aria-hidden={-1n}",
      "aria-hidden={[]}",
      "aria-hidden={{}}",
      "aria-hidden={() => 1}",
      'popover={false && "auto"}',
      'popover={true || "auto"}',
      "popover={null ?? true}",
      "popover={!a && !b}",
      // A conditional whose BRANCHES are both boolean is a boolean whatever the test does.
      "popover={flag ? a === b : !x}",
    ]) {
      expect(
        violations(
          `const A=({flag,x,a,b})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`,
        ),
        `must accept, this cannot hide: ${attr}`,
      ).toEqual([]);
    }
    // BLOCKING 4: a conditional spread with a DYNAMIC predicate is still decidable when every
    // branch hides -- identical branches, or different-but-both-hiding ones.
    for (const style of [
      '{{...(flag ? {display:"none"} : {display:"none"})}}',
      '{{...(flag ? {display:"none"} : {visibility:"hidden"})}}',
    ]) {
      reports(
        `const A=({flag})=><a href="x" target="_blank"><span style=${style}>Go</span> <NewTabHint /></a>;`,
        /only visible content is the announcement/,
        `every branch of the spread hides: ${style}`,
      );
    }
    // ...but one visible branch makes it opaque again.
    expect(
      violations(
        'const A=({flag})=><a href="x" target="_blank"><span style={{...(flag ? {display:"none"} : {display:"block"})}}>Go</span> <NewTabHint /></a>;',
      ),
      "must accept, one branch leaves the destination visible",
    ).toEqual([]);
    // HIGH 5: per-hint state is ALL, not ANY. Measured: a visible hint beside a hidden one still
    // computes "Go (opens in a new tab)".
    expect(
      violations(
        'const A=()=><a href="x" target="_blank">Go <NewTabHint /> <span aria-hidden="true"><NewTabHint /></span></a>;',
      ),
      "must accept, the visible instance still announces",
    ).toEqual([]);
    reports(
      'const A=()=><a href="x" target="_blank">Go <span aria-hidden="true"><NewTabHint /></span> <span hidden><NewTabHint /></span></a>;',
      /hidden from the accessible name/,
      "every instance hidden",
    );
  });

  it("a string that ENDS with a space separates -- the shape MDX compiles to", () => {
    // The separator rule accepted a whitespace-ONLY expression, so `{"Open "}<NewTabHint />` was
    // reported although it renders "Open (opens in a new tab)" correctly. That is exactly what MDX
    // compiles prose into -- `<a …>{"Open "}<NewTabHint /></a>` -- so every correctly-announced MDX
    // anchor would have been reported. Latent only because the census has no MDX anchor today.
    const sep = (inner: string): boolean =>
      violations(`const A=({label})=><a href="x" target="_blank">${inner}</a>;`).some((r) =>
        /sibling space/.test(r),
      );
    expect(sep('{"Open "}<NewTabHint />'), "a trailing space separates").toBe(false);
    expect(sep("{`Open `}<NewTabHint />"), "a template ending in a space separates").toBe(false);
    expect(sep('{"Open\u00a0"}<NewTabHint />'), "a non-breaking space separates").toBe(false);
    // The empty string must be adjacent to the HINT, with the real separator further LEFT -- a
    // literal space after it would satisfy the rule before this branch is ever reached, which is how
    // the first version of this fixture failed to pin it.
    expect(sep('Open {""}<NewTabHint />'), "an empty string looks further left").toBe(false);
    // ...and the defect the rule exists to catch still reports.
    expect(sep('{"Open"}<NewTabHint />'), "no trailing space is still a defect").toBe(true);
    expect(sep('{""}{"x"}<NewTabHint />'), "adjacent content is still a defect").toBe(true);
    expect(sep("{label}<NewTabHint />"), "an opaque value cannot prove a separator").toBe(true);
    // A child that RENDERS NOTHING is transparent to separation: it contributes no characters, so the
    // question passes through to whatever is further left. Asking what the value STRINGIFIES to got
    // this wrong -- `{null}` stringifies to "null" while rendering nothing (review R36 probe trail).
    for (const tail of [
      "{[]}",
      "{[null]}",
      '{false && "x"}',
      '{true ? null : "x"}',
      "{null}",
      "{false}",
      "{undefined}",
      "{void 0}",
    ]) {
      expect(
        sep(`Open ${tail}<NewTabHint />`),
        `renders nothing, so the space still separates: ${tail}`,
      ).toBe(false);
      // ...and with no space anywhere the defect still reports.
      expect(sep(`Open${tail}<NewTabHint />`), `no space anywhere: ${tail}`).toBe(true);
    }
    // Rendered text immediately before the hint is still adjacency.
    expect(sep('Open {"x"}<NewTabHint />'), "rendered text adjacent to the hint").toBe(true);
    // The MDX path end to end, through the real compiler.
    const sc: Scan = { anchors: 0, violations: [] };
    const mdx =
      'import { NewTabHint } from "@/components/shared/NewTabHint";\n\n<a href="https://x.example" target="_blank">Open <NewTabHint /></a>';
    scanSource(parse("/synthetic/doc.mdx", compileMdxToJsx(mdx)), "/synthetic/doc.mdx", sc);
    expect(sc.anchors, "the MDX anchor must be discovered").toBe(1);
    expect(sc.violations, "a correctly-announced MDX anchor must be accepted").toEqual([]);
  });

  it("R35 stringification, restored boolean arm, ordered style writes, module bindings", () => {
    const H = 'import { NewTabHint } from "@/components/shared/NewTabHint";\n';
    const span = (attr: string): string =>
      `const A=({flag,a,b,c,d,x,rest,display})=><a href="x" target="_blank">Go <span ${attr}><NewTabHint /></span></a>;`;
    // BLOCKING 5: arrays, objects and `new` were exempted wholesale, and every one can stringify to
    // "true". `String(["true"])` IS "true".
    for (const attr of [
      'aria-hidden={["true"]}',
      "aria-hidden={[true]}",
      'aria-hidden={{toString(){ return "true"; }}}',
      'aria-hidden={{valueOf(){ return "true"; }}}',
      'aria-hidden={new String("true")}',
      'aria-hidden={"tr" + "ue"}',
    ]) {
      reports(span(attr), /hidden from the accessible name/, `stringifies to "true": ${attr}`);
    }
    // The array stringifier's own rules. `String([a,b])` joins with a COMMA, so two fragments that
    // would concatenate to "true" do not: joining with "" instead would report this as hidden.
    expect(
      violations(span('aria-hidden={["tr","ue"]}')),
      'String(["tr","ue"]) is "tr,ue", not "true"',
    ).toEqual([]);
    // A SPREAD makes the array undecidable, so it fails closed rather than resolving to "".
    reports(
      span("aria-hidden={[...x]}"),
      /hidden from the accessible name/,
      "an array with a spread cannot be resolved",
    );
    // ...and the ones that genuinely cannot, including the numeric family (HIGH 8).
    for (const attr of [
      "aria-hidden={[]}",
      "aria-hidden={{}}",
      'aria-hidden={["a","b"]}',
      "aria-hidden={Infinity}",
      "aria-hidden={-Infinity}",
      "aria-hidden={~0}",
      "aria-hidden={1 * 2}",
      "aria-hidden={5 % 2}",
      "aria-hidden={1 << 3}",
    ]) {
      expect(violations(span(attr)), `cannot be "true": ${attr}`).toEqual([]);
    }
    // BLOCKING 2: the conditional arm of `isAlwaysBoolean`, RESTORED. Nesting it inside `&&` reaches
    // neither caller's own conditional handling, which is why four earlier fixtures were vacuous.
    for (const attr of [
      "popover={(flag ? a === b : !x) && c === d}",
      "popover={(flag ? a === b : !x) || c === d}",
    ]) {
      expect(violations(span(attr)), `always boolean, so React omits it: ${attr}`).toEqual([]);
    }
    // BLOCKING 4: one-sided polarity, and agreeing branches under a dynamic test.
    for (const attr of ["hidden={x && 0}", 'inert={x && ""}', 'hidden={flag ? 0 : ""}']) {
      expect(violations(span(attr)), `always falsy, so React omits it: ${attr}`).toEqual([]);
    }
    for (const attr of ["open={x || 1}", 'open={flag ? 1 : "x"}']) {
      expect(
        violations(
          `const A=({flag,x})=><a href="x" target="_blank">Go <details ${attr}><NewTabHint /></details></a>;`,
        ),
        `always truthy, so the details is open: ${attr}`,
      ).toEqual([]);
    }
    expect(violations(span("hidden={flag ? 1 : 0}")), "mixed polarity stays closed").not.toEqual(
      [],
    );
    // BLOCKING 1: style writes are ORDERED, through nesting and past a conditional spread.
    const style = (v: string): string =>
      `const A=({flag,rest,display})=><a href="x" target="_blank"><span style=${v}>Go</span> <NewTabHint /></a>;`;
    reports(
      style('{{...{...(flag ? {display:"none"} : {visibility:"hidden"})}}}'),
      /only visible content is the announcement/,
      "a nested spread must not swallow the verdict",
    );
    expect(
      violations(
        style(
          '{{...(flag ? {display:"none"} : {visibility:"hidden"}), display:"block", visibility:"visible"}}',
        ),
      ),
      "later writes neutralise every hiding key",
    ).toEqual([]);
    expect(
      violations(style('{{display:"none", display}}')),
      "a shorthand on the SAME key neutralises the write",
    ).toEqual([]);
    // The branch-expansion BOUND is observable: five conditional spreads are 32 alternatives, past
    // the limit of 16, so the object becomes opaque rather than expanding without end. Every branch
    // here hides, so without the bound it would report -- which is how this fixture distinguishes
    // "bounded" from "unbounded" instead of leaving the guard unexercised.
    {
      const spread = '...(flag ? {display:"none"} : {visibility:"hidden"})';
      const five = [spread, spread, spread, spread, spread].join(", ");
      expect(
        violations(style(`{{${five}}}`)),
        "past the alternative bound the object is opaque, not hiding",
      ).toEqual([]);
      // ...and four spreads (16 alternatives) still fits, so the bound is where it says it is.
      const four = [spread, spread, spread, spread].join(", ");
      expect(
        violations(style(`{{${four}}}`)),
        "within the bound every alternative still hides",
      ).not.toEqual([]);
    }
    // BLOCKING 6: enums, namespaces and `import =` all bind the name at module level.
    for (const [label, decl] of [
      ["enum", "enum NaN { A }"],
      ["namespace", "namespace NaN { export const x = 1; }"],
      ["import equals", 'import NaN = require("x");'],
    ] as [string, string][]) {
      expect(
        probe(
          H +
            `${decl}\nconst A=()=><a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>;`,
          {
            bare: true,
          },
        ).violations,
        `must fail closed, ${label} binds NaN at module level`,
      ).not.toEqual([]);
    }
  });

  it("R36 proto toString, nested branches, boolean ??, functions as content, dead hints", () => {
    const many = (inner: string): string[] =>
      violations(`const A=({a,b,x,n,flag,Wrap,f,obj})=><a href="x" target="_blank">${inner}</a>;`);
    // Fail-open 1: `__proto__` in an object literal sets the PROTOTYPE, so an inherited toString can
    // return "true" even with no own member. Measured: the attribute really is emitted as "true".
    expect(
      many('Go <span aria-hidden={{__proto__:{toString(){return "true";}}}}><NewTabHint /></span>'),
      "__proto__ can supply a toString",
    ).not.toEqual([]);
    // Fail-open 2: a conditional ARM may itself be a dynamic conditional; every leaf hides.
    for (const style of [
      '{{...(a ? (b ? {display:"none"} : {visibility:"hidden"}) : {display:"none"})}}',
      '{{...(a ? {display:"none"} : (b ? {visibility:"hidden"} : {display:"none"}))}}',
    ]) {
      expect(
        many(`<span style=${style}>Go</span> <NewTabHint />`),
        `every leaf of the nested conditional hides: ${style}`,
      ).not.toEqual([]);
    }
    // Fail-open 3: `Infinity` must resolve as a GLOBAL, not merely be unshadowed.
    expect(
      probe(
        'import { NewTabHint } from "@/components/shared/NewTabHint";\nimport Infinity from "x";\nconst A=()=><a href="x" target="_blank">Go <span aria-hidden={Infinity}><NewTabHint /></span></a>;',
        { bare: true },
      ).violations,
      "an imported Infinity is not the numeric global",
    ).not.toEqual([]);
    // Fail-open 4: a boolean is never nullish, so `??` keeps it -- and React renders neither boolean.
    expect(many('{(!x) ?? "Dest"} <NewTabHint />'), "a boolean ?? keeps the boolean").not.toEqual(
      [],
    );
    expect(
      many('Go <span popover={(!x) ?? "auto"}><NewTabHint /></span>'),
      "...and React omits that boolean from an enumerated attribute",
    ).toEqual([]);
    // Fail-open 5: React renders NOTHING for a function or class used as a child (measured).
    for (const child of ["{() => 1}", "{function f(){}}", "{class K {}}", "{async () => 1}"]) {
      expect(many(`${child} <NewTabHint />`), `renders nothing as a child: ${child}`).not.toEqual(
        [],
      );
    }
    // False positive 6/7: the numeric family, and constant arithmetic in the TRUTHINESS helpers.
    for (const attr of [
      "aria-hidden={+n}",
      "aria-hidden={-n}",
      "aria-hidden={n -= 1}",
      "aria-hidden={n++}",
      // PREFIX increment/decrement too -- the first pin covered only the postfix form, so the prefix
      // arm of the numeric family survived a mutation.
      "aria-hidden={++n}",
      "aria-hidden={--n}",
    ]) {
      expect(many(`Go <span ${attr}><NewTabHint /></span>`), `numeric: ${attr}`).toEqual([]);
    }
    expect(many("Go <span hidden={0 * 5}><NewTabHint /></span>"), "0 * 5 is falsy").toEqual([]);
    expect(
      many("Go <details open={Infinity}><NewTabHint /></details>"),
      "Infinity is truthy, so the details is open",
    ).toEqual([]);
    // False positive 9: a dead hint in a position `findHint` excludes must not poison a valid one.
    for (const dead of [
      "<Wrap hint={<NewTabHint/>} />",
      "{f(<NewTabHint/>)}",
      "{typeof <NewTabHint/>}",
      '{(<NewTabHint/>, "x")}',
    ]) {
      expect(
        many(`Go <NewTabHint />${dead}`).filter((r) => /sibling space/.test(r)),
        `a dead hint must not poison a separated one: ${dead}`,
      ).toEqual([]);
    }
    // ...and the genuine defect still reports.
    expect(
      many("Go<NewTabHint />").filter((r) => /sibling space/.test(r)),
      "a genuinely unseparated hint still reports",
    ).not.toEqual([]);
  });

  it("R37 contributing instances, one more selection copy, and stringifier precision", () => {
    const A = (inner: string): string[] =>
      violations(`const A=({flag,x,cls,hide,Wrap,f})=><a href="x" target="_blank">${inner}</a>;`);
    // Fail-open: only instances that CONTRIBUTE to the name may answer questions about it. An
    // unconditional HIDDEN hint made the conditional VISIBLE one look unconditional.
    expect(
      A('Go {flag && <NewTabHint />} <span aria-hidden="true"><NewTabHint /></span>'),
      "a hidden instance must not vouch for a conditional visible one",
    ).not.toEqual([]);
    // ...and the mirror: a hidden instance must not make a correctly separated one look adjacent.
    expect(
      A('Go <NewTabHint /><span aria-hidden="true"><NewTabHint /></span>').filter((r) =>
        /sibling space/.test(r),
      ),
      "a hidden instance must not poison separation",
    ).toEqual([]);
    // Fail-open: `import X = require(...)` binds inside a namespace body too.
    expect(
      probe(
        'import { NewTabHint } from "@/components/shared/NewTabHint";\nnamespace N { import NaN = require("x"); export const A = () => <a href="x" target="_blank">Go <span hidden={NaN}><NewTabHint /></span></a>; }',
        { bare: true },
      ).violations,
      "a nested import-equals binds the name",
    ).not.toEqual([]);
    // The FOURTH copy of the selection logic: `staticStringValue` had its own arms, so R36's
    // always-boolean rule never reached it.
    expect(
      A('Go <span className={(!x) ?? "hidden"}><NewTabHint /></span>'),
      "boolean class value",
    ).toEqual([]);
    expect(
      A('Go <span aria-hidden={(+x) ?? "true"}><NewTabHint /></span>'),
      "numeric ?? is the number",
    ).toEqual([]);
    // `constantNumber` may use `+` once BOTH operands are numbers -- that is addition, not concat.
    expect(A("Go <details open={1 + 1}><NewTabHint /></details>"), "1 + 1 is truthy").toEqual([]);
    expect(A("Go <span hidden={1 + -1}><NewTabHint /></span>"), "1 + -1 is falsy").toEqual([]);
    // Stringifier precision: decidable objects and arrays that cannot be "true".
    for (const attr of [
      'aria-hidden={{["x"]:1}}',
      "aria-hidden={{0:1}}",
      "aria-hidden={{__proto__:1}}",
      "aria-hidden={{__proto__(){ return 1; }}}",
      "aria-hidden={[/re/]}",
      "aria-hidden={[1*2]}",
      "aria-hidden={[Infinity]}",
      "aria-hidden={[()=>1]}",
      // TWO undecidable elements: `staticStringValue` gives up, so only the comma-join argument in
      // `cannotRenderTrue` can decide this -- with 2+ elements the result always contains a comma.
      "aria-hidden={[/re/,/re2/]}",
      "aria-hidden={[()=>1,()=>2]}",
    ]) {
      expect(A(`Go <span ${attr}><NewTabHint /></span>`), `cannot be "true": ${attr}`).toEqual([]);
    }
    // ...and the ones that still can, including the prototype trick.
    for (const attr of [
      'aria-hidden={["true"]}',
      "aria-hidden={[true]}",
      'aria-hidden={{__proto__:{toString(){return "true";}}}}',
      // A SPREAD could carry any member, including a toString override.
      "aria-hidden={{...x}}",
      // `__proto__: null` yields a NULL-PROTOTYPE object, whose string conversion THROWS rather than
      // giving "[object Object]" -- undecidable, so it must fail closed.
      "aria-hidden={{__proto__:null}}",
      "aria-hidden={[...x]}",
    ]) {
      expect(A(`Go <span ${attr}><NewTabHint /></span>`), `can be "true": ${attr}`).not.toEqual([]);
    }
    // A definitely-hiding class keeps the PRECISE message; only an undecidable one is "unproven".
    expect(
      A('Go <span className="hidden"><NewTabHint /></span>').some((r) =>
        /hidden from the accessible name/.test(r),
      ),
      "a decided hiding class reports the precise reason",
    ).toBe(true);
    expect(
      A("Go <span className={`${cls} hidden`}><NewTabHint /></span>").some((r) =>
        /cannot be proven non-hiding/.test(r),
      ),
      "an undecidable class reports unproven",
    ).toBe(true);
  });

  it("instance filtering: hidden instances are ignored, visible ones never are", () => {
    // The contributing-instance filter is the newest behavioural change (R37), so this covers BOTH
    // directions: a hidden instance must not vouch for anything, and filtering must not make the
    // guard miss a real defect among the visible ones.
    const verdict = (inner: string): string[] =>
      violations(`const A=({flag,other})=><a href="x" target="_blank">${inner}</a>;`);
    const cases: Array<[string, string, boolean]> = [
      ["every instance hidden", 'Go <span aria-hidden="true"><NewTabHint /></span>', true],
      ["the only instance is conditional", "Go {flag && <NewTabHint />}", true],
      [
        "visible unconditional beside a hidden conditional",
        'Go <NewTabHint /> {flag && <span aria-hidden="true"><NewTabHint /></span>}',
        false,
      ],
      [
        "visible CONDITIONAL beside a hidden unconditional",
        'Go {flag && <NewTabHint />} <span aria-hidden="true"><NewTabHint /></span>',
        true,
      ],
      [
        "two visible, both conditional",
        "Go {flag && <NewTabHint />} {other && <NewTabHint />}",
        true,
      ],
      ["two visible, one unconditional", "Go {flag && <NewTabHint />} <NewTabHint />", false],
      ["hidden only, and unseparated", 'Go<span aria-hidden="true"><NewTabHint /></span>', true],
    ];
    for (const [label, inner, shouldReport] of cases) {
      expect(verdict(inner).length > 0, label).toBe(shouldReport);
    }
    // GATING is the THIRD consumer of the contributing filter and had no coverage of its own. On a
    // conditionally-external anchor the hint must be gated on the SAME predicate, and a hidden
    // instance must neither satisfy that requirement nor break it.
    const gated = (children: string): string[] => {
      const sc: Scan = { anchors: 0, violations: [] };
      const src = `const A = ({e}) => <a href="x" {...(e ? { target: "_blank" } : {})}>${children}</a>;`;
      scanSource(parse("/synthetic/gated.tsx", HINT_IMPORT + src), "/synthetic/gated.tsx", sc);
      return sc.violations.map((v) => v.reason);
    };
    expect(gated("Go {e ? <> <NewTabHint /></> : null}"), "gated on the same predicate").toEqual(
      [],
    );
    expect(gated("Go <NewTabHint />"), "ungated on a gated anchor").not.toEqual([]);
    expect(
      gated('Go {e ? <> <NewTabHint /></> : null} <span aria-hidden="true"><NewTabHint /></span>'),
      "a HIDDEN ungated instance must not break a correctly gated visible one",
    ).toEqual([]);
    expect(
      gated('Go <NewTabHint /> {e ? <span aria-hidden="true"><NewTabHint /></span> : null}'),
      "a HIDDEN gated instance must not vouch for an ungated visible one",
    ).not.toEqual([]);

    // PRECEDENCE: a hidden-only hint reports that it is HIDDEN, not that it is unseparated -- being
    // absent from the name is the more fundamental fact, and the vaguer message would hide it.
    expect(
      verdict('Go<span aria-hidden="true"><NewTabHint /></span>').some((r) =>
        /hidden from the accessible name/.test(r),
      ),
      "hidden takes precedence over unseparated",
    ).toBe(true);
  });

  it("the naming and separation questions stay DUAL, never drifting", () => {
    // Both rules consult `rendersNothing`, and they must reach OPPOSITE conclusions from it: a value
    // that renders nothing is transparent to SEPARATION (look further left) and absent as a
    // DESTINATION (it contributes no name). A value that renders text is the reverse. So for each
    // value below exactly ONE of the two rules fires -- if a future change makes one consult a
    // different notion of "renders nothing", this asymmetry breaks and one of these flips.
    //
    // This is the invariant behind the R36 fix, where the separation rule had been answering the
    // naming question's helper (`staticStringValue`) instead: `{null}` stringifies to "null" but
    // renders nothing, and that single mismatch produced six false positives.
    const reasons = (src: string): string[] =>
      violations(`const A=()=><a href="x" target="_blank">${src}</a>;`);
    for (const [mid, rendersText] of [
      ["{null}", false],
      ["{false}", false],
      ["{[]}", false],
      ['{false && "x"}', false],
      ['{" "}', false],
      ['{"x"}', true],
    ] as [string, boolean][]) {
      const asSeparator = reasons(`Open ${mid}<NewTabHint />`).some((r) => /sibling space/.test(r));
      const asDestination = reasons(`${mid} <NewTabHint />`).some((r) =>
        /only visible content/.test(r),
      );
      expect(
        asSeparator,
        `${mid}: renders ${rendersText ? "TEXT so it is adjacency" : "nothing so it is transparent"}`,
      ).toBe(rendersText);
      expect(
        asDestination,
        `${mid}: renders ${rendersText ? "TEXT so it IS a destination" : "nothing so it is no destination"}`,
      ).toBe(!rendersText);
    }
  });

  it("one selector, many consumers: each applies its OWN kind after the same selection", () => {
    // R36's finding 4 fixed `pickedOperand` and the pin still failed, because `rendersNothing` and
    // `expressionDestination` each carried their own copy of the &&/||/?? logic. Now all three
    // delegate, and this asserts the RESULT of that: for one expression, every consumer must agree on
    // which operand is selected, then diverge only where React's semantics for that attribute kind
    // genuinely differ.
    const run = (inner: string): boolean =>
      violations(`const A=({a,b,x,n,flag})=><a href="x" target="_blank">${inner}</a>;`).length > 0;
    const hid = '<span aria-hidden="true">Go</span>';
    // `!x` is always a boolean, so `??` KEEPS it: the value renders nothing and React omits it from
    // an enumerated attribute, while a boolean-DOM or ARIA attribute cannot tell true from false and
    // fails closed.
    for (const expr of ['(!x) ?? "D"', '(a === b) ?? "D"', "true && (!x)", "false || (!x)"]) {
      expect(
        run(`{${expr}}${hid} <NewTabHint />`),
        `${expr}: renders nothing, no destination`,
      ).toBe(true);
      expect(
        run(`Go <span popover={${expr}}><NewTabHint /></span>`),
        `${expr}: popover omits a boolean`,
      ).toBe(false);
      expect(
        run(`Go <span hidden={${expr}}><NewTabHint /></span>`),
        `${expr}: hidden cannot decide`,
      ).toBe(true);
      expect(
        run(`Go <span aria-hidden={${expr}}><NewTabHint /></span>`),
        `${expr}: aria cannot decide`,
      ).toBe(true);
    }
    // Where selection itself is undecidable, EVERY consumer must fail its own way: content stays
    // opaque (assumed destination, per §6.4) and the attributes fail closed.
    for (const expr of ['(!x) || "D"', '(!x) && "D"']) {
      expect(
        run(`{${expr}} <NewTabHint />`),
        `${expr}: opaque content is assumed a destination`,
      ).toBe(false);
      for (const attr of ["popover", "hidden", "aria-hidden"]) {
        expect(
          run(`Go <span ${attr}={${expr}}><NewTabHint /></span>`),
          `${expr}: ${attr} fails closed on an undecidable selection`,
        ).toBe(true);
      }
    }
  });

  it("value composition is CLOSED: every helper resolves nesting", () => {
    // R34 routed every value question through `pickedOperand`; R35 then found `isProvablyNullish`
    // was the one helper the layer CONSULTS that did not itself compose. That is a property of the
    // set, not of one rule, so this asserts the property: each consumer must resolve a value nested
    // one level deeper than the shape its own fixtures use. If a new helper joins the layer and does
    // not compose, one of these flips.
    const hid = '<span aria-hidden="true">Go</span>';
    const cases: Array<[string, string, "accept" | "report"]> = [
      [
        "hidden, nested falsy",
        "Go <span hidden={(false || null) ?? 0}><NewTabHint /></span>",
        "accept",
      ],
      [
        "inert, nested nullish",
        "Go <span inert={(null ?? null) ?? void 0}><NewTabHint /></span>",
        "accept",
      ],
      [
        "popover, nested boolean",
        "Go <span popover={(null ?? false) || false}><NewTabHint /></span>",
        "accept",
      ],
      [
        "open, nested truthy",
        "Go <details open={(null ?? 0) || 1}><NewTabHint /></details>",
        "accept",
      ],
      [
        "style value, nested",
        '<span style={{display: (false || null) ?? "none"}}>Go</span> <NewTabHint />',
        "report",
      ],
      ["child expression, nested falsy", `{(null ?? 0) || ${hid}} <NewTabHint />`, "report"],
      [
        "aria-hidden, nested inside a template",
        'Go <span aria-hidden={`${(false || null) ?? "tr"}ue`}><NewTabHint /></span>',
        "report",
      ],
    ];
    for (const [label, inner, want] of cases) {
      const got =
        violations(`const A=()=><a href="x" target="_blank">${inner}</a>;`).length > 0
          ? "report"
          : "accept";
      expect(got, `${label}: nesting must resolve the same way one level deeper`).toBe(want);
    }
  });

  it("the base case: an external anchor with no hint at all", () => {
    // The guard's most fundamental violation, and until the coverage meta-test below was written no
    // fixture NAMED it -- the shadow fixtures reach it but assert only that something reported.
    reports(
      'const A = () => <a href="x" target="_blank">Go</a>;',
      /external link does not announce that it opens a new tab/,
      "a bare external anchor",
    );
    // ...and a shadowed hint reaches the same message, because the identifier no longer refers to
    // the real component.
    expect(
      probe(
        'import { NewTabHint } from "@/components/shared/NewTabHint";\nfunction A(){ const NewTabHint = () => null; return <a href="x" target="_blank">Go <NewTabHint /></a>; }',
        { bare: true },
      ).violations.map((v) => v.reason),
      "a shadowed hint is not an announcement",
    ).toContain("external link does not announce that it opens a new tab");
  });

  it("every violation is PRODUCIBLE from live markup, not merely named", () => {
    // The static coverage check below asserts each reason string is NAMED somewhere in this file --
    // which a COMMENT would satisfy. This one requires the scanner to actually EMIT each reason from
    // real markup, so a rule that has become unreachable cannot hide behind a mention of its message.
    const firstReason = (src: string): string => {
      const sc: Scan = { anchors: 0, violations: [] };
      scanSource(
        parse("/synthetic/producible.tsx", HINT_IMPORT + src),
        "/synthetic/producible.tsx",
        sc,
      );
      return sc.violations[0]?.reason ?? "(accepted)";
    };
    const anchor = (inner: string): string =>
      firstReason(`const A=({x})=><a href="x" target="_blank">${inner}</a>;`);
    const labelled = (attrs: string): string =>
      firstReason(`const A=()=><a href="x" target="_blank" ${attrs}>Go</a>;`);
    const cases: Array<[string, string, RegExp]> = [
      ["no hint at all", anchor("Go"), /does not announce that it opens a new tab/],
      [
        "hidden hint",
        anchor('Go <span aria-hidden="true"><NewTabHint /></span>'),
        /hidden from the accessible name/,
      ],
      ["unseparated hint", anchor("Go<NewTabHint />"), /needs a real sibling space/],
      [
        "no destination",
        anchor('<span aria-hidden="true">Go</span> <NewTabHint />'),
        /only visible content is the announcement/,
      ],
      [
        "unprovable path",
        anchor("Go <span className={x}><NewTabHint /></span>"),
        /cannot be proven non-hiding/,
      ],
      [
        "label carries no destination",
        labelled('aria-label="(opens in a new tab)"'),
        /aria-label announces but carries no destination/,
      ],
      ["label does not announce", labelled('aria-label="Go"'), /must announce in that label/],
      ["labelledby present", labelled('aria-labelledby="t"'), /aria-labelledby outranks/],
    ];
    for (const [label, got, want] of cases) {
      expect(got, `${label} must be producible with its own reason`).toMatch(want);
    }
    // Every reason above must be DISTINCT: a rule that collapsed into another would still "produce a
    // violation" while losing its own message.
    const messages = cases.map(([, got]) => got);
    expect(new Set(messages).size, "each shape reports a distinct reason").toBe(messages.length);
  });

  it("every violation the scanner can emit is exercised by a fixture", () => {
    // A rule with no fixture NAMING its reason is an untested rule, and the count has grown by one
    // or two nearly every round -- R31 added the aria-labelledby override, R28 the spread-on-path
    // message. Extracted from the scanner source so a NEW reason fails by default rather than
    // waiting to be noticed.
    const src = readFileSync(join(process.cwd(), "tests/styles/_newTabScan.ts"), "utf8");
    const reasons = [...src.matchAll(/record\(\s*(["'`])([\s\S]*?)\1/g)]
      .map((m) => m[2]!.replace(/\s+/g, " ").trim())
      // A templated reason is only stable up to its first interpolation.
      .map((r) => r.split("${")[0]!.trim())
      .filter((r) => r.length > 12);
    expect(reasons.length, "expected the scanner to emit several distinct reasons").toBeGreaterThan(
      8,
    );
    const self = readFileSync(
      join(process.cwd(), "tests/styles/_metaNewTabAnnouncement.test.ts"),
      "utf8",
    );
    const unexercised = [...new Set(reasons)].filter((reason) => {
      // A fixture may match on ANY distinctive fragment -- most assert a mid-string phrase such as
      // /only visible content is the announcement/ -- so a prefix comparison would report every rule
      // as uncovered. Slide a window instead and accept any window that appears.
      const WINDOW = 22;
      for (let i = 0; i + WINDOW <= reason.length; i += 1) {
        if (self.includes(reason.slice(i, i + WINDOW))) return false;
      }
      return true;
    });
    expect(unexercised, "these scanner violations have no fixture naming them").toEqual([]);
  });

  it("no literal spells a known attribute name in non-lowercase", () => {
    // Shape-scoped, and NOT a claim of completeness (see the retraction above).
    // For the reason R18 gave about its sibling check: the position-based
    // collector this used to call could not see a name inside a const-bound `new Set([...])`
    // -- which is how `rel` is actually read -- so a camelCase spelling there would not have
    // tripped it. Both halves now run off `nameShapedLiterals`, so there is ONE collector and
    // the two checks cannot disagree about what the scanner reads.
    const src = readFileSync(join(process.cwd(), "tests/styles/_newTabScan.ts"), "utf8");
    const shaped = nameShapedLiterals(src);
    const offenders = shaped.filter(
      (lit) => lit !== lit.toLowerCase() && CASE_INSENSITIVE_NAMES.has(lit.toLowerCase()),
    );
    expect(offenders, "attribute-name literals must be lowercase").toEqual([]);

    // Self-maintaining half: the fixed set only protects names it knows, so require it to
    // cover every name-shaped literal that is not declared a non-attribute. Adding a
    // comparison against a new attribute fails HERE until the set is extended.
    const uncovered = shaped.filter(
      (n) => !NOT_AN_ATTRIBUTE_NAME.has(n) && !CASE_INSENSITIVE_NAMES.has(n.toLowerCase()),
    );
    expect(
      uncovered,
      "add these attribute names to CASE_INSENSITIVE_NAMES so the lowercase rule covers them",
    ).toEqual([]);

    // The exclusion list must not name a real attribute. R19's third evasion was reusing an
    // already-excluded spelling, so an entry naming a real attribute exempts it from the
    // classification requirement above with a one-line edit and a plausible reason. Checked
    // against the externally-defined closed list, not the curated subset.
    const affecting = new Set(NAME_AFFECTING_ATTRIBUTES.map((n) => n.toLowerCase()));
    expect(
      [...NOT_AN_ATTRIBUTE_NAME.keys()].filter((n) => affecting.has(n.toLowerCase())),
      "a real attribute name cannot be declared NOT_AN_ATTRIBUTE_NAME",
    ).toEqual([]);

    // THE REVERSE CROSS-CHECK, added at R21 because its absence is what let `inert` sit in
    // the guard's own name-affecting list while `hidesFromAccName` never mentioned it. A list
    // asserting an attribute matters is not enforcement; nothing compared the list to the
    // code. Every name this suite claims is case-insensitive must therefore either APPEAR in
    // the scanner source, or be declared here as kept only for forward protection against a
    // future hand-typed spelling. "Listed but never read" is then a decision someone made,
    // not an oversight nobody noticed.
    const FORWARD_PROTECTION_ONLY = new Map<string, string>([
      ["download", "not read today; listed so a hand-typed `Download` still trips the rule"],
      ["ping", "not read today; same forward protection"],
      ["referrerpolicy", "not read today; same forward protection"],
      // No longer read as of R28's model change (nested-element attributes stopped being
      // destination proof), but kept so a hand-typed `Value` still trips the lowercase rule.
      // The reverse cross-check flagged these the moment they went unread -- the check working
      // as designed on its own author.
      ["type", "not read since the dead input-type branch was deleted; forward protection"],
      ["value", "not read since R28; kept for forward protection"],
      ["defaultvalue", "not read since R28; kept for forward protection"],
    ]);
    const unread = [...CASE_INSENSITIVE_NAMES].filter(
      (n) => !shaped.some((lit) => lit.toLowerCase() === n) && !FORWARD_PROTECTION_ONLY.has(n),
    );
    expect(
      unread,
      "these names are listed as case-insensitive but the scanner never mentions them: either handle them or declare them FORWARD_PROTECTION_ONLY",
    ).toEqual([]);
    // And the forward-protection declarations cannot rot the other way: once the scanner DOES
    // read one, the declaration is wrong and must go.
    expect(
      [...FORWARD_PROTECTION_ONLY.keys()].filter((n) =>
        shaped.some((lit) => lit.toLowerCase() === n),
      ),
      "the scanner now reads these, so remove their FORWARD_PROTECTION_ONLY rows",
    ).toEqual([]);

    // Exclusions cannot rot either: an entry no longer present in the source is how a real
    // attribute name later slips in under a dead classification.
    expect(
      [...NOT_AN_ATTRIBUTE_NAME.keys()].filter((n) => !shaped.includes(n)),
      "remove NOT_AN_ATTRIBUTE_NAME entries that no longer appear in the scanner",
    ).toEqual([]);
  });

  // R9 BLOCKING 2: `[^<>]*` ended the tag at any angle bracket inside it, so a later
  // dynamic target or spread was invisible. @mdx-js/mdx compiles all of these and
  // preserves the target.

  // R9 MEDIUM 3: the approved-spread path compared property names verbatim, so an
  // uppercase-but-correct spread was reported as an unrecognized shape.
  it("R9 an approved spread with uppercase prop names is accepted", () => {
    expect(
      violations(
        `const A=({e})=><a href="x" {...(e?{TARGET:"_BLANK",REL:"NoOpener"}:{})}>Go {e?<> <NewTabHint /></>:null}</a>;`,
      ),
    ).toEqual([]);
  });

  // R10 BLOCKING 2: a RESOLVABLE inline spread carrying both props was skipped, so a
  // forwarding component rendered a real external anchor with zero anchors counted.
  it("R10 a resolvable inline spread supplying href+target is classified", () => {
    for (const code of [
      `const A=()=><Foo {...{href:"x",target:"_blank"}}>Go</Foo>;`,
      `const A=({e})=><Foo {...(e?{href:"x",target:"_blank"}:{})}>Go</Foo>;`,
      `const A=()=><UI.Widget {...{href:"x",target:"_blank"}}>Go</UI.Widget>;`,
      `const T="a"; const A=()=><T {...{href:"x",target:"_blank"}}>Go</T>;`,
    ]) {
      expect(violations(code).join(" "), `must classify: ${code}`).toMatch(
        /does not announce|unrecognized|not gated/,
      );
    }
    // NESTED resolvable spreads too. One level of unwrapping left this with no names
    // at all, so the element was never a candidate -- found by probing my own fix for
    // R10 BLOCKING 2 before the next round ran.
    expect(
      violations(`const A=()=><Foo {...{...{href:"x",target:"_blank"}}}>Go</Foo>;`).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    // An UNRESOLVABLE spread on an unknown tag stays out, which is the documented
    // deferral and what keeps `<div {...props}>` from becoming a violation.
    const opaque = probe(`const A=({props})=><Foo {...props}>Go</Foo>;`);
    expect(opaque.anchors, "an unresolvable spread on an unknown tag is not a candidate").toBe(0);
  });

  // R11 BLOCKING 3: the duplicate rule covered spread objects only, so DIRECT JSX
  // duplicates walked past two consumers. React applies the LATER value, so the first
  // case really opened a new tab and the second really replaced an announcing label
  // with a silent one.
  it("R11 duplicate case-folded JSX attributes fail closed", () => {
    expect(
      violations(`const A=()=><a href="x" target="_self" TARGET="_blank">Go</a>;`).join(" "),
    ).toMatch(/case-folding|unrecognized/);
    expect(
      violations(
        `const A=()=><a href="x" target="_blank" aria-label="Go (opens in a new tab)" ARIA-LABEL="Go">Go</a>;`,
      ).join(" "),
    ).toMatch(/case-folding|unrecognized/);
    // A single spelling is untouched.
    expect(violations(`const A=()=><a href="x" target="_blank">Go <NewTabHint /></a>;`)).toEqual(
      [],
    );
    // A spread colliding with a direct attribute is reported in EITHER source order.
    // React resolves those by source order, so the effective target depends on
    // position; the guard does not guess, it reports.
    for (const code of [
      `const A=()=><a href="x" target="_self" {...{target:"_blank"}}>Go</a>;`,
      `const A=()=><a href="x" {...{target:"_blank"}} target="_self">Go</a>;`,
      `const A=()=><a href="x" TARGET="_blank" {...{target:"_self"}}>Go</a>;`,
    ]) {
      expect(violations(code).join(" "), `must report: ${code}`).toMatch(
        /unrecognized|case-folding/,
      );
    }
    // SCOPE BOUNDARY, deliberate: a duplicate on an element that is not a link
    // candidate is not this guard's business. `<div aria-label ARIA-LABEL>` is a
    // general a11y smell, not a silent new-tab link, and reporting it here would make
    // the guard a general attribute linter.
    const notALink = probe(`const A=()=><div aria-label="a" ARIA-LABEL="b">x</div>;`);
    expect(notALink.anchors, "a non-link element is out of scope for this guard").toBe(0);
  });

  // R11 BLOCKING 2: two more resolvable-spread shapes that carried no candidacy names.
  it("R11 sibling nested spreads and computed literal keys are classified", () => {
    expect(
      violations(`const A=()=><Foo {...{...{href:"x"},...{target:"_blank"}}}>Go</Foo>;`).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    expect(
      violations(`const A=()=><Foo {...{["href"]:"x",["target"]:"_blank"}}>Go</Foo>;`).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
  });

  // R12 question 2: a spread of a same-file `const` object literal is DECIDABLE, and
  // was silent on an unknown tag while the identical spread on an `<a>` was reported.
  it("R12 a same-file const spread is resolved", () => {
    expect(
      violations(`const P={href:"x",target:"_blank"}; const A=()=><Foo {...P}>Go</Foo>;`).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    // Two bindings of the same name means shadowing is possible, so it stays
    // unresolvable and fails closed rather than guessing which one reaches the JSX.
    const shadowed = probe(
      `const P={href:"x",target:"_blank"}; function f(){ const P={}; return P; } const A=()=><Foo {...P}>Go</Foo>;`,
    );
    expect(shadowed.anchors, "an ambiguous binding must not be resolved").toBe(0);
    // A genuinely opaque identifier remains the documented residue.
    const opaque = probe(`const A=({P})=><Foo {...P}>Go</Foo>;`);
    expect(opaque.anchors, "an unresolvable spread on an unknown tag is residue").toBe(0);
  });

  // R12 BLOCKING 1: type-only wrappers erase at runtime, so the object really is
  // forwarded -- but `unparen` only stripped parentheses, leaving it invisible.
  it("R12 type-only wrappers do not hide a resolvable spread", () => {
    for (const wrapped of [
      `{href:"x",target:"_blank"} as const`,
      `{href:"x",target:"_blank"} satisfies Record<string, string>`,
      `{href:"x",target:"_blank"}!`,
      `{...({href:"x",target:"_blank"} as const)}`,
    ]) {
      expect(
        violations(`const A=()=><Foo {...(${wrapped})}>Go</Foo>;`).join(" "),
        `must classify: ${wrapped}`,
      ).toMatch(/does not announce|unrecognized|not gated/);
    }
  });

  // Probed from R13's question 1: which wrappers are genuinely runtime-transparent?
  it("R13 comma expressions are transparent; calls and awaits are not", () => {
    // A comma expression evaluates to its last operand, so the object IS forwarded.
    expect(
      violations(`const A=()=><Foo {...(0, {href:"x",target:"_blank"})}>Go</Foo>;`).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    // A doubled type assertion chain unwraps repeatedly.
    expect(
      violations(
        `const A=()=><Foo {...({href:"x",target:"_blank"} as unknown as Record<string,string>)}>Go</Foo>;`,
      ).join(" "),
    ).toMatch(/does not announce|unrecognized|not gated/);
    // An IIFE is a CALL and an await is a promise: neither is statically resolvable,
    // so both remain the documented residue rather than false confidence.
    expect(
      probe(`const A=()=><Foo {...(()=>({href:"x",target:"_blank"}))()}>Go</Foo>;`).anchors,
    ).toBe(0);
  });

  // R12 MEDIUM 4: three false positives in the duplicate-fold rule.
  it("R12 the duplicate rule does not fire on legitimate shapes", () => {
    // Props on a CUSTOM component are ordinary JS keys and case-sensitive, so the DUPLICATE
    // rule must not fire. Scoped to that rule rather than asserting no violations at all:
    // since R27 a member-expression component is an untrusted callee and legitimately draws a
    // does-not-announce report, so `toEqual([])` here would fail for an unrelated reason and
    // stop testing the duplicate rule. Assert the absence of the duplicate reason instead.
    expect(
      violations(
        `const A=()=><UI.Link href="x" target="_blank" Mode="one" mode="two">Go <NewTabHint /></UI.Link>;`,
      ).join(" | "),
      "the duplicate-fold rule must not fire on case-sensitive component props",
    ).not.toMatch(/case-folding|duplicate/i);
    // Unicode is not ASCII-folded, so these are distinct attributes.
    expect(
      violations(
        `const A=()=><a href="x" target="_blank" data-\u03a3="1" data-\u03c3="2">Go <NewTabHint /></a>;`,
      ),
    ).toEqual([]);
    // An INTERNAL anchor with duplicated naming attributes is not this guard's
    // business: it never becomes external, so it must not be dragged in.
    const internal = probe(`const A=()=><a href="/x" aria-label="a" ARIA-LABEL="b">Go</a>;`);
    expect(internal.anchors, "an internal anchor is not external").toBe(0);
  });

  // A camelCase SVG element IS intrinsic. `/^[a-z][a-z0-9-]*$/` excluded `<clipPath>`
  // and `<foreignObject>`, so the duplicate rule silently skipped them. JSX's own rule
  // is simpler: lowercase first character means intrinsic, a dot means component.
  it("camelCase intrinsics are treated as intrinsic", () => {
    expect(
      violations(`const A=()=><clipPath href="x" target="_self" TARGET="_blank" />;`).join(" "),
    ).toMatch(/case-folding|unrecognized/);
    expect(
      violations(
        `const A=()=><foreignObject href="x" aria-label="a" ARIA-LABEL="b" target="_blank">Go</foreignObject>;`,
      ).join(" "),
    ).toMatch(/case-folding|unrecognized/);
  });

  // R10 BLOCKING 3: React writes `{ target, TARGET }` to ONE case-insensitive DOM
  // attribute and the LATER value wins, so reading the first normalized match took
  // the wrong value in both directions. Duplicates are ambiguous: fail closed.
  it("R10 duplicate case-folded property names fail closed", () => {
    expect(
      violations(
        `const A=({e})=><a href="x" {...(e?{target:"_self",TARGET:"_blank"}:{})}>Go</a>;`,
      ).join(" "),
    ).toMatch(/unrecognized/);
    expect(
      violations(
        `const A=({e})=><a href="x" {...(e?{TARGET:"_blank","target":"_self"}:{})}>Go</a>;`,
      ).join(" "),
    ).toMatch(/unrecognized/);
    // A single uppercase spelling is still accepted (R9 MEDIUM 3).
    expect(
      violations(
        `const A=({e})=><a href="x" {...(e?{TARGET:"_blank",REL:"noreferrer"}:{})}>Go {e?<> <NewTabHint /></>:null}</a>;`,
      ),
    ).toEqual([]);
  });

  // (5) File admission: case-insensitive _blank, dynamic targets, and spreads all
  // reach the scanner. R5's filter was case-SENSITIVE, so a real `_BLANK` file was
  // never scanned even though a synthetic fixture proved the shape was rejected.
  it("candidate-file admission covers _BLANK, dynamic targets and spreads", () => {
    for (const code of [
      'const A=()=><a href="x" target="_BLANK">Go</a>;',
      'const A=({t})=><a href="x" target={t}>Go</a>;',
      'const A=({props})=><a href="x" {...props}>Go</a>;',
    ]) {
      expect(admitsCandidate(code), `must admit: ${code}`).toBe(true);
    }
  });
});

describe("the sr-only premise this whole feature rests on", () => {
  // NewTabHint renders `<span className="sr-only">`. If `sr-only` ever became display:none or
  // visibility:hidden, EVERY announcement in the app would go silent -- 15 hint sites -- and no
  // existing test would notice, because jsdom applies no CSS and the accname harness therefore
  // includes the text regardless of how the class is implemented. So the premise is checked
  // against the INSTALLED Tailwind rather than assumed.
  //
  // Verified 2026-07-26 against tailwindcss v4: position absolute, width/height 1px, padding 0,
  // margin -1px, overflow hidden, clip-path inset(50%), white-space nowrap, border-width 0 --
  // the clip technique, which keeps the element in the accessibility tree.
  it("sr-only is clip-based, never display:none or visibility:hidden", () => {
    const root = join(process.cwd(), "node_modules/tailwindcss");
    const candidates = [
      "utilities.css",
      "index.css",
      ...readdirSync(join(root, "dist")).map((f) => join("dist", f)),
    ];
    let body: string | null = null;
    for (const rel of candidates) {
      let text: string;
      try {
        text = readFileSync(join(root, rel), "utf8");
      } catch {
        continue;
      }
      // Match either the CSS form (`.sr-only { ... }`) or the compiled tuple form.
      const css = /\.sr-only\s*\{([^}]*)\}/.exec(text);
      if (css) {
        body = css[1]!;
        break;
      }
      // `[\s\S]` rather than the dotAll `/s` flag: this tsconfig targets below es2018 and `/s`
      // is a TS1501 error. Third time I have written `/s` here after tsc rejected it before --
      // running vitest without tsc is what hides it, since vitest strips types.
      const tuple = /sr-only"\s*,\s*(\[\[[\s\S]*?\]\])/.exec(text);
      if (tuple) {
        body = tuple[1]!;
        break;
      }
    }
    // FAIL CLOSED: if the utility cannot be located, that is a signal to re-verify by hand, not
    // a reason to pass. Tailwind's internal layout may change across majors.
    expect(
      body,
      "could not locate the sr-only utility in the installed tailwindcss -- re-verify by hand that it is clip-based, then update this test's candidate paths",
    ).not.toBeNull();
    const flat = (body ?? "").replace(/\s+/g, "");
    expect(flat, "sr-only must not use display:none").not.toMatch(/display.{0,4}none/i);
    expect(flat, "sr-only must not use visibility:hidden").not.toMatch(/visibility.{0,4}hidden/i);
    // And it must still actually hide visually, or the copy would be visible on screen.
    expect(flat, "sr-only must still clip").toMatch(/clip-path|clip/i);
  });
});
