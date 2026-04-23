import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/view-model'

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Checking session...</p>
    </div>
  )
}

export function ProtectedRoute() {
  const { accessToken, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AuthLoadingScreen />
  }

  if (!accessToken) {
    const redirectTarget = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from: redirectTarget }} />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { accessToken, loading } = useAuth()

  if (loading) {
    return <AuthLoadingScreen />
  }

  if (accessToken) {
    return <Navigate to="/quiz" replace />
  }

  return <Outlet />
}
