export function stripDomain(value: string) {
  const [base] = value.split('@')
  return base ?? value
}

export function applyDomain(value: string, domain: string | null) {
  if (!value || value.includes('@')) return value
  if (!domain) return value
  return `${value}@${domain}`
}

export function extractDomainSuffix(values: string[]) {
  for (const entry of values) {
    const parts = entry.split('@')
    if (parts.length > 1 && parts[1]) {
      return parts[1]
    }
  }
  return null
}
