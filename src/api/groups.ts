import type { components, paths } from './schema'
import { apiRequest } from './client'

type Entry = components['schemas']['Entry']
type GroupListResponse = paths['/v1/group']['get']['responses'][200]['content']['application/json']

type GroupSummary = {
  uuid: string
  name: string
  displayName: string
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
}

function parseGroup(entry: Entry): GroupSummary {
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
  }
}

export async function fetchGroups(): Promise<GroupSummary[]> {
  const entries = await apiRequest('/v1/group', 'get')
  return (entries as GroupListResponse).map(parseGroup)
}

export type { GroupSummary }
