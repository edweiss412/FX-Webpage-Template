/**
 * BL-FONT-STYLESHEET-GRAPH-FIDELITY — the BUILT CSS artifact is the oracle; the
 * source walk is the fast pre-check.
 *
 * THE GAP, AND WHY IT HAD NO EXECUTABLE PROBE UNTIL NOW. `fontLoading.test.ts`
 * asserts that no stylesheet besides `app/fonts.css` declares an `@font-face`, by
 * walking source CSS and following `@import` chains. Two ways a face reaches the
 * shipped page without ever appearing in that walk were identified in the R4
 * review and recorded as LABELS — `DEPENDENCY_INTERNAL_CSS_ESCAPE` and
 * `PACKAGE_EXPORT_CSS_ESCAPE` — with no runnable artifact behind either. This
 * file reconstructs both as committed fixtures and asserts the property that
 * matters: each is invisible to the source walk and visible to the artifact
 * oracle.
 *
 *   dep-internal-css   a package whose JS entry imports its OWN stylesheet. No
 *                      CSS file anywhere names that stylesheet, so no @import
 *                      chain reaches it.
 *   exports-subpath    a stylesheet resolved through a package `exports` map, so
 *                      the specifier is not a path and no filesystem walk keyed
 *                      on it finds the file.
 *
 * RATIFIED: assert against the BUILT ARTIFACT (spec §1.1 item 3), not a resolved
 * module graph. The production build's emitted CSS is ground truth — whatever
 * reached it is what a reader downloads, regardless of which resolution
 * mechanism put it there. CSS-in-JS coverage is a CONSEQUENCE of reading emitted
 * CSS, not a separately-probed claim.
 *
 * WHERE IT RUNS. `dev-gate-e2e.yml` already produces a production build, so the
 * artifact rows run there with `FONT_ARTIFACT_DIR` pointed at `.next-prod`.
 * Without that variable the artifact case SKIPS BY PREMISE, named rather than
 * silent, so `unit-suite` stays build-free. The fixture rows — which are the
 * escape proof — run everywhere.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { familyOf, parseFontFaces } from "../helpers/fontCss";

const REPO_ROOT = join(__dirname, "..", "..");
const FIXTURES = join(REPO_ROOT, "tests", "styles", "__fixtures__", "font-escapes");

/** The one face the product ships, plus its size-adjust fallback. */
const EXPECTED_FAMILIES = new Set(["Inter", "Inter Fallback"]);

/**
 * Every `@font-face` family declared by any `*.css` under `dir`, with the file
 * that declared it.
 *
 * THE ORACLE. It reads EMITTED CSS and asks only what is in it — no resolution,
 * no import following, no knowledge of how a rule got there. That is precisely
 * why both escapes are visible to it and neither is visible to the source walk.
 */
export function facesInEmittedCss(dir: string): Array<{ family: string; file: string }> {
  const out: Array<{ family: string; file: string }> = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.name.endsWith(".css")) continue;
      for (const face of parseFontFaces(readFileSync(abs, "utf8"), { errorRecovery: true })) {
        out.push({ family: familyOf(face), file: relative(dir, abs) });
      }
    }
  };
  walk(dir);
  return out;
}

/** A scratch directory holding the given CSS files, as an emitted build would. */
function emittedDirWith(files: Array<{ name: string; text: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "font-artifact-"));
  for (const f of files) writeFileSync(join(dir, f.name), f.text);
  return dir;
}

const readFixture = (...parts: string[]): string => readFileSync(join(FIXTURES, ...parts), "utf8");

const DEP_INTERNAL_CSS = readFixture(
  "dep-internal-css",
  "node_modules",
  "dep-internal-css",
  "internal.css",
);
const EXPORTS_SUBPATH_CSS = readFixture(
  "exports-subpath",
  "node_modules",
  "exports-subpath",
  "styles",
  "theme.css",
);

describe("font faces in the BUILT CSS artifact", () => {
  it("premise: both escape fixtures exist and actually declare a face", () => {
    // Without this, a fixture that silently lost its @font-face would make the
    // "the oracle sees it" rows below pass against nothing, and the
    // "the walk misses it" rows pass trivially — the guard would report full
    // coverage of two escapes it no longer models
    // (tests/_shared/premise.ts shape).
    expect(parseFontFaces(DEP_INTERNAL_CSS).map(familyOf)).toEqual(["DepInternalFace"]);
    expect(parseFontFaces(EXPORTS_SUBPATH_CSS).map(familyOf)).toEqual(["ExportsSubpathFace"]);
  });

  it("ESCAPE 1 — a dependency-internal stylesheet is unreachable by any @import chain", () => {
    // The mechanism, asserted on the fixture rather than described: the app's own
    // CSS contains no @import at all, and the only thing naming the dependency's
    // stylesheet is JAVASCRIPT. A walk over CSS import chains has nothing to
    // follow, which is exactly why this face never appears in the source scan.
    const appCss = readFixture("dep-internal-css", "app.css");
    expect(appCss).not.toMatch(/@import/);
    expect(appCss).not.toMatch(/internal\.css/);
    expect(readFixture("dep-internal-css", "entry.js")).toContain('import "dep-internal-css"');
    expect(
      readFixture("dep-internal-css", "node_modules", "dep-internal-css", "index.js"),
    ).toContain('import "./internal.css"');
  });

  it("ESCAPE 2 — an exports-subpath stylesheet is not named by any path", () => {
    // The specifier is `exports-subpath/theme`. There is no such file: the
    // package's `exports` map resolves it to styles/theme.css. A walk keyed on
    // the literal specifier finds nothing, and again no CSS names the file.
    const appCss = readFixture("exports-subpath", "app.css");
    expect(appCss).not.toMatch(/@import/);
    expect(readFixture("exports-subpath", "entry.js")).toContain('import "exports-subpath/theme"');
    const pkg = JSON.parse(
      readFixture("exports-subpath", "node_modules", "exports-subpath", "package.json"),
    ) as { exports: Record<string, string> };
    expect(pkg.exports["./theme"]).toBe("./styles/theme.css");
    expect(
      existsSync(join(FIXTURES, "exports-subpath", "node_modules", "exports-subpath", "theme")),
    ).toBe(false);
  });

  it("the oracle SEES both escapes once they reach emitted CSS", () => {
    // The inversion of the two rows above, and the whole point of the ratified
    // design: the oracle does not care how a rule arrived. Fed the emitted CSS
    // these packages would contribute, it reports both faces by name.
    const dir = emittedDirWith([
      { name: "a.css", text: DEP_INTERNAL_CSS },
      { name: "b.css", text: EXPORTS_SUBPATH_CSS },
    ]);
    const families = facesInEmittedCss(dir)
      .map((f) => f.family)
      .sort();
    expect(families).toEqual(["DepInternalFace", "ExportsSubpathFace"]);
  });

  it("the oracle reports an unexpected family by name, with its file", () => {
    const dir = emittedDirWith([
      { name: "ok.css", text: '@font-face{font-family:"Inter";src:url("i.woff2")}' },
      { name: "nested/../bad.css", text: DEP_INTERNAL_CSS },
    ]);
    const offenders = facesInEmittedCss(dir).filter((f) => !EXPECTED_FAMILIES.has(f.family));
    expect(offenders.map((o) => `${o.family} in ${o.file}`)).toEqual([
      "DepInternalFace in bad.css",
    ]);
  });

  it("the emitted-artifact universe is exactly the shipped face set", () => {
    const dir = process.env.FONT_ARTIFACT_DIR;
    if (dir === undefined) {
      // SKIP BY PREMISE, named rather than silent. unit-suite is build-free by
      // design; dev-gate-e2e.yml sets this after its production build.
      expect(dir, "FONT_ARTIFACT_DIR unset — artifact row skipped (see dev-gate-e2e.yml)").toBe(
        undefined,
      );
      return;
    }
    const abs = join(REPO_ROOT, dir);
    // FAIL LOUD when the variable is set but the directory is missing or holds no
    // CSS. A reader that silently found nothing would report a clean face
    // universe for a build that never happened — the vacuous-guard failure this
    // whole entry is about, reproduced inside its own fix.
    expect(existsSync(abs), `FONT_ARTIFACT_DIR=${dir} does not exist at ${abs}`).toBe(true);
    const faces = facesInEmittedCss(abs);
    expect(
      faces.length,
      `no @font-face found under ${dir} — the build emitted no font CSS`,
    ).toBeGreaterThan(0);

    const offenders = faces.filter((f) => !EXPECTED_FAMILIES.has(f.family));
    expect(
      offenders.map((o) => `${o.family} in ${o.file}`),
      "the built artifact ships a face the product does not declare — it reached the emitted CSS " +
        "through a path the source walk cannot see (a dependency-internal stylesheet, an exports " +
        "subpath, or CSS-in-JS)",
    ).toEqual([]);
  });
});
