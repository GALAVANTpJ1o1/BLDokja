-- account_recovery: the one-time recovery code that stands in for a "forgot password"
-- email flow, since there is no email-delivery channel to send a reset link through.
--
-- Deliberately has NO row-level-security policies for anon or authenticated at all: it is
-- reachable only by the service_role key (the redeem-recovery-code Edge Function, and
-- indirectly through set_recovery_code() below), never directly by a client. This is
-- stricter than "protect a couple of columns with a WITH CHECK clause" -- the hash simply
-- isn't queryable by any client role, by any path, ever.
create table public.account_recovery (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  failed_attempts int not null default 0
);

comment on table public.account_recovery is 'SHA-256 hash of the one-time recovery code shown to the user once at sign-up / regeneration. Only ever read or written by service_role (the redeem-recovery-code Edge Function) or by set_recovery_code() on the account''s own behalf.';

alter table public.account_recovery enable row level security;

revoke all on public.account_recovery from anon, authenticated;

-- The only self-service write path: a signed-in user (re)sets their own recovery code
-- hash. security definer is required since the table has no grants for authenticated at
-- all; the function itself restricts the write to auth.uid()'s own row.
create function public.set_recovery_code(code_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.account_recovery (user_id, code_hash, created_at, used_at, failed_attempts)
  values (uid, code_hash, now(), null, 0)
  on conflict (user_id) do update
    set code_hash = excluded.code_hash, created_at = now(), used_at = null, failed_attempts = 0;
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default. The auth.uid() check above already
-- makes an anon call harmless, but revoking first is the same explicit-grants-only discipline used
-- everywhere else in this schema, not a fix for an actual hole.
revoke all on function public.set_recovery_code(text) from public;
grant execute on function public.set_recovery_code(text) to authenticated;
