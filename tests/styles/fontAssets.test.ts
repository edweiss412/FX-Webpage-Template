// The committed font binary is present, servable, hash-pinned and licensed.
//
// The bytes moved from `assets/fonts/` to `public/fonts/` because a hand-written
// `@font-face` needs a URL the browser can fetch, and `assets/` is bundler
// input rather than a served directory. They MOVED; they did not change —
// `pyftsubset` output varies with fontTools version, brotli build and host, so
// a regeneration would be an unreviewable diff (see public/fonts/PROVENANCE.md).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { EXPECTED_SHA256, PUBLIC_FONT_PATH } from "../helpers/fontManifest";

const REPO_ROOT = resolve(__dirname, "..", "..");

describe("the committed font binary", () => {
  test("is present under public/ and matches its pinned digest", () => {
    // Catches a rename, a .gitignore rule, or an unreviewed byte swap.
    const bytes = readFileSync(resolve(REPO_ROOT, PUBLIC_FONT_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
  });

  test("ships its licence, matched on distinctive OFL text", () => {
    // Matched on real content, not merely non-empty: round 11 probed the weaker
    // predicate and found "x" and "not-the-OFL" both pass a non-empty check,
    // which would leave the claim to ship OFL-licensed bytes false with the row
    // green. The heading is "PERMISSION AND CONDITIONS" — spelled out, not "&".
    const licence = readFileSync(resolve(REPO_ROOT, "public/fonts/OFL.txt"), "utf8");
    expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(licence).toContain("PERMISSION AND CONDITIONS");
  });

  test("leaves no font binary behind under assets/", () => {
    // Two copies of one face is the drift this whole change exists to prevent.
    expect(existsSync(resolve(REPO_ROOT, "assets/fonts/InterVariable-latin.woff2"))).toBe(false);
  });

  test("keeps its provenance record beside the bytes", () => {
    const provenance = readFileSync(resolve(REPO_ROOT, "public/fonts/PROVENANCE.md"), "utf8");
    expect(provenance).toContain(EXPECTED_SHA256);
    // The record must point at where the file actually is now.
    expect(provenance).not.toContain("assets/fonts/");
  });
});
