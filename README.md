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
