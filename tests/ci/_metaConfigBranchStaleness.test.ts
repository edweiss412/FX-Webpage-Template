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
import { premiseHolds } from "@/tests/_shared/premise";
import {
  declaredFilesOf,
  discoverConfigs,
  parseProbeOutput,
  PINNED_CONFIGS,
  PROBE_ERROR_QUOTE,
  PROBE_MARKER,
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
    let declared = 0;
    for (const probe of probeAllConfigs()) {
      for (const matcher of probe.matchers) {
        for (const file of declaredFilesOf(matcher)) {
          declared += 1;
          const abs = join(probe.testDirAbs, file);
          if (!existsSync(abs)) {
            dead.push(
              `${probe.config} [${matcher.project}] -> ${relative(ROOT, abs).split("\\").join("/")}`,
            );
          }
        }
      }
    }
    // Without a branch to check, "no dead branches" is true of nothing and this
    // assertion would pass forever on a probe that had quietly stopped reading.
    premiseHolds("at least one config declared at least one branch", declared > 0);
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
    // A walk that reached nothing would satisfy every "contains" below vacuously
    // if the pinned list were ever emptied, and would satisfy the beyond-the-belt
    // filter with an empty array too.
    premiseHolds("the filesystem walk reached at least one config", discovered.length > 0);
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

describe("the child's output is parsed, not trusted", () => {
  // These three cases exist because mutation scoring found the decision below
  // unpinned: the suite drove only the happy path through a real child process,
  // so a mutant that ACCEPTED a missing marker survived, and so did both offsets
  // of the diagnostic quote. The child is the expensive part; the decision is not.

  it("parses the payload that follows the marker, ignoring anything before it", () => {
    const payload = [{ abs: "/x/playwright.config.ts", testDir: ".", matchers: [] }];
    const out = `some npm preamble\n${PROBE_MARKER}${JSON.stringify(payload)}`;
    expect(parseProbeOutput(out)).toEqual(payload);
  });

  it("THROWS on a missing marker rather than parsing whatever came back", () => {
    // A child that dies before printing leaves stderr text on stdout. Accepting
    // that and letting JSON.parse fail later discards the actual output, which is
    // the only thing that says WHY the child died.
    expect(() => parseProbeOutput("Error: tsx exited before writing anything")).toThrow(
      /no probe output/i,
    );
  });

  it("quotes the unusable output from its FIRST character, and caps the quote", () => {
    // Two separate off-by-one defects, both of which survived scoring: an offset
    // that drops the leading character (so the most diagnostic part of a stack
    // trace goes missing) and a cap that is one too generous.
    const noisy = "E" + "x".repeat(PROBE_ERROR_QUOTE + 100);
    let message = "";
    try {
      parseProbeOutput(noisy);
    } catch (e) {
      message = (e as Error).message;
    }
    const quoted = message.slice(message.indexOf("Got: ") + "Got: ".length);
    expect(quoted.startsWith("E"), "the quote dropped its first character").toBe(true);
    expect(quoted).toHaveLength(PROBE_ERROR_QUOTE);
  });
});
