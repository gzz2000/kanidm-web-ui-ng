export type AuthIssueSession = 'token' | 'cookie'

export type AuthMech =
  | 'anonymous'
  | 'password'
  | 'passwordbackupcode'
  | 'passwordmfa'
  | 'passwordsecuritykey'
  | 'passkey'
  | 'oauth2trust'

export type AuthAllowed =
  | 'anonymous'
  | 'password'
  | 'backupcode'
  | 'totp'
  | { passkey: Record<string, unknown> }
  | { securitykey: Record<string, unknown> }

export type AuthCredential =
  | 'anonymous'
  | { password: string }
  | { totp: number }
  | { backupcode: string }
  | { passkey: Record<string, unknown> }
  | { securitykey: Record<string, unknown> }

export type AuthStep =
  | { init: string }
  | { init2: { username: string; issue: AuthIssueSession; privileged?: boolean } }
  | { begin: AuthMech }
  | { cred: AuthCredential }

export type AuthState =
  | { choose: AuthMech[] }
  | { continue: AuthAllowed[] }
  | { denied: string }
  | { success: string }

export type AuthRequest = {
  step: AuthStep
}

export type AuthResponse = {
  sessionid: string
  state: AuthState
}
