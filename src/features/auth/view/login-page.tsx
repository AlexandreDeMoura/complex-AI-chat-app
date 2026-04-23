import { type FormEvent, useCallback, useMemo, useState } from 'react'
import { ArrowLeft, Loader2, LogIn, UserPlus } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/view-model'

const MIN_PASSWORD_LENGTH = 6

interface LocationStateShape {
  from?: string
}

function resolveRedirectTarget(state: unknown): string {
  if (!state || typeof state !== 'object') {
    return '/quiz'
  }

  const from = (state as LocationStateShape).from
  if (typeof from !== 'string' || !from.startsWith('/')) {
    return '/quiz'
  }

  return from
}

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (message) {
      return message
    }
  }

  return 'Authentication failed. Please try again.'
}

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTarget = useMemo(() => resolveRedirectTarget(location.state), [location.state])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<'signin' | 'signup' | null>(null)

  const runAuthAction = useCallback(
    async (action: 'signin' | 'signup') => {
      const normalizedEmail = email.trim()
      if (!normalizedEmail || !password) {
        setErrorMessage('Email and password are required.')
        setNoticeMessage(null)
        return
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
        setNoticeMessage(null)
        return
      }

      setActiveAction(action)
      setErrorMessage(null)
      setNoticeMessage(null)

      try {
        if (action === 'signin') {
          await signIn({
            email: normalizedEmail,
            password,
          })

          navigate(redirectTarget, { replace: true })
          return
        }

        const result = await signUp({
          email: normalizedEmail,
          password,
        })

        if (result.hasSession) {
          navigate(redirectTarget, { replace: true })
          return
        }

        setNoticeMessage(
          'Account created. Confirm your email before signing in if verification is enabled.',
        )
      } catch (error) {
        setErrorMessage(getAuthErrorMessage(error))
      } finally {
        setActiveAction(null)
      }
    },
    [email, navigate, password, redirectTarget, signIn, signUp],
  )

  const handleSignInSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAuthAction('signin')
  }, [runAuthAction])

  const isSubmitting = activeAction !== null
  const isSigningIn = activeAction === 'signin'
  const isSigningUp = activeAction === 'signup'

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link to="/" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to chat
          </Link>
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">Login to continue with quiz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your email and password to access persisted quiz uploads.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSignInSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
              }}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="At least 6 characters"
              required
            />
          </label>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="brand"
              className="flex-1 gap-2"
              disabled={isSubmitting}
            >
              {isSigningIn ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" />
              )}
              Sign in
            </Button>

            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              disabled={isSubmitting}
              onClick={() => {
                void runAuthAction('signup')
              }}
            >
              {isSigningUp ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Sign up
            </Button>
          </div>
        </form>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3"
          >
            <p className="text-sm font-medium text-destructive">{errorMessage}</p>
          </div>
        )}

        {noticeMessage && (
          <div className="mt-4 rounded-lg border border-border bg-muted/25 px-4 py-3">
            <p className="text-sm text-muted-foreground">{noticeMessage}</p>
          </div>
        )}
      </section>
    </div>
  )
}
