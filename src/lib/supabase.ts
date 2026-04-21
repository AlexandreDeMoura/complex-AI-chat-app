import { createClient } from '@supabase/supabase-js'

const requireEnv = (
  key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY',
): string => {
  const value = import.meta.env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is not configured.`)
  }
  return value
}

export const supabase = createClient(
  requireEnv('VITE_SUPABASE_URL'),
  requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
)
