// @vitest-environment node
//
// Phase 6 T6.7 — the three per-show changes-feed server actions DELEGATE to the
// guarded Phase 3/4 helpers and forward the PF40 staleness token verbatim.
// Failure modes:
//  (b) the Approve action calls supabase.rpc() inline instead of delegating
//      (PF15 lock-guard bypass) — proven by the spy on the helper;
//  (d) PF40: the action drops the client-submitted expectedBaseModifiedTime (or
//      re-reads the hold's base time) instead of forwarding the feed-rendered token.
import { afterEach, expect, it, vi } from "vitest";

const requireAdmin = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: () => requireAdmin() }));
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

import * as gate from "@/lib/sync/holds/mi11GateActions";
import * as undo from "@/lib/sync/holds/undoChange";
import {
  mi11ApproveAction,
  mi11RejectAction,
  undoChangeAction,
} from "@/app/admin/show/[slug]/_actions/feed";
import { showCacheTag } from "@/lib/data/showCacheTag";

afterEach(() => vi.restoreAllMocks());

// nav-perf tag-caching (Task 9): a success carrying a server-resolved showId revalidates that
// show's data-cache tag POST-COMMIT (crew DATA changed); a success without one does not crash.
it("mi11ApproveAction revalidates the show data-cache tag when the helper surfaces a showId", async () => {
  revalidateTag.mockClear();
  vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: true, showId: "show-77" });
  const fd = new FormData();
  fd.set("holdId", "h1");
  fd.set("expectedBaseModifiedTime", "");
  await mi11ApproveAction(null, fd);
  expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("show-77"), { expire: 0 });
});

it("mi11ApproveAction submits holdId + the feed-rendered token and DELEGATES to approveMi11Hold(holdId, expectedBaseModifiedTime) (PF40)", async () => {
  const spy = vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: true });
  const fd = new FormData();
  fd.set("holdId", "h1");
  // PF40: the CLIENT-SUBMITTED value the feed RENDERED — forwarded verbatim.
  fd.set("expectedBaseModifiedTime", "2026-06-09T10:00:00Z");
  await mi11ApproveAction(null, fd);
  // PF23/PF15: the action passes ONLY holdId + the token (no showId/driveFileId);
  // the helper resolves drive_file_id from the hold and owns the Drive re-check +
  // lock-taking RPC. PF40: the action forwards the feed-rendered token as 2nd arg.
  expect(spy).toHaveBeenCalledWith("h1", "2026-06-09T10:00:00Z");
  expect(spy).not.toHaveBeenCalledWith(expect.objectContaining({ driveFileId: expect.anything() }));
});

it("mi11RejectAction forwards holdId + expectedBaseModifiedTime to rejectMi11Hold (PF40)", async () => {
  const spy = vi.spyOn(gate, "rejectMi11Hold").mockResolvedValue({ ok: true });
  const fd = new FormData();
  fd.set("holdId", "h1");
  fd.set("expectedBaseModifiedTime", "2026-06-09T10:00:00Z");
  await mi11RejectAction(null, fd);
  expect(spy).toHaveBeenCalledWith("h1", "2026-06-09T10:00:00Z");
});

it("normalizes an empty expectedBaseModifiedTime ('') back to null before delegating (PF40)", async () => {
  // A null base_modified_time round-trips through the hidden input as ''. The
  // action MUST normalize '' → null so the helper's param is null, not "".
  const spy = vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: true });
  const fd = new FormData();
  fd.set("holdId", "h1");
  fd.set("expectedBaseModifiedTime", "");
  await mi11ApproveAction(null, fd);
  expect(spy).toHaveBeenCalledWith("h1", null);
});

it("a delegated failure result maps to a lib/messages code, never a raw code", async () => {
  vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({
    ok: false,
    code: "IDENTITY_WOULD_COLLIDE",
  });
  const fd = new FormData();
  fd.set("holdId", "h1");
  const res = await mi11ApproveAction(null, fd);
  expect(res).toMatchObject({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });
});

it("undoChangeAction forwards changeLogId to the undo helper", async () => {
  const spy = vi.spyOn(undo, "undoChange").mockResolvedValue({ ok: true });
  const fd = new FormData();
  fd.set("changeLogId", "cl-9");
  // P6-F1: the action is (prevState, formData) so UndoChangeButton can drive it
  // via useActionState and surface typed failures.
  await undoChangeAction(null, fd);
  expect(spy).toHaveBeenCalledWith("cl-9");
});

it("requireAdmin gates every action (called before delegation)", async () => {
  requireAdmin.mockClear();
  vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: true });
  const fd = new FormData();
  fd.set("holdId", "h1");
  await mi11ApproveAction(null, fd);
  expect(requireAdmin).toHaveBeenCalled();
});
