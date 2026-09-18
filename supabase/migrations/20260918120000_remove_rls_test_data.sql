-- Removes the throwaway accounts and rows created while manually verifying RLS, optimistic
-- concurrency, per-field settings merge and the leaderboard functions against this live
-- project (docs/DECISIONS.md D-060). Deleting from auth.users cascades to profiles,
-- sync_events, sync_letter_pairs and sync_settings via their existing FKs, the same
-- cascade a real account deletion (M3/M4) will rely on -- this is a real exercise of that
-- path, not just cleanup.
delete from auth.users
where email like '%@accounts.bldokja.internal'
   or email like '%@accounts.bldokja.pages.dev';
