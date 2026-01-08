import { apiRequest } from './client'
import type { components, paths } from './schema'

type WhoamiResponse = paths['/v1/whoami']['get']['responses'][200]['content']['application/json']

type Entry = WhoamiResponse['youare']

type UserProfile = {
  name: string
  displayName: string
}

export type UserAuthToken = components['schemas']['UserAuthToken']

export type SelfProfile = {
  uuid: string
  name: string
  displayName: string
  emails: string[]
  passkeys: string[]
  attestedPasskeys: string[]
  memberOf: string[]
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
}

function listAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) ? value : []
}

export async function fetchWhoami(): Promise<UserProfile> {
  const response = await apiRequest('/v1/self', 'get')
  const entry = response.youare
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    name,
    displayName,
  }
}

export async function fetchSelfProfile(): Promise<SelfProfile> {
  const response = await apiRequest('/v1/self', 'get')
  const entry = response.youare
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    emails: listAttr(entry, 'mail'),
    passkeys: listAttr(entry, 'passkeys'),
    attestedPasskeys: listAttr(entry, 'attested_passkeys'),
    memberOf: listAttr(entry, 'memberof'),
  }
}

export async function fetchUserAuthToken(): Promise<UserAuthToken> {
  return apiRequest('/v1/self/_uat', 'get')
}

export async function updatePersonProfile(input: {
  id: string
  name?: string
  displayName?: string
  emails?: string[]
}) {
  const attrs: Record<string, string[]> = {}

  if (input.name) {
    attrs.name = [input.name]
  }
  if (input.displayName) {
    attrs.displayname = [input.displayName]
  }
  if (input.emails && input.emails.length > 0) {
    attrs.mail = input.emails
  }

  if (Object.keys(attrs).length > 0) {
    await apiRequest(`/v1/person/${input.id}`, 'patch', {
      body: {
        attrs,
      },
    })
  }

  if (input.emails && input.emails.length === 0) {
    await apiRequest(`/v1/person/${input.id}/_attr/mail`, 'delete')
  }
}

export async function fetchRadiusSecret(personId: string): Promise<string | null> {
  return apiRequest(`/v1/person/${personId}/_radius`, 'get') as Promise<
    string | null
  >
}

export async function regenerateRadiusSecret(personId: string): Promise<string> {
  return apiRequest(`/v1/person/${personId}/_radius`, 'post') as Promise<string>
}

export async function deleteRadiusSecret(personId: string): Promise<void> {
  await apiRequest(`/v1/person/${personId}/_radius`, 'delete')
}
