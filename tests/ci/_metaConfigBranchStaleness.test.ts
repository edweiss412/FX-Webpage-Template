/**
 * tests/ci/_metaConfigBranchStaleness.test.ts
 *
 * The config-to-disk direction: a Playwright config may not name a spec file
 * that does not exist.
 *
 * `_metaSpecRegistration.test.ts` §3.1 already asserts the other direction —
 * every spec file on disk resolves in some config, with an EMPTY dark
 * allowlist. Both halves are needed, and only one was present. A branch
 * matching no file is invisible to `--list` by construction, so the resolution
 * both of those guards depend on cannot see it: the set of files Playwright
 * reports is the same whether or not a dead name sits in the alternation.
 *
 * WHY A DEAD NAME IS A HAZARD AND NOT LITTER. The matchers are alternations of
 * bare stems with no anchors, so they match by SUBSTRING. `playwright.config.ts`
 * already records the fear in its own comments (:77-79, on why
 * `canonical-class-dimensions` must not be named `canonical-layout-dimensions`:
 * "that would substring-match the `layout-dimensions` alternative in BOTH
 * projects and silently run where it was never meant to"). A stem whose file was
 * renamed or deleted keeps that matching power and silently adopts the next file
 * whose name contains it — in the project the author of that new file never
 * chose, under the viewport and baseURL they never chose.
 *
 * Measured at this guard's authoring, 2026-08-30: nine dead stems in
 * `playwright.config.ts`, each duplicated across mobile-safari and
 * desktop-chromium, eighteen occurrences.
 */
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  declaredFilesOf,
  discoverConfigs,
  PINNED_CONFIGS,
  probeAllConfigs,
  type Matcher,
} from "./_configBranchProbe";

const ROOT = process.cwd();
const re = (source: string): Matcher => ({ project: "<test>", isRegExp: true, source });

describe("the reader itself (a guard that parses nothing asserts nothing)", () => {
  it("reads the parenthesized alternation shape, unescaping dots", () => {
    expect(declaredFilesOf(re("(alpha\\.layout|beta-two)\\.spec\\.ts"))).toEqual([
      "alpha.layout.spec.ts",
      "beta-two.spec.ts",
    ]);
  });

  it("reads a bare single stem, and a non-spec `.ts` suffix (the setup projects)", () => {
    expect(declaredFilesOf(re("admin-dev\\.spec\\.ts"))).toEqual(["admin-dev.spec.ts"]);
    expect(declaredFilesOf(re("help-docs-setup\\.ts"))).toEqual(["help-docs-setup.ts"]);
  });

  it("keeps a dotted stem attached to its own suffix, not to the longest one", () => {
    // `covered-image-load-eligibility.probe.spec.ts` is a real file whose stem
    // carries a dot. Splitting the suffix greedily would yield the stem
    // `covered-image-load-eligibility` and a file that does not exist.
    expect(declaredFilesOf(re("covered-image-load-eligibility\\.probe\\.spec\\.ts"))).toEqual([
      "covered-image-load-eligibility.probe.spec.ts",
    ]);
  });

  it("THROWS rather than returning [] on a shape it does not recognise", () => {
    // The failure that matters: a reader yielding [] makes the assertion below
    // vacuous for that config, and vacuous is indistinguishable from clean.
    for (const bad of ["^anchored\\.spec\\.ts$", "(a|b)\\.spec\\.(ts|tsx)", "wild.*\\.spec\\.ts"]) {
      expect(() => declaredFilesOf(re(bad)), bad).toThrow(
        /unrecognised testMatch shape|not a plain filename stem/i,
      );
    }
  });

  it("THROWS on a stem carrying regex power, which would name a wrong-but-existing file", () => {
    for (const bad of ["a[bc]d", "a+b", "a\\d", "a.b", "a\\|b"]) {
      expect(() => declaredFilesOf(re(`(${bad})\\.spec\\.ts`)), bad).toThrow(
        /not a plain filename stem/i,
      );
    }
  });

  it("THROWS on a string matcher, which is a glob and matches no file as a regex", () => {
    expect(() =>
      declaredFilesOf({ project: "<test>", isRegExp: false, source: "(a|b)\\.spec\\.ts" }),
    ).toThrow(/not a RegExp/i);
  });
});

describe("no Playwright config names a file that does not exist", () => {
  it("every declared branch, in every config and project, resolves to a real file", () => {
    const dead: string[] = [];
    for (const probe of probeAllConfigs()) {
      for (const matcher of probe.matchers) {
        for (const file of declaredFilesOf(matcher)) {
          const abs = join(probe.testDirAbs, file);
          if (!existsSync(abs)) {
            dead.push(
              `${probe.config} [${matcher.project}] -> ${relative(ROOT, abs).split("\\").join("/")}`,
            );
          }
        }
      }
    }
    expect(
      dead,
      "these testMatch branches name files that do not exist. A stale stem still " +
        "matches by SUBSTRING and will silently adopt the next file whose name " +
        "contains it — delete the branch, or restore the file:\n" +
        dead.join("\n"),
    ).toEqual([]);
  });

  it("the population is DERIVED from disk and reaches configs the old belt cannot see", () => {
    // The first draft of this guard listed its four configs by hand, in two
    // places, so the two agreed with each other while a fifth config could sit
    // unexamined. That is the same error the spec is about — enumerate one side,
    // call it the population — and round 1 of review found it here.
    const discovered = discoverConfigs();
    for (const pinned of PINNED_CONFIGS) {
      expect(discovered, `${pinned} vanished from discovery`).toContain(pinned);
    }
    // The anti-tautology arm. `_metaSpecRegistration.test.ts`'s filesystem belt
    // matches `playwright*.config.*` only, so a config named anything else
    // escapes it. Discovery must reach at least one such file, or it is no
    // better than the belt it exists to widen.
    const beyondTheBelt = discovered.filter((c) => !/(^|\/)playwright[^/]*\.config\./.test(c));
    expect(
      beyondTheBelt,
      "discovery found no config outside the `playwright*.config.*` basename pattern, " +
        "so it cannot be catching anything the existing belt misses",
    ).not.toEqual([]);

    const probes = probeAllConfigs();
    expect(probes.map((p) => p.config)).toEqual(discovered);
    for (const p of probes) {
      expect(p.matchers.length, `${p.config} contributed no matcher`).toBeGreaterThan(0);
      expect(existsSync(p.testDirAbs), `${p.config} testDir ${p.testDirAbs}`).toBe(true);
    }
  });
});
