-- sync_events: the cloud side of packages/storage's local, append-only event log
-- (drill.attempt, lesson.*, pairs.discovered, legacy.memoAttempt -- see
-- packages/storage/src/schema.ts). The local log is already id-keyed and idempotent
-- (a duplicate id write is a no-op), so the cloud copy reuses exactly that shape: id is
-- the same client-generated id, globally unique, and a write is a plain insert.
--
-- id is `text`, not `uuid`: apps/web/src/lib/ids.ts falls back to a non-UUID string when
-- crypto.randomUUID() is unavailable, so the column must not assume UUID format.
--
-- No update or delete policy: the event log is immutable by design, matching the local
-- semantics. Rows only disappear via the auth.users cascade on account deletion.
create table public.sync_events (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  server_seq bigint generated always as identity,
  type text not null,
  at timestamptz not null,
  payload jsonb not null,
  device_id text,
  created_at timestamptz not null default now()
);

comment on table public.sync_events is 'Cloud mirror of the local append-only event log. Pull cursor is server_seq; dedup key is id.';

create unique index sync_events_server_seq_key on public.sync_events (server_seq);
create index sync_events_user_seq_idx on public.sync_events (user_id, server_seq);
create index sync_events_user_type_at_idx on public.sync_events (user_id, type, at);

alter table public.sync_events enable row level security;

create policy sync_events_select_own on public.sync_events
  for select to authenticated
  using (user_id = auth.uid());

create policy sync_events_insert_own on public.sync_events
  for insert to authenticated
  with check (user_id = auth.uid());

revoke update, delete on public.sync_events from authenticated, anon;
