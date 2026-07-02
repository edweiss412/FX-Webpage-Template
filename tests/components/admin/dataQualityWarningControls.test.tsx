// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => cleanup());

const w = (rawSnippet?: string): ParseWarning => ({
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "m",
  ...(rawSnippet !== undefined ? { rawSnippet } : {}),
});
const base = { slug: "rpas", showId: "00000000-0000-0000-0000-000000000001", driveFileId: "df", reportSurfaceId: "sid-1" } as const;

describe("DataQualityWarningControls", () => {
  test("active + ignorable → Report + Ignore, no Un-ignore", () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="active" />);
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ignore$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /un-ignore/i })).toBeNull();
  });
  test("active + NOT ignorable (no snippet) → Report only", () => {
    render(<DataQualityWarningControls {...base} warning={w(undefined)} mode="active" />);
    expect(screen.getByRole("button", { name: /report/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^ignore$/i })).toBeNull();
  });
  test("ignored mode → Un-ignore + Report", () => {
    render(<DataQualityWarningControls {...base} warning={w("Storage | x")} mode="ignored" />);
    expect(screen.getByRole("button", { name: /un-ignore/i })).toBeTruthy();
  });
});
