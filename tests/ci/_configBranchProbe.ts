/**
 * tests/ci/_configBranchProbe.ts
 *
 * The DECLARED filename branches of every Playwright config in the repo, read
 * from the live, evaluated config objects.
 *
 * WHY THIS EXISTS. `_metaSpecRegistration.test.ts` answers the disk-to-config
 * direction: every spec file on disk resolves in some config. Nothing answered
 * the reverse — a config naming a file that does not exist. That branch is
 * invisible to `--list` by construction, which is exactly what makes it stale
 * (the observation is `_standaloneConfigProbe.branchesOf`'s own, made there for
 * one config and never generalized). Measured 2026-08-30 on `playwright.config.ts`:
 * nine dead names across two projects, eighteen occurrences.
 *
 * A dead branch is a live hazard, not litter. These matchers are alternations of
 * bare filename stems, so a stale name keeps matching by SUBSTRING: the config's
 * own comments already record the fear ("that would substring-match the
 * `layout-dimensions` alternative in BOTH projects and silently run where it was
 * never meant to", playwright.config.ts:77-79). A stem left behind after its file
 * is deleted or renamed silently adopts the next file whose name contains it.
 *
 * POSTURE: import, never read source. Two adversarial rounds broke the static
 * readers this repo tried first, and the reasoning is written up at length in
 * `_standaloneConfigProbe.ts`. The same conclusion applies here and is not
 * re-litigated: the question is "what matcher does Playwright actually receive",
 * and the cheapest correct oracle for that is to evaluate the module.
 */
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const ROOT = process.cwd();

/** Every Playwright config in the repo, the set `_metaSpecRegistration` pins. */
export const ALL_CONFIGS = [
  "playwright.config.ts",
  "tests/e2e/standalone.config.ts",
  "playwright.screenshots.config.ts",
  "tests/e2e/visual.config.ts",
] as const;

export type Matcher = {
  /** Project name, or `<top>` for a config-level `testMatch`. */
  project: string;
  isRegExp: boolean;
  /** `testMatch.source` when it is a RegExp; otherwise `String(testMatch)`. */
  source: string;
};

export type ConfigProbe = {
  config: string;
  /** `testDir` resolved to an absolute path the way Playwright resolves it. */
  testDirAbs: string;
  matchers: Matcher[];
};

/**
 * Evaluate every config in a child process and report its matchers.
 *
 * `SECTION_HEADER_VISUAL_CONTAINER` is set because `tests/e2e/visual.config.ts`
 * throws at module scope without it, refusing accidental bare-host runs of a
 * byte-pinned baseline suite. Setting it here buys nothing but the import: this
 * probe runs no tests and captures no bytes.
 */
export function probeAllConfigs(): ConfigProbe[] {
  const script = `
    (async () => {
      const configs = ${JSON.stringify(ALL_CONFIGS.map((c) => join(ROOT, c)))};
      const out = [];
      for (const abs of configs) {
        const mod = await import(abs);
        // CJS interop, resolved deterministically — the same rule as
        // _standaloneConfigProbe: a nested \`default\` IS the ESM default
        // export, full stop. Named exports are never consulted, so an export
        // called \`testMatch\` cannot win over the real config.
        const outer = mod.default;
        const inner = outer && outer.default;
        const config = inner && typeof inner === "object" ? inner : outer;
        if (!config || typeof config !== "object") {
          throw new Error("probeAllConfigs: could not reach the config object of " + abs);
        }
        const read = (project, testMatch) => {
          if (testMatch === undefined) return null;
          return {
            project,
            isRegExp: testMatch instanceof RegExp,
            source: testMatch instanceof RegExp ? testMatch.source : String(testMatch),
          };
        };
        const matchers = [];
        const top = read("<top>", config.testMatch);
        if (top !== null) matchers.push(top);
        for (const p of config.projects ?? []) {
          const m = read(p.name, p.testMatch);
          if (m !== null) matchers.push(m);
        }
        out.push({ abs, testDir: config.testDir ?? ".", matchers });
      }
      process.stdout.write("<<PROBE>>" + JSON.stringify(out));
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  const out = execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      NODE_ENV: "test",
      // The visual config's bare-host refusal; see the doc comment above.
      SECTION_HEADER_VISUAL_CONTAINER: "1",
      CI: "true",
      GITHUB_ACTIONS: "true",
    },
  });
  const marker = out.indexOf("<<PROBE>>");
  if (marker === -1) {
    throw new Error(`probeAllConfigs: no probe output. Got: ${out.slice(0, 400)}`);
  }
  const raw = JSON.parse(out.slice(marker + "<<PROBE>>".length)) as {
    abs: string;
    testDir: string;
    matchers: Matcher[];
  }[];
  return raw.map((r, i) => ({
    config: ALL_CONFIGS[i]!,
    // Playwright resolves testDir against the CONFIG's directory, not the cwd.
    testDirAbs: resolve(dirname(r.abs), r.testDir),
    matchers: r.matchers,
  }));
}

/**
 * The filenames a matcher DECLARES, under this repo's closed authoring grammar:
 * an optionally parenthesized alternation of literal filename stems, followed by
 * a literal suffix. Every matcher in `ALL_CONFIGS` is of this shape, measured.
 *
 * Throws on anything else rather than returning `[]`. A reader that silently
 * yields nothing makes its caller's assertion vacuous, and the whole point of
 * this guard is that a name matching no file is otherwise invisible.
 *
 * The grammar is deliberately NOT widened to accept general regex. These
 * matchers are authored by hand in one convention; a recognizer that chases
 * every shape someone could write is a bigger target each round, and the
 * fail-loud throw already routes an unrecognized matcher to a human instead of
 * to a false pass.
 */
export function declaredFilesOf(matcher: Matcher): string[] {
  // A STRING matcher is a glob, not a regex: one that merely looks like
  // `(a|b)\.spec\.ts` matches no file at all, yet parses cleanly into two
  // plausible names. Require a real RegExp before reading it as one.
  if (!matcher.isRegExp) {
    throw new Error(`declaredFilesOf: testMatch is not a RegExp: ${matcher.source}`);
  }
  const m = matcher.source.match(/^(?:\(([^()]*)\)|([^()|]+))((?:\\\.[A-Za-z0-9]+)+)$/);
  if (m === null) {
    throw new Error(`declaredFilesOf: unrecognised testMatch shape: ${matcher.source}`);
  }
  const [, group, single, rawSuffix] = m;
  const suffix = rawSuffix!.replace(/\\\./g, ".");
  const stems = (group ?? single)!.split("|");
  return stems.map((raw) => {
    // Each stem must be a plain filename stem where the ONLY escape is `\.`
    // for a literal dot. Anything else — a character class, quantifier,
    // anchor, wildcard, an escaped pipe, `\d`, or a literal backslash — would
    // be read as filename characters and silently produce a wrong-but-existing
    // name, so it is refused instead.
    if (!/^(?:[A-Za-z0-9_-]|\\\.)+$/.test(raw)) {
      throw new Error(`declaredFilesOf: branch is not a plain filename stem: ${raw}`);
    }
    return raw.replace(/\\\./g, ".") + suffix;
  });
}
