import { describe, it, expect } from "vitest";
import { projectIdentityContext } from "@/lib/adminAlerts/projectIdentityContext";

describe("projectIdentityContext", () => {
  it("keeps a real drive_file_id un-sanitized (not token-redacted)", () => {
    const out = projectIdentityContext(
      { drive_file_id: "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY" },
      { includePii: false },
    );
    expect(out.resolution.drive_file_id).toBe("1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY");
  });

  it("drops a malformed drive_file_id (fails charset/length shape)", () => {
    const out = projectIdentityContext({ drive_file_id: "!!!short" }, { includePii: false });
    expect(out.resolution.drive_file_id).toBeUndefined();
  });

  it("keeps a valid UUID show_id/crew_member_id, drops a malformed one", () => {
    const out = projectIdentityContext(
      {
        show_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        crew_member_id: "not-a-uuid",
      },
      { includePii: false },
    );
    expect(out.resolution.show_id).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
    expect(out.resolution.crew_member_id).toBeUndefined();
  });

  it("sanitizes changes to names+count, drops flag deltas", () => {
    const out = projectIdentityContext(
      {
        drive_file_id: "abcdef1234",
        changes: [{ crew_name: "Jane", prior_flags: ["X"], new_flags: ["Y"] }],
      },
      { includePii: false },
    );
    expect(out.display.role_change_crew_names).toEqual(["Jane"]);
    expect(out.counts.role_change_count).toBe(1);
    expect(JSON.stringify(out)).not.toContain("prior_flags");
    expect(JSON.stringify(out)).not.toContain("new_flags");
  });

  it("caps role_change_crew_names at 3 even when changes has more entries", () => {
    const out = projectIdentityContext(
      {
        changes: [
          { crew_name: "A", prior_flags: [], new_flags: [] },
          { crew_name: "B", prior_flags: [], new_flags: [] },
          { crew_name: "C", prior_flags: [], new_flags: [] },
          { crew_name: "D", prior_flags: [], new_flags: [] },
        ],
      },
      { includePii: false },
    );
    expect(out.display.role_change_crew_names).toEqual(["A", "B", "C"]);
    expect(out.counts.role_change_count).toBe(4);
  });

  it("derives crew_member_count from crew_member_ids array", () => {
    const out = projectIdentityContext({ crew_member_ids: ["a", "b", "c"] }, { includePii: false });
    expect(out.counts.crew_member_count).toBe(3);
  });

  it("drops non-allowlisted + diagnostic keys", () => {
    const out = projectIdentityContext(
      { error_message: "secret", rpc_error_code: "42501", orphan_url: "u", reason: "why" },
      { includePii: true },
    );
    expect(JSON.stringify(out)).not.toMatch(/secret|42501|orphan_url|"why"/);
  });

  it("drops attempted_action when out of the wizard enum, keeps a valid enum value", () => {
    const bad = projectIdentityContext(
      { attempted_action: "totally-freeform" },
      { includePii: false },
    );
    expect(bad.display.attempted_action).toBeUndefined();

    const good = projectIdentityContext({ attempted_action: "retry" }, { includePii: false });
    expect(good.display.attempted_action).toBe("retry");
  });

  it("gates email/user_email on includePii", () => {
    const withoutPii = projectIdentityContext(
      { email: "jane@x.com", user_email: "bob@x.com" },
      { includePii: false },
    );
    expect(withoutPii.display.email).toBeUndefined();
    expect(withoutPii.display.user_email).toBeUndefined();

    const withPii = projectIdentityContext(
      { email: "jane@x.com", user_email: "bob@x.com" },
      { includePii: true },
    );
    expect(withPii.display.email).toBe("jane@x.com");
    expect(withPii.display.user_email).toBe("bob@x.com");
  });

  it("sanitizes display strings (control/format strip, redaction, cap)", () => {
    const out = projectIdentityContext(
      { file_name: "budget jane@x.com  x".padEnd(300, "z") },
      { includePii: false },
    );
    expect(out.display.file_name).toContain("[redacted-email]");
    expect(out.display.file_name!.length).toBeLessThanOrEqual(121);
  });

  it("passes through file_name/sheet_name/repo as sanitized display strings", () => {
    const out = projectIdentityContext(
      { file_name: "Show.xlsx", sheet_name: "Sheet1", repo: "fxav/webapp" },
      { includePii: false },
    );
    expect(out.display.file_name).toBe("Show.xlsx");
    expect(out.display.sheet_name).toBe("Sheet1");
    expect(out.display.repo).toBe("fxav/webapp");
  });

  it("handles null context by returning an empty-shape IdentityContext", () => {
    const out = projectIdentityContext(null, { includePii: false });
    expect(out).toEqual({ resolution: {}, display: {}, counts: {} });
  });
});
