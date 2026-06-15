-- Cymate Content Studio · review workflow
-- Adds the columns needed for review actions (approve / request revisions / hold).
-- Idempotent. Paste into Supabase SQL Editor and Run.

alter table public.posts
  add column if not exists review_status text,
  add column if not exists review_note   text,
  add column if not exists reviewed_by   text,
  add column if not exists reviewed_at   timestamptz;
