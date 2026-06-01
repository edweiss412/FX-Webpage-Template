import { expect, it } from "vitest";
import { driveFolderUrl } from "@/lib/drive/driveFolderUrl";

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
