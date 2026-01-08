import type { components } from './schema'
import { apiRequest } from './client'

type ScimEntry = components['schemas']['ScimEntry']

export type SshPublicKey = {
  label: string
  value: string
}

function parseSshPublicKeys(value: unknown): SshPublicKey[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const label = record.label
      const keyValue = record.value
      if (typeof label !== 'string' || typeof keyValue !== 'string') return null
      return { label, value: keyValue }
    })
    .filter((entry): entry is SshPublicKey => Boolean(entry))
}

function extractSshPublicKeys(entry: ScimEntry): SshPublicKey[] {
  const record = entry as Record<string, unknown>
  const candidates = ['ssh_publickey', 'sshpublickey', 'sshPublicKey']
  for (const key of candidates) {
    const parsed = parseSshPublicKeys(record[key])
    if (parsed.length > 0) {
      return parsed
    }
  }
  return []
}

export async function fetchSshPublicKeys(personId: string): Promise<SshPublicKey[]> {
  const entry = await apiRequest(`/scim/v1/Person/${personId}`, 'get')
  return extractSshPublicKeys(entry as ScimEntry)
}

export async function addSshPublicKey(personId: string, label: string, value: string) {
  await apiRequest(`/v1/person/${personId}/_ssh_pubkeys`, 'post', {
    body: [label, value],
  })
}

export async function deleteSshPublicKey(personId: string, label: string) {
  const encodedLabel = encodeURIComponent(label)
  await apiRequest(`/v1/person/${personId}/_ssh_pubkeys/${encodedLabel}`, 'delete')
}
