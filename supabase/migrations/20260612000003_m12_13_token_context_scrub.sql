-- M12.13 — one-shot residue scrub: remove the raw bearer `unpublish_token` from
-- existing SHOW_FIRST_PUBLISHED alert context (spec R7 side-discovery / §7 R22).
--
-- The B2-era producer persisted the raw single-use unpublish token into
-- public.admin_alerts.context — a bearer secret at rest in a table every admin
-- session reads, and the exact channel by which a soon-revoked admin could learn
-- the token. M12.13's producer change (this branch's earlier commit) stops writing
-- it; this sweep clears what prior rows already hold.
--
-- DEPLOYMENT ORDERING (mirrors 20260608000004's PF35 contract): run AFTER the
-- producer flip is the ONLY writer — i.e. after the new app/cron code is deployed
-- everywhere and any in-flight cron / staged-apply workers have drained. This is a
-- residue sweep, NOT concurrency control against old writers; deployment ordering
-- is. Being idempotent it is SAFE AND EXPECTED to re-run post-deploy if a skew
-- window existed; the zero-row check in the plan's T4.5/T16.4 is the terminal gate.
--
-- This is a DO block, NOT a create function, so it takes the per-show advisory lock
-- without registering as a lock-taking RPC (tests/auth/advisoryLockRpcDeadlock.test.ts
-- greps create-function bodies). admin_alerts is not itself an invariant-2 locked
-- table; the lock here serializes against any producer re-writing the same show's
-- alert — defense-in-depth, same as the precedent. SHOW_FIRST_PUBLISHED alerts are
-- always show-scoped (show_id non-null), so every affected row has a drive_file_id
-- to key the lock on. Idempotent: re-applying after the cohort is gone enumerates
-- zero rows -> no-op.
do $$
declare a record;
begin
  for a in
    select al.id, s.drive_file_id
      from public.admin_alerts al
      join public.shows s on s.id = al.show_id
     where al.code = 'SHOW_FIRST_PUBLISHED'
       and al.context ? 'unpublish_token'
  loop
    perform pg_advisory_xact_lock(hashtext('show:' || a.drive_file_id));
    update public.admin_alerts
       set context = context - 'unpublish_token'
     where id = a.id;
  end loop;
end $$;
