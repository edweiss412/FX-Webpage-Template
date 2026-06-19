import { describe, it, expect } from "vitest";
import manifest from "@/supabase/__generated__/schema-manifest.json";

// The schema-manifest is a flat object: Record<tableName, string[]> where each value
// is a sorted array of column names. Table keys are plain names (no "public." prefix).
// See supabase/__generated__/schema-manifest.json and tests/db/schema-manifest-lib.test.ts.

describe("shows_internal.run_of_show manifest tripwire (Layer 1 of validation-schema-parity)", () => {
  const cols = (table: string): string[] => {
    const entry = (manifest as Record<string, unknown>)[table];
    return Array.isArray(entry) ? (entry as string[]) : [];
  };

  it("run_of_show exists on shows_internal", () => {
    expect(cols("shows_internal")).toContain("run_of_show");
  });

  it("run_of_show is NOT on shows (D-3 — admin-only home, never crew-readable)", () => {
    expect(cols("shows")).not.toContain("run_of_show");
  });
});
