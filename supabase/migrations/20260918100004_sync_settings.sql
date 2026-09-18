-- sync_settings: the cloud side of the local Settings record (theme, palette, scheme,
-- buffers, difficulty, timezone, daily goal, ...). Unlike letter pairs, these fields are
-- independent of each other, so the plan requires merging per field rather than treating
-- the whole record as one last-write-wins blob (which would let a stale device's palette
-- toggle silently clobber another device's more recent buffer change).
--
-- There is deliberately no UPDATE grant for authenticated on this table: the only write
-- path is merge_settings() below (security definer), so the per-field merge logic can
-- never be bypassed by a raw PostgREST update that overwrites the whole `data` blob.
create table public.sync_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  -- Per-field last-write timestamp, keyed the same as `data`. Populated only for fields
  -- the client has actually changed since it started syncing -- absent keys are treated
  -- as older than anything incoming.
  field_updated_at jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.sync_settings is 'Cloud mirror of local Settings, merged per field via merge_settings() -- see docs/DECISIONS.md.';

alter table public.sync_settings enable row level security;

create policy sync_settings_select_own on public.sync_settings
  for select to authenticated
  using (user_id = auth.uid());

-- Row creation still goes through plain insert (merge_settings also upserts, so in
-- practice the client never needs this directly, but it's harmless to allow: an insert
-- can't skip the per-field merge because there's nothing to merge against yet).
create policy sync_settings_insert_own on public.sync_settings
  for insert to authenticated
  with check (user_id = auth.uid());

revoke update, delete on public.sync_settings from authenticated, anon;

-- The sole write path for changing settings once a row exists. Takes a patch of changed
-- fields and, for each key, the client's local timestamp for that change; keeps whichever
-- side (existing vs incoming) is newer, per field, and returns the merged object so the
-- caller can reconcile its own local state after a push.
create function public.merge_settings(patch jsonb, patch_times jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing_data jsonb;
  existing_times jsonb;
  merged_data jsonb;
  merged_times jsonb;
  key text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.sync_settings (user_id, data, field_updated_at)
    values (uid, '{}'::jsonb, '{}'::jsonb)
    on conflict (user_id) do nothing;

  select data, field_updated_at into existing_data, existing_times
    from public.sync_settings where user_id = uid for update;

  merged_data := existing_data;
  merged_times := existing_times;

  for key in select jsonb_object_keys(patch) loop
    if (merged_times ->> key) is null
       or (patch_times ->> key)::timestamptz > (merged_times ->> key)::timestamptz then
      merged_data := jsonb_set(merged_data, array[key], patch -> key, true);
      merged_times := jsonb_set(merged_times, array[key], patch_times -> key, true);
    end if;
  end loop;

  update public.sync_settings
    set data = merged_data, field_updated_at = merged_times, updated_at = now()
    where user_id = uid;

  return merged_data;
end;
$$;

-- See the matching note in 20260918100001_account_recovery.sql: PUBLIC gets EXECUTE by default, so
-- this is explicit for consistency, not because the auth.uid() check above needed the help.
revoke all on function public.merge_settings(jsonb, jsonb) from public;
grant execute on function public.merge_settings(jsonb, jsonb) to authenticated;
