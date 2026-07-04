// Step-3 modal follow-ups Task 2 (spec §B1) — shared untrusted-JSONB guard
// for staged diagram stubs. isRenderableDiagramStub is the element-level
// predicate consumed by BOTH the Task-3 staged-diagram preview route and the
// Task-6 DiagramsBreakdown UI, so the two surfaces can never disagree on
// what "valid stub" means. isTrustedDiagramContentUrl is the URL trust
// boundary that prevents the Drive bearer token (sent by
// snapshotFetchEmbeddedImageBytesTimed) from being exfiltrated to an
// attacker-controlled origin (SSRF class) via a corrupt persisted contentUrl.
import { describe, expect, it } from "vitest";
import {
  isRenderableDiagramStub,
  isTrustedDiagramContentUrl,
} from "@/lib/admin/stagedDiagramGuards";

describe("isRenderableDiagramStub", () => {
  it("accepts a minimal valid stub", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
      }),
    ).toBe(true);
  });

  it("accepts contentUrl: null", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        contentUrl: null,
      }),
    ).toBe(true);
  });

  it("accepts a string contentUrl", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        contentUrl: "https://x",
      }),
    ).toBe(true);
  });

  it("accepts a string alt", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        alt: "floor plan",
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isRenderableDiagramStub(null)).toBe(false);
  });

  it("rejects a string", () => {
    expect(isRenderableDiagramStub("str")).toBe(false);
  });

  it("rejects a number", () => {
    expect(isRenderableDiagramStub(42)).toBe(false);
  });

  it("rejects an array", () => {
    expect(isRenderableDiagramStub([])).toBe(false);
  });

  it("rejects non-string objectId", () => {
    expect(isRenderableDiagramStub({ objectId: 123 })).toBe(false);
  });

  it("rejects a stub missing mimeType", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
      }),
    ).toBe(false);
  });

  it("rejects a stub missing sheetTab", () => {
    expect(
      isRenderableDiagramStub({
        objectId: "obj-1",
        mimeType: "image/png",
      }),
    ).toBe(false);
  });

  it("rejects a non-string alt", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        alt: 7,
      }),
    ).toBe(false);
  });

  it("rejects a non-string, non-null contentUrl", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        contentUrl: 5,
      }),
    ).toBe(false);
  });

  it("accepts an absent contentUrl (undefined)", () => {
    expect(
      isRenderableDiagramStub({
        sheetTab: "DIAGRAMS",
        objectId: "obj-1",
        mimeType: "image/png",
        contentUrl: undefined,
      }),
    ).toBe(true);
  });
});

describe("isTrustedDiagramContentUrl", () => {
  it("trusts an lh3.googleusercontent.com subdomain URL", () => {
    expect(isTrustedDiagramContentUrl("https://lh3.googleusercontent.com/a")).toBe(true);
  });

  it("trusts a docs.google.com subdomain URL", () => {
    expect(isTrustedDiagramContentUrl("https://docs.google.com/x")).toBe(true);
  });

  it("trusts the bare google.com apex", () => {
    expect(isTrustedDiagramContentUrl("https://google.com/x")).toBe(true);
  });

  it("trusts the bare googleusercontent.com apex", () => {
    expect(isTrustedDiagramContentUrl("https://googleusercontent.com/x")).toBe(true);
  });

  it("rejects http (https only)", () => {
    expect(isTrustedDiagramContentUrl("http://lh3.googleusercontent.com/a")).toBe(false);
  });

  it("rejects an unrelated origin", () => {
    expect(isTrustedDiagramContentUrl("https://evil.example/x")).toBe(false);
  });

  it("rejects a suffix-spoofed host (dot-boundary rule)", () => {
    expect(isTrustedDiagramContentUrl("https://google.com.evil.net/x")).toBe(false);
  });

  it("rejects a lookalike host", () => {
    expect(isTrustedDiagramContentUrl("https://notgoogle.com/x")).toBe(false);
  });

  it("rejects an unparseable URL", () => {
    expect(isTrustedDiagramContentUrl("::::")).toBe(false);
  });
});
