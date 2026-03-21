import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { oauth2Authorise } from '../api/oauth2Flow'
import { useAuth } from '../auth/AuthContext'
import {
  clearOauth2ConsentState,
  clearOauth2ResumeAttempted,
  hasOauth2ResumeAttempted,
  markOauth2ResumeAttempted,
  saveOauth2ConsentState,
} from '../auth/oauth2FlowState'

export default function Oauth2Resume() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const run = async () => {
      const pending = searchParams.get('oauth2_continue')
      if (!pending) {
        setMessage(t('oauth2Flow.errors.missingResume'))
        return
      }

      const url = new URL(pending, window.location.origin)
      const result = await oauth2Authorise(url.searchParams)
      if (!active) return

      if (result.state === 'auth_required') {
        if (hasOauth2ResumeAttempted()) {
          clearOauth2ResumeAttempted()
          setMessage(t('oauth2Flow.errors.resumeLoop'))
          return
        }
        markOauth2ResumeAttempted()
        navigate(`/login?oauth2_continue=${encodeURIComponent(pending)}`, { replace: true })
        return
      }

      clearOauth2ResumeAttempted()

      if (result.state === 'redirect') {
        clearOauth2ConsentState()
        window.location.assign(result.redirectUri)
        return
      }
      if (result.state === 'consent') {
        saveOauth2ConsentState(result.consent)
        navigate(`/oauth2-ui/consent?oauth2_continue=${encodeURIComponent(pending)}`, {
          replace: true,
        })
        return
      }
      if (result.state === 'access_denied') {
        setMessage(t('oauth2Flow.errors.accessDenied'))
        return
      }

      setMessage(result.message || t('oauth2Flow.errors.invalidRequest'))
    }

    void run().catch((error) => {
      if (!active) return
      setMessage(error instanceof Error ? error.message : t('oauth2Flow.errors.invalidRequest'))
    })

    return () => {
      active = false
    }
  }, [navigate, searchParams, t])

  return (
    <section className="centered-page">
      <div className="centered-card">
        <h1>{t('oauth2Flow.resume.title')}</h1>
        <p className="muted-text">
          {user
            ? t('oauth2Flow.user.signedInAs', { displayName: user.displayName, name: user.name })
            : t('oauth2Flow.user.notSignedIn')}
        </p>
        {message ? (
          <p className="inline-feedback">{message}</p>
        ) : (
          <p className="muted-text">{t('oauth2Flow.resume.loading')}</p>
        )}
      </div>
    </section>
  )
}
