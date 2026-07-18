// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ParseWarning, UseRawResolution } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { deriveUseRawControlState } from "@/components/admin/UseRawControl";
import { RoleRecognizeControlBoundary } from "@/components/admin/RoleRecognizeControlBoundary";
import { warningOffersFix } from "@/lib/admin/warningFixAffordance";

// RoleRecognizeControlBoundary imports three "use server" action modules at
// module level; mock them so jsdom never touches server-only deps. We only
// exercise its self-hide (null) gate, which runs BEFORE any action is called.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/show/[slug]/_actions/roleToken", () => ({ mapRoleToken: vi.fn() }));
vi.mock("@/app/admin/onboarding/_actions/roleTokenStaged", () => ({ mapRoleTokenStaged: vi.fn() }));
vi.mock("@/app/admin/settings/_actions/roleTokenMappings", () => ({
  updateRoleTokenMapping: vi.fn(),
}));

const IN_SCOPE = [
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "DATE_ORDER_SUGGESTS_DMY",
] as const;

function resolvable(): Extract<UseRawResolution, { resolvable: true }> {
  return {
    resolvable: true,
    contentHash: "hash-1",
    parsed: { kind: "rooms", name: "Grand Ballroom", dimensions: "40x60", floor: "2" },
    replacement: { kind: "rooms", name: "Salon A", dimensions: null, floor: null },
  };
}

describe("warningOffersFix — role branch", () => {
  it("true for UNKNOWN_ROLE_TOKEN with a non-empty token", () => {
    expect(
      warningOffersFix(
        { code: "UNKNOWN_ROLE_TOKEN", roleToken: "STROBE_TECH" } as ParseWarning,
        undefined,
      ),
    ).toBe(true);
  });
  it("false for UNKNOWN_ROLE_TOKEN with empty / whitespace token", () => {
    for (const roleToken of ["", "   "]) {
      expect(
        warningOffersFix({ code: "UNKNOWN_ROLE_TOKEN", roleToken } as ParseWarning, undefined),
      ).toBe(false);
    }
  });
});

describe("warningOffersFix — use-raw branch", () => {
  it("true for each in-scope resolvable code (no decision, and with a persisted decision)", () => {
    const decided: UseRawDecision = {
      code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
      contentHash: "hash-1",
      target: { kind: "rooms" },
      preference: "raw",
      applied: true,
      decidedAt: "2026-01-01T00:00:00Z",
      decidedBy: "tester",
    };
    for (const code of IN_SCOPE) {
      const w = { code, resolution: resolvable() } as ParseWarning;
      expect(warningOffersFix(w, undefined)).toBe(true);
      expect(warningOffersFix(w, code === decided.code ? decided : undefined)).toBe(true);
    }
  });
  it("false for in-scope but legacy-unavailable (no resolution) and disabled (resolvable:false)", () => {
    for (const code of IN_SCOPE) {
      expect(warningOffersFix({ code } as ParseWarning, undefined)).toBe(false); // no resolution
      expect(
        warningOffersFix(
          { code, resolution: { resolvable: false, reason: "empty-raw" } } as ParseWarning,
          undefined,
        ),
      ).toBe(false);
    }
  });
  it("false for out-of-scope code (SOME_CODE)", () => {
    expect(warningOffersFix({ code: "SOME_CODE" } as ParseWarning, undefined)).toBe(false);
  });
});

// Parity meta-test: predicate's use-raw verdict stays in lockstep with the
// control's actual render gate (deriveUseRawControlState interactive states).
describe("warningOffersFix ↔ deriveUseRawControlState parity (drift guard)", () => {
  const NON_INTERACTIVE = new Set([null, "legacy-unavailable", "disabled"]);
  it("use-raw branch equals 'derive state is interactive' across code × resolution × decision", () => {
    const codes = [...IN_SCOPE, "SOME_CODE"];
    const resolutions: (UseRawResolution | undefined)[] = [
      undefined,
      { resolvable: false, reason: "empty-raw" },
      resolvable(),
    ];
    const decisions: (UseRawDecision | undefined)[] = [
      undefined,
      {
        code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
        contentHash: "hash-1",
        target: { kind: "rooms" },
        preference: "raw",
        applied: true,
        decidedAt: "2026-01-01T00:00:00Z",
        decidedBy: "tester",
      },
    ];
    for (const code of codes)
      for (const resolution of resolutions)
        for (const decision of decisions) {
          const w = { code, ...(resolution ? { resolution } : {}) } as ParseWarning;
          const st = deriveUseRawControlState(w, decision, false);
          const interactive = !NON_INTERACTIVE.has(st);
          // role branch does not apply to these codes, so predicate === use-raw verdict
          expect(warningOffersFix(w, decision)).toBe(interactive);
        }
  });
});

// Parity meta-test (role branch): predicate's role verdict stays in lockstep
// with RoleRecognizeControlBoundary's LIVE self-hide gate — rendered, not
// re-derived (a re-derivation would be tautological). Spec §9.
describe("warningOffersFix ↔ RoleRecognizeControlBoundary parity (drift guard)", () => {
  const cases: { label: string; warning: ParseWarning }[] = [
    {
      label: "non-role code",
      warning: { severity: "warn", code: "SOME_CODE", message: "", blockRef: { kind: "crew" } },
    },
    {
      label: "role code, absent token",
      warning: {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "",
        blockRef: { kind: "crew" },
      },
    },
    {
      label: "role code, empty token",
      warning: {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        roleToken: "",
        message: "",
        blockRef: { kind: "crew" },
      },
    },
    {
      label: "role code, whitespace token",
      warning: {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        roleToken: "   ",
        message: "",
        blockRef: { kind: "crew" },
      },
    },
    {
      label: "role code, real token",
      warning: {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        roleToken: "STROBE_TECH",
        message: "",
        blockRef: { kind: "crew" },
      },
    },
  ];
  it.each(cases)("$label: predicate role verdict === boundary renders non-null", ({ warning }) => {
    const { container } = render(
      <RoleRecognizeControlBoundary
        surface="wizard"
        wizardSessionId="s"
        driveFileId="d"
        warning={warning}
      />,
    );
    const boundaryRenders = container.firstChild !== null;
    // For a non-role code the use-raw branch is also false (SOME_CODE out of scope),
    // so warningOffersFix === boundaryRenders holds for every case here.
    expect(warningOffersFix(warning, undefined)).toBe(boundaryRenders);
  });
});
