import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

// The surviving row is the per-show route itself, which is now a redirect into the
// dashboard modal. The two component/test rows were dropped when their files were
// retired (2026-08-03) — a guard row for a deleted file asserts nothing. One row is
// enough to keep this non-vacuous: it is the file the pivot actually left behind,
// and the loader would have to come back THROUGH it.
const FILES = ["app/admin/show/[slug]/page.tsx"];

describe("post-pivot admin crew loader", () => {
  test.each(FILES)("%s no longer depends on loadShowCrewWithAuth", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/loadShowCrewWithAuth/);
    expect(source).not.toMatch(/CrewRowForLinkPanel/);
    expect(source).not.toMatch(
      /current_token_version|max_issued_version|revoked_below_version|authMissing/,
    );
  });
});
