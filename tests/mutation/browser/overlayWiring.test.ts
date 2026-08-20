import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { premiseHolds } from "../../_shared/premise";
import { buildManifest } from "./mutate";

/**
 * The overlay layers, and the "flag off means off" half of the §2 lifecycle
 * table (spec §3.1, §3.2, §3.3, AC-3).
 *
 * Every claim here is EXECUTED rather than read off the source: the bundle is
 * really built through the shipped script, the browser-mode vitest config really
 * runs a child, and the two off-state claims are the same runs with the env var
 * unset. A structural scan alone would pass a plugin that registers and then
 * serves disk text, which is the exact mutant this file exists to kill.
 */
const ROOT = resolve(__dirname, "..", "..", "..");

/**
 * Wall-clock ceiling for ONE child this WIRING suite spawns.
 *
 * Deliberately NOT `BROWSER_MUTANT_TIMEOUT_MS`: these are wiring children, not
 * mutant children, and reusing the ratified 660 s would imply a derivation the
 * browser-gate probe does not support for them. Derived from this file instead —
 * its slowest child measured 2432 ms across all eleven cases, so 60 s is ~25x
 * the measured maximum, and it sits BELOW every per-case timeout here
 * (120 s / 180 s / 300 s) so the child's own bound fires first and the failure
 * names the hung child rather than an expired case.
 */
const WIRING_CHILD_TIMEOUT_MS = 60_000;
const BUNDLE = join(ROOT, "tests", "e2e", "_tapTargetFloorBundle.mjs");
const OVERLAY_CONFIG = "tests/mutation/browser/vitestOverlay.config.ts";
const PROBE_FIXTURE = "tests/mutation/browser/fixtures/overlayProbe.fixture.ts";
const MARKER_MODULE = join(ROOT, "tests", "mutation", "browser", "fixtures", "marker.ts");

let dir: string;
/** The probe entry's own marker module — a file the bundle really resolves. */
let entryFile: string;
let markerFile: string;

const DISK_TEXT = "BUNDLE_DISK_TEXT";
const MUTANT_TEXT = "BUNDLE_MUTANT_TEXT";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fx-overlay-wiring-"));
  markerFile = join(dir, "probeMarker.tsx");
  entryFile = join(dir, "probeEntry.tsx");
  writeFileSync(markerFile, `export const PROBE = "${DISK_TEXT}";\n`);
  writeFileSync(entryFile, `import { PROBE } from "./probeMarker";\nwindow.console.log(PROBE);\n`);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Run the shipped bundle script; returns the bundle text it wrote. */
function bundle(env: Record<string, string>, outName: string): string {
  const outfile = join(dir, outName);
  execFileSync(process.execPath, [BUNDLE, entryFile, outfile, join(ROOT, "tsconfig.json")], {
    cwd: ROOT,
    stdio: "pipe",
    env: { ...process.env, ...env },
    timeout: WIRING_CHILD_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return readFileSync(outfile, "utf8");
}

/** A manifest overlaying the probe marker with MUTANT_TEXT. */
function writeProbeManifest(name: string): string {
  const mutant = join(dir, `${name}.mutant.tsx`);
  writeFileSync(mutant, `export const PROBE = "${MUTANT_TEXT}";\n`);
  const manifest = join(dir, `${name}.manifest.json`);
  writeFileSync(manifest, buildManifest([{ target: markerFile, mutant }]));
  rmSync(`${manifest}.ok`, { force: true });
  return manifest;
}

describe("bundle overlay — env SET (spec §3.1)", () => {
  it("serves the mutant text and writes the sentinel", () => {
    const manifest = writeProbeManifest("set");
    premiseHolds("the sentinel is absent before the build", !existsSync(`${manifest}.ok`));
    const out = bundle({ MUTATION_OVERLAY_MANIFEST: manifest }, "set.js");
    expect(out).toContain(MUTANT_TEXT);
    expect(out).not.toContain(DISK_TEXT);
    expect(existsSync(`${manifest}.ok`), "sentinel must exist after a validated build").toBe(true);
  }, 180_000);

  it("fails loudly BEFORE building when a manifest entry is unreadable", () => {
    // The eager read is half of the §3.4 verdict-integrity contract: a broken
    // overlay must not produce a green child that scores a mutant SURVIVED.
    const manifest = join(dir, "broken.manifest.json");
    writeFileSync(
      manifest,
      buildManifest([{ target: markerFile, mutant: join(dir, "no-such-mutant.tsx") }]),
    );
    rmSync(`${manifest}.ok`, { force: true });
    expect(() => bundle({ MUTATION_OVERLAY_MANIFEST: manifest }, "broken.js")).toThrow();
    expect(existsSync(`${manifest}.ok`), "no sentinel for a manifest that never validated").toBe(
      false,
    );
  }, 180_000);

  it("overlays by resolved-path equality, never by suffix", () => {
    // A suffix match would overlay a same-named module elsewhere in the graph.
    // The manifest names a DIFFERENT file that ends with the same basename.
    const decoyDir = join(dir, "decoy");
    const decoy = join(decoyDir, "probeMarker.tsx");
    rmSync(decoyDir, { recursive: true, force: true });
    execFileSync("mkdir", ["-p", decoyDir], {
      timeout: WIRING_CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    writeFileSync(decoy, `export const PROBE = "DECOY";\n`);
    const mutant = join(dir, "decoy.mutant.tsx");
    writeFileSync(mutant, `export const PROBE = "${MUTANT_TEXT}";\n`);
    const manifest = join(dir, "decoy.manifest.json");
    writeFileSync(manifest, buildManifest([{ target: decoy, mutant }]));
    const out = bundle({ MUTATION_OVERLAY_MANIFEST: manifest }, "decoy.js");
    expect(out).toContain(DISK_TEXT);
    expect(out).not.toContain(MUTANT_TEXT);
  }, 180_000);
});

describe("bundle overlay — env UNSET means OFF (AC-3)", () => {
  it("registers no overlay plugin at all", () => {
    // Not "registers one that no-ops": spec §3.1 says the plugin is not
    // registered, and a register-but-no-op implementation passes every
    // output-text assertion in this file while failing this one.
    const probe = join(dir, "pluginNames.mjs");
    writeFileSync(
      probe,
      `import { buildPlugins } from ${JSON.stringify(BUNDLE)};\n` +
        `const off = buildPlugins({}).map((p) => p.name);\n` +
        `const on = buildPlugins({ MUTATION_OVERLAY_MANIFEST: process.argv[2] }).map((p) => p.name);\n` +
        `console.log(JSON.stringify({ off, on }));\n`,
    );
    const manifest = writeProbeManifest("names");
    const raw = execFileSync(process.execPath, [probe, manifest], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: WIRING_CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    const { off, on } = JSON.parse(raw) as { off: string[]; on: string[] };
    premiseHolds("the plugin list is non-empty in both states", off.length > 0 && on.length > 0);
    expect(off).not.toContain("mutation-overlay");
    expect(on[0]).toBe("mutation-overlay");
    expect(on).toEqual(["mutation-overlay", ...off]);
  }, 120_000);

  it("emits the disk text and writes no sentinel", () => {
    const manifest = writeProbeManifest("unset");
    const out = bundle({ MUTATION_OVERLAY_MANIFEST: "" }, "unset.js");
    expect(out).toContain(DISK_TEXT);
    expect(out).not.toContain(MUTANT_TEXT);
    expect(existsSync(`${manifest}.ok`)).toBe(false);
  }, 180_000);

  it("produces byte-identical output to a build that never heard of the flag", () => {
    const withEmptyFlag = bundle({ MUTATION_OVERLAY_MANIFEST: "" }, "byteA.js");
    const withoutFlag = bundle({}, "byteB.js");
    expect(withEmptyFlag).toBe(withoutFlag);
  }, 180_000);
});

describe("browser-mode vitest overlay config (spec §3.3 step 3)", () => {
  const runFixture = (env: Record<string, string>): number => {
    try {
      execFileSync("pnpm", ["exec", "vitest", "run", "--config", OVERLAY_CONFIG, PROBE_FIXTURE], {
        cwd: ROOT,
        stdio: "pipe",
        env: { ...process.env, ...env },
        timeout: WIRING_CHILD_TIMEOUT_MS,
        killSignal: "SIGKILL",
      });
      return 0;
    } catch (e) {
      return (e as { status?: number }).status ?? 1;
    }
  };

  it("serves the mutant to a real child and writes the sentinel", () => {
    const mutant = join(dir, "vitest.mutant.ts");
    writeFileSync(mutant, `export const MARKER = "MUTANT";\n`);
    const manifest = join(dir, "vitest.manifest.json");
    writeFileSync(manifest, buildManifest([{ target: MARKER_MODULE, mutant }]));
    rmSync(`${manifest}.ok`, { force: true });

    expect(runFixture({ MUTATION_OVERLAY_MANIFEST: manifest })).toBe(0);
    expect(existsSync(`${manifest}.ok`)).toBe(true);
  }, 300_000);

  it("fails the SAME fixture with no manifest, so the pass above is not vacuous", () => {
    // The fixture asserts the overlaid value. Without the overlay it reads the
    // disk text and must fail; a config that silently served clean source in
    // both runs would make the case above prove nothing.
    expect(runFixture({ MUTATION_OVERLAY_MANIFEST: "" })).not.toBe(0);
  }, 300_000);

  it("leaves the tracked fixture module byte-identical", () => {
    expect(readFileSync(MARKER_MODULE, "utf8")).toContain('MARKER = "DISK"');
  });
});

describe("the CSS half and the untouched sibling (spec §3.2, AC-3)", () => {
  const specSource = readFileSync(
    join(ROOT, "tests", "e2e", "tap-target-floor.layout.spec.ts"),
    "utf8",
  );

  it("emits an @source line per manifest entry ONLY under the env guard", () => {
    const guard = specSource.indexOf("MUTATION_OVERLAY_MANIFEST");
    premiseHolds("the spec references the manifest env var at all", guard !== -1);
    const sourceAppend = specSource.indexOf('@source "${');
    premiseHolds("the spec builds an interpolated @source line", sourceAppend !== -1);
    // Every interpolated `@source` line built from a manifest entry sits after
    // the env read; the directory lines above it are literal joins.
    const mutantSourceLine = /@source "\$\{[^}]*(entry|e)\.mutant\}";/;
    expect(specSource).toMatch(mutantSourceLine);
  });

  it("leaves the sibling bundler with no knowledge of this mode", () => {
    const sibling = readFileSync(join(ROOT, "tests", "e2e", "_step3ReviewModalBundle.mjs"), "utf8");
    expect(sibling).not.toContain("MUTATION_OVERLAY_MANIFEST");
    expect(sibling).not.toContain("mutation-overlay");
  });
});

describe("AC-8 — every child this suite spawns is bounded", () => {
  // Derived from the file's own source, never from a list of line numbers: the
  // strictly weaker implementation is to bound only the site review named and
  // leave the others, which is the per-instance whack-a-mole the class-sweep
  // rule exists to prevent. Scanning EVERY call means a site added later fails
  // by default instead of silently joining the uncovered set.
  //
  // The pattern's own source text is `execFileSync\s*\(`, which does not match
  // itself — so this case is not counted as one of the sites it checks.
  it("passes an explicit timeout at every execFileSync call site", () => {
    const source = readFileSync(join(ROOT, "tests/mutation/browser/overlayWiring.test.ts"), "utf8");
    const sites = [...source.matchAll(/execFileSync\s*\(/g)];

    // Executable premise: a scan that found nothing would pass vacuously and
    // would forever — `BL-GUARD-PREMISE-REACHABILITY`'s exact shape.
    premiseHolds("the wiring suite spawns children at all", sites.length > 0);

    const unbounded = sites
      .map((site) => {
        const open = site.index + site[0].length - 1;
        let depth = 0;
        let close = source.length - 1;
        for (let i = open; i < source.length; i += 1) {
          const c = source[i];
          if (c === "(" || c === "[" || c === "{") depth += 1;
          else if (c === ")" || c === "]" || c === "}") {
            depth -= 1;
            if (depth === 0) {
              close = i;
              break;
            }
          }
        }
        const line = source.slice(0, site.index).split("\n").length;
        return { line, call: source.slice(open, close + 1) };
      })
      // BOTH, because presence is not adequacy: a `timeout` armed with the
      // default SIGTERM is not a ceiling on a `pnpm exec vitest` child, which can
      // trap it — the site would carry the key and still hang indefinitely, which
      // is the failure AC-8 names.
      .filter(({ call }) => !/\btimeout\s*:/.test(call) || !/killSignal\s*:\s*"SIGKILL"/.test(call))
      // Fails BY NAME, so the repair is obvious rather than a hunt.
      .map(({ line }) => `overlayWiring.test.ts:${line}`);

    expect(unbounded).toEqual([]);
  });
});
