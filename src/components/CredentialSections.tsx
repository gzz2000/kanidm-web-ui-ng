import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { components } from '../api/schema'

type CUStatus = components['schemas']['CUStatus']

type Props = {
  status: CUStatus
  loading: boolean
  showPasswordForm: boolean
  password: string
  passwordConfirm: string
  passwordButtonLabel: string
  passwordHelper: string
  passwordNotice?: string | null
  passkeyLabelOpen: boolean
  passkeyLabel: string
  totpModalOpen: boolean
  totpPayload: { uri: string } | null
  totpQr: string | null
  totpError: string | null
  totpLabel: string
  totpCode: string
  totpSha1Warning: boolean
  onBeginPasskeyEnrollment: () => void
  onRemovePasskey: (uuid: string) => void
  onTogglePasswordForm: () => void
  onPasswordChange: (value: string) => void
  onPasswordConfirmChange: (value: string) => void
  onPasswordSubmit: (event: FormEvent) => void
  onBeginTotpEnrollment: () => void
  onPasskeyLabelChange: (value: string) => void
  onPasskeyLabelCancel: () => void
  onPasskeyLabelSave: () => void
  onTotpLabelChange: (value: string) => void
  onTotpCodeChange: (value: string) => void
  onTotpCopyUri: () => Promise<void> | void
  onTotpCancel: () => void
  onTotpAcceptSha1: () => void
  onTotpSubmit: () => void
}

export default function CredentialSections({
  status,
  loading,
  showPasswordForm,
  password,
  passwordConfirm,
  passwordButtonLabel,
  passwordHelper,
  passwordNotice,
  passkeyLabelOpen,
  passkeyLabel,
  totpModalOpen,
  totpPayload,
  totpQr,
  totpError,
  totpLabel,
  totpCode,
  totpSha1Warning,
  onBeginPasskeyEnrollment,
  onRemovePasskey,
  onTogglePasswordForm,
  onPasswordChange,
  onPasswordConfirmChange,
  onPasswordSubmit,
  onBeginTotpEnrollment,
  onPasskeyLabelChange,
  onPasskeyLabelCancel,
  onPasskeyLabelSave,
  onTotpLabelChange,
  onTotpCodeChange,
  onTotpCopyUri,
  onTotpCancel,
  onTotpAcceptSha1,
  onTotpSubmit,
}: Props) {
  const { t } = useTranslation()
  const showTotpPrompt = status.warnings.includes('MfaRequired')
  const [copyTip, setCopyTip] = useState(false)
  const copyTimeout = useRef<number | null>(null)
  const totpLabels = (() => {
    const detail = status.primary?.type_
    if (detail && typeof detail === 'object' && 'PasswordMfa' in detail) {
      const labels = Array.isArray(detail.PasswordMfa) ? detail.PasswordMfa[0] : []
      return Array.isArray(labels) ? labels : []
    }
    return []
  })()
  const totpSummary =
    totpLabels.length > 0
      ? t('profile.summarySetWithTags', { count: totpLabels.length, tags: totpLabels.join(', ') })
      : t('profile.summaryNotSet')

  const handleCopy = async () => {
    await onTotpCopyUri()
    setCopyTip(true)
    if (copyTimeout.current !== null) {
      window.clearTimeout(copyTimeout.current)
    }
    copyTimeout.current = window.setTimeout(() => {
      setCopyTip(false)
    }, 2000)
  }

  return (
    <>
      <div className="credential-section">
        <div className="section-header">
          <div>
            <h3>{t('credentials.passkeyTitle')}</h3>
            <p className="muted-text">{t('credentials.passkeyDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onBeginPasskeyEnrollment()
            }}
            disabled={loading}
          >
            {t('credentials.enrollPasskey')}
          </button>
        </div>
        {status.passkeys.length > 0 ? (
          <ul className="passkey-list">
            {status.passkeys.map((passkey) => (
              <li key={passkey.uuid}>
                <div>
                  <span className="passkey-tag">{passkey.tag}</span>
                  <span className="muted-text">{passkey.uuid}</span>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onRemovePasskey(passkey.uuid)}
                  disabled={loading}
                >
                  {t('credentials.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-text">{t('credentials.noPasskeys')}</p>
        )}
      </div>

      <div className="credential-section">
        <div className="section-header">
          <div>
            <h3>{t('credentials.passwordTitle')}</h3>
            <p className="muted-text">{passwordHelper}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={onTogglePasswordForm}
            disabled={loading}
          >
            {passwordButtonLabel}
          </button>
        </div>
        <div className="credential-status-row">
          <span className="muted-text">{t('credentials.totpStatus')}</span>
          <span>{totpSummary}</span>
        </div>
        {passwordNotice && <p className="muted-text">{passwordNotice}</p>}
        {showPasswordForm && (
          <form onSubmit={onPasswordSubmit} className="stacked-form">
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(event) => onPasswordConfirmChange(event.target.value)}
              />
            </label>
            <button type="submit" disabled={loading}>
              {t('credentials.stagePasswordUpdate')}
            </button>
            {showTotpPrompt && (
              <button
                type="button"
                className="ghost-button"
                onClick={onBeginTotpEnrollment}
                disabled={loading}
              >
                {t('credentials.enrollTotp')}
              </button>
            )}
          </form>
        )}
      </div>

      {passkeyLabelOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <header>
              <h3>{t('credentials.passkeyModalTitle')}</h3>
              <p>{t('credentials.passkeyModalDesc')}</p>
            </header>
            <label className="field">
              <span>{t('credentials.passkeyLabel')}</span>
              <input
                value={passkeyLabel}
                onChange={(event) => onPasskeyLabelChange(event.target.value)}
                placeholder={t('credentials.passkeyLabelPlaceholder')}
              />
            </label>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={onPasskeyLabelCancel}>
                {t('credentials.passkeyCancel')}
              </button>
              <button type="button" onClick={onPasskeyLabelSave} disabled={loading}>
                {t('credentials.passkeySave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {totpModalOpen && (
        <div className="modal-backdrop">
          <div className="modal totp-modal">
            <header>
              <h3>{t('credentials.totpModalTitle')}</h3>
              <p>{t('credentials.totpModalDesc')}</p>
            </header>
            {totpPayload && (
              <div className="totp-grid">
                <div className="totp-qr">
                  {totpQr ? (
                    <img src={totpQr} alt={t('credentials.totpQrAlt')} />
                  ) : (
                    <div className="muted-text">{t('credentials.totpQrUnavailable')}</div>
                  )}
                </div>
                <div className="totp-details">
                  <div className="totp-detail">
                    <span>{t('credentials.totpUri')}</span>
                    <code>{totpPayload.uri}</code>
                  </div>
                  <div className="copy-row">
                    <button className="ghost-button" type="button" onClick={handleCopy}>
                      {t('credentials.copyUri')}
                    </button>
                    {copyTip && <span className="copy-tip">{t('credentials.copied')}</span>}
                  </div>
                </div>
              </div>
            )}
            {totpError && <p className="feedback">{totpError}</p>}
            <form
              className="stacked-form"
              onSubmit={(event) => {
                event.preventDefault()
                onTotpSubmit()
              }}
            >
              <label className="field">
                <span>{t('credentials.totpLabel')}</span>
                <input
                  value={totpLabel}
                  onChange={(event) => onTotpLabelChange(event.target.value)}
                  placeholder={t('credentials.totpLabelPlaceholder')}
                />
              </label>
              <label className="field">
                <span>{t('credentials.totpCode')}</span>
                <input
                  value={totpCode}
                  onChange={(event) => onTotpCodeChange(event.target.value)}
                  inputMode="numeric"
                  placeholder={t('credentials.totpCodePlaceholder')}
                />
              </label>
              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={onTotpCancel}>
                  {t('credentials.totpCancel')}
                </button>
                {totpSha1Warning && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onTotpAcceptSha1}
                    disabled={loading}
                  >
                    {t('credentials.totpAcceptSha1')}
                  </button>
                )}
                <button type="submit" disabled={loading}>
                  {t('credentials.totpAdd')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
