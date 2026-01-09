export type CredentialStatusLike = {
  creds?: Array<{ type_: unknown }>
} | null | undefined

export type SummaryState = 'unavailable' | 'notSet' | 'set'

export type SummaryWithLabels = {
  state: SummaryState
  labels: string[]
}

export function hasPasswordCredential(status: CredentialStatusLike) {
  if (!status || !Array.isArray(status.creds)) return false
  return status.creds.some((cred) => {
    if (cred.type_ === 'Password' || cred.type_ === 'GeneratedPassword') return true
    return typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_
  })
}

export function getPasswordState(status: CredentialStatusLike): SummaryState {
  if (!status || !Array.isArray(status.creds)) return 'unavailable'
  return hasPasswordCredential(status) ? 'set' : 'notSet'
}

export function getTotpSummary(status: CredentialStatusLike): SummaryWithLabels {
  if (!status || !Array.isArray(status.creds)) {
    return { state: 'unavailable', labels: [] }
  }
  let totpLabels: string[] = []
  status.creds.forEach((cred) => {
    if (typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_) {
      const detail = (cred.type_ as { PasswordMfa?: unknown }).PasswordMfa
      const labels = Array.isArray(detail) ? detail[0] : []
      if (Array.isArray(labels)) {
        totpLabels = labels
      }
    }
  })
  if (totpLabels.length === 0) {
    return { state: 'notSet', labels: [] }
  }
  return { state: 'set', labels: totpLabels }
}

export function getPasskeySummary(labels: string[] | null | undefined): SummaryWithLabels {
  if (labels === null || labels === undefined) {
    return { state: 'unavailable', labels: [] }
  }
  if (labels.length === 0) {
    return { state: 'notSet', labels: [] }
  }
  return { state: 'set', labels }
}
