alter table public.pending_syncs
  add column if not exists last_finalize_failure_code text;

alter table public.pending_syncs
  drop constraint if exists pending_syncs_live_rows_have_no_approval_payload;

alter table public.pending_syncs
  add constraint pending_syncs_live_rows_have_no_approval_payload check (
    wizard_session_id is not null
    or (
      wizard_approved_by_email is null
      and wizard_approved_at is null
      and wizard_reviewer_choices is null
      and wizard_reviewer_choices_version is null
      and last_finalize_failure_code is null
    )
  );

alter table public.pending_syncs
  drop constraint if exists pending_syncs_approved_requires_full_payload;

alter table public.pending_syncs
  add constraint pending_syncs_approved_requires_full_payload check (
    (
      wizard_approved = true
      and wizard_approved_by_email is not null
      and wizard_approved_at is not null
      and wizard_reviewer_choices is not null
      and wizard_reviewer_choices_version is not null
      and last_finalize_failure_code is null
    )
    or (
      wizard_approved = false
      and wizard_approved_by_email is null
      and wizard_approved_at is null
      and wizard_reviewer_choices is null
      and wizard_reviewer_choices_version is null
    )
  );

alter table dev.pending_syncs
  add column if not exists last_finalize_failure_code text;

alter table dev.pending_syncs
  drop constraint if exists pending_syncs_live_rows_have_no_approval_payload;

alter table dev.pending_syncs
  add constraint pending_syncs_live_rows_have_no_approval_payload check (
    wizard_session_id is not null
    or (
      wizard_approved_by_email is null
      and wizard_approved_at is null
      and wizard_reviewer_choices is null
      and wizard_reviewer_choices_version is null
      and last_finalize_failure_code is null
    )
  );

alter table dev.pending_syncs
  drop constraint if exists pending_syncs_approved_requires_full_payload;

alter table dev.pending_syncs
  add constraint pending_syncs_approved_requires_full_payload check (
    (
      wizard_approved = true
      and wizard_approved_by_email is not null
      and wizard_approved_at is not null
      and wizard_reviewer_choices is not null
      and wizard_reviewer_choices_version is not null
      and last_finalize_failure_code is null
    )
    or (
      wizard_approved = false
      and wizard_approved_by_email is null
      and wizard_approved_at is null
      and wizard_reviewer_choices is null
      and wizard_reviewer_choices_version is null
    )
  );
