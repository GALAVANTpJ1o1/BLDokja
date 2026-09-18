-- profiles: the public identity behind one BLDokja account.
--
-- Sign-in is by username, not email (there is no email-delivery channel available on the
-- free pages.dev origin -- see docs/DECISIONS.md). Supabase Auth is still email-shaped
-- internally, so the client signs up with a synthetic, never-delivered address derived
-- deterministically from the username (lower(username) || '@accounts.bldokja.internal')
-- and this table carries the real identity.
--
-- display_name is deliberately separate from username: it is the only thing an opted-in
-- leaderboard ever shows, so opting in never reveals a login identifier.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  leaderboard_opt_in boolean not null default false,
  -- IANA time zone name (e.g. "Asia/Kolkata"), used server-side to bucket activity/streak
  -- days for this user. Validated client-side against Intl's supported zones; not
  -- constrained here since Postgres has no simple CHECK against pg_timezone_names.
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for one BLDokja account. username is the sign-in identifier (never shown publicly); display_name is the only thing a leaderboard shows.';

alter table public.profiles
  add constraint profiles_username_format check (username ~ '^[a-z0-9_-]{3,24}$'),
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 32);

create unique index profiles_username_key on public.profiles (username);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- id can't be reassigned: WITH CHECK forces the written row's id back to auth.uid(), so
-- there is no value a client could put in `id` that both satisfies the check and moves
-- the row to another account.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy for authenticated/anon: rows are created only by the trigger
-- below (as the table owner, bypassing RLS) and removed only by the auth.users cascade.

revoke insert, delete on public.profiles from authenticated, anon;

-- Creates the profile row when a new auth user signs up. The client passes the chosen
-- username through signUp()'s options.data so it's available on new.raw_user_meta_data.
create function public.handle_new_user()
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
    coalesce(new.raw_user_meta_data ->> 'username', 'solver')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Public availability check for the sign-up form. Returns only a boolean -- nothing else
-- about an existing account is exposed. security definer is required because anon has no
-- SELECT grant on profiles otherwise.
create function public.username_available(check_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where username = lower(check_username)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
