export function isNotFound(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('404') || message.includes('nomatchingentries')
}
