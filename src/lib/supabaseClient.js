import { createClient } from '@supabase/supabase-js'

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!configuredSupabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Check .env.local and restart the dev server.'
  )
}

function getProjectSupabaseUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid HTTPS project URL.')
  }

  if (url.protocol !== 'https:') {
    throw new Error('VITE_SUPABASE_URL must use HTTPS.')
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    console.warn('[Supabase configuration] VITE_SUPABASE_URL included a path, query, or fragment; using the project origin.')
  }

  return url.origin
}

const supabaseUrl = getProjectSupabaseUrl(configuredSupabaseUrl)

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error')
  return message.replace(/https?:\/\/[^\s]+/g, '[URL]')
}

export function logSupabaseRequestError(operation, endpointPath, error) {
  console.error(`[Supabase] ${operation} failed at ${endpointPath}: ${safeErrorMessage(error)}`)
}

let supabaseClient

export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseKey)
  }
  return supabaseClient
}
