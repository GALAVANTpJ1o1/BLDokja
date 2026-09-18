-- Opt-in, read-only leaderboards. Every function is security definer (so anon can read them
-- without any table-level grant on profiles/sync_events) and returns only
-- (display_name, rank, value) for opted-in users -- never username, email, or raw event
-- history, per the plan's "only expose the intended public projection" requirement.
--
-- All aggregation happens here, server-side, over sync_events -- never a client-submitted
-- total (the plan explicitly forbids that). `type = 'drill.attempt'` also excludes
-- imported legacy history for free: legacy import uses a different event type
-- (legacy.memoAttempt), so it was never eligible to begin with.
--
-- Points have three cadences (owner's choice, 2026-09-18): daily and weekly reset (weekly
-- follows the same Monday-Sunday UTC window as the active-days board), and a monthly board
-- whose top 10 gets permanently archived once the month ends -- a "hall of fame" that a
-- later points-formula tweak or an opted-out user can't quietly rewrite.
--
-- UNTESTED against a live Postgres at the time this was written -- see docs/DECISIONS.md
-- D-056 and D-059 for what's been verified since and what's still open.

-- One row per (user, UTC day): that day's drill.attempt count, capped at 20 -- the single
-- place the daily cap is applied. Every points board is just a different sum over this.
-- Locked down like account_recovery: no client role can query it directly, only the
-- security definer functions below (running as the table owner) read it.
create view public.daily_points as
  select e.user_id, (e.at at time zone 'utc')::date as day, least(count(*), 20)::int as points
  from public.sync_events e
  where e.type = 'drill.attempt'
  group by e.user_id, (e.at at time zone 'utc')::date;

revoke all on public.daily_points from anon, authenticated;

create function public.leaderboard_weekly_active_days()
returns table (display_name text, rank bigint, value bigint)
language sql
stable
security definer
set search_path = public
as $$
  with week as (
    select date_trunc('week', now() at time zone 'utc') as week_start
  ),
  counts as (
    select p.id as user_id, p.display_name,
           count(distinct (e.at at time zone 'utc')::date) as value
    from public.profiles p
    join public.sync_events e on e.user_id = p.id
    cross join week
    where e.type = 'drill.attempt'
      and p.leaderboard_opt_in = true
      and e.at >= week.week_start
      and e.at < week.week_start + interval '7 days'
    group by p.id, p.display_name
  )
  select p.display_name,
         rank() over (order by coalesce(c.value, 0) desc) as rank,
         coalesce(c.value, 0) as value
  from public.profiles p
  left join counts c on c.user_id = p.id
  where p.leaderboard_opt_in = true
  order by value desc, p.display_name asc;
$$;

grant execute on function public.leaderboard_weekly_active_days() to anon, authenticated;

create function public.leaderboard_points_daily()
returns table (display_name text, rank bigint, value integer)
language sql
stable
security definer
set search_path = public
as $$
  select p.display_name,
         rank() over (order by coalesce(d.points, 0) desc) as rank,
         coalesce(d.points, 0) as value
  from public.profiles p
  left join public.daily_points d on d.user_id = p.id and d.day = (now() at time zone 'utc')::date
  where p.leaderboard_opt_in = true
  order by value desc, p.display_name asc;
$$;

grant execute on function public.leaderboard_points_daily() to anon, authenticated;

create function public.leaderboard_points_weekly()
returns table (display_name text, rank bigint, value bigint)
language sql
stable
security definer
set search_path = public
as $$
  with week as (select date_trunc('week', now() at time zone 'utc')::date as week_start),
  totals as (
    select d.user_id, sum(d.points) as value
    from public.daily_points d, week
    where d.day >= week.week_start and d.day < week.week_start + 7
    group by d.user_id
  )
  select p.display_name,
         rank() over (order by coalesce(t.value, 0) desc) as rank,
         coalesce(t.value, 0) as value
  from public.profiles p
  left join totals t on t.user_id = p.id
  where p.leaderboard_opt_in = true
  order by value desc, p.display_name asc;
$$;

grant execute on function public.leaderboard_points_weekly() to anon, authenticated;

create function public.leaderboard_points_monthly()
returns table (display_name text, rank bigint, value bigint)
language sql
stable
security definer
set search_path = public
as $$
  with month as (select date_trunc('month', now() at time zone 'utc')::date as month_start),
  totals as (
    select d.user_id, sum(d.points) as value
    from public.daily_points d, month
    where d.day >= month.month_start and d.day < (month.month_start + interval '1 month')::date
    group by d.user_id
  )
  select p.display_name,
         rank() over (order by coalesce(t.value, 0) desc) as rank,
         coalesce(t.value, 0) as value
  from public.profiles p
  left join totals t on t.user_id = p.id
  where p.leaderboard_opt_in = true
  order by value desc, p.display_name asc;
$$;

grant execute on function public.leaderboard_points_monthly() to anon, authenticated;

create function public.leaderboard_streaks()
returns table (display_name text, rank bigint, value integer)
language sql
stable
security definer
set search_path = public
as $$
  with active_days as (
    -- A single, direct AT TIME ZONE conversion of the timestamptz into the user's own
    -- IANA zone's wall-clock date. (Chaining two AT TIME ZONE calls, e.g. via 'UTC' first,
    -- is a different -- wrong -- operation: it flips a wall-clock reading back into
    -- another timestamptz instead of just reading the local date.)
    select distinct e.user_id, (e.at at time zone p.timezone)::date as local_day
    from public.sync_events e
    join public.profiles p on p.id = e.user_id
    where e.type = 'drill.attempt' and p.leaderboard_opt_in = true
  ),
  grouped as (
    -- Islands-and-gaps: within one run of consecutive calendar days, `local_day` and its
    -- row_number() both advance by exactly 1 each row, so their difference is constant for
    -- the run and changes only at a gap.
    select user_id, local_day,
           local_day - (row_number() over (partition by user_id order by local_day))::int as grp
    from active_days
  ),
  runs as (
    select user_id, max(local_day) as run_end, count(*) as length
    from grouped
    group by user_id, grp
  ),
  current_runs as (
    -- Current means the run reaches today or yesterday in the user's own local time, so a
    -- streak stays current until that user's local day actually ends (per the plan's own
    -- rule), not until UTC midnight.
    select r.user_id, r.length
    from runs r
    join public.profiles p on p.id = r.user_id
    where r.run_end >= (now() at time zone p.timezone)::date - 1
  ),
  best_current as (
    select user_id, max(length) as length
    from current_runs
    group by user_id
  )
  select p.display_name,
         rank() over (order by coalesce(bc.length, 0) desc) as rank,
         coalesce(bc.length, 0) as value
  from public.profiles p
  left join best_current bc on bc.user_id = p.id
  where p.leaderboard_opt_in = true
  order by value desc, p.display_name asc;
$$;

grant execute on function public.leaderboard_streaks() to anon, authenticated;

-- Permanent monthly points archive ("hall of fame"). A month's row set is written once, by
-- archive_monthly_points() below, and never changes after that except to disappear if an
-- archived user later deletes their account (the FK cascade) -- so a later points-formula
-- change or someone opting out afterwards can't quietly rewrite who won a past month, but
-- deleting an account still actually removes them everywhere, including history.
create table public.monthly_points_archive (
  month_start date not null,
  rank int not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  points integer not null,
  archived_at timestamptz not null default now(),
  primary key (month_start, rank)
);

comment on table public.monthly_points_archive is 'Frozen top-10 monthly points standings. points/rank are permanent; display_name is joined live from profiles at read time so a later name change still shows correctly.';

alter table public.monthly_points_archive enable row level security;

-- No policies for anon/authenticated at all -- same reasoning as account_recovery. Reads go
-- through leaderboard_points_monthly_archive() below, which joins profiles and re-checks
-- CURRENT leaderboard_opt_in, so someone who opts out afterwards disappears from their past
-- placements too, not just from the live boards.
revoke all on public.monthly_points_archive from anon, authenticated;

create function public.leaderboard_points_monthly_archive(target_month date)
returns table (display_name text, rank int, value int)
language sql
stable
security definer
set search_path = public
as $$
  select p.display_name, a.rank, a.points as value
  from public.monthly_points_archive a
  join public.profiles p on p.id = a.user_id
  where a.month_start = date_trunc('month', target_month)::date
    and p.leaderboard_opt_in = true
  order by a.rank asc;
$$;

grant execute on function public.leaderboard_points_monthly_archive(date) to anon, authenticated;

-- Just the list of months that have an archive, for a "browse past months" picker. No user
-- data in the result, safe to expose outright.
create function public.leaderboard_archived_months()
returns setof date
language sql
stable
security definer
set search_path = public
as $$
  select distinct month_start from public.monthly_points_archive order by month_start desc;
$$;

grant execute on function public.leaderboard_archived_months() to anon, authenticated;

-- Snapshots a month's top 10 into the archive. Idempotent (re-running for the same month
-- replaces its rows, it doesn't duplicate them), so a scheduled run that fires twice, or a
-- manual backfill for an older month, is safe.
--
-- Deliberately NOT exposed to anon or authenticated at all -- this is a maintenance
-- operation (it deletes and rewrites rows), not a leaderboard read. Postgres grants EXECUTE
-- on a new function to PUBLIC by default, so it must be explicitly revoked below; skipping
-- that would let any signed-in user force a full recompute of the archive on demand.
create function public.archive_monthly_points(target_month date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target date := coalesce(target_month, date_trunc('month', (now() at time zone 'utc') - interval '1 day')::date);
begin
  delete from public.monthly_points_archive where month_start = target;

  insert into public.monthly_points_archive (month_start, rank, user_id, points)
  select target, ranked.rank, ranked.user_id, ranked.points
  from (
    select d.user_id, sum(d.points) as points,
           rank() over (order by sum(d.points) desc) as rank
    from public.daily_points d
    join public.profiles p on p.id = d.user_id and p.leaderboard_opt_in = true
    where d.day >= target and d.day < (target + interval '1 month')::date
    group by d.user_id
  ) ranked
  where ranked.rank <= 10;
end;
$$;

revoke all on function public.archive_monthly_points(date) from public, anon, authenticated;

-- Runs at 00:05 UTC on the 1st of every month, archiving the month that just ended (the
-- function's own default target when called with no argument). pg_cron ships enabled on
-- every Supabase project, free tier included -- verified 2026-09-18 (supabase.com/docs/guides/database/extensions/pg_cron,
-- cross-checked against supabase.com/docs/guides/cron). The exact schema pg_cron installs
-- into (here: extensions) should be confirmed against the real project; `supabase db push`
-- will simply fail loudly if it doesn't match, rather than silently doing the wrong thing.
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'archive-monthly-points',
  '5 0 1 * *',
  $$select public.archive_monthly_points();$$
);
