-- DARKKNIGHT STUDIO upgrade — safe for existing data
-- Run AFTER 001_init.sql. Does not drop tables or delete rows.

-- Extra columns used by frontend / future admin
alter table public.projects add column if not exists slug text;
alter table public.bots add column if not exists slug text;
alter table public.news add column if not exists slug text;
alter table public.products add column if not exists slug text;

alter table public.projects add column if not exists view_count int not null default 0;
alter table public.bots add column if not exists view_count int not null default 0;
alter table public.products add column if not exists view_count int not null default 0;
alter table public.news add column if not exists view_count int not null default 0;

alter table public.contact_messages add column if not exists source_path text;
alter table public.purchase_requests add column if not exists product_name text;

-- Analytics events (optional, append-only)
create table if not exists public.analytics_events (
  id bigserial primary key,
  visitor_id text,
  event_type text not null,
  path text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_analytics_events_created on public.analytics_events (created_at desc);
create index if not exists idx_analytics_events_type on public.analytics_events (event_type);

alter table public.analytics_events enable row level security;

-- Staff read; public insert only via RPC below
drop policy if exists analytics_staff on public.analytics_events;
create policy analytics_staff on public.analytics_events
  for select using (public.is_staff());

-- Safer page view + optional event
create or replace function public.record_page_view(p_visitor_id text, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor_id is null or length(p_visitor_id) < 8 then
    return;
  end if;
  if p_path is not null and (p_path ilike '%admin%' or p_path ilike '%admin-login%') then
    return;
  end if;
  insert into visitor_registry (visitor_id)
  values (p_visitor_id)
  on conflict (visitor_id) do update
    set last_seen = now(),
        hit_count = visitor_registry.hit_count + 1;
  insert into page_views (visitor_id, path)
  values (p_visitor_id, left(coalesce(p_path, '/'), 400));
end;
$$;

create or replace function public.record_analytics_event(
  p_visitor_id text,
  p_event_type text,
  p_path text default null,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type is null or length(trim(p_event_type)) < 2 then
    return;
  end if;
  if p_path is not null and p_path ilike '%admin%' then
    return;
  end if;
  insert into analytics_events (visitor_id, event_type, path, meta)
  values (
    nullif(left(coalesce(p_visitor_id, ''), 80), ''),
    left(trim(p_event_type), 64),
    left(coalesce(p_path, ''), 400),
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.record_analytics_event(text, text, text, jsonb) to anon, authenticated;

-- Ensure staff can update status on requests/tickets (re-assert policies safely)
drop policy if exists purchase_staff on public.purchase_requests;
create policy purchase_staff on public.purchase_requests
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists tickets_staff on public.support_tickets;
create policy tickets_staff on public.support_tickets
  for all using (public.is_staff()) with check (public.is_staff());

-- Profiles: only owner can change roles
drop policy if exists profiles_owner_write on public.profiles;
create policy profiles_owner_write on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner' and p.is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'owner' and p.is_active = true
    )
  );

-- Prevent demoting last owner via trigger
create or replace function public.protect_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and (new.role is distinct from 'owner' or new.is_active is distinct from true) then
    if (select count(*) from public.profiles where role = 'owner' and is_active) <= 1 then
      raise exception 'cannot demote or deactivate the last owner';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_owner on public.profiles;
create trigger trg_protect_owner
  before update on public.profiles
  for each row execute function public.protect_owner_role();

-- Indexes for common public filters
create index if not exists idx_projects_featured on public.projects (is_featured) where is_published;
create index if not exists idx_bots_featured on public.bots (is_featured) where is_published;
create index if not exists idx_news_featured on public.news (is_featured) where is_published;
create index if not exists idx_products_pub on public.products (is_published, sort_order);
