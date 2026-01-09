import type { components, paths } from './schema'
import { apiRequest } from './client'
import { request } from './http'

type Entry = components['schemas']['Entry']
type GroupListResponse = paths['/v1/group']['get']['responses'][200]['content']['application/json']
type GroupDetailResponse = paths['/v1/group/{id}']['get']['responses'][200]['content']['application/json']
type GroupSearchResponse =
  paths['/v1/group/_search/{id}']['get']['responses'][200]['content']['application/json']
type UnixGroupToken = components['schemas']['UnixGroupToken']

type GroupSummary = {
  uuid: string
  name: string
  displayName: string
  description: string | null
  memberOf: string[]
  entryManagedBy: string[]
}

type GroupDetail = {
  uuid: string
  name: string
  displayName: string
  description: string | null
  emails: string[]
  memberOf: string[]
  directMemberOf: string[]
  entryManagedBy: string[]
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
}

function listAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) ? value : []
}

function parseGroup(entry: Entry): GroupSummary {
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    description: firstAttr(entry, 'description') || null,
    memberOf: listAttr(entry, 'memberof'),
    entryManagedBy: listAttr(entry, 'entry_managed_by'),
  }
}

function parseGroupDetail(entry: Entry): GroupDetail {
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    description: firstAttr(entry, 'description') || null,
    emails: listAttr(entry, 'mail'),
    memberOf: listAttr(entry, 'memberof'),
    directMemberOf: listAttr(entry, 'directmemberof'),
    entryManagedBy: listAttr(entry, 'entry_managed_by'),
  }
}

export async function fetchGroups(): Promise<GroupSummary[]> {
  const entries = await apiRequest('/v1/group', 'get')
  return (entries as GroupListResponse).map(parseGroup)
}

export async function searchGroups(query: string): Promise<GroupSummary[]> {
  const entries = await apiRequest(`/v1/group/_search/${encodeURIComponent(query)}`, 'get')
  return (entries as GroupSearchResponse).map(parseGroup)
}

export async function fetchGroup(id: string): Promise<GroupDetail | null> {
  const entry = await apiRequest(`/v1/group/${encodeURIComponent(id)}`, 'get')
  if (!entry) return null
  return parseGroupDetail(entry as GroupDetailResponse)
}

export async function createGroup(input: { name: string; entryManagedBy?: string }) {
  const attrs: Record<string, string[]> = {
    name: [input.name],
  }
  if (input.entryManagedBy) {
    attrs.entry_managed_by = [input.entryManagedBy]
  }
  await apiRequest('/v1/group', 'post', {
    body: {
      attrs,
    },
  })
}

export async function setGroupAttr(id: string, attr: string, values: string[]) {
  await apiRequest(`/v1/group/${encodeURIComponent(id)}/_attr/${attr}`, 'put', {
    body: values,
  })
}

export async function clearGroupAttr(id: string, attr: string) {
  await apiRequest(`/v1/group/${encodeURIComponent(id)}/_attr/${attr}`, 'delete')
}

export async function fetchGroupMembers(id: string): Promise<string[]> {
  const entries = await apiRequest(`/v1/group/${encodeURIComponent(id)}/_attr/member`, 'get')
  return Array.isArray(entries) ? entries : []
}

export async function addGroupMembers(id: string, members: string[]) {
  await apiRequest(`/v1/group/${encodeURIComponent(id)}/_attr/member`, 'post', {
    body: members,
  })
}

export async function removeGroupMembers(id: string, members: string[]) {
  await request(`/v1/group/${encodeURIComponent(id)}/_attr/member`, {
    method: 'DELETE',
    body: JSON.stringify(members),
  })
}

export async function fetchGroupUnixToken(id: string): Promise<UnixGroupToken> {
  return request(`/v1/group/${encodeURIComponent(id)}/_unix/_token`, {
    method: 'GET',
  })
}

export async function setGroupUnix(id: string, input: { gidnumber?: number }) {
  await apiRequest(`/v1/group/${encodeURIComponent(id)}/_unix`, 'post', {
    body: input,
  })
}

export type { GroupDetail, GroupSummary, UnixGroupToken }
