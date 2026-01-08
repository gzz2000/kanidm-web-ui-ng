import type { components } from './schema'
import { request } from './http'

type CUStatus = components['schemas']['CUStatus']
type CUSessionToken = components['schemas']['CUSessionToken']
type CredentialStatus = components['schemas']['CredentialStatus']

type CredentialUpdateSession = {
  session: CUSessionToken
  status: CUStatus
}

export async function beginCredentialUpdate(personId: string): Promise<CredentialUpdateSession> {
  const response = await request<[CUSessionToken, CUStatus]>(
    `/v1/person/${personId}/_credential/_update`,
    { method: 'GET' },
  )
  const [session, status] = response
  return { session, status }
}

export async function exchangeCredentialIntent(token: string): Promise<CredentialUpdateSession> {
  const response = await request<[CUSessionToken, CUStatus]>(
    '/v1/credential/_exchange_intent',
    {
      method: 'POST',
      body: JSON.stringify(token),
    },
  )
  const [session, status] = response
  return { session, status }
}

export async function fetchCredentialStatus(personId: string): Promise<CredentialStatus> {
  return request(`/v1/person/${personId}/_credential/_status`, {
    method: 'GET',
  })
}

export async function refreshCredentialStatus(
  session: CUSessionToken,
): Promise<CUStatus> {
  return request('/v1/credential/_status', {
    method: 'POST',
    body: JSON.stringify(session),
  })
}

export async function sendCredentialUpdate(
  session: CUSessionToken,
  updateRequest: unknown,
): Promise<CUStatus> {
  return request('/v1/credential/_update', {
    method: 'POST',
    body: JSON.stringify([updateRequest, session]),
  })
}

export async function commitCredentialUpdate(session: CUSessionToken): Promise<void> {
  await request('/v1/credential/_commit', {
    method: 'POST',
    body: JSON.stringify(session),
  })
}

export async function cancelCredentialUpdate(session: CUSessionToken): Promise<void> {
  await request('/v1/credential/_cancel', {
    method: 'POST',
    body: JSON.stringify(session),
  })
}
