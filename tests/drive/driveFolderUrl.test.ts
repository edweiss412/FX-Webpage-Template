import { describe, expect, it } from "vitest";
import { driveFolderUrl, parseDriveFolderId } from "@/lib/drive/driveFolderUrl";

it("builds the Drive folder URL", () => {
  expect(driveFolderUrl("abc123")).toBe("https://drive.google.com/drive/folders/abc123");
});

it("null/empty id → null", () => {
  expect(driveFolderUrl(null)).toBeNull();
  expect(driveFolderUrl("")).toBeNull();
});

it("encodes the id", () => {
  expect(driveFolderUrl("a/b")).toBe("https://drive.google.com/drive/folders/a%2Fb");
});

describe("parseDriveFolderId", () => {
  it("round-trips driveFolderUrl", () => {
    expect(parseDriveFolderId(driveFolderUrl("abc123"))).toBe("abc123");
  });

  it("extracts the same id from every URL form that names the folder", () => {
    // The bug this guards: all of these are the SAME folder, different strings.
    for (const url of [
      "https://drive.google.com/drive/folders/abc123",
      "https://drive.google.com/drive/folders/abc123?usp=sharing",
      "https://drive.google.com/drive/u/1/folders/abc123",
      "https://drive.google.com/drive/u/0/folders/abc123?usp=drive_link",
      "https://drive.google.com/open?id=abc123",
    ]) {
      expect(parseDriveFolderId(url)).toBe("abc123");
    }
  });

  it("rejects non-Drive / malformed / non-string input", () => {
    expect(parseDriveFolderId("not a url")).toBeNull();
    expect(parseDriveFolderId("https://evil.com/drive/folders/abc123")).toBeNull();
    expect(parseDriveFolderId("https://drive.google.com/drive/folders/")).toBeNull();
    expect(parseDriveFolderId("")).toBeNull();
    expect(parseDriveFolderId("   ")).toBeNull();
    expect(parseDriveFolderId(null)).toBeNull();
    expect(parseDriveFolderId(42)).toBeNull();
  });
});
