// @vitest-environment jsdom
// tests/admin/perShowActionableTransitions.test.tsx - spec §6 transition inventory pins
// (spec 2026-07-20-warning-card-copy-restore).
//
// Mocks @/lib/messages/lookup so variants B (guidance-only) and C (trigger-only)
// are reachable: post-sweep, every real registry code carries BOTH fields, so the
// two independent-condition variants exist only for synthetic entries. Separate
// file from perShowActionableRenderControls.test.tsx, which must keep the real
// catalog.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/messages/lookup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/messages/lookup")>();
  const SYNTH: Record<
    string,
    {
      title: string;
      helpfulContext: string | null;
      triggerContext: string | null;
      controlsNote?: string | null;
    }
  > = {
    // controlsNote: null on B/C/D so the real UNKNOWN_FIELD entry this spreads from cannot
    // leak its note into the four variants that predate it. SYN_A has no entry by design
    // (an unknown code) and needs nothing.
    SYN_B: {
      title: "B title",
      helpfulContext: "B guidance",
      triggerContext: null,
      controlsNote: null,
    },
    SYN_C: {
      title: "C title",
      helpfulContext: null,
      triggerContext: "C trigger",
      controlsNote: null,
    },
    SYN_D: {
      title: "D title",
      helpfulContext: "D guidance",
      triggerContext: "D trigger",
      controlsNote: null,
    },
    // G2: catalog guidance + note. G3: note alone (helpfulContext null).
    SYN_E: {
      title: "E title",
      helpfulContext: "E guidance",
      triggerContext: null,
      controlsNote: "E note: use Report",
    },
    SYN_F: {
      title: "F title",
      helpfulContext: null,
      triggerContext: null,
      controlsNote: "F note: use Report",
    },
    // G4: an INSTANCE (autocorrect) line suppresses the note. Must be a REAL autocorrect
    // code - autocorrectGuidance composes from a SENTENCE map keyed by code - and it
    // carries a note so the suppression is exercised on an entry that HAS one.
    FIELD_LABEL_AUTOCORRECTED: {
      title: "G title",
      helpfulContext: "G guidance",
      triggerContext: null,
      controlsNote: "G note: use Report",
    },
  };
  return {
    ...real,
    isMessageCode: (c: string) => c in SYNTH || real.isMessageCode(c),
    messageFor: (c: string) =>
      c in SYNTH
        ? { ...real.messageFor("UNKNOWN_FIELD" as never), ...SYNTH[c] }
        : real.messageFor(c as never),
  };
});

afterEach(() => cleanup());

const warn = (code: string, autocorrect?: ParseWarning["autocorrect"]): ParseWarning => ({
  severity: "warn",
  code,
  message: "human text",
  ...(autocorrect ? { autocorrect } : {}),
});

/** `subject` is REQUIRED by the Autocorrect type (string | null); FIELD_LABEL_AUTOCORRECTED
 *  is not crew-scoped, so a null subject still composes a sentence. */
const AUTOCORRECT = {
  subject: null,
  corrections: [{ detected: "Stge", corrected: "Stage" }],
} satisfies NonNullable<ParseWarning["autocorrect"]>;

// Every member carries the same three flags so a `note` read is well-typed on all of them
// (strict TS: a field absent from one member is TS2339 on the union).
const VARIANTS = {
  A: { code: "SYN_A", guidance: false, trigger: false, note: false }, // unknown code
  B: { code: "SYN_B", guidance: true, trigger: false, note: false },
  C: { code: "SYN_C", guidance: false, trigger: true, note: false },
  D: { code: "SYN_D", guidance: true, trigger: true, note: false },
  E: { code: "SYN_E", guidance: true, trigger: false, note: true }, // G2
  F: { code: "SYN_F", guidance: true, trigger: false, note: true }, // G3: the note IS the guidance
  G: { code: "FIELD_LABEL_AUTOCORRECTED", guidance: true, trigger: false, note: false }, // G4
} as const satisfies Record<
  string,
  { code: string; guidance: boolean; trigger: boolean; note: boolean }
>;
type VariantKey = keyof typeof VARIANTS;
const NOTE_OF: Partial<Record<VariantKey, string>> = {
  E: "E note: use Report",
  F: "F note: use Report",
};
const itemsFor = (v: VariantKey): ParseWarning[] => [
  warn(VARIANTS[v].code, v === "G" ? AUTOCORRECT : undefined),
];

function expectVariant(v: VariantKey) {
  const { guidance, trigger, note } = VARIANTS[v];
  const el = screen.queryByTestId("per-show-actionable-guidance");
  expect(!!el, `${v} guidance`).toBe(guidance);
  expect(!!screen.queryByTestId(/per-show-actionable-help-.*-trigger/), `${v} trigger`).toBe(
    trigger,
  );
  const text = el?.textContent ?? "";
  if (note) {
    expect(text.endsWith(NOTE_OF[v]!), `${v} note is the last sentence`).toBe(true);
  } else {
    // G's entry HAS a controlsNote; the instance (autocorrect) line must suppress it.
    expect(/\bReport\b/.test(text), `${v} names no control`).toBe(false);
  }
  // Spec §11: every G-pair is instant. No motion wrapper anywhere above the guidance node.
  if (el) expect(el.closest('[data-motion], [style*="transition"]')).toBeNull();
}

describe("transition inventory (spec §6): every pair instant, both directions", () => {
  // Derived over EVERY ordered pair (an untyped Object.keys yields `string` and VARIANTS[x]
  // is then TS7053), so the ten G-state pairs of spec §11 are covered in both directions and
  // the original six are kept by construction.
  const KEYS = Object.keys(VARIANTS) as VariantKey[];
  const PAIRS: ReadonlyArray<readonly [VariantKey, VariantKey]> = KEYS.flatMap((x) =>
    KEYS.filter((y) => y !== x).map((y) => [x, y] as const),
  );

  it.each(PAIRS)("%s↔%s swaps synchronously with no residue", (x, y) => {
    // `showControlsNote` on every render: the PROP is the mount's promise, and whether a
    // note appears is then the ENTRY's business, which is what the variants vary.
    const { rerender } = render(
      <PerShowActionableWarnings items={itemsFor(x)} driveFileId={null} showControlsNote />,
    );
    expectVariant(x);
    rerender(<PerShowActionableWarnings items={itemsFor(y)} driveFileId={null} showControlsNote />);
    expectVariant(y);
    rerender(<PerShowActionableWarnings items={itemsFor(x)} driveFileId={null} showControlsNote />);
    expectVariant(x);
  });

  // The condensed axis (spec §11's "C" column): the catalog string, note included, is
  // routed into the popover body instead of the inline slot. Same matrix, so no G-pair is
  // covered in one mode only.
  it.each(PAIRS)("%s↔%s is instant in condensed mode too", (x, y) => {
    const { rerender } = render(
      <PerShowActionableWarnings
        items={itemsFor(x)}
        driveFileId={null}
        showControlsNote
        condensed
      />,
    );
    const noteVisible = (v: VariantKey): boolean =>
      (document.body.textContent ?? "").includes(NOTE_OF[v] ?? "\u0000never");
    expect(noteVisible(x), `${x} condensed note`).toBe(VARIANTS[x].note);
    rerender(
      <PerShowActionableWarnings
        items={itemsFor(y)}
        driveFileId={null}
        showControlsNote
        condensed
      />,
    );
    expect(noteVisible(y), `${y} condensed note`).toBe(VARIANTS[y].note);
    expect(noteVisible(x), `${x} note gone after the swap`).toBe(
      VARIANTS[x].note && NOTE_OF[x] === NOTE_OF[y],
    );
  });

  it.each([
    ["D", "B"],
    ["C", "A"],
  ] as const)("compound %s→%s: open popover unmounts with its trigger (spec §6)", (from, to) => {
    const { rerender } = render(
      <PerShowActionableWarnings items={itemsFor(from)} driveFileId={null} />,
    );
    fireEvent.click(screen.getByTestId(/per-show-actionable-help-.*-trigger/));
    expect(screen.getByTestId(/per-show-actionable-help-.*-body/).className).not.toContain(
      "hidden",
    );
    rerender(<PerShowActionableWarnings items={itemsFor(to)} driveFileId={null} />);
    expect(screen.queryByTestId(/per-show-actionable-help-.*-body/)).toBeNull();
    expect(screen.queryByTestId(/per-show-actionable-help-.*-trigger/)).toBeNull();
  });

  it("adapter source declares no animation wrappers (instant contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/admin/PerShowActionableWarnings.tsx", "utf8");
    expect(src).not.toMatch(/AnimatePresence|framer-motion|motion\./);
  });
});
