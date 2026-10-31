import { CONFIG, isConfigured } from "./config.js";

let client = null;

export async function getSupabase() {
  if (!isConfigured()) return null;
  if (client) return client;
  if (!window.supabase) {
    await loadSdk();
  }
  client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
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
