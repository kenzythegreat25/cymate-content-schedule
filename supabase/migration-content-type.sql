-- Cymate Content Studio · add content_type column
-- Paste into the Supabase SQL Editor and Run. Idempotent.

alter table public.posts add column if not exists content_type text;
