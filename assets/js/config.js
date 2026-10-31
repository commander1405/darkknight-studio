export const CONFIG = {
  SITE_NAME: "DARKKNIGHT STUDIO",
  SITE_URL: "https://commander1405.github.io/darkknight-studio",

  SUPABASE_URL: "YOUR_SUPABASE_URL",
  SUPABASE_ANON_KEY: "YOUR_PUBLISHABLE_OR_ANON_KEY",

  TRACK_VISITOR_URL: "",
  SUBMIT_PUBLIC_URL: "",

  VAPID_PUBLIC_KEY: "",
};

export function isConfigured() {
  return !!(
    CONFIG.SUPABASE_URL &&
    CONFIG.SUPABASE_ANON_KEY
  );
}
