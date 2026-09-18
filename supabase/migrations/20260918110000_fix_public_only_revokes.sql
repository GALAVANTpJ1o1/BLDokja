-- Fixes a real finding from testing the pushed schema against the live project (not caught
-- by review alone): Supabase's own default-privileges setup grants EXECUTE on every new
-- public-schema function directly to `anon` and `authenticated`, separately from the
-- standard Postgres default grant to PUBLIC. `revoke all on function ... from public` (in
-- 20260918100001_account_recovery.sql and 20260918100004_sync_settings.sql) therefore did
-- NOT remove anon's ability to call set_recovery_code() / merge_settings() -- confirmed live:
-- an anon request reached each function's body and hit its own "not authenticated" check,
-- instead of getting a permission-denied before entering the function at all.
--
-- Both functions were already safe in effect (the auth.uid() is null check inside each one
-- refuses an anon caller), so this was never an exploitable hole -- but it means every
-- future "revoke all ... from public" in this schema needs to explicitly name anon too,
-- exactly as archive_monthly_points.sql already did (and which correctly returned 42501
-- for the same live test). Recorded in docs/DECISIONS.md D-060.
revoke all on function public.set_recovery_code(text) from anon;
revoke all on function public.merge_settings(jsonb, jsonb) from anon;
