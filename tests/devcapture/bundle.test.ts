// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildTelemetryDoc,
  zipBundle,
  bundleFilename,
  downloadBlob,
} from "@/lib/devcapture/bundle";

const META = {
  capturedAt: "2026-07-22T12:00:00.000Z",
  commitSha: null,
  url: "https://x.test/admin",
  userAgent: "ua",
  viewport: { w: 1280, h: 800, dpr: 2 },
  modalKind: "published" as const,
  showId: "00000000-0000-4000-8000-000000000000",
  driveFileId: null,
  panelRect: { w: 900, h: 700 },
};

describe("buildTelemetryDoc", () => {
  it("has exactly three top-level keys and an OBJECT snapshot (no double encoding)", () => {
    const doc = buildTelemetryDoc({
      meta: META,
      clientSnapshot: { a: 1, fn: () => 1 },
      server: { kind: "unavailable", reason: "network_error" },
    }) as Record<string, unknown>;
    expect(Object.keys(doc).sort()).toEqual(["clientSnapshot", "meta", "server"]);
    expect(typeof doc["clientSnapshot"]).toBe("object");
    expect(JSON.stringify(doc)).not.toContain('"fn"');
  });
  it("degrades an oversize snapshot to too_large", () => {
    const doc = buildTelemetryDoc({
      meta: META,
      clientSnapshot: { big: "x".repeat(1_000_001) },
      server: {},
    }) as { clientSnapshot: { kind: string } };
    expect(doc.clientSnapshot.kind).toBe("too_large");
  });
  it("degrades a throwing snapshot to unserializable and keeps going", () => {
    const cyc: Record<string, unknown> = {};
    cyc["self"] = cyc; // JSON.stringify throws
    const doc = buildTelemetryDoc({ meta: META, clientSnapshot: cyc, server: {} }) as {
      clientSnapshot: { kind: string; reason: string };
    };
    expect(doc.clientSnapshot).toEqual({ kind: "unserializable", reason: "serialize_threw" });
  });
});

describe("zipBundle", () => {
  it("round-trips exactly two byte-identical entries", () => {
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const json = JSON.stringify({ ok: true });
    const entries = unzipSync(zipBundle(png, json));
    expect(Object.keys(entries).sort()).toEqual(["screenshot.png", "telemetry.json"]);
    expect(Array.from(entries["screenshot.png"] ?? new Uint8Array())).toEqual(Array.from(png));
    expect(strFromU8(entries["telemetry.json"] ?? new Uint8Array())).toBe(json);
  });
});

describe("bundleFilename", () => {
  const now = new Date(2026, 6, 22, 9, 5, 7); // local
  it("sanitizes, truncates to 64, stamps local time", () => {
    expect(bundleFilename("My Show! #2", now)).toBe("dev-capture-myshow2-20260722-090507.zip");
    const long = "a".repeat(70);
    expect(bundleFilename(long, now)).toBe(`dev-capture-${"a".repeat(64)}-20260722-090507.zip`);
    expect(bundleFilename("!!!", now)).toBe("dev-capture-show-20260722-090507.zip");
    expect(bundleFilename("ok", now)).toMatch(/^dev-capture-[a-z0-9-]+-\d{8}-\d{6}\.zip$/);
  });
});

describe("downloadBlob", () => {
  afterEach(() => vi.restoreAllMocks());
  it("revokes on success, on click-throw, and on skipped click (shouldClick false)", () => {
    const create = vi.fn(() => "blob:u1");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    downloadBlob(new Uint8Array([1]), "f.zip");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:u1");
    click.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => downloadBlob(new Uint8Array([1]), "f.zip")).toThrow("boom");
    expect(revoke).toHaveBeenCalledTimes(2);
    click.mockImplementation(() => undefined);
    downloadBlob(new Uint8Array([1]), "f.zip", () => false); // owner unmounted
    expect(click).toHaveBeenCalledTimes(2); // NOT called a third time
    expect(revoke).toHaveBeenCalledTimes(3); // still revoked
  });
});
