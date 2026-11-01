
export const CONFIG = {
  SITE_NAME: "DARKKNIGHT STUDIO",
  SITE_URL: "https://commander1405.github.io/darkknight-studio",

  SUPABASE_URL: "https://eiofkondgzhiravpjcid.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_oCm-RjwuJvN2fEmLITk9BQ_LCMb3pIt",

  TRACK_VISITOR_URL: "",
  SUBMIT_PUBLIC_URL: "",

  VAPID_PUBLIC_KEY: "",
};

export function isConfigured() {
  return (
    CONFIG.SUPABASE_URL.startsWith("https://") &&
    CONFIG.SUPABASE_ANON_KEY.length > 20 &&
    !CONFIG.SUPABASE_URL.includes("YOUR_") &&
    !CONFIG.SUPABASE_ANON_KEY.includes("YOUR_")
  );
}
