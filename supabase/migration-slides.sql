-- Cymate Content Studio · per-slide text for carousels
-- Adds a "slides" text[] column to posts. Idempotent.
-- Paste into Supabase SQL Editor and Run.

alter table public.posts
  add column if not exists slides text[] not null default '{}';
