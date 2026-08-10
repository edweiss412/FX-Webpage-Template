import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../../_shared/premise";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const MODAL_REL = "components/shared/ReportModal.tsx";
const SRC = readFileSync(join(REPO_ROOT, MODAL_REL), "utf8");

// Fresh literal per use; no g flag (lastIndex statefulness).
const ADMIN_COMPARISON = /surface\s*===\s*"admin"|"admin"\s*===\s*surface/;

describe("ReportModal surface accept-set (spec §2.2)", () => {
  it("scan can fail: planted admin comparison matches", () => {
    premiseHolds(
      "planted fixture must match or the scan below is vacuous",
      ADMIN_COMPARISON.test('x.surface === "admin"'),
    );
    premiseHolds(
      "the scanned source must be non-empty or the scan below is vacuous",
      SRC.length > 0,
    );
  });

  it("has no surface === admin comparisons (crew-vs-rest only)", () => {
    const hits = SRC.match(new RegExp(ADMIN_COMPARISON.source, "g")) ?? [];
    expect(
      hits,
      "behavior must key on crew-vs-rest; an admin comparison silently gives help the crew arm",
    ).toEqual([]);
  });
});
