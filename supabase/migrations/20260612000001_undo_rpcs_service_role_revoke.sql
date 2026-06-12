-- 2026-06-11 bug-audit: align the undo-family REVOKEs with the MI-11 gate-RPC
-- pattern (20260608000002 revokes from public, anon, authenticated AND
-- service_role; 20260608000003 omitted service_role and it retains EXECUTE —
-- verified live via has_function_privilege).
--
--   - undo_change: grant contract is authenticated-only ("NOT granted to
--     service_role", 20260608000003 header comment).
--   - _undo_tombstone / cleanup_superseded_before_images: per their in-file
--     comments they must run only inside the service-role-held sync txn as
--     definer-invoked helpers, never via a direct rpc() — a direct
--     service_role call would mutate show_change_log outside the per-show
--     advisory lock.
--
-- Idempotent: REVOKE on an absent privilege is a no-op.
-- Pinned by tests/db/rpc-service-role-revokes.test.ts.

revoke all on function public.undo_change(uuid) from service_role;
revoke all on function public._undo_tombstone(public.show_change_log, text) from service_role;
revoke all on function public.cleanup_superseded_before_images(uuid) from service_role;

notify pgrst, 'reload schema';
