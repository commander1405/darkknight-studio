# Security
- Anon key only in frontend; RLS required on all tables.
- No public registration; staff = profiles.role in (owner, admin) and is_active.
- Ticket lookup requires reference + contact match (SECURITY DEFINER RPC).
- Escape HTML on all user content in UI.
- VAPID private keys only in Edge Function secrets.
