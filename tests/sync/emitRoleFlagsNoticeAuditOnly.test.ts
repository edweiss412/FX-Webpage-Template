import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";

const emitLeadRoleApplied = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/log/emitLeadRoleApplied", () => ({ emitLeadRoleApplied }));

const notice: RoleFlagsNotice = {
  showId: "show-1",
  code: "ROLE_FLAGS_NOTICE",
  context: {
    drive_file_id: "file-1",
    changes: [{ crew_name: "Bob", prior_flags: [], new_flags: ["A1", "LEAD"] }],
  },
};

describe("emitRoleFlagsNotice audit-only notices", () => {
  beforeEach(() => emitLeadRoleApplied.mockClear());

  it("records the LEAD audit event and raises the bell alert for an ordinary notice", async () => {
    const { emitRoleFlagsNotice } = await import("@/lib/sync/emitRoleFlagsNotice");
    const upsertAdminAlert = vi.fn(async () => undefined);
    await emitRoleFlagsNotice(notice, { upsertAdminAlert });
    expect(emitLeadRoleApplied).toHaveBeenCalledTimes(1);
    expect(upsertAdminAlert).toHaveBeenCalledWith(notice);
  });

  it("records the LEAD audit event but raises no bell alert for an audit-only notice", async () => {
    const { emitRoleFlagsNotice } = await import("@/lib/sync/emitRoleFlagsNotice");
    const upsertAdminAlert = vi.fn(async () => undefined);
    const auditOnly: RoleFlagsNotice = { ...notice, auditOnly: true };
    await emitRoleFlagsNotice(auditOnly, { upsertAdminAlert });
    expect(emitLeadRoleApplied).toHaveBeenCalledWith(auditOnly, expect.anything());
    expect(upsertAdminAlert).not.toHaveBeenCalled();
  });
});
