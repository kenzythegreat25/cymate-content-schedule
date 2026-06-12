-- Cymate Content Studio · schema + per-user row-level security
-- Paste this entire file into the Supabase SQL Editor and click Run.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  date text default '',
  on_screen_text text default '',
  description text default '',
  platforms text[] not null default '{}',
  attachments text default '',
  status text not null default 'Idea',
  performance_score text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_own" on public.posts;
create policy "posts_select_own"
  on public.posts for select
  using (auth.uid() = user_id);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts for insert
  with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
  on public.posts for delete
  using (auth.uid() = user_id);

create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
