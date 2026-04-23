import { getSupabaseAdminClient } from '../infrastructure/supabase.js'

const UNAUTHORIZED_ERROR_MESSAGE = 'Unauthorized.'

const getBearerToken = (authorizationHeader) => {
  if (typeof authorizationHeader !== 'string') {
    return null
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2)
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return null
  }

  const normalizedToken = token.trim()
  return normalizedToken || null
}

const respondUnauthorized = (res) => {
  res.status(401).json({ error: UNAUTHORIZED_ERROR_MESSAGE })
}

const respondServerError = (res, message) => {
  res.status(500).json({ error: message })
}

export const requireQuizAuth = async (req, res, next) => {
  const accessToken = getBearerToken(req.get('authorization'))
  if (!accessToken) {
    respondUnauthorized(res)
    return
  }

  try {
    // WHY: validate JWT server-side before allowing any quiz route to execute.
    const supabaseAdmin = getSupabaseAdminClient()
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken)
    const userId = data?.user?.id

    if (error || !userId) {
      respondUnauthorized(res)
      return
    }

    req.userId = userId
    req.accessToken = accessToken
    next()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.'
    if (message.endsWith('is not configured.')) {
      respondServerError(res, message)
      return
    }
    respondUnauthorized(res)
  }
}
