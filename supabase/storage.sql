-- Cymate Content Studio · Storage bucket for post images
-- Paste this entire file into the Supabase SQL Editor and click Run.

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Anyone can read images (URLs are unguessable; bucket is public for simple <img src>)
drop policy if exists "post_images_read" on storage.objects;
create policy "post_images_read"
  on storage.objects for select
  using (bucket_id = 'post-images');

-- Authenticated users can upload to their own folder (path starts with their uid)
drop policy if exists "post_images_insert_own" on storage.objects;
create policy "post_images_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own objects
drop policy if exists "post_images_update_own" on storage.objects;
create policy "post_images_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own objects
drop policy if exists "post_images_delete_own" on storage.objects;
create policy "post_images_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
