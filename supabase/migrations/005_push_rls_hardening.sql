-- Harden push_subscriptions RLS (idempotent; safe if 004 already applied)

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

drop policy if exists push_insert on public.push_subscriptions;
drop policy if exists push_upsert_own on public.push_subscriptions;
drop policy if exists push_insert_own on public.push_subscriptions;
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

  -- Block takeover of another visitor's endpoint
  if exists (
    select 1 from public.push_subscriptions ps
    where ps.endpoint = trim(p_endpoint)
      and ps.visitor_id is distinct from vid
      and (ps.user_id is null or ps.user_id is distinct from uid)
      and not public.is_staff()
  ) then
    raise exception 'endpoint owned by another visitor';
  end if;

  insert into public.push_subscriptions (
    endpoint, visitor_id, user_id, keys, p256dh, auth, user_agent, is_active, updated_at, created_at
  ) values (
    trim(p_endpoint), vid, uid, coalesce(p_keys, '{}'::jsonb),
    p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 240),
    true, now(), now()
  )
  on conflict (endpoint) do update set
    visitor_id = excluded.visitor_id,
    user_id = coalesce(excluded.user_id, public.push_subscriptions.user_id),
    keys = excluded.keys,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    is_active = true,
    updated_at = now()
  where public.push_subscriptions.visitor_id = vid
     or public.push_subscriptions.user_id = uid
     or public.is_staff();
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

-- Table privileges (RLS still applies)
grant select, insert, update, delete on public.push_subscriptions to anon, authenticated;
