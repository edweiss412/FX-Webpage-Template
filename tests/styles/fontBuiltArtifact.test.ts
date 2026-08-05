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
 * module graph. The production build's emitted output is ground truth — whatever
 * reached it is what a reader downloads, regardless of which resolution
 * mechanism put it there.
 *
 * CSS-IN-JS, STATED ACCURATELY. An earlier draft claimed it fell out of reading
 * emitted CSS; it does not, because a face injected from a JS chunk never
 * reaches a `.css` file (Codex R1 MEDIUM). The reader therefore also scans
 * emitted `.js` for a literal `@font-face`, which is how such a chunk carries
 * one. What it cannot see is a face assembled at runtime from fragments — that
 * needs a live-document oracle, which is `harness-font-face.spec.ts`'s job, and
 * is a DOCUMENTED LIMIT rather than a claim made here.
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

import { familyOf, parseFontFaces, srcOf } from "../helpers/fontCss";
import { discoverShippedStylesheets } from "./_sourceStylesheetWalk";

const REPO_ROOT = join(__dirname, "..", "..");
// `vendor/`, NOT `node_modules/`. The first draft named these directories
// node_modules to mirror a real install, and .gitignore swallowed all five
// files — the fixtures existed on my disk and in no clean checkout, so the
// module-level reads below would have thrown at import in CI while the archive
// entry claimed both packages were committed (Codex R1 BLOCKING). Nothing here
// is ever RESOLVED by a bundler; the tests only read the files, so the directory
// name was free to change and the ignore rule was not.
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
export function facesInEmittedCss(
  dir: string,
): Array<{ family: string; file: string; src: string }> {
  const out: Array<{ family: string; file: string; src: string }> = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      const text = (() => {
        if (entry.name.endsWith(".css")) return readFileSync(abs, "utf8");
        // EMITTED JS TOO. A .css-only walk cannot see a face injected from a
        // JavaScript chunk, which is exactly the CSS-in-JS case (Codex R1
        // MEDIUM). A chunk that ships an @font-face carries the at-rule as
        // literal text, so the families are recoverable without executing it.
        if (!entry.name.endsWith(".js")) return null;
        const js = readFileSync(abs, "utf8");
        return js.includes("@font-face") ? js : null;
      })();
      if (text === null) continue;
      for (const { family, src } of familiesIn(text)) {
        out.push({ family, src, file: relative(dir, abs) });
      }
    }
  };
  walk(dir);
  return out;
}

/** A scratch directory holding the given CSS files, as an emitted build would. */
/**
 * Families declared by any `@font-face` in a blob of CSS **or** JS.
 *
 * The CSS parser is used where it can be — it is the accurate reader — and a
 * literal scan covers JS chunks, where the at-rule is embedded in a string and
 * the parser cannot help. The scan is deliberately narrow: it only reads
 * `font-family` inside an `@font-face` block it has already matched.
 */
function familiesIn(text: string): Array<{ family: string; src: string }> {
  const parsed = parseFontFaces(text, { errorRecovery: true })
    .map((f) => ({ family: familyOf(f), src: srcOf(f)[0]?.url ?? "" }))
    .filter((r) => r.family !== "");
  if (parsed.length > 0) return parsed;
  const out: Array<{ family: string; src: string }> = [];
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1] ?? "";
    const fam = /font-family\s*:\s*(["']?)([^;"'}]+)\1/.exec(body)?.[2]?.trim();
    const url = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(body)?.[1]?.trim() ?? "";
    if (fam) out.push({ family: fam, src: url });
  }
  return out;
}

function emittedDirWith(files: Array<{ name: string; text: string }>): string {
  const dir = mkdtempSync(join(tmpdir(), "font-artifact-"));
  for (const f of files) writeFileSync(join(dir, f.name), f.text);
  return dir;
}

const readFixture = (...parts: string[]): string => readFileSync(join(FIXTURES, ...parts), "utf8");

const DEP_INTERNAL_CSS = readFixture(
  "dep-internal-css",
  "vendor",
  "dep-internal-css",
  "internal.css",
);
const EXPORTS_SUBPATH_CSS = readFixture(
  "exports-subpath",
  "vendor",
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
    const appCss = readFixture("dep-internal-css", "app", "app.css");
    expect(appCss).not.toMatch(/@import/);
    expect(appCss).not.toMatch(/internal\.css/);
    expect(readFixture("dep-internal-css", "app", "entry.js")).toContain(
      'import "dep-internal-css"',
    );
    expect(readFixture("dep-internal-css", "vendor", "dep-internal-css", "index.js")).toContain(
      'import "./internal.css"',
    );
  });

  it("ESCAPE 2 — an exports-subpath stylesheet is not named by any path", () => {
    // The specifier is `exports-subpath/theme`. There is no such file: the
    // package's `exports` map resolves it to styles/theme.css. A walk keyed on
    // the literal specifier finds nothing, and again no CSS names the file.
    const appCss = readFixture("exports-subpath", "app", "app.css");
    expect(appCss).not.toMatch(/@import/);
    expect(readFixture("exports-subpath", "app", "entry.js")).toContain(
      'import "exports-subpath/theme"',
    );
    const pkg = JSON.parse(
      readFixture("exports-subpath", "vendor", "exports-subpath", "package.json"),
    ) as { exports: Record<string, string> };
    expect(pkg.exports["./theme"]).toBe("./styles/theme.css");
    expect(
      existsSync(join(FIXTURES, "exports-subpath", "vendor", "exports-subpath", "theme")),
    ).toBe(false);
  });

  it("THE WALK MISSES BOTH — the production discovery function, run on the fixtures", () => {
    // Codex R2 LOW: the plan asked for this and the suite did not have it. The
    // earlier rows inspect fixture TEXT and argue about what the walk would do;
    // this one RUNS the shipped walk against each fixture root.
    //
    // Roots are `app` only, mirroring production exactly: there the walked roots
    // are app/components/lib and dependencies live in node_modules, which is
    // never a root. Here the dependency lives in `vendor/`, likewise never a
    // root. That is what makes the fixture a faithful model rather than a rigged
    // one — the escape is that nothing in walked code names a `.css` path, not
    // that the walk was told to look away.
    for (const fixture of ["dep-internal-css", "exports-subpath"] as const) {
      const found = discoverShippedStylesheets({
        repoRoot: join(FIXTURES, fixture),
        roots: ["app"],
      });
      const labels = found.map((f) => f.label);
      expect(
        labels.filter((l) => l.includes("internal.css") || l.includes("theme.css")),
        `${fixture}: the source walk must NOT reach the dependency's stylesheet — if it does, ` +
          `this fixture no longer models the escape it is named for`,
      ).toEqual([]);
      // PREMISE: the walk did run and did see the fixture's OWN stylesheet, so
      // the emptiness above is a miss rather than a walk that found nothing.
      expect(
        labels.some((l) => l.includes("app.css")),
        `${fixture}: the walk found nothing at all`,
      ).toBe(true);
    }
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

  it("sees a face injected from an emitted JS chunk", () => {
    // Codex R1 MEDIUM. A `.css`-only walk cannot see this, and the CSS-in-JS
    // claim was made before anything checked it.
    const dir = emittedDirWith([
      { name: "ok.css", text: '@font-face{font-family:"Inter";src:url("i.woff2")}' },
      {
        name: "chunk.js",
        text: "var s=\".x{}@font-face{font-family:'ChunkFace';src:url(c.woff2)}\";export default s;",
      },
    ]);
    expect(
      facesInEmittedCss(dir)
        .map((f) => f.family)
        .sort(),
    ).toEqual(["ChunkFace", "Inter"]);
  });

  it("reports a MISSING expected family, not just an unexpected one", () => {
    // The two-directional half, exercised on a scratch dir so the real-artifact
    // row is not the only thing that would catch a dropped fallback.
    const dir = emittedDirWith([
      { name: "only-inter.css", text: '@font-face{font-family:"Inter";src:url("i.woff2")}' },
    ]);
    const shipped = new Set(facesInEmittedCss(dir).map((f) => f.family));
    expect([...EXPECTED_FAMILIES].filter((f) => !shipped.has(f))).toEqual(["Inter Fallback"]);
  });

  it("catches a COMPETING face that reuses an allowed family name", () => {
    // Codex R2 HIGH. The dependency escape's nastiest form: it does not add a
    // strange family, it adds a second binary under the product's OWN family
    // name. A name-set comparison reports nothing wrong.
    const dir = emittedDirWith([
      { name: "product.css", text: '@font-face{font-family:"Inter";src:url("inter.woff2")}' },
      { name: "dep.css", text: '@font-face{font-family:"Inter";src:url("dependency.woff2")}' },
    ]);
    const faces = facesInEmittedCss(dir);
    // The old predicates both pass on this input — that is the defect.
    expect(faces.filter((f) => !EXPECTED_FAMILIES.has(f.family))).toEqual([]);
    // The src-aware one does not.
    const srcs = new Set(faces.filter((f) => f.family === "Inter").map((f) => f.src));
    expect([...srcs].sort()).toEqual(["dependency.woff2", "inter.woff2"]);
    expect(srcs.size, "one family, two binaries — whichever loads last wins").toBeGreaterThan(1);
  });

  it("does NOT flag the same src repeated across emitted chunks", () => {
    // The other direction, so the src rule cannot be satisfied by being noisy:
    // Next legitimately emits one face into more than one chunk.
    const face = '@font-face{font-family:"Inter";src:url("inter.woff2")}';
    const dir = emittedDirWith([
      { name: "a.css", text: face },
      { name: "b.css", text: face },
    ]);
    const srcs = new Set(facesInEmittedCss(dir).map((f) => f.src));
    expect(srcs.size).toBe(1);
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
      "the built artifact ships a face the product does not declare — it reached the emitted " +
        "output through a path the source walk cannot see (a dependency-internal stylesheet, an " +
        "exports subpath, or a JS chunk)",
    ).toEqual([]);

    // THE OTHER DIRECTION, which the first version omitted (Codex R1 HIGH).
    // "Exactly the shipped face set" is two claims, and only one was checked: a
    // build that silently dropped `Inter Fallback` while still emitting `Inter`
    // passed, and losing the size-adjust fallback is precisely the regression
    // that makes text reflow on load.
    // CODEX R2 HIGH — a SET of names cannot see a COMPETING face. A dependency
    // shipping `@font-face{font-family:"Inter";src:url(dependency.woff2)}` uses
    // an allowed NAME, so both `offenders` and `absent` stay empty while two
    // different binaries fight over the same family — which is precisely the
    // dependency escape this gate exists to catch. Identity is (family, src),
    // so each expected family must resolve to exactly ONE distinct source.
    // Chunk duplication of the SAME src is fine and stays fine.
    const bySrc = new Map<string, Set<string>>();
    for (const f of faces) {
      if (!EXPECTED_FAMILIES.has(f.family)) continue;
      (bySrc.get(f.family) ?? bySrc.set(f.family, new Set()).get(f.family)!).add(f.src);
    }
    const competing = [...bySrc.entries()]
      .filter(([, srcs]) => srcs.size > 1)
      .map(([family, srcs]) => `${family} <- ${[...srcs].sort().join(" AND ")}`);
    expect(
      competing,
      "two different binaries are declared for one family; whichever loads last wins, and the " +
        "product's own face may not be it",
    ).toEqual([]);

    const shipped = new Set(faces.map((f) => f.family));
    const absent = [...EXPECTED_FAMILIES].filter((f) => !shipped.has(f));
    expect(
      absent,
      `the built artifact is MISSING a face the product declares: ${absent.join(", ")}. ` +
        `A dropped fallback face does not look like a failure — it looks like a reflow.`,
    ).toEqual([]);
  });
});
