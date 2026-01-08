import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  cancelCredentialUpdate,
  commitCredentialUpdate,
  exchangeCredentialIntent,
  refreshCredentialStatus,
  sendCredentialUpdate,
} from '../api'
import type { components } from '../api/schema'
import { performPasskeyCreation } from '../auth/webauthn'
import CredentialSections from '../components/CredentialSections'
import { buildTotpPayload } from '../utils/totp'

type CUStatus = components['schemas']['CUStatus']
type CUSessionToken = components['schemas']['CUSessionToken']
type CURegState = components['schemas']['CURegState']
type CURegWarning = components['schemas']['CURegWarning']
type TotpSecret = components['schemas']['TotpSecret']
type CredentialDetail = components['schemas']['CredentialDetail']

type ResetState = {
  session: CUSessionToken
  status: CUStatus
}

const RESET_SESSION_KEY = 'kanidm.reset.session'

function extractPasskeyChallenge(state: CURegState): Record<string, unknown> | null {
  if (state && typeof state === 'object' && 'Passkey' in state) {
    return state.Passkey as Record<string, unknown>
  }
  return null
}

function extractTotpSecret(state: CURegState): TotpSecret | null {
  if (state && typeof state === 'object' && 'TotpCheck' in state) {
    return state.TotpCheck as TotpSecret
  }
  return null
}

function describeWarning(warning: CURegWarning, t: (key: string) => string) {
  if (typeof warning === 'string') {
    switch (warning) {
      case 'MfaRequired':
        return t('warnings.mfaRequired')
      case 'PasskeyRequired':
        return t('warnings.passkeyRequired')
      case 'AttestedPasskeyRequired':
        return t('warnings.attestedPasskeyRequired')
      case 'AttestedResidentKeyRequired':
        return t('warnings.attestedResidentKeyRequired')
      case 'WebauthnAttestationUnsatisfiable':
        return t('warnings.webauthnAttestationUnsatisfiable')
      case 'WebauthnUserVerificationRequired':
        return t('warnings.webauthnUserVerificationRequired')
      case 'Unsatisfiable':
        return t('warnings.unsatisfiable')
      case 'NoValidCredentials':
        return t('warnings.noValidCredentials')
      default:
        return warning
    }
  }
  return String(warning)
}

function hasPasswordCredential(cred: CredentialDetail | null | undefined) {
  if (!cred) return false
  if (cred.type_ === 'Password' || cred.type_ === 'GeneratedPassword') {
    return true
  }
  if (typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_) {
    return true
  }
  return false
}

function storeResetSession(payload: ResetState) {
  sessionStorage.setItem(RESET_SESSION_KEY, JSON.stringify(payload.session))
}

function clearResetSession() {
  sessionStorage.removeItem(RESET_SESSION_KEY)
}

function readResetSession(): CUSessionToken | null {
  const raw = sessionStorage.getItem(RESET_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CUSessionToken
  } catch {
    return null
  }
}

export default function ResetCredentials() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tokenParam = searchParams.get('token') ?? ''

  const [token, setToken] = useState(tokenParam)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<CUSessionToken | null>(null)
  const [status, setStatus] = useState<CUStatus | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passkeyLabel, setPasskeyLabel] = useState('')
  const [passkeyLabelOpen, setPasskeyLabelOpen] = useState(false)
  const [pendingPasskey, setPendingPasskey] = useState<Record<string, unknown> | null>(null)
  const [totpPayload, setTotpPayload] = useState<ReturnType<typeof buildTotpPayload> | null>(
    null,
  )
  const [totpQr, setTotpQr] = useState<string | null>(null)
  const [totpLabel, setTotpLabel] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState<string | null>(null)
  const [totpModalOpen, setTotpModalOpen] = useState(false)
  const [totpSha1Warning, setTotpSha1Warning] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)

  const hasSession = useMemo(() => Boolean(session && status), [session, status])
  const warningMessages = useMemo(
    () => (status ? status.warnings.map((warning) => describeWarning(warning, t)) : []),
    [status, t],
  )
  const passwordConfigured = useMemo(() => hasPasswordCredential(status?.primary), [status])
  const passwordResetAvailable = passwordConfigured || Boolean(passwordNotice)
  const passwordButtonLabel = passwordResetAvailable
    ? t('profile.passwordReset')
    : t('profile.passwordSet')
  const passwordHelper = t('profile.passwordHelper')
  const effectivePasswordNotice =
    passwordNotice ?? (passwordConfigured ? t('profile.passwordSetNotice') : null)

  useEffect(() => {
    const buildQr = async () => {
      if (!totpPayload?.uri) {
        setTotpQr(null)
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(totpPayload.uri, {
          width: 280,
          margin: 1,
        })
        setTotpQr(dataUrl)
      } catch {
        setTotpQr(null)
      }
    }
    void buildQr()
  }, [totpPayload?.uri])

  const beginSessionFromToken = async (tokenValue: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await exchangeCredentialIntent(tokenValue)
      setSession(response.session)
      setStatus(response.status)
      setPasswordNotice(null)
      setShowPasswordForm(false)
      storeResetSession(response)
      if (tokenValue !== token) {
        setToken(tokenValue)
      }
      setSearchParams({ token: tokenValue })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messageTokenInvalid'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const resume = async () => {
      const stored = readResetSession()
      if (!stored) return
      setLoading(true)
      setMessage(null)
      try {
        const nextStatus = await refreshCredentialStatus(stored)
        setSession(stored)
        setStatus(nextStatus)
      } catch {
        clearResetSession()
        setSession(null)
        setStatus(null)
      } finally {
        setLoading(false)
      }
    }

    void resume()
  }, [])

  useEffect(() => {
    if (!tokenParam || hasSession) return
    void beginSessionFromToken(tokenParam)
  }, [tokenParam, hasSession])

  const handleTokenSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      setMessage(t('reset.messageTokenRequired'))
      return
    }
    await beginSessionFromToken(token.trim())
  }

  const submitPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!session) return
    if (!password || password !== passwordConfirm) {
      setMessage(t('reset.messagePasswordMismatch'))
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, { password })
      setStatus(nextStatus)
      setPassword('')
      setPasswordConfirm('')
      setShowPasswordForm(false)
      setPasswordNotice(t('reset.messagePasswordSetNotice'))
      setMessage(t('reset.messagePasswordStaged'))
      if (nextStatus.warnings.includes('MfaRequired')) {
        await beginTotpEnrollment()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messagePasswordUpdateFailed'))
    } finally {
      setLoading(false)
    }
  }

  const beginPasskeyEnrollment = async () => {
    if (!session) return
    setLoading(true)
    setMessage(null)
    try {
      const initStatus = await sendCredentialUpdate(session, 'passkeyinit')
      const challenge = extractPasskeyChallenge(initStatus.mfaregstate)
      if (!challenge) {
        throw new Error(t('reset.messagePasskeyChallengeMissing'))
      }
      const registration = await performPasskeyCreation(challenge)
      setPendingPasskey(registration)
      setPasskeyLabel('')
      setPasskeyLabelOpen(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messagePasskeyEnrollFailed'))
    } finally {
      setLoading(false)
    }
  }

  const submitPasskeyLabel = async () => {
    if (!session || !pendingPasskey) return
    if (!passkeyLabel.trim()) {
      setMessage(t('reset.messagePasskeyLabelRequired'))
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, {
        passkeyfinish: [passkeyLabel.trim(), pendingPasskey],
      })
      setStatus(nextStatus)
      setPasskeyLabel('')
      setPendingPasskey(null)
      setPasskeyLabelOpen(false)
      setMessage(t('reset.messagePasskeyEnrolled'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messagePasskeyEnrollFailed'))
    } finally {
      setLoading(false)
    }
  }

  const beginTotpEnrollment = async () => {
    if (!session) return
    setTotpError(null)
    setTotpSha1Warning(false)
    setTotpLabel('')
    setTotpCode('')
    setTotpModalOpen(true)
    if (!totpPayload) {
      setTotpError(t('reset.messageTotpLoading'))
    }
    setLoading(true)
    try {
      const nextStatus = await sendCredentialUpdate(session, 'totpgenerate')
      const secret = extractTotpSecret(nextStatus.mfaregstate)
      if (!secret) {
        throw new Error(t('reset.messageTotpSetupMissing'))
      }
      setTotpPayload(buildTotpPayload(secret))
      setTotpError(null)
      setStatus(nextStatus)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : t('reset.messageTotpStartFailed'))
    } finally {
      setLoading(false)
    }
  }

  const submitTotpEnrollment = async (acceptSha1 = false) => {
    if (!session || !totpPayload) return
    if (!acceptSha1) {
      if (!totpLabel.trim() || !totpCode.trim()) {
        setTotpError(t('reset.messageTotpNameCodeRequired'))
        return
      }
    }
    setLoading(true)
    setTotpError(null)
    try {
      const nextStatus = acceptSha1
        ? await sendCredentialUpdate(session, 'totpacceptsha1')
        : await sendCredentialUpdate(session, {
            totpverify: [Number(totpCode), totpLabel.trim()],
          })
      if (nextStatus.mfaregstate === 'TotpInvalidSha1') {
        setTotpSha1Warning(true)
        setTotpError(t('reset.messageTotpSha1'))
      } else if (nextStatus.mfaregstate === 'TotpTryAgain') {
        setTotpError(t('reset.messageTotpTryAgain'))
      } else if (
        nextStatus.mfaregstate &&
        typeof nextStatus.mfaregstate === 'object' &&
        'TotpNameTryAgain' in nextStatus.mfaregstate
      ) {
        setTotpError(
          t('reset.messageTotpNameInvalid', {
            name: nextStatus.mfaregstate.TotpNameTryAgain,
          }),
        )
      } else {
        setTotpModalOpen(false)
        setTotpPayload(null)
        setTotpQr(null)
        setTotpLabel('')
        setTotpCode('')
        setTotpSha1Warning(false)
      }
      setStatus(nextStatus)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : t('reset.messageTotpAddFailed'))
    } finally {
      setLoading(false)
    }
  }

  const cancelTotpEnrollment = async () => {
    if (!session) return
    setLoading(true)
    setTotpError(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, 'cancelmfareg')
      setStatus(nextStatus)
      setTotpModalOpen(false)
      setTotpPayload(null)
      setTotpQr(null)
      setTotpLabel('')
      setTotpCode('')
      setTotpSha1Warning(false)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : t('reset.messageTotpCancelFailed'))
    } finally {
      setLoading(false)
    }
  }

  const removePasskey = async (uuid: string) => {
    if (!session) return
    setLoading(true)
    setMessage(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, {
        passkeyremove: uuid,
      })
      setStatus(nextStatus)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messagePasskeyRemoveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const commitChanges = async () => {
    if (!session) return
    setLoading(true)
    setMessage(null)
    try {
      await commitCredentialUpdate(session)
      clearResetSession()
      navigate('/login')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messageSaveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const discardChanges = async () => {
    if (!session) return
    setLoading(true)
    setMessage(null)
    try {
      await cancelCredentialUpdate(session)
      clearResetSession()
      setSession(null)
      setStatus(null)
      setShowPasswordForm(false)
      setPasswordNotice(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messageDiscardFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="reset">
      <div className="reset-card">
        <h1>{t('reset.title')}</h1>
        <p className="page-note">{t('reset.subtitle')}</p>

        {message && <p className="feedback">{message}</p>}

        {!hasSession && (
          <form onSubmit={handleTokenSubmit} className="form-actions">
            <label className="field">
              <span>{t('reset.tokenLabel')}</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={t('reset.tokenPlaceholder')}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {t('reset.startSession')}
            </button>
          </form>
        )}

        {hasSession && status && (
          <div className="credential-panel">
            <div className="credential-alert">
              <span>
                {t('reset.sessionActive', {
                  displayName: status.displayname,
                  spn: status.spn,
                })}
              </span>
              {warningMessages.length > 0 && (
                <div>
                  <span className="warning-text">{t('reset.warningsTitle')}</span>
                  <ul className="warning-list">
                    {warningMessages.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {status.passkeys.length === 0 && (
                <span className="muted-text">{t('reset.tipPasskey')}</span>
              )}
              {!status.can_commit && (
                <span className="warning-text">{t('reset.cannotSave')}</span>
              )}
            </div>

            <CredentialSections
              status={status}
              loading={loading}
              showPasswordForm={showPasswordForm}
              password={password}
              passwordConfirm={passwordConfirm}
              passwordButtonLabel={
                showPasswordForm ? t('profile.hideForm') : passwordButtonLabel
              }
              passwordHelper={passwordHelper}
              passwordNotice={effectivePasswordNotice}
              passkeyLabelOpen={passkeyLabelOpen}
              passkeyLabel={passkeyLabel}
              totpModalOpen={totpModalOpen}
              totpPayload={totpPayload}
              totpQr={totpQr}
              totpError={totpError}
              totpLabel={totpLabel}
              totpCode={totpCode}
              totpSha1Warning={totpSha1Warning}
              onBeginPasskeyEnrollment={beginPasskeyEnrollment}
              onRemovePasskey={removePasskey}
              onTogglePasswordForm={() => setShowPasswordForm((prev) => !prev)}
              onPasswordChange={setPassword}
              onPasswordConfirmChange={setPasswordConfirm}
              onPasswordSubmit={submitPasswordChange}
              onBeginTotpEnrollment={beginTotpEnrollment}
              onPasskeyLabelChange={setPasskeyLabel}
              onPasskeyLabelCancel={() => {
                setPasskeyLabelOpen(false)
                setPendingPasskey(null)
                setPasskeyLabel('')
              }}
              onPasskeyLabelSave={() => {
                void submitPasskeyLabel()
              }}
              onTotpLabelChange={setTotpLabel}
              onTotpCodeChange={setTotpCode}
              onTotpCopyUri={async () => {
                if (!totpPayload) return
                await navigator.clipboard?.writeText(totpPayload.uri)
              }}
              onTotpCancel={() => {
                void cancelTotpEnrollment()
              }}
              onTotpAcceptSha1={() => {
                void submitTotpEnrollment(true)
              }}
              onTotpSubmit={() => {
                void submitTotpEnrollment()
              }}
            />

            <div className="credential-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  void discardChanges()
                }}
                disabled={loading}
              >
                {t('reset.discard')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void commitChanges()
                }}
                disabled={loading || !status.can_commit}
              >
                {t('reset.saveCredentialChanges')}
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}
