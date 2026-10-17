import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Check .env.local and restart the dev server.'
  )
}

let supabaseClient

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey)
  }
  return supabaseClient
}
