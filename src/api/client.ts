import { request } from './http'

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'
type RequestArgs = {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
}

function buildQuery(query?: Record<string, string | number | boolean | undefined>) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    params.set(key, String(value))
  }
  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

export async function apiRequest<T = unknown>(
  path: string,
  method: HttpMethod,
  args: RequestArgs = {},
): Promise<T> {
  const query = buildQuery(args.query)
  const body = args.body ? JSON.stringify(args.body) : undefined

  return request<T>(`${path}${query}`, {
    method: method.toUpperCase(),
    body,
  })
}
