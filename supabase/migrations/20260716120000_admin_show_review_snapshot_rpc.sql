-- get_admin_show_review_snapshot: single-statement published-review snapshot (spec §3.3a).
-- SECURITY DEFINER + is_admin() gate (pattern: 20260501002000_rls_policies.sql).
-- STABLE, no writes, no advisory locks. One SELECT = statement-level snapshot.
create or replace function public.get_admin_show_review_snapshot(p_show_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.is_admin() then null
    when not exists (select 1 from public.shows s0 where s0.id = p_show_id) then null
    else
    jsonb_build_object(
      'show',     (select to_jsonb(s) from public.shows s where s.id = p_show_id),
      'internal', (select to_jsonb(si) from public.shows_internal si where si.show_id = p_show_id),
      'crew_members',       coalesce((select jsonb_agg(to_jsonb(c) order by c.id)
                              from public.crew_members c where c.show_id = p_show_id), '[]'::jsonb),
      'rooms',              coalesce((select jsonb_agg(to_jsonb(r) order by r.id)
                              from public.rooms r where r.show_id = p_show_id), '[]'::jsonb),
      'hotel_reservations', coalesce((select jsonb_agg(to_jsonb(h) order by h.ordinal, h.id)
                              from public.hotel_reservations h where h.show_id = p_show_id), '[]'::jsonb),
      'transportation',     coalesce((select jsonb_agg(to_jsonb(t) order by t.id)
                              from public.transportation t where t.show_id = p_show_id), '[]'::jsonb),
      'contacts',           coalesce((select jsonb_agg(to_jsonb(k) order by k.id)
                              from public.contacts k where k.show_id = p_show_id), '[]'::jsonb)
    )
  end
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- (and authenticated/service_role) directly, so revoking from PUBLIC alone leaves
-- anon able to execute. Revoke from every seeded role, then re-grant intentionally.
revoke all on function public.get_admin_show_review_snapshot(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_show_review_snapshot(uuid) to authenticated, service_role;
