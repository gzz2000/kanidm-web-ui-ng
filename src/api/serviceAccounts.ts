import type { components, paths } from './schema'
import { apiRequest } from './client'
import { request } from './http'

type Entry = components['schemas']['Entry']
type ServiceAccountListResponse =
  paths['/v1/service_account']['get']['responses'][200]['content']['application/json']
type ServiceAccountDetailResponse =
  paths['/v1/service_account/{id}']['get']['responses'][200]['content']['application/json']

type CredentialStatus = components['schemas']['CredentialStatus']
type ApiToken = components['schemas']['ApiToken']
type ApiTokenGenerate = components['schemas']['ApiTokenGenerate']
type UnixUserToken = components['schemas']['UnixUserToken']

type ServiceAccountSummary = {
  uuid: string
  name: string
  displayName: string
  description: string | null
  emails: string[]
  memberOf: string[]
  entryManagedBy: string[]
  accountValidFrom: string | null
  accountExpire: string | null
}

type ServiceAccountDetail = ServiceAccountSummary & {
  directMemberOf: string[]
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
}

function listAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) ? value : []
}

function parseServiceAccount(entry: Entry): ServiceAccountSummary {
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    description: firstAttr(entry, 'description') || null,
    emails: listAttr(entry, 'mail'),
    memberOf: listAttr(entry, 'memberof'),
    entryManagedBy: listAttr(entry, 'entry_managed_by'),
    accountValidFrom: firstAttr(entry, 'account_valid_from') || null,
    accountExpire: firstAttr(entry, 'account_expire') || null,
  }
}

function parseServiceAccountDetail(entry: Entry): ServiceAccountDetail {
  return {
    ...parseServiceAccount(entry),
    directMemberOf: listAttr(entry, 'directmemberof'),
  }
}

export async function fetchServiceAccounts(): Promise<ServiceAccountSummary[]> {
  const entries = await apiRequest('/v1/service_account', 'get')
  return (entries as ServiceAccountListResponse).map(parseServiceAccount)
}

export async function fetchServiceAccount(id: string): Promise<ServiceAccountDetail | null> {
  const entry = await apiRequest(`/v1/service_account/${encodeURIComponent(id)}`, 'get')
  if (!entry) return null
  return parseServiceAccountDetail(entry as ServiceAccountDetailResponse)
}

export async function createServiceAccount(input: {
  name: string
  displayName: string
  entryManagedBy: string
  description?: string
}): Promise<void> {
  const attrs: Record<string, string[]> = {
    name: [input.name],
    displayname: [input.displayName],
    entry_managed_by: [input.entryManagedBy],
  }
  if (input.description) {
    attrs.description = [input.description]
  }
  await apiRequest('/v1/service_account', 'post', {
    body: {
      attrs,
    },
  })
}

export async function updateServiceAccount(input: {
  id: string
  name?: string
  displayName?: string
  description?: string
  entryManagedBy?: string
  emails?: string[]
}) {
  const attrs: Record<string, string[]> = {}

  if (input.name) {
    attrs.name = [input.name]
  }
  if (input.displayName) {
    attrs.displayname = [input.displayName]
  }
  if (input.description) {
    attrs.description = [input.description]
  }
  if (input.entryManagedBy) {
    attrs.entry_managed_by = [input.entryManagedBy]
  }
  if (input.emails && input.emails.length > 0) {
    attrs.mail = input.emails
  }

  if (Object.keys(attrs).length > 0) {
    await apiRequest(`/v1/service_account/${encodeURIComponent(input.id)}`, 'patch', {
      body: {
        attrs,
      },
    })
  }

  if (input.emails && input.emails.length === 0) {
    await apiRequest(`/v1/service_account/${encodeURIComponent(input.id)}/_attr/mail`, 'delete')
  }

  if (input.description !== undefined && input.description.trim() === '') {
    await apiRequest(`/v1/service_account/${encodeURIComponent(input.id)}/_attr/description`, 'delete')
  }
}

export async function setServiceAccountAttr(
  id: string,
  attr: string,
  values: string[],
) {
  await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_attr/${attr}`, 'put', {
    body: values,
  })
}

export async function clearServiceAccountAttr(id: string, attr: string) {
  await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_attr/${attr}`, 'delete')
}

export async function fetchServiceAccountCredentialStatus(
  id: string,
): Promise<CredentialStatus> {
  return request(`/v1/service_account/${encodeURIComponent(id)}/_credential/_status`, {
    method: 'GET',
  })
}

export async function generateServiceAccountPassword(id: string): Promise<string> {
  return request(`/v1/service_account/${encodeURIComponent(id)}/_credential/_generate`, {
    method: 'GET',
  })
}

export async function fetchServiceAccountApiTokens(id: string): Promise<ApiToken[]> {
  return apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_api_token`, 'get') as ApiToken[]
}

export async function generateServiceAccountApiToken(
  id: string,
  input: ApiTokenGenerate,
): Promise<string> {
  return apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_api_token`, 'post', {
    body: input,
  }) as string
}

export async function deleteServiceAccountApiToken(id: string, tokenId: string): Promise<void> {
  await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_api_token/${encodeURIComponent(tokenId)}`, 'delete')
}

export type ServiceAccountSshKey = {
  tag: string
  value: string
}

function parseSshKeyValue(value: string): ServiceAccountSshKey | null {
  const idx = value.indexOf(':')
  if (idx === -1) return null
  const tag = value.slice(0, idx).trim()
  const keyValue = value.slice(idx + 1).trim()
  if (!tag || !keyValue) return null
  return { tag, value: keyValue }
}

export async function fetchServiceAccountSshKeys(id: string): Promise<ServiceAccountSshKey[]> {
  const result = await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_attr/ssh_publickey`, 'get')
  const values = Array.isArray(result) ? result : []
  return values.map(parseSshKeyValue).filter((entry): entry is ServiceAccountSshKey => Boolean(entry))
}

export async function addServiceAccountSshKey(id: string, label: string, value: string) {
  await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_ssh_pubkeys`, 'post', {
    body: [label, value],
  })
}

export async function deleteServiceAccountSshKey(id: string, label: string) {
  await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_ssh_pubkeys/${encodeURIComponent(label)}`, 'delete')
}

export async function fetchServiceAccountUnixToken(id: string): Promise<UnixUserToken> {
  return request(`/v1/account/${encodeURIComponent(id)}/_unix/_token`, { method: 'GET' })
}

export async function setServiceAccountUnix(
  id: string,
  input: { gidnumber?: number; shell?: string },
) {
  await apiRequest(`/v1/service_account/${encodeURIComponent(id)}/_unix`, 'post', {
    body: input,
  })
}

export type { ApiToken, CredentialStatus, ServiceAccountDetail, ServiceAccountSummary }
