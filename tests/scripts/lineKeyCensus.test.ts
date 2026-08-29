import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The census is the only artifact this arc ships, and the refutation record's
 * numbers are only as good as its classification. These cases pin the four
 * populations it separates, each against a fixture built to be that population
 * and nothing else.
 *
 * Failure mode caught: a classification silently widening or narrowing, which
 * is exactly how the committed spec's own numbers went wrong twice before
 * review. A census that miscounts is worse than no census, because its output
 * looks authoritative.
 */
const ROOT = join(import.meta.dirname, "fixtures", "lineKeyCensus");

function run(args: string[] = []): string {
  return execFileSync(
    "node",
    [
      join(import.meta.dirname, "..", "..", "scripts", "line-key-census.mjs"),
      "--root",
      ROOT,
      ...args,
    ],
    { encoding: "utf8", cwd: ROOT },
  );
}

const num = (out: string, label: string): number => {
  const m = out.match(new RegExp(`${label}=(\\d+)`));
  expect(m, `${label} missing from census output`).not.toBeNull();
  return Number(m![1]);
};

describe("line-key census populations", () => {
  const out = run();

  it("counts a row whose target exists and is joined as load-bearing", () => {
    // Two: the REGISTRY row at src/Real.tsx:10 and the string key src/Real.tsx:22.
    expect(num(out, "load-bearing")).toBe(2);
  });

  it("counts a row whose target does not exist as synthetic, never load-bearing", () => {
    // Two: the DoesNotExist object row and the DoesNotExist string key.
    expect(num(out, "synthetic")).toBe(2);
  });

  it("counts a prose citation as a comment, never as a key", () => {
    expect(num(out, "comment-citation")).toBe(1);
  });

  it("counts an explicit ScanElement literal as constructed input, not load-bearing", () => {
    // The defect review found: existsSync(target) alone called this load-bearing.
    expect(num(out, "constructed-input")).toBe(1);
  });

  it("keeps the four populations disjoint", () => {
    const total =
      num(out, "load-bearing") +
      num(out, "synthetic") +
      num(out, "comment-citation") +
      num(out, "constructed-input");
    expect(total).toBe(6);
  });
});
