-- Cymate Content Studio · attachments → array
-- Adds attachment_urls (text[]) and migrates the old single-string column.
-- Idempotent. Paste into Supabase SQL Editor and Run.

alter table public.posts
  add column if not exists attachment_urls text[] not null default '{}';

update public.posts
   set attachment_urls = array[attachments]
 where attachments is not null
   and attachments <> ''
   and coalesce(array_length(attachment_urls, 1), 0) = 0;
