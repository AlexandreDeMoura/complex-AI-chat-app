import { createClient } from '@supabase/supabase-js'

const requireEnv = (key) => {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is not configured.`)
  }
  return value
}

const getSupabaseConfig = () => ({
  url: requireEnv('SUPABASE_URL'),
  publishableKey: requireEnv('SUPABASE_PUBLISHABLE_KEY'),
  secretKey: requireEnv('SUPABASE_SECRET_KEY'),
})

let adminClient = null

export const getSupabaseAdminClient = () => {
  if (adminClient) {
    return adminClient
  }

  const { url, secretKey } = getSupabaseConfig()
  adminClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}

export const createSupabaseRequestClient = (accessToken) => {
  const token = typeof accessToken === 'string' ? accessToken.trim() : ''
  if (!token) {
    throw new Error('Supabase access token is required.')
  }

  const { url, publishableKey } = getSupabaseConfig()
  return createClient(url, publishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}
