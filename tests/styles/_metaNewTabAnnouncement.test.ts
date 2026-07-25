// Structural guard: see tests/styles/_newTabScan.ts for the scanner itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PHRASE,
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
    rejects(
      `const A = () => <a href="x" target="_blank">Go <span style={{ display: "none" }}><NewTabHint /></span></a>;`,
      /hidden from the accessible name/,
    );
  });

  it('discovers target={"_blank"} in an expression container', () => {
    rejects(`const A = () => <a href="x" target={"_blank"}>Go</a>;`, /does not announce/);
  });

  it("treats a both-branch conditional target as static and accepts a static announcement", () => {
    ok(`const A = ({e}) => <a href="x" target={e ? "_blank" : "_blank"}>Go <NewTabHint /></a>;`);
  });

  it("requires matching polarity for a true-branch conditional target", () => {
    ok(
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined}>Go <NewTabHint /></a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("requires NEGATED polarity for a false-branch conditional target", () => {
    ok(
      `const A = ({e}) => <a href="x" target={e ? undefined : "_blank"}>Go {!(e) ? <> <NewTabHint /></> : null}</a>;`,
    );
    rejects(
      `const A = ({e}) => <a href="x" target={e ? undefined : "_blank"}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
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
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined} aria-label="Go (opens in a new tab)">Go</a>;`,
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
    rejects(
      `const P = { target: "_blank" }; const A = () => <a href="x" {...P}>Go</a>;`,
      /does not announce/,
    );
  });

  it("fails closed on an unresolvable target expression", () => {
    rejects(`const A = ({t}) => <a href="x" target={t}>Go</a>;`, /not statically resolvable/);
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
      /not statically resolvable/,
    );
    // Once the resolver walks nested objects, a SINGLY-declared P resolves, so
    // this is now flagged as a real unannounced external link rather than as
    // unresolvable -- a strictly better outcome than failing closed.
    rejects(
      `const P = { target: "_blank" }; const A = ({e}) => <a href="x" {...(e ? P : {})}>Go</a>;`,
      /does not announce/,
    );
    // Ambiguity still fails closed: the same name declared twice is scope-blind.
    rejects(
      `function f(){ const P = { target: "_blank" }; return <a href="x" {...P}>Go</a>; } function g(){ const P = {}; return null; }`,
      /not statically resolvable/,
    );
  });

  it("R1-2 rejects a hint gated by a SUPERSET of the target predicate", () => {
    // external && ready is not external: with ready=false the tab opens silent.
    rejects(
      `const A = ({external,ready}) => <a href="x" target={external ? "_blank" : undefined}>Go {external && ready ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("R1-2 rejects an unconditional hint sitting beside a correctly gated one", () => {
    rejects(
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined}>Go <NewTabHint />{e ? <> <NewTabHint /></> : null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
  });

  it("R1-2 accepts equivalent predicate spellings", () => {
    ok(
      `const A = ({e}) => <a href="x" target={e ? undefined : "_blank"}>Go {!e ? <> <NewTabHint /></> : null}</a>;`,
    );
    ok(
      `const A = ({e}) => <a href="x" target={(e) ? "_blank" : undefined}>Go {e ? <> <NewTabHint /></> : null}</a>;`,
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
      `const A = ({e}) => <a href="x" target={e ? "_blank" : undefined} aria-label={e ? "Go (opens in a new tab)" : "Go"}>Go</a>;`,
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
      `const A=({e})=><a href="x" target={e?"_blank":undefined} aria-label={e?"Go":"Go (opens in a new tab)"}>Go</a>;`,
      /must announce in that label|does not announce|no destination/,
    );
    rejects(
      `const A=({e})=><a href="x" target={e?undefined:"_blank"} aria-label={e?"Go (opens in a new tab)":"Go"}>Go</a>;`,
      /must announce in that label|does not announce|no destination/,
    );
    ok(
      `const A=({e})=><a href="x" target={e?undefined:"_blank"} aria-label={e?"Go":"Go (opens in a new tab)"}>Go</a>;`,
    );
  });

  it("SC paren peeling must not equate genuinely different predicates", () => {
    rejects(
      `const A=({a,b})=><a href="x" target={a?"_blank":undefined}>Go {(b)?<> <NewTabHint /></>:null}</a>;`,
      /not gated by the anchor's effective _blank predicate/,
    );
    ok(
      `const A=({e})=><a href="x" target={((e))?"_blank":undefined}>Go {e?<> <NewTabHint /></>:null}</a>;`,
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
    rejects(`const A=({p})=><a href="x" target={p.target}>Go</a>;`, /not statically resolvable/);
    rejects(`const A=()=><a href="x" target={pick()}>Go</a>;`, /not statically resolvable/);
    rejects(`const A=()=><a href="x" {...build()}>Go</a>;`, /not statically resolvable/);
  });

  // ── Regression pins for whole-diff review R2 ────────────────────────────
  it("R2-1 label predicate must be the TARGET's, not any flag", () => {
    rejects(
      `const A=({e,ready})=><a href="x" target={e?"_blank":undefined} aria-label={ready?"Go (opens in a new tab)":"Go"}>Go</a>;`,
      /must announce in that label|does not announce/,
    );
    // Valid inverted spelling: !e chooses the other branch, still correct.
    ok(
      `const A=({e})=><a href="x" target={e?"_blank":undefined} aria-label={!e?"Go":"Go (opens in a new tab)"}>Go</a>;`,
    );
  });

  it("R2-1 predicate normalization must not collapse whitespace inside strings", () => {
    rejects(
      `const A=({mode})=><a href="x" target={mode === "x y" ? "_blank" : undefined}>Go {mode === "xy" ? <> <NewTabHint /></> : null}</a>;`,
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
    rejects(
      `const A=()=><a href="x" target="_blank" {...{ "aria-label": "Go" }}>Go <NewTabHint /></a>;`,
      /must announce in that label|naming override/,
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
      /hidden from the accessible name/,
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

  it("R2-7 an exhaustive ternary hint is unconditional, not a violation", () => {
    ok(`const A=({e})=><a href="x" target="_blank">Go {e ? <NewTabHint /> : <NewTabHint />}</a>;`);
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
      if (!code.includes("_blank")) continue;
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
      readFileSync(join(process.cwd(), rel), "utf8").includes("_blank"),
    );
    expect(offenders).toEqual([]);
  });
});
