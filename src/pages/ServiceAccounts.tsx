import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchServiceAccounts } from '../api'
import type { ServiceAccountSummary } from '../api/serviceAccounts'
import { useAccess } from '../auth/AccessContext'

function normalizeGroupName(group: string) {
  return group.split('@')[0]?.toLowerCase() ?? ''
}

function hasAnyGroup(memberOf: string[], groups: string[]) {
  const allowed = new Set(groups.map((group) => group.toLowerCase()))
  return memberOf.some((entry) => allowed.has(normalizeGroupName(entry)))
}

function isHighPrivilege(memberOf: string[]) {
  return memberOf.some((group) => normalizeGroupName(group) === 'idm_high_privilege')
}

export default function ServiceAccounts() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { memberOf } = useAccess()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<ServiceAccountSummary[]>([])
  const pendingRef = useRef<Promise<ServiceAccountSummary[]> | null>(null)

  const canCreate = useMemo(
    () => hasAnyGroup(memberOf, ['idm_service_account_admins']),
    [memberOf],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage(null)
    if (!pendingRef.current) {
      pendingRef.current = fetchServiceAccounts()
    }
    pendingRef.current
      .then((entries) => {
        if (!active) return
        setAccounts(entries)
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.listFailed'))
      })
      .finally(() => {
        pendingRef.current = null
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filteredAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return accounts
    return accounts.filter((account) => {
      if (account.displayName.toLowerCase().includes(needle)) return true
      if (account.name.toLowerCase().includes(needle)) return true
      if (account.emails.some((email) => email.toLowerCase().includes(needle))) return true
      return false
    })
  }, [accounts, query])

  return (
    <section className="page service-accounts-page">
      <div className="service-accounts-header">
        <div>
          <h1>{t('serviceAccounts.title')}</h1>
          <p className="page-note">{t('serviceAccounts.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="service-accounts-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('/service-accounts/new')}
            >
              {t('serviceAccounts.createCta')}
            </button>
          </div>
        )}
      </div>

      <div className="service-accounts-toolbar">
        <input
          className="service-accounts-search"
          type="search"
          value={query}
          placeholder={t('serviceAccounts.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {message && <p className="feedback">{message}</p>}

      {loading ? (
        <p className="page-note">{t('serviceAccounts.loading')}</p>
      ) : (
        <div className="service-accounts-list">
          {filteredAccounts.length === 0 ? (
            <p className="muted-text">{t('serviceAccounts.empty')}</p>
          ) : (
            filteredAccounts.map((account) => (
              <button
                className="service-accounts-row"
                key={account.uuid}
                type="button"
                onClick={() => navigate(`/service-accounts/${account.uuid}`)}
              >
                <div>
                  <div className="service-accounts-name">
                    <span>{account.displayName}</span>
                    {isHighPrivilege(account.memberOf) && (
                      <span className="badge badge-warn badge-sharp" title={t('shell.highPrivilegeTip')}>
                        {t('shell.highPrivilege')}
                      </span>
                    )}
                  </div>
                  <div className="service-accounts-meta">
                    <span>{account.name}</span>
                    <span>{account.uuid}</span>
                  </div>
                </div>
                <div className="service-accounts-cell">
                  {account.emails.length > 0
                    ? account.emails.join(', ')
                    : t('serviceAccounts.noEmail')}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
}
