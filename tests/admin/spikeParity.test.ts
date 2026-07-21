// @vitest-environment node
// Shipped-type parity with the transport spike (attention-alert-routing R4#3/R5#1).
// These four negative cases must NOT typecheck; each @ts-expect-error is consumed,
// so a loosened type fails on the now-unused directive. This is a COMPILE-TIME
// guard — its assertion is the successful `pnpm typecheck`, not the runtime `it`.
import { describe, expect, it } from "vitest";
import type { AttentionRoute, AttentionItem } from "@/lib/admin/attentionItems";
import type { NoteItem, NoteCode } from "@/lib/admin/parseAttentionNote";

// A non-fresh value with an extra `anchor` must not satisfy the crew (no-anchor) arm.
const crewWithAnchor = { sectionId: "crew" as const, anchor: "diagrams" as const };
// @ts-expect-error crew declares no anchors (`anchor?: never`)
const _badPairing: AttentionRoute = crewWithAnchor;

// The rooms arm must not accept the event anchor.
// @ts-expect-error "opening_reel" is not a rooms anchor
const _badAnchorForSection: AttentionRoute = { sectionId: "rooms", anchor: "opening_reel" };

// A note item must carry an alert; an alert-less item cannot enter the channel.
// @ts-expect-error `alert` is required on NoteItem
const _noteWithoutAlert: NoteItem = { id: "x", kind: "alert", tone: "notice" } as Omit<
  AttentionItem,
  "alert"
>;

// NoteCode is CLOSED: a future code is not assignable without editing the union,
// which breaks the composeParseNote `never` default. Together = "third code = compile error".
// @ts-expect-error "SOME_FUTURE_NOTE_CODE" is not a NoteCode
const _thirdCodeRejected: NoteCode = "SOME_FUTURE_NOTE_CODE";

void _badPairing;
void _badAnchorForSection;
void _noteWithoutAlert;
void _thirdCodeRejected;

describe("spike parity", () => {
  it("the four negative-type cases are enforced at compile time (see @ts-expect-error above)", () => {
    expect(true).toBe(true);
  });
});
