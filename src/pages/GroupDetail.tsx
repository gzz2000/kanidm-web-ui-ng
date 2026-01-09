import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  addGroupMembers,
  clearGroupAttr,
  fetchGroup,
  fetchGroupMembers,
  fetchGroupUnixToken,
  removeGroupMembers,
  setGroupAttr,
  setGroupUnix,
} from '../api'
import type { GroupDetail as GroupDetailRecord, UnixGroupToken } from '../api/groups'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import AccountGroupSelect from '../components/AccountGroupSelect'
import { applyDomain, stripDomain } from '../utils/strings'

type GroupForm = {
  name: string
  description: string
  emails: string[]
  entryManagedBy: string
}

type GroupMeta = {
  uuid: string
  memberOf: string[]
  directMemberOf: string[]
  entryManagedBy: string[]
}

function normalizeGroupName(group: string) {
  return group.split('@')[0]?.toLowerCase() ?? ''
}

function hasAnyGroup(memberOf: string[], groups: string[]) {
  const allowed = new Set(groups.map((group) => group.toLowerCase()))
  return memberOf.some((entry) => allowed.has(normalizeGroupName(entry)))
}

function normalizeEmails(emails: string[]) {
  return emails.map((email) => email.trim()).filter(Boolean)
}

function emailsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((email, index) => email === right[index])
}

function isNotFound(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('404') || message.includes('nomatchingentries')
}

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<GroupForm | null>(null)
  const [initialForm, setInitialForm] = useState<GroupForm | null>(null)
  const [groupMeta, setGroupMeta] = useState<GroupMeta | null>(null)
  const [members, setMembers] = useState<string[]>([])
  const [memberValue, setMemberValue] = useState('')
  const [membersMessage, setMembersMessage] = useState<string | null>(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberAdding, setMemberAdding] = useState(false)
  const [memberDeleting, setMemberDeleting] = useState<string | null>(null)
  const [memberConfirm, setMemberConfirm] = useState<string | null>(null)
  const [posixToken, setPosixToken] = useState<UnixGroupToken | null>(null)
  const [posixMessage, setPosixMessage] = useState<string | null>(null)
  const [posixLoading, setPosixLoading] = useState(false)
  const [posixGid, setPosixGid] = useState('')

  const isAccessControlAdmin = useMemo(
    () => hasAnyGroup(memberOf, ['idm_access_control_admins']),
    [memberOf],
  )
  const canManagePosix = useMemo(
    () => hasAnyGroup(memberOf, ['idm_unix_admins']),
    [memberOf],
  )

  const entryManagerMatch = useMemo(() => {
    if (!groupMeta || !user) return false
    const entryManagers = groupMeta.entryManagedBy.map((entry) => entry.toLowerCase())
    if (entryManagers.includes(user.uuid.toLowerCase())) return true
    if (entryManagers.includes(user.name.toLowerCase())) return true
    if (entryManagers.some((entry) => normalizeGroupName(entry) === normalizeGroupName(user.name))) {
      return true
    }
    const userGroups = new Set(memberOf.map(normalizeGroupName))
    if (entryManagers.some((entry) => userGroups.has(normalizeGroupName(entry)))) return true
    return false
  }, [groupMeta, memberOf, user])

  const canEditName = isAccessControlAdmin || entryManagerMatch
  const canEditDescription = isAccessControlAdmin || entryManagerMatch
  const canEditEntryManagedBy = isAccessControlAdmin
  const canEditMail = isAccessControlAdmin || entryManagerMatch
  const canManageMembers = isAccessControlAdmin || entryManagerMatch

  const requestReauthIfNeeded = () => {
    if (
      !canEdit &&
      (canEditName || canEditDescription || canEditEntryManagedBy || canEditMail || canManageMembers)
    ) {
      requestReauth()
    }
  }

  const setFormState = (group: GroupDetailRecord) => {
    const entryManagedBy = group.entryManagedBy[0] ?? ''
    const nextForm: GroupForm = {
      name: group.name,
      description: group.description ?? '',
      emails: group.emails,
      entryManagedBy: stripDomain(entryManagedBy),
    }
    setForm(nextForm)
    setInitialForm(nextForm)
    setGroupMeta({
      uuid: group.uuid,
      memberOf: group.memberOf,
      directMemberOf: group.directMemberOf,
      entryManagedBy: group.entryManagedBy,
    })
  }

  const loadMembers = async (groupId: string) => {
    setMembersLoading(true)
    try {
      const entries = await fetchGroupMembers(groupId)
      setMembers(entries)
      setMembersMessage(null)
    } catch (error) {
      setMembersMessage(
        error instanceof Error ? error.message : t('groups.messages.membersLoadFailed'),
      )
    } finally {
      setMembersLoading(false)
    }
  }

  const loadPosix = async (groupId: string) => {
    try {
      const token = await fetchGroupUnixToken(groupId)
      setPosixToken(token)
      setPosixGid(token.gidnumber ? String(token.gidnumber) : '')
    } catch (error) {
      if (isNotFound(error)) {
        setPosixToken(null)
        setPosixGid('')
      } else {
        setPosixMessage(
          error instanceof Error ? error.message : t('groups.messages.posixLoadFailed'),
        )
      }
    }
  }

  useEffect(() => {
    if (!id) {
      navigate('/groups', { replace: true })
      return
    }

    let active = true
    const load = async () => {
      setLoading(true)
      setMessage(null)
      setMembersMessage(null)
      setPosixMessage(null)
      try {
        const group = await fetchGroup(id)
        if (!active) return
        if (!group) {
          setMessage(t('groups.detail.notFound'))
          return
        }
        setFormState(group)
        if (group.uuid && group.uuid !== id) {
          navigate(`/groups/${group.uuid}`, { replace: true })
        }
        await Promise.all([loadMembers(group.uuid), loadPosix(group.uuid)])
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('groups.messages.loadFailed'))
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [id, navigate, t])

  const handleIdentitySubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !initialForm || !groupMeta) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setMessage(null)
    const nameChanged = form.name.trim() !== initialForm.name
    const descriptionChanged = form.description.trim() !== initialForm.description
    const entryManagerChanged = form.entryManagedBy !== initialForm.entryManagedBy

    if ((nameChanged && !canEditName) || (descriptionChanged && !canEditDescription)) {
      setMessage(t('groups.detail.identityPermission'))
      return
    }

    if (!nameChanged && !descriptionChanged && !entryManagerChanged) {
      setMessage(t('groups.messages.identityNoChanges'))
      return
    }

    try {
      if (nameChanged) {
        await setGroupAttr(groupMeta.uuid, 'name', [form.name.trim()])
      }
      if (descriptionChanged) {
        const nextDesc = form.description.trim()
        if (nextDesc) {
          await setGroupAttr(groupMeta.uuid, 'description', [nextDesc])
        } else {
          await clearGroupAttr(groupMeta.uuid, 'description')
        }
      }
      if (entryManagerChanged && canEditEntryManagedBy) {
        const nextEntryManager = applyDomain(form.entryManagedBy.trim(), domainSuffix)
        if (nextEntryManager) {
          await setGroupAttr(groupMeta.uuid, 'entry_managed_by', [nextEntryManager])
        } else {
          await clearGroupAttr(groupMeta.uuid, 'entry_managed_by')
        }
      } else if (entryManagerChanged && !canEditEntryManagedBy) {
        setMessage(t('groups.detail.entryManagerLocked'))
        return
      }
      const refreshed = await fetchGroup(groupMeta.uuid)
      if (refreshed) {
        setFormState(refreshed)
      }
      setMessage(t('groups.messages.identityUpdated'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('groups.messages.identityFailed'))
    }
  }

  const handleMailSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !initialForm || !groupMeta) return
    if (!canEdit) {
      requestReauth()
      return
    }
    if (!canEditMail) {
      setMessage(t('groups.detail.mailPermission'))
      return
    }
    setMessage(null)
    const emails = normalizeEmails(form.emails)
    const initialEmails = normalizeEmails(initialForm.emails)
    if (emailsEqual(emails, initialEmails)) {
      setMessage(t('groups.messages.mailNoChanges'))
      return
    }
    try {
      if (emails.length > 0) {
        await setGroupAttr(groupMeta.uuid, 'mail', emails)
      } else {
        await clearGroupAttr(groupMeta.uuid, 'mail')
      }
      const refreshed = await fetchGroup(groupMeta.uuid)
      if (refreshed) {
        setFormState(refreshed)
      }
      setMessage(t('groups.messages.mailUpdated'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('groups.messages.mailFailed'))
    }
  }

  const handleMemberAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupMeta) return
    if (!canManageMembers) {
      setMembersMessage(t('groups.messages.membersPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const nextMember = memberValue.trim()
    if (!nextMember) {
      setMembersMessage(t('groups.messages.memberRequired'))
      return
    }
    setMemberAdding(true)
    setMembersMessage(null)
    try {
      await addGroupMembers(groupMeta.uuid, [nextMember])
      setMemberValue('')
      await loadMembers(groupMeta.uuid)
    } catch (error) {
      setMembersMessage(
        error instanceof Error ? error.message : t('groups.messages.memberAddFailed'),
      )
    } finally {
      setMemberAdding(false)
    }
  }

  const handleMemberRemove = async (member: string) => {
    if (!groupMeta) return
    if (!canManageMembers) {
      setMembersMessage(t('groups.messages.membersPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    setMemberDeleting(member)
    setMembersMessage(null)
    try {
      await removeGroupMembers(groupMeta.uuid, [member])
      await loadMembers(groupMeta.uuid)
    } catch (error) {
      setMembersMessage(
        error instanceof Error ? error.message : t('groups.messages.memberRemoveFailed'),
      )
    } finally {
      setMemberDeleting(null)
      setMemberConfirm(null)
    }
  }

  const handlePosixSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupMeta) return
    if (!canManagePosix) {
      setPosixMessage(t('groups.messages.posixPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const gidTrimmed = posixGid.trim()
    let gid: number | undefined
    if (gidTrimmed) {
      gid = Number(gidTrimmed)
      if (!Number.isInteger(gid) || gid <= 0) {
        setPosixMessage(t('groups.messages.posixGidInvalid'))
        return
      }
    }
    setPosixLoading(true)
    setPosixMessage(null)
    try {
      await setGroupUnix(groupMeta.uuid, { gidnumber: gid })
      await loadPosix(groupMeta.uuid)
      setPosixMessage(t('groups.messages.posixUpdated'))
    } catch (error) {
      setPosixMessage(
        error instanceof Error ? error.message : t('groups.messages.posixFailed'),
      )
    } finally {
      setPosixLoading(false)
    }
  }

  const domainSuffix = useMemo(() => {
    const value = form?.entryManagedBy ?? ''
    if (value.includes('@')) {
      return value.split('@')[1] ?? null
    }
    for (const entry of memberOf) {
      const parts = entry.split('@')
      if (parts.length > 1 && parts[1]) {
        return parts[1]
      }
    }
    return null
  }, [form?.entryManagedBy, memberOf])

  const entryManagedByDisplay = groupMeta?.entryManagedBy.length
    ? groupMeta.entryManagedBy.map(stripDomain).join(', ')
    : t('groups.detail.entryManagerNone')

  if (loading) {
    return (
      <section className="page groups-page">
        <h1>{t('groups.title')}</h1>
        <p className="page-note">{t('groups.detail.loading')}</p>
      </section>
    )
  }

  if (!form || !groupMeta) {
    return (
      <section className="page groups-page">
        <h1>{t('groups.title')}</h1>
        <p className="page-note">{message ?? t('groups.detail.notFound')}</p>
      </section>
    )
  }

  return (
    <section className="page groups-page">
      <div className="groups-header">
        <div>
          <h1>{t('groups.detail.title', { name: form.name })}</h1>
          <p className="page-note">{t('groups.detail.subtitle')}</p>
        </div>
        <div className="groups-actions">
          <button className="secondary-button" type="button" onClick={() => navigate('/groups')}>
            {t('groups.backToList')}
          </button>
        </div>
      </div>

      {message && <p className="feedback">{message}</p>}

      <div className="profile-grid">
        <section className="profile-card">
          <header>
            <h2>{t('groups.detail.identityTitle')}</h2>
            <p>{t('groups.detail.identityDesc')}</p>
          </header>
          {!canEditName && !canEditDescription && !canEditEntryManagedBy && (
            <p className="muted-text">{t('groups.detail.identityPermission')}</p>
          )}
          <form className="stacked-form" onSubmit={handleIdentitySubmit}>
            <div className="field">
              <label>{t('groups.detail.groupName')}</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                disabled={!canEditName}
                readOnly={canEditName && !canEdit}
                onFocus={requestReauthIfNeeded}
              />
            </div>
            <div className="field">
              <label>{t('groups.detail.description')}</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                disabled={!canEditDescription}
                readOnly={canEditDescription && !canEdit}
                onFocus={requestReauthIfNeeded}
                placeholder={t('groups.detail.descriptionPlaceholder')}
              />
            </div>
            <div className="field">
              <label>{t('groups.detail.entryManagedBy')}</label>
              {canEditEntryManagedBy ? (
                <AccountGroupSelect
                  value={form.entryManagedBy}
                  disabled={!canEditEntryManagedBy}
                  readOnly={!canEdit}
                  includePeople
                  includeGroups
                  includeServiceAccounts
                  onFocus={requestReauthIfNeeded}
                  onChange={(value) => setForm({ ...form, entryManagedBy: value })}
                />
              ) : (
                <input value={entryManagedByDisplay} disabled />
              )}
              {!canEditEntryManagedBy && (
                <p className="muted-text">{t('groups.detail.entryManagerLocked')}</p>
              )}
            </div>
            <div className="profile-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!canEditName && !canEditDescription && !canEditEntryManagedBy}
              >
                {t('groups.detail.saveIdentity')}
              </button>
            </div>
          </form>
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('groups.detail.membersTitle')}</h2>
            <p>{t('groups.detail.membersDesc')}</p>
          </header>
          {membersMessage && <p className="feedback">{membersMessage}</p>}
          {!canManageMembers && (
            <p className="muted-text">{t('groups.detail.membersPermission')}</p>
          )}
          <form className="stacked-form" onSubmit={handleMemberAdd}>
            <div className="field">
              <label>{t('groups.detail.memberAdd')}</label>
              <AccountGroupSelect
                value={memberValue}
                disabled={!canManageMembers}
                readOnly={canManageMembers && !canEdit}
                includePeople
                includeGroups
                includeServiceAccounts
                onFocus={requestReauthIfNeeded}
                onChange={setMemberValue}
              />
            </div>
            <div className="profile-actions">
              <button className="primary-button" type="submit" disabled={!canManageMembers || memberAdding}>
                {memberAdding ? t('groups.detail.memberAdding') : t('groups.detail.memberAdd')}
              </button>
            </div>
          </form>
          {membersLoading ? (
            <p className="muted-text">{t('groups.detail.membersLoading')}</p>
          ) : (
            <div className="person-group-list">
              <span className="muted-text">{t('groups.detail.membersTitle')}</span>
              <div className="person-group-tags">
                {members.length === 0 ? (
                  <span className="muted-text">{t('groups.detail.membersEmpty')}</span>
                ) : (
                  members.map((member) => (
                    canManageMembers ? (
                      <button
                        className="badge badge-button"
                        type="button"
                        key={member}
                        onClick={() => setMemberConfirm(member)}
                        disabled={memberDeleting === member}
                      >
                        {stripDomain(member)}
                      </button>
                    ) : (
                      <span className="badge" key={member}>
                        {stripDomain(member)}
                      </span>
                    )
                  ))
                )}
              </div>
              {canManageMembers && memberConfirm && (
                <div className="ssh-confirm">
                  <span className="muted-text">
                    {t('groups.detail.memberRemoveConfirm', { name: stripDomain(memberConfirm) })}
                  </span>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleMemberRemove(memberConfirm)}
                    disabled={memberDeleting === memberConfirm}
                  >
                    {t('groups.detail.memberRemove')}
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => setMemberConfirm(null)}
                    disabled={memberDeleting === memberConfirm}
                  >
                    {t('groups.detail.memberCancel')}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('groups.detail.mailTitle')}</h2>
            <p>{t('groups.detail.mailDesc')}</p>
          </header>
          {!canEditMail && (
            <p className="muted-text">{t('groups.detail.mailPermission')}</p>
          )}
          <form className="stacked-form" onSubmit={handleMailSubmit}>
            <div className="profile-emails">
              <div className="profile-emails-header">
                <span>{t('groups.detail.mailTitle')}</span>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => setForm({ ...form, emails: [...form.emails, ''] })}
                  disabled={!canEditMail}
                >
                  {t('groups.detail.mailAdd')}
                </button>
              </div>
              {form.emails.length === 0 ? (
                <p className="muted-text">{t('groups.detail.mailEmpty')}</p>
              ) : (
                form.emails.map((email, index) => (
                  <div className="profile-email-row" key={`${email}-${index}`}>
                    <input
                      value={email}
                      onChange={(event) => {
                        const nextEmails = [...form.emails]
                        nextEmails[index] = event.target.value
                        setForm({ ...form, emails: nextEmails })
                      }}
                      disabled={!canEditMail}
                      readOnly={canEditMail && !canEdit}
                      onFocus={requestReauthIfNeeded}
                      placeholder={t('groups.detail.mailPlaceholder')}
                    />
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        const nextEmails = form.emails.filter((_, idx) => idx !== index)
                        setForm({ ...form, emails: nextEmails })
                      }}
                      disabled={!canEditMail}
                    >
                      {t('groups.detail.mailRemove')}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="profile-actions">
              <button className="primary-button" type="submit" disabled={!canEditMail}>
                {t('groups.detail.mailSave')}
              </button>
            </div>
          </form>
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('groups.detail.posixTitle')}</h2>
            <p>{t('groups.detail.posixDesc')}</p>
          </header>
          {!canManagePosix && (
            <p className="muted-text">{t('groups.detail.posixNoPermission')}</p>
          )}
          {posixMessage && <p className="feedback">{posixMessage}</p>}
          <div className="credential-summary">
            {posixToken ? (
              <span>
                {t('groups.detail.posixEnabled', {
                  gid: posixToken.gidnumber,
                })}
              </span>
            ) : (
              <span>{t('groups.detail.posixDisabled')}</span>
            )}
          </div>
          <form className="stacked-form" onSubmit={handlePosixSubmit}>
            <div className="field">
              <label>{t('groups.detail.gidNumber')}</label>
              <input
                value={posixGid}
                onChange={(event) => setPosixGid(event.target.value)}
                disabled={!canManagePosix}
                readOnly={canManagePosix && !canEdit}
                onFocus={requestReauthIfNeeded}
                placeholder={t('groups.detail.gidPlaceholder')}
              />
            </div>
            <div className="profile-actions">
              <button className="primary-button" type="submit" disabled={!canManagePosix || posixLoading}>
                {posixLoading ? t('groups.detail.posixSaving') : t('groups.detail.posixSave')}
              </button>
            </div>
          </form>
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('groups.detail.membershipsTitle')}</h2>
            <p>{t('groups.detail.membershipsDesc')}</p>
          </header>
          <div className="person-groups">
            <div className="person-group-list">
              <span className="muted-text">{t('groups.detail.directMemberships')}</span>
              <div className="person-group-tags">
                {groupMeta.directMemberOf.length === 0 ? (
                  <span className="muted-text">{t('groups.detail.directMembershipsNone')}</span>
                ) : (
                  groupMeta.directMemberOf.map((entry) => (
                    <span className="badge" key={`direct-${entry}`}>
                      {stripDomain(entry)}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="person-group-list">
              <span className="muted-text">{t('groups.detail.inheritedMemberships')}</span>
              <div className="person-group-tags">
                {groupMeta.memberOf.length === 0 ? (
                  <span className="muted-text">{t('groups.detail.inheritedMembershipsNone')}</span>
                ) : (
                  groupMeta.memberOf
                    .filter((entry) => !groupMeta.directMemberOf.includes(entry))
                    .map((entry) => (
                      <span className="badge" key={`inherited-${entry}`}>
                        {stripDomain(entry)}
                      </span>
                    ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  )
}
