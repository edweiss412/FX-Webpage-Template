// tests/auth/picker/sanitizePickerRoster.test.ts
import { describe, expect, test } from "vitest";
import { sanitizePickerRoster } from "@/lib/auth/picker/sanitizePickerRoster";

const row = (id: string, name: string) => ({ id, name, role: "A1", role_flags: [], claimed_via_oauth_at: null });

describe("sanitizePickerRoster", () => {
  test("drops sentinel-named rows (each GENERIC_OPTIONAL_HIDE token, any case, trimmed)", () => {
    const raw = [row("1", "Doug Larson"), row("2", "TBD"), row("3", "n/a"), row("4", "  TBA "), row("5", "-"), row("6", "—"), row("7", "")];
    expect(sanitizePickerRoster(raw).map((r) => r.id)).toEqual(["1"]);
  });

  test("collapses duplicate ids first-wins, preserves order", () => {
    const raw = [row("a", "Alice"), row("b", "Bob"), row("a", "Alice Again")];
    const out = sanitizePickerRoster(raw);
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
    expect(out[0]!.name).toBe("Alice"); // first occurrence wins
  });

  test("keeps same-name different-id rows (never dedups by name)", () => {
    const raw = [row("1", "John Smith"), row("2", "John Smith")];
    expect(sanitizePickerRoster(raw).map((r) => r.id)).toEqual(["1", "2"]);
  });

  test("empty in → empty out; all-sentinel in → empty out", () => {
    expect(sanitizePickerRoster([])).toEqual([]);
    expect(sanitizePickerRoster([row("1", "TBD"), row("2", "   ")])).toEqual([]);
  });
});
