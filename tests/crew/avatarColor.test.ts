import { describe, it, expect } from "vitest";
import { avatarColor, AVATAR_PALETTE } from "@/lib/crew/avatarColor";

// WCAG relative-luminance contrast vs #FFFFFF white avatar text.
function contrastVsWhite(hex: string): number {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  return 1.05 / (L + 0.05);
}

describe("avatarColor", () => {
  it("every palette swatch clears WCAG AA (>=4.5:1) on white text", () => {
    expect(AVATAR_PALETTE).toHaveLength(8);
    for (const hex of AVATAR_PALETTE) {
      expect(contrastVsWhite(hex)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("is deterministic per name (stable across calls)", () => {
    expect(avatarColor("John Carleo")).toBe(avatarColor("John Carleo"));
  });
  it("varies by name (not all the same swatch)", () => {
    const names = ["John Carleo", "Alex Rodrigues", "Doug Larson", "Kari Rose", "Eric Weiss"];
    expect(new Set(names.map(avatarColor)).size).toBeGreaterThan(1);
  });
  it("is case/space-insensitive (same person, same color)", () => {
    expect(avatarColor("  john   carleo ")).toBe(avatarColor("John Carleo"));
  });
  it("blank/whitespace name → slate fallback", () => {
    expect(avatarColor("")).toBe("#515763");
    expect(avatarColor("   ")).toBe("#515763");
  });
  it("returns a member of the palette", () => {
    expect(AVATAR_PALETTE).toContain(avatarColor("Anybody"));
  });
});
