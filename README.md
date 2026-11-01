# DARKKNIGHT STUDIO

https://commander1405.github.io/darkknight-studio/

## Stack
Vanilla HTML/CSS/JS · Supabase · GitHub Pages · PWA

## Setup
1. Run SQL in order:
   - `supabase/migrations/001_init.sql` (if not already)
   - `supabase/migrations/002_studio_upgrade.sql`
2. Create Auth user; insert `profiles` row with `role = 'owner'`.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `assets/js/config.js`.

## Admin
URL only: `/admin-login.html` (not linked in public navigation).

## Mobile
Floating bottom tab bar + “More” sheet. Desktop uses full top navigation.

## Admin / Owner panel
- URL: `/admin.html` (login via `/admin-login.html` — not in public nav)
- Owner: full control + admin management
- Admin: permissions JSON on `profiles.permissions` (default deny)
- Migrations: run `001` → `002` → `003_admin_permissions.sql`

## Web Push

1. Run `supabase/migrations/004_push_system.sql` in SQL Editor.
2. Generate VAPID keys (once):
   ```
   npx web-push generate-vapid-keys
   ```
3. Put **public** key in `assets/js/config.js` → `VAPID_PUBLIC_KEY`.
4. Set Edge Function secrets (private only on server):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@domain
   ```
5. Deploy function:
   ```
   supabase functions deploy send-push
   ```
6. After publishing news/projects/bots, open Admin → Notifications → **Process outbox**
   (or schedule a cron that POSTs `{ "mode": "process_outbox" }` with a service role job).

Public page: `/notifications.html` for enable/disable.
