import { createClient } from "@supabase/supabase-js";

// Server-only client using the secret key. Never import this from a client component.
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const BUCKET = process.env.SUPABASE_BUCKET ?? "recordings";
