# DARKKNIGHT STUDIO

Official studio website (static + Supabase).

**Live:** https://commander1405.github.io/darkknight-studio/

## Quick setup
1. Run `supabase/migrations/001_init.sql` in Supabase SQL editor.
2. Create Auth user (email/password) — this is the owner account.
3. Link profile:
```sql
insert into profiles (id, email, role, is_active)
values ('AUTH_USER_UUID', 'you@email.com', 'owner', true);
```
4. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `assets/js/config.js`.

## Features
- Home, Projects, Bots, Team, News, Shop, Support, Contact
- FA/EN i18n + RTL
- Admin login (owner/admin only, no public signup)
- Admin dashboard overview + live tables
- Purchase requests (no payment gateway)
- Support tickets with reference lookup
- Visitor registry + page views RPC
- Service worker + push subscription plumbing (VAPID private key stays server-side)

## Security
See `SECURITY.md`. Never commit service_role keys.
