// Structural guard: see tests/styles/_newTabScan.ts for the scanner itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PHRASE,
  admitsCandidate,
  mdxForbidden,
  parse,
  scanSource,
  stripCommentsSafely,
  walkFiles,
  type Scan,
} from "@/tests/styles/_newTabScan";

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

  it("covers <Link> and ignores non-link components carrying target", () => {
    rejects(`const A = () => <Link href="x" target="_blank">Go</Link>;`, /does not announce/);
    const sc = probe(`const A = () => <Tabs target="_blank" />;`);
    expect(sc.anchors, "non-link component must not be treated as an anchor").toBe(0);
    expect(sc.violations).toEqual([]);
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

  it("no .mdx file carries an external target (move such links into a .tsx component)", () => {
    const mdx = walkFiles(join(process.cwd(), "app"), /\.mdx$/).map((abs) =>
      abs.slice(process.cwd().length + 1),
    );
    expect(mdx.length, "mdx inventory should not be empty").toBeGreaterThan(0);
    const offenders = mdx.filter((rel) =>
      mdxForbidden(readFileSync(join(process.cwd(), rel), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  // R6 BLOCKING 2: the .mdx rule only tested /_blank/i, so `target={dest}` and
  // `{...externalProps}` evaded it -- either can resolve to _blank at runtime, and
  // MDX never reaches scanSource. MDX gets NO target attribute and NO spread at
  // all; such a link belongs in a .tsx component the scanner can classify.
  it("R6 the .mdx rule rejects dynamic targets and spreads, not just literal _blank", () => {
    for (const bypass of [
      "<a target={destination}>Go</a>",
      "<a {...externalProps}>Go</a>",
      '<a target="_BLANK">Go</a>',
      '<a target="_blank">Go</a>',
    ]) {
      expect(mdxForbidden(bypass), `MDX rule must reject: ${bypass}`).toBe(true);
    }
    // Ordinary internal MDX links stay legal.
    expect(mdxForbidden('<a href="/help">Go</a>')).toBe(false);
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
    // MDX: @mdx-js/mdx compiles all three comment-separated forms to real spreads.
    for (const mdx of [
      "<a { /*c*/ ...props}>Go</a>",
      "<a { //c\n ...props}>Go</a>",
      "<a {\n/*c*/\n...props}>Go</a>",
      "<a TARGET={dest}>Go</a>",
    ]) {
      expect(mdxForbidden(mdx), `mdxForbidden must reject: ${mdx}`).toBe(true);
    }
    // Ordinary MDX prose containing a URL must NOT be flagged: the `//` in
    // `https://` is why the nets test raw text as well as a comment-stripped copy.
    expect(mdxForbidden("See [the docs](https://example.com/a) for details.")).toBe(false);
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
    // But `target` WITHOUT `href` is not a URL target: <Tabs target="x" /> selects a
    // tab. Requiring the pair is what keeps that pin (line 231) true.
    const tabs = probe(`const A = () => <Tabs target="_blank" />;`);
    expect(tabs.anchors, "a non-URL target prop must not become an anchor").toBe(0);
  });

  // R8 MEDIUM 3: the MDX net matched `target =` anywhere, including prose and a
  // GFM autolink query string, neither of which compiles to a target attribute.
  it("R8 the MDX net does not flag prose or autolinks", () => {
    expect(mdxForbidden("The target = 80% of the quarterly goal.")).toBe(false);
    expect(mdxForbidden("Read https://example.com/search?target=crew for details.")).toBe(false);
    // Still catches the real thing inside a tag, including across a line break.
    expect(mdxForbidden('<a href="x" target="_blank">Go</a>')).toBe(true);
    expect(mdxForbidden('<a\n  href="x"\n  target={dest}\n>Go</a>')).toBe(true);
  });

  // The near-miss that motivates this guard: `attrName` lowercases, so every
  // comparison literal must be lowercase too. One camelCase literal survived the
  // first sweep and silently reopened the dynamic-className hole.
  it("no attribute-name comparison uses a non-lowercase literal", () => {
    const src = stripCommentsSafely(
      readFileSync(join(process.cwd(), "tests/styles/_newTabScan.ts"), "utf8"),
    );
    const offenders = [...src.matchAll(/\b(?:n|nm)\s*(?:===|!==)\s*"([^"]+)"/g)]
      .map((m) => m[1]!)
      .filter((lit) => lit !== lit.toLowerCase());
    expect(offenders, "attribute-name literals must be lowercase").toEqual([]);
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
