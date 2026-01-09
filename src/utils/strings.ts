export function stripDomain(value: string) {
  const [base] = value.split('@')
  return base ?? value
}

export function applyDomain(value: string, domain: string | null) {
  if (!value || value.includes('@')) return value
  if (!domain) return value
  return `${value}@${domain}`
}
