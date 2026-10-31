/**
 * Structural coverage guard for the saved-copy marker (spec 4.3, 9; plan Task 19).
 *
 * The worker treats a page with no marker as `purge` (fail closed), so a crew
 * route surface that forgets its marker does not break visibly: it drops a copy
 * that should have stayed, or never purges one it should have. This guard walks
 * every `.tsx` under the route with the TypeScript parser and asserts, of the
 * JSX itself:
 *   - every `<TerminalFailure>` element passes a `savedCopy` attribute;
 *   - each sibling surface (ShowUnavailable, not-found, error, the picker and
 *     the sign-in-or-skip gate) renders exactly one `<SavedCopyMarker>`;
 *   - `_CrewShell.tsx` renders `<SavedCopySlot>` exactly once.
 *
 * The parser, not a pattern over the text: `_CrewShell.tsx` names a
 * `<TerminalFailure ... />` in a doc comment, which a text scan would count as
 * a bare site.
 *
 * Premises: the walk found `page.tsx` and saw at least ten `TerminalFailure`
 * elements (plan sweep S1 after Task 18), so a renamed root or a broken walk
 * fails instead of passing on nothing.
 *
 * Mutation families (plan section 9, the closed set): the attribute removed from
 * one site; the marker removed from one sibling; a new `TerminalFailure` added
 * without the attribute; the walk root renamed.
 *
 * Documented limits (outside that closed set, recorded here rather than guarded):
 *   - The guard checks that `savedCopy` is present, not what it holds, so
 *     `savedCopy={undefined}` passes. The per-arm render cases in
 *     tests/show/savedCopyMarkerArms.test.tsx pin each arm's value.
 *   - SIBLINGS is a hand-listed set. A new page-level surface that renders
 *     neither a `TerminalFailure` nor a listed sibling is not caught; adding
 *     one means adding it here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

const ROUTE_ROOT = "app/show/[slug]/[shareToken]";

/** The route's surfaces that render outside both `<TerminalFailure>` and `<CrewShell>` (spec 4.3). */
const SIBLINGS = [
  "ShowUnavailable.tsx",
  "not-found.tsx",
  "error.tsx",
  "_PickerInterstitial.tsx",
  "_SignInOrSkipGate.tsx",
].map((name) => `${ROUTE_ROOT}/${name}`);

const PAGE = `${ROUTE_ROOT}/page.tsx`;
const CREW_SHELL = `${ROUTE_ROOT}/_CrewShell.tsx`;

/** At least this many `<TerminalFailure>` elements exist under the route (sweep S1 after Task 18). */
const TERMINAL_FAILURE_FLOOR = 10;

/** One JSX opening or self-closing element, with the names of its plain (non-spread) attributes. */
type JsxSite = { file: string; line: number; tag: string; attributes: readonly string[] };

function jsxSites(file: string, text: string): JsxSite[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites: JsxSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      sites.push({
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        tag: node.tagName.getText(source),
        // A spread could carry anything; only a named attribute counts.
        attributes: node.attributes.properties.flatMap((property) =>
          ts.isJsxAttribute(property) ? [property.name.getText(source)] : [],
        ),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function count(sites: readonly JsxSite[], file: string, tag: string): number {
  return sites.filter((site) => site.file === file && site.tag === tag).length;
}

/** The walk over the live route, with the premises that make a green here mean something. */
function routeScan(): { files: string[]; sites: JsxSite[]; terminalFailures: JsxSite[] } {
  const files = tsxFiles(ROUTE_ROOT);
  premiseHolds(`the walk under ${ROUTE_ROOT} found ${PAGE}`, files.includes(PAGE));
  const sites = files.flatMap((file) => jsxSites(file, readFileSync(file, "utf8")));
  const terminalFailures = sites.filter((site) => site.tag === "TerminalFailure");
  premise(
    "the walk saw at least the TerminalFailure elements sweep S1 lists",
    terminalFailures.length,
    TERMINAL_FAILURE_FLOOR - 1,
  );
  return { files, sites, terminalFailures };
}

describe("the scanner reads JSX elements, not text", () => {
  test("a TerminalFailure in a comment or a string is not a site", () => {
    const text = [
      "// <TerminalFailure code='X' />",
      "/** <TerminalFailure code='X' /> */",
      "const s = \"<TerminalFailure code='X' />\";",
    ].join("\n");
    expect(jsxSites("probe.tsx", text)).toEqual([]);
  });

  test("a bare element and one with the attribute are told apart", () => {
    const text = [
      "const a = <TerminalFailure code='X' />;",
      "const b = <TerminalFailure code='X' savedCopy={m} />;",
      "const c = <TerminalFailure {...props} />;",
    ].join("\n");
    expect(
      jsxSites("probe.tsx", text).map(({ line, attributes }) => ({ line, attributes })),
    ).toEqual([
      { line: 1, attributes: ["code"] },
      { line: 2, attributes: ["code", "savedCopy"] },
      { line: 3, attributes: [] },
    ]);
  });

  test("an element with children counts once, by its opening tag", () => {
    const text = "const a = <SavedCopyMarker marker={m}></SavedCopyMarker>;";
    expect(count(jsxSites("probe.tsx", text), "probe.tsx", "SavedCopyMarker")).toBe(1);
  });
});

describe(`the crew show route (${ROUTE_ROOT})`, () => {
  test("every TerminalFailure element passes a savedCopy marker", () => {
    const { terminalFailures } = routeScan();
    const bare = terminalFailures
      .filter((site) => !site.attributes.includes("savedCopy"))
      .map((site) => `${site.file}:${site.line}`);
    expect(bare, "TerminalFailure elements with no savedCopy attribute").toEqual([]);
  });

  test("each sibling surface renders exactly one SavedCopyMarker", () => {
    const { files, sites } = routeScan();
    const found = Object.fromEntries(
      SIBLINGS.map((file) => [
        file,
        files.includes(file) ? count(sites, file, "SavedCopyMarker") : "missing",
      ]),
    );
    expect(found).toEqual(Object.fromEntries(SIBLINGS.map((file) => [file, 1])));
  });

  test("_CrewShell.tsx renders SavedCopySlot exactly once", () => {
    const { files, sites } = routeScan();
    premiseHolds(`the walk found ${CREW_SHELL}`, files.includes(CREW_SHELL));
    expect(count(sites, CREW_SHELL, "SavedCopySlot")).toBe(1);
  });
});
