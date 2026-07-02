import { describe, expect, test } from "vitest";
import { partitionByIgnored } from "@/lib/dataQuality/partitionByIgnored";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { ParseWarning } from "@/lib/parser/types";

const w = (code: string, rawSnippet?: string): ParseWarning => ({ severity: "warn", code, message: `${code} msg`, rawSnippet });

describe("partitionByIgnored", () => {
  test("AC-3: a warning whose fingerprint is stored lands in `ignored`; others in `active`", () => {
    const ignored = w("UNKNOWN_FIELD", "Storage | x");
    const active = w("UNKNOWN_FIELD", "Truss | y");
    const fps = new Set([warningFingerprint(ignored)!]);
    const out = partitionByIgnored([ignored, active], fps);
    expect(out.ignored.map((x) => x.rawSnippet)).toEqual(["Storage | x"]);
    expect(out.active.map((x) => x.rawSnippet)).toEqual(["Truss | y"]);
  });

  test("AC-4: after the content changes, the same-row warning re-surfaces as active", () => {
    const original = w("UNKNOWN_FIELD", "Storage | x");
    const fps = new Set([warningFingerprint(original)!]);
    const edited = w("UNKNOWN_FIELD", "Storage | EDITED");
    const out = partitionByIgnored([edited], fps);
    expect(out.active).toHaveLength(1);
    expect(out.ignored).toHaveLength(0);
  });

  test("non-ignorable warnings (no fingerprint) are always active", () => {
    const out = partitionByIgnored([w("AGENDA_GRID_MALFORMED")], new Set());
    expect(out.active).toHaveLength(1);
    expect(out.ignored).toHaveLength(0);
  });
});
