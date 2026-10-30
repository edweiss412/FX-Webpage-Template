/**
 * tests/components/offline/savedCopyBarTransitionAudit.test.ts
 *
 * Structural transition audit for `components/offline/SavedCopyBar.tsx`, the
 * pinned saved-copy bar (spec 4.7.2 Transition Inventory). Modelled on
 * tests/components/auth/avatarMenuTransitionAudit.test.ts, whose header says
 * why the census is the TypeScript AST and not a regex, and why the check is a
 * bijection keyed on `text + after + within` rather than a count.
 *
 * The inventory has one animated direction, `updated` to `hidden` when the
 * 4-second window ends, which fades on the duration-normal token. Everything
 * else is instant. So every conditional in the file carries a declared
 * treatment here (the region's render and the visible bar's included, since
 * both live in this file), and the fade's classes are the only transition or
 * duration class the file contains. The behavioural half, every pair driven
 * through the bar, is savedCopyBarTransitions.test.tsx.
 *
 * Failure modes caught: a conditional added to the bar with no declared
 * treatment, or deleted with its row left behind; a row that matches more
 * than one conditional, so deleting one twin stays green; a transition or
 * duration class anywhere but the fade, on the region above all; the fade's
 * classes moved off the bar or ungated from the fade; and the fade's fallback
 * timer drifting from the token the fade runs on.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { premise, premiseHolds } from "../../_shared/premise";

const FILE = join("components", "offline", "SavedCopyBar.tsx");
const SOURCE = readFileSync(join(process.cwd(), FILE), "utf8");
const GLOBALS_CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function parse(): ts.SourceFile {
  return ts.createSourceFile(FILE, SOURCE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

interface Site {
  readonly kind: "if" | "ternary" | "switch" | "logical";
  readonly line: number;
  readonly text: string;
  /** The statement that follows this one in its block, or "". */
  readonly after: string;
  /** A slice of the enclosing node, for sites `after` cannot separate. */
  readonly within: string;
}

/** The match key a DECLARED marker is tested against. */
function siteKey(site: Site): string {
  return `${site.text}\u0000${site.after}\u0000${site.within}`;
}

/** Every logical operator is a branch (the precedent's header says why). */
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken]);

/** Every conditional site in the component, from the AST. */
function conditionalSites(): Site[] {
  const src = parse();
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    let kind: Site["kind"] | null = null;
    if (ts.isIfStatement(node)) kind = "if";
    else if (ts.isConditionalExpression(node)) kind = "ternary";
    else if (ts.isSwitchStatement(node)) kind = "switch";
    else if (ts.isBinaryExpression(node) && LOGICAL.has(node.operatorToken.kind)) {
      kind = "logical";
    }
    if (kind !== null) {
      let after = "";
      const parent = node.parent;
      if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
        const statements = parent.statements;
        const index = statements.indexOf(node as ts.Statement);
        if (index >= 0 && index + 1 < statements.length) {
          after = statements[index + 1]!.getText(src).replace(/\s+/g, " ").slice(0, 60);
        }
      }
      sites.push({
        kind,
        line: src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1,
        text: node.getText(src).replace(/\s+/g, " "),
        after,
        within: (node.parent?.getText(src) ?? "").replace(/\s+/g, " ").slice(0, 120),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return sites;
}

/** Every conditional in the bar, with its spec 4.7.2 treatment. */
const DECLARED = [
  // ── Module helpers ──
  {
    id: "B1",
    what: "a broadcast that is not an object is not fresh-ready",
    marker: /^if \(typeof data !== "object" \|\| data === null\) return false;/,
    treatment: "not a render branch; a probe trigger's filter",
  },
  {
    id: "B2",
    what: "the not-an-object test: a primitive OR null",
    marker: /^typeof data !== "object" \|\| data === null\u0000/,
    treatment: "not a render branch; the disjunction inside B1",
  },
  {
    id: "B3",
    what: "fresh-ready for this page's path only",
    marker: /^message\.type === "fresh-ready" && message\.url === path\u0000/,
    treatment: "not a render branch; a probe trigger's filter",
  },
  {
    id: "B4",
    what: "no session flag means no updated",
    marker: /^if \(window\.sessionStorage\.getItem\(UPDATED_FLAG\) === null\) return false;/,
    treatment: "not a render branch; it decides whether updated is ever an input",
  },
  {
    id: "B5",
    what: "no rendered section leaves the URL alone",
    marker: /^if \(section === undefined \|\| section === null \|\| section === ""\) return;/,
    treatment: "not a render branch; the URL, not the bar",
  },
  {
    id: "B6",
    what: "the no-section test: undefined, null OR empty",
    marker: /^section === undefined \|\| section === null \|\| section === ""\u0000/,
    treatment: "not a render branch; the disjunction inside B5",
  },
  {
    id: "B6a",
    what: "the left-associative half of that disjunction, which the AST reports separately",
    marker: /^section === undefined \|\| section === null\u0000/,
    treatment: "not a branch of its own; declared so the census stays exact",
  },
  {
    id: "B7",
    what: "a URL whose s already names the section is not rewritten",
    marker: /^if \(url\.searchParams\.get\("s"\) === section\) return;/,
    treatment: "not a render branch; the URL, not the bar",
  },
  // ── SavedCopyBarView: the region and the bar ──
  {
    id: "V1",
    what: "the icon for the view, or none for hidden",
    marker: /^view === null \|\| view\.icon === null \? null : ICONS\[view\.icon\]\u0000/,
    treatment: "instant; hidden is the one state with no icon",
  },
  {
    id: "V2",
    what: "no view yet OR the hidden view",
    marker: /^view === null \|\| view\.icon === null\u0000/,
    treatment: "not a render branch itself; the disjunction inside V1",
  },
  {
    id: "V3",
    what: "the visible bar renders inside the always-mounted region only with a view and an icon",
    marker: /^view !== null && Icon !== null && \( <div data-testid="saved-copy-bar"/,
    treatment:
      "instant for every pair; the region never unmounts, and only updated to hidden leaves through the fade (V5)",
  },
  {
    id: "V4",
    what: "a view AND an icon",
    marker: /^view !== null && Icon !== null\u0000/,
    treatment: "not a render branch itself; the conjunction inside V3",
  },
  {
    id: "V5",
    what: "the fade's classes, on the bar, only while fading",
    marker: /^fading && "opacity-0 transition-opacity duration-normal"\u0000/,
    treatment:
      "F: updated to hidden fades on duration-normal; the token collapses to 0 under reduced motion",
  },
  {
    id: "V6",
    what: "only the bar's own transitionend ends the fade",
    marker: /^if \(event\.target === event\.currentTarget\) onFadeEnd\(\);/,
    treatment: "not a render branch; a transition inside the bar is not the fade",
  },
  {
    id: "V7",
    what: "the updating icon spins, and holds still under reduced motion",
    marker: /^view\.icon === "sync" && "animate-spin motion-reduce:animate-none"\u0000/,
    treatment: "an animation inside one state, not a transition between two",
  },
  {
    id: "V8",
    what: "the bold lead renders only when the view has one",
    marker: /^view\.lead !== null && \( <>/,
    treatment: "instant; updated is the one state with no lead",
  },
  // ── SavedCopyBar: the container ──
  {
    id: "C1",
    what: "the mount effect consumes the session flag",
    marker: /^if \(takeUpdatedFlag\(\)\) setJustUpdated\(true\);/,
    treatment: "not a render branch; updating to updated crosses a reload, so it is a new document",
  },
  {
    id: "C2",
    what: "only a saved copy rewrites the URL",
    marker: /^if \(first\.mode !== "live"\) showRenderedSectionInUrl\(\);/,
    treatment: "not a render branch; the URL, not the bar",
  },
  {
    id: "C3",
    what: "the 4-second window's timer runs only while updated is an input",
    marker: /^if \(!justUpdated\) return;\u0000/,
    treatment: "not a render branch; its end starts the fade",
  },
  {
    id: "C4",
    what: "the fade's fallback timer runs only while a fade runs",
    marker: /^if \(fadeUnder === null\) return;\u0000/,
    treatment: "not a render branch; it ends the fade when no transitionend comes",
  },
  {
    id: "C5",
    what: "html is marked once the bar has its readings",
    marker: /^if \(hasReading\) document\.documentElement\.setAttribute/,
    treatment: "instant; the worker's CSS notice goes in the frame the bar arrives",
  },
  {
    id: "C6",
    what: "no mode before the first reading",
    marker: /^if \(reading !== null\) \{/,
    treatment: "instant; the hydrating render is hidden, as the server's is",
  },
  {
    id: "C7",
    what: "a new renderedAt means an RSC refresh, so the mode is live",
    marker: /^if \(renderedAt !== mountRenderedAt\) mode = "live";/,
    treatment: "instant, to whatever the live inputs give",
  },
  {
    id: "C8",
    what: "an ended reply makes the mode ended",
    marker: /^if \(recovery === "ended"\) mode = "ended";/,
    treatment: "instant",
  },
  {
    id: "C9",
    what: "a probe runs only on a recoverable saved copy with no recovery under way",
    marker: /^mode !== null && PROBE_MODES\.has\(mode\) && recovery === "idle"\u0000/,
    treatment: "not a render branch; arming, not painting",
  },
  {
    id: "C9a",
    what: "the left-associative half of that conjunction, which the AST reports separately",
    marker: /^mode !== null && PROBE_MODES\.has\(mode\)\u0000/,
    treatment: "not a branch of its own; declared so the census stays exact",
  },
  {
    id: "C10",
    what: "the probe effect is inert while not probing",
    marker: /^if \(!probing\) return;\u0000/,
    treatment: "not a render branch",
  },
  {
    id: "C11",
    what: "one probe at a time",
    marker: /^if \(inFlight\) return;\u0000/,
    treatment: "not a render branch; a second online event during a probe starts none",
  },
  {
    id: "C12",
    what: "a reply the page no longer owns is dropped",
    marker: /^if \(cancelled\) return;\u0000/,
    treatment: "not a render branch; an RSC refresh during updating cancels the recovery",
  },
  {
    id: "C13",
    what: "a saved reply shows updating, writes the flag and reloads",
    marker: /^if \(outcome === "saved"\) \{/,
    treatment: "instant, to updating",
  },
  {
    id: "C14",
    what: "a purged reply reloads at once",
    marker: /^if \(outcome === "purged"\) \{/,
    treatment: "no state change; the reload is a new document",
  },
  {
    id: "C15",
    what: "an ended reply shows ended",
    marker: /^if \(outcome === "ended"\) \{/,
    treatment: "instant, to ended",
  },
  {
    id: "C16",
    what: "the 30-second probe timer runs only with a connection",
    marker:
      /^navigator\.onLine \? window\.setInterval\(probe, PROBE_INTERVAL_MS\) : undefined\u0000/,
    treatment: "not a render branch",
  },
  {
    id: "C17",
    what: "a fresh-ready broadcast for this page probes",
    marker: /^if \(isFreshReadyFor\(event\.data, window\.location\.pathname\)\) probe\(\);/,
    treatment: "not a render branch",
  },
  {
    id: "C18",
    what: "the bar's inputs exist once there is a reading and a mode",
    marker: /^if \(reading !== null && mode !== null\) \{/,
    treatment: "instant; before them the region renders empty",
  },
  {
    id: "C19",
    what: "a reading AND a mode",
    marker: /^reading !== null && mode !== null\u0000/,
    treatment: "not a render branch itself; the conjunction inside C18",
  },
  {
    id: "C20",
    what: "a live page ages from its render time, a saved copy from its save time",
    marker: /^mode === "live" \? renderedAt : reading\.savedAt\u0000/,
    treatment: "instant; the age tick crossing 6 hours is saved-fresh to saved-old",
  },
  {
    id: "C21",
    what: "updating is an input only on a page that is not live",
    marker: /^recovery === "updating" && mode !== "live"\u0000/,
    treatment: "instant; an RSC refresh during updating renders the live inputs",
  },
  {
    id: "C22",
    what: "the inputs as a key, the identity a fade runs under",
    marker: /^inputs === null \? null : JSON\.stringify\(inputs\)\u0000/,
    treatment:
      "not a render branch itself; any input change gives a new key, which cancels the fade",
  },
  {
    id: "C23",
    what: "the view is derived once the inputs exist",
    marker: /^if \(inputs !== null\) \{/,
    treatment: "instant",
  },
  {
    id: "C24",
    what: "the fade runs only under the inputs the window ended with, and never under reduced motion",
    marker: /^if \(fadeUnder === inputsKey && reducedMotion === false\) \{/,
    treatment:
      "F, or instant under reduced motion; an input change during the fade renders the new state at once",
  },
  {
    id: "C25",
    what: "the same inputs AND no reduced-motion preference",
    marker: /^fadeUnder === inputsKey && reducedMotion === false\u0000/,
    treatment: "not a render branch itself; the conjunction inside C24",
  },
  {
    id: "C26",
    what: "only a window that ended on updated fades",
    marker: /^if \(leaving\.state === "updated"\) \{/,
    treatment: "F; a window that ends under a higher state fades nothing",
  },
] as const;

/** Every string literal in the file, with its node, outside comments by construction. */
function stringLiterals(): ts.StringLiteralLike[] {
  const src = parse();
  const found: ts.StringLiteralLike[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

/** A class token naming a transition or a duration, prefixed variants included. */
const MOTION_CLASS = /(^|[\s:])(transition|duration)(-[\w-]+)?(?=\s|$)/;

/** The JSX element whose attribute list contains `node`, or null. */
function owningElement(node: ts.Node): ts.JsxOpeningLikeElement | null {
  for (let current: ts.Node | undefined = node; current !== undefined; current = current.parent) {
    if (ts.isJsxAttribute(current)) {
      const element = current.parent.parent;
      return ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element)
        ? element
        : null;
    }
  }
  return null;
}

function testIdOf(element: ts.JsxOpeningLikeElement): string | null {
  for (const attribute of element.attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === "data-testid" &&
      attribute.initializer !== undefined &&
      ts.isStringLiteral(attribute.initializer)
    ) {
      return attribute.initializer.text;
    }
  }
  return null;
}

describe("SavedCopyBar transition audit (spec 4.7.2)", () => {
  test("the AST census finds a real population", () => {
    const sites = conditionalSites();
    // Premise: an empty or tiny parse would make every assertion below vacuous.
    premise("the bar parses to a real conditional population", sites.length, 20);
    for (const kind of ["if", "ternary", "logical"] as const) {
      expect(
        sites.some((s) => s.kind === kind),
        `${kind} sites are seen`,
      ).toBe(true);
    }
  });

  test.each(DECLARED)("$id matches EXACTLY ONE conditional", ({ marker }) => {
    const matched = conditionalSites().filter((s) => marker.test(siteKey(s)));
    expect(matched.map((m) => `${FILE}:${m.line}`)).toHaveLength(1);
  });

  test("every conditional is claimed by EXACTLY ONE row", () => {
    const offenders = conditionalSites()
      .map((s) => ({ s, rows: DECLARED.filter((d) => d.marker.test(siteKey(s))) }))
      .filter((x) => x.rows.length !== 1)
      .map(
        (x) =>
          `${FILE}:${x.s.line} [${x.s.kind}] claimed by ${x.rows.length} rows ` +
          `(${x.rows.map((r) => r.id).join(", ") || "none"}): ${x.s.text.slice(0, 70)}`,
      );
    expect(offenders, "each conditional needs exactly one DECLARED row").toEqual([]);
  });

  test("the row count equals the site count", () => {
    expect(DECLARED.length).toBe(conditionalSites().length);
  });

  test("every declared row has a treatment", () => {
    for (const row of DECLARED) expect(row.treatment.length, row.id).toBeGreaterThan(0);
  });

  test("no transition or duration class anywhere but the fade, and the fade sits on the bar", () => {
    const literals = stringLiterals();
    // Premise: the walk reaches the class strings at all, the region's among them.
    premise("the file has a real string-literal population", literals.length, 10);
    premiseHolds(
      "the walk sees the region's layout classes",
      literals.some((l) => l.text === "sticky top-0 z-raised flex-none self-stretch"),
    );

    const motion = literals.filter((l) => MOTION_CLASS.test(l.text));
    expect(
      motion.map((l) => l.text),
      "string literals naming a transition or duration class",
    ).toEqual(["opacity-0 transition-opacity duration-normal"]);

    // Gated on the fade, inside the bar's className, and nowhere else.
    const fade = motion[0]!;
    const gate = fade.parent;
    expect(
      ts.isBinaryExpression(gate) &&
        gate.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        gate.left.getText() === "fading",
      "the fade's classes are gated on `fading`",
    ).toBe(true);
    const element = owningElement(fade);
    expect(element === null ? null : testIdOf(element)).toBe("saved-copy-bar");
  });

  test("the fade's fallback timer is the duration-normal token it runs on", () => {
    const src = parse();
    const values: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(src) === "UPDATED_FADE_FALLBACK_MS" &&
        node.initializer !== undefined &&
        ts.isNumericLiteral(node.initializer)
      ) {
        values.push(node.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
    expect(values, "one numeric-literal UPDATED_FADE_FALLBACK_MS").toHaveLength(1);

    const token = /--duration-normal:\s*(\d+)ms;/.exec(GLOBALS_CSS);
    premiseHolds("app/globals.css defines --duration-normal in ms", token !== null);
    expect(Number(values[0]!.replace(/_/g, ""))).toBe(Number(token![1]));
  });
});
