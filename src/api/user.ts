import { apiRequest } from './client'
import type { paths } from './schema'

type WhoamiResponse = paths['/v1/whoami']['get']['responses'][200]['content']['application/json']

type Entry = WhoamiResponse['youare']

type UserProfile = {
  name: string
  displayName: string
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
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
