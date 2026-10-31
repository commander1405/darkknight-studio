/** Public frontend config only — never put service_role here */
export const CONFIG = {
  SITE_NAME: "DARKKNIGHT STUDIO",
  SITE_URL: "https://commander1405.github.io/darkknight-studio",
  // Fill after creating Supabase project:
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  // Edge functions (optional until deployed)
  TRACK_VISITOR_URL: "",
  SUBMIT_PUBLIC_URL: "",
  // Web Push VAPID public key only
  VAPID_PUBLIC_KEY: "",
};

export function isConfigured() {
  return !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
}
