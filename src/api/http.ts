const baseUrl = import.meta.env.VITE_KANIDM_BASE_URL ?? ''
const TOKEN_KEY = 'kanidm.uat'

export const tokenStore = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
  },
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    if (response.status === 401) {
      tokenStore.clear()
    }
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
