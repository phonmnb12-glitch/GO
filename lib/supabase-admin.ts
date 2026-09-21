import { createClient } from "@supabase/supabase-js"

// Service-role client -- bypasses RLS entirely. Only for server-side batch
// operations that must act on behalf of MULTIPLE users at once (e.g.
// charging every accepted member of a group mission the moment the last
// person accepts), which an individual request's own RLS-scoped client
// can't do since it's only ever authorized as the one signed-in user.
// Never expose this client or the key it reads to the browser.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY missing).")
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
