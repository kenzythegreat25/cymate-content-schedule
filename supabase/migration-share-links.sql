-- Cymate Content Studio · shareable review links
-- Anyone with the share token can view a post and submit one of
-- three review actions (approve / needs-revision / on-hold)
-- without logging in. They cannot touch any other field.
-- Idempotent. Paste into Supabase SQL Editor and Run.

alter table public.posts
  add column if not exists share_token uuid unique;

create index if not exists posts_share_token_idx on public.posts(share_token);

-- Read-only fetch by token. Returns the fields a reviewer needs to see.
create or replace function public.get_shared_post(p_token uuid)
returns table (
  id              uuid,
  title           text,
  date            text,
  on_screen_text  text,
  description     text,
  platforms       text[],
  attachment_urls text[],
  status          text,
  content_type    text,
  slides          text[],
  review_status   text,
  review_note     text,
  reviewed_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, title, date, on_screen_text, description, platforms,
         attachment_urls, status, content_type, slides,
         review_status, review_note, reviewed_at
  from public.posts
  where share_token = p_token
  limit 1;
$$;

revoke all on function public.get_shared_post(uuid) from public;
grant execute on function public.get_shared_post(uuid) to anon, authenticated;

-- Action handler. Mirrors the dashboard's review logic exactly:
--   approved        -> moves card to Scheduled
--   needs-revision  -> stays in Review
--   on-hold         -> moves card to Idea
--   '' (toggle off) -> clears review state and reverts Scheduled -> Review
create or replace function public.review_shared_post(
  p_token  uuid,
  p_action text,
  p_note   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_status text;
begin
  select id, status into v_id, v_status
    from public.posts
   where share_token = p_token;

  if v_id is null then
    raise exception 'invalid share token';
  end if;

  if p_action not in ('', 'approved', 'needs-revision', 'on-hold') then
    raise exception 'invalid action';
  end if;

  if p_action = '' then
    update public.posts
       set review_status = null,
           reviewed_by   = null,
           reviewed_at   = null,
           review_note   = coalesce(p_note, review_note),
           status        = case when v_status = 'Scheduled' then 'Review' else v_status end
     where id = v_id;
  else
    update public.posts
       set review_status = p_action,
           reviewed_by   = 'Wesley Hoang',
           reviewed_at   = now(),
           review_note   = coalesce(p_note, review_note),
           status        = case
                             when p_action = 'approved'       then 'Scheduled'
                             when p_action = 'needs-revision' then 'Review'
                             when p_action = 'on-hold'        then 'Idea'
                             else v_status
                           end
     where id = v_id;
  end if;
end;
$$;

revoke all on function public.review_shared_post(uuid, text, text) from public;
grant execute on function public.review_shared_post(uuid, text, text) to anon, authenticated;
