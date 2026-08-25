// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertCompleteCapture, publishStaging } from "@/scripts/help-screenshots";

/**
 * Executable coverage for the two load-bearing steps at the end of `captureAll`.
 *
 * Whole-diff review r4a found this chain dark: the scoped tests scan the capture
 * script's SOURCE TEXT and never run it, because `captureAll` launches Chromium
 * and needs a seeded database. The consequence it named is the one that matters
 * to this whole arc: a one-edit no-op of the publish copy leaves staging and the
 * evidence verifier green while the byte gate compares untouched committed
 * baselines, so genuine drift ships silently and the instrument reports success.
 *
 * These run against real temp directories, so they execute the actual filesystem
 * behaviour rather than a mock of it.
 */
const made: string[] = [];
function stage(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "capture-stage-"));
  made.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}
function emptyDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "capture-out-"));
  made.push(dir);
  return dir;
}

afterEach(() => {
  made.length = 0;
});

describe("the identity oracle runs before anything is published", () => {
  it("passes when staging holds exactly the expected identities", () => {
    const dir = stage({ "one-light.webp": "a", "one-dark.webp": "b" });
    expect(() => assertCompleteCapture(dir, ["one-light", "one-dark"])).not.toThrow();
  });

  it("names what is missing when the capture stopped short", () => {
    // The shape occurrence A had: a run that completes some entries and skips
    // others leaves the committed baselines for the skipped ones untouched, so
    // a directory count and an empty git diff both look healthy.
    const dir = stage({ "one-light.webp": "a" });
    expect(() => assertCompleteCapture(dir, ["one-light", "one-dark"])).toThrow(/missing one-dark/);
  });

  it("names identities the manifest never asked for", () => {
    // Two manifest entries sharing key+theme collide in staging and land here.
    const dir = stage({ "one-light.webp": "a", "ghost-light.webp": "c" });
    expect(() => assertCompleteCapture(dir, ["one-light"])).toThrow(/unexpected ghost-light/);
  });

  it("treats an empty staging directory as missing everything, not as success", () => {
    const dir = stage({});
    expect(() => assertCompleteCapture(dir, ["one-light"])).toThrow(/missing one-light/);
  });
});

describe("publishing copies staging into the directory the byte gate reads", () => {
  it("copies every staged file and reports what it copied", () => {
    // This is the assertion a no-op of the copy fails. It is why the function
    // returns the names instead of void: a void publish cannot distinguish
    // "copied everything" from "copied nothing", which is exactly the mutant
    // the review described.
    const src = stage({ "one-light.webp": "LIGHT", "one-dark.webp": "DARK" });
    const out = emptyDir();

    const copied = publishStaging(src, out);

    expect(copied.sort()).toEqual(["one-dark.webp", "one-light.webp"]);
    expect(readdirSync(out).sort()).toEqual(["one-dark.webp", "one-light.webp"]);
    expect(readFileSync(join(out, "one-light.webp"), "utf8")).toBe("LIGHT");
    expect(readFileSync(join(out, "one-dark.webp"), "utf8")).toBe("DARK");
  });

  it("OVERWRITES an existing baseline rather than skipping it", () => {
    // The capture overwrites in place, which is why a was-a-file-created check
    // cannot see this class at all. A publish that declined to overwrite would
    // leave the old bytes and report success.
    const src = stage({ "one-light.webp": "NEW" });
    const out = emptyDir();
    writeFileSync(join(out, "one-light.webp"), "OLD");

    publishStaging(src, out);

    expect(readFileSync(join(out, "one-light.webp"), "utf8")).toBe("NEW");
  });

  it("creates the output directory when it does not exist yet", () => {
    const src = stage({ "one-light.webp": "x" });
    const out = join(emptyDir(), "nested", "screenshots");

    publishStaging(src, out);

    expect(readdirSync(out)).toEqual(["one-light.webp"]);
  });
});
