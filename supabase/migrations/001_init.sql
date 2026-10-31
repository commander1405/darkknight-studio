create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner', 'admin')) default 'admin',
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  description text,
  category text,
  status text default 'active',
  technologies text[] default '{}',
  cover_url text,
  external_url text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text,
  summary text,
  description text,
  platform text,
  features text[] default '{}',
  status text default 'active',
  avatar_url text,
  public_url text,
  price_label text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text,
  description text,
  avatar_url text,
  social_links jsonb default '{}'::jsonb,
  is_visible boolean not null default true,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  body text,
  cover_url text,
  category text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  notify_push boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric,
  price_label text,
  category text,
  image_url text,
  is_available boolean not null default true,
  is_published boolean not null default false,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  contact text not null,
  note text,
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected','completed')),
  admin_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null,
  contact text not null,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','in_progress','waiting','resolved','closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text not null,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.visitor_registry (
  visitor_id text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  hit_count int not null default 1
);

create table if not exists public.page_views (
  id bigserial primary key,
  visitor_id text,
  path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  visitor_id text,
  keys jsonb,
  user_agent text,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  target_count int default 0,
  success_count int default 0,
  fail_count int default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.website_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.create_support_ticket(p_name text, p_contact text, p_subject text, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare ref text; tid uuid;
begin
  if length(trim(p_name)) < 2 or length(trim(p_contact)) < 3 or length(trim(p_message)) < 5 then
    raise exception 'invalid input';
  end if;
  ref := 'DK-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
  insert into support_tickets (reference, name, contact, subject, message)
  values (ref, trim(p_name), trim(p_contact), trim(p_subject), trim(p_message))
  returning id into tid;
  return jsonb_build_object('id', tid, 'reference', ref);
end; $$;

create or replace function public.lookup_support_ticket(p_reference text, p_contact text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select subject, status, created_at into r from support_tickets
  where reference = trim(p_reference) and lower(contact) = lower(trim(p_contact)) limit 1;
  if not found then return null; end if;
  return jsonb_build_object('subject', r.subject, 'status', r.status, 'created_at', r.created_at);
end; $$;

create or replace function public.record_page_view(p_visitor_id text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visitor_id is null or length(p_visitor_id) < 8 then return; end if;
  insert into visitor_registry (visitor_id) values (p_visitor_id)
  on conflict (visitor_id) do update set last_seen = now(), hit_count = visitor_registry.hit_count + 1;
  insert into page_views (visitor_id, path) values (p_visitor_id, left(coalesce(p_path,'/'), 400));
end; $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.is_active and p.role in ('owner','admin'));
$$;

alter table profiles enable row level security;
alter table projects enable row level security;
alter table bots enable row level security;
alter table team_members enable row level security;
alter table news enable row level security;
alter table products enable row level security;
alter table purchase_requests enable row level security;
alter table support_tickets enable row level security;
alter table contact_messages enable row level security;
alter table visitor_registry enable row level security;
alter table page_views enable row level security;
alter table push_subscriptions enable row level security;
alter table notification_logs enable row level security;
alter table website_settings enable row level security;

create policy projects_public_read on projects for select using (is_published = true or public.is_staff());
create policy bots_public_read on bots for select using (is_published = true or public.is_staff());
create policy news_public_read on news for select using (is_published = true or public.is_staff());
create policy products_public_read on products for select using (is_published = true or public.is_staff());
create policy team_public_read on team_members for select using (is_visible = true or public.is_staff());
create policy projects_staff on projects for all using (public.is_staff()) with check (public.is_staff());
create policy bots_staff on bots for all using (public.is_staff()) with check (public.is_staff());
create policy news_staff on news for all using (public.is_staff()) with check (public.is_staff());
create policy products_staff on products for all using (public.is_staff()) with check (public.is_staff());
create policy team_staff on team_members for all using (public.is_staff()) with check (public.is_staff());
create policy profiles_self_or_staff on profiles for select using (auth.uid() = id or public.is_staff());
create policy contact_insert on contact_messages for insert with check (true);
create policy contact_staff on contact_messages for select using (public.is_staff());
create policy purchase_insert on purchase_requests for insert with check (true);
create policy purchase_staff on purchase_requests for all using (public.is_staff()) with check (public.is_staff());
create policy tickets_staff on support_tickets for all using (public.is_staff()) with check (public.is_staff());
create policy push_insert on push_subscriptions for insert with check (true);
create policy push_staff_sel on push_subscriptions for select using (public.is_staff());
create policy visitors_staff on visitor_registry for select using (public.is_staff());
create policy pageviews_staff on page_views for select using (public.is_staff());

grant usage on schema public to anon, authenticated;
grant select on projects, bots, news, products, team_members to anon, authenticated;
grant insert on contact_messages, purchase_requests, push_subscriptions to anon, authenticated;
grant execute on function public.create_support_ticket(text,text,text,text) to anon, authenticated;
grant execute on function public.lookup_support_ticket(text,text) to anon, authenticated;
grant execute on function public.record_page_view(text,text) to anon, authenticated;
