// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  deriveAttentionItems,
  ATTENTION_ROUTES,
  type AttentionAlertInput,
} from "@/lib/admin/attentionItems";

const row = (code: string): AttentionAlertInput => ({
  id: code,
  code,
  context: null,
  raised_at: "2026-07-20T00:00:00Z",
  occurrence_count: 1,
  identityText: null,
  messageParams: {},
  crewName: null,
});

describe("PICKER_EPOCH_RESET cut from attention", () => {
  it("route row REMAINS for registry totality", () =>
    expect(ATTENTION_ROUTES.PICKER_EPOCH_RESET).toBeDefined());
  it("produces no attention item", () =>
    expect(
      deriveAttentionItems({ alerts: [row("PICKER_EPOCH_RESET")], feed: null, slug: "s" }),
    ).toHaveLength(0));
  it("a non-cut code still produces one (control)", () =>
    expect(
      deriveAttentionItems({ alerts: [row("PARSE_ERROR_LAST_GOOD")], feed: null, slug: "s" }),
    ).toHaveLength(1));
  it("header-pill actionable count is UNAFFECTED by a picker row (spec §1.1)", () => {
    const actionable = (items: ReturnType<typeof deriveAttentionItems>) =>
      items.filter((i) => i.actionable).length;
    const withPicker = deriveAttentionItems({
      alerts: [row("PARSE_ERROR_LAST_GOOD"), row("PICKER_EPOCH_RESET")],
      feed: null,
      slug: "s",
    });
    const without = deriveAttentionItems({
      alerts: [row("PARSE_ERROR_LAST_GOOD")],
      feed: null,
      slug: "s",
    });
    expect(actionable(withPicker)).toBe(actionable(without));
  });
});
