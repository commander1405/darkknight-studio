-- Permission-aware staff helpers + safer settings write
-- Safe to run on existing data. Does not drop tables.

-- activity_logs: allow staff insert of own actions
create table if not exists public.activity_logs (
  id bigserial primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

drop policy if exists activity_staff_select on public.activity_logs;
create policy activity_staff_select on public.activity_logs
  for select using (public.is_staff());

drop policy if exists activity_staff_insert on public.activity_logs;
create policy activity_staff_insert on public.activity_logs
  for insert with check (
    public.is_staff() and (actor_id is null or actor_id = auth.uid())
  );

-- Auto-set actor_id on insert
create or replace function public.set_activity_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.actor_id is null then
    new.actor_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_actor on public.activity_logs;
create trigger trg_activity_actor
  before insert on public.activity_logs
  for each row execute function public.set_activity_actor();

-- has_perm: owner always true; admin needs permissions->>key = true
create or replace function public.has_perm(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role = 'owner'
        or (
          p.role = 'admin'
          and coalesce((p.permissions ->> p_key)::boolean, false) = true
        )
      )
  );
$$;

revoke all on function public.has_perm(text) from public;
grant execute on function public.has_perm(text) to authenticated;

-- Optional tighter content policies using has_perm (keeps is_staff fallback for owners)
-- Note: existing is_staff policies remain; these add defense in depth for settings.

drop policy if exists settings_staff on public.website_settings;
create policy settings_staff on public.website_settings
  for all
  using (public.has_perm('settings') or public.is_staff())
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active and p.role = 'owner'
    )
    or public.has_perm('settings')
  );

-- Ensure website_settings exists from 001
create table if not exists public.website_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on function public.has_perm(text) is
  'Owner always true; admin only if permissions JSON flag is true. Empty permissions = no access.';

grant select, insert on public.activity_logs to authenticated;
grant usage, select on sequence public.activity_logs_id_seq to authenticated;
