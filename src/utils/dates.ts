export function toLocalDateTime(value: string | null | undefined) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const pad = (input: number) => String(input).padStart(2, '0')
  const year = parsed.getFullYear()
  const month = pad(parsed.getMonth() + 1)
  const day = pad(parsed.getDate())
  const hours = pad(parsed.getHours())
  const minutes = pad(parsed.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function fromLocalDateTime(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(trimmed)
  if (!match) return undefined
  const [, year, month, day, hour, minute] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  )
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

export function formatExpiryTime(
  value: string | number | null | undefined,
  fallback = '',
) {
  if (value === null || value === undefined || value === '') return fallback
  const raw = typeof value === 'number' ? String(value) : value
  const trimmed = raw.trim()
  if (!trimmed) return fallback
  const numeric = Number(trimmed)
  if (!Number.isNaN(numeric)) {
    const millis = trimmed.length <= 10 ? numeric * 1000 : numeric
    const date = new Date(millis)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString()
    }
  }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString()
  }
  return raw
}
