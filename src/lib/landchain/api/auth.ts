// Who the browser is signed in as, in backend mode.
//
// With Supabase configured, people sign in with Supabase Auth (email + password) and every API call carries
// the access token. Without it, the backend's local dev login is used: the X-Dev-User header names the email.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_PASSWORD, SUPABASE_KEY, SUPABASE_MODE, SUPABASE_URL } from "./config";

const DEV_KEY = "landchain-api-dev-user";

let client: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** Headers that identify the caller to the backend (none for a public visitor). */
export async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  if (SUPABASE_MODE) {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  const dev = localStorage.getItem(DEV_KEY);
  return dev ? { "X-Dev-User": dev } : {};
}

export async function isSignedIn(): Promise<boolean> {
  return Object.keys(await authHeaders()).length > 0;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!SUPABASE_MODE) {
    localStorage.setItem(DEV_KEY, email.trim().toLowerCase());
    return;
  }
  const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message === "Invalid login credentials"
    ? "Wrong email or password." : error.message);
}

export async function signUp(email: string, password: string, fullName: string): Promise<void> {
  if (!SUPABASE_MODE) {
    localStorage.setItem(DEV_KEY, email.trim().toLowerCase());
    return;
  }
  const { data, error } = await supabase().auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
  if (error) throw new Error(error.message);
  if (!data.session) throw new Error("Check your email to confirm your account, then sign in.");
}

/** Demo people from seed_demo_users share one password (VITE_DEMO_PASSWORD). */
export const signInDemo = (email: string) => signInWithPassword(email, DEMO_PASSWORD);

export async function signOutApi(): Promise<void> {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEV_KEY);
  if (SUPABASE_MODE) await supabase().auth.signOut();
}
