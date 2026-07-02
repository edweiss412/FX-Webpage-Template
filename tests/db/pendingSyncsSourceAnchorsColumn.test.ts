import { describe, it, expect } from "vitest";
import manifest from "@/supabase/__generated__/schema-manifest.json";

// Layer 1 of the validation-schema-parity gate: a DB-free tripwire that fails if the
// migration's column was not introspected into the committed schema manifest. See
// tests/db/runOfShowColumn.test.ts for the pattern and tests/db/validation-schema-parity.test.ts.

describe("pending_syncs.source_anchors manifest tripwire (Layer 1 of validation-schema-parity)", () => {
  const cols = (table: string): string[] => {
    const entry = (manifest as Record<string, unknown>)[table];
    return Array.isArray(entry) ? (entry as string[]) : [];
  };

  it("source_anchors exists on pending_syncs", () => {
    expect(cols("pending_syncs")).toContain("source_anchors");
  });
});
