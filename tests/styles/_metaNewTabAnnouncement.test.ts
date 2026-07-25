// Structural guard: see tests/styles/_newTabScan.ts for the scanner itself.
import { readdirSync, readFileSync } from "node:fs";
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
]);

/** Attributes that can affect an element's computed accessible name or its visibility, from an
 *  EXTERNAL authority rather than from this repo: HTML global attributes, `<a>` attributes, `role`,
 *  every ARIA state/property, and the two JSX aliases (`className`, `htmlFor`). Deliberately a
 *  closed list -- it is the one input to the casing sweep that does not depend on reading our own
 *  source, which is what makes the sweep immune to reading form. An attribute outside this list
 *  cannot change an accessible name, so its casing cannot cause the defect being guarded. */
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
  // Attribute VALUES and unrelated identifiers, never compared as names.
  ["false", "attribute value"],
  ["presentation", "role value"],
  ["typescript", "module name"],
  ["undefined", "JS identifier name, not an attribute (R22: literal-expression evaluation)"],
]);

// ── Synthetic scanner self-tests (§6 requirement 7) ────────────────────────
// Without these the guard is unfalsifiable: the live tree exercises only
// literal targets and true-polarity spreads.
describe("scanner self-test: synthetic fixtures prove discovery and each branch", () => {
  const probe = (code: string): Scan => {
    const sc: Scan = { anchors: 0, violations: [] };
    scanSource(parse("/synthetic/probe.tsx", code), "/synthetic/probe.tsx", sc);
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
      /must announce in that label/,
    );
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
  });

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
        // Group B label sites (§4).
        "app/admin/show/[slug]/CrewPageLink.tsx",
        "components/admin/showpage/PublishedReviewModal.tsx",
        "components/admin/wizard/Step3ReviewModal.tsx",
        "components/admin/wizard/step3ReviewSections.tsx",
        "components/crew/primitives/SourceLink.tsx",
        // The two labels that already announced before this sweep (§2).
        "components/admin/wizard/Step3SheetCard.tsx",
        "components/admin/wizard/VenueMapTile.tsx",
      ].sort(),
    );
  });

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
  });

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
  const scanned = new Set(["mdx-components.tsx"]);
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
  });

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
  const probe = (code: string): Scan => {
    const sc: Scan = { anchors: 0, violations: [] };
    scanSource(parse("/synthetic/probe.tsx", code), "/synthetic/probe.tsx", sc);
    return sc;
  };
  const violations = (code: string): string[] => probe(code).violations.map((v) => v.reason);

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
    // consulted -- and an attribute outside this list cannot change an accessible name, so
    // casing there cannot cause the defect this guard exists to prevent.
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
  });

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
      'const A=()=><a href="x" target="_blank"><Label /> <NewTabHint /></a>;',
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
    // Props on a CUSTOM component are ordinary JS keys and case-sensitive.
    expect(
      violations(
        `const A=()=><UI.Link href="x" target="_blank" Mode="one" mode="two">Go <NewTabHint /></UI.Link>;`,
      ),
    ).toEqual([]);
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
