-- Three opt-in, read-only leaderboards. Every function is security definer (so anon can
-- read them without any table-level grant on profiles/sync_events) and returns only
-- (display_name, rank, value) for opted-in users -- never username, email, or raw event
-- history, per the plan's "only expose the intended public projection" requirement.
--
-- All aggregation happens here, server-side, over sync_events -- never a client-submitted
-- total (the plan explicitly forbids that). `type = 'drill.attempt'` also excludes
-- imported legacy history for free: legacy import uses a different event type
-- (legacy.memoAttempt), so it was never eligible to begin with.
--
-- OPEN DECISION, needs the owner's confirmation (the plan itself flagged points mechanics
-- as "proposed... requiring approval"): leaderboard_points here is an ALL-TIME cumulative
-- total (daily-capped, summed forever), not reset weekly -- "weekly active days" and
-- "current streak" are the two time-scoped boards; a running points total read more
-- naturally as the third, complementary one. Flag this in review if a weekly-reset points
-- board was intended instead.
--
-- UNTESTED: written without a live Postgres available in this environment (no Docker
-- here). The islands-and-gaps streak logic and the AT TIME ZONE handling need to be
-- exercised against a real database -- with concrete IANA zones that cross a DST
-- transition -- before this ships. See docs/DECISIONS.md and the plan's M7 verification
-- step.

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

create function public.leaderboard_points()
returns table (display_name text, rank bigint, value bigint)
language sql
stable
security definer
set search_path = public
as $$
  with daily as (
    select e.user_id, (e.at at time zone 'utc')::date as day, count(*) as attempts
    from public.sync_events e
    where e.type = 'drill.attempt'
    group by e.user_id, (e.at at time zone 'utc')::date
  ),
  points as (
    select d.user_id, sum(least(d.attempts, 20)) as value
    from daily d
    group by d.user_id
  )
  select p.display_name,
         rank() over (order by coalesce(pt.value, 0) desc) as rank,
         coalesce(pt.value, 0) as value
  from public.profiles p
  left join points pt on pt.user_id = p.id
  where p.leaderboard_opt_in = true
  order by value desc, p.display_name asc;
$$;

grant execute on function public.leaderboard_points() to anon, authenticated;

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
