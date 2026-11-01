import { CONFIG, isConfigured } from "./config.js";
import { visitorId } from "./utils.js";

let client = null;
let clientVisitor = null;

export async function getSupabase() {
  if (!isConfigured()) return null;
  const vid = visitorId();
  // Recreate client if visitor id changed (rare) so header stays correct
  if (client && clientVisitor === vid) return client;
  if (!window.supabase) {
    await loadSdk();
  }
  clientVisitor = vid;
  client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Visitor-ID": vid,
      },
    },
  });
  return client;
}

function loadSdk() {
  return new Promise((resolve, reject) => {
    if (window.supabase) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export { isConfigured };
