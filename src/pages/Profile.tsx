import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import {
  beginCredentialUpdate,
  cancelCredentialUpdate,
  clearAuthToken,
  commitCredentialUpdate,
  fetchCredentialStatus,
  fetchRadiusSecret,
  fetchSelfProfile,
  regenerateRadiusSecret,
  sendCredentialUpdate,
  updatePersonProfile,
  deleteRadiusSecret,
} from '../api'
import type { components } from '../api/schema'
import { performPasskeyCreation } from '../auth/webauthn'
import { useAuth } from '../auth/AuthContext'
import { useAccess } from '../auth/AccessContext'
import CredentialSections from '../components/CredentialSections'
import { buildTotpPayload } from '../utils/totp'

type CUStatus = components['schemas']['CUStatus']
type CUSessionToken = components['schemas']['CUSessionToken']
type CURegState = components['schemas']['CURegState']
type CURegWarning = components['schemas']['CURegWarning']
type TotpSecret = components['schemas']['TotpSecret']
type CredentialDetail = components['schemas']['CredentialDetail']
type CredentialStatus = components['schemas']['CredentialStatus']

type ProfileForm = {
  name: string
  displayName: string
  emails: string[]
}


function normalizeEmails(emails: string[]) {
  return emails.map((email) => email.trim()).filter(Boolean)
}

function emailsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((email, index) => email === right[index])
}

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

function summarizePasskeys(labels: string[] | null | undefined, t: (key: string, args?: Record<string, unknown>) => string) {
  if (!labels) return t('profile.summaryUnavailable')
  if (labels.length === 0) return t('profile.summaryNotSet')
  return t('profile.summarySetWithTags', { count: labels.length, tags: labels.join(', ') })
}

function summarizePassword(status: CredentialStatus | null, t: (key: string) => string) {
  if (!status || !Array.isArray(status.creds)) return t('profile.summaryUnavailable')
  const hasPassword = status.creds.some((cred) => {
    if (cred.type_ === 'Password' || cred.type_ === 'GeneratedPassword') return true
    return typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_
  })
  return hasPassword ? t('profile.summarySet') : t('profile.summaryNotSet')
}

function summarizeTotp(status: CredentialStatus | null, t: (key: string, args?: Record<string, unknown>) => string) {
  if (!status || !Array.isArray(status.creds)) return t('profile.summaryUnavailable')
  let totpLabels: string[] = []
  status.creds.forEach((cred) => {
    if (typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_) {
      const detail = cred.type_.PasswordMfa
      const labels = Array.isArray(detail) ? detail[0] : []
      if (Array.isArray(labels)) {
        totpLabels = labels
      }
    }
  })
  if (totpLabels.length === 0) return t('profile.summaryNotSet')
  return t('profile.summarySetWithTags', {
    count: totpLabels.length,
    tags: totpLabels.join(', '),
  })
}

export default function Profile() {
  const { setAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileForm | null>(null)
  const [profileId, setProfileId] = useState<string>('')
  const [initialName, setInitialName] = useState('')
  const [initialDisplayName, setInitialDisplayName] = useState('')
  const [initialEmails, setInitialEmails] = useState<string[]>([])

  const [radiusSecret, setRadiusSecret] = useState<string | null>(null)
  const [radiusMessage, setRadiusMessage] = useState<string | null>(null)
  const [radiusLoading, setRadiusLoading] = useState(false)

  const [credSession, setCredSession] = useState<CUSessionToken | null>(null)
  const [credStatus, setCredStatus] = useState<CUStatus | null>(null)
  const [credMessage, setCredMessage] = useState<string | null>(null)
  const [credLoading, setCredLoading] = useState(false)
  const [credSummary, setCredSummary] = useState<CredentialStatus | null>(null)
  const [credSummaryMessage, setCredSummaryMessage] = useState<string | null>(null)
  const loadRef = useRef(false)
  const [passkeyLabels, setPasskeyLabels] = useState<string[]>([])
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

  const { canEdit, permissions, requestReauth } = useAccess()

  const canEditName = canEdit && permissions.nameAllowed
  const canEditEmail = canEdit && permissions.emailAllowed
  const canEditSelfWrite = canEdit && permissions.selfWriteAllowed
  const hasAnyEditPermission = permissions.nameAllowed || permissions.emailAllowed
  const credentialWarnings = useMemo(
    () => (credStatus ? credStatus.warnings.map((warning) => describeWarning(warning, t)) : []),
    [credStatus, t],
  )
  const passwordConfigured = useMemo(
    () => hasPasswordCredential(credStatus?.primary),
    [credStatus],
  )
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

  useEffect(() => {
    if (loadRef.current) return
    loadRef.current = true

    const load = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const nextProfile = user ? user : await fetchSelfProfile()
        setProfile({
          name: nextProfile.name,
          displayName: nextProfile.displayName,
          emails: nextProfile.emails,
        })
        setProfileId(nextProfile.uuid)
        setInitialEmails(nextProfile.emails)
        setInitialName(nextProfile.name)
        setInitialDisplayName(nextProfile.displayName)
        setPasskeyLabels([...nextProfile.passkeys, ...nextProfile.attestedPasskeys])

        try {
          const summary = await fetchCredentialStatus(nextProfile.uuid)
          setCredSummary(summary)
          setCredSummaryMessage(null)
        } catch (error) {
          setCredSummaryMessage(
            error instanceof Error ? error.message : t('profile.messageCredentialSummaryFailed'),
          )
        }
        try {
          const radius = await fetchRadiusSecret(nextProfile.uuid)
          setRadiusSecret(radius)
        } catch (error) {
          setRadiusMessage(
            error instanceof Error ? error.message : t('profile.messageRadiusLoadFailed'),
          )
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('profile.messageLoadProfileFailed'))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleProfileChange = (field: keyof ProfileForm, value: string) => {
    if (!profile) return
    setProfile({
      ...profile,
      [field]: value,
    })
  }

  const handleEmailChange = (index: number, value: string) => {
    if (!profile) return
    const nextEmails = [...profile.emails]
    nextEmails[index] = value
    setProfile({
      ...profile,
      emails: nextEmails,
    })
  }

  const handleEmailAdd = () => {
    if (!profile) return
    setProfile({
      ...profile,
      emails: [...profile.emails, ''],
    })
  }

  const handleEmailRemove = (index: number) => {
    if (!profile) return
    const nextEmails = profile.emails.filter((_, idx) => idx !== index)
    setProfile({
      ...profile,
      emails: nextEmails,
    })
  }

  const requestReauthIfNeeded = () => {
    if (!canEdit) {
      requestReauth()
    }
  }

  const handleSessionExpiredAfterCommit = () => {
    sessionStorage.setItem(
      'kanidm.login_notice',
      t('login.notice.credentialsUpdated'),
    )
    clearAuthToken()
    navigate('/login', { replace: true })
  }

  const isAuthExpiredError = (error: unknown) => {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return message.includes('401') || message.includes('sessionexpired')
  }

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (!profile || !profileId) return

    if (!canEdit) {
      requestReauth()
      return
    }

    const name = profile.name.trim()
    const displayName = profile.displayName.trim()
    if (!name || !displayName) {
      setMessage(t('profile.messageNameDisplayRequired'))
      return
    }

    const emails = normalizeEmails(profile.emails)
    const emailChanged = !emailsEqual(emails, normalizeEmails(initialEmails))
    const nameChanged = name !== initialName
    const displayNameChanged = displayName !== initialDisplayName

    try {
      await updatePersonProfile({
        id: profileId,
        name: permissions.nameAllowed && nameChanged ? name : undefined,
        displayName: permissions.nameAllowed && displayNameChanged ? displayName : undefined,
        emails: permissions.emailAllowed && emailChanged ? emails : undefined,
      })
      await setAuthenticated()
      setMessage(t('profile.messageProfileUpdated'))
      setInitialEmails(emails)
      setInitialName(name)
      setInitialDisplayName(displayName)
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : t('profile.messageProfileUpdateFailed')
      setMessage(messageText)
    }
  }

  const startCredentialSession = async () => {
    if (!profileId) return
    if (!canEditSelfWrite) {
      requestReauth()
      return
    }
    setPasswordNotice(null)
    setShowPasswordForm(false)
    setCredLoading(true)
    setCredMessage(null)
    try {
      const { session, status } = await beginCredentialUpdate(profileId)
      setCredSession(session)
      setCredStatus(status)
    } catch (error) {
      setCredMessage(
        error instanceof Error ? error.message : t('profile.messageCredentialSessionFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }

  const submitPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!credSession) {
      setCredMessage(t('profile.messageCredentialSessionRequired'))
      return
    }
    if (!password || password !== passwordConfirm) {
      setCredMessage(t('profile.messagePasswordMismatch'))
      return
    }

    setCredLoading(true)
    setCredMessage(null)
    try {
      const status = await sendCredentialUpdate(credSession, {
        password,
      })
      setCredStatus(status)
      setPassword('')
      setPasswordConfirm('')
      setShowPasswordForm(false)
      setPasswordNotice(t('profile.messagePasswordSetNotice'))
      setCredMessage(t('profile.messagePasswordStaged'))
      if (status.warnings.includes('MfaRequired')) {
        await beginTotpEnrollment()
      }
    } catch (error) {
      setCredMessage(error instanceof Error ? error.message : t('profile.messagePasswordUpdateFailed'))
    } finally {
      setCredLoading(false)
    }
  }

  const beginPasskeyEnrollment = async () => {
    if (!credSession) {
      setCredMessage(t('profile.messagePasskeySessionRequired'))
      return
    }

    setCredLoading(true)
    setCredMessage(null)
    try {
      const initStatus = await sendCredentialUpdate(credSession, 'passkeyinit')
      const challenge = extractPasskeyChallenge(initStatus.mfaregstate)
      if (!challenge) {
        throw new Error(t('profile.messagePasskeyChallengeMissing'))
      }
      const registration = await performPasskeyCreation(challenge)
      setPendingPasskey(registration)
      setPasskeyLabel('')
      setPasskeyLabelOpen(true)
    } catch (error) {
      setCredMessage(error instanceof Error ? error.message : t('profile.messagePasskeyEnrollFailed'))
    } finally {
      setCredLoading(false)
    }
  }

  const submitPasskeyLabel = async () => {
    if (!credSession || !pendingPasskey) return
    if (!passkeyLabel.trim()) {
      setCredMessage(t('profile.messagePasskeyLabelRequired'))
      return
    }
    setCredLoading(true)
    setCredMessage(null)
    try {
      const status = await sendCredentialUpdate(credSession, {
        passkeyfinish: [passkeyLabel.trim(), pendingPasskey],
      })
      setCredStatus(status)
      setPasskeyLabel('')
      setPendingPasskey(null)
      setPasskeyLabelOpen(false)
      setCredMessage(t('profile.messagePasskeyEnrolled'))
    } catch (error) {
      setCredMessage(error instanceof Error ? error.message : t('profile.messagePasskeyEnrollFailed'))
    } finally {
      setCredLoading(false)
    }
  }

  const beginTotpEnrollment = async () => {
    if (!credSession) return
    setTotpError(null)
    setTotpSha1Warning(false)
    setTotpLabel('')
    setTotpCode('')
    setTotpModalOpen(true)
    if (!totpPayload) {
      setTotpError(t('profile.messageTotpLoading'))
    }
    setCredLoading(true)
    try {
      const status = await sendCredentialUpdate(credSession, 'totpgenerate')
      const secret = extractTotpSecret(status.mfaregstate)
      if (!secret) {
        throw new Error(t('profile.messageTotpSetupMissing'))
      }
      setTotpPayload(buildTotpPayload(secret))
      setTotpError(null)
      setCredStatus(status)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : t('profile.messageTotpStartFailed'))
    } finally {
      setCredLoading(false)
    }
  }

  const submitTotpEnrollment = async (acceptSha1 = false) => {
    if (!credSession || !totpPayload) return
    if (!acceptSha1) {
      if (!totpLabel.trim() || !totpCode.trim()) {
        setTotpError(t('profile.messageTotpNameCodeRequired'))
        return
      }
    }
    setCredLoading(true)
    setTotpError(null)
    try {
      const status = acceptSha1
        ? await sendCredentialUpdate(credSession, 'totpacceptsha1')
        : await sendCredentialUpdate(credSession, {
            totpverify: [Number(totpCode), totpLabel.trim()],
          })
      if (status.mfaregstate === 'TotpInvalidSha1') {
        setTotpSha1Warning(true)
        setTotpError(t('profile.messageTotpSha1'))
      } else if (status.mfaregstate === 'TotpTryAgain') {
        setTotpError(t('profile.messageTotpTryAgain'))
      } else if (
        status.mfaregstate &&
        typeof status.mfaregstate === 'object' &&
        'TotpNameTryAgain' in status.mfaregstate
      ) {
        setTotpError(
          t('profile.messageTotpNameInvalid', {
            name: status.mfaregstate.TotpNameTryAgain,
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
      setCredStatus(status)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : t('profile.messageTotpAddFailed'))
    } finally {
      setCredLoading(false)
    }
  }

  const cancelTotpEnrollment = async () => {
    if (!credSession) return
    setCredLoading(true)
    setTotpError(null)
    try {
      const status = await sendCredentialUpdate(credSession, 'cancelmfareg')
      setCredStatus(status)
      setTotpModalOpen(false)
      setTotpPayload(null)
      setTotpQr(null)
      setTotpLabel('')
      setTotpCode('')
      setTotpSha1Warning(false)
    } catch (error) {
      setTotpError(
        error instanceof Error ? error.message : t('profile.messageTotpCancelFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }


  const removePasskey = async (uuid: string) => {
    if (!credSession) return
    setCredLoading(true)
    setCredMessage(null)
    try {
      const status = await sendCredentialUpdate(credSession, {
        passkeyremove: uuid,
      })
      setCredStatus(status)
    } catch (error) {
      setCredMessage(error instanceof Error ? error.message : t('profile.messagePasskeyRemoveFailed'))
    } finally {
      setCredLoading(false)
    }
  }

  const commitCredentialChanges = async () => {
    if (!credSession) return
    setCredLoading(true)
    setCredMessage(null)
    try {
      await commitCredentialUpdate(credSession)
      setCredSession(null)
      setCredStatus(null)
      setShowPasswordForm(false)
      setPasswordNotice(null)
      if (profileId) {
        try {
          const summary = await fetchCredentialStatus(profileId)
          setCredSummary(summary)
          const nextProfile = await fetchSelfProfile()
          setPasskeyLabels([...nextProfile.passkeys, ...nextProfile.attestedPasskeys])
          setCredMessage(t('profile.messageCredentialSaved'))
        } catch (error) {
          if (isAuthExpiredError(error)) {
            handleSessionExpiredAfterCommit()
            return
          }
          setCredMessage(
            error instanceof Error ? error.message : t('profile.messageCredentialLoadFailed'),
          )
        }
      } else {
        setCredMessage(t('profile.messageCredentialSaved'))
      }
    } catch (error) {
      setCredMessage(
        error instanceof Error ? error.message : t('profile.messageCredentialSaveFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }

  const cancelCredentialChanges = async () => {
    if (!credSession) return
    setCredLoading(true)
    setCredMessage(null)
    try {
      await cancelCredentialUpdate(credSession)
      setCredSession(null)
      setCredStatus(null)
      setShowPasswordForm(false)
      setPasswordNotice(null)
      if (profileId) {
        const summary = await fetchCredentialStatus(profileId)
        setCredSummary(summary)
        const nextProfile = await fetchSelfProfile()
        setPasskeyLabels([...nextProfile.passkeys, ...nextProfile.attestedPasskeys])
      }
    } catch (error) {
      setCredMessage(
        error instanceof Error ? error.message : t('profile.messageCredentialDiscardFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }

  const regenerateRadius = async () => {
    if (!profileId) return
    if (!canEditSelfWrite) {
      requestReauth()
      return
    }
    setRadiusLoading(true)
    setRadiusMessage(null)
    try {
      const secret = await regenerateRadiusSecret(profileId)
      setRadiusSecret(secret)
    } catch (error) {
      setRadiusMessage(
        error instanceof Error ? error.message : t('profile.messageRadiusRegenerateFailed'),
      )
    } finally {
      setRadiusLoading(false)
    }
  }

  const clearRadius = async () => {
    if (!profileId) return
    if (!canEditSelfWrite) {
      requestReauth()
      return
    }
    setRadiusLoading(true)
    setRadiusMessage(null)
    try {
      await deleteRadiusSecret(profileId)
      setRadiusSecret(null)
    } catch (error) {
      setRadiusMessage(
        error instanceof Error ? error.message : t('profile.messageRadiusDeleteFailed'),
      )
    } finally {
      setRadiusLoading(false)
    }
  }


  if (loading) {
    return (
      <section className="page profile-page">
        <h1>{t('profile.title')}</h1>
        <p className="page-note">{t('profile.loading')}</p>
      </section>
    )
  }

  return (
    <section className="page profile-page">
      <div className="profile-header">
        <div>
          <h1>{t('profile.title')}</h1>
          <p className="page-note">{t('profile.subtitle')}</p>
        </div>
        <div className="profile-status">
        </div>
      </div>

      {message && <p className="feedback">{message}</p>}

      <div className="profile-grid">
        <section className="profile-card">
          <header>
            <h2>{t('profile.personalTitle')}</h2>
            <p>{t('profile.personalDesc')}</p>
          </header>
          {profile && (
            <form onSubmit={handleProfileSave}>
              <label className="field">
                <span>{t('profile.username')}</span>
                <input
                  value={profile.name}
                  onChange={(event) => handleProfileChange('name', event.target.value)}
                  disabled={!permissions.nameAllowed}
                  readOnly={!canEditName && permissions.nameAllowed}
                  onFocus={requestReauthIfNeeded}
                  onClick={requestReauthIfNeeded}
                />
              </label>
              <label className="field">
                <span>{t('profile.displayName')}</span>
                <input
                  value={profile.displayName}
                  onChange={(event) =>
                    handleProfileChange('displayName', event.target.value)
                  }
                  disabled={!permissions.nameAllowed}
                  readOnly={!canEditName && permissions.nameAllowed}
                  onFocus={requestReauthIfNeeded}
                  onClick={requestReauthIfNeeded}
                />
              </label>
              {!permissions.nameAllowed && (
                <p className="muted-text">
                  {t('profile.namePermission')}
                </p>
              )}

              <div className="profile-emails">
                <div className="profile-emails-header">
                  <span>{t('profile.emailsTitle')}</span>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => {
                      if (!canEditEmail && permissions.emailAllowed) {
                        requestReauthIfNeeded()
                        return
                      }
                      handleEmailAdd()
                    }}
                    disabled={!permissions.emailAllowed}
                  >
                    {t('profile.addEmail')}
                  </button>
                </div>
                {!permissions.emailAllowed && (
                  <p className="muted-text">
                    {t('profile.emailPermission')}
                  </p>
                )}
                {profile.emails.length === 0 ? (
                  <p className="muted-text">{t('profile.noEmail')}</p>
                ) : (
                  profile.emails.map((email, index) => (
                    <div key={`${email}-${index}`} className="profile-email-row">
                      <input
                        value={email}
                        onChange={(event) => handleEmailChange(index, event.target.value)}
                        placeholder={t('profile.emailPlaceholder')}
                        disabled={!permissions.emailAllowed}
                        readOnly={!canEditEmail && permissions.emailAllowed}
                        onFocus={requestReauthIfNeeded}
                        onClick={requestReauthIfNeeded}
                      />
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          if (!canEditEmail && permissions.emailAllowed) {
                            requestReauthIfNeeded()
                            return
                          }
                          handleEmailRemove(index)
                        }}
                        disabled={!permissions.emailAllowed}
                      >
                        {t('profile.removeEmail')}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="profile-actions">
                <button type="submit" disabled={!hasAnyEditPermission}>
                  {t('profile.saveChanges')}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('profile.credentialsTitle')}</h2>
            <p>{t('profile.credentialsDesc')}</p>
          </header>

          {!credSession && (
            <div className="credential-summary">
              <div>
                <span className="muted-text">{t('profile.summaryPasskeys')}</span>
                <strong>{summarizePasskeys(passkeyLabels, t)}</strong>
              </div>
              <div>
                <span className="muted-text">{t('profile.summaryPassword')}</span>
                <strong>{summarizePassword(credSummary, t)}</strong>
              </div>
              <div>
                <span className="muted-text">{t('profile.summaryTotp')}</span>
                <strong>{summarizeTotp(credSummary, t)}</strong>
              </div>
            </div>
          )}

          {credSummaryMessage && <p className="feedback">{credSummaryMessage}</p>}

          {!credSession && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void startCredentialSession()
              }}
              disabled={credLoading || !permissions.selfWriteAllowed}
            >
              {t('profile.updateCredentials')}
            </button>
          )}

          {credMessage && <p className="feedback">{credMessage}</p>}

          {credSession && credStatus && (
            <div className="credential-panel">
              <div className="credential-alert">
                <span>{t('profile.editingAlert')}</span>
                {credentialWarnings.length > 0 && (
                  <div>
                    <span className="warning-text">{t('profile.warningsTitle')}</span>
                    <ul className="warning-list">
                      {credentialWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {credStatus.passkeys.length === 0 && (
                  <span className="muted-text">{t('profile.tipPasskey')}</span>
                )}
                {!credStatus.can_commit && (
                  <span className="warning-text">{t('profile.cannotSave')}</span>
                )}
              </div>

              <CredentialSections
                status={credStatus}
                loading={credLoading}
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
                    void cancelCredentialChanges()
                  }}
                  disabled={credLoading}
                >
                  {t('profile.discard')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void commitCredentialChanges()
                  }}
                  disabled={credLoading || !credStatus.can_commit}
                >
                  {t('profile.saveCredentialChanges')}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('profile.radiusTitle')}</h2>
            <p>{t('profile.radiusDesc')}</p>
          </header>

          {radiusMessage && <p className="feedback">{radiusMessage}</p>}

          <div className="radius-panel">
            <div>
              <span className="muted-text">{t('profile.radiusCurrent')}</span>
              <div className="radius-secret">
                {radiusSecret ?? t('profile.radiusNoSecret')}
              </div>
            </div>
            <div className="radius-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void regenerateRadius()
                }}
                disabled={radiusLoading || !permissions.selfWriteAllowed}
              >
                {radiusSecret ? t('profile.radiusRegenerate') : t('profile.radiusGenerate')}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  void clearRadius()
                }}
                disabled={radiusLoading || !radiusSecret || !permissions.selfWriteAllowed}
              >
                {t('profile.radiusRemove')}
              </button>
            </div>
          </div>
        </section>
      </div>

    </section>
  )
}
