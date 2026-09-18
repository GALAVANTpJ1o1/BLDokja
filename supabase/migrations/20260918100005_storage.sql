-- Private bucket for letter-pair images. Never public: every object is owner-scoped by
-- path (`<user_id>/<pairId>/<imageId>`), matching the plan's "do not make the whole
-- bucket public" requirement. `file_size_limit`/`allowed_mime_types` columns on
-- storage.buckets: verify these exist under this name on the actual project (Storage's
-- schema has changed before) -- see docs/DECISIONS.md.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'letter-pair-images',
  'letter-pair-images',
  false,
  3145728, -- 3 MiB: local PairImage.asset already caps a base64 image at 2.8 MB; decoded
           -- binary is smaller, so this is a ceiling, not the real-world common case.
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: the first folder segment is the owning user's id. storage.foldername()
-- splits an object path into its folder segments, so (storage.foldername(name))[1] is
-- that first segment -- the same "owner-scoped path" pattern Supabase's own docs use.
create policy "letter pair images: owner select"
  on storage.objects for select to authenticated
  using (bucket_id = 'letter-pair-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "letter pair images: owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'letter-pair-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "letter pair images: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'letter-pair-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'letter-pair-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "letter pair images: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'letter-pair-images' and (storage.foldername(name))[1] = auth.uid()::text);
