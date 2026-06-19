-- Backward-compatible `create or replace` of public.upsert_admin_alert adding
-- a `failedKeys` union-merge + a 10-minute `lastCountedAt` write-debounce + a
-- WHERE-gated true no-op (no heap write / no last_seen_at churn when a
-- mergeable, in-window sighting adds no new domain and changes no other field).
--
-- Producers WITHOUT a `failedKeys` key behave byte-for-byte as the old function
-- (occurrence_count + 1 on every conflict, context = p_context). The crew-page
-- projection alert (TILE_PROJECTION_FETCH_FAILED) is the only `failedKeys`
-- producer; its `failedKeys` array is union-merged across renders so a
-- lower-visibility crew render never shrinks the row after a lead observed more
-- domains (R41/R43), and a viewer-independent constant `message` keeps the
-- mixed-viewer sighting a true no-op (R3/R39).
--
-- References `p_context` (the original producer arg), NEVER `excluded.context`
-- (which carries the INSERT-appended lastCountedAt and would never compare equal
-- in the WHERE — R40). `create or replace` is apply-twice idempotent.

create or replace function public.upsert_admin_alert(
  p_show_id uuid,
  p_code text,
  p_context jsonb
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.admin_alerts (show_id, code, context)
  values (
    p_show_id,
    p_code,
    -- Normalize failedKeys to sorted-distinct on INSERT too (not only on the
    -- DO UPDATE path): the no-op WHERE below compares the sorted union against
    -- the STORED array with order-sensitive jsonb-array equality, so storing the
    -- first sighting in raw producer order would make the very first subset/same
    -- render after the insert fail that comparison and churn last_seen_at,
    -- defeating the R39/R3 no-op bound on the subset-after-lead transition.
    case when p_context ? 'failedKeys'
         then (p_context - 'failedKeys')
              || jsonb_build_object('failedKeys',
                   (select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
                    from (select distinct jsonb_array_elements_text(
                            coalesce(p_context->'failedKeys', '[]'::jsonb)) as elem) u))
              || jsonb_build_object('lastCountedAt', now())
         else p_context end
  )
  on conflict (coalesce(show_id::text, ''), code) where resolved_at is null
  do update set
    last_seen_at = now(),
    occurrence_count = public.admin_alerts.occurrence_count + (
      case when (p_context ? 'failedKeys' and public.admin_alerts.context ? 'failedKeys')
                and coalesce((public.admin_alerts.context->>'lastCountedAt')::timestamptz, 'epoch'::timestamptz) > now() - interval '10 minutes'
           then 0 else 1 end
    ),
    context = case
      when p_context ? 'failedKeys' then
        (p_context - 'failedKeys')
        || jsonb_build_object('failedKeys',
             (select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
              from (select distinct jsonb_array_elements_text(
                      coalesce(public.admin_alerts.context->'failedKeys','[]'::jsonb)
                      || coalesce(p_context->'failedKeys','[]'::jsonb)) as elem) u))
        || jsonb_build_object('lastCountedAt',
             case when (p_context ? 'failedKeys' and public.admin_alerts.context ? 'failedKeys')
                       and coalesce((public.admin_alerts.context->>'lastCountedAt')::timestamptz, 'epoch'::timestamptz) > now() - interval '10 minutes'
                  then public.admin_alerts.context->'lastCountedAt'
                  else to_jsonb(now()) end)
      else p_context
    end
  where not (
    (p_context ? 'failedKeys' and public.admin_alerts.context ? 'failedKeys')
    and coalesce((public.admin_alerts.context->>'lastCountedAt')::timestamptz, 'epoch'::timestamptz) > now() - interval '10 minutes'
    and (select coalesce(jsonb_agg(elem order by elem), '[]'::jsonb)
         from (select distinct jsonb_array_elements_text(
                 coalesce(public.admin_alerts.context->'failedKeys','[]'::jsonb)
                 || coalesce(p_context->'failedKeys','[]'::jsonb)) as elem) u)
        = public.admin_alerts.context->'failedKeys'
    and (p_context - 'failedKeys') = (public.admin_alerts.context - 'failedKeys' - 'lastCountedAt')
  )
  returning id;
$$;

revoke all on function public.upsert_admin_alert(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_admin_alert(uuid, text, jsonb) to service_role;
