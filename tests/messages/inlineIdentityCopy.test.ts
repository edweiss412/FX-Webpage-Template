import { describe, expect, it } from "vitest";
import { messageFor, type MessageCode } from "@/lib/messages/lookup";

// Spec 2026-07-17 §6: converted codes and the identity placeholder each template carries.
export const SWEEP_EXPECTATIONS: Record<string, string> = {
  REPORT_ORPHANED_LOST_LEASE: "<show-name>",
  REPORT_LOOKUP_INCONCLUSIVE: "<show-name>",
  REPORT_DUPLICATE_LIVE_MATCHES: "<show-name>",
  REPORT_OPEN_ORPHAN_LABEL: "<show-name>",
  REPORT_LEASE_THRASHING: "<show-name>",
  STALE_ORPHAN_REPORT: "<show-name>",
  PENDING_SNAPSHOT_PROMOTE_STUCK: "<show-name>",
  PENDING_SNAPSHOT_ROLLBACK_STUCK: "<sheet-name>",
  EMAIL_DELIVERY_FAILED: "<show-name>",
  WIZARD_SESSION_SUPERSEDED_RACE: "<file-name>",
  BRANCH_PROTECTION_DRIFT: "<repo>",
  BRANCH_PROTECTION_MONITOR_AUTH_FAILED: "<repo>",
};

describe("sweep codes carry identity inline (spec 2026-07-17 §6)", () => {
  it.each(Object.entries(SWEEP_EXPECTATIONS))("%s dougFacing contains %s", (code, token) => {
    expect(messageFor(code as MessageCode).dougFacing).toContain(token);
  });
});
