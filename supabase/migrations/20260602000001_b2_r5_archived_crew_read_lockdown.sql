-- M12.2 Phase B2 — adversarial R5 (whole-milestone) repair. Same vector as R4 F1
-- (archived/published independence at the crew-read trust boundary), now at the DATA + RLS layers.
--
-- [HIGH] Archived legacy/drift rows can stay crew-readable.
--   (1) The B2 legacy backfill (20260601000000:147-149) rotates tokens + stamps archived_at for the
--       legacy archived cohort but never clears `published`. (2) The crew-read RLS policies on `shows`
--       and its child tables gate on `can_read_show(...) AND published = true` but NOT `archived = false`
--       (20260501002000_rls_policies.sql:230,247,275,303,331,359). So an archived row that is still
--       published=true remains readable through direct Supabase/PostgREST table access by a matching crew
--       member — bypassing the "archived ⇒ crew-unreachable" semantic the lifecycle RPCs now enforce.
--
-- Two-layer fix:
--   DATA  — backfill `published = false` for every archived row (one-shot; idempotent; complements the
--           R4 fix that already forces published=false on the archive/unarchive RPC paths). Drift remains
--           SEEDABLE for tests (this is a one-time UPDATE, not a CHECK) so the F1/R5 regressions can prove
--           the defenses handle a drifted row.
--   RLS   — add `archived = false` to all six crew_read policies (defense-in-depth: even if a drifted row
--           ever reappears, crew cannot read it or its child rows). Structurally pinned by
--           tests/db/_metaCrewReadArchivedGate.test.ts (every crew_read policy must gate on BOTH
--           published=true AND archived=false — covers any future child table).
--
-- Apply-twice idempotent: the UPDATE is naturally idempotent; ALTER POLICY ... USING re-sets the
-- expression (no error on re-apply).

-- DATA layer -------------------------------------------------------------------
update public.shows set published = false where archived = true and published = true;

-- RLS layer (defense-in-depth) -------------------------------------------------
alter policy crew_read on public.shows
  using (public.is_admin() or (public.can_read_show(id) and published = true and archived = false));

alter policy crew_read on public.crew_members
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1 from public.shows s
         where s.id = crew_members.show_id and s.published = true and s.archived = false
      )
    )
  );

alter policy crew_read on public.hotel_reservations
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1 from public.shows s
         where s.id = hotel_reservations.show_id and s.published = true and s.archived = false
      )
    )
  );

alter policy crew_read on public.rooms
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1 from public.shows s
         where s.id = rooms.show_id and s.published = true and s.archived = false
      )
    )
  );

alter policy crew_read on public.transportation
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1 from public.shows s
         where s.id = transportation.show_id and s.published = true and s.archived = false
      )
    )
  );

alter policy crew_read on public.contacts
  using (
    public.is_admin()
    or (
      public.can_read_show(show_id)
      and exists (
        select 1 from public.shows s
         where s.id = contacts.show_id and s.published = true and s.archived = false
      )
    )
  );
