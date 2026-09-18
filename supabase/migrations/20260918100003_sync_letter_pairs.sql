-- sync_letter_pairs: the cloud side of editable letter-pair records (notes, category,
-- images). Unlike the event log, these are user-edited content, so two devices can
-- legitimately make conflicting edits -- the plan requires detecting that and preserving
-- both versions rather than silently picking one (packages/storage's own transfer.ts
-- already implements exactly this "insert if new, never silently overwrite, report
-- conflicts" rule for local import; this table is the same rule over the network).
--
-- Concurrency is optimistic: the client pushes with `.eq('rev', localRev)`. The trigger
-- below forces the true rev/updated_at on every write regardless of what the client sent,
-- so a stale push (someone else's edit already landed) matches zero rows -- the client
-- reads that as a conflict, fetches the current server row, and asks the user to resolve
-- it (or keeps both), rather than the update silently applying to the wrong revision.
--
-- id is `text` to match the local schema's LetterPair.id (`${first}${second}`), not uuid.
--
-- Image bytes are NOT stored here. The client uploads them to the private
-- `letter-pair-images` Storage bucket and replaces the local base64 `asset` field with a
-- small storage-path marker inside `data` before pushing, keeping this table's rows small
-- (see docs/DECISIONS.md and supabase/migrations/*_storage.sql).
create table public.sync_letter_pairs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  rev bigint not null default 1,
  data jsonb not null,
  -- Soft delete, mirroring the local tombstone convention (deleteLetterPair in
  -- packages/storage): a deleted pair stays a visible, deleted row forever, so an offline
  -- device that still has the pair locally learns it was deleted instead of resurrecting
  -- it on its next sync.
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.sync_letter_pairs is 'Cloud mirror of edited letter pairs, optimistic-concurrency by rev. Image bytes live in Storage, not here.';

alter table public.sync_letter_pairs enable row level security;

create policy sync_letter_pairs_select_own on public.sync_letter_pairs
  for select to authenticated
  using (user_id = auth.uid());

create policy sync_letter_pairs_insert_own on public.sync_letter_pairs
  for insert to authenticated
  with check (user_id = auth.uid());

create policy sync_letter_pairs_update_own on public.sync_letter_pairs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: deletion is the soft-delete column above, not a row removal.
revoke delete on public.sync_letter_pairs from authenticated, anon;

create function public.sync_letter_pairs_set_rev()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
  else
    new.rev := old.rev + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger sync_letter_pairs_rev
  before insert or update on public.sync_letter_pairs
  for each row execute function public.sync_letter_pairs_set_rev();
