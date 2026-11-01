-- Web Push system upgrade (safe, non-destructive)

-- Extended subscription columns
alter table public.push_subscriptions add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.push_subscriptions add column if not exists p256dh text;
alter table public.push_subscriptions add column if not exists auth text;
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();

-- Prevent duplicate spam of publish notifications
alter table public.news add column if not exists notified_at timestamptz;
alter table public.projects add column if not exists notified_at timestamptz;
alter table public.bots add column if not exists notified_at timestamptz;

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('news','projects','bots','products','test')),
  content_id uuid,
  title text not null,
  body text not null,
  url text not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_push_outbox_pending on public.push_outbox (status, created_at)
  where status = 'pending';

alter table public.push_outbox enable row level security;

drop policy if exists outbox_staff on public.push_outbox;
create policy outbox_staff on public.push_outbox
  for select using (public.is_staff());

-- notification_logs extensions
alter table public.notification_logs add column if not exists content_type text;
alter table public.notification_logs add column if not exists content_id uuid;
alter table public.notification_logs add column if not exists actor_id uuid;

-- Default push settings (owner can change)
insert into public.website_settings (key, value)
values (
  'push_config',
  jsonb_build_object(
    'enabled', true,
    'news', true,
    'projects', true,
    'bots', true,
    'products', false
  )
)
on conflict (key) do nothing;

-- Request visitor id from gateway header (set by supabase-client.js)
create or replace function public.request_visitor_id()
returns text
language sql
stable
as $$
  select nullif(
    trim(
      coalesce(
        current_setting('request.headers', true)::json->>'x-visitor-id',
        current_setting('request.headers', true)::json->>'X-Visitor-Id',
        ''
      )
    ),
    ''
  );
$$;

-- RLS: only own visitor_id (must match X-Visitor-ID) or own user_id or staff
drop policy if exists push_insert on public.push_subscriptions;
drop policy if exists push_upsert_own on public.push_subscriptions;
drop policy if exists push_update_own on public.push_subscriptions;
drop policy if exists push_staff_sel on public.push_subscriptions;
drop policy if exists push_select_own on public.push_subscriptions;
drop policy if exists push_delete_own on public.push_subscriptions;

create policy push_insert_own on public.push_subscriptions
  for insert
  with check (
    visitor_id is not null
    and length(visitor_id) >= 8
    and visitor_id = public.request_visitor_id()
  );

create policy push_update_own on public.push_subscriptions
  for update
  using (
    public.is_staff()
    or (user_id is not null and user_id = auth.uid())
    or (visitor_id is not null and visitor_id = public.request_visitor_id())
  )
  with check (
    public.is_staff()
    or (user_id is not null and user_id = auth.uid())
    or (visitor_id is not null and visitor_id = public.request_visitor_id())
  );

create policy push_select_own on public.push_subscriptions
  for select
  using (
    public.is_staff()
    or (user_id is not null and user_id = auth.uid())
    or (visitor_id is not null and visitor_id = public.request_visitor_id())
  );

create policy push_delete_own on public.push_subscriptions
  for delete
  using (
    public.is_staff()
    or (user_id is not null and user_id = auth.uid())
    or (visitor_id is not null and visitor_id = public.request_visitor_id())
  );

-- Preferred client path: force visitor_id from header (cannot forge another visitor's row ownership on insert)
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_keys jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vid text := public.request_visitor_id();
  uid uuid := auth.uid();
begin
  if p_endpoint is null or length(trim(p_endpoint)) < 10 then
    raise exception 'invalid endpoint';
  end if;
  if vid is null or length(vid) < 8 then
    raise exception 'missing X-Visitor-ID';
  end if;
  if p_p256dh is null or p_auth is null then
    raise exception 'missing subscription keys';
  end if;

  insert into public.push_subscriptions as ps (
    endpoint, visitor_id, user_id, keys, p256dh, auth, user_agent, is_active, updated_at, created_at
  ) values (
    trim(p_endpoint),
    vid,
    uid,
    coalesce(p_keys, '{}'::jsonb),
    p_p256dh,
    p_auth,
    left(coalesce(p_user_agent, ''), 240),
    true,
    now(),
    now()
  )
  on conflict (endpoint) do update set
    -- Only the same visitor (or staff path via separate policies) may refresh keys
    visitor_id = case
      when ps.visitor_id = vid then vid
      when public.is_staff() then ps.visitor_id
      else ps.visitor_id
    end,
    user_id = coalesce(uid, ps.user_id),
    keys = excluded.keys,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    updated_at = now()
  where ps.visitor_id = vid or ps.user_id = uid or public.is_staff();

  if not found and not exists (select 1 from public.push_subscriptions where endpoint = trim(p_endpoint)) then
    -- insert failed silently? recheck
    null;
  end if;

  -- If row exists for another visitor, deny
  if exists (
    select 1 from public.push_subscriptions
    where endpoint = trim(p_endpoint)
      and visitor_id is distinct from vid
      and (user_id is null or user_id is distinct from uid)
      and not public.is_staff()
  ) then
    raise exception 'endpoint owned by another visitor';
  end if;
end;
$$;

create or replace function public.deactivate_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  vid text := public.request_visitor_id();
  uid uuid := auth.uid();
  n int;
begin
  if p_endpoint is null or length(trim(p_endpoint)) < 10 then
    raise exception 'invalid endpoint';
  end if;
  update public.push_subscriptions
  set is_active = false, updated_at = now()
  where endpoint = trim(p_endpoint)
    and (
      public.is_staff()
      or (vid is not null and visitor_id = vid)
      or (uid is not null and user_id = uid)
    );
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'subscription not found or not owned';
  end if;
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text, jsonb) from public;
revoke all on function public.deactivate_push_subscription(text) from public;
grant execute on function public.upsert_push_subscription(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.deactivate_push_subscription(text) to anon, authenticated;
grant execute on function public.request_visitor_id() to anon, authenticated;

-- Enqueue on first publish only (backend — not bypassable from pure client tricks without DB write)
create or replace function public.enqueue_publish_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  enabled boolean;
  type_key text;
  title_txt text;
  body_txt text;
  url_txt text;
  allow boolean;
begin
  if tg_table_name = 'news' then type_key := 'news';
  elsif tg_table_name = 'projects' then type_key := 'projects';
  elsif tg_table_name = 'bots' then type_key := 'bots';
  else return new;
  end if;

  -- only transition to published
  if not (new.is_published is true and (tg_op = 'INSERT' or old.is_published is distinct from true)) then
    return new;
  end if;

  -- already notified once
  if new.notified_at is not null then
    return new;
  end if;

  select value into cfg from website_settings where key = 'push_config';
  cfg := coalesce(cfg, '{}'::jsonb);
  enabled := coalesce((cfg->>'enabled')::boolean, true);
  allow := coalesce((cfg->>type_key)::boolean, true);
  if not enabled or not allow then
    return new;
  end if;

  if type_key = 'news' then
    title_txt := 'خبر جدید منتشر شد';
    body_txt := coalesce(new.title, 'News');
    url_txt := './article.html?id=' || new.id::text;
  elsif type_key = 'projects' then
    title_txt := 'پروژه جدید منتشر شد';
    body_txt := coalesce(new.title, 'Project');
    url_txt := './projects.html';
  else
    title_txt := 'ربات جدید منتشر شد';
    body_txt := coalesce(new.name, 'Bot');
    url_txt := './bots.html';
  end if;

  insert into push_outbox (content_type, content_id, title, body, url, status)
  values (type_key, new.id, title_txt, body_txt, url_txt, 'pending');

  new.notified_at := now();
  return new;
end;
$$;

drop trigger if exists trg_news_push on public.news;
create trigger trg_news_push
  before insert or update of is_published on public.news
  for each row execute function public.enqueue_publish_push();

drop trigger if exists trg_projects_push on public.projects;
create trigger trg_projects_push
  before insert or update of is_published on public.projects
  for each row execute function public.enqueue_publish_push();

drop trigger if exists trg_bots_push on public.bots;
create trigger trg_bots_push
  before insert or update of is_published on public.bots
  for each row execute function public.enqueue_publish_push();

-- Staff-only process claim is done in Edge Function with service role
comment on table public.push_outbox is 'Queue of push payloads; processed by send-push Edge Function';

grant select, insert, update, delete on public.push_subscriptions to anon, authenticated;

