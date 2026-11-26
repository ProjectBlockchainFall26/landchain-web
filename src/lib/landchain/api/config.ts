// Backend mode. Set VITE_API_URL in .env.local to make the app read and write through landchain-backend
// (Django + Supabase) instead of talking to the contracts from the browser. Leave it empty for chain mode.
//
//   VITE_API_URL                       http://localhost:8000/api/v1
//   VITE_SUPABASE_URL                  https://<ref>.supabase.co          (sign in with Supabase Auth)
//   VITE_SUPABASE_PUBLISHABLE_KEY      sb_publishable_...                 (public key, safe in the browser)
//   VITE_DEMO_PASSWORD                 password seed_demo_users gave the demo people (local demo only)
//
// Without the Supabase values, the backend's local dev login is used (X-Dev-User header, DEBUG + DEV_AUTH only).
const env = import.meta.env;
const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const API_URL = clean(env["VITE_API_URL"]).replace(/\/+$/, "");
export const API_MODE = API_URL.length > 0;
export const SUPABASE_URL = clean(env["VITE_SUPABASE_URL"]);
export const SUPABASE_KEY = clean(env["VITE_SUPABASE_PUBLISHABLE_KEY"]) || clean(env["VITE_SUPABASE_ANON_KEY"]);
export const SUPABASE_MODE = API_MODE && SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
export const DEMO_PASSWORD = clean(env["VITE_DEMO_PASSWORD"]) || "landchain-demo";
