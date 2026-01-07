import type { paths } from './schema'
import { request } from './http'

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

type JsonContent<T> = T extends { content: { 'application/json': infer C } }
  ? C
  : T extends { content: { 'text/plain': infer C } }
    ? C
    : unknown

type SuccessResponse<T> = T extends { 200: infer OK }
  ? OK
  : T extends { 201: infer Created }
    ? Created
    : T extends { 204: infer NoContent }
      ? NoContent
      : T extends { default: infer Fallback }
        ? Fallback
        : unknown

type RequestBody<T> = T extends {
  requestBody: { content: { 'application/json': infer B } }
}
  ? B
  : undefined

type ResponseBody<T> = JsonContent<SuccessResponse<T>>

type PathMethod<P extends keyof paths> = keyof paths[P] & HttpMethod

type RequestArgs<P extends keyof paths, M extends PathMethod<P>> = {
  body?: RequestBody<paths[P][M]>
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

export async function apiRequest<P extends keyof paths, M extends PathMethod<P>>(
  path: P,
  method: M,
  args: RequestArgs<P, M> = {},
): Promise<ResponseBody<paths[P][M]>> {
  const query = buildQuery(args.query)
  const body = args.body ? JSON.stringify(args.body) : undefined

  return request<ResponseBody<paths[P][M]>>(`${path}${query}`, {
    method: method.toUpperCase(),
    body,
  })
}
