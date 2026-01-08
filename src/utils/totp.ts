import base32Encode from 'base32-encode'
import type { components } from '../api/schema'

type TotpSecret = components['schemas']['TotpSecret']

type TotpPayload = {
  secret: string
  uri: string
  issuer: string
  accountName: string
  algo: string
  step: number
  digits: number
}

export function buildTotpPayload(secret: TotpSecret): TotpPayload {
  const issuer = secret.issuer
  const accountName = secret.accountname
  const encodedSecret = base32Encode(Uint8Array.from(secret.secret), 'RFC4648', {
    padding: false,
  })
  const algo = String(secret.algo).toUpperCase()
  const uri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    accountName,
  )}?secret=${encodedSecret}&issuer=${encodeURIComponent(
    issuer,
  )}&algorithm=${algo}&digits=${secret.digits}&period=${secret.step}`

  return {
    secret: encodedSecret,
    uri,
    issuer,
    accountName,
    algo,
    step: secret.step,
    digits: secret.digits,
  }
}
