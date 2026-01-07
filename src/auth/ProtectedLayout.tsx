import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()

  if (status === 'checking') {
    return (
      <section className="page">
        <h1>Checking session...</h1>
        <p className="page-note">Validating your authentication token.</p>
      </section>
    )
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
