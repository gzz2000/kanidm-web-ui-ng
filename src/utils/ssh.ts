export function parseKeyType(value: string) {
  return value.trim().split(/\s+/)[0] ?? ''
}
