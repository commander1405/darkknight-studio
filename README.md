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
