-- 20260714000000_admin_read_share_token_with_epoch.sql
-- Return the admin-gated share token AND the show's monotonic picker_epoch from
-- ONE snapshot, so the admin per-show page's client token cache can order token
-- versions (spec docs/superpowers/specs/2026-07-10-share-link-instant-rotate-dedup-design.md §3.0).
-- picker_epoch is a non-secret rotation counter (int, default 1); it is bumped
-- atomically by every token rotation (rotate_show_share_token / archive_show /
-- unarchive_show / reset_picker_epoch_atomic), so "accept iff serverEpoch >= local"
-- is a total, order-independent gate on the client.
--
-- Return type changes text -> table(share_token, picker_epoch); the only in-repo
-- caller is lib/data/loadShowShareToken.ts, updated in the same PR. drop+create is
-- apply-twice idempotent. left join so picker_epoch returns even for a tokenless show.
drop function if exists public.admin_read_share_token(uuid);

create function public.admin_read_share_token(p_show_id uuid)
  returns table(share_token text, picker_epoch int)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case when public.is_admin() then t.share_token else null end as share_token,
         s.picker_epoch
    from public.shows s
    left join public.show_share_tokens t on t.show_id = s.id
   where s.id = p_show_id
   limit 1
$$;

revoke all on function public.admin_read_share_token(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_read_share_token(uuid) to authenticated;
