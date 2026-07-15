import { describe, it, expect } from "vitest";
import { findLiveResolvableWarning } from "@/lib/sync/useRawDecisionState";
import type { ParseWarning } from "@/lib/parser/types";

// findLiveResolvableWarning is the in-lock three-branch validator (spec §9). The
// duplicate-identity case (two rooms with the SAME name+field but distinct raw
// content) is the Codex R3 F2 hole: candidate selection must be driven by the
// client's observedContentHash, not "first resolvable then check hash", or a valid
// decision on a later duplicate is unreachable (always reported stale).

function roomWarning(over: {
  name: string;
  field?: "dims" | "name";
  index?: number;
  hash?: string; // omit for a resolvable:false warning
}): ParseWarning {
  const blockRef: ParseWarning["blockRef"] = {
    kind: "rooms",
    name: over.name,
    field: over.field ?? "dims",
  };
  if (over.index !== undefined) blockRef.index = over.index;
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: "m",
    blockRef,
    resolution:
      over.hash === undefined
        ? { resolvable: false, reason: "empty-raw" }
        : {
            resolvable: true,
            contentHash: over.hash,
            parsed: { kind: "rooms", name: over.name, dimensions: null, floor: null },
            replacement: { kind: "rooms", name: "RAW", dimensions: null, floor: null },
          },
  };
}

const REF = (observedContentHash: string, index?: number) => ({
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  blockRef: {
    kind: "rooms",
    name: "LASALLE",
    field: "dims",
    ...(index !== undefined ? { index } : {}),
  },
  observedContentHash,
});

describe("findLiveResolvableWarning — duplicate-identity content-hash disambiguation", () => {
  it("picks the warning whose contentHash matches the observed hash, not the first candidate (Codex R3 F2)", () => {
    const warnings = [
      roomWarning({ name: "LASALLE", index: 0, hash: "hash-A" }),
      roomWarning({ name: "LASALLE", index: 1, hash: "hash-B" }),
    ];
    // Client observed the SECOND room's hash but sends a blockRef with no index (name+field only).
    const res = findLiveResolvableWarning(warnings, REF("hash-B"));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.contentHash).toBe("hash-B");
  });

  it("still reports stale when the observed hash matches NO live resolvable warning", () => {
    const warnings = [
      roomWarning({ name: "LASALLE", index: 0, hash: "hash-A" }),
      roomWarning({ name: "LASALLE", index: 1, hash: "hash-B" }),
    ];
    const res = findLiveResolvableWarning(warnings, REF("hash-GONE"));
    expect(res).toEqual({ ok: false, reason: "stale" });
  });

  it("reports not_resolvable when the only matching warning has no resolvable resolution", () => {
    const warnings = [roomWarning({ name: "LASALLE", index: 0 })]; // resolvable:false
    const res = findLiveResolvableWarning(warnings, REF("anything"));
    expect(res).toEqual({ ok: false, reason: "not_resolvable" });
  });

  it("reports not_found when no warning matches code+blockRef", () => {
    const warnings = [roomWarning({ name: "OTHER", index: 0, hash: "hash-A" })];
    const res = findLiveResolvableWarning(warnings, REF("hash-A"));
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("the non-duplicate happy path still returns the server-derived hash + target", () => {
    const warnings = [roomWarning({ name: "LASALLE", index: 0, hash: "hash-A" })];
    const res = findLiveResolvableWarning(warnings, REF("hash-A"));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.contentHash).toBe("hash-A");
      expect(res.target).toEqual({ kind: "rooms", name: "LASALLE", index: 0, field: "dims" });
    }
  });
});
