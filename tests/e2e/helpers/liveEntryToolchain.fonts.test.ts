// The face compileEntryCss emits, and the binary it copies.
//
// This is the harness half of BL-HARNESS-FONT-FIDELITY: the 32 standalone
// harnesses have no Next runtime, so nothing declares a face for them and they
// measured whatever font the host machine had. compileEntryCss is a single
// choke point -- all 32 callers serve its output beside their markup -- so one
// post-step reaches every one of them.
//
// PARSED WITH errorRecovery: true, and that is NOT optional. The emitted file is
// ~174 KB of compiled Tailwind, which contains
//   .data-\[a\:b\]\:text-accent { &[data-a:b] { ... } }
// generated from a literal string Tailwind's content scanner picks out of
// tests/styles/_metaRawAccentText.test.ts. `[data-a:b]` is an invalid attribute
// selector and lightningcss@1.32.0 REFUSES THE WHOLE SHEET rather than skipping
// the rule. Browsers skip it harmlessly; a strict parser cannot. The app-side
// guard parses strictly because it reads a file we author.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  descriptorNames,
  displayOf,
  familyOf,
  overridesOf,
  parseFontFaces,
  srcOf,
  styleOf,
  weightOf,
  type ParsedFace,
} from "../../helpers/fontCss";
import { EXPECTED_SHA256, HARNESS_FONT_FILENAME } from "../../helpers/fontManifest";
import { compileEntryCss } from "./liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const APP_FACES = parseFontFaces(readFileSync(resolve(REPO_ROOT, "app/fonts.css"), "utf8"));

let workDir: string;
let emitted: ParsedFace[];

beforeAll(() => {
  // A MINIMAL entry, not a caller's: this asserts what the toolchain emits, and
  // the callers' own documents are covered by the shared fixture instead.
  workDir = mkdtempSync(join(tmpdir(), "harness-fonts-"));
  const entry = join(workDir, "entry.css");
  writeFileSync(entry, '@import "tailwindcss";\n');
  compileEntryCss({ entryCss: entry, outFile: join(workDir, "out.css") });
  emitted = parseFontFaces(readFileSync(join(workDir, "out.css"), "utf8"), {
    errorRecovery: true,
  });
}, 200_000);

afterAll(() => {
  // Leave the temp dir; the OS reclaims it and keeping it aids a failed run.
});

const emittedInter = (): ParsedFace[] => emitted.filter((f) => familyOf(f) === "Inter");
const emittedFallback = (): ParsedFace[] => emitted.filter((f) => familyOf(f) === "Inter Fallback");
const appInter = APP_FACES.filter((f) => familyOf(f) === "Inter")[0]!;
const appFallback = APP_FACES.filter((f) => familyOf(f) === "Inter Fallback")[0]!;

describe("compileEntryCss emits the committed face", () => {
  test("the emitted stylesheet parses, and yields exactly one Inter face", () => {
    // Non-vacuity for every row below: a recovered parse that found zero faces
    // would satisfy each "no bad face" assertion while proving nothing. This is
    // also the row that fails loudly if a Tailwind upgrade breaks parsing,
    // rather than letting it silently recover into an empty set.
    expect(emitted.length).toBeGreaterThan(0);
    expect(emittedInter()).toHaveLength(1);
  });

  test("exactly one Inter Fallback face is emitted, matching the app's", () => {
    // Every other row here filters or compares `Inter`, so deleting the emitted
    // fallback passes all of them -- probed against the spike's ten predicates:
    // emittedFallbackFaces=0 with 10/10 still green. The harness would then
    // lack the metric-matched swap-frame face while the emitted-block contract
    // read as satisfied.
    const fb = emittedFallback();
    expect(fb).toHaveLength(1);
    expect(descriptorNames(fb[0]!)).toEqual(descriptorNames(appFallback));
    expect(overridesOf(fb[0]!)).toEqual(overridesOf(appFallback));
    expect(srcOf(fb[0]!)).toEqual(srcOf(appFallback));
  });

  test("the emitted src is a BARE sibling filename, with no path segment", () => {
    // The escape this catches kept a correct basename and correctly copied
    // bytes while emitting url("./fonts/..."): the browser then requests a
    // subdirectory that does not exist, so the face silently falls back. Every
    // hash and pairing row stayed green.
    const url = srcOf(emittedInter()[0]!)[0]!.url;
    expect(url).toBe(HARNESS_FONT_FILENAME);
    expect(url).not.toContain("/");
  });

  test("the copied .woff2 sits beside the stylesheet and hash-matches the original", () => {
    const copied = join(workDir, HARNESS_FONT_FILENAME);
    expect(existsSync(copied), `expected the binary beside out.css at ${copied}`).toBe(true);
    expect(createHash("sha256").update(readFileSync(copied)).digest("hex")).toBe(EXPECTED_SHA256);
  });

  test("the emitted face declares font-display: block, where the app declares swap", () => {
    // A DELIBERATE divergence, and the only descriptor besides src that may
    // differ. A reader must never stare at invisible text, so the app swaps; a
    // measurement harness must never measure the WRONG face, so it blocks. Each
    // value is wrong in the other place.
    expect(displayOf(emittedInter()[0]!)).toBe("block");
    expect(displayOf(appInter)).toBe("swap");
  });

  test("every other descriptor matches the app face exactly", () => {
    // Cross-block equality on the descriptors that determine WHICH BYTES
    // RENDER, which is what ties the harness face to the hash-pinned file
    // rather than to a name.
    const e = emittedInter()[0]!;
    expect(familyOf(e)).toBe(familyOf(appInter));
    expect(weightOf(e)).toEqual(weightOf(appInter));
    expect(styleOf(e)).toBe(styleOf(appInter));
    expect(srcOf(e)[0]!.format).toBe(srcOf(appInter)[0]!.format);
  });

  test("the emitted descriptor inventory is exactly the app's", () => {
    // Equality ALONE is satisfied by a rogue descriptor present in BOTH blocks
    // -- `size-adjust: 200%` scales real glyph outlines and kept counts,
    // pairings, URLs, hashes, display values, token and preload all green.
    expect(descriptorNames(emittedInter()[0]!)).toEqual(descriptorNames(appInter));
  });

  test("the emitted src is one url() with a typed woff2 format and no tech()", () => {
    const sources = srcOf(emittedInter()[0]!);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.kind).toBe("url");
    expect(sources[0]!.format).toBe("woff2");
    expect(sources[0]!.tech).toEqual([]);
  });

  test("no impostor face sources a local() family under a committed name", () => {
    // Round 2's fifth mutant: font-family "Inter" with src local("Arial") is
    // reported as `loaded` by document.fonts, because FontFace.family is
    // whatever the author wrote and identifies nothing about the source.
    for (const face of [...emittedInter(), ...emittedFallback()]) {
      if (familyOf(face) !== "Inter") continue;
      expect(srcOf(face).every((s) => s.kind === "url")).toBe(true);
    }
  });
});
