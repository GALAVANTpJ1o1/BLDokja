-- Findings from a code-only security review of the v2 schema (docs/DECISIONS.md D-069). None of
-- this has been run against the live project yet: apply with `supabase db push`, which runs the
-- whole file in one transaction, so a mistake here fails loudly and changes nothing.

-- 1. profiles.timezone was free text that leaderboard_streaks() feeds straight into
--    `AT TIME ZONE`. Any signed-in user can UPDATE their own profile, so one opted-in user setting
--    timezone to garbage made that function raise for every caller -- a one-row denial of service on
--    the whole streak leaderboard. Validate against the zone names Postgres actually knows.
--    Existing invalid values (none expected) are reset first so the trigger never blocks unrelated
--    updates to a row that was already bad.
update public.profiles
  set timezone = 'UTC'
  where not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = profiles.timezone);

create function public.profiles_validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'invalid time zone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_timezone_valid
  before insert or update of timezone on public.profiles
  for each row execute function public.profiles_validate_timezone();

-- 2. display_name defaulted to the login username, so opting in to a leaderboard without also
--    choosing a display name published the sign-in identifier -- the exact thing this column exists
--    to prevent (see the comment on profiles). New accounts now start with an anonymous name, and
--    accounts still carrying the username as their display name are switched over.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'username'),
    'solver-' || substr(replace(new.id::text, '-', ''), 1, 6)
  );
  return new;
end;
$$;

update public.profiles
  set display_name = 'solver-' || substr(replace(id::text, '-', ''), 1, 6)
  where lower(display_name) = username;

-- 3. Size bounds. Every one of these tables accepts client-supplied JSON with no ceiling, and
--    sign-up is open, so one script could fill the free-tier database for everyone. These caps are
--    deliberately generous (well above anything the app writes) -- they bound abuse, they are not
--    validation. NOT VALID: enforced for every new or changed row without scanning existing ones.
--    They do not limit how MANY rows an account may write; that needs rate limiting or a captcha.
alter table public.sync_events
  add constraint sync_events_bounds check (
    char_length(id) <= 128 and char_length(type) <= 64 and pg_column_size(payload) <= 262144
  ) not valid;

alter table public.sync_letter_pairs
  add constraint sync_letter_pairs_bounds check (
    char_length(id) <= 128 and pg_column_size(data) <= 4194304
  ) not valid;

alter table public.sync_settings
  add constraint sync_settings_bounds check (
    pg_column_size(data) <= 8388608 and pg_column_size(field_updated_at) <= 262144
  ) not valid;
