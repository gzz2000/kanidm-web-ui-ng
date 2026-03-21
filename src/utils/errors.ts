export function isNotFound(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('404') || message.includes('nomatchingentries')
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function isStatus(error: unknown, status: number) {
  const text = errorText(error).toLowerCase()
  return text.includes(`request failed (${status})`)
}

export function isDuplicateConflict(error: unknown) {
  const text = errorText(error).toLowerCase()
  return (
    isStatus(error, 409) ||
    text.includes('uniqueconstraintviolation') ||
    text.includes('attributeuniqueness') ||
    text.includes('duplicateuniqueattribute')
  )
}

export function isSessionMayNotReauth(error: unknown) {
  const text = errorText(error).toLowerCase()
  return text.includes('sessionmaynotreauth')
}

export function isResetIntentMissingEmail(error: unknown) {
  const text = errorText(error).toLowerCase()
  return text.includes('cu0008accountmissingemail')
}

export function isResetIntentAccountEmailNotFound(error: unknown) {
  const text = errorText(error).toLowerCase()
  return text.includes('cu0007accountemailnotfound')
}
